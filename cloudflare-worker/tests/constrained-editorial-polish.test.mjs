import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createConstrainedPolishPackage,
  restoreConstrainedPolish,
  runConstrainedPolishExperiment,
  validateConstrainedPlaceholderOutput
} from '../src/constrained-editorial-polish.js';
import {
  composeDeterministicEditorial,
  validateDeterministicEditorialComposition
} from '../src/deterministic-editorial.js';
import { buildEditorialFactPlan } from '../src/pipeline.js';

test('placeholder package locks entities, source, money, certainty, event, and fact boundaries', () => {
  const factExtraction = rumorExtraction();
  const factPlan = buildEditorialFactPlan(factExtraction);
  const composition = composeDeterministicEditorial(factExtraction, { factPlan });
  const polishPackage = createConstrainedPolishPackage(
    composition,
    factExtraction,
    { factPlan }
  );
  const locked = JSON.stringify(polishPackage.lockedDraft);

  assert.doesNotMatch(locked, /RealGM|德玛尔|热火|国王|1000|2674|有意|受保障/);
  assert.match(locked, /\[\[SOURCE_/);
  assert.match(locked, /\[\[PERSON_/);
  assert.match(locked, /\[\[TEAM_/);
  assert.match(locked, /\[\[MONEY_/);
  assert.match(locked, /\[\[CERTAINTY_/);
  assert.match(locked, /\[\[EVENT_/);
  assert.match(locked, /\[\[FACT_SUMMARY_1_START\]\]/);
});

test('identity polish restores canonical first mentions and safe repeated short names', () => {
  const { composition, polishPackage } = createRumorPackage();
  const validation = validateConstrainedPlaceholderOutput(
    polishPackage,
    polishPackage.lockedDraft
  );
  const restored = restoreConstrainedPolish(polishPackage, polishPackage.lockedDraft);
  const gate = validateDeterministicEditorialComposition(
    restored,
    record(),
    rumorExtraction()
  );

  assert.equal(validation.ok, true, JSON.stringify(validation));
  assert.equal(restored.titleZh, composition.titleZh);
  assert.match(restored.summaryZh, /德罗赞与国王/);
  assert.equal(restored.oneLineZh, composition.oneLineZh);
  assert.deepEqual(restored.usedFactIds, composition.usedFactIds);
  assert.equal(gate.ok, true, gate.reasons.join(','));
});

test('deleted, duplicated, renamed, or reordered placeholders are rejected', () => {
  const { polishPackage } = createRumorPackage();
  const cases = [
    replaceFirstPlaceholder(polishPackage.lockedDraft, ''),
    replaceFirstPlaceholder(
      polishPackage.lockedDraft,
      `${firstPlaceholder(polishPackage.lockedDraft)}${firstPlaceholder(polishPackage.lockedDraft)}`
    ),
    replaceFirstPlaceholder(polishPackage.lockedDraft, '[[TEAM_999]]'),
    swapFirstTwoPlaceholders(polishPackage.lockedDraft)
  ];

  for (const candidate of cases) {
    const validation = validateConstrainedPlaceholderOutput(polishPackage, candidate);
    assert.equal(validation.ok, false);
    assert.ok(validation.reasons.includes('placeholder-sequence-mismatch'));
  }
});

test('a placeholder moved across fact boundaries is rejected', () => {
  const { polishPackage } = createRumorPackage();
  const candidate = structuredClone(polishPackage.lockedDraft);
  const summaryTokens = placeholders(candidate.summaryZh);
  const movable = summaryTokens.find((token) => token.startsWith('[[MONEY_'));
  candidate.summaryZh = candidate.summaryZh
    .replace(movable, '')
    .replace('[[FACT_SUMMARY_1_END]]', `${movable}[[FACT_SUMMARY_1_END]]`);

  const validation = validateConstrainedPlaceholderOutput(polishPackage, candidate);
  assert.equal(validation.ok, false);
  assert.ok(validation.reasons.includes('placeholder-sequence-mismatch'));
  assert.ok(validation.reasons.includes('placeholder-fact-boundary-mismatch'));
});

test('punctuation cannot split a protected event from its original object', () => {
  const { polishPackage } = createRumorPackage();
  const candidate = structuredClone(polishPackage.lockedDraft);
  candidate.summaryZh = candidate.summaryZh.replace(
    /(\[\[MONEY_\d+\]\])(\[\[EVENT_\d+\]\])/,
    '$1，$2'
  );

  const validation = validateConstrainedPlaceholderOutput(polishPackage, candidate);
  assert.equal(validation.ok, false);
  assert.ok(validation.reasons.includes('placeholder-adjacency-mismatch'));
});

test('new unprotected numbers and factual assertion language are rejected', () => {
  const { polishPackage } = createRumorPackage();
  const numberCandidate = structuredClone(polishPackage.lockedDraft);
  numberCandidate.summaryZh = numberCandidate.summaryZh.replace(
    '[[FACT_SUMMARY_1_END]]',
    '，另有 3 支球队[[FACT_SUMMARY_1_END]]'
  );
  const assertionCandidate = structuredClone(polishPackage.lockedDraft);
  assertionCandidate.summaryZh = assertionCandidate.summaryZh.replace(
    '[[FACT_SUMMARY_1_END]]',
    '，因此必将提升球队竞争力[[FACT_SUMMARY_1_END]]'
  );

  assert.ok(
    validateConstrainedPlaceholderOutput(polishPackage, numberCandidate)
      .reasons.includes('polish-unprotected-number')
  );
  assert.ok(
    validateConstrainedPlaceholderOutput(polishPackage, assertionCandidate)
      .reasons.includes('polish-new-assertion-language')
  );
});

test('invalid JSON or placeholder damage makes one request and falls back to composer', async () => {
  const factExtraction = rumorExtraction();
  let invalidCalls = 0;
  const invalid = await runConstrainedPolishExperiment({
    factExtraction,
    record: record(),
    invoke: async () => {
      invalidCalls += 1;
      return { response: 'not-json' };
    }
  });
  assert.equal(invalidCalls, 1);
  assert.equal(invalid.adoptedPolish, false);
  assert.equal(invalid.usedFallback, true);
  assert.equal(invalid.polishFallbackReason, 'polish-invalid-json');
  assert.equal(invalid.aiRequests, 1);
  assert.deepEqual(invalid.final, invalid.composer);

  let damagedCalls = 0;
  const damaged = await runConstrainedPolishExperiment({
    factExtraction,
    record: record(),
    invoke: async ({ request }) => {
      damagedCalls += 1;
      const locked = lockedDraftFromRequest(request);
      const candidate = replaceFirstPlaceholder(locked, '');
      return { response: JSON.stringify(candidate) };
    }
  });
  assert.equal(damagedCalls, 1);
  assert.equal(damaged.adoptedPolish, false);
  assert.equal(damaged.polishFallbackReason, 'placeholder-sequence-mismatch');
  assert.deepEqual(damaged.final, damaged.composer);
});

test('valid single-request polish is restored, gated, and adopted without Stage 1 or Llama', async () => {
  const factExtraction = rumorExtraction();
  let calls = 0;
  const result = await runConstrainedPolishExperiment({
    factExtraction,
    record: record(),
    invoke: async ({ request }) => {
      calls += 1;
      const locked = lockedDraftFromRequest(request);
      locked.summaryZh = locked.summaryZh.replace('；', '，同时');
      return {
        choices: [{
          finish_reason: 'stop',
          message: { content: JSON.stringify(locked) }
        }]
      };
    }
  });

  assert.equal(calls, 1);
  assert.equal(result.aiRequests, 1);
  assert.equal(result.adoptedPolish, true, JSON.stringify({
    reason: result.polishFallbackReason,
    placeholderValidation: result.placeholderValidation,
    gateReasons: result.gateValidation?.reasons
  }));
  assert.equal(result.usedFallback, false);
  assert.equal(result.gateValidation.ok, true);
  assert.match(result.final.summaryZh, /，同时/);
});

test('an unchanged Qwen result is not counted as adopted polish', async () => {
  const factExtraction = rumorExtraction();
  const result = await runConstrainedPolishExperiment({
    factExtraction,
    record: record(),
    invoke: async ({ request }) => ({
      response: JSON.stringify(lockedDraftFromRequest(request))
    })
  });

  assert.equal(result.aiRequests, 1);
  assert.equal(result.adoptedPolish, false);
  assert.equal(result.usedFallback, true);
  assert.equal(result.polishFallbackReason, 'polish-no-material-change');
  assert.deepEqual(result.final, result.composer);
});

function createRumorPackage() {
  const factExtraction = rumorExtraction();
  const factPlan = buildEditorialFactPlan(factExtraction);
  const composition = composeDeterministicEditorial(factExtraction, { factPlan });
  const polishPackage = createConstrainedPolishPackage(
    composition,
    factExtraction,
    { factPlan }
  );
  return { composition, polishPackage };
}

function rumorExtraction() {
  return {
    storyType: 'trade_rumor',
    facts: [
      {
        id: 'fact-1',
        factText: "I'm told Miami Heat are interested in DeMar DeRozan.",
        certainty: 'interest',
        polarity: 'positive',
        attribution: 'RealGM',
        attributionQuote: "I'm told",
        sourceField: 'rssSummary',
        evidenceQuote: "I'm told Miami Heat are interested in DeMar DeRozan.",
        entities: [
          { type: 'team', canonicalId: 'heat' },
          { type: 'person', canonicalId: 'demar-derozan' }
        ],
        numbers: []
      },
      {
        id: 'fact-2',
        factText: 'DeRozan had a partial guarantee on his contract for only $10 million of the total of $26.74 million with the Sacramento Kings.',
        certainty: 'possible',
        polarity: 'positive',
        attribution: '',
        attributionQuote: '',
        sourceField: 'rssSummary',
        evidenceQuote: 'DeRozan had a partial guarantee on his contract for only $10 million of the total of $26.74 million with the Sacramento Kings.',
        entities: [
          { type: 'team', canonicalId: 'kings' },
          { type: 'person', canonicalId: 'demar-derozan' }
        ],
        numbers: [
          { type: 'money', value: 'usd-million:10' },
          { type: 'money', value: 'usd-million:26.74' }
        ]
      }
    ],
    mustNotClaim: [
      'Do not claim that interest became a signing or completed trade.'
    ]
  };
}

function record() {
  return {
    newsId: 'news_constrained_test',
    source: 'RealGM',
    publishedAt: '2026-07-29T00:00:00.000Z',
    originalTitle: '',
    originalSummary: ''
  };
}

function firstPlaceholder(value) {
  return placeholders(value.titleZh)[0];
}

function replaceFirstPlaceholder(value, replacement) {
  const candidate = structuredClone(value);
  const placeholder = firstPlaceholder(value);
  candidate.titleZh = candidate.titleZh.replace(placeholder, replacement);
  return candidate;
}

function swapFirstTwoPlaceholders(value) {
  const candidate = structuredClone(value);
  const tokens = placeholders(candidate.titleZh);
  const temporary = '[[SWAP_TEMP]]';
  candidate.titleZh = candidate.titleZh
    .replace(tokens[0], temporary)
    .replace(tokens[1], tokens[0])
    .replace(temporary, tokens[1]);
  return candidate;
}

function placeholders(value) {
  return String(value || '').match(/\[\[[A-Z][A-Z0-9_]*\]\]/g) || [];
}

function lockedDraftFromRequest(request) {
  const content = request.messages.at(-1).content;
  const match = content.match(/lockedDraft=(\{[^\n]+\})/);
  assert.ok(match, 'lockedDraft should be present in the request');
  return JSON.parse(match[1]);
}
