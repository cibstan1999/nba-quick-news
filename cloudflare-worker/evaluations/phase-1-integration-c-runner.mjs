import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DETERMINISTIC_EDITORIAL_PIPELINE,
  runDeterministicEvidenceEditorialPipeline
} from '../src/deterministic-evidence-editorial-pipeline.js';

const evaluationDir = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.join(evaluationDir, 'phase-0.5-baseline.json');
const scoresPath = path.join(evaluationDir, 'phase-1-integration-c-scores.local.json');
const resultsPath = path.join(evaluationDir, 'phase-1-integration-c-results.local.json');
const command = process.argv[2] || '--deterministic';
const endpoint = process.argv[3] || process.env.INTEGRATION_C_POLISH_ENDPOINT || '';

if (!['--deterministic', '--collect-polish', '--summarize'].includes(command)) {
  throw new Error(
    'Use --deterministic, --collect-polish <endpoint>, or --summarize.'
  );
}
if (command === '--collect-polish' && !endpoint) {
  throw new Error('A local Wrangler experiment endpoint is required.');
}

const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
const scores = await readOptionalJson(scoresPath, {});
const previous = command === '--collect-polish'
  ? await readOptionalJson(resultsPath, { results: [] })
  : { results: [] };
const completed = new Map(
  (previous.results || [])
    .filter((result) => result.runMode === command && result.runnerStatus === 'completed')
    .map((result) => [result.sampleId, result])
);
const results = [];

if (command === '--summarize') {
  const saved = await readOptionalJson(resultsPath, null);
  if (!saved) throw new Error('No Integration C results are available.');
  const rescored = saved.results.map((result) => applyHumanScore(
    result,
    scores[result.sampleId] || {}
  ));
  const report = {
    ...saved,
    rescoredAt: new Date().toISOString(),
    results: rescored,
    metrics: summarizeResults(rescored)
  };
  await atomicWriteJson(resultsPath, report);
  printSummary(report);
  process.exit(0);
}

for (const sample of baseline.samples) {
  if (completed.has(sample.sampleId)) {
    results.push(applyHumanScore(
      completed.get(sample.sampleId),
      scores[sample.sampleId] || {}
    ));
    continue;
  }

  console.log(`Integration C ${command}: ${sample.sampleId} starting`);
  try {
    const result = await runDeterministicEvidenceEditorialPipeline({
      record: sample,
      articleText: sample.articleTextUsed || '',
      storyType: sample.testType,
      enablePolish: command === '--collect-polish',
      invokePolish: command === '--collect-polish'
        ? createRemotePolishInvoker(endpoint, sample.sampleId)
        : undefined
    });
    results.push(applyHumanScore(
      serializeResult(sample, result, command),
      scores[sample.sampleId] || {}
    ));
  } catch (error) {
    results.push({
      sampleId: sample.sampleId,
      newsId: sample.newsId,
      runMode: command,
      runnerStatus: 'failed',
      failureStage: 'runner',
      failureReasons: [error?.message || String(error)],
      stage1AiRequests: 0,
      polishAiRequests: 0,
      llamaRequests: 0,
      productionWrites: 0
    });
  }

  await writeCheckpoint(results);
  console.log(`Integration C ${command}: ${sample.sampleId} completed`);
}

const report = {
  evaluation: 'phase-1-integration-c-deterministic-evidence-editorial',
  pipeline: DETERMINISTIC_EDITORIAL_PIPELINE,
  runMode: command,
  generatedAt: new Date().toISOString(),
  partialBaselineNotice:
    'Partial 9-sample baseline. Injury and game are not represented.',
  results,
  metrics: summarizeResults(results)
};
await atomicWriteJson(resultsPath, report);
printSummary(report);

function serializeResult(sample, result, runMode) {
  const coverage = calculateCoverage(result);
  const finalGate = result.statuses?.finalGateStatus || {
    status: 'rejected',
    reasons: result.failureReasons || []
  };
  return {
    sampleId: sample.sampleId,
    newsId: sample.newsId,
    storyType: sample.testType,
    runMode,
    runnerStatus: result.ok ? 'completed' : 'failed',
    failureStage: result.failureStage,
    failureReasons: [...(result.failureReasons || [])],
    selectedEvidenceIds: [...(result.minimum?.selectedEvidenceIds || [])],
    statuses: result.statuses,
    composer: result.composition || null,
    final: result.final || null,
    adoptedPolish: Boolean(result.adoptedPolish),
    usedComposerFallback: Boolean(
      runMode === '--collect-polish' && !result.adoptedPolish && result.final
    ),
    polishFallbackReason: result.polishFallbackReason,
    placeholderValidation: compactPlaceholderValidation(
      result.polish?.placeholderValidation
    ),
    finalGateDecision: finalGate.status,
    rejectionReasons: [...(finalGate.reasons || [])],
    coverage,
    oneLineDuplicate: result.final
      ? comparable(result.final.titleZh) === comparable(result.final.oneLineZh)
      : null,
    stage1AiRequests: result.counters?.stage1AiRequests || 0,
    polishAiRequests: result.counters?.polishAiRequests || 0,
    llamaRequests: result.counters?.llamaRequests || 0,
    productionWrites: result.counters?.productionWrites || 0
  };
}

function calculateCoverage(result) {
  const factPlan = result.factPlan || {};
  const usedFactIds = result.final?.usedFactIds || {};
  const required = [
    ...(factPlan.titleFactIds || []).map((id) => `title:${id}`),
    ...(factPlan.summaryFactIds || []).map((id) => `summary:${id}`),
    ...(factPlan.oneLineFactIds || []).map((id) => `oneLine:${id}`)
  ];
  const used = new Set([
    ...(usedFactIds.title || []).map((id) => `title:${id}`),
    ...(usedFactIds.summary || []).map((id) => `summary:${id}`),
    ...(usedFactIds.oneLine || []).map((id) => `oneLine:${id}`)
  ]);
  const trace = result.coverage?.trace?.anchorToUsedFields || {};
  const anchors = factPlan.requiredAnchors || [];
  const covered = (anchor) => (trace[anchor.anchorId] || []).length > 0;
  const attributions = anchors.filter((anchor) => anchor.type === 'attribution');
  const numbers = anchors.filter((anchor) => anchor.type === 'number');
  return {
    requiredFacts: required.length,
    coveredRequiredFacts: required.filter((entry) => used.has(entry)).length,
    criticalAnchors: anchors.length,
    coveredCriticalAnchors: anchors.filter(covered).length,
    requiredAttributions: attributions.length,
    coveredAttributions: attributions.filter(covered).length,
    requiredNumbers: numbers.length,
    coveredNumbers: numbers.filter(covered).length
  };
}

function applyHumanScore(result, score) {
  return {
    ...result,
    humanDecision: score.humanDecision || null,
    editorEffort: score.editorEffort || null,
    chineseNaturalness: score.chineseNaturalness ?? null,
    reviewNotes: score.reviewNotes || ''
  };
}

function summarizeResults(results) {
  const completed = results.filter((result) => result.runnerStatus === 'completed');
  const sum = (key) => completed.reduce(
    (total, result) => total + Number(result[key] || 0),
    0
  );
  const sumCoverage = (key) => completed.reduce(
    (total, result) => total + Number(result.coverage?.[key] || 0),
    0
  );
  const naturalness = completed
    .map((result) => result.chineseNaturalness)
    .filter((value) => value != null);
  return {
    sampleCount: results.length,
    completed: completed.length,
    gateAccepted: completed.filter(
      (result) => result.finalGateDecision === 'accepted'
    ).length,
    humanAccepted: completed.filter(
      (result) => result.humanDecision === 'accept'
    ).length,
    publish: completed.filter((result) => result.editorEffort === 'publish').length,
    minorEdit: completed.filter(
      (result) => result.editorEffort === 'minor_edit'
    ).length,
    rewrite: completed.filter((result) => result.editorEffort === 'rewrite').length,
    chineseNaturalness: naturalness.length
      ? Number((
          naturalness.reduce((total, value) => total + Number(value), 0) /
          naturalness.length
        ).toFixed(2))
      : null,
    adoptedPolish: completed.filter((result) => result.adoptedPolish).length,
    composerFallbacks: completed.filter(
      (result) => result.usedComposerFallback
    ).length,
    requiredFacts: sumCoverage('requiredFacts'),
    coveredRequiredFacts: sumCoverage('coveredRequiredFacts'),
    criticalAnchors: sumCoverage('criticalAnchors'),
    coveredCriticalAnchors: sumCoverage('coveredCriticalAnchors'),
    requiredAttributions: sumCoverage('requiredAttributions'),
    coveredAttributions: sumCoverage('coveredAttributions'),
    requiredNumbers: sumCoverage('requiredNumbers'),
    coveredNumbers: sumCoverage('coveredNumbers'),
    oneLineDuplicates: completed.filter((result) => result.oneLineDuplicate).length,
    stage1AiRequests: sum('stage1AiRequests'),
    polishAiRequests: sum('polishAiRequests'),
    llamaRequests: sum('llamaRequests'),
    productionWrites: sum('productionWrites')
  };
}

function createRemotePolishInvoker(baseUrl, sampleId) {
  let invoked = false;
  return async ({ request }) => {
    if (invoked) throw new Error(`polish-request-limit-exceeded:${sampleId}`);
    invoked = true;
    console.log(`Integration C polish request: ${sampleId}`);
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/invoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dryRun: true, request })
    });
    const payload = await response.json();
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || `polish-http-${response.status}`);
    }
    return payload.response;
  };
}

function compactPlaceholderValidation(validation) {
  if (!validation) return null;
  return {
    ok: Boolean(validation.ok),
    reasons: [...(validation.reasons || [])],
    details: validation.details || {}
  };
}

async function writeCheckpoint(results) {
  await atomicWriteJson(resultsPath, {
    evaluation: 'phase-1-integration-c-deterministic-evidence-editorial',
    pipeline: DETERMINISTIC_EDITORIAL_PIPELINE,
    runMode: command,
    checkpointedAt: new Date().toISOString(),
    partialBaselineNotice:
      'Partial 9-sample baseline. Injury and game are not represented.',
    results,
    metrics: summarizeResults(results)
  });
}

async function readOptionalJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function atomicWriteJson(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

function printSummary(report) {
  console.log(JSON.stringify({
    resultsPath,
    pipeline: report.pipeline,
    runMode: report.runMode,
    metrics: report.metrics,
    samples: report.results.map((result) => ({
      sampleId: result.sampleId,
      gate: result.finalGateDecision,
      adoptedPolish: result.adoptedPolish,
      polishFallbackReason: result.polishFallbackReason,
      titleZh: result.final?.titleZh || '',
      summaryZh: result.final?.summaryZh || '',
      oneLineZh: result.final?.oneLineZh || ''
    }))
  }, null, 2));
}

function comparable(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s，。；：、,.!?！？:;'"“”‘’（）()\-]/g, '');
}
