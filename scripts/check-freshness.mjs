import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const newsPath = path.join(rootDir, 'public', 'data', 'news.json');
const warningHours = 6;
const failureHours = 24;

function ageHours(value, now = new Date()) {
  const time = new Date(value || '').getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, (now.getTime() - time) / 36e5);
}

function fail(message, details = {}) {
  console.error(`Freshness check failed: ${message}`);
  console.error(JSON.stringify(details, null, 2));
  process.exitCode = 1;
}

const raw = await readFile(newsPath, 'utf8');
const data = JSON.parse(raw);
const status = data.lastFetchStatus || {};
const checkedAt = status.checkedAt || '';
const updatedAt = data.updatedAt || status.updatedAt || '';
const updatedAgeHours = ageHours(updatedAt);
const fetchedItems = Number(status.fetchedItems || 0);

const summary = {
  updatedAt,
  checkedAt,
  status: status.status || 'unknown',
  fetchedItems,
  mergedItems: status.mergedItems ?? data.items?.length ?? 0,
  updatedAgeHours
};

console.log('Freshness check:', JSON.stringify(summary, null, 2));

if (status.status === 'fetch-failed') {
  fail('lastFetchStatus.status is fetch-failed.', summary);
} else if (status.status !== 'rebuilt-from-cache' && fetchedItems === 0) {
  fail('fetchedItems is 0 outside rebuilt-from-cache mode.', summary);
} else if (updatedAgeHours === null) {
  fail('updatedAt is missing or invalid.', summary);
} else if (updatedAgeHours > failureHours) {
  fail(`updatedAt is older than ${failureHours} hours.`, summary);
} else if (updatedAgeHours > warningHours) {
  console.warn(`Freshness warning: updatedAt is older than ${warningHours} hours.`);
}
