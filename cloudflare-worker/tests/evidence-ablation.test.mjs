import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateEvidenceAblationMode,
  normalizeOptionalSelectionModelResponse,
  prepareEvidenceAblation,
  selectOptionalEvidenceOnce,
  validateOptionalEvidenceSelection
} from '../evaluations/evidence-ablation.js';

test('mandatory-only uses no AI and includes the deterministic minimum cover', () => {
  const context = tradeRumorContext();
  const result = evaluateEvidenceAblationMode(context, {
    mode: 'mandatory-only'
  });

  assert.equal(result.stage1AiRequests, 0);
  assert.deepEqual(result.selectedOptionalEvidenceIds, []);
  assert.deepEqual(
    result.finalEvidenceIds,
    context.minimumSelection.selectedEvidenceIds
  );
  assert.equal(result.coverage.coveredAnchors, result.coverage.requiredAnchors);
  assert.equal(result.coverage.coveredFacts, result.coverage.requiredFacts);
});

test('optional selection ignores mandatory IDs and de-duplicates optional IDs', () => {
  const context = tradeRumorContext();
  const mandatoryId = context.minimumSelection.selectedEvidenceIds[0];
  const optionalId = context.manifest.optionalEvidenceIds.find(
    (evidenceId) => !context.minimumSelection.selectedEvidenceIds.includes(evidenceId)
  );
  const result = validateOptionalEvidenceSelection({
    selectedOptionalEvidenceIds: [
      mandatoryId,
      optionalId,
      optionalId
    ]
  }, context);

  assert.equal(result.optionalSelectionStatus, 'selected');
  assert.deepEqual(result.selectedOptionalEvidenceIds, [optionalId]);
  assert.equal(result.ignoredEvidenceIds.includes(mandatoryId), true);
  assert.equal(result.ignoredEvidenceIds.includes(optionalId), true);
});

test('unknown optional IDs and invalid JSON fall back to mandatory-only', () => {
  const context = tradeRumorContext();
  const unknown = validateOptionalEvidenceSelection({
    selectedOptionalEvidenceIds: ['summary-999']
  }, context);
  assert.equal(unknown.optionalSelectionStatus, 'fallback');
  assert.equal(unknown.optionalSelectionFallbackReason, 'invalid-optional-evidence-id');
  assert.deepEqual(unknown.selectedOptionalEvidenceIds, []);

  const invalidJson = normalizeOptionalSelectionModelResponse({
    response: '{"selectedOptionalEvidenceIds":'
  }, context);
  assert.equal(invalidJson.optionalSelectionStatus, 'fallback');
  assert.equal(
    invalidJson.optionalSelectionFallbackReason,
    'invalid-optional-selection-json'
  );
});

test('qwen optional selection performs one request with no retry', async () => {
  const context = tradeRumorContext();
  const optionalId = context.manifest.optionalEvidenceIds.find(
    (evidenceId) => !context.minimumSelection.selectedEvidenceIds.includes(evidenceId)
  );
  let calls = 0;
  const selected = await selectOptionalEvidenceOnce({
    context,
    invoke: async () => {
      calls += 1;
      return {
        response: JSON.stringify({
          selectedOptionalEvidenceIds: [optionalId]
        })
      };
    }
  });

  assert.equal(calls, 1);
  assert.equal(selected.stage1AiRequests, 1);
  assert.deepEqual(selected.selectedOptionalEvidenceIds, [optionalId]);

  const failed = await selectOptionalEvidenceOnce({
    context,
    invoke: async () => {
      calls += 1;
      throw new Error('temporary failure');
    }
  });
  assert.equal(calls, 2);
  assert.equal(failed.stage1AiRequests, 1);
  assert.equal(failed.optionalSelectionStatus, 'fallback');
  assert.equal(
    failed.optionalSelectionFallbackReason,
    'optional-selection-request-failed'
  );
});

test('qwen-optional adds only validated optional facts and safely matches A on fallback', () => {
  const context = tradeRumorContext();
  const mandatory = evaluateEvidenceAblationMode(context, {
    mode: 'mandatory-only'
  });
  const optionalId = context.manifest.optionalEvidenceIds.find(
    (evidenceId) => !context.minimumSelection.selectedEvidenceIds.includes(evidenceId)
  );
  const enriched = evaluateEvidenceAblationMode(context, {
    mode: 'qwen-optional',
    optionalSelection: {
      optionalSelectionStatus: 'selected',
      selectedOptionalEvidenceIds: [optionalId],
      ignoredEvidenceIds: [],
      optionalSelectionFallbackReason: null,
      stage1AiRequests: 1
    }
  });
  assert.equal(enriched.finalEvidenceIds.includes(optionalId), true);
  assert.equal(
    enriched.generatedFactCount,
    mandatory.generatedFactCount + 1
  );

  const fallback = evaluateEvidenceAblationMode(context, {
    mode: 'qwen-optional',
    optionalSelection: {
      optionalSelectionStatus: 'fallback',
      selectedOptionalEvidenceIds: [],
      ignoredEvidenceIds: [],
      optionalSelectionFallbackReason: 'optional-selection-request-failed',
      stage1AiRequests: 1
    }
  });
  assert.deepEqual(fallback.finalEvidenceIds, mandatory.finalEvidenceIds);
  assert.deepEqual(fallback.composition, mandatory.composition);
});

function tradeRumorContext() {
  return prepareEvidenceAblation({
    sampleId: 'TR-TEST',
    newsId: 'news_optional_test',
    source: 'RealGM',
    publishedAt: '2026-07-29T00:00:00.000Z',
    testType: 'trade_rumor',
    originalTitle: 'Heat Waiting On Klay Thompson Before Filling Out Roster',
    originalSummary: [
      "The Heat are focused on adding Klay Thompson, even if it's unclear if he will part ways with the Dallas Mavericks.",
      'Thompson is owed $17.5 million in the final year of his contract with the Mavericks.',
      'The Heat have two roster spots to fill before the regular season.'
    ].join(' ')
  });
}
