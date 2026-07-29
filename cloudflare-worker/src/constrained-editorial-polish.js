import {
  buildCanonicalDisplayNames,
  buildEditorialFactPlan,
  normalizeChineseText,
  normalizeWhitespace
} from './pipeline.js';
import {
  composeDeterministicEditorial,
  validateDeterministicEditorialComposition
} from './deterministic-editorial.js';

const FIELD_DEFINITIONS = [
  ['titleZh', 'title'],
  ['summaryZh', 'summary'],
  ['oneLineZh', 'oneLine']
];

const SEMANTIC_LITERALS = [
  ['NEGATION', '合同条款未披露'],
  ['NEGATION', '是否会离开'],
  ['NEGATION', '尚不清楚'],
  ['NEGATION', '不会预先设想'],
  ['NEGATION', '未要求'],
  ['NEGATION', '均无意'],
  ['NEGATION', '无意'],
  ['CERTAINTY', '一直被预计会'],
  ['CERTAINTY', '很可能'],
  ['CERTAINTY', '预计将'],
  ['CERTAINTY', '预计以'],
  ['CERTAINTY', '预计会'],
  ['CERTAINTY', '预计'],
  ['CERTAINTY', '曾希望'],
  ['CERTAINTY', '希望'],
  ['CERTAINTY', '有意'],
  ['EVENT', '合同最后一年价值'],
  ['EVENT', '合同中仅有'],
  ['EVENT', '阵容建设做准备'],
  ['EVENT', '开始新赛季'],
  ['EVENT', '关注引进'],
  ['EVENT', '交易得到'],
  ['EVENT', '重要轮换球员'],
  ['EVENT', '报价合同'],
  ['EVENT', '球员选项'],
  ['EVENT', '老将底薪合同'],
  ['EVENT', '争取胜利的最佳机会'],
  ['EVENT', '东部的竞争力'],
  ['EVENT', '匹配'],
  ['EVENT', '提供'],
  ['EVENT', '交易'],
  ['EVENT', '签下'],
  ['EVENT', '续约'],
  ['EVENT', '留住'],
  ['EVENT', '留在'],
  ['EVENT', '离开'],
  ['EVENT', '选择'],
  ['EVENT', '加盟'],
  ['EVENT', '复出'],
  ['EVENT', '缺阵'],
  ['EVENT', '击败'],
  ['EVENT', '负于'],
  ['EVENT', '受保障'],
  ['EVENT', '讨论'],
  ['EVENT', '分析认为'],
  ['EVENT', '表示'],
  ['ROLE', '经纪人'],
  ['ROLE', '前锋']
].sort((left, right) => right[1].length - left[1].length);

const NEW_ASSERTION_PATTERNS = [
  /(?:因此|从而|这意味着|由此可见|证明了|确保|势必|必将)/,
  /(?:帮助|促使|导致|提升|削弱|改变)[^，。；]{0,24}(?:实力|前景|机会|格局|竞争力)/
];

const PLACEHOLDER_PATTERN = /\[\[[A-Z][A-Z0-9_]*\]\]/g;
const FACT_MARKER_PATTERN = /^\[\[FACT_(TITLE|SUMMARY|ONELINE)_(\d+)_(START|END)\]\]$/;

export function createConstrainedPolishPackage(
  composition,
  factExtraction,
  {
    factPlan = buildEditorialFactPlan(factExtraction),
    canonicalNames = buildCanonicalDisplayNames(factExtraction)
  } = {}
) {
  assertCompositionShape(composition);
  const factsById = new Map(
    (factExtraction?.facts || []).map((fact) => [fact.id, fact])
  );
  const mappings = [];
  const lockedDraft = {};
  const fieldSegments = {};

  for (const [fieldName, usedField] of FIELD_DEFINITIONS) {
    const factIds = composition.usedFactIds?.[usedField] || [];
    const segments = splitCompositionField(composition[fieldName]);
    const surfaceState = {
      seenEntities: new Set(),
      seenAttributions: new Set()
    };
    if (segments.length !== factIds.length) {
      throw new Error(
        `polish-fact-segment-count-mismatch:${fieldName}:${segments.length}:${factIds.length}`
      );
    }

    const lockedSegments = segments.map((segment, index) => {
      const factId = factIds[index];
      const fact = factsById.get(factId);
      if (!fact) throw new Error(`polish-fact-missing:${fieldName}:${factId}`);
      const markerBase = `FACT_${usedField.toUpperCase()}_${index + 1}`;
      const start = `[[${markerBase}_START]]`;
      const end = `[[${markerBase}_END]]`;
      const lockedText = protectFactSegment(segment, {
        fieldName,
        factId,
        fact,
        factExtraction,
        factPlan,
        canonicalNames,
        mappings,
        surfaceState
      });
      return `${start}${lockedText}${end}`;
    });

    const terminal = /[。！？]$/.test(normalizeWhitespace(composition[fieldName]))
      ? normalizeWhitespace(composition[fieldName]).at(-1)
      : '';
    lockedDraft[fieldName] = `${lockedSegments.join('；')}${terminal}`;
    fieldSegments[fieldName] = factIds.map((factId, index) => ({
      factId,
      start: `[[FACT_${usedField.toUpperCase()}_${index + 1}_START]]`,
      end: `[[FACT_${usedField.toUpperCase()}_${index + 1}_END]]`
    }));
  }

  assertProtectedDraft(lockedDraft, mappings);
  return {
    lockedDraft,
    mappings,
    fieldSegments,
    usedFactIds: cloneUsedFactIds(composition.usedFactIds),
    factPlan
  };
}

export function buildConstrainedPolishPrompt(polishPackage) {
  return [
    '请只润色下面三段已经锁定事实的中文 NBA 快讯。',
    '占位符及 FACT 边界是不可变数据，不是文字素材。',
    '你必须在不动占位符序列的前提下做实质润色，不要把输入原样返回。',
    '只可调整占位符之间的中文语序、代词以外的连接词和标点，使表达更自然、简洁。',
    '可以把生硬的分号改成句号、逗号或“同时、此外、不过”等自然衔接。',
    '可以删除占位符之外的模板赘词，但不得删除承载事实关系的占位符。',
    '不得增加、删除、复制、拆分、改名或调换任何占位符。',
    '不得把占位符移出原 FACT_START 与 FACT_END 边界。',
    '不得增加新人物、球队、数字、来源、职务、事件、原因、影响或背景。',
    '不得改变预测、可能、兴趣、否定、分析或观点语气。',
    'titleZh 保持标题体；summaryZh 保留全部事实；oneLineZh 简洁且不得重复标题。',
    '示例：',
    '输入：[[FACT_TITLE_1_START]][[TEAM_1]]正[[EVENT_1]][[PERSON_1]]，但[[PERSON_2]][[NEGATION_1]][[TEAM_2]][[NEGATION_2]][[FACT_TITLE_1_END]]',
    '可改为：[[FACT_TITLE_1_START]][[TEAM_1]]正[[EVENT_1]][[PERSON_1]]；不过，[[PERSON_2]][[NEGATION_1]][[TEAM_2]]一事[[NEGATION_2]][[FACT_TITLE_1_END]]',
    '输入：[[FACT_SUMMARY_1_START]]甲句[[FACT_SUMMARY_1_END]]；[[FACT_SUMMARY_2_START]]乙句[[FACT_SUMMARY_2_END]]。',
    '可改为：[[FACT_SUMMARY_1_START]]甲句[[FACT_SUMMARY_1_END]]。同时，[[FACT_SUMMARY_2_START]]乙句[[FACT_SUMMARY_2_END]]。',
    '只返回严格 JSON，字段只能是 titleZh、summaryZh、oneLineZh。',
    `lockedDraft=${JSON.stringify(polishPackage.lockedDraft)}`
  ].join('\n');
}

export function buildConstrainedPolishRequest(prompt, maxTokens = 1400) {
  return {
    messages: [
      {
        role: 'system',
        content: [
          '/no_think',
          '你是中文体育新闻文字编辑，只负责润色已锁定的中文句子。',
          '关闭思考过程，不输出 reasoning、Markdown、代码围栏或解释。',
          '绝对保留全部 [[PLACEHOLDER]] 的原文、数量、顺序和 FACT 边界。',
          '只返回可由 JSON.parse 直接解析的 JSON 对象。'
        ].join('\n')
      },
      {
        role: 'user',
        content: ['/no_think', prompt, '只输出最终 JSON。'].join('\n')
      }
    ],
    max_tokens: maxTokens,
    temperature: 0.2,
    top_p: 0.8,
    top_k: 20,
    stream: false
  };
}

export function normalizeConstrainedPolishResponse(response) {
  const finishReason = String(
    response?.finish_reason ||
    response?.result?.finish_reason ||
    response?.choices?.[0]?.finish_reason ||
    ''
  );
  const message = response?.choices?.[0]?.message || response?.result?.choices?.[0]?.message;
  const candidates = [
    response?.response,
    response?.result?.response,
    normalizeMessageContent(message?.content),
    response?.result
  ];
  let rawContent = '';
  let parsed = null;

  for (const candidate of candidates) {
    if (candidate == null) continue;
    if (isPolishOutput(candidate)) {
      parsed = normalizePolishOutput(candidate);
      rawContent = JSON.stringify(candidate);
      break;
    }
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    rawContent = candidate.trim();
    try {
      const value = JSON.parse(rawContent);
      if (isPolishOutput(value)) {
        parsed = normalizePolishOutput(value);
        break;
      }
    } catch {
      // Strict JSON is required for the experiment.
    }
  }

  return {
    parsed,
    finishReason,
    contentLength: rawContent.length,
    failureReason: parsed
      ? null
      : !rawContent && finishReason.toLowerCase() === 'length'
        ? 'polish-length-stop'
        : !rawContent
          ? 'polish-empty-content'
          : 'polish-invalid-json'
  };
}

export function validateConstrainedPlaceholderOutput(polishPackage, candidate) {
  const reasons = [];
  const details = {
    fieldErrors: {},
    unknownPlaceholders: [],
    unprotectedNumbers: [],
    assertionFragments: []
  };

  if (!isPolishOutput(candidate)) {
    return {
      ok: false,
      reasons: ['polish-invalid-json-shape'],
      details
    };
  }

  const knownPlaceholders = new Set(polishPackage.mappings.map((entry) => entry.placeholder));
  for (const fieldName of FIELD_DEFINITIONS.map(([name]) => name)) {
    const original = polishPackage.lockedDraft[fieldName];
    const polished = normalizeWhitespace(candidate[fieldName]);
    const originalTokens = extractPlaceholders(original);
    const polishedTokens = extractPlaceholders(polished);
    const fieldReasons = [];

    if (!arraysEqual(originalTokens, polishedTokens)) {
      fieldReasons.push('placeholder-sequence-mismatch');
    }
    if (
      arraysEqual(originalTokens, polishedTokens) &&
      !preservesProtectedAdjacency(original, polished, originalTokens)
    ) {
      fieldReasons.push('placeholder-adjacency-mismatch');
    }
    const unknown = polishedTokens.filter((token) => (
      !knownPlaceholders.has(token) && !FACT_MARKER_PATTERN.test(token)
    ));
    if (unknown.length) {
      fieldReasons.push('placeholder-unknown');
      details.unknownPlaceholders.push(...unknown);
    }
    if (!hasValidFactBoundaries(
      polished,
      original,
      polishPackage.fieldSegments[fieldName],
    )) {
      fieldReasons.push('placeholder-fact-boundary-mismatch');
    }

    const outside = textOutsideFactBoundaries(
      polished,
      polishPackage.fieldSegments[fieldName]
    );
    if (
      outside
        .replace(/(?:同时|此外|另外|其中|不过|但|而|并且|以及)/g, '')
        .replace(/[；;，,。！？!?\s]/g, '')
    ) {
      fieldReasons.push('polish-text-outside-fact-boundary');
    }

    const unprotectedNumbers = removePlaceholders(polished).match(/\d+(?:\.\d+)?/g) || [];
    if (unprotectedNumbers.length) {
      fieldReasons.push('polish-unprotected-number');
      details.unprotectedNumbers.push(
        ...unprotectedNumbers.map((value) => `${fieldName}:${value}`)
      );
    }

    const originalVisible = removePlaceholders(original);
    const polishedVisible = removePlaceholders(polished);
    for (const pattern of NEW_ASSERTION_PATTERNS) {
      const match = polishedVisible.match(pattern);
      if (!match || pattern.test(originalVisible)) continue;
      fieldReasons.push('polish-new-assertion-language');
      details.assertionFragments.push(`${fieldName}:${match[0]}`);
    }

    if (fieldReasons.length) details.fieldErrors[fieldName] = [...new Set(fieldReasons)];
    reasons.push(...fieldReasons);
  }

  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    details: {
      ...details,
      unknownPlaceholders: [...new Set(details.unknownPlaceholders)],
      unprotectedNumbers: [...new Set(details.unprotectedNumbers)],
      assertionFragments: [...new Set(details.assertionFragments)]
    }
  };
}

export function restoreConstrainedPolish(polishPackage, candidate) {
  const restored = {};
  for (const [fieldName] of FIELD_DEFINITIONS) {
    let text = normalizeWhitespace(candidate[fieldName]);
    for (const mapping of polishPackage.mappings) {
      text = text.split(mapping.placeholder).join(mapping.value);
    }
    text = text.replace(/\[\[FACT_[A-Z0-9_]+_(?:START|END)\]\]/g, '');
    restored[fieldName] = normalizeRestoredText(text);
  }
  return {
    ...restored,
    usedFactIds: cloneUsedFactIds(polishPackage.usedFactIds)
  };
}

function normalizeRestoredText(value) {
  return normalizeChineseText(value)
    .replace(/76 人\s+(?=[在这])/g, '76 人')
    .replace(/\s+([，。！？；、])/g, '$1');
}

export async function runConstrainedPolishExperiment({
  factExtraction,
  record,
  factPlan = buildEditorialFactPlan(factExtraction),
  composition = composeDeterministicEditorial(factExtraction, { factPlan }),
  invoke
}) {
  const deterministicValidation = validateDeterministicEditorialComposition(
    composition,
    record,
    factExtraction
  );
  if (!deterministicValidation.ok) {
    throw new Error(
      `polish-deterministic-baseline-invalid:${deterministicValidation.reasons.join('|')}`
    );
  }

  const polishPackage = createConstrainedPolishPackage(
    composition,
    factExtraction,
    { factPlan }
  );
  const fallback = (reason, extra = {}) => ({
    composer: composition,
    lockedDraft: polishPackage.lockedDraft,
    polishedDraft: extra.polishedDraft || null,
    restoredDraft: extra.restoredDraft || null,
    final: composition,
    adoptedPolish: false,
    usedFallback: true,
    polishFallbackReason: reason,
    placeholderValidation: extra.placeholderValidation || null,
    gateValidation: deterministicValidation,
    aiRequests: extra.aiRequests || 0
  });

  if (typeof invoke !== 'function') return fallback('polish-invoker-missing');

  let response;
  try {
    response = await invoke({
      prompt: buildConstrainedPolishPrompt(polishPackage),
      request: buildConstrainedPolishRequest(buildConstrainedPolishPrompt(polishPackage))
    });
  } catch {
    return fallback('polish-request-failed', { aiRequests: 1 });
  }

  const normalized = normalizeConstrainedPolishResponse(response);
  if (!normalized.parsed) {
    return fallback(normalized.failureReason, { aiRequests: 1 });
  }

  const placeholderValidation = validateConstrainedPlaceholderOutput(
    polishPackage,
    normalized.parsed
  );
  if (!placeholderValidation.ok) {
    return fallback(placeholderValidation.reasons[0], {
      aiRequests: 1,
      polishedDraft: normalized.parsed,
      placeholderValidation
    });
  }

  const restoredDraft = restoreConstrainedPolish(polishPackage, normalized.parsed);
  const lockedSurfaceBaseline = restoreConstrainedPolish(
    polishPackage,
    polishPackage.lockedDraft
  );
  if (!hasMaterialPolish(lockedSurfaceBaseline, restoredDraft)) {
    return fallback('polish-no-material-change', {
      aiRequests: 1,
      polishedDraft: normalized.parsed,
      restoredDraft,
      placeholderValidation
    });
  }
  const gateValidation = validateDeterministicEditorialComposition(
    restoredDraft,
    record,
    factExtraction
  );
  if (!gateValidation.ok) {
    return fallback(`polish-gate-rejected:${gateValidation.reasons[0] || 'unknown'}`, {
      aiRequests: 1,
      polishedDraft: normalized.parsed,
      restoredDraft,
      placeholderValidation,
      gateValidation
    });
  }

  return {
    composer: composition,
    lockedDraft: polishPackage.lockedDraft,
    polishedDraft: normalized.parsed,
    restoredDraft,
    final: restoredDraft,
    adoptedPolish: true,
    usedFallback: false,
    polishFallbackReason: null,
    placeholderValidation,
    gateValidation,
    aiRequests: 1
  };
}

function protectFactSegment(segment, context) {
  let output = segment;
  const replacements = buildSegmentReplacements(segment, context);
  let sequence = 0;

  for (const replacement of replacements) {
    while (output.includes(replacement.value)) {
      sequence += 1;
      const placeholder = `[[${replacement.type}_${context.mappings.length + 1}]]`;
      output = output.replace(replacement.value, placeholder);
      context.mappings.push({
        placeholder,
        type: replacement.type,
        value: chooseProtectedSurface(replacement, context),
        originalValue: replacement.value,
        fieldName: context.fieldName,
        factId: context.factId,
        sequence
      });
    }
  }
  return output;
}

function buildSegmentReplacements(segment, context) {
  const replacements = [];
  const canonicalById = new Map(
    context.canonicalNames.map((entry) => [entry.canonicalId, entry])
  );
  const factRefs = context.factPlan.allowedEntities.filter((entry) => (
    entry.factIds.includes(context.factId)
  ));
  const factAttribution = normalizeWhitespace(context.fact.attribution);

  for (const phrase of buildAttributionPhrases(factAttribution, canonicalById, factRefs)) {
    if (segment.includes(phrase.value)) replacements.push(phrase);
  }

  const personRefs = factRefs.filter((ref) => ref.type === 'person');
  for (const ref of factRefs) {
    const canonical = canonicalById.get(ref.canonicalId);
    const display = normalizeWhitespace(canonical?.displayZh || canonical?.sourceName);
    if (!display || !segment.includes(display)) continue;
    replacements.push({
      type: ref.type === 'team' ? 'TEAM' : 'PERSON',
      value: display,
      canonicalId: ref.canonicalId,
      allowShortRepeat: ref.type === 'person' && personRefs.length === 1
    });
  }

  for (const number of context.fact.numbers || []) {
    const display = formatProtectedNumber(number);
    if (!display || !segment.includes(display)) continue;
    replacements.push({
      type: numberPlaceholderType(number.type),
      value: display
    });
  }

  for (const [type, value] of SEMANTIC_LITERALS) {
    if (segment.includes(value)) replacements.push({ type, value });
  }

  return dedupeReplacements(replacements)
    .sort((left, right) => right.value.length - left.value.length);
}

function buildAttributionPhrases(attribution, canonicalById, factRefs) {
  if (!attribution) return [];
  const matchingRef = factRefs.find((ref) => {
    const canonical = canonicalById.get(ref.canonicalId);
    return canonical && (
      attribution.toLowerCase().includes(String(canonical.sourceName || '').toLowerCase()) ||
      String(canonical.sourceName || '').toLowerCase().includes(attribution.toLowerCase())
    );
  });
  const canonical = matchingRef ? canonicalById.get(matchingRef.canonicalId) : null;
  const display = normalizeWhitespace(canonical?.displayZh || attribution);
  return [
    `据 ${display} 报道`,
    `据${display}报道`,
    `${display} 分析认为`,
    `${display}分析认为`,
    `${display} 节目讨论`,
    `${display}节目讨论`,
    `${display}表示`
  ].map((value) => ({
    type: 'SOURCE',
    value,
    canonicalId: matchingRef?.canonicalId || `source:${attribution.toLowerCase()}`,
    repeatedValue: repeatedAttributionSurface(value, display, canonical)
  })).sort((left, right) => right.value.length - left.value.length);
}

function chooseProtectedSurface(replacement, context) {
  if (replacement.type === 'PERSON' && replacement.canonicalId) {
    const seen = context.surfaceState.seenEntities.has(replacement.canonicalId);
    context.surfaceState.seenEntities.add(replacement.canonicalId);
    if (seen && replacement.allowShortRepeat) {
      return shortPersonDisplay(replacement.value);
    }
  }
  if (replacement.type === 'SOURCE' && replacement.canonicalId) {
    const seen = context.surfaceState.seenAttributions.has(replacement.canonicalId);
    context.surfaceState.seenAttributions.add(replacement.canonicalId);
    if (seen && replacement.repeatedValue) return replacement.repeatedValue;
  }
  return replacement.value;
}

function repeatedAttributionSurface(value, display, canonical) {
  if (value.includes('节目讨论')) return '该节目讨论';
  if (value.endsWith('表示')) {
    return `${shortPersonDisplay(canonical?.displayZh || display)}表示`;
  }
  if (value.includes('分析认为')) return '该媒体分析认为';
  if (value.includes('报道')) return '据该媒体报道';
  return value;
}

function shortPersonDisplay(value) {
  const display = normalizeWhitespace(value);
  if (!display.includes('·')) return display;
  return display.split('·').at(-1);
}

function assertProtectedDraft(lockedDraft, mappings) {
  const protectedNumbers = [];
  for (const [fieldName] of FIELD_DEFINITIONS) {
    const visible = removePlaceholders(lockedDraft[fieldName]);
    const numbers = visible.match(/\d+(?:\.\d+)?/g) || [];
    protectedNumbers.push(...numbers.map((number) => `${fieldName}:${number}`));
  }
  if (protectedNumbers.length) {
    throw new Error(`polish-unprotected-source-number:${protectedNumbers.join('|')}`);
  }
  if (!mappings.length) throw new Error('polish-no-protected-facts');
}

function hasValidFactBoundaries(text, originalText, expectedSegments) {
  const markerTokens = extractPlaceholders(text).filter((token) => FACT_MARKER_PATTERN.test(token));
  const expectedMarkers = expectedSegments.flatMap((segment) => [segment.start, segment.end]);
  if (!arraysEqual(markerTokens, expectedMarkers)) return false;

  for (const segment of expectedSegments) {
    const startIndex = text.indexOf(segment.start);
    const endIndex = text.indexOf(segment.end, startIndex + segment.start.length);
    if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) return false;
    const body = text.slice(startIndex + segment.start.length, endIndex);
    const originalStartIndex = originalText.indexOf(segment.start);
    const originalEndIndex = originalText.indexOf(
      segment.end,
      originalStartIndex + segment.start.length
    );
    if (originalStartIndex < 0 || originalEndIndex < 0) return false;
    const originalBody = originalText.slice(
      originalStartIndex + segment.start.length,
      originalEndIndex
    );
    const actual = extractPlaceholders(body);
    const expected = extractPlaceholders(originalBody);
    if (!arraysEqual(actual, expected)) return false;
  }
  return true;
}

function textOutsideFactBoundaries(text, segments) {
  let output = text;
  for (const segment of segments) {
    const startIndex = output.indexOf(segment.start);
    const endIndex = output.indexOf(segment.end, startIndex + segment.start.length);
    if (startIndex < 0 || endIndex < 0) return output;
    output = `${output.slice(0, startIndex)}${output.slice(endIndex + segment.end.length)}`;
  }
  return output;
}

function preservesProtectedAdjacency(original, polished, tokens) {
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const left = tokens[index];
    const right = tokens[index + 1];
    if (!requiresProtectedAdjacency(left, right)) continue;
    const originalBetween = textBetweenTokens(original, left, right);
    if (originalBetween == null || originalBetween.trim()) continue;
    const polishedBetween = textBetweenTokens(polished, left, right);
    if (polishedBetween == null || polishedBetween.trim()) return false;
  }
  return true;
}

function requiresProtectedAdjacency(left, right) {
  const leftType = placeholderType(left);
  const rightType = placeholderType(right);
  if (leftType === 'FACT' || rightType === 'FACT') return false;
  return leftType === 'EVENT' || rightType === 'EVENT';
}

function placeholderType(value) {
  const token = String(value || '').slice(2, -2);
  if (token.startsWith('FACT_')) return 'FACT';
  return token.split('_')[0];
}

function textBetweenTokens(text, left, right) {
  const leftIndex = text.indexOf(left);
  if (leftIndex < 0) return null;
  const rightIndex = text.indexOf(right, leftIndex + left.length);
  if (rightIndex < 0) return null;
  return text.slice(leftIndex + left.length, rightIndex);
}

function splitCompositionField(value) {
  return normalizeWhitespace(value)
    .replace(/[。！？]$/, '')
    .split('；')
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);
}

function formatProtectedNumber(number) {
  const [kind, ...parts] = normalizeWhitespace(number?.value).split(':');
  if (number?.type === 'money' && kind === 'usd-million') {
    const value = Number(parts[0]) * 100;
    return Number.isFinite(value) ? `${stripNumber(value)} 万美元` : '';
  }
  if (number?.type === 'contractYears' && kind === 'years') return `${parts[0]} 年`;
  if (number?.type === 'score' && kind === 'score') return `${parts[0]} 比 ${parts[1]}`;
  if (number?.type === 'tradeAsset' && kind === 'pick') {
    return `${parts[1]} 个${parts[0] === 'first' ? '首轮' : '次轮'}签`;
  }
  return normalizeWhitespace(number?.value);
}

function numberPlaceholderType(type) {
  return {
    money: 'MONEY',
    contractYears: 'YEARS',
    score: 'SCORE',
    tradeAsset: 'ASSET'
  }[type] || 'NUMBER';
}

function isPolishOutput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  if (!arraysEqual(keys, ['oneLineZh', 'summaryZh', 'titleZh'])) return false;
  return keys.every((key) => typeof value[key] === 'string' && value[key].trim());
}

function normalizePolishOutput(value) {
  return {
    titleZh: normalizeWhitespace(value.titleZh),
    summaryZh: normalizeWhitespace(value.summaryZh),
    oneLineZh: normalizeWhitespace(value.oneLineZh)
  };
}

function normalizeMessageContent(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .map((part) => typeof part === 'string' ? part : part?.text || '')
    .join('');
}

function extractPlaceholders(value) {
  return String(value || '').match(PLACEHOLDER_PATTERN) || [];
}

function removePlaceholders(value) {
  return String(value || '').replace(PLACEHOLDER_PATTERN, '');
}

function dedupeReplacements(replacements) {
  const seen = new Set();
  return replacements.filter((entry) => {
    const key = `${entry.type}:${entry.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cloneUsedFactIds(value) {
  return {
    title: [...(value?.title || [])],
    summary: [...(value?.summary || [])],
    oneLine: [...(value?.oneLine || [])]
  };
}

function assertCompositionShape(composition) {
  for (const [fieldName, usedField] of FIELD_DEFINITIONS) {
    if (!normalizeWhitespace(composition?.[fieldName])) {
      throw new Error(`polish-composer-field-empty:${fieldName}`);
    }
    if (!Array.isArray(composition?.usedFactIds?.[usedField])) {
      throw new Error(`polish-used-facts-missing:${usedField}`);
    }
  }
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hasMaterialPolish(original, polished) {
  return FIELD_DEFINITIONS.some(([fieldName]) => (
    comparableEditorialText(original?.[fieldName]) !== comparableEditorialText(polished?.[fieldName])
  ));
}

function comparableEditorialText(value) {
  return normalizeWhitespace(value)
    .replace(/[\s，。！？、:：；;'"“”‘’（）()\-]/g, '')
    .toLowerCase();
}

function stripNumber(value) {
  return String(Number(value).toFixed(4)).replace(/\.?0+$/, '');
}
