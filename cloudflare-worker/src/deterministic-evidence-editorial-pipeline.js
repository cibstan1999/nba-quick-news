import {
  buildCoverageAwareFactPlan,
  buildEvidenceInventory,
  buildFactsFromEvidenceSelection,
  buildMandatoryCoverageManifest,
  selectMinimumEvidenceSet,
  validateEvidenceCoverageContract
} from './evidence-coverage.js';
import {
  composeDeterministicEditorial,
  validateDeterministicEditorialComposition
} from './deterministic-editorial.js';
import { runConstrainedPolishExperiment } from './constrained-editorial-polish.js';
import { buildEditorialFactPlan } from './pipeline.js';
import { decidePhase1Publication } from './publication-policy.js';

export const DETERMINISTIC_EDITORIAL_PIPELINE =
  'editorial-pipeline-v6-deterministic-polish';

export async function runDeterministicEvidenceEditorialPipeline({
  record,
  articleText = '',
  storyType = record?.testType || record?.storyType || 'other',
  enablePolish = false,
  invokePolish
}) {
  const statuses = createStageStatuses();
  const counters = {
    stage1AiRequests: 0,
    polishAiRequests: 0,
    llamaRequests: 0,
    productionWrites: 0
  };
  const normalizedRecord = { ...record, storyType };

  let inventory;
  try {
    inventory = buildEvidenceInventory(normalizedRecord, articleText);
    statuses.evidenceInventoryStatus = {
      status: inventory.length ? 'success' : 'failed',
      evidenceCount: inventory.length
    };
  } catch (error) {
    return failedResult('evidence-inventory', error, statuses, counters);
  }
  if (!inventory.length) {
    return failedResult(
      'evidence-inventory',
      new Error('evidence-inventory-empty'),
      statuses,
      counters
    );
  }

  const manifest = buildMandatoryCoverageManifest(inventory, {
    storyType,
    source: normalizedRecord.source || ''
  });
  const minimum = selectMinimumEvidenceSet(inventory, manifest);
  statuses.minimumEvidenceCoverStatus = {
    status: minimum.ok ? 'success' : 'failed',
    selectedEvidenceIds: [...(minimum.selectedEvidenceIds || [])],
    uncoveredAnchorIds: [...(minimum.uncoveredAnchorIds || [])]
  };
  if (!minimum.ok) {
    return failedResult(
      'minimum-evidence-cover',
      new Error(minimum.reasons.join('|')),
      statuses,
      counters,
      { inventory, manifest, minimum }
    );
  }

  const factResult = buildFactsFromEvidenceSelection({
    selectedEvidenceIds: minimum.supportingEvidenceIds,
    primaryEvidenceId: minimum.primaryEvidenceId,
    supportingEvidenceIds: minimum.supportingEvidenceIds
  }, inventory, manifest, { storyType });
  statuses.deterministicFactStatus = {
    status: factResult.ok ? 'success' : 'failed',
    factCount: factResult.value?.facts?.length || 0,
    reasons: [...(factResult.reasons || [])]
  };
  if (!factResult.ok) {
    return failedResult(
      'deterministic-facts',
      new Error(factResult.reasons.join('|')),
      statuses,
      counters,
      { inventory, manifest, minimum, factResult }
    );
  }

  const factExtraction = factResult.value;
  const factPlan = buildCoverageAwareFactPlan(
    buildEditorialFactPlan(factExtraction),
    factExtraction,
    manifest
  );
  let composition;
  try {
    composition = composeDeterministicEditorial(factExtraction, { factPlan });
    statuses.composerStatus = { status: 'success', reasons: [] };
  } catch (error) {
    statuses.composerStatus = {
      status: 'failed',
      reasons: [error?.message || 'composer-failed']
    };
    return failedResult(
      'deterministic-composer',
      error,
      statuses,
      counters,
      { inventory, manifest, minimum, factExtraction, factPlan }
    );
  }

  const coverage = validateEvidenceCoverageContract({
    inventory,
    manifest,
    factExtraction,
    factPlan,
    usedFactIds: composition.usedFactIds
  });
  const gateRecord = createGateRecord(normalizedRecord);
  const composerGate = validateDeterministicEditorialComposition(
    composition,
    gateRecord,
    factExtraction
  );
  if (!coverage.ok || !composerGate.ok) {
    statuses.finalGateStatus = {
      status: 'rejected',
      reasons: [
        ...coverage.reasons,
        ...composerGate.reasons
      ]
    };
    return attachPublicationDecision({
      ok: false,
      pipeline: DETERMINISTIC_EDITORIAL_PIPELINE,
      failureStage: coverage.ok ? 'composer-gate' : 'coverage-contract',
      statuses,
      counters,
      inventory,
      manifest,
      minimum,
      factExtraction,
      factPlan,
      composition,
      coverage,
      composerGate,
      final: null,
      adoptedPolish: false,
      polishFallbackReason: null
    });
  }

  if (!enablePolish) {
    statuses.polishStatus = { status: 'skipped', reason: 'polish-disabled' };
    statuses.finalGateStatus = { status: 'accepted', reasons: [] };
    return successResult({
      statuses,
      counters,
      inventory,
      manifest,
      minimum,
      factExtraction,
      factPlan,
      composition,
      coverage,
      composerGate,
      final: composition,
      adoptedPolish: false,
      polishFallbackReason: null
    });
  }

  const polish = await runConstrainedPolishExperiment({
    factExtraction,
    factPlan,
    composition,
    record: gateRecord,
    invoke: invokePolish
  });
  counters.polishAiRequests = polish.aiRequests;
  statuses.polishStatus = {
    status: polish.adoptedPolish ? 'accepted' : 'fallback',
    reason: polish.polishFallbackReason
  };
  statuses.finalGateStatus = {
    status: polish.gateValidation?.ok ? 'accepted' : 'rejected',
    reasons: [...(polish.gateValidation?.reasons || [])]
  };

  return successResult({
    statuses,
    counters,
    inventory,
    manifest,
    minimum,
    factExtraction,
    factPlan,
    composition,
    coverage,
    composerGate,
    final: polish.final,
    adoptedPolish: polish.adoptedPolish,
    polishFallbackReason: polish.polishFallbackReason,
    polish
  });
}

function createStageStatuses() {
  return {
    evidenceInventoryStatus: { status: 'not-started' },
    minimumEvidenceCoverStatus: { status: 'not-started' },
    deterministicFactStatus: { status: 'not-started' },
    composerStatus: { status: 'not-started' },
    polishStatus: { status: 'not-started' },
    finalGateStatus: { status: 'not-started', reasons: [] }
  };
}

function createGateRecord(record) {
  return {
    newsId: record?.newsId || 'news_deterministic_pipeline',
    source: record?.source || 'RealGM',
    publishedAt: record?.publishedAt || '',
    originalTitle: '',
    originalSummary: ''
  };
}

function successResult(value) {
  return attachPublicationDecision({
    ok: true,
    pipeline: DETERMINISTIC_EDITORIAL_PIPELINE,
    failureStage: null,
    legacyStage1Used: false,
    optionalEvidenceSelectionUsed: false,
    ...value
  });
}

function failedResult(stage, error, statuses, counters, details = {}) {
  return attachPublicationDecision({
    ok: false,
    pipeline: DETERMINISTIC_EDITORIAL_PIPELINE,
    failureStage: stage,
    failureReasons: [error?.message || String(error || 'pipeline-failed')],
    legacyStage1Used: false,
    optionalEvidenceSelectionUsed: false,
    statuses,
    counters,
    final: null,
    adoptedPolish: false,
    polishFallbackReason: null,
    ...details
  });
}

function attachPublicationDecision(result) {
  const publication = decidePhase1Publication(result);
  return {
    ...result,
    publicationDecision: publication.decision,
    publicationDiagnostics: publication
  };
}
