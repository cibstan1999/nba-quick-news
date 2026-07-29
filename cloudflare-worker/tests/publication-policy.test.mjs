import assert from 'node:assert/strict';
import test from 'node:test';
import { materializePayload } from '../src/pipeline.js';
import {
  PUBLICATION_DECISIONS,
  decidePhase1Publication
} from '../src/publication-policy.js';

const NOW = '2026-07-29T08:00:00.000Z';

test('successful constrained polish with complete safety checks is publishable', () => {
  const result = createResult();
  const publication = decidePhase1Publication(result);

  assert.equal(publication.decision, PUBLICATION_DECISIONS.PUBLISH);
  assert.deepEqual(publication.reasons, []);
});

test('placeholder mismatch with composer fallback requires review', () => {
  const result = createResult({
    adoptedPolish: false,
    usedComposerFallback: true,
    polishFallbackReason: 'placeholder-sequence-mismatch',
    placeholderValidation: {
      ok: false,
      reasons: ['placeholder-sequence-mismatch']
    },
    statuses: createStatuses({
      polishStatus: {
        status: 'fallback',
        reason: 'placeholder-sequence-mismatch'
      }
    })
  });
  const publication = decidePhase1Publication(result);

  assert.equal(
    publication.decision,
    PUBLICATION_DECISIONS.REVIEW_REQUIRED
  );
  assert.ok(publication.reasons.includes('composer-fallback-used'));
  assert.ok(publication.reasons.includes('placeholder-sequence-mismatch'));
});

test('polish with no material change requires review', () => {
  const result = createResult({
    adoptedPolish: false,
    usedComposerFallback: true,
    polishFallbackReason: 'polish-no-material-change',
    statuses: createStatuses({
      polishStatus: {
        status: 'fallback',
        reason: 'polish-no-material-change'
      }
    })
  });

  assert.equal(
    decidePhase1Publication(result).decision,
    PUBLICATION_DECISIONS.REVIEW_REQUIRED
  );
});

test('safe composer output without a polish request requires review', () => {
  const result = createResult({
    adoptedPolish: false,
    polishAiRequests: 0,
    usedComposerFallback: false,
    placeholderValidation: null,
    statuses: createStatuses({
      polishStatus: { status: 'skipped', reason: 'polish-disabled' }
    })
  });
  const publication = decidePhase1Publication(result);

  assert.equal(
    publication.decision,
    PUBLICATION_DECISIONS.REVIEW_REQUIRED
  );
  assert.ok(publication.reasons.includes('constrained-polish-not-run'));
});

test('missing required facts or certainty safety failures are rejected', () => {
  const missingFact = createResult({
    coverage: createCoverage({ coveredRequiredFacts: 2 })
  });
  assert.equal(
    decidePhase1Publication(missingFact).decision,
    PUBLICATION_DECISIONS.REJECT
  );

  const certaintyFailure = createResult({
    finalGateDecision: 'rejected',
    rejectionReasons: ['certainty-escalation'],
    statuses: createStatuses({
      finalGateStatus: {
        status: 'rejected',
        reasons: ['certainty-escalation']
      }
    })
  });
  const publication = decidePhase1Publication(certaintyFailure);
  assert.equal(publication.decision, PUBLICATION_DECISIONS.REJECT);
  assert.ok(publication.reasons.includes('certainty-escalation'));
});

test('review-required and rejected Phase 1 records stay out of public news JSON', () => {
  const publish = createRecord('phase1-publish', 'publish');
  const review = createRecord('phase1-review', 'review_required');
  const rejected = createRecord('phase1-reject', 'reject');
  const payload = materializePayload(
    [publish, review, rejected],
    { status: 'success', checkedAt: NOW, updatedAt: NOW },
    NOW
  );

  assert.deepEqual(payload.items.map((item) => item.newsId), ['phase1-publish']);
  assert.equal('publicationDecision' in payload.items[0], false);
});

test('legacy single-mode accepted records remain publicly materialized', () => {
  const single = createRecord('single-accepted');
  const payload = materializePayload(
    [single],
    { status: 'success', checkedAt: NOW, updatedAt: NOW },
    NOW
  );

  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].newsId, 'single-accepted');
});

function createResult(overrides = {}) {
  return {
    ok: true,
    statuses: createStatuses(),
    coverage: createCoverage(),
    adoptedPolish: true,
    usedComposerFallback: false,
    polishFallbackReason: null,
    placeholderValidation: { ok: true, reasons: [] },
    finalGateDecision: 'accepted',
    rejectionReasons: [],
    oneLineDuplicate: false,
    polishAiRequests: 1,
    final: {
      titleZh: '湖人与球员达成续约',
      summaryZh: '双方完成一份 2 年合同。',
      oneLineZh: '合同期限为 2 年。'
    },
    ...overrides
  };
}

function createStatuses(overrides = {}) {
  return {
    evidenceInventoryStatus: { status: 'success' },
    minimumEvidenceCoverStatus: { status: 'success' },
    deterministicFactStatus: { status: 'success' },
    composerStatus: { status: 'success' },
    polishStatus: { status: 'accepted', reason: null },
    finalGateStatus: { status: 'accepted', reasons: [] },
    ...overrides
  };
}

function createCoverage(overrides = {}) {
  return {
    requiredFacts: 3,
    coveredRequiredFacts: 3,
    requiredAttributions: 1,
    coveredAttributions: 1,
    requiredNumbers: 1,
    coveredNumbers: 1,
    ...overrides
  };
}

function createRecord(newsId, publicationDecision) {
  return {
    newsId,
    source: 'RealGM',
    feed: 'https://basketball.realgm.com/rss/wiretap/15/0.xml',
    url: `https://example.com/${newsId}`,
    originalTitle: `${newsId} original title`,
    originalSummary: `${newsId} original summary`,
    category: '签约',
    storyType: 'signing',
    expectedFactLevel: 'confirmed',
    importance: 3,
    eventKey: newsId,
    publishedAt: NOW,
    processedAt: NOW,
    aiStatus: 'accepted',
    ...(publicationDecision ? { publicationDecision } : {}),
    editorial: {
      titleZh: `${newsId} 中文标题`,
      summaryZh: `${newsId} 中文摘要`,
      oneLineZh: `${newsId} 中文速览`,
      categoryZh: '签约',
      tagsZh: [],
      confidence: 1,
      factLevel: 'confirmed',
      editorSource: publicationDecision
        ? 'deterministic-composer+workers-ai-polish'
        : 'workers-ai',
      model: 'mock',
      generatedAt: NOW
    }
  };
}
