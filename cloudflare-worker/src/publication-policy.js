export const PUBLICATION_DECISIONS = Object.freeze({
  PUBLISH: 'publish',
  REVIEW_REQUIRED: 'review_required',
  REJECT: 'reject'
});

const DETERMINISTIC_STAGE_NAMES = [
  'evidenceInventoryStatus',
  'minimumEvidenceCoverStatus',
  'deterministicFactStatus',
  'composerStatus'
];

export function decidePhase1Publication(result = {}) {
  const checks = buildPublicationChecks(result);
  const rejectReasons = [];

  if (!checks.deterministicStagesPassed) {
    rejectReasons.push('deterministic-stage-failed');
  }
  if (!checks.requiredFactsCovered) {
    rejectReasons.push('required-fact-coverage-failed');
  }
  if (!checks.requiredAttributionsCovered) {
    rejectReasons.push('attribution-coverage-failed');
  }
  if (!checks.requiredNumbersCovered) {
    rejectReasons.push('number-coverage-failed');
  }
  if (!checks.composerGateAccepted) {
    rejectReasons.push('composer-safety-gate-failed');
    rejectReasons.push(...checks.finalGateReasons);
  }

  if (rejectReasons.length) {
    return decisionResult(
      PUBLICATION_DECISIONS.REJECT,
      rejectReasons,
      checks
    );
  }

  if (!checks.polishAdopted) {
    const reviewReasons = ['constrained-polish-not-adopted'];
    if (!checks.polishRequested) reviewReasons.push('constrained-polish-not-run');
    if (checks.usedComposerFallback) reviewReasons.push('composer-fallback-used');
    if (checks.polishFallbackReason) {
      reviewReasons.push(checks.polishFallbackReason);
    }
    return decisionResult(
      PUBLICATION_DECISIONS.REVIEW_REQUIRED,
      reviewReasons,
      checks
    );
  }

  if (!checks.placeholderValidationPassed) {
    rejectReasons.push('placeholder-validation-failed');
  }
  if (checks.usedComposerFallback) {
    rejectReasons.push('composer-fallback-used-after-polish');
  }
  if (!checks.finalGateAccepted) {
    rejectReasons.push('final-quality-gate-failed');
  }
  if (checks.finalGateReasons.length) {
    rejectReasons.push(...checks.finalGateReasons);
  }
  if (!checks.oneLineDistinct) {
    rejectReasons.push('title-oneline-low-value-duplicate');
  }

  return rejectReasons.length
    ? decisionResult(
        PUBLICATION_DECISIONS.REJECT,
        rejectReasons,
        checks
      )
    : decisionResult(PUBLICATION_DECISIONS.PUBLISH, [], checks);
}

export function isRecordEligibleForPublicMaterialization(record) {
  if (!record || !Object.prototype.hasOwnProperty.call(
    record,
    'publicationDecision'
  )) {
    return true;
  }
  return record.publicationDecision === PUBLICATION_DECISIONS.PUBLISH;
}

function buildPublicationChecks(result) {
  const coverage = inspectCoverage(result);
  const finalGate = result.statuses?.finalGateStatus || {};
  const finalGateStatus = result.finalGateDecision || finalGate.status || '';
  const finalGateReasons = unique([
    ...(result.rejectionReasons || []),
    ...(finalGate.reasons || [])
  ]);
  const composerGateAccepted = result.composerGate
    ? result.composerGate.ok === true
    : (
        (result.composition || result.composer || result.final) &&
        coverage.allCovered &&
        !result.failureStage &&
        (
          finalGateStatus === 'accepted' ||
          result.usedComposerFallback === true
        )
      );
  const polishRequested = Number(
    result.counters?.polishAiRequests ?? result.polishAiRequests ?? 0
  ) > 0;
  const usedComposerFallback = Boolean(
    result.polish?.usedFallback ??
    result.usedComposerFallback ??
    (
      polishRequested &&
      result.final &&
      !result.adoptedPolish
    )
  );

  return {
    deterministicStagesPassed: DETERMINISTIC_STAGE_NAMES.every(
      (stage) => result.statuses?.[stage]?.status === 'success'
    ),
    requiredFactsCovered: coverage.requiredFactsCovered,
    requiredAttributionsCovered: coverage.requiredAttributionsCovered,
    requiredNumbersCovered: coverage.requiredNumbersCovered,
    composerGateAccepted,
    polishRequested,
    polishAdopted: Boolean(result.adoptedPolish),
    placeholderValidationPassed:
      result.placeholderValidation?.ok === true ||
      result.polish?.placeholderValidation?.ok === true,
    usedComposerFallback,
    polishFallbackReason:
      result.polishFallbackReason ||
      result.polish?.polishFallbackReason ||
      null,
    finalGateAccepted: finalGateStatus === 'accepted',
    finalGateReasons,
    oneLineDistinct: isOneLineDistinct(result),
    coverage
  };
}

function inspectCoverage(result) {
  const coverage = result.coverage || {};
  if (Number.isFinite(Number(coverage.requiredFacts))) {
    const requiredFactsCovered =
      Number(coverage.coveredRequiredFacts) === Number(coverage.requiredFacts);
    const requiredAttributionsCovered =
      Number(coverage.coveredAttributions) ===
      Number(coverage.requiredAttributions || 0);
    const requiredNumbersCovered =
      Number(coverage.coveredNumbers) === Number(coverage.requiredNumbers || 0);
    return {
      requiredFactsCovered,
      requiredAttributionsCovered,
      requiredNumbersCovered,
      allCovered:
        coverage.ok !== false &&
        requiredFactsCovered &&
        requiredAttributionsCovered &&
        requiredNumbersCovered
    };
  }

  const factPlan = result.factPlan || {};
  const usedFactIds = result.final?.usedFactIds || {};
  const requiredFacts = [
    ...(factPlan.titleFactIds || []).map((id) => `title:${id}`),
    ...(factPlan.summaryFactIds || []).map((id) => `summary:${id}`),
    ...(factPlan.oneLineFactIds || []).map((id) => `oneLine:${id}`)
  ];
  const usedFacts = new Set([
    ...(usedFactIds.title || []).map((id) => `title:${id}`),
    ...(usedFactIds.summary || []).map((id) => `summary:${id}`),
    ...(usedFactIds.oneLine || []).map((id) => `oneLine:${id}`)
  ]);
  const trace = coverage.trace?.anchorToUsedFields || {};
  const anchors = factPlan.requiredAnchors || [];
  const anchorCovered = (anchor) => (trace[anchor.anchorId] || []).length > 0;
  const attributions = anchors.filter((anchor) => (
    anchor.type === 'attribution'
  ));
  const numbers = anchors.filter((anchor) => anchor.type === 'number');
  const requiredFactsCovered = requiredFacts.every((fact) => usedFacts.has(fact));
  const requiredAttributionsCovered = attributions.every(anchorCovered);
  const requiredNumbersCovered = numbers.every(anchorCovered);

  return {
    requiredFactsCovered,
    requiredAttributionsCovered,
    requiredNumbersCovered,
    allCovered:
      coverage.ok !== false &&
      requiredFactsCovered &&
      requiredAttributionsCovered &&
      requiredNumbersCovered
  };
}

function isOneLineDistinct(result) {
  if (typeof result.oneLineDuplicate === 'boolean') {
    return !result.oneLineDuplicate;
  }
  const title = comparable(result.final?.titleZh);
  const oneLine = comparable(result.final?.oneLineZh);
  return Boolean(title && oneLine && title !== oneLine);
}

function comparable(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\s，。！？、:：；;'"“”‘’（）()\-]/g, '')
    .toLowerCase();
}

function decisionResult(decision, reasons, checks) {
  return {
    decision,
    reasons: unique(reasons),
    checks
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
