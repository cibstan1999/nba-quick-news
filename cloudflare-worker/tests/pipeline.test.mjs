import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkersAiRequest,
  createNewsId,
  createPendingRecord,
  createSourceHash,
  extractEvidenceFacts,
  inferFactLevel,
  inferStoryType,
  materializePayload,
  migrateLegacyRecord,
  normalizeAiResponse,
  recoverStaleProcessing,
  selectQueueRecords,
  validateEditorialResult
} from '../src/pipeline.js';

const NOW = '2026-07-27T08:00:00.000Z';

async function makeRecord(overrides = {}) {
  const item = {
    source: 'RealGM',
    feed: 'https://basketball.realgm.com/rss/wiretap/15/0.xml',
    originalTitle: 'Jaxson Hayes Agrees To Two-Year, $12M Deal With Lakers',
    originalSummary: 'Jaxson Hayes has agreed to a two-year, $12 million contract with the Los Angeles Lakers.',
    url: 'https://basketball.realgm.com/wiretap/1/jaxson-hayes-lakers',
    publishedAt: '2026-07-27T07:30:00.000Z',
    ...overrides
  };
  item.newsId = await createNewsId(item);
  item.sourceHash = await createSourceHash(item);
  return createPendingRecord(item, NOW);
}

test('newsId is stable for canonical URLs', async () => {
  const base = {
    source: 'RealGM',
    originalTitle: 'Example',
    url: 'https://example.com/story?id=7'
  };
  const withTracking = {
    ...base,
    url: 'https://example.com/story?id=7&utm_source=rss#section'
  };
  assert.equal(await createNewsId(base), await createNewsId(withTracking));
});

test('story type keeps rumors and completed signings distinct', () => {
  assert.equal(inferStoryType('Lakers reportedly interested in Player A'), 'rumor');
  assert.equal(inferFactLevel('Lakers reportedly interested in Player A'), 'rumor');
  assert.equal(inferStoryType('Jaxson Hayes Agrees To Two-Year Deal With Lakers'), 'signing');
  assert.equal(inferStoryType('Nuggets Matching Spencer Jones Offer Sheet From Thunder'), 'signing');
  assert.equal(inferStoryType('Jonathan Kuminga, Cavaliers Have Mutual Interest'), 'rumor');
  assert.equal(inferStoryType('Proximity Played Role In LeBron James Signing With 76ers'), 'analysis');
});

test('headline entity extraction keeps player names without title verbs', () => {
  const signing = extractEvidenceFacts('Nuggets Matching Spencer Jones Offer Sheet From Thunder');
  assert.ok(signing.players.includes('spencer-jones'));
  assert.ok(!signing.players.some((player) => player.includes('matching')));

  const trade = extractEvidenceFacts('Wizards, Mavericks Had No Interest In Trading Anthony Davis, Kyrie Irving');
  assert.ok(trade.players.includes('anthony-davis'));
  assert.ok(trade.players.includes('kyrie-irving'));
  assert.ok(!trade.players.some((player) => player.includes('interest')));
});

test('queue reserves a slot for fresh news and continues old backlog', async () => {
  const records = [];
  for (let index = 0; index < 6; index += 1) {
    records.push(await makeRecord({
      originalTitle: `Old Player ${index} Signs With Lakers`,
      url: `https://example.com/old-${index}`,
      publishedAt: `2026-07-2${index}T06:00:00.000Z`
    }));
  }
  const fresh = await makeRecord({
    originalTitle: 'Fresh Player Signs With Lakers',
    url: 'https://example.com/fresh',
    publishedAt: '2026-07-27T07:55:00.000Z'
  });
  records.push(fresh);

  const selected = selectQueueRecords(records, 3, new Date(NOW).getTime());
  assert.equal(selected.length, 3);
  assert.equal(selected[0].newsId, fresh.newsId);
  assert.ok(selected.some((record) => record.url === 'https://example.com/old-0'));
});

test('failed records in cooldown do not block other candidates', async () => {
  const cooling = await makeRecord({ url: 'https://example.com/cooling' });
  cooling.aiStatus = 'failed';
  cooling.retryCount = 2;
  cooling.nextRetryAt = '2026-07-27T12:00:00.000Z';
  const pending = await makeRecord({ url: 'https://example.com/pending' });
  const selected = selectQueueRecords([cooling, pending], 2, new Date(NOW).getTime());
  assert.deepEqual(selected.map((record) => record.newsId), [pending.newsId]);
});

test('stale processing records become retryable failures', async () => {
  const record = await makeRecord();
  record.aiStatus = 'processing';
  record.processingStartedAt = '2026-07-27T06:00:00.000Z';
  const changed = recoverStaleProcessing([record], new Date(NOW).getTime());
  assert.deepEqual(changed, [record.newsId]);
  assert.equal(record.aiStatus, 'failed');
  assert.equal(record.nextRetryAt, NOW);
});

test('validated signing preserves contract length and money', async () => {
  const record = await makeRecord();
  const result = {
    titleZh: '湖人与 Jaxson Hayes 达成 2 年续约合同',
    summaryZh: 'Jaxson Hayes 与湖人达成一份 2 年 1200 万美元合同，球队将继续把他留在内线轮换中。',
    categoryZh: '签约',
    tagsZh: ['湖人', '续约'],
    confidence: 0.9,
    factLevel: 'confirmed'
  };
  const validation = validateEditorialResult(result, record);
  assert.equal(validation.ok, true, JSON.stringify(validation));
});

test('quality gate rejects fabricated money', async () => {
  const record = await makeRecord();
  const result = {
    titleZh: '湖人与 Jaxson Hayes 达成 2 年续约合同',
    summaryZh: 'Jaxson Hayes 与湖人达成一份 2 年 1700 万美元合同，双方已经完成签约。',
    categoryZh: '签约',
    tagsZh: ['湖人', '续约'],
    confidence: 0.9,
    factLevel: 'confirmed'
  };
  const validation = validateEditorialResult(result, record);
  assert.equal(validation.ok, false);
  assert.ok(validation.reasons.includes('added-facts'));
});

test('rumor cannot be promoted to a confirmed transaction', async () => {
  const record = await makeRecord({
    originalTitle: '76ers Reportedly Interested In LeBron James',
    originalSummary: 'The Philadelphia 76ers could consider LeBron James as a potential target.',
    url: 'https://example.com/lebron-rumor'
  });
  const result = {
    titleZh: '76 人签下勒布朗·詹姆斯',
    summaryZh: '勒布朗·詹姆斯已经加盟 76 人，双方完成了一份新合同。',
    categoryZh: '流言',
    tagsZh: ['76 人', '勒布朗·詹姆斯'],
    confidence: 0.88,
    factLevel: 'confirmed'
  };
  const validation = validateEditorialResult(result, record);
  assert.equal(validation.ok, false);
  assert.ok(validation.reasons.includes('rumor-marked-confirmed'));
  assert.ok(validation.reasons.includes('rumor-as-fact'));
});

test('accepted records are the only records materialized for the homepage', async () => {
  const accepted = await makeRecord();
  accepted.aiStatus = 'accepted';
  accepted.processedAt = NOW;
  accepted.editorial = {
    titleZh: '湖人与 Jaxson Hayes 达成 2 年续约合同',
    summaryZh: 'Jaxson Hayes 与湖人达成一份 2 年 1200 万美元合同，球队继续保留这名内线球员。',
    categoryZh: '签约',
    tagsZh: ['湖人', '续约'],
    confidence: 0.9,
    factLevel: 'confirmed',
    model: 'mock',
    generatedAt: NOW,
    editorSource: 'workers-ai'
  };
  const pending = await makeRecord({ url: 'https://example.com/pending-2' });
  const payload = materializePayload([accepted, pending], {
    status: 'success',
    checkedAt: NOW,
    updatedAt: NOW
  }, NOW);
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].aiStatus, 'accepted');
  assert.equal(payload.lastFetchStatus.queue.pending, 1);
});

test('legacy content only migrates as accepted after passing the quality gate', () => {
  const accepted = migrateLegacyRecord({
    newsId: 'legacy-1',
    originalTitle: 'Player signs with Lakers',
    originalSummary: 'Player signed with the Lakers.',
    oneLineZh: '湖人完成一笔阵容签约',
    summaryZh: '湖人已经与该球员完成签约，现有报道确认双方达成合同，但未披露更多合同细节。',
    category: '签约',
    source: 'RealGM',
    url: 'https://example.com/legacy-1',
    publishedAt: NOW
  }, NOW);
  const pending = migrateLegacyRecord({
    newsId: 'legacy-2',
    originalTitle: 'Another story',
    summaryZh: '',
    source: 'RealGM',
    url: 'https://example.com/legacy-2',
    publishedAt: NOW
  }, NOW);
  assert.equal(accepted.aiStatus, 'accepted');
  assert.equal(pending.aiStatus, 'pending');
});

test('mixed fallback copy cannot be grandfathered into accepted content', () => {
  const record = migrateLegacyRecord({
    newsId: 'legacy-mixed',
    originalTitle: 'Player Negotiating Buyout With Grizzlies, Intends To Sign With Sixers',
    originalSummary: 'The player is negotiating a buyout.',
    oneLineZh: '76 人签下 Player Negotiating Buyout With 灰熊, Intends',
    summaryZh: '据 RealGM 报道，76 人与 Player Negotiating Buyout With 灰熊, Intends 达成合同协议。',
    category: '签约',
    source: 'RealGM',
    url: 'https://example.com/legacy-mixed',
    publishedAt: NOW
  }, NOW);
  assert.equal(record.aiStatus, 'pending');
  assert.equal(record.editorial, null);
});

test('AI response parser accepts structured response and never reads reasoning', () => {
  const structured = normalizeAiResponse({
    response: {
      titleZh: '湖人完成续约',
      summaryZh: '湖人完成一笔续约合同，具体金额以原始报道为准。',
      categoryZh: '签约',
      tagsZh: ['湖人'],
      confidence: 0.8,
      factLevel: 'confirmed'
    },
    reasoning: '{"titleZh":"不应读取"}',
    finish_reason: 'stop'
  });
  assert.equal(structured.parsed.titleZh, '湖人完成续约');

  const reasoningOnly = normalizeAiResponse({
    choices: [{ message: { content: null, reasoning: '{"titleZh":"不应读取"}' }, finish_reason: 'length' }]
  });
  assert.equal(reasoningOnly.parsed, null);
  assert.equal(reasoningOnly.isEmptyLengthResponse, true);
});

test('Workers AI request asks for the complete editorial JSON schema', () => {
  const request = buildWorkersAiRequest('test', 1800, true);
  const required = request.response_format.json_schema.required;
  assert.deepEqual(required, ['titleZh', 'summaryZh', 'categoryZh', 'tagsZh', 'confidence', 'factLevel']);
  assert.equal(request.chat_template_kwargs.enable_thinking, false);
});
