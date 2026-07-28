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
