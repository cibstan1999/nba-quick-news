import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  evaluateEvidenceAblationMode,
  prepareEvidenceAblation
} from './evidence-ablation.js';
import {
  getCompletedSampleResult,
  loadEvaluationCheckpoint,
  markSampleCompleted,
  markSampleFailed,
  markSampleStarted,
  saveEvaluationCheckpoint,
  summarizeCheckpointRequests
} from './evaluation-checkpoint.mjs';

const evaluationDir = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.join(evaluationDir, 'phase-0.5-baseline.json');
const resultPath = path.join(
  evaluationDir,
  'phase-1-evidence-ablation-results.local.json'
);
const scorePath = path.join(
  evaluationDir,
  'phase-1-evidence-ablation-scores.local.json'
);
const checkpointPath = path.join(
  evaluationDir,
  'phase-1-evidence-ablation-checkpoint.local.json'
);
const EVALUATION_NAME = 'phase-1-mandatory-vs-qwen-optional-ablation';

async function main() {
  const command = process.argv[2];
  if (command === '--collect') {
    await collect();
    return;
  }
  if (command === '--revalidate') {
    await revalidate();
    return;
  }
  throw new Error('Use --collect or --revalidate.');
}

async function collect() {
  const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
  const scores = await readOptionalJson(scorePath);
  const baseUrl = normalizeBaseUrl(
    process.env.OPTIONAL_EVIDENCE_BASE_URL || 'http://127.0.0.1:8793'
  );
  const checkpoint = await loadEvaluationCheckpoint(checkpointPath, {
    evaluation: EVALUATION_NAME,
    baseline: path.basename(baselinePath)
  });
  const results = [];
  let resumedSamples = 0;

  for (const sample of baseline.samples) {
    const resumed = getCompletedSampleResult(checkpoint, sample);
    if (resumed) {
      results.push(applyHumanScore(resumed, scores?.samples?.[sample.sampleId]));
      resumedSamples += 1;
      console.log(JSON.stringify({
        event: 'evidence-ablation-resume',
        sampleId: sample.sampleId
      }));
      continue;
    }

    markSampleStarted(checkpoint, sample, {
      stage: 'mandatory-vs-qwen-optional',
      requestKind: 'formal'
    });
    await saveEvaluationCheckpoint(checkpointPath, checkpoint);
    console.log(JSON.stringify({
      event: 'optional-evidence-request-start',
      sampleId: sample.sampleId,
      mode: 'qwen-optional'
    }));

    let optionalSelection = null;
    try {
      const context = prepareEvidenceAblation(
        sample,
        sample.articleTextUsed || ''
      );
      const mandatoryOnly = evaluateEvidenceAblationMode(context, {
        mode: 'mandatory-only'
      });
      optionalSelection = await requestOptionalSelection(baseUrl, context);
      const qwenOptional = evaluateEvidenceAblationMode(context, {
        mode: 'qwen-optional',
        optionalSelection
      });
      const result = applyHumanScore({
        sampleId: sample.sampleId,
        newsId: sample.newsId,
        sourceHash: sample.sourceHash,
        testType: sample.testType,
        originalTitle: sample.originalTitle,
        humanBaseline: sample.humanBaseline,
        inventoryCount: context.inventory.length,
        mandatoryEvidenceIds: [...context.manifest.mandatoryEvidenceIds],
        optionalEvidenceIds: [...context.manifest.optionalEvidenceIds],
        mandatoryOnly,
        qwenOptional,
        optionalSelection: {
          optionalSelectionStatus: optionalSelection.optionalSelectionStatus,
          selectedOptionalEvidenceIds: [
            ...optionalSelection.selectedOptionalEvidenceIds
          ],
          ignoredEvidenceIds: [...optionalSelection.ignoredEvidenceIds],
          invalidEvidenceIds: [...(optionalSelection.invalidEvidenceIds || [])],
          optionalSelectionFallbackReason:
            optionalSelection.optionalSelectionFallbackReason,
          stage1AiRequests: optionalSelection.stage1AiRequests,
          model: optionalSelection.model || null
        },
        outputDifference: compareOutputs(mandatoryOnly, qwenOptional),
        productionWrites: 0,
        llamaFallbackCalls: 0
      }, scores?.samples?.[sample.sampleId]);
      results.push(result);
      markSampleCompleted(checkpoint, sample, result, {
        stage: 'mandatory-vs-qwen-optional',
        requestKind: 'formal',
        requestCount: optionalSelection.stage1AiRequests
      });
      await saveEvaluationCheckpoint(checkpointPath, checkpoint);
      console.log(JSON.stringify({
        event: 'optional-evidence-request-complete',
        sampleId: sample.sampleId,
        status: optionalSelection.optionalSelectionStatus,
        selectedOptionalEvidenceIds:
          optionalSelection.selectedOptionalEvidenceIds,
        stage1AiRequests: optionalSelection.stage1AiRequests,
        mandatoryGate: mandatoryOnly.gate.ok,
        optionalGate: qwenOptional.gate.ok
      }));
    } catch (error) {
      markSampleFailed(checkpoint, sample, error, {
        stage: 'mandatory-vs-qwen-optional',
        requestKind: 'formal',
        requestCount: Number(optionalSelection?.stage1AiRequests || 0)
      });
      await saveEvaluationCheckpoint(checkpointPath, checkpoint);
      results.push({
        sampleId: sample.sampleId,
        newsId: sample.newsId,
        sourceHash: sample.sourceHash,
        testType: sample.testType,
        runnerStatus: 'failed',
        runnerError: String(error?.message || 'unknown error').slice(0, 500),
        productionWrites: 0,
        llamaFallbackCalls: 0
      });
      console.error(JSON.stringify({
        event: 'optional-evidence-request-failed',
        sampleId: sample.sampleId,
        error: String(error?.message || 'unknown error').slice(0, 500)
      }));
    }
  }

  const report = buildReport({
    results,
    resumedSamples,
    requestAccounting: summarizeCheckpointRequests(checkpoint)
  });
  await atomicWriteJson(resultPath, report);
  console.log(JSON.stringify({
    completed: true,
    resultPath,
    sampleCount: results.length,
    resumedSamples,
    metrics: report.metrics,
    productionWrites: 0,
    llamaFallbackCalls: 0
  }, null, 2));
}

async function revalidate() {
  const report = JSON.parse(await fs.readFile(resultPath, 'utf8'));
  const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
  const samplesById = new Map(
    baseline.samples.map((sample) => [sample.sampleId, sample])
  );
  const scores = await readOptionalJson(scorePath);
  report.results = report.results.map((result) => {
    if (result.runnerStatus === 'failed') {
      return applyHumanScore(result, scores?.samples?.[result.sampleId]);
    }
    const sample = samplesById.get(result.sampleId);
    if (!sample) {
      throw new Error(`Missing frozen sample ${result.sampleId}.`);
    }
    const context = prepareEvidenceAblation(
      sample,
      sample.articleTextUsed || ''
    );
    const mandatoryOnly = evaluateEvidenceAblationMode(context, {
      mode: 'mandatory-only'
    });
    const qwenOptional = evaluateEvidenceAblationMode(context, {
      mode: 'qwen-optional',
      optionalSelection: result.optionalSelection
    });
    return applyHumanScore({
      ...result,
      inventoryCount: context.inventory.length,
      mandatoryEvidenceIds: [...context.manifest.mandatoryEvidenceIds],
      optionalEvidenceIds: [...context.manifest.optionalEvidenceIds],
      mandatoryOnly,
      qwenOptional,
      outputDifference: compareOutputs(mandatoryOnly, qwenOptional),
      productionWrites: 0,
      llamaFallbackCalls: 0
    }, scores?.samples?.[result.sampleId]);
  });
  report.revalidatedAt = new Date().toISOString();
  report.metrics = calculateMetrics(report.results);
  report.decision = decide(report.metrics);
  await atomicWriteJson(resultPath, report);
  console.log(JSON.stringify({
    completed: true,
    resultPath,
    metrics: report.metrics,
    decision: report.decision,
    productionWrites: 0,
    llamaFallbackCalls: 0
  }, null, 2));
}

async function requestOptionalSelection(baseUrl, context) {
  try {
    const response = await fetch(`${baseUrl}/select`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dryRun: true,
        context: {
          storyType: context.storyType,
          inventory: context.inventory,
          manifest: context.manifest
        }
      })
    });
    const payload = await response.json();
    if (!response.ok || payload.ok !== true) {
      return fallbackSelection(
        `optional-selection-http-${response.status}`,
        0
      );
    }
    return {
      optionalSelectionStatus: payload.optionalSelectionStatus,
      selectedOptionalEvidenceIds: payload.selectedOptionalEvidenceIds || [],
      ignoredEvidenceIds: payload.ignoredEvidenceIds || [],
      invalidEvidenceIds: payload.invalidEvidenceIds || [],
      optionalSelectionFallbackReason:
        payload.optionalSelectionFallbackReason || null,
      stage1AiRequests: Number(payload.stage1AiRequests || 0),
      model: payload.model || null
    };
  } catch {
    return fallbackSelection('optional-selection-runner-request-failed', 0);
  }
}

function fallbackSelection(reason, requests) {
  return {
    optionalSelectionStatus: 'fallback',
    selectedOptionalEvidenceIds: [],
    ignoredEvidenceIds: [],
    invalidEvidenceIds: [],
    optionalSelectionFallbackReason: reason,
    stage1AiRequests: requests,
    model: null
  };
}

function applyHumanScore(result, score) {
  if (!score || result.runnerStatus === 'failed') return result;
  return {
    ...result,
    mandatoryOnly: {
      ...result.mandatoryOnly,
      human: normalizeHumanModeScore(score.mandatoryOnly)
    },
    qwenOptional: {
      ...result.qwenOptional,
      human: normalizeHumanModeScore(score.qwenOptional)
    },
    optionalEditorialValue: score.optionalEditorialValue || 'unscored',
    optionalValueNotes: String(score.optionalValueNotes || '')
  };
}

function normalizeHumanModeScore(value = {}) {
  return {
    humanDecision: value.humanDecision === 'accept' ? 'accept' : 'reject',
    editorEffort: ['publish', 'minor_edit', 'rewrite'].includes(value.editorEffort)
      ? value.editorEffort
      : 'rewrite',
    chineseNaturalness: Number(value.chineseNaturalness || 0),
    severeFactErrors: Number(value.severeFactErrors || 0),
    certaintyErrors: Number(value.certaintyErrors || 0),
    negationErrors: Number(value.negationErrors || 0),
    oneLineDuplicate: Boolean(value.oneLineDuplicate),
    reviewNotes: String(value.reviewNotes || '')
  };
}

function buildReport({ results, resumedSamples, requestAccounting }) {
  const metrics = calculateMetrics(results);
  return {
    evaluation: EVALUATION_NAME,
    partialBaseline: true,
    baselineNotice:
      'Partial baseline: 9/18 samples; injury and game are not represented.',
    collectedAt: new Date().toISOString(),
    baseline: path.basename(baselinePath),
    checkpoint: path.basename(checkpointPath),
    sampleCount: results.length,
    resumedSamples,
    requestAccounting,
    productionWrites: 0,
    llamaFallbackCalls: 0,
    metrics,
    decision: decide(metrics),
    results
  };
}

function calculateMetrics(results) {
  const completed = results.filter((result) => result.runnerStatus !== 'failed');
  return {
    mandatoryOnly: calculateModeMetrics(completed, 'mandatoryOnly'),
    qwenOptional: calculateModeMetrics(completed, 'qwenOptional'),
    optionalSelection: {
      attemptedSamples: completed.length,
      successfulSelections: completed.filter((result) => (
        ['selected', 'empty'].includes(
          result.optionalSelection?.optionalSelectionStatus
        )
      )).length,
      fallbackSelections: completed.filter((result) => (
        result.optionalSelection?.optionalSelectionStatus === 'fallback'
      )).length,
      selectedEvidenceCount: completed.reduce(
        (sum, result) => sum +
          (result.optionalSelection?.selectedOptionalEvidenceIds?.length || 0),
        0
      ),
      improvedSamples: completed.filter(
        (result) => result.optionalEditorialValue === 'improved'
      ).length,
      noValueSamples: completed.filter(
        (result) => result.optionalEditorialValue === 'none'
      ).length,
      worseSamples: completed.filter(
        (result) => result.optionalEditorialValue === 'worse'
      ).length
    },
    runnerFailures: results.length - completed.length,
    productionWrites: 0,
    llamaFallbackCalls: 0
  };
}

function calculateModeMetrics(results, field) {
  const modes = results.map((result) => result[field]).filter(Boolean);
  const human = modes.map((mode) => mode.human).filter(Boolean);
  const coverage = sumCoverage(modes);
  return {
    samples: modes.length,
    inventorySuccess: modes.filter((mode) => mode.inventorySuccess).length,
    mandatoryAnchors: coverage.mandatoryAnchors,
    requiredFacts: coverage.requiredFacts,
    attributions: coverage.attributions,
    numbers: coverage.numbers,
    gateAccepted: modes.filter((mode) => mode.gate?.ok).length,
    humanAccepted: human.filter(
      (score) => score.humanDecision === 'accept'
    ).length,
    publish: human.filter((score) => score.editorEffort === 'publish').length,
    minorEdit: human.filter(
      (score) => score.editorEffort === 'minor_edit'
    ).length,
    rewrite: human.filter((score) => score.editorEffort === 'rewrite').length,
    averageChineseNaturalness: average(
      human.map((score) => score.chineseNaturalness)
    ),
    severeFactErrors: human.reduce(
      (sum, score) => sum + score.severeFactErrors,
      0
    ),
    certaintyErrors: human.reduce(
      (sum, score) => sum + score.certaintyErrors,
      0
    ),
    negationErrors: human.reduce(
      (sum, score) => sum + score.negationErrors,
      0
    ),
    oneLineDuplicates: human.filter((score) => score.oneLineDuplicate).length,
    averageFactCount: average(
      modes.map((mode) => mode.generatedFactCount)
    ),
    stage1AiRequests: modes.reduce(
      (sum, mode) => sum + Number(mode.stage1AiRequests || 0),
      0
    )
  };
}

function sumCoverage(modes) {
  const totals = {
    mandatoryAnchors: { covered: 0, required: 0, rate: 1 },
    requiredFacts: { covered: 0, required: 0, rate: 1 },
    attributions: { covered: 0, required: 0, rate: 1 },
    numbers: { covered: 0, required: 0, rate: 1 }
  };
  for (const mode of modes) {
    if (!mode.coverage) continue;
    totals.mandatoryAnchors.covered += mode.coverage.coveredAnchors;
    totals.mandatoryAnchors.required += mode.coverage.requiredAnchors;
    totals.requiredFacts.covered += mode.coverage.coveredFacts;
    totals.requiredFacts.required += mode.coverage.requiredFacts;
    totals.attributions.covered += mode.coverage.coveredAttributions;
    totals.attributions.required += mode.coverage.requiredAttributions;
    totals.numbers.covered += mode.coverage.coveredNumbers;
    totals.numbers.required += mode.coverage.requiredNumbers;
  }
  for (const value of Object.values(totals)) {
    value.rate = value.required ? value.covered / value.required : 1;
  }
  return totals;
}

function decide(metrics) {
  const mandatory = metrics.mandatoryOnly;
  const optional = metrics.optionalSelection;
  const mandatorySafe = (
    mandatory.samples === 9 &&
    mandatory.requiredFacts.rate === 1 &&
    mandatory.attributions.rate === 1 &&
    mandatory.numbers.rate === 1 &&
    mandatory.severeFactErrors === 0 &&
    mandatory.humanAccepted >= 8
  );
  if (!mandatorySafe) return 'Mandatory Manifest Not Ready';
  if (optional.improvedSamples >= 3 && optional.worseSamples === 0) {
    return 'Keep Stage 1 AI as optional enrichment';
  }
  return 'Remove Stage 1 AI';
}

function compareOutputs(left, right) {
  const fields = ['titleZh', 'summaryZh', 'oneLineZh'];
  const differences = {};
  for (const field of fields) {
    const leftValue = left.composition?.[field] || '';
    const rightValue = right.composition?.[field] || '';
    if (leftValue !== rightValue) {
      differences[field] = {
        mandatoryOnly: leftValue,
        qwenOptional: rightValue
      };
    }
  }
  return {
    changed: Object.keys(differences).length > 0,
    fields: differences
  };
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function atomicWriteJson(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(
    temporaryPath,
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8'
  );
  await fs.rename(temporaryPath, filePath);
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
