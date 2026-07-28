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
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

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
});
