export const PIPELINE_VERSION = 'editorial-pipeline-v5-two-stage';
export const FACT_EXTRACTION_VERSION = 'fact-v3-qwen3-evidence-first';
export const EDITORIAL_GENERATION_VERSION = 'editorial-v1-qwen3';
export const AI_STATUSES = ['pending', 'processing', 'accepted', 'rejected', 'failed'];
export const FACT_LEVELS = ['confirmed', 'reported', 'rumor', 'analysis'];
export const CATEGORIES = ['交易', '签约', '伤病', '选秀', '流言', '比赛', '分析', '其他'];
export const PIPELINE_MODES = ['single', 'phase1-canary', 'phase1'];

const FACT_STORY_TYPES = ['trade_rumor', 'signing', 'interview', 'injury', 'game', 'analysis', 'other'];
const FACT_CERTAINTIES = ['confirmed', 'reported', 'expected', 'likely', 'possible', 'interest', 'opinion'];
const FACT_POLARITIES = ['positive', 'negative'];
const FACT_SOURCE_FIELDS = ['title', 'rssSummary', 'articleText'];
const FACT_EVIDENCE_MAX_LENGTH = 300;
const FACT_EVIDENCE_MAX_ITEMS = 5;
// Pipeline upgrades use explicit cache versions; evidence hashes stay compatible with accepted v4 records.
const SOURCE_HASH_COMPATIBILITY_VERSION = 'editorial-pipeline-v4';

const TEAM_GROUPS = [
  ['hawks', '老鹰', ['Atlanta Hawks', 'Hawks']],
  ['celtics', '凯尔特人', ['Boston Celtics', 'Celtics']],
  ['nets', '篮网', ['Brooklyn Nets', 'Nets']],
  ['hornets', '黄蜂', ['Charlotte Hornets', 'Hornets']],
  ['bulls', '公牛', ['Chicago Bulls', 'Bulls']],
  ['cavaliers', '骑士', ['Cleveland Cavaliers', 'Cavaliers', 'Cavs']],
  ['mavericks', '独行侠', ['Dallas Mavericks', 'Mavericks', 'Mavs']],
  ['nuggets', '掘金', ['Denver Nuggets', 'Nuggets']],
  ['pistons', '活塞', ['Detroit Pistons', 'Pistons']],
  ['warriors', '勇士', ['Golden State Warriors', 'Golden State', 'Warriors']],
  ['rockets', '火箭', ['Houston Rockets', 'Rockets']],
  ['pacers', '步行者', ['Indiana Pacers', 'Pacers']],
  ['clippers', '快船', ['Los Angeles Clippers', 'LA Clippers', 'Clippers']],
  ['lakers', '湖人', ['Los Angeles Lakers', 'Lakers']],
  ['grizzlies', '灰熊', ['Memphis Grizzlies', 'Grizzlies']],
  ['heat', '热火', ['Miami Heat', 'Heat']],
  ['bucks', '雄鹿', ['Milwaukee Bucks', 'Bucks']],
  ['timberwolves', '森林狼', ['Minnesota Timberwolves', 'Timberwolves', 'Wolves']],
  ['pelicans', '鹈鹕', ['New Orleans Pelicans', 'Pelicans']],
  ['knicks', '尼克斯', ['New York Knicks', 'Knicks']],
  ['thunder', '雷霆', ['Oklahoma City Thunder', 'Thunder']],
  ['magic', '魔术', ['Orlando Magic', 'Magic']],
  ['76ers', '76 人', ['Philadelphia 76ers', 'Philadelphia Sixers', '76ers', 'Sixers']],
  ['suns', '太阳', ['Phoenix Suns', 'Suns']],
  ['trail-blazers', '开拓者', ['Portland Trail Blazers', 'Trail Blazers', 'Blazers']],
  ['kings', '国王', ['Sacramento Kings', 'Kings']],
  ['spurs', '马刺', ['San Antonio Spurs', 'Spurs']],
  ['raptors', '猛龙', ['Toronto Raptors', 'Raptors']],
  ['jazz', '爵士', ['Utah Jazz', 'Jazz']],
  ['wizards', '奇才', ['Washington Wizards', 'Wizards']]
];

const PLAYER_GROUPS = [
  ['lebron-james', '勒布朗·詹姆斯', ['LeBron James', 'Lebron James']],
  ['stephen-curry', '斯蒂芬·库里', ['Stephen Curry', 'Steph Curry']],
  ['kevin-durant', '凯文·杜兰特', ['Kevin Durant']],
  ['giannis-antetokounmpo', '扬尼斯·阿德托昆博', ['Giannis Antetokounmpo']],
  ['luka-doncic', '卢卡·东契奇', ['Luka Doncic', 'Luka Dončić']],
  ['kawhi-leonard', '科怀·伦纳德', ['Kawhi Leonard']],
  ['anthony-davis', '安东尼·戴维斯', ['Anthony Davis']],
  ['kyrie-irving', '凯里·欧文', ['Kyrie Irving']],
  ['klay-thompson', '克莱·汤普森', ['Klay Thompson']],
  ['nikola-jokic', '尼古拉·约基奇', ['Nikola Jokic']],
  ['joel-embiid', '乔尔·恩比德', ['Joel Embiid']],
  ['tyrese-maxey', '泰瑞斯·马克西', ['Tyrese Maxey']],
  ['jimmy-butler', '吉米·巴特勒', ['Jimmy Butler']],
  ['paul-george', '保罗·乔治', ['Paul George']],
  ['demar-derozan', '德玛尔·德罗赞', ['DeMar DeRozan']],
  ['bradley-beal', '布拉德利·比尔', ['Bradley Beal']],
  ['donovan-mitchell', '多诺万·米切尔', ['Donovan Mitchell']],
  ['bam-adebayo', '巴姆·阿德巴约', ['Bam Adebayo']],
  ['jayson-tatum', '杰森·塔图姆', ['Jayson Tatum']],
  ['shai-gilgeous-alexander', '谢伊·吉尔杰斯-亚历山大', ['Shai Gilgeous-Alexander']],
  ['victor-wembanyama', '维克托·文班亚马', ['Victor Wembanyama']],
  ['mario-hezonja', '马里奥·赫佐尼亚', ['Mario Hezonja']],
  ['dalen-terry', '达伦·特里', ['Dalen Terry']],
  ['kentavious-caldwell-pope', '肯塔维奥斯·考德威尔-波普', ['Kentavious Caldwell-Pope']],
  ['peyton-watson', '佩顿·沃特森', ['Peyton Watson']],
  ['spencer-jones', '斯潘塞·琼斯', ['Spencer Jones']],
  ['james-harden', '詹姆斯·哈登', ['James Harden']],
  ['jaylen-brown', '杰伦·布朗', ['Jaylen Brown']],
  ['jalen-brunson', '杰伦·布伦森', ['Jalen Brunson']],
  ['draymond-green', '德雷蒙德·格林', ['Draymond Green']],
  ['jonathan-kuminga', '乔纳森·库明加', ['Jonathan Kuminga']],
  ['lu-dort', '吕冈茨·多尔特', ['Lu Dort', 'Luguentz Dort']],
  ['adam-silver', '亚当·萧华', ['Adam Silver']]
];

const NBA_PERSON_GROUPS = [
  ['joe-lacob', '乔·拉科布', ['Joe Lacob']]
];

const CANONICAL_PERSON_ENTITIES = [
  {
    id: 'stephen-curry',
    role: 'player',
    englishNames: ['Stephen Curry', 'Steph Curry'],
    chineseNames: ['斯蒂芬·库里'],
    shortNames: ['库里']
  },
  {
    id: 'seth-curry',
    role: 'player',
    englishNames: ['Seth Curry'],
    chineseNames: ['赛斯·库里'],
    shortNames: ['库里']
  },
  {
    id: 'dell-curry',
    role: 'player',
    englishNames: ['Dell Curry'],
    chineseNames: ['戴尔·库里'],
    shortNames: ['库里']
  },
  {
    id: 'joe-lacob',
    role: 'owner',
    englishNames: ['Joe Lacob'],
    chineseNames: ['乔·拉科布'],
    shortNames: []
  }
];

const NBA_PERSON_KNOWN_BAD_OUTPUTS = new Map([
  ['joe-lacob', ['拉博布']]
]);

const TEAM_LOOKUP = buildAliasLookup(TEAM_GROUPS);
const PLAYER_LOOKUP = buildAliasLookup(PLAYER_GROUPS);
const NBA_PERSON_LOOKUP = buildAliasLookup(NBA_PERSON_GROUPS);
const TEAM_REPLACEMENTS = buildReplacements(TEAM_GROUPS);
const PLAYER_REPLACEMENTS = buildReplacements(PLAYER_GROUPS);
const ZH_TEAM_SIGNING_PATTERN = new RegExp(
  `(?:签约|续约)\\s*(?:${TEAM_GROUPS.map(([, zh]) => escapeRegExp(zh)).join('|')})`
);

const RUMOR_SIGNALS = /\b(?:rumou?r|reportedly|could|may|might|potential|considering|interested|interest in|mutual interest|showing interest|have interest|waiting on|targeting|target|monitoring|exploring|expected to|linked to|eyeing|pursuing|emerge as|sources? say|in talks?)\b/i;
const ANALYSIS_SIGNALS = /\b(?:analysis|takeaways?|thoughts following|what we learned|outlook|projection|ranking|winners and losers|look to challenge|preview|odds|what it means|reaction to|focused on building|building (?:a )?team for after|after .+ retires|reasons? for|why .+)\b/i;
const OPINION_SIGNALS = /\b(?:says?|said|believes?|thinks?|reacts?|shares? thoughts|explains?|discusses?|comments? on|criticizes?|praises?|admits?|responds?)\b/i;
const TRADE_SIGNALS = /\b(?:trade|traded|acquire|acquired|lands? .+ in (?:a )?deal|sent to|dealt to|transaction|finalizing (?:a )?deal)\b/i;
const SIGNING_SIGNALS = /\b(?:signs?|signed|re-signs?|agrees? to|contract|extension|offer sheet|matching .+ offer sheet)\b/i;
const INJURY_SIGNALS = /\b(?:injury|injured|surgery|out for|ruled out|return from|medical update|missed? games?|torn|sprain|fracture)\b/i;
const DRAFT_SIGNALS = /\b(?:draft|drafted|first-round pick|second-round pick|lottery pick|rookie)\b/i;
const GAME_SIGNALS = /\b(?:final score|defeats?|beats?|loss to|win over|game recap|box score|summer league mvp)\b/i;

const SOURCE_CERTAINTY_MARKERS = {
  expected: /\b(?:expected|likely)\s+(?:to|that)\b/i,
  possible: /\b(?:could|may|might)\b/i,
  interest: /\b(?:interested in|interest in|showing interest in|have interest in)\b/i,
  considering: /\b(?:considering|exploring|leaning toward)\b/i,
  reported: /\b(?:reportedly|according to|sources? say)\b/i
};

const SOURCE_ACTION_PATTERNS = {
  stay: /\b(?:remain|stay|start(?:ing)? (?:the )?season with|return to)\b/i,
  join: /\b(?:join|sign(?:s|ed|ing)?(?: with)?|land with)\b/i,
  leave: /\b(?:leave|depart)\b/i,
  trade: /\b(?:trade|acquire|send|sent|deal|dealt)\b/i,
  decide: /\b(?:decide|choose|pick)\b/i
};

const CHINESE_DEFINITE_ACTION_PATTERNS = [
  {
    action: 'stay',
    pattern: /(?:将会?|确定|已决定|已确认|确认)(?:继续)?(?:留队|留在|效力|回归)|(?:确定|确认)留队/g
  },
  {
    action: 'join',
    pattern: /(?:将会?|确定|已决定|正式|确认|已经?|已)(?:加盟|签约|签下)|已达成/g
  },
  {
    action: 'leave',
    pattern: /(?:将会?|确定|已决定)(?:离队|离开)/g
  },
  {
    action: 'trade',
    pattern: /(?:将会?|确定|已决定|正式|确认)(?:交易|送往|换来)|(?:已|已经)(?:通过交易)?(?:被交易|交易|送往|换来|得到)/g
  },
  {
    action: 'decide',
    pattern: /(?:已经?|已)(?:决定|敲定)|(?:决定|方案)(?:已经?)?确定/g
  }
];

const CHINESE_ACTION_UNCERTAINTY = /(?:预计|可能|有望|或许|或将|倾向|尚未|仍在考虑|正在考虑|计划|据称)/;
const CHINESE_REPORT_ATTRIBUTION = /(?:据报道|据消息|有消息称|消息人士称|报道称)/;

const FORBIDDEN_ENGLISH_PHRASES = [
  'officially signs',
  'signs his',
  'signs with',
  'agree to',
  'agrees to',
  'reach out to',
  'expected to',
  'planning to',
  'shows interest',
  'thoughts following',
  'takeaways from',
  'what we learned',
  'more background',
  'related news',
  'latest update',
  'multi-year',
  'one-year',
  'two-year',
  'three-year',
  'four-year',
  'free agency',
  'title contenders',
  'fantasy fallout',
  'championship odds',
  'trade grades',
  'loss to',
  'win over'
];

const FORBIDDEN_ENGLISH_WORDS = /\b(?:officially|signs?|signed|signing|agrees?|agreed|acquires?|acquired|trades?|traded|negotiating|buyout|intends?|expected|reportedly|considered|contract|deal|with|from|after|before|following|against|during|into|having)\b/gi;

const GENERIC_ZH_PATTERNS = [
  /相关消息更新/,
  /相关动态/,
  /后续动向/,
  /继续更新/,
  /值得关注/,
  /原文聚焦/,
  /更多背景来自原文报道/,
  /交易与阵容调整/,
  /自由市场与合同动向/,
  /休赛期后续动向/
];

const SOURCE_WORDS = new Set([
  'RealGM', 'NBA', 'MVP', 'ESPN', 'Yahoo', 'Sports', 'Summer', 'League',
  'Report', 'News', 'Final', 'The', 'His', 'Her', 'Their', 'With', 'From',
  'After', 'Before', 'For', 'And', 'Into', 'On', 'Of', 'To', 'In'
]);
const SOURCE_WORDS_LOWER = new Set([...SOURCE_WORDS].map((word) => word.toLowerCase()));

const NON_PERSON_PHRASES = new Set([
  'summer league prospects',
  "you don't envision anything",
  'until it happens',
  'final score',
  'key takeaways',
  'trade analysis',
  'injury report',
  'free agency rumors'
]);

const TEAM_CITY_TERMS = new Set([
  'oklahoma city'
]);

const LEAGUE_SALARY_TERMS = new Set([
  'taxpayer mle',
  'taxpayer mid-level exception',
  'mid-level exception',
  'second apron'
]);

const NON_PERSON_WORDS = new Set([
  'after', 'agency', 'analysis', 'anything', 'awards', 'before', 'championship',
  'conference', 'envision', 'final', 'free', 'grades', 'injury', 'key',
  'league', 'losers', 'news', 'notes', 'observations', 'odds', 'podcast',
  'preview', 'projection', 'prospect', 'prospects', 'ranking', 'recap',
  'report', 'rumor', 'rumors', 'schedule', 'score', 'sports', 'standings', 'summer',
  'happens', 'it', 'takeaway', 'takeaways', 'thoughts', 'trade', 'until',
  'update', 'updates', 'what', 'why', 'winners', 'you', 'neither', 'nor'
]);

const PERSON_BOUNDARY_WORDS = /\b(?:Acquire[sd]?|Agree[sd]?|Sign(?:s|ed|ing)?|Re-Sign(?:s|ed|ing)?|Trade[sd]?|Trading|Send|Sent|Deal(?:s|t)?|Land(?:s|ed|ing)?|Report(?:ed|edly)?|Return(?:s|ed|ing)?|Join(?:s|ed|ing)?|Match(?:es|ed|ing)?|Receiv(?:e|es|ed|ing)|Draw(?:s|n|ing)?|Generat(?:e|es|ed|ing)|Expect(?:s|ed|ing)?|Offer|Sheet|Focus(?:es|ed|ing)?|Build(?:s|ing)?|Team|Retire[sd]?|Waive[sd]?|Wait(?:s|ed|ing)?|Fill(?:s|ed|ing)?|Roster|Qualifying|Proximity|Play(?:s|ed|ing)?|Role|Show(?:s|ed|ing)?|Mutual|Interest|Intends?|Could|Would|May|Might|Had|Has|Have|No|Out|Before|With|From|For|After|Against|During|Into|Over|At|On|Of|To|In|And|Or|Vs)\b/gi;
const PERSON_CANDIDATE_PATTERN = /\b[A-Z][A-Za-zÀ-ž'’.-]+(?:\s+(?:[A-Z][A-Za-zÀ-ž'’.-]+|Jr\.?|Sr\.?)){1,3}\b/g;

export function normalizeWhitespace(value = '') {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function stripHtml(value = '') {
  return normalizeWhitespace(
    String(value || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

export function decodeHtml(value = '') {
  return normalizeWhitespace(
    String(value || '')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;|&apos;/gi, "'")
      .replace(/&nbsp;/gi, ' ')
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  );
}

export function cleanStringsDeep(value) {
  if (typeof value === 'string') return normalizeWhitespace(value);
  if (Array.isArray(value)) return value.map(cleanStringsDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cleanStringsDeep(entry)])
    );
  }
  return value;
}

export function canonicalizeUrl(value = '') {
  try {
    const url = new URL(String(value));
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|guccounter|guce_referrer|soc_src|soc_trk)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return normalizeWhitespace(value);
  }
}

export async function createNewsId(item) {
  const canonical = canonicalizeUrl(item.url || item.link);
  const identity = canonical || `${item.source || 'RealGM'}\n${normalizeWhitespace(item.originalTitle)}`;
  return `news_${(await sha256(identity)).slice(0, 24)}`;
}

export async function createSourceHash(item) {
  return sha256([
    SOURCE_HASH_COMPATIBILITY_VERSION,
    normalizeWhitespace(item.originalTitle),
    normalizeWhitespace(item.originalSummary || item.summary),
    canonicalizeUrl(item.url || item.link)
  ].join('\n'));
}

export function inferStoryType(text = '') {
  const value = normalizeWhitespace(text);
  if (ANALYSIS_SIGNALS.test(value)) return 'analysis';
  if (/\b(?:played role in|reason(?:s)? (?:for|behind)|why .+ (?:signed|joined|left))\b/i.test(value)) return 'fact';
  if (TRADE_SIGNALS.test(value)) return 'trade';
  if (/\b(?:could|may|might|considering|interested|interest in|mutual interest|showing interest|waiting on|targeting|monitoring|exploring|linked to|eyeing|pursuing|in talks?)\b/i.test(value)) {
    return 'rumor';
  }
  if (SIGNING_SIGNALS.test(value)) return 'signing';
  if (INJURY_SIGNALS.test(value)) return 'injury';
  if (DRAFT_SIGNALS.test(value)) return 'draft';
  if (RUMOR_SIGNALS.test(value)) return 'rumor';
  if (OPINION_SIGNALS.test(value)) return 'opinion';
  if (GAME_SIGNALS.test(value)) return 'game';
  return 'fact';
}

export function inferFactLevel(text = '', storyType = inferStoryType(text)) {
  if (storyType === 'analysis' || storyType === 'opinion') return 'analysis';
  if (storyType === 'rumor' || RUMOR_SIGNALS.test(text)) return 'rumor';
  if (/\b(?:reportedly|according to|sources? say|is expected to)\b/i.test(text)) return 'reported';
  return 'confirmed';
}

export function classifyCategory(text = '', storyType = inferStoryType(text)) {
  if (storyType === 'trade') return '交易';
  if (storyType === 'signing') return '签约';
  if (storyType === 'injury') return '伤病';
  if (storyType === 'draft') return '选秀';
  if (storyType === 'rumor') return '流言';
  if (storyType === 'game') return '比赛';
  if (storyType === 'analysis' || storyType === 'opinion') return '分析';
  return '其他';
}

export function scoreImportance(item = {}) {
  const text = `${item.originalTitle || ''} ${item.originalSummary || item.summary || ''}`;
  const storyType = item.storyType || inferStoryType(text);
  let score = 1;
  if (['trade', 'signing', 'injury', 'draft'].includes(storyType)) score += 2;
  if (/\b(?:LeBron|Curry|Durant|Giannis|Doncic|Dončić|Kawhi|Jokic|MVP)\b/i.test(text)) score += 1;
  if (extractMoneyFacts(text).length || extractDurationFacts(text).length || extractPickFacts(text).length) score += 1;
  if (RUMOR_SIGNALS.test(text) && score < 4) score += 1;
  return Math.min(score, 5);
}

export function buildEventKey(item = {}) {
  const text = `${item.originalTitle || ''} ${item.originalSummary || item.summary || ''}`;
  const teams = extractTeamIds(item.originalTitle || text).slice(0, 2);
  const people = extractPeople(item.originalTitle || '').slice(0, 1);
  const storyType = item.storyType || inferStoryType(text);
  return slug([storyType, ...people, ...teams].filter(Boolean).join(':')) ||
    slug(item.newsId || item.url || item.originalTitle);
}

export function createPendingRecord(item, now = new Date().toISOString()) {
  const evidence = `${item.originalTitle || ''} ${item.originalSummary || item.summary || ''}`;
  const storyType = inferStoryType(item.originalTitle || evidence);
  const category = classifyCategory(item.originalTitle || evidence, storyType);
  return cleanStringsDeep({
    newsId: item.newsId,
    sourceHash: item.sourceHash,
    source: item.source || 'RealGM',
    feed: item.feed || '',
    originalTitle: item.originalTitle || item.title || '',
    originalSummary: item.originalSummary || item.summary || '',
    imageUrl: canonicalizeUrl(item.imageUrl || ''),
    url: canonicalizeUrl(item.url || item.link),
    publishedAt: normalizeDate(item.publishedAt || item.pubDate),
    storyType,
    expectedFactLevel: inferFactLevel(evidence, storyType),
    category,
    importance: scoreImportance({ ...item, storyType }),
    eventKey: buildEventKey({ ...item, storyType }),
    aiStatus: 'pending',
    retryCount: 0,
    queuedAt: now,
    processingStartedAt: null,
    processedAt: null,
    nextRetryAt: null,
    lastAttemptAt: null,
    lastError: null,
    rejectionReasons: [],
    rejectionStage: null,
    pipelineVersion: PIPELINE_VERSION,
    factExtractionVersion: null,
    editorialGenerationVersion: null,
    factExtractionCacheKey: null,
    editorialGenerationCacheKey: null,
    factExtractionStatus: 'pending',
    factValidationStatus: 'pending',
    editorialGenerationStatus: 'pending',
    finalGateStatus: 'pending',
    factStageRequests: 0,
    editorialStageRequests: 0,
    factExtraction: null,
    factValidation: null,
    editorial: null
  });
}

export function recoverStaleProcessing(records, nowMs = Date.now(), staleMinutes = 45) {
  const changed = [];
  for (const record of records) {
    if (record.aiStatus !== 'processing') continue;
    const startedAt = new Date(record.processingStartedAt || 0).getTime();
    if (Number.isFinite(startedAt) && nowMs - startedAt < staleMinutes * 60_000) continue;
    record.aiStatus = 'failed';
    record.lastError = 'processing-timeout';
    record.nextRetryAt = new Date(nowMs).toISOString();
    record.processingStartedAt = null;
    changed.push(record.newsId);
  }
  return changed;
}

export function selectQueueRecords(records, maxItems, nowMs = Date.now()) {
  const limit = clampInteger(maxItems, 3, 1, 10);
  const eligible = records.filter((record) => {
    if (!['pending', 'rejected', 'failed'].includes(record.aiStatus)) return false;
    const retryAt = new Date(record.nextRetryAt || 0).getTime();
    return !Number.isFinite(retryAt) || retryAt <= nowMs;
  });

  if (!eligible.length) return [];

  const selected = [];
  const recentNew = eligible
    .filter((record) => record.retryCount === 0 && nowMs - new Date(record.publishedAt).getTime() <= 6 * 36e5)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))[0];

  if (recentNew) selected.push(recentNew);

  const rest = eligible
    .filter((record) => record.newsId !== recentNew?.newsId)
    .sort((a, b) => {
      const attemptDelta = new Date(a.lastAttemptAt || 0) - new Date(b.lastAttemptAt || 0);
      if (attemptDelta) return attemptDelta;
      const retryDelta = (a.retryCount || 0) - (b.retryCount || 0);
      if (retryDelta) return retryDelta;
      return new Date(a.queuedAt || a.publishedAt) - new Date(b.queuedAt || b.publishedAt);
    });

  selected.push(...rest.slice(0, limit - selected.length));
  return selected.slice(0, limit);
}

export function getRetrySchedule(status, retryCount, nowMs = Date.now()) {
  const count = Math.max(1, Number(retryCount) || 1);
  const baseMinutes = status === 'failed' ? 30 : 180;
  const maxMinutes = status === 'failed' ? 360 : 1440;
  const minutes = Math.min(maxMinutes, baseMinutes * 2 ** Math.min(count - 1, 4));
  return new Date(nowMs + minutes * 60_000).toISOString();
}

export function buildEditorialPrompt(record, articleText = '') {
  const sourceEvidence = normalizeWhitespace([
    record.originalTitle,
    record.originalSummary,
    articleText
  ].filter(Boolean).join('\n'));
  const facts = extractEvidenceFacts(sourceEvidence);
  const playerNameRules = buildPlayerNameRules(record.originalTitle);
  const coreFacts = buildCoreFactBrief(record);
  const expected = record.expectedFactLevel || inferFactLevel(sourceEvidence, record.storyType);

  return [
    '你是 NBA 中文快讯编辑，不是逐词翻译工具。',
    '只使用输入中明确存在的事实，将英文新闻编辑成自然、准确、简洁的中文快讯。',
    '严格返回一个 JSON 对象，不能输出 Markdown、解释、思考过程或额外字段。',
    'JSON 字段必须是：titleZh、summaryZh、categoryZh、tagsZh、confidence、factLevel。',
    'titleZh：具体中文标题，约 14 到 32 个中文字符；可保留没有常见译名的英文球员名，但不能出现英文语法片段。',
    'summaryZh：1 到 2 句，约 60 到 160 个中文字符；说明谁、发生了什么、当前状态及关键影响。',
    'categoryZh：只能是 交易、签约、伤病、选秀、流言、比赛、分析、其他之一。',
    'tagsZh：1 到 5 个简短标签组成的数组。',
    'confidence：0 到 1，表示输出是否忠实覆盖输入事实，不代表新闻是否官方确认。',
    'factLevel：只能是 confirmed、reported、rumor、analysis 之一。',
    '必须保留输入中明确出现的球员、球队、合同金额、合同年限、比分和主要交易资产。',
    '球员姓名必须严格遵守 personNameRules：词典已给中文名时使用该中文名；标记为保留英文时必须原样保留，禁止自行音译。',
    '中文语法：球员去某队必须写“加盟某队”或“与某队签约”，禁止写“球员签约某队”；球队签下球员可以写“某队签下球员”。',
    '解释签约原因时，标题应写“某因素影响某球员加盟某队的决定”，不要写“签约某队与某因素有关”。',
    '传闻、潜在下家、接触、考虑和预计等内容必须写成“据报道”“有消息称”“可能”“有意”或“正在考虑”，不能写成已经完成。',
    '分析、预测和观点必须明确写成分析或观点，不能改写成确定事实。',
    'titleZh 与 summaryZh 不能只是同一句话的重复。',
    `本地判定 storyType=${record.storyType}，期望 factLevel=${expected}，期望 categoryZh=${record.category}。`,
    'standardizedCoreFacts 中的中文金额和年限已经正确换算；必须原样保留，禁止再次换算或改变量级。',
    `standardizedCoreFacts=${JSON.stringify(coreFacts)}`,
    `已提取事实=${JSON.stringify(facts)}`,
    `personNameRules=${JSON.stringify(playerNameRules)}`,
    `originalTitle=${record.originalTitle}`,
    `rssSummary=${record.originalSummary || '(无)'}`,
    `articleText=${articleText || '(正文不可用，只能根据标题和 RSS 摘要保守编辑)'}`
  ].join('\n');
}

export function buildFactExtractionPrompt(record, articleText = '') {
  return [
    'You select evidence for the first stage of an NBA news pipeline.',
    'Return one strict JSON object containing only evidenceItems.',
    'Do not classify, translate, summarize, normalize, explain, or infer anything.',
    `Return 1 to 4 evidenceItems and never exceed ${FACT_EVIDENCE_MAX_ITEMS}.`,
    'Each item must use exactly this shape:',
    '{"id":"evidence-1","evidenceQuote":"exact English substring copied from the supplied input","attributionName":"","attributionQuote":""}.',
    'evidenceQuote must be one continuous verbatim substring from title, rssSummary, or articleText.',
    `evidenceQuote and attributionQuote must each be at most ${FACT_EVIDENCE_MAX_LENGTH} characters.`,
    'Each evidenceQuote must contain one core fact, including its action and any words that limit certainty or negate the action.',
    'Never paraphrase evidenceQuote. Preserve names, amounts, contract years, scores, trade assets, modality, and negation exactly.',
    'For an interview, opinion, analysis, prediction, or explicitly attributed report, copy the real speaker or source into attributionName and copy a short exact substring proving that attribution into attributionQuote.',
    'For a routine completed signing, transaction, official announcement, or final score, attributionName and attributionQuote may both be empty.',
    'Do not output storyType, certainty, polarity, sourceField, factText, entities, numbers, mustNotClaim, reasoning, Markdown, or any extra field.',
    'If the input cannot support a fact with an exact quote, do not invent one.',
    `localStoryTypeHint=${normalizeFactStoryType(record.storyType, 'other')}`,
    `source=${record.source || 'RealGM'}`,
    `title=${record.originalTitle || ''}`,
    `rssSummary=${record.originalSummary || '(none)'}`,
    `articleText=${articleText || '(none)'}`
  ].join('\n');
}

export function buildPhase1EditorialPrompt(factExtraction, record) {
  const canonicalNames = buildCanonicalDisplayNames(factExtraction);
  const coreFacts = selectPhase1CoreFacts(factExtraction);
  const factStoryType = factExtraction.storyType === 'interview'
    ? 'opinion'
    : factExtraction.storyType === 'trade_rumor'
      ? 'rumor'
      : factExtraction.storyType;
  const expectedCategory = classifyCategory('', factStoryType);
  const expectedFactLevel = factCertaintyToEditorialLevel(
    getFactExtractionCertainty(factExtraction)
  );
  const requiredAttributions = [...new Set(
    factExtraction.facts.map((fact) => fact.attribution).filter(Boolean)
  )];
  return [
    '你是严谨的中文 NBA 快讯编辑。',
    '你的唯一事实来源是下方已经通过代码验证的 Fact JSON；不得使用外部知识，不得补充常识或猜测。',
    '严格返回一个 JSON 对象，不得输出 Markdown、解释、reasoning 或额外字段。',
    '字段只能是 titleZh、summaryZh、oneLineZh、categoryZh、tagsZh、confidence。',
    'titleZh：自然、具体的中文体育新闻标题，约 14 到 32 个中文字符。',
    'summaryZh：1 到 2 句，约 60 到 160 个中文字符，覆盖主要事实和必要限定。',
    'oneLineZh：独立生成的一句话速览，不得与 titleZh 完全相同；没有额外事实时换一种更精炼但不新增事实的表达。',
    '输出前必须比较 titleZh 与 oneLineZh；去除标点和空格后仍相同也算重复，必须重写 oneLineZh。',
    'categoryZh：只能是 交易、签约、伤病、选秀、流言、比赛、分析、其他之一。',
    'tagsZh：1 到 5 个简短标签。',
    'confidence：0 到 1，表示中文稿忠实覆盖已验证 Fact JSON 的程度。',
    '必须保留 Fact JSON 中的 certainty、polarity 和 attribution。',
    'reported、expected、likely、possible 不能改写成已完成或确定事件。',
    'opinion 或 analysis 必须明确写成某人观点、媒体分析、预测或讨论，不能写成已发生事实。',
    '采访必须保留发言者、观点对象和归属关系。',
    'requiredAttributions 非空时，summaryZh 必须明确写出每个必要的发言者、媒体或节目来源。',
    'oneLineZh 也必须独立保留相关的“据报道、预计、可能、分析认为、某人表示”等确定性或观点限定。',
    '必须准确保留 Fact JSON 中的金额、年限、比分、伤病时间和主要交易筹码。',
    'requiredCoreFacts 是标题和摘要必须覆盖的核心事实；其他 Facts 只作为可选背景，不要求全部写入。',
    '逐条检查 requiredCoreFacts：其中每个金额、年限、比分和主要实体都必须出现在 titleZh 或 summaryZh。',
    '不要为了覆盖可选背景而堆砌次要薪资空间、奢侈税线或例外条款数字。',
    '除球员名、球队缩写、媒体名和 NBA 专名外，不得保留 roster spots 等普通英文短语。',
    '球员与球队签约或续约应写“球员与球队签约/续约”或“球队签下球员”，不要写“球员签约球队/续约球队”。',
    `categoryZh 必须是 ${expectedCategory}。`,
    '优先使用 canonicalNames 中的常见中文名；无中文映射时完整保留英文姓名，不自行音译。',
    `source=${record.source || 'RealGM'}`,
    `publishedAt=${record.publishedAt || ''}`,
    `expectedFactLevel=${expectedFactLevel}`,
    `canonicalNames=${JSON.stringify(canonicalNames)}`,
    `requiredAttributions=${JSON.stringify(requiredAttributions)}`,
    `requiredCoreFacts=${JSON.stringify(coreFacts)}`,
    `validatedFactJson=${JSON.stringify(factExtraction)}`
  ].join('\n');
}

export function buildPhase1FactRequest(prompt, maxTokens = 3200, { retry = false } = {}) {
  return buildDirectJsonRequest(prompt, maxTokens, {
    retry,
    role: 'verbatim NBA evidence selector',
    fields: 'evidenceItems'
  });
}

export function buildPhase1EditorialRequest(prompt, maxTokens = 2200, { retry = false } = {}) {
  return buildDirectJsonRequest(prompt, maxTokens, {
    retry,
    role: '严谨的中文 NBA 快讯编辑',
    fields: 'titleZh、summaryZh、oneLineZh、categoryZh、tagsZh、confidence'
  });
}

export function buildWorkersAiRequest(prompt, maxTokens = 2400, { retry = false } = {}) {
  const retryInstruction = retry
    ? '上一次响应没有产生可解析 JSON。请重新生成完整 JSON；第一个字符必须是 {，最后一个字符必须是 }。'
    : '第一个字符必须是 {，最后一个字符必须是 }。';

  return {
    messages: [
      {
        role: 'system',
        content: [
          '/no_think',
          '你是一名严谨的中文 NBA 快讯编辑。',
          '关闭思考过程，不要输出 reasoning、Markdown、代码围栏或解释。',
          '只返回一个紧凑、完整、可由 JSON.parse 直接解析的 JSON 对象。',
          '只允许字段 titleZh、summaryZh、categoryZh、tagsZh、confidence、factLevel。',
          retryInstruction
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          '/no_think',
          prompt,
          retryInstruction,
          '只输出最终 JSON 对象，不要输出任何其他内容。'
        ].join('\n')
      }
    ],
    max_tokens: maxTokens,
    temperature: 0.1,
    top_p: 0.8,
    top_k: 20,
    stream: false
  };
}

export function buildWorkersAiJsonRequest(prompt, maxTokens = 1400) {
  return {
    messages: [
      {
        role: 'system',
        content: [
          '你是一名严谨的中文 NBA 快讯编辑。',
          '不要展示思考过程，只返回符合指定 JSON Schema 的最终结果。'
        ].join('\n')
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    max_tokens: maxTokens,
    temperature: 0.2,
    top_p: 0.8,
    stream: false,
    response_format: {
      type: 'json_schema',
      json_schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          titleZh: { type: 'string' },
          summaryZh: { type: 'string' },
          categoryZh: { type: 'string', enum: CATEGORIES },
          tagsZh: {
            type: 'array',
            minItems: 1,
            maxItems: 5,
            items: { type: 'string' }
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          factLevel: { type: 'string', enum: FACT_LEVELS }
        },
        required: ['titleZh', 'summaryZh', 'categoryZh', 'tagsZh', 'confidence', 'factLevel']
      }
    }
  };
}

export function normalizeAiResponse(response) {
  const finishReason = String(
    response?.finish_reason ||
    response?.result?.finish_reason ||
    response?.choices?.[0]?.finish_reason ||
    ''
  );
  const message = response?.choices?.[0]?.message || response?.result?.choices?.[0]?.message;
  const toolCalls = [
    ...(Array.isArray(response?.tool_calls) ? response.tool_calls : []),
    ...(Array.isArray(response?.result?.tool_calls) ? response.result.tool_calls : []),
    ...(Array.isArray(message?.tool_calls) ? message.tool_calls : [])
  ];
  const messageContent = normalizeMessageContent(message?.content);
  const candidates = [
    ...toolCalls.map((toolCall) => toolCall?.arguments ?? toolCall?.function?.arguments),
    response?.response,
    response?.result?.response,
    messageContent,
    response?.result,
    response
  ];

  let parsed = null;
  let rawContent = '';
  let incompleteSchema = false;
  for (const candidate of candidates) {
    if (candidate == null) continue;
    if (isEditorialObject(candidate)) {
      parsed = candidate;
      rawContent = JSON.stringify(candidate);
      break;
    }
    if (isEditorialCandidateObject(candidate)) {
      incompleteSchema = true;
      rawContent = JSON.stringify(candidate);
      continue;
    }
    if (typeof candidate !== 'string') continue;
    if (!candidate.trim()) continue;
    rawContent = candidate;
    const parsedCandidate = parseJsonCandidate(candidate);
    if (!parsedCandidate) continue;
    if (isEditorialObject(parsedCandidate)) {
      parsed = parsedCandidate;
      break;
    }
    if (isEditorialCandidateObject(parsedCandidate)) incompleteSchema = true;
  }

  const normalizedRawContent = normalizeWhitespace(rawContent);
  const lowerFinishReason = finishReason.toLowerCase();
  const structuralFailureReason = parsed
    ? null
    : incompleteSchema
      ? 'qwen-incomplete-schema'
      : !normalizedRawContent && lowerFinishReason === 'length'
        ? 'qwen-length-stop'
        : !normalizedRawContent
          ? 'qwen-empty-content'
          : 'qwen-invalid-json';
  return {
    parsed,
    rawContent: normalizedRawContent,
    contentLength: normalizedRawContent.length,
    finishReason,
    isEmptyLengthResponse: !parsed && !normalizedRawContent && lowerFinishReason === 'length',
    structuralFailureReason
  };
}

export function normalizeFactExtractionResponse(response) {
  const normalized = normalizeStructuredAiResponse(
    response,
    isEvidenceExtractionObject,
    isEvidenceExtractionCandidateObject,
    parseEvidenceJsonCandidate
  );
  if (normalized.parsed) normalized.parsed = normalizeEvidenceExtraction(normalized.parsed);
  return normalized;
}

export function normalizePhase1EditorialResponse(response) {
  return normalizeStructuredAiResponse(response, isPhase1EditorialObject, isPhase1EditorialCandidateObject);
}

export function validateFactExtraction(result, record, articleText = '') {
  if (isEvidenceExtractionObject(result)) {
    return validateEvidenceExtraction(result, record, articleText);
  }
  if (isFactExtractionObject(result)) {
    return validateGeneratedFactExtraction(result, record, articleText);
  }
  return {
    ok: false,
    reasons: ['fact-schema-invalid'],
    details: createFactValidationDetails(),
    value: null
  };
}

export function validateFrozenFactExtraction(result) {
  const details = createFactValidationDetails();
  const value = normalizeFactExtraction(result);
  return isFactExtractionObject(value)
    ? { ok: true, reasons: [], details, value }
    : { ok: false, reasons: ['fact-schema-invalid'], details, value: null };
}

export function validatePhase1EditorialResult(result, record, factExtraction) {
  const details = { addedFacts: [], missingFacts: [], unsafeFragments: [] };
  if (!isPhase1EditorialObject(result) || !isFactExtractionObject(factExtraction)) {
    return { ok: false, reasons: ['invalid-json-shape'], details };
  }

  const factLevel = factCertaintyToEditorialLevel(getFactExtractionCertainty(factExtraction));
  const factStoryType = factExtraction.storyType === 'interview'
    ? 'opinion'
    : factExtraction.storyType === 'trade_rumor'
      ? 'rumor'
      : factExtraction.storyType;
  const expectedCategory = classifyCategory('', factStoryType);
  const factEvidence = buildValidatedFactEvidence(factExtraction);
  const attributionEvidence = buildPhase1AttributionEvidence(factExtraction);
  const coreFactEvidence = buildValidatedFactEvidence({
    ...factExtraction,
    facts: selectPhase1CoreFacts(factExtraction)
  });
  const gateRecord = {
    ...record,
    originalTitle: coreFactEvidence,
    originalSummary: `${factEvidence}\n${attributionEvidence}`,
    storyType: factStoryType,
    category: expectedCategory,
    expectedFactLevel: factLevel,
    skipGenericCertaintyReview: true
  };
  const sourceEvidence = `${factEvidence}\n${attributionEvidence}`;
  const normalizedOneLine = normalizeEditorialPersonNames(
    normalizeChineseText(result.oneLineZh),
    sourceEvidence
  );
  const candidate = {
    titleZh: result.titleZh,
    summaryZh: result.summaryZh,
    categoryZh: result.categoryZh,
    tagsZh: result.tagsZh,
    confidence: result.confidence,
    factLevel,
    oneLineZh: normalizedOneLine
  };
  const validation = validateEditorialResult(candidate, gateRecord, '');
  const reasons = [...validation.reasons];
  const value = validation.value
    ? { ...validation.value, oneLineZh: normalizedOneLine }
    : null;

  const oneLineSafety = inspectChineseCopy(normalizedOneLine, { minHan: 5, maxLength: 90 });
  if (!oneLineSafety.ok) {
    reasons.push('unsafe-oneline');
    details.unsafeFragments.push(...oneLineSafety.fragments);
  }
  if (value && comparable(value.titleZh) === comparable(normalizedOneLine)) {
    reasons.push('title-oneline-duplicate');
  }

  const requiredFacts = extractEvidenceFacts(coreFactEvidence, sourceEvidence);
  const allowedFacts = extractEvidenceFacts(sourceEvidence, sourceEvidence);
  const outputFacts = value
    ? extractEvidenceFacts(
        `${value.titleZh}\n${value.summaryZh}\n${value.oneLineZh}`,
        sourceEvidence
      )
    : extractEvidenceFacts('');
  const phase1FactDetails = { addedFacts: [], missingFacts: [] };
  compareFacts(
    requiredFacts,
    allowedFacts,
    outputFacts,
    phase1FactDetails,
    requiredFacts
  );
  if (phase1FactDetails.addedFacts.length) reasons.push('editorial-fact-mismatch');
  if (phase1FactDetails.missingFacts.length) reasons.push('editorial-missing-verified-facts');

  const certaintyReview = inspectCertaintyPreservation(
    buildPhase1CertaintyEvidence(factExtraction),
    normalizedOneLine,
    factLevel
  );
  if (certaintyReview.reasons.length) {
    reasons.push(...certaintyReview.reasons);
    details.unsafeFragments.push(...certaintyReview.fragments);
  }
  const attributionReview = inspectPhase1AttributionCoverage(
    factExtraction,
    value
      ? `${value.titleZh}\n${value.summaryZh}\n${value.oneLineZh}`
      : ''
  );
  if (attributionReview.reasons.length) {
    reasons.push(...attributionReview.reasons);
    details.unsafeFragments.push(...attributionReview.fragments);
  }

  details.addedFacts.push(
    ...(validation.details?.addedFacts || []),
    ...phase1FactDetails.addedFacts
  );
  details.missingFacts.push(
    ...(validation.details?.missingFacts || []),
    ...phase1FactDetails.missingFacts
  );
  details.unsafeFragments.push(...(validation.details?.unsafeFragments || []));

  return reasons.length
    ? {
        ok: false,
        reasons: [...new Set(reasons)],
        details: dedupeEditorialDetails(details),
        value
      }
    : {
        ok: true,
        reasons: [],
        details: dedupeEditorialDetails(details),
        value
      };
}

export function summarizeFactExtraction(factExtraction) {
  if (!isFactExtractionObject(factExtraction)) return null;
  return {
    storyType: factExtraction.storyType,
    facts: factExtraction.facts.slice(0, 8).map((fact) => ({
      id: fact.id,
      factText: fact.factText,
      certainty: fact.certainty,
      polarity: fact.polarity,
      attribution: fact.attribution,
      attributionQuote: fact.attributionQuote.slice(0, 120),
      sourceField: fact.sourceField,
      evidenceQuote: fact.evidenceQuote.slice(0, 120),
      entities: fact.entities,
      numbers: fact.numbers
    })),
    mustNotClaim: factExtraction.mustNotClaim.slice(0, 3)
  };
}

export function summarizeEvidenceExtraction(evidenceExtraction) {
  if (!isEvidenceExtractionObject(evidenceExtraction)) return null;
  return {
    evidenceItems: evidenceExtraction.evidenceItems.map((item) => ({
      id: item.id,
      evidenceQuote: item.evidenceQuote.slice(0, 120),
      attributionName: item.attributionName,
      attributionQuote: item.attributionQuote.slice(0, 120)
    }))
  };
}

export function validateEditorialResult(result, record, articleText = '') {
  const reasons = [];
  const details = { addedFacts: [], missingFacts: [], unsafeFragments: [] };
  if (!isEditorialObject(result)) {
    return { ok: false, reasons: ['invalid-json-shape'], details };
  }

  const sourceEvidence = [
    record.originalTitle,
    record.originalSummary,
    articleText
  ].filter(Boolean).join('\n');
  const value = {
    titleZh: normalizeEditorialPersonNames(normalizeChineseText(result.titleZh), sourceEvidence),
    summaryZh: normalizeEditorialPersonNames(normalizeChineseText(result.summaryZh), sourceEvidence),
    categoryZh: normalizeEditorialPersonNames(normalizeWhitespace(result.categoryZh), sourceEvidence),
    tagsZh: [...new Set(
      (Array.isArray(result.tagsZh) ? result.tagsZh : [])
        .map((tag) => normalizeEditorialPersonNames(normalizeChineseText(tag), sourceEvidence))
        .filter(Boolean)
    )].slice(0, 5),
    confidence: Number(result.confidence),
    factLevel: normalizeWhitespace(result.factLevel)
  };
  const unicodeIssues = new Set([
    result.titleZh,
    result.summaryZh,
    result.categoryZh,
    ...(Array.isArray(result.tagsZh) ? result.tagsZh : []),
    result.oneLineZh
  ].flatMap((entry) => inspectUnicodeIssues(entry)));
  if (unicodeIssues.size) {
    reasons.push(...unicodeIssues);
    details.unsafeFragments.push(...unicodeIssues);
  }

  if (!Number.isFinite(value.confidence) || value.confidence < 0.6 || value.confidence > 1) {
    reasons.push('low-confidence');
  }
  if (!CATEGORIES.includes(value.categoryZh)) reasons.push('invalid-category');
  if (!FACT_LEVELS.includes(value.factLevel)) reasons.push('invalid-fact-level');
  if (!value.tagsZh.length) reasons.push('missing-tags');

  const titleSafety = inspectChineseCopy(value.titleZh, { minHan: 5, maxLength: 80 });
  const summarySafety = inspectChineseCopy(value.summaryZh, { minHan: 18, maxLength: 260 });
  if (!titleSafety.ok) {
    reasons.push('unsafe-title');
    details.unsafeFragments.push(...titleSafety.fragments);
  }
  if (!summarySafety.ok) {
    reasons.push('unsafe-summary');
    details.unsafeFragments.push(...summarySafety.fragments);
  }
  if (comparable(value.titleZh) === comparable(value.summaryZh)) reasons.push('title-summary-duplicate');
  if (value.summaryZh && comparable(value.summaryZh).includes(comparable(value.titleZh)) && value.summaryZh.length < value.titleZh.length + 12) {
    reasons.push('summary-repeats-title');
  }

  const leadSummary = firstSentence(record.originalSummary || '');
  const sourceCore = `${record.originalTitle || ''}\n${leadSummary}`;
  const requiredFacts = extractEvidenceFacts(sourceCore);
  const requiredEntities = extractEvidenceFacts(record.originalTitle || '');
  const allowedFacts = extractEvidenceFacts(sourceEvidence);
  const outputFacts = extractEvidenceFacts(
    `${value.titleZh}\n${value.summaryZh}`,
    sourceEvidence
  );
  compareFacts(requiredFacts, allowedFacts, outputFacts, details, requiredEntities);
  if (details.addedFacts.length) reasons.push('added-facts');
  if (details.missingFacts.length) reasons.push('missing-key-facts');

  const expectedCategory = record.category || classifyCategory(sourceCore, record.storyType);
  if (CATEGORIES.includes(expectedCategory) && value.categoryZh !== expectedCategory) {
    reasons.push('category-conflict');
  }

  const expectedFactLevel = record.expectedFactLevel || inferFactLevel(sourceCore, record.storyType);
  if (!record.skipGenericCertaintyReview) {
    const certaintyReview = inspectCertaintyPreservation(
      sourceEvidence,
      `${value.titleZh}\n${value.summaryZh}`,
      expectedFactLevel
    );
    if (certaintyReview.reasons.length) {
      reasons.push(...certaintyReview.reasons);
      details.unsafeFragments.push(...certaintyReview.fragments);
    }
  }
  if (expectedFactLevel === 'rumor') {
    if (value.factLevel === 'confirmed') reasons.push('rumor-marked-confirmed');
    if (!/(据报道|据消息|有消息称|可能|有意|考虑|关注|寻求|尚未|传闻|流言|预计)/.test(`${value.titleZh} ${value.summaryZh}`)) {
      reasons.push('rumor-as-fact');
    }
  }
  if (expectedFactLevel === 'analysis') {
    if (value.factLevel !== 'analysis') reasons.push('analysis-marked-as-fact');
    if (!/(分析|认为|观点|评估|预测|可能|有望|被视为|或将|讨论|表示|称|谈到|提到|指出|希望)/.test(value.summaryZh)) {
      reasons.push('analysis-as-fact');
      reasons.push('analysis-presented-as-fact');
    }
  }
  if (expectedFactLevel === 'reported' && value.factLevel === 'confirmed' && RUMOR_SIGNALS.test(sourceCore)) {
    reasons.push('reported-story-strengthened');
  }

  return reasons.length
    ? { ok: false, reasons: [...new Set(reasons)], details, value }
    : { ok: true, reasons: [], details, value };
}

export function materializePayload(records, status, now = new Date().toISOString()) {
  const accepted = records
    .filter((record) => record.aiStatus === 'accepted' && record.editorial)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, 80)
    .map(materializeItem);

  const highlights = buildHighlights(accepted, now);
  const queue = summarizeQueue(records, now);
  return cleanStringsDeep({
    schemaVersion: '2.0',
    pipelineVersion: PIPELINE_VERSION,
    source: 'RealGM',
    feed: 'https://basketball.realgm.com/rss/wiretap/15/0.xml',
    updatedAt: status.updatedAt || now,
    lastFetchStatus: {
      ...status,
      acceptedItems: accepted.length,
      queue
    },
    highlights,
    items: accepted
  });
}

export function summarizeQueue(records, now = new Date().toISOString()) {
  const nowMs = new Date(now).getTime();
  const counts = Object.fromEntries(AI_STATUSES.map((status) => [
    status,
    records.filter((record) => record.aiStatus === status).length
  ]));
  return {
    ...counts,
    total: records.length,
    due: records.filter((record) => (
      ['pending', 'rejected', 'failed'].includes(record.aiStatus) &&
      new Date(record.nextRetryAt || 0).getTime() <= nowMs
    )).length
  };
}

export function migrateLegacyRecord(item, now = new Date().toISOString()) {
  const originalTitle = item.originalTitle || item.title || '';
  const originalSummary = item.originalSummary || item.summary || '';
  const storyType = item.storyType || inferStoryType(`${originalTitle} ${originalSummary}`);
  const category = item.categoryZh || item.category || classifyCategory(`${originalTitle} ${originalSummary}`, storyType);
  const titleZh = normalizeChineseText(item.titleZh || item.headlineZh || item.oneLineZh || '');
  const summaryZh = normalizeChineseText(item.summaryZh || '');
  const titleSafety = inspectChineseCopy(titleZh, { minHan: 5, maxLength: 80 });
  const summarySafety = inspectChineseCopy(summaryZh, { minHan: 18, maxLength: 260 });
  const canAccept = titleSafety.ok && summarySafety.ok && !GENERIC_ZH_PATTERNS.some((pattern) => pattern.test(`${titleZh} ${summaryZh}`));
  const editorial = canAccept
    ? {
        titleZh,
        summaryZh,
        categoryZh: CATEGORIES.includes(category) ? category : '其他',
        tagsZh: [CATEGORIES.includes(category) ? category : 'NBA'],
        confidence: Number(item.aiConfidence) || 0.65,
        factLevel: FACT_LEVELS.includes(item.factLevel)
          ? item.factLevel
          : inferFactLevel(`${originalTitle} ${originalSummary}`, storyType),
        model: item.aiModel || 'legacy-quality-gate',
        generatedAt: item.aiGeneratedAt || now,
        editorSource: 'migration-validated'
      }
    : null;

  return cleanStringsDeep({
    newsId: item.newsId || item.id,
    sourceHash: item.sourceHash || '',
    source: item.source || 'RealGM',
    feed: item.feed || '',
    originalTitle,
    originalSummary,
    url: canonicalizeUrl(item.url || item.link),
    publishedAt: normalizeDate(item.publishedAt || item.pubDate),
    storyType,
    expectedFactLevel: inferFactLevel(`${originalTitle} ${originalSummary}`, storyType),
    category: CATEGORIES.includes(category) ? category : '其他',
    importance: Number(item.importance) || scoreImportance({ ...item, storyType }),
    eventKey: item.eventKey || buildEventKey({ ...item, storyType }),
    aiStatus: canAccept ? 'accepted' : 'pending',
    retryCount: 0,
    queuedAt: now,
    processingStartedAt: null,
    processedAt: canAccept ? now : null,
    nextRetryAt: null,
    lastAttemptAt: null,
    lastError: null,
    rejectionReasons: [],
    editorial
  });
}

export function normalizeChineseText(value = '') {
  let text = normalizeWhitespace(value)
    .replace(/\bqualifying offer\b/gi, '资质报价')
    .replace(/\boffer sheet\b/gi, '报价合同')
    .replace(/\bsecond apron\b/gi, '第二土豪线')
    .replace(/\bfirst apron\b/gi, '第一土豪线')
    .replace(/76\s*人/g, '76 人')
    .replace(/([^\s])76 人/g, '$1 76 人')
    .replace(/76 人([^\s，。！？、；：])/g, '76 人 $1')
    .replace(/76 人\s+([与的后将])/g, '76 人$1');

  for (const replacement of TEAM_REPLACEMENTS) {
    text = text.replace(replacement.pattern, replacement.zh);
  }
  for (const replacement of PLAYER_REPLACEMENTS) {
    text = text.replace(replacement.pattern, replacement.zh);
  }

  return normalizeWhitespace(
    text
      .replace(/(\d+(?:\.\d+)?)\s*万美元/g, '$1 万美元')
      .replace(/(\d+(?:\.\d+)?)\s*亿美元/g, '$1 亿美元')
      .replace(/(\d+)\s*年/g, '$1 年')
      .replace(/\s+([，。！？、；：])/g, '$1')
      .replace(/([，。！？、；：])\s+/g, '$1')
      .replace(/([一-龥])([A-Z][A-Za-zÀ-ž'’.:-]*(?:\s+[A-Z][A-Za-zÀ-ž'’.:-]*)*)/g, '$1 $2')
      .replace(/([A-Za-zÀ-ž'’.:-])([一-龥])/g, '$1 $2')
  );
}

export function inspectUnicodeIssues(value = '') {
  const text = String(value ?? '');
  const issues = new Set();
  if (text.includes('\uFFFD')) issues.add('unicode-replacement-character');

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) {
        issues.add('invalid-unicode-sequence');
      } else {
        index += 1;
      }
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      issues.add('invalid-unicode-sequence');
    }
  }

  return [...issues];
}

export function inspectChineseCopy(value, { minHan = 8, maxLength = 220 } = {}) {
  const text = normalizeWhitespace(value);
  const fragments = [...inspectUnicodeIssues(value)];
  const hanCount = (text.match(/\p{Script=Han}/gu) || []).length;
  if (!text) fragments.push('empty');
  if (hanCount < minHan) fragments.push('insufficient-chinese');
  if (text.length > maxLength) fragments.push('too-long');
  for (const phrase of FORBIDDEN_ENGLISH_PHRASES) {
    if (text.toLowerCase().includes(phrase)) fragments.push(phrase);
  }
  for (const match of text.matchAll(FORBIDDEN_ENGLISH_WORDS)) {
    fragments.push(match[0]);
  }
  for (const pattern of GENERIC_ZH_PATTERNS) {
    if (pattern.test(text)) fragments.push(pattern.source);
  }
  if (/[’']s(?=[\s，。！？]|$)/i.test(text)) fragments.push('english-possessive');
  if (ZH_TEAM_SIGNING_PATTERN.test(text)) fragments.push('player-signs-team-grammar');
  if (/签约\s*76 人|签约\s*球队/.test(text)) fragments.push('player-signs-team-grammar');

  const withoutProperNames = stripAllowedProperNames(text);
  const englishRun = withoutProperNames.match(/\b[a-z]+(?:\s+[a-z]+){1,}\b/i);
  if (englishRun) fragments.push(englishRun[0]);
  return { ok: fragments.length === 0, fragments: [...new Set(fragments)] };
}

function normalizeEditorialPersonNames(value, sourceEvidence) {
  let text = String(value || '');
  for (const [id, zh, aliases] of NBA_PERSON_GROUPS) {
    if (!aliases.some((alias) => containsAlias(sourceEvidence, alias))) continue;
    for (const alias of aliases) {
      text = text.replace(new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'gi'), zh);
    }
    for (const badOutput of NBA_PERSON_KNOWN_BAD_OUTPUTS.get(id) || []) {
      text = text.replace(new RegExp(escapeRegExp(badOutput), 'g'), zh);
    }
  }
  return normalizeChineseText(text);
}

function inspectCertaintyPreservation(sourceValue, outputValue, expectedFactLevel) {
  const sourceText = String(sourceValue || '').replace(/[\r\n]+/g, '. ');
  const outputText = normalizeWhitespace(outputValue);
  const reasons = [];
  const fragments = [];

  const negationChecks = [
    {
      label: 'not-expected-to',
      source: /\b(?:is|are|was|were|be)?\s*not expected to\b/i,
      preserved: /(?:预计不会|预计不|不太可能|尚无|没有|不会|未被预计|预计仍|预计留队)/
    },
    {
      label: 'no-indication',
      source: /\bno indication(?:s)?\b/i,
      preserved: /(?:没有迹象|暂无迹象|尚无迹象|未有迹象|没有显示)/
    },
    {
      label: 'not-decided',
      source: /\b(?:has|have|had)\s+(?:not|yet to)\s+decid(?:e|ed)\b|\bhasn't decided\b/i,
      preserved: /(?:尚未决定|还未决定|没有决定|未作决定|仍在考虑|决定尚未作出)/
    },
    {
      label: 'no-interest',
      source: /\b(?:had|has|have|showed|expressed)?\s*no interest in\b/i,
      preserved: /(?:无意|没有兴趣|不感兴趣|不考虑|拒绝)/
    }
  ];

  for (const check of negationChecks) {
    if (!check.source.test(sourceText) || check.preserved.test(outputText)) continue;
    reasons.push('negation-lost');
    fragments.push(`source-negation:${check.label}`);
  }

  const sourceClaims = extractSourceCertaintyClaims(sourceText);
  const outputClaims = extractDefiniteChineseClaims(outputText);
  for (const sourceClaim of sourceClaims) {
    if (sourceClaim.marker === 'reported') {
      const preservesReportedStatus = CHINESE_REPORT_ATTRIBUTION.test(outputText) ||
        CHINESE_ACTION_UNCERTAINTY.test(outputText);
      if (!preservesReportedStatus && outputClaims.length) {
        reasons.push('certainty-escalation');
        fragments.push('source-reported:output-unattributed-definite');
      }
      continue;
    }

    for (const outputClaim of outputClaims) {
      if (!certaintyActionsOverlap(sourceClaim.action, outputClaim.action)) continue;
      if (hasChineseUncertaintyNear(outputText, outputClaim.index)) continue;
      reasons.push('certainty-escalation');
      fragments.push(`source-${sourceClaim.marker}:${sourceClaim.action}->output-definite:${outputClaim.action}`);
    }
  }

  if (expectedFactLevel === 'analysis' &&
      !/(?:分析|文章|报道|记者|认为|观点|评估|预测|可能|有望|被视为|或将|讨论|表示|称|谈到|提到|指出|希望)/.test(outputText)) {
    reasons.push('analysis-presented-as-fact');
    fragments.push('analysis-without-attribution-or-modality');
  }

  return {
    reasons: [...new Set(reasons)],
    fragments: [...new Set(fragments)]
  };
}

function extractSourceCertaintyClaims(sourceText) {
  const clauses = String(sourceText || '')
    .split(/(?<=[.!?;])\s+|,\s+(?=(?:but|however|while|and)\b)/i)
    .map(normalizeWhitespace)
    .filter(Boolean);
  const claims = [];

  for (const clause of clauses) {
    for (const [marker, pattern] of Object.entries(SOURCE_CERTAINTY_MARKERS)) {
      if (!pattern.test(clause)) continue;
      const actions = Object.entries(SOURCE_ACTION_PATTERNS)
        .filter(([, actionPattern]) => actionPattern.test(clause))
        .map(([action]) => action);
      if (!actions.length) {
        if (marker === 'interest') actions.push('acquisition');
        else if (marker === 'considering') actions.push('general');
        else if (marker === 'reported') actions.push('reported');
        else actions.push('general');
      }
      for (const action of actions) claims.push({ marker, action });
    }
  }

  return claims.filter((claim, index, all) => (
    all.findIndex((entry) => entry.marker === claim.marker && entry.action === claim.action) === index
  ));
}

function extractDefiniteChineseClaims(outputText) {
  const claims = [];
  for (const { action, pattern } of CHINESE_DEFINITE_ACTION_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of outputText.matchAll(pattern)) {
      claims.push({ action, index: match.index || 0, text: match[0] });
    }
  }
  return claims;
}

function certaintyActionsOverlap(sourceAction, outputAction) {
  if (sourceAction === 'general' || sourceAction === outputAction) return true;
  if (sourceAction === 'reported') return true;
  if (sourceAction === 'acquisition') return ['join', 'trade'].includes(outputAction);
  return (sourceAction === 'stay' && outputAction === 'leave') ||
    (sourceAction === 'leave' && outputAction === 'stay');
}

function hasChineseUncertaintyNear(text, index) {
  const context = text.slice(Math.max(0, index - 12), index + 8);
  return CHINESE_ACTION_UNCERTAINTY.test(context);
}

export function extractEvidenceFacts(text = '', personContext = text) {
  const value = normalizeWhitespace(text);
  return {
    teams: extractTeamIds(value),
    players: extractPeople(value, normalizeWhitespace(personContext || value)),
    money: extractMoneyFacts(value),
    durations: extractDurationFacts(value),
    picks: extractPickFacts(value),
    scores: extractScoreFacts(value)
  };
}

function materializeItem(record) {
  const editorial = record.editorial;
  return cleanStringsDeep({
    newsId: record.newsId,
    id: record.newsId,
    source: record.source,
    feed: record.feed,
    url: record.url,
    link: record.url,
    originalTitle: record.originalTitle,
    originalSummary: record.originalSummary,
    titleZh: editorial.titleZh,
    headlineZh: editorial.titleZh,
    displayTitle: editorial.titleZh,
    summaryZh: editorial.summaryZh,
    oneLineZh: editorial.oneLineZh || editorial.titleZh,
    categoryZh: record.category || editorial.categoryZh,
    category: record.category || editorial.categoryZh,
    tagsZh: editorial.tagsZh,
    confidence: editorial.confidence,
    aiConfidence: editorial.confidence,
    factLevel: record.expectedFactLevel || editorial.factLevel,
    aiStatus: 'accepted',
    storyType: record.storyType,
    importance: record.importance,
    eventKey: record.eventKey,
    publishedAt: record.publishedAt,
    pubDate: record.publishedAt,
    processedAt: record.processedAt,
    copySource: editorial.editorSource || 'workers-ai',
    aiModel: editorial.model,
    aiGeneratedAt: editorial.generatedAt,
    imageUrl: record.imageUrl || ''
  });
}

function buildHighlights(items, now) {
  const cutoff = new Date(now).getTime() - 24 * 36e5;
  const seen = new Set();
  return items
    .filter((item) => new Date(item.publishedAt).getTime() >= cutoff)
    .filter((item) => item.importance >= 4)
    .filter((item) => ['交易', '签约', '伤病', '选秀', '流言'].includes(item.categoryZh))
    .filter((item) => {
      if (seen.has(item.eventKey)) return false;
      seen.add(item.eventKey);
      return true;
    })
    .slice(0, 3)
    .map((item) => ({
      id: item.newsId,
      text: item.titleZh,
      category: item.categoryZh,
      source: item.source,
      link: item.url,
      eventKey: item.eventKey
    }));
}

function compareFacts(required, allowed, output, details, requiredEntities = required) {
  const factGroups = ['money', 'durations', 'picks', 'scores'];
  for (const group of factGroups) {
    for (const fact of required[group]) {
      if (!output[group].includes(fact)) details.missingFacts.push(`${group}:${fact}`);
    }
    for (const fact of output[group]) {
      if (!allowed[group].includes(fact)) details.addedFacts.push(`${group}:${fact}`);
    }
  }

  for (const team of requiredEntities.teams.slice(0, 3)) {
    if (!output.teams.includes(team)) details.missingFacts.push(`team:${team}`);
  }
  for (const team of output.teams) {
    if (!allowed.teams.includes(team)) details.addedFacts.push(`team:${team}`);
  }

  for (const player of requiredEntities.players.slice(0, 3)) {
    if (!output.players.includes(player)) details.missingFacts.push(`player:${player}`);
  }
  for (const player of output.players) {
    if (!allowed.players.includes(player)) details.addedFacts.push(`player:${player}`);
  }

  details.addedFacts = [...new Set(details.addedFacts)];
  details.missingFacts = [...new Set(details.missingFacts)];
}

function extractTeamIds(text = '') {
  const found = [];
  for (const [alias, metadata] of TEAM_LOOKUP) {
    if (containsAlias(text, alias) && !found.includes(metadata.id)) found.push(metadata.id);
  }
  return found;
}

function extractPeople(text = '', personContext = text) {
  const found = [];
  for (const [alias, metadata] of PLAYER_LOOKUP) {
    if (containsAlias(text, alias) && !found.includes(metadata.id)) found.push(metadata.id);
  }
  for (const id of extractCanonicalPersonIds(text, personContext, 'player')) {
    if (!found.includes(id)) found.push(id);
  }

  let scrubbed = String(text);
  for (const [, , aliases] of TEAM_GROUPS) {
    for (const alias of aliases) {
      scrubbed = scrubbed.replace(new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'gi'), ' | ');
    }
  }
  for (const [, , aliases] of PLAYER_GROUPS) {
    for (const alias of aliases) {
      scrubbed = scrubbed.replace(new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'gi'), ' | ');
    }
  }
  for (const [, zh, aliases] of NBA_PERSON_GROUPS) {
    scrubbed = scrubbed.replace(new RegExp(escapeRegExp(zh), 'g'), ' | ');
    for (const alias of aliases) {
      scrubbed = scrubbed.replace(new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'gi'), ' | ');
    }
  }
  for (const entity of CANONICAL_PERSON_ENTITIES) {
    for (const alias of [...entity.englishNames, ...entity.chineseNames]) {
      const pattern = /^[A-Za-z0-9]/.test(alias) && /[A-Za-z0-9]$/.test(alias)
        ? `\\b${escapeRegExp(alias)}\\b`
        : escapeRegExp(alias);
      scrubbed = scrubbed.replace(new RegExp(pattern, 'gi'), ' | ');
    }
  }
  scrubbed = scrubbed.replace(PERSON_BOUNDARY_WORDS, ' | ');
  const matches = [...scrubbed.matchAll(PERSON_CANDIDATE_PATTERN)];
  for (const match of matches) {
    const candidate = match[0];
    if (!isLikelyPersonCandidate(candidate, scrubbed, match.index || 0)) continue;
    if (extractTeamIds(candidate).length) continue;
    const normalized = slug(candidate);
    if (normalized && !found.includes(normalized)) found.push(normalized);
  }
  return found;
}

function extractCanonicalPersonIds(text = '', personContext = text, role = '') {
  const outputText = normalizeWhitespace(text);
  const evidenceText = normalizeWhitespace(`${personContext || ''} ${outputText}`);
  const found = [];

  for (const entity of CANONICAL_PERSON_ENTITIES) {
    if (role && entity.role !== role) continue;
    const fullNames = [...entity.englishNames, ...entity.chineseNames];
    if (fullNames.some((name) => containsAlias(outputText, name))) {
      found.push(entity.id);
    }
  }

  const shortNames = [...new Set(
    CANONICAL_PERSON_ENTITIES
      .filter((entity) => !role || entity.role === role)
      .flatMap((entity) => entity.shortNames)
  )];
  for (const shortName of shortNames) {
    if (!containsAlias(outputText, shortName)) continue;
    const candidates = CANONICAL_PERSON_ENTITIES.filter((entity) => (
      (!role || entity.role === role) &&
      entity.shortNames.includes(shortName) &&
      [...entity.englishNames, ...entity.chineseNames]
        .some((name) => containsAlias(evidenceText, name))
    ));
    if (candidates.length === 1 && !found.includes(candidates[0].id)) {
      found.push(candidates[0].id);
    }
  }

  return found;
}

function buildPlayerNameRules(text = '') {
  const rules = [];
  const covered = new Set();
  for (const [id, zh, aliases] of PLAYER_GROUPS) {
    const matched = aliases.find((alias) => containsAlias(text, alias));
    if (!matched) continue;
    rules.push({ source: matched, output: zh });
    covered.add(id);
  }

  for (const name of extractPersonDisplayNames(text)) {
    const id = slug(name);
    if (!id || covered.has(id)) continue;
    rules.push({ source: name, output: name, instruction: '保留英文' });
    covered.add(id);
  }
  return rules;
}

function buildCoreFactBrief(record) {
  const evidence = [
    record.originalTitle,
    firstSentence(record.originalSummary)
  ].filter(Boolean).join('\n');
  const facts = extractEvidenceFacts(evidence);
  return {
    teamsZh: facts.teams.map((id) => getGroupZh(TEAM_GROUPS, id)).filter(Boolean),
    playerNames: buildPlayerNameRules(record.originalTitle).map((rule) => rule.output),
    contractAmountsZh: facts.money.map(formatMoneyFactZh).filter(Boolean),
    contractYearsZh: facts.durations.map((fact) => `${fact.split(':').at(-1)} 年`),
    draftAssetsZh: facts.picks.map(formatPickFactZh).filter(Boolean),
    scores: facts.scores.map((fact) => fact.replace(/^score:/, '').replace(':', ' 比 '))
  };
}

function getGroupZh(groups, id) {
  return groups.find(([groupId]) => groupId === id)?.[1] || '';
}

function formatMoneyFactZh(fact) {
  const millions = Number(String(fact).split(':').at(-1));
  if (!Number.isFinite(millions)) return '';
  return `${stripNumber(millions * 100)} 万美元`;
}

function formatPickFactZh(fact) {
  const [, round, count] = String(fact).split(':');
  if (!round || !count) return '';
  return `${count} 个${round === 'first' ? '首轮签' : '次轮签'}`;
}

function extractPersonDisplayNames(text = '') {
  let scrubbed = String(text);
  for (const [, , aliases] of TEAM_GROUPS) {
    for (const alias of aliases) {
      scrubbed = scrubbed.replace(new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'gi'), ' | ');
    }
  }
  for (const [, , aliases] of PLAYER_GROUPS) {
    for (const alias of aliases) {
      scrubbed = scrubbed.replace(new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'gi'), ' | ');
    }
  }
  for (const [, zh, aliases] of NBA_PERSON_GROUPS) {
    scrubbed = scrubbed.replace(new RegExp(escapeRegExp(zh), 'g'), ' | ');
    for (const alias of aliases) {
      scrubbed = scrubbed.replace(new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'gi'), ' | ');
    }
  }
  scrubbed = scrubbed.replace(PERSON_BOUNDARY_WORDS, ' | ');
  return [...new Set(
    [...scrubbed.matchAll(PERSON_CANDIDATE_PATTERN)]
      .filter((match) => (
        isLikelyPersonCandidate(match[0], scrubbed, match.index || 0) &&
        extractTeamIds(match[0]).length === 0
      ))
      .map((match) => match[0])
  )];
}

function isLikelyPersonCandidate(candidate, sourceText = '', startIndex = 0) {
  const normalized = normalizeWhitespace(candidate);
  const comparableCandidate = normalized
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[.,:;!?]+$/g, '');
  if (
    !normalized ||
    NON_PERSON_PHRASES.has(comparableCandidate) ||
    TEAM_CITY_TERMS.has(comparableCandidate) ||
    LEAGUE_SALARY_TERMS.has(comparableCandidate)
  ) return false;
  if (/[.!?]\s/.test(normalized.replace(/\b(?:Jr|Sr)\.\s/g, ''))) return false;

  const words = comparableCandidate
    .split(/\s+/)
    .map((word) => word.replace(/^[^a-z]+|[^a-z]+$/g, ''))
    .filter(Boolean);
  const rawWords = normalized
    .split(/\s+/)
    .map((word) => word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ''))
    .filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  if (words.every((word) => SOURCE_WORDS_LOWER.has(word))) return false;
  if (words.some((word) => NON_PERSON_WORDS.has(word))) return false;
  if (rawWords.every((word) => /^[A-Z]{2,5}$/.test(word))) return false;

  const followingText = sourceText.slice(startIndex + candidate.length);
  if (/^\s*:/.test(followingText) && words.some((word) => NON_PERSON_WORDS.has(word))) {
    return false;
  }
  return true;
}

function firstSentence(value = '') {
  const text = normalizeWhitespace(value);
  if (!text) return '';
  return text.split(/(?<=[.!?。！？])\s+/)[0] || text;
}

function extractMoneyFacts(text = '') {
  const facts = [];
  for (const match of String(text).matchAll(/\$(\d+(?:\.\d+)?)\s*(b|billion|m|million)?\b/gi)) {
    const raw = Number(match[1]);
    if (!Number.isFinite(raw)) continue;
    const multiplier = /^b/i.test(match[2] || '') ? 1000 : 1;
    facts.push(`usd-million:${stripNumber(raw * multiplier)}`);
  }
  for (const match of String(text).matchAll(/(\d+(?:\.\d+)?)\s*(亿|万)\s*美元/g)) {
    const raw = Number(match[1]);
    const millions = match[2] === '亿' ? raw * 100 : raw / 100;
    facts.push(`usd-million:${stripNumber(millions)}`);
  }
  return [...new Set(facts)];
}

function extractDurationFacts(text = '') {
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  const chineseWords = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
  const facts = [];
  for (const match of String(text).matchAll(/\b(one|two|three|four|five|six|\d+)[-\s]+year\b/gi)) {
    const value = words[match[1].toLowerCase()] || Number(match[1]);
    if (Number.isFinite(value)) facts.push(`years:${value}`);
  }
  for (const match of String(text).matchAll(/(\d+)\s*年/g)) {
    facts.push(`years:${Number(match[1])}`);
  }
  for (const match of String(text).matchAll(/([一两二三四五六])\s*年(?:期)?/g)) {
    facts.push(`years:${chineseWords[match[1]]}`);
  }
  return [...new Set(facts)];
}

function extractPickFacts(text = '') {
  const facts = [];
  const wordCount = { a: 1, one: 1, two: 2, three: 3, four: 4 };
  for (const match of String(text).matchAll(/\b(?:(a|one|two|three|four|\d+)\s+)?(first|second)[-\s]+round picks?\b/gi)) {
    const count = wordCount[String(match[1] || 'a').toLowerCase()] || Number(match[1]) || 1;
    facts.push(`pick:${match[2].toLowerCase()}:${count}`);
  }
  for (const match of String(text).matchAll(/([一二两三四\d]+)\s*个?(首轮|次轮)签/g)) {
    const countMap = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4 };
    const count = countMap[match[1]] || Number(match[1]) || 1;
    facts.push(`pick:${match[2] === '首轮' ? 'first' : 'second'}:${count}`);
  }
  return [...new Set(facts)];
}

function extractScoreFacts(text = '') {
  const facts = [];
  for (const match of String(text).matchAll(/\b(\d{2,3})\s*[-:]\s*(\d{2,3})\b/g)) {
    facts.push(`score:${match[1]}:${match[2]}`);
  }
  for (const match of String(text).matchAll(/(\d{2,3})\s*比\s*(\d{2,3})/g)) {
    facts.push(`score:${match[1]}:${match[2]}`);
  }
  return [...new Set(facts)];
}

function stripAllowedProperNames(text) {
  let value = ` ${text} `;
  for (const [alias] of [...TEAM_LOOKUP, ...PLAYER_LOOKUP, ...NBA_PERSON_LOOKUP]) {
    value = value.replace(new RegExp(escapeRegExp(alias), 'gi'), ' ');
  }
  value = value
    .replace(/\b(?:NBA|MVP|ESPN|RealGM|Yahoo Sports|MSG|L\.A\.|Summer League|Aspiration)\b/gi, ' ')
    .replace(/\b[A-Z][A-Za-zÀ-ž'’.-]+(?:\s+[A-Z][A-Za-zÀ-ž'’.-]+){1,3}\b/g, ' ');
  return normalizeWhitespace(value);
}

function buildDirectJsonRequest(prompt, maxTokens, { retry, role, fields }) {
  const retryInstruction = retry
    ? 'The previous response was structurally invalid. Return one complete JSON object with every required field.'
    : 'Return one complete JSON object with every required field.';
  return {
    messages: [
      {
        role: 'system',
        content: [
          '/no_think',
          `You are ${role}.`,
          'Disable thinking output. Never return reasoning, Markdown, code fences, or explanations.',
          `Only return JSON with these fields: ${fields}.`,
          retryInstruction
        ].join('\n')
      },
      {
        role: 'user',
        content: ['/no_think', prompt, retryInstruction, 'JSON only.'].join('\n')
      }
    ],
    max_tokens: maxTokens,
    temperature: 0.1,
    top_p: 0.8,
    top_k: 20,
    stream: false
  };
}

function normalizeStructuredAiResponse(
  response,
  isComplete,
  isCandidate,
  parseCandidate = parseJsonCandidate
) {
  const finishReason = String(
    response?.finish_reason ||
    response?.result?.finish_reason ||
    response?.choices?.[0]?.finish_reason ||
    ''
  );
  const message = response?.choices?.[0]?.message || response?.result?.choices?.[0]?.message;
  const toolCalls = [
    ...(Array.isArray(response?.tool_calls) ? response.tool_calls : []),
    ...(Array.isArray(response?.result?.tool_calls) ? response.result.tool_calls : []),
    ...(Array.isArray(message?.tool_calls) ? message.tool_calls : [])
  ];
  const candidates = [
    ...toolCalls.map((toolCall) => toolCall?.arguments ?? toolCall?.function?.arguments),
    response?.response,
    response?.result?.response,
    normalizeMessageContent(message?.content),
    response?.result,
    response
  ];
  let parsed = null;
  let rawContent = '';
  let incompleteSchema = false;
  let incompleteShape = null;

  for (const candidate of candidates) {
    if (candidate == null) continue;
    if (isComplete(candidate)) {
      parsed = candidate;
      rawContent = JSON.stringify(candidate);
      break;
    }
    if (isCandidate(candidate)) {
      incompleteSchema = true;
      rawContent = JSON.stringify(candidate);
      incompleteShape = describeJsonShape(candidate);
      continue;
    }
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    rawContent = candidate;
    const parsedCandidate = parseCandidate(candidate);
    if (!parsedCandidate) continue;
    if (isComplete(parsedCandidate)) {
      parsed = parsedCandidate;
      break;
    }
    if (isCandidate(parsedCandidate)) {
      incompleteSchema = true;
      incompleteShape = describeJsonShape(parsedCandidate);
    }
  }

  const normalizedRawContent = normalizeWhitespace(rawContent);
  const lowerFinishReason = finishReason.toLowerCase();
  const structuralFailureReason = parsed
    ? null
    : incompleteSchema
      ? 'qwen-incomplete-schema'
      : !normalizedRawContent && lowerFinishReason === 'length'
        ? 'qwen-length-stop'
        : !normalizedRawContent
          ? 'qwen-empty-content'
          : 'qwen-invalid-json';
  return {
    parsed,
    rawContent: normalizedRawContent,
    contentLength: normalizedRawContent.length,
    finishReason,
    isEmptyLengthResponse: !parsed && !normalizedRawContent && lowerFinishReason === 'length',
    structuralFailureReason,
    incompleteShape
  };
}

function normalizeEvidenceExtraction(result) {
  return cleanStringsDeep({
    evidenceItems: (Array.isArray(result.evidenceItems) ? result.evidenceItems : [])
      .map((item) => ({
        id: normalizeWhitespace(item?.id),
        evidenceQuote: normalizeWhitespace(item?.evidenceQuote),
        attributionName: normalizeWhitespace(item?.attributionName),
        attributionQuote: normalizeWhitespace(item?.attributionQuote)
      }))
      .slice(0, FACT_EVIDENCE_MAX_ITEMS)
  });
}

function validateEvidenceExtraction(result, record, articleText) {
  const details = createFactValidationDetails();
  const evidenceExtraction = normalizeEvidenceExtraction(result);
  if (!isEvidenceExtractionObject(evidenceExtraction)) {
    return { ok: false, reasons: ['fact-schema-invalid'], details, value: null };
  }

  const storyType = inferPhase1StoryType(record);
  const sourceFields = buildFactSourceFields(record, articleText);
  const facts = [];

  for (const [index, item] of evidenceExtraction.evidenceItems.entries()) {
    const location = locateEvidenceQuote(item.evidenceQuote, sourceFields);
    if (!location) {
      details.evidenceNotFound.push(item.id);
      details.unsupportedEvents.push(item.id);
      continue;
    }
    details.evidenceLocated.push(`${item.id}:${location.sourceField}`);

    const certainty = inferClaimCertainty(item.evidenceQuote, storyType);
    const polarity = containsFactNegation(item.evidenceQuote) ? 'negative' : 'positive';
    const attributionResult = validateEvidenceAttribution(
      item,
      sourceFields,
      record,
      storyType,
      certainty
    );
    if (attributionResult.evidenceNotFound) {
      details.attributionEvidenceNotFound.push(item.id);
    }
    if (attributionResult.missingOrUnsupported) {
      details.attributionMismatches.push(item.id);
    }

    const extracted = extractEvidenceFacts(item.evidenceQuote, location.sourceText);
    facts.push({
      id: `fact-${index + 1}`,
      factText: item.evidenceQuote,
      certainty,
      polarity,
      attribution: attributionResult.name,
      attributionQuote: attributionResult.quote,
      sourceField: location.sourceField,
      evidenceQuote: item.evidenceQuote,
      entities: buildDeterministicFactEntities(extracted),
      numbers: buildDeterministicFactNumbers(extracted)
    });
  }

  if (
    ['interview', 'analysis'].includes(storyType) &&
    facts.length > 0 &&
    !facts.some((fact) => fact.attribution)
  ) {
    details.attributionMismatches.push(`story:${storyType}`);
  }

  const value = normalizeFactExtraction({
    storyType,
    facts,
    mustNotClaim: buildDeterministicMustNotClaim(facts)
  });
  const generatedValidation = facts.length
    ? validateGeneratedFactExtraction(value, record, articleText)
    : {
        ok: false,
        reasons: ['fact-evidence-not-found'],
        details: createFactValidationDetails(),
        value
      };
  mergeFactValidationDetails(details, generatedValidation.details);
  const reasons = collectFactValidationReasons(details);

  return reasons.length
    ? { ok: false, reasons, details: dedupeFactValidationDetails(details), value }
    : { ok: true, reasons: [], details: dedupeFactValidationDetails(details), value };
}

function validateGeneratedFactExtraction(result, record, articleText) {
  const details = createFactValidationDetails();
  const value = normalizeFactExtraction(result);
  if (!isFactExtractionObject(value)) {
    return { ok: false, reasons: ['fact-schema-invalid'], details, value: null };
  }

  const sourceFields = buildFactSourceFields(record, articleText);
  for (const fact of value.facts) {
    const location = locateEvidenceQuote(fact.evidenceQuote, sourceFields);
    if (!location || location.sourceField !== fact.sourceField) {
      details.evidenceNotFound.push(fact.id);
      details.unsupportedEvents.push(fact.id);
      continue;
    }
    details.evidenceLocated.push(`${fact.id}:${location.sourceField}`);

    const expectedCertainty = inferClaimCertainty(fact.evidenceQuote, value.storyType);
    if (fact.certainty !== expectedCertainty) {
      details.certaintyMismatches.push(
        `${fact.id}:${expectedCertainty}->${fact.certainty}`
      );
    }

    const expectedPolarity = containsFactNegation(fact.evidenceQuote) ? 'negative' : 'positive';
    if (fact.polarity !== expectedPolarity) {
      details.negationMismatches.push(fact.id);
    }

    const attributionResult = validateEvidenceAttribution({
      id: fact.id,
      evidenceQuote: fact.evidenceQuote,
      attributionName: fact.attribution,
      attributionQuote: fact.attributionQuote
    }, sourceFields, record, value.storyType, fact.certainty);
    if (attributionResult.evidenceNotFound) {
      details.attributionEvidenceNotFound.push(fact.id);
    }
    if (attributionResult.missingOrUnsupported) {
      details.attributionMismatches.push(fact.id);
    }

    const extracted = extractEvidenceFacts(fact.evidenceQuote, location.sourceText);
    const expectedEntities = buildDeterministicFactEntities(extracted);
    const expectedNumbers = buildDeterministicFactNumbers(extracted);
    if (JSON.stringify(fact.entities) !== JSON.stringify(expectedEntities)) {
      details.entityMismatches.push(fact.id);
    }
    if (JSON.stringify(fact.numbers) !== JSON.stringify(expectedNumbers)) {
      details.numberMismatches.push(fact.id);
    }
  }

  const reasons = collectFactValidationReasons(details);
  return reasons.length
    ? { ok: false, reasons, details: dedupeFactValidationDetails(details), value }
    : { ok: true, reasons: [], details: dedupeFactValidationDetails(details), value };
}

function createFactValidationDetails() {
  return {
    evidenceLocated: [],
    evidenceNotFound: [],
    attributionEvidenceNotFound: [],
    numberMismatches: [],
    entityMismatches: [],
    certaintyMismatches: [],
    negationMismatches: [],
    attributionMismatches: [],
    unsupportedEvents: []
  };
}

function mergeFactValidationDetails(target, source = {}) {
  for (const key of Object.keys(target)) {
    target[key].push(...(Array.isArray(source[key]) ? source[key] : []));
  }
}

function collectFactValidationReasons(details) {
  const reasons = [];
  if (details.evidenceNotFound.length) reasons.push('fact-evidence-not-found');
  if (details.attributionEvidenceNotFound.length) {
    reasons.push('fact-attribution-evidence-not-found');
  }
  if (details.numberMismatches.length) reasons.push('fact-number-mismatch');
  if (details.entityMismatches.length) reasons.push('fact-entity-unsupported');
  if (details.certaintyMismatches.length) reasons.push('fact-certainty-mismatch');
  if (details.negationMismatches.length) reasons.push('fact-negation-lost');
  if (details.attributionMismatches.length) reasons.push('fact-attribution-missing');
  return [...new Set(reasons)];
}

function buildFactSourceFields(record, articleText) {
  return {
    title: normalizeWhitespace(record.originalTitle || ''),
    rssSummary: normalizeWhitespace(
      record.originalSummary ||
      record.rssSummary ||
      record.summary ||
      ''
    ),
    articleText: normalizeWhitespace(articleText || '')
  };
}

export function locateEvidenceQuote(evidenceQuote, sourceFields) {
  const quote = normalizeWhitespace(evidenceQuote);
  if (!quote || quote.length > FACT_EVIDENCE_MAX_LENGTH) return null;
  const priority = { title: 0, rssSummary: 1, articleText: 2 };
  const matches = FACT_SOURCE_FIELDS
    .map((sourceField) => ({
      sourceField,
      sourceText: normalizeWhitespace(sourceFields?.[sourceField] || ''),
      priority: priority[sourceField]
    }))
    .filter((entry) => (
      entry.sourceText &&
      evidenceSnippetMatches(entry.sourceText, quote)
    ))
    .sort((a, b) => (
      normalizeEvidenceForMatch(a.sourceText).length -
        normalizeEvidenceForMatch(b.sourceText).length ||
      a.priority - b.priority
    ));
  return matches[0] || null;
}

function validateEvidenceAttribution(
  item,
  sourceFields,
  record,
  storyType,
  certainty
) {
  const name = normalizeWhitespace(item.attributionName);
  const quote = normalizeWhitespace(item.attributionQuote);
  const required = requiresEvidenceAttribution(storyType, certainty, item.evidenceQuote);
  if (!name && !quote) {
    const derived = deriveEvidenceAttribution(
      sourceFields,
      record,
      storyType,
      item.evidenceQuote
    );
    return {
      name: derived.name,
      quote: derived.quote,
      evidenceNotFound: false,
      missingOrUnsupported: required && !derived.name
    };
  }
  if (!name || !quote) {
    return {
      name: '',
      quote: '',
      evidenceNotFound: Boolean(quote && !locateEvidenceQuote(quote, sourceFields)),
      missingOrUnsupported: true
    };
  }

  const quoteLocation = locateEvidenceQuote(quote, sourceFields);
  if (!quoteLocation) {
    return {
      name: '',
      quote: '',
      evidenceNotFound: true,
      missingOrUnsupported: true
    };
  }
  const allSource = normalizeWhitespace([
    sourceFields.title,
    sourceFields.rssSummary,
    sourceFields.articleText,
    record.source
  ].filter(Boolean).join(' '));
  const supported = (
    containsNormalized(allSource, name) &&
    attributionQuoteSupportsName(quote, name, record.source)
  );
  return {
    name: supported ? name : '',
    quote: supported ? quote : '',
    evidenceNotFound: false,
    missingOrUnsupported: !supported
  };
}

function attributionQuoteSupportsName(quote, name, recordSource) {
  if (containsNormalized(quote, name)) return true;
  if (
    normalizeEvidenceForMatch(name) === normalizeEvidenceForMatch(recordSource) &&
    hasExplicitAttributionCue(quote)
  ) return true;
  const words = name.split(/\s+/).filter(Boolean);
  const surname = words.at(-1)?.replace(/[.'’]/g, '');
  return words.length > 1 && surname.length >= 4 && containsNormalized(quote, surname);
}

function requiresEvidenceAttribution(storyType, certainty, evidenceQuote) {
  if (certainty === 'opinion') return true;
  return hasExplicitAttributionCue(evidenceQuote);
}

function deriveEvidenceAttribution(sourceFields, record, storyType, evidenceQuote) {
  const named = findNamedAttribution(evidenceQuote);
  if (named) return named;

  if (storyType === 'interview') {
    const titleMatch = sourceFields.title.match(
      /^([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){1,3})\s+(?:On|Discusses|Explains|Reacts)\b/
    );
    if (titleMatch) {
      return {
        name: titleMatch[1],
        quote: titleMatch[0]
      };
    }
  }

  const programMatch = sourceFields.title.match(
    /^((?:Dunc['’]d On|The Athletic|ESPN|Yahoo Sports|RealGM))\s*:/
  );
  if (programMatch && storyType === 'analysis') {
    return {
      name: programMatch[1],
      quote: programMatch[0]
    };
  }

  if (
    hasExplicitAttributionCue(evidenceQuote) &&
    normalizeWhitespace(record.source)
  ) {
    return {
      name: normalizeWhitespace(record.source),
      quote: evidenceQuote
    };
  }

  return { name: '', quote: '' };
}

function findNamedAttribution(sourceText) {
  const text = normalizeWhitespace(sourceText);
  if (!text) return null;
  const afterName = text.match(
    /\b([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){1,3})\s+(said|says|told|wrote|writes|believes|thinks|predicts|argues|suggests)\b/
  );
  if (afterName) {
    return {
      name: afterName[1],
      quote: afterName[0]
    };
  }
  const beforeName = text.match(
    /\b(said|says|according to|per)\s+([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){1,3})\b/
  );
  if (beforeName) {
    return {
      name: beforeName[2],
      quote: beforeName[0]
    };
  }
  return null;
}

function buildDeterministicFactEntities(extracted) {
  return [
    ...extracted.teams.map((canonicalId) => ({ type: 'team', canonicalId })),
    ...extracted.players.map((canonicalId) => ({ type: 'person', canonicalId }))
  ];
}

function buildDeterministicFactNumbers(extracted) {
  return [
    ...extracted.money.map((value) => ({ type: 'money', value })),
    ...extracted.durations.map((value) => ({ type: 'contractYears', value })),
    ...extracted.picks.map((value) => ({ type: 'tradeAsset', value })),
    ...extracted.scores.map((value) => ({ type: 'score', value }))
  ];
}

function buildDeterministicMustNotClaim(facts) {
  const rules = [];
  for (const fact of facts) {
    const quote = fact.evidenceQuote;
    if (/\b(?:has|have|had) not decided\b|\b(?:has|have) yet to decide\b/i.test(quote)) {
      rules.push('Do not claim that a decision has been made.');
    }
    if (/\bnot expected to leave\b/i.test(quote)) {
      rules.push('Do not claim that the subject is expected to leave.');
    }
    if (fact.certainty === 'interest') {
      rules.push('Do not claim that interest became a signing or completed trade.');
    } else if (fact.certainty === 'expected') {
      rules.push('Do not claim that an expected action is confirmed or completed.');
    } else if (fact.certainty === 'likely') {
      rules.push('Do not claim that a likely action is confirmed or completed.');
    } else if (fact.certainty === 'possible') {
      rules.push('Do not claim that a possible action will happen or is completed.');
    } else if (fact.certainty === 'opinion') {
      rules.push('Do not present an opinion or analysis as a completed fact.');
    }
  }
  return [...new Set(rules)].slice(0, 2);
}

function normalizeFactExtraction(result) {
  return cleanStringsDeep({
    storyType: normalizeFactStoryType(result.storyType),
    facts: (Array.isArray(result.facts) ? result.facts : [])
      .map((fact, index) => ({
        id: normalizeWhitespace(fact?.id) || `fact-${index + 1}`,
        factText: normalizeWhitespace(fact?.factText),
        certainty: normalizeWhitespace(fact?.certainty).toLowerCase(),
        polarity: normalizeFactPolarity(fact?.polarity),
        attribution: normalizeWhitespace(fact?.attribution),
        attributionQuote: normalizeWhitespace(fact?.attributionQuote),
        sourceField: normalizeFactSourceField(fact?.sourceField),
        evidenceQuote: normalizeWhitespace(fact?.evidenceQuote),
        entities: (Array.isArray(fact?.entities) ? fact.entities : []).map((entity) => ({
          type: normalizeWhitespace(entity?.type),
          canonicalId: normalizeWhitespace(entity?.canonicalId)
        })),
        numbers: (Array.isArray(fact?.numbers) ? fact.numbers : []).map((number) => ({
          type: normalizeWhitespace(number?.type),
          value: normalizeWhitespace(number?.value)
        }))
      }))
      .slice(0, FACT_EVIDENCE_MAX_ITEMS),
    mustNotClaim: [...new Set(
      (Array.isArray(result.mustNotClaim) ? result.mustNotClaim : [])
        .map(normalizeWhitespace)
        .filter(Boolean)
    )].slice(0, 2)
  });
}

function describeJsonShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (!Array.isArray(entry)) return [key, typeof entry];
    const first = entry[0];
    return [key, {
      type: 'array',
      length: entry.length,
      itemType: first == null ? 'empty' : Array.isArray(first) ? 'array' : typeof first,
      itemKeys: first && typeof first === 'object' && !Array.isArray(first)
        ? Object.keys(first)
        : [],
      items: entry.slice(0, 8).map((item) => (
        item && typeof item === 'object' && !Array.isArray(item)
          ? Object.fromEntries(Object.entries(item).map(([itemKey, itemValue]) => [
              itemKey,
              typeof itemValue === 'string'
                ? { type: 'string', length: itemValue.length }
                : Array.isArray(itemValue)
                  ? { type: 'array', length: itemValue.length }
                  : { type: typeof itemValue }
            ]))
          : { type: item == null ? 'null' : typeof item }
      ))
    }];
  }));
}

function isFactExtractionObject(value) {
  return Boolean(
    isFactExtractionCandidateObject(value) &&
    FACT_STORY_TYPES.includes(normalizeFactStoryType(value.storyType)) &&
    Array.isArray(value.facts) &&
    value.facts.length > 0 &&
    value.facts.length <= 5 &&
    value.facts.every((fact) => (
      fact && typeof fact === 'object' &&
      typeof fact.id === 'string' &&
      Boolean(normalizeWhitespace(fact.id)) &&
      typeof fact.factText === 'string' &&
      Boolean(normalizeWhitespace(fact.factText)) &&
      FACT_CERTAINTIES.includes(normalizeWhitespace(fact.certainty).toLowerCase()) &&
      FACT_POLARITIES.includes(normalizeWhitespace(fact.polarity).toLowerCase()) &&
      typeof fact.attribution === 'string' &&
      typeof fact.attributionQuote === 'string' &&
      FACT_SOURCE_FIELDS.includes(normalizeWhitespace(fact.sourceField)) &&
      typeof fact.evidenceQuote === 'string' &&
      Boolean(normalizeWhitespace(fact.evidenceQuote)) &&
      normalizeWhitespace(fact.evidenceQuote).length <= FACT_EVIDENCE_MAX_LENGTH &&
      Array.isArray(fact.entities) &&
      Array.isArray(fact.numbers)
    )) &&
    Array.isArray(value.mustNotClaim)
  );
}

function isFactExtractionCandidateObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ['storyType', 'facts', 'mustNotClaim']
      .some((key) => key in value)
  );
}

function isEvidenceExtractionObject(value) {
  return Boolean(
    isEvidenceExtractionCandidateObject(value) &&
    Object.keys(value).length === 1 &&
    Array.isArray(value.evidenceItems) &&
    value.evidenceItems.length > 0 &&
    value.evidenceItems.length <= FACT_EVIDENCE_MAX_ITEMS &&
    value.evidenceItems.every((item) => (
      item &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      Object.keys(item).every((key) => (
        ['id', 'evidenceQuote', 'attributionName', 'attributionQuote'].includes(key)
      )) &&
      typeof item.id === 'string' &&
      /^evidence-\d+$/.test(normalizeWhitespace(item.id)) &&
      typeof item.evidenceQuote === 'string' &&
      Boolean(normalizeWhitespace(item.evidenceQuote)) &&
      normalizeWhitespace(item.evidenceQuote).length <= FACT_EVIDENCE_MAX_LENGTH &&
      (item.attributionName == null || typeof item.attributionName === 'string') &&
      (item.attributionQuote == null || typeof item.attributionQuote === 'string') &&
      normalizeWhitespace(item.attributionQuote).length <= FACT_EVIDENCE_MAX_LENGTH
    ))
  );
}

function isEvidenceExtractionCandidateObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'evidenceItems' in value
  );
}

function isPhase1EditorialObject(value) {
  return Boolean(
    isPhase1EditorialCandidateObject(value) &&
    typeof value.titleZh === 'string' &&
    typeof value.summaryZh === 'string' &&
    typeof value.oneLineZh === 'string' &&
    typeof value.categoryZh === 'string' &&
    Array.isArray(value.tagsZh) &&
    typeof value.confidence === 'number'
  );
}

function isPhase1EditorialCandidateObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ['titleZh', 'summaryZh', 'oneLineZh', 'categoryZh', 'tagsZh', 'confidence']
      .some((key) => key in value)
  );
}

function buildCanonicalDisplayNames(factExtraction) {
  const factEvidence = factExtraction.facts
    .map((fact) => (
      `${fact.factText} ${fact.evidenceQuote} ${fact.attribution} ${fact.attributionQuote}`
    ))
    .join('\n');
  const extracted = extractEvidenceFacts(factEvidence, factEvidence);
  const names = [];

  for (const teamId of extracted.teams) {
    const sourceName = findSourceAlias(TEAM_GROUPS, teamId, factEvidence) || teamId;
    names.push({
      canonicalId: teamId,
      sourceName,
      displayZh: getGroupZh(TEAM_GROUPS, teamId) || sourceName,
      role: 'team'
    });
  }

  for (const personId of extracted.players) {
    const sourceName = (
      findSourceAlias(PLAYER_GROUPS, personId, factEvidence) ||
      findSourceAlias(NBA_PERSON_GROUPS, personId, factEvidence) ||
      personId
    );
    names.push({
      canonicalId: personId,
      sourceName,
      displayZh: (
        getGroupZh(PLAYER_GROUPS, personId) ||
        getGroupZh(NBA_PERSON_GROUPS, personId) ||
        sourceName
      ),
      role: CANONICAL_PERSON_ENTITIES.find((entry) => entry.id === personId)?.role || 'person'
    });
  }

  return names;
}

function selectPhase1CoreFacts(factExtraction) {
  if (!isFactExtractionObject(factExtraction)) return [];
  const eligible = factExtraction.facts.filter((fact) => !isSecondaryEditorialContext(fact));
  const selected = eligible.length ? [eligible[0]] : [];

  const preferred = factExtraction.storyType === 'trade_rumor'
    ? eligible.slice(1).sort((a, b) => (
        phase1RumorCoreRank(a.certainty) - phase1RumorCoreRank(b.certainty)
      ))
    : eligible.slice(1);
  if (preferred[0]) selected.push(preferred[0]);
  for (const fact of eligible) {
    if (hasCoreEditorialNumber(fact) && !selected.includes(fact)) selected.push(fact);
  }

  if (!selected.length && factExtraction.facts[0]) selected.push(factExtraction.facts[0]);
  return selected.slice(0, 4);
}

function phase1RumorCoreRank(certainty) {
  return {
    interest: 0,
    expected: 1,
    likely: 2,
    possible: 3,
    reported: 4,
    confirmed: 5,
    opinion: 6
  }[certainty] ?? 9;
}

function isSecondaryEditorialContext(fact) {
  return /\b(?:second apron|taxpayer (?:mle|mid-level exception)|mid-level exception|salary cap|cap space|luxury tax|tax line)\b/i
    .test(`${fact?.factText || ''} ${fact?.evidenceQuote || ''}`);
}

function hasCoreEditorialNumber(fact) {
  const numbers = Array.isArray(fact?.numbers) ? fact.numbers : [];
  if (numbers.some((entry) => ['contractYears', 'score', 'tradeAsset'].includes(entry?.type))) {
    return true;
  }
  if (!numbers.some((entry) => entry?.type === 'money')) return false;
  return /\b(?:contract|deal|offer sheet|sign(?:ed|ing)?|re-sign|trade|acquir)/i
    .test(`${fact?.factText || ''} ${fact?.evidenceQuote || ''}`);
}

function inferPhase1StoryType(record) {
  const stored = normalizeFactStoryType(record.storyType);
  const title = normalizeWhitespace(record.originalTitle);
  const sourceText = normalizeWhitespace([
    title,
    record.originalSummary,
    record.rssSummary,
    record.summary
  ].filter(Boolean).join(' '));

  if (
    /^Dunc['’]d On\s*:/i.test(title) ||
    /\b(?:podcast|episode)\b.*\b(?:review|analysis|discuss)/i.test(sourceText)
  ) {
    return 'analysis';
  }
  if (
    /^[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){1,3}\s+On\b.*:/i.test(title)
  ) {
    return 'interview';
  }

  const inferred = normalizeFactStoryType(inferStoryType(sourceText));
  if (['analysis', 'interview'].includes(inferred)) return inferred;
  if (stored && stored !== 'other') return stored;
  return inferred || stored || 'other';
}

function inferClaimCertainty(text, storyType = '') {
  const value = normalizeWhitespace(text);
  if (/\b(?:expected(?:\s+to|\s+that)?|the expectation is|expectation that)\b/i.test(value)) {
    return 'expected';
  }
  if (/\b(?:likely(?:\s+to|\s+that)?|unlikely(?:\s+to|\s+that)?)\b/i.test(value)) {
    return 'likely';
  }
  if (/\b(?:interested in|interest in|showing interest|have interest|had interest|no interest|not interested|focused on adding|pursuing|targeting)\b/i.test(value)) {
    return 'interest';
  }
  if (/\b(?:could|may|might|considering|exploring|leaning toward|looked at|hopeful of|seems? to|appears? to|unclear|unknown|(?:has|have|had) not decided|(?:has|have) yet to decide)\b/i.test(value)) {
    return 'possible';
  }
  if (
    /\b(?:signed|re-signed|agreed to (?:join|sign)|completed (?:the )?(?:trade|deal)|officially announced|was traded|were traded|defeated|beat)\b/i.test(value)
  ) {
    return 'confirmed';
  }
  if (['analysis', 'interview'].includes(storyType)) return 'opinion';
  if (
    /\b(?:believes?|thinks?|shares? thoughts|opinion|analysis|predicts?|argues?|suggests?|says?|said|told|explains?|discusses?|wants?)\b/i.test(value)
  ) return 'opinion';
  if (storyType === 'trade_rumor') return 'possible';
  if (/\b(?:reportedly|according to|sources? say|was told|is told|reports? that)\b/i.test(value)) {
    return 'reported';
  }
  return 'confirmed';
}

function getFactExtractionCertainty(factExtraction) {
  const certainties = factExtraction.facts.map((fact) => fact.certainty);
  if (certainties.includes('opinion')) return 'opinion';
  if (certainties.includes('interest')) return 'interest';
  if (certainties.includes('possible')) return 'possible';
  if (certainties.includes('expected')) return 'expected';
  if (certainties.includes('likely')) return 'likely';
  if (certainties.includes('reported')) return 'reported';
  return 'confirmed';
}

function factCertaintyToEditorialLevel(certainty) {
  if (certainty === 'opinion') return 'analysis';
  if (['possible', 'interest'].includes(certainty)) return 'rumor';
  if (['reported', 'expected', 'likely'].includes(certainty)) return 'reported';
  return 'confirmed';
}

function evidenceSnippetMatches(sourceText, snippet) {
  if (!sourceText || !snippet) return false;
  return normalizeEvidenceForMatch(sourceText).includes(normalizeEvidenceForMatch(snippet));
}

function normalizeEvidenceForMatch(value) {
  return normalizeWhitespace(value)
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+([,.;:!?])/g, '$1')
    .toLowerCase();
}

function containsNormalized(text, candidate) {
  return normalizeEvidenceForMatch(text).includes(normalizeEvidenceForMatch(candidate));
}

function containsExplicitEnglishNegation(text) {
  const value = String(text || '').replace(/\bnot only\b/gi, '');
  return /\b(?:not|no|never|without|hasn't|haven't|hadn't|has not|have not|had not|has yet to|have yet to|did not|does not)\b/i.test(value);
}

function containsFactNegation(text) {
  return (
    containsExplicitEnglishNegation(text) ||
    /\b(?:neither|nor|denied|declined|rejected|ruled out|no indication|no interest|not interested|unlikely|won't|wouldn't|isn't|aren't|wasn't|weren't)\b/i.test(text)
  );
}

function hasExplicitAttributionCue(text) {
  return /\b(?:according to|reportedly|reported by|reports? that|per (?!game\b|season\b|cent\b)|sources? (?:say|said|tell|told)|said|says|told|wrote|writes|I'm told|believes?|thinks?|predicts?|argues?|suggests?)\b/i.test(text);
}

function buildValidatedFactEvidence(factExtraction) {
  return normalizeWhitespace([
    ...factExtraction.facts.map((fact) => fact.evidenceQuote),
    ...factExtraction.facts.map((fact) => fact.factText)
  ].join('\n'));
}

function buildPhase1AttributionEvidence(factExtraction) {
  return factExtraction.facts
    .map((fact) => normalizeWhitespace(fact.attribution))
    .filter(Boolean)
    .join(' | ');
}

function buildPhase1CertaintyEvidence(factExtraction) {
  const facts = selectPhase1CoreFacts(factExtraction);
  const confirmedActions = new Set(
    facts
      .filter((fact) => fact.certainty === 'confirmed')
      .flatMap((fact) => inferSourceActions(fact.evidenceQuote))
  );
  return normalizeWhitespace(
    facts
      .filter((fact) => {
        if (fact.certainty === 'confirmed') return true;
        const actions = inferSourceActions(fact.evidenceQuote);
        const hasFactSpecificNumber = (fact.numbers || []).length > 0;
        if (hasFactSpecificNumber && actions.some((action) => confirmedActions.has(action))) {
          return false;
        }
        return true;
      })
      .map((fact) => fact.evidenceQuote)
      .join('\n')
  );
}

function inferSourceActions(value) {
  return Object.entries(SOURCE_ACTION_PATTERNS)
    .filter(([, pattern]) => pattern.test(value))
    .map(([action]) => action);
}

function inspectPhase1AttributionCoverage(factExtraction, outputValue) {
  const output = normalizeWhitespace(outputValue);
  const reasons = [];
  const fragments = [];
  const attributions = [...new Set(
    factExtraction.facts.map((fact) => normalizeWhitespace(fact.attribution)).filter(Boolean)
  )];

  for (const attribution of attributions) {
    const canonical = CANONICAL_PERSON_ENTITIES.find((entity) => (
      [...entity.englishNames, ...entity.chineseNames].some((name) => (
        containsNormalized(attribution, name) || containsNormalized(name, attribution)
      ))
    ));
    const aliases = canonical
      ? [
          ...canonical.englishNames,
          ...canonical.chineseNames,
          ...canonical.shortNames
        ]
      : [attribution];
    if (aliases.some((alias) => containsAlias(output, alias))) continue;
    reasons.push('editorial-attribution-missing');
    fragments.push(`missing-attribution:${attribution}`);
  }

  return {
    reasons: [...new Set(reasons)],
    fragments: [...new Set(fragments)]
  };
}

function normalizeFactStoryType(value, fallback = '') {
  const storyType = normalizeWhitespace(value).toLowerCase().replace(/[\s-]+/g, '_');
  if (FACT_STORY_TYPES.includes(storyType)) return storyType;
  if (['trade', 'rumor', 'free_agency'].includes(storyType)) return 'trade_rumor';
  if (['opinion', 'fact', 'draft'].includes(storyType)) {
    return storyType === 'opinion' ? 'analysis' : 'other';
  }
  return fallback;
}

function normalizeFactSourceField(value) {
  const sourceField = normalizeWhitespace(value).replace(/[\s_-]+/g, '').toLowerCase();
  return {
    title: 'title',
    rsssummary: 'rssSummary',
    summary: 'rssSummary',
    articletext: 'articleText',
    article: 'articleText'
  }[sourceField] || '';
}

function normalizeFactPolarity(value) {
  const polarity = normalizeWhitespace(value).toLowerCase();
  if (polarity === 'negative') return 'negative';
  if (['positive', 'neutral', 'affirmative'].includes(polarity)) return 'positive';
  return '';
}

function findSourceAlias(groups, canonicalId, evidence) {
  const group = groups.find(([id]) => id === canonicalId);
  if (!group) return '';
  const aliases = group[2] || [];
  return aliases.find((alias) => containsNormalized(evidence, alias)) || aliases[0] || '';
}

function dedupeFactValidationDetails(details) {
  return Object.fromEntries(
    Object.entries(details).map(([key, values]) => [key, [...new Set(values)]])
  );
}

function dedupeEditorialDetails(details) {
  return {
    addedFacts: [...new Set(details.addedFacts)],
    missingFacts: [...new Set(details.missingFacts)],
    unsafeFragments: [...new Set(details.unsafeFragments)]
  };
}

function buildAliasLookup(groups) {
  const lookup = new Map();
  for (const [id, zh, aliases] of groups) {
    lookup.set(zh.toLowerCase(), { id, zh });
    for (const alias of aliases) lookup.set(alias.toLowerCase(), { id, zh });
  }
  return lookup;
}

function buildReplacements(groups) {
  return groups
    .flatMap(([, zh, aliases]) => aliases.map((alias) => ({
      zh,
      alias,
      pattern: new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'gi')
    })))
    .sort((a, b) => b.alias.length - a.alias.length);
}

function containsAlias(text, alias) {
  const escaped = escapeRegExp(alias);
  const needsBoundary = /^[A-Za-z0-9]/.test(alias) && /[A-Za-z0-9]$/.test(alias);
  return new RegExp(needsBoundary ? `\\b${escaped}\\b` : escaped, 'i').test(text);
}

function parseJsonCandidate(value) {
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function parseEvidenceJsonCandidate(value) {
  const parsed = parseJsonCandidate(value);
  if (parsed) return parsed;

  const text = String(value || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const repaired = removeTrailingJsonCommas(text.slice(start, end + 1));
  try {
    const result = JSON.parse(repaired);
    return result && typeof result === 'object' && !Array.isArray(result)
      ? result
      : null;
  } catch {
    return null;
  }
}

function removeTrailingJsonCommas(value) {
  let output = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      output += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }
    if (character === ',') {
      let cursor = index + 1;
      while (/\s/.test(value[cursor] || '')) cursor += 1;
      if (value[cursor] === '}' || value[cursor] === ']') continue;
    }
    output += character;
  }
  return output;
}

function isEditorialObject(value) {
  return Boolean(
    isEditorialCandidateObject(value) &&
    typeof value.titleZh === 'string' &&
    typeof value.summaryZh === 'string' &&
    typeof value.categoryZh === 'string' &&
    Array.isArray(value.tagsZh) &&
    typeof value.confidence === 'number' &&
    typeof value.factLevel === 'string'
  );
}

function isEditorialCandidateObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ['titleZh', 'summaryZh', 'categoryZh', 'tagsZh', 'confidence', 'factLevel']
      .some((key) => key in value)
  );
}

function normalizeMessageContent(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .map((part) => {
      if (typeof part === 'string') return part;
      if (!part || typeof part !== 'object') return '';
      return typeof part.text === 'string'
        ? part.text
        : typeof part.content === 'string'
          ? part.content
          : '';
    })
    .filter(Boolean)
    .join('\n');
}

function comparable(value = '') {
  return normalizeWhitespace(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function normalizeDate(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function stripNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function slug(value = '') {
  return normalizeWhitespace(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
