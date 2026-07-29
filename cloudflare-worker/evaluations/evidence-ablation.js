import {
  buildCoverageAwareFactPlan,
  buildEvidenceInventory,
  buildFactsFromEvidenceSelection,
  buildMandatoryCoverageManifest,
  normalizeEvidenceText,
  selectMinimumEvidenceSet,
  validateEvidenceCoverageContract
} from '../src/evidence-coverage.js';
import {
  composeDeterministicEditorial,
  validateDeterministicEditorialComposition
} from '../src/deterministic-editorial.js';
import { buildEditorialFactPlan } from '../src/pipeline.js';

const OPTIONAL_SELECTION_FIELDS = new Set(['selectedOptionalEvidenceIds']);

export function prepareEvidenceAblation(record, articleText = '') {
  const storyType = String(record?.testType || record?.storyType || 'other');
  const normalizedRecord = {
    ...record,
    storyType
  };
  const inventory = buildEvidenceInventory(normalizedRecord, articleText);
  const manifest = buildMandatoryCoverageManifest(inventory, {
    storyType,
    source: normalizedRecord.source || ''
  });
  const minimumSelection = selectMinimumEvidenceSet(inventory, manifest);
  return {
    record: normalizedRecord,
    storyType,
    inventory,
    manifest,
    minimumSelection
  };
}

export function buildOptionalEvidenceSelectionPrompt(context) {
  const mandatory = selectEvidencePayload(
    context.inventory,
    context.manifest.mandatoryEvidenceIds
  );
  const optional = selectEvidencePayload(
    context.inventory,
    context.manifest.optionalEvidenceIds.filter(
      (evidenceId) => !context.minimumSelection.selectedEvidenceIds.includes(evidenceId)
    )
  );
  return [
    'You select optional evidence for an NBA Chinese editorial draft.',
    'Mandatory evidence is already locked and will always be included.',
    'Choose only optional evidence that adds a distinct, useful fact for readers.',
    'Do not select repeated background, unrelated history, promotional text, rhetoric, or details that do not improve the draft.',
    'Return strict JSON with exactly one field: selectedOptionalEvidenceIds.',
    'Every returned ID must come from optionalEvidence. Returning an empty array is valid.',
    `storyType=${context.storyType}`,
    `mandatoryEvidence=${JSON.stringify(mandatory)}`,
    `optionalEvidence=${JSON.stringify(optional)}`
  ].join('\n');
}

export function buildOptionalEvidenceSelectionRequest(prompt) {
  return {
    messages: [
      {
        role: 'system',
        content: [
          '/no_think',
          'Do not output reasoning, markdown, commentary, evidence text, or unknown IDs.',
          'Return only a JSON object matching {"selectedOptionalEvidenceIds":[]}.'
        ].join('\n')
      },
      {
        role: 'user',
        content: ['/no_think', prompt, 'Return only the final JSON object.'].join('\n')
      }
    ],
    max_tokens: 300,
    temperature: 0.1,
    top_p: 0.8,
    top_k: 20,
    stream: false
  };
}

export function normalizeOptionalSelectionModelResponse(response, context) {
  const candidates = collectResponseCandidates(response);
  for (const candidate of candidates) {
    const parsed = parseStrictJsonCandidate(candidate);
    if (parsed == null) continue;
    return validateOptionalEvidenceSelection(parsed, context);
  }
  return optionalSelectionFallback('invalid-optional-selection-json');
}

export function validateOptionalEvidenceSelection(value, context) {
  if (!isOptionalSelectionObject(value)) {
    return optionalSelectionFallback('invalid-optional-selection-schema');
  }

  const knownIds = new Set(context.inventory.map((item) => item.evidenceId));
  const mandatoryIds = new Set(context.minimumSelection.selectedEvidenceIds);
  const optionalIds = new Set(
    context.manifest.optionalEvidenceIds.filter(
      (evidenceId) => !mandatoryIds.has(evidenceId)
    )
  );
  const selected = [];
  const ignored = [];
  const invalid = [];
  const seen = new Set();

  for (const evidenceId of value.selectedOptionalEvidenceIds) {
    if (!knownIds.has(evidenceId)) {
      invalid.push(evidenceId);
      ignored.push(evidenceId);
      continue;
    }
    if (mandatoryIds.has(evidenceId)) {
      ignored.push(evidenceId);
      continue;
    }
    if (!optionalIds.has(evidenceId)) {
      invalid.push(evidenceId);
      ignored.push(evidenceId);
      continue;
    }
    if (seen.has(evidenceId)) {
      ignored.push(evidenceId);
      continue;
    }
    seen.add(evidenceId);
    selected.push(evidenceId);
  }

  if (invalid.length) {
    return {
      ...optionalSelectionFallback('invalid-optional-evidence-id'),
      ignoredEvidenceIds: unique(ignored),
      invalidEvidenceIds: unique(invalid)
    };
  }

  return {
    optionalSelectionStatus: selected.length ? 'selected' : 'empty',
    selectedOptionalEvidenceIds: selected,
    ignoredEvidenceIds: unique(ignored),
    invalidEvidenceIds: [],
    optionalSelectionFallbackReason: null
  };
}

export async function selectOptionalEvidenceOnce({
  context,
  invoke
}) {
  if (typeof invoke !== 'function') {
    return {
      ...optionalSelectionFallback('optional-selection-invoke-missing'),
      stage1AiRequests: 0
    };
  }

  const prompt = buildOptionalEvidenceSelectionPrompt(context);
  try {
    const response = await invoke(buildOptionalEvidenceSelectionRequest(prompt));
    return {
      ...normalizeOptionalSelectionModelResponse(response, context),
      stage1AiRequests: 1
    };
  } catch {
    return {
      ...optionalSelectionFallback('optional-selection-request-failed'),
      stage1AiRequests: 1
    };
  }
}

export function evaluateEvidenceAblationMode(
  context,
  {
    mode = 'mandatory-only',
    optionalSelection = null
  } = {}
) {
  const selectedOptionalEvidenceIds = mode === 'qwen-optional'
    ? optionalSelection?.selectedOptionalEvidenceIds || []
    : [];
  const primaryEvidenceId = context.minimumSelection.primaryEvidenceId || '';
  const supportingEvidenceIds = unique([
    ...context.minimumSelection.supportingEvidenceIds,
    ...selectedOptionalEvidenceIds
  ]);
  const selection = {
    selectedEvidenceIds: supportingEvidenceIds,
    primaryEvidenceId,
    supportingEvidenceIds
  };
  const built = buildFactsFromEvidenceSelection(
    selection,
    context.inventory,
    context.manifest,
    { storyType: context.storyType }
  );

  if (!built.ok) {
    return failedModeResult({
      mode,
      context,
      selection,
      optionalSelection,
      reasons: built.reasons,
      stage: 'fact-generation'
    });
  }

  const factExtraction = built.value;
  const basePlan = buildEditorialFactPlan(factExtraction);
  const factPlan = buildCoverageAwareFactPlan(
    basePlan,
    factExtraction,
    context.manifest
  );
  const preCompositionCoverage = validateEvidenceCoverageContract({
    inventory: context.inventory,
    manifest: context.manifest,
    factExtraction,
    factPlan
  });

  if (!preCompositionCoverage.ok) {
    return failedModeResult({
      mode,
      context,
      selection,
      optionalSelection,
      facts: factExtraction,
      factPlan,
      coverage: preCompositionCoverage,
      reasons: preCompositionCoverage.reasons,
      stage: 'coverage-validation'
    });
  }

  let composition;
  try {
    composition = composeDeterministicEditorial(factExtraction, { factPlan });
  } catch (error) {
    return failedModeResult({
      mode,
      context,
      selection,
      optionalSelection,
      facts: factExtraction,
      factPlan,
      coverage: preCompositionCoverage,
      reasons: [error?.message || 'deterministic-composer-error'],
      stage: 'deterministic-composer'
    });
  }

  const coverage = validateEvidenceCoverageContract({
    inventory: context.inventory,
    manifest: context.manifest,
    factExtraction,
    factPlan,
    usedFactIds: composition.usedFactIds
  });
  const gate = validateDeterministicEditorialComposition(
    composition,
    context.record,
    factExtraction
  );
  const finalEvidenceIds = built.details.selection.finalEvidenceIds;

  return {
    mode,
    inventorySuccess: true,
    mandatoryEvidenceIds: [...context.manifest.mandatoryEvidenceIds],
    optionalEvidenceIds: [...context.manifest.optionalEvidenceIds],
    selectedOptionalEvidenceIds,
    finalEvidenceIds,
    optionalSelectionStatus: mode === 'qwen-optional'
      ? optionalSelection?.optionalSelectionStatus || 'fallback'
      : 'not-requested',
    ignoredEvidenceIds: mode === 'qwen-optional'
      ? [...(optionalSelection?.ignoredEvidenceIds || [])]
      : [],
    optionalSelectionFallbackReason: mode === 'qwen-optional'
      ? optionalSelection?.optionalSelectionFallbackReason || null
      : null,
    stage1AiRequests: mode === 'qwen-optional'
      ? Number(optionalSelection?.stage1AiRequests || 0)
      : 0,
    generatedFactCount: factExtraction.facts.length,
    factExtraction,
    factPlan,
    composition,
    coverage: compactCoverage(coverage, factPlan),
    gate: compactGate(gate),
    oneLineDuplicate: comparable(composition.titleZh) === comparable(composition.oneLineZh),
    severeFactErrors: 0,
    certaintyErrors: countReason(gate.reasons, [
      'certainty-escalation',
      'analysis-presented-as-fact',
      'rumor-as-fact'
    ]),
    negationErrors: countReason(gate.reasons, ['negation-lost']),
    productionWrites: 0,
    llamaFallbackCalls: 0
  };
}

function failedModeResult({
  mode,
  context,
  selection,
  optionalSelection,
  facts = null,
  factPlan = null,
  coverage = null,
  reasons,
  stage
}) {
  return {
    mode,
    inventorySuccess: true,
    mandatoryEvidenceIds: [...context.manifest.mandatoryEvidenceIds],
    optionalEvidenceIds: [...context.manifest.optionalEvidenceIds],
    selectedOptionalEvidenceIds: mode === 'qwen-optional'
      ? [...(optionalSelection?.selectedOptionalEvidenceIds || [])]
      : [],
    finalEvidenceIds: facts?.facts?.map((fact) => fact.evidenceId) || [
      ...context.manifest.mandatoryEvidenceIds
    ],
    optionalSelectionStatus: mode === 'qwen-optional'
      ? optionalSelection?.optionalSelectionStatus || 'fallback'
      : 'not-requested',
    ignoredEvidenceIds: mode === 'qwen-optional'
      ? [...(optionalSelection?.ignoredEvidenceIds || [])]
      : [],
    optionalSelectionFallbackReason: mode === 'qwen-optional'
      ? optionalSelection?.optionalSelectionFallbackReason || null
      : null,
    stage1AiRequests: mode === 'qwen-optional'
      ? Number(optionalSelection?.stage1AiRequests || 0)
      : 0,
    generatedFactCount: facts?.facts?.length || 0,
    factExtraction: facts,
    factPlan,
    composition: null,
    coverage: coverage ? compactCoverage(coverage, factPlan) : null,
    gate: {
      ok: false,
      reasons: unique(reasons || ['evidence-ablation-failed']),
      addedFacts: [],
      missingFacts: [],
      unsafeFragments: []
    },
    failureStage: stage,
    selection,
    oneLineDuplicate: false,
    severeFactErrors: 0,
    certaintyErrors: 0,
    negationErrors: 0,
    productionWrites: 0,
    llamaFallbackCalls: 0
  };
}

function compactCoverage(validation, factPlan) {
  const requiredAnchors = factPlan?.requiredAnchors || [];
  const anchorToUsedFields = validation?.trace?.anchorToUsedFields || {};
  const coveredAnchorIds = requiredAnchors
    .filter((anchor) => (anchorToUsedFields[anchor.anchorId] || []).length > 0)
    .map((anchor) => anchor.anchorId);
  const requiredFactEntries = [
    ...(factPlan?.titleFactIds || []).map((factId) => `title:${factId}`),
    ...(factPlan?.summaryFactIds || []).map((factId) => `summary:${factId}`),
    ...(factPlan?.oneLineFactIds || []).map((factId) => `oneLine:${factId}`)
  ];
  const factToUsedFields = validation?.trace?.factToUsedFields || {};
  const coveredFactEntries = requiredFactEntries.filter((entry) => {
    const separator = entry.indexOf(':');
    const field = entry.slice(0, separator);
    const factId = entry.slice(separator + 1);
    return (factToUsedFields[factId] || []).includes(field);
  });
  const attributionAnchors = requiredAnchors.filter((anchor) => anchor.type === 'attribution');
  const numberAnchors = requiredAnchors.filter((anchor) => anchor.type === 'number');

  return {
    ok: Boolean(validation?.ok),
    reasons: [...(validation?.reasons || [])],
    missingEvidenceIds: [...(validation?.details?.missingEvidenceIds || [])],
    missingAnchorIds: [...(validation?.details?.missingAnchorIds || [])],
    requiredAnchors: requiredAnchors.length,
    coveredAnchors: coveredAnchorIds.length,
    requiredFacts: requiredFactEntries.length,
    coveredFacts: coveredFactEntries.length,
    requiredAttributions: attributionAnchors.length,
    coveredAttributions: attributionAnchors.filter(
      (anchor) => coveredAnchorIds.includes(anchor.anchorId)
    ).length,
    requiredNumbers: numberAnchors.length,
    coveredNumbers: numberAnchors.filter(
      (anchor) => coveredAnchorIds.includes(anchor.anchorId)
    ).length,
    trace: validation?.trace || null
  };
}

function compactGate(validation) {
  return {
    ok: Boolean(validation?.ok),
    reasons: [...(validation?.reasons || [])],
    addedFacts: [...(validation?.details?.addedFacts || [])],
    missingFacts: [...(validation?.details?.missingFacts || [])],
    unsafeFragments: [...(validation?.details?.unsafeFragments || [])]
  };
}

function selectEvidencePayload(inventory, ids) {
  const idSet = new Set(ids);
  return inventory
    .filter((item) => idSet.has(item.evidenceId))
    .map((item) => ({
      evidenceId: item.evidenceId,
      text: item.text
    }));
}

function collectResponseCandidates(response) {
  const message = response?.choices?.[0]?.message ||
    response?.result?.choices?.[0]?.message;
  return [
    response?.response,
    response?.result?.response,
    normalizeMessageContent(message?.content),
    response?.result
  ].filter((value) => value != null);
}

function normalizeMessageContent(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return value;
  return value
    .filter((part) => part?.type === 'text' || typeof part?.text === 'string')
    .map((part) => part.text || '')
    .join('');
}

function parseStrictJsonCandidate(value) {
  if (isOptionalSelectionObject(value)) return value;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text.startsWith('{') || !text.endsWith('}')) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isOptionalSelectionObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === 1 &&
    OPTIONAL_SELECTION_FIELDS.has(keys[0]) &&
    Array.isArray(value.selectedOptionalEvidenceIds) &&
    value.selectedOptionalEvidenceIds.every((entry) => typeof entry === 'string')
  );
}

function optionalSelectionFallback(reason) {
  return {
    optionalSelectionStatus: 'fallback',
    selectedOptionalEvidenceIds: [],
    ignoredEvidenceIds: [],
    invalidEvidenceIds: [],
    optionalSelectionFallbackReason: reason
  };
}

function countReason(reasons, expected) {
  return (reasons || []).filter((reason) => expected.includes(reason)).length;
}

function comparable(value) {
  return normalizeEvidenceText(value).replace(/[^\p{L}\p{N}]+/gu, '');
}

function unique(values) {
  return [...new Set(values)];
}
