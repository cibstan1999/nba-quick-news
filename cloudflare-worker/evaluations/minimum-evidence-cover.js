import {
  buildCoverageAwareFactPlan,
  buildEvidenceInventory,
  buildFactsFromEvidenceSelection,
  buildMandatoryCoverageManifest,
  selectMinimumEvidenceSet,
  validateEvidenceCoverageContract
} from '../src/evidence-coverage.js';
import {
  composeDeterministicEditorial,
  validateDeterministicEditorialComposition
} from '../src/deterministic-editorial.js';
import { buildEditorialFactPlan } from '../src/pipeline.js';

const INTERNAL_MARKER_PATTERN = /\b(?:contract-realgm|source-internal|undefined|evidenceid|anchorid)\b/i;

export function evaluateMinimumEvidenceCover(sample, humanScore = {}) {
  const storyType = String(sample?.testType || sample?.storyType || 'other');
  const record = { ...sample, storyType };
  const inventory = buildEvidenceInventory(
    record,
    sample?.articleTextUsed || ''
  );
  const manifest = buildMandatoryCoverageManifest(inventory, {
    storyType,
    source: record.source || ''
  });
  const minimum = selectMinimumEvidenceSet(inventory, manifest);

  if (!minimum.ok) {
    return failedResult({
      sample,
      storyType,
      inventory,
      manifest,
      minimum,
      stage: 'minimum-evidence-cover',
      reasons: minimum.reasons
    });
  }

  const factResult = buildFactsFromEvidenceSelection({
    selectedEvidenceIds: minimum.supportingEvidenceIds,
    primaryEvidenceId: minimum.primaryEvidenceId,
    supportingEvidenceIds: minimum.supportingEvidenceIds
  }, inventory, manifest, { storyType });

  if (!factResult.ok) {
    return failedResult({
      sample,
      storyType,
      inventory,
      manifest,
      minimum,
      stage: 'fact-generation',
      reasons: factResult.reasons
    });
  }

  const factExtraction = factResult.value;
  const factPlan = buildCoverageAwareFactPlan(
    buildEditorialFactPlan(factExtraction),
    factExtraction,
    manifest
  );
  const composition = composeDeterministicEditorial(factExtraction, {
    factPlan
  });
  const coverage = validateEvidenceCoverageContract({
    inventory,
    manifest,
    factExtraction,
    factPlan,
    usedFactIds: composition.usedFactIds
  });
  const gate = validateDeterministicEditorialComposition(
    composition,
    {
      newsId: sample.newsId,
      source: sample.source,
      publishedAt: sample.publishedAt,
      originalTitle: '',
      originalSummary: ''
    },
    factExtraction
  );
  const requiredFactCoverage = calculateRequiredFactCoverage(
    factPlan,
    composition.usedFactIds
  );
  const anchorCoverage = calculateAnchorCoverage(factPlan, coverage);
  const selectedScores = minimum.evidenceScores.filter((entry) => entry.selected);
  const irrelevantEvidenceIds = selectedScores
    .filter((entry) => (
      Number(entry.penalties?.promotional || 0) > 0 ||
      Number(entry.penalties?.internalMarker || 0) > 0 ||
      (
        Number(entry.penalties?.background || 0) > 0 &&
        !(entry.coveredAnchorIds || []).length
      )
    ))
    .map((entry) => entry.evidenceId);
  const markerTexts = [
    ...factExtraction.facts.map((fact) => fact.factText),
    composition.titleZh,
    composition.summaryZh,
    composition.oneLineZh
  ];
  const internalMarkerLeakCount = markerTexts.filter(
    (text) => INTERNAL_MARKER_PATTERN.test(String(text || ''))
  ).length;

  return {
    sampleId: sample.sampleId,
    newsId: sample.newsId,
    storyType,
    inventorySuccess: true,
    inventoryCount: inventory.length,
    mandatoryAnchors: manifest.mandatoryAnchors.map((anchor) => ({
      anchorId: anchor.anchorId,
      type: anchor.type,
      value: anchor.value,
      candidateEvidenceIds: [...anchor.candidateEvidenceIds],
      priority: anchor.priority,
      reason: anchor.reason
    })),
    selectedEvidenceIds: [...minimum.selectedEvidenceIds],
    uncoveredAnchorIds: [...minimum.uncoveredAnchorIds],
    evidenceScores: minimum.evidenceScores,
    generatedFactCount: factExtraction.facts.length,
    preDedupFactCount: factExtraction.preDedupFactCount,
    dedupedFactCount: factExtraction.dedupedFactCount,
    titleZh: composition.titleZh,
    summaryZh: composition.summaryZh,
    oneLineZh: composition.oneLineZh,
    usedFactIds: composition.usedFactIds,
    coverage: {
      ok: coverage.ok,
      reasons: [...coverage.reasons],
      criticalAnchors: anchorCoverage.criticalAnchors,
      coveredCriticalAnchors: anchorCoverage.coveredCriticalAnchors,
      requiredFacts: requiredFactCoverage.required,
      coveredRequiredFacts: requiredFactCoverage.covered,
      requiredAttributions: anchorCoverage.requiredAttributions,
      coveredAttributions: anchorCoverage.coveredAttributions,
      requiredNumbers: anchorCoverage.requiredNumbers,
      coveredNumbers: anchorCoverage.coveredNumbers
    },
    gateDecision: gate.ok ? 'accepted' : 'rejected',
    rejectionReasons: [...gate.reasons],
    addedFacts: [...(gate.details?.addedFacts || [])],
    missingFacts: [...(gate.details?.missingFacts || [])],
    unsafeFragments: [...(gate.details?.unsafeFragments || [])],
    irrelevantEvidenceIds,
    irrelevantEvidenceCount: irrelevantEvidenceIds.length,
    internalMarkerLeakCount,
    oneLineDuplicate: comparable(composition.titleZh) === comparable(composition.oneLineZh),
    severeFactErrors: countReasons(gate.reasons, [
      'added-facts',
      'editorial-unsupported-entity',
      'editorial-unsupported-role',
      'editorial-unsupported-event'
    ]),
    certaintyErrors: countReasons(gate.reasons, [
      'certainty-escalation',
      'analysis-presented-as-fact',
      'rumor-as-fact'
    ]),
    negationErrors: countReasons(gate.reasons, ['negation-lost']),
    gateFalseNegative: Boolean(
      gate.ok &&
      humanScore.humanDecision === 'reject'
    ),
    humanDecision: humanScore.humanDecision || null,
    editorEffort: humanScore.editorEffort || null,
    chineseNaturalness: humanScore.chineseNaturalness ?? null,
    reviewNotes: humanScore.reviewNotes || '',
    aiRequests: 0,
    productionWrites: 0
  };
}

export function summarizeMinimumEvidenceResults(results) {
  const valid = results.filter((result) => result.runnerStatus !== 'failed');
  const totals = valid.reduce((summary, result) => {
    summary.inventorySuccess += Number(result.inventorySuccess);
    summary.criticalAnchors += result.coverage.criticalAnchors;
    summary.coveredCriticalAnchors += result.coverage.coveredCriticalAnchors;
    summary.requiredFacts += result.coverage.requiredFacts;
    summary.coveredRequiredFacts += result.coverage.coveredRequiredFacts;
    summary.requiredAttributions += result.coverage.requiredAttributions;
    summary.coveredAttributions += result.coverage.coveredAttributions;
    summary.requiredNumbers += result.coverage.requiredNumbers;
    summary.coveredNumbers += result.coverage.coveredNumbers;
    summary.gateAccepted += Number(result.gateDecision === 'accepted');
    summary.humanAccepted += Number(result.humanDecision === 'accept');
    summary.publish += Number(result.editorEffort === 'publish');
    summary.minorEdit += Number(result.editorEffort === 'minor_edit');
    summary.rewrite += Number(result.editorEffort === 'rewrite');
    summary.naturalnessTotal += Number(result.chineseNaturalness || 0);
    summary.naturalnessCount += Number(result.chineseNaturalness != null);
    summary.irrelevantEvidence += result.irrelevantEvidenceCount;
    summary.internalMarkerLeaks += result.internalMarkerLeakCount;
    summary.severeFactErrors += result.severeFactErrors;
    summary.certaintyErrors += result.certaintyErrors;
    summary.negationErrors += result.negationErrors;
    summary.gateFalseNegatives += Number(result.gateFalseNegative);
    summary.oneLineDuplicates += Number(result.oneLineDuplicate);
    summary.aiRequests += result.aiRequests;
    summary.productionWrites += result.productionWrites;
    return summary;
  }, {
    inventorySuccess: 0,
    criticalAnchors: 0,
    coveredCriticalAnchors: 0,
    requiredFacts: 0,
    coveredRequiredFacts: 0,
    requiredAttributions: 0,
    coveredAttributions: 0,
    requiredNumbers: 0,
    coveredNumbers: 0,
    gateAccepted: 0,
    humanAccepted: 0,
    publish: 0,
    minorEdit: 0,
    rewrite: 0,
    naturalnessTotal: 0,
    naturalnessCount: 0,
    irrelevantEvidence: 0,
    internalMarkerLeaks: 0,
    severeFactErrors: 0,
    certaintyErrors: 0,
    negationErrors: 0,
    gateFalseNegatives: 0,
    oneLineDuplicates: 0,
    aiRequests: 0,
    productionWrites: 0
  });

  return {
    sampleCount: results.length,
    ...totals,
    chineseNaturalness: totals.naturalnessCount
      ? Number((totals.naturalnessTotal / totals.naturalnessCount).toFixed(2))
      : null
  };
}

function calculateRequiredFactCoverage(factPlan, usedFactIds) {
  const required = [
    ...(factPlan.titleFactIds || []).map((factId) => `title:${factId}`),
    ...(factPlan.summaryFactIds || []).map((factId) => `summary:${factId}`),
    ...(factPlan.oneLineFactIds || []).map((factId) => `oneLine:${factId}`)
  ];
  const used = new Set([
    ...(usedFactIds.title || []).map((factId) => `title:${factId}`),
    ...(usedFactIds.summary || []).map((factId) => `summary:${factId}`),
    ...(usedFactIds.oneLine || []).map((factId) => `oneLine:${factId}`)
  ]);
  return {
    required: required.length,
    covered: required.filter((entry) => used.has(entry)).length
  };
}

function calculateAnchorCoverage(factPlan, validation) {
  const anchors = factPlan.requiredAnchors || [];
  const usedFields = validation.trace?.anchorToUsedFields || {};
  const covered = (anchor) => (usedFields[anchor.anchorId] || []).length > 0;
  const attributions = anchors.filter((anchor) => anchor.type === 'attribution');
  const numbers = anchors.filter((anchor) => anchor.type === 'number');
  return {
    criticalAnchors: anchors.length,
    coveredCriticalAnchors: anchors.filter(covered).length,
    requiredAttributions: attributions.length,
    coveredAttributions: attributions.filter(covered).length,
    requiredNumbers: numbers.length,
    coveredNumbers: numbers.filter(covered).length
  };
}

function failedResult({
  sample,
  storyType,
  inventory,
  manifest,
  minimum,
  stage,
  reasons
}) {
  return {
    sampleId: sample.sampleId,
    newsId: sample.newsId,
    storyType,
    runnerStatus: 'failed',
    failureStage: stage,
    failureReasons: [...(reasons || [])],
    inventorySuccess: true,
    inventoryCount: inventory.length,
    mandatoryAnchors: manifest.mandatoryAnchors,
    selectedEvidenceIds: minimum?.selectedEvidenceIds || [],
    uncoveredAnchorIds: minimum?.uncoveredAnchorIds || [],
    evidenceScores: minimum?.evidenceScores || [],
    aiRequests: 0,
    productionWrites: 0
  };
}

function comparable(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s，。；：、,.!?！？:;'"“”‘’（）()\-]/g, '');
}

function countReasons(reasons, expected) {
  const set = new Set(reasons || []);
  return expected.reduce((count, reason) => count + Number(set.has(reason)), 0);
}
