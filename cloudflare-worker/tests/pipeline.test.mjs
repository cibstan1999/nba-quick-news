import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkersAiRequest,
  buildWorkersAiJsonRequest,
  createNewsId,
  createPendingRecord,
  createSourceHash,
  extractEvidenceFacts,
  inferFactLevel,
  inferStoryType,
  inspectUnicodeIssues,
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
  assert.equal(inferStoryType('Peyton Watson Could Sign Qualifying Offer With Nuggets'), 'rumor');
  assert.equal(inferStoryType('Heat Waiting On Klay Thompson Before Filling Out Roster'), 'rumor');
  assert.equal(inferStoryType('Jaxson Hayes Agrees To Two-Year Deal With Lakers'), 'signing');
  assert.equal(inferStoryType('Nuggets Matching Spencer Jones Offer Sheet From Thunder'), 'signing');
  assert.equal(inferStoryType('Jonathan Kuminga, Cavaliers Have Mutual Interest'), 'rumor');
  assert.equal(inferStoryType('Proximity Played Role In LeBron James Signing With 76ers'), 'fact');
  assert.equal(inferStoryType('Warriors Focused On Building Team For After Stephen Curry Retires'), 'analysis');
  assert.equal(inferStoryType('Sixers Waive Dalen Terry'), 'fact');
});

test('headline entity extraction keeps player names without title verbs', () => {
  const signing = extractEvidenceFacts('Nuggets Matching Spencer Jones Offer Sheet From Thunder');
  assert.ok(signing.players.includes('spencer-jones'));
  assert.ok(!signing.players.some((player) => player.includes('matching')));

  const trade = extractEvidenceFacts('Wizards, Mavericks Had No Interest In Trading Anthony Davis, Kyrie Irving');
  assert.ok(trade.players.includes('anthony-davis'));
  assert.ok(trade.players.includes('kyrie-irving'));
  assert.ok(!trade.players.some((player) => player.includes('interest')));

  const receiving = extractEvidenceFacts('DeMar DeRozan Receiving Interest');
  assert.deepEqual(receiving.players, ['demar-derozan']);

  const expected = extractEvidenceFacts('LeBron James Expected To Return');
  assert.deepEqual(expected.players, ['lebron-james']);

  const drawing = extractEvidenceFacts('Stephen Curry Drawing Interest');
  assert.deepEqual(drawing.players, ['stephen-curry']);

  const generating = extractEvidenceFacts('Cooper Flagg Generating Interest');
  assert.deepEqual(generating.players, ['cooper-flagg']);
});

test('generic entity extraction excludes editorial phrases but keeps plausible unknown people', () => {
  for (const phrase of [
    'Summer League Prospects',
    "You Don't Envision Anything",
    'Final Score',
    'Key Takeaways',
    'Trade Analysis',
    'Injury Report',
    'Free Agency Rumors'
  ]) {
    assert.deepEqual(extractEvidenceFacts(phrase).players, [], phrase);
  }

  assert.deepEqual(extractEvidenceFacts('Micah Peavy').players, ['micah-peavy']);
  assert.deepEqual(extractEvidenceFacts('Tarris Reed Jr.').players, ['tarris-reed-jr']);
  assert.deepEqual(extractEvidenceFacts('Robert Williams III').players, ['robert-williams-iii']);
  assert.deepEqual(extractEvidenceFacts('Joe Lacob').players, []);
});

test('quality gate does not require Summer League Prospects as a player', async () => {
  const record = await makeRecord({
    originalTitle: "Dunc'd On: LeBron James to Philly + Summer League Prospects: OKC, CHA, DET, TOR, SAS",
    originalSummary: 'Nate Duncan and Danny Leroux analyze LeBron James joining Philadelphia and review Summer League prospects.',
    url: 'https://example.com/duncd-on'
  });
  const result = {
    titleZh: '节目分析勒布朗·詹姆斯加盟费城后的影响',
    summaryZh: '节目讨论了勒布朗·詹姆斯加盟费城后的阵容影响，并分析多支球队的夏季联赛新秀表现。',
    categoryZh: '分析',
    tagsZh: ['分析', '勒布朗·詹姆斯'],
    confidence: 0.9,
    factLevel: 'analysis'
  };

  const validation = validateEditorialResult(result, record);
  assert.ok(!validation.details.missingFacts.includes('player:summer-league-prospects'));
});

test('Joe Lacob display name is evidence-scoped and never becomes a player fact', async () => {
  const record = await makeRecord({
    originalTitle: 'Warriors Focused On Building Team For After Stephen Curry Retires',
    originalSummary: 'The Warriors are considering both short-term moves and their future after Stephen Curry.',
    url: 'https://example.com/warriors-future'
  });
  const result = {
    titleZh: '勇士评估斯蒂芬·库里退役后的建队方向',
    summaryZh: '记者分析称，球队老板拉博布希望兼顾当前竞争力，并为斯蒂芬·库里退役后的阵容保留调整空间。',
    categoryZh: '分析',
    tagsZh: ['勇士', '拉博布'],
    confidence: 0.9,
    factLevel: 'analysis'
  };

  const validation = validateEditorialResult(
    result,
    record,
    'Tim Kawakami reported that Warriors owner Joe Lacob wants a successful team after Stephen Curry retires.'
  );
  assert.match(validation.value.summaryZh, /乔·拉科布/);
  assert.doesNotMatch(validation.value.summaryZh, /拉博布/);
  assert.deepEqual(extractEvidenceFacts('Joe Lacob').players, []);

  const unrelated = validateEditorialResult(result, record, 'The report did not identify the team owner.');
  assert.match(unrelated.value.summaryZh, /拉博布/);
});

test('quality gate hard-rejects invalid Unicode without rejecting valid emoji', async () => {
  const record = await makeRecord();
  const valid = {
    titleZh: '湖人与 Jaxson Hayes 达成续约',
    summaryZh: 'Jaxson Hayes 与湖人达成 2 年 1200 万美元合同，球队保留了这名内线球员。🏀',
    categoryZh: '签约',
    tagsZh: ['湖人', '续约'],
    confidence: 0.9,
    factLevel: 'confirmed'
  };
  assert.deepEqual(inspectUnicodeIssues('正常中文和 emoji 🏀'), []);
  assert.ok(!validateEditorialResult(valid, record).reasons.includes('invalid-unicode-sequence'));

  const badTitle = validateEditorialResult({ ...valid, titleZh: '斯蒂�·库里谈续约' }, record);
  assert.ok(badTitle.reasons.includes('unicode-replacement-character'));

  const badSummary = validateEditorialResult({ ...valid, summaryZh: '斯蒂�·库里谈到球队的后续安排。' }, record);
  assert.ok(badSummary.reasons.includes('unicode-replacement-character'));

  const badSurrogate = validateEditorialResult({ ...valid, summaryZh: `湖人完成签约${String.fromCharCode(0xD800)}` }, record);
  assert.ok(badSurrogate.reasons.includes('invalid-unicode-sequence'));

  const badMetadata = validateEditorialResult({
    ...valid,
    categoryZh: `签约${String.fromCharCode(0xDC00)}`,
    tagsZh: ['湖人', '续约�'],
    oneLineZh: '正常标题'
  }, record);
  assert.ok(badMetadata.reasons.includes('unicode-replacement-character'));
  assert.ok(badMetadata.reasons.includes('invalid-unicode-sequence'));
});

test('quality gate accepts DeMar DeRozan interest copy without a verb-shaped player', async () => {
  const record = await makeRecord({
    originalTitle: 'DeMar DeRozan Receiving Interest From Heat, Nuggets, Cavaliers',
    originalSummary: 'The Miami Heat, Denver Nuggets and Cleveland Cavaliers have expressed interest in DeMar DeRozan.',
    url: 'https://example.com/demar-derozan-interest'
  });
  const result = {
    titleZh: '德玛尔·德罗赞受到热火、掘金、骑士关注',
    summaryZh: '德玛尔·德罗赞目前是自由市场最受关注的球员之一，热火、掘金和骑士均对他表示兴趣。',
    categoryZh: '其他',
    tagsZh: ['德玛尔·德罗赞', '热火', '掘金', '骑士'],
    confidence: 0.9,
    factLevel: 'reported'
  };

  const validation = validateEditorialResult(result, record);
  assert.equal(validation.ok, true, JSON.stringify(validation));
  assert.ok(!validation.details.missingFacts.includes('player:demar-derozan-receiving'));
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

test('quality gate requires core contract facts but not salary-cap background amounts', async () => {
  const record = await makeRecord({
    originalTitle: 'Nuggets Matching Spencer Jones Offer Sheet From Thunder',
    originalSummary: [
      'The Denver Nuggets are matching the two-year, $12 million offer sheet Spencer Jones signed with the Oklahoma City Thunder.',
      'Oklahoma City will remain under the second apron by $6.9 million and retain a $6.1 million exception.'
    ].join(' '),
    url: 'https://example.com/spencer-jones'
  });
  const result = {
    titleZh: '掘金匹配雷霆给 Spencer Jones 的报价合同',
    summaryZh: '掘金匹配了雷霆向 Spencer Jones 开出的 2 年 1200 万美元报价合同，因此将留下这名受限制自由球员。',
    categoryZh: '签约',
    tagsZh: ['掘金', '雷霆', 'Spencer Jones'],
    confidence: 0.9,
    factLevel: 'confirmed'
  };
  const validation = validateEditorialResult(result, record);
  assert.equal(validation.ok, true, JSON.stringify(validation));
});

test('accepted copy normalizes Chinese contract spacing', async () => {
  const record = await makeRecord();
  const result = {
    titleZh: '湖人与 Jaxson Hayes 达成2年续约合同',
    summaryZh: 'Jaxson Hayes 与湖人达成2年1200万美元合同，球队将继续保留这名内线轮换球员。',
    categoryZh: '签约',
    tagsZh: ['湖人', '续约'],
    confidence: 0.9,
    factLevel: 'confirmed'
  };
  const validation = validateEditorialResult(result, record);
  assert.equal(validation.ok, true, JSON.stringify(validation));
  assert.match(validation.value.titleZh, /2 年/);
  assert.match(validation.value.summaryZh, /1200 万美元/);
});

test('known contract English terms are normalized before language validation', async () => {
  const record = await makeRecord({
    originalTitle: 'Nuggets Matching Spencer Jones Offer Sheet From Thunder',
    originalSummary: 'The Nuggets matched the two-year, $12 million offer sheet for Spencer Jones.',
    url: 'https://example.com/offer-sheet'
  });
  const result = {
    titleZh: '掘金匹配雷霆给 Spencer Jones 的 offer sheet',
    summaryZh: '掘金匹配了雷霆给 Spencer Jones 的 2 年 1200 万美元 offer sheet，因此将留下这名球员。',
    categoryZh: '签约',
    tagsZh: ['掘金', '雷霆'],
    confidence: 0.9,
    factLevel: 'confirmed'
  };
  const validation = validateEditorialResult(result, record);
  assert.equal(validation.ok, true, JSON.stringify(validation));
  assert.doesNotMatch(validation.value.summaryZh, /offer sheet/i);
});

test('quality gate rejects player-signs-team Chinese grammar and category drift', async () => {
  const record = await makeRecord({
    originalTitle: 'Proximity To NYC Played Role In LeBron James Signing With 76ers',
    originalSummary: "The Philadelphia 76ers' proximity to New York City played a role in LeBron James' decision to sign with the team.",
    url: 'https://example.com/lebron-reason'
  });
  assert.equal(record.storyType, 'fact');
  assert.equal(record.category, '其他');
  const result = {
    titleZh: '勒布朗·詹姆斯签约 76 人与纽约近有关',
    summaryZh: '据报道，勒布朗·詹姆斯因为费城距离纽约较近，最终决定签约 76 人。',
    categoryZh: '签约',
    tagsZh: ['勒布朗·詹姆斯', '76 人'],
    confidence: 0.9,
    factLevel: 'reported'
  };
  const validation = validateEditorialResult(result, record);
  assert.equal(validation.ok, false);
  assert.ok(validation.reasons.includes('unsafe-title'));
  assert.ok(validation.reasons.includes('category-conflict'));
  assert.ok(validation.details.unsafeFragments.includes('player-signs-team-grammar'));
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
  assert.equal('rawDebug' in reasoningOnly, false);
});

test('Workers AI request disables thinking and asks Qwen for direct JSON', () => {
  const request = buildWorkersAiRequest('test', 2400);
  assert.equal('tools' in request, false);
  assert.equal(request.max_tokens, 2400);
  assert.match(request.messages[0].content, /^\/no_think/);
  assert.match(request.messages[0].content, /JSON\.parse/);
  assert.match(request.messages[1].content, /只输出最终 JSON 对象/);
});

test('Workers AI retry request remains no-think and asks for a complete JSON object', () => {
  const request = buildWorkersAiRequest('test', 4000, { retry: true });
  assert.equal('tools' in request, false);
  assert.equal(request.max_tokens, 4000);
  assert.match(request.messages[0].content, /^\/no_think/);
  assert.match(request.messages[1].content, /上一次响应没有产生可解析 JSON/);
});

test('structured fallback request uses Cloudflare JSON mode', () => {
  const request = buildWorkersAiJsonRequest('test');
  assert.equal(request.response_format.type, 'json_schema');
  assert.deepEqual(
    request.response_format.json_schema.required,
    ['titleZh', 'summaryZh', 'categoryZh', 'tagsZh', 'confidence', 'factLevel']
  );
});

test('AI response parser accepts editorial tool arguments and never reads reasoning', () => {
  const normalized = normalizeAiResponse({
    tool_calls: [{
      name: 'publish_nba_brief',
      arguments: {
        titleZh: '湖人与球员完成续约',
        summaryZh: '湖人与该球员完成续约，双方确认继续合作，合同细节以原始报道为准。',
        categoryZh: '签约',
        tagsZh: ['湖人'],
        confidence: 0.8,
        factLevel: 'confirmed'
      }
    }],
    reasoning: '{"titleZh":"不应读取"}',
    finish_reason: 'stop'
  });
  assert.equal(normalized.parsed.titleZh, '湖人与球员完成续约');
});

test('AI response parser accepts JSON from content text blocks and ignores reasoning blocks', () => {
  const normalized = normalizeAiResponse({
    choices: [{
      message: {
        content: [{
          type: 'text',
          text: JSON.stringify({
            titleZh: '湖人与球员完成续约',
            summaryZh: '湖人与该球员完成续约，双方确认继续合作，合同细节以原始报道为准。',
            categoryZh: '签约',
            tagsZh: ['湖人'],
            confidence: 0.8,
            factLevel: 'confirmed'
          })
        }],
        reasoning: '{"titleZh":"不应读取"}'
      },
      finish_reason: 'stop'
    }]
  });
  assert.equal(normalized.parsed.titleZh, '湖人与球员完成续约');
  assert.equal(normalized.contentLength > 0, true);
});
