import { XMLParser } from 'fast-xml-parser';
import {
  EDITORIAL_GENERATION_VERSION,
  FACT_EXTRACTION_VERSION,
  PIPELINE_MODES,
  PIPELINE_VERSION,
  buildEditorialPrompt,
  buildFactExtractionPrompt,
  buildPhase1EditorialPrompt,
  buildPhase1EditorialRequest,
  buildPhase1FactRequest,
  buildWorkersAiJsonRequest,
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
  normalizeFactExtractionResponse,
  normalizePhase1EditorialResponse,
  normalizeWhitespace,
  recoverStaleProcessing,
  selectQueueRecords,
  stripHtml,
  summarizeQueue,
  summarizeEvidenceExtraction,
  summarizeFactExtraction,
  validateEditorialResult,
  validateFactExtraction,
  validateFrozenFactExtraction,
  validatePhase1EditorialResult
} from './pipeline.js';

const FEED = {
  source: 'RealGM',
  feed: 'https://basketball.realgm.com/rss/wiretap/15/0.xml'
};

const NEWS_KEY = 'news.json';
const CATALOG_KEY = 'news:catalog:v1';
const RECORD_PREFIX = 'news:item:';
const DEFAULT_AI_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
const DEFAULT_AI_FALLBACK_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
const DEFAULT_CATALOG_LIMIT = 120;
const PRIMARY_JSON_MAX_TOKENS = 2400;
const PRIMARY_JSON_RETRY_MAX_TOKENS = 4000;
const FACT_JSON_MAX_TOKENS = 3200;
const FACT_JSON_RETRY_MAX_TOKENS = 4800;
const EDITORIAL_JSON_MAX_TOKENS = 2200;
const EDITORIAL_JSON_RETRY_MAX_TOKENS = 3400;

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

    if (url.pathname === '/debug/reprocess') {
      const auth = authorizeDebugAction(request, env);
      if (!auth.ok) return jsonResponse({ error: auth.message }, {
        status: auth.status,
        headers: { 'cache-control': 'no-store' }
      });
      if (request.method === 'GET') return listRejectedForDebug(env);
      if (request.method === 'POST') return reprocessRejectedForDebug(request, env);
      return jsonResponse({ error: 'Method not allowed.' }, {
        status: 405,
        headers: {
          allow: 'GET, POST',
          'cache-control': 'no-store'
        }
      });
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
      pipelineMode: getPipelineMode(env),
      factExtractionVersion: FACT_EXTRACTION_VERSION,
      editorialGenerationVersion: EDITORIAL_GENERATION_VERSION,
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
    pipelineMode: getPipelineMode(env),
    factExtractionVersion: FACT_EXTRACTION_VERSION,
    editorialGenerationVersion: EDITORIAL_GENERATION_VERSION,
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

async function listRejectedForDebug(env) {
  assertBindings(env);
  const records = await readCatalogRecords(env);
  const items = records
    .filter((record) => record.aiStatus === 'rejected')
    .sort((a, b) => new Date(b.lastAttemptAt || b.processedAt || 0) - new Date(a.lastAttemptAt || a.processedAt || 0))
    .slice(0, 20)
    .map((record) => ({
      newsId: record.newsId,
      originalTitle: record.originalTitle,
      retryCount: record.retryCount || 0,
      lastAttemptAt: record.lastAttemptAt || null,
      nextRetryAt: record.nextRetryAt || null,
      rejectionReasons: [...(record.rejectionReasons || [])]
    }));

  return jsonResponse({
    ok: true,
    dryRunOnly: true,
    count: items.length,
    items
  }, {
    headers: { 'cache-control': 'no-store' }
  });
}

async function reprocessRejectedForDebug(request, env) {
  assertBindings(env);
  if (!isAiEnabled(env)) {
    return jsonResponse({ error: 'Workers AI is not enabled.' }, {
      status: 503,
      headers: { 'cache-control': 'no-store' }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'A JSON body is required.' }, {
      status: 400,
      headers: { 'cache-control': 'no-store' }
    });
  }

  const newsId = normalizeWhitespace(body?.newsId || '');
  const requestedMode = normalizeWhitespace(body?.pipelineMode || '');
  const pipelineMode = requestedMode
    ? getPipelineMode({ ...env, EDITORIAL_PIPELINE_MODE: requestedMode })
    : getPipelineMode(env);
  const evaluateAccepted = body?.evaluateAccepted === true && pipelineMode === 'phase1';
  const stage1Only = body?.stage1Only === true && pipelineMode === 'phase1';
  const stage2Only = body?.stage2Only === true && pipelineMode === 'phase1';
  if (body?.dryRun !== true) {
    return jsonResponse({ error: 'dryRun must be true.' }, {
      status: 400,
      headers: { 'cache-control': 'no-store' }
    });
  }
  if (stage1Only && stage2Only) {
    return jsonResponse({ error: 'stage1Only and stage2Only cannot both be true.' }, {
      status: 400,
      headers: { 'cache-control': 'no-store' }
    });
  }
  if (!/^news_[a-f0-9]{24}$/.test(newsId)) {
    return jsonResponse({ error: 'A valid newsId is required.' }, {
      status: 400,
      headers: { 'cache-control': 'no-store' }
    });
  }

  const frozenFactValidation = stage2Only
    ? validateFrozenFactExtraction(body?.factExtraction)
    : null;
  if (stage2Only && !frozenFactValidation.ok) {
    return jsonResponse({
      error: 'stage2Only requires a structurally valid frozen factExtraction.',
      rejectionReasons: frozenFactValidation.reasons
    }, {
      status: 400,
      headers: { 'cache-control': 'no-store' }
    });
  }

  let storedRecord;
  if (stage2Only) {
    storedRecord = {
      newsId,
      source: normalizeWhitespace(body?.source || 'RealGM'),
      publishedAt: normalizeWhitespace(body?.publishedAt || ''),
      sourceHash: `frozen-stage2:${newsId}`,
      originalTitle: '',
      originalSummary: '',
      url: '',
      storyType: frozenFactValidation.value.storyType,
      category: '',
      importance: 0,
      aiStatus: normalizeWhitespace(body?.previousAiStatus || 'rejected')
    };
  } else {
    const catalog = await readJson(env.NEWS_KV, CATALOG_KEY);
    if (!Array.isArray(catalog?.ids) || !catalog.ids.includes(newsId)) {
      return jsonResponse({ error: 'News record not found.' }, {
        status: 404,
        headers: { 'cache-control': 'no-store' }
      });
    }

    storedRecord = await readJson(env.NEWS_KV, recordKey(newsId));
    if (!storedRecord?.newsId) {
      return jsonResponse({ error: 'News record not found.' }, {
        status: 404,
        headers: { 'cache-control': 'no-store' }
      });
    }
  }
  if (
    !stage2Only &&
    storedRecord.aiStatus !== 'rejected' &&
    !(evaluateAccepted && storedRecord.aiStatus === 'accepted')
  ) {
    return jsonResponse({
      error: 'Only rejected news can be reprocessed unless phase1 accepted-record evaluation is explicitly enabled.',
      newsId,
      aiStatus: storedRecord.aiStatus || 'unknown'
    }, {
      status: 409,
      headers: { 'cache-control': 'no-store' }
    });
  }

  const testRecord = JSON.parse(JSON.stringify(storedRecord));
  const startedAt = new Date().toISOString();
  testRecord.aiStatus = 'processing';
  testRecord.processingStartedAt = startedAt;
  testRecord.lastAttemptAt = startedAt;
  testRecord.lastError = null;
  testRecord.rejectionReasons = [];
  testRecord.rejectionStage = null;
  if (pipelineMode !== 'single') {
    testRecord.editorial = null;
    resetPhase1RecordState(testRecord);
  }

  const stats = createDebugAiStats();
  const snapshots = [];
  await processRecord(testRecord, env, stats, snapshots, pipelineMode, {
    stage1Only,
    stage2Only,
    frozenFactExtraction: frozenFactValidation?.value || null
  });
  const qwenSnapshot = snapshots.find((snapshot) => snapshot.stage === 'qwen-primary') || null;
  const factSnapshot = snapshots.find((snapshot) => snapshot.stage === 'phase1-fact-extraction') || null;
  const editorialSnapshot = snapshots.find((snapshot) => snapshot.stage === 'phase1-editorial-generation') || null;
  const finalSnapshot = snapshots.at(-1) || null;

  return jsonResponse({
    ok: true,
    dryRun: true,
    persisted: false,
    newsId,
    originalTitle: storedRecord.originalTitle,
    previousAiStatus: storedRecord.aiStatus,
    resultAiStatus: testRecord.aiStatus,
    pipelineMode,
    stage1Only,
    stage2Only,
    pipelineVersion: PIPELINE_VERSION,
    factExtractionVersion: FACT_EXTRACTION_VERSION,
    editorialGenerationVersion: EDITORIAL_GENERATION_VERSION,
    aiSelected: 1,
    aiRequests: stats.requests,
    factStageRequests: stats.factStageRequests,
    editorialStageRequests: stats.editorialStageRequests,
    aiAccepted: stats.accepted,
    aiRejected: stats.rejected,
    aiFailed: stats.failed,
    qwenBaseline: {
      attempts: stats.qwenAttempts,
      retries: stats.qwenRetries,
      parsed: stats.qwenParsed,
      emptyContent: stats.qwenEmptyContent,
      lengthStops: stats.qwenLengthStops,
      invalidJson: stats.qwenInvalidJson
    },
    factExtraction: factSnapshot?.factExtraction || null,
    evidenceExtraction: factSnapshot?.evidenceExtraction || null,
    factValidation: factSnapshot?.factValidation || null,
    qwenFinalParsedJson: (editorialSnapshot || qwenSnapshot)?.qwenFinalParsedJson || null,
    titleZh: (editorialSnapshot || qwenSnapshot || finalSnapshot)?.titleZh || '',
    summaryZh: (editorialSnapshot || qwenSnapshot || finalSnapshot)?.summaryZh || '',
    oneLineZh: (editorialSnapshot || qwenSnapshot || finalSnapshot)?.oneLineZh || '',
    fallbackInvoked: Boolean(finalSnapshot?.fallbackInvoked),
    fallbackReason: finalSnapshot?.fallbackReason || null,
    rejectionStage: testRecord.rejectionStage || null,
    rejectionReasons: (editorialSnapshot || factSnapshot || qwenSnapshot || finalSnapshot)?.rejectionReasons ||
      testRecord.rejectionReasons || [],
    snapshots
  }, {
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
        pipelineMode: getPipelineMode(env),
        factExtractionVersion: FACT_EXTRACTION_VERSION,
        editorialGenerationVersion: EDITORIAL_GENERATION_VERSION,
        ...meta
      }
    });
    await env.NEWS_KV.put(NEWS_KEY, JSON.stringify(failedPayload));
    throw new RefreshError('RealGM RSS fetch failed.', failedPayload);
  }

  const incoming = await normalizeIncomingItems(feedResult.items);
  const state = await loadContentState(env, previousPayload, checkedAt);
  const dirty = new Set(state.dirtyIds);
  const pipelineMode = getPipelineMode(env);

  for (const newsId of recoverStaleProcessing(state.records, nowMs)) dirty.add(newsId);
  mergeIncoming(state.records, incoming, checkedAt, dirty);

  const catalogLimit = clampInteger(env.NEWS_CATALOG_LIMIT, DEFAULT_CATALOG_LIMIT, 40, 200);
  state.records = retainCatalogRecords(state.records, catalogLimit);
  const selected = isAiEnabled(env)
    ? selectRecordsForPipelineMode(
        state.records,
        pipelineMode,
        clampInteger(env.AI_MAX_ITEMS_PER_RUN, 3, 1, 10),
        nowMs
      )
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
    fallbackRequests: 0,
    fallbackAccepted: 0,
    qwenAttempts: 0,
    qwenRetries: 0,
    qwenParsed: 0,
    qwenEmptyContent: 0,
    qwenLengthStops: 0,
    qwenInvalidJson: 0,
    factStageRequests: 0,
    factStageParsed: 0,
    factStageRejected: 0,
    editorialStageRequests: 0,
    editorialStageParsed: 0,
    editorialStageRejected: 0,
    stage2Skipped: 0,
    rejectionSamples: []
  };

  for (const record of selected) {
    await processRecord(record, env, aiStats, null, pipelineMode);
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
    pipelineMode,
    aiModel: env.AI_MODEL || DEFAULT_AI_MODEL,
    aiFallbackModel: env.AI_FALLBACK_MODEL || DEFAULT_AI_FALLBACK_MODEL,
    aiSelected: aiStats.selected,
    aiRequests: aiStats.requests,
    aiFallbackRequests: aiStats.fallbackRequests,
    aiFallbackAccepted: aiStats.fallbackAccepted,
    aiAccepted: aiStats.accepted,
    aiRejected: aiStats.rejected,
    aiFailed: aiStats.failed,
    factExtractionVersion: FACT_EXTRACTION_VERSION,
    editorialGenerationVersion: EDITORIAL_GENERATION_VERSION,
    factStageRequests: aiStats.factStageRequests,
    factStageParsed: aiStats.factStageParsed,
    factStageRejected: aiStats.factStageRejected,
    editorialStageRequests: aiStats.editorialStageRequests,
    editorialStageParsed: aiStats.editorialStageParsed,
    editorialStageRejected: aiStats.editorialStageRejected,
    stage2Skipped: aiStats.stage2Skipped,
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
    pipelineMode,
    factExtractionVersion: FACT_EXTRACTION_VERSION,
    editorialGenerationVersion: EDITORIAL_GENERATION_VERSION,
    fetchedItems: feedResult.items.length,
    acceptedItems: payload.items.length,
    aiSelected: aiStats.selected,
    aiRequests: aiStats.requests,
    aiAccepted: aiStats.accepted,
    aiRejected: aiStats.rejected,
    aiFailed: aiStats.failed,
    factStageRequests: aiStats.factStageRequests,
    editorialStageRequests: aiStats.editorialStageRequests,
    stage2Skipped: aiStats.stage2Skipped,
    qwenBaseline: {
      attempts: aiStats.qwenAttempts,
      retries: aiStats.qwenRetries,
      parsed: aiStats.qwenParsed,
      emptyContent: aiStats.qwenEmptyContent,
      lengthStops: aiStats.qwenLengthStops,
      invalidJson: aiStats.qwenInvalidJson
    },
    queue
  });

  return payload;
}

async function processRecord(
  record,
  env,
  stats,
  debugSnapshots = null,
  pipelineMode = getPipelineMode(env),
  options = {}
) {
  if (pipelineMode !== 'single') {
    return processRecordPhase1(record, env, stats, debugSnapshots, pipelineMode, options);
  }
  const articleText = await extractArticleText(record.url, record.originalTitle, env);
  try {
    let aiResult = await summarizeWithWorkersAi(record, articleText, env);
    stats.requests += aiResult.requestCount;
    stats.fallbackRequests += aiResult.fallbackRequestCount;
    mergeQwenDiagnostics(stats, aiResult.qwenDiagnostics);
    let validation = validateEditorialResult(aiResult.normalized.parsed, record, articleText);
    const primaryDebug = logEditorialQualityDebug(
      record,
      aiResult,
      validation,
      aiResult.modelUsed === getFallbackModel(env)
        ? 'json-fallback-after-structural-qwen-failure'
        : 'qwen-primary'
    );
    if (debugSnapshots) debugSnapshots.push(primaryDebug);

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
        unsafeFragments: validation.details.unsafeFragments
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
      model: aiResult.modelUsed,
      generatedAt: record.processedAt,
      editorSource: 'workers-ai',
      pipelineVersion: PIPELINE_VERSION
    };
    stats.accepted += 1;
  } catch (error) {
    stats.requests += Number(error?.aiRequestCount) || 0;
    stats.fallbackRequests += Number(error?.aiFallbackRequestCount) || 0;
    mergeQwenDiagnostics(stats, error?.qwenDiagnostics);
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

async function processRecordPhase1(record, env, stats, debugSnapshots, pipelineMode, options = {}) {
  const articleText = options.stage2Only
    ? ''
    : await extractArticleText(record.url, record.originalTitle, env);
  const model = env.AI_MODEL || DEFAULT_AI_MODEL;
  const sourceHash = record.sourceHash || '';
  const factCacheKey = `${FACT_EXTRACTION_VERSION}:${sourceHash}`;
  const editorialCacheKey = `${EDITORIAL_GENERATION_VERSION}:${sourceHash}`;
  const cachedFactVersion = record.factExtractionVersion;
  const cachedFactKey = record.factExtractionCacheKey;
  let factExtraction = null;

  record.pipelineVersion = PIPELINE_VERSION;
  record.factExtractionVersion = FACT_EXTRACTION_VERSION;
  record.editorialGenerationVersion = EDITORIAL_GENERATION_VERSION;
  record.factExtractionCacheKey = factCacheKey;
  record.editorialGenerationCacheKey = editorialCacheKey;
  record.factStageRequests = 0;
  record.editorialStageRequests = 0;
  record.rejectionStage = null;
  record.finalGateStatus = 'pending';

  try {
    if (options.stage2Only) {
      const frozenValidation = validateFrozenFactExtraction(options.frozenFactExtraction);
      if (!frozenValidation.ok) {
        rejectPhase1Record(
          record,
          stats,
          'fact-validation',
          frozenValidation.reasons,
          frozenValidation.details
        );
        stats.factStageRejected += 1;
        stats.stage2Skipped += 1;
        return;
      }
      factExtraction = frozenValidation.value;
      record.factExtraction = factExtraction;
      record.factExtractionStatus = 'accepted';
      record.factValidationStatus = 'accepted';
      record.factValidation = compactFactValidation(frozenValidation);
    }

    const hasValidFactCache = (
      !options.stage2Only &&
      record.factExtraction &&
      record.factValidationStatus === 'accepted' &&
      cachedFactVersion === FACT_EXTRACTION_VERSION &&
      cachedFactKey === factCacheKey
    );

    if (hasValidFactCache) {
      const cachedValidation = validateFactExtraction(record.factExtraction, record, articleText);
      if (cachedValidation.ok) {
        factExtraction = cachedValidation.value;
        record.factExtraction = factExtraction;
        record.factExtractionStatus = 'accepted';
        record.factValidationStatus = 'accepted';
        record.factValidation = compactFactValidation(cachedValidation);
      }
    }

    if (!factExtraction) {
      record.factExtractionStatus = 'processing';
      record.factValidationStatus = 'pending';
      const factPrompt = buildFactExtractionPrompt(record, articleText);
      const factResult = await runQwenStructuredStage({
        env,
        model,
        newsId: record.newsId,
        stage: 'phase1-fact-extraction',
        prompt: factPrompt,
        attempts: [
          { maxTokens: FACT_JSON_MAX_TOKENS, retry: false },
          { maxTokens: FACT_JSON_RETRY_MAX_TOKENS, retry: true }
        ],
        buildRequest: buildPhase1FactRequest,
        normalizeResponse: normalizeFactExtractionResponse
      });
      addStageStats(stats, 'fact', factResult);
      record.factStageRequests = factResult.requestCount;

      if (!factResult.normalized?.parsed) {
        record.factExtractionStatus = 'rejected';
        record.factValidationStatus = 'rejected';
        const reasons = ['fact-schema-invalid'];
        const snapshot = logPhase1FactDebug(record, factResult, {
          ok: false,
          reasons,
          details: {
            structuralFailureReason: factResult.failureReason,
            incompleteShape: factResult.normalized?.incompleteShape || null
          }
        }, pipelineMode);
        if (debugSnapshots) debugSnapshots.push(snapshot);
        rejectPhase1Record(record, stats, 'fact-extraction', reasons, {
          structuralFailureReason: factResult.failureReason,
          incompleteShape: factResult.normalized?.incompleteShape || null
        });
        stats.factStageRejected += 1;
        stats.stage2Skipped += 1;
        return;
      }

      stats.factStageParsed += 1;
      const factValidation = validateFactExtraction(
        factResult.normalized.parsed,
        record,
        articleText
      );
      const snapshot = logPhase1FactDebug(record, factResult, factValidation, pipelineMode);
      if (debugSnapshots) debugSnapshots.push(snapshot);
      if (!factValidation.ok) {
        record.factExtractionStatus = 'accepted';
        record.factValidationStatus = 'rejected';
        record.factExtraction = factValidation.value;
        record.factValidation = compactFactValidation(factValidation);
        rejectPhase1Record(
          record,
          stats,
          'fact-validation',
          factValidation.reasons,
          factValidation.details
        );
        stats.factStageRejected += 1;
        stats.stage2Skipped += 1;
        return;
      }

      factExtraction = factValidation.value;
      record.factExtraction = factExtraction;
      record.factExtractionStatus = 'accepted';
      record.factValidationStatus = 'accepted';
      record.factValidation = compactFactValidation(factValidation);
    } else {
      const snapshot = {
        newsId: record.newsId,
        originalTitle: record.originalTitle,
        stage: 'phase1-fact-extraction',
        model,
        pipelineMode,
        cacheHit: true,
        frozenInput: Boolean(options.stage2Only),
        factExtraction: summarizeFactExtraction(factExtraction),
        factValidation: record.factValidation,
        stageRequests: 0,
        rejectionReasons: []
      };
      console.log('Phase 1 fact extraction debug', snapshot);
      if (debugSnapshots) debugSnapshots.push(snapshot);
    }

    if (options.stage1Only) {
      record.aiStatus = 'pending';
      record.processingStartedAt = null;
      record.nextRetryAt = null;
      record.rejectionStage = null;
      record.rejectionReasons = [];
      record.lastError = null;
      record.editorialGenerationStatus = 'pending';
      record.finalGateStatus = 'pending';
      stats.stage2Skipped += 1;
      return;
    }

    record.editorialGenerationStatus = 'processing';
    const editorialPrompt = buildPhase1EditorialPrompt(factExtraction, record);
    const editorialResult = await runQwenStructuredStage({
      env,
      model,
      newsId: record.newsId,
      stage: 'phase1-editorial-generation',
      prompt: editorialPrompt,
      attempts: [
        { maxTokens: EDITORIAL_JSON_MAX_TOKENS, retry: false },
        { maxTokens: EDITORIAL_JSON_RETRY_MAX_TOKENS, retry: true }
      ],
      buildRequest: buildPhase1EditorialRequest,
      normalizeResponse: normalizePhase1EditorialResponse
    });
    addStageStats(stats, 'editorial', editorialResult);
    record.editorialStageRequests = editorialResult.requestCount;

    if (!editorialResult.normalized?.parsed) {
      record.editorialGenerationStatus = 'rejected';
      record.finalGateStatus = 'rejected';
      const reasons = ['invalid-json-shape'];
      const snapshot = logPhase1EditorialDebug(record, editorialResult, {
        ok: false,
        reasons,
        details: {
          addedFacts: [],
          missingFacts: [],
          unsafeFragments: [editorialResult.failureReason || 'qwen-structural-failure']
        }
      }, pipelineMode);
      if (debugSnapshots) debugSnapshots.push(snapshot);
      rejectPhase1Record(record, stats, 'editorial-generation', reasons, {
        structuralFailureReason: editorialResult.failureReason
      });
      stats.editorialStageRejected += 1;
      return;
    }

    stats.editorialStageParsed += 1;
    const validation = validatePhase1EditorialResult(
      editorialResult.normalized.parsed,
      record,
      factExtraction
    );
    const snapshot = logPhase1EditorialDebug(record, editorialResult, validation, pipelineMode);
    if (debugSnapshots) debugSnapshots.push(snapshot);
    if (!validation.ok) {
      record.editorialGenerationStatus = 'accepted';
      record.finalGateStatus = 'rejected';
      rejectPhase1Record(
        record,
        stats,
        'final-gate',
        validation.reasons,
        validation.details
      );
      stats.editorialStageRejected += 1;
      return;
    }

    const processedAt = new Date().toISOString();
    record.aiStatus = 'accepted';
    record.processedAt = processedAt;
    record.processingStartedAt = null;
    record.nextRetryAt = null;
    record.rejectionReasons = [];
    record.rejectionStage = null;
    record.lastError = null;
    record.category = validation.value.categoryZh;
    record.expectedFactLevel = validation.value.factLevel;
    record.editorialGenerationStatus = 'accepted';
    record.finalGateStatus = 'accepted';
    record.editorial = {
      ...validation.value,
      model,
      generatedAt: processedAt,
      editorSource: 'workers-ai-phase1',
      pipelineVersion: PIPELINE_VERSION,
      factExtractionVersion: FACT_EXTRACTION_VERSION,
      editorialGenerationVersion: EDITORIAL_GENERATION_VERSION
    };
    stats.accepted += 1;
  } catch (error) {
    record.aiStatus = 'failed';
    record.retryCount = (record.retryCount || 0) + 1;
    record.processedAt = new Date().toISOString();
    record.processingStartedAt = null;
    record.nextRetryAt = getRetrySchedule('failed', record.retryCount);
    record.rejectionReasons = [];
    record.rejectionStage = 'pipeline-error';
    record.lastError = sanitizeError(error);
    record.editorial = null;
    record.finalGateStatus = 'failed';
    stats.failed += 1;
    console.warn('Phase 1 pipeline failed unexpectedly', {
      newsId: record.newsId,
      pipelineMode,
      error: record.lastError
    });
  }
}

async function runQwenStructuredStage({
  env,
  model,
  newsId,
  stage,
  prompt,
  attempts,
  buildRequest,
  normalizeResponse
}) {
  const qwenDiagnostics = createQwenDiagnostics();
  let requestCount = 0;
  let normalized = null;
  let failureReason = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    requestCount += 1;
    qwenDiagnostics.attempts += 1;
    if (attempt.retry) qwenDiagnostics.retries += 1;
    try {
      const response = await env.AI.run(
        model,
        buildRequest(prompt, attempt.maxTokens, { retry: attempt.retry })
      );
      normalized = normalizeResponse(response);
      if (normalized.parsed) {
        qwenDiagnostics.parsed += 1;
        return {
          normalized,
          requestCount,
          modelUsed: model,
          qwenDiagnostics,
          fallbackInvoked: false,
          fallbackReason: null,
          failureReason: null
        };
      }
      failureReason = normalized.structuralFailureReason;
      if (!normalized.rawContent) qwenDiagnostics.emptyContent += 1;
      if (normalized.finishReason.toLowerCase() === 'length') {
        qwenDiagnostics.lengthStops += 1;
      } else {
        qwenDiagnostics.invalidJson += 1;
      }
      console.warn('Phase 1 Qwen stage returned no valid structured JSON', {
        newsId,
        stage,
        attempt: index + 1,
        finishReason: normalized.finishReason,
        contentLength: normalized.contentLength,
        failureReason,
        incompleteShape: normalized.incompleteShape || null
      });
    } catch (error) {
      failureReason = 'qwen-request-error';
      console.warn('Phase 1 Qwen stage request failed', {
        newsId,
        stage,
        attempt: index + 1,
        error: sanitizeError(error)
      });
    }
  }

  return {
    normalized,
    requestCount,
    modelUsed: model,
    qwenDiagnostics,
    fallbackInvoked: false,
    fallbackReason: null,
    failureReason: failureReason || 'qwen-structural-failure'
  };
}

function addStageStats(stats, stage, result) {
  stats.requests += result.requestCount;
  mergeQwenDiagnostics(stats, result.qwenDiagnostics);
  if (stage === 'fact') stats.factStageRequests += result.requestCount;
  if (stage === 'editorial') stats.editorialStageRequests += result.requestCount;
}

function rejectPhase1Record(record, stats, stage, reasons, details = {}) {
  record.aiStatus = 'rejected';
  record.retryCount = (record.retryCount || 0) + 1;
  record.processedAt = new Date().toISOString();
  record.processingStartedAt = null;
  record.nextRetryAt = getRetrySchedule('rejected', record.retryCount);
  record.rejectionStage = stage;
  record.rejectionReasons = [...new Set(reasons)];
  record.lastError = record.rejectionReasons.join(',');
  record.editorial = null;
  stats.rejected += 1;
  pushSample(stats.rejectionSamples, {
    newsId: record.newsId,
    originalTitle: record.originalTitle,
    stage,
    reasons: record.rejectionReasons,
    details: cleanStringsDeep(details)
  });
}

function compactFactValidation(validation) {
  return {
    ok: Boolean(validation?.ok),
    reasons: [...(validation?.reasons || [])],
    details: cleanStringsDeep(validation?.details || {}),
    validatedAt: new Date().toISOString()
  };
}

function resetPhase1RecordState(record) {
  record.pipelineVersion = PIPELINE_VERSION;
  record.factExtractionVersion = null;
  record.editorialGenerationVersion = null;
  record.factExtractionCacheKey = null;
  record.editorialGenerationCacheKey = null;
  record.factExtractionStatus = 'pending';
  record.factValidationStatus = 'pending';
  record.editorialGenerationStatus = 'pending';
  record.finalGateStatus = 'pending';
  record.factStageRequests = 0;
  record.editorialStageRequests = 0;
  record.factExtraction = null;
  record.factValidation = null;
}

function logPhase1FactDebug(record, result, validation, pipelineMode) {
  const snapshot = {
    newsId: record.newsId,
    originalTitle: record.originalTitle,
    stage: 'phase1-fact-extraction',
    model: result?.modelUsed || '',
    pipelineMode,
    factExtractionVersion: FACT_EXTRACTION_VERSION,
    evidenceExtraction: summarizeEvidenceExtraction(result?.normalized?.parsed),
    factExtraction: summarizeFactExtraction(validation?.value),
    factValidation: {
      ok: Boolean(validation?.ok),
      reasons: [...(validation?.reasons || [])],
      details: cleanStringsDeep(validation?.details || {})
    },
    stageRequests: result?.requestCount || 0,
    fallbackInvoked: false,
    fallbackReason: null,
    rejectionReasons: [...(validation?.reasons || [])]
  };
  console.log('Phase 1 fact extraction debug', snapshot);
  return snapshot;
}

function logPhase1EditorialDebug(record, result, validation, pipelineMode) {
  const parsed = result?.normalized?.parsed;
  const snapshot = {
    newsId: record.newsId,
    originalTitle: record.originalTitle,
    stage: 'phase1-editorial-generation',
    model: result?.modelUsed || '',
    pipelineMode,
    editorialGenerationVersion: EDITORIAL_GENERATION_VERSION,
    qwenFinalParsedJson: parsed
      ? {
          titleZh: normalizeWhitespace(parsed.titleZh || ''),
          summaryZh: normalizeWhitespace(parsed.summaryZh || ''),
          oneLineZh: normalizeWhitespace(parsed.oneLineZh || ''),
          categoryZh: normalizeWhitespace(parsed.categoryZh || ''),
          tagsZh: Array.isArray(parsed.tagsZh)
            ? parsed.tagsZh.map((tag) => normalizeWhitespace(tag)).filter(Boolean)
            : [],
          confidence: parsed.confidence
        }
      : null,
    titleZh: normalizeWhitespace(parsed?.titleZh || ''),
    summaryZh: normalizeWhitespace(parsed?.summaryZh || ''),
    oneLineZh: normalizeWhitespace(parsed?.oneLineZh || ''),
    stageRequests: result?.requestCount || 0,
    fallbackInvoked: false,
    fallbackReason: null,
    factPlan: validation?.factPlan || null,
    rejectionReasons: [...(validation?.reasons || [])],
    addedFacts: [...(validation?.details?.addedFacts || [])],
    missingFacts: [...(validation?.details?.missingFacts || [])],
    unsafeFragments: [...(validation?.details?.unsafeFragments || [])]
  };
  console.log('Phase 1 editorial quality debug', snapshot);
  return snapshot;
}

async function summarizeWithWorkersAi(record, articleText, env) {
  const model = env.AI_MODEL || DEFAULT_AI_MODEL;
  const fallbackModel = getFallbackModel(env);
  const prompt = buildEditorialPrompt(record, articleText);
  let requestCount = 0;
  let primaryError = null;
  let fallbackReason = null;
  const qwenDiagnostics = createQwenDiagnostics();
  const attempts = [
    { maxTokens: PRIMARY_JSON_MAX_TOKENS, retry: false },
    { maxTokens: PRIMARY_JSON_RETRY_MAX_TOKENS, retry: true }
  ];

  try {
    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      try {
        requestCount += 1;
        qwenDiagnostics.attempts += 1;
        if (attempt.retry) qwenDiagnostics.retries += 1;
        const response = await env.AI.run(
          model,
          buildWorkersAiRequest(prompt, attempt.maxTokens, { retry: attempt.retry })
        );
        const normalized = normalizeAiResponse(response);
        if (normalized.parsed) {
          qwenDiagnostics.parsed += 1;
          return {
            normalized,
            requestCount,
            fallbackRequestCount: 0,
            modelUsed: model,
            fallbackInvoked: false,
            fallbackReason: null,
            qwenDiagnostics
          };
        }
        fallbackReason = normalized.structuralFailureReason;

        if (!normalized.rawContent) qwenDiagnostics.emptyContent += 1;
        if (normalized.finishReason.toLowerCase() === 'length') {
          qwenDiagnostics.lengthStops += 1;
        } else if (normalized.rawContent) {
          qwenDiagnostics.invalidJson += 1;
        }

        console.warn('Primary Workers AI model returned no parseable editorial JSON', {
          newsId: record.newsId,
          model,
          attempt: index + 1,
          retry: attempt.retry,
          maxTokens: attempt.maxTokens,
          finishReason: normalized.finishReason,
          contentLength: normalized.contentLength,
          contentPreview: normalized.rawContent.slice(0, 500)
        });
      } catch (error) {
        primaryError = error;
        fallbackReason = 'qwen-request-error';
        console.warn('Primary Workers AI model failed; trying structured fallback model', {
          newsId: record.newsId,
          model,
          attempt: index + 1,
          error: sanitizeError(error)
        });
        break;
      }
    }

    if (fallbackModel === model) {
      throw primaryError || new Error('Primary Workers AI model returned no structured editorial payload.');
    }

    const fallback = await runJsonFallback(prompt, fallbackModel, env, fallbackReason);
    return {
      ...fallback,
      requestCount: requestCount + fallback.requestCount,
      fallbackRequestCount: fallback.requestCount,
      qwenDiagnostics
    };
  } catch (error) {
    if (error && typeof error === 'object') {
      error.aiRequestCount = (Number(error.aiRequestCount) || 0) + requestCount;
      error.qwenDiagnostics = qwenDiagnostics;
      throw error;
    }
    const wrapped = new Error(String(error));
    wrapped.aiRequestCount = requestCount;
    wrapped.qwenDiagnostics = qwenDiagnostics;
    throw wrapped;
  }
}

async function runJsonFallback(prompt, model, env, fallbackReason) {
  try {
    const response = await env.AI.run(model, buildWorkersAiJsonRequest(prompt));
    return {
      normalized: normalizeAiResponse(response),
      requestCount: 1,
      fallbackRequestCount: 1,
      modelUsed: model,
      fallbackInvoked: true,
      fallbackReason: fallbackReason || 'qwen-structural-failure'
    };
  } catch (error) {
    if (error && typeof error === 'object') {
      error.aiRequestCount = (Number(error.aiRequestCount) || 0) + 1;
      error.aiFallbackRequestCount = (Number(error.aiFallbackRequestCount) || 0) + 1;
      throw error;
    }
    const wrapped = new Error(String(error));
    wrapped.aiRequestCount = 1;
    wrapped.aiFallbackRequestCount = 1;
    throw wrapped;
  }
}

function getFallbackModel(env) {
  return env.AI_FALLBACK_MODEL || DEFAULT_AI_FALLBACK_MODEL;
}

function createQwenDiagnostics() {
  return {
    attempts: 0,
    retries: 0,
    parsed: 0,
    emptyContent: 0,
    lengthStops: 0,
    invalidJson: 0
  };
}

function mergeQwenDiagnostics(stats, diagnostics) {
  if (!diagnostics) return;
  stats.qwenAttempts += Number(diagnostics.attempts) || 0;
  stats.qwenRetries += Number(diagnostics.retries) || 0;
  stats.qwenParsed += Number(diagnostics.parsed) || 0;
  stats.qwenEmptyContent += Number(diagnostics.emptyContent) || 0;
  stats.qwenLengthStops += Number(diagnostics.lengthStops) || 0;
  stats.qwenInvalidJson += Number(diagnostics.invalidJson) || 0;
}

function createDebugAiStats() {
  return {
    enabled: true,
    selected: 1,
    requests: 0,
    accepted: 0,
    rejected: 0,
    failed: 0,
    fallbackRequests: 0,
    fallbackAccepted: 0,
    qwenAttempts: 0,
    qwenRetries: 0,
    qwenParsed: 0,
    qwenEmptyContent: 0,
    qwenLengthStops: 0,
    qwenInvalidJson: 0,
    factStageRequests: 0,
    factStageParsed: 0,
    factStageRejected: 0,
    editorialStageRequests: 0,
    editorialStageParsed: 0,
    editorialStageRejected: 0,
    stage2Skipped: 0,
    rejectionSamples: []
  };
}

function logEditorialQualityDebug(record, aiResult, validation, stage) {
  const parsed = aiResult?.normalized?.parsed;
  const titleZh = normalizeWhitespace(parsed?.titleZh || '');
  const summaryZh = normalizeWhitespace(parsed?.summaryZh || '');
  const modelOneLineZh = normalizeWhitespace(parsed?.oneLineZh || '');
  const oneLineZh = modelOneLineZh || titleZh;
  const parsedJson = parsed && typeof parsed === 'object'
    ? {
        titleZh,
        summaryZh,
        ...(Object.hasOwn(parsed, 'oneLineZh') ? { oneLineZh: modelOneLineZh } : {}),
        categoryZh: normalizeWhitespace(parsed.categoryZh || ''),
        tagsZh: Array.isArray(parsed.tagsZh)
          ? parsed.tagsZh.map((tag) => normalizeWhitespace(tag)).filter(Boolean)
          : [],
        confidence: parsed.confidence,
        factLevel: normalizeWhitespace(parsed.factLevel || '')
      }
    : null;

  const snapshot = {
    newsId: record.newsId,
    originalTitle: record.originalTitle,
    stage,
    model: aiResult?.modelUsed || '',
    finalParsedJson: parsedJson,
    qwenFinalParsedJson: stage === 'qwen-primary' ? parsedJson : null,
    titleZh,
    summaryZh,
    oneLineZh,
    oneLineSource: modelOneLineZh ? 'model' : titleZh ? 'titleZh-derived' : 'missing',
    fallbackInvoked: Boolean(aiResult?.fallbackInvoked),
    fallbackReason: aiResult?.fallbackReason || null,
    rejectionReasons: [...(validation?.reasons || [])],
    addedFacts: [...(validation?.details?.addedFacts || [])],
    missingFacts: [...(validation?.details?.missingFacts || [])],
    unsafeFragments: [...(validation?.details?.unsafeFragments || [])]
  };
  console.log('AI editorial quality debug', snapshot);
  return snapshot;
}

async function extractArticleText(url, originalTitle, env) {
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
    const readerText = normalizeWhitespace(await response.text());
    const articleText = isolateReaderArticle(readerText, originalTitle);
    if (!articleText) {
      console.warn('Article extraction returned navigation or unrelated text; using RSS evidence only', {
        url
      });
      return '';
    }
    return articleText.slice(0, limit);
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

function isolateReaderArticle(readerText, originalTitle) {
  const text = normalizeWhitespace(readerText);
  const title = normalizeWhitespace(originalTitle);
  if (!text || !title) return '';

  const lowerText = text.toLowerCase();
  const titleIndex = lowerText.lastIndexOf(title.toLowerCase());
  if (titleIndex >= 0) return text.slice(titleIndex);

  const titleWords = title
    .toLowerCase()
    .match(/[a-z][a-z'-]{3,}/g)
    ?.filter((word) => !/^(?:with|from|after|before|could|would|sign|signs|agree|agrees|trade|traded)$/.test(word)) || [];
  const distinctive = [...new Set(titleWords)].slice(0, 6);
  const matches = distinctive.filter((word) => lowerText.includes(word));
  return distinctive.length >= 2 && matches.length >= Math.min(3, distinctive.length)
    ? text
    : '';
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
      .filter((item) => item.originalTitle && item.url)
      .filter((item) => !isNonStoryTitle(item.originalTitle));
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
  const imageUrl = normalizeLink(
    item['media:thumbnail']?.url ||
    item['media:content']?.url ||
    item.enclosure?.url ||
    ''
  );
  return {
    source: feedConfig.source,
    feed: feedConfig.feed,
    originalTitle: title,
    originalSummary: summary,
    summary,
    url: link,
    link,
    imageUrl,
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

    if (existing.sourceHash !== item.sourceHash && existing.aiStatus === 'accepted') {
      const refreshed = createPendingRecord(item, now);
      Object.assign(existing, {
        sourceHash: refreshed.sourceHash,
        originalTitle: refreshed.originalTitle,
        originalSummary: refreshed.originalSummary,
        imageUrl: refreshed.imageUrl,
        publishedAt: refreshed.publishedAt,
        storyType: refreshed.storyType,
        expectedFactLevel: refreshed.expectedFactLevel,
        category: refreshed.category,
        importance: refreshed.importance,
        eventKey: refreshed.eventKey
      });
      dirty.add(existing.newsId);
    } else if (existing.sourceHash !== item.sourceHash) {
      const replacement = createPendingRecord(item, now);
      Object.assign(existing, replacement, {
        queuedAt: existing.queuedAt || now
      });
      dirty.add(existing.newsId);
    } else if (!existing.imageUrl && item.imageUrl) {
      existing.imageUrl = item.imageUrl;
      dirty.add(existing.newsId);
    }
  }
}

function retainCatalogRecords(records, limit) {
  const sorted = records
    .filter((record) => !isNonStoryTitle(record.originalTitle))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  return sorted.slice(0, limit);
}

function isNonStoryTitle(value = '') {
  return /^(?:Get Your Latest NBA News From RealGM(?:'s)? Basketball Wiretap|RealGM Basketball Wiretap)$/i.test(
    normalizeWhitespace(value)
  );
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

async function readCatalogRecords(env) {
  const catalog = await readJson(env.NEWS_KV, CATALOG_KEY);
  if (!Array.isArray(catalog?.ids)) return [];
  return (await Promise.all(
    catalog.ids.map((newsId) => readJson(env.NEWS_KV, recordKey(newsId)))
  )).filter((record) => record?.newsId);
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

function authorizeDebugAction(request, env) {
  if (!env.REFRESH_TOKEN) {
    return {
      ok: false,
      status: 503,
      message: 'Debug reprocessing is unavailable because REFRESH_TOKEN is not configured.'
    };
  }
  const token = request.headers.get('x-refresh-token') || '';
  if (timingSafeEqual(token, env.REFRESH_TOKEN)) return { ok: true };
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

function getPipelineMode(env) {
  const value = normalizeWhitespace(env?.EDITORIAL_PIPELINE_MODE || '').toLowerCase();
  return PIPELINE_MODES.includes(value) ? value : 'single';
}

function selectRecordsForPipelineMode(records, pipelineMode, maxItems, nowMs) {
  if (pipelineMode === 'phase1-canary') {
    const newPending = records.filter((record) => (
      record.aiStatus === 'pending' &&
      (record.retryCount || 0) === 0 &&
      (!record.nextRetryAt || new Date(record.nextRetryAt).getTime() <= nowMs)
    ));
    return selectQueueRecords(newPending, 1, nowMs).slice(0, 1);
  }
  return selectQueueRecords(records, maxItems, nowMs);
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
