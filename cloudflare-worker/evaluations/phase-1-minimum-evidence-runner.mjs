import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateMinimumEvidenceCover,
  summarizeMinimumEvidenceResults
} from './minimum-evidence-cover.js';

const evaluationDir = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.join(evaluationDir, 'phase-0.5-baseline.json');
const scoresPath = path.join(
  evaluationDir,
  'phase-1-minimum-evidence-scores.json'
);
const resultsPath = path.join(
  evaluationDir,
  'phase-1-minimum-evidence-results.local.json'
);

const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
const scores = JSON.parse(await fs.readFile(scoresPath, 'utf8'));
const results = baseline.samples.map((sample) => (
  evaluateMinimumEvidenceCover(sample, scores[sample.sampleId])
));
const report = {
  evaluation: 'phase-1-integration-b-minimum-evidence-cover',
  generatedAt: new Date().toISOString(),
  sampleCount: results.length,
  partialBaselineNotice:
    'Partial 9-sample baseline. Injury and game are not represented.',
  results,
  metrics: summarizeMinimumEvidenceResults(results),
  aiRequests: 0,
  productionWrites: 0
};

await atomicWriteJson(resultsPath, report);
console.log(JSON.stringify({
  resultsPath,
  selectedEvidenceIds: Object.fromEntries(
    results.map((result) => [result.sampleId, result.selectedEvidenceIds])
  ),
  metrics: report.metrics
}, null, 2));

async function atomicWriteJson(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, filePath);
}
