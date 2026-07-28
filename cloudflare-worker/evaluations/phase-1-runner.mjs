import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const evaluationDir = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.join(evaluationDir, 'phase-0.5-baseline.json');
const outputPath = path.join(evaluationDir, 'phase-1-results.local.json');

async function main() {
  if (process.argv[2] !== '--collect') {
    throw new Error('Use --collect.');
  }

  const baseUrl = normalizeBaseUrl(process.env.PHASE1_DEBUG_BASE_URL);
  const token = String(process.env.PHASE1_DEBUG_TOKEN || '');
  if (!baseUrl || !token) {
    throw new Error('PHASE1_DEBUG_BASE_URL and PHASE1_DEBUG_TOKEN are required.');
  }

  const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
  const results = [];

  for (const sample of baseline.samples) {
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
        evaluateAccepted: true
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
      pipelineVersion: payload.pipelineVersion,
      factExtractionVersion: payload.factExtractionVersion,
      editorialGenerationVersion: payload.editorialGenerationVersion,
      aiRequests: payload.aiRequests,
      factStageRequests: payload.factStageRequests,
      editorialStageRequests: payload.editorialStageRequests,
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
    evaluation: 'phase-1-two-stage-frozen-sample-dry-run',
    collectedAt: new Date().toISOString(),
    baseline: path.basename(baselinePath),
    sampleCount: results.length,
    productionWrites: 0,
    pipelineMode: 'phase1',
    metrics: {
      factParsed: results.filter((result) => result.factExtraction).length,
      factValidated: results.filter((result) => result.factValidation?.ok).length,
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

function redactFactSummary(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    ...value,
    claims: (value.claims || []).map((claim) => ({
      ...claim,
      evidence: (claim.evidence || []).map((entry) => ({
        sourceField: entry.sourceField,
        text: String(entry.text || '').slice(0, 120)
      }))
    }))
  };
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
