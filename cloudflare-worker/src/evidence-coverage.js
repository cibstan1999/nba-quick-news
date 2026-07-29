import {
  extractEvidenceFacts,
  inferStoryType,
  normalizeWhitespace
} from './pipeline.js';

const SOURCE_FIELDS = [
  ['title', 'originalTitle'],
  ['rssSummary', 'originalSummary'],
  ['articleText', 'articleText']
];

const MODALITY_PATTERNS = [
  ['not-expected', /\bnot expected to\b/i],
  ['has-not-decided', /\bhas not decided\b/i],
  ['yet-to-decide', /\b(?:has )?yet to decide\b/i],
  ['no-indication', /\bno indication\b/i],
  ['expected', /\b(?:expected to|the expectation is)\b/i],
  ['likely', /\b(?:likely to|unlikely to|very likely)\b/i],
  ['possible', /\b(?:could|may|might)\b/i],
  ['interest', /\b(?:interested in|interest in|drawing interest|had no interest|have no interest|considering|exploring|leaning toward|hopeful of|focused on adding)\b/i],
  ['reported-source', /\b(?:reportedly|according to|reports?|reported by|sources? say)\b/i],
  ['opinion', /\b(?:believes?|thinks?|predicts?|analysis|analyzes?|discusses?|addressed|said|says|questions?)\b/i]
];

const NEGATION_PATTERNS = [
  ['not', /\bnot\b/i],
  ['no', /\bno (?:interest|indication|demands?|agreement|decision)\b/i],
  ['has-not', /\bhas not\b/i],
  ['had-no', /\bhad no\b/i],
  ['yet-to', /\byet to\b/i],
  ['neither-nor', /\bneither\b[\s\S]*\bnor\b/i],
  ['without', /\bwithout\b/i],
  ['never', /\bnever\b/i],
  ['contraction', /\b(?:isn't|wasn't|hasn't|haven't|won't|wouldn't|couldn't)\b/i]
];

const RELATION_PATTERNS = [
  ['signing', /\b(?:sign(?:ed|ing)?|re-sign(?:ed|ing)?|agreed to|join(?:ed|ing)?|matched an offer)\b/i],
  ['trade', /\b(?:trade(?:d|ing)?|acquir(?:e|ed|ing)|dealt|sent to|lands? in a deal)\b/i],
  ['interest', /\b(?:interested in|interest in|drawing interest|had no interest|have no interest|considering|exploring|pursu(?:e|ing)|focused on adding)\b/i],
  ['decision', /\b(?:decision|decided|choose|chose|picked|select(?:ed|ing)?)\b/i],
  ['retain', /\b(?:remain|stay|retain|return|re-sign)\b/i],
  ['injury', /\b(?:injur(?:y|ed|ies)|out|return|recovery|sidelined|miss(?:ed|ing)?)\b/i],
  ['game-result', /\b(?:defeat(?:ed|s)?|beat|won|lost|loss to|final score)\b/i],
  ['contract', /\b(?:contract|deal|offer sheet|player option|guaranteed)\b/i],
  ['analysis', /\b(?:analysis|analyzes?|review|discuss(?:es|ed|ing)?|what it means|outlook|prospects?)\b/i],
  ['statement', /\b(?:said|says|believes?|thinks?|explains?|addressed|acknowledged|pointed to)\b/i]
];

const KNOWN_MEDIA_ATTRIBUTIONS = [
  'RealGM',
  'Yahoo Sports',
  'ESPN',
  "Dunc'd On",
  'NBA Today',
  'The TK Show'
];

const CORE_NUMBER_TYPES = new Set(['money', 'contractYears', 'tradeAsset', 'score']);
const ATTRIBUTION_STORY_TYPES = new Set(['interview', 'analysis', 'opinion']);

export function buildEvidenceInventory(record = {}, articleText = '') {
  const storyType = normalizeStoryType(
    record.storyType || inferStoryType(`${record.originalTitle || ''} ${record.originalSummary || ''}`)
  );
  const sourceValues = {
    originalTitle: String(record.originalTitle || ''),
    originalSummary: String(record.originalSummary || record.rssSummary || ''),
    articleText: String(articleText || record.articleTextUsed || '')
  };
  const inventory = [];

  for (const [sourceField, recordField] of SOURCE_FIELDS) {
    const chunks = sourceField === 'title'
      ? splitTitle(sourceValues[recordField])
      : splitEvidenceSentences(sourceValues[recordField]);
    chunks.forEach((text, position) => {
      const evidenceId = `${sourcePrefix(sourceField)}-${position + 1}`;
      inventory.push({
        evidenceId,
        sourceField,
        text,
        normalizedText: normalizeEvidenceText(text),
        position,
        anchors: buildEvidenceAnchors(text, {
          source: record.source || '',
          sourceField,
          storyType
        })
      });
    });
  }

  return inventory;
}

export function buildMandatoryCoverageManifest(
  inventory,
  { storyType = '', source = '' } = {}
) {
  const items = normalizeInventory(inventory);
  const normalizedStoryType = normalizeStoryType(storyType);
  const titleItems = items.filter((item) => item.sourceField === 'title');
  const titleEntities = new Set(
    titleItems.flatMap((item) => item.anchors.entities.map(entityKey))
  );
  const mandatoryIds = new Set(titleItems.map((item) => item.evidenceId));

  for (const item of items) {
    if (item.sourceField === 'title') continue;
    const hasCoreNumber = item.anchors.numbers.some((entry) => CORE_NUMBER_TYPES.has(entry.type));
    const hasModality = item.anchors.modalityTerms.length > 0;
    const hasNegation = item.anchors.negationTerms.length > 0;
    const hasRequiredAttribution = (
      ATTRIBUTION_STORY_TYPES.has(normalizedStoryType) &&
      item.anchors.attributions.some((entry) => entry.origin === 'text')
    );
    const hasTitleEntity = item.anchors.entities.some((entry) => titleEntities.has(entityKey(entry)));
    const relations = extractCoreRelations(item.text, normalizedStoryType);
    const explainsTitle = hasTitleEntity && relations.length > 0;
    const meaningChangingSupport = (
      relations.length > 0 &&
      /\b(?:real factor|shap(?:e|ed|ing)|because|due to|as a result)\b/i.test(item.text)
    );
    const analysisQuestion = (
      normalizedStoryType === 'analysis' &&
      (relations.some((entry) => entry.value === 'analysis') || /\?/.test(item.text))
    );

    if (
      hasCoreNumber ||
      hasModality ||
      hasNegation ||
      hasRequiredAttribution ||
      explainsTitle ||
      meaningChangingSupport ||
      analysisQuestion
    ) {
      mandatoryIds.add(item.evidenceId);
    }
  }

  const mandatoryEvidenceIds = items
    .filter((item) => mandatoryIds.has(item.evidenceId))
    .map((item) => item.evidenceId);
  const mandatoryAnchors = [];

  for (const item of items.filter((entry) => mandatoryIds.has(entry.evidenceId))) {
    const isTitle = item.sourceField === 'title';
    const relations = extractCoreRelations(item.text, normalizedStoryType);
    const hasTitleEntity = item.anchors.entities.some((entry) => (
      titleEntities.has(entityKey(entry))
    ));
    const includeSupportingEventEntities = (
      !isTitle &&
      item.position === 0 &&
      hasTitleEntity &&
      relations.length > 0
    );
    const relevantEntities = item.anchors.entities.filter((entry) => (
      isTitle ||
      includeSupportingEventEntities ||
      titleEntities.has(entityKey(entry))
    ));
    const hasExplicitAttribution = item.anchors.attributions.some(
      (entry) => entry.origin === 'text'
    );
    const anchors = [
      ...relevantEntities.map((entry) => ({
        type: 'entity',
        value: entityKey(entry),
        reason: isTitle ? 'title-primary-entity' : 'summary-title-entity'
      })),
      ...item.anchors.numbers
        .filter((entry) => CORE_NUMBER_TYPES.has(entry.type))
        .map((entry) => ({
          type: 'number',
          value: `${entry.type}:${entry.value}`,
          reason: 'core-number'
        })),
      ...item.anchors.modalityTerms.map((entry) => ({
        type: 'modality',
        value: entry.value,
        reason: 'certainty-limiter'
      })),
      ...item.anchors.negationTerms.map((entry) => ({
        type: 'negation',
        value: entry.value,
        reason: 'meaning-changing-negation'
      })),
      ...item.anchors.attributions
        .filter((entry) => (
          !(entry.origin === 'source-metadata' && hasExplicitAttribution) &&
          shouldRequireAttribution(entry, normalizedStoryType, item)
        ))
        .map((entry) => ({
          type: 'attribution',
          value: entry.value,
          reason: entry.origin === 'source-metadata'
            ? 'source-attribution'
            : 'speaker-or-analysis-attribution'
        })),
      ...relations.map((entry) => ({
        type: 'core-relation',
        value: entry.value,
        reason: isTitle ? 'title-core-relation' : 'meaning-changing-support'
      }))
    ];

    anchors.forEach((anchor, index) => {
      mandatoryAnchors.push({
        anchorId: `${item.evidenceId}:${anchor.type}:${index + 1}`,
        type: anchor.type,
        value: anchor.value,
        evidenceId: item.evidenceId,
        reason: anchor.reason
      });
    });
  }

  if (ATTRIBUTION_STORY_TYPES.has(normalizedStoryType) && source) {
    const title = titleItems[0];
    const hasRequiredAttribution = mandatoryAnchors.some(
      (entry) => entry.type === 'attribution'
    );
    if (title && !hasRequiredAttribution) {
      mandatoryAnchors.push({
        anchorId: `${title.evidenceId}:attribution:source`,
        type: 'attribution',
        value: normalizeWhitespace(source),
        evidenceId: title.evidenceId,
        reason: 'source-attribution'
      });
    }
  }

  return {
    mandatoryEvidenceIds,
    mandatoryAnchors: dedupeAnchors(mandatoryAnchors),
    optionalEvidenceIds: items
      .filter((item) => !mandatoryIds.has(item.evidenceId))
      .map((item) => item.evidenceId)
  };
}

export function validateEvidenceSelection(result, inventory, manifest) {
  const items = normalizeInventory(inventory);
  const knownIds = new Set(items.map((item) => item.evidenceId));
  const optionalIds = new Set(manifest?.optionalEvidenceIds || []);
  const mandatoryIds = new Set(manifest?.mandatoryEvidenceIds || []);
  const reasons = [];

  if (!isSelectionObject(result)) {
    return { ok: false, reasons: ['evidence-selection-schema-invalid'], value: null };
  }

  const modelIds = [
    ...result.selectedEvidenceIds,
    result.primaryEvidenceId,
    ...result.supportingEvidenceIds
  ].filter(Boolean);
  const unknownIds = unique(modelIds.filter((id) => !knownIds.has(id)));
  if (unknownIds.length) reasons.push('evidence-selection-unknown-id');

  const nonOptionalSelections = unique([
    ...result.selectedEvidenceIds,
    ...result.supportingEvidenceIds
  ].filter((id) => knownIds.has(id) && !optionalIds.has(id)));
  if (nonOptionalSelections.length) reasons.push('evidence-selection-not-optional');

  const selectedSet = new Set([
    ...mandatoryIds,
    ...result.selectedEvidenceIds.filter((id) => optionalIds.has(id)),
    ...result.supportingEvidenceIds.filter((id) => optionalIds.has(id))
  ]);
  if (result.primaryEvidenceId && knownIds.has(result.primaryEvidenceId)) {
    selectedSet.add(result.primaryEvidenceId);
  }

  const finalEvidenceIds = items
    .map((item) => item.evidenceId)
    .filter((id) => selectedSet.has(id));
  const value = {
    selectedEvidenceIds: unique(result.selectedEvidenceIds),
    primaryEvidenceId: result.primaryEvidenceId,
    supportingEvidenceIds: unique(result.supportingEvidenceIds),
    finalEvidenceIds
  };

  return {
    ok: reasons.length === 0,
    reasons: unique(reasons),
    details: { unknownIds, nonOptionalSelections },
    value
  };
}

export function parseEvidenceSelectionResponse(response, inventory, manifest) {
  let parsed = response;
  if (typeof response === 'string') {
    try {
      parsed = JSON.parse(response);
    } catch {
      return {
        ok: false,
        reasons: ['evidence-selection-json-invalid'],
        details: { unknownIds: [], nonOptionalSelections: [] },
        value: null
      };
    }
  }
  return validateEvidenceSelection(parsed, inventory, manifest);
}

export function buildFactsFromEvidenceSelection(
  selection,
  inventory,
  manifest,
  { storyType = '' } = {}
) {
  const resolved = validateEvidenceSelection(selection, inventory, manifest);
  if (!resolved.ok) {
    return { ok: false, reasons: resolved.reasons, details: resolved.details, value: null };
  }

  const itemsById = new Map(normalizeInventory(inventory).map((item) => [item.evidenceId, item]));
  const normalizedStoryType = normalizeStoryType(storyType);
  const facts = resolved.value.finalEvidenceIds.map((evidenceId) => {
    const item = itemsById.get(evidenceId);
    const extracted = extractEvidenceFacts(item.text, item.text);
    const certainty = inferEvidenceCertainty(item, normalizedStoryType);
    const polarity = item.anchors.negationTerms.length ? 'negative' : 'positive';
    const textAttributions = item.anchors.attributions
      .filter((entry) => entry.origin === 'text')
      .map((entry) => entry.value);
    const attributions = textAttributions.length
      ? textAttributions
      : item.anchors.attributions.map((entry) => entry.value);
    const attribution = attributions[0] || '';

    return {
      id: `fact-${evidenceId}`,
      evidenceId,
      factText: item.text,
      evidenceQuote: item.text,
      sourceField: item.sourceField,
      certainty,
      polarity,
      attribution,
      attributions,
      attributionQuote: attribution && item.normalizedText.includes(normalizeEvidenceText(attribution))
        ? item.text
        : '',
      entities: [
        ...extracted.teams.map((canonicalId) => ({ type: 'team', canonicalId })),
        ...extracted.players.map((canonicalId) => ({ type: 'person', canonicalId }))
      ],
      numbers: [
        ...extracted.money.map((value) => ({ type: 'money', value })),
        ...extracted.durations.map((value) => ({ type: 'contractYears', value })),
        ...extracted.picks.map((value) => ({ type: 'tradeAsset', value })),
        ...extracted.scores.map((value) => ({ type: 'score', value }))
      ],
      modalityTerms: item.anchors.modalityTerms.map((entry) => entry.value),
      negationTerms: item.anchors.negationTerms.map((entry) => entry.value),
      relations: extractCoreRelations(item.text, normalizedStoryType).map((entry) => entry.value)
    };
  });

  return {
    ok: true,
    reasons: [],
    details: { selection: resolved.value },
    value: {
      storyType: normalizedStoryType || 'other',
      facts,
      mustNotClaim: buildMustNotClaim(facts),
      evidenceToFactIds: Object.fromEntries(
        facts.map((fact) => [fact.evidenceId, [fact.id]])
      )
    }
  };
}

export function buildCoverageAwareFactPlan(basePlan, factExtraction, manifest) {
  const facts = Array.isArray(factExtraction?.facts) ? factExtraction.facts : [];
  const mandatoryIds = new Set(manifest?.mandatoryEvidenceIds || []);
  const factIdsByEvidence = new Map();
  for (const fact of facts) {
    if (!factIdsByEvidence.has(fact.evidenceId)) factIdsByEvidence.set(fact.evidenceId, []);
    factIdsByEvidence.get(fact.evidenceId).push(fact.id);
  }
  const mandatoryFactIds = facts
    .filter((fact) => mandatoryIds.has(fact.evidenceId))
    .map((fact) => fact.id);
  const titleFactIds = facts
    .filter((fact) => (
      mandatoryIds.has(fact.evidenceId) &&
      String(fact.evidenceId).startsWith('title-')
    ))
    .map((fact) => fact.id);

  return {
    ...(basePlan || {}),
    titleFactIds: unique([
      ...titleFactIds,
      ...(basePlan?.titleFactIds || [])
    ]),
    summaryFactIds: unique([
      ...(basePlan?.summaryFactIds || []),
      ...mandatoryFactIds
    ]),
    oneLineFactIds: unique(basePlan?.oneLineFactIds || []),
    mandatoryFactIds,
    requiredEvidenceIds: [...mandatoryIds],
    requiredAnchors: (manifest?.mandatoryAnchors || []).map((anchor) => ({
      ...anchor,
      factIds: [...(factIdsByEvidence.get(anchor.evidenceId) || [])]
    }))
  };
}

export function validateEvidenceCoverageContract({
  inventory,
  manifest,
  factExtraction,
  factPlan,
  usedFactIds
}) {
  const facts = Array.isArray(factExtraction?.facts) ? factExtraction.facts : [];
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  const factsByEvidence = new Map();
  for (const fact of facts) {
    if (!factsByEvidence.has(fact.evidenceId)) factsByEvidence.set(fact.evidenceId, []);
    factsByEvidence.get(fact.evidenceId).push(fact);
  }
  const reasons = [];
  const missingEvidenceIds = [];
  const missingAnchorIds = [];

  for (const evidenceId of manifest?.mandatoryEvidenceIds || []) {
    if (!factsByEvidence.get(evidenceId)?.length) missingEvidenceIds.push(evidenceId);
  }

  for (const anchor of manifest?.mandatoryAnchors || []) {
    const supportingFacts = factsByEvidence.get(anchor.evidenceId) || [];
    if (!supportingFacts.some((fact) => factSupportsAnchor(fact, anchor))) {
      missingAnchorIds.push(anchor.anchorId);
    }
  }

  if (missingEvidenceIds.length) reasons.push('mandatory-evidence-missing');
  if (missingAnchorIds.length) reasons.push('mandatory-anchor-missing');

  const planFields = {
    title: factPlan?.titleFactIds || [],
    summary: factPlan?.summaryFactIds || [],
    oneLine: factPlan?.oneLineFactIds || []
  };
  const plannedIds = new Set(Object.values(planFields).flat());
  const mandatoryFactIds = facts
    .filter((fact) => (manifest?.mandatoryEvidenceIds || []).includes(fact.evidenceId))
    .map((fact) => fact.id);
  const unplannedFactIds = mandatoryFactIds.filter((factId) => !plannedIds.has(factId));
  if (factPlan && unplannedFactIds.length) reasons.push('mandatory-fact-not-planned');
  const plannedAnchorIds = new Set(
    Array.isArray(factPlan?.requiredAnchors)
      ? factPlan.requiredAnchors.map((anchor) => anchor.anchorId)
      : []
  );
  const missingPlannedAnchorIds = factPlan
    ? (manifest?.mandatoryAnchors || [])
        .map((anchor) => anchor.anchorId)
        .filter((anchorId) => !plannedAnchorIds.has(anchorId))
    : [];
  if (missingPlannedAnchorIds.length) reasons.push('mandatory-anchor-not-planned');

  const unusedFactIds = [];
  if (usedFactIds) {
    for (const [field, factIds] of Object.entries(planFields)) {
      const used = new Set(usedFactIds[field] || []);
      for (const factId of factIds) {
        if (!used.has(factId)) unusedFactIds.push(`${field}:${factId}`);
      }
    }
    if (unusedFactIds.length) reasons.push('planned-fact-not-used');
  }

  const trace = buildEvidenceTrace({
    inventory,
    factExtraction,
    factPlan,
    usedFactIds
  });
  const unknownFactIds = Object.values(planFields)
    .flat()
    .filter((factId) => !factsById.has(factId));
  if (unknownFactIds.length) reasons.push('fact-plan-unknown-fact');

  return {
    ok: reasons.length === 0,
    reasons: unique(reasons),
    details: {
      missingEvidenceIds,
      missingAnchorIds,
      unplannedFactIds,
      missingPlannedAnchorIds,
      unusedFactIds,
      unknownFactIds: unique(unknownFactIds)
    },
    trace
  };
}

export function buildEvidenceTrace({
  inventory,
  factExtraction,
  factPlan,
  usedFactIds
}) {
  const evidenceIds = normalizeInventory(inventory).map((item) => item.evidenceId);
  const facts = Array.isArray(factExtraction?.facts) ? factExtraction.facts : [];
  const evidenceToFactIds = Object.fromEntries(
    evidenceIds.map((evidenceId) => [
      evidenceId,
      facts.filter((fact) => fact.evidenceId === evidenceId).map((fact) => fact.id)
    ])
  );
  const fields = ['title', 'summary', 'oneLine'];
  const factToPlanFields = {};
  const factToUsedFields = {};
  const anchorToFactIds = {};
  const anchorToPlanFields = {};
  const anchorToUsedFields = {};

  for (const fact of facts) {
    factToPlanFields[fact.id] = fields.filter((field) => (
      (factPlan?.[`${field}FactIds`] || []).includes(fact.id)
    ));
    factToUsedFields[fact.id] = fields.filter((field) => (
      (usedFactIds?.[field] || []).includes(fact.id)
    ));
  }

  for (const anchor of factPlan?.requiredAnchors || []) {
    const factIds = unique(anchor.factIds || []);
    anchorToFactIds[anchor.anchorId] = factIds;
    anchorToPlanFields[anchor.anchorId] = unique(
      factIds.flatMap((factId) => factToPlanFields[factId] || [])
    );
    anchorToUsedFields[anchor.anchorId] = unique(
      factIds.flatMap((factId) => factToUsedFields[factId] || [])
    );
  }

  return {
    evidenceToFactIds,
    factToPlanFields,
    factToUsedFields,
    anchorToFactIds,
    anchorToPlanFields,
    anchorToUsedFields
  };
}

export function normalizeEvidenceText(value = '') {
  return String(value)
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function splitTitle(value) {
  const text = String(value || '').trim();
  return text ? [text] : [];
}

function splitEvidenceSentences(value) {
  const text = String(value || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  const chunks = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (!'.!?;:'.includes(character)) continue;
    if (character === '.' && isNonBoundaryPeriod(text, index)) continue;
    if (character === ':' && !isClauseColon(text, index)) continue;
    const end = index + 1;
    const next = nextNonWhitespaceIndex(text, end);
    if (next < text.length && character !== ';' && character !== ':') {
      const nextCharacter = text[next];
      if (!/[A-Z0-9"'(]/.test(nextCharacter)) continue;
    }
    pushChunk(chunks, text.slice(start, end));
    start = next;
    index = Math.max(index, next - 1);
  }

  pushChunk(chunks, text.slice(start));
  return chunks;
}

function isNonBoundaryPeriod(text, index) {
  const previous = text[index - 1] || '';
  const next = text[index + 1] || '';
  if (/\d/.test(previous) && /\d/.test(next)) return true;
  const prefix = text.slice(Math.max(0, index - 12), index + 1);
  return /\b(?:Mr|Mrs|Ms|Dr|Jr|Sr|St|vs|No|Inc|U\.S|e\.g|i\.e)\.$/i.test(prefix);
}

function isClauseColon(text, index) {
  const previous = text[index - 1] || '';
  const next = text[index + 1] || '';
  if (/\d/.test(previous) && /\d/.test(next)) return false;
  const left = text.slice(Math.max(0, index - 80), index);
  const right = text.slice(index + 1, Math.min(text.length, index + 120));
  return wordCount(left) >= 4 && wordCount(right) >= 4;
}

function nextNonWhitespaceIndex(text, start) {
  let index = start;
  while (index < text.length && /\s/.test(text[index])) index += 1;
  return index;
}

function pushChunk(chunks, value) {
  const text = String(value || '').trim();
  if (text) chunks.push(text);
}

function wordCount(value) {
  return (String(value).match(/[A-Za-z0-9$'-]+/g) || []).length;
}

function buildEvidenceAnchors(text, { source, sourceField, storyType }) {
  const extracted = extractEvidenceFacts(text, text);
  const attributions = extractAttributions(text);
  if (sourceField === 'title' && source) {
    attributions.unshift({
      value: normalizeWhitespace(source),
      origin: 'source-metadata'
    });
  }
  return {
    entities: uniqueObjects([
      ...extracted.teams.map((value) => ({ type: 'team', value })),
      ...extracted.players.map((value) => ({ type: 'person', value }))
    ], entityKey),
    numbers: uniqueObjects([
      ...extracted.money.map((value) => ({ type: 'money', value })),
      ...extracted.durations.map((value) => ({ type: 'contractYears', value })),
      ...extracted.picks.map((value) => ({ type: 'tradeAsset', value })),
      ...extracted.scores.map((value) => ({ type: 'score', value }))
    ], (entry) => `${entry.type}:${entry.value}`),
    attributions: uniqueObjects(attributions, (entry) => normalizeEvidenceText(entry.value)),
    modalityTerms: detectTerms(text, MODALITY_PATTERNS),
    negationTerms: detectTerms(text, NEGATION_PATTERNS),
    storyType: normalizeStoryType(storyType)
  };
}

function extractAttributions(text) {
  const found = [];
  for (const value of KNOWN_MEDIA_ATTRIBUTIONS) {
    if (containsNormalized(text, value)) found.push({ value, origin: 'text' });
  }
  for (const match of String(text).matchAll(
    /\b([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,3})\s+(?:said|says|reported|reports|wrote|writes|believes|thinks|explained|discussed|addressed|acknowledged|pointed to)\b/g
  )) {
    found.push({ value: match[1], origin: 'text' });
  }
  const according = String(text).match(
    /\baccording to\s+([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){0,3})/i
  );
  if (according) found.push({ value: according[1], origin: 'text' });
  if (/\bNate and Danny\b/i.test(text)) {
    found.push({ value: 'Nate Duncan', origin: 'text' });
    found.push({ value: 'Danny Leroux', origin: 'text' });
  }
  return found;
}

function detectTerms(text, patterns) {
  return patterns
    .filter(([, pattern]) => pattern.test(text))
    .map(([value, pattern]) => ({
      value,
      surface: String(text).match(pattern)?.[0] || value
    }));
}

function extractCoreRelations(text, storyType) {
  const relations = RELATION_PATTERNS
    .filter(([, pattern]) => pattern.test(text))
    .map(([value]) => ({ value }));
  if (
    storyType === 'analysis' &&
    !relations.some((entry) => entry.value === 'analysis')
  ) {
    relations.push({ value: 'analysis' });
  }
  if (
    storyType === 'interview' &&
    !relations.some((entry) => entry.value === 'statement')
  ) {
    relations.push({ value: 'statement' });
  }
  return uniqueObjects(relations, (entry) => entry.value);
}

function shouldRequireAttribution(entry, storyType, item) {
  if (entry.origin === 'source-metadata') {
    return ATTRIBUTION_STORY_TYPES.has(storyType);
  }
  return (
    ATTRIBUTION_STORY_TYPES.has(storyType) ||
    item.anchors.modalityTerms.some((term) => term.value === 'reported-source') ||
    /\b(?:said|says|according to|reported|reports|told)\b/i.test(item.text)
  );
}

function inferEvidenceCertainty(item, storyType) {
  const values = new Set(item.anchors.modalityTerms.map((entry) => entry.value));
  if (storyType === 'analysis' || storyType === 'interview' || values.has('opinion')) {
    return 'opinion';
  }
  if (values.has('not-expected') || values.has('expected')) return 'expected';
  if (values.has('likely')) return 'likely';
  if (values.has('interest')) return 'interest';
  if (
    values.has('possible') ||
    values.has('has-not-decided') ||
    values.has('yet-to-decide') ||
    values.has('no-indication')
  ) {
    return 'possible';
  }
  if (values.has('reported-source')) return 'reported';
  return 'confirmed';
}

function buildMustNotClaim(facts) {
  const claims = [];
  if (facts.some((fact) => ['expected', 'likely', 'possible'].includes(fact.certainty))) {
    claims.push('Do not present expected, likely, or possible events as confirmed.');
  }
  if (facts.some((fact) => fact.certainty === 'interest')) {
    claims.push('Do not present interest as a signing or completed trade.');
  }
  if (facts.some((fact) => fact.certainty === 'opinion')) {
    claims.push('Do not present analysis or opinion as a completed fact.');
  }
  if (facts.some((fact) => fact.polarity === 'negative')) {
    claims.push('Do not remove or reverse source negation.');
  }
  return claims;
}

function factSupportsAnchor(fact, anchor) {
  if (anchor.type === 'entity') {
    return (fact.entities || []).some((entry) => (
      `${entry.type}:${entry.canonicalId}` === anchor.value
    ));
  }
  if (anchor.type === 'number') {
    return (fact.numbers || []).some((entry) => (
      `${entry.type}:${entry.value}` === anchor.value
    ));
  }
  if (anchor.type === 'attribution') {
    return unique([
      fact.attribution,
      ...(fact.attributions || [])
    ]).some((value) => sameNormalized(value, anchor.value));
  }
  if (anchor.type === 'modality') {
    return (
      (fact.modalityTerms || []).includes(anchor.value) ||
      certaintySupportsModality(fact.certainty, anchor.value)
    );
  }
  if (anchor.type === 'negation') return fact.polarity === 'negative';
  if (anchor.type === 'core-relation') {
    return (fact.relations || []).includes(anchor.value);
  }
  return false;
}

function certaintySupportsModality(certainty, modality) {
  return {
    'not-expected': ['expected'],
    'has-not-decided': ['possible'],
    'yet-to-decide': ['possible'],
    'no-indication': ['possible'],
    expected: ['expected'],
    likely: ['likely'],
    possible: ['possible'],
    interest: ['interest'],
    'reported-source': ['reported', 'opinion', 'interest', 'possible', 'expected', 'likely'],
    opinion: ['opinion']
  }[modality]?.includes(certainty) || false;
}

function normalizeInventory(inventory) {
  return Array.isArray(inventory) ? inventory : [];
}

function isSelectionObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!Array.isArray(value.selectedEvidenceIds)) return false;
  if (typeof value.primaryEvidenceId !== 'string') return false;
  if (!Array.isArray(value.supportingEvidenceIds)) return false;
  return [
    ...value.selectedEvidenceIds,
    value.primaryEvidenceId,
    ...value.supportingEvidenceIds
  ].every((entry) => typeof entry === 'string');
}

function normalizeStoryType(value) {
  const storyType = String(value || '').toLowerCase();
  if (storyType === 'opinion') return 'analysis';
  if (storyType === 'rumor' || storyType === 'trade') return 'trade_rumor';
  if (['trade_rumor', 'signing', 'interview', 'injury', 'game', 'analysis'].includes(storyType)) {
    return storyType;
  }
  return 'other';
}

function sourcePrefix(sourceField) {
  return {
    title: 'title',
    rssSummary: 'summary',
    articleText: 'article'
  }[sourceField];
}

function entityKey(entry) {
  return `${entry.type}:${entry.value}`;
}

function containsNormalized(text, phrase) {
  return normalizeEvidenceText(text).includes(normalizeEvidenceText(phrase));
}

function sameNormalized(left, right) {
  const leftValue = normalizeEvidenceText(left);
  const rightValue = normalizeEvidenceText(right);
  return Boolean(leftValue && rightValue && leftValue === rightValue);
}

function dedupeAnchors(anchors) {
  const seen = new Set();
  return anchors.filter((anchor) => {
    const key = `${anchor.type}:${normalizeEvidenceText(anchor.value)}:${anchor.evidenceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unique(values) {
  return [...new Set(values)];
}

function uniqueObjects(values, keyFn) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyFn(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
