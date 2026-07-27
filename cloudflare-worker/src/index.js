import { XMLParser } from 'fast-xml-parser';
import {
  PIPELINE_VERSION,
  buildEditorialPrompt,
  buildWorkersAiRequest,
  cleanStringsDeep,
  createNewsId,
  createPendingRecord,
  createSourceHash,
  decodeHtml,
  getRetrySchedule,
  materializePayload,
  migrateLegacyRecord,
  normalizeAiResponse,
  normalizeWhitespace,
  recoverStaleProcessing,
  selectQueueRecords,
  stripHtml,
  summarizeQueue,
  validateEditorialResult
} from './pipeline.js';

const FEED = {
  source: 'RealGM',
  feed: 'https://basketball.realgm.com/rss/wiretap/15/0.xml'
};

const NEWS_KEY = 'news.json';
const CATALOG_KEY = 'news:catalog:v1';
const RECORD_PREFIX = 'news:item:';
const DEFAULT_AI_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
const DEFAULT_CATALOG_LIMIT = 120;

class RefreshError extends Error {
  constructor(message, payload) {
    super(message);
    this.name = 'RefreshError';
    this.payload = payload;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return corsResponse('', { status: 204 });

    if (url.pathname === '/health') {
      return serveHealth(env);
    }

    if (url.pathname === '/data/news.json') {
      return serveNews(env);
    }

    if (url.pathname === '/refresh') {
      const auth = authorizeRefresh(request, env);
      if (!auth.ok) return jsonResponse({ error: auth.message }, { status: auth.status });
      try {
        return jsonResponse(await refreshNews(env, { trigger: 'manual' }));
      } catch (error) {
        console.error('Manual refresh failed', {
          error: error?.message || String(error),
          pipelineVersion: PIPELINE_VERSION
        });
        if (error instanceof RefreshError) {
          return jsonResponse(error.payload, { status: 502 });
        }
        return jsonResponse({ error: 'Refresh failed.', pipelineVersion: PIPELINE_VERSION }, { status: 500 });
      }
    }

    return jsonResponse({
      name: 'nba-quick-news-worker',
      pipelineVersion: PIPELINE_VERSION,
      routes: ['/health', '/data/news.json', '/refresh']
    });
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(refreshNews(env, {
      trigger: 'cron',
      cron: controller.cron,
      scheduledTime: controller.scheduledTime
    }));
  }
};

async function serveHealth(env) {
  assertBindings(env);
  const payload = await readJson(env.NEWS_KV, NEWS_KEY);
  return jsonResponse({
    ok: true,
    now: new Date().toISOString(),
    pipelineVersion: PIPELINE_VERSION,
    dataStatus: payload?.lastFetchStatus?.status || 'empty',
    updatedAt: payload?.updatedAt || null,
    acceptedItems: payload?.items?.length || 0,
    queue: payload?.lastFetchStatus?.queue || null
  }, {
    headers: { 'cache-control': 'no-store' }
  });
}

async function serveNews(env) {
  assertBindings(env);
  const cached = await env.NEWS_KV.get(NEWS_KEY);
  if (cached) {
    return new Response(cached, {
      headers: {
        ...corsHeaders(),
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=120, stale-if-error=86400'
      }
    });
  }

  return jsonResponse(emptyPayload(), {
    headers: { 'cache-control': 'no-store' }
  });
}

async function refreshNews(env, meta = {}) {
  assertBindings(env);
  const checkedAt = new Date().toISOString();
  const nowMs = new Date(checkedAt).getTime();
  const previousPayload = await readJson(env.NEWS_KV, NEWS_KEY);
  const previousUpdatedAt = previousPayload?.updatedAt || null;
  const feedResult = await fetchFeed(FEED);

  if (!feedResult.ok || feedResult.items.length === 0) {
    const failedPayload = cleanStringsDeep({
      ...(previousPayload || emptyPayload()),
      lastFetchStatus: {
        ...(previousPayload?.lastFetchStatus || {}),
        status: 'fetch-failed',
        checkedAt,
        updatedAt: previousUpdatedAt,
        fetchedItems: 0,
        successfulFeeds: [],
        failedFeeds: [{
          source: FEED.source,
          feed: FEED.feed,
          error: feedResult.error || 'RSS returned no usable items.'
        }],
        message: 'RealGM RSS fetch failed; previously accepted content was preserved.',
        pipelineVersion: PIPELINE_VERSION,
        ...meta
      }
    });
    await env.NEWS_KV.put(NEWS_KEY, JSON.stringify(failedPayload));
    throw new RefreshError('RealGM RSS fetch failed.', failedPayload);
  }

  const incoming = await normalizeIncomingItems(feedResult.items);
  const state = await loadContentState(env, previousPayload, checkedAt);
  const dirty = new Set(state.dirtyIds);

  for (const newsId of recoverStaleProcessing(state.records, nowMs)) dirty.add(newsId);
  mergeIncoming(state.records, incoming, checkedAt, dirty);

  const catalogLimit = clampInteger(env.NEWS_CATALOG_LIMIT, DEFAULT_CATALOG_LIMIT, 40, 200);
  state.records = retainCatalogRecords(state.records, catalogLimit);
  const selected = isAiEnabled(env)
    ? selectQueueRecords(state.records, clampInteger(env.AI_MAX_ITEMS_PER_RUN, 3, 1, 10), nowMs)
    : [];

  for (const record of selected) {
    record.aiStatus = 'processing';
    record.processingStartedAt = checkedAt;
    record.lastAttemptAt = checkedAt;
    record.lastError = null;
    record.rejectionReasons = [];
    dirty.add(record.newsId);
  }

  await writeRecords(env.NEWS_KV, state.records.filter((record) => dirty.has(record.newsId)));
  await saveCatalogIfChanged(env.NEWS_KV, state.catalogIds, state.records, checkedAt);

  if (selected.length) await sleep(1100);

  const aiStats = {
    enabled: isAiEnabled(env),
    selected: selected.length,
    requests: 0,
    accepted: 0,
    rejected: 0,
    failed: 0,
    rejectionSamples: []
  };

  for (const record of selected) {
    await processRecord(record, env, aiStats);
    await writeRecord(env.NEWS_KV, record);
  }

  const updatedAt = checkedAt;
  const queue = summarizeQueue(state.records, checkedAt);
  const pipelineDegraded = aiStats.rejected > 0 || aiStats.failed > 0;
  const status = {
    status: pipelineDegraded ? 'partial-success' : 'success',
    fetchMode: 'cloudflare-worker',
    checkedAt,
    updatedAt,
    previousUpdatedAt,
    fetchedItems: feedResult.items.length,
    normalizedItems: incoming.length,
    acceptedItems: state.records.filter((record) => record.aiStatus === 'accepted').length,
    successfulFeeds: [{ source: FEED.source, feed: FEED.feed, items: feedResult.items.length }],
    failedFeeds: [],
    aiEnabled: aiStats.enabled,
    aiModel: env.AI_MODEL || DEFAULT_AI_MODEL,
    aiSelected: aiStats.selected,
    aiRequests: aiStats.requests,
    aiAccepted: aiStats.accepted,
    aiRejected: aiStats.rejected,
    aiFailed: aiStats.failed,
    aiRejectionSamples: aiStats.rejectionSamples,
    queue,
    message: pipelineDegraded
      ? `Fetched ${feedResult.items.length} RealGM items; ${aiStats.accepted} AI edit(s) accepted and ${aiStats.rejected + aiStats.failed} deferred for retry.`
      : `Fetched ${feedResult.items.length} RealGM items; ${aiStats.accepted} AI edit(s) accepted.`,
    pipelineVersion: PIPELINE_VERSION,
    ...meta
  };
  const payload = materializePayload(state.records, status, checkedAt);
  await env.NEWS_KV.put(NEWS_KEY, JSON.stringify(payload));

  console.log('NBA editorial pipeline completed', {
    pipelineVersion: PIPELINE_VERSION,
    fetchedItems: feedResult.items.length,
    acceptedItems: payload.items.length,
    aiSelected: aiStats.selected,
    aiRequests: aiStats.requests,
    aiAccepted: aiStats.accepted,
    aiRejected: aiStats.rejected,
    aiFailed: aiStats.failed,
    queue
  });

  return payload;
}

async function processRecord(record, env, stats) {
  const articleText = await extractArticleText(record.url, env);
  try {
    const aiResult = await summarizeWithWorkersAi(record, articleText, env);
    stats.requests += aiResult.requestCount;
    const validation = validateEditorialResult(aiResult.normalized.parsed, record, articleText);

    if (!validation.ok) {
      record.aiStatus = 'rejected';
      record.retryCount = (record.retryCount || 0) + 1;
      record.processedAt = new Date().toISOString();
      record.processingStartedAt = null;
      record.nextRetryAt = getRetrySchedule('rejected', record.retryCount);
      record.rejectionReasons = validation.reasons;
      record.lastError = validation.reasons.join(',');
      record.editorial = null;
      stats.rejected += 1;
      pushSample(stats.rejectionSamples, {
        newsId: record.newsId,
        originalTitle: record.originalTitle,
        reasons: validation.reasons,
        addedFacts: validation.details.addedFacts,
        missingFacts: validation.details.missingFacts,
        unsafeFragments: validation.details.unsafeFragments
      });
      console.warn('Workers AI editorial rejected', {
        newsId: record.newsId,
        originalTitle: record.originalTitle,
        finishReason: aiResult.normalized.finishReason,
        reasons: validation.reasons,
        addedFacts: validation.details.addedFacts,
        missingFacts: validation.details.missingFacts,
        unsafeFragments: validation.details.unsafeFragments,
        rawResponse: aiResult.normalized.rawDebug.slice(0, 2000)
      });
      return;
    }

    record.aiStatus = 'accepted';
    record.retryCount = record.retryCount || 0;
    record.processedAt = new Date().toISOString();
    record.processingStartedAt = null;
    record.nextRetryAt = null;
    record.rejectionReasons = [];
    record.lastError = null;
    record.editorial = {
      ...validation.value,
      model: env.AI_MODEL || DEFAULT_AI_MODEL,
      generatedAt: record.processedAt,
      editorSource: 'workers-ai',
      pipelineVersion: PIPELINE_VERSION
    };
    stats.accepted += 1;
  } catch (error) {
    stats.requests += Number(error?.aiRequestCount) || 0;
    record.aiStatus = 'failed';
    record.retryCount = (record.retryCount || 0) + 1;
    record.processedAt = new Date().toISOString();
    record.processingStartedAt = null;
    record.nextRetryAt = getRetrySchedule('failed', record.retryCount);
    record.rejectionReasons = [];
    record.lastError = sanitizeError(error);
    record.editorial = null;
    stats.failed += 1;
    console.warn('Workers AI editorial request failed', {
      newsId: record.newsId,
      originalTitle: record.originalTitle,
      retryCount: record.retryCount,
      nextRetryAt: record.nextRetryAt,
      error: record.lastError
    });
  }
}

async function summarizeWithWorkersAi(record, articleText, env) {
  const model = env.AI_MODEL || DEFAULT_AI_MODEL;
  const prompt = buildEditorialPrompt(record, articleText);
  let requestCount = 0;
  let response;

  try {
    try {
      requestCount += 1;
      response = await env.AI.run(model, buildWorkersAiRequest(prompt, 1800, true));
    } catch (error) {
      if (!/response.?format|json.?schema|json mode|unsupported/i.test(error?.message || '')) throw error;
      console.warn('Workers AI JSON schema mode unavailable; retrying with prompt-enforced JSON', {
        model,
        error: sanitizeError(error)
      });
      requestCount += 1;
      response = await env.AI.run(model, buildWorkersAiRequest(prompt, 1800, false));
    }

    let normalized = normalizeAiResponse(response);
    if (!normalized.parsed && (!normalized.rawContent || normalized.finishReason === 'length')) {
      console.warn('Workers AI returned no usable JSON; retrying once without using reasoning text', {
        newsId: record.newsId,
        finishReason: normalized.finishReason,
        rawResponse: normalized.rawDebug.slice(0, 2000)
      });
      requestCount += 1;
      response = await env.AI.run(model, buildWorkersAiRequest(prompt, 3200, true));
      normalized = normalizeAiResponse(response);
    }

    return { normalized, requestCount };
  } catch (error) {
    if (error && typeof error === 'object') {
      error.aiRequestCount = requestCount;
      throw error;
    }
    const wrapped = new Error(String(error));
    wrapped.aiRequestCount = requestCount;
    throw wrapped;
  }
}

async function extractArticleText(url, env) {
  if (!isEnabled(env.JINA_READER_ENABLED) || !url) return '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        accept: 'text/plain',
        'user-agent': 'nba-quick-news-worker/1.0'
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const limit = clampInteger(env.ARTICLE_CHAR_LIMIT, 5000, 1000, 8000);
    return normalizeWhitespace(await response.text()).slice(0, limit);
  } catch (error) {
    console.warn('Article extraction failed; AI will use RSS evidence only', {
      url,
      error: sanitizeError(error)
    });
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFeed(feedConfig) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(feedConfig.feed, {
      headers: {
        accept: 'application/rss+xml, application/xml, text/xml',
        'user-agent': 'nba-quick-news-worker/1.0'
      },
      signal: controller.signal
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
    return { ok: true, items };
  } catch (error) {
    return { ok: false, items: [], error: sanitizeError(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeRssItem(item, feedConfig) {
  const title = decodeHtml(getText(item.title));
  const summary = decodeHtml(stripHtml(getText(item.description || item.summary || item.content || '')));
  const link = normalizeLink(item.link);
  return {
    source: feedConfig.source,
    feed: feedConfig.feed,
    originalTitle: title,
    originalSummary: summary,
    summary,
    url: link,
    link,
    publishedAt: getText(item.pubDate || item.published || item.updated || Date.now())
  };
}

async function normalizeIncomingItems(items) {
  const normalized = await Promise.all(items.map(async (item) => {
    const newsId = await createNewsId(item);
    const sourceHash = await createSourceHash(item);
    return {
      ...item,
      newsId,
      sourceHash
    };
  }));
  const seen = new Set();
  return normalized.filter((item) => {
    if (seen.has(item.newsId)) return false;
    seen.add(item.newsId);
    return true;
  });
}

async function loadContentState(env, previousPayload, now) {
  const catalog = await readJson(env.NEWS_KV, CATALOG_KEY);
  if (Array.isArray(catalog?.ids) && catalog.ids.length) {
    const records = (await Promise.all(
      catalog.ids.map((newsId) => readJson(env.NEWS_KV, recordKey(newsId)))
    )).filter((record) => record?.newsId);
    return { records, catalogIds: catalog.ids, dirtyIds: [] };
  }

  const legacyItems = (previousPayload?.items || []).filter((item) => (item.source || 'RealGM') === 'RealGM');
  const records = await Promise.all(legacyItems.map(async (item) => {
    const newsId = item.newsId || await createNewsId(item);
    const sourceHash = item.sourceHash || await createSourceHash(item);
    return migrateLegacyRecord({ ...item, newsId, sourceHash }, now);
  }));
  return {
    records,
    catalogIds: [],
    dirtyIds: records.map((record) => record.newsId)
  };
}

function mergeIncoming(records, incoming, now, dirty) {
  const byId = new Map(records.map((record) => [record.newsId, record]));
  for (const item of incoming) {
    const existing = byId.get(item.newsId);
    if (!existing) {
      const record = createPendingRecord(item, now);
      records.push(record);
      byId.set(record.newsId, record);
      dirty.add(record.newsId);
      continue;
    }

    if (existing.sourceHash !== item.sourceHash && existing.aiStatus !== 'accepted') {
      existing.sourceHash = item.sourceHash;
      existing.originalTitle = item.originalTitle;
      existing.originalSummary = item.originalSummary;
      existing.aiStatus = 'pending';
      existing.retryCount = 0;
      existing.nextRetryAt = null;
      existing.lastError = null;
      existing.rejectionReasons = [];
      dirty.add(existing.newsId);
    }
  }
}

function retainCatalogRecords(records, limit) {
  const sorted = [...records].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  return sorted.slice(0, limit);
}

async function saveCatalogIfChanged(kv, previousIds, records, now) {
  const ids = records.map((record) => record.newsId);
  if (arraysEqual(previousIds || [], ids)) return;
  await kv.put(CATALOG_KEY, JSON.stringify({
    version: 1,
    pipelineVersion: PIPELINE_VERSION,
    updatedAt: now,
    ids
  }));
}

async function writeRecords(kv, records) {
  await Promise.all(records.map((record) => writeRecord(kv, record)));
}

async function writeRecord(kv, record) {
  await kv.put(recordKey(record.newsId), JSON.stringify(cleanStringsDeep(record)));
}

function recordKey(newsId) {
  return `${RECORD_PREFIX}${newsId}`;
}

async function readJson(kv, key) {
  try {
    const raw = await kv.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('KV JSON read failed', { key, error: sanitizeError(error) });
    return null;
  }
}

function emptyPayload() {
  const now = new Date().toISOString();
  return {
    schemaVersion: '2.0',
    pipelineVersion: PIPELINE_VERSION,
    source: FEED.source,
    feed: FEED.feed,
    updatedAt: null,
    lastFetchStatus: {
      status: 'empty',
      checkedAt: now,
      updatedAt: null,
      acceptedItems: 0,
      queue: { pending: 0, processing: 0, accepted: 0, rejected: 0, failed: 0, total: 0, due: 0 },
      message: 'No accepted editorial content has been generated yet.'
    },
    highlights: [],
    items: []
  };
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
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

function assertBindings(env) {
  if (!env.NEWS_KV) throw new Error('Missing NEWS_KV binding.');
}

function isAiEnabled(env) {
  return isEnabled(env.AI_ENABLED) && Boolean(env.AI);
}

function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
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

function sanitizeError(error) {
  const message = error?.name === 'AbortError' ? 'timeout' : (error?.message || String(error));
  return normalizeWhitespace(message).slice(0, 300);
}

function pushSample(samples, sample, limit = 5) {
  if (samples.length < limit) samples.push(sample);
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
