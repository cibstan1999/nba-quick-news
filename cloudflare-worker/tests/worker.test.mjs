import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

class MemoryKv {
  constructor() {
    this.values = new Map();
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async put(key, value) {
    this.values.set(key, String(value));
  }
}

test('Worker accepts a valid edit and does not process it again', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    assert.match(String(url), /basketball\.realgm\.com\/rss/);
    return new Response(`<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>Jaxson Hayes Agrees To Two-Year, $12M Deal With Lakers</title>
            <link>https://basketball.realgm.com/wiretap/1/jaxson-hayes-lakers</link>
            <pubDate>Mon, 27 Jul 2026 07:30:00 GMT</pubDate>
            <description>Jaxson Hayes has agreed to a two-year, $12 million contract with the Los Angeles Lakers.</description>
          </item>
        </channel>
      </rss>`, {
      status: 200,
      headers: { 'content-type': 'application/rss+xml' }
    });
  };

  const kv = new MemoryKv();
  let aiCalls = 0;
  const env = {
    NEWS_KV: kv,
    AI_ENABLED: 'true',
    AI_MAX_ITEMS_PER_RUN: '3',
    JINA_READER_ENABLED: 'false',
    AI_MODEL: '@cf/qwen/qwen3-30b-a3b-fp8',
    AI: {
      async run() {
        aiCalls += 1;
        return {
          response: {
            titleZh: '湖人与 Jaxson Hayes 达成 2 年续约合同',
            summaryZh: 'Jaxson Hayes 与湖人达成一份 2 年 1200 万美元合同，球队将继续把他留在内线轮换中。',
            categoryZh: '签约',
            tagsZh: ['湖人', '续约'],
            confidence: 0.9,
            factLevel: 'confirmed'
          },
          finish_reason: 'stop'
        };
      }
    }
  };

  const first = await worker.fetch(new Request('https://worker.example/refresh'), env);
  assert.equal(first.status, 200);
  const firstPayload = await first.json();
  assert.equal(firstPayload.items.length, 1);
  assert.equal(firstPayload.items[0].aiStatus, 'accepted');
  assert.equal(firstPayload.lastFetchStatus.aiAccepted, 1);
  assert.equal(aiCalls, 1);

  const second = await worker.fetch(new Request('https://worker.example/refresh'), env);
  assert.equal(second.status, 200);
  const secondPayload = await second.json();
  assert.equal(secondPayload.items.length, 1);
  assert.equal(secondPayload.lastFetchStatus.aiSelected, 0);
  assert.equal(secondPayload.lastFetchStatus.aiRequests, 0);
  assert.equal(aiCalls, 1);
});

test('Worker retries Qwen once when reasoning consumes the response budget', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => new Response(`<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <item>
          <title>Jaxson Hayes Agrees To Two-Year, $12M Deal With Lakers</title>
          <link>https://basketball.realgm.com/wiretap/2/jaxson-hayes-lakers</link>
          <pubDate>Mon, 27 Jul 2026 07:30:00 GMT</pubDate>
          <description>Jaxson Hayes has agreed to a two-year, $12 million contract with the Los Angeles Lakers.</description>
        </item>
      </channel>
    </rss>`, {
    status: 200,
    headers: { 'content-type': 'application/rss+xml' }
  });

  const kv = new MemoryKv();
  const requests = [];
  const env = {
    NEWS_KV: kv,
    AI_ENABLED: 'true',
    AI_MAX_ITEMS_PER_RUN: '3',
    JINA_READER_ENABLED: 'false',
    AI_MODEL: '@cf/qwen/qwen3-30b-a3b-fp8',
    AI: {
      async run(model, request) {
        requests.push({ model, request });
        if (requests.length === 1) {
          return {
            choices: [{
              message: {
                content: null,
                reasoning: 'This reasoning must never be parsed or logged as editorial copy.'
              },
              finish_reason: 'length'
            }]
          };
        }
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                titleZh: '湖人与 Jaxson Hayes 达成 2 年续约合同',
                summaryZh: 'Jaxson Hayes 与湖人达成一份 2 年 1200 万美元合同，球队将继续把他留在内线轮换中。',
                categoryZh: '签约',
                tagsZh: ['湖人', '续约'],
                confidence: 0.9,
                factLevel: 'confirmed'
              })
            },
            finish_reason: 'stop'
          }]
        };
      }
    }
  };

  const response = await worker.fetch(new Request('https://worker.example/refresh'), env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.items[0].aiStatus, 'accepted');
  assert.equal(payload.lastFetchStatus.aiRequests, 2);
  assert.equal(requests.length, 2);
  assert.equal('tools' in requests[0].request, false);
  assert.equal(requests[0].request.max_tokens, 2400);
  assert.equal(requests[1].request.max_tokens, 4000);
  assert.match(requests[1].request.messages[1].content, /上一次响应没有产生可解析 JSON/);
});

test('Worker retries Qwen once after invalid JSON and accepts the corrected response', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => new Response(`<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <item>
          <title>Jaxson Hayes Agrees To Two-Year, $12M Deal With Lakers</title>
          <link>https://basketball.realgm.com/wiretap/3/jaxson-hayes-lakers</link>
          <pubDate>Mon, 27 Jul 2026 07:30:00 GMT</pubDate>
          <description>Jaxson Hayes has agreed to a two-year, $12 million contract with the Los Angeles Lakers.</description>
        </item>
      </channel>
    </rss>`, {
    status: 200,
    headers: { 'content-type': 'application/rss+xml' }
  });

  const kv = new MemoryKv();
  let aiCalls = 0;
  const env = {
    NEWS_KV: kv,
    AI_ENABLED: 'true',
    AI_MAX_ITEMS_PER_RUN: '3',
    JINA_READER_ENABLED: 'false',
    AI_MODEL: '@cf/qwen/qwen3-30b-a3b-fp8',
    AI: {
      async run() {
        aiCalls += 1;
        if (aiCalls === 1) {
          return {
            choices: [{
              message: { content: '{"titleZh":"未完成"' },
              finish_reason: 'stop'
            }]
          };
        }
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                titleZh: '湖人与 Jaxson Hayes 达成 2 年续约合同',
                summaryZh: 'Jaxson Hayes 与湖人达成一份 2 年 1200 万美元合同，球队将继续把他留在内线轮换中。',
                categoryZh: '签约',
                tagsZh: ['湖人', '续约'],
                confidence: 0.9,
                factLevel: 'confirmed'
              })
            },
            finish_reason: 'stop'
          }]
        };
      }
    }
  };

  const response = await worker.fetch(new Request('https://worker.example/refresh'), env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.items[0].aiStatus, 'accepted');
  assert.equal(payload.lastFetchStatus.aiRequests, 2);
  assert.equal(aiCalls, 2);
});

test('Worker uses the existing JSON fallback after two unparseable Qwen responses', async (context) => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const logs = [];
  context.after(() => {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  });
  console.log = (message, details) => logs.push({ message, details });

  globalThis.fetch = async () => new Response(`<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <item>
          <title>Jaxson Hayes Agrees To Two-Year, $12M Deal With Lakers</title>
          <link>https://basketball.realgm.com/wiretap/4/jaxson-hayes-lakers</link>
          <pubDate>Mon, 27 Jul 2026 07:30:00 GMT</pubDate>
          <description>Jaxson Hayes has agreed to a two-year, $12 million contract with the Los Angeles Lakers.</description>
        </item>
      </channel>
    </rss>`, {
    status: 200,
    headers: { 'content-type': 'application/rss+xml' }
  });

  const kv = new MemoryKv();
  const models = [];
  const env = {
    NEWS_KV: kv,
    AI_ENABLED: 'true',
    AI_MAX_ITEMS_PER_RUN: '3',
    JINA_READER_ENABLED: 'false',
    AI_MODEL: '@cf/qwen/qwen3-30b-a3b-fp8',
    AI_FALLBACK_MODEL: '@cf/meta/llama-3.1-8b-instruct-fast',
    AI: {
      async run(model) {
        models.push(model);
        if (model === env.AI_MODEL) {
          return {
            choices: [{
              message: { content: null, reasoning: 'Never use this.' },
              finish_reason: 'length'
            }]
          };
        }
        return {
          response: {
            titleZh: '湖人与 Jaxson Hayes 达成 2 年续约合同',
            summaryZh: 'Jaxson Hayes 与湖人达成一份 2 年 1200 万美元合同，球队将继续把他留在内线轮换中。',
            categoryZh: '签约',
            tagsZh: ['湖人', '续约'],
            confidence: 0.9,
            factLevel: 'confirmed'
          },
          finish_reason: 'stop'
        };
      }
    }
  };

  const response = await worker.fetch(new Request('https://worker.example/refresh'), env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.items[0].aiStatus, 'accepted');
  assert.equal(payload.lastFetchStatus.aiRequests, 3);
  assert.equal(payload.lastFetchStatus.aiFallbackRequests, 1);
  assert.deepEqual(models, [env.AI_MODEL, env.AI_MODEL, env.AI_FALLBACK_MODEL]);
  const fallbackDebug = logs.find((entry) => entry.message === 'AI editorial quality debug');
  assert.equal(fallbackDebug.details.stage, 'json-fallback-after-structural-qwen-failure');
  assert.equal(fallbackDebug.details.fallbackInvoked, true);
  assert.equal(fallbackDebug.details.fallbackReason, 'qwen-length-stop');
});

test('Worker uses fallback only after repeated schema-incomplete Qwen responses', async (context) => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const logs = [];
  context.after(() => {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  });
  console.log = (message, details) => logs.push({ message, details });
  globalThis.fetch = async () => new Response(`<?xml version="1.0"?>
    <rss version="2.0"><channel><item>
      <title>Jaxson Hayes Agrees To Two-Year, $12M Deal With Lakers</title>
      <link>https://basketball.realgm.com/wiretap/41/jaxson-hayes-lakers</link>
      <pubDate>Mon, 27 Jul 2026 07:30:00 GMT</pubDate>
      <description>Jaxson Hayes has agreed to a two-year, $12 million contract with the Los Angeles Lakers.</description>
    </item></channel></rss>`, {
    status: 200,
    headers: { 'content-type': 'application/rss+xml' }
  });

  const models = [];
  const env = {
    NEWS_KV: new MemoryKv(),
    AI_ENABLED: 'true',
    AI_MAX_ITEMS_PER_RUN: '3',
    JINA_READER_ENABLED: 'false',
    AI_MODEL: '@cf/qwen/qwen3-30b-a3b-fp8',
    AI_FALLBACK_MODEL: '@cf/meta/llama-3.1-8b-instruct-fast',
    AI: {
      async run(model) {
        models.push(model);
        if (model === env.AI_MODEL) return { response: { titleZh: '字段不完整' }, finish_reason: 'stop' };
        return {
          response: {
            titleZh: '湖人与 Jaxson Hayes 达成 2 年续约合同',
            summaryZh: 'Jaxson Hayes 与湖人达成一份 2 年 1200 万美元合同，球队将继续把他留在内线轮换中。',
            categoryZh: '签约',
            tagsZh: ['湖人', '续约'],
            confidence: 0.9,
            factLevel: 'confirmed'
          },
          finish_reason: 'stop'
        };
      }
    }
  };

  const response = await worker.fetch(new Request('https://worker.example/refresh'), env);
  const payload = await response.json();
  assert.equal(payload.lastFetchStatus.aiRequests, 3);
  assert.equal(payload.lastFetchStatus.aiFallbackRequests, 1);
  assert.deepEqual(models, [env.AI_MODEL, env.AI_MODEL, env.AI_FALLBACK_MODEL]);
  const fallbackDebug = logs.find((entry) => entry.message === 'AI editorial quality debug');
  assert.equal(fallbackDebug.details.fallbackReason, 'qwen-incomplete-schema');
});

test('Worker records a Qwen request error as the structural fallback reason', async (context) => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const logs = [];
  context.after(() => {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  });
  console.log = (message, details) => logs.push({ message, details });
  globalThis.fetch = async () => new Response(`<?xml version="1.0"?>
    <rss version="2.0"><channel><item>
      <title>Jaxson Hayes Agrees To Two-Year, $12M Deal With Lakers</title>
      <link>https://basketball.realgm.com/wiretap/42/jaxson-hayes-lakers</link>
      <pubDate>Mon, 27 Jul 2026 07:30:00 GMT</pubDate>
      <description>Jaxson Hayes has agreed to a two-year, $12 million contract with the Los Angeles Lakers.</description>
    </item></channel></rss>`, {
    status: 200,
    headers: { 'content-type': 'application/rss+xml' }
  });

  const models = [];
  const env = {
    NEWS_KV: new MemoryKv(),
    AI_ENABLED: 'true',
    AI_MAX_ITEMS_PER_RUN: '3',
    JINA_READER_ENABLED: 'false',
    AI_MODEL: '@cf/qwen/qwen3-30b-a3b-fp8',
    AI_FALLBACK_MODEL: '@cf/meta/llama-3.1-8b-instruct-fast',
    AI: {
      async run(model) {
        models.push(model);
        if (model === env.AI_MODEL) throw new Error('temporary upstream failure');
        return {
          response: {
            titleZh: '湖人与 Jaxson Hayes 达成 2 年续约合同',
            summaryZh: 'Jaxson Hayes 与湖人达成一份 2 年 1200 万美元合同，球队将继续把他留在内线轮换中。',
            categoryZh: '签约',
            tagsZh: ['湖人', '续约'],
            confidence: 0.9,
            factLevel: 'confirmed'
          },
          finish_reason: 'stop'
        };
      }
    }
  };

  const response = await worker.fetch(new Request('https://worker.example/refresh'), env);
  const payload = await response.json();
  assert.equal(payload.lastFetchStatus.aiRequests, 2);
  assert.equal(payload.lastFetchStatus.aiFallbackRequests, 1);
  assert.deepEqual(models, [env.AI_MODEL, env.AI_FALLBACK_MODEL]);
  const fallbackDebug = logs.find((entry) => entry.message === 'AI editorial quality debug');
  assert.equal(fallbackDebug.details.fallbackReason, 'qwen-request-error');
});

test('Worker rejects a parsed Qwen candidate without invoking fallback and preserves primary diagnostics', async (context) => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const originalWarn = console.warn;
  const logs = [];
  context.after(() => {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    console.warn = originalWarn;
  });

  console.log = (message, details) => logs.push({ level: 'log', message, details });
  console.warn = (message, details) => logs.push({ level: 'warn', message, details });
  globalThis.fetch = async () => new Response(`<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <item>
          <title>Jaxson Hayes Agrees To Two-Year, $12M Deal With Lakers</title>
          <link>https://basketball.realgm.com/wiretap/5/jaxson-hayes-lakers</link>
          <pubDate>Mon, 27 Jul 2026 07:30:00 GMT</pubDate>
          <description>Jaxson Hayes has agreed to a two-year, $12 million contract with the Los Angeles Lakers. FULL_ARTICLE_MARKER</description>
        </item>
      </channel>
    </rss>`, {
    status: 200,
    headers: { 'content-type': 'application/rss+xml' }
  });

  const rejectedCopy = {
    titleZh: '湖人与 Jaxson Hayes 达成 2 年续约合同',
    summaryZh: 'Jaxson Hayes 与湖人达成一份 2 年 1200 万美元合同，球队将继续把他留在内线轮换中。',
    categoryZh: '签约',
    tagsZh: ['湖人', '续约'],
    confidence: 0.4,
    factLevel: 'confirmed'
  };
  const kv = new MemoryKv();
  const env = {
    NEWS_KV: kv,
    AI_ENABLED: 'true',
    AI_MAX_ITEMS_PER_RUN: '3',
    JINA_READER_ENABLED: 'false',
    AI_MODEL: '@cf/qwen/qwen3-30b-a3b-fp8',
    AI_FALLBACK_MODEL: '@cf/meta/llama-3.1-8b-instruct-fast',
    AI: {
      async run(model) {
        if (model === env.AI_MODEL) {
          return {
            choices: [{
              message: {
                content: JSON.stringify(rejectedCopy),
                reasoning: 'REASONING_MARKER'
              },
              finish_reason: 'stop'
            }]
          };
        }
        throw new Error(`Unexpected fallback model call: ${model}`);
      }
    }
  };

  const response = await worker.fetch(new Request('https://worker.example/refresh'), env);
  const payload = await response.json();
  const debugLogs = logs.filter((entry) => entry.message === 'AI editorial quality debug');
  const qwenDebug = debugLogs.find((entry) => entry.details.stage === 'qwen-primary');
  const serializedLogs = JSON.stringify(logs);

  assert.equal(response.status, 200);
  assert.equal(payload.lastFetchStatus.aiRequests, 1);
  assert.equal(payload.lastFetchStatus.aiFallbackRequests, 0);
  assert.equal(payload.lastFetchStatus.aiRejected, 1);
  assert.equal(qwenDebug.details.qwenFinalParsedJson.titleZh, rejectedCopy.titleZh);
  assert.equal(qwenDebug.details.summaryZh, rejectedCopy.summaryZh);
  assert.equal(qwenDebug.details.oneLineZh, rejectedCopy.titleZh);
  assert.equal(qwenDebug.details.oneLineSource, 'titleZh-derived');
  assert.equal(qwenDebug.details.fallbackInvoked, false);
  assert.equal(qwenDebug.details.fallbackReason, null);
  assert.deepEqual(qwenDebug.details.rejectionReasons, ['low-confidence']);
  assert.equal(debugLogs.length, 1);
  assert.doesNotMatch(serializedLogs, /REASONING_MARKER|FULL_ARTICLE_MARKER/);
});

test('Debug reprocess runs one rejected record without writing KV or touching accepted records', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => new Response(`<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <item>
          <title>Jaxson Hayes Agrees To Two-Year, $12M Deal With Lakers</title>
          <link>https://basketball.realgm.com/wiretap/6/jaxson-hayes-lakers</link>
          <pubDate>Mon, 27 Jul 2026 07:30:00 GMT</pubDate>
          <description>Jaxson Hayes has agreed to a two-year, $12 million contract with the Los Angeles Lakers.</description>
        </item>
      </channel>
    </rss>`, {
    status: 200,
    headers: { 'content-type': 'application/rss+xml' }
  });

  const rejectedCopy = {
    titleZh: '湖人与 Jaxson Hayes 达成 2 年续约合同',
    summaryZh: 'Jaxson Hayes 与湖人达成一份 2 年 1200 万美元合同，球队将继续把他留在内线轮换中。',
    categoryZh: '签约',
    tagsZh: ['湖人', '续约'],
    confidence: 0.4,
    factLevel: 'confirmed'
  };
  const acceptedCopy = {
    ...rejectedCopy,
    confidence: 0.9
  };
  const kv = new MemoryKv();
  let mode = 'reject';
  let aiCalls = 0;
  const env = {
    NEWS_KV: kv,
    REFRESH_TOKEN: 'test-refresh-secret',
    AI_ENABLED: 'true',
    AI_MAX_ITEMS_PER_RUN: '3',
    JINA_READER_ENABLED: 'false',
    AI_MODEL: '@cf/qwen/qwen3-30b-a3b-fp8',
    AI_FALLBACK_MODEL: '@cf/meta/llama-3.1-8b-instruct-fast',
    AI: {
      async run() {
        aiCalls += 1;
        return {
          response: mode === 'reject' ? rejectedCopy : acceptedCopy,
          finish_reason: 'stop'
        };
      }
    }
  };
  const authHeaders = { 'x-refresh-token': env.REFRESH_TOKEN };

  const unavailable = await worker.fetch(
    new Request('https://worker.example/debug/reprocess'),
    { ...env, REFRESH_TOKEN: '' }
  );
  assert.equal(unavailable.status, 503);

  const refresh = await worker.fetch(new Request('https://worker.example/refresh', {
    headers: authHeaders
  }), env);
  const refreshPayload = await refresh.json();
  assert.equal(refresh.status, 200);
  assert.equal(refreshPayload.lastFetchStatus.aiRejected, 1);

  const unauthorized = await worker.fetch(new Request('https://worker.example/debug/reprocess', {
    headers: { 'x-refresh-token': 'wrong-token' }
  }), env);
  assert.equal(unauthorized.status, 401);

  const listResponse = await worker.fetch(new Request('https://worker.example/debug/reprocess', {
    headers: authHeaders
  }), env);
  const listPayload = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.equal(listPayload.count, 1);
  assert.equal(listPayload.items[0].rejectionReasons.includes('low-confidence'), true);

  const newsId = listPayload.items[0].newsId;
  const kvBefore = JSON.stringify([...kv.values.entries()]);
  aiCalls = 0;
  const rejectedDebugResponse = await worker.fetch(new Request('https://worker.example/debug/reprocess', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ newsId, dryRun: true })
  }), env);
  const rejectedDebugPayload = await rejectedDebugResponse.json();
  assert.equal(rejectedDebugPayload.resultAiStatus, 'rejected');
  assert.equal(rejectedDebugPayload.aiRequests, 1);
  assert.equal(rejectedDebugPayload.fallbackInvoked, false);
  assert.equal(rejectedDebugPayload.fallbackReason, null);
  assert.equal(rejectedDebugPayload.snapshots[0].stage, 'qwen-primary');
  assert.deepEqual(rejectedDebugPayload.rejectionReasons, ['low-confidence']);
  assert.equal(aiCalls, 1);
  assert.equal(JSON.stringify([...kv.values.entries()]), kvBefore);

  mode = 'accept';
  aiCalls = 0;
  const debugResponse = await worker.fetch(new Request('https://worker.example/debug/reprocess', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ newsId, dryRun: true })
  }), env);
  const debugPayload = await debugResponse.json();

  assert.equal(debugResponse.status, 200);
  assert.equal(debugPayload.dryRun, true);
  assert.equal(debugPayload.persisted, false);
  assert.equal(debugPayload.aiSelected, 1);
  assert.equal(debugPayload.aiRequests, 1);
  assert.equal(debugPayload.aiAccepted, 1);
  assert.equal(debugPayload.qwenBaseline.attempts, 1);
  assert.equal(debugPayload.qwenBaseline.parsed, 1);
  assert.equal(debugPayload.qwenFinalParsedJson.titleZh, acceptedCopy.titleZh);
  assert.equal(debugPayload.summaryZh, acceptedCopy.summaryZh);
  assert.equal(debugPayload.oneLineZh, acceptedCopy.titleZh);
  assert.equal(debugPayload.fallbackInvoked, false);
  assert.equal(debugPayload.fallbackReason, null);
  assert.deepEqual(debugPayload.rejectionReasons, []);
  assert.equal(aiCalls, 1);
  assert.equal(JSON.stringify([...kv.values.entries()]), kvBefore);

  const recordKey = `news:item:${newsId}`;
  const acceptedRecord = JSON.parse(kv.values.get(recordKey));
  acceptedRecord.aiStatus = 'accepted';
  acceptedRecord.editorial = acceptedCopy;
  await kv.put(recordKey, JSON.stringify(acceptedRecord));
  aiCalls = 0;
  const acceptedResponse = await worker.fetch(new Request('https://worker.example/debug/reprocess', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ newsId, dryRun: true })
  }), env);
  assert.equal(acceptedResponse.status, 409);
  assert.equal(aiCalls, 0);
});

test('Phase 1 runs fact extraction then editorial generation with no fallback', async (context) => {
  const restoreFetch = mockSigningFeed(context, 'phase1-success');
  context.after(restoreFetch);
  const kv = new MemoryKv();
  const calls = [];
  const env = makePhase1Env(kv, async (model, request) => {
    calls.push({ model, request });
    return calls.length === 1
      ? { response: phase1SigningEvidence(), finish_reason: 'stop' }
      : { response: phase1SigningEditorial(), finish_reason: 'stop' };
  });

  const response = await worker.fetch(new Request('https://worker.example/refresh'), env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].oneLineZh, 'Hayes 的新合同价值 1200 万美元');
  assert.equal('factExtraction' in payload.items[0], false);
  assert.equal(payload.lastFetchStatus.pipelineMode, 'phase1');
  assert.equal(payload.lastFetchStatus.factStageRequests, 1);
  assert.equal(payload.lastFetchStatus.editorialStageRequests, 1);
  assert.equal(payload.lastFetchStatus.aiRequests, 2);
  assert.equal(payload.lastFetchStatus.aiFallbackRequests, 0);
  assert.equal(calls.length, 2);
  assert.equal(calls.every((call) => call.model === env.AI_MODEL), true);

  const catalog = JSON.parse(kv.values.get('news:catalog:v1'));
  const record = JSON.parse(kv.values.get(`news:item:${catalog.ids[0]}`));
  assert.equal(record.factExtractionStatus, 'accepted');
  assert.equal(record.factValidationStatus, 'accepted');
  assert.equal(record.editorialGenerationStatus, 'accepted');
  assert.equal(record.finalGateStatus, 'accepted');
  assert.match(record.factExtractionCacheKey, /^fact-v3-qwen3-evidence-first:/);
  assert.match(record.editorialGenerationCacheKey, /^editorial-v1-qwen3:/);
});

test('Phase 1 stops after Stage 1 validation failure and never invokes Stage 2 or Llama', async (context) => {
  const restoreFetch = mockSigningFeed(context, 'phase1-fact-reject');
  context.after(restoreFetch);
  const kv = new MemoryKv();
  const models = [];
  const unsafeEvidence = phase1SigningEvidence();
  unsafeEvidence.evidenceItems[0].evidenceQuote =
    'Jaxson Hayes has agreed to a two-year, $99 million contract with the Los Angeles Lakers.';
  const env = makePhase1Env(kv, async (model) => {
    models.push(model);
    return { response: unsafeEvidence, finish_reason: 'stop' };
  });

  const payload = await (await worker.fetch(
    new Request('https://worker.example/refresh'),
    env
  )).json();

  assert.equal(payload.lastFetchStatus.aiRequests, 1);
  assert.equal(payload.lastFetchStatus.factStageRequests, 1);
  assert.equal(payload.lastFetchStatus.editorialStageRequests, 0);
  assert.equal(payload.lastFetchStatus.stage2Skipped, 1);
  assert.equal(payload.lastFetchStatus.aiFallbackRequests, 0);
  assert.deepEqual(models, [env.AI_MODEL]);

  const catalog = JSON.parse(kv.values.get('news:catalog:v1'));
  const record = JSON.parse(kv.values.get(`news:item:${catalog.ids[0]}`));
  assert.equal(record.aiStatus, 'rejected');
  assert.equal(record.rejectionStage, 'fact-validation');
  assert.equal(record.rejectionReasons.includes('fact-evidence-not-found'), true);
});

test('Phase 1 retries structural Stage 1 failure once and does not call fallback', async (context) => {
  const restoreFetch = mockSigningFeed(context, 'phase1-structural-reject');
  context.after(restoreFetch);
  const kv = new MemoryKv();
  const models = [];
  const env = makePhase1Env(kv, async (model) => {
    models.push(model);
    return {
      choices: [{
        message: { content: null, reasoning: 'Never consume this.' },
        finish_reason: 'length'
      }]
    };
  });

  const payload = await (await worker.fetch(
    new Request('https://worker.example/refresh'),
    env
  )).json();

  assert.equal(payload.lastFetchStatus.aiRequests, 2);
  assert.equal(payload.lastFetchStatus.factStageRequests, 2);
  assert.equal(payload.lastFetchStatus.editorialStageRequests, 0);
  assert.equal(payload.lastFetchStatus.aiFallbackRequests, 0);
  assert.deepEqual(models, [env.AI_MODEL, env.AI_MODEL]);

  const catalog = JSON.parse(kv.values.get('news:catalog:v1'));
  const record = JSON.parse(kv.values.get(`news:item:${catalog.ids[0]}`));
  assert.equal(record.aiStatus, 'rejected');
  assert.equal(record.rejectionStage, 'fact-extraction');
});

test('Phase 1 rejects an unsafe Stage 2 candidate without invoking fallback', async (context) => {
  const restoreFetch = mockSigningFeed(context, 'phase1-gate-reject');
  context.after(restoreFetch);
  const kv = new MemoryKv();
  const calls = [];
  const env = makePhase1Env(kv, async (model) => {
    calls.push(model);
    if (calls.length === 1) return { response: phase1SigningEvidence(), finish_reason: 'stop' };
    return {
      response: { ...phase1SigningEditorial(), confidence: 0.3 },
      finish_reason: 'stop'
    };
  });

  const payload = await (await worker.fetch(
    new Request('https://worker.example/refresh'),
    env
  )).json();

  assert.equal(payload.lastFetchStatus.aiRequests, 2);
  assert.equal(payload.lastFetchStatus.aiFallbackRequests, 0);
  assert.equal(payload.lastFetchStatus.aiRejected, 1);
  assert.deepEqual(calls, [env.AI_MODEL, env.AI_MODEL]);

  const catalog = JSON.parse(kv.values.get('news:catalog:v1'));
  const record = JSON.parse(kv.values.get(`news:item:${catalog.ids[0]}`));
  assert.equal(record.rejectionStage, 'final-gate');
  assert.equal(record.rejectionReasons.includes('low-confidence'), true);
});

test('Phase 1 canary selects at most one new pending item and leaves the rest pending', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => new Response(`<?xml version="1.0"?>
    <rss version="2.0"><channel>
      <item>
        <title>Jaxson Hayes Agrees To Two-Year, $12M Deal With Lakers</title>
        <link>https://basketball.realgm.com/wiretap/canary-1</link>
        <pubDate>Mon, 27 Jul 2026 07:30:00 GMT</pubDate>
        <description>Jaxson Hayes has agreed to a two-year, $12 million contract with the Los Angeles Lakers.</description>
      </item>
      <item>
        <title>Second Player Agrees To Two-Year, $12M Deal With Lakers</title>
        <link>https://basketball.realgm.com/wiretap/canary-2</link>
        <pubDate>Mon, 27 Jul 2026 07:20:00 GMT</pubDate>
        <description>Second Player has agreed to a two-year, $12 million contract with the Los Angeles Lakers.</description>
      </item>
    </channel></rss>`, {
    status: 200,
    headers: { 'content-type': 'application/rss+xml' }
  });

  const kv = new MemoryKv();
  let calls = 0;
  const env = makePhase1Env(kv, async () => {
    calls += 1;
    return calls === 1
      ? { response: phase1SigningEvidence(), finish_reason: 'stop' }
      : { response: phase1SigningEditorial(), finish_reason: 'stop' };
  });
  env.EDITORIAL_PIPELINE_MODE = 'phase1-canary';

  const payload = await (await worker.fetch(
    new Request('https://worker.example/refresh'),
    env
  )).json();
  const catalog = JSON.parse(kv.values.get('news:catalog:v1'));
  const records = catalog.ids.map((id) => JSON.parse(kv.values.get(`news:item:${id}`)));

  assert.equal(payload.lastFetchStatus.aiSelected, 1);
  assert.equal(calls, 2);
  assert.equal(records.filter((record) => record.aiStatus === 'pending').length, 1);
  assert.equal(records.filter((record) => record.aiStatus === 'accepted').length, 1);
});

test('Phase 1 debug can evaluate an accepted record without writing KV', async (context) => {
  const restoreFetch = mockSigningFeed(context, 'phase1-debug');
  context.after(restoreFetch);
  const kv = new MemoryKv();
  let stage = 0;
  const env = makePhase1Env(kv, async () => {
    stage += 1;
    return stage % 2 === 1
      ? { response: phase1SigningEvidence(), finish_reason: 'stop' }
      : { response: phase1SigningEditorial(), finish_reason: 'stop' };
  });
  env.REFRESH_TOKEN = 'phase1-test-token';
  const auth = { 'x-refresh-token': env.REFRESH_TOKEN };

  await worker.fetch(new Request('https://worker.example/refresh', { headers: auth }), env);
  const catalog = JSON.parse(kv.values.get('news:catalog:v1'));
  const newsId = catalog.ids[0];
  const before = JSON.stringify([...kv.values.entries()]);
  stage = 0;
  const response = await worker.fetch(new Request('https://worker.example/debug/reprocess', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      newsId,
      dryRun: true,
      pipelineMode: 'phase1',
      evaluateAccepted: true
    })
  }), env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.persisted, false);
  assert.equal(payload.pipelineMode, 'phase1');
  assert.equal(payload.factStageRequests, 1);
  assert.equal(payload.editorialStageRequests, 1);
  assert.equal(payload.resultAiStatus, 'accepted');
  assert.equal(JSON.stringify([...kv.values.entries()]), before);
});

test('Phase 1 debug can stop after validated Stage 1 without invoking Stage 2', async (context) => {
  const restoreFetch = mockSigningFeed(context, 'phase1-stage1-only');
  context.after(restoreFetch);
  const kv = new MemoryKv();
  let calls = 0;
  const env = makePhase1Env(kv, async () => {
    calls += 1;
    return calls % 2 === 1
      ? { response: phase1SigningEvidence(), finish_reason: 'stop' }
      : { response: phase1SigningEditorial(), finish_reason: 'stop' };
  });
  env.REFRESH_TOKEN = 'phase1-test-token';
  const auth = { 'x-refresh-token': env.REFRESH_TOKEN };

  await worker.fetch(new Request('https://worker.example/refresh', { headers: auth }), env);
  const catalog = JSON.parse(kv.values.get('news:catalog:v1'));
  const newsId = catalog.ids[0];
  const before = JSON.stringify([...kv.values.entries()]);
  calls = 0;
  const response = await worker.fetch(new Request('https://worker.example/debug/reprocess', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      newsId,
      dryRun: true,
      pipelineMode: 'phase1',
      evaluateAccepted: true,
      stage1Only: true
    })
  }), env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.persisted, false);
  assert.equal(payload.stage1Only, true);
  assert.equal(payload.factStageRequests, 1);
  assert.equal(payload.editorialStageRequests, 0);
  assert.equal(payload.factValidation.ok, true);
  assert.equal(payload.resultAiStatus, 'pending');
  assert.equal(calls, 1);
  assert.equal(JSON.stringify([...kv.values.entries()]), before);
});

test('Phase 1 debug can run Stage 2 from frozen facts without Stage 1 or KV writes', async () => {
  const kv = new MemoryKv();
  let calls = 0;
  const env = makePhase1Env(kv, async () => {
    calls += 1;
    return { response: phase1SigningEditorial(), finish_reason: 'stop' };
  });
  env.REFRESH_TOKEN = 'phase1-test-token';
  const before = JSON.stringify([...kv.values.entries()]);
  const response = await worker.fetch(new Request('https://worker.example/debug/reprocess', {
    method: 'POST',
    headers: {
      'x-refresh-token': env.REFRESH_TOKEN,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      newsId: 'news_111111111111111111111111',
      dryRun: true,
      pipelineMode: 'phase1',
      stage2Only: true,
      source: 'RealGM',
      publishedAt: '2026-07-27T07:30:00.000Z',
      factExtraction: phase1SigningFact()
    })
  }), env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.persisted, false);
  assert.equal(payload.stage2Only, true);
  assert.equal(payload.factStageRequests, 0);
  assert.equal(payload.editorialStageRequests, 1);
  assert.equal(payload.resultAiStatus, 'accepted');
  assert.equal(payload.fallbackInvoked, false);
  assert.equal(calls, 1);
  assert.equal(JSON.stringify([...kv.values.entries()]), before);
});

test('Phase 1 Stage 2-only debug rejects malformed frozen facts before AI', async () => {
  const kv = new MemoryKv();
  let calls = 0;
  const env = makePhase1Env(kv, async () => {
    calls += 1;
    return { response: phase1SigningEditorial(), finish_reason: 'stop' };
  });
  env.REFRESH_TOKEN = 'phase1-test-token';
  const response = await worker.fetch(new Request('https://worker.example/debug/reprocess', {
    method: 'POST',
    headers: {
      'x-refresh-token': env.REFRESH_TOKEN,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      newsId: 'news_222222222222222222222222',
      dryRun: true,
      pipelineMode: 'phase1',
      stage2Only: true,
      factExtraction: {
        storyType: 'signing',
        facts: [{ id: 'fact-1' }],
        mustNotClaim: []
      }
    })
  }), env);
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.rejectionReasons.includes('fact-schema-invalid'), true);
  assert.equal(calls, 0);
});

function mockSigningFeed(context, suffix) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(`<?xml version="1.0"?>
    <rss version="2.0"><channel><item>
      <title>Jaxson Hayes Agrees To Two-Year, $12M Deal With Lakers</title>
      <link>https://basketball.realgm.com/wiretap/${suffix}</link>
      <pubDate>Mon, 27 Jul 2026 07:30:00 GMT</pubDate>
      <description>Jaxson Hayes has agreed to a two-year, $12 million contract with the Los Angeles Lakers.</description>
    </item></channel></rss>`, {
    status: 200,
    headers: { 'content-type': 'application/rss+xml' }
  });
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function makePhase1Env(kv, run) {
  return {
    NEWS_KV: kv,
    AI_ENABLED: 'true',
    AI_MAX_ITEMS_PER_RUN: '3',
    EDITORIAL_PIPELINE_MODE: 'phase1',
    JINA_READER_ENABLED: 'false',
    AI_MODEL: '@cf/qwen/qwen3-30b-a3b-fp8',
    AI_FALLBACK_MODEL: '@cf/meta/llama-3.1-8b-instruct-fast',
    AI: { run }
  };
}

function phase1SigningEvidence() {
  return {
    evidenceItems: [{
      id: 'evidence-1',
      evidenceQuote: 'Jaxson Hayes has agreed to a two-year, $12 million contract with the Los Angeles Lakers.',
      attributionName: '',
      attributionQuote: ''
    }]
  };
}

function phase1SigningFact() {
  const evidenceQuote =
    'Jaxson Hayes has agreed to a two-year, $12 million contract with the Los Angeles Lakers.';
  return {
    storyType: 'signing',
    facts: [{
      id: 'fact-1',
      factText: evidenceQuote,
      polarity: 'positive',
      certainty: 'confirmed',
      attribution: '',
      attributionQuote: '',
      sourceField: 'rssSummary',
      evidenceQuote,
      entities: [
        { type: 'team', canonicalId: 'lakers' },
        { type: 'person', canonicalId: 'jaxson-hayes' }
      ],
      numbers: [
        { type: 'money', value: 'usd-million:12' },
        { type: 'contractYears', value: 'years:2' }
      ]
    }],
    mustNotClaim: []
  };
}

function phase1SigningEditorial() {
  return {
    titleZh: '湖人与 Jaxson Hayes 达成 2 年合同',
    summaryZh: 'Jaxson Hayes 与湖人达成 2 年 1200 万美元合同，双方已经完成这笔签约。',
    oneLineZh: 'Hayes 的新合同价值 1200 万美元',
    categoryZh: '签约',
    tagsZh: ['湖人', '签约'],
    confidence: 0.9
  };
}
