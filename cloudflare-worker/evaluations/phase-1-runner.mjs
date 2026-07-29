import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  buildEditorialConstraints,
  buildEditorialFactPlan,
  validateFactExtraction,
  validatePhase1EditorialResult
} from '../src/pipeline.js';

const evaluationDir = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.join(evaluationDir, 'phase-0.5-baseline.json');
const stage1ResultsPath = path.join(evaluationDir, 'phase-1-stage1-results.local.json');
const stage2InputPath = path.join(evaluationDir, 'phase-1-stage2-input.local.json');
const stage2ResultsPath = path.join(evaluationDir, 'phase-1-stage2-results.local.json');

async function main() {
  const command = process.argv[2];
  if (command === '--freeze-stage2') {
    await freezeStage2Input();
    return;
  }
  if (command === '--collect-stage2') {
    await collectStage2();
    return;
  }
  if (command === '--revalidate-stage2') {
    await revalidateStage2();
    return;
  }

  const stage1Only = command === '--collect-stage1';
  if (!stage1Only && command !== '--collect') {
    throw new Error(
      'Use --collect, --collect-stage1, --freeze-stage2, --collect-stage2, or --revalidate-stage2.'
    );
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

async function freezeStage2Input() {
  const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
  const stage1 = JSON.parse(await fs.readFile(stage1ResultsPath, 'utf8'));
  const samples = [];

  for (const sample of baseline.samples) {
    const result = stage1.results.find((entry) => entry.sampleId === sample.sampleId);
    if (!result?.factExtraction?.facts?.length) {
      throw new Error(`${sample.sampleId} has no Stage 1 facts to freeze.`);
    }
    const evidenceExtraction = {
      evidenceItems: result.factExtraction.facts.map((fact, index) => ({
        id: `evidence-${index + 1}`,
        evidenceQuote: fact.factText,
        attributionName: '',
        attributionQuote: ''
      }))
    };
    const validation = validateFactExtraction(
      evidenceExtraction,
      sample,
      sample.articleTextUsed || ''
    );
    if (!validation.ok) {
      throw new Error(
        `${sample.sampleId} failed frozen Fact validation: ${validation.reasons.join(',')}`
      );
    }
    samples.push({
      sampleId: sample.sampleId,
      newsId: sample.newsId,
      testType: sample.testType,
      source: sample.source,
      publishedAt: sample.publishedAt,
      previousAiStatus: sample.previousAiStatus,
      factExtraction: validation.value
    });
  }

  await atomicWriteJson(stage2InputPath, {
    evaluation: 'phase-1-stage2-frozen-fact-input',
    frozenAt: new Date().toISOString(),
    sourceStage1Run: path.basename(stage1ResultsPath),
    sampleCount: samples.length,
    containsArticleText: false,
    samples
  });
  console.log(JSON.stringify({
    completed: true,
    outputPath: stage2InputPath,
    sampleCount: samples.length,
    containsArticleText: false
  }, null, 2));
}

async function collectStage2() {
  const baseUrl = normalizeBaseUrl(process.env.PHASE1_DEBUG_BASE_URL);
  const token = String(process.env.PHASE1_DEBUG_TOKEN || '');
  if (!baseUrl || !token) {
    throw new Error('PHASE1_DEBUG_BASE_URL and PHASE1_DEBUG_TOKEN are required.');
  }

  const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
  const frozen = JSON.parse(await fs.readFile(stage2InputPath, 'utf8'));
  const results = [];

  for (const frozenSample of frozen.samples) {
    const baselineSample = baseline.samples.find(
      (sample) => sample.sampleId === frozenSample.sampleId
    );
    if (!baselineSample) throw new Error(`${frozenSample.sampleId} is absent from the baseline.`);

    const response = await fetch(`${baseUrl}/debug/reprocess`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-refresh-token': token
      },
      body: JSON.stringify({
        newsId: frozenSample.newsId,
        dryRun: true,
        pipelineMode: 'phase1',
        stage2Only: true,
        source: frozenSample.source,
        publishedAt: frozenSample.publishedAt,
        previousAiStatus: frozenSample.previousAiStatus,
        factExtraction: frozenSample.factExtraction
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(
        `${frozenSample.sampleId} failed with HTTP ${response.status}: ${payload.error || 'unknown error'}`
      );
    }

    const editorialSnapshot = payload.snapshots?.find(
      (snapshot) => snapshot.stage === 'phase1-editorial-generation'
    ) || null;
    results.push({
      sampleId: frozenSample.sampleId,
      newsId: frozenSample.newsId,
      testType: frozenSample.testType,
      originalTitle: baselineSample.originalTitle,
      previousAiStatus: frozenSample.previousAiStatus,
      editorialConstraints: buildEditorialConstraints(frozenSample.factExtraction),
      factPlan: editorialSnapshot?.factPlan ||
        buildEditorialFactPlan(frozenSample.factExtraction),
      dryRun: payload.dryRun,
      persisted: payload.persisted,
      stage2Only: payload.stage2Only,
      resultAiStatus: payload.resultAiStatus,
      pipelineVersion: payload.pipelineVersion,
      factStageRequests: payload.factStageRequests,
      editorialStageRequests: payload.editorialStageRequests,
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
      qwenBaseline: payload.qwenBaseline,
      fallbackInvoked: payload.fallbackInvoked,
      fallbackReason: payload.fallbackReason
    });
    console.log(JSON.stringify({
      sampleId: frozenSample.sampleId,
      resultAiStatus: payload.resultAiStatus,
      factStageRequests: payload.factStageRequests,
      editorialStageRequests: payload.editorialStageRequests,
      parsed: Boolean(editorialSnapshot?.qwenFinalParsedJson),
      rejectionReasons: payload.rejectionReasons || []
    }));
  }

  const report = {
    evaluation: 'phase-1-stage2-frozen-fact-dry-run',
    collectedAt: new Date().toISOString(),
    frozenInput: path.basename(stage2InputPath),
    sampleCount: results.length,
    productionWrites: 0,
    stage1Requests: 0,
    llamaFallbackCalls: results.filter((result) => result.fallbackInvoked).length,
    metrics: calculateStage2Metrics(results),
    results
  };

  await atomicWriteJson(stage2ResultsPath, report);
  console.log(JSON.stringify({
    completed: true,
    outputPath: stage2ResultsPath,
    ...report.metrics,
    productionWrites: 0,
    stage1Requests: 0,
    llamaFallbackCalls: report.llamaFallbackCalls
  }, null, 2));
}

async function revalidateStage2() {
  const frozen = JSON.parse(await fs.readFile(stage2InputPath, 'utf8'));
  const report = JSON.parse(await fs.readFile(stage2ResultsPath, 'utf8'));

  for (const result of report.results) {
    const frozenSample = frozen.samples.find((sample) => sample.sampleId === result.sampleId);
    if (!frozenSample || !result.editorial) continue;
    const validation = validatePhase1EditorialResult(
      result.editorial,
      {
        newsId: frozenSample.newsId,
        source: frozenSample.source,
        publishedAt: frozenSample.publishedAt,
        originalTitle: '',
        originalSummary: ''
      },
      frozenSample.factExtraction
    );
    result.resultAiStatus = validation.ok ? 'accepted' : 'rejected';
    result.editorialConstraints = buildEditorialConstraints(frozenSample.factExtraction);
    result.factPlan = validation.factPlan ||
      buildEditorialFactPlan(frozenSample.factExtraction);
    result.finalGate = {
      accepted: validation.ok,
      rejectionReasons: validation.reasons,
      addedFacts: validation.details.addedFacts,
      missingFacts: validation.details.missingFacts,
      unsafeFragments: validation.details.unsafeFragments
    };
    result.rejectionStage = validation.ok ? null : 'final-gate';
    result.rejectionReasons = validation.reasons;
  }

  report.revalidatedAt = new Date().toISOString();
  report.metrics = calculateStage2Metrics(report.results);
  await atomicWriteJson(stage2ResultsPath, report);
  console.log(JSON.stringify({
    completed: true,
    outputPath: stage2ResultsPath,
    revalidatedAt: report.revalidatedAt,
    ...report.metrics,
    productionWrites: 0,
    stage1Requests: 0,
    llamaFallbackCalls: report.llamaFallbackCalls
  }, null, 2));
}

function calculateStage2Metrics(results) {
  const requiredNumbers = results.reduce(
    (sum, result) => sum + (result.editorialConstraints?.requiredNumbers?.length || 0),
    0
  );
  const missingRequiredNumbers = results.reduce(
    (sum, result) => sum + (result.finalGate?.missingFacts || [])
      .filter((fact) => fact.startsWith('constraint-number:'))
      .length,
    0
  );
  const requiredFacts = results.reduce(
    (sum, result) => sum + (result.factPlan?.summaryFactIds?.length || 0),
    0
  );
  const missingRequiredFacts = results.reduce(
    (sum, result) => sum + (result.finalGate?.missingFacts || [])
      .filter((fact) => fact.startsWith('fact-plan-summary:'))
      .length,
    0
  );
  return {
    firstAttemptParsed: results.filter((result) => (
      result.editorial && result.editorialStageRequests === 1
    )).length,
    retryParsed: results.filter((result) => (
      result.editorial && result.editorialStageRequests === 2
    )).length,
    finalParsed: results.filter((result) => result.editorial).length,
    gateAccepted: results.filter((result) => result.resultAiStatus === 'accepted').length,
    gateRejected: results.filter((result) => result.resultAiStatus === 'rejected').length,
    totalRequests: results.reduce(
      (sum, result) => sum + result.editorialStageRequests,
      0
    ),
    titleOneLineDuplicates: results.filter((result) => (
      comparable(result.editorial?.titleZh) === comparable(result.editorial?.oneLineZh) ||
      (result.finalGate?.rejectionReasons || []).some((reason) => (
        ['title-oneline-duplicate', 'title-oneline-low-value-duplicate'].includes(reason)
      ))
    )).length,
    requiredNumbers,
    missingRequiredNumbers,
    requiredNumberCoverage: requiredNumbers
      ? (requiredNumbers - missingRequiredNumbers) / requiredNumbers
      : 1,
    requiredFacts,
    missingRequiredFacts,
    requiredFactCoverage: requiredFacts
      ? (requiredFacts - missingRequiredFacts) / requiredFacts
      : 1,
    unsupportedEntities: countRejectionReason(results, 'editorial-unsupported-entity'),
    unsupportedRoles: countRejectionReason(results, 'editorial-unsupported-role'),
    unsupportedEvents: countRejectionReason(results, 'editorial-unsupported-event'),
    attributionErrors: results.filter((result) => (
      (result.finalGate?.rejectionReasons || []).includes('editorial-attribution-missing')
    )).length,
    unexpectedEnglishTokens: results.filter((result) => (
      (result.finalGate?.rejectionReasons || []).includes('unexpected-english-token')
    )).length
  };
}

function countRejectionReason(results, reason) {
  return results.filter((result) => (
    (result.finalGate?.rejectionReasons || []).includes(reason)
  )).length;
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

function comparable(value) {
  return String(value || '').replace(/[\s，。！？、:：；;'"“”‘’（）()\-]/g, '').toLowerCase();
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
