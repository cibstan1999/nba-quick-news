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

const NEWS_KEY = 'news.json';
const SOURCE_CACHE_PREFIX = 'ai-summary:';
const DEFAULT_AI_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
const DEFAULT_SUMMARY_CACHE_VERSION = 'cf-summary-v3-qwen3';

const TEAM_ZH = new Map([
  ['Atlanta Hawks', '老鹰'],
  ['Hawks', '老鹰'],
  ['Boston Celtics', '凯尔特人'],
  ['Celtics', '凯尔特人'],
  ['Brooklyn Nets', '篮网'],
  ['Nets', '篮网'],
  ['Charlotte Hornets', '黄蜂'],
  ['Hornets', '黄蜂'],
  ['Chicago Bulls', '公牛'],
  ['Bulls', '公牛'],
  ['Cleveland Cavaliers', '骑士'],
  ['Cavaliers', '骑士'],
  ['Dallas Mavericks', '独行侠'],
  ['Mavericks', '独行侠'],
  ['Denver Nuggets', '掘金'],
  ['Nuggets', '掘金'],
  ['Detroit Pistons', '活塞'],
  ['Pistons', '活塞'],
  ['Golden State Warriors', '勇士'],
  ['Warriors', '勇士'],
  ['Houston Rockets', '火箭'],
  ['Rockets', '火箭'],
  ['Indiana Pacers', '步行者'],
  ['Pacers', '步行者'],
  ['LA Clippers', '快船'],
  ['Los Angeles Clippers', '快船'],
  ['Clippers', '快船'],
  ['Los Angeles Lakers', '湖人'],
  ['Lakers', '湖人'],
  ['Memphis Grizzlies', '灰熊'],
  ['Grizzlies', '灰熊'],
  ['Miami Heat', '热火'],
  ['Heat', '热火'],
  ['Milwaukee Bucks', '雄鹿'],
  ['Bucks', '雄鹿'],
  ['Minnesota Timberwolves', '森林狼'],
  ['Timberwolves', '森林狼'],
  ['New Orleans Pelicans', '鹈鹕'],
  ['Pelicans', '鹈鹕'],
  ['New York Knicks', '尼克斯'],
  ['Knicks', '尼克斯'],
  ['Oklahoma City Thunder', '雷霆'],
  ['Thunder', '雷霆'],
  ['Orlando Magic', '魔术'],
  ['Magic', '魔术'],
  ['Philadelphia 76ers', '76 人'],
  ['76ers', '76 人'],
  ['Phoenix Suns', '太阳'],
  ['Suns', '太阳'],
  ['Portland Trail Blazers', '开拓者'],
  ['Trail Blazers', '开拓者'],
  ['Blazers', '开拓者'],
  ['Sacramento Kings', '国王'],
  ['Kings', '国王'],
  ['San Antonio Spurs', '马刺'],
  ['Spurs', '马刺'],
  ['Toronto Raptors', '猛龙'],
  ['Raptors', '猛龙'],
  ['Utah Jazz', '爵士'],
  ['Jazz', '爵士'],
  ['Washington Wizards', '奇才'],
  ['Wizards', '奇才']
]);

const PLAYER_ZH = new Map([
  ['LeBron James', '勒布朗·詹姆斯'],
  ['Stephen Curry', '斯蒂芬·库里'],
  ['Steph Curry', '斯蒂芬·库里'],
  ['Kevin Durant', '凯文·杜兰特'],
  ['Giannis Antetokounmpo', '扬尼斯·阿德托昆博'],
  ['Luka Doncic', '卢卡·东契奇'],
  ['Luka Dončić', '卢卡·东契奇'],
  ['Kawhi Leonard', '科怀·伦纳德'],
  ['James Harden', '詹姆斯·哈登'],
  ['Jaylen Brown', '杰伦·布朗'],
  ['Jalen Brunson', '杰伦·布伦森'],
  ['Draymond Green', '德雷蒙德·格林'],
  ['Jonathan Kuminga', '乔纳森·库明加'],
  ['Cam Christie', '卡姆·克里斯蒂'],
  ['Yaxel Lendeborg', '亚克塞尔·伦德伯格'],
  ['Caleb Wilson', '卡莱布·威尔逊'],
  ['Meleek Thomas', '梅利克·托马斯'],
  ['Cameron Boozer', '卡梅伦·布泽尔'],
  ['Brayden Burries', '布雷登·伯里斯'],
  ['Jalen Wilson', '杰伦·威尔逊'],
  ['Matisse Thybulle', '马蒂斯·赛布尔'],
  ['Lu Dort', '吕冈茨·多尔特'],
  ['Luguentz Dort', '吕冈茨·多尔特'],
  ['Zaccharie Risacher', '扎卡里·里萨谢'],
  ['Ryan Nembhard', '瑞安·内姆哈德'],
  ['Taelon Peter', '泰伦·彼得'],
  ['Rob Pelinka', '罗勃·佩林卡'],
  ['Rich Paul', '里奇·保罗'],
  ['Adam Silver', '亚当·萧华']
]);

const FORBIDDEN_COPY_PATTERNS = [
  /相关消息更新/,
  /后续动向/,
  /继续更新/,
  /更多背景/,
  /详情请/,
  /原文聚焦/,
  /这篇文章讨论了/,
  /\b(?:thoughts following|takeaways from|what we learned|more background|reach out to|expected to|planning to|shows interest|title contenders)\b/i,
  /\b(?:multi-year|one-year|two-year|three-year|four-year)\b/i
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return corsResponse('', { status: 204 });

    if (url.pathname === '/health') {
      return jsonResponse({ ok: true, now: new Date().toISOString() });
    }

    if (url.pathname === '/data/news.json') {
      return serveNews(env);
    }

    if (url.pathname === '/refresh') {
      const auth = authorizeRefresh(request, env);
      if (!auth.ok) return jsonResponse({ error: auth.message }, { status: auth.status });
      const payload = await refreshNews(env);
      return jsonResponse(payload);
    }

    return jsonResponse({
      name: 'nba-quick-news-worker',
      routes: ['/data/news.json', '/refresh', '/health']
    });
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(refreshNews(env, { cron: controller.cron, scheduledTime: controller.scheduledTime }));
  }
};

async function serveNews(env) {
  assertBindings(env);
  const cached = await env.NEWS_KV.get(NEWS_KEY);
  if (cached) {
    return new Response(cached, {
      headers: {
        ...corsHeaders(),
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300, must-revalidate'
      }
    });
  }

  return jsonResponse({
    sources: FEEDS,
    updatedAt: null,
    lastFetchStatus: {
      status: 'empty',
      checkedAt: new Date().toISOString(),
      message: 'No Cloudflare Worker news.json has been generated yet. Call /refresh first.'
    },
    highlights: [],
    items: []
  }, {
    headers: { 'cache-control': 'no-store' }
  });
}

async function refreshNews(env, meta = {}) {
  assertBindings(env);
  const checkedAt = new Date().toISOString();
  const previousPayload = await readExistingPayload(env);
  const feedResults = await Promise.all(FEEDS.map((feed) => fetchFeed(feed)));
  const successfulFeeds = feedResults.filter((result) => result.ok);
  const failedFeeds = feedResults.filter((result) => !result.ok).map(({ source, feed, error }) => ({ source, feed, error }));
  const rawItems = feedResults.flatMap((result) => result.items || []);

  if (!rawItems.length || !successfulFeeds.length) {
    const failedPayload = {
      ...(previousPayload || emptyPayload()),
      lastFetchStatus: {
        status: 'fetch-failed',
        checkedAt,
        updatedAt: previousPayload?.updatedAt || null,
        fetchedItems: 0,
        mergedItems: previousPayload?.items?.length || 0,
        successfulFeeds: successfulFeeds.map(toFeedStatus),
        failedFeeds,
        message: 'All RSS feeds failed or returned no usable items.'
      }
    };
    await env.NEWS_KV.put(NEWS_KEY, JSON.stringify(failedPayload, null, 2));
    return failedPayload;
  }

  const dedupedItems = dedupeItems(rawItems).slice(0, 80);
  const preparedItems = dedupedItems.map((item) => ({
    ...item,
    eventKey: getEventKey(item),
    category: classifyCategory(`${item.originalTitle} ${item.summary}`),
    storyType: inferStoryType(`${item.originalTitle} ${item.summary}`),
    importance: scoreImportance(item),
    summaryZh: '',
    oneLineZh: '',
    copySource: 'fallback'
  }));

  const aiStats = await applyAiSummaries(preparedItems, env);
  const finalItems = preparedItems.map(normalizeOutputItem);
  const highlights = buildHighlights(finalItems);
  const payload = {
    sources: FEEDS,
    updatedAt: checkedAt,
    lastFetchStatus: {
      status: failedFeeds.length ? 'partial-success' : 'success',
      fetchMode: 'cloudflare-worker',
      checkedAt,
      updatedAt: checkedAt,
      fetchedItems: rawItems.length,
      mergedItems: finalItems.length,
      successfulFeeds: successfulFeeds.map(toFeedStatus),
      failedFeeds,
      aiEnabled: isEnabled(env.AI_ENABLED) && Boolean(env.AI),
      aiCandidates: aiStats.candidates,
      aiRequests: aiStats.requests,
      aiAccepted: aiStats.accepted,
      aiFailed: aiStats.failed,
      aiRejected: aiStats.rejected,
      aiCacheHits: aiStats.cacheHits,
      aiRejectionSamples: aiStats.rejectionSamples,
      message: failedFeeds.length
        ? `Fetched ${rawItems.length} items with ${failedFeeds.length} failed feed(s).`
        : `Fetched ${rawItems.length} items from all feeds.`,
      ...meta
    },
    highlights,
    items: finalItems
  };

  await env.NEWS_KV.put(NEWS_KEY, JSON.stringify(payload, null, 2));
  return payload;
}

async function fetchFeed(feedConfig) {
  try {
    const response = await fetch(feedConfig.feed, {
      headers: {
        accept: 'application/rss+xml, application/xml, text/xml',
        'user-agent': 'nba-quick-news-worker/0.1'
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await response.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      cdataPropName: '__cdata'
    });
    const parsed = parser.parse(xml);
    const channel = parsed?.rss?.channel || parsed?.feed || {};
    const items = toArray(channel.item || channel.entry)
      .map((item) => normalizeRssItem(item, feedConfig))
      .filter((item) => item.originalTitle && item.url);
    return { ok: true, source: feedConfig.source, feed: feedConfig.feed, items };
  } catch (error) {
    return {
      ok: false,
      source: feedConfig.source,
      feed: feedConfig.feed,
      error: error?.message || String(error),
      items: []
    };
  }
}

function normalizeRssItem(item, feedConfig) {
  const title = getText(item.title);
  const link = normalizeLink(item.link);
  const summary = stripHtml(getText(item.description || item.summary || item.content || ''));
  const publishedAt = new Date(getText(item.pubDate || item.published || item.updated || Date.now())).toISOString();
  return {
    id: link || `${feedConfig.source}:${title}`,
    originalTitle: decodeHtml(title),
    title: decodeHtml(title),
    url: link,
    link,
    summary: decodeHtml(summary),
    originalSummary: decodeHtml(summary),
    publishedAt,
    pubDate: publishedAt,
    source: feedConfig.source,
    feed: feedConfig.feed
  };
}

async function applyAiSummaries(items, env) {
  const stats = { candidates: 0, cacheHits: 0, requests: 0, accepted: 0, rejected: 0, failed: 0, rejectionSamples: [] };
  if (!isEnabled(env.AI_ENABLED) || !env.AI) return stats;

  const maxItems = clampInt(env.AI_MAX_ITEMS_PER_RUN, 5, 1, 10);
  const candidates = items
    .filter(needsAiSummary)
    .sort((a, b) => b.importance - a.importance || new Date(b.publishedAt) - new Date(a.publishedAt));
  stats.candidates = candidates.length;

  let remaining = maxItems;
  for (const item of candidates) {
    const articleText = await extractArticleText(item.url, env);
    const sourceHash = await sha256(`${item.originalTitle}\n${item.summary}\n${articleText}\n${env.SUMMARY_CACHE_VERSION || DEFAULT_SUMMARY_CACHE_VERSION}`);
    const cacheKey = `${SOURCE_CACHE_PREFIX}${sourceHash}`;
    const cached = await readJsonKv(env.NEWS_KV, cacheKey);
    if (isValidCachedSummary(cached)) {
      applySummary(item, cached, { source: 'workers-ai-cache' });
      stats.cacheHits += 1;
      continue;
    }

    if (remaining <= 0) continue;
    remaining -= 1;
    stats.requests += 1;

    try {
      const aiResult = await summarizeWithWorkersAi(item, articleText, env);
      const accepted = validateAiResult(aiResult, item);
      if (!accepted.ok) {
        stats.rejected += 1;
        pushSample(stats.rejectionSamples, {
          title: item.originalTitle,
          reasons: accepted.reasons,
          summaryZh: normalizeWhitespace(aiResult?.summaryZh || '').slice(0, 180),
          oneLineZh: normalizeWhitespace(aiResult?.oneLineZh || '').slice(0, 90)
        });
        continue;
      }
      const cacheValue = {
        summaryZh: accepted.value.summaryZh,
        oneLineZh: accepted.value.oneLineZh,
        model: env.AI_MODEL || DEFAULT_AI_MODEL,
        generatedAt: new Date().toISOString(),
        sourceHash,
        promptVersion: env.SUMMARY_CACHE_VERSION || DEFAULT_SUMMARY_CACHE_VERSION
      };
      await env.NEWS_KV.put(cacheKey, JSON.stringify(cacheValue));
      applySummary(item, cacheValue, { source: 'workers-ai' });
      stats.accepted += 1;
    } catch (error) {
      console.warn('Workers AI summary failed', {
        title: item.originalTitle,
        error: error?.message || String(error)
      });
      stats.failed += 1;
    }
  }

  return stats;
}

async function summarizeWithWorkersAi(item, articleText, env) {
  const prompt = buildSummaryPrompt(item, articleText);
  const response = await env.AI.run(env.AI_MODEL || DEFAULT_AI_MODEL, {
    messages: [
      {
        role: 'system',
        content: [
          '你是一名严谨的中文 NBA 快讯编辑，只根据输入事实写中文复述，不添加输入中没有的信息。',
          '你不是标题翻译器。不要逐词翻译英文标题，不要半中半英拼接。',
          '球员姓名可以保留英文或使用常见中文译名；球队必须使用常见中文队名。',
          '签约/交易/伤病/传闻/分析要严格区分：传闻不能写成已完成，分析不能写成事实。',
          '如果信息不足，宁可保守说明“现有摘要未提供更多细节”，不要编造。',
          '不要输出思考过程，不要输出 <think> 标签，只输出最终 JSON。'
        ].join('\n')
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    max_tokens: 420,
    temperature: 0.2
  });
  return parseAiJson(response?.response || response?.text || response);
}

function buildSummaryPrompt(item, articleText) {
  const sourceText = `${item.originalTitle}\n${item.summary}\n${articleText}`;
  const extracted = extractFactsForPrompt(sourceText);
  const guidance = getStoryTypeGuidance(item.storyType, item.category);
  return [
    '任务：把下面 NBA 英文新闻写成中文快讯摘要，不翻译标题。',
    'summaryZh：2 到 3 句，80 到 180 个中文字符；要让中文读者不点原文也知道发生了什么。',
    'oneLineZh：一句中文快讯，18 到 45 个中文字符；不要与 summaryZh 第一整句完全相同。',
    '必须优先保留输入里明确出现的合同金额、年限、交易筹码、比分、伤病部位、时间状态。',
    '不要输出“相关消息更新”“后续动向”“成为焦点”“更多背景来自原文报道”。',
    '不要输出未翻译英文普通短语，例如 reach out to、expected to、multi-year、thoughts following。',
    '不要输出思考过程或 <think> 标签。',
    guidance,
    '严格返回 JSON，不要 Markdown，不要解释：{"summaryZh":"","oneLineZh":"","confidence":0.0}',
    '',
    `source: ${item.source}`,
    `category: ${item.category}`,
    `storyType: ${item.storyType}`,
    `originalTitle: ${item.originalTitle}`,
    `rssSummary: ${item.summary || ''}`,
    `extractedFacts: ${JSON.stringify(extracted)}`,
    `preferredTeamNames: ${JSON.stringify(Object.fromEntries([...TEAM_ZH].slice(0, 60)))}`,
    `preferredPlayerNames: ${JSON.stringify(Object.fromEntries([...PLAYER_ZH].filter(([name]) => sourceText.includes(name))))}`,
    `articleText: ${articleText || '(正文不可用，只能基于标题和 RSS 摘要保守处理)'}`
  ].join('\n');
}

function getStoryTypeGuidance(storyType, category) {
  if (storyType === 'rumor' || category === '重要流言') {
    return '传闻规则：必须写“据报道/有意/正在关注/讨论中”等不确定表达；不得写成已经完成。';
  }
  if (storyType === 'analysis' || storyType === 'opinion') {
    return '观点/分析规则：必须说明这是媒体分析、球员表态或观点讨论；不要写成球队已经决定。';
  }
  if (category === '交易') {
    return '交易规则：必须写清谁去哪里、谁送出什么；若交易只是讨论中，必须保留不确定性。';
  }
  if (category === '签约') {
    return '签约规则：必须写清球员、球队、合同年限和金额；若金额未知，不要编造。';
  }
  if (category === '伤病') {
    return '伤病规则：必须写清球员、伤病部位或复出状态；不要夸大影响。';
  }
  return '普通新闻规则：只复述最重要事实，避免空泛背景。';
}

async function extractArticleText(url, env) {
  if (!isEnabled(env.JINA_READER_ENABLED) || !url) return '';
  try {
    const readerUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, '')}`;
    const response = await fetch(readerUrl, {
      headers: { accept: 'text/plain' },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error(`Jina HTTP ${response.status}`);
    const text = stripHtml(await response.text());
    return normalizeWhitespace(text).slice(0, clampInt(env.ARTICLE_CHAR_LIMIT, 5000, 1000, 8000));
  } catch (error) {
    console.warn('Jina Reader failed', { url, error: error?.message || String(error) });
    return '';
  }
}

function parseAiJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  const text = String(value)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json|```/g, '')
    .trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function validateAiResult(result, item = null) {
  const reasons = [];
  if (!result || typeof result !== 'object') return { ok: false, reasons: ['invalid-json'] };
  const summaryZh = normalizeChineseCopy(result.summaryZh || '');
  const oneLineZh = normalizeChineseCopy(result.oneLineZh || '');
  const confidence = Number(result.confidence || 0);
  const combined = `${summaryZh} ${oneLineZh}`;
  if (!Number.isFinite(confidence) || confidence < 0.5) reasons.push('low-confidence');
  if (!isChineseSummary(summaryZh)) reasons.push('bad-summary-language');
  if (!isChineseSummary(oneLineZh)) reasons.push('bad-oneline-language');
  if (hasForbiddenCopy(combined)) reasons.push('generic-or-mixed-copy');
  if (summaryZh && oneLineZh && compactComparable(summaryZh).includes(compactComparable(oneLineZh)) && getChineseLength(oneLineZh) > 34) {
    reasons.push('oneline-repeats-summary');
  }
  if (getChineseLength(summaryZh) > 220) reasons.push('summary-too-long');
  if (getChineseLength(oneLineZh) > 50) reasons.push('oneline-too-long');
  if (item) {
    const sourceText = `${item.originalTitle} ${item.summary}`;
    if (item.storyType === 'rumor' && !/(据报道|据称|有意|关注|考虑|讨论|尚未|可能|传闻|流言)/.test(summaryZh)) {
      reasons.push('rumor-as-fact');
    }
    if (['analysis', 'opinion'].includes(item.storyType) && !/(分析|认为|表示|谈到|观点|讨论|评估|可能|有望|称)/.test(summaryZh)) {
      reasons.push('analysis-as-fact');
    }
    for (const token of extractStrictFacts(sourceText)) {
      if (!combined.includes(token.zh) && !combined.includes(token.raw)) reasons.push(`missing-fact:${token.raw}`);
    }
  }
  if (reasons.length) return { ok: false, reasons };
  return {
    ok: true,
    value: {
      summaryZh,
      oneLineZh,
      confidence
    }
  };
}

function applySummary(item, summary, { source }) {
  item.summaryZh = summary.summaryZh;
  item.oneLineZh = summary.oneLineZh;
  item.copySource = source;
  item.aiModel = summary.model;
  item.aiGeneratedAt = summary.generatedAt;
}

function extractFactsForPrompt(text = '') {
  return {
    teams: [...new Set([...TEAM_ZH.keys()].filter((team) => new RegExp(`\\b${escapeRegExp(team)}\\b`, 'i').test(text)).map((team) => TEAM_ZH.get(team)))],
    players: [...new Set([...PLAYER_ZH.keys()].filter((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(text)).map((name) => PLAYER_ZH.get(name)))],
    money: extractMoneyTerms(text),
    years: extractYearTerms(text),
    picks: extractPickTerms(text),
    scores: extractScoreTerms(text),
    status: inferAction(text)
  };
}

function extractStrictFacts(text = '') {
  return [
    ...extractMoneyTerms(text).map((term) => ({ raw: term.raw, zh: term.zh })),
    ...extractYearTerms(text).map((term) => ({ raw: term.raw, zh: term.zh })),
    ...extractPickTerms(text).map((term) => ({ raw: term.raw, zh: term.zh }))
  ];
}

function extractMoneyTerms(text = '') {
  const terms = [];
  for (const match of String(text).matchAll(/\$(\d+(?:\.\d+)?)\s*(M|million|B|billion)?/gi)) {
    const value = Number(match[1]);
    const unit = String(match[2] || 'M').toLowerCase();
    if (!Number.isFinite(value)) continue;
    const zh = unit.startsWith('b')
      ? `${trimNumber(value * 10)} 亿美元`
      : `${trimNumber(value * 100)} 万美元`;
    terms.push({ raw: match[0], zh });
  }
  return terms;
}

function extractYearTerms(text = '') {
  const words = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6
  };
  const terms = [];
  for (const match of String(text).matchAll(/\b(one|two|three|four|five|six)-year\b/gi)) {
    terms.push({ raw: match[0], zh: `${words[match[1].toLowerCase()]} 年` });
  }
  for (const match of String(text).matchAll(/\b(\d+)-year\b/gi)) {
    terms.push({ raw: match[0], zh: `${match[1]} 年` });
  }
  return terms;
}

function extractPickTerms(text = '') {
  const terms = [];
  if (/\bfirst[-\s]+round pick/i.test(text)) terms.push({ raw: 'first-round pick', zh: '首轮签' });
  if (/\bsecond[-\s]+round pick/i.test(text)) terms.push({ raw: 'second-round pick', zh: '次轮签' });
  for (const match of String(text).matchAll(/\b(\d{4})\s+(first|second)[-\s]+round pick/gi)) {
    terms.push({ raw: match[0], zh: `${match[1]} 年${match[2].toLowerCase() === 'first' ? '首轮签' : '次轮签'}` });
  }
  return terms;
}

function extractScoreTerms(text = '') {
  return [...String(text).matchAll(/\b(\d{2,3})-(\d{2,3})\b/g)].map((match) => ({
    raw: match[0],
    zh: `${match[1]} 比 ${match[2]}`
  }));
}

function normalizeChineseCopy(value = '') {
  let text = localize(String(value || ''));
  for (const term of extractMoneyTerms(text)) text = text.replace(term.raw, term.zh);
  for (const term of extractYearTerms(text)) text = text.replace(term.raw, term.zh);
  text = text
    .replace(/\bmulti[-\s]+year contract\b/gi, '多年合同')
    .replace(/\bmulti[-\s]+year\b/gi, '多年')
    .replace(/\bcontract\b/gi, '合同')
    .replace(/\bdeal\b/gi, '合同')
    .replace(/\bfree agency\b/gi, '自由市场')
    .replace(/\bSummer League\b/g, '夏季联赛')
    .replace(/\bHall of Fame\b/g, '名人堂')
    .replace(/([，。；：])\s+/g, '$1')
    .replace(/\s+([，。；：])/g, '$1')
    .replace(/([一-龥])([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*)*)/g, '$1 $2')
    .replace(/([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*)*)([一-龥])/g, '$1 $2');
  return normalizeWhitespace(text);
}

function hasForbiddenCopy(value = '') {
  return FORBIDDEN_COPY_PATTERNS.some((pattern) => pattern.test(value));
}

function compactComparable(value = '') {
  return normalizeWhitespace(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function getChineseLength(value = '') {
  return (String(value).match(/[\u4e00-\u9fa5]/g) || []).length;
}

function trimNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

function pushSample(samples, sample, limit = 5) {
  if (samples.length < limit) samples.push(sample);
}

function needsAiSummary(item) {
  if ((item.importance || 1) >= 4 && ['交易', '签约', '伤病', '选秀'].includes(item.category)) return true;
  if (['rumor', 'analysis', 'opinion'].includes(item.storyType)) return true;
  return /LeBron|Curry|Durant|Giannis|Doncic|Kawhi|trade|sign|injury|MVP|Summer League/i.test(`${item.originalTitle} ${item.summary}`);
}

function normalizeOutputItem(item) {
  const fallback = buildFallbackSummary(item);
  const summaryZh = item.summaryZh || fallback.summaryZh;
  const oneLineZh = item.oneLineZh || fallback.oneLineZh;
  return recursiveCleanStrings({
    ...item,
    displayTitle: item.originalTitle,
    summaryZh,
    oneLineZh,
    titleZh: '',
    headlineZh: '',
    imageUrl: ''
  });
}

function buildFallbackSummary(item) {
  const text = `${item.originalTitle} ${item.summary}`;
  const title = item.originalTitle || '';
  const sourcePrefix = item.source ? `据 ${item.source} 报道，` : '';

  const contract = title.match(/^(.+?),\s*(.+?) Agree To (.+?Deal)$/i) ||
    title.match(/^(.+?) signs? (.+?) with (.+)$/i);
  if (contract) {
    const player = contract[1];
    const team = contract[2];
    const contractText = contract[3] || '';
    const details = [...extractYearTerms(contractText), ...extractMoneyTerms(contractText)].map((term) => term.zh).join('、');
    return {
      summaryZh: normalizeChineseCopy(`${sourcePrefix}${localize(team)}与 ${localize(player)} 达成合同协议${details ? `，合同信息包括${details}` : ''}。`),
      oneLineZh: normalizeChineseCopy(`${localize(team)}签下 ${localize(player)}${details ? `，${details}` : ''}`)
    };
  }

  const mvp = text.match(/(.+?) (?:was named|earns|named) (?:NBA )?Summer League MVP/i);
  if (mvp) {
    return {
      summaryZh: normalizeChineseCopy(`${sourcePrefix}${localize(mvp[1])}被评为 NBA 夏季联赛 MVP，原文重点是他在夏季联赛的表现获得认可。`),
      oneLineZh: normalizeChineseCopy(`${localize(mvp[1])}当选夏季联赛 MVP`)
    };
  }

  if (/Hall of Fame/i.test(text) && /Curry/i.test(text)) {
    return {
      summaryZh: `${sourcePrefix}斯蒂芬·库里将获得篮球名人堂相关展览展示，原文重点是他的三分球影响力和职业成就得到认可。`,
      oneLineZh: '库里将获得篮球名人堂展览展示'
    };
  }

  return { summaryZh: '', oneLineZh: '' };
}

function buildHighlights(items) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const seen = new Set();
  return [...items]
    .filter((item) => new Date(item.publishedAt).getTime() >= cutoff)
    .filter((item) => isChineseSummary(item.oneLineZh) && !/相关消息更新|后续动向/.test(item.oneLineZh))
    .sort((a, b) => b.importance - a.importance || new Date(b.publishedAt) - new Date(a.publishedAt))
    .filter((item) => {
      const key = item.eventKey || item.oneLineZh;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      text: item.oneLineZh,
      category: item.category,
      source: item.source,
      link: item.link
    }));
}

function dedupeItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getEventKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getEventKey(item) {
  return slugText([
    inferAction(`${item.originalTitle} ${item.summary}`),
    getMainPlayer(item.originalTitle),
    getMainTeam(`${item.originalTitle} ${item.summary}`)
  ].filter(Boolean).join(':')) || slugText(item.url || item.originalTitle);
}

function inferAction(text) {
  if (/\b(trade|traded|acquire|acquired|deal with|sent to)\b/i.test(text)) return 'trade';
  if (/\b(sign|signed|contract|extension|agree to)\b/i.test(text)) return 'signing';
  if (/\b(injury|injured|out|surgery|return)\b/i.test(text)) return 'injury';
  if (/\b(draft|summer league|rookie|mvp|first team)\b/i.test(text)) return 'draft';
  if (/\b(rumor|interested|target|monitoring|considering)\b/i.test(text)) return 'rumor';
  return 'news';
}

function classifyCategory(text) {
  const action = inferAction(text);
  if (action === 'trade') return '交易';
  if (action === 'signing') return '签约';
  if (action === 'injury') return '伤病';
  if (action === 'draft') return '选秀';
  if (action === 'rumor') return '重要流言';
  return '其他';
}

function inferStoryType(text) {
  if (/\b(thoughts|takeaways|what we learned|analysis|outlook|projection|ranking|look to challenge)\b/i.test(text)) return 'analysis';
  if (/\b(says|said|believes|reacts|shares thoughts|explains|discusses|comments on)\b/i.test(text)) return 'opinion';
  if (/\b(rumor|interested|monitoring|considering|target)\b/i.test(text)) return 'rumor';
  return inferAction(text);
}

function scoreImportance(item) {
  const text = `${item.originalTitle} ${item.summary}`;
  let score = 1;
  if (['交易', '签约', '伤病'].includes(classifyCategory(text))) score += 3;
  if (/\b(LeBron|Curry|Durant|Giannis|Doncic|Kawhi|MVP|Warriors|Lakers|Celtics|Knicks)\b/i.test(text)) score += 2;
  if (/\b(\$\d+|million|two-year|four-year|first-round|Summer League MVP)\b/i.test(text)) score += 1;
  return Math.min(score, 5);
}

function getMainPlayer(title = '') {
  const match = title.match(/\b([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,2})\b/);
  return match ? match[1] : '';
}

function getMainTeam(text = '') {
  for (const team of TEAM_ZH.keys()) {
    if (new RegExp(`\\b${escapeRegExp(team)}\\b`, 'i').test(text)) return team;
  }
  return '';
}

function localize(value = '') {
  let text = String(value || '').trim();
  for (const [en, zh] of TEAM_ZH) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(en)}\\b`, 'gi'), zh);
  }
  for (const [en, zh] of PLAYER_ZH) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(en)}\\b`, 'gi'), zh);
  }
  return normalizeWhitespace(text);
}

function localizeContract(value = '') {
  return localize(value)
    .replace(/two-year/i, '2 年')
    .replace(/three-year/i, '3 年')
    .replace(/four-year/i, '4 年')
    .replace(/one-year/i, '1 年')
    .replace(/\bdeal\b/i, '合同');
}

async function readExistingPayload(env) {
  return readJsonKv(env.NEWS_KV, NEWS_KEY);
}

async function readJsonKv(kv, key) {
  try {
    const value = await kv.get(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function toFeedStatus(result) {
  return { source: result.source, feed: result.feed, items: result.items?.length || 0 };
}

function authorizeRefresh(request, env) {
  if (!env.REFRESH_TOKEN) return { ok: true };
  const url = new URL(request.url);
  const token = request.headers.get('x-refresh-token') || url.searchParams.get('token');
  if (timingSafeEqual(token || '', env.REFRESH_TOKEN)) return { ok: true };
  return { ok: false, status: 401, message: 'Missing or invalid refresh token.' };
}

function timingSafeEqual(left = '', right = '') {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(String(left));
  const rightBytes = encoder.encode(String(right));
  if (leftBytes.length !== rightBytes.length) return false;
  return crypto.subtle.timingSafeEqual
    ? crypto.subtle.timingSafeEqual(leftBytes, rightBytes)
    : leftBytes.every((byte, index) => byte === rightBytes[index]);
}

function assertBindings(env) {
  if (!env.NEWS_KV) throw new Error('Missing NEWS_KV binding.');
}

function emptyPayload() {
  return { sources: FEEDS, highlights: [], items: [] };
}

function isValidCachedSummary(value) {
  return value && isChineseSummary(value.summaryZh) && isChineseSummary(value.oneLineZh);
}

function isChineseSummary(value = '') {
  const text = String(value || '');
  const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return chinese >= 8 && chinese >= latin * 0.3;
}

function getText(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') return value.__cdata || value['#text'] || value.text || '';
  return '';
}

function normalizeLink(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return normalizeLink(value[0]);
  if (value && typeof value === 'object') return value.href || value['#text'] || '';
  return '';
}

function stripHtml(value = '') {
  return normalizeWhitespace(String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '));
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function normalizeWhitespace(value = '') {
  return String(value).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function recursiveCleanStrings(value) {
  if (typeof value === 'string') return normalizeWhitespace(value);
  if (Array.isArray(value)) return value.map(recursiveCleanStrings);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, recursiveCleanStrings(entry)]));
  }
  return value;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function slugText(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,x-refresh-token'
  };
}

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    ...init,
    headers: {
      ...corsHeaders(),
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers || {})
    }
  });
}

function corsResponse(body, init = {}) {
  return new Response(body, {
    ...init,
    headers: {
      ...corsHeaders(),
      ...(init.headers || {})
    }
  });
}
