import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const evaluationDir = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.join(evaluationDir, 'phase-0.5-baseline.json');

async function main() {
  const stage1Only = process.argv[2] === '--collect-stage1';
  if (!stage1Only && process.argv[2] !== '--collect') {
    throw new Error('Use --collect or --collect-stage1.');
  }
  const outputPath = path.join(
    evaluationDir,
    stage1Only ? 'phase-1-stage1-results.local.json' : 'phase-1-results.local.json'
  );

  const baseUrl = normalizeBaseUrl(process.env.PHASE1_DEBUG_BASE_URL);
  const token = String(process.env.PHASE1_DEBUG_TOKEN || '');
  if (!baseUrl || !token) {
    throw new Error('PHASE1_DEBUG_BASE_URL and PHASE1_DEBUG_TOKEN are required.');
  }

  const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
  const requestedSampleIds = new Set(
    String(process.env.PHASE1_SAMPLE_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const samples = requestedSampleIds.size
    ? baseline.samples.filter((sample) => requestedSampleIds.has(sample.sampleId))
    : baseline.samples;
  const results = [];

  for (const sample of samples) {
    const response = await fetch(`${baseUrl}/debug/reprocess`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-refresh-token': token
      },
      body: JSON.stringify({
        newsId: sample.newsId,
        dryRun: true,
        pipelineMode: 'phase1',
        evaluateAccepted: true,
        stage1Only
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`${sample.sampleId} failed with HTTP ${response.status}: ${payload.error || 'unknown error'}`);
    }

    const factSnapshot = payload.snapshots?.find(
      (snapshot) => snapshot.stage === 'phase1-fact-extraction'
    ) || null;
    const editorialSnapshot = payload.snapshots?.find(
      (snapshot) => snapshot.stage === 'phase1-editorial-generation'
    ) || null;
    results.push({
      sampleId: sample.sampleId,
      newsId: sample.newsId,
      testType: sample.testType,
      originalTitle: sample.originalTitle,
      previousAiStatus: sample.previousAiStatus,
      dryRun: payload.dryRun,
      persisted: payload.persisted,
      resultAiStatus: payload.resultAiStatus,
      pipelineMode: payload.pipelineMode,
      stage1Only: payload.stage1Only,
      pipelineVersion: payload.pipelineVersion,
      factExtractionVersion: payload.factExtractionVersion,
      editorialGenerationVersion: payload.editorialGenerationVersion,
      aiRequests: payload.aiRequests,
      factStageRequests: payload.factStageRequests,
      editorialStageRequests: payload.editorialStageRequests,
      evidenceExtraction: redactEvidenceSummary(factSnapshot?.evidenceExtraction),
      factExtraction: redactFactSummary(factSnapshot?.factExtraction),
      factValidation: factSnapshot?.factValidation || null,
      editorial: editorialSnapshot?.qwenFinalParsedJson || null,
      finalGate: editorialSnapshot
        ? {
            accepted: payload.resultAiStatus === 'accepted',
            rejectionReasons: editorialSnapshot.rejectionReasons || [],
            addedFacts: editorialSnapshot.addedFacts || [],
            missingFacts: editorialSnapshot.missingFacts || [],
            unsafeFragments: editorialSnapshot.unsafeFragments || []
          }
        : null,
      rejectionStage: payload.rejectionStage || null,
      rejectionReasons: payload.rejectionReasons || [],
      fallbackInvoked: payload.fallbackInvoked,
      fallbackReason: payload.fallbackReason
    });
    console.log(JSON.stringify({
      sampleId: sample.sampleId,
      resultAiStatus: payload.resultAiStatus,
      factStageRequests: payload.factStageRequests,
      editorialStageRequests: payload.editorialStageRequests,
      rejectionStage: payload.rejectionStage || null,
      rejectionReasons: payload.rejectionReasons || []
    }));
  }

  const report = {
    evaluation: stage1Only
      ? 'phase-1-stage1-frozen-sample-dry-run'
      : 'phase-1-two-stage-frozen-sample-dry-run',
    collectedAt: new Date().toISOString(),
    baseline: path.basename(baselinePath),
    sampleCount: results.length,
    productionWrites: 0,
    pipelineMode: 'phase1',
    metrics: {
      firstAttemptParsed: results.filter(
        (result) => result.evidenceExtraction && result.factStageRequests === 1
      ).length,
      retryParsed: results.filter(
        (result) => result.evidenceExtraction && result.factStageRequests === 2
      ).length,
      factParsed: results.filter((result) => result.evidenceExtraction).length,
      evidenceLocated: results.filter((result) => (
        result.evidenceExtraction &&
        !(result.factValidation?.details?.evidenceNotFound || []).length
      )).length,
      factValidated: results.filter((result) => result.factValidation?.ok).length,
      certaintyErrors: countValidationDetails(results, 'certaintyMismatches'),
      polarityErrors: countValidationDetails(results, 'negationMismatches'),
      attributionErrors:
        countValidationDetails(results, 'attributionMismatches') +
        countValidationDetails(results, 'attributionEvidenceNotFound'),
      unsupportedEvents: countValidationDetails(results, 'unsupportedEvents'),
      numberErrors: countValidationDetails(results, 'numberMismatches'),
      entityErrors: countValidationDetails(results, 'entityMismatches'),
      editorialParsed: results.filter((result) => result.editorial).length,
      finalAccepted: results.filter((result) => result.resultAiStatus === 'accepted').length,
      totalRequests: results.reduce((sum, result) => sum + result.aiRequests, 0),
      factStageRequests: results.reduce((sum, result) => sum + result.factStageRequests, 0),
      editorialStageRequests: results.reduce((sum, result) => sum + result.editorialStageRequests, 0),
      stage2Skipped: results.filter((result) => result.editorialStageRequests === 0).length,
      llamaFallbackCalls: results.filter((result) => result.fallbackInvoked).length
    },
    results
  };

  await atomicWriteJson(outputPath, report);
  console.log(JSON.stringify({
    completed: true,
    outputPath,
    ...report.metrics
  }, null, 2));
}

function redactEvidenceSummary(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    evidenceItems: (value.evidenceItems || []).map((item) => ({
      ...item,
      evidenceQuote: String(item.evidenceQuote || '').slice(0, 120),
      attributionQuote: String(item.attributionQuote || '').slice(0, 120)
    }))
  };
}

function redactFactSummary(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    ...value,
    facts: (value.facts || []).map((fact) => ({
      ...fact,
      evidenceQuote: String(fact.evidenceQuote || '').slice(0, 120)
    }))
  };
}

function countValidationDetails(results, key) {
  return results.reduce(
    (sum, result) => sum + (result.factValidation?.details?.[key] || []).length,
    0
  );
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

async function atomicWriteJson(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
