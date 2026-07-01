import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

const FEED_URL = 'https://basketball.realgm.com/rss/wiretap/15/0.xml';
const SOURCE = 'RealGM';
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(rootDir, 'public', 'data', 'news.json');

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true
});

function stripHtml(value = '') {
  return String(value)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function classify(title = '', summary = '') {
  const text = `${title} ${summary}`.toLowerCase();
  const rules = [
    ['交易', ['trade', 'traded', 'trading', 'deal', 'acquire', 'acquired', 'swap']],
    ['签约', ['sign', 'signed', 'signing', 'contract', 'extension', 'free agent', 'waive', 'waived']],
    ['伤病', ['injury', 'injured', 'surgery', 'ankle', 'knee', 'hamstring', 'out indefinitely', 'rehab']],
    ['选秀', ['draft', 'pick', 'prospect', 'lottery', 'combine', 'rookie']],
    ['季后赛', ['playoff', 'finals', 'semifinals', 'postseason', 'championship']]
  ];

  return rules.find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))?.[0] || '其他';
}

function normalizeItem(item, index) {
  const title = stripHtml(item.title);
  const link = String(item.link || '').trim();
  const pubDate = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();
  const summary = stripHtml(item.description);

  return {
    id: link || `${title}-${index}`,
    title,
    link,
    pubDate,
    summary,
    source: SOURCE,
    category: classify(title, summary)
  };
}

async function readExistingFeed() {
  try {
    return await readFile(outputPath, 'utf8');
  } catch {
    return null;
  }
}

async function fetchFeed() {
  const response = await fetch(FEED_URL, {
    headers: {
      'User-Agent': 'nba-quick-news/0.1 (+https://github.com/)'
    }
  });

  if (!response.ok) {
    throw new Error(`RealGM RSS request failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function main() {
  const existingFeed = await readExistingFeed();

  try {
    const xml = await fetchFeed();
    const parsed = parser.parse(xml);
    const rawItems = toArray(parsed?.rss?.channel?.item);

    if (!rawItems.length) {
      throw new Error('RealGM RSS did not contain any items.');
    }

    const items = rawItems.map(normalizeItem).filter((item) => item.title && item.link);
    const payload = {
      source: SOURCE,
      feed: FEED_URL,
      updatedAt: new Date().toISOString(),
      items
    };

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${items.length} stories to ${path.relative(rootDir, outputPath)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    if (existingFeed === null) {
      process.exitCode = 1;
      return;
    }

    console.error('Fetch failed. Keeping the existing public/data/news.json file unchanged.');
    process.exitCode = 1;
  }
}

main();
