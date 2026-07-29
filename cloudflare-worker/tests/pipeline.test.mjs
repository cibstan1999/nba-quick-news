import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDITORIAL_GENERATION_VERSION,
  FACT_EXTRACTION_VERSION,
  PIPELINE_VERSION,
  buildEditorialConstraints,
  buildFactExtractionPrompt,
  buildPhase1EditorialPrompt,
  buildPhase1EditorialRequest,
  buildPhase1FactRequest,
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
  normalizeFactExtractionResponse,
  normalizePhase1EditorialResponse,
  recoverStaleProcessing,
  selectQueueRecords,
  validateEditorialResult,
  validateFactExtraction,
  validateFrozenFactExtraction,
  validatePhase1EditorialResult
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
    'Until It Happens',
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
  assert.deepEqual(
    extractEvidenceFacts("Stephen Curry On LeBron James' Decision: 'You Don't Envision Anything Until It Happens'").players,
    ['lebron-james', 'stephen-curry']
  );
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

test('canonical Curry aliases use source evidence without family-name collisions', () => {
  assert.deepEqual(
    extractEvidenceFacts('库里谈到球队未来', 'Stephen Curry discussed the Warriors').players,
    ['stephen-curry']
  );
  assert.deepEqual(
    extractEvidenceFacts('库里谈到球队未来', 'Steph Curry discussed the Warriors').players,
    ['stephen-curry']
  );
  assert.deepEqual(
    extractEvidenceFacts('库里谈到球队未来', 'Seth Curry discussed his role').players,
    ['seth-curry']
  );
  assert.deepEqual(
    extractEvidenceFacts('库里回顾职业生涯', 'Dell Curry discussed his career').players,
    ['dell-curry']
  );
  assert.deepEqual(
    extractEvidenceFacts('库里谈到球队未来', 'Stephen Curry and Seth Curry spoke together').players,
    []
  );
  assert.deepEqual(
    extractEvidenceFacts('赛斯·库里谈到球队未来', 'Seth Curry discussed his role').players,
    ['seth-curry']
  );
});

test('quality gate accepts Curry short name for Stephen Curry evidence', async () => {
  const record = await makeRecord({
    originalTitle: 'Warriors Focused On Building Team For After Stephen Curry Retires',
    originalSummary: 'Reporter Tim Kawakami analyzed how the Warriors may balance moves around Stephen Curry with planning for the future.',
    url: 'https://example.com/curry-alias'
  });
  const result = {
    titleZh: '勇士评估库里退役后的建队方向',
    summaryZh: '记者分析认为，勇士可能在围绕库里补强的同时，为未来阵容保留调整空间。',
    categoryZh: '分析',
    tagsZh: ['勇士', '库里'],
    confidence: 0.9,
    factLevel: 'analysis'
  };

  const validation = validateEditorialResult(result, record);
  assert.ok(!validation.details.missingFacts.includes('player:stephen-curry'), JSON.stringify(validation));
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

test('quality gate rejects action-specific certainty escalation', async () => {
  const cases = [
    {
      title: 'Anthony Davis Expected To Remain With Wizards',
      summary: 'Anthony Davis is expected to remain with the Washington Wizards.',
      resultTitle: '安东尼·戴维斯确定留队',
      resultSummary: '据报道，安东尼·戴维斯将继续留在奇才。',
      expectedReason: 'certainty-escalation'
    },
    {
      title: 'LeBron James Could Join 76ers',
      summary: 'LeBron James could join the Philadelphia 76ers.',
      resultTitle: '勒布朗·詹姆斯将加盟 76 人',
      resultSummary: '据报道，勒布朗·詹姆斯将加盟 76 人。',
      expectedReason: 'certainty-escalation'
    },
    {
      title: 'LeBron James Likely To Return To Lakers',
      summary: 'LeBron James is likely to return to the Los Angeles Lakers.',
      resultTitle: '勒布朗·詹姆斯将回归湖人',
      resultSummary: '勒布朗·詹姆斯将回归湖人，并继续为球队效力。',
      expectedReason: 'certainty-escalation'
    },
    {
      title: 'LeBron James May Join 76ers',
      summary: 'LeBron James may join the Philadelphia 76ers.',
      resultTitle: '勒布朗·詹姆斯正式加盟 76 人',
      resultSummary: '勒布朗·詹姆斯已经加盟 76 人，双方完成签约。',
      expectedReason: 'certainty-escalation'
    },
    {
      title: 'Lakers Interested In Seth Curry',
      summary: 'The Los Angeles Lakers are interested in Seth Curry.',
      resultTitle: '湖人已经签下 Seth Curry',
      resultSummary: '据报道，湖人已经签下 Seth Curry，双方完成签约。',
      expectedReason: 'certainty-escalation'
    },
    {
      title: 'Lakers Considering Signing LeBron James',
      summary: 'The Los Angeles Lakers are considering signing LeBron James.',
      resultTitle: '湖人已决定签下勒布朗·詹姆斯',
      resultSummary: '湖人已决定签下勒布朗·詹姆斯，双方即将完成签约。',
      expectedReason: 'certainty-escalation'
    },
    {
      title: 'Warriors Exploring Trade For LeBron James',
      summary: 'The Golden State Warriors are exploring a trade for LeBron James.',
      resultTitle: '勇士已经交易得到勒布朗·詹姆斯',
      resultSummary: '勇士已通过交易得到勒布朗·詹姆斯，交易正式完成。',
      expectedReason: 'certainty-escalation'
    },
    {
      title: 'LeBron James Leaning Toward Joining 76ers',
      summary: 'LeBron James is leaning toward joining the Philadelphia 76ers.',
      resultTitle: '勒布朗·詹姆斯已决定加盟 76 人',
      resultSummary: '勒布朗·詹姆斯已决定加盟 76 人，双方将完成签约。',
      expectedReason: 'certainty-escalation'
    },
    {
      title: '76ers Reportedly Agree To Deal With LeBron James',
      summary: 'The Philadelphia 76ers reportedly agreed to a deal with LeBron James.',
      resultTitle: '76 人与勒布朗·詹姆斯已达成合同',
      resultSummary: '76 人与勒布朗·詹姆斯已达成合同，双方完成签约。',
      expectedReason: 'certainty-escalation'
    },
    {
      title: 'Stephen Curry Not Expected To Leave Warriors',
      summary: 'Stephen Curry is not expected to leave the Golden State Warriors.',
      resultTitle: '斯蒂芬·库里预计离队',
      resultSummary: '据报道，斯蒂芬·库里预计离开勇士。',
      expectedReason: 'negation-lost'
    },
    {
      title: 'No Indication Stephen Curry Will Leave Warriors',
      summary: 'There is no indication Stephen Curry will leave the Golden State Warriors.',
      resultTitle: '斯蒂芬·库里将离开勇士',
      resultSummary: '斯蒂芬·库里将离开勇士，并寻找下一支球队。',
      expectedReason: 'negation-lost'
    },
    {
      title: 'LeBron James Has Not Decided On Next Team',
      summary: 'LeBron James has not decided which team he will join.',
      resultTitle: '勒布朗·詹姆斯已决定加盟新球队',
      resultSummary: '据报道，勒布朗·詹姆斯已经决定加盟新球队。',
      expectedReason: 'negation-lost'
    }
  ];

  for (const [index, entry] of cases.entries()) {
    const record = await makeRecord({
      originalTitle: entry.title,
      originalSummary: entry.summary,
      url: `https://example.com/certainty-${index}`
    });
    const validation = validateEditorialResult({
      titleZh: entry.resultTitle,
      summaryZh: entry.resultSummary,
      categoryZh: record.category,
      tagsZh: ['NBA', '动态'],
      confidence: 0.9,
      factLevel: record.expectedFactLevel
    }, record);
    assert.ok(
      validation.reasons.includes(entry.expectedReason),
      `${entry.title}: ${JSON.stringify(validation)}`
    );
  }
});

test('frozen TR-03 wording is rejected for expected-status escalation', async () => {
  const record = await makeRecord({
    originalTitle: 'Wizards, Mavericks Had No Interest In Trading Anthony Davis, Kyrie Irving',
    originalSummary: [
      'Neither the Washington Wizards nor the Dallas Mavericks had any interest in trading either player.',
      "It's expected that both Davis and Irving will start the season with the Wizards and Mavericks, respectively."
    ].join(' '),
    url: 'https://example.com/frozen-tr-03'
  });
  const validation = validateEditorialResult({
    titleZh: '奇才、独行侠无意交易安东尼·戴维斯、凯里·欧文',
    summaryZh: '据报道，奇才和独行侠均无意交易两人。戴维斯和欧文将留在奇才和独行侠。',
    categoryZh: '流言',
    tagsZh: ['奇才', '独行侠'],
    confidence: 0.9,
    factLevel: 'rumor'
  }, record);

  assert.ok(validation.reasons.includes('certainty-escalation'), JSON.stringify(validation));
  assert.ok(
    validation.details.unsafeFragments.includes('source-expected:stay->output-definite:stay'),
    JSON.stringify(validation)
  );
});

test('quality gate preserves English negation when Chinese remains undecided', async () => {
  const record = await makeRecord({
    originalTitle: 'LeBron James Has Not Decided On Next Team',
    originalSummary: 'LeBron James has yet to decide which team he will join.',
    url: 'https://example.com/not-decided-safe'
  });
  const validation = validateEditorialResult({
    titleZh: '勒布朗·詹姆斯尚未决定下家',
    summaryZh: '据报道，勒布朗·詹姆斯尚未决定下一支球队，目前仍在考虑不同选择。',
    categoryZh: record.category,
    tagsZh: ['勒布朗·詹姆斯', '流言'],
    confidence: 0.9,
    factLevel: record.expectedFactLevel
  }, record);
  assert.ok(!validation.reasons.includes('negation-lost'), JSON.stringify(validation));
  assert.ok(!validation.reasons.includes('certainty-escalation'), JSON.stringify(validation));
});

test('quality gate identifies analysis presented as completed fact', async () => {
  const record = await makeRecord({
    originalTitle: 'What It Means For LeBron James If Lakers Make A Trade',
    originalSummary: 'The analysis explores how a possible trade could affect LeBron James and the Lakers.',
    url: 'https://example.com/analysis-as-fact'
  });
  const validation = validateEditorialResult({
    titleZh: '湖人交易改变勒布朗·詹姆斯处境',
    summaryZh: '湖人完成交易后改变了勒布朗·詹姆斯的球队处境和后续安排。',
    categoryZh: '分析',
    tagsZh: ['湖人', '勒布朗·詹姆斯'],
    confidence: 0.9,
    factLevel: 'analysis'
  }, record);
  assert.ok(validation.reasons.includes('analysis-presented-as-fact'), JSON.stringify(validation));
});

test('quality gate does not reject confirmed signings or completed trades as escalation', async () => {
  const signingRecord = await makeRecord();
  const signing = validateEditorialResult({
    titleZh: '湖人与 Jaxson Hayes 完成续约',
    summaryZh: 'Jaxson Hayes 已与湖人达成 2 年 1200 万美元合同，双方正式完成续约。',
    categoryZh: '签约',
    tagsZh: ['湖人', '续约'],
    confidence: 0.9,
    factLevel: 'confirmed'
  }, signingRecord);
  assert.ok(!signing.reasons.includes('certainty-escalation'), JSON.stringify(signing));

  const tradeRecord = await makeRecord({
    originalTitle: '76ers Acquire Jaylen Brown From Celtics',
    originalSummary: 'The Philadelphia 76ers completed a trade to acquire Jaylen Brown from the Boston Celtics.',
    url: 'https://example.com/completed-trade'
  });
  const trade = validateEditorialResult({
    titleZh: '76 人从凯尔特人得到杰伦·布朗',
    summaryZh: '76 人已经完成与凯尔特人的交易，并从对方得到杰伦·布朗。',
    categoryZh: '交易',
    tagsZh: ['76 人', '凯尔特人'],
    confidence: 0.9,
    factLevel: 'confirmed'
  }, tradeRecord);
  assert.ok(!trade.reasons.includes('certainty-escalation'), JSON.stringify(trade));
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

test('Phase 1 versions and prompts isolate fact extraction from editorial generation', async () => {
  const record = await makeRecord();
  const factPrompt = buildFactExtractionPrompt(record, 'Jaxson Hayes signed the contract.');
  const fact = makeSigningFact();
  const editorialPrompt = buildPhase1EditorialPrompt(fact, record);

  assert.equal(PIPELINE_VERSION, 'editorial-pipeline-v5-two-stage');
  assert.equal(FACT_EXTRACTION_VERSION, 'fact-v3-qwen3-evidence-first');
  assert.equal(EDITORIAL_GENERATION_VERSION, 'editorial-v1-qwen3');
  assert.match(factPrompt, /evidenceItems/);
  assert.match(factPrompt, /Do not classify/);
  assert.doesNotMatch(factPrompt, /"certainty"|"polarity"|"sourceField"|"factText"/);
  assert.match(factPrompt, /articleText=Jaxson Hayes signed the contract/);
  assert.match(editorialPrompt, /validatedFactJson=/);
  assert.match(editorialPrompt, /editorialConstraints=/);
  assert.match(editorialPrompt, /requiredAttributions/);
  assert.match(editorialPrompt, /requiredNumbers/);
  assert.match(editorialPrompt, /oneLineFacts/);
  assert.match(editorialPrompt, /categoryZh 必须是 签约/);
  assert.doesNotMatch(editorialPrompt, /rssSummary=|articleText=/);

  const factRequest = buildPhase1FactRequest(factPrompt);
  const editorialRequest = buildPhase1EditorialRequest(editorialPrompt);
  assert.match(factRequest.messages[0].content, /no_think/);
  assert.match(editorialRequest.messages[0].content, /no_think/);
  assert.equal('tools' in factRequest, false);
  assert.equal('tools' in editorialRequest, false);
});

test('Phase 1 evidence parser requires the exact schema and ignores reasoning', () => {
  const evidence = makeEvidenceExtraction({
    evidenceQuote: 'Jaxson Hayes has agreed to a two-year, $12 million contract with the Los Angeles Lakers.'
  });
  const factNormalized = normalizeFactExtractionResponse({
    choices: [{
      message: { content: JSON.stringify(evidence), reasoning: 'Never parse this reasoning.' },
      finish_reason: 'stop'
    }]
  });
  assert.deepEqual(factNormalized.parsed, evidence);

  const editorial = makeSigningEditorial();
  const editorialNormalized = normalizePhase1EditorialResponse({
    choices: [{
      message: { content: JSON.stringify(editorial), reasoning: 'Never parse this reasoning.' },
      finish_reason: 'stop'
    }]
  });
  assert.deepEqual(editorialNormalized.parsed, editorial);

  const incomplete = normalizeFactExtractionResponse({
    response: { evidenceItems: [{ id: 'evidence-1' }] },
    finish_reason: 'stop'
  });
  assert.equal(incomplete.parsed, null);
  assert.equal(incomplete.structuralFailureReason, 'qwen-incomplete-schema');

  const optionalAttribution = normalizeFactExtractionResponse({
    response: {
      evidenceItems: [{
        id: 'evidence-1',
        evidenceQuote: 'Jaxson Hayes signed with the Los Angeles Lakers.'
      }]
    },
    finish_reason: 'stop'
  });
  assert.deepEqual(optionalAttribution.parsed.evidenceItems[0], {
    id: 'evidence-1',
    evidenceQuote: 'Jaxson Hayes signed with the Los Angeles Lakers.',
    attributionName: '',
    attributionQuote: ''
  });

  const forbiddenModelLabel = makeEvidenceExtraction({
    evidenceQuote: 'Jaxson Hayes signed with the Los Angeles Lakers.'
  });
  forbiddenModelLabel.evidenceItems[0].sourceField = 'title';
  const forbidden = normalizeFactExtractionResponse({
    response: forbiddenModelLabel,
    finish_reason: 'stop'
  });
  assert.equal(forbidden.parsed, null);
  assert.equal(forbidden.structuralFailureReason, 'qwen-incomplete-schema');

  const trailingComma = normalizeFactExtractionResponse({
    choices: [{
      message: {
        content: '```json\n{"evidenceItems":[{"id":"evidence-1","evidenceQuote":"Jaxson Hayes signed with the Los Angeles Lakers.","attributionName":"","attributionQuote":"",},],}\n```'
      },
      finish_reason: 'stop'
    }]
  });
  assert.equal(trailingComma.parsed.evidenceItems.length, 1);
});

test('Stage 1 locates evidence in title, rssSummary, and articleText deterministically', async () => {
  const record = await makeRecord({
    originalTitle: 'Lakers Sign Jaxson Hayes',
    originalSummary: 'The contract is worth $12 million over two years.'
  });
  const extraction = makeEvidenceExtraction([
    { evidenceQuote: 'Lakers Sign Jaxson Hayes' },
    { evidenceQuote: 'The contract is worth $12 million over two years.' },
    { evidenceQuote: 'The team officially announced the agreement on Monday.' }
  ]);
  const validation = validateFactExtraction(
    extraction,
    record,
    'The team officially announced the agreement on Monday.'
  );

  assert.equal(validation.ok, true, validation.reasons.join(','));
  assert.deepEqual(
    validation.value.facts.map((fact) => fact.sourceField),
    ['title', 'rssSummary', 'articleText']
  );
});

test('Stage 1 generates signing facts and exact contract numbers from evidence only', async () => {
  const record = await makeRecord();
  const validation = validateFactExtraction(makeEvidenceExtraction({
    evidenceQuote: record.originalSummary
  }), record);

  assert.equal(validation.ok, true, validation.reasons.join(','));
  assert.equal(validation.value.facts.length, 1);
  assert.equal(validation.value.facts[0].certainty, 'confirmed');
  assert.deepEqual(validation.value.facts[0].numbers, [
    { type: 'money', value: 'usd-million:12' },
    { type: 'contractYears', value: 'years:2' }
  ]);
});

test('Stage 1 rejects unsupported events and semantic paraphrases', async () => {
  const rumorRecord = await makeRecord({
    originalTitle: 'Lakers Interested In Jaxson Hayes',
    originalSummary: 'The Los Angeles Lakers are interested in Jaxson Hayes but have not decided whether to make an offer.'
  });
  const unsupported = makeEvidenceExtraction({
    evidenceQuote: 'This exact sentence does not exist.'
  });
  const missingEvidence = validateFactExtraction(unsupported, rumorRecord);
  assert.equal(missingEvidence.reasons.includes('fact-evidence-not-found'), true);
  assert.deepEqual(missingEvidence.details.unsupportedEvents, ['evidence-1']);

  const paraphrase = makeEvidenceExtraction({
    evidenceQuote: 'The Lakers may make an offer to Jaxson Hayes.'
  });
  assert.equal(
    validateFactExtraction(paraphrase, rumorRecord)
      .reasons.includes('fact-evidence-not-found'),
    true
  );
});

test('Stage 1 evidence matching normalizes case, whitespace, smart quotes, and dashes only', async () => {
  const record = await makeRecord({
    originalTitle: 'Curry Says “We May Return”',
    originalSummary: 'Stephen Curry says   “We may return” after the mid–season break.'
  });
  const extraction = makeEvidenceExtraction({
    evidenceQuote: 'stephen curry says "we may return" after the mid-season break.',
    attributionName: 'Stephen Curry',
    attributionQuote: 'stephen curry says "we may return"'
  });
  const validation = validateFactExtraction(extraction, record);
  assert.equal(validation.ok, true, validation.reasons.join(','));
  assert.equal(validation.value.facts[0].sourceField, 'rssSummary');
});

test('Stage 1 generates interest, expected, likely, possible, opinion, and confirmed certainty', async () => {
  const cases = [
    {
      title: 'Lakers Interested In Jaxson Hayes',
      summary: 'The Los Angeles Lakers are interested in Jaxson Hayes.',
      certainty: 'interest'
    },
    {
      title: 'Draymond Green Expected To Remain',
      summary: 'Draymond Green is expected to remain with the Golden State Warriors.',
      certainty: 'expected'
    },
    {
      summary: 'Draymond Green is likely to remain with the Golden State Warriors.',
      title: 'Draymond Green Likely To Remain',
      certainty: 'likely'
    },
    {
      summary: 'Draymond Green could remain with the Golden State Warriors.',
      title: 'Draymond Green Could Remain',
      certainty: 'possible'
    },
    {
      summary: 'Stephen Curry said LeBron James made his own decision.',
      title: 'Stephen Curry Discusses LeBron James',
      certainty: 'opinion',
      attributionName: 'Stephen Curry',
      attributionQuote: 'Stephen Curry said LeBron James made his own decision.'
    },
    {
      summary: 'Draymond Green signed with the Golden State Warriors.',
      title: 'Draymond Green Signed With Warriors',
      certainty: 'confirmed'
    }
  ];

  for (const item of cases) {
    const record = await makeRecord({
      originalTitle: item.title,
      originalSummary: item.summary
    });
    const validation = validateFactExtraction(makeEvidenceExtraction({
      evidenceQuote: item.summary,
      attributionName: item.attributionName || '',
      attributionQuote: item.attributionQuote || ''
    }), record);
    assert.equal(validation.ok, true, `${item.certainty}: ${validation.reasons.join(',')}`);
    assert.equal(validation.value.facts[0].certainty, item.certainty);
  }
});

test('Stage 1 treats reportedly as attribution without overriding interest modality', async () => {
  const record = await makeRecord({
    originalTitle: 'Heat Reportedly Interested In Klay Thompson',
    originalSummary: 'The Miami Heat are reportedly interested in Klay Thompson.'
  });
  const validation = validateFactExtraction(makeEvidenceExtraction({
    evidenceQuote: record.originalSummary,
    attributionName: 'RealGM',
    attributionQuote: record.originalSummary
  }), record);

  assert.equal(validation.ok, true, validation.reasons.join(','));
  assert.equal(validation.value.facts[0].certainty, 'interest');
  assert.equal(validation.value.facts[0].attribution, 'RealGM');
});

test('Stage 1 generates negative polarity and certainty red lines without model labels', async () => {
  const record = await makeRecord({
    originalTitle: 'Lakers Have Not Decided On Jaxson Hayes',
    originalSummary: 'The Los Angeles Lakers have not decided whether to make an offer to Jaxson Hayes.'
  });
  const validation = validateFactExtraction(makeEvidenceExtraction({
    evidenceQuote: record.originalSummary
  }), record);
  assert.equal(validation.ok, true, validation.reasons.join(','));
  assert.equal(validation.value.facts[0].polarity, 'negative');
  assert.equal(validation.value.facts[0].certainty, 'possible');
  assert.deepEqual(validation.value.mustNotClaim, [
    'Do not claim that a decision has been made.',
    'Do not claim that a possible action will happen or is completed.'
  ]);
});

test('Stage 1 enforces attribution evidence for interviews and analysis', async () => {
  const record = await makeRecord({
    originalTitle: 'Stephen Curry Discusses LeBron James',
    originalSummary: 'Stephen Curry said LeBron James made his own decision.'
  });
  const derived = validateFactExtraction(makeEvidenceExtraction({
    evidenceQuote: record.originalSummary
  }), record);
  assert.equal(derived.ok, true, derived.reasons.join(','));
  assert.equal(derived.value.facts[0].attribution, 'Stephen Curry');

  const missingRecord = await makeRecord({
    originalTitle: 'Interview Transcript',
    originalSummary: 'The roster decision remains under discussion.'
  });
  missingRecord.storyType = 'interview';
  const missing = validateFactExtraction(makeEvidenceExtraction({
    evidenceQuote: missingRecord.originalSummary
  }), missingRecord);
  assert.equal(missing.reasons.includes('fact-attribution-missing'), true);

  const badQuote = validateFactExtraction(makeEvidenceExtraction({
    evidenceQuote: record.originalSummary,
    attributionName: 'Stephen Curry',
    attributionQuote: 'Curry made a separate statement not found in the input.'
  }), record);
  assert.equal(
    badQuote.reasons.includes('fact-attribution-evidence-not-found'),
    true
  );

  const valid = validateFactExtraction(makeEvidenceExtraction({
    evidenceQuote: record.originalSummary,
    attributionName: 'Stephen Curry',
    attributionQuote: record.originalSummary
  }), record);
  assert.equal(valid.ok, true, valid.reasons.join(','));
  assert.equal(valid.value.facts[0].attribution, 'Stephen Curry');

  const analysisRecord = await makeRecord({
    originalTitle: "Dunc'd On: LeBron James to Philadelphia",
    originalSummary: 'How good is this Sixers team in the East?'
  });
  const analysis = validateFactExtraction(makeEvidenceExtraction({
    evidenceQuote: analysisRecord.originalSummary
  }), analysisRecord);
  assert.equal(analysis.ok, true, analysis.reasons.join(','));
  assert.equal(analysis.value.storyType, 'analysis');
  assert.equal(analysis.value.facts[0].attribution, "Dunc'd On");

  const mixedAnalysisRecord = await makeRecord({
    originalTitle: "Dunc'd On: LeBron James to Philadelphia",
    originalSummary: 'LeBron James agreed to join the Philadelphia 76ers. How good is this Sixers team in the East?'
  });
  const mixedAnalysis = validateFactExtraction({
    evidenceItems: [
      {
        id: 'evidence-1',
        evidenceQuote: 'LeBron James agreed to join the Philadelphia 76ers.',
        attributionName: '',
        attributionQuote: ''
      },
      {
        id: 'evidence-2',
        evidenceQuote: 'How good is this Sixers team in the East?',
        attributionName: '',
        attributionQuote: ''
      }
    ]
  }, mixedAnalysisRecord);
  assert.equal(mixedAnalysis.ok, true, mixedAnalysis.reasons.join(','));
  assert.deepEqual(
    mixedAnalysis.value.facts.map((fact) => fact.certainty),
    ['confirmed', 'opinion']
  );

  const reportedAnalysisRecord = await makeRecord({
    originalTitle: 'Warriors Focused On Building For The Future',
    originalSummary: 'The Warriors real focus is reportedly on building a roster for after Stephen Curry retires.'
  });
  const reportedAnalysis = validateFactExtraction(makeEvidenceExtraction({
    evidenceQuote: reportedAnalysisRecord.originalSummary
  }), reportedAnalysisRecord);
  assert.equal(reportedAnalysis.ok, true, reportedAnalysis.reasons.join(','));
  assert.equal(reportedAnalysis.value.storyType, 'analysis');
  assert.equal(reportedAnalysis.value.facts[0].attribution, 'RealGM');
});

test('Stage 1 does not require attribution for routine signings or final scores', async () => {
  const signing = await makeRecord();
  assert.equal(validateFactExtraction(makeEvidenceExtraction({
    evidenceQuote: signing.originalSummary
  }), signing).ok, true);

  const game = await makeRecord({
    originalTitle: 'Lakers Beat Celtics 101-90',
    originalSummary: 'The Los Angeles Lakers defeated the Boston Celtics 101-90.'
  });
  const validation = validateFactExtraction(makeEvidenceExtraction({
    evidenceQuote: game.originalSummary
  }), game);
  assert.equal(validation.ok, true, validation.reasons.join(','));
  assert.deepEqual(validation.value.facts[0].numbers, [
    { type: 'score', value: 'score:101:90' }
  ]);

  const perGame = await makeRecord({
    originalTitle: 'Julian Phillips, Rockets Sign Contract',
    originalSummary: 'Phillips averaged 3.6 points in 11.2 minutes per game.'
  });
  const perGameValidation = validateFactExtraction(makeEvidenceExtraction({
    evidenceQuote: perGame.originalSummary
  }), perGame);
  assert.equal(perGameValidation.ok, true, perGameValidation.reasons.join(','));
});

test('Stage 2 accepts only verified copy and requires an independent oneLine', async () => {
  const record = await makeRecord();
  const fact = makeSigningFact();
  const accepted = validatePhase1EditorialResult(makeSigningEditorial(), record, fact);
  assert.equal(accepted.ok, true, accepted.reasons.join(','));
  assert.equal(accepted.value.oneLineZh, 'Hayes 的新合同价值 1200 万美元');

  const duplicate = validatePhase1EditorialResult({
    ...makeSigningEditorial(),
    oneLineZh: '湖人与 Jaxson Hayes 达成 2 年合同'
  }, record, fact);
  assert.equal(duplicate.reasons.includes('title-oneline-duplicate'), true);

  const fabricated = validatePhase1EditorialResult({
    ...makeSigningEditorial(),
    oneLineZh: 'Hayes 的新合同价值 9900 万美元'
  }, record, fact);
  assert.equal(
    fabricated.reasons.includes('editorial-fact-mismatch') ||
    fabricated.reasons.includes('added-facts'),
    true
  );
});

test('Stage 2 builds deterministic editorial constraints from verified Facts', () => {
  const fact = makeFactSet('analysis', [
    {
      text: 'According to RealGM, the Heat could pursue Klay Thompson.',
      certainty: 'possible',
      attribution: 'RealGM'
    },
    {
      text: 'Thompson is owed $17.5 million in the final year of his contract.',
      certainty: 'possible'
    }
  ], ['Do not claim that a possible action will happen or is completed.']);
  const constraints = buildEditorialConstraints(fact);

  assert.deepEqual(constraints.requiredAttributions, ['RealGM']);
  assert.deepEqual(
    constraints.requiredNumbers.map(({ type, value, displayZh }) => ({
      type,
      value,
      displayZh
    })),
    [{
      type: 'money',
      value: 'usd-million:17.5',
      displayZh: '1750 万美元'
    }]
  );
  assert.equal(constraints.requiredAnalysisMarker, true);
  assert.equal(
    constraints.requiredCertainty.some((entry) => entry.certainty === 'possible'),
    true
  );
  assert.deepEqual(constraints.forbiddenClaims, [
    'Do not claim that a possible action will happen or is completed.'
  ]);
  assert.equal(constraints.oneLineFacts[0].id, 'fact-2');
});

test('Stage 2 enforces attribution, equivalent Chinese money, and analysis markers', async () => {
  const record = await makeRecord({
    originalTitle: 'Warriors Focused On Building For The Future',
    originalSummary: 'RealGM reports that the Warriors could pursue LeBron James.'
  });
  const fact = makeFactSet('analysis', [
    {
      text: 'RealGM reports that the Warriors could pursue LeBron James.',
      certainty: 'possible',
      attribution: 'RealGM'
    },
    {
      text: 'James is owed $17.5 million in the final year of his contract.',
      certainty: 'possible'
    }
  ], ['Do not claim that a possible action will happen or is completed.']);
  const safe = validatePhase1EditorialResult({
    titleZh: '勇士可能关注勒布朗·詹姆斯',
    summaryZh: '据 RealGM 分析，勇士可能关注勒布朗·詹姆斯；他的合同最后一年薪资为 1750 万美元。',
    oneLineZh: 'RealGM 认为这仍是一种可能性，合同还剩最后一年',
    categoryZh: '分析',
    tagsZh: ['勇士', '勒布朗·詹姆斯'],
    confidence: 0.9
  }, record, fact);
  assert.equal(safe.ok, true, JSON.stringify(safe));

  const missing = validatePhase1EditorialResult({
    titleZh: '勇士可能关注勒布朗·詹姆斯',
    summaryZh: '勇士可能关注勒布朗·詹姆斯。',
    oneLineZh: '这仍是一种尚未确定的可能性',
    categoryZh: '分析',
    tagsZh: ['勇士', '勒布朗·詹姆斯'],
    confidence: 0.9
  }, record, fact);
  assert.equal(missing.reasons.includes('editorial-attribution-missing'), true);
  assert.equal(missing.reasons.includes('editorial-required-number-missing'), true);
  assert.equal(missing.reasons.includes('editorial-analysis-marker-missing'), true);
});

test('Stage 2 rejects reordered oneLine duplicates and unexpected English tokens', async () => {
  const record = await makeRecord();
  const fact = makeSigningFact();
  const reordered = validatePhase1EditorialResult({
    ...makeSigningEditorial(),
    titleZh: '湖人以 2 年合同签下 Jaxson Hayes',
    summaryZh: 'Jaxson Hayes 与湖人达成 2 年 1200 万美元合同，双方已经完成这笔签约。',
    oneLineZh: 'Jaxson Hayes 以 2 年合同加盟湖人'
  }, record, fact);
  assert.equal(reordered.reasons.includes('title-oneline-low-value-duplicate'), true);

  const unexpectedEnglish = validatePhase1EditorialResult({
    ...makeSigningEditorial(),
    summaryZh: '湖人 reportedly 与 Jaxson Hayes 达成 2 年 1200 万美元合同。'
  }, record, fact);
  assert.equal(unexpectedEnglish.reasons.includes('unexpected-english-token'), true);
  assert.equal(
    unexpectedEnglish.details.unsafeFragments.includes('unexpected-english:reportedly'),
    true
  );
});

test('Stage 2 constraints cover the frozen rumor and signing regressions', async () => {
  const cases = [
    {
      id: 'TR-01',
      storyType: 'trade_rumor',
      facts: [
        {
          text: 'RealGM reports that the Miami Heat, Denver Nuggets and Cleveland Cavaliers are interested in DeMar DeRozan.',
          certainty: 'interest',
          attribution: 'RealGM'
        },
        {
          text: 'DeRozan had a partial guarantee of $10 million on a $26.74 million contract with the Sacramento Kings.',
          certainty: 'possible'
        }
      ],
      editorial: {
        titleZh: '热火、掘金和骑士有意德玛尔·德罗赞',
        summaryZh: '据 RealGM 报道，热火、掘金和骑士均有意德玛尔·德罗赞；他与国王的 2674 万美元合同仅有 1000 万美元受保障。',
        oneLineZh: '德罗赞与国王的合同仅有 1000 万美元受保障',
        categoryZh: '流言',
        tagsZh: ['德玛尔·德罗赞'],
        confidence: 0.9
      }
    },
    {
      id: 'TR-02',
      storyType: 'trade_rumor',
      facts: [
        {
          text: 'The Miami Heat are interested in adding Klay Thompson.',
          certainty: 'interest'
        },
        {
          text: 'Thompson is owed $17.5 million in the final year of his contract with the Dallas Mavericks.',
          certainty: 'possible'
        }
      ],
      editorial: {
        titleZh: '热火有意引进克莱·汤普森',
        summaryZh: '热火有意引进克莱·汤普森，但他与独行侠的合同还剩最后一年，价值 1750 万美元。',
        oneLineZh: '汤普森与独行侠的最后一年合同价值 1750 万美元',
        categoryZh: '流言',
        tagsZh: ['热火', '克莱·汤普森'],
        confidence: 0.9
      }
    },
    {
      id: 'TR-03',
      storyType: 'trade_rumor',
      facts: [
        {
          text: 'The Washington Wizards and Dallas Mavericks had no interest in trading Anthony Davis or Kyrie Irving.',
          certainty: 'interest',
          polarity: 'negative'
        },
        {
          text: 'Anthony Davis and Kyrie Irving are expected to start the season with their current teams.',
          certainty: 'expected'
        }
      ],
      editorial: {
        titleZh: '奇才和独行侠无意交易戴维斯或欧文',
        summaryZh: '奇才和独行侠均无意交易安东尼·戴维斯或凯里·欧文，两人预计将在各自球队开始新赛季。',
        oneLineZh: '戴维斯和欧文预计将在现有球队开始新赛季',
        categoryZh: '流言',
        tagsZh: ['戴维斯', '欧文'],
        confidence: 0.9
      }
    },
    {
      id: 'SG-01',
      storyType: 'signing',
      facts: [
        {
          text: 'The Denver Nuggets matched a two-year, $12 million offer sheet for Spencer Jones.',
          certainty: 'confirmed'
        },
        {
          text: 'Denver will retain Jones, who was a rotation player last season.',
          certainty: 'confirmed'
        }
      ],
      editorial: {
        titleZh: '掘金匹配报价留下斯潘塞·琼斯',
        summaryZh: '掘金匹配了为斯潘塞·琼斯开出的 2 年 1200 万美元报价合同。',
        oneLineZh: '琼斯上赛季已进入掘金轮换阵容',
        categoryZh: '签约',
        tagsZh: ['掘金', '斯潘塞·琼斯'],
        confidence: 0.9
      }
    },
    {
      id: 'SG-02',
      storyType: 'signing',
      facts: [
        {
          text: 'Draymond Green is expected to re-sign with the Golden State Warriors for $28 million.',
          certainty: 'expected'
        },
        {
          text: 'Green has always been expected to stay with Golden State.',
          certainty: 'expected'
        }
      ],
      editorial: {
        titleZh: '德雷蒙德·格林预计以 2800 万美元与勇士续约',
        summaryZh: '德雷蒙德·格林预计将以接近 2800 万美元的价格与勇士续约。',
        oneLineZh: '勇士一直预期格林会继续留队',
        categoryZh: '签约',
        tagsZh: ['勇士', '德雷蒙德·格林'],
        confidence: 0.9
      }
    }
  ];

  for (const entry of cases) {
    const fact = makeFactSet(entry.storyType, entry.facts, [
      ...(entry.storyType === 'trade_rumor'
        ? ['Do not claim that interest or an expected action is completed.']
        : [])
    ]);
    const record = await makeRecord({
      originalTitle: entry.facts[0].text,
      originalSummary: entry.facts.map((item) => item.text).join(' ')
    });
    const validation = validatePhase1EditorialResult(entry.editorial, record, fact);
    assert.equal(validation.ok, true, `${entry.id}: ${JSON.stringify(validation)}`);
  }
});

test('Stage 2 keeps analysis and previously accepted frozen-style outputs safe', async () => {
  const cases = [
    {
      id: 'AN-01',
      storyType: 'analysis',
      facts: [
        {
          text: 'RealGM reports that the Warriors focus is on building a roster for after Stephen Curry retires.',
          certainty: 'opinion',
          attribution: 'RealGM'
        },
        {
          text: 'The Warriors could pursue LeBron James.',
          certainty: 'possible'
        }
      ],
      editorial: {
        titleZh: '勇士可能关注勒布朗·詹姆斯',
        summaryZh: 'RealGM 分析认为，勇士更关注斯蒂芬·库里退役后的阵容建设，同时也可能追逐勒布朗·詹姆斯。',
        oneLineZh: '据 RealGM 分析，勇士的长期重点是库里退役后的阵容',
        categoryZh: '分析',
        tagsZh: ['勇士', '斯蒂芬·库里'],
        confidence: 0.9
      }
    },
    {
      id: 'SG-03',
      storyType: 'signing',
      facts: [
        {
          text: 'The Houston Rockets have signed forward Julian Phillips.',
          certainty: 'confirmed'
        },
        {
          text: 'The contract is likely a one-year deal worth $2.5 million.',
          certainty: 'likely'
        }
      ],
      editorial: {
        titleZh: '火箭签下前锋朱利安·菲利普斯',
        summaryZh: '火箭已经签下朱利安·菲利普斯，合同可能为 1 年 250 万美元。',
        oneLineZh: '这份合同可能是一份 1 年老将底薪合同',
        categoryZh: '签约',
        tagsZh: ['火箭', '朱利安·菲利普斯'],
        confidence: 0.9
      }
    },
    {
      id: 'IN-01',
      storyType: 'interview',
      facts: [
        {
          text: "Stephen Curry said, 'You don't envision anything until it happens.'",
          certainty: 'opinion',
          attribution: 'Stephen Curry'
        },
        {
          text: 'Curry had hoped LeBron James would choose Golden State.',
          certainty: 'opinion',
          attribution: 'Stephen Curry'
        }
      ],
      editorial: {
        titleZh: '斯蒂芬·库里谈詹姆斯选择球队',
        summaryZh: '斯蒂芬·库里表示，在事情发生前不会预想结果；他曾希望勒布朗·詹姆斯选择勇士。',
        oneLineZh: '库里称此事存在许多变数，无法提前设想',
        categoryZh: '分析',
        tagsZh: ['斯蒂芬·库里', '勇士'],
        confidence: 0.9
      }
    },
    {
      id: 'AN-02',
      storyType: 'analysis',
      facts: [
        {
          text: "Dunc'd On discusses LeBron James joining the Philadelphia 76ers.",
          certainty: 'opinion',
          attribution: "Dunc'd On"
        },
        {
          text: "Dunc'd On asks whether the 76ers offer the best chance to win.",
          certainty: 'opinion',
          attribution: "Dunc'd On"
        }
      ],
      editorial: {
        titleZh: 'Dunc’d On 讨论詹姆斯加盟 76 人',
        summaryZh: 'Dunc’d On 节目讨论了勒布朗·詹姆斯加盟 76 人的情景，并分析这是否是更好的争冠机会。',
        oneLineZh: '节目重点分析了 76 人的争冠可能性',
        categoryZh: '分析',
        tagsZh: ['勒布朗·詹姆斯', '76 人'],
        confidence: 0.9
      }
    }
  ];

  for (const entry of cases) {
    const fact = makeFactSet(entry.storyType, entry.facts, [
      ...(entry.storyType === 'analysis'
        ? ['Do not present an opinion or analysis as a completed fact.']
        : [])
    ]);
    const record = await makeRecord({
      originalTitle: entry.facts[0].text,
      originalSummary: entry.facts.map((item) => item.text).join(' ')
    });
    const validation = validatePhase1EditorialResult(entry.editorial, record, fact);
    assert.equal(validation.ok, true, `${entry.id}: ${JSON.stringify(validation)}`);
  }
});

test('Stage 2 requires SG-01 core contract facts without treating cap terms as people', async () => {
  const record = await makeRecord({
    originalTitle: 'Nuggets Matching Spencer Jones Offer Sheet From Thunder',
    originalSummary: [
      'The Denver Nuggets are matching the two-year, $12 million offer sheet Spencer Jones signed with the Oklahoma City Thunder.',
      'Denver will retain Jones.',
      'Oklahoma City will remain under the second apron by $6.9 million and retain its Taxpayer MLE.'
    ].join(' ')
  });
  const fact = {
    storyType: 'signing',
    facts: [
      {
        id: 'fact-1',
        factText: 'The Denver Nuggets are matching the two-year, $12 million offer sheet Spencer Jones signed with the Oklahoma City Thunder.',
        polarity: 'positive',
        certainty: 'confirmed',
        attribution: '',
        attributionQuote: '',
        sourceField: 'rssSummary',
        evidenceQuote: 'The Denver Nuggets are matching the two-year, $12 million offer sheet Spencer Jones signed with the Oklahoma City Thunder.',
        entities: [
          { type: 'team', canonicalId: 'nuggets' },
          { type: 'team', canonicalId: 'thunder' },
          { type: 'person', canonicalId: 'spencer-jones' }
        ],
        numbers: [
          { type: 'money', value: 'usd-million:12' },
          { type: 'contractYears', value: 'years:2' }
        ]
      },
      {
        id: 'fact-2',
        factText: 'Denver will retain Jones.',
        polarity: 'positive',
        certainty: 'confirmed',
        attribution: '',
        attributionQuote: '',
        sourceField: 'rssSummary',
        evidenceQuote: 'Denver will retain Jones.',
        entities: [],
        numbers: []
      },
      {
        id: 'fact-3',
        factText: 'Oklahoma City will remain under the second apron by $6.9 million and retain its Taxpayer MLE.',
        polarity: 'positive',
        certainty: 'confirmed',
        attribution: '',
        attributionQuote: '',
        sourceField: 'rssSummary',
        evidenceQuote: 'Oklahoma City will remain under the second apron by $6.9 million and retain its Taxpayer MLE.',
        entities: [],
        numbers: [{ type: 'money', value: 'usd-million:6.9' }]
      }
    ],
    mustNotClaim: []
  };

  const extracted = extractEvidenceFacts(fact.facts[2].evidenceQuote);
  assert.equal(extracted.players.includes('oklahoma-city'), false);
  assert.equal(extracted.players.includes('taxpayer-mle'), false);

  const validation = validatePhase1EditorialResult({
    titleZh: '掘金匹配雷霆为 Spencer Jones 开出的报价合同',
    summaryZh: '掘金匹配雷霆为 Spencer Jones 开出的 2 年 1200 万美元报价合同，并将留下这名球员。',
    oneLineZh: '这份报价合同为期 2 年，总值 1200 万美元',
    categoryZh: '签约',
    tagsZh: ['掘金', '雷霆', 'Spencer Jones'],
    confidence: 0.9
  }, record, fact);

  assert.equal(validation.ok, true, JSON.stringify(validation));
  assert.equal(validation.details.missingFacts.includes('money:usd-million:6.9'), false);
});

test('Stage 2 keeps a confirmed signing separate from likely contract terms', async () => {
  const record = await makeRecord({
    originalTitle: 'Rockets Sign Julian Phillips',
    originalSummary: [
      'The Houston Rockets have signed forward Julian Phillips.',
      "Terms were not disclosed, but it's likely that Phillips signed a one-year contract for the veteran minimum amount of $2.5 million."
    ].join(' ')
  });
  const factValidation = validateFactExtraction(makeEvidenceExtraction([
    { evidenceQuote: 'The Houston Rockets have signed forward Julian Phillips.' },
    {
      evidenceQuote:
        "Terms were not disclosed, but it's likely that Phillips signed a one-year contract for the veteran minimum amount of $2.5 million."
    }
  ]), record);
  assert.equal(factValidation.ok, true, JSON.stringify(factValidation));

  const validation = validatePhase1EditorialResult({
    titleZh: '火箭签下前锋菲利普斯',
    summaryZh: '火箭已经签下菲利普斯，合同细节尚未披露，但可能为 1 年 250 万美元的老将底薪合同。',
    oneLineZh: '这份合同的年限和金额尚未确认',
    categoryZh: '签约',
    tagsZh: ['火箭', '菲利普斯'],
    confidence: 0.9
  }, record, factValidation.value);

  assert.equal(validation.ok, true, JSON.stringify(validation));
  assert.equal(validation.reasons.includes('certainty-escalation'), false);
});

test('frozen Stage 2 facts require the complete internal Fact shape', () => {
  assert.equal(validateFrozenFactExtraction(makeSigningFact()).ok, true);
  assert.equal(validateFrozenFactExtraction({
    storyType: 'signing',
    facts: [{ id: 'fact-1' }],
    mustNotClaim: []
  }).ok, false);
});

test('Stage 2 rejects Unicode damage and keeps Curry aliases collision-safe', async () => {
  const record = await makeRecord({
    originalTitle: 'Stephen Curry Discusses Lakers',
    originalSummary: 'Stephen Curry discussed the Los Angeles Lakers.'
  });
  const fact = makeMinimalFact({
    storyType: 'interview',
    certainty: 'opinion',
    factText: 'Stephen Curry discussed the Los Angeles Lakers.',
    attribution: 'Stephen Curry',
    evidenceQuote: 'Stephen Curry discussed the Los Angeles Lakers.'
  });
  const unsafe = validatePhase1EditorialResult({
    titleZh: '斯蒂�·库里谈湖人',
    summaryZh: '库里谈到了湖人的情况，并明确表示这只是他的个人观点。',
    oneLineZh: '库里就湖人话题表达个人看法',
    categoryZh: '分析',
    tagsZh: ['库里', '湖人'],
    confidence: 0.9
  }, record, fact);
  assert.equal(unsafe.reasons.includes('unicode-replacement-character'), true);

  const safe = validatePhase1EditorialResult({
    titleZh: '库里谈及湖人相关话题',
    summaryZh: '库里谈到了湖人的情况，并明确表示这只是他的个人观点。',
    oneLineZh: '这番表态属于库里的个人观点',
    categoryZh: '分析',
    tagsZh: ['库里', '湖人'],
    confidence: 0.9
  }, record, fact);
  assert.equal(safe.details.missingFacts.includes('player:stephen-curry'), false);

  const collisionRecord = await makeRecord({
    originalTitle: 'Seth Curry Discusses Stephen Curry',
    originalSummary: 'Seth Curry discussed Stephen Curry.'
  });
  const collisionFact = makeMinimalFact({
    storyType: 'interview',
    certainty: 'opinion',
    factText: 'Seth Curry discussed Stephen Curry.',
    attribution: 'Seth Curry',
    evidenceQuote: 'Seth Curry discussed Stephen Curry.'
  });
  const collision = validatePhase1EditorialResult({
    titleZh: '赛斯·库里谈及斯蒂芬·库里',
    summaryZh: '赛斯·库里谈到了斯蒂芬·库里，这番内容属于个人表达。',
    oneLineZh: '这段内容来自赛斯·库里的个人表态',
    categoryZh: '分析',
    tagsZh: ['库里'],
    confidence: 0.9
  }, collisionRecord, collisionFact);
  assert.equal(collision.details.addedFacts.includes('player:dell-curry'), false);
});

function makeSigningFact() {
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

function makeSigningEditorial() {
  return {
    titleZh: '湖人与 Jaxson Hayes 达成 2 年合同',
    summaryZh: 'Jaxson Hayes 与湖人达成 2 年 1200 万美元合同，双方已经完成这笔签约。',
    oneLineZh: 'Hayes 的新合同价值 1200 万美元',
    categoryZh: '签约',
    tagsZh: ['湖人', '签约'],
    confidence: 0.9
  };
}

function makeFactSet(storyType, entries, mustNotClaim = []) {
  return {
    storyType,
    facts: entries.map((entry, index) => {
      const evidenceQuote = entry.text;
      const extracted = extractEvidenceFacts(evidenceQuote, evidenceQuote);
      return {
        id: `fact-${index + 1}`,
        factText: evidenceQuote,
        polarity: entry.polarity || 'positive',
        certainty: entry.certainty,
        attribution: entry.attribution || '',
        attributionQuote: entry.attribution ? evidenceQuote : '',
        sourceField: 'rssSummary',
        evidenceQuote,
        entities: [
          ...extracted.teams.map((canonicalId) => ({ type: 'team', canonicalId })),
          ...extracted.players.map((canonicalId) => ({ type: 'person', canonicalId }))
        ],
        numbers: [
          ...extracted.money.map((value) => ({ type: 'money', value })),
          ...extracted.durations.map((value) => ({ type: 'contractYears', value })),
          ...extracted.picks.map((value) => ({ type: 'tradeAsset', value })),
          ...extracted.scores.map((value) => ({ type: 'score', value }))
        ]
      };
    }),
    mustNotClaim
  };
}

function makeMinimalFact({
  storyType,
  certainty,
  factText,
  polarity = 'positive',
  attribution,
  sourceField = 'rssSummary',
  evidenceQuote
}) {
  const extracted = extractEvidenceFacts(evidenceQuote, evidenceQuote);
  return {
    storyType,
    facts: [{
      id: 'fact-1',
      factText,
      polarity,
      certainty,
      attribution,
      attributionQuote: attribution ? evidenceQuote : '',
      sourceField,
      evidenceQuote,
      entities: [
        ...extracted.teams.map((canonicalId) => ({ type: 'team', canonicalId })),
        ...extracted.players.map((canonicalId) => ({ type: 'person', canonicalId }))
      ],
      numbers: [
        ...extracted.money.map((value) => ({ type: 'money', value })),
        ...extracted.durations.map((value) => ({ type: 'contractYears', value })),
        ...extracted.picks.map((value) => ({ type: 'tradeAsset', value })),
        ...extracted.scores.map((value) => ({ type: 'score', value }))
      ]
    }],
    mustNotClaim: []
  };
}

function makeEvidenceExtraction(value) {
  const items = Array.isArray(value) ? value : [value];
  return {
    evidenceItems: items.map((item, index) => ({
      id: `evidence-${index + 1}`,
      evidenceQuote: item.evidenceQuote,
      attributionName: item.attributionName || '',
      attributionQuote: item.attributionQuote || ''
    }))
  };
}
