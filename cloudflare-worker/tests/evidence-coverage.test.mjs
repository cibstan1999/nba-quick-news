import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCoverageAwareFactPlan,
  buildEvidenceInventory,
  buildFactsFromEvidenceSelection,
  buildMandatoryCoverageManifest,
  parseEvidenceSelectionResponse,
  validateEvidenceCoverageContract,
  validateEvidenceSelection
} from '../src/evidence-coverage.js';

test('Evidence Inventory creates stable IDs without splitting ordinary commas or decimals', () => {
  const record = {
    source: 'RealGM',
    storyType: 'trade_rumor',
    originalTitle: 'DeMar DeRozan Receiving Interest From Heat, Nuggets, Cavaliers',
    originalSummary:
      'The Heat, Nuggets, and Cavaliers are interested in DeMar DeRozan. ' +
      'His $26.74 million contract includes only $10 million guaranteed.'
  };
  const first = buildEvidenceInventory(record, 'Article sentence one. Article sentence two.');
  const second = buildEvidenceInventory(record, 'Article sentence one. Article sentence two.');

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.map((item) => item.evidenceId),
    ['title-1', 'summary-1', 'summary-2', 'article-1', 'article-2']
  );
  assert.match(first.find((item) => item.evidenceId === 'summary-1').text, /Heat, Nuggets/);
  assert.equal(
    first.find((item) => item.evidenceId === 'summary-2').anchors.numbers
      .some((entry) => entry.value === 'usd-million:26.74'),
    true
  );
});

test('Evidence selection only accepts known IDs and adds mandatory evidence deterministically', () => {
  const record = {
    source: 'RealGM',
    storyType: 'signing',
    originalTitle: 'Lakers Sign Example Player',
    originalSummary:
      'The Lakers signed Example Player. A separate historical paragraph adds background.'
  };
  const inventory = buildEvidenceInventory(record);
  const manifest = buildMandatoryCoverageManifest(inventory, record);
  const duplicateSelection = validateEvidenceSelection({
    selectedEvidenceIds: ['summary-2', 'summary-2'],
    primaryEvidenceId: 'title-1',
    supportingEvidenceIds: ['summary-2']
  }, inventory, manifest);

  assert.equal(duplicateSelection.ok, true);
  assert.deepEqual(duplicateSelection.value.selectedEvidenceIds, ['summary-2']);
  assert.equal(duplicateSelection.value.finalEvidenceIds.includes('title-1'), true);

  const unknown = validateEvidenceSelection({
    selectedEvidenceIds: ['summary-99'],
    primaryEvidenceId: 'title-1',
    supportingEvidenceIds: []
  }, inventory, manifest);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.reasons.includes('evidence-selection-unknown-id'), true);

  const parsed = parseEvidenceSelectionResponse(JSON.stringify({
    selectedEvidenceIds: ['summary-2'],
    primaryEvidenceId: 'title-1',
    supportingEvidenceIds: []
  }), inventory, manifest);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.finalEvidenceIds.includes('title-1'), true);

  const invalidJson = parseEvidenceSelectionResponse(
    '{"selectedEvidenceIds":',
    inventory,
    manifest
  );
  assert.equal(invalidJson.ok, false);
  assert.deepEqual(invalidJson.reasons, ['evidence-selection-json-invalid']);
});

test('AN-01 makes source and analysis attribution mandatory without copied model quotes', () => {
  const record = {
    source: 'RealGM',
    storyType: 'analysis',
    originalTitle: 'Warriors Focused On Building Team For After Stephen Curry Retires',
    originalSummary:
      'The Warriors real focus is reportedly on building a roster for after Stephen Curry retires. ' +
      'Veteran reporter Tim Kawakami said on the TK Show that Joe Lacob wants to build the next team after Curry.'
  };
  const inventory = buildEvidenceInventory(record);
  const manifest = buildMandatoryCoverageManifest(inventory, record);

  assert.equal(
    manifest.mandatoryAnchors.some((anchor) => (
      anchor.type === 'attribution' &&
      anchor.value === 'RealGM' &&
      anchor.evidenceId === 'title-1'
    )),
    true
  );
  assert.equal(
    manifest.mandatoryAnchors.some((anchor) => (
      anchor.type === 'attribution' &&
      anchor.value === 'Tim Kawakami' &&
      anchor.evidenceId === 'summary-2'
    )),
    true
  );
  assert.equal(manifest.mandatoryEvidenceIds.includes('summary-1'), true);
  assert.equal(manifest.mandatoryEvidenceIds.includes('summary-2'), true);
});

test('IN-01 contract rejects a Fact Plan that omits the decision or injury context', () => {
  const record = {
    source: 'RealGM',
    storyType: 'interview',
    originalTitle:
      "Stephen Curry On LeBron James' Decision: 'You Don't Envision Anything Until It Happens'",
    originalSummary:
      "Stephen Curry addressed LeBron James' decision to sign with the Philadelphia 76ers rather than the Golden State Warriors. " +
      "Curry said you don't envision anything until it happens. " +
      "Curry pointed to the injuries suffered by Jimmy Butler and Moses Moody as the real factor shaping the Warriors' outlook."
  };
  const { inventory, manifest, facts } = buildCase(record);
  const decision = inventory.find((item) => /Philadelphia 76ers/.test(item.text));
  const injury = inventory.find((item) => /injuries suffered/.test(item.text));

  assert.equal(manifest.mandatoryEvidenceIds.includes(decision.evidenceId), true);
  assert.equal(manifest.mandatoryEvidenceIds.includes(injury.evidenceId), true);
  assert.equal(
    manifest.mandatoryAnchors.some((anchor) => anchor.value === 'team:76ers'),
    true
  );
  assert.equal(
    manifest.mandatoryAnchors.some((anchor) => (
      anchor.type === 'core-relation' &&
      anchor.value === 'injury' &&
      anchor.evidenceId === injury.evidenceId
    )),
    true
  );

  const injuryFactId = facts.facts.find((fact) => fact.evidenceId === injury.evidenceId).id;
  const incompletePlan = {
    titleFactIds: [facts.facts[0].id],
    summaryFactIds: facts.facts
      .filter((fact) => fact.id !== injuryFactId)
      .map((fact) => fact.id),
    oneLineFactIds: []
  };
  const validation = validateEvidenceCoverageContract({
    inventory,
    manifest,
    factExtraction: facts,
    factPlan: incompletePlan,
    usedFactIds: {
      title: incompletePlan.titleFactIds,
      summary: incompletePlan.summaryFactIds,
      oneLine: []
    }
  });
  assert.equal(validation.ok, false);
  assert.equal(validation.reasons.includes('mandatory-fact-not-planned'), true);
  assert.equal(validation.details.unplannedFactIds.includes(injuryFactId), true);
});

test('TR-03 gives stable IDs and mandatory anchors to no-pressure, trade interest, and expected stay', () => {
  const record = {
    source: 'RealGM',
    storyType: 'trade_rumor',
    originalTitle: 'Wizards, Mavericks Had No Interest In Trading Anthony Davis, Kyrie Irving',
    originalSummary:
      'The Washington Wizards and Dallas Mavericks had no interest in trading Anthony Davis or Kyrie Irving. ' +
      'LeBron James and Rich Paul made no demands that either team trade those players. ' +
      'Anthony Davis and Kyrie Irving are expected to start the season with their current teams.'
  };
  const first = buildEvidenceInventory(record);
  const second = buildEvidenceInventory(record);
  const manifest = buildMandatoryCoverageManifest(first, record);

  assert.deepEqual(first, second);
  assert.deepEqual(
    manifest.mandatoryEvidenceIds,
    ['title-1', 'summary-1', 'summary-2', 'summary-3']
  );
  assert.equal(
    manifest.mandatoryAnchors.some((anchor) => (
      anchor.evidenceId === 'summary-1' && anchor.type === 'negation'
    )),
    true
  );
  assert.equal(
    manifest.mandatoryAnchors.some((anchor) => (
      anchor.evidenceId === 'summary-2' && anchor.type === 'negation'
    )),
    true
  );
  assert.equal(
    manifest.mandatoryAnchors.some((anchor) => (
      anchor.evidenceId === 'summary-3' &&
      anchor.type === 'modality' &&
      anchor.value === 'expected'
    )),
    true
  );
});

test('SG-02 requires expected re-signing and money without requiring secondary people', () => {
  const record = {
    source: 'RealGM',
    storyType: 'signing',
    originalTitle: 'Draymond Green Expected To Re-Sign With Warriors For $28M',
    originalSummary:
      'The Warriors are expected to re-sign Draymond Green for close to $28 million. ' +
      'Green has always been expected to stay with Golden State. ' +
      'Mike Dunleavy Jr. can now turn to re-signing Green and filling out the roster.'
  };
  const inventory = buildEvidenceInventory(record);
  const manifest = buildMandatoryCoverageManifest(inventory, record);

  assert.equal(
    manifest.mandatoryAnchors.some((anchor) => (
      anchor.type === 'number' && anchor.value === 'money:usd-million:28'
    )),
    true
  );
  assert.equal(
    manifest.mandatoryAnchors.some((anchor) => (
      anchor.type === 'modality' && anchor.value === 'expected'
    )),
    true
  );
  assert.equal(
    manifest.mandatoryAnchors.some((anchor) => /mike-dunleavy/i.test(anchor.value)),
    false
  );
});

test('AN-02 locks Duncd On attribution and the analysis relationship', () => {
  const record = {
    source: 'RealGM',
    storyType: 'analysis',
    originalTitle:
      "Dunc'd On: LeBron James to Philly + Summer League Prospects: OKC, CHA, DET, TOR, SAS",
    originalSummary:
      'LeBron James agrees to join the Philadelphia 76ers, so how good is this Sixers team in the East? ' +
      'Nate and Danny discuss how the roster could fit and continue their Summer League prospect review.'
  };
  const { inventory, manifest, facts, plan } = buildCase(record);
  const validation = validateEvidenceCoverageContract({
    inventory,
    manifest,
    factExtraction: facts,
    factPlan: plan,
    usedFactIds: {
      title: plan.titleFactIds,
      summary: plan.summaryFactIds,
      oneLine: plan.oneLineFactIds
    }
  });

  assert.equal(
    manifest.mandatoryAnchors.some((anchor) => (
      anchor.type === 'attribution' && anchor.value === "Dunc'd On"
    )),
    true
  );
  assert.equal(
    manifest.mandatoryAnchors.some((anchor) => (
      anchor.type === 'core-relation' && anchor.value === 'analysis'
    )),
    true
  );
  assert.equal(facts.facts.every((fact) => fact.certainty === 'opinion'), true);
  assert.equal(
    facts.mustNotClaim.includes('Do not present analysis or opinion as a completed fact.'),
    true
  );
  assert.equal(validation.ok, true);
  assert.equal(plan.requiredEvidenceIds.includes('title-1'), true);
  assert.equal(
    plan.requiredAnchors.every((anchor) => anchor.factIds.length > 0),
    true
  );
  const firstAnchor = plan.requiredAnchors[0];
  assert.deepEqual(
    validation.trace.anchorToFactIds[firstAnchor.anchorId],
    firstAnchor.factIds
  );
  assert.equal(
    validation.trace.anchorToUsedFields[firstAnchor.anchorId].length > 0,
    true
  );
});

test('Coverage trace links evidence to facts, plan fields, and composer usedFactIds', () => {
  const record = {
    source: 'RealGM',
    storyType: 'signing',
    originalTitle: 'Lakers Sign Example Player',
    originalSummary: 'The Lakers signed Example Player to a two-year, $12 million contract.'
  };
  const { inventory, manifest, facts, plan } = buildCase(record);
  const usedFactIds = {
    title: plan.titleFactIds,
    summary: plan.summaryFactIds,
    oneLine: plan.oneLineFactIds
  };
  const validation = validateEvidenceCoverageContract({
    inventory,
    manifest,
    factExtraction: facts,
    factPlan: plan,
    usedFactIds
  });

  assert.equal(validation.ok, true);
  assert.deepEqual(
    validation.trace.evidenceToFactIds['title-1'],
    ['fact-title-1']
  );
  assert.equal(
    validation.trace.factToPlanFields['fact-title-1'].includes('title'),
    true
  );
  assert.equal(
    validation.trace.factToUsedFields['fact-title-1'].includes('title'),
    true
  );
});

function buildCase(record) {
  const inventory = buildEvidenceInventory(record);
  const manifest = buildMandatoryCoverageManifest(inventory, record);
  const optionalId = manifest.optionalEvidenceIds[0] || '';
  const selection = {
    selectedEvidenceIds: optionalId ? [optionalId] : [],
    primaryEvidenceId: manifest.mandatoryEvidenceIds[0] || optionalId,
    supportingEvidenceIds: []
  };
  const factResult = buildFactsFromEvidenceSelection(
    selection,
    inventory,
    manifest,
    { storyType: record.storyType }
  );
  assert.equal(factResult.ok, true);
  const facts = factResult.value;
  const plan = buildCoverageAwareFactPlan({
    titleFactIds: [],
    summaryFactIds: [],
    oneLineFactIds: []
  }, facts, manifest);
  return { inventory, manifest, facts, plan };
}
