export const PIPELINE_VERSION = 'editorial-pipeline-v4';
export const AI_STATUSES = ['pending', 'processing', 'accepted', 'rejected', 'failed'];
export const FACT_LEVELS = ['confirmed', 'reported', 'rumor', 'analysis'];
export const CATEGORIES = ['交易', '签约', '伤病', '选秀', '流言', '比赛', '分析', '其他'];

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
  ['warriors', '勇士', ['Golden State Warriors', 'Warriors']],
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

const TEAM_LOOKUP = buildAliasLookup(TEAM_GROUPS);
const PLAYER_LOOKUP = buildAliasLookup(PLAYER_GROUPS);
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

const PERSON_BOUNDARY_WORDS = /\b(?:Acquire[sd]?|Agree[sd]?|Sign(?:s|ed|ing)?|Re-Sign(?:s|ed|ing)?|Trade[sd]?|Trading|Send|Sent|Deal(?:s|t)?|Land(?:s|ed|ing)?|Report(?:ed|edly)?|Return(?:s|ed|ing)?|Join(?:s|ed|ing)?|Match(?:es|ed|ing)?|Receiv(?:e|es|ed|ing)|Draw(?:s|n|ing)?|Generat(?:e|es|ed|ing)|Expect(?:s|ed|ing)?|Offer|Sheet|Focus(?:es|ed|ing)?|Build(?:s|ing)?|Team|Retire[sd]?|Waive[sd]?|Wait(?:s|ed|ing)?|Fill(?:s|ed|ing)?|Roster|Qualifying|Proximity|Play(?:s|ed|ing)?|Role|Show(?:s|ed|ing)?|Mutual|Interest|Intends?|Could|Would|May|Might|Had|Has|Have|No|Out|Before|With|From|For|After|Against|During|Into|Over|At|On|Of|To|In|And|Or|Vs)\b/gi;

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
    PIPELINE_VERSION,
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
  for (const candidate of candidates) {
    if (candidate == null) continue;
    if (isEditorialObject(candidate)) {
      parsed = candidate;
      rawContent = JSON.stringify(candidate);
      break;
    }
    if (typeof candidate !== 'string') continue;
    rawContent = candidate;
    parsed = parseJsonObject(candidate);
    if (parsed) break;
  }

  return {
    parsed,
    rawContent: normalizeWhitespace(rawContent),
    contentLength: normalizeWhitespace(rawContent).length,
    finishReason,
    isEmptyLengthResponse: !parsed && !rawContent && finishReason.toLowerCase() === 'length'
  };
}

export function validateEditorialResult(result, record, articleText = '') {
  const reasons = [];
  const details = { addedFacts: [], missingFacts: [], unsafeFragments: [] };
  if (!isEditorialObject(result)) {
    return { ok: false, reasons: ['invalid-json-shape'], details };
  }

  const value = {
    titleZh: normalizeChineseText(result.titleZh),
    summaryZh: normalizeChineseText(result.summaryZh),
    categoryZh: normalizeWhitespace(result.categoryZh),
    tagsZh: [...new Set((Array.isArray(result.tagsZh) ? result.tagsZh : []).map(normalizeChineseText).filter(Boolean))].slice(0, 5),
    confidence: Number(result.confidence),
    factLevel: normalizeWhitespace(result.factLevel)
  };

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
  const sourceEvidence = [
    record.originalTitle,
    record.originalSummary,
    articleText
  ].filter(Boolean).join('\n');
  const requiredFacts = extractEvidenceFacts(sourceCore);
  const requiredEntities = extractEvidenceFacts(record.originalTitle || '');
  const allowedFacts = extractEvidenceFacts(sourceEvidence);
  const outputFacts = extractEvidenceFacts(`${value.titleZh}\n${value.summaryZh}`);
  compareFacts(requiredFacts, allowedFacts, outputFacts, details, requiredEntities);
  if (details.addedFacts.length) reasons.push('added-facts');
  if (details.missingFacts.length) reasons.push('missing-key-facts');

  const expectedCategory = record.category || classifyCategory(sourceCore, record.storyType);
  if (CATEGORIES.includes(expectedCategory) && value.categoryZh !== expectedCategory) {
    reasons.push('category-conflict');
  }

  const expectedFactLevel = record.expectedFactLevel || inferFactLevel(sourceCore, record.storyType);
  if (expectedFactLevel === 'rumor') {
    if (value.factLevel === 'confirmed') reasons.push('rumor-marked-confirmed');
    if (!/(据报道|据消息|有消息称|可能|有意|考虑|关注|寻求|尚未|传闻|流言|预计)/.test(`${value.titleZh} ${value.summaryZh}`)) {
      reasons.push('rumor-as-fact');
    }
  }
  if (expectedFactLevel === 'analysis') {
    if (value.factLevel !== 'analysis') reasons.push('analysis-marked-as-fact');
    if (!/(分析|认为|观点|评估|预测|可能|有望|被视为|或将|讨论)/.test(value.summaryZh)) {
      reasons.push('analysis-as-fact');
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

export function inspectChineseCopy(value, { minHan = 8, maxLength = 220 } = {}) {
  const text = normalizeWhitespace(value);
  const fragments = [];
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

export function extractEvidenceFacts(text = '') {
  const value = normalizeWhitespace(text);
  return {
    teams: extractTeamIds(value),
    players: extractPeople(value),
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
    oneLineZh: editorial.titleZh,
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

function extractPeople(text = '') {
  const found = [];
  for (const [alias, metadata] of PLAYER_LOOKUP) {
    if (containsAlias(text, alias) && !found.includes(metadata.id)) found.push(metadata.id);
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
  scrubbed = scrubbed.replace(PERSON_BOUNDARY_WORDS, ' | ');
  const matches = scrubbed.match(/\b[A-Z][A-Za-zÀ-ž'’.-]+(?:\s+(?:[A-Z][A-Za-zÀ-ž'’.-]+|Jr\.?|Sr\.?)){1,3}\b/g) || [];
  for (const match of matches) {
    if (/[.!?]\s/.test(match.replace(/\b(?:Jr|Sr)\.\s/g, ''))) continue;
    const words = match.split(/\s+/);
    if (words.every((word) => SOURCE_WORDS.has(word.replace(/[.,]/g, '')))) continue;
    if (extractTeamIds(match).length) continue;
    const normalized = slug(match);
    if (normalized && !found.includes(normalized)) found.push(normalized);
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
  scrubbed = scrubbed.replace(PERSON_BOUNDARY_WORDS, ' | ');
  return [...new Set(
    (scrubbed.match(/\b[A-Z][A-Za-zÀ-ž'’.-]+(?:\s+(?:[A-Z][A-Za-zÀ-ž'’.-]+|Jr\.?|Sr\.?)){1,3}\b/g) || [])
      .filter((match) => {
        if (/[.!?]\s/.test(match.replace(/\b(?:Jr|Sr)\.\s/g, ''))) return false;
        const words = match.split(/\s+/);
        return !words.every((word) => SOURCE_WORDS.has(word.replace(/[.,]/g, ''))) &&
          extractTeamIds(match).length === 0;
      })
  )];
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
  const facts = [];
  for (const match of String(text).matchAll(/\b(one|two|three|four|five|six|\d+)[-\s]+year\b/gi)) {
    const value = words[match[1].toLowerCase()] || Number(match[1]);
    if (Number.isFinite(value)) facts.push(`years:${value}`);
  }
  for (const match of String(text).matchAll(/(\d+)\s*年/g)) {
    facts.push(`years:${Number(match[1])}`);
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
  for (const [alias] of [...TEAM_LOOKUP, ...PLAYER_LOOKUP]) {
    value = value.replace(new RegExp(escapeRegExp(alias), 'gi'), ' ');
  }
  value = value
    .replace(/\b(?:NBA|MVP|ESPN|RealGM|Yahoo Sports|MSG|L\.A\.|Summer League|Aspiration)\b/gi, ' ')
    .replace(/\b[A-Z][A-Za-zÀ-ž'’.-]+(?:\s+[A-Z][A-Za-zÀ-ž'’.-]+){1,3}\b/g, ' ');
  return normalizeWhitespace(value);
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

function parseJsonObject(value) {
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const parsed = JSON.parse(text);
    return isEditorialObject(parsed) ? parsed : null;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      return isEditorialObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function isEditorialObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    ('titleZh' in value || 'summaryZh' in value));
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
