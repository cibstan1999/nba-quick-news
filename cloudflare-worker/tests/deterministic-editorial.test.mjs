import assert from 'node:assert/strict';
import test from 'node:test';
import {
  composeDeterministicEditorial,
  validateDeterministicEditorialComposition
} from '../src/deterministic-editorial.js';
import { buildEditorialFactPlan } from '../src/pipeline.js';

test('deterministic composer covers every planned trade rumor fact without escalation', () => {
  const facts = extraction('trade_rumor', [
    fact({
      id: 'fact-1',
      text: "I'm told Miami Heat are interested in DeMar DeRozan.",
      certainty: 'interest',
      attribution: 'RealGM',
      attributionQuote: "I'm told",
      entities: [
        entity('team', 'heat'),
        entity('person', 'demar-derozan')
      ]
    }),
    fact({
      id: 'fact-2',
      text: 'DeRozan had a partial guarantee on his contract for only $10 million of the total of $26.74 million with the Sacramento Kings.',
      certainty: 'possible',
      entities: [
        entity('team', 'kings'),
        entity('person', 'demar-derozan')
      ],
      numbers: [
        number('money', 'usd-million:10'),
        number('money', 'usd-million:26.74')
      ]
    })
  ], [
    'Do not claim that interest became a signing or completed trade.'
  ]);

  const { composition, validation, plan } = composeAndValidate(facts);
  assert.equal(validation.ok, true);
  assert.match(composition.titleZh, /据 RealGM 报道/);
  assert.match(composition.titleZh, /有意/);
  assert.doesNotMatch(composition.titleZh, /已签|加盟/);
  assert.match(composition.summaryZh, /1000 万美元/);
  assert.match(composition.summaryZh, /2674 万美元/);
  assert.deepEqual(composition.usedFactIds.title, plan.titleFactIds);
  assert.deepEqual(composition.usedFactIds.summary, plan.summaryFactIds);
  assert.deepEqual(composition.usedFactIds.oneLine, plan.oneLineFactIds);
});

test('deterministic signing composer preserves expected status and excludes SG-02 background', () => {
  const facts = extraction('signing', [
    fact({
      id: 'fact-1',
      text: 'Draymond Green Expected To Re-Sign With Warriors For $28 million',
      certainty: 'expected',
      entities: [
        entity('team', 'warriors'),
        entity('person', 'draymond-green')
      ],
      numbers: [number('money', 'usd-million:28')]
    }),
    fact({
      id: 'fact-2',
      text: 'The expectation is Green will re-sign at a figure close to the $28 million player option',
      certainty: 'expected',
      entities: [
        entity('team', 'warriors'),
        entity('person', 'draymond-green')
      ],
      numbers: [number('money', 'usd-million:28')]
    }),
    fact({
      id: 'fact-3',
      text: 'Green has always been expected to stay with Golden State',
      certainty: 'expected',
      entities: [
        entity('team', 'warriors'),
        entity('person', 'draymond-green')
      ]
    }),
    fact({
      id: 'fact-4',
      text: 'Now that James has picked the Philadelphia 76ers, Mike Dunleavy Jr. can turn to filling out the rest of his roster',
      entities: [
        entity('team', '76ers'),
        entity('person', 'mike-dunleavy-jr')
      ]
    })
  ], [
    'Do not claim that an expected action is confirmed or completed.'
  ]);

  const { composition, validation } = composeAndValidate(facts);
  assert.equal(validation.ok, true);
  assert.match(composition.titleZh, /预计/);
  assert.match(composition.summaryZh, /2800 万美元/);
  assert.doesNotMatch(JSON.stringify(composition), /Mike Dunleavy|助教|76 人/);
});

test('deterministic interview composer preserves speaker and viewpoint', () => {
  const facts = extraction('interview', [
    fact({
      id: 'fact-1',
      text: 'Curry had hoped James would choose Golden State',
      certainty: 'opinion',
      attribution: 'Stephen Curry',
      attributionQuote: 'Stephen Curry On',
      entities: [
        entity('person', 'stephen-curry'),
        entity('person', 'lebron-james'),
        entity('team', 'warriors')
      ]
    }),
    fact({
      id: 'fact-2',
      text: "That's why you don't envision anything until it happens",
      certainty: 'opinion',
      attribution: 'Stephen Curry',
      attributionQuote: 'Stephen Curry On',
      entities: [entity('person', 'stephen-curry')]
    })
  ], [
    'Do not present an opinion or analysis as a completed fact.'
  ]);

  const { composition, validation } = composeAndValidate(facts);
  assert.equal(validation.ok, true);
  assert.match(composition.titleZh, /斯蒂芬·库里谈/);
  assert.match(composition.summaryZh, /表示/);
  assert.match(composition.oneLineZh, /事情发生前不会预先设想结果/);
});

test('deterministic interview composer covers a player choice and related injury outlook', () => {
  const facts = extraction('interview', [
    fact({
      id: 'fact-choice',
      text: "Stephen Curry addressed LeBron James' decision to sign with the Philadelphia 76ers rather than the Golden State Warriors",
      certainty: 'opinion',
      attribution: 'Stephen Curry',
      attributionQuote: "Stephen Curry addressed LeBron James' decision",
      entities: [
        entity('person', 'stephen-curry'),
        entity('person', 'lebron-james'),
        entity('team', '76ers'),
        entity('team', 'warriors')
      ]
    }),
    fact({
      id: 'fact-injury-outlook',
      text: "Curry pointed to the injuries suffered by Jimmy Butler and Moody as the real factor shaping the Warriors' outlook, regardless of what happened with James.",
      certainty: 'opinion',
      entities: [
        entity('person', 'jimmy-butler'),
        entity('team', 'warriors')
      ]
    })
  ], [
    'Do not present an opinion or analysis as a completed fact.'
  ]);

  const { composition, validation } = composeAndValidate(facts);
  assert.equal(validation.ok, true, validation.reasons.join(', '));
  assert.match(
    composition.titleZh,
    /斯蒂芬·库里谈勒布朗·詹姆斯加盟 76 人而非勇士/
  );
  assert.match(
    composition.summaryZh,
    /斯蒂芬·库里谈到勒布朗·詹姆斯加盟 76 人而非勇士一事/
  );
  assert.match(
    composition.summaryZh,
    /吉米·巴特勒等人的伤病是影响勇士前景的重要因素/
  );
  assert.match(
    composition.oneLineZh,
    /斯蒂芬·库里指出，吉米·巴特勒等人的伤病是影响勇士前景的重要因素/
  );
  assert.doesNotMatch(JSON.stringify(composition), /勇士(?:已经|正式|确定|决定)/);
});

test('interview gate rejects a draft that omits a required related viewpoint', () => {
  const facts = extraction('interview', [
    fact({
      id: 'fact-choice',
      text: "Stephen Curry addressed LeBron James' decision to sign with the Philadelphia 76ers rather than the Golden State Warriors",
      certainty: 'opinion',
      attribution: 'Stephen Curry',
      entities: [
        entity('person', 'stephen-curry'),
        entity('person', 'lebron-james'),
        entity('team', '76ers'),
        entity('team', 'warriors')
      ]
    }),
    fact({
      id: 'fact-injury-outlook',
      text: "Curry pointed to the injuries suffered by Jimmy Butler as the real factor shaping the Warriors' outlook.",
      certainty: 'opinion',
      entities: [
        entity('person', 'jimmy-butler'),
        entity('team', 'warriors')
      ]
    })
  ], [
    'Do not present an opinion or analysis as a completed fact.'
  ]);
  const plan = buildEditorialFactPlan(facts);
  const composition = composeDeterministicEditorial(facts, { factPlan: plan });
  const validation = validateDeterministicEditorialComposition(
    {
      ...composition,
      summaryZh: '斯蒂芬·库里谈到勒布朗·詹姆斯加盟 76 人而非勇士一事。'
    },
    {
      newsId: 'news_interview_missing_fact',
      source: 'RealGM',
      publishedAt: '2026-07-29T00:00:00.000Z',
      originalTitle: '',
      originalSummary: ''
    },
    facts
  );

  assert.equal(validation.ok, false);
  assert.ok(validation.reasons.includes('editorial-required-fact-missing'));
  assert.ok(
    validation.details.missingFacts.some((value) => (
      value === 'fact-plan-summary:fact-injury-outlook'
    ))
  );
});

test('deterministic analysis composer keeps a hypothetical transaction hypothetical', () => {
  const facts = extraction('analysis', [
    fact({
      id: 'fact-1',
      text: 'LeBron James stuns everyone by agreeing to join the Philadelphia 76ers.',
      certainty: 'opinion',
      attribution: "Dunc'd On",
      attributionQuote: "Dunc'd On:",
      entities: [
        entity('person', 'lebron-james'),
        entity('team', '76ers')
      ]
    }),
    fact({
      id: 'fact-2',
      text: 'He said it was about the best chance to win, so how good is this Sixers team in the East?',
      certainty: 'opinion',
      attribution: "Dunc'd On",
      attributionQuote: "Dunc'd On:",
      entities: [entity('team', '76ers')]
    })
  ], [
    'Do not present an opinion or analysis as a completed fact.'
  ]);

  const { composition, validation } = composeAndValidate(facts);
  assert.equal(validation.ok, true);
  assert.match(composition.titleZh, /节目讨论/);
  assert.match(composition.titleZh, /设想/);
  assert.doesNotMatch(composition.titleZh, /^勒布朗·詹姆斯加盟/);
  assert.match(composition.summaryZh, /东部的竞争力/);
});

test('deterministic injury composer keeps status, injury, and return timing separate', () => {
  const facts = extraction('injury', [
    fact({
      id: 'fact-1',
      text: 'Stephen Curry has been ruled out for 2 weeks with an ankle sprain.',
      entities: [
        entity('person', 'stephen-curry'),
        entity('team', 'warriors')
      ]
    }),
    fact({
      id: 'fact-2',
      text: 'Stephen Curry has been cleared to return to the Warriors after 2 weeks.',
      entities: [
        entity('person', 'stephen-curry'),
        entity('team', 'warriors')
      ]
    })
  ]);

  const { composition } = composeAndValidate(facts, false);
  assert.match(composition.titleZh, /脚踝扭伤/);
  assert.match(composition.titleZh, /缺阵 2 周/);
  assert.match(composition.oneLineZh, /复出/);
});

test('deterministic game composer preserves winner, loser, and score', () => {
  const facts = extraction('game', [
    fact({
      id: 'fact-1',
      text: 'Washington Wizards defeated Utah Jazz 92-88.',
      entities: [
        entity('team', 'wizards'),
        entity('team', 'jazz')
      ],
      numbers: [number('score', 'score:92:88')]
    }),
    fact({
      id: 'fact-2',
      text: 'LeBron James recorded a key performance in the game.',
      entities: [entity('person', 'lebron-james')]
    })
  ]);

  const { composition } = composeAndValidate(facts, false);
  assert.match(composition.titleZh, /奇才以92 比 88击败爵士/);
  assert.match(composition.oneLineZh, /勒布朗·詹姆斯/);
  assert.doesNotMatch(composition.titleZh, /奇才.*负于爵士/);
});

function composeAndValidate(factExtraction, requireGate = true) {
  const plan = buildEditorialFactPlan(factExtraction);
  const composition = composeDeterministicEditorial(factExtraction, { factPlan: plan });
  const validation = validateDeterministicEditorialComposition(
    composition,
    {
      newsId: 'news_deterministic_test',
      source: 'RealGM',
      publishedAt: '2026-07-29T00:00:00.000Z',
      originalTitle: '',
      originalSummary: ''
    },
    factExtraction
  );
  if (requireGate) assert.equal(validation.ok, true, validation.reasons.join(', '));
  return { composition, validation, plan };
}

function extraction(storyType, facts, mustNotClaim = []) {
  return { storyType, facts, mustNotClaim };
}

function fact({
  id,
  text,
  certainty = 'confirmed',
  polarity = 'positive',
  attribution = '',
  attributionQuote = '',
  entities = [],
  numbers = []
}) {
  return {
    id,
    factText: text,
    certainty,
    polarity,
    attribution,
    attributionQuote,
    sourceField: 'rssSummary',
    evidenceQuote: text,
    entities,
    numbers
  };
}

function entity(type, canonicalId) {
  return { type, canonicalId };
}

function number(type, value) {
  return { type, value };
}
