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

const TEAM_ZH = new Map([
  ['Golden State Warriors', '勇士'],
  ['Warriors', '勇士'],
  ['Los Angeles Lakers', '湖人'],
  ['Lakers', '湖人'],
  ['Boston Celtics', '凯尔特人'],
  ['Celtics', '凯尔特人'],
  ['Philadelphia 76ers', '76 人'],
  ['76ers', '76 人'],
  ['Dallas Mavericks', '独行侠'],
  ['Mavericks', '独行侠'],
  ['Memphis Grizzlies', '灰熊'],
  ['Grizzlies', '灰熊'],
  ['Cleveland Cavaliers', '骑士'],
  ['Cavaliers', '骑士'],
  ['LA Clippers', '快船'],
  ['Los Angeles Clippers', '快船'],
  ['Clippers', '快船'],
  ['Miami Heat', '热火'],
  ['Heat', '热火'],
  ['Milwaukee Bucks', '雄鹿'],
  ['Bucks', '雄鹿'],
  ['New York Knicks', '尼克斯'],
  ['Knicks', '尼克斯'],
  ['Phoenix Suns', '太阳'],
  ['Suns', '太阳'],
  ['Brooklyn Nets', '篮网'],
  ['Nets', '篮网'],
  ['Indiana Pacers', '步行者'],
  ['Pacers', '步行者']
]);

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
      aiCacheHits: aiStats.cacheHits,
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
  const stats = { candidates: 0, cacheHits: 0, requests: 0, accepted: 0, failed: 0 };
  if (!isEnabled(env.AI_ENABLED) || !env.AI) return stats;

  const maxItems = clampInt(env.AI_MAX_ITEMS_PER_RUN, 5, 1, 10);
  const candidates = items
    .filter(needsAiSummary)
    .sort((a, b) => b.importance - a.importance || new Date(b.publishedAt) - new Date(a.publishedAt));
  stats.candidates = candidates.length;

  let remaining = maxItems;
  for (const item of candidates) {
    const articleText = await extractArticleText(item.url, env);
    const sourceHash = await sha256(`${item.originalTitle}\n${item.summary}\n${articleText}\n${env.SUMMARY_CACHE_VERSION || 'cf-summary-v1'}`);
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
      const accepted = validateAiResult(aiResult);
      if (!accepted.ok) {
        stats.failed += 1;
        continue;
      }
      const cacheValue = {
        summaryZh: accepted.value.summaryZh,
        oneLineZh: accepted.value.oneLineZh,
        model: env.AI_MODEL || '@cf/meta/llama-3.1-8b-instruct',
        generatedAt: new Date().toISOString(),
        sourceHash,
        promptVersion: env.SUMMARY_CACHE_VERSION || 'cf-summary-v1'
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
  const response = await env.AI.run(env.AI_MODEL || '@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      {
        role: 'system',
        content: '你是一名严谨的中文 NBA 快讯编辑。只根据输入事实复述，不添加原文没有的信息。球员姓名可保留英文，球队名用常见中文。不要逐词翻译，不要半中半英拼接。'
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
  return [
    '请把下面 NBA 英文新闻改写成中文快讯摘要。',
    '要求：summaryZh 写 2 到 3 句，像懂 NBA 的中文编辑读完文章后复述；oneLineZh 写一句 20 到 45 个中文字符的今日快讯。',
    '不要翻译标题；不要营销号；传闻必须保留“据报道/有意/讨论中”；分析观点必须写明这是分析或观点。',
    '严格返回 JSON：{"summaryZh":"","oneLineZh":"","confidence":0.0}',
    '',
    `source: ${item.source}`,
    `category: ${item.category}`,
    `storyType: ${item.storyType}`,
    `originalTitle: ${item.originalTitle}`,
    `rssSummary: ${item.summary || ''}`,
    `articleText: ${articleText || '(正文不可用，只能基于标题和 RSS 摘要保守处理)'}`
  ].join('\n');
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
  const text = String(value).replace(/```json|```/g, '').trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function validateAiResult(result) {
  if (!result || typeof result !== 'object') return { ok: false };
  const summaryZh = normalizeWhitespace(result.summaryZh || '');
  const oneLineZh = normalizeWhitespace(result.oneLineZh || '');
  const confidence = Number(result.confidence || 0);
  if (confidence < 0.5) return { ok: false };
  if (!isChineseSummary(summaryZh) || !isChineseSummary(oneLineZh)) return { ok: false };
  if (/相关消息更新|后续动向|更多背景|详情请/.test(`${summaryZh} ${oneLineZh}`)) return { ok: false };
  return {
    ok: true,
    value: {
      summaryZh: summaryZh.slice(0, 260),
      oneLineZh: oneLineZh.slice(0, 80),
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

  const contract = title.match(/^(.+?),\s*(.+?) Agree To (.+?Deal)$/i);
  if (contract) {
    return {
      summaryZh: normalizeWhitespace(`${sourcePrefix}${localize(contract[2])}与 ${localize(contract[1])} 达成合同协议，原文标题显示这是一笔${localizeContract(contract[3])}。`),
      oneLineZh: normalizeWhitespace(`${localize(contract[2])}与 ${localize(contract[1])} 达成合同`)
    };
  }

  const mvp = text.match(/(.+?) (?:was named|earns|named) (?:NBA )?Summer League MVP/i);
  if (mvp) {
    return {
      summaryZh: normalizeWhitespace(`${sourcePrefix}${localize(mvp[1])}被评为 NBA 夏季联赛 MVP，原文重点是他在夏季联赛的表现获得认可。`),
      oneLineZh: normalizeWhitespace(`${localize(mvp[1])}当选夏季联赛 MVP`)
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
  if (token === env.REFRESH_TOKEN) return { ok: true };
  return { ok: false, status: 401, message: 'Missing or invalid refresh token.' };
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
