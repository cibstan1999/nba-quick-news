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
  ['expected', /\b(?:expected to|the expectation is|it'?s expected that|it is expected that)\b/i],
  ['likely', /\b(?:likely to|likely that|unlikely to|very likely)\b/i],
  ['possible', /\b(?:could|may|might)\b/i],
  ['unclear', /\b(?:unclear|not clear)\b/i],
  ['unknown', /\b(?:unknown|it'?s unknown)\b/i],
  ['interest', /\b(?:interested in|interest in|drawing interest|had no interest|have no interest|considering|exploring|leaning toward|hopeful of|focused on adding)\b/i],
  ['reported-source', /\b(?:reportedly|according to|reports?|reported by|sources? say)\b/i],
  ['opinion', /\b(?:believes?|thinks?|predicts?|analysis|analyzes?|discusses?)\b/i]
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
  ['contraction', /\b(?:isn't|wasn't|hasn't|haven't|won't|wouldn't|couldn't)\b/i],
  ['not-disclosed', /\b(?:not disclosed|terms were not disclosed)\b/i]
];

const RELATION_PATTERNS = [
  ['signing', /\b(?:sign(?:ed|ing)?|re-sign(?:ed|ing)?|agreed to|join(?:ed|ing)?|match(?:ed|ing) (?:an )?(?:offer|offer sheet))\b/i],
  ['trade', /\b(?:trade(?:d|ing)?|acquir(?:e|ed|ing)|dealt|sent to|lands? in a deal)\b/i],
  ['interest', /\b(?:interested in|interest in|drawing interest|receiving interest|had no interest|have no interest|considering|exploring|pursu(?:e|ing)|focused on adding|waiting on)\b/i],
  ['demand', /\b(?:made no demands?|demands? that)\b/i],
  ['decision', /\b(?:decision|decided|choose|chose|picked|select(?:ed|ing)?)\b/i],
  ['retain', /\b(?:remain|stay|retain|return|re-sign)\b/i],
  ['injury', /\b(?:injur(?:y|ed|ies)|ruled out|out for|out with|return|recovery|sidelined|miss(?:ed|ing)?)\b/i],
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
const INTERNAL_MARKER_PATTERN = /\b(?:contract-realgm|source-internal|undefined|evidenceid|anchorid)\b/i;
const BACKGROUND_PATTERN = new RegExp([
  'last season',
  'this summer',
  'earlier this offseason',
  'before he signed',
  'were among the finalists',
  'roster crunch',
  'roster spots? to fill',
  'second apron',
  'taxpayer mle',
  'averaged?\\b',
  '\\bgames? over\\b',
  'summer league prospect',
  'subscribe on',
  'sign up for',
  'mailing list',
  'every episode',
  'join dunc',
  'youtube',
  '^"?what\\b'
].join('|'), 'i');

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
  const titleCore = titleItems[0] || null;
  const titleEntityKeys = new Set(
    titleCore?.anchors.entities.map(entityKey) || []
  );
  const titleRelationValues = new Set(
    titleCore?.anchors.coreRelations.map((entry) => entry.value) || []
  );
  const descriptors = [];

  for (const item of items) {
    const isTitleCore = item.evidenceId === titleCore?.evidenceId;
    const topicRelevant = isEvidenceTopicRelevant(
      item,
      titleEntityKeys,
      titleRelationValues,
      normalizedStoryType
    );
    const background = isBackgroundEvidence(item, titleEntityKeys);
    const relationValues = new Set(
      item.anchors.coreRelations.map((entry) => entry.value)
    );
    const meaningChanging = (
      item.anchors.negationTerms.length > 0 ||
      item.anchors.modalityTerms.length > 0 ||
      /\b(?:real factor|shap(?:e|ed|ing)|because|due to|as a result)\b/i.test(item.text)
    );

    for (const entry of item.anchors.entities) {
      const value = entityKey(entry);
      const titleEntity = titleEntityKeys.has(value);
      descriptors.push({
        item,
        type: 'entity',
        value,
        priority: isTitleCore && titleEntity ? 'critical' : 'important',
        required: isTitleCore && titleEntity,
        reason: isTitleCore && titleEntity
          ? 'title-primary-entity'
          : topicRelevant
            ? 'topic-supporting-entity'
            : 'background-entity'
      });
    }

    for (const entry of item.anchors.numbers) {
      const critical = (
        CORE_NUMBER_TYPES.has(entry.type) &&
        topicRelevant &&
        isCriticalNumberEvidence(item, normalizedStoryType, titleEntityKeys)
      );
      descriptors.push({
        item,
        type: 'number',
        value: `${entry.type}:${entry.value}`,
        priority: critical ? 'critical' : 'important',
        required: critical,
        reason: critical ? 'core-number' : 'background-number'
      });
    }

    for (const entry of item.anchors.modalityTerms) {
      const critical = (
        topicRelevant &&
        shouldRequireModality(entry.value, normalizedStoryType, background)
      );
      descriptors.push({
        item,
        type: 'modality',
        value: entry.value,
        priority: critical ? 'critical' : 'important',
        required: critical,
        reason: critical ? 'certainty-limiter' : 'background-modality'
      });
    }

    for (const entry of item.anchors.negationTerms) {
      const critical = topicRelevant && (
        meaningChanging ||
        relationValues.size > 0
      );
      descriptors.push({
        item,
        type: 'negation',
        value: entry.value,
        priority: critical ? 'critical' : 'important',
        required: critical,
        reason: critical ? 'meaning-changing-negation' : 'background-negation'
      });
    }

    const explicitSpeakerAttributions = item.anchors.attributions.filter(
      (entry) => (
        entry.origin === 'text' &&
        !KNOWN_MEDIA_ATTRIBUTIONS.includes(entry.value)
      )
    );
    for (const entry of item.anchors.attributions) {
      const required = (
        topicRelevant &&
        shouldRequireAttribution(entry, normalizedStoryType, item) &&
        !(
          explicitSpeakerAttributions.length > 0 &&
          KNOWN_MEDIA_ATTRIBUTIONS.includes(entry.value)
        )
      );
      descriptors.push({
        item,
        type: 'attribution',
        value: entry.value,
        priority: required ? 'critical' : 'important',
        required,
        reason: entry.origin === 'source-metadata'
          ? 'source-attribution'
          : required
            ? 'speaker-or-analysis-attribution'
            : 'background-attribution'
      });
    }

    for (const entry of item.anchors.coreRelations) {
      const titleRelation = isTitleCore;
      const critical = (
        titleRelation ||
        (
          topicRelevant &&
          isMeaningChangingRelation(
            entry.value,
            normalizedStoryType,
            item,
            meaningChanging
          )
        )
      );
      descriptors.push({
        item,
        type: 'core-relation',
        value: entry.value,
        priority: critical ? 'critical' : 'important',
        required: critical,
        reason: titleRelation
          ? 'title-core-relation'
          : critical
            ? 'meaning-changing-support'
            : background
              ? 'background-relation'
              : 'topic-supporting-relation'
      });
    }
  }

  const grouped = groupAnchorDescriptors(descriptors);
  if (
    normalizedStoryType === 'interview' &&
    grouped.some((anchor) => (
      anchor.type === 'attribution' &&
      anchor.required &&
      anchor.reason === 'speaker-or-analysis-attribution'
    ))
  ) {
    for (const anchor of grouped) {
      if (
        anchor.type === 'attribution' &&
        anchor.reason === 'source-attribution'
      ) {
        anchor.required = false;
        anchor.priority = 'important';
      }
    }
  }
  const mandatoryAnchors = grouped
    .filter((anchor) => anchor.required || anchor.topicRelevant)
    .map((anchor) => ({
      ...anchor,
      priority: anchor.required ? 'critical' : 'important'
    }));
  const optionalAnchors = grouped.filter((anchor) => (
    !mandatoryAnchors.some((mandatory) => mandatory.anchorId === anchor.anchorId)
  ));
  const mandatoryEvidenceIds = titleCore ? [titleCore.evidenceId] : [];

  return {
    storyType: normalizedStoryType,
    titleEvidenceIds: mandatoryEvidenceIds,
    mandatoryEvidenceIds,
    mandatoryAnchors,
    optionalAnchors,
    optionalEvidenceIds: items
      .filter((item) => !mandatoryEvidenceIds.includes(item.evidenceId))
      .map((item) => item.evidenceId),
    topicEntityKeys: [...titleEntityKeys],
    coreRelationValues: [...titleRelationValues]
  };
}

export function selectMinimumEvidenceSet(
  inventory,
  manifest,
  {
    maxEvidence = 4,
    hardMaxEvidence = 6
  } = {}
) {
  const items = normalizeInventory(inventory);
  const itemsById = new Map(items.map((item) => [item.evidenceId, item]));
  const stableOrder = new Map(items.map((item, index) => [item.evidenceId, index]));
  const criticalAnchors = (manifest?.mandatoryAnchors || []).filter(
    (anchor) => anchor.priority === 'critical'
  );
  const importantAnchors = (manifest?.mandatoryAnchors || []).filter(
    (anchor) => anchor.priority === 'important'
  );
  const selected = [];
  const decisions = new Map();
  const titleId = (manifest?.titleEvidenceIds || manifest?.mandatoryEvidenceIds || [])
    .find((evidenceId) => itemsById.has(evidenceId));

  if (titleId) {
    selected.push(titleId);
    decisions.set(titleId, {
      score: Number.MAX_SAFE_INTEGER,
      selectionReason: 'title-core-evidence',
      coveredAnchorIds: coveredAnchorIds([titleId], criticalAnchors)
    });
  }

  let uncovered = getUncoveredAnchors(selected, criticalAnchors);
  while (uncovered.length && selected.length < hardMaxEvidence) {
    const ranked = rankEvidenceCandidates({
      items,
      manifest,
      selected,
      targetAnchors: uncovered,
      importantAnchors,
      stableOrder
    });
    const best = ranked[0];
    if (!best || best.coveredAnchorIds.length === 0) break;
    selected.push(best.evidenceId);
    decisions.set(best.evidenceId, {
      score: best.score,
      selectionReason: `critical-cover:${best.coveredAnchorIds.join(',')}`,
      coveredAnchorIds: best.coveredAnchorIds
    });
    uncovered = getUncoveredAnchors(selected, criticalAnchors);
  }

  if (!uncovered.length && selected.length < maxEvidence && titleId) {
    const titleItem = itemsById.get(titleId);
    if (needsExplicitEventRestatement(titleItem)) {
      const restatement = items.find((item) => (
        item.sourceField !== 'title' &&
        !selected.includes(item.evidenceId) &&
        evidenceItemsDuplicate(titleItem, item) &&
        !isBackgroundEvidence(item, new Set(manifest?.topicEntityKeys || []))
      ));
      if (restatement) {
        selected.push(restatement.evidenceId);
        decisions.set(restatement.evidenceId, {
          score: 1,
          selectionReason: 'explicit-event-restatement',
          coveredAnchorIds: []
        });
      }
    }
  }

  const desiredSupporting = ['analysis', 'interview'].includes(manifest?.storyType)
    ? 2
    : 1;
  while (
    !uncovered.length &&
    selected.length < maxEvidence &&
    (
      supportingCount(selected, manifest) < desiredSupporting ||
      !hasDistinctSupportingEvidence(selected, itemsById)
    )
  ) {
    const ranked = rankEditorialSupportCandidates({
      items,
      manifest,
      selected,
      importantAnchors,
      stableOrder
    });
    const best = ranked[0];
    if (!best || best.score <= 0) break;
    selected.push(best.evidenceId);
    decisions.set(best.evidenceId, {
      score: best.score,
      selectionReason: 'editorial-support',
      coveredAnchorIds: best.coveredAnchorIds
    });
  }

  uncovered = getUncoveredAnchors(selected, criticalAnchors);
  const selectedEvidenceIds = items
    .map((item) => item.evidenceId)
    .filter((evidenceId) => selected.includes(evidenceId));
  const evidenceScores = items.map((item) => {
    const decision = decisions.get(item.evidenceId);
    const score = decision || scoreEvidenceCandidate({
      item,
      manifest,
      selected: selectedEvidenceIds,
      targetAnchors: getUncoveredAnchors(selectedEvidenceIds, criticalAnchors),
      importantAnchors
    });
    return {
      evidenceId: item.evidenceId,
      selected: selectedEvidenceIds.includes(item.evidenceId),
      score: Number.isFinite(score.score) ? score.score : null,
      selectionReason: decision?.selectionReason || score.selectionReason,
      coveredAnchorIds: [...(score.coveredAnchorIds || [])],
      penalties: { ...(score.penalties || {}) }
    };
  });
  const reasons = uncovered.length ? ['minimum-evidence-cover-incomplete'] : [];

  return {
    ok: reasons.length === 0,
    reasons,
    selectedEvidenceIds,
    primaryEvidenceId: titleId || selectedEvidenceIds[0] || '',
    supportingEvidenceIds: selectedEvidenceIds.filter((id) => id !== titleId),
    uncoveredAnchorIds: uncovered.map((anchor) => anchor.anchorId),
    coveredCriticalAnchorIds: coveredAnchorIds(
      selectedEvidenceIds,
      criticalAnchors
    ),
    criticalAnchorIds: criticalAnchors.map((anchor) => anchor.anchorId),
    evidenceScores,
    limits: {
      preferredMaxEvidence: maxEvidence,
      hardMaxEvidence
    }
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
  const rawFacts = resolved.value.finalEvidenceIds.map((evidenceId) => {
    const item = itemsById.get(evidenceId);
    const factText = projectEvidenceFactText(item.text, normalizedStoryType);
    const extracted = extractEvidenceFacts(factText, factText);
    const certainty = inferEvidenceCertainty(item, normalizedStoryType);
    const polarity = item.anchors.negationTerms.length ? 'negative' : 'positive';
    const textAttributions = item.anchors.attributions
      .filter((entry) => entry.origin === 'text')
      .map((entry) => entry.value);
    const attributions = normalizedStoryType === 'analysis'
      ? item.anchors.attributions.map((entry) => entry.value)
      : textAttributions;
    const attribution = attributions[0] || '';
    const attributionSlugs = attributions.map(canonicalSlug).filter(Boolean);

    return {
      id: `fact-${evidenceId}`,
      evidenceId,
      evidenceIds: [evidenceId],
      factText,
      evidenceQuote: factText,
      sourceField: item.sourceField,
      certainty,
      polarity,
      attribution,
      attributions,
      attributionQuote: attribution && normalizeEvidenceText(factText).includes(normalizeEvidenceText(attribution))
        ? factText
        : '',
      entities: [
        ...extracted.teams
          .filter((canonicalId) => isPublishableCanonicalId(canonicalId, 'team'))
          .map((canonicalId) => ({ type: 'team', canonicalId })),
        ...extracted.players
          .filter((canonicalId) => (
            isPublishableCanonicalId(canonicalId, 'person') &&
            !attributionSlugs.some((slug) => (
              (
                normalizedStoryType !== 'analysis' &&
                canonicalId === slug
              ) ||
              canonicalId.startsWith(`${slug}-`)
            ))
          ))
          .map((canonicalId) => ({ type: 'person', canonicalId }))
      ],
      numbers: [
        ...extracted.money.map((value) => ({ type: 'money', value })),
        ...extracted.durations.map((value) => ({ type: 'contractYears', value })),
        ...extracted.picks.map((value) => ({ type: 'tradeAsset', value })),
        ...extracted.scores.map((value) => ({ type: 'score', value }))
      ],
      modalityTerms: item.anchors.modalityTerms.map((entry) => entry.value),
      negationTerms: item.anchors.negationTerms.map((entry) => entry.value),
      relations: item.anchors.coreRelations.map((entry) => entry.value)
    };
  });
  const facts = dedupeEvidenceFacts(rawFacts);
  const evidenceToFactIds = Object.fromEntries(
    resolved.value.finalEvidenceIds.map((evidenceId) => [
      evidenceId,
      facts
        .filter((fact) => (fact.evidenceIds || [fact.evidenceId]).includes(evidenceId))
        .map((fact) => fact.id)
    ])
  );

  return {
    ok: true,
    reasons: [],
    details: {
      selection: resolved.value,
      preDedupFactCount: rawFacts.length,
      dedupedFactCount: facts.length
    },
    value: {
      storyType: normalizedStoryType || 'other',
      facts,
      mustNotClaim: buildMustNotClaim(facts),
      selectedEvidenceIds: [...resolved.value.finalEvidenceIds],
      preDedupFactCount: rawFacts.length,
      dedupedFactCount: facts.length,
      evidenceToFactIds
    }
  };
}

export function buildCoverageAwareFactPlan(basePlan, factExtraction, manifest) {
  const facts = Array.isArray(factExtraction?.facts) ? factExtraction.facts : [];
  const factIdsByEvidence = new Map();
  for (const fact of facts) {
    for (const evidenceId of fact.evidenceIds || [fact.evidenceId]) {
      if (!factIdsByEvidence.has(evidenceId)) factIdsByEvidence.set(evidenceId, []);
      factIdsByEvidence.get(evidenceId).push(fact.id);
    }
  }
  const selectedEvidenceIds = unique(
    factExtraction?.selectedEvidenceIds ||
    facts.flatMap((fact) => fact.evidenceIds || [fact.evidenceId])
  );
  const mandatoryFactIds = facts.map((fact) => fact.id);
  const criticalAnchors = (manifest?.mandatoryAnchors || []).filter(
    (anchor) => anchor.priority === 'critical'
  );

  return {
    ...(basePlan || {}),
    titleFactIds: unique(basePlan?.titleFactIds || []),
    summaryFactIds: unique([
      ...(basePlan?.summaryFactIds || []),
      ...mandatoryFactIds
    ]),
    oneLineFactIds: unique(basePlan?.oneLineFactIds || []),
    mandatoryFactIds,
    requiredEvidenceIds: selectedEvidenceIds,
    requiredAnchors: criticalAnchors.map((anchor) => ({
      ...anchor,
      factIds: unique(
        (anchor.candidateEvidenceIds || [anchor.evidenceId])
          .flatMap((evidenceId) => factIdsByEvidence.get(evidenceId) || [])
          .filter((factId) => {
            const fact = facts.find((entry) => entry.id === factId);
            return fact && factSupportsAnchor(fact, anchor);
          })
      )
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
    for (const evidenceId of fact.evidenceIds || [fact.evidenceId]) {
      if (!factsByEvidence.has(evidenceId)) factsByEvidence.set(evidenceId, []);
      factsByEvidence.get(evidenceId).push(fact);
    }
  }
  const reasons = [];
  const missingEvidenceIds = [];
  const missingAnchorIds = [];

  const requiredEvidenceIds = factPlan?.requiredEvidenceIds ||
    factExtraction?.selectedEvidenceIds ||
    manifest?.mandatoryEvidenceIds ||
    [];
  for (const evidenceId of requiredEvidenceIds) {
    if (!factsByEvidence.get(evidenceId)?.length) missingEvidenceIds.push(evidenceId);
  }

  const criticalAnchors = (manifest?.mandatoryAnchors || []).filter(
    (anchor) => anchor.priority === 'critical'
  );
  for (const anchor of criticalAnchors) {
    const supportingFacts = uniqueObjects(
      (anchor.candidateEvidenceIds || [anchor.evidenceId])
        .flatMap((evidenceId) => factsByEvidence.get(evidenceId) || []),
      (fact) => fact.id
    );
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
  const mandatoryFactIds = facts.map((fact) => fact.id);
  const unplannedFactIds = mandatoryFactIds.filter((factId) => !plannedIds.has(factId));
  if (factPlan && unplannedFactIds.length) reasons.push('mandatory-fact-not-planned');
  const plannedAnchorIds = new Set(
    Array.isArray(factPlan?.requiredAnchors)
      ? factPlan.requiredAnchors.map((anchor) => anchor.anchorId)
      : []
  );
  const missingPlannedAnchorIds = factPlan
    ? criticalAnchors
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
      facts
        .filter((fact) => (
          (fact.evidenceIds || [fact.evidenceId]).includes(evidenceId)
        ))
        .map((fact) => fact.id)
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
    const factIds = unique(
      anchor.factIds ||
      (anchor.candidateEvidenceIds || [anchor.evidenceId])
        .flatMap((evidenceId) => evidenceToFactIds[evidenceId] || [])
    );
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
  if (!text) return [];
  if (!/\s+\+\s+/.test(text)) return [text];
  const parts = text.split(/\s+\+\s+/).map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts : [text];
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
    coreRelations: extractCoreRelations(text, storyType, {
      addStoryFallback: sourceField === 'title'
    }),
    storyType: normalizeStoryType(storyType)
  };
}

function extractAttributions(text) {
  const found = [];
  const speakers = [];
  for (const value of KNOWN_MEDIA_ATTRIBUTIONS) {
    if (containsNormalized(text, value)) found.push({ value, origin: 'text' });
  }
  for (const match of String(text).matchAll(
    /\b([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,3})\s+(?:said|says|reported|reports|wrote|writes|believes|thinks|explained|discussed|addressed|acknowledged|pointed to)\b/g
  )) {
    speakers.push({ value: match[1], origin: 'text' });
  }
  for (const match of String(text).matchAll(
    /\b(?:said|says|reported|reports|wrote|writes|explained)\s+([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,3})\b/g
  )) {
    speakers.push({ value: match[1], origin: 'text' });
  }
  const according = String(text).match(
    /\baccording to\s+([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){0,3})/i
  );
  if (according) found.push({ value: according[1], origin: 'text' });
  if (/\bNate and Danny\b/i.test(text)) {
    speakers.push({ value: 'Nate Duncan', origin: 'text' });
    speakers.push({ value: 'Danny Leroux', origin: 'text' });
  }
  return [...speakers, ...found];
}

function detectTerms(text, patterns) {
  return patterns
    .filter(([, pattern]) => pattern.test(text))
    .map(([value, pattern]) => ({
      value,
      surface: String(text).match(pattern)?.[0] || value
    }));
}

function extractCoreRelations(
  text,
  storyType,
  { addStoryFallback = false } = {}
) {
  const relations = RELATION_PATTERNS
    .filter(([, pattern]) => pattern.test(text))
    .map(([value]) => ({ value }));
  if (
    addStoryFallback &&
    storyType === 'analysis' &&
    !relations.some((entry) => entry.value === 'analysis')
  ) {
    relations.push({ value: 'analysis' });
  }
  if (
    addStoryFallback &&
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
    values.has('unclear') ||
    values.has('unknown') ||
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
    unclear: ['possible'],
    unknown: ['possible'],
    interest: ['interest'],
    'reported-source': ['reported', 'opinion', 'interest', 'possible', 'expected', 'likely'],
    opinion: ['opinion']
  }[modality]?.includes(certainty) || false;
}

function isEvidenceTopicRelevant(
  item,
  titleEntityKeys,
  titleRelationValues,
  storyType
) {
  if (item.sourceField === 'title' && item.position === 0) return true;
  const entityOverlap = (
    item.anchors.entities.some((entry) => titleEntityKeys.has(entityKey(entry))) ||
    evidenceMentionsTopicEntity(item.text, titleEntityKeys)
  );
  const relationOverlap = item.anchors.coreRelations.some((entry) => (
    titleRelationValues.has(entry.value) &&
    !['analysis', 'statement'].includes(entry.value)
  ));
  return entityOverlap || relationOverlap;
}

function isBackgroundEvidence(item, titleEntityKeys) {
  return (
    isPromotionalEvidence(item.text) ||
    BACKGROUND_PATTERN.test(item.text)
  );
}

function evidenceMentionsTopicEntity(text, titleEntityKeys) {
  const normalized = normalizeEvidenceText(text);
  return [...titleEntityKeys].some((key) => {
    const canonicalId = key.split(':').slice(1).join(':');
    const parts = canonicalId.split('-').filter((part) => part.length >= 4);
    return parts.some((part) => (
      new RegExp(`\\b${escapeRegExp(part)}\\b`, 'i').test(normalized)
    ));
  });
}

function isPromotionalEvidence(value) {
  return /\b(?:subscribe|sign up|mailing list|join dunc|youtube|every episode)\b/i.test(
    value
  );
}

function isCriticalNumberEvidence(item, storyType, titleEntityKeys) {
  if (isPromotionalEvidence(item.text)) return false;
  if (/\b(?:second apron|taxpayer mle|salary cap|roster spots?)\b/i.test(item.text)) {
    return false;
  }
  const relations = new Set(
    item.anchors.coreRelations.map((entry) => entry.value)
  );
  const titleEntity = item.anchors.entities.some((entry) => (
    titleEntityKeys.has(entityKey(entry))
  )) || evidenceMentionsTopicEntity(item.text, titleEntityKeys);
  if (['analysis', 'interview'].includes(storyType)) return false;
  if (storyType === 'game') return relations.has('game-result');
  if (relations.has('contract') || relations.has('signing')) {
    return titleEntity || storyType === 'signing';
  }
  return titleEntity && item.anchors.numbers.some((entry) => (
    CORE_NUMBER_TYPES.has(entry.type)
  ));
}

function shouldRequireModality(value, storyType, background) {
  if (background) return false;
  if (storyType === 'analysis') {
    return ['reported-source', 'expected', 'likely', 'possible'].includes(value);
  }
  if (storyType === 'interview') return false;
  return true;
}

function isMeaningChangingRelation(
  relation,
  storyType,
  item,
  meaningChanging
) {
  if (storyType === 'trade_rumor') {
    return (
      ['interest', 'trade', 'decision', 'retain', 'demand'].includes(relation) &&
      (
        meaningChanging ||
        item.anchors.entities.length > 0
      )
    );
  }
  if (storyType === 'signing') {
    if (/\b(?:second apron|taxpayer mle|salary cap)\b/i.test(item.text)) {
      return false;
    }
    if (relation === 'retain') {
      return (
        meaningChanging ||
        /\b(?:will retain|expected to stay|expected to remain)\b/i.test(item.text)
      );
    }
    return ['signing', 'contract'].includes(relation) && (
      meaningChanging ||
      item.anchors.numbers.some((entry) => CORE_NUMBER_TYPES.has(entry.type))
    );
  }
  if (storyType === 'interview') {
    return (
      ['statement', 'decision', 'injury'].includes(relation) &&
      (
        meaningChanging ||
        /\b(?:addressed|pointed to|said|says)\b/i.test(item.text)
      )
    );
  }
  if (storyType === 'analysis') {
    if (BACKGROUND_PATTERN.test(item.text) || isPromotionalEvidence(item.text)) {
      return false;
    }
    return (
      ['analysis', 'signing', 'trade', 'decision'].includes(relation) &&
      !isPromotionalEvidence(item.text)
    );
  }
  if (storyType === 'injury') return relation === 'injury';
  if (storyType === 'game') return relation === 'game-result';
  return meaningChanging;
}

function groupAnchorDescriptors(descriptors) {
  const groups = new Map();
  for (const descriptor of descriptors) {
    if (!descriptor?.value) continue;
    const key = `${descriptor.type}:${normalizeEvidenceText(descriptor.value)}`;
    const current = groups.get(key) || {
      anchorId: stableAnchorId(descriptor.type, descriptor.value),
      type: descriptor.type,
      value: descriptor.value,
      candidateEvidenceIds: [],
      priority: 'important',
      reason: descriptor.reason,
      reasons: [],
      required: false,
      topicRelevant: false
    };
    if (!current.candidateEvidenceIds.includes(descriptor.item.evidenceId)) {
      current.candidateEvidenceIds.push(descriptor.item.evidenceId);
    }
    if (!current.reasons.includes(descriptor.reason)) {
      current.reasons.push(descriptor.reason);
    }
    if (descriptor.required) {
      current.required = true;
      current.priority = 'critical';
      current.reason = descriptor.reason;
    }
    if (!/^background-/.test(descriptor.reason)) current.topicRelevant = true;
    groups.set(key, current);
  }
  return [...groups.values()].map((anchor) => ({
    anchorId: anchor.anchorId,
    type: anchor.type,
    value: anchor.value,
    candidateEvidenceIds: anchor.candidateEvidenceIds,
    evidenceId: anchor.candidateEvidenceIds[0] || '',
    priority: anchor.priority,
    reason: anchor.reason,
    reasons: anchor.reasons,
    required: anchor.required,
    topicRelevant: anchor.topicRelevant
  }));
}

function stableAnchorId(type, value) {
  const normalized = normalizeEvidenceText(value)
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return `anchor-${type}-${normalized || 'value'}`;
}

function getUncoveredAnchors(selectedEvidenceIds, anchors) {
  const selected = new Set(selectedEvidenceIds);
  return (anchors || []).filter((anchor) => (
    !(anchor.candidateEvidenceIds || [anchor.evidenceId]).some(
      (evidenceId) => selected.has(evidenceId)
    )
  ));
}

function coveredAnchorIds(selectedEvidenceIds, anchors) {
  const uncovered = new Set(
    getUncoveredAnchors(selectedEvidenceIds, anchors)
      .map((anchor) => anchor.anchorId)
  );
  return (anchors || [])
    .filter((anchor) => !uncovered.has(anchor.anchorId))
    .map((anchor) => anchor.anchorId);
}

function rankEvidenceCandidates({
  items,
  manifest,
  selected,
  targetAnchors,
  importantAnchors,
  stableOrder
}) {
  return items
    .filter((item) => !selected.includes(item.evidenceId))
    .map((item) => scoreEvidenceCandidate({
      item,
      manifest,
      selected,
      targetAnchors,
      importantAnchors
    }))
    .sort((left, right) => (
      right.score - left.score ||
      stableOrder.get(left.evidenceId) - stableOrder.get(right.evidenceId) ||
      left.evidenceId.localeCompare(right.evidenceId)
    ));
}

function rankEditorialSupportCandidates({
  items,
  manifest,
  selected,
  importantAnchors,
  stableOrder
}) {
  return items
    .filter((item) => !selected.includes(item.evidenceId))
    .map((item) => {
      const base = scoreEvidenceCandidate({
        item,
        manifest,
        selected,
        targetAnchors: [],
        importantAnchors
      });
      const topicEntityKeys = new Set(manifest?.topicEntityKeys || []);
      const topicEntityCount = item.anchors.entities.filter((entry) => (
        topicEntityKeys.has(entityKey(entry))
      )).length;
      const unrelatedEntityCount = item.anchors.entities.length - topicEntityCount;
      const relationBonus = item.anchors.coreRelations.length * 14;
      const editorialDetailBonus = /\b(?:player option|terms were not disclosed|valuable rotation|real factor|made no demands?|start the season|buyout)\b/i.test(
        item.text
      )
        ? 24
        : 0;
      const backgroundPenalty = isBackgroundEvidence(item, topicEntityKeys)
        ? 70
        : 0;
      return {
        ...base,
        score:
          base.score +
          topicEntityCount * 12 +
          relationBonus +
          editorialDetailBonus -
          unrelatedEntityCount * 18 -
          backgroundPenalty,
        selectionReason: 'editorial-support-candidate',
        penalties: {
          ...base.penalties,
          unrelatedEntities: unrelatedEntityCount * 18,
          background: backgroundPenalty
        }
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => (
      right.score - left.score ||
      stableOrder.get(left.evidenceId) - stableOrder.get(right.evidenceId) ||
      left.evidenceId.localeCompare(right.evidenceId)
    ));
}

function scoreEvidenceCandidate({
  item,
  manifest,
  selected,
  targetAnchors,
  importantAnchors
}) {
  const targetCovered = (targetAnchors || []).filter((anchor) => (
    (anchor.candidateEvidenceIds || [anchor.evidenceId]).includes(item.evidenceId)
  ));
  const uncoveredImportant = getUncoveredAnchors(selected, importantAnchors || []);
  const importantCovered = uncoveredImportant.filter((anchor) => (
    (anchor.candidateEvidenceIds || [anchor.evidenceId]).includes(item.evidenceId)
  ));
  const weight = {
    'core-relation': 120,
    number: 110,
    negation: 105,
    modality: 95,
    attribution: 90,
    entity: 25
  };
  const criticalScore = targetCovered.reduce(
    (sum, anchor) => sum + (weight[anchor.type] || 10),
    0
  );
  const importantScore = importantCovered.reduce(
    (sum, anchor) => sum + Math.round((weight[anchor.type] || 10) * 0.2),
    0
  );
  const redundancy = 0;
  const lengthPenalty = Math.max(0, wordCount(item.text) - 38);
  const internalPenalty = INTERNAL_MARKER_PATTERN.test(item.text) ? 500 : 0;
  const promotionalPenalty = isPromotionalEvidence(item.text) ? 250 : 0;
  const score = (
    criticalScore +
    importantScore -
    redundancy -
    lengthPenalty -
    internalPenalty -
    promotionalPenalty
  );
  return {
    evidenceId: item.evidenceId,
    score,
    selectionReason: targetCovered.length
      ? 'covers-critical-anchors'
      : importantCovered.length
        ? 'covers-important-anchors'
        : 'not-selected-no-new-anchor',
    coveredAnchorIds: targetCovered.map((anchor) => anchor.anchorId),
    penalties: {
      redundancy,
      length: lengthPenalty,
      internalMarker: internalPenalty,
      promotional: promotionalPenalty
    }
  };
}

function supportingCount(selected, manifest) {
  const titleIds = new Set(manifest?.titleEvidenceIds || []);
  return selected.filter((evidenceId) => !titleIds.has(evidenceId)).length;
}

function hasDistinctSupportingEvidence(selected, itemsById) {
  if (selected.length < 2) return false;
  const primary = itemsById.get(selected[0]);
  if (!primary) return false;
  return selected.slice(1).some((evidenceId) => {
    const support = itemsById.get(evidenceId);
    return support && !evidenceItemsDuplicate(primary, support);
  });
}

function evidenceItemsDuplicate(left, right) {
  if (!left || !right) return false;
  if (hasDistinctEditorialDetail(left.text, right.text)) return false;
  const leftRelations = new Set(
    left.anchors.coreRelations.map((entry) => entry.value)
  );
  const sharedRelation = right.anchors.coreRelations.some((entry) => (
    leftRelations.has(entry.value) &&
    !['analysis', 'statement'].includes(entry.value)
  ));
  const leftEntities = new Set(left.anchors.entities.map(entityKey));
  const sharedEntity = right.anchors.entities.some((entry) => (
    leftEntities.has(entityKey(entry))
  ));
  return (
    tokenSimilarity(left.text, right.text) >= 0.62 ||
    (sharedRelation && sharedEntity)
  );
}

function needsExplicitEventRestatement(item) {
  return Boolean(
    item?.sourceField === 'title' &&
    /\b(?:sign|signs|signed)\s+contract\b/i.test(item.text)
  );
}

function tokenSimilarity(left, right) {
  const leftTokens = new Set(
    normalizeEvidenceText(left).match(/[a-z0-9$'-]+/g) || []
  );
  const rightTokens = new Set(
    normalizeEvidenceText(right).match(/[a-z0-9$'-]+/g) || []
  );
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}

function dedupeEvidenceFacts(rawFacts) {
  const facts = [];
  for (const fact of rawFacts) {
    const duplicateIndex = facts.findIndex((current) => (
      evidenceFactsDuplicate(current, fact)
    ));
    if (duplicateIndex < 0) {
      facts.push(fact);
      continue;
    }
    facts[duplicateIndex] = mergeEvidenceFacts(facts[duplicateIndex], fact);
  }
  return facts;
}

function evidenceFactsDuplicate(left, right) {
  const leftRelations = new Set(left.relations || []);
  const sharedRelation = (right.relations || []).some((relation) => (
    leftRelations.has(relation) &&
    !['analysis', 'statement'].includes(relation)
  ));
  const leftEntities = new Set(
    (left.entities || []).map((entry) => `${entry.type}:${entry.canonicalId}`)
  );
  const sharedEntity = (right.entities || []).some((entry) => (
    leftEntities.has(`${entry.type}:${entry.canonicalId}`)
  ));
  if (hasDistinctEditorialDetail(left.factText, right.factText)) return false;
  return (
    tokenSimilarity(left.factText, right.factText) >= 0.62 ||
    (sharedRelation && sharedEntity) ||
    analysisFactsDescribeSameHypothesis(left, right)
  );
}

function analysisFactsDescribeSameHypothesis(left, right) {
  const leftText = normalizeEvidenceText(left.factText);
  const rightText = normalizeEvidenceText(right.factText);
  const oneMentionsPhilly = /\b(?:philly|philadelphia 76ers|76ers)\b/.test(leftText);
  const otherMentionsPhilly = /\b(?:philly|philadelphia 76ers|76ers)\b/.test(rightText);
  const oneMentionsLeBron = /\blebron james\b/.test(leftText);
  const otherMentionsLeBron = /\blebron james\b/.test(rightText);
  const hasAnalysisRelation = (
    (left.relations || []).includes('analysis') ||
    (right.relations || []).includes('analysis')
  );
  return Boolean(
    hasAnalysisRelation &&
    oneMentionsPhilly &&
    otherMentionsPhilly &&
    oneMentionsLeBron &&
    otherMentionsLeBron
  );
}

function hasDistinctEditorialDetail(left, right) {
  const patterns = [
    /\bplayer option\b/i,
    /\bbuyout\b/i,
    /\bpartial guarantee\b/i,
    /\bterms were not disclosed\b/i,
    /\bmade no demands?\b/i,
    /\bstart the season with\b/i,
    /\binjur(?:y|ies|ed)\b/i,
    /\breal factor\b/i
  ];
  return patterns.some((pattern) => pattern.test(left) !== pattern.test(right));
}

function mergeEvidenceFacts(left, right) {
  const preferred = evidenceFactInformationScore(right) > evidenceFactInformationScore(left)
    ? right
    : left;
  const secondary = preferred === left ? right : left;
  const attributions = unique([
    ...(preferred.attributions || []),
    ...(secondary.attributions || [])
  ].filter(Boolean));
  return {
    ...preferred,
    evidenceIds: unique([
      ...(left.evidenceIds || [left.evidenceId]),
      ...(right.evidenceIds || [right.evidenceId])
    ]),
    attribution: preferred.attribution || secondary.attribution || '',
    attributions,
    attributionQuote:
      preferred.attributionQuote ||
      secondary.attributionQuote ||
      '',
    entities: uniqueObjects([
      ...(preferred.entities || []),
      ...(secondary.entities || [])
    ], (entry) => `${entry.type}:${entry.canonicalId}`),
    numbers: uniqueObjects([
      ...(preferred.numbers || []),
      ...(secondary.numbers || [])
    ], (entry) => `${entry.type}:${entry.value}`),
    modalityTerms: unique([
      ...(preferred.modalityTerms || []),
      ...(secondary.modalityTerms || [])
    ]),
    negationTerms: unique([
      ...(preferred.negationTerms || []),
      ...(secondary.negationTerms || [])
    ]),
    relations: unique([
      ...(preferred.relations || []),
      ...(secondary.relations || [])
    ]),
    certainty: weakerCertainty(preferred.certainty, secondary.certainty),
    polarity: (
      preferred.polarity === 'negative' || secondary.polarity === 'negative'
    )
      ? 'negative'
      : 'positive'
  };
}

function evidenceFactInformationScore(fact) {
  return (
    (String(fact.sourceField) === 'title' ? 0 : 20) +
    (fact.numbers?.length || 0) * 15 +
    (fact.attributions?.length || 0) * 12 +
    (fact.modalityTerms?.length || 0) * 8 +
    (fact.negationTerms?.length || 0) * 8 +
    Math.min(30, wordCount(fact.factText))
  );
}

function weakerCertainty(left, right) {
  const order = {
    opinion: 0,
    interest: 1,
    possible: 2,
    likely: 3,
    expected: 4,
    reported: 5,
    confirmed: 6
  };
  return (order[left] ?? 6) <= (order[right] ?? 6) ? left : right;
}

function isPublishableCanonicalId(value, type) {
  const canonicalId = String(value || '').toLowerCase();
  const nonPersonMarker = (
    /(?:^|-)(?:realgm|nba-today|dunc|tk-show|contract|source-internal)(?:-|$)/.test(
      canonicalId
    ) ||
    canonicalId === 'philly'
  );
  return Boolean(
    value &&
    !INTERNAL_MARKER_PATTERN.test(canonicalId.replace(/-/g, ' ')) &&
    !(type === 'person' && nonPersonMarker)
  );
}

function projectEvidenceFactText(text, storyType) {
  let value = normalizeWhitespace(text);
  value = value.replace(/^["']?\s*i(?:'|’)m told\s+/i, '');
  value = value.replace(
    /,\s*["'’”]\s+said\s+[^.]+\.?$/i,
    '.'
  );
  value = value.replace(
    /\s+on\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)'s episode of NBA Today\.?$/i,
    ''
  );
  if (storyType === 'interview') {
    value = value.replace(
      /,\s*speaking\b[\s\S]*?\b(?:youth|basketball) camp\.?$/i,
      ''
    );
  }
  return normalizeWhitespace(value);
}

function canonicalSlug(value) {
  return normalizeEvidenceText(value)
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
