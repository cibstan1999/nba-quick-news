import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

const FEEDS = [
  {
    source: 'RealGM',
    feed: 'https://basketball.realgm.com/rss/wiretap/15/0.xml'
  },
  {
    source: 'Yahoo Sports',
    feed: 'https://sports.yahoo.com/nba/rss.xml'
  }
];
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(rootDir, 'public', 'data', 'news.json');
const aiCachePath = path.join(rootDir, 'public', 'data', 'ai-summary-cache.json');
const githubModelsEndpoint = 'https://models.github.ai/inference/chat/completions';
const defaultGithubModelsModel = 'openai/gpt-4o-mini';
const aiPromptVersion = 'summary-v4';

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
  processEntities: false
});

const FETCH_HEADERS = {
  Accept: 'application/rss+xml, application/xml, text/xml, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'User-Agent':
    'Mozilla/5.0 (compatible; NBAQuickNews/0.1; +https://github.com/cibstan1999/nba-quick-news)'
};

const teamNames = new Map([
  ['Atlanta Hawks', '亚特兰大老鹰'],
  ['Hawks', '老鹰'],
  ['Boston Celtics', '凯尔特人'],
  ['Celtics', '凯尔特人'],
  ['Brooklyn Nets', '布鲁克林篮网'],
  ['Nets', '篮网'],
  ['Charlotte Hornets', '夏洛特黄蜂'],
  ['Hornets', '黄蜂'],
  ['Chicago Bulls', '芝加哥公牛'],
  ['Bulls', '公牛'],
  ['Cleveland Cavaliers', '克利夫兰骑士'],
  ['Cavaliers', '骑士'],
  ['Cavs', '骑士'],
  ['Dallas Mavericks', '独行侠'],
  ['Mavericks', '独行侠'],
  ['Denver Nuggets', '丹佛掘金'],
  ['Nuggets', '掘金'],
  ['Detroit Pistons', '底特律活塞'],
  ['Pistons', '活塞'],
  ['Golden State Warriors', '勇士'],
  ['Warriors', '勇士'],
  ['Houston Rockets', '休斯敦火箭'],
  ['Rockets', '火箭'],
  ['Indiana Pacers', '印第安纳步行者'],
  ['Pacers', '步行者'],
  ['Los Angeles Clippers', '洛杉矶快船'],
  ['Clippers', '快船'],
  ['Los Angeles Lakers', '湖人'],
  ['Lakers', '湖人'],
  ['Memphis Grizzlies', '灰熊'],
  ['Grizzlies', '灰熊'],
  ['Miami Heat', '迈阿密热火'],
  ['Heat', '热火'],
  ['Milwaukee Bucks', '密尔沃基雄鹿'],
  ['Bucks', '雄鹿'],
  ['Minnesota Timberwolves', '明尼苏达森林狼'],
  ['Timberwolves', '森林狼'],
  ['New Orleans Pelicans', '新奥尔良鹈鹕'],
  ['Pelicans', '鹈鹕'],
  ['New York Knicks', '纽约尼克斯'],
  ['Knicks', '尼克斯'],
  ['Oklahoma City Thunder', '俄克拉荷马城雷霆'],
  ['Thunder', '雷霆'],
  ['Orlando Magic', '奥兰多魔术'],
  ['Magic', '魔术'],
  ['Philadelphia 76ers', '费城 76 人'],
  ['Philadelphia', '费城 76 人'],
  ['Sixers', '76 人'],
  ['76ers', '76 人'],
  ['Phoenix Suns', '菲尼克斯太阳'],
  ['Suns', '太阳'],
  ['Portland Trail Blazers', '波特兰开拓者'],
  ['Trail Blazers', '开拓者'],
  ['Blazers', '开拓者'],
  ['Sacramento Kings', '萨克拉门托国王'],
  ['Kings', '国王'],
  ['San Antonio Spurs', '圣安东尼奥马刺'],
  ['Spurs', '马刺'],
  ['Toronto Raptors', '多伦多猛龙'],
  ['Raptors', '猛龙'],
  ['Utah Jazz', '犹他爵士'],
  ['Jazz', '爵士'],
  ['Washington Wizards', '华盛顿奇才'],
  ['Wizards', '奇才']
]);

const playerNameZh = new Map([
  ['LeBron James', '勒布朗·詹姆斯'],
  ['Luka Doncic', '卢卡·东契奇'],
  ['Luka Dončić', '卢卡·东契奇'],
  ['Stephen Curry', '斯蒂芬·库里'],
  ['Steph Curry', '斯蒂芬·库里'],
  ['Kevin Durant', '凯文·杜兰特'],
  ['Giannis Antetokounmpo', '扬尼斯·阿德托昆博'],
  ['Nikola Jokic', '尼古拉·约基奇'],
  ['Shai Gilgeous-Alexander', '谢伊·吉尔杰斯-亚历山大'],
  ['Jayson Tatum', '杰森·塔图姆'],
  ['Jaylen Brown', '杰伦·布朗'],
  ['Kawhi Leonard', '科怀·伦纳德'],
  ['Paul George', '保罗·乔治'],
  ['James Harden', '詹姆斯·哈登'],
  ['Anthony Davis', '安东尼·戴维斯'],
  ['Jimmy Butler', '吉米·巴特勒'],
  ['Damian Lillard', '达米安·利拉德'],
  ['Donovan Mitchell', '多诺万·米切尔'],
  ['Trae Young', '特雷·杨'],
  ['Zion Williamson', '蔡恩·威廉森'],
  ['Ja Morant', '贾·莫兰特'],
  ['Victor Wembanyama', '维克托·文班亚马'],
  ['Cade Cunningham', '凯德·坎宁安'],
  ['Tyrese Haliburton', '泰瑞斯·哈利伯顿'],
  ['Devin Booker', '德文·布克'],
  ['Jalen Brunson', '杰伦·布伦森'],
  ['Karl-Anthony Towns', '卡尔-安东尼·唐斯'],
  ['Joel Embiid', '乔尔·恩比德'],
  ['Brandon Ingram', '布兰登·英格拉姆'],
  ['Walker Kessler', '沃克·凯斯勒'],
  ['Santi Aldama', '桑蒂·阿尔达马'],
  ['Dean Wade', '迪恩·韦德'],
  ['Luke Kennard', '卢克·肯纳德'],
  ['Keon Ellis', '基恩·埃利斯'],
  ['Tim Hardaway Jr.', '小蒂姆·哈达威'],
  ['Tobias Harris', '托拜厄斯·哈里斯'],
  ['Luguentz Dort', '吕冈茨·多尔特'],
  ['Lu Dort', '吕冈茨·多尔特'],
  ['Zaccharie Risacher', '扎卡里·里萨谢'],
  ['Ryan Nembhard', '瑞安·内姆哈德'],
  ['Dillon Brooks', '狄龙·布鲁克斯'],
  ['Jordan Clarkson', '乔丹·克拉克森'],
  ['Charles Bassey', '查尔斯·巴锡'],
  ['Baba Miller', '巴巴·米勒'],
  ['Bruce Thornton', '布鲁斯·桑顿'],
  ['AJ Dybantsa', 'AJ·迪班萨'],
  ['Cooper Flagg', '库珀·弗拉格'],
  ['Ace Bailey', '埃斯·贝利'],
  ['Dylan Harper', '迪伦·哈珀'],
  ['Tarris Reed Jr.', '小塔里斯·里德'],
  ['Alex Karaban', '亚历克斯·卡拉班'],
  ['Bogoljub Marković', '博戈柳布·马尔科维奇'],
  ['Bogoljub Markovic', '博戈柳布·马尔科维奇']
]);

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripHtml(value = '') {
  return String(value)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function classify(title = '', summary = '') {
  const titleText = String(title).toLowerCase();
  const text = `${title} ${summary}`.toLowerCase();
  if (isOddsArticle(title, summary)) return '\u5176\u4ed6';
  const hasSigningSignal = /\b(signs?|signed|signing|agree(?:s|d)? to (?:a )?(?:one|two|three|four|five|\d+)[-\s]+year|agree(?:s|d)? to .+?(?:deal|contract)|contract|extension|multi[-\s]+year contract|(?:one|two|three|four|five|\d+)[-\s]+year,?\s*\$\d+(?:\.\d+)?m deal)\b/i.test(titleText);
  const hasTradeSignal = /\b(acquire|acquired|traded|trade|trading|lands? in deal|sent to|for .*picks?|for .*first[-\s]+round)\b/i.test(titleText);

  if (hasSigningSignal && !hasTradeSignal) {
    return '签约';
  }

  if (hasTradeSignal || /\b(acquire|acquired|traded|trade|trading|lands? in deal)\b/i.test(text)) {
    return '交易';
  }

  const rules = [
    ['交易', ['trade', 'traded', 'trading', 'acquire', 'acquired', 'swap']],
    ['签约', ['sign', 'signed', 'signing', 'contract', 'extension', 'free agent', 'free agency', 'waive', 'waived', 'deal']],
    ['伤病', ['injury', 'injured', 'surgery', 'ankle', 'knee', 'hamstring', 'out indefinitely', 'rehab']],
    ['选秀', ['draft', 'pick', 'prospect', 'lottery', 'combine', 'rookie']],
    ['季后赛', ['playoff', 'finals', 'semifinals', 'postseason', 'championship']]
  ];

  return rules.find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))?.[0] || '其他';
}

function isOddsArticle(...values) {
  const text = values.map((value) => String(value || '')).join(' ');
  return /\b(?:odds|championship odds|title contenders)\b|争冠赔率|冠军赔率/i.test(text);
}

function normalizeSpacing(value = '') {
  return normalizeWhitespace(value)
    .replace(/\s+([，。！？：；、])/g, '$1')
    .replace(/([，。！？：；、])\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWhitespace(value = '') {
  return String(value ?? '')
    .replace(/[\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeJsonStrings(value) {
  if (typeof value === 'string') return normalizeWhitespace(value);
  if (Array.isArray(value)) return value.map(normalizeJsonStrings);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeJsonStrings(entry)])
    );
  }
  return value;
}

function getLatestPublishedAt(items = []) {
  const timestamps = toArray(items)
    .map((item) => new Date(item.publishedAt || item.pubDate || '').getTime())
    .filter((time) => Number.isFinite(time));
  if (!timestamps.length) return '';
  return new Date(Math.max(...timestamps)).toISOString();
}

function getAgeHours(value, now = new Date()) {
  const time = new Date(value || '').getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, (now.getTime() - time) / 36e5);
}

function logFetchDiagnostics(status = {}) {
  const diagnostics = {
    fetchMode: status.fetchMode || 'fresh',
    checkedAt: status.checkedAt || '',
    previousUpdatedAt: status.previousUpdatedAt || '',
    newUpdatedAt: status.updatedAt || '',
    fetchedItems: status.fetchedItems ?? 0,
    mergedItems: status.mergedItems ?? 0,
    successfulFeeds: status.successfulFeeds || [],
    failedFeeds: status.failedFeeds || [],
    newestPublishedAt: status.newestPublishedAt || '',
    dataAgeHours: status.dataAgeHours ?? null
  };
  console.log('Fetch diagnostics:', JSON.stringify(diagnostics, null, 2));
}

function sha256(value = '') {
  return createHash('sha256').update(String(value)).digest('hex');
}

function getAiModel() {
  return process.env.GITHUB_MODELS_MODEL || defaultGithubModelsModel;
}

function isGitHubModelsEnabled() {
  return /^true$/i.test(process.env.GITHUB_MODELS_ENABLED || '');
}

function getGithubModelsMaxItems() {
  const parsed = Number(process.env.GITHUB_MODELS_MAX_ITEMS || 5);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 30) : 5;
}

async function readAiSummaryCache() {
  try {
    const raw = await readFile(aiCachePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? {
          version: 2,
          promptVersion: aiPromptVersion,
          entries: parsed.version === 2 && parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {},
          backlog: parsed.backlog && typeof parsed.backlog === 'object' ? parsed.backlog : {}
        }
      : { version: 2, promptVersion: aiPromptVersion, entries: {}, backlog: {} };
  } catch {
    return { version: 2, promptVersion: aiPromptVersion, entries: {}, backlog: {} };
  }
}

async function writeAiSummaryCache(cache) {
  await mkdir(path.dirname(aiCachePath), { recursive: true });
  await writeFile(aiCachePath, `${JSON.stringify(normalizeJsonStrings(cache), null, 2)}\n`, 'utf8');
}

function getAiSourceHash(item = {}) {
  return sha256([
    aiPromptVersion,
    item.originalTitle || item.title || '',
    item.summary || '',
    normalizeWhitespace(item.articleText || '').slice(0, 6000),
    item.source || '',
    item.category || '',
    item.publishedAt || item.pubDate || '',
    toArray(item.originalTitles).join(' | ')
  ].join('\n'));
}

function getAiCacheKey(item = {}) {
  const base = `${item.eventKey || item.id || item.link || ''} ${item.originalTitle || item.title || ''}`.trim();
  return sha256(base);
}

function getExistingAiEventKeys(existingPayload = null) {
  return new Set(
    toArray(existingPayload?.items)
      .map((item) => item.eventKey || getEventKey(item) || `${item.originalTitle || item.title || ''}`)
      .filter(Boolean)
  );
}

function hasValidAiSummaryCache(cached = null, sourceHash = '') {
  return Boolean(
    cached?.sourceHash === sourceHash &&
    cached?.promptVersion === aiPromptVersion &&
    isPredominantlyChinese(cached.summaryZh || '') &&
    isPredominantlyChinese(cached.oneLineZh || '') &&
    isSafeChineseSummary(cached.summaryZh || '') &&
    !isGenericFallbackSummary(cached.summaryZh || '')
  );
}

function hasValidChineseSummary(item = {}) {
  return isPredominantlyChinese(item.summaryZh || '') && isSafeChineseSummary(item.summaryZh || '');
}

function getBacklogEntry(cache = {}, cacheKey = '') {
  return cache.backlog?.[cacheKey] || {};
}

function isBacklogCoolingDown(backlog = {}, now = Date.now()) {
  const nextRetryAt = new Date(backlog.nextRetryAt || '').getTime();
  return Number.isFinite(nextRetryAt) && nextRetryAt > now;
}

function getBacklogCooldownMs(failureCount = 0) {
  if (failureCount <= 0) return 0;
  if (failureCount === 1) return 30 * 60 * 1000;
  if (failureCount === 2) return 2 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function markBacklogSkipped(cache = {}, entry = {}, reason = 'limit') {
  if (!entry.cacheKey) return;
  cache.backlog ||= {};
  const previous = getBacklogEntry(cache, entry.cacheKey);
  cache.backlog[entry.cacheKey] = {
    ...previous,
    sourceHash: entry.sourceHash,
    lastTitle: entry.item.originalTitle || entry.item.title || '',
    skippedByLimit: reason === 'limit' ? (previous.skippedByLimit || 0) + 1 : previous.skippedByLimit || 0,
    lastSkippedAt: new Date().toISOString(),
    lastReason: reason
  };
}

function markBacklogFailure(cache = {}, entry = {}, reason = 'failed') {
  if (!entry.cacheKey) return;
  cache.backlog ||= {};
  const previous = getBacklogEntry(cache, entry.cacheKey);
  const failureCount = (previous.failureCount || 0) + 1;
  cache.backlog[entry.cacheKey] = {
    ...previous,
    sourceHash: entry.sourceHash,
    lastTitle: entry.item.originalTitle || entry.item.title || '',
    failureCount,
    lastFailedAt: new Date().toISOString(),
    nextRetryAt: new Date(Date.now() + getBacklogCooldownMs(failureCount)).toISOString(),
    lastReason: reason
  };
}

function clearBacklogState(cache = {}, cacheKey = '') {
  if (cache.backlog?.[cacheKey]) {
    delete cache.backlog[cacheKey];
  }
}

function pruneAiBacklog(cache = {}, activeKeys = new Set()) {
  if (!cache.backlog) return;
  for (const key of Object.keys(cache.backlog)) {
    if (!activeKeys.has(key)) delete cache.backlog[key];
  }
}

function isAiCandidate(item = {}, { hasValidCache = false } = {}) {
  if (hasValidCache) return false;
  if (hasValidChineseSummary(item)) return false;
  if (!normalizeWhitespace(`${item.originalTitle || item.title || ''} ${item.summary || ''}`)) return false;
  const storyType = inferStoryType(item);
  if (!(item.summaryZh || '').trim()) return true;
  if (needsAiSummary(item)) return true;
  if (['opinion', 'rumor', 'analysis'].includes(storyType) && needsAiSummary(item)) return true;
  if ((item.importance || 1) < 4) return false;
  if (!isCoreNewsCategory(item.category) && !isImportantRumor(item)) return false;
  return hasConcreteStructure(item) || isImportantRumor(item);
}

function getAiCandidateRejectionReason(item = {}, { hasValidCache = false, candidate = false, priority = 0 } = {}) {
  if (hasValidCache) return 'valid-summary-v4-cache';
  if (candidate && priority > 0) return '';
  const summary = item.summaryZh || '';
  if (!summary.trim()) return 'empty-summary-but-priority-zero';
  if (!needsAiSummary(item)) return 'summary-does-not-need-ai';
  return 'needs-ai-but-priority-zero';
}

function getExtractedFactsForPrompt(item = {}) {
  const text = `${item.originalTitle || item.title || ''} ${item.summary || ''} ${item.headlineZh || ''} ${item.summaryZh || ''}`;
  return {
    players: getEventPlayer(text) ? [getEventPlayer(text)] : [],
    teams: getEventTeams(text),
    money: getMoneyTokens(text),
    duration: getDurationTokens(text),
    tradeAssets: (text.match(/(?:first[-\s]+round|second[-\s]+round|protected|pick|首轮签|次轮签|受保护)[^,.。;；]*/gi) || []).slice(0, 5)
  };
}

function getGithubModelsPrompt(item = {}) {
  const facts = getExtractedFactsForPrompt(item);
  return [
    `originalTitle: ${item.originalTitle || item.title || ''}`,
    `originalSummary: ${stripHtml(item.summary || '')}`,
    `source: ${item.source || ''}`,
    `publishedAt: ${item.publishedAt || item.pubDate || ''}`,
    `category: ${item.category || ''}`,
    `eventKey: ${item.eventKey || ''}`,
    `relatedItems: ${JSON.stringify(toArray(item.relatedItems).map((related) => ({
      originalTitle: related.originalTitle || related.title || '',
      summary: stripHtml(related.summary || ''),
      source: related.source || '',
      publishedAt: related.publishedAt || related.pubDate || '',
      angle: related.angle || ''
    })).slice(0, 5))}`,
    `extractedFacts: ${JSON.stringify(facts)}`,
    `fallbackSummaryZh: ${item.summaryZh || ''}`,
    '',
    'confidence 表示“摘要是否忠实覆盖输入中明确存在的信息”，不是表示新闻本身是否已被官方确认。',
    'confidence 评分标准：0.90-1.00=输入事实完整明确，摘要直接忠实转述；0.75-0.89=输入基本明确，仅有少量细节缺失；0.60-0.74=核心人物和事件明确，但背景或部分细节有限；0.45-0.59=只能确认大致主题，无法完整确认观点或结果；低于0.45=输入不足以生成可靠摘要。',
    '对于比赛比分、正式签约、明确采访引语、明确交易状态，不要仅因来源是 RSS 就自动给低分。',
    'summaryZh 写成 2 到 3 句中文复述，建议 120 到 220 个中文字符，像懂 NBA 的编辑读完文章后讲给中文读者听。不要只翻译标题；要交代文章核心事件、关键背景、球队或球员处境，以及为什么这条新闻值得注意。oneLineZh 最多 45 个中文字符。',
    '请严格返回 JSON：{"summaryZh":"","oneLineZh":"","confidence":0.0,"storyType":"fact"}'
  ].join('\n');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGithubModelsPromptV3(item = {}, retryNote = '') {
  const facts = getExtractedFactsForPrompt(item);
  const articleText = normalizeWhitespace(item.articleText || '').slice(0, 6000);
  const relatedItems = toArray(item.relatedItems).map((related) => ({
    originalTitle: related.originalTitle || related.title || '',
    summary: stripHtml(related.summary || ''),
    source: related.source || '',
    publishedAt: related.publishedAt || related.pubDate || '',
    angle: related.angle || ''
  })).slice(0, 5);

  return [
    '任务：根据英文标题、RSS 摘要和相关报道，提炼事实并改写成自然、简洁、符合中文 NBA 新闻习惯的快讯。不要逐句翻译。',
    retryNote ? `重试要求：${retryNote}` : '',
    '',
    `originalTitle: ${item.originalTitle || item.title || ''}`,
    `originalSummary: ${stripHtml(item.summary || '')}`,
    `source: ${item.source || ''}`,
    `publishedAt: ${item.publishedAt || item.pubDate || ''}`,
    `category: ${item.category || ''}`,
    `localStoryType: ${inferStoryType(item)}`,
    `eventKey: ${item.eventKey || ''}`,
    `relatedItems: ${JSON.stringify(relatedItems)}`,
    `extractedFacts: ${JSON.stringify(facts)}`,
    `articleTextExcerpt: ${articleText}`,
    `fallbackSummaryZh: ${item.summaryZh || ''}`,
    '',
    '内容原则：只能使用输入中明确存在的信息；不得补充模型记忆；不得猜测合同细节、球队态度或交易结果；传闻必须保留“据报道”“有意”“讨论中”等不确定性；已签约、已交易、有意、接近、讨论中必须严格区分。',
    '中文表达：像熟悉 NBA 的中文体育编辑。不要逐词翻译英文语序，不要写“关于……的更新”“就……而言”“该名球员”。球员姓名默认保留英文；球队用常见中文译名；sign 写“签下/签约”，agree to a deal 写“达成签约协议”，acquire 写“得到/交易得到”，waive 写“裁掉/放弃”。',
    '文风：简洁、中性、像中文 NBA 快讯。不要营销号，不要夸张词，不要评价交易输赢。避免半中半英拼接，但球员姓名、NBA、合同类型和必要专有名词可以保留英文。',
    '长度：summaryZh 2 到 3 句，优先 120 到 220 个中文字符，硬上限 240 个中文字符；oneLineZh 一句话，优先 20 到 42 个中文字符。',
    'confidence 表示“摘要是否忠实覆盖输入中明确存在的信息”，不是表示新闻本身是否官宣。明确比分、签约、采访引语或交易状态不应仅因来源是 RSS 就低分。',
    'storyType 只能使用 fact、trade、signing、injury、draft、rumor、opinion、analysis、unknown。',
    '严格返回 JSON，不要 Markdown，不要解释：{"summaryZh":"","oneLineZh":"","confidence":0.0,"storyType":"fact"}'
  ].filter(Boolean).join('\n');
}

async function summarizeWithGitHubModels(item, retryNote = '', attempt = 0) {
  const token = process.env.GITHUB_MODELS_TOKEN;
  if (!token) return null;

  const model = getAiModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(githubModelsEndpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 500,
        messages: [
          {
            role: 'system',
            content: '你是一名严谨的中文 NBA 快讯编辑。请只根据输入标题、摘要和相关报道生成中文新闻摘要，不得添加输入中不存在的事实。英文球员姓名可以保留，球队名使用常见中文名称。语言应简洁、自然、像中文新闻导语，不要使用营销号措辞，不要半中半英拼接。不要生成或改写标题。'
          },
          {
            role: 'system',
            content: 'confidence means whether the Chinese summary faithfully covers information explicitly present in the input. It does not mean whether the NBA news itself is officially confirmed. Use 0.90-1.00 for clear complete facts, 0.75-0.89 for mostly clear facts with minor missing context, 0.60-0.74 for clear core person/event with limited background, 0.45-0.59 for only a broad topic, and below 0.45 when the input is insufficient. Do not assign low confidence solely because the source is RSS when the input contains a score, signing, clear interview quote, or clear transaction status.'
          },
          {
            role: 'user',
            content: getGithubModelsPromptV3(item, retryNote)
          }
        ]
      })
    });

    if (!response.ok) {
      if ([429, 502, 503, 504].includes(response.status) && attempt < 1) {
        console.warn(`AI summary retry: HTTP ${response.status}`);
        await sleep(800);
        return summarizeWithGitHubModels(item, retryNote, attempt + 1);
      }
      console.warn(`GitHub Models request failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    const jsonText = String(content).replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    return { ...JSON.parse(jsonText), model };
  } catch (error) {
    if (attempt < 1 && (error?.name === 'AbortError' || /timeout|aborted|network/i.test(String(error?.message || error)))) {
      console.warn('AI summary retry: timeout or transient network error');
      await sleep(800);
      return summarizeWithGitHubModels(item, retryNote, attempt + 1);
    }
    console.warn(`GitHub Models request skipped: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function getFactTokensForValidation(value = '') {
  const text = normalizeChineseText(value);
  return {
    money: new Set(getMoneyTokens(text)),
    duration: new Set(getDurationTokens(text)),
    teams: new Set(getEventTeams(text)),
    player: getEventPlayer(text)
  };
}

function decodeHtmlEntities(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function normalizeEvidenceText(value = '') {
  return normalizeWhitespace(
    decodeHtmlEntities(stripHtml(value))
      .replace(/[’‘`]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[，、]/g, ',')
      .replace(/[。]/g, '.')
  ).toLowerCase();
}

const factAliasGroups = [
  ['Washington Wizards', '华盛顿奇才', '奇才', 'Wizards'],
  ['Utah Jazz', '犹他爵士', '爵士', 'Jazz'],
  ['Toronto Raptors', '多伦多猛龙', '猛龙', 'Raptors'],
  ['Los Angeles Clippers', '洛杉矶快船', '快船', 'Clippers'],
  ['Kawhi Leonard', '卡怀·伦纳德', '科怀·伦纳德'],
  ['Brandon Ingram', '布兰登·英格拉姆'],
  ['Gradey Dick', '格雷迪·迪克'],
  ['AJ Dybantsa'],
  ['Will Riley'],
  ['Tre Johnson'],
  ['Jamir Watkins'],
  ['Felix Okpara'],
  ['NBA'],
  ['ESPN'],
  ['Yahoo Sports'],
  ['RealGM'],
  ['Summer League'],
  ['Aspiration']
];

function canonicalizeFactText(value = '') {
  let text = normalizeEvidenceText(value);
  factAliasGroups.forEach((aliases, index) => {
    const token = ` __alias_${index}__ `;
    for (const alias of aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (/[\u4e00-\u9fa5]/.test(alias)) {
        text = text.replace(new RegExp(escaped.toLowerCase(), 'gi'), token);
      } else {
        text = text.replace(new RegExp(`(^|[^a-z0-9\\u4e00-\\u9fa5])${escaped.toLowerCase()}(?=$|[^a-z0-9\\u4e00-\\u9fa5])`, 'gi'), `$1${token}`);
      }
    }
  });
  return normalizeWhitespace(text);
}

function buildSourceEvidence(item = {}) {
  const fields = [
    item.originalTitle,
    item.title,
    item.summary,
    item.originalSummary,
    item.articleText,
    item.dek,
    item.description,
    ...toArray(item.relatedItems).map((related) => related.originalTitle || related.title || ''),
    ...toArray(item.relatedItems).map((related) => related.summary || related.description || ''),
    ...toArray(item.originalTitles)
  ];
  return fields.filter(Boolean).map(normalizeEvidenceText).join(' ');
}

function extractFactMarkers(value = '') {
  const text = canonicalizeFactText(value);
  const markers = new Set();
  for (const match of text.matchAll(/__alias_\d+__/g)) markers.add(match[0]);
  for (const match of text.matchAll(/\b(?:19|20)\d{2}\b/g)) markers.add(match[0]);
  for (const match of text.matchAll(/\b\d+\s*(?:-|比)\s*\d+\b/g)) markers.add(match[0].replace(/\s+/g, '').replace('比', '-'));
  for (const match of text.matchAll(/\$\s*\d+(?:\.\d+)?\s*(?:m|million|b|billion)?\b/g)) markers.add(match[0].replace(/\s+/g, ''));
  for (const match of text.matchAll(/\b\d+(?:\.\d+)?\s*(?:million|billion)\b/g)) markers.add(match[0].replace(/\s+/g, ''));
  for (const match of text.matchAll(/\b\d+\s*(?:first|second)[-\s]+round picks?\b/g)) markers.add(match[0].replace(/\s+/g, ' '));
  for (const match of text.matchAll(/\b\d+\s*(?:首轮|次轮|选秀权|签)\b/g)) markers.add(match[0].replace(/\s+/g, ''));
  return markers;
}

function findAddedFacts(item = {}, aiText = '') {
  const sourceEvidence = buildSourceEvidence(item);
  const sourceMarkers = extractFactMarkers(sourceEvidence);
  const aiMarkers = extractFactMarkers(aiText);
  const added = [];
  for (const marker of aiMarkers) {
    if (!sourceMarkers.has(marker)) added.push(marker);
  }
  return added;
}

function hasAddedFacts(aiText = '', sourceText = '') {
  const sourceMarkers = extractFactMarkers(sourceText);
  const aiMarkers = extractFactMarkers(aiText);
  return [...aiMarkers].some((token) => !sourceMarkers.has(token));
}

function isRecapAnalysisTitle(value = '') {
  return /\b(?:\d+\s+thoughts\s+following|\d+\s+takeaways\s+from|what we learned from|observations after|reaction to|winners and losers from|keys from)\b/i.test(String(value));
}

function localizeRecapTeam(value = '') {
  const normalized = String(value)
    .replace(/^the\s+/i, '')
    .replace(/[’']s$/i, '')
    .trim();
  const teams = new Map([
    ['mavericks', '独行侠'],
    ['dallas mavericks', '独行侠'],
    ['warriors', '勇士'],
    ['golden state warriors', '勇士'],
    ['lakers', '湖人'],
    ['los angeles lakers', '湖人'],
    ['celtics', '凯尔特人'],
    ['boston celtics', '凯尔特人'],
    ['76ers', '76 人'],
    ['sixers', '76 人'],
    ['philadelphia 76ers', '76 人'],
    ['knicks', '尼克斯'],
    ['new york knicks', '尼克斯'],
    ['timberwolves', '森林狼'],
    ['minnesota timberwolves', '森林狼'],
    ['pelicans', '鹈鹕'],
    ['new orleans pelicans', '鹈鹕'],
    ['grizzlies', '灰熊'],
    ['memphis grizzlies', '灰熊'],
    ['jazz', '爵士'],
    ['utah jazz', '爵士'],
    ['bucks', '雄鹿'],
    ['milwaukee bucks', '雄鹿'],
    ['heat', '热火'],
    ['miami heat', '热火'],
    ['cavaliers', '骑士'],
    ['cavs', '骑士'],
    ['cleveland cavaliers', '骑士']
  ]);
  const key = normalized.toLowerCase();
  return teams.get(key) || localizeCommonTerms(normalized);
}

function chineseCount(value = '') {
  const number = Number(value);
  return {
    1: '一',
    2: '两',
    3: '三',
    4: '四',
    5: '五',
    6: '六',
    7: '七',
    8: '八',
    9: '九',
    10: '十'
  }[number] || String(value);
}

function formatGameResult(subject = '', result = '', opponent = '', scoreA = '', scoreB = '') {
  const team = localizeRecapTeam(subject);
  const other = localizeRecapTeam(opponent);
  if (scoreA && scoreB) {
    const first = Number(scoreA);
    const second = Number(scoreB);
    if (Number.isFinite(first) && Number.isFinite(second)) {
      const subjectScore = /loss/i.test(result) ? Math.min(first, second) : Math.max(first, second);
      const opponentScore = /loss/i.test(result) ? Math.max(first, second) : Math.min(first, second);
      return `${team}以 ${subjectScore} 比 ${opponentScore} ${/loss/i.test(result) ? `负于${other}` : `击败${other}`}`;
    }
  }
  return `${team}${/loss/i.test(result) ? `负于${other}` : `击败${other}`}`;
}

function buildRecapAnalysisSummary({ title = '', source = '' } = {}) {
  const cleanTitle = stripSourcePhrases(title).replace(/[’]/g, "'");
  const thoughtsMatch = cleanTitle.match(/^(\d+)\s+(?:thoughts|takeaways|keys)\s+(?:following|from|after)\s+(?:the\s+)?(.+?)'?\s+(win|loss)\s+(?:to|over|against)\s+(?:the\s+)?(.+?)(?:,\s*(\d+)\s*-\s*(\d+))?$/i);
  if (thoughtsMatch) {
    const [, count, team, result, opponent, scoreA, scoreB] = thoughtsMatch;
    return normalizeChineseText(`${source || '媒体'} 在${formatGameResult(team, result, opponent, scoreA, scoreB)}后复盘比赛，并总结了${chineseCount(count)}点观察。`);
  }

  const learnedMatch = cleanTitle.match(/^(?:what we learned from|observations after|reaction to|winners and losers from|keys from)\s+(.+)$/i);
  if (learnedMatch) {
    return normalizeChineseText(`${source || '媒体'} 围绕${localizeCommonTerms(learnedMatch[1])}进行复盘分析。`);
  }

  return '';
}

function containsRawEnglishSummaryPhrase(text = '') {
  const value = String(text);
  return /thoughts following|takeaways from|what we learned|observations after|reaction to|winners and losers from|keys from|more background|following .+ loss to|following .+ win over|loss to [\u4e00-\u9fa5]|win over [\u4e00-\u9fa5]|pairing no longer|reclassifies to|picks .+ over|leaves espn to join|aim to|to join|waived by|expected to|possible \d{4} nba draft|business freeze-out/i.test(value);
}

function findUnsafeSummaryFragments(text = '') {
  const value = String(text);
  const fragments = [];
  const patterns = [
    /thoughts following/ig,
    /takeaways from/ig,
    /what we learned/ig,
    /more background/ig,
    /he['’]s back having fun/ig,
    /loss to [\u4e00-\u9fa5]+/ig,
    /following .+? loss to/ig,
    /following .+? win over/ig,
    /pairing no longer/ig,
    /leaves espn to join/ig,
    /business freeze-out/ig,
    /expected to receive interest/ig
  ];
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) fragments.push(match[0]);
  }
  if (/[\u4e00-\u9fa5].*\b(?:are|was|were|trying|build around|make sense|period|projected roster)\b/i.test(value)) {
    fragments.push('mixed-English grammar fragment');
  }
  return [...new Set(fragments)];
}

function hasAnalysisSummarySubject(summary = '') {
  return /复盘|分析|观察|看点|赔率|梦幻篮球|fantasy basketball|交易|比赛|赛后|影响|评估|总结/.test(summary || '');
}

function hasAnalysisSummaryEvent(summary = '') {
  return /负于|击败|战胜|不敌|交易|签约|合同|赔率|比赛|夏季联赛|阵容|自由市场|赛后|以\s*\d+\s*比\s*\d+/.test(summary || '');
}

function inferStoryType(item = {}) {
  const titleText = `${item.originalTitle || item.title || ''}`.toLowerCase();
  const text = `${item.originalTitle || item.title || ''} ${item.summary || ''} ${item.summaryZh || ''}`.toLowerCase();
  if (isRecapAnalysisTitle(titleText)) return 'analysis';
  if (/\b(trade (?:on hold|paused|delayed|completed|agreed)|trade\b.*\b(?:on hold|paused|delayed|completed|agreed|inquiry)|pending investigation|until nba concludes inquiry|transaction|finalizing deal|acquired|sent to|dealt to)\b/.test(titleText)) return 'trade';
  if (/\b(look to challenge|biggest threat|what it means|takeaways|thoughts following|recap|what we learned|winners and losers|outlook|ranking|projection)\b/.test(titleText)) return 'analysis';
  if (/^.+?\s+\b(says|said|reacts|reaction|share thoughts|shares thoughts|believes|thinks|explains|discusses|calls|criticizes|praises|admits|responds|comments on|processing|fired up|accuses)\b/.test(titleText)) return 'opinion';
  if (/\b(report|reported|rumou?r|sources?|expected|could|may|might|interest|reach out|target|haven't been told|has not been told|aim to|pitches)\b/.test(titleText)) return 'rumor';
  if (/\b(analysis|odds|fantasy|fallout|grades|breakdown|preview|rankings|questions|takeaways|observations|winners and losers|what we learned|reaction to|keys from|recap|look to challenge)\b/.test(text)) return 'analysis';
  if (/^.+?\s+\b(says|said|shares reaction|believes|thinks|calls|admits|explains|discusses|criticizes|praises|responds|comments on|processing|fired up)\b/.test(titleText)) return 'opinion';
  if (/\b(report|reported|rumou?r|sources?|expected|could|may|might|interest|reach out|target)\b/.test(text)) return 'rumor';
  if (item.category === '交易' || /\b(trade|traded|acquire|acquired|deal with|sent to)\b/.test(text)) return 'trade';
  if (item.category === '签约' || /\b(sign|signed|signing|contract|extension|agrees? to .+ deal)\b/.test(text)) return 'signing';
  if (item.category === '伤病' || /\b(injury|injured|surgery|ankle|knee|out|return)\b/.test(text)) return 'injury';
  return 'fact';
}

function extractOpinionSpeaker(item = {}) {
  const title = item.originalTitle || item.title || '';
  const match = title.match(/^(.+?)\s+(?:says|said|shares|reacts|believes|thinks|calls|admits|explains|still)/i);
  return normalizeWhitespace(match?.[1] || getEventPlayer(`${title} ${item.summary || ''}`) || '');
}

function isOpinionSummaryComplete(summary = '') {
  const text = normalizeChineseText(summary);
  return /表示|认为|称|回应|谈到|透露|解释|仍在|消化|看法|态度/.test(text) &&
    /交易|签约|伤病|比赛|赛季|球队|合同|自由市场|阵容|Jaylen|LeBron|Brown|James/.test(text);
}

function summaryHasMainPerson(item = {}) {
  const player = getEventPlayer(`${item.originalTitle || item.title || ''} ${item.summary || ''}`);
  return !player || slugText(item.summaryZh || '').includes(player);
}

function isGenericFallbackSummary(value = '') {
  return /最新动态和后续影响|相关消息更新|原文聚焦|详情请|后续动向|继续更新|更多背景来自原文报道|NBA 动态：|这篇文章讨论了/.test(value);
}

function isOpinionSummaryBad(item = {}) {
  if (inferStoryType(item) !== 'opinion') return false;
  const summary = item.summaryZh || '';
  return !summary ||
    isGenericFallbackSummary(summary) ||
    hasMixedEnglishSummary(summary) ||
    !isOpinionSummaryComplete(summary) ||
    !summaryHasMainPerson(item) ||
    isSimpleTitleRestatement(item);
}

function isRumorSummaryBad(item = {}) {
  if (inferStoryType(item) !== 'rumor') return false;
  const summary = item.summaryZh || '';
  return !summary ||
    isGenericFallbackSummary(summary) ||
    hasMixedEnglishSummary(summary) ||
    !/(据|报道称|消息|目前|尚未|考虑|接触|有意|计划|传闻|流言)/.test(summary) ||
    isRumorWrittenAsConfirmed(item, summary) ||
    !summaryHasMainPerson(item) ||
    isSimpleTitleRestatement(item);
}

function isAnalysisSummaryBad(item = {}) {
  if (inferStoryType(item) !== 'analysis') return false;
  const summary = item.summaryZh || '';
  return !summary ||
    isGenericFallbackSummary(summary) ||
    !isSafeChineseSummary(summary) ||
    containsRawEnglishSummaryPhrase(summary) ||
    (isRecapAnalysisTitle(item.originalTitle || item.title || '') && !hasAnalysisSummaryEvent(summary)) ||
    hasMixedEnglishSummary(summary) ||
    isAnalysisWrittenAsFact(item, summary) ||
    isSimpleTitleRestatement(item);
}

function needsAiSummary(item = {}) {
  const summary = item.summaryZh || '';
  return !summary.trim() ||
    isGenericFallbackSummary(summary) ||
    !isSafeChineseSummary(summary) ||
    containsRawEnglishSummaryPhrase(summary) ||
    /更多背景来自原文报道/.test(summary) ||
    (inferStoryType(item) === 'analysis' && (!hasAnalysisSummarySubject(summary) || !hasAnalysisSummaryEvent(summary))) ||
    hasMixedEnglishSummary(summary) ||
    isOpinionSummaryBad(item) ||
    isRumorSummaryBad(item) ||
    isAnalysisSummaryBad(item) ||
    !summaryHasMainPerson(item) ||
    isSimpleTitleRestatement(item);
}

function getAiCandidatePriority(item = {}) {
  const storyType = inferStoryType(item);
  const summary = item.summaryZh || '';
  if (!summary.trim()) return 1000;
  if (!isSafeChineseSummary(summary) || hasMixedEnglishSummary(summary) || containsRawEnglishSummaryPhrase(summary)) return 900;
  if (isGenericFallbackSummary(summary)) return 800;
  if (storyType === 'opinion' && isOpinionSummaryBad(item)) return 700;
  if (storyType === 'rumor' && isRumorSummaryBad(item)) return 600;
  if (storyType === 'analysis' && isAnalysisSummaryBad(item)) return 500;
  if (['opinion', 'rumor', 'analysis'].includes(storyType) && needsAiSummary(item)) return 400;
  if (needsAiSummary(item)) return 300;
  if ((item.importance || 1) >= 4 && ['交易', '签约', '伤病'].includes(item.category)) return 70;
  if ((item.importance || 1) >= 4) return 60;
  return 0;
}

function getCandidateTier(entry = {}, existingPayload = null, now = Date.now()) {
  const item = entry.item || {};
  const publishedAt = new Date(item.publishedAt || item.pubDate || 0).getTime();
  const ageHours = Number.isFinite(publishedAt) ? Math.max(0, (now - publishedAt) / 36e5) : Infinity;
  const isNew = !toArray(existingPayload?.items).some((existing) =>
    (existing.eventKey || existing.originalTitle || existing.title) === (item.eventKey || item.originalTitle || item.title)
  );
  const missingChinese = !hasValidChineseSummary(item);
  const failedCount = entry.backlog?.failureCount || 0;
  const wasSkipped = (entry.backlog?.skippedByLimit || 0) > 0;

  if (isNew && !entry.cached && isCoreNewsCategory(item.category)) return 100;
  if (missingChinese && ageHours <= 24) return 90;
  if (wasSkipped) return 85;
  if (missingChinese) return 75;
  if (failedCount > 0 && !isBacklogCoolingDown(entry.backlog, now)) return 55;
  return 40;
}

function compareAiCandidateEntries(existingPayload = null, now = Date.now()) {
  return (a, b) => {
    const tierDelta = getCandidateTier(b, existingPayload, now) - getCandidateTier(a, existingPayload, now);
    if (tierDelta) return tierDelta;

    const skippedDelta = (b.backlog?.skippedByLimit || 0) - (a.backlog?.skippedByLimit || 0);
    if (skippedDelta) return skippedDelta;

    const failureDelta = (a.backlog?.failureCount || 0) - (b.backlog?.failureCount || 0);
    if (failureDelta) return failureDelta;

    const priorityDelta = b.priority - a.priority;
    if (priorityDelta) return priorityDelta;

    const importanceDelta = (b.item.importance || 0) - (a.item.importance || 0);
    if (importanceDelta) return importanceDelta;

    return new Date(a.item.publishedAt || a.item.pubDate || 0).getTime() -
      new Date(b.item.publishedAt || b.item.pubDate || 0).getTime();
  };
}

function isRumorWrittenAsConfirmed(item = {}, summary = '') {
  if (inferStoryType(item) !== 'rumor') return false;
  const text = normalizeChineseText(summary);
  return /(已经|正式|完成|确定|达成|签下|交易至)/.test(text) && !/(据|报道称|消息|尚未|目前|考虑|接触|有意|计划)/.test(text);
}

function isAnalysisWrittenAsFact(item = {}, summary = '') {
  if (inferStoryType(item) !== 'analysis') return false;
  if (hasAnalysisLanguage(summary)) return false;
  return !/(分析|认为|赔率|fantasy|梦幻篮球|预测|评估|排名|观点)/i.test(summary);
}

function hasAnalysisLanguage(summary = '') {
  return /(\u5206\u6790|\u8ba4\u4e3a|\u53ef\u80fd|\u6709\u671b|\u88ab\u89c6\u4e3a|\u6216\u5c06|\u6311\u6218|\u529b\u4e89|\u5a01\u80c1|\u4e89\u593a|\u8bc4\u4f30|\u770b\u70b9|\u590d\u76d8|\u89c2\u5bdf|\u524d\u666f|\u5c55\u671b)/.test(summary);
}

function buildTypedFallbackSummary(item = {}, storyType = inferStoryType(item)) {
  const title = item.originalTitle || item.title || '';
  const source = item.source || '来源';
  const cleanTitle = normalizeChineseText(localizeCommonTerms(stripSourcePhrases(title)));
  const recapSummary = buildRecapAnalysisSummary({ title, source });
  if (recapSummary) return recapSummary;

  const warriorsDavisLeBron = title.match(/^Warriors Haven't Been Told Anthony Davis Trade Needed To Sign LeBron James$/i);
  if (warriorsDavisLeBron) {
    return `据 ${source} 报道，勇士尚未被告知必须交易 Anthony Davis 才能签下 LeBron James，目前这仍是围绕球队补强路径的消息。`;
  }

  const offerSheetMatch = title.match(/^(.+?) Will Not Match (.+?) Offer Sheet From (.+)$/i);
  if (offerSheetMatch) {
    return normalizeChineseText(`据 ${source} 报道，${localizeCommonTerms(offerSheetMatch[1])} 不会匹配 ${localizeCommonTerms(offerSheetMatch[3])} 给 ${offerSheetMatch[2]} 的报价合同。`);
  }

  const salaryCapMatch = title.match(/^The (.+?) salary-cap sheet after (.+)$/i);
  if (salaryCapMatch) {
    return normalizeChineseText(`${source} 分析了${localizeCommonTerms(salaryCapMatch[1])}在${localizeCommonTerms(salaryCapMatch[2])}之后的薪资空间情况。`);
  }

  const rosterSpotsMatch = title.match(/^(.+?) view remaining roster spots as .?critical.? to team success$/i);
  if (rosterSpotsMatch) {
    return normalizeChineseText(`据 ${source} 报道，${localizeCommonTerms(rosterSpotsMatch[1])}认为剩余名单席位对球队成败很关键。`);
  }

  const oddsMatch = title.match(/^(.+?) Odds:\s*(.+)$/i) || title.match(/^(.+?) Next Team Odds:\s*(.+)$/i);
  if (oddsMatch) {
    return normalizeChineseText(`${source} 分析了${localizeCommonTerms(oddsMatch[1])}相关赔率变化，文章属于赔率和前景分析。`);
  }

  const previewMatch = title.match(/^(.+?) Preview\b/i);
  if (previewMatch) {
    return normalizeChineseText(`${source} 对${localizeCommonTerms(previewMatch[1])}进行赛前预览，内容属于比赛信息和走势分析。`);
  }

  const accusesMatch = title.match(/^(.+?) Accuses (.+?) Of (.+)$/i);
  if (accusesMatch) {
    return normalizeChineseText(`据 ${source} 报道，${accusesMatch[1]} 指责 ${accusesMatch[2]} 涉及${localizeCommonTerms(accusesMatch[3])}。`);
  }

  if (storyType === 'opinion') {
    const processingMatch = title.match(/^(.+?) Still ['"]?Processing['"]? (.+)$/i);
    if (processingMatch) {
      const subject = /celtics'? trade of jaylen brown to 76ers/i.test(processingMatch[2])
        ? '凯尔特人将 Jaylen Brown 交易至 76 人'
        : localizeCommonTerms(processingMatch[2]);
      return normalizeChineseText(`据 ${source} 报道，${localizeCommonTerms(processingMatch[1])} 在谈到${subject}时表示，他仍在消化这件事带来的变化。`);
    }

    const saysMatch = title.match(/^(.+?)\s+(?:says|said)\s+(.+)$/i);
    if (saysMatch) {
      return normalizeChineseText(`据 ${source} 报道，${localizeCommonTerms(saysMatch[1])} 表示，${localizeCommonTerms(saysMatch[2])}。`);
    }

    const reactionMatch = title.match(/^(.+?) shares reaction to (.+)$/i);
    if (reactionMatch) {
      return normalizeChineseText(`据 ${source} 报道，${localizeCommonTerms(reactionMatch[1])} 回应了${localizeCommonTerms(reactionMatch[2])}。`);
    }

    return normalizeChineseText(`据 ${source} 报道，${cleanTitle}。`);
  }

  if (storyType === 'rumor') {
    return normalizeChineseText(`据 ${source} 报道，${cleanTitle}，目前仍属于消息或传闻阶段。`);
  }

  if (storyType === 'analysis') {
    return normalizeChineseText(`${source} 分析了${cleanTitle}，这是一篇观点或数据分析文章，并非球队官方决定。`);
  }

  return '';
}

function firstCompleteChineseSentence(value = '') {
  const text = normalizeChineseText(value);
  const sentences = text.split(/(?<=[。！？.!?])\s*/).filter(Boolean);
  return sentences[0] || text;
}

function compactAiSummary(value = '') {
  const text = normalizeChineseText(value);
  if (text.length <= 240) return text;
  const first = firstCompleteChineseSentence(text);
  return first && first.length <= 240 ? first : text;
}

function buildConservativeEmptyAiFallback(item = {}) {
  const title = item.originalTitle || item.title || '';
  const source = item.source || '媒体';
  const storyType = inferStoryType(item);
  const thoughtsMatch = title.match(/^(.+?)\s+(?:share thoughts|shares thoughts|thoughts on|discusses)\s+(?:on\s+)?(.+)$/i);
  if (storyType === 'opinion' && thoughtsMatch) {
    return normalizeChineseText(`${localizeCommonTerms(thoughtsMatch[1])}谈到了${localizeCommonTerms(thoughtsMatch[2])}，但现有报道摘要未提供具体说法。`);
  }
  const challengeMatch = title.match(/^(.+?)\s+look to challenge\s+(.+)$/i);
  if (storyType === 'analysis' && challengeMatch) {
    return normalizeChineseText(`${source} 分析了${localizeCommonTerms(challengeMatch[1])}挑战${localizeCommonTerms(challengeMatch[2])}的可能性。`);
  }
  if (storyType === 'analysis') {
    return buildTypedFallbackSummary(item, storyType);
  }
  return '';
}

function cleanAiChineseCopy(value = '') {
  return normalizeChineseText(value)
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .replace(/^["“”]+|["“”]+$/g, '')
    .replace(/\s+([，。！？：；、])/g, '$1')
    .replace(/([，。！？：；、])\s+/g, '$1')
    .replace(/。{2,}/g, '。')
    .trim();
}

function hasModelMetaText(value = '') {
  return /以下是|根据提供的信息|作为\s*AI|我无法|Markdown|```|JSON|摘要如下|改写如下/i.test(String(value));
}

function hasEmptySummaryTemplate(value = '') {
  return /相关消息更新|最新动态和后续影响|原文聚焦|更多背景来自原文报道|这篇文章讨论了|关于.+的更新/.test(String(value));
}

function getChineseLength(value = '') {
  return (String(value).match(/[\u4e00-\u9fa5]/g) || []).length;
}

function isAllowedStoryType(value = '') {
  return ['fact', 'trade', 'signing', 'injury', 'draft', 'rumor', 'opinion', 'analysis', 'unknown'].includes(String(value || '').trim());
}

function needsAiRewriteRetry(validation = {}) {
  return toArray(validation.rejectionReasons).some((reason) =>
    ['non-chinese-summary', 'non-chinese-oneline', 'too-long-summary', 'too-long-oneline', 'model-meta-text', 'generic-summary', 'unsafe-summary'].includes(reason)
  );
}

function validateAiSummary(item = {}, aiResult = null) {
  if (!aiResult || typeof aiResult !== 'object') return { accepted: false, reason: 'empty-result' };
  const confidence = Number(aiResult.confidence || 0);
  const rawSummaryZh = cleanAiChineseCopy(aiResult.summaryZh || '');
  const summaryZh = compactAiSummary(rawSummaryZh);
  const oneLineZh = cleanAiChineseCopy(aiResult.oneLineZh || summaryZh);
  const localStoryType = inferStoryType(item);
  const modelStoryType = normalizeWhitespace(aiResult.storyType || '');
  const storyType = localStoryType && localStoryType !== 'unknown'
    ? localStoryType
    : modelStoryType;
  if (modelStoryType && modelStoryType !== storyType) {
    console.warn('Story type conflict:', JSON.stringify({
      originalTitle: item.originalTitle || item.title || item.id,
      localStoryType,
      modelStoryType,
      effectiveStoryType: storyType
    }, null, 2));
  }
  const sourceText = buildSourceEvidence(item);
  const aiText = `${summaryZh} ${oneLineZh}`;
  const rejectionReasons = [];
  const unsafeFragments = summaryZh ? findUnsafeSummaryFragments(summaryZh) : [];
  const addedFacts = summaryZh ? findAddedFacts(item, aiText) : [];

  if (!Number.isFinite(confidence) || confidence < 0.5) rejectionReasons.push('low-confidence');
  if (Number.isFinite(confidence) && (confidence < 0 || confidence > 1)) rejectionReasons.push('invalid-confidence');
  if (!summaryZh) rejectionReasons.push('empty-summary');
  if (summaryZh && !isPredominantlyChinese(summaryZh)) rejectionReasons.push('non-chinese-summary');
  if (oneLineZh && !isPredominantlyChinese(oneLineZh)) rejectionReasons.push('non-chinese-oneline');
  if (getChineseLength(summaryZh) > 240) rejectionReasons.push('too-long-summary');
  if (getChineseLength(oneLineZh) > 48) rejectionReasons.push('too-long-oneline');
  if (hasModelMetaText(`${summaryZh} ${oneLineZh}`)) rejectionReasons.push('model-meta-text');
  if (hasEmptySummaryTemplate(`${summaryZh} ${oneLineZh}`)) rejectionReasons.push('generic-summary');
  if (modelStoryType && !isAllowedStoryType(modelStoryType)) rejectionReasons.push('invalid-story-type');
  if (summaryZh && !isSafeChineseSummary(summaryZh)) rejectionReasons.push('unsafe-summary');
  if (compactComparable(summaryZh) === compactComparable(item.originalTitle || item.title || '')) rejectionReasons.push('summary-repeats-title');
  if (/相关消息更新|后续动向|继续更新|值得关注|详情请/.test(summaryZh)) rejectionReasons.push('generic-summary');
  if (addedFacts.length) rejectionReasons.push('added-facts');
  if (storyType === 'opinion' && !isOpinionSummaryComplete(summaryZh)) rejectionReasons.push('incomplete-opinion-summary');
  if (storyType === 'rumor' && isRumorWrittenAsConfirmed(item, summaryZh)) rejectionReasons.push('rumor-as-fact');
  if (storyType === 'analysis' && isAnalysisWrittenAsFact(item, summaryZh) && !/(分析|可能|可能性|前景|挑战|力争|威胁|争夺|评估|看点|复盘|观察)/.test(summaryZh)) rejectionReasons.push('analysis-as-fact');

  if (confidence >= 0.5 && confidence < 0.6) {
    const player = getEventPlayer(sourceText);
    const teams = getEventTeams(sourceText);
    const hasMainPersonOrTeam = !player && !teams.length
      ? /NBA|球队|比赛|交易|签约|伤病|自由市场|夏季联赛|赛季|阵容/.test(summaryZh)
      : (!player || slugText(summaryZh).includes(player)) || teams.some((team) => summaryZh.includes(team));
    if (!hasMainPersonOrTeam) rejectionReasons.push('medium-confidence-missing-subject');
  }

  if (rejectionReasons.length) {
    return {
      accepted: false,
      reason: rejectionReasons[0],
      rejectionReasons,
      confidence,
      summaryZh,
      oneLineZh,
      storyType,
      addedFacts,
      unsafeFragments
    };
  }

  return {
    accepted: true,
    value: {
      summaryZh,
      oneLineZh,
      copySource: 'github-models',
      aiModel: aiResult.model || getAiModel(),
      aiGeneratedAt: new Date().toISOString(),
      aiConfidence: confidence,
      storyType
    },
    confidenceBand: confidence < 0.6 ? 'medium' : 'high'
  };
}

function applyCachedAiSummary(item = {}, cached = null) {
  if (!cached) return item;
  const validation = validateAiSummary(item, { ...cached, confidence: cached.confidence ?? 1 });
  if (!validation.accepted) return item;
  return normalizeNewsItemText({ ...item, ...validation.value });
}

function buildAiCandidateEvaluations(items = [], existingPayload = null, cache = { entries: {} }, { log = false } = {}) {
  const now = Date.now();
  return items.map((item, index) => {
    const cacheKey = getAiCacheKey(item);
    const sourceHash = getAiSourceHash(item);
    const cached = cache.entries?.[cacheKey];
    const backlog = getBacklogEntry(cache, cacheKey);
    const hasValidCache = hasValidAiSummaryCache(cached, sourceHash);
    const storyType = inferStoryType(item);
    const coolingDown = isBacklogCoolingDown(backlog, now);
    const priority = !coolingDown && isAiCandidate(item, { hasValidCache }) ? getAiCandidatePriority(item) : 0;
    const candidate = priority > 0;
    const evaluation = {
      item,
      index,
      cacheKey,
      sourceHash,
      cached,
      backlog,
      hasValidCache,
      coolingDown,
      storyType,
      priority,
      candidate,
      rejectionReason: coolingDown ? 'backlog-cooldown' : getAiCandidateRejectionReason(item, { hasValidCache, candidate, priority })
    };
    if (log) {
      console.log('AI candidate evaluation:', JSON.stringify({
        originalTitle: item.originalTitle || item.title || '',
        storyType,
        importance: item.importance || 1,
        isNew: !toArray(existingPayload?.items).some((existing) => (existing.eventKey || existing.originalTitle || existing.title) === (item.eventKey || item.originalTitle || item.title)),
        needsAiSummary: needsAiSummary(item),
        hasCache: hasValidCache,
        failureCount: backlog.failureCount || 0,
        skippedByLimit: backlog.skippedByLimit || 0,
        coolingDown,
        eligibleCategory: isCoreNewsCategory(item.category) || isImportantRumor(item) || ['opinion', 'rumor', 'analysis'].includes(storyType),
        rejectionReason: evaluation.rejectionReason || ''
      }, null, 2));
    }
    return evaluation;
  });
}

async function applyGitHubModelsEnhancements(items = [], existingPayload = null) {
  const requestedEnabled = isGitHubModelsEnabled();
  const enabled = requestedEnabled && Boolean(process.env.GITHUB_MODELS_TOKEN);
  const model = getAiModel();
  const cache = await readAiSummaryCache();
  const stats = {
    aiEnabled: enabled,
    aiCandidates: 0,
    aiCacheHits: 0,
    aiRequests: 0,
    aiAccepted: 0,
    aiRejected: 0,
    aiFailed: 0,
    aiRetried: 0,
    rejectedAsNonChinese: 0,
    skippedByLimit: 0,
    rejectedLowConfidenceBelow50: 0,
    acceptedMediumConfidence: 0,
    acceptedHighConfidence: 0,
    aiConfidenceValues: [],
    acceptedConfidenceValues: [],
    aiLogicError: false,
    fallbackItems: 0,
    aiModel: model,
    totalNewsItems: items.length,
    itemsWithValidChineseSummary: 0,
    itemsMissingChineseSummary: 0,
    eligibleBacklog: 0,
    selectedThisRun: 0,
    previouslyFailed: 0,
    remainingAfterRun: 0
  };

  let remainingRequests = getGithubModelsMaxItems();
  const enhanced = [];

  if (requestedEnabled && !enabled) {
    console.warn('GitHub Models enabled but GITHUB_MODELS_TOKEN is missing; using fallback copy.');
  }

  const evaluatedEntries = buildAiCandidateEvaluations(items, existingPayload, cache, { log: requestedEnabled });
  const activeKeys = new Set(evaluatedEntries.map((entry) => entry.cacheKey));
  pruneAiBacklog(cache, activeKeys);

  const candidateEntries = evaluatedEntries
    .filter((entry) => entry.priority > 0)
    .sort(compareAiCandidateEntries(existingPayload));
  stats.aiCandidates = candidateEntries.length;
  stats.itemsWithValidChineseSummary = items.filter(hasValidChineseSummary).length;
  stats.itemsMissingChineseSummary = items.length - stats.itemsWithValidChineseSummary;
  stats.eligibleBacklog = candidateEntries.length;
  stats.previouslyFailed = candidateEntries.filter((entry) => (entry.backlog?.failureCount || 0) > 0).length;
  const selectedEntries = enabled ? candidateEntries.slice(0, getGithubModelsMaxItems()) : [];
  const selectedEntryByKey = new Map(selectedEntries.map((entry) => [entry.cacheKey, entry]));
  const candidateKeys = new Set(selectedEntries.map((entry) => entry.cacheKey));
  stats.selectedThisRun = selectedEntries.length;
  stats.skippedByLimit = enabled ? Math.max(0, candidateEntries.length - candidateKeys.size) : 0;
  if (enabled) {
    candidateEntries.slice(getGithubModelsMaxItems()).forEach((entry) => markBacklogSkipped(cache, entry, 'limit'));
  }

  for (const item of items) {
    const cacheKey = getAiCacheKey(item);
    const evaluated = evaluatedEntries.find((entry) => entry.cacheKey === cacheKey);
    const sourceHash = evaluated?.sourceHash || getAiSourceHash(item);
    const cached = evaluated?.cached || cache.entries[cacheKey];
    const canUseCache = evaluated?.hasValidCache || hasValidAiSummaryCache(cached, sourceHash);
    const candidate = enabled && candidateKeys.has(cacheKey);
    if (canUseCache) {
      stats.aiCacheHits += 1;
      clearBacklogState(cache, cacheKey);
      enhanced.push(applyCachedAiSummary(item, cached));
      continue;
    }

    if (!candidate || remainingRequests <= 0) {
      stats.fallbackItems += 1;
      enhanced.push({ ...item, copySource: item.copySource || 'fallback' });
      continue;
    }

    stats.aiRequests += 1;
    remainingRequests -= 1;
    const selectedEntry = selectedEntryByKey.get(cacheKey) || evaluated;
    let aiResult = await summarizeWithGitHubModels(item);
    if (!aiResult) {
      stats.aiFailed += 1;
      console.warn('AI summary failed: request returned no usable JSON');
      markBacklogFailure(cache, selectedEntry, 'request-failed');
      enhanced.push({ ...item, copySource: 'fallback' });
      continue;
    }

    let validation = validateAiSummary(item, aiResult);
    if (!validation.accepted && needsAiRewriteRetry(validation) && remainingRequests > 0) {
      stats.aiRetried += 1;
      stats.aiRequests += 1;
      remainingRequests -= 1;
      const retryResult = await summarizeWithGitHubModels(
        item,
        '上一次结果不符合自然中文 NBA 快讯文风。请保持事实完全不变，只重写中文表达。不要逐句翻译，不得添加信息；summaryZh 必须是中文为主、2 到 3 句、240 个中文字符以内，像读完文章后的复述；oneLineZh 必须是中文为主、48 个中文字符以内。'
      );
      if (retryResult) {
        aiResult = retryResult;
        validation = validateAiSummary(item, aiResult);
      }
    }
    if (Number.isFinite(validation.confidence)) {
      stats.aiConfidenceValues.push(validation.confidence);
    } else if (Number.isFinite(Number(aiResult.confidence))) {
      stats.aiConfidenceValues.push(Number(aiResult.confidence));
    }
    if (!validation.accepted) {
      stats.aiRejected += 1;
      if (validation.rejectionReasons?.includes('low-confidence')) {
        stats.rejectedLowConfidenceBelow50 += 1;
      }
      if (validation.rejectionReasons?.includes('non-chinese-summary') || validation.rejectionReasons?.includes('non-chinese-oneline')) {
        stats.rejectedAsNonChinese += 1;
        console.warn('AI summary skipped: non-Chinese output');
      }
      console.warn('GitHub Models result rejected:', JSON.stringify({
        originalTitle: item.originalTitle || item.title || item.id,
        confidence: validation.confidence ?? Number(aiResult.confidence || 0),
        storyType: validation.storyType || aiResult.storyType || inferStoryType(item),
        summaryZh: validation.summaryZh ?? aiResult.summaryZh ?? '',
        oneLineZh: validation.oneLineZh ?? aiResult.oneLineZh ?? '',
        rejectionReasons: validation.rejectionReasons || [validation.reason],
        addedFacts: validation.addedFacts || [],
        unsafeFragments: validation.unsafeFragments || []
      }, null, 2));
      if (validation.rejectionReasons?.includes('empty-summary')) {
        const conservativeSummary = buildConservativeEmptyAiFallback(item);
        if (conservativeSummary && isSafeChineseSummary(conservativeSummary)) {
          enhanced.push(normalizeNewsItemText({
            ...item,
            summaryZh: conservativeSummary,
            copySource: 'fallback'
          }));
          continue;
        }
      }
      enhanced.push({ ...item, copySource: 'fallback' });
      markBacklogFailure(cache, selectedEntry, validation.reason || 'rejected');
      continue;
    }

    stats.aiAccepted += 1;
    stats.acceptedConfidenceValues.push(validation.value.aiConfidence);
    if (validation.confidenceBand === 'medium') {
      stats.acceptedMediumConfidence += 1;
    } else {
      stats.acceptedHighConfidence += 1;
    }
    cache.entries[cacheKey] = {
      summaryZh: validation.value.summaryZh,
      oneLineZh: validation.value.oneLineZh,
      confidence: validation.value.aiConfidence,
      storyType: validation.value.storyType,
      model,
      generatedAt: validation.value.aiGeneratedAt,
      sourceHash,
      promptVersion: aiPromptVersion
    };
    clearBacklogState(cache, cacheKey);
    enhanced.push(normalizeNewsItemText({ ...item, ...validation.value }));
  }

  stats.remainingAfterRun = enhanced.filter((item) => !hasValidChineseSummary(item)).length;

  if (stats.aiAccepted > 0 || stats.skippedByLimit > 0 || stats.aiFailed > 0 || stats.aiRejected > 0 || stats.aiCacheHits > 0) {
    await writeAiSummaryCache(cache);
  }

  const qualityAfterAi = getQualityReport({ items: enhanced, highlights: [] });
  const badSummaryCount =
    (qualityAfterAi.counts.badFallbackOpinionSummary || 0) +
    (qualityAfterAi.counts.badFallbackRumorSummary || 0) +
    (qualityAfterAi.counts.badFallbackAnalysisSummary || 0) +
    (qualityAfterAi.counts.unsafeFallbackSummary || 0);
  if (requestedEnabled && badSummaryCount > 0 && stats.aiCandidates === 0) {
    stats.aiLogicError = true;
    console.error('AI enabled but bad summaries exist and no candidates were selected.');
  }
  const averageAiConfidence = stats.aiConfidenceValues.length
    ? stats.aiConfidenceValues.reduce((total, value) => total + value, 0) / stats.aiConfidenceValues.length
    : null;
  const minAcceptedConfidence = stats.acceptedConfidenceValues.length ? Math.min(...stats.acceptedConfidenceValues) : null;
  const maxAcceptedConfidence = stats.acceptedConfidenceValues.length ? Math.max(...stats.acceptedConfidenceValues) : null;
  stats.averageAiConfidence = averageAiConfidence;
  stats.minAcceptedConfidence = minAcceptedConfidence;
  stats.maxAcceptedConfidence = maxAcceptedConfidence;
  stats.finalItemsWithChineseSummary = enhanced.filter((item) => isPredominantlyChinese(item.summaryZh || '')).length;
  stats.finalItemsWithoutChineseSummary = enhanced.filter((item) => !isPredominantlyChinese(item.summaryZh || '')).length;

  console.log('GitHub Models summary:', JSON.stringify({
    'GitHub Models enabled': stats.aiEnabled,
    'AI candidates': stats.aiCandidates,
    'AI cache hits': stats.aiCacheHits,
    'AI requests': stats.aiRequests,
    'AI accepted': stats.aiAccepted,
    'AI rejected': stats.aiRejected,
    'AI failed': stats.aiFailed,
    'AI retried': stats.aiRetried,
    rejectedAsNonChinese: stats.rejectedAsNonChinese,
    skippedByLimit: stats.skippedByLimit,
    totalNewsItems: stats.totalNewsItems,
    itemsWithValidChineseSummary: stats.itemsWithValidChineseSummary,
    itemsMissingChineseSummary: stats.itemsMissingChineseSummary,
    eligibleBacklog: stats.eligibleBacklog,
    selectedThisRun: stats.selectedThisRun,
    previouslyFailed: stats.previouslyFailed,
    remainingAfterRun: stats.remainingAfterRun,
    rejectedLowConfidenceBelow50: stats.rejectedLowConfidenceBelow50,
    acceptedMediumConfidence: stats.acceptedMediumConfidence,
    acceptedHighConfidence: stats.acceptedHighConfidence,
    averageAiConfidence,
    minAcceptedConfidence,
    maxAcceptedConfidence,
    'AI logic error': stats.aiLogicError,
    'Fallback items': stats.fallbackItems,
    Model: stats.aiModel
  }, null, 2));

  console.log('AI summary diagnostics:', JSON.stringify({
    model: stats.aiModel,
    candidates: stats.aiCandidates,
    cached: stats.aiCacheHits,
    requested: stats.aiRequests,
    succeeded: stats.aiAccepted,
    retried: stats.aiRetried,
    failed: stats.aiFailed,
    rejectedAsNonChinese: stats.rejectedAsNonChinese,
    skippedByLimit: stats.skippedByLimit,
    finalItemsWithChineseSummary: stats.finalItemsWithChineseSummary,
    finalItemsWithoutChineseSummary: stats.finalItemsWithoutChineseSummary
  }, null, 2));

  console.log('AI backlog diagnostics:', JSON.stringify({
    totalNewsItems: stats.totalNewsItems,
    itemsWithValidChineseSummary: stats.itemsWithValidChineseSummary,
    itemsMissingChineseSummary: stats.itemsMissingChineseSummary,
    eligibleBacklog: stats.eligibleBacklog,
    selectedThisRun: stats.selectedThisRun,
    skippedByLimit: stats.skippedByLimit,
    previouslyFailed: stats.previouslyFailed,
    remainingAfterRun: stats.remainingAfterRun
  }, null, 2));

  return { items: enhanced, stats };
}

function stripSourcePhrases(value = '') {
  return String(value)
    .replace(/,\s*(?:AP )?source says$/i, '')
    .replace(/,\s*according to report$/i, '')
    .replace(/,\s*according to .+$/i, '')
    .trim();
}

function hasMachineEnglish(value = '') {
  const text = String(value);
  return /\b(?:considered|expected|agree|agrees|signing|signed|sign|named|with|from|into|onto|upon|under|over|after|before|during|likely|believed|pursuing|delaying|leading|target|source says|free agency|contract|deal|traded|trade|rumors|tracker|reacts|survey|continue|continued|host|play host|interested|according|not|for|vs|versus|about|ready|fill|reveal|reveals|calls|moving|latest|play)\b/i.test(text);
}

function safeTitle(titleZh, originalTitle) {
  const cleaned = normalizeSpacing(titleZh);
  return hasMachineEnglish(cleaned) ? buildConservativeHeadline(originalTitle, classify(originalTitle, '')) : cleaned;
}

function normalizeComparableText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

function isHighlySimilarText(a = '', b = '') {
  const left = normalizeComparableText(a);
  const right = normalizeComparableText(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  return shorter.length >= 12 && longer.includes(shorter);
}

function stripLeadingAttribution(value = '') {
  return String(value).replace(/^据\s+.+?\s+报道，/, '').trim();
}

function stripTrailingPunctuation(value = '') {
  return String(value).replace(/[。.!?！？]+$/g, '').trim();
}

function cleanDek(headlineZh = '', candidate = '') {
  const cleaned = normalizeSpacing(candidate);
  if (!cleaned) return '';
  if (isHighlySimilarText(stripTrailingPunctuation(cleaned), headlineZh)) return '';
  if (isBadDek(cleaned)) return '';
  return cleaned;
}

function hasChinese(value = '') {
  return /[\u4e00-\u9fa5]/.test(value);
}

function getEnglishWordCount(value = '') {
  return (String(value).match(/[A-Za-z]{3,}/g) || []).length;
}

function getKnownTeamMentions(value = '') {
  const mentions = [];
  for (const [english, chinese] of teamNames) {
    const pattern = new RegExp(`\\b${english.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(value) && !mentions.includes(chinese)) {
      mentions.push(chinese);
    }
  }
  return mentions;
}

function getFeaturedPerson(value = '') {
  const candidate =
    String(value)
      .replace(/\b(?:NBA|NIL|MLE)\b/g, '')
      .match(/\b[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,2}\b/)?.[0] || '';
  if (/^(?:Multiple Bids|Podcast Prophecy|Cup Championship|Sets Salary|Las Vegas|Los Angeles|LA Sports)$/i.test(candidate)) {
    return '';
  }
  return candidate;
}

function buildConservativeHeadline(title = '', category = '其他') {
  const cleanTitle = stripSourcePhrases(title);

  const nbaEuropeBidsMatch = cleanTitle.match(/^Multiple Bids For NBA Europe Franchises Top \$(.+?) Billion$/i);
  if (nbaEuropeBidsMatch) {
    return `NBA欧洲联赛多个球队竞标价超过${Number(nbaEuropeBidsMatch[1]) * 10}亿美元`;
  }

  const nbaCupSetMatch = cleanTitle.match(/^NBA Cup Championship Game Set For (.+?) In (.+?) On (.+)$/i);
  if (nbaCupSetMatch) {
    return `NBA杯冠军赛将于${nbaCupSetMatch[3]}在${localizeCommonTerms(nbaCupSetMatch[2])}${localizeCommonTerms(nbaCupSetMatch[1])}举行`;
  }

  const nbaCupLeavingMatch = cleanTitle.match(/^NBA Cup final leaving (.+?) for Butler's Hinkle Fieldhouse; groups, key dates revealed$/i);
  if (nbaCupLeavingMatch) {
    return `NBA杯决赛将离开${localizeCommonTerms(nbaCupLeavingMatch[1])}，改到巴特勒大学Hinkle Fieldhouse举行`;
  }

  const salaryCapSetMatch = cleanTitle.match(/^NBA Sets Salary Cap For (.+?) Season At (.+)$/i);
  if (salaryCapSetMatch) {
    return `NBA将${salaryCapSetMatch[1]}赛季工资帽定为${localizeCommonTerms(salaryCapSetMatch[2])}`;
  }

  const podcastProphecyMatch = cleanTitle.match(/^A Podcast Prophecy\? Steph, LeBron, and the Next NBA Duo$/i);
  if (podcastProphecyMatch) {
    return 'Steph与LeBron联手话题再起，外界讨论下一组NBA双星组合';
  }

  const radioHostLebronMatch = cleanTitle.match(/^LA sports radio host torches Le?bron in blistering reaction: [‘']Wasn[’']t a Laker[’']$/i);
  if (radioHostLebronMatch) {
    return '洛杉矶电台主持人批评LeBron，称他不算真正的湖人';
  }

  const acquireForPackageMatch = cleanTitle.match(/^(.+?) Acquire (.+?) From (.+?) For (.+?), (.+?), (.+)$/i);
  if (acquireForPackageMatch) {
    const packageText = `${acquireForPackageMatch[4]}、${acquireForPackageMatch[5]}和${acquireForPackageMatch[6]}`
      .replace(/\bTwo First Rounders\b/i, '两个首轮签')
      .replace(/\bOne Swap\b/i, '一次选秀权互换');
    return `${localizeCommonTerms(acquireForPackageMatch[1])}从${localizeCommonTerms(acquireForPackageMatch[3])}得到${localizeCommonTerms(acquireForPackageMatch[2])}，送出${localizeCommonTerms(packageText)}`;
  }

  const relyingExperienceMatch = cleanTitle.match(/^(.+?) relying on experience vs (?:the )?(West(?:ern Conference)?)[’']s youth movement$/i);
  if (relyingExperienceMatch) {
    return `${localizeCommonTerms(relyingExperienceMatch[1])}继续倚重经验阵容，应对西部年轻化浪潮`;
  }

  const endedPlayerTeamEraMatch = cleanTitle.match(
    /^How (?:the )?(.+?) ended (?:the )?(.+?) (Hawks|Celtics|Nets|Hornets|Bulls|Cavaliers|Cavs|Mavericks|Nuggets|Pistons|Warriors|Rockets|Pacers|Clippers|Lakers|Grizzlies|Heat|Bucks|Timberwolves|Pelicans|Knicks|Thunder|Magic|76ers|Sixers|Suns|Trail Blazers|Blazers|Kings|Spurs|Raptors|Jazz|Wizards) era$/i
  );
  if (endedPlayerTeamEraMatch) {
    return `${localizeCommonTerms(endedPlayerTeamEraMatch[1])}如何终结${localizeCommonTerms(endedPlayerTeamEraMatch[2])}的${localizeCommonTerms(endedPlayerTeamEraMatch[3])}时代`;
  }

  const endedEraMatch = cleanTitle.match(/^How (.+?) ended (?:the )?(.+?) (.+?) era$/i);
  if (endedEraMatch) {
    return `${localizeCommonTerms(endedEraMatch[1])}如何终结${localizeCommonTerms(endedEraMatch[2])}的${localizeCommonTerms(endedEraMatch[3])}时代`;
  }

  const fillVoidMatch = cleanTitle.match(/^(.+?) ready for his shot to fill (.+?)['’]s? (.+?) void$/i);
  if (fillVoidMatch) {
    return `${localizeCommonTerms(fillVoidMatch[1])}有望填补${localizeCommonTerms(fillVoidMatch[2])}留下的${localizeCommonTerms(fillVoidMatch[3])}空缺`;
  }

  const championshipGameMovingMatch = cleanTitle.match(/^NBA Cup championship game moving to (.+?) for (.+)$/i);
  if (championshipGameMovingMatch) {
    return `NBA杯冠军赛将在${championshipGameMovingMatch[2]}年移师知名大学篮球场馆`;
  }

  const undecidedFinalSeasonMatch = cleanTitle.match(/^(.+?) Undecided On Whether This Will Be His Final NBA Season$/i);
  if (undecidedFinalSeasonMatch) {
    return `${localizeCommonTerms(undecidedFinalSeasonMatch[1])}尚未决定这是否是自己的最后一个NBA赛季`;
  }

  const holdingTradeTalksMatch = cleanTitle.match(/^(.+?) Holding Trade Talks Involving (.+)$/i);
  if (holdingTradeTalksMatch) {
    return `${localizeCommonTerms(holdingTradeTalksMatch[1])}围绕${localizeCommonTerms(holdingTradeTalksMatch[2])}展开交易讨论`;
  }

  const whatGaveUpMatch = cleanTitle.match(/^This is what (.+?) gave up for (.+?)(?: \(and why it doesn’t matter\))?$/i);
  if (whatGaveUpMatch) {
    return `${localizeCommonTerms(whatGaveUpMatch[1])}为得到${localizeCommonTerms(whatGaveUpMatch[2])}付出了哪些筹码`;
  }
  const teams = getKnownTeamMentions(cleanTitle);
  const person = getFeaturedPerson(cleanTitle);
  const subject = teams[0] || person || 'NBA';
  const text = cleanTitle.toLowerCase();

  if (/(free agency|free agent|sign|contract|deal|extension)/i.test(text)) {
    return `${subject}相关动态：自由市场与合同情况继续更新`;
  }

  if (/(trade|traded|acquire|swap)/i.test(text)) {
    return `${subject}相关动态：球队继续评估交易与阵容调整`;
  }

  if (/(injury|injured|surgery|ankle|knee|wrist|toe)/i.test(text)) {
    return `${subject}相关动态：伤病与复出情况继续更新`;
  }

  if (/(draft|rookie|summer league|prospect)/i.test(text)) {
    return `${subject}相关动态：年轻球员与选秀话题继续发酵`;
  }

  if (/(playoff|finals|championship|cup)/i.test(text) || category === '季后赛') {
    return `${subject}相关动态：赛事安排与争冠话题继续更新`;
  }

  if (/warriors/i.test(text) && /(experience|youth movement)/i.test(text)) {
    return '勇士相关动态：球队继续围绕经验阵容调整';
  }

  return `${subject}相关动态：球队后续动向值得关注`;
}

function isUnnaturalHeadline(value = '') {
  const text = String(value);
  if (!text) return true;
  if (!hasChinese(text)) return true;
  if (hasMachineEnglish(text)) return true;
  return getEnglishWordCount(text) >= 5;
}

function finalizeHeadline(title = '', category = '其他') {
  const translated = translateTitle(title, category);
  if (isUnnaturalHeadline(translated)) {
    return buildConservativeHeadline(title, category);
  }
  return translated;
}

function isBadDek(value = '') {
  const text = String(value).trim();
  if (text.length < 14) return true;
  if (/[［\[]?…|\.{3}|\[[^\]]*\]/.test(text)) return true;
  if (/^(?:not|no|for|with|in|at|on|to|from|and|but)\b/i.test(text)) return true;
  if (hasMachineEnglish(text)) return true;
  if (!/[。！？]$/.test(text)) return true;
  return false;
}

function localizeCommonTerms(value = '') {
  let text = value;

  for (const [english, chinese] of playerNameZh) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(english)}\\b`, 'gi'), chinese);
  }

  for (const [english, chinese] of teamNames) {
    text = text.replaceAll(english, chinese);
  }

  return text
    .replace(/\bthe\s+(?=[\u4e00-\u9fa5])/gi, '')
    .replace(/\ba\s+(?=[\u4e00-\u9fa5])/gi, '')
    .replace(/\bstarting five\b/gi, '首发五人')
    .replace(/\bCalifornia\b/gi, '加州')
    .replace(/\bmulti[-\s]+year contract\b/gi, '多年合同')
    .replace(/\btitle contenders\b/gi, '争冠球队')
    .replace(/\bchampionship odds\b/gi, '争冠赔率')
    .replace(/\bfantasy basketball\b/gi, '梦幻篮球')
    .replace(/\bLas Vegas\b/gi, '拉斯维加斯')
    .replace(/\bMonday\b/gi, '周一')
    .replace(/\bTuesday\b/gi, '周二')
    .replace(/\bWednesday\b/gi, '周三')
    .replace(/\bThursday\b/gi, '周四')
    .replace(/\bFriday\b/gi, '周五')
    .replace(/\bSaturday\b/gi, '周六')
    .replace(/\bSunday\b/gi, '周日')
    .replace(/\bmulti-year\b/gi, '多年')
    .replace(/\bmulti year\b/gi, '多年')
    .replace(/\bOne-Year\b/gi, '一年')
    .replace(/\bone-year\b/gi, '一年')
    .replace(/\bone year\b/gi, '一年')
    .replace(/\bTwo-Year\b/gi, '两年')
    .replace(/\btwo-year\b/gi, '两年')
    .replace(/\btwo year\b/gi, '两年')
    .replace(/\bThree-Year\b/gi, '三年')
    .replace(/\bthree-year\b/gi, '三年')
    .replace(/\bthree year\b/gi, '三年')
    .replace(/\bFour-Year\b/gi, '四年')
    .replace(/\bfour-year\b/gi, '四年')
    .replace(/\bfour year\b/gi, '四年')
    .replace(/\bFive-Year\b/gi, '五年')
    .replace(/\bfive-year\b/gi, '五年')
    .replace(/\bfive year\b/gi, '五年')
    .replace(/\beight\b/gi, '八')
    .replace(/\b(\d+)-year\b/gi, (_, years) => `${years}年`)
    .replace(/\$(\d+(?:\.\d+)?)M\b/g, (_, amount) => `${Math.round(Number(amount) * 100)}万美元`)
    .replace(/\$(\d+(?:\.\d+)?) million\b/gi, (_, amount) => `${Math.round(Number(amount) * 100)}万美元`)
    .replace(/\bpoints\b/gi, '分')
    .replace(/\brebounds\b/gi, '篮板')
    .replace(/\bassists\b/gi, '助攻')
    .replace(/\bsteals\b/gi, '抢断')
    .replace(/\bblocks\b/gi, '盖帽')
    .replace(/\bgames\b/gi, '场')
    .replace(/\bminutes\b/gi, '分钟')
    .replace(/\blast season\b/gi, '上赛季')
    .replace(/\bleft wrist fracture\b/gi, '左手腕骨折')
    .replace(/\bsprained toe\b/gi, '脚趾扭伤')
    .replace(/\bthree-pointers\b/gi, '三分球')
    .replace(/\bplayoff games\b/gi, '季后赛')
    .replace(/\bregular season games\b/gi, '常规赛')
    .replace(/\bfree agency\b/gi, '自由市场')
    .replace(/\brookie\b/gi, '新秀')
    .replace(/\btwo-way\b/gi, '双向')
    .replace(/\btwo way\b/gi, '双向')
    .replace(/\bfrontcourt\b/gi, '前场')
    .replace(/\bbackcourt\b/gi, '后场')
    .replace(/\bcenter position\b/gi, '中锋位置')
    .replace(/\bcenter\b/gi, '中锋')
    .replace(/\bdefense\b/gi, '防守')
    .replace(/\bpoint of attack\b/gi, '持球攻击点防守')
    .replace(/\bveteran guard\b/gi, '老将后卫')
    .replace(/\bguard\b/gi, '后卫')
    .replace(/\bstarting small forward\b/gi, '首发小前锋')
    .replace(/\bfail to retain\b/gi, '未能留住')
    .replace(/\bcontract extension\b/gi, '续约合同')
    .replace(/\bdeal\b/gi, '合同')
    .replace(/\bcontract\b/gi, '合同')
    .replace(/\bagreement\b/gi, '协议')
    .replace(/\bagree to\b/gi, '达成')
    .replace(/\bagreed to\b/gi, '达成')
    .replace(/\breached agreement on\b/gi, '达成')
    .replace(/\bwith a mutual option for Year 2\b/gi, '，第二年为双方选项')
    .replace(/\bat the tax midlevel exception\b/gi, '，使用税中产特例')
    .replace(/\band\b/gi, '和')
    .replace(/\bin\b/gi, '在')
    .replace(/\bthe\s+/gi, '')
    .replace(/\ba\s+/gi, '')
    .replace(/\s+,/g, '，')
    .replace(/,\s*/g, '，')
    .replace(/\s+\./g, '。')
    .replace(/\s+和\s+/g, '和')
    .replace(/在\s+(\d)/g, '在$1')
    .replace(/(\d(?:\.\d+)?)\s+(分|篮板|助攻|抢断|盖帽|分钟|场)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

function translateTitle(title = '', category = '其他') {
  const joiningContractMatch = title.match(/^(.+?) joining (.+?) on (.+?) contract(?: as .+)?$/i);
  if (joiningContractMatch) {
    return `${localizeCommonTerms(joiningContractMatch[1])}将加盟${localizeCommonTerms(joiningContractMatch[2])}，合同为${localizeCommonTerms(joiningContractMatch[3])}`;
  }

  const cleanTitle = stripSourcePhrases(title);

  const kesslerTargetMatch = cleanTitle.match(/^(.+?) considered (.+?) top target in free agency$/i);
  if (kesslerTargetMatch) {
    return `${localizeCommonTerms(kesslerTargetMatch[2])}将${localizeCommonTerms(kesslerTargetMatch[1])}视为自由市场重点目标`;
  }

  const teamTopTargetMatch = cleanTitle.match(/^(.+?) considered (.+?) top target$/i);
  if (teamTopTargetMatch) {
    return `${localizeCommonTerms(teamTopTargetMatch[2])}将${localizeCommonTerms(teamTopTargetMatch[1])}视为重点目标`;
  }

  const kawhiBackTorontoMatch = title.match(/^(.+?) going back to Toronto after Raptors make deal with Clippers(?:,.*)?$/i);
  if (kawhiBackTorontoMatch) {
    return `${localizeCommonTerms(kawhiBackTorontoMatch[1])}将重返多伦多，猛龙与快船达成交易`;
  }

  const kawhiTradedMatch = title.match(/^(.+?) traded to Toronto Raptors$/i);
  if (kawhiTradedMatch) {
    return `${localizeCommonTerms(kawhiTradedMatch[1])}被交易至多伦多猛龙`;
  }

  const sixersTrackerMatch = title.match(/^Sixers free agency tracker: Oubre, Grimes, Drummond set to become free agents and more$/i);
  if (sixersTrackerMatch) {
    return '76人自由市场追踪：Oubre、Grimes、Drummond等人成为自由球员';
  }

  const agreesExtensionMatch = title.match(/^(.+?) agrees to a contract extension with (?:the )?(.+)$/i);
  if (agreesExtensionMatch) {
    return `${localizeCommonTerms(agreesExtensionMatch[1])}与${localizeCommonTerms(agreesExtensionMatch[2])}达成续约合同`;
  }

  const nbaCupFinalMatch = title.match(/^Butler[’']s iconic Hinkle Fieldhouse will play host to the next NBA Cup final in December$/i);
  if (nbaCupFinalMatch) {
    return '巴特勒大学Hinkle Fieldhouse将在12月承办下一届NBA杯决赛';
  }

  const nilEraMatch = title.match(/^Dusty May addresses role of NIL era in Michigan departure, how it can be ‘segue’ to NBA$/i);
  if (nilEraMatch) {
    return 'Dusty May谈NIL时代对离开密歇根的影响，以及它如何成为通往NBA的过渡';
  }

  const jaylenBrownTradeTalksMatch = title.match(/^(.+?), (.+?), (.+?) Not Heavily Engaged With Celtics On Jaylen Brown Trade$/i);
  if (jaylenBrownTradeTalksMatch) {
    return `${localizeCommonTerms(jaylenBrownTradeTalksMatch[1])}、${localizeCommonTerms(jaylenBrownTradeTalksMatch[2])}和${localizeCommonTerms(jaylenBrownTradeTalksMatch[3])}并未积极与凯尔特人谈Jaylen Brown交易`;
  }

  const noPersonalIssuesMatch = title.match(/^(.+?), (.+?) Had No Personal Issues During Time With Lakers$/i);
  if (noPersonalIssuesMatch) {
    return `${localizeCommonTerms(noPersonalIssuesMatch[1])}和${localizeCommonTerms(noPersonalIssuesMatch[2])}在湖人共事期间没有私人矛盾`;
  }

  const lebronCandidatesMatch = title.match(/^(.+?), (.+?), (.+?) Considered Leading Candidates To Sign LeBron James$/i);
  if (lebronCandidatesMatch) {
    return `${localizeCommonTerms(lebronCandidatesMatch[1])}、${localizeCommonTerms(lebronCandidatesMatch[2])}和${localizeCommonTerms(lebronCandidatesMatch[3])}被视为签下LeBron James的热门候选`;
  }

  const durenResignMatch = title.match(/^(.+?) likely to resign with (.+?), leave (.+?) still searching for star center$/i);
  if (durenResignMatch) {
    return `${localizeCommonTerms(durenResignMatch[1])}可能与${localizeCommonTerms(durenResignMatch[2])}续约，${localizeCommonTerms(durenResignMatch[3])}仍在寻找明星中锋`;
  }

  const sixersDeanWadeMatch = title.match(/^Sixers agree to deal with forward (.+?) at start of free agency$/i);
  if (sixersDeanWadeMatch) {
    return `76人在自由市场开启时与前锋${localizeCommonTerms(sixersDeanWadeMatch[1])}达成合同`;
  }

  const bucksSignMatch = title.match(/^Bucks sign (.+?) to (.+?) deal as free agency begins$/i);
  if (bucksSignMatch) {
    return `雄鹿在自由市场开启后签下${localizeCommonTerms(bucksSignMatch[1])}，合同为${localizeCommonTerms(bucksSignMatch[2])}`;
  }

  const lebronNextTeamMatch = title.match(/^LeBron James next team 2026: Will LeBron join (.+?), (.+?) on Warriors\? Reunion with Heat\?$/i);
  if (lebronNextTeamMatch) {
    return `LeBron James下一站猜想：是否联手${localizeCommonTerms(lebronNextTeamMatch[1])}、${localizeCommonTerms(lebronNextTeamMatch[2])}或重返热火`;
  }

  const pistonsOfferMatch = title.match(/^Pistons Increase Offer To (.+?), Have No Interest In Sign-And-Trade$/i);
  if (pistonsOfferMatch) {
    return `${localizeCommonTerms('Pistons')}提高对${localizeCommonTerms(pistonsOfferMatch[1])}的报价，无意进行先签后换`;
  }

  const kawhiRetireMatch = title.match(/^Kawhi Leonard Envisions Retiring With Raptors; Familiarity With Front Office, City Of Toronto Drove Return$/i);
  if (kawhiRetireMatch) {
    return 'Kawhi Leonard希望在猛龙退役，对管理层和多伦多的熟悉推动他回归';
  }

  const hardenDelayMatch = title.match(/^James Harden Delaying Signing, Cavaliers Pursuing Max Strus Trade To Open LeBron James MLE Path$/i);
  if (hardenDelayMatch) {
    return 'James Harden推迟签约，骑士追求Max Strus交易以打开LeBron James中产路径';
  }

  const lebronTacticMatch = title.match(/^LeBron James’ incredibly sneaky tactic to protect Bronny’s future before blockbuster Lakers decision$/i);
  if (lebronTacticMatch) {
    return 'LeBron James在湖人重大决定前保护Bronny未来的策略';
  }

  const expectedDealsMatch = title.match(/^(.+?) believed to likely secure deals with (.+)$/i);
  if (expectedDealsMatch) {
    return `${localizeCommonTerms(expectedDealsMatch[1])}有望签下${localizeCommonTerms(expectedDealsMatch[2])}`;
  }

  const groupCupMatch = title.match(/^(.+?) named to (.+?) for (.+?) NBA Cup$/i);
  if (groupCupMatch) {
    return `${localizeCommonTerms(groupCupMatch[1])}被分入${localizeCommonTerms(groupCupMatch[3])}NBA杯${localizeCommonTerms(groupCupMatch[2])}`;
  }

  const loseGuardMatch = title.match(/^The (.+?) lose defensive guard to (?:the )?(.+)$/i);
  if (loseGuardMatch) {
    return `${localizeCommonTerms(loseGuardMatch[1])}失去防守型后卫，球员转投${localizeCommonTerms(loseGuardMatch[2])}`;
  }

  const superstarLeaveMatch = title.match(/^Basketball superstar (.+?) to leave LA Lakers$/i);
  if (superstarLeaveMatch) {
    return `${localizeCommonTerms(superstarLeaveMatch[1])}将离开洛杉矶湖人`;
  }

  const teardownTradeMatch = title.match(/^Warriors rival (.+?) continue teardown with (.+?) trade$/i);
  if (teardownTradeMatch) {
    return `${localizeCommonTerms(teardownTradeMatch[1])}交易${localizeCommonTerms(teardownTradeMatch[2])}后继续调整阵容`;
  }

  const lebronMeaningMatch = title.match(/^The Warriors know exactly what LeBron meant to the Lakers$/i);
  if (lebronMeaningMatch) {
    return '勇士清楚勒布朗对湖人的意义';
  }

  const jaylenConceptMatch = title.match(/^(.+?) To (.+?) With (.+?) Following Concept Floated By (.+)$/i);
  if (jaylenConceptMatch) {
    return `${localizeCommonTerms(jaylenConceptMatch[4])}提出设想：${localizeCommonTerms(jaylenConceptMatch[1])}和${localizeCommonTerms(jaylenConceptMatch[3])}前往${localizeCommonTerms(jaylenConceptMatch[2])}`;
  }

  const salaryCapProjectionMatch = title.match(/^NBA Projects Salary Cap Growth To Slow To (.+?) Percent In (.+?) At (.+)$/i);
  if (salaryCapProjectionMatch) {
    return `NBA预计${salaryCapProjectionMatch[2]}赛季工资帽增速放缓至${salaryCapProjectionMatch[1]}%，工资帽约为${localizeCommonTerms(salaryCapProjectionMatch[3])}`;
  }

  const meetInFreeAgencyMatch = title.match(/^(.+?) plans to meet with (.+?) in free agency$/i);
  if (meetInFreeAgencyMatch) {
    return `${localizeCommonTerms(meetInFreeAgencyMatch[1])}计划在自由市场与${localizeCommonTerms(meetInFreeAgencyMatch[2])}会面`;
  }

  const reactsSurveyMatch = title.match(/^(.+?) Reacts Survey: who are you looking forward to seeing at Summer League\?$/i);
  if (reactsSurveyMatch) {
    return `${localizeCommonTerms(reactsSurveyMatch[1])}球迷调查：夏季联赛最期待谁的表现`;
  }

  const teamSigningDealMatch = title.match(/^(.+?) signing (.+?) to (.+?) deal$/i);
  if (teamSigningDealMatch) {
    return `${localizeCommonTerms(teamSigningDealMatch[1])}将签下${localizeCommonTerms(teamSigningDealMatch[2])}，合同为${localizeCommonTerms(teamSigningDealMatch[3])}`;
  }

  const teamSignPositionContractMatch = title.match(/^(.+?) sign (?:guard\s+)?(.+?) to (.+?) contract$/i);
  if (teamSignPositionContractMatch) {
    return `${localizeCommonTerms(teamSignPositionContractMatch[1])}签下${localizeCommonTerms(teamSignPositionContractMatch[2])}，合同为${localizeCommonTerms(teamSignPositionContractMatch[3])}`;
  }

  const playerSignsDealWithTeamMatch = title.match(/^(.+?) signs (.+?) deal with (.+)$/i);
  if (playerSignsDealWithTeamMatch) {
    return `${localizeCommonTerms(playerSignsDealWithTeamMatch[1])}与${localizeCommonTerms(playerSignsDealWithTeamMatch[3])}签下${localizeCommonTerms(playerSignsDealWithTeamMatch[2])}合同`;
  }

  const teamAddsShootingMatch = title.match(/^(.+?) add elite shooting with (.+?) signing$/i);
  if (teamAddsShootingMatch) {
    return `${localizeCommonTerms(teamAddsShootingMatch[1])}签下${localizeCommonTerms(teamAddsShootingMatch[2])}，补强外线投射`;
  }

  const notInterestedTradeMatch = title.match(/^The (.+?) are not interested in trading (.+?), according to report$/i);
  if (notInterestedTradeMatch) {
    return `${localizeCommonTerms(notInterestedTradeMatch[1])}无意交易${localizeCommonTerms(notInterestedTradeMatch[2])}`;
  }

  const expectedToSignMatch = title.match(/^(.+?) Expected To Sign (.+?); Continue Pursuit Of (.+)$/i);
  if (expectedToSignMatch) {
    return `${localizeCommonTerms(expectedToSignMatch[1])}预计签下${localizeCommonTerms(expectedToSignMatch[2])}，并继续追求${localizeCommonTerms(expectedToSignMatch[3])}`;
  }

  const leavesForDealMatch = title.match(/^(.+?) leaves (.+?) for (.+?) deal with (.+)$/i);
  if (leavesForDealMatch) {
    return `${localizeCommonTerms(leavesForDealMatch[1])}离开${localizeCommonTerms(leavesForDealMatch[2])}，与${localizeCommonTerms(leavesForDealMatch[4])}签下${localizeCommonTerms(leavesForDealMatch[3])}合同`;
  }

  const freeAgencyRetainMatch = title.match(/^(.+?) fail to retain starting small forward in free agency$/i);
  if (freeAgencyRetainMatch) {
    return `${localizeCommonTerms(freeAgencyRetainMatch[1])}在自由市场未能留住首发小前锋`;
  }

  const tradeImpactMatch = title.match(/^What's next for (.+?)\? What (.+?) trade means for roster$/i);
  if (tradeImpactMatch) {
    return `${localizeCommonTerms(tradeImpactMatch[1])}下一步怎么走：${localizeCommonTerms(tradeImpactMatch[2])}交易对阵容的影响`;
  }

  const extensionMatch = title.match(/^(.+?) Agrees to Contract Extension With (.+)$/i);
  if (extensionMatch) {
    return `${localizeCommonTerms(extensionMatch[1])}与${localizeCommonTerms(extensionMatch[2])}达成续约合同`;
  }

  const sourceSaysDealMatch = title.match(/^(.+?) agree to (?:an? )?(.+?),\s*(\d+)-year deal with (.+?)(?:,.*)?$/i);
  if (sourceSaysDealMatch) {
    return `${localizeCommonTerms(sourceSaysDealMatch[1])}与${localizeCommonTerms(sourceSaysDealMatch[4])}达成${localizeCommonTerms(`${sourceSaysDealMatch[3]}-year`)}、${localizeCommonTerms(sourceSaysDealMatch[2])}合同`;
  }

  const agreeMatch = title.match(/^(.+?),\s*(.+?) Agree To (.+?) Deal$/i);
  if (agreeMatch) {
    return `${localizeCommonTerms(agreeMatch[1])}与${localizeCommonTerms(agreeMatch[2])}达成${localizeCommonTerms(agreeMatch[3])}合同`;
  }

  const tradeMatch = title.match(/^(.+?) (?:Acquires|Acquire|Acquired) (.+?) From (.+)$/i);
  if (tradeMatch) {
    return `${localizeCommonTerms(tradeMatch[1])}从${localizeCommonTerms(tradeMatch[3])}得到${localizeCommonTerms(tradeMatch[2])}`;
  }

  const signMatch = title.match(/^(.+?) (?:Signs|Signed) (.+)$/i);
  if (signMatch) {
    return `${localizeCommonTerms(signMatch[1])}签下${localizeCommonTerms(signMatch[2])}`;
  }

  const categoryPrefix = {
    交易: '交易动态',
    签约: '签约动态',
    伤病: '伤病更新',
    选秀: '选秀动态',
    季后赛: '季后赛动态',
    其他: 'NBA动态'
  }[category];

  return safeTitle(`${categoryPrefix}：${localizeCommonTerms(cleanTitle)}`, title);
}

function summarizeSentence(sentence = '') {
  const original = sentence.trim();

  const agreementMatch = original.match(/^(.+?) and (?:the )?(.+?) (?:have|has) agreed to an? (.+?) (?:deal|contract)(.*)\.$/i);
  if (agreementMatch) {
    return `${localizeCommonTerms(agreementMatch[1])}与${localizeCommonTerms(agreementMatch[2])}达成${localizeCommonTerms(agreementMatch[3])}合同${localizeCommonTerms(agreementMatch[4])}。`;
  }

  const reachedMatch = original.match(/^(.+?) and (?:the )?(.+?) have reached agreement on an? (.+?) (?:deal|contract)(.*)\.$/i);
  if (reachedMatch) {
    return `${localizeCommonTerms(reachedMatch[1])}与${localizeCommonTerms(reachedMatch[2])}达成${localizeCommonTerms(reachedMatch[3])}合同${localizeCommonTerms(reachedMatch[4])}。`;
  }

  const finishedMatch = original.match(/^(.+?) finished the (.+?) season with (?:the )?(.+?) following (?:his|a) trade from (?:the )?(.+?)\.$/i);
  if (finishedMatch) {
    return `${localizeCommonTerms(finishedMatch[1])}在${localizeCommonTerms(finishedMatch[2])}赛季末效力于${localizeCommonTerms(finishedMatch[3])}，此前由${localizeCommonTerms(finishedMatch[4])}交易而来。`;
  }

  const acquiredMatch = original.match(/^(?:The )?(.+?) acquired (.+?) at (.+?) from (?:the )?(.+?)\.$/i);
  if (acquiredMatch) {
    return `${localizeCommonTerms(acquiredMatch[1])}在${localizeCommonTerms(acquiredMatch[3])}从${localizeCommonTerms(acquiredMatch[4])}得到${localizeCommonTerms(acquiredMatch[2])}。`;
  }

  const statsMatch = original.match(/^In (.+?) with (?:the )?(.+?), (.+?) averaged (.+?) while shooting (.+?) percent on three-pointers\.$/i);
  if (statsMatch) {
    return `${localizeCommonTerms(statsMatch[3])}在效力${localizeCommonTerms(statsMatch[2])}期间，${localizeCommonTerms(statsMatch[1])}场均${localizeCommonTerms(statsMatch[4])}，三分命中率${statsMatch[5]}%。`;
  }

  const lastSeasonStatsMatch = original.match(/^In (.+?) with (?:the )?(.+?) last season, (.+?) averaged (.+?)\.$/i);
  if (lastSeasonStatsMatch) {
    const minutesMatch = lastSeasonStatsMatch[4].match(/^(.+?) in ([\d.]+) minutes$/i);
    const stats = minutesMatch
      ? `${localizeCommonTerms(minutesMatch[1])}，出场${minutesMatch[2]}分钟`
      : localizeCommonTerms(lastSeasonStatsMatch[4]);
    return `${localizeCommonTerms(lastSeasonStatsMatch[3])}上赛季为${localizeCommonTerms(lastSeasonStatsMatch[2])}出战${localizeCommonTerms(lastSeasonStatsMatch[1])}，场均${stats}。`;
  }

  const midlevelMatch = original.match(/^(?:The )?(.+?) are using (?:the )?non-taxpayer midlevel exception to sign (.+?) and will be hard capped at (?:the )?first apron\.$/i);
  if (midlevelMatch) {
    return `${localizeCommonTerms(midlevelMatch[1])}将使用非纳税人中产特例签下${localizeCommonTerms(midlevelMatch[2])}，并受到第一土豪线硬工资帽限制。`;
  }

  const loseKeyPlayerMatch = original.match(/^(.+?) lose key player to Philadelphia\.$/i);
  if (loseKeyPlayerMatch) {
    return `${localizeCommonTerms(loseKeyPlayerMatch[1])}有关键球员转投费城。`;
  }

  const appearedMatch = original.match(/^(.+?) appeared in just (.+?) games last season due to (.+?)\.$/i);
  if (appearedMatch) {
    return `${localizeCommonTerms(appearedMatch[1])}上赛季因${localizeCommonTerms(appearedMatch[3])}只出战${appearedMatch[2]}场。`;
  }

  const simpleStatsMatch = original.match(/^(.+?) averaged (.+?)\.$/i);
  if (simpleStatsMatch) {
    const minutesMatch = simpleStatsMatch[2].match(/^(.+?) in ([\d.]+) minutes$/i);
    if (minutesMatch) {
      return `${localizeCommonTerms(simpleStatsMatch[1])}场均${localizeCommonTerms(minutesMatch[1])}，出场${minutesMatch[2]}分钟。`;
    }

    return `${localizeCommonTerms(simpleStatsMatch[1])}场均${localizeCommonTerms(simpleStatsMatch[2])}。`;
  }

  return localizeCommonTerms(original)
    .replace(/\band\b/gi, '和')
    .replace(/\bwith\b/gi, '为')
    .replace(/\bin\b/gi, '在')
    .replace(/\baveraged\b/gi, '场均')
    .replace(/\bacquired\b/gi, '得到')
    .replace(/\s+/g, ' ')
    .trim();
}

function isUsefulChineseSentence(sentence = '') {
  if (isBadDek(sentence)) return false;
  const englishWords = sentence.match(/[A-Za-z]{3,}/g) || [];
  const knownNameWords = sentence.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
  return englishWords.length - knownNameWords.length <= 1;
}

function getMoneyTokens(value = '') {
  return value.match(/\d+(?:\.\d+)?万美元/g) || [];
}

function getDurationTokens(value = '') {
  return value.match(/(?:\d+|[一二三四五六七八九十两]+)\s*年/g) || [];
}

function getLeadName(value = '') {
  return value.match(/^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)*/)?.[0] || '';
}

function isDuplicateOfTitle(sentence = '', titleZh = '') {
  const leadName = getLeadName(titleZh);
  const titleMoney = getMoneyTokens(titleZh);
  const sentenceMoney = getMoneyTokens(sentence);
  const titleDuration = getDurationTokens(titleZh);
  const sentenceDuration = getDurationTokens(sentence);
  const sameMoney = titleMoney.length && titleMoney.some((token) => sentenceMoney.includes(token));
  const sameDuration = titleDuration.length && titleDuration.some((token) => sentenceDuration.includes(token));

  return Boolean(
    leadName &&
      sentence.includes(leadName) &&
      sentence.includes('达成') &&
      sentence.includes('合同') &&
      sameMoney &&
      sameDuration
  );
}

function cleanupFactSentence(value = '') {
  return normalizeSpacing(
    String(value)
      .replace(/\s*,?\s*sources told.+$/i, '')
      .replace(/\s*,?\s*according to.+$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function splitNameList(value = '') {
  return String(value)
    .split(/\s*,\s*|\s+and\s+/i)
    .map((item) => item.trim().replace(/^(?:and|or)\s+/i, ''))
    .map((item) => localizeCommonTerms(item))
    .filter(Boolean);
}

function joinChineseList(items = []) {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]}和${items[1]}`;
  return `${items.slice(0, -1).join('、')}和${items.at(-1)}`;
}

function contractAmount(value = '') {
  return localizeCommonTerms(value)
    .replace(/\bmulti[-\s]+year\b/gi, '多年')
    .replace(/\$(\d+(?:\.\d+)?)\s*million/gi, (_, amount) => `${Number(amount) * 100}万美元`)
    .replace(/\$(\d+(?:\.\d+)?)M/gi, (_, amount) => `${Number(amount) * 100}万美元`);
}

function summarizeFactSentence(sentence = '') {
  const original = cleanupFactSentence(sentence);
  if (!original || /represented by/i.test(original)) return '';

  const planningCapMatch = original.match(
    /^(?:The )?(.+?) are planning additional moves to gain more cap flexibility if (.+?) shows interest in signing with the team/i
  );
  if (planningCapMatch) {
    return `如果${localizeCommonTerms(planningCapMatch[2])}有意加盟，${localizeCommonTerms(planningCapMatch[1])}计划继续操作，以腾出更多薪资空间。`;
  }

  const leadingContendersMatch = original.match(/^(.+?) are the leading contenders to sign (.+?)\.$/i);
  if (leadingContendersMatch) {
    return `${joinChineseList(splitNameList(leadingContendersMatch[1]))}被视为签下${localizeCommonTerms(leadingContendersMatch[2])}的主要竞争者。`;
  }

  const dozenTeamsMatch = original.match(/^It is expected that over a dozen teams will pursue (.+?)\.$/i);
  if (dozenTeamsMatch) {
    return `预计将有十多支球队追逐${localizeCommonTerms(dozenTeamsMatch[1])}。`;
  }

  const endedTradeTalksMatch = original.match(/^(?:The )?(.+?) ended trade talks for (.+?) and are focused on adding (.+?) to the roster\.$/i);
  if (endedTradeTalksMatch) {
    return `${localizeCommonTerms(endedTradeTalksMatch[1])}已经结束关于${localizeCommonTerms(endedTradeTalksMatch[2])}的交易谈判，转而专注于补进${localizeCommonTerms(endedTradeTalksMatch[3])}。`;
  }

  const expectedAgreementsMatch = original.match(
    /^(?:The )?(.+?) are expected to eventually secure free agent agreements with (.+?)\.$/i
  );
  if (expectedAgreementsMatch) {
    return `${localizeCommonTerms(expectedAgreementsMatch[1])}预计将与${joinChineseList(splitNameList(expectedAgreementsMatch[2]))}达成自由球员协议。`;
  }

  const stillPursuingMatch = original.match(
    /^(?:The )?(.+?) are also still pursuing (.+?) as their top target this offseason as they look to upgrade (?:the )?(.+?) position\.$/i
  );
  if (stillPursuingMatch) {
    return `${localizeCommonTerms(stillPursuingMatch[1])}仍将${localizeCommonTerms(stillPursuingMatch[2])}视为休赛期重点目标，希望升级${localizeCommonTerms(stillPursuingMatch[3])}位置。`;
  }

  const secondMeetingMatch = original.match(/^(?:The )?(.+?) and (.+?) are set to have a second meeting on (.+?)\.$/i);
  if (secondMeetingMatch) {
    return `${localizeCommonTerms(secondMeetingMatch[1])}将与${localizeCommonTerms(secondMeetingMatch[2])}进行第二次会面，时间是在${localizeCommonTerms(secondMeetingMatch[3])}。`;
  }

  const headingToMatch = original.match(/^(.+?) is heading to (?:the )?City of Brotherly Love\.$/i);
  if (headingToMatch) {
    return `${localizeCommonTerms(headingToMatch[1])}将前往费城。`;
  }

  const gotPaydayMatch = original.match(/^(.+?) got (?:what )?he wanted \(another massive payday\) and (?:the )?(.+?) take a big swing\.$/i);
  if (gotPaydayMatch) {
    return `${localizeCommonTerms(gotPaydayMatch[1])}获得了想要的大合同，${localizeCommonTerms(gotPaydayMatch[2])}则选择进行一次大胆补强。`;
  }

  const neededVeteranMatch = original.match(/^With (.+?), (?:the )?(.+?) needed to add a veteran in (?:the )?(.+?) and (.+?)\.$/i);
  if (neededVeteranMatch) {
    return `${localizeCommonTerms(neededVeteranMatch[2])}需要在${localizeCommonTerms(neededVeteranMatch[3])}补进老将，同时提升持球点防守压迫。`;
  }

  const pathChampionshipMatch = original.match(/^(?:The )?(.+?)['’] path to (?:the )?NBA championship involved contributions from everyone on (?:the )?roster/i);
  if (pathChampionshipMatch) {
    return `${localizeCommonTerms(pathChampionshipMatch[1])}的争冠历程强调全队贡献，即便部分球员没有在季后赛登场。`;
  }

  const floatedCavaliersMatch = original.match(
    /^On ESPN's free agency special, (.+?) floated the possibility of (?:the )?(.+?) trading for (.+?) and then signing (.+?) in free agency\.$/i
  );
  if (floatedCavaliersMatch) {
    return `${localizeCommonTerms(floatedCavaliersMatch[1])}提出设想：${localizeCommonTerms(floatedCavaliersMatch[2])}可以先交易得到${localizeCommonTerms(floatedCavaliersMatch[3])}，再在自由市场签下${localizeCommonTerms(floatedCavaliersMatch[4])}。`;
  }

  const lakersOptionMatch = original.match(/^(.+?) could be an option for (?:the )?(.+?) this offseason as (?:the )?team looks to replace (.+?)['’] production\.$/i);
  if (lakersOptionMatch) {
    return `${localizeCommonTerms(lakersOptionMatch[1])}可能成为${localizeCommonTerms(lakersOptionMatch[2])}休赛期选择之一，球队希望填补${localizeCommonTerms(lakersOptionMatch[3])}留下的产量。`;
  }

  const lebronConversationMatch = original.match(/^The (.+?) NBA free agency negotiation window has officially opened, and (.+?) remains at the forefront of the conversation\.$/i);
  if (lebronConversationMatch) {
    return `${localizeCommonTerms(lebronConversationMatch[1])}NBA自由市场谈判窗口已经开启，${localizeCommonTerms(lebronConversationMatch[2])}仍是外界讨论焦点。`;
  }

  const lebronFirstFreeAgencyMatch = original.match(/^(.+?) is hitting free agency for the first time in (.+?) years/i);
  if (lebronFirstFreeAgencyMatch) {
    return `${localizeCommonTerms(lebronFirstFreeAgencyMatch[1])}${localizeCommonTerms(lebronFirstFreeAgencyMatch[2])}年来首次进入自由市场。`;
  }

  const jazzCenterPopularMatch = original.match(/^(?:The )?(.+?) Center is.+popular on (?:the )?free agency market/i);
  if (jazzCenterPopularMatch) {
    return `${localizeCommonTerms(jazzCenterPopularMatch[1])}的中锋在自由市场上受到关注。`;
  }

  const draymondPodcastMatch = original.match(/^(.+?) didn't hold back when exposing his newest teammate on his podcast .+ on (.+?)\.$/i);
  if (draymondPodcastMatch) {
    return `${localizeCommonTerms(draymondPodcastMatch[1])}在${localizeCommonTerms(draymondPodcastMatch[2])}的播客中谈到新队友，语气相当直接。`;
  }

  const cavsSalaryMatch = original.match(
    /^(?:The )?(.+?) may be able to offer (.+?) a competitive salary, and (.+?)['’]s contract decision could be central to making that happen\.$/i
  );
  if (cavsSalaryMatch) {
    return `${localizeCommonTerms(cavsSalaryMatch[1])}可能为${localizeCommonTerms(cavsSalaryMatch[2])}提供有竞争力的薪资，而${localizeCommonTerms(cavsSalaryMatch[3])}的合同决定是关键。`;
  }

  const leavingFranchiseMatch = original.match(/^(.+?) informed (?:the )?(.+?) on (.+?) that he will be leaving (?:the )?franchise in free agency\.$/i);
  if (leavingFranchiseMatch) {
    return `${localizeCommonTerms(leavingFranchiseMatch[1])}已在${localizeCommonTerms(leavingFranchiseMatch[3])}通知${localizeCommonTerms(leavingFranchiseMatch[2])}，自己将在自由市场离队。`;
  }

  const teamSignedPlayerDealMatch = original.match(/^(?:The )?(.+?) have signed (.+?) to an? (.+?) deal\.$/i);
  if (teamSignedPlayerDealMatch) {
    return `${localizeCommonTerms(teamSignedPlayerDealMatch[1])}签下${localizeCommonTerms(teamSignedPlayerDealMatch[2])}，合同为${contractAmount(teamSignedPlayerDealMatch[3])}。`;
  }

  return '';
}

function summarizeFactFromTitle(title = '') {
  const cleanTitle = stripSourcePhrases(title);

  const signingAmountMatch = cleanTitle.match(/^(.+?) signing (.+?) on (.+?) contract/i);
  if (signingAmountMatch) {
    return `${localizeCommonTerms(signingAmountMatch[1])}将签下${localizeCommonTerms(signingAmountMatch[2])}，合同金额为${contractAmount(signingAmountMatch[3])}。`;
  }

  const bolsteringContractMatch = cleanTitle.match(
    /^(.+?) bolstering (.+?) with ((?:one|two|three|four|five|\d+)-year),?\s+(\$\d+(?:\.\d+)?\s*million)\s+(.+?) contract$/i
  );
  if (bolsteringContractMatch) {
    return `${localizeCommonTerms(bolsteringContractMatch[1])}用${contractAmount(`${bolsteringContractMatch[3]}、${bolsteringContractMatch[4]}`)}合同补强${localizeCommonTerms(bolsteringContractMatch[2])}，相关球员是${localizeCommonTerms(bolsteringContractMatch[5])}。`;
  }

  const reportedDealMatch = cleanTitle.match(/^(.+?) free agency tracker: (.+?) reportedly agrees to (.+?) deal$/i);
  if (reportedDealMatch) {
    return `${localizeCommonTerms(reportedDealMatch[2])}据报与${localizeCommonTerms(reportedDealMatch[1])}达成${contractAmount(reportedDealMatch[3])}合同。`;
  }

  const reSignMatch = cleanTitle.match(/^(.+?) Re-Sign (.+)$/i);
  if (reSignMatch) {
    return `${localizeCommonTerms(reSignMatch[1])}续约${localizeCommonTerms(reSignMatch[2])}。`;
  }

  const notInterestedTradeMatch = cleanTitle.match(/^(.+?) Not Interested In Exploring (.+?) Trade$/i);
  if (notInterestedTradeMatch) {
    return `${localizeCommonTerms(notInterestedTradeMatch[1])}无意探索关于${localizeCommonTerms(notInterestedTradeMatch[2])}的交易。`;
  }

  const summerLeagueWisdomMatch = cleanTitle.match(/^(.+?) and (.+?) impart wisdom on (?:the )?(.+?)['’]s new Summer League star$/i);
  if (summerLeagueWisdomMatch) {
    return `${localizeCommonTerms(summerLeagueWisdomMatch[1])}和${localizeCommonTerms(summerLeagueWisdomMatch[2])}向${localizeCommonTerms(summerLeagueWisdomMatch[3])}夏季联赛新星分享经验。`;
  }

  const brunsonChampionMatch = cleanTitle.match(/^(.+?), NBA Champion$/i);
  if (brunsonChampionMatch) {
    return `文章聚焦${localizeCommonTerms(brunsonChampionMatch[1])}的冠军身份，以及他如何回应外界质疑。`;
  }

  const shametDealMatch = cleanTitle.match(/^(.+?)['’]s new deal with (.+?) built on relationship of faith$/i);
  if (shametDealMatch) {
    return `${localizeCommonTerms(shametDealMatch[1])}与${localizeCommonTerms(shametDealMatch[2])}的新合同建立在双方信任关系之上。`;
  }

  const lebronPoolsideMatch = cleanTitle.match(/^(.+?) seen hanging poolside in first post as free agent$/i);
  if (lebronPoolsideMatch) {
    return `${localizeCommonTerms(lebronPoolsideMatch[1])}成为自由球员后的首条动态是在泳池边放松。`;
  }

  const kesslerPriceMatch = cleanTitle.match(/^(.+?)['’]s High Price Tag Revealed/i);
  if (kesslerPriceMatch) {
    return `${localizeCommonTerms(kesslerPriceMatch[1])}的要价成为自由市场关注点，爵士是否匹配报价仍是焦点。`;
  }

  const draymondCallsOutMatch = cleanTitle.match(/^(.+?) calls out (.+?) rookie (.+?):/i);
  if (draymondCallsOutMatch) {
    return `${localizeCommonTerms(draymondCallsOutMatch[1])}公开点名${localizeCommonTerms(draymondCallsOutMatch[2])}新秀${localizeCommonTerms(draymondCallsOutMatch[3])}。`;
  }

  return '';
}

function buildFallbackSummaryZh({ source, headlineZh, title, sentences }) {
  const recapSummary = buildRecapAnalysisSummary({ title, source });
  if (recapSummary) return recapSummary;

  const factSentences = [
    summarizeFactFromTitle(title),
    ...sentences.slice(0, 6).map(summarizeFactSentence)
  ]
    .filter(Boolean)
    .filter((sentence, index, all) => all.findIndex((candidate) => isHighlySimilarText(candidate, sentence)) === index)
    .slice(0, 2);

  if (factSentences.length) {
    return normalizeSpacing(`据 ${source} 报道，${factSentences.join('')}`);
  }

  if (/相关动态：/.test(headlineZh)) {
    return '';
  }

  return normalizeSpacing(`据 ${source} 报道，${headlineZh}。`);
}

function buildChineseSummary(title, summary, category, source) {
  const titleZh = translateTitle(title, category);
  const sentences = summary
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !/represented by/i.test(sentence));
  const coreSentences = sentences
    .slice(0, 4)
    .map(summarizeSentence)
    .filter(isUsefulChineseSentence)
    .filter((sentence) => !isDuplicateOfTitle(sentence, titleZh))
    .slice(0, 2);
  const leadSummary = hasMachineEnglish(titleZh) ? `这是一条关于 ${stripSourcePhrases(title)} 的NBA动态。` : `${titleZh}。`;
  const detailSummary = coreSentences.length ? coreSentences.join(' ') : '';
  const summaryZh = `据 ${source} 报道，${leadSummary}${detailSummary}`;

  const keyPoints = coreSentences.filter((sentence) => sentence.length <= 160).slice(0, 3);

  return { titleZh, summaryZh, keyPoints };
}

function extractImageUrl(html = '', baseUrl = '') {
  const patterns = [
    /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
    /<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i,
    /<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i,
    /<meta\s+content=["']([^"']+)["']\s+name=["']twitter:image["']/i
  ];

  const imageUrl = patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean);
  if (!imageUrl) return '';

  try {
    return new URL(imageUrl, baseUrl).href;
  } catch {
    return '';
  }
}

async function fetchArticleImage(link) {
  if (!link) return '';

  try {
    const response = await fetch(link, {
      headers: {
        'User-Agent': 'nba-quick-news/0.1 (+https://github.com/)'
      }
    });

    if (!response.ok) return '';
    return extractImageUrl(await response.text(), link);
  } catch {
    return '';
  }
}

function getRssImageUrl(item = {}, link = '') {
  const candidates = [
    item.enclosure?.['@_url'],
    item['media:content']?.['@_url'],
    item['media:thumbnail']?.['@_url']
  ];
  const imageUrl = candidates.find(Boolean);
  if (!imageUrl) return '';

  try {
    return new URL(imageUrl, link).href;
  } catch {
    return '';
  }
}

async function extractArticleText(url) {
  if (process.env.JINA_READER_ENABLED !== 'true' || !url) {
    return '';
  }

  try {
    const targetUrl = `https://r.jina.ai/${url}`;
    const jinaApiKey = process.env.JINA_API_KEY || '';
    const response = await fetchWithRetry(targetUrl, {
      headers: {
        ...FETCH_HEADERS,
        Accept: 'text/plain, text/markdown, */*',
        ...(jinaApiKey ? { Authorization: `Bearer ${jinaApiKey}` } : {})
      }
    }, 2);

    if (!response.ok) {
      console.warn(`Jina Reader failed for ${url}: ${response.status} ${response.statusText}`);
      return '';
    }

    const text = stripHtml(await response.text()).slice(0, 6000);
    return text;
  } catch (error) {
    console.warn(`Jina Reader warning for ${url}: ${error instanceof Error ? error.message : error}`);
    return '';
  }
}

function getSummarizePrompt({ title, description, url, articleText }) {
  return `
你是一名中文 NBA 新闻编辑。请基于英文标题、RSS 描述和可选正文，生成适合中文用户快速阅读的结构化内容。

要求：
- headlineZh 不要逐词翻译，要像中文体育新闻标题。
- dekZh 是副标题，一句话补充 headlineZh，不能重复 headlineZh。
- summaryZh 用 1 到 2 句说明真实信息量，包括谁、球队、合同、伤病、影响等。
- oneLineZh 是一句话快讯。
- goldenQuoteZh 可为空；如果写，必须基于原文事实，不要编造。
- 球员名可以保留英文；球队名可中文化。
- 不要出现 considered / expected / with / to 等夹生英文动词介词。
- 原文信息不足时保守处理，不要瞎编。

输出严格 JSON：
{
  "headlineZh": "",
  "dekZh": "",
  "summaryZh": "",
  "oneLineZh": "",
  "goldenQuoteZh": "",
  "category": "",
  "importance": 1
}

英文标题：${title}
RSS 描述：${description}
原文 URL：${url}
正文摘录：${articleText || ''}
`.trim();
}

function isTemplateHeadline(value = '') {
  return /相关动态：|继续更新|后续动向值得关注|值得关注/.test(value);
}

function stripReportPrefix(value = '') {
  return String(value).replace(/^据\s+.+?\s+报道，/, '').trim();
}

function firstSummarySentence(summaryZh = '') {
  return stripReportPrefix(summaryZh).split(/(?<=[。！？])\s*/).filter(Boolean)[0] || '';
}

function headlineFromSummary(summaryZh = '') {
  const first = firstSummarySentence(summaryZh);
  if (!first || isTemplateHeadline(first)) return '';

  const lebronWarriorsMatch = first.match(/^如果(.+?)有意加盟，(.+?)计划继续操作，以腾出更多薪资空间。?$/);
  if (lebronWarriorsMatch) {
    return `${lebronWarriorsMatch[2].replace(/^金州/, '')}若追${lebronWarriorsMatch[1]}，将继续腾薪资空间`;
  }

  const meetingMatch = first.match(/^(.+?)将与(.+?)进行第二次会面/);
  if (meetingMatch) {
    return `${meetingMatch[1]}将与${meetingMatch[2]}进行第二次会面`;
  }

  const signAmountMatch = first.match(/^(.+?)将签下(.+?)，合同金额为(.+?)。?$/);
  if (signAmountMatch) {
    return `${signAmountMatch[1]}将以${signAmountMatch[3]}签下${signAmountMatch[2]}`;
  }

  const expectedAgreementsMatch = first.match(/^(.+?)预计将与(.+?)达成自由球员协议。?$/);
  if (expectedAgreementsMatch) {
    return `${expectedAgreementsMatch[1].replace(/^洛杉矶/, '')}预计签下${expectedAgreementsMatch[2]}`;
  }

  const reportedDealMatch = first.match(/^(.+?)据报与(.+?)达成(.+?)合同。?$/);
  if (reportedDealMatch) {
    return `${reportedDealMatch[2]}将与${reportedDealMatch[1]}达成${reportedDealMatch[3]}合同`;
  }

  const netsContractMatch = first.match(/^(.+?)用(.+?)合同补强(.+?)，相关球员是(.+?)。?$/);
  if (netsContractMatch) {
    return `${netsContractMatch[1]}将以${netsContractMatch[2]}签下${netsContractMatch[4]}`;
  }

  const kawhiPaydayMatch = first.match(/^(.+?)获得了想要的大合同，(.+?)则选择进行一次大胆补强。?$/);
  if (kawhiPaydayMatch) {
    return `${kawhiPaydayMatch[2]}豪赌补强，${kawhiPaydayMatch[1]}拿到大合同`;
  }

  const championshipPathMatch = first.match(/^(.+?)的争冠历程强调全队贡献/);
  if (championshipPathMatch) {
    return `${championshipPathMatch[1]}争冠历程凸显全队贡献`;
  }

  const summerLeagueMatch = first.match(/^(.+?)和(.+?)向(.+?)夏季联赛新星分享经验。?$/);
  if (summerLeagueMatch) {
    return `${summerLeagueMatch[1]}和${summerLeagueMatch[2]}指导${summerLeagueMatch[3]}新星`;
  }

  const brunsonMatch = first.match(/^文章聚焦(.+?)的冠军身份/);
  if (brunsonMatch) {
    return `${brunsonMatch[1]}以冠军身份回应外界质疑`;
  }

  const newDealTrustMatch = first.match(/^(.+?)与(.+?)的新合同建立在双方信任关系之上。?$/);
  if (newDealTrustMatch) {
    return `${newDealTrustMatch[1]}与${newDealTrustMatch[2]}新合同源于信任`;
  }

  const lebronPoolMatch = first.match(/^(.+?)成为自由球员后的首条动态是在泳池边放松。?$/);
  if (lebronPoolMatch) {
    return `${lebronPoolMatch[1]}成为自由球员后首度更新动态`;
  }

  const priceTagMatch = first.match(/^(.+?)的要价成为自由市场关注点/);
  if (priceTagMatch) {
    return `${priceTagMatch[1]}要价成为自由市场焦点`;
  }

  const floatedMatch = first.match(/^(.+?)提出设想：(.+?)可以先交易得到(.+?)，再在自由市场签下(.+?)。?$/);
  if (floatedMatch) {
    return `${floatedMatch[2]}或先追${floatedMatch[3]}，再签${floatedMatch[4]}`;
  }

  const lakersOptionMatch = first.match(/^(.+?)可能成为(.+?)休赛期选择之一/);
  if (lakersOptionMatch) {
    return `${lakersOptionMatch[2]}将${lakersOptionMatch[1]}视为休赛期选项`;
  }

  const lebronFocusMatch = first.match(/^(.+?)NBA自由市场谈判窗口已经开启，(.+?)仍是外界讨论焦点。?$/);
  if (lebronFocusMatch) {
    return `${lebronFocusMatch[2]}仍是自由市场讨论焦点`;
  }

  const reSignMatch = first.match(/^(.+?)续约(.+?)。?$/);
  if (reSignMatch) {
    return `${reSignMatch[1]}续约${reSignMatch[2]}`;
  }

  const draymondMatch = first.match(/^(.+?)公开点名(.+?)新秀(.+?)。?$/);
  if (draymondMatch) {
    return `${draymondMatch[1]}公开点名${draymondMatch[2]}新秀${draymondMatch[3]}`;
  }

  const cavsSalaryMatch = first.match(/^(.+?)可能为(.+?)提供有竞争力的薪资/);
  if (cavsSalaryMatch) {
    return `${cavsSalaryMatch[1]}或为${cavsSalaryMatch[2]}腾出竞争性薪资`;
  }

  const notTradeMatch = first.match(/^(.+?)无意探索关于(.+?)的交易。?$/);
  if (notTradeMatch) {
    return `${notTradeMatch[1]}无意探索${notTradeMatch[2]}交易`;
  }

  const clipped = first.replace(/[。！？]$/g, '');
  return clipped.length <= 34 ? clipped : '';
}

function improveHeadlineFromSummary(headlineZh = '', summaryZh = '') {
  if (!isTemplateHeadline(headlineZh)) return headlineZh;
  return headlineFromSummary(summaryZh) || headlineZh;
}

function deTemplateHeadline(headlineZh = '') {
  const match = String(headlineZh).match(/^(.+?)相关动态：(.+)$/);
  if (!match) return headlineZh;

  const subject = match[1];
  const body = match[2]
    .replace(/球队继续评估交易与阵容调整/g, '交易与阵容调整')
    .replace(/自由市场与合同情况继续更新/g, '自由市场与合同动向')
    .replace(/球队后续动向值得关注/g, '休赛期后续动向')
    .replace(/伤病与复出情况继续更新/g, '伤病与复出进展')
    .replace(/年轻球员与选秀话题继续发酵/g, '年轻球员与选秀话题')
    .replace(/赛事安排与争冠话题继续更新/g, '赛事安排与争冠话题')
    .replace(/球队继续围绕经验阵容调整/g, '围绕经验阵容调整')
    .replace(/继续更新/g, '动向')
    .replace(/值得关注/g, '受关注');

  return normalizeChineseText(`${subject}${body}`);
}

function isMixedLanguageHeadline(value = '') {
  return /Reach Out To|Shows Interest In|Expected To|Planning To|Agree To|In Free Agency|At Summer League|在 自由市场|签约动态：.+Reach Out To|交易动态：.+Acquire/i.test(value);
}

function hasUnsafeEnglishResidue(value = '') {
  const text = String(value);
  if (!hasChineseText(text)) return false;
  return /\b(?:starting five|California|multi[-\s]+year|one[-\s]+year|two[-\s]+year|four[-\s]+year|reach out|shows interest|expected to|planning to|title contenders|championship odds|trade grades|fantasy fallout|fantasy|fallout|odds|former|on|million|are certainly trying|is just two days into)\b|\$\d/i.test(text);
}

function hasMixedEnglishSummary(value = '') {
  const text = String(value);
  if (!text) return false;
  return hasUnsafeEnglishResidue(text) || /[\u4e00-\u9fa5].*\b(?:is|are|was|were|be|been|being|has|have|had|will|would|could|should|trying|build around|make sense|period|coming|going|plenty of movement|projected|roster)\b/i.test(text);
}

function hasUntranslatedContractTerm(value = '') {
  return /\b(?:multi[-\s]+year|one[-\s]+year|two[-\s]+year|three[-\s]+year|four[-\s]+year|five[-\s]+year)\b/i.test(String(value));
}

function hasChineseText(value = '') {
  return /[\u4e00-\u9fa5]/.test(String(value));
}

function isPredominantlyChinese(text = '') {
  const value = normalizeWhitespace(text);
  if (!value) return false;
  const chineseChars = (value.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latinChars = (value.match(/[A-Za-z]/g) || []).length;
  const digits = (value.match(/\d/g) || []).length;
  const effectiveChars = chineseChars + latinChars + digits;
  if (chineseChars < 6 || effectiveChars === 0) return false;

  const protectedTerms = new Set([
    'NBA', 'ESPN', 'MSG', 'LA', 'RealGM', 'Yahoo', 'Sports', 'Summer', 'League',
    'Aspiration', 'Exhibit', 'G', 'MVP'
  ]);
  const words = value.match(/\b[A-Za-z][A-Za-z.'-]*\b/g) || [];
  let ordinaryRun = 0;
  for (const word of words) {
    const clean = word.replace(/\.$/, '');
    const looksLikeName = /^[A-Z][a-zA-Z.'-]*$/.test(clean);
    const looksLikeAbbrev = /^[A-Z]{2,6}$/.test(clean);
    const allowed = protectedTerms.has(clean) || looksLikeName || looksLikeAbbrev;
    ordinaryRun = allowed ? 0 : ordinaryRun + 1;
    if (ordinaryRun >= 3) return false;
  }

  if (/\b(?:the|and|with|from|after|before|following|reportedly|according|expected|could|would|should|takeaways|thoughts|reaction|preview|recap)\b(?:\s+\b[a-z]{3,}\b){2,}/i.test(value)) {
    return false;
  }

  return chineseChars / effectiveChars >= 0.38 || (chineseChars >= 18 && latinChars <= chineseChars * 1.6);
}

function hasMixedChineseEnglish(value = '') {
  const text = String(value);
  return hasChineseText(text) && (hasUnsafeEnglishResidue(text) || hasMachineEnglish(text) || isMixedLanguageHeadline(text) || hasUntranslatedContractTerm(text));
}

function isSafeChineseTitle(text = '') {
  const value = normalizeChineseText(text);
  if (!value || !hasChineseText(value)) return false;
  if (isGenericHeadline(value)) return false;
  if (hasMixedChineseEnglish(value) || hasMixedEnglishSummary(value)) return false;
  if (/Fantasy Fallout|Championship Odds|Trade Grades/i.test(value)) return false;
  return true;
}

function isSafeChineseSummary(text = '') {
  const value = normalizeChineseText(text);
  if (!value) return true;
  if (!isPredominantlyChinese(value)) return false;
  if (isGenericFallbackSummary(value) || findUnsafeSummaryFragments(value).length) return false;
  if (/['’]s\b|[\u4e00-\u9fa5][’']\s|更多背景来自原文报道|NBA 动态：|原文聚焦|这篇文章讨论了/i.test(value)) return false;
  if (/中文标点包裹未翻译英文标题片段/.test(value)) return false;
  const allowedEnglish = new Set(['NBA', 'MSG', 'LA', 'L.A', 'Jr', 'Sr', 'II', 'III', 'IV', 'ESPN', 'Yahoo', 'Sports', 'RealGM', 'Summer', 'League', 'Aspiration']);
  const englishWords = value.match(/\b[A-Za-z][A-Za-z.'-]*\b/g) || [];
  let ordinaryRun = 0;
  for (const word of englishWords) {
    const clean = word.replace(/\.$/, '');
    const isAllowed =
      allowedEnglish.has(clean) ||
      /^[A-Z][a-zA-Z.'-]*$/.test(clean) ||
      /^[A-Z]{2,5}$/.test(clean);
    ordinaryRun = isAllowed ? 0 : ordinaryRun + 1;
    if (ordinaryRun >= 2) return false;
  }
  if (hasUntranslatedContractTerm(value)) return false;
  if (/Fantasy Fallout|Championship Odds|Trade Grades/i.test(value)) return false;
  return true;
}

function isCoreNewsCategory(category = '') {
  return ['交易', '签约', '伤病', '选秀'].includes(category);
}

function isImportantRumor(item = {}) {
  const text = `${item.originalTitle || item.title || ''} ${item.headlineZh || ''} ${item.summaryZh || ''}`;
  return /(lebron|durant|giannis|doncic|curry|kawhi|harden|brown)/i.test(text) && /(rumou?r|report|interested|target|sweepstakes|free agency|有意|目标|争夺|接触|下家)/i.test(text);
}

function isHighQualityChineseHeadline(item = {}, value = item.headlineZh || item.oneLineZh || '') {
  const text = normalizeChineseText(value);
  if (!isSafeChineseTitle(text)) return false;
  if ((item.importance || 1) < 4) return false;
  if (!isCoreNewsCategory(item.category) && !isImportantRumor(item)) return false;
  return hasConcreteStructure({ ...item, headlineZh: text });
}

function chooseDisplayTitle(item = {}) {
  const originalTitle = normalizeSpacing(item.originalTitle || item.title || '');
  const headlineZh = normalizeChineseText(item.headlineZh || item.titleZh || '');
  if (isSafeChineseTitle(headlineZh)) return headlineZh;
  return originalTitle || headlineZh || 'Untitled';
}

function isLowValueArticle(title = '', summary = '') {
  return /\b(?:odds|fantasy|wedding|culture|preview|big questions|hot take|pod|legacy|summer league roster|score invites|invite to Taylor Swift|championship odds)\b/i.test(`${title} ${summary}`);
}

function fixMixedLanguageHeadline(value = '', item = {}) {
  if (!isMixedLanguageHeadline(value)) return value;
  const fact = extractFactFromEnglish({ title: item.originalTitle || item.title || value, summary: item.summary || '', source: item.source || '' });
  if (fact?.headlineZh) return fact.headlineZh;
  return value
    .replace(/^签约动态：/, '')
    .replace(/^交易动态：/, '')
    .replace(/(.+?) Reach Out To (.+?) 在 自由市场/i, (_, team, player) => `${team}在自由市场接触${player}`);
}

function isGenericHeadline(text = '') {
  const value = normalizeChineseText(text);
  if (!value) return true;
  if (/(交易与阵容调整|自由市场与合同动向|休赛期后续动向|后续动向|阵容调整|合同动向|相关交易|相关签约|相关消息更新|赛事安排与争冠话题|签约动向更新|最新动态和后续影响)$/.test(value)) {
    return true;
  }

  const hasFact =
    /\b[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)+\b/.test(value) ||
    /\d+\s*(?:年|万美元|亿美元|首轮|次轮|顺位)/.test(value) ||
    /(交易至|得到|送出|换来|签下|续约|会面|伤病|受伤|手术|首轮签|次轮签|选秀权|薪资空间|下家|目标|候选|赔率|名单|播客|讨论|保障|点评|离开|补进|公布|获邀|争夺|引进)/.test(value);
  return !hasFact && /(交易|签约|合同|自由市场|休赛期|阵容)/.test(value);
}

function localizeDraftAssets(value = '') {
  return localizeCommonTerms(value)
    .replace(/\btwo FRPs\b/gi, '两个首轮签')
    .replace(/\bFRPs\b/gi, '首轮签')
    .replace(/\btwo swaps\b/gi, '两次选秀权互换')
    .replace(/\btwo first[-\s]+round picks\b/gi, '两个首轮签')
    .replace(/\btwo second[-\s]+round picks\b/gi, '两个次轮签')
    .replace(/\btwo future second[-\s]+round picks\b/gi, '两个未来次轮签')
    .replace(/\ba protected (\d{4}) first round pick via (?:the )?(.+?)$/i, (_, year, team) => `一个来自${localizeCommonTerms(team)}的受保护 ${year} 年首轮签`)
    .replace(/\bprotected (\d{4}) pick via (?:the )?(.+?)$/i, (_, year, team) => `一个来自${localizeCommonTerms(team)}的受保护 ${year} 年选秀权`)
    .replace(/\bprotected (\d{4}) first round pick via (?:the )?(.+?)$/i, (_, year, team) => `一个来自${localizeCommonTerms(team)}的受保护 ${year} 年首轮签`)
    .replace(/\b(\d{4}) first round pick\b/gi, '$1 年首轮签')
    .replace(/\bfirst round picks?\b/gi, '首轮签')
    .replace(/\bsecond round picks?\b/gi, '次轮签')
    .replace(/\bpicks?\b/gi, '选秀权');
}

function getTitlePerson(value = '') {
  const withoutTeams = String(value)
    .replace(/\b(?:NBA|Cavs|C's|Celtics|Sixers|76ers|Lakers|Mavericks|Warriors|Rockets|Suns|Pacers|Pistons|Spurs|Jazz|Grizzlies|Kings)\b/g, '')
    .replace(/\b(?:Fantasy Fallout|Report|Grading|Where|Does|Daily Links)\b/g, '');
  return withoutTeams.match(/\b[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,2}\b/)?.[0] || '';
}

function joinAssets(value = '') {
  return String(value)
    .split(/\s*,\s*|\s+and\s+/i)
    .map((asset) => localizeDraftAssets(asset.trim()))
    .filter(Boolean)
    .join('、');
}

function stripArticleLead(value = '') {
  return String(value)
    .replace(/^(?:Fantasy Fallout:\s*|Trade Grades:\s*|Breaking News:\s*|Rumors:\s*)/i, '')
    .replace(/^NBA Championship Odds\s+\d{4}:\s*/i, '')
    .replace(/^Championship Odds:\s*/i, '')
    .replace(/^(?:In a stunning move,\s*)?(?:The\s+)?/i, '')
    .trim();
}

function extractFactFromEnglish({ title = '', summary = '', source = '' } = {}) {
  const cleanTitle = stripSourcePhrases(stripArticleLead(title));
  const cleanSummary = stripHtml(summary);

  const reachOutFreeAgencyMatch = cleanTitle.match(/^(.+?) Reach Out To (.+?) In Free Agency$/i);
  if (reachOutFreeAgencyMatch) {
    return {
      headlineZh: `${localizeCommonTerms(reachOutFreeAgencyMatch[1])}在自由市场接触${localizeCommonTerms(reachOutFreeAgencyMatch[2])}`,
      summaryZh: `${localizeCommonTerms(reachOutFreeAgencyMatch[1])}已经在自由市场接触${localizeCommonTerms(reachOutFreeAgencyMatch[2])}。`
    };
  }

  const interestedAddingMatch = cleanTitle.match(/^(?:Report:\s*)?(.+?) interested in (?:adding|acquiring) (.+)$/i);
  if (interestedAddingMatch) {
    return {
      headlineZh: `${localizeCommonTerms(interestedAddingMatch[1])}有意引进${localizeCommonTerms(interestedAddingMatch[2])}`,
      summaryZh: `${localizeCommonTerms(interestedAddingMatch[1])}对引进${localizeCommonTerms(interestedAddingMatch[2])}表达了兴趣。`
    };
  }

  const haveExpressedInterestMatch = cleanTitle.match(/^(?:Report:\s*)?(.+?) have .+?expressed interest in acquiring['’]?\s*(.+)$/i);
  if (haveExpressedInterestMatch) {
    return {
      headlineZh: `${localizeCommonTerms(haveExpressedInterestMatch[1])}有意交易得到${localizeCommonTerms(haveExpressedInterestMatch[2])}`,
      summaryZh: `${localizeCommonTerms(haveExpressedInterestMatch[1])}已经表达出交易得到${localizeCommonTerms(haveExpressedInterestMatch[2])}的兴趣。`
    };
  }

  const lebronSweepstakesMatch = cleanTitle.match(/^(.+?) enter LeBron James sweepstakes/i);
  if (lebronSweepstakesMatch) {
    return {
      headlineZh: `${localizeCommonTerms(lebronSweepstakesMatch[1])}加入LeBron James争夺`,
      summaryZh: `${localizeCommonTerms(lebronSweepstakesMatch[1])}加入LeBron James争夺，球队希望利用自身条件吸引他加盟。`
    };
  }

  const oddsContenderMatch = cleanTitle.match(/^Are (.+?) now title contenders\? Early odds to win (.+?) NBA championship$/i);
  if (oddsContenderMatch) {
    return {
      headlineZh: `${localizeCommonTerms(oddsContenderMatch[1])}${oddsContenderMatch[2]}年争冠赔率出炉`,
      summaryZh: `自由市场开启后，${localizeCommonTerms(oddsContenderMatch[1])}的争冠前景和最新赔率受到关注。`
    };
  }

  const updatedRosterMatch = cleanTitle.match(/^Updated (.+?) (\d{4}-\d{2}) roster as NBA free agency begins$/i);
  if (updatedRosterMatch) {
    return {
      headlineZh: `${localizeCommonTerms(updatedRosterMatch[1])}更新${updatedRosterMatch[2]}赛季阵容名单`,
      summaryZh: `${localizeCommonTerms(updatedRosterMatch[1])}在自由市场开启后更新${updatedRosterMatch[2]}赛季预计阵容，涉及选秀和签约带来的人员变化。`
    };
  }

  const lakersBigQuestionsMatch = cleanTitle.match(/^Lakers' big questions: How about all those moves\?/i);
  if (lakersBigQuestionsMatch) {
    return {
      headlineZh: '湖人围绕Luka Doncic和Austin Reaves调整阵容',
      summaryZh: '湖人正围绕Luka Doncic和Austin Reaves重塑阵容，外界仍在评估这些操作能否让球队成为争冠级别。'
    };
  }

  const summerLeagueBeginMatch = cleanTitle.match(/^(.+?) and (.+?) to begin NBA Summer League play in (.+)$/i);
  if (summerLeagueBeginMatch) {
    return {
      headlineZh: `${localizeCommonTerms(summerLeagueBeginMatch[1])}和${localizeCommonTerms(summerLeagueBeginMatch[2])}将出战夏季联赛`,
      summaryZh: `${localizeCommonTerms(summerLeagueBeginMatch[1])}和${localizeCommonTerms(summerLeagueBeginMatch[2])}将在${localizeCommonTerms(summerLeagueBeginMatch[3])}开始NBA夏季联赛征程。`
    };
  }

  const weddingInviteMatch = cleanTitle.match(/^(.+?) gets invite to Taylor Swift-Travis Kelce wedding at MSG/i);
  if (weddingInviteMatch) {
    return {
      headlineZh: `${localizeCommonTerms(weddingInviteMatch[1])}据报获邀参加MSG婚礼`,
      summaryZh: `${localizeCommonTerms(weddingInviteMatch[1])}据报收到Taylor Swift和Travis Kelce在麦迪逊广场花园婚礼的邀请。`
    };
  }

  const brunsonWeddingMatch = cleanTitle.match(/^(.+?), NBA champion Knicks score invites to Taylor Swift-Travis Kelce MSG wedding$/i);
  if (brunsonWeddingMatch) {
    return {
      headlineZh: `${localizeCommonTerms(brunsonWeddingMatch[1])}和尼克斯据报获邀参加MSG婚礼`,
      summaryZh: `${localizeCommonTerms(brunsonWeddingMatch[1])}和尼克斯据报收到Taylor Swift和Travis Kelce在麦迪逊广场花园婚礼的邀请。`
    };
  }

  const agreeToDealMatch = cleanTitle.match(/^(.+?),\s*(.+?) Agree To (.+?) Deal$/i) || cleanTitle.match(/^(.+?),\s*(.+?) Agree To (.+?) Contract$/i);
  if (agreeToDealMatch) {
    const player = localizeCommonTerms(agreeToDealMatch[1]);
    const team = localizeCommonTerms(agreeToDealMatch[2]);
    const terms = contractAmount(agreeToDealMatch[3]);
    return {
      headlineZh: `${player}与${team}达成${terms ? `${terms}合同` : '合同'}`,
      summaryZh: `${player}与${team}达成${terms ? `${terms}合同` : '合同'}。`
    };
  }

  const leavesForMoneyTeamContractMatch = cleanTitle.match(/^(.+?) leaves (.+?) for (\$\d+(?:\.\d+)?\s*million|\$\d+(?:\.\d+)?M) (.+?) contract$/i);
  if (leavesForMoneyTeamContractMatch) {
    const player = localizeCommonTerms(leavesForMoneyTeamContractMatch[1]);
    const oldTeam = localizeCommonTerms(leavesForMoneyTeamContractMatch[2]);
    const amount = contractAmount(leavesForMoneyTeamContractMatch[3]);
    const team = localizeCommonTerms(leavesForMoneyTeamContractMatch[4]);
    return {
      headlineZh: `${player}与${team}达成${amount ? `${amount}合同` : '合同'}`,
      summaryZh: `${player}将离开${oldTeam}，并与${team}达成${amount ? `${amount}合同` : '合同'}。`
    };
  }

  const leavesForContractMatch = cleanTitle.match(/^(.+?) leaves (.+?) for (.+?) (.+?) contract$/i);
  if (leavesForContractMatch) {
    const player = localizeCommonTerms(leavesForContractMatch[1]);
    const amount = contractAmount(leavesForContractMatch[3]);
    const team = localizeCommonTerms(leavesForContractMatch[4]);
    return {
      headlineZh: `${player}与${team}达成${amount ? `${amount}合同` : '合同'}`,
      summaryZh: `${player}将离开${localizeCommonTerms(leavesForContractMatch[2])}，并与${team}达成${amount ? `${amount}合同` : '合同'}。`
    };
  }

  const expectedLeaveMatch = cleanTitle.match(/^(.+?) Expected To Leave (.+?), Could Sign With (.+)$/i);
  if (expectedLeaveMatch) {
    return {
      headlineZh: `${localizeCommonTerms(expectedLeaveMatch[1])}可能离开${localizeCommonTerms(expectedLeaveMatch[2])}`,
      summaryZh: `${localizeCommonTerms(expectedLeaveMatch[1])}预计可能离开${localizeCommonTerms(expectedLeaveMatch[2])}，并有机会加盟${localizeCommonTerms(expectedLeaveMatch[3])}。`
    };
  }

  const jazzGuaranteeMatch = cleanTitle.match(/^Jazz Guarantee Contracts For (.+)$/i);
  if (jazzGuaranteeMatch) {
    return {
      headlineZh: `爵士保障${localizeCommonTerms(jazzGuaranteeMatch[1])}的合同`,
      summaryZh: `爵士保障${localizeCommonTerms(jazzGuaranteeMatch[1])}的合同，球队继续调整轮换深度。`
    };
  }

  const lakersSummerRosterMatch = cleanTitle.match(/^Lakers announce Summer League roster, including (.+)$/i);
  if (lakersSummerRosterMatch) {
    return {
      headlineZh: `湖人公布夏季联赛名单`,
      summaryZh: `湖人公布夏季联赛名单，${localizeCommonTerms(lakersSummerRosterMatch[1])}等球员在列。`
    };
  }

  const jazzLostKesslerMatch = cleanTitle.match(/^(?:The )?Utah Jazz lost Walker Kessler, but at least they have Jaxson Hayes$/i);
  if (jazzLostKesslerMatch) {
    return {
      headlineZh: '爵士失去Walker Kessler后补进Jaxson Hayes',
      summaryZh: '爵士失去Walker Kessler后，至少用Jaxson Hayes补充了内线轮换。'
    };
  }

  const jaylenLegacyMatch = cleanTitle.match(/^Jaylen Brown(?:’|'|)s legacy in Boston/i);
  if (jaylenLegacyMatch) {
    return {
      headlineZh: 'Jaylen Brown在波士顿的影响被重新回顾',
      summaryZh: 'Jaylen Brown离开凯尔特人后，他在波士顿场内外留下的影响被重新讨论。'
    };
  }

  const jaylenEraMatch = cleanTitle.match(/^(?:The )?Jaylen Brown era in Boston has come to an end$/i);
  if (jaylenEraMatch) {
    return {
      headlineZh: 'Jaylen Brown的凯尔特人时代结束',
      summaryZh: 'Jaylen Brown离开波士顿，凯尔特人的一个核心时代正式画上句号。'
    };
  }

  const lebronRankedMatch = cleanTitle.match(/^LeBron James went from .+ ranked$/i);
  if (lebronRankedMatch) {
    return {
      headlineZh: 'LeBron James潜在下家排名出炉',
      summaryZh: '随着LeBron James未来去向引发讨论，外界开始评估他下一站的可能选择。'
    };
  }

  const lebronDocuseriesMatch = cleanTitle.match(/^LeBron James reportedly planning tell-all on Lakers departure in upcoming docuseries$/i);
  if (lebronDocuseriesMatch) {
    return {
      headlineZh: 'LeBron James据报计划讲述离开湖人内幕',
      summaryZh: 'LeBron James据报将在即将推出的纪录片中讲述自己离开湖人的相关经历。'
    };
  }

  const grimesCelebrationMatch = cleanTitle.match(/^Quentin Grimes celebrates Lakers signing/i);
  if (grimesCelebrationMatch) {
    return {
      headlineZh: 'Quentin Grimes用旧照庆祝签约湖人',
      summaryZh: 'Quentin Grimes签约湖人后，用一张旧照庆祝这次加盟。'
    };
  }

  const clippersGuaranteeMatch = cleanTitle.match(/^Clippers Guarantee Kris Dunn; Push Back Guarantee Date For Cam Christie$/i);
  if (clippersGuaranteeMatch) {
    return {
      headlineZh: '快船保障Kris Dunn合同并推迟Cam Christie保障日期',
      summaryZh: '快船保障Kris Dunn的合同，同时与Cam Christie调整合同保障日期。'
    };
  }

  const lakersLineupRaceMatch = cleanTitle.match(/^Lakers' new starting lineup sparks debate over race's role in NBA success$/i);
  if (lakersLineupRaceMatch) {
    return {
      headlineZh: '湖人新首发阵容引发讨论',
      summaryZh: '湖人新首发阵容引发外界讨论，报道关注种族因素在NBA成功叙事中的角色。'
    };
  }

  const wisemanEuropeMatch = cleanTitle.match(/^Warriors lottery pick Wiseman leaving NBA to play in Europe$/i);
  if (wisemanEuropeMatch) {
    return {
      headlineZh: 'Wiseman将离开NBA转战欧洲',
      summaryZh: '前勇士乐透秀James Wiseman将离开NBA，转往欧洲联赛继续职业生涯。'
    };
  }

  const mavsWarriorsPickMatch = cleanTitle.match(/^Mavericks send Warriors[’'] first-rounder to Grizzlies for Spanish forward$/i);
  if (mavsWarriorsPickMatch) {
    return {
      headlineZh: '独行侠用勇士首轮签换来西班牙前锋',
      summaryZh: '独行侠将来自勇士的首轮签送至灰熊，换来一名西班牙前锋。'
    };
  }

  const jaylenSixersLiftMatch = cleanTitle.match(/^Can Jaylen Brown lift the Sixers/i);
  if (jaylenSixersLiftMatch) {
    return {
      headlineZh: 'Jaylen Brown加盟后76人前景受关注',
      summaryZh: '报道分析Jaylen Brown能否提升76人的上限，并回应外界对这笔操作的质疑。'
    };
  }

  const harrisSpursMatch = cleanTitle.match(/^Tobias Harris raises the floor of a Spurs team/i);
  if (harrisSpursMatch) {
    return {
      headlineZh: 'Tobias Harris提升马刺阵容下限',
      summaryZh: 'Tobias Harris的加盟被认为能提升马刺阵容下限，让这支球队在新赛季更稳定。'
    };
  }

  const sixersLeBronTargetMatch = cleanTitle.match(/^The Sixers’ next reported target: LeBron James/i);
  if (sixersLeBronTargetMatch) {
    return {
      headlineZh: '76人据报将LeBron James视为目标',
      summaryZh: '76人据报把LeBron James列为下一步追逐目标，但这仍属于自由市场传闻。'
    };
  }

  const malikGamblingMatch = cleanTitle.match(/^Malik Beasley pleading not guilty to gambling charges/i);
  if (malikGamblingMatch) {
    return {
      headlineZh: 'Malik Beasley对赌博相关指控不认罪',
      summaryZh: 'Malik Beasley对赌博相关指控表示不认罪，其律师称他希望继续向前。'
    };
  }

  const reavesLeBronDepartureMatch = cleanTitle.match(/^Austin Reaves breaks silence on LeBron James/i);
  if (reavesLeBronDepartureMatch) {
    return {
      headlineZh: 'Austin Reaves回应LeBron James离开湖人',
      summaryZh: 'Austin Reaves首次回应LeBron James离开湖人的话题，湖人后续阵容走向继续受到关注。'
    };
  }

  const spursLeBronMatch = cleanTitle.match(/^Spurs not expected to pursue LeBron James/i);
  if (spursLeBronMatch) {
    return {
      headlineZh: '马刺预计不会追逐LeBron James',
      summaryZh: '尽管自由市场传闻不断，马刺预计不会加入LeBron James争夺。'
    };
  }

  const sasserTradeMatch = cleanTitle.match(/^Reports: Mavericks trade for Pistons guard Marcus Sasser/i);
  if (sasserTradeMatch) {
    return {
      headlineZh: '独行侠交易得到Marcus Sasser预计下周完成',
      summaryZh: '据报道，独行侠从活塞交易得到后卫Marcus Sasser的操作预计将在下周完成。'
    };
  }

  const stephenALakersMatch = cleanTitle.match(/^Stephen A\. Smith delivers .+ on new-look Lakers$/i);
  if (stephenALakersMatch) {
    return {
      headlineZh: 'Stephen A. Smith点评新版湖人',
      summaryZh: 'Stephen A. Smith对湖人休赛期后的新阵容给出了强烈评价。'
    };
  }

  const twoWordsWolvesMatch = cleanTitle.match(/^Two Words, Wolves Pod: Randle and LaMelo Trades/i);
  if (twoWordsWolvesMatch) {
    return {
      headlineZh: '森林狼播客讨论Randle与LaMelo交易',
      summaryZh: '森林狼相关播客讨论Randle和LaMelo交易设想，以及球队首发阵容的可能变化。'
    };
  }

  const summarySignedDeal = cleanSummary.match(/^(?:The )?(.+?) have signed (.+?) to an? (.+?) deal\./i);
  if (summarySignedDeal) {
    return {
      headlineZh: `${localizeCommonTerms(summarySignedDeal[1])}签下${localizeCommonTerms(summarySignedDeal[2])}`,
      summaryZh: `${localizeCommonTerms(summarySignedDeal[1])}签下${localizeCommonTerms(summarySignedDeal[2])}，合同为${contractAmount(summarySignedDeal[3])}。`
    };
  }

  const acquireMatch = cleanTitle.match(/^(.+?) Acquire (.+?) From (.+?) For (.+)$/i);
  if (acquireMatch) {
    const summaryTrade = cleanSummary.match(/^(?:The )?(.+?) have acquired (.+?) from (?:the )?(.+?) for (.+?)\./i);
    if (summaryTrade) {
      const team = localizeCommonTerms(summaryTrade[1]);
      const player = localizeCommonTerms(summaryTrade[2]);
      const fromTeam = localizeCommonTerms(summaryTrade[3]);
      const assets = joinAssets(summaryTrade[4]);
      return {
        headlineZh: `${team}从${fromTeam}得到${player}`,
        summaryZh: `${team}从${fromTeam}得到${player}${assets ? `，送出${assets}` : ''}。`
      };
    }

    const team = localizeCommonTerms(acquireMatch[1]);
    const player = localizeCommonTerms(acquireMatch[2]);
    const fromTeam = localizeCommonTerms(acquireMatch[3]);
    const assets = joinAssets(acquireMatch[4]);
    return {
      headlineZh: `${team}从${fromTeam}得到${player}`,
      summaryZh: `${team}从${fromTeam}得到${player}${assets ? `，送出${assets}` : ''}。`
    };
  }

  const acquiredSentenceMatch = cleanSummary.match(/^(?:The )?(.+?) have acquired (.+?) from (?:the )?(.+?) for (.+?)\./i);
  if (acquiredSentenceMatch) {
    const team = localizeCommonTerms(acquiredSentenceMatch[1]);
    const player = localizeCommonTerms(acquiredSentenceMatch[2]);
    const fromTeam = localizeCommonTerms(acquiredSentenceMatch[3]);
    const assets = joinAssets(acquiredSentenceMatch[4]);
    return {
      headlineZh: `${team}从${fromTeam}得到${player}`,
      summaryZh: `${team}从${fromTeam}得到${player}${assets ? `，送出${assets}` : ''}。`
    };
  }

  const playerTradedMatch = cleanTitle.match(/^(.+?) traded from (.+?) to (.+?)(?::|$)/i);
  if (playerTradedMatch) {
    const player = localizeCommonTerms(playerTradedMatch[1]);
    const fromTeam = localizeCommonTerms(playerTradedMatch[2]);
    const toTeam = localizeCommonTerms(playerTradedMatch[3]);
    return {
      headlineZh: `${player}被${fromTeam}交易至${toTeam}`,
      summaryZh: `${player}被${fromTeam}交易至${toTeam}，这笔交易将影响两队阵容和 fantasy basketball 价值。`
    };
  }

  const oddsDropMatch = cleanTitle.match(/^(.+?) Drop to (.+?) Following (.+?) Trade$/i);
  if (oddsDropMatch) {
    return {
      headlineZh: `${localizeCommonTerms(oddsDropMatch[3])}交易后${localizeCommonTerms(oddsDropMatch[1])}冠军赔率下滑`,
      summaryZh: `${localizeCommonTerms(oddsDropMatch[3])}交易后，${localizeCommonTerms(oddsDropMatch[1])}冠军赔率降至${oddsDropMatch[2]}。`
    };
  }

  const reportedTradedForMatch = cleanTitle.match(/^(.+?) reportedly traded to (.+?) for (.+?) in .+$/i);
  if (reportedTradedForMatch) {
    const player = localizeCommonTerms(reportedTradedForMatch[1]);
    const toTeam = localizeCommonTerms(reportedTradedForMatch[2]);
    const assets = joinAssets(reportedTradedForMatch[3]);
    return {
      headlineZh: `${player}据报被交易至${toTeam}`,
      summaryZh: `${player}据报被交易至${toTeam}${assets ? `，交易筹码包括${assets}` : ''}。`
    };
  }

  const teamTradeMatch = cleanTitle.match(/^(.+?) reportedly trade (.+?) to (.+?) for (.+)$/i);
  if (teamTradeMatch) {
    const team = localizeCommonTerms(teamTradeMatch[1]);
    const player = localizeCommonTerms(teamTradeMatch[2]);
    const toTeam = localizeCommonTerms(teamTradeMatch[3]);
    const assets = joinAssets(teamTradeMatch[4]);
    return {
      headlineZh: `${team}将${player}交易至${toTeam}`,
      summaryZh: `${team}将${player}交易至${toTeam}${assets ? `，换回${assets}` : ''}。`
    };
  }

  const fantasyFalloutTradeMatch = cleanTitle.match(/^Fantasy Fallout: (.+?) reportedly trade (.+?) to (.+?) for (.+)$/i);
  if (fantasyFalloutTradeMatch) {
    const team = localizeCommonTerms(fantasyFalloutTradeMatch[1]);
    const player = localizeCommonTerms(fantasyFalloutTradeMatch[2]);
    const toTeam = localizeCommonTerms(fantasyFalloutTradeMatch[3]);
    const assets = joinAssets(fantasyFalloutTradeMatch[4]);
    return {
      headlineZh: `${team}将${player}交易至${toTeam}`,
      summaryZh: `${team}将${player}交易至${toTeam}${assets ? `，换回${assets}` : ''}。`
    };
  }

  const sixersTradeForMatch = cleanTitle.match(/^(.+?) trade for (.+?), send (.+?) to (.+?) in .+ deal$/i);
  if (sixersTradeForMatch) {
    const team = localizeCommonTerms(sixersTradeForMatch[1]);
    const player = localizeCommonTerms(sixersTradeForMatch[2]);
    const assets = joinAssets(sixersTradeForMatch[3]);
    const toTeam = localizeCommonTerms(sixersTradeForMatch[4]);
    return {
      headlineZh: `${team}交易得到${player}`,
      summaryZh: `${team}交易得到${player}，并将${assets}送至${toTeam}。`
    };
  }

  const celticsTradeReportMatch = cleanTitle.match(/^C's trade (.+?) to (.+?) for (.+?): Report$/i);
  if (celticsTradeReportMatch) {
    const player = localizeCommonTerms(celticsTradeReportMatch[1]);
    const toTeam = localizeCommonTerms(celticsTradeReportMatch[2]);
    const assets = joinAssets(celticsTradeReportMatch[3]);
    return {
      headlineZh: `凯尔特人将${player}交易至${toTeam}`,
      summaryZh: `凯尔特人将${player}交易至${toTeam}${assets ? `，换回${assets}` : ''}。`
    };
  }

  const landsMatch = cleanTitle.match(/^(.+?) reportedly land (.+?) in deal with (.+?) for (.+)$/i);
  if (landsMatch) {
    const team = localizeCommonTerms(landsMatch[1]);
    const player = localizeCommonTerms(landsMatch[2]);
    const fromTeam = localizeCommonTerms(landsMatch[3]);
    const assets = joinAssets(landsMatch[4]);
    return {
      headlineZh: `${team}从${fromTeam}得到${player}`,
      summaryZh: `${team}从${fromTeam}得到${player}${assets ? `，送出${assets}` : ''}。`
    };
  }

  const signsDealMatch = cleanTitle.match(/^(.+?) signs? (.+?) to (.+?) deal$/i);
  if (signsDealMatch) {
    const team = localizeCommonTerms(signsDealMatch[1]);
    const player = localizeCommonTerms(signsDealMatch[2]);
    const terms = contractAmount(signsDealMatch[3]);
    return {
      headlineZh: `${team}与${player}签下${terms ? `${terms}合同` : '合同'}`,
      summaryZh: `${team}与${player}签下${terms ? `${terms}合同` : '合同'}。`
    };
  }

  const signsContractMatch = cleanTitle.match(/^(.+?) signs? (.+?) to (.+?) contract$/i);
  if (signsContractMatch) {
    const team = localizeCommonTerms(signsContractMatch[1]);
    const player = localizeCommonTerms(signsContractMatch[2]);
    const terms = contractAmount(signsContractMatch[3]);
    return {
      headlineZh: `${team}与${player}签下${terms ? `${terms}合同` : '合同'}`,
      summaryZh: `${team}与${player}签下${terms ? `${terms}合同` : '合同'}。`
    };
  }

  const teamSignFormerCenterMatch = cleanTitle.match(/^(.+?) signs? former (.+?) center on (.+?) deal$/i);
  if (teamSignFormerCenterMatch) {
    const team = localizeCommonTerms(teamSignFormerCenterMatch[1]);
    const formerTeam = localizeCommonTerms(teamSignFormerCenterMatch[2]);
    const terms = contractAmount(teamSignFormerCenterMatch[3]);
    return {
      headlineZh: `${team}签下前${formerTeam}中锋`,
      summaryZh: `${team}签下一名前${formerTeam}中锋${terms ? `，合同为${terms}` : ''}。`
    };
  }

  const contractTitleMatch = cleanTitle.match(/^(.+?) signs? (.+?) contract$/i) || cleanTitle.match(/^(.+?) signs? (.+?) deal$/i);
  if (contractTitleMatch) {
    return {
      headlineZh: `${localizeCommonTerms(contractTitleMatch[1])}签下${localizeCommonTerms(contractTitleMatch[2])}`,
      summaryZh: `${localizeCommonTerms(contractTitleMatch[1])}签下${localizeCommonTerms(contractTitleMatch[2])}。`
    };
  }

  const meetingTitleMatch = cleanTitle.match(/^(.+?) to have (?:a )?(second )?meeting with (.+?)(?: after .+)?$/i);
  if (meetingTitleMatch) {
    const team = localizeCommonTerms(meetingTitleMatch[1]);
    const player = localizeCommonTerms(meetingTitleMatch[3]);
    return {
      headlineZh: `${team}将与${player}进行${meetingTitleMatch[2] ? '第二次' : ''}会面`,
      summaryZh: `${team}将与${player}进行${meetingTitleMatch[2] ? '第二次' : ''}会面。`
    };
  }

  const lakersMovesMatch = cleanTitle.match(/^(.+?) offseason moves: (.+?) out, (.+?) and others in$/i);
  if (lakersMovesMatch) {
    return {
      headlineZh: `${localizeCommonTerms(lakersMovesMatch[1])}休赛期送走${localizeCommonTerms(lakersMovesMatch[2])}并补进${localizeCommonTerms(lakersMovesMatch[3])}`,
      summaryZh: `${localizeCommonTerms(lakersMovesMatch[1])}休赛期已经完成多笔操作，包括通过交易引进${localizeCommonTerms(lakersMovesMatch[3])}。`
    };
  }

  const rookieCultureMatch = cleanTitle.match(/^(.+?) brings swagger, winning, culture to (.+)$/i);
  if (rookieCultureMatch) {
    return {
      headlineZh: `${localizeCommonTerms(rookieCultureMatch[1])}希望为${localizeCommonTerms(rookieCultureMatch[2])}带来赢球文化`,
      summaryZh: `${localizeCommonTerms(rookieCultureMatch[1])}准备帮助${localizeCommonTerms(rookieCultureMatch[2])}建立新的赢球文化。`
    };
  }

  const gamblingCaseMatch = cleanTitle.match(/^Ex-NBA Player (.+?) Pleads Not Guilty in Federal Gambling Case$/i);
  if (gamblingCaseMatch) {
    return {
      headlineZh: `${localizeCommonTerms(gamblingCaseMatch[1])}在联邦赌博案中不认罪`,
      summaryZh: `${localizeCommonTerms(gamblingCaseMatch[1])}否认与涉嫌投注计划相关的联邦欺诈、贿赂和洗钱指控。`
    };
  }

  const nbaLayoffsMatch = cleanTitle.match(/^NBA Cuts Dozens Of Jobs As League Shifts Focus To Global Growth$/i);
  if (nbaLayoffsMatch) {
    return {
      headlineZh: 'NBA裁员数十人，转向全球增长业务',
      summaryZh: 'NBA裁撤数十个岗位，并把资源重新分配到 NBA 欧洲、地方电视业务和全球增长等方向。'
    };
  }

  const lebronDestinationsMatch = cleanTitle.match(/^LeBron James post-Lakers landing spots: Ranking destinations by fit$/i);
  if (lebronDestinationsMatch) {
    return {
      headlineZh: 'LeBron James离开湖人后的潜在下家排名',
      summaryZh: '随着LeBron James可能自2018年以来首次更换球队，外界开始评估他离开湖人后的潜在下家。'
    };
  }

  const lakersStatueMatch = cleanTitle.match(/^Does LeBron deserve a Lakers statue\?/i);
  if (lakersStatueMatch) {
    return {
      headlineZh: 'LeBron James是否应拥有湖人雕像引发讨论',
      summaryZh: 'LeBron James离开湖人后，外界开始讨论他是否值得与湖人名宿一样拥有雕像。'
    };
  }

  const lakersFinanceMatch = cleanTitle.match(/^Where the Lakers stand financially after their free-agent spending spree$/i);
  if (lakersFinanceMatch) {
    return {
      headlineZh: '湖人大手笔签约后薪资空间所剩不多',
      summaryZh: '湖人在自由市场投入超过四分之一亿美元后，球队看起来已经没有太多薪资空间。'
    };
  }

  const lebronWhereMatch = cleanTitle.match(/^Where will LeBron go\? \+ breaking down the wild offseason start$/i);
  if (lebronWhereMatch) {
    return {
      headlineZh: 'LeBron James下家悬念牵动休赛期',
      summaryZh: '原文讨论LeBron James的潜在下家，以及NBA休赛期开局阶段的多笔重大动向。'
    };
  }

  const wizardsBigMenMatch = cleanTitle.match(/^NBA Free Agency: Five big men the Wizards could target$/i);
  if (wizardsBigMenMatch) {
    return {
      headlineZh: '奇才可能追逐五名内线补强目标',
      summaryZh: '原文盘点奇才在自由市场可能追逐的五名内线补强目标。'
    };
  }

  const signAndTradeMatch = cleanTitle.match(/^(.+?) From (.+?) To (.+?) In (.+?),\s*(.+?) Sign-And-Trade For (.+)$/i);
  if (signAndTradeMatch) {
    const player = localizeCommonTerms(signAndTradeMatch[1]);
    const fromTeam = localizeCommonTerms(signAndTradeMatch[2]);
    const toTeam = localizeCommonTerms(signAndTradeMatch[3]);
    const terms = contractAmount(`${signAndTradeMatch[4]} ${signAndTradeMatch[5]}`);
    const assets = joinAssets(signAndTradeMatch[6]);
    return {
      headlineZh: `${toTeam}通过先签后换得到${player}`,
      summaryZh: `${toTeam}从${fromTeam}通过${terms}先签后换得到${player}${assets ? `，送出${assets}` : ''}。`
    };
  }

  const cavsRookieMatch = cleanTitle.match(/^Cavs sign rookie (.+?) to a (.+?) deal$/i);
  if (cavsRookieMatch) {
    return {
      headlineZh: `骑士与新秀${localizeCommonTerms(cavsRookieMatch[1])}签下${contractAmount(cavsRookieMatch[2])}合同`,
      summaryZh: `骑士与新秀${localizeCommonTerms(cavsRookieMatch[1])}签下${contractAmount(cavsRookieMatch[2])}合同。`
    };
  }

  const titlePerson = getTitlePerson(cleanTitle);
  if (/Jaylen Brown/i.test(cleanTitle) && /(trade|traded|blockbuster)/i.test(cleanTitle)) {
    return {
      headlineZh: 'Jaylen Brown 被交易至 76 人',
      summaryZh: 'Jaylen Brown 被交易至 76 人，这笔交易继续影响凯尔特人与 76 人的阵容评估。'
    };
  }

  if (/Walker Kessler/i.test(cleanTitle) && /Lakers/i.test(cleanTitle) && /trade/i.test(cleanTitle)) {
    return {
      headlineZh: 'Walker Kessler 交易提升湖人争冠赔率',
      summaryZh: 'Walker Kessler 相关交易让湖人的争冠赔率获得提升。'
    };
  }

  if (titlePerson && /(trade|traded|acquire|acquired|blockbuster)/i.test(cleanTitle)) {
    return {
      headlineZh: `${localizeCommonTerms(titlePerson)}交易影响继续发酵`,
      summaryZh: `${localizeCommonTerms(titlePerson)}相关交易成为焦点，原文讨论这笔操作对球队阵容和后续走势的影响。`
    };
  }

  if (titlePerson && /(sign|signed|signing|contract|deal|extension|free agency)/i.test(cleanTitle)) {
    return {
      headlineZh: `${localizeCommonTerms(titlePerson)}签约动向更新`,
      summaryZh: `${localizeCommonTerms(titlePerson)}的签约或合同动向成为焦点，原文围绕其自由市场前景展开。`
    };
  }

  if (titlePerson) {
    return {
      headlineZh: `${localizeCommonTerms(titlePerson)}相关消息更新`,
      summaryZh: `原文聚焦${localizeCommonTerms(titlePerson)}的最新动态和后续影响。`
    };
  }

  return null;
}

function fallbackNonEmptySummary({ headlineZh = '', title = '', summary = '', source = '' } = {}) {
  const recapSummary = buildRecapAnalysisSummary({ title, source });
  if (recapSummary) return recapSummary;

  if (!headlineZh) return '';
  if (isGenericHeadline(headlineZh)) return '';
  const sourcePrefix = source ? `据 ${source} 报道，` : '';
  const cleanTitle = stripSourcePhrases(title);
  const cleanSummary = stripHtml(summary);
  const person = getTitlePerson(cleanTitle);

  if (person && /(trade|traded|acquire|acquired)/i.test(cleanTitle)) {
    return normalizeChineseText(`${sourcePrefix}${headlineZh}，原文关注${localizeCommonTerms(person)}相关交易的后续影响。`);
  }

  if (person && /(sign|signed|signing|contract|deal|extension|free agency)/i.test(cleanTitle)) {
    return normalizeChineseText(`${sourcePrefix}${headlineZh}，原文关注${localizeCommonTerms(person)}的合同或自由市场动向。`);
  }

  if (cleanSummary && cleanSummary.length > 20) {
    const firstSentence = localizeCommonTerms(cleanSummary.split(/(?<=[.!?])\s+/)[0]).replace(/[。.!?！？]+$/g, '');
    if (!hasMixedEnglishSummary(firstSentence) && !hasMachineEnglish(firstSentence)) {
      return normalizeChineseText(`${sourcePrefix}${headlineZh}，原文提到${firstSentence}。`);
    }
  }

  return normalizeChineseText(`${sourcePrefix}${headlineZh}，更多背景来自原文报道。`);
}

function scoreImportance({ title = '', summary = '', category = '其他', isMerged = false }) {
  const text = `${title} ${summary}`.toLowerCase();
  let score = 1;
  if (['签约', '交易', '伤病', '选秀'].includes(category)) score += 1;
  if (/(lebron|durant|curry|harden|kawhi|doncic|giannis|brown|lakers|warriors|celtics|suns|knicks|nets|sixers)/i.test(text)) score += 1;
  if (/(trade|sign|deal|contract|extension|injury|draft|target|free agency|acquire|waive)/i.test(text)) score += 1;
  if (/\$\d/.test(text)) score += 1;
  if (isMerged) score += 1;
  if (isLowValueArticle(title, summary)) score = Math.min(score, 2);
  return Math.max(1, Math.min(5, score));
}

function fallbackSummarizeArticle({ title, description, url, articleText, source }) {
  const category = classify(title, `${description} ${articleText}`);
  const initialHeadlineZh = finalizeHeadline(title, category);
  const rawSummary = stripHtml(description || articleText || '');
  const sentences = rawSummary
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !/represented by/i.test(sentence));
  const coreSentences = sentences
    .slice(0, 5)
    .map(summarizeSentence)
    .filter(isUsefulChineseSentence)
    .filter((sentence) => !isDuplicateOfTitle(sentence, initialHeadlineZh))
    .slice(0, 2);
  const summaryZh = buildFallbackSummaryZh({ source, headlineZh: initialHeadlineZh, title, sentences });
  const headlineZh = improveHeadlineFromSummary(initialHeadlineZh, summaryZh);
  const dekCandidate = coreSentences[0] || '';
  const dekZh = cleanDek(headlineZh, dekCandidate);
  const oneLineZh = normalizeSpacing(headlineZh.replace(/^NBA动态：/, '').replace(/^签约动态：/, '').replace(/^交易动态：/, ''));

  return {
    headlineZh,
    dekZh,
    summaryZh,
    oneLineZh,
    goldenQuoteZh: '',
    category,
    importance: scoreImportance({ title, summary: rawSummary, category })
  };
}

async function summarizeArticle(input) {
  const prompt = getSummarizePrompt(input);

  if (!process.env.OPENAI_API_KEY && !process.env.OPENROUTER_API_KEY && !process.env.GEMINI_API_KEY) {
    return fallbackSummarizeArticle(input);
  }

  console.warn('AI summarization API key detected, but no provider integration is enabled yet. Falling back to local rules.');
  void prompt;
  return fallbackSummarizeArticle(input);
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function normalizeItem(item, index, feedConfig) {
  const title = stripHtml(item.title);
  if (/Get Your Latest NBA News From RealGM|^RealGM Radio:/i.test(title)) {
    return null;
  }

  const link = String(item.link || '').trim();
  const pubDate = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();
  const summary = stripHtml(item.description);
  const articleText = await extractArticleText(link);
  const structured = await summarizeArticle({
    title,
    description: summary,
    url: link,
    articleText,
    source: feedConfig.source
  });
  const category = structured.category || classify(title, `${summary} ${articleText}`);
  const rssImageUrl = getRssImageUrl(item, link);

  return {
    id: link || `${title}-${index}`,
    title,
    originalTitle: title,
    headlineZh: structured.headlineZh,
    titleZh: structured.headlineZh,
    link,
    url: link,
    pubDate,
    publishedAt: pubDate,
    summary,
    dekZh: structured.dekZh,
    summaryZh: structured.summaryZh,
    oneLineZh: structured.oneLineZh || structured.headlineZh,
    goldenQuoteZh: structured.goldenQuoteZh || '',
    keyPoints: structured.dekZh ? [structured.dekZh] : [],
    imageUrl: rssImageUrl || (await fetchArticleImage(link)),
    source: feedConfig.source,
    feed: feedConfig.feed,
    category,
    importance: structured.importance || scoreImportance({ title, summary, category })
  };
}

async function readExistingFeed() {
  try {
    return await readFile(outputPath, 'utf8');
  } catch {
    return null;
  }
}

function parseExistingPayload(existingFeed) {
  if (!existingFeed) return null;

  try {
    return JSON.parse(existingFeed);
  } catch {
    return null;
  }
}

function normalizeChineseText(text = '') {
  if (text === null || text === undefined) return '';

  return normalizeWhitespace(text)
    .replace(/\bFantasy Fallout:\s*/gi, '')
    .replace(/\bFantasy Fallout\b/gi, '')
    .replace(/\bTrade Grades:\s*/gi, '')
    .replace(/\btrade grades\b/gi, '')
    .replace(/\bNBA Championship Odds\b/gi, '')
    .replace(/\bChampionship Odds\b/gi, '')
    .replace(/\bBreaking News:\s*/gi, '')
    .replace(/\bRumors:\s*/gi, '')
    .replace(/\bPhiladelphia 76ers\b/gi, '费城 76 人')
    .replace(/\bPhiladelphia\b/gi, '费城 76 人')
    .replace(/\b76ers\b/gi, '76 人')
    .replace(/\bSixers\b/gi, '76 人')
    .replace(/\$(\d+(?:\.\d+)?)M\b/gi, (_, amount) => `${Math.round(Number(amount) * 100)} 万美元`)
    .replace(/\$(\d+(?:\.\d+)?)\s*million\b/gi, (_, amount) => `${Math.round(Number(amount) * 100)} 万美元`)
    .replace(/(\d+(?:\.\d+)?)\s*万美元/g, '$1 万美元')
    .replace(/(\d+(?:\.\d+)?)\s*亿美元/g, '$1 亿美元')
    .replace(/费城\s*76\s*人/g, '费城 76 人')
    .replace(/76\s*人/g, '76 人')
    .replace(/76\s*人(?=\d)/g, '76 人 ')
    .replace(/(提升|加盟后)\s*76\s*人/g, '$1 76 人')
    .replace(/尼克斯\s+首发五人/g, '尼克斯首发五人')
    .replace(/([至与从给为])76\s*人/g, '$1 76 人')
    .replace(/凯尔特人交易至\s*76\s*人/g, '凯尔特人交易至 76 人')
    .replace(/([\u4e00-\u9fa5])(\d+(?:\.\d+)?\s*(?:万|亿)美元)/g, '$1 $2')
    .replace(/(\d+)\s*年/g, '$1 年')
    .replace(/([一二三四五六七八九十两]+年)(?=[、，,]\s*\d)/g, '$1')
    .replace(/([\u4e00-\u9fa5])([A-Za-z])/g, '$1 $2')
    .replace(/([A-Za-z])([\u4e00-\u9fa5])/g, '$1 $2')
    .replace(/([A-Za-zÀ-ÖØ-öø-ÿĀ-ž])([\u4e00-\u9fa5])/g, '$1 $2')
    .replace(/([\u4e00-\u9fa5])([A-Za-zÀ-ÖØ-öø-ÿĀ-ž])/g, '$1 $2')
    .replace(/([A-Za-z]\.)([\u4e00-\u9fa5])/g, '$1 $2')
    .replace(/([A-Za-z])\s+([A-Za-z])/g, '$1 $2')
    .replace(/\s+([，。！？；：、])/g, '$1')
    .replace(/([（《])\s+/g, '$1')
    .replace(/\s+([）》])/g, '$1')
    .replace(/万美元\s+合同/g, '万美元合同')
    .replace(/合同为多年/g, '多年合同')
    .replace(/\s+/g, ' ')
    .trim();
}

function getContractTermsFromText(value = '') {
  const text = String(value);
  const durationWords = {
    one: '1 年',
    two: '2 年',
    three: '3 年',
    four: '4 年',
    five: '5 年',
    six: '6 年'
  };
  const durationMatch =
    text.match(/\b(one|two|three|four|five|six)[-\s]+year\b/i) ||
    text.match(/\b(\d+)[-\s]+year\b/i) ||
    text.match(/\b(\d+)\s*年\b/i);
  const amountMatch =
    text.match(/\$(\d+(?:\.\d+)?)M\b/i) ||
    text.match(/\$(\d+(?:\.\d+)?)\s*million\b/i) ||
    text.match(/(\d+(?:\.\d+)?)\s*万美元/);

  const duration = durationMatch
    ? durationWords[durationMatch[1].toLowerCase?.()] || `${durationMatch[1]} 年`
    : '';
  const amount = amountMatch ? `${Math.round(Number(amountMatch[1]) * (/\$/.test(amountMatch[0]) ? 100 : 1))} 万美元` : '';

  return { duration, amount };
}

function getMergedContractUpgrade(item = {}) {
  const titles = toArray(item.originalTitles).filter(Boolean);
  if (!titles.length) return null;
  if (titles.some((title) => /sign-and-trade| from .+ to .+ in .+ for /i.test(title))) return null;

  const realGmDealTitle = titles.find((title) =>
    /^(.+?),\s*(.+?) Agree To (?:One|Two|Three|Four|Five|\d+)-Year,\s*\$\d+(?:\.\d+)?M Deal$/i.test(title)
  );
  if (realGmDealTitle) {
    const match = realGmDealTitle.match(/^(.+?),\s*(.+?) Agree To ((?:One|Two|Three|Four|Five|\d+)-Year),\s*(\$\d+(?:\.\d+)?M) Deal$/i);
    const terms = getContractTermsFromText(`${match[3]} ${match[4]}`);
    return normalizeChineseText(`${localizeCommonTerms(match[1])} 与${localizeCommonTerms(match[2])}达成 ${terms.duration} ${terms.amount} 合同`);
  }

  const titleWithTerms = titles
    .map((title) => ({ title, terms: getContractTermsFromText(title) }))
    .filter(({ terms }) => terms.duration || terms.amount)
    .sort((a, b) => Number(Boolean(b.terms.duration)) + Number(Boolean(b.terms.amount)) - (Number(Boolean(a.terms.duration)) + Number(Boolean(a.terms.amount))))[0]?.title;
  if (!titleWithTerms) return null;

  const terms = getContractTermsFromText(titleWithTerms);
  if (!terms.duration && !terms.amount) return null;

  const person = getPrimaryPerson(titleWithTerms);
  const team = getEventTeam(`${titleWithTerms} ${item.headlineZh || ''}`);
  if (!person || !team) return null;

  const contractText = [terms.duration, terms.amount].filter(Boolean).join(' ');
  return normalizeChineseText(`${person} 与${team}达成 ${contractText} 合同`);
}

function enrichMergedContractDetails(item = {}) {
  const upgradedHeadline = getMergedContractUpgrade(item);
  if (!upgradedHeadline) return item;

  const combinedText = `${item.headlineZh || ''} ${item.summaryZh || ''}`;
  const terms = getContractTermsFromText(upgradedHeadline);
  const hasAmount = hasEquivalentAmount(combinedText, terms.amount);
  const hasDuration = hasEquivalentDuration(combinedText, terms.duration);
  if (hasAmount && hasDuration) return item;

  const sourcePrefix = item.source ? `据 ${item.source} 报道，` : '';
  return {
    ...item,
    headlineZh: upgradedHeadline,
    titleZh: upgradedHeadline,
    oneLineZh: upgradedHeadline,
    summaryZh: normalizeChineseText(`${sourcePrefix}${upgradedHeadline}。`)
  };
}

function applyKnownEventCopy(item = {}) {
  if (item.eventKey !== 'trade:lu-dort:hawks:thunder:mavericks') return item;

  const headlineZh = '雷霆将吕冈茨·多尔特送至老鹰';
  const summaryZh = '雷霆在三方交易中将吕冈茨·多尔特送至老鹰，独行侠得到扎卡里·里萨谢，老鹰还得到瑞安·内姆哈德。';
  const oneLineZh = '雷霆送走多尔特，独行侠得到里萨谢';

  return {
    ...item,
    headlineZh,
    titleZh: headlineZh,
    summaryZh,
    oneLineZh,
    category: '交易',
    importance: Math.max(item.importance || 1, 5)
  };
}

function hasEquivalentDuration(value = '', duration = '') {
  if (!duration) return true;
  const compact = String(value).replace(/\s+/g, '');
  const normalizedDuration = duration.replace(/\s+/g, '');
  const digit = normalizedDuration.match(/^(\d+)年$/)?.[1];
  const digitToChinese = {
    1: '一年',
    2: '两年',
    3: '三年',
    4: '四年',
    5: '五年',
    6: '六年'
  };
  return compact.includes(normalizedDuration) || Boolean(digit && compact.includes(digitToChinese[digit]));
}

function hasEquivalentAmount(value = '', amount = '') {
  if (!amount) return true;
  return String(value).includes(amount) || String(value).includes(amount.replace(/\s+/g, ''));
}

function normalizeNewsItemText(item = {}) {
  const forcedContractHeadline = item.isMerged ? getMergedContractUpgrade(item) : '';
  const dekZh = normalizeChineseText(item.dekZh || '');
  let summaryZh = normalizeChineseText(item.summaryZh || '');
  let headlineZh = normalizeChineseText(forcedContractHeadline || item.headlineZh || '');
  headlineZh = normalizeChineseText(deTemplateHeadline(improveHeadlineFromSummary(headlineZh, summaryZh)));
  headlineZh = normalizeChineseText(fixMixedLanguageHeadline(headlineZh, item));
  const originalFactText = `${item.originalTitle || item.title || ''} ${item.summary || ''}`;
  const extractedFact = (isGenericHeadline(headlineZh) || hasUnsafeEnglishResidue(headlineZh) || !summaryZh || isMixedLanguageHeadline(summaryZh) || hasMixedEnglishSummary(summaryZh) || hasUntranslatedContractTerm(`${headlineZh} ${summaryZh}`) || /\bmulti[-\s]+year contract\b/i.test(originalFactText) || /sign-and-trade| from .+ to .+ in .+ for /i.test(originalFactText))
    ? extractFactFromEnglish({ title: item.originalTitle || item.title || '', summary: item.summary || '', source: item.source || '' })
    : null;
  if (extractedFact?.headlineZh) {
    headlineZh = normalizeChineseText(extractedFact.headlineZh);
  }
  if ((!summaryZh || isMixedLanguageHeadline(summaryZh) || hasMixedEnglishSummary(summaryZh) || hasUntranslatedContractTerm(summaryZh)) && extractedFact?.summaryZh) {
    summaryZh = normalizeChineseText(`${item.source ? `据 ${item.source} 报道，` : ''}${extractedFact.summaryZh}`);
  }
  const titleZh = normalizeChineseText(headlineZh);
  const oneLineZh = normalizeChineseText(headlineZh);
  const goldenQuoteZh = normalizeChineseText(item.goldenQuoteZh || '');
  if (forcedContractHeadline && !hasEquivalentAmount(summaryZh, getContractTermsFromText(forcedContractHeadline).amount)) {
    summaryZh = normalizeChineseText(`${item.source ? `据 ${item.source} 报道，` : ''}${forcedContractHeadline}。`);
  }
  if (!summaryZh) {
    summaryZh = fallbackNonEmptySummary({
      headlineZh,
      title: item.originalTitle || item.title || '',
      summary: item.summary || '',
      source: item.source || ''
    });
  }
  if (compactComparable(summaryZh) === compactComparable(headlineZh)) {
    summaryZh = fallbackNonEmptySummary({
      headlineZh,
      title: item.originalTitle || item.title || '',
      summary: item.summary || '',
      source: item.source || ''
    });
  }
  if (hasMixedEnglishSummary(summaryZh) || hasUntranslatedContractTerm(summaryZh)) {
    summaryZh = extractedFact?.summaryZh
      ? normalizeChineseText(`${item.source ? `据 ${item.source} 报道，` : ''}${extractedFact.summaryZh}`)
      : '';
  }
  if (!isSafeChineseSummary(summaryZh)) {
    const fallbackSummary = extractedFact?.summaryZh
      ? normalizeChineseText(`${item.source ? `据 ${item.source} 报道，` : ''}${extractedFact.summaryZh}`)
      : '';
    summaryZh = isSafeChineseSummary(fallbackSummary) ? fallbackSummary : '';
  }

  const rawImportance = Number(item.importance || 1);
  const importance = isGenericHeadline(headlineZh) || isLowValueArticle(item.originalTitle || item.title || '', item.summary || '')
    ? Math.min(rawImportance, 2)
    : rawImportance;

  const category = correctCategory({
    ...item,
    headlineZh,
    summaryZh,
    category: classify(item.originalTitle || item.title || headlineZh, `${item.summary || ''} ${summaryZh}`)
  });
  const storyType = inferStoryType({ ...item, category, summaryZh });
  const typedFallbackSummary = buildTypedFallbackSummary({ ...item, category, headlineZh, summaryZh }, storyType);
  const needsTypedFallback =
    !summaryZh ||
    isSimpleTitleRestatement({ ...item, summaryZh }) ||
    (storyType === 'opinion' && !isOpinionSummaryComplete(summaryZh)) ||
    (storyType === 'rumor' && isRumorWrittenAsConfirmed({ ...item, category }, summaryZh)) ||
    (storyType === 'analysis' && isAnalysisWrittenAsFact({ ...item, category }, summaryZh));
  if (needsTypedFallback && typedFallbackSummary && isSafeChineseSummary(typedFallbackSummary)) {
    summaryZh = typedFallbackSummary;
  }
  if (!isSafeChineseSummary(summaryZh)) {
    summaryZh = '';
  }
  const eventKey = getEventKey({ ...item, headlineZh, summaryZh, category });
  const relatedItems = toArray(item.relatedItems).filter((related) => {
    if (!eventKey) return false;
    const relatedKey = getEventKey({
      originalTitle: related.originalTitle || related.title || '',
      title: related.title || related.originalTitle || '',
      summary: '',
      category
    });
    return relatedKey && relatedKey === eventKey;
  });
  const originalTitles = toArray(item.originalTitles).filter((title) => {
    if (!eventKey) return false;
    const titleKey = getEventKey({ originalTitle: title, title, summary: '', category });
    return !titleKey || titleKey === eventKey;
  });
  const originalTitle = normalizeWhitespace(item.originalTitle || item.title || '');
  const displayTitle = originalTitle;

  return applyKnownEventCopy({
    ...item,
    originalTitle,
    displayTitle: normalizeWhitespace(displayTitle),
    headlineZh,
    titleZh,
    dekZh,
    summaryZh,
    oneLineZh,
    goldenQuoteZh,
    category,
    importance,
    copySource: item.copySource || 'fallback',
    storyType,
    eventKey,
    relatedItems,
    ...(originalTitles.length ? { originalTitles } : {}),
    isMerged: relatedItems.length > 0 || originalTitles.length > 1
  });
}

function normalizeHighlightText(highlight = {}) {
  return {
    ...highlight,
    text: normalizeChineseText(highlight.text || '')
  };
}

function stripTransientArticleText(item = {}) {
  const { articleText, ...cleanItem } = item;
  return cleanItem;
}

function preparePayloadForWrite(payload = {}, options = {}) {
  const { stripArticleText = true } = options;
  const items = Array.isArray(payload.items)
    ? mergeEvents(mergeEvents(payload.items.map(enrichMergedContractDetails).map(normalizeNewsItemText)).map(normalizeNewsItemText)).map(normalizeNewsItemText)
    : payload.items;
  const outputItems = stripArticleText && Array.isArray(items)
    ? items.map(stripTransientArticleText)
    : items;
  const highlights = Array.isArray(items)
    ? buildHighlights(items).map(normalizeHighlightText)
    : toArray(payload.highlights).map(normalizeHighlightText);

  return {
    ...payload,
    highlights,
    items: outputItems
  };
}

function compactComparable(value = '') {
  return normalizeChineseText(value)
    .replace(/^据\s+.+?\s+报道，/, '')
    .replace(/[。！？\s]/g, '')
    .trim();
}

function isSimpleTitleRestatement(item = {}) {
  const title = compactComparable(item.originalTitle || item.title || '');
  const summary = compactComparable(item.summaryZh || '');
  if (!title || !summary) return false;
  return title === summary || summary.includes(title) || title.includes(summary);
}

function getQualityReport(payload = {}) {
  const items = toArray(payload.items);
  const highlights = toArray(payload.highlights);
  const textFields = items.flatMap((item) => [
    ['displayTitle', item.displayTitle || '', item],
    ['headlineZh', item.headlineZh || '', item],
    ['titleZh', item.titleZh || '', item],
    ['dekZh', item.dekZh || '', item],
    ['summaryZh', item.summaryZh || '', item],
    ['oneLineZh', item.oneLineZh || '', item],
    ['goldenQuoteZh', item.goldenQuoteZh || '', item]
  ]);
  const highlightFields = highlights.map((highlight) => ['highlight', highlight.text || '', highlight]);

  const glued = [...textFields, ...highlightFields].filter(([, value]) => /[\u4e00-\u9fa5][A-Za-z]|[A-Za-z][\u4e00-\u9fa5]/.test(value));
  const unspacedMoney = [...textFields, ...highlightFields].filter(([, value]) =>
    /\d+(?:\.\d+)?(?:万|亿)美元|[\u4e00-\u9fa5]\d+(?:\.\d+)?\s*(?:万|亿)美元/.test(value)
  );
  const headlineRelated = items.filter((item) => /相关动态/.test(item.headlineZh || ''));
  const headlineContinue = items.filter((item) => /继续更新/.test(item.headlineZh || ''));
  const emptySummaryZh = items.filter((item) => !(item.summaryZh || '').trim());
  const usesChineseDisplayTitle = (item) => compactComparable(item.displayTitle || '') === compactComparable(item.headlineZh || '');
  const genericHeadlineZh = items.filter((item) => usesChineseDisplayTitle(item) && isGenericHeadline(item.headlineZh || ''));
  const genericOneLineZh = items.filter((item) => isHighQualityChineseHeadline(item, item.oneLineZh || '') && isGenericHeadline(item.oneLineZh || ''));
  const genericHighlights = highlights.filter((highlight) => isGenericHeadline(highlight.text || ''));
  const displayTitleMissing = items.filter((item) => !(item.displayTitle || '').trim());
  const unsafeChineseDisplayTitle = items.filter((item) => hasChineseText(item.displayTitle || '') && !isSafeChineseTitle(item.displayTitle || ''));
  const safeChineseTitleWronglyFallbackToEnglish = [];
  const nonOriginalDisplayTitle = items.filter((item) => normalizeWhitespace(item.displayTitle || '') !== normalizeWhitespace(item.originalTitle || item.title || ''));
  const emptyOriginalTitle = items.filter((item) => !normalizeWhitespace(item.originalTitle || item.title || ''));
  const summaryRepeatsTitle = items.filter(isSimpleTitleRestatement);
  const opinionItems = items.filter((item) => inferStoryType(item) === 'opinion' && (item.importance || 1) >= 4);
  const rumorItems = items.filter((item) => inferStoryType(item) === 'rumor');
  const analysisItems = items.filter((item) => inferStoryType(item) === 'analysis');
  const opinionMissingSpeaker = opinionItems.filter((item) => !extractOpinionSpeaker(item) || !(item.summaryZh || '').includes(extractOpinionSpeaker(item).split(/\s+/)[0]));
  const opinionMissingSubject = opinionItems.filter((item) => !/交易|签约|伤病|合同|球队|赛季|比赛|自由市场|阵容|Jaylen|LeBron|Brown|James/.test(item.summaryZh || ''));
  const opinionMissingView = opinionItems.filter((item) => !isOpinionSummaryComplete(item.summaryZh || ''));
  const rumorWrittenAsConfirmed = rumorItems.filter((item) => isRumorWrittenAsConfirmed(item, item.summaryZh || ''));
  const analysisWrittenAsFact = analysisItems.filter((item) => isAnalysisWrittenAsFact(item, item.summaryZh || ''));
  const badFallbackOpinionSummary = items.filter(isOpinionSummaryBad);
  const badFallbackRumorSummary = items.filter(isRumorSummaryBad);
  const badFallbackAnalysisSummary = items.filter(isAnalysisSummaryBad);
  const summaryContainsRawEnglishPhrase = items.filter((item) => containsRawEnglishSummaryPhrase(item.summaryZh || ''));
  const summaryContainsMoreBackgroundTemplate = items.filter((item) => /更多背景来自原文报道|more background from the original report/i.test(item.summaryZh || ''));
  const analysisSummaryMissingSubject = analysisItems.filter((item) => (item.summaryZh || '').trim() && !hasAnalysisSummarySubject(item.summaryZh || ''));
  const analysisSummaryMissingEvent = analysisItems.filter((item) => (item.summaryZh || '').trim() && isRecapAnalysisTitle(item.originalTitle || item.title || '') && !hasAnalysisSummaryEvent(item.summaryZh || ''));
  const unsafeFallbackSummary = items.filter((item) => (item.summaryZh || '').trim() && item.copySource !== 'github-models' && !isSafeChineseSummary(item.summaryZh || ''));
  const unsafeFallbackShownWithoutAi = unsafeFallbackSummary;
  const opinionMisclassifiedAsSigning = items.filter((item) =>
    /\b(share thoughts|shares thoughts|thoughts on|says|said|believes|thinks)\b/i.test(item.originalTitle || item.title || '') &&
    inferStoryType(item) !== 'opinion'
  );
  const tradeMisclassifiedAsOpinion = items.filter((item) =>
    /\b(trade (?:on hold|paused|delayed|completed|agreed)|trade\b.*\b(?:on hold|paused|delayed|completed|agreed|inquiry)|pending investigation|until nba concludes inquiry|transaction|finalizing deal|acquired|sent to|dealt to)\b/i.test(item.originalTitle || item.title || '') &&
    inferStoryType(item) === 'opinion'
  );
  const analysisMisclassifiedAsFact = items.filter((item) =>
    /\b(look to challenge|biggest threat|what it means|takeaways|thoughts following|recap|what we learned|winners and losers|outlook|ranking|projection)\b/i.test(item.originalTitle || item.title || '') &&
    inferStoryType(item) === 'fact'
  );
  const modelStoryTypeOverrodeLocal = [];
  const opinionValidationAppliedToNonOpinion = [];
  const aiEligibleButNotCandidate = items.filter((item) =>
    needsAiSummary(item) &&
    ['opinion', 'rumor', 'analysis'].includes(inferStoryType(item)) &&
    getAiCandidatePriority(item) <= 0
  );
  const summaryMissingMainPerson = items.filter((item) => {
    if ((item.importance || 1) < 4) return false;
    const player = getEventPlayer(`${item.originalTitle || item.title || ''} ${item.summary || ''}`);
    return player && !slugText(item.summaryZh || '').includes(player);
  });
  const summaryMixedLanguage = items.filter((item) => hasMixedEnglishSummary(item.summaryZh || ''));
  const genericDisplayTitle = items.filter((item) => hasChineseText(item.displayTitle || '') && isGenericHeadline(item.displayTitle || ''));
  const mixedDisplayTitle = items.filter((item) => hasMixedChineseEnglish(item.displayTitle || ''));
  const mixedChineseEnglishHeadline = items.filter((item) => hasMixedChineseEnglish(item.displayTitle || ''));
  const mixedChineseEnglishSummary = items.filter((item) => !isSafeChineseSummary(item.summaryZh || ''));
  const duplicatedOriginalTitleDisplay = [];
  const repeatedSummary = items.filter((item) => {
    const headline = compactComparable(item.headlineZh || '');
    const summary = compactComparable(item.summaryZh || '');
    return headline && summary && (summary === headline || summary === `${headline}`);
  });
  const originalTitleHasTradeButGenericHeadline = items.filter(
    (item) => usesChineseDisplayTitle(item) && /(trade|traded|acquire|acquired|deal with|land|lands|for .*pick)/i.test(item.originalTitle || item.title || '') && isGenericHeadline(item.headlineZh || '')
  );
  const originalTitleHasContractButGenericHeadline = items.filter(
    (item) => usesChineseDisplayTitle(item) && /(sign|signed|signing|contract|deal|extension|free agency)/i.test(item.originalTitle || item.title || '') && isGenericHeadline(item.headlineZh || '')
  );
  const originalTitleHasPlayerButSummaryEmpty = items.filter(
    (item) =>
      /\b[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)+\b/.test(item.originalTitle || item.title || '') &&
      !(item.summaryZh || '').trim()
  );
  const allTextRecords = [...textFields, ...highlightFields];
  const titleWhitespaceRecords = [
    ...items.map((item) => ['originalTitle', item.originalTitle || '', item]),
    ...textFields,
    ...highlightFields
  ];
  const titleContainsNewline = titleWhitespaceRecords.filter(([field, value]) =>
    ['originalTitle', 'displayTitle', 'headlineZh', 'titleZh', 'oneLineZh', 'dekZh', 'goldenQuoteZh', 'highlight'].includes(field) &&
    /[\n\r\t]/.test(value)
  );
  const summaryContainsNewline = textFields.filter(([field, value]) =>
    field === 'summaryZh' && /[\n\r\t]/.test(value)
  );
  const oddsMisclassifiedAsSigning = items.filter((item) =>
    item.category === '\u7b7e\u7ea6' &&
    isOddsArticle(item.originalTitle || item.title || '', item.displayTitle || '', item.summaryZh || '')
  );
  const oddsMisclassifiedAsTrade = items.filter((item) =>
    item.category === '\u4ea4\u6613' &&
    isOddsArticle(item.originalTitle || item.title || '', item.displayTitle || '', item.summaryZh || '')
  );
  const containsFantasyFallout = allTextRecords.filter(([, value]) => /Fantasy Fallout/i.test(value));
  const containsTradeGrades = allTextRecords.filter(([, value]) => /Trade Grades|trade grades/i.test(value));
  const containsChampionshipOdds = allTextRecords.filter(([, value]) => /NBA Championship Odds|Championship Odds/i.test(value));
  const containsPhiladelphiaEnglish = allTextRecords.filter(([field, value]) => !(field === 'displayTitle' && !hasChineseText(value)) && /\bPhiladelphia\b/i.test(value));
  const contains76人WithoutSpace = allTextRecords.filter(([, value]) => /76人|费城76\s*人|至76\s*人|与76\s*人|从76\s*人/.test(value));
  const chineseTeamNameWrongSpace = allTextRecords.filter(([, value]) => /尼克斯\s+首发五人/.test(value));
  const missingSpaceBefore76人 = allTextRecords.filter(([, value]) => /[\u4e00-\u9fa5A-Za-z]76\s*人/.test(value));
  const missingSpaceAfter76人 = allTextRecords.filter(([, value]) => /76\s*人(?=\d)/.test(value));
  const vagueImpactHeadline = items.filter((item) => usesChineseDisplayTitle(item) && /(交易影响继续发酵|相关交易成为焦点|后续走势受到关注)/.test(item.headlineZh || item.oneLineZh || ''));
  const mixedLanguageHeadline = items.filter((item) => isMixedLanguageHeadline(`${item.headlineZh || ''} ${item.oneLineZh || ''} ${item.summaryZh || ''}`));
  const mixedEnglishSummary = items.filter((item) => hasMixedEnglishSummary(item.summaryZh || ''));
  const untranslatedContractTerm = allTextRecords.filter(([field, value]) => {
    if (field === 'displayTitle' && !hasChineseText(value)) return false;
    return hasUntranslatedContractTerm(value);
  });
  const tradeTitleMisclassifiedAsInjury = items.filter(
    (item) => item.category === '伤病' && /\b(acquire|acquired|traded|trade|trading|lands? in deal|land .+ in deal|for aj johnson|deal with grizzlies|for .*picks?)\b/i.test(item.originalTitle || item.title || '')
  );
  const eventKeyCounts = items.reduce((acc, item) => {
    if (!item.eventKey) return acc;
    acc.set(item.eventKey, (acc.get(item.eventKey) || 0) + 1);
    return acc;
  }, new Map());
  const duplicateEventKeys = items.filter((item) => item.eventKey && eventKeyCounts.get(item.eventKey) > 1);
  const highlightEventKeys = highlights
    .map((highlight) => items.find((item) => item.id === highlight.id || item.link === highlight.link)?.eventKey)
    .filter(Boolean);
  const highlightsDuplicateEvents = highlightEventKeys.filter((key, index) => highlightEventKeys.indexOf(key) !== index);
  const tradeMisclassifiedAsSigning = items.filter(
    (item) => item.category === '签约' && /\b(acquire|acquired|traded|trade|trading|lands? in deal|sent to|for .*picks?)\b/i.test(`${item.originalTitle || item.title || ''} ${item.headlineZh || ''}`)
  );
  const signingMisclassifiedAsTrade = items.filter(
    (item) => item.category === '交易' && !/\b(acquire|acquired|traded|trade|trading|lands? in deal|for .*picks?)\b/i.test(`${item.originalTitle || item.title || ''} ${item.summary || ''}`) && /\b(sign|signed|signing|contract|extension|re-sign|agrees? to .+ deal)\b/i.test(`${item.originalTitle || item.title || ''} ${item.summary || ''}`)
  );
  const tradeEventCountsByPlayerTeams = items.reduce((acc, item) => {
    const key = item.eventKey?.startsWith('trade:') ? item.eventKey.replace(/:(odds|fantasy|grades|report|analysis|source)$/i, '') : '';
    if (!key) return acc;
    acc.set(key, (acc.get(key) || 0) + 1);
    return acc;
  }, new Map());
  const duplicatePlayerTeamTradeEvents = items.filter((item) => item.eventKey?.startsWith('trade:') && tradeEventCountsByPlayerTeams.get(item.eventKey) > 1);
  const mergedMissingTerms = items.filter((item) => {
    if (!item.isMerged) return false;
    const titles = toArray(item.originalTitles).join(' ');
    const terms = getContractTermsFromText(titles);
    if (!terms.amount && !terms.duration) return false;
    const combined = `${item.headlineZh || ''} ${item.summaryZh || ''}`;
    const hasAmount = hasEquivalentAmount(combined, terms.amount);
    const hasDuration = hasEquivalentDuration(combined, terms.duration);
    return !hasAmount || !hasDuration;
  });

  return {
    counts: {
      gluedText: glued.length,
      unspacedMoney: unspacedMoney.length,
      headlineRelated: headlineRelated.length,
      headlineContinue: headlineContinue.length,
      emptySummaryZh: emptySummaryZh.length,
      genericHeadlineZh: genericHeadlineZh.length,
      genericOneLineZh: genericOneLineZh.length,
      genericHighlights: genericHighlights.length,
      displayTitleMissing: displayTitleMissing.length,
      unsafeChineseDisplayTitle: unsafeChineseDisplayTitle.length,
      safeChineseTitleWronglyFallbackToEnglish: safeChineseTitleWronglyFallbackToEnglish.length,
      nonOriginalDisplayTitle: nonOriginalDisplayTitle.length,
      emptyOriginalTitle: emptyOriginalTitle.length,
      summaryRepeatsTitle: summaryRepeatsTitle.length,
      opinionMissingSpeaker: opinionMissingSpeaker.length,
      opinionMissingSubject: opinionMissingSubject.length,
      opinionMissingView: opinionMissingView.length,
      rumorWrittenAsConfirmed: rumorWrittenAsConfirmed.length,
      analysisWrittenAsFact: analysisWrittenAsFact.length,
      badFallbackOpinionSummary: badFallbackOpinionSummary.length,
      badFallbackRumorSummary: badFallbackRumorSummary.length,
      badFallbackAnalysisSummary: badFallbackAnalysisSummary.length,
      summaryContainsRawEnglishPhrase: summaryContainsRawEnglishPhrase.length,
      summaryContainsMoreBackgroundTemplate: summaryContainsMoreBackgroundTemplate.length,
      analysisSummaryMissingSubject: analysisSummaryMissingSubject.length,
      analysisSummaryMissingEvent: analysisSummaryMissingEvent.length,
      unsafeFallbackSummary: unsafeFallbackSummary.length,
      unsafeFallbackShownWithoutAi: unsafeFallbackShownWithoutAi.length,
      opinionMisclassifiedAsSigning: opinionMisclassifiedAsSigning.length,
      tradeMisclassifiedAsOpinion: tradeMisclassifiedAsOpinion.length,
      analysisMisclassifiedAsFact: analysisMisclassifiedAsFact.length,
      modelStoryTypeOverrodeLocal: modelStoryTypeOverrodeLocal.length,
      opinionValidationAppliedToNonOpinion: opinionValidationAppliedToNonOpinion.length,
      aiEligibleButNotCandidate: aiEligibleButNotCandidate.length,
      summaryMissingMainPerson: summaryMissingMainPerson.length,
      summaryMixedLanguage: summaryMixedLanguage.length,
      genericDisplayTitle: genericDisplayTitle.length,
      mixedDisplayTitle: mixedDisplayTitle.length,
      mixedChineseEnglishHeadline: mixedChineseEnglishHeadline.length,
      mixedChineseEnglishSummary: mixedChineseEnglishSummary.length,
      duplicatedOriginalTitleDisplay: duplicatedOriginalTitleDisplay.length,
      originalTitleHasTradeButGenericHeadline: originalTitleHasTradeButGenericHeadline.length,
      originalTitleHasContractButGenericHeadline: originalTitleHasContractButGenericHeadline.length,
      originalTitleHasPlayerButSummaryEmpty: originalTitleHasPlayerButSummaryEmpty.length,
      titleContainsNewline: titleContainsNewline.length,
      summaryContainsNewline: summaryContainsNewline.length,
      oddsMisclassifiedAsSigning: oddsMisclassifiedAsSigning.length,
      oddsMisclassifiedAsTrade: oddsMisclassifiedAsTrade.length,
      containsFantasyFallout: containsFantasyFallout.length,
      containsTradeGrades: containsTradeGrades.length,
      containsChampionshipOdds: containsChampionshipOdds.length,
      containsPhiladelphiaEnglish: containsPhiladelphiaEnglish.length,
      contains76人WithoutSpace: contains76人WithoutSpace.length,
      chineseTeamNameWrongSpace: chineseTeamNameWrongSpace.length,
      missingSpaceBefore76人: missingSpaceBefore76人.length,
      missingSpaceAfter76人: missingSpaceAfter76人.length,
      vagueImpactHeadline: vagueImpactHeadline.length,
      mixedLanguageHeadline: mixedLanguageHeadline.length,
      mixedEnglishSummary: mixedEnglishSummary.length,
      untranslatedContractTerm: untranslatedContractTerm.length,
      tradeTitleMisclassifiedAsInjury: tradeTitleMisclassifiedAsInjury.length,
      duplicatePlayerTeamTradeEvents: duplicatePlayerTeamTradeEvents.length,
      duplicateEventKeys: duplicateEventKeys.length,
      highlightsDuplicateEvents: highlightsDuplicateEvents.length,
      tradeMisclassifiedAsSigning: tradeMisclassifiedAsSigning.length,
      signingMisclassifiedAsTrade: signingMisclassifiedAsTrade.length,
      repeatedSummary: repeatedSummary.length,
      mergedMissingTerms: mergedMissingTerms.length
    },
    issues: {
      glued,
      unspacedMoney,
      headlineRelated,
      headlineContinue,
      emptySummaryZh,
      genericHeadlineZh,
      genericOneLineZh,
      genericHighlights,
      displayTitleMissing,
      unsafeChineseDisplayTitle,
      safeChineseTitleWronglyFallbackToEnglish,
      nonOriginalDisplayTitle,
      emptyOriginalTitle,
      summaryRepeatsTitle,
      opinionMissingSpeaker,
      opinionMissingSubject,
      opinionMissingView,
      rumorWrittenAsConfirmed,
      analysisWrittenAsFact,
      badFallbackOpinionSummary,
      badFallbackRumorSummary,
      badFallbackAnalysisSummary,
      summaryContainsRawEnglishPhrase,
      summaryContainsMoreBackgroundTemplate,
      analysisSummaryMissingSubject,
      analysisSummaryMissingEvent,
      unsafeFallbackSummary,
      unsafeFallbackShownWithoutAi,
      opinionMisclassifiedAsSigning,
      tradeMisclassifiedAsOpinion,
      analysisMisclassifiedAsFact,
      modelStoryTypeOverrodeLocal,
      opinionValidationAppliedToNonOpinion,
      aiEligibleButNotCandidate,
      summaryMissingMainPerson,
      summaryMixedLanguage,
      genericDisplayTitle,
      mixedDisplayTitle,
      mixedChineseEnglishHeadline,
      mixedChineseEnglishSummary,
      duplicatedOriginalTitleDisplay,
      originalTitleHasTradeButGenericHeadline,
      originalTitleHasContractButGenericHeadline,
      originalTitleHasPlayerButSummaryEmpty,
      titleContainsNewline,
      summaryContainsNewline,
      oddsMisclassifiedAsSigning,
      oddsMisclassifiedAsTrade,
      containsFantasyFallout,
      containsTradeGrades,
      containsChampionshipOdds,
      containsPhiladelphiaEnglish,
      contains76人WithoutSpace,
      chineseTeamNameWrongSpace,
      missingSpaceBefore76人,
      missingSpaceAfter76人,
      vagueImpactHeadline,
      mixedLanguageHeadline,
      mixedEnglishSummary,
      untranslatedContractTerm,
      tradeTitleMisclassifiedAsInjury,
      duplicatePlayerTeamTradeEvents,
      duplicateEventKeys,
      highlightsDuplicateEvents,
      tradeMisclassifiedAsSigning,
      signingMisclassifiedAsTrade,
      repeatedSummary,
      mergedMissingTerms
    }
  };
}

function printQualityReport(payload = {}) {
  const report = getQualityReport(payload);
  console.log('News quality check:', JSON.stringify(report.counts, null, 2));

  const issueEntries = Object.entries(report.issues).filter(([, values]) => values.length);
  for (const [name, values] of issueEntries) {
    console.warn(`Quality issue: ${name}`);
    for (const issue of values.slice(0, 10)) {
      if (Array.isArray(issue)) {
        const [field, value, item] = issue;
        console.warn(`- ${field}: ${value} (${item.originalTitle || item.id || item.text || 'unknown'})`);
      } else {
        console.warn(`- ${issue.headlineZh || issue.text || issue.id}: ${issue.originalTitle || toArray(issue.originalTitles).join(' | ')}`);
      }
    }
  }

  return report;
}

async function writePayload(payload) {
  const normalizedPayload = normalizeJsonStrings(preparePayloadForWrite(payload));
  if (normalizedPayload.lastFetchStatus) {
    normalizedPayload.lastFetchStatus = {
      ...normalizedPayload.lastFetchStatus,
      mergedItems: toArray(normalizedPayload.items).length
    };
  }
  printQualityReport(normalizedPayload);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(normalizedPayload, null, 2)}\n`, 'utf8');
  await rename(tempPath, outputPath);
  return normalizedPayload;
}

async function rebuildFromExistingFeed() {
  const existingFeed = await readExistingFeed();
  if (!existingFeed) {
    throw new Error('No existing public/data/news.json file found.');
  }

  const existing = JSON.parse(existingFeed);
  const sourceConfigs = Array.isArray(existing.sources) ? existing.sources : FEEDS;
  const rebuiltItems = await mapWithConcurrency(
    toArray(existing.items),
    6,
    async (item, index) => {
        const title = stripHtml(item.title);
        if (!title) return null;

        const source = item.source?.split(' / ')[0] || 'Unknown';
        const feedConfig = sourceConfigs.find((config) => config.source === source) || { source, feed: item.feed || '' };
        const summary = stripHtml(item.summary);
        const structured = await summarizeArticle({
          title,
          description: summary,
          url: item.link || item.url || '',
          articleText: '',
          source: feedConfig.source
        });
        const category = structured.category || classify(title, summary);

        return {
          ...item,
          id: item.link || item.url || `${title}-${index}`,
          title,
          originalTitle: title,
          headlineZh: structured.headlineZh,
          titleZh: structured.headlineZh,
          url: item.link || item.url || '',
          publishedAt: item.pubDate || item.publishedAt || new Date().toISOString(),
          summary,
          dekZh: structured.dekZh,
          summaryZh: structured.summaryZh,
          oneLineZh: structured.oneLineZh || structured.headlineZh,
          goldenQuoteZh: structured.goldenQuoteZh || '',
          keyPoints: structured.dekZh ? [structured.dekZh] : [],
          source: Array.isArray(item.sources) && item.sources.length ? item.sources.join(' / ') : item.source || feedConfig.source,
          sources: item.sources,
          feed: feedConfig.feed,
          category,
          importance: structured.importance || scoreImportance({ title, summary, category }),
          imageUrl: item.imageUrl || ''
        };
      }
  );
  const items = dedupeAndSort(rebuiltItems.filter(Boolean));

  const payload = {
    sources: sourceConfigs,
    updatedAt: existing.updatedAt || new Date().toISOString(),
    lastFetchStatus: {
      status: 'rebuilt-from-cache',
      checkedAt: new Date().toISOString(),
      updatedAt: existing.updatedAt || '',
      fetchedItems: 0,
      mergedItems: items.length,
      failedFeeds: [],
      message: 'Rebuilt derived news fields from the existing local JSON cache.'
    },
    highlights: buildHighlights(items),
    items
  };

  const writtenPayload = await writePayload(payload);
  console.log(`Rebuilt ${toArray(writtenPayload.items).length} cached stories in ${path.relative(rootDir, outputPath)}`);
}

async function debugAiCandidatesFromCache() {
  const existingFeed = await readExistingFeed();
  if (!existingFeed) {
    throw new Error('No existing public/data/news.json file found.');
  }
  const existing = JSON.parse(existingFeed);
  const cache = await readAiSummaryCache();
  const items = preparePayloadForWrite({ items: toArray(existing.items) }).items;
  const evaluatedEntries = buildAiCandidateEvaluations(items, existing, cache, { log: isGitHubModelsEnabled() });
  const candidates = evaluatedEntries
    .filter((entry) => entry.priority > 0)
    .sort(compareAiCandidateEntries(existing));
  const maxItems = getGithubModelsMaxItems();
  console.log('AI candidate debug summary:', JSON.stringify({
    aiEnabledRequested: isGitHubModelsEnabled(),
    model: getAiModel(),
    maxItems,
    items: items.length,
    aiCandidates: candidates.length,
    aiRequestsIfTokenPresent: Math.min(maxItems, candidates.length),
    aiCacheHits: evaluatedEntries.filter((entry) => entry.hasValidCache).length,
    topCandidates: candidates.slice(0, maxItems).map((entry) => ({
      originalTitle: entry.item.originalTitle || entry.item.title || '',
      storyType: entry.storyType,
      priority: entry.priority,
      failureCount: entry.backlog?.failureCount || 0,
      skippedByLimit: entry.backlog?.skippedByLimit || 0,
      summaryBefore: entry.item.summaryZh || '',
      rejectionReason: entry.rejectionReason || ''
    }))
  }, null, 2));
}

async function backfillAiSummaries() {
  const existingFeed = await readExistingFeed();
  if (!existingFeed) {
    throw new Error('No existing public/data/news.json file found.');
  }

  if (!process.env.GITHUB_MODELS_TOKEN) {
    const existing = JSON.parse(existingFeed);
    const items = preparePayloadForWrite({ items: toArray(existing.items) }).items;
    const missing = items.filter((item) => !hasValidChineseSummary(item)).length;
    console.warn(`AI backfill skipped: GITHUB_MODELS_TOKEN is missing. Missing Chinese summaries: ${missing}.`);
    return;
  }

  const existing = JSON.parse(existingFeed);
  const preparedItems = preparePayloadForWrite({ items: toArray(existing.items) }).items;
  const beforeMissing = preparedItems.filter((item) => !hasValidChineseSummary(item)).length;

  if (beforeMissing === 0) {
    console.log('AI backfill completed:', JSON.stringify({
      requested: 0,
      succeeded: 0,
      failed: 0,
      remaining: 0
    }, null, 2));
    return;
  }

  const aiEnhancement = await applyGitHubModelsEnhancements(preparedItems, existing);
  const finalItems = aiEnhancement.items;
  const remaining = finalItems.filter((item) => !hasValidChineseSummary(item)).length;
  const checkedAt = new Date().toISOString();
  const payload = {
    ...existing,
    updatedAt: existing.updatedAt || '',
    lastFetchStatus: {
      ...(existing.lastFetchStatus || {}),
      status: 'ai-backfill',
      fetchMode: 'backfill-ai',
      checkedAt,
      previousUpdatedAt: existing.updatedAt || '',
      updatedAt: existing.updatedAt || '',
      fetchedItems: 0,
      mergedItems: finalItems.length,
      aiEnabled: aiEnhancement.stats.aiEnabled,
      aiCandidates: aiEnhancement.stats.aiCandidates,
      aiCacheHits: aiEnhancement.stats.aiCacheHits,
      aiRequests: aiEnhancement.stats.aiRequests,
      aiAccepted: aiEnhancement.stats.aiAccepted,
      aiRejected: aiEnhancement.stats.aiRejected,
      aiFailed: aiEnhancement.stats.aiFailed,
      aiRetried: aiEnhancement.stats.aiRetried,
      skippedByLimit: aiEnhancement.stats.skippedByLimit,
      previouslyFailed: aiEnhancement.stats.previouslyFailed,
      remainingAfterRun: remaining,
      aiModel: aiEnhancement.stats.aiModel,
      message: remaining > 0
        ? `AI backfill processed ${aiEnhancement.stats.aiRequests} request(s); ${remaining} item(s) still need later runs.`
        : 'AI backfill completed all eligible missing Chinese summaries.'
    },
    highlights: buildHighlights(finalItems),
    items: finalItems
  };

  await writePayload(payload);
  console.log('AI backfill completed:', JSON.stringify({
    requested: aiEnhancement.stats.aiRequests,
    succeeded: aiEnhancement.stats.aiAccepted + aiEnhancement.stats.aiCacheHits,
    failed: aiEnhancement.stats.aiFailed + aiEnhancement.stats.aiRejected,
    remaining
  }, null, 2));
  if (remaining > 0) {
    console.warn(`AI backfill remaining: ${remaining} item(s) still need follow-up runs.`);
  }
}

async function fetchWithRetry(url, options = {}, retries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  throw lastError;
}

async function fetchFeed(feedUrl) {
  const response = await fetchWithRetry(feedUrl, {
    headers: FETCH_HEADERS
  });

  if (!response.ok) {
    throw new Error(`${feedUrl} request failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function getFeedItems(parsed) {
  return toArray(parsed?.rss?.channel?.item || parsed?.feed?.entry);
}

function getTimestamp(item) {
  const date = new Date(item.pubDate || item.published || item.updated || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getPrimaryPerson(title = '') {
  const patterns = [
    /^(.+?),\s*.+? Agree To/i,
    /^(.+?) leaves .+? for/i,
    /^.+? signing (.+?) to/i,
    /^.+? sign (?:guard\s+)?(.+?) to/i,
    /^(.+?) signs .+? deal with/i,
    /^(.+?) Agrees to Contract Extension/i,
    /^.+? with (?:forward\s+|veteran guard\s+|guard\s+)?(.+?)(?:,| at |$)/i,
    /^(.+?) traded to/i
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1]) return stripSourcePhrases(match[1]).trim();
  }

  return title.match(/[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2}/)?.[0] || '';
}

function getTeamTokens(value = '') {
  const text = localizeCommonTerms(value);
  return Array.from(teamNames.values()).filter((team) => text.includes(team));
}

function getEventTeam(value = '') {
  const text = localizeCommonTerms(value);
  const matches = Array.from(teamNames.values())
    .map((team) => ({ team, index: text.lastIndexOf(team) }))
    .filter((entry) => entry.index >= 0)
    .sort((a, b) => b.index - a.index);
  return matches[0]?.team || '';
}

function getDuplicateKey(item) {
  const person = getPrimaryPerson(item.title).toLowerCase();
  const money = getMoneyTokens(item.titleZh || item.summaryZh || item.title)[0] || '';
  const eventTeam = getEventTeam(`${item.title} ${item.titleZh}`);

  if (person && eventTeam && ['签约', '交易'].includes(item.category)) {
    return [person, eventTeam].join('|');
  }

  if (person && money) {
    return [person, money].join('|');
  }

  return '';
}

const eventTeamAliases = [
  ['Atlanta Hawks', 'hawks'],
  ['Hawks', 'hawks'],
  ['亚特兰大老鹰', 'hawks'],
  ['老鹰', 'hawks'],
  ['Oklahoma City Thunder', 'thunder'],
  ['OKC Thunder', 'thunder'],
  ['Thunder', 'thunder'],
  ['雷霆', 'thunder'],
  ['Dallas', 'mavericks'],
  ['Mavs', 'mavericks'],
  ['76ers', '76ers'],
  ['Sixers', '76ers'],
  ['Philadelphia', '76ers'],
  ['Philadelphia 76ers', '76ers'],
  ['76 人', '76ers'],
  ['费城 76 人', '76ers'],
  ['Celtics', 'celtics'],
  ['Boston Celtics', 'celtics'],
  ['凯尔特人', 'celtics'],
  ['Mavericks', 'mavericks'],
  ['Dallas Mavericks', 'mavericks'],
  ['独行侠', 'mavericks'],
  ['Grizzlies', 'grizzlies'],
  ['Memphis Grizzlies', 'grizzlies'],
  ['灰熊', 'grizzlies'],
  ['Warriors', 'warriors'],
  ['Golden State Warriors', 'warriors'],
  ['勇士', 'warriors'],
  ['Lakers', 'lakers'],
  ['Los Angeles Lakers', 'lakers'],
  ['湖人', 'lakers'],
  ['Jazz', 'jazz'],
  ['Utah Jazz', 'jazz'],
  ['爵士', 'jazz'],
  ['Spurs', 'spurs'],
  ['San Antonio Spurs', 'spurs'],
  ['马刺', 'spurs'],
  ['Pacers', 'pacers'],
  ['Indiana Pacers', 'pacers'],
  ['步行者', 'pacers'],
  ['Suns', 'suns'],
  ['Phoenix Suns', 'suns'],
  ['太阳', 'suns'],
  ['Nets', 'nets'],
  ['Brooklyn Nets', 'nets'],
  ['篮网', 'nets'],
  ['Heat', 'heat'],
  ['Miami Heat', 'heat'],
  ['热火', 'heat'],
  ['Cavaliers', 'cavaliers'],
  ['Cavs', 'cavaliers'],
  ['Cleveland Cavaliers', 'cavaliers'],
  ['骑士', 'cavaliers']
];

function slugText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getEventTeams(value = '') {
  const text = String(value);
  const found = [];
  for (const [label, slug] of eventTeamAliases) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = /[\u4e00-\u9fa5]/.test(label)
      ? new RegExp(escaped, 'i')
      : new RegExp(`\\b${escaped}\\b`, 'i');
    if (pattern.test(text) && !found.includes(slug)) found.push(slug);
  }
  return found;
}

function getEventPlayer(value = '') {
  const text = String(value);
  const knownPlayers = [
    ...playerNameZh.keys(),
    'Jaylen Brown',
    'Santi Aldama',
    'Walker Kessler',
    'LeBron James',
    'Paul George',
    'Tobias Harris',
    'Dean Wade',
    'Luke Kennard',
    'Keon Ellis',
    'Tim Hardaway Jr.',
    'Meleek Thomas',
    'Kelly Oubre',
    'Ariel Hukporti',
    'Collin Sexton',
    'Quentin Grimes'
  ];
  const known = knownPlayers.find((player) => new RegExp(`\\b${player.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text));
  if (known) return slugText(known);

  const candidate = text
    .replace(/\b(?:NBA|Yahoo Sports|RealGM|AP|Fantasy Fallout|Trade Grades|Championship Odds)\b/g, '')
    .match(/\b[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,2}\b/)?.[0];
  return candidate ? slugText(candidate.replace(/\s+Not$/i, '')) : '';
}

function getEventAction(value = '', category = '') {
  const text = String(value).toLowerCase();
  const titleText = text.split(' || ')[0] || text;
  if (/\b(acquire|acquired|traded|trade|trading|lands? in deal|land .+ in deal|for aj johnson|deal with grizzlies|for .*picks?)\b/.test(titleText)) return 'trade';
  if (/\b(reach out to|shows interest in|in free agency)\b/.test(titleText)) return 'sign';
  if (/\b(odds|championship odds)\b/.test(text)) return 'odds';
  if (/\b(fantasy|fantasy fallout)\b/.test(text)) return 'fantasy';
  if (/\b(grades|grade)\b/.test(text)) return 'grades';
  if (/\b(meeting|meet with|second meeting)\b/.test(text)) return 'meeting';
  if (/\b(acquire|acquired|traded|trade|trading|lands? in deal)\b/.test(text)) return 'trade';
  if (/\b(injury update|injury news|injured|injury|surgery|rehab|out|return|missed game)\b/.test(titleText)) return 'injury';
  if (/\b(sign|signed|signing|agrees? to|contract|extension|re-sign)\b/.test(text)) return 'sign';
  return category === '交易' ? 'trade' : category === '签约' ? 'sign' : '';
}

function correctCategory(item = {}) {
  const text = `${item.originalTitle || item.title || ''} ${item.summary || ''} ${item.headlineZh || ''} ${item.summaryZh || ''}`;
  const titleText = `${item.originalTitle || item.title || ''} ${item.headlineZh || ''}`;
  if (isOddsArticle(item.originalTitle || item.title || '', item.displayTitle || '', item.summaryZh || '', item.summary || '', item.headlineZh || '')) {
    return '\u5176\u4ed6';
  }
  const hasTitleSigning = /\b(signs?|signed|signing|contract|extension|re-sign|agrees? to .+?(?:deal|contract)|guarantee|multi[-\s]+year contract|(?:one|two|three|four|five|\d+)[-\s]+year,?\s*\$\d+(?:\.\d+)?m deal)\b|签下|续约|合同|达成.+合同/i.test(titleText);
  const hasTitleTrade = /\b(acquire|acquired|traded|trade|trading|lands? in deal|sent to|for .*picks?)\b|送出|换回|交易至|得到.+送出/i.test(titleText);
  const hasTrade = /\b(acquire|acquired|traded|trade|trading|lands? in deal|sent to)\b|送出|换回|交易至|得到.+送出|首轮签|次轮签/i.test(text);
  const hasSigning = /\b(sign|signed|signing|contract|extension|re-sign|agrees? to .+ deal|guarantee|multi[-\s]+year contract)\b|签下|续约|合同|达成.+合同/i.test(text);
  if (hasTitleSigning && !hasTitleTrade) return '签约';
  if (hasTrade) return '交易';
  if (hasSigning) return '签约';
  return item.category || classify(item.originalTitle || item.title || '', item.summary || '');
}

function normalizeEventAction(action, value = '') {
  if (['odds', 'fantasy', 'grades'].includes(action) && /\b(trade|traded|acquire|acquired)\b/i.test(value)) {
    return 'trade';
  }
  return action;
}

function getEventKey(item = {}) {
  const text = `${item.originalTitle || item.title || ''} || ${item.headlineZh || ''} ${item.summaryZh || ''} ${item.summary || ''}`;
  const titleOnly = item.originalTitle || item.title || '';
  const normalizedText = text.toLowerCase();
  if (
    (
      /\b(?:three-team trade|three-team deal|3-team trade|3-team deal)\b/.test(normalizedText) &&
      /\b(?:lu dort|luguentz dort|zaccharie risacher|ryan nembhard|dort|risacher)\b/.test(normalizedText)
    ) ||
    (
      /\b(?:lu dort|luguentz dort|dort)\b/.test(normalizedText) &&
      /\btrade\b/.test(normalizedText) &&
      /\b(?:hawks|atlanta|thunder|okc|oklahoma city)\b/.test(normalizedText)
    ) ||
    (
      /\b(?:risacher|dort|ryan nembhard)\b/.test(normalizedText) &&
      /\b(?:traded|trade|receive|acquire|acquired)\b/.test(normalizedText) &&
      /\b(?:hawks|atlanta)\b/.test(normalizedText) &&
      /\b(?:mavs|mavericks|dallas)\b/.test(normalizedText)
    )
  ) {
    return 'trade:lu-dort:hawks:thunder:mavericks';
  }

  const explicitAgreeDeal = titleOnly.match(/^(.+?),\s*(.+?) Agree To ((?:One|Two|Three|Four|Five|Six|\d+)-Year),\s*(\$\d+(?:\.\d+)?M) (?:Deal|Contract)$/i);
  if (explicitAgreeDeal) {
    const terms = getContractTermsFromText(`${explicitAgreeDeal[3]} ${explicitAgreeDeal[4]}`);
    return [
      'sign',
      slugText(explicitAgreeDeal[1]),
      slugText(explicitAgreeDeal[2]),
      terms.duration ? terms.duration.replace(/\D/g, '') : '',
      terms.amount ? terms.amount.replace(/\D/g, '') : ''
    ].filter(Boolean).join(':');
  }

  const action = normalizeEventAction(getEventAction(text, item.category), text);
  const player = getEventPlayer(text);
  const teams = getEventTeams(text);
  const terms = getContractTermsFromText(text);

  if (!action || !player) return '';

  if (action === 'trade') {
    if (player === 'jaylen-brown' && (teams.includes('celtics') || teams.includes('76ers'))) {
      return 'trade:jaylen-brown:celtics:76ers';
    }
    if (player === 'santi-aldama' && (teams.includes('mavericks') || teams.includes('grizzlies'))) {
      return 'trade:santi-aldama:mavericks:grizzlies';
    }
    if (player === 'walker-kessler' && teams.includes('lakers')) {
      return 'trade:walker-kessler:jazz:lakers';
    }
    return ['trade', player, ...teams.slice(0, 2)].filter(Boolean).join(':');
  }

  if (action === 'sign') {
    if (player === 'lebron-james' && /nuggets reach out to lebron james/i.test(text)) {
      return 'sign:lebron-james:nuggets';
    }
    if (player === 'walker-kessler' && teams.includes('lakers')) {
      return 'trade:walker-kessler:jazz:lakers';
    }
    const signTeam = teams.at(-1) || '';
    return ['sign', player, signTeam, terms.duration || '', terms.amount || ''].filter(Boolean).map(slugText).join(':');
  }

  return [action, player, teams[0] || ''].filter(Boolean).join(':');
}

function getRelatedAngle(item = {}) {
  const text = `${item.originalTitle || ''} ${item.title || ''} ${item.summary || ''}`.toLowerCase();
  if (/fantasy/.test(text)) return 'fantasy';
  if (/odds/.test(text)) return 'odds';
  if (/grades?/.test(text)) return 'grades';
  if (/rumou?r/.test(text)) return 'rumor';
  if (/report|reported|source/.test(text)) return 'report';
  if (/analysis|fallout|effect|impact|reacts|make sense/.test(text)) return 'analysis';
  return 'source';
}

function hasConcreteStructure(item = {}) {
  const text = `${item.originalTitle || ''} ${item.headlineZh || ''} ${item.summaryZh || ''}`;
  return /(acquire|acquired|trade|traded|from .* for|送出|换回|得到|签下|达成|万美元|首轮签|次轮签)/i.test(text);
}

function pickEventPrimary(group = []) {
  return [...group].sort((a, b) => {
    const realGmDelta = Number(/RealGM/i.test(b.source || '')) - Number(/RealGM/i.test(a.source || ''));
    if (realGmDelta) return realGmDelta;
    const structureDelta = Number(hasConcreteStructure(b)) - Number(hasConcreteStructure(a));
    if (structureDelta) return structureDelta;
    const summaryDelta = (b.summaryZh || '').length - (a.summaryZh || '').length;
    if (summaryDelta) return summaryDelta;
    const importanceDelta = (b.importance || 0) - (a.importance || 0);
    if (importanceDelta) return importanceDelta;
    return new Date(b.publishedAt || b.pubDate || 0).getTime() - new Date(a.publishedAt || a.pubDate || 0).getTime();
  })[0];
}

function mergeEventGroup(group = []) {
  if (group.length === 1) {
    return { ...group[0], eventKey: group[0].eventKey || getEventKey(group[0]), relatedItems: group[0].relatedItems || [] };
  }

  const primaryBase = pickEventPrimary(group);
  const primary = { ...primaryBase };
  const relatedItems = group
    .filter((item) => item !== primaryBase)
    .sort((a, b) => new Date(b.publishedAt || b.pubDate || 0).getTime() - new Date(a.publishedAt || a.pubDate || 0).getTime())
    .map((item) => ({
      title: item.title || '',
      originalTitle: item.originalTitle || item.title || '',
      source: item.source || '',
      url: item.url || item.link || '',
      publishedAt: item.publishedAt || item.pubDate || '',
      angle: getRelatedAngle(item)
    }));

  const sources = [...new Set(group.flatMap((item) => item.sources || String(item.source || '').split(' / ')).map((source) => source.trim()).filter(Boolean))];
  primary.eventKey = primary.eventKey || getEventKey(primary);
  primary.relatedItems = [...(primary.relatedItems || []), ...relatedItems];
  primary.source = sources.join(' / ');
  primary.sources = sources;
  primary.originalTitles = [...new Set(group.flatMap((item) => item.originalTitles || [item.originalTitle || item.title]).filter(Boolean))];
  primary.sourceLinks = group.map((item) => ({ source: item.source, link: item.url || item.link }));
  primary.isMerged = true;
  primary.importance = Math.max(...group.map((item) => item.importance || 1));
  return primary;
}

function mergeEvents(items = []) {
  const groups = new Map();
  const singles = [];

  for (const item of items) {
    const eventKey = item.eventKey || getEventKey(item);
    if (!eventKey) {
      singles.push(item);
      continue;
    }
    const withKey = { ...item, eventKey };
    if (!groups.has(eventKey)) groups.set(eventKey, []);
    groups.get(eventKey).push(withKey);
  }

  return [...singles, ...Array.from(groups.values()).map(mergeEventGroup)]
    .sort((a, b) => new Date(b.publishedAt || b.pubDate || 0).getTime() - new Date(a.publishedAt || a.pubDate || 0).getTime())
    .slice(0, 120);
}

function mergeDuplicateGroup(group) {
  if (group.length === 1) return group[0];

  const sorted = [...group].sort((a, b) => {
    const imageDelta = Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl));
    if (imageDelta) return imageDelta;
    return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
  });
  const primary = { ...sorted[0] };
  const sources = [
    ...new Set(
      sorted
        .flatMap((item) => item.sources || String(item.source || '').split(' / '))
        .map((source) => source.trim())
        .filter(Boolean)
    )
  ];

  primary.source = sources.join(' / ');
  primary.sources = sources;
  primary.sourceLinks = sorted.map((item) => ({ source: item.source, link: item.url || item.link }));
  primary.originalTitles = sorted.map((item) => item.originalTitle || item.title);
  primary.isMerged = true;
  primary.importance = Math.max(...sorted.map((item) => item.importance || 1), scoreImportance(primary));

  const detailItem = sorted
    .filter((item) => item.summaryZh)
    .sort((a, b) => b.summaryZh.length - a.summaryZh.length)[0];
  if (detailItem && detailItem.summaryZh.length > primary.summaryZh.length) {
    primary.summaryZh = detailItem.summaryZh;
    primary.keyPoints = detailItem.keyPoints;
    primary.dekZh = detailItem.dekZh;
    primary.goldenQuoteZh = detailItem.goldenQuoteZh;
  }

  return primary;
}

function dedupeAndSort(items) {
  const exactSeen = new Set();
  const groups = new Map();
  const singles = [];

  for (const item of items) {
    const exactKey = item.link || `${item.source}:${item.title.toLowerCase()}`;
    if (exactSeen.has(exactKey)) continue;
    exactSeen.add(exactKey);

    const duplicateKey = getDuplicateKey(item);
    if (!duplicateKey) {
      singles.push(item);
      continue;
    }

    if (!groups.has(duplicateKey)) groups.set(duplicateKey, []);
    groups.get(duplicateKey).push(item);
  }

  return mergeEvents([...singles, ...Array.from(groups.values()).map(mergeDuplicateGroup)])
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 120);
}

function scoreHighlight(item) {
  const text = `${item.title} ${item.titleZh} ${item.summary}`.toLowerCase();
  let score = item.importance || 0;
  if (['签约', '交易', '伤病', '选秀'].includes(item.category)) score += 5;
  if (/(lebron|kawhi|harden|doncic|brown|lakers|warriors|celtics|suns|nets|sixers|bucks|heat|cavaliers)/i.test(text)) score += 3;
  if (/(free agency|trade|sign|deal|contract|extension|injury|draft|target|rumor|pursuit|acquire)/i.test(text)) score += 3;
  if (getMoneyTokens(`${item.titleZh} ${item.summaryZh}`).length) score += 2;
  if (item.isMerged) score += 2;
  return score;
}

function toHighlightText(item) {
  return normalizeSpacing((item.oneLineZh || item.headlineZh || '').replace(/^NBA动态：/, '').replace(/^签约动态：/, '').replace(/^交易动态：/, ''));
}

function getHighlightDedupeKey(item = {}) {
  if (item.eventKey) return item.eventKey;

  const sourceText = [
    item.originalTitle,
    item.title,
    item.headlineZh,
    item.oneLineZh,
    item.summaryZh,
    item.summary
  ].filter(Boolean).join(' ');
  const action = normalizeEventAction(getEventAction(`${item.originalTitle || item.title || ''} || ${sourceText}`, item.category), sourceText);
  const player = getEventPlayer(sourceText);
  const teams = getEventTeams(sourceText).slice(0, 2);

  if (action && player) return [action, player, ...teams].filter(Boolean).join(':');
  if (player) return `player:${player}`;

  return slugText(toHighlightText(item) || item.originalTitle || item.title || item.id || '');
}

function buildHighlights(items) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const seen = new Set();
  const highlights = [];

  for (const { item } of [...items]
    .map((item) => ({ item, score: scoreHighlight(item) }))
    .sort((a, b) => b.score - a.score || new Date(b.item.pubDate).getTime() - new Date(a.item.pubDate).getTime())
    .filter(({ item }) => {
      const publishedAt = new Date(item.publishedAt || item.pubDate || '').getTime();
      return Number.isFinite(publishedAt) &&
        publishedAt >= cutoff &&
        isHighQualityChineseHeadline(item, toHighlightText(item));
    })) {
    const key = getHighlightDedupeKey(item);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    highlights.push({
      id: item.id,
      text: toHighlightText(item),
      category: item.category,
      source: item.source,
      link: item.link
    });
    if (highlights.length >= 5) break;
  }

  return highlights;
}

async function main() {
  if (process.argv.includes('--self-test')) {
    await runSelfTests();
    return;
  }

  if (process.argv.includes('--debug-ai-candidates-from-cache')) {
    await debugAiCandidatesFromCache();
    return;
  }

  if (process.argv.includes('--backfill-ai')) {
    await backfillAiSummaries();
    return;
  }

  if (process.argv.includes('--from-cache')) {
    await rebuildFromExistingFeed();
    return;
  }

  const existingFeed = await readExistingFeed();

  try {
    const feedResults = await Promise.all(
      FEEDS.map(async (feedConfig) => {
        try {
          const xml = await fetchFeed(feedConfig.feed);
          const parsed = parser.parse(xml);
          const rawItems = getFeedItems(parsed);

          if (!rawItems.length) {
            throw new Error(`${feedConfig.source} RSS did not contain any items.`);
          }

          const items = await mapWithConcurrency(rawItems, 4, (item, index) => normalizeItem(item, index, feedConfig));
          return { feedConfig, items: items.filter((item) => item?.title && item?.link), error: null };
        } catch (error) {
          return { feedConfig, items: [], error };
        }
      })
    );

    const failedFeeds = feedResults.filter((result) => result.error);
    const successfulFeeds = feedResults
      .filter((result) => !result.error && result.items.length)
      .map((result) => ({
        source: result.feedConfig.source,
        feed: result.feedConfig.feed,
        items: result.items.length
      }));
    const fetchedItems = feedResults.reduce((total, result) => total + result.items.length, 0);
    for (const result of failedFeeds) {
      console.error(`${result.feedConfig.source} fetch failed: ${result.error instanceof Error ? result.error.message : result.error}`);
    }
    for (const result of feedResults.filter((entry) => !entry.error)) {
      console.log(`${result.feedConfig.source} fetched ${result.items.length} usable RSS items.`);
    }

    const items = dedupeAndSort(feedResults.flatMap((result) => result.items));
    const existingPayloadForAi = parseExistingPayload(existingFeed);

    if (!items.length || fetchedItems === 0 || !successfulFeeds.length) {
      const existingPayload = parseExistingPayload(existingFeed);
      if (existingPayload === null) {
        throw new Error('No RSS items were fetched from any source.');
      }

      const checkedAt = new Date().toISOString();
      const previousUpdatedAt = existingPayload.updatedAt || '';
      const failedFeedDetails = failedFeeds.map((result) => ({
        source: result.feedConfig.source,
        feed: result.feedConfig.feed,
        error: result.error instanceof Error ? result.error.message : String(result.error),
        cause: result.error?.cause ? String(result.error.cause) : undefined
      }));
      const payload = {
        ...existingPayload,
        updatedAt: existingPayload.updatedAt || '',
        lastFetchStatus: {
          status: 'fetch-failed',
          fetchMode: 'fresh',
          checkedAt,
          previousUpdatedAt,
          updatedAt: previousUpdatedAt,
          message: 'All RSS feeds failed or returned no usable items. Kept existing news items.',
          fetchedItems: 0,
          mergedItems: toArray(existingPayload.items).length,
          successfulFeeds,
          failedFeeds: failedFeedDetails,
          newestPublishedAt: getLatestPublishedAt(existingPayload.items),
          dataAgeHours: getAgeHours(previousUpdatedAt, new Date(checkedAt)),
          aiEnabled: isGitHubModelsEnabled(),
          aiCandidates: 0,
          aiRequests: 0,
          aiAccepted: 0,
          aiRejected: 0,
          aiFailed: 0,
          aiModel: getAiModel()
        }
      };

      const writtenPayload = await writePayload(payload);
      logFetchDiagnostics(writtenPayload.lastFetchStatus);
      console.error(`No RSS items were fetched. Kept ${toArray(writtenPayload.items).length} existing news items and wrote per-feed failure details.`);
      process.exitCode = 1;
      return;
    }

    const preparedItems = preparePayloadForWrite({ items }, { stripArticleText: false }).items;
    const aiEnhancement = await applyGitHubModelsEnhancements(preparedItems, existingPayloadForAi);
    const finalItems = aiEnhancement.items;
    const updatedAt = new Date().toISOString();
    const previousUpdatedAt = existingPayloadForAi?.updatedAt || '';
    const newestPublishedAt = getLatestPublishedAt(finalItems);
    const dataAgeHours = getAgeHours(newestPublishedAt, new Date(updatedAt));
    const failedFeedDetails = failedFeeds.map((result) => ({
      source: result.feedConfig.source,
      feed: result.feedConfig.feed,
      error: result.error instanceof Error ? result.error.message : String(result.error)
    }));
    const payload = {
      sources: FEEDS,
      updatedAt,
      lastFetchStatus: {
        status: failedFeeds.length ? 'partial-success' : 'success',
        fetchMode: 'fresh',
        checkedAt: updatedAt,
        previousUpdatedAt,
        updatedAt,
        fetchedItems,
        mergedItems: finalItems.length,
        successfulFeeds,
        failedFeeds: failedFeedDetails,
        newestPublishedAt,
        dataAgeHours,
        aiEnabled: aiEnhancement.stats.aiEnabled,
        aiCandidates: aiEnhancement.stats.aiCandidates,
        aiCacheHits: aiEnhancement.stats.aiCacheHits,
        aiRequests: aiEnhancement.stats.aiRequests,
        aiAccepted: aiEnhancement.stats.aiAccepted,
        aiRejected: aiEnhancement.stats.aiRejected,
        aiFailed: aiEnhancement.stats.aiFailed,
        aiRetried: aiEnhancement.stats.aiRetried,
        rejectedAsNonChinese: aiEnhancement.stats.rejectedAsNonChinese,
        skippedByLimit: aiEnhancement.stats.skippedByLimit,
        finalItemsWithChineseSummary: aiEnhancement.stats.finalItemsWithChineseSummary,
        finalItemsWithoutChineseSummary: aiEnhancement.stats.finalItemsWithoutChineseSummary,
        totalNewsItems: aiEnhancement.stats.totalNewsItems,
        itemsWithValidChineseSummary: aiEnhancement.stats.itemsWithValidChineseSummary,
        itemsMissingChineseSummary: aiEnhancement.stats.itemsMissingChineseSummary,
        eligibleBacklog: aiEnhancement.stats.eligibleBacklog,
        selectedThisRun: aiEnhancement.stats.selectedThisRun,
        previouslyFailed: aiEnhancement.stats.previouslyFailed,
        remainingAfterRun: aiEnhancement.stats.remainingAfterRun,
        rejectedLowConfidenceBelow50: aiEnhancement.stats.rejectedLowConfidenceBelow50,
        acceptedMediumConfidence: aiEnhancement.stats.acceptedMediumConfidence,
        acceptedHighConfidence: aiEnhancement.stats.acceptedHighConfidence,
        averageAiConfidence: aiEnhancement.stats.averageAiConfidence,
        minAcceptedConfidence: aiEnhancement.stats.minAcceptedConfidence,
        maxAcceptedConfidence: aiEnhancement.stats.maxAcceptedConfidence,
        aiLogicError: aiEnhancement.stats.aiLogicError,
        aiModel: aiEnhancement.stats.aiModel,
        message: failedFeeds.length
          ? `Fetched ${fetchedItems} usable RSS items with ${failedFeeds.length} failed feed(s).`
          : `Fetched ${fetchedItems} usable RSS items from all feeds.`
      },
      highlights: buildHighlights(finalItems),
      items: finalItems
    };

    const writtenPayload = await writePayload(payload);
    logFetchDiagnostics(writtenPayload.lastFetchStatus);
    if (!newestPublishedAt || dataAgeHours === null || dataAgeHours > 24) {
      console.warn(`Fresh fetch succeeded, but newest publishedAt appears stale: ${newestPublishedAt || 'unknown'} (${dataAgeHours ?? 'unknown'} hours old).`);
    }
    console.log(`Wrote ${toArray(writtenPayload.items).length} stories to ${path.relative(rootDir, outputPath)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    const existingPayload = parseExistingPayload(existingFeed);
    if (existingPayload === null) {
      process.exitCode = 1;
      return;
    }

    const checkedAt = new Date().toISOString();
    const previousUpdatedAt = existingPayload.updatedAt || '';
    const payload = {
      ...existingPayload,
      updatedAt: previousUpdatedAt,
      lastFetchStatus: {
        status: 'fetch-failed',
        fetchMode: 'fresh',
        checkedAt,
        previousUpdatedAt,
        updatedAt: previousUpdatedAt,
        message: 'RSS fetch failed. Kept existing news items and updated fetch status.',
        fetchedItems: 0,
        mergedItems: toArray(existingPayload.items).length,
        successfulFeeds: [],
        failedFeeds: FEEDS.map((feedConfig) => ({
          source: feedConfig.source,
          feed: feedConfig.feed,
          error: error instanceof Error ? error.message : String(error)
        })),
        newestPublishedAt: getLatestPublishedAt(existingPayload.items),
        dataAgeHours: getAgeHours(previousUpdatedAt, new Date(checkedAt)),
        aiEnabled: isGitHubModelsEnabled(),
        aiCandidates: 0,
        aiRequests: 0,
        aiAccepted: 0,
        aiRejected: 0,
        aiFailed: 0,
        aiModel: getAiModel()
      }
    };

    const writtenPayload = await writePayload(payload);
    logFetchDiagnostics(writtenPayload.lastFetchStatus);
    console.error(`Fetch failed. Kept ${toArray(writtenPayload.items).length} existing news items and wrote lastFetchStatus to public/data/news.json.`);
    process.exitCode = 1;
  }
}

async function runSelfTests() {
  const originalMaxItems = process.env.GITHUB_MODELS_MAX_ITEMS;
  const assertions = [];
  const assert = (condition, message) => {
    assertions.push({ ok: Boolean(condition), message });
  };

  assert(!isPredominantlyChinese('Dybantsa finished the night with 27 points, Peterson 24.'), 'pure English summary is rejected');
  assert(isPredominantlyChinese('湖人与 LeBron James 的续约谈判仍在进行，球队希望保留阵容弹性。'), 'Chinese body with English player name is accepted');
  assert(!isSafeChineseSummary('This is a full English sentence pretending to be Chinese summary.'), 'English summary cannot pass safe Chinese summary');
  assert(!validateAiSummary({ originalTitle: 'Test title', summary: 'Input summary' }, { summaryZh: '', oneLineZh: '', confidence: 0.45, storyType: 'fact' }).accepted, 'empty AI summary is rejected');
  assert(!validateAiSummary({ originalTitle: 'Test title', summary: 'Input summary' }, { summaryZh: '```json 根据提供的信息，湖人仍在评估阵容。```', oneLineZh: '湖人评估阵容。', confidence: 0.8, storyType: 'fact' }).accepted, 'model meta text is rejected');
  const longValidation = validateAiSummary({ originalTitle: 'Test title', summary: 'Input summary' }, { summaryZh: '湖人继续评估阵容，'.repeat(40), oneLineZh: '湖人继续评估阵容。', confidence: 0.8, storyType: 'fact' });
  assert(!longValidation.accepted || getChineseLength(longValidation.value?.summaryZh || '') <= 240, 'overlong AI summary is rejected or safely compacted');
  assert(!validateAiSummary({ originalTitle: 'Test title', summary: 'Input summary' }, 'not-json').accepted, 'invalid AI result shape is rejected');

  const sourceHash = 'source-hash';
  assert(!hasValidAiSummaryCache({ summaryZh: '湖人继续评估阵容。', oneLineZh: '湖人评估阵容。', sourceHash, promptVersion: 'summary-v2' }, sourceHash), 'old prompt cache is invalidated');
  assert(hasValidAiSummaryCache({ summaryZh: '湖人继续评估阵容。', oneLineZh: '湖人评估阵容。', sourceHash, promptVersion: aiPromptVersion }, sourceHash), 'valid v3 cache can be reused');

  process.env.GITHUB_MODELS_MAX_ITEMS = '20';
  assert(getGithubModelsMaxItems() === 20, 'GITHUB_MODELS_MAX_ITEMS=20 is not clamped to 5');
  process.env.GITHUB_MODELS_MAX_ITEMS = '99';
  assert(getGithubModelsMaxItems() === 30, 'GITHUB_MODELS_MAX_ITEMS has safe cap 30');
  delete process.env.GITHUB_MODELS_MAX_ITEMS;
  assert(getGithubModelsMaxItems() === 5, 'free-cost default AI batch size is 5');
  if (originalMaxItems === undefined) {
    delete process.env.GITHUB_MODELS_MAX_ITEMS;
  } else {
    process.env.GITHUB_MODELS_MAX_ITEMS = originalMaxItems;
  }

  const frontend = await readFile(path.join(rootDir, 'src', 'main.js'), 'utf8');
  assert(!/item\.summaryZh\s*\|\|\s*item\.summary/.test(frontend), 'frontend does not fallback from summaryZh to English summary');

  const makeMockItem = (index, extra = {}) => ({
    id: `mock-${index}`,
    title: `Mock Trade ${index}`,
    originalTitle: `Mock Player ${index} Traded To Lakers`,
    summary: `Mock Player ${index} was traded to the Lakers.`,
    source: 'Mock',
    category: '交易',
    importance: index % 3 === 0 ? 4 : 2,
    publishedAt: new Date(Date.now() - index * 60 * 1000).toISOString(),
    ...extra
  });
  const selectMockCandidates = (items, cache, maxItems = 20) => {
    const previous = process.env.GITHUB_MODELS_MAX_ITEMS;
    process.env.GITHUB_MODELS_MAX_ITEMS = String(maxItems);
    const evaluated = buildAiCandidateEvaluations(items, { items: [] }, cache)
      .filter((entry) => entry.priority > 0)
      .sort(compareAiCandidateEntries({ items: [] }));
    const selected = evaluated.slice(0, getGithubModelsMaxItems());
    if (previous === undefined) delete process.env.GITHUB_MODELS_MAX_ITEMS;
    else process.env.GITHUB_MODELS_MAX_ITEMS = previous;
    return { evaluated, selected };
  };
  const coverCache = { version: 2, promptVersion: aiPromptVersion, entries: {}, backlog: {} };
  const coverItems = Array.from({ length: 58 }, (_, index) => makeMockItem(index));
  const roundResults = [];
  for (let round = 0; round < 3; round += 1) {
    const { evaluated, selected } = selectMockCandidates(coverItems, coverCache, 20);
    evaluated.slice(20).forEach((entry) => markBacklogSkipped(coverCache, entry, 'limit'));
    selected.forEach((entry) => {
      coverCache.entries[entry.cacheKey] = {
        summaryZh: '湖人完成一笔模拟交易，球队继续调整阵容。',
        oneLineZh: '湖人完成模拟交易。',
        confidence: 0.9,
        storyType: 'trade',
        sourceHash: entry.sourceHash,
        promptVersion: aiPromptVersion
      };
      clearBacklogState(coverCache, entry.cacheKey);
    });
    const remaining = buildAiCandidateEvaluations(coverItems, { items: [] }, coverCache).filter((entry) => entry.priority > 0).length;
    roundResults.push({ selected: selected.length, remaining });
  }
  assert(roundResults[0].selected === 20 && roundResults[0].remaining === 38, 'round 1 selects 20 and leaves 38');
  assert(roundResults[1].selected === 20 && roundResults[1].remaining === 18, 'round 2 selects 20 and leaves 18');
  assert(roundResults[2].selected === 18 && roundResults[2].remaining === 0, 'round 3 selects 18 and clears backlog');

  const starvationCache = { version: 2, promptVersion: aiPromptVersion, entries: {}, backlog: {} };
  const oldItems = Array.from({ length: 35 }, (_, index) => makeMockItem(index + 100, {
    publishedAt: new Date(Date.now() - 48 * 36e5 - index * 1000).toISOString()
  }));
  const firstOldSelection = selectMockCandidates(oldItems, starvationCache, 20);
  firstOldSelection.evaluated.slice(20).forEach((entry) => markBacklogSkipped(starvationCache, entry, 'limit'));
  firstOldSelection.selected.forEach((entry) => {
    starvationCache.entries[entry.cacheKey] = {
      summaryZh: '湖人完成一笔模拟交易，球队继续调整阵容。',
      oneLineZh: '湖人完成模拟交易。',
      confidence: 0.9,
      storyType: 'trade',
      sourceHash: entry.sourceHash,
      promptVersion: aiPromptVersion
    };
  });
  const mixedItems = [
    ...Array.from({ length: 5 }, (_, index) => makeMockItem(index + 200, { importance: 5 })),
    ...oldItems
  ];
  const secondMixedSelection = selectMockCandidates(mixedItems, starvationCache, 20).selected;
  const selectedOldBacklog = secondMixedSelection.filter((entry) => (entry.backlog?.skippedByLimit || 0) > 0).length;
  assert(selectedOldBacklog > 0, 'new items do not starve skipped old backlog');

  const failureCache = { version: 2, promptVersion: aiPromptVersion, entries: {}, backlog: {} };
  const failureItems = Array.from({ length: 8 }, (_, index) => makeMockItem(index + 300));
  const failedFirst = selectMockCandidates(failureItems, failureCache, 8).selected[0];
  markBacklogFailure(failureCache, failedFirst, 'invalid-json');
  const afterFailure = selectMockCandidates(failureItems, failureCache, 5).selected;
  assert(!afterFailure.some((entry) => entry.cacheKey === failedFirst.cacheKey) && afterFailure.length === 5, 'failed cooling item does not block other candidates');

  const workflow = await readFile(path.join(rootDir, '.github', 'workflows', 'update-news.yml'), 'utf8');
  assert(/backfill_ai/.test(workflow) && /npm run backfill-ai/.test(workflow), '--backfill-ai workflow entry exists');
  assert(/backfill_ai \|\| 'false'/.test(workflow), 'backfill_ai=false does not enter backfill mode by default');
  assert(/GITHUB_MODELS_TOKEN/.test(workflow) && /models: read/.test(workflow), 'workflow passes token and models permission');

  const failed = assertions.filter((entry) => !entry.ok);
  if (failed.length) {
    failed.forEach((entry) => console.error(`Self-test failed: ${entry.message}`));
    process.exitCode = 1;
    return;
  }

  console.log('Backfill simulation:', JSON.stringify({
    round1: roundResults[0],
    round2: roundResults[1],
    round3: roundResults[2]
  }, null, 2));
  console.log(`Content quality self-test passed (${assertions.length} checks).`);
}

main();
