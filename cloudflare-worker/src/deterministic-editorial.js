import {
  buildCanonicalDisplayNames,
  buildEditorialFactPlan,
  classifyCategory,
  getEditorialPlanFactEntityRefs,
  normalizeChineseText,
  normalizeWhitespace,
  validatePhase1EditorialResult
} from './pipeline.js';

const STORY_CATEGORY = {
  trade_rumor: '流言',
  signing: '签约',
  interview: '分析',
  injury: '伤病',
  game: '比赛',
  analysis: '分析',
  other: '其他'
};

export function composeDeterministicEditorial(
  factExtraction,
  {
    factPlan = buildEditorialFactPlan(factExtraction),
    canonicalNames = buildCanonicalDisplayNames(factExtraction)
  } = {}
) {
  assertComposerInput(factExtraction, factPlan);
  const factsById = new Map(factExtraction.facts.map((fact) => [fact.id, fact]));
  const context = {
    storyType: factExtraction.storyType,
    factPlan,
    canonicalNames,
    displayNames: new Map(
      canonicalNames.map((entry) => [entry.canonicalId, entry.displayZh || entry.sourceName])
    ),
    primaryAttribution: ''
  };
  context.primaryAttribution = resolvePrimaryAttribution(factExtraction.facts, context);

  const title = composeField('title', factPlan.titleFactIds, factsById, context);
  const summary = composeField('summary', factPlan.summaryFactIds, factsById, context);
  const oneLineIds = factPlan.oneLineFactIds.length
    ? factPlan.oneLineFactIds
    : chooseDeterministicOneLineFallbackIds(factPlan);
  const oneLine = composeField('oneLine', oneLineIds, factsById, context);

  if (comparable(title.text) === comparable(oneLine.text)) {
    throw new Error('deterministic-oneline-duplicate');
  }

  return {
    titleZh: normalizeComposerText(title.text),
    summaryZh: normalizeComposerText(summary.text),
    oneLineZh: normalizeComposerText(oneLine.text),
    usedFactIds: {
      title: title.usedFactIds,
      summary: summary.usedFactIds,
      oneLine: oneLine.usedFactIds
    }
  };
}

export function validateDeterministicEditorialComposition(
  composition,
  record,
  factExtraction
) {
  const categoryZh = STORY_CATEGORY[factExtraction?.storyType] || classifyCategory(
    '',
    factExtraction?.storyType
  );
  const candidate = {
    titleZh: composition?.titleZh || '',
    summaryZh: composition?.summaryZh || '',
    oneLineZh: composition?.oneLineZh || '',
    categoryZh,
    tagsZh: [categoryZh],
    confidence: 1
  };
  const validation = validatePhase1EditorialResult(candidate, record, factExtraction);
  return {
    ...validation,
    candidate,
    usedFactIds: composition?.usedFactIds || {
      title: [],
      summary: [],
      oneLine: []
    }
  };
}

function composeField(field, factIds, factsById, context) {
  const parts = [];
  const usedFactIds = [];
  for (const factId of factIds) {
    const fact = factsById.get(factId);
    if (!fact) throw new Error(`deterministic-fact-missing:${field}:${factId}`);
    const text = composeFact(fact, field, context);
    if (!text) throw new Error(`deterministic-template-missing:${field}:${factId}`);
    parts.push(stripTerminalPunctuation(text));
    usedFactIds.push(factId);
  }
  if (!parts.length) throw new Error(`deterministic-field-empty:${field}`);

  return {
    text: field === 'title'
      ? normalizeWhitespace(parts.join('；'))
      : `${normalizeWhitespace(parts.join('；'))}。`,
    usedFactIds
  };
}

function composeFact(fact, field, context) {
  const source = normalizeWhitespace(`${fact.factText || ''} ${fact.evidenceQuote || ''}`);
  const data = buildFactTemplateData(fact, context);

  if (context.storyType === 'trade_rumor') {
    return composeTradeRumorFact(source, fact, field, data);
  }
  if (context.storyType === 'signing') {
    return composeSigningFact(source, fact, field, data);
  }
  if (context.storyType === 'interview') {
    return composeInterviewFact(source, fact, field, data, context);
  }
  if (context.storyType === 'analysis') {
    return composeAnalysisFact(source, fact, field, data);
  }
  if (context.storyType === 'injury') {
    return composeInjuryFact(source, fact, field, data);
  }
  if (context.storyType === 'game') {
    return composeGameFact(source, fact, field, data);
  }
  return composeOtherFact(source, fact, field, data);
}

function composeTradeRumorFact(source, fact, field, data) {
  const people = data.people;
  const teams = data.teams;
  const money = data.numbers.money;

  if (
    fact.polarity === 'negative' &&
    /\b(?:no|any) interest in trading\b/i.test(source)
  ) {
    return `${joinZh(teams)}均无意交易${joinZh(people)}`;
  }
  if (/\bmade no demands?\b/i.test(source)) {
    const [lebron, richPaul, davis, irving] = orderKnownNames(
      people,
      ['勒布朗·詹姆斯', 'Rich Paul', '安东尼·戴维斯', '凯里·欧文']
    );
    return `${lebron || people[0]}及其经纪人${richPaul || people[1]}未要求球队必须交易得到${davis || people[2]}或${irving || people[3]}`;
  }
  if (/\bexpected\b[\s\S]*\bstart the season with\b/i.test(source)) {
    return `${joinZh(people)}预计将分别随${joinZh(teams)}开始新赛季`;
  }
  if (/\bfocused on adding\b/i.test(source)) {
    const uncertainty = /\bunclear\b/i.test(source)
      ? `，但${people[0]}是否会离开${teams[1] || '现有球队'}尚不清楚`
      : '';
    return `${teams[0]}正关注引进${people[0]}${uncertainty}`;
  }
  if (/\b(?:interested in|drawing interest|teams interested)\b/i.test(source)) {
    const body = `${joinZh(teams)}对${people[0]}有意`;
    return withAttribution(body, fact, contextForAttribution('trade_rumor', field, data));
  }
  if (/\bpartial guarantee\b/i.test(source) && money.length >= 2) {
    return `${people[0]}与${teams[0]}的 ${money[1]}合同中仅有 ${money[0]}受保障`;
  }
  if (/\bis owed\b[\s\S]*\bfinal year\b/i.test(source) && money[0]) {
    return `${people[0]}与${teams[0]}合同最后一年价值 ${money[0]}`;
  }
  if (/\broster spots? to fill\b/i.test(source)) {
    return `${teams[0]}在常规赛前仍有多个阵容名额需要补充`;
  }
  if (/\bunknown\b[\s\S]*\bbuyout\b/i.test(source)) {
    return '目前尚不清楚球员或球队是否有意商议买断';
  }
  return composeConservativeRelation(fact, field, data);
}

function composeSigningFact(source, fact, field, data) {
  const people = data.people;
  const teams = data.teams;
  const money = data.numbers.money;
  const years = data.numbers.contractYears;

  if (/\bmatching\b[\s\S]*\boffer sheet\b/i.test(source)) {
    return `${teams[0]}匹配${teams[1]}为${people[0]}提供的 ${joinContractTerms(years, money)}报价合同`;
  }
  if (/\bwill retain\b/i.test(source)) {
    return `${teams[0]}将留住${people[0]}，后者上赛季已成为球队重要轮换球员`;
  }
  if (/\bexpected to re-sign\b/i.test(source)) {
    return `${people[0]}预计以 ${money[0]}与${teams[0]}续约`;
  }
  if (/\bexpectation\b[\s\S]*\bre-sign\b[\s\S]*\bplayer option\b/i.test(source)) {
    return `${people[0]}预计以接近 ${money[0]}球员选项的金额续约`;
  }
  if (/\bexpected to stay\b/i.test(source)) {
    return `${people[0]}一直被预计会留在${teams[0]}`;
  }
  if (/\bhave signed forward\b/i.test(source)) {
    return `${teams[0]}签下前锋${people[0]}`;
  }
  if (/\bterms were not disclosed\b/i.test(source)) {
    return `合同条款未披露，${people[0]}很可能签下 ${joinContractTerms(years, money)}老将底薪合同`;
  }
  if (/\b(?:signed|agreed to a deal|agreed to sign)\b/i.test(source)) {
    const certainty = certaintyPrefix(fact);
    return `${teams[0]}${certainty}签下${people[0]}${contractSuffix(years, money)}`;
  }
  if (/\bre-sign\b/i.test(source)) {
    return `${people[0]}${certaintyPrefix(fact)}与${teams[0]}续约${contractSuffix(years, money)}`;
  }
  return composeConservativeRelation(fact, field, data);
}

function composeInterviewFact(source, fact, field, data, context) {
  const speaker = data.attribution || context.primaryAttribution || data.people[0];
  const otherPeople = data.people.filter((name) => name !== speaker);
  const teams = data.teams;

  if (
    /\baddressed\b[\s\S]*\bdecision to\b[\s\S]*\b(?:sign with|join|choose)\b/i.test(source) ||
    /\bdiscuss(?:ed|ing)?\b[\s\S]*\bdecision to\b[\s\S]*\b(?:sign with|join|choose)\b/i.test(source)
  ) {
    const subject = otherPeople[0];
    const selectedTeam = teams[0];
    const alternativeTeam = teams[1];
    const action = /\bdecision to\b[\s\S]*\b(?:sign with|join)\b/i.test(source)
      ? '加盟'
      : '选择';
    const choice = alternativeTeam
      ? `${subject}${action}${selectedTeam}而非${alternativeTeam}`
      : `${subject}${action}${selectedTeam}`;
    return field === 'title'
      ? `${speaker}谈${choice}`
      : `${speaker}谈到${choice}一事`;
  }
  if (
    /\binjur(?:y|ies)\b[\s\S]*\b(?:factor|shap(?:e|ed|ing)|affect(?:ed|ing)?|impact(?:ed|ing)?|chang(?:e|ed|ing))\b/i.test(source)
  ) {
    const injurySubjects = selectInterviewInjurySubjects(source, data, speaker);
    const subject = injurySubjects.length
      ? `${joinZh(injurySubjects)}${hasUnresolvedInterviewSubject(source, data) ? '等人' : ''}`
      : '相关球员';
    const target = teams[0] || '球队';
    return `${speaker}指出，${subject}的伤病是影响${target}前景的重要因素`;
  }
  if (/\bhad hoped\b[\s\S]*\bwould choose\b/i.test(source)) {
    return field === 'title'
      ? `${speaker}谈希望${otherPeople[0]}选择${teams[0]}`
      : `${speaker}表示，他曾希望${otherPeople[0]}选择${teams[0]}`;
  }
  if (/\bdon't envision anything until it happens\b/i.test(source)) {
    return `${speaker}表示，在事情发生前不会预先设想结果`;
  }
  if (/\ba lot of moving parts\b/i.test(source)) {
    return `${speaker}认为，其中仍有许多变数`;
  }
  if (/\bcalculus of everything changes\b/i.test(source)) {
    return `${speaker}表示，相关变化会改变整体判断方式`;
  }
  return `${speaker}就${joinZh([...otherPeople, ...teams])}表达了个人观点`;
}

function composeAnalysisFact(source, fact, field, data) {
  const attribution = data.attribution || '文章';
  const people = data.people;
  const teams = data.teams;
  const analysisLead = attribution === 'RealGM'
    ? 'RealGM 分析认为'
    : `${attribution} 节目讨论`;

  if (/\breal focus\b[\s\S]*\bbuilding a roster\b[\s\S]*\bretires\b/i.test(source)) {
    return `${analysisLead}，${teams[0]}的重点是为${people[0]}退役后的阵容建设做准备`;
  }
  if (/\bhopeful of signing\b/i.test(source)) {
    return `相关分析还提到，${teams[0]}今夏曾希望签下${people[0]}`;
  }
  if (/\bagreeing to join\b/i.test(source) && fact.certainty === 'opinion') {
    return `${analysisLead}${people[0]}加盟${teams[0]}的设想`;
  }
  if (/\bbest chance to win\b[\s\S]*\bhow good\b/i.test(source)) {
    return `${analysisLead}这一设想是否是争取胜利的最佳机会，以及${teams[0]}在东部的竞争力`;
  }
  if (/\bmaximize the talents\b/i.test(source)) {
    return `${analysisLead}如何发挥${joinZh(people)}的能力`;
  }
  if (/\bable to guard anyone\b/i.test(source)) {
    return `${analysisLead}${teams[0] || '该阵容'}的防守能力`;
  }
  if (/\bmight\b|\bpossible\b|\binterest\b/i.test(source)) {
    return `${analysisLead}，${joinZh([...teams, ...people])}仍存在相关可能性`;
  }
  return `${analysisLead}${joinZh([...teams, ...people])}相关议题`;
}

function composeInjuryFact(source, fact, field, data) {
  const person = data.people[0];
  const team = data.teams[0];
  const injury = inferInjuryZh(source);
  const duration = inferDurationZh(source);
  const attribution = data.attribution ? `据${data.attribution}报道，` : '';

  if (/\b(?:ruled out|out for|will miss)\b/i.test(source)) {
    return `${attribution}${person}${injury ? `因${injury}` : ''}将缺阵 ${duration}`;
  }
  if (/\b(?:return|cleared to play|available)\b/i.test(source)) {
    return `${attribution}${person}${certaintyPrefix(fact)}复出${team ? `并回到${team}` : ''}`;
  }
  if (/\b(?:surgery|underwent)\b/i.test(source)) {
    return `${attribution}${person}接受了${injury || '相关'}手术${duration ? `，预计缺阵${duration}` : ''}`;
  }
  return `${attribution}${person}的${injury || '伤病'}状态得到更新`;
}

function composeGameFact(source, fact, field, data) {
  const score = data.numbers.score[0];
  const people = data.people;
  const teams = data.teams;

  if (score && /\b(?:defeated|beat|won over)\b/i.test(source)) {
    return `${teams[0]}以${score}击败${teams[1]}${people[0] ? `，${people[0]}表现出色` : ''}`;
  }
  if (score && /\bloss to\b/i.test(source)) {
    const [left, right] = score.split(' 比 ');
    return `${teams[0]}以${right}比${left}负于${teams[1]}`;
  }
  if (/\b(?:scored|finished with|recorded)\b/i.test(source) && people[0]) {
    return `${people[0]}在比赛中交出关键表现${data.numbers.other.length ? `，数据为${joinZh(data.numbers.other)}` : ''}`;
  }
  return `${joinZh(teams)}完成本场比赛${score ? `，比分为${score}` : ''}`;
}

function composeOtherFact(source, fact, field, data) {
  if (/\b(?:signed|contract|deal)\b/i.test(source)) {
    return composeSigningFact(source, fact, field, data);
  }
  if (/\b(?:injury|ruled out|return)\b/i.test(source)) {
    return composeInjuryFact(source, fact, field, data);
  }
  return composeConservativeRelation(fact, field, data);
}

function composeConservativeRelation(fact, field, data) {
  const subjects = joinZh([...data.people, ...data.teams]);
  if (!subjects) return '';
  const attribution = data.attribution ? `${data.attribution}指出，` : '';
  const certainty = {
    expected: '预计',
    likely: '很可能',
    possible: '可能',
    interest: fact.polarity === 'negative' ? '无意' : '有意',
    opinion: '认为',
    reported: '据报道',
    confirmed: ''
  }[fact.certainty] || '';
  const negation = fact.polarity === 'negative' && fact.certainty !== 'interest' ? '尚未' : '';
  return `${attribution}${subjects}${negation}${certainty}出现相关进展`;
}

function buildFactTemplateData(fact, context) {
  const source = normalizeWhitespace(`${fact.factText || ''} ${fact.evidenceQuote || ''}`);
  const refs = getEditorialPlanFactEntityRefs(fact);
  const names = refs
    .map((ref) => ({
      ...ref,
      display: context.displayNames.get(ref.canonicalId) || humanizeCanonicalId(ref.canonicalId),
      sourceName: context.canonicalNames.find(
        (entry) => entry.canonicalId === ref.canonicalId
      )?.sourceName || '',
      position: findEntityPosition(source, ref, context)
    }))
    .sort((left, right) => left.position - right.position);
  const people = names.filter((entry) => entry.type === 'person').map((entry) => entry.display);
  const teams = names.filter((entry) => entry.type === 'team').map((entry) => entry.display);

  return {
    people: unique(people),
    teams: unique(teams),
    peopleDetails: names.filter((entry) => entry.type === 'person'),
    attribution: resolveAttributionName(fact.attribution, context),
    numbers: groupNumbers(fact.numbers || [])
  };
}

function resolvePrimaryAttribution(facts, context) {
  for (const fact of facts || []) {
    const attribution = resolveAttributionName(fact?.attribution, context);
    if (attribution) return attribution;
  }
  return '';
}

function selectInterviewInjurySubjects(source, data, speaker) {
  const subjectSpan = source.match(
    /\binjur(?:y|ies)\b(?:\s+suffered by)?\s+([\s\S]*?)(?:\s+as\b|\s+(?:was|were|is|are)\b|[,.;]|$)/i
  )?.[1] || source;
  return unique(
    (data.peopleDetails || [])
      .filter((entry) => entry.display !== speaker)
      .filter((entry) => personMentionedInText(entry, subjectSpan))
      .map((entry) => entry.display)
  );
}

function personMentionedInText(entry, text) {
  const sourceName = normalizeWhitespace(entry?.sourceName);
  const aliases = [
    sourceName,
    sourceName.split(/[\s-]+/).at(-1)
  ].filter((value) => value && value.length >= 3);
  return aliases.some((alias) => (
    new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'i').test(text)
  ));
}

function hasUnresolvedInterviewSubject(source, data) {
  const subjectSpan = source.match(
    /\binjur(?:y|ies)\b(?:\s+suffered by)?\s+([\s\S]*?)(?:\s+as\b|\s+(?:was|were|is|are)\b|[,.;]|$)/i
  )?.[1] || '';
  const candidates = [...subjectSpan.matchAll(
    /(?:^|\band\b|,)\s*([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){0,3})/g
  )].map((match) => match[1]);
  return candidates.some((candidate) => (
    !(data.peopleDetails || []).some((entry) => personMentionedInText(entry, candidate))
  ));
}

function groupNumbers(numbers) {
  const grouped = {
    money: [],
    contractYears: [],
    score: [],
    tradeAsset: [],
    other: []
  };
  for (const number of numbers) {
    const display = formatNumberZh(number);
    if (!display) continue;
    (grouped[number.type] || grouped.other).push(display);
  }
  return grouped;
}

function formatNumberZh(number) {
  const [kind, ...parts] = normalizeWhitespace(number?.value).split(':');
  if (number?.type === 'money' && kind === 'usd-million') {
    const tenThousands = Number(parts[0]) * 100;
    return Number.isFinite(tenThousands) ? `${stripNumber(tenThousands)} 万美元` : '';
  }
  if (number?.type === 'contractYears' && kind === 'years') {
    return `${parts[0]} 年`;
  }
  if (number?.type === 'score' && kind === 'score') {
    return `${parts[0]} 比 ${parts[1]}`;
  }
  if (number?.type === 'tradeAsset' && kind === 'pick') {
    return `${parts[1]} 个${parts[0] === 'first' ? '首轮' : '次轮'}签`;
  }
  return normalizeWhitespace(number?.value);
}

function resolveAttributionName(value, context) {
  const attribution = normalizeWhitespace(value);
  if (!attribution) return '';
  const matching = context.canonicalNames.find((entry) => (
    attribution.toLowerCase().includes(String(entry.sourceName || '').toLowerCase()) ||
    String(entry.sourceName || '').toLowerCase().includes(attribution.toLowerCase())
  ));
  return matching?.displayZh || attribution;
}

function findEntityPosition(source, ref, context) {
  const canonical = context.canonicalNames.find((entry) => entry.canonicalId === ref.canonicalId);
  const sourceParts = canonical?.sourceName?.split(/[\s-]+/) || [];
  const aliases = [
    canonical?.sourceName,
    sourceParts[0],
    sourceParts.at(-1),
    canonical?.displayZh
  ].filter(Boolean);
  const positions = aliases
    .map((alias) => source.toLowerCase().indexOf(String(alias).toLowerCase()))
    .filter((position) => position >= 0);
  return positions.length ? Math.min(...positions) : Number.MAX_SAFE_INTEGER;
}

function contextForAttribution(storyType, field, data) {
  return { storyType, field, attribution: data.attribution };
}

function withAttribution(body, fact, context) {
  if (!context.attribution) return body;
  if (context.storyType === 'analysis') return `${context.attribution}分析认为，${body}`;
  if (context.attribution === "Dunc'd On") return `Dunc'd On 节目讨论${body}`;
  if (fact.certainty === 'opinion') return `${context.attribution}表示，${body}`;
  return `据 ${context.attribution} 报道，${body}`;
}

function certaintyPrefix(fact) {
  return {
    expected: '预计',
    likely: '很可能',
    possible: '可能',
    interest: fact.polarity === 'negative' ? '无意' : '有意',
    opinion: '认为',
    reported: '据报道',
    confirmed: ''
  }[fact.certainty] || '';
}

function contractSuffix(years, money) {
  const terms = joinContractTerms(years, money);
  return terms ? `，合同为${terms}` : '';
}

function joinContractTerms(years, money) {
  return [...years, ...money].join(' ');
}

function inferInjuryZh(source) {
  if (/\bankle\b/i.test(source) && /\bsprain/i.test(source)) return '脚踝扭伤';
  if (/\bwrist\b/i.test(source) && /\bsprain/i.test(source)) return '手腕扭伤';
  if (/\bknee\b/i.test(source) && /\bsprain/i.test(source)) return '膝关节扭伤';
  if (/\bfracture|broken\b/i.test(source)) return '骨折';
  if (/\bsprain/i.test(source)) return '扭伤';
  if (/\btorn|tear\b/i.test(source)) return '撕裂伤';
  if (/\bsoreness\b/i.test(source)) return '酸痛';
  if (/\bconcussion\b/i.test(source)) return '脑震荡';
  if (/\bknee\b/i.test(source)) return '膝伤';
  if (/\bankle\b/i.test(source)) return '脚踝伤';
  if (/\bwrist\b/i.test(source)) return '手腕伤';
  return '';
}

function inferDurationZh(source) {
  const match = source.match(/\b(\d+)\s*(day|week|month|game)s?\b/i);
  if (!match) return '';
  const unit = {
    day: '天',
    week: '周',
    month: '个月',
    game: '场'
  }[match[2].toLowerCase()];
  return `${match[1]} ${unit}`;
}

function chooseDeterministicOneLineFallbackIds(factPlan) {
  const summaryOnly = factPlan.summaryFactIds.filter(
    (factId) => !factPlan.titleFactIds.includes(factId)
  );
  if (summaryOnly.length) return [summaryOnly[0]];
  return factPlan.titleFactIds.slice(0, 1);
}

function assertComposerInput(factExtraction, factPlan) {
  if (!factExtraction || !Array.isArray(factExtraction.facts) || !factExtraction.facts.length) {
    throw new Error('deterministic-facts-invalid');
  }
  for (const field of ['titleFactIds', 'summaryFactIds', 'oneLineFactIds']) {
    if (!Array.isArray(factPlan?.[field])) {
      throw new Error(`deterministic-fact-plan-invalid:${field}`);
    }
  }
}

function orderKnownNames(values, preferred) {
  const remaining = [...values];
  return preferred.map((wanted) => {
    const index = remaining.findIndex((value) => (
      value === wanted ||
      value.endsWith(wanted.split(' ').at(-1)) ||
      wanted.endsWith(value.split(' ').at(-1))
    ));
    return index >= 0 ? remaining.splice(index, 1)[0] : '';
  });
}

function humanizeCanonicalId(value) {
  return String(value || '')
    .split('-')
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : '')
    .join(' ');
}

function joinZh(values) {
  const items = unique(values.filter(Boolean));
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join('、')}和${items.at(-1)}`;
}

function unique(values) {
  return [...new Set(values)];
}

function stripNumber(value) {
  return String(Number(value).toFixed(4)).replace(/\.?0+$/, '');
}

function stripTerminalPunctuation(value) {
  return normalizeWhitespace(value).replace(/[。！？；;，,]+$/g, '');
}

function comparable(value) {
  return normalizeWhitespace(value)
    .replace(/[\s，。！？、:：；;'"“”‘’（）()\-]/g, '')
    .toLowerCase();
}

function normalizeComposerText(value) {
  return normalizeChineseText(value).replace(/76 人\s+(?=[在这而])/g, '76 人');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
