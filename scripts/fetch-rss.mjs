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

const teamNames = new Map([
  ['Atlanta Hawks', '亚特兰大老鹰'],
  ['Hawks', '老鹰'],
  ['Boston Celtics', '波士顿凯尔特人'],
  ['Celtics', '凯尔特人'],
  ['Brooklyn Nets', '布鲁克林篮网'],
  ['Nets', '篮网'],
  ['Charlotte Hornets', '夏洛特黄蜂'],
  ['Hornets', '黄蜂'],
  ['Chicago Bulls', '芝加哥公牛'],
  ['Bulls', '公牛'],
  ['Cleveland Cavaliers', '克利夫兰骑士'],
  ['Cavaliers', '骑士'],
  ['Dallas Mavericks', '达拉斯独行侠'],
  ['Mavericks', '独行侠'],
  ['Denver Nuggets', '丹佛掘金'],
  ['Nuggets', '掘金'],
  ['Detroit Pistons', '底特律活塞'],
  ['Pistons', '活塞'],
  ['Golden State Warriors', '金州勇士'],
  ['Warriors', '勇士'],
  ['Houston Rockets', '休斯敦火箭'],
  ['Rockets', '火箭'],
  ['Indiana Pacers', '印第安纳步行者'],
  ['Pacers', '步行者'],
  ['Los Angeles Clippers', '洛杉矶快船'],
  ['Clippers', '快船'],
  ['Los Angeles Lakers', '洛杉矶湖人'],
  ['Lakers', '湖人'],
  ['Memphis Grizzlies', '孟菲斯灰熊'],
  ['Grizzlies', '灰熊'],
  ['Miami Heat', '迈阿密热火'],
  ['Heat', '热火'],
  ['Milwaukee Bucks', '密尔沃基雄鹿'],
  ['Bucks', '雄鹿'],
  ['Minnesota Timberwolves', '明尼苏达森林狼'],
  ['Timberwolves', '森林狼'],
  ['New Orleans Pelicans', '新奥尔良鹈鹕'],
  ['Pelicans', '鹈鹕'],
  ['New York Knicks', '纽约尼克斯'],
  ['Knicks', '尼克斯'],
  ['Oklahoma City Thunder', '俄克拉荷马城雷霆'],
  ['Thunder', '雷霆'],
  ['Orlando Magic', '奥兰多魔术'],
  ['Magic', '魔术'],
  ['Philadelphia 76ers', '费城76人'],
  ['Sixers', '76人'],
  ['76ers', '76人'],
  ['Phoenix Suns', '菲尼克斯太阳'],
  ['Suns', '太阳'],
  ['Portland Trail Blazers', '波特兰开拓者'],
  ['Trail Blazers', '开拓者'],
  ['Sacramento Kings', '萨克拉门托国王'],
  ['Kings', '国王'],
  ['San Antonio Spurs', '圣安东尼奥马刺'],
  ['Spurs', '马刺'],
  ['Toronto Raptors', '多伦多猛龙'],
  ['Raptors', '猛龙'],
  ['Utah Jazz', '犹他爵士'],
  ['Jazz', '爵士'],
  ['Washington Wizards', '华盛顿奇才'],
  ['Wizards', '奇才']
]);

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
    ['交易', ['trade', 'traded', 'trading', 'acquire', 'acquired', 'swap']],
    ['签约', ['sign', 'signed', 'signing', 'contract', 'extension', 'free agent', 'waive', 'waived', 'deal']],
    ['伤病', ['injury', 'injured', 'surgery', 'ankle', 'knee', 'hamstring', 'out indefinitely', 'rehab']],
    ['选秀', ['draft', 'pick', 'prospect', 'lottery', 'combine', 'rookie']],
    ['季后赛', ['playoff', 'finals', 'semifinals', 'postseason', 'championship']]
  ];

  return rules.find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))?.[0] || '其他';
}

function localizeCommonTerms(value = '') {
  let text = value;

  for (const [english, chinese] of teamNames) {
    text = text.replaceAll(english, chinese);
  }

  return text
    .replace(/\bthe\s+(?=[\u4e00-\u9fa5])/gi, '')
    .replace(/\ba\s+(?=[\u4e00-\u9fa5])/gi, '')
    .replace(/\bOne-Year\b/gi, '一年')
    .replace(/\bone-year\b/gi, '一年')
    .replace(/\bTwo-Year\b/gi, '两年')
    .replace(/\btwo-year\b/gi, '两年')
    .replace(/\bThree-Year\b/gi, '三年')
    .replace(/\bthree-year\b/gi, '三年')
    .replace(/\bFour-Year\b/gi, '四年')
    .replace(/\bfour-year\b/gi, '四年')
    .replace(/\bFive-Year\b/gi, '五年')
    .replace(/\bfive-year\b/gi, '五年')
    .replace(/\$(\d+(?:\.\d+)?)M\b/g, (_, amount) => `${Number(amount) * 100}万美元`)
    .replace(/\$(\d+(?:\.\d+)?) million\b/gi, (_, amount) => `${Number(amount) * 100}万美元`)
    .replace(/\bpoints\b/gi, '分')
    .replace(/\brebounds\b/gi, '篮板')
    .replace(/\bassists\b/gi, '助攻')
    .replace(/\bsteals\b/gi, '抢断')
    .replace(/\bblocks\b/gi, '盖帽')
    .replace(/\bminutes\b/gi, '分钟')
    .replace(/\bthree-pointers\b/gi, '三分球')
    .replace(/\bplayoff games\b/gi, '季后赛')
    .replace(/\bregular season games\b/gi, '常规赛')
    .replace(/\bdeal\b/gi, '合同')
    .replace(/\bagreement\b/gi, '协议')
    .replace(/\bagree to\b/gi, '达成')
    .replace(/\bagreed to\b/gi, '达成')
    .replace(/\breached agreement on\b/gi, '达成')
    .replace(/\bwith a mutual option for Year 2\b/gi, '，第二年为双方选项')
    .replace(/\bat the tax midlevel exception\b/gi, '，使用税中产特例')
    .replace(/\bthe\s+/gi, '')
    .replace(/\ba\s+/gi, '')
    .replace(/\s+,/g, '，')
    .replace(/,\s*/g, '，')
    .replace(/\s+\./g, '。')
    .replace(/\s+/g, ' ')
    .trim();
}

function translateTitle(title = '', category = '其他') {
  const agreeMatch = title.match(/^(.+?),\s*(.+?) Agree To (.+?) Deal$/i);
  if (agreeMatch) {
    return `${localizeCommonTerms(agreeMatch[1])}与${localizeCommonTerms(agreeMatch[2])}达成${localizeCommonTerms(agreeMatch[3])}合同`;
  }

  const tradeMatch = title.match(/^(.+?) (?:Acquires|Acquire|Acquired) (.+?) From (.+)$/i);
  if (tradeMatch) {
    return `${localizeCommonTerms(tradeMatch[1])}从${localizeCommonTerms(tradeMatch[3])}得到${localizeCommonTerms(tradeMatch[2])}`;
  }

  const signMatch = title.match(/^(.+?) (?:Signs|Signed) (.+)$/i);
  if (signMatch) {
    return `${localizeCommonTerms(signMatch[1])}签下${localizeCommonTerms(signMatch[2])}`;
  }

  const categoryPrefix = {
    交易: '交易动态',
    签约: '签约动态',
    伤病: '伤病更新',
    选秀: '选秀动态',
    季后赛: '季后赛动态',
    其他: 'NBA动态'
  }[category];

  return `${categoryPrefix}：${localizeCommonTerms(title)}`;
}

function summarizeSentence(sentence = '') {
  const original = sentence.trim();

  const agreementMatch = original.match(/^(.+?) and (?:the )?(.+?) (?:have|has) agreed to an? (.+?) deal(.*)\.$/i);
  if (agreementMatch) {
    return `${localizeCommonTerms(agreementMatch[1])}与${localizeCommonTerms(agreementMatch[2])}达成${localizeCommonTerms(agreementMatch[3])}合同${localizeCommonTerms(agreementMatch[4])}。`;
  }

  const reachedMatch = original.match(/^(.+?) and (?:the )?(.+?) have reached agreement on an? (.+?) deal(.*)\.$/i);
  if (reachedMatch) {
    return `${localizeCommonTerms(reachedMatch[1])}与${localizeCommonTerms(reachedMatch[2])}达成${localizeCommonTerms(reachedMatch[3])}合同${localizeCommonTerms(reachedMatch[4])}。`;
  }

  const finishedMatch = original.match(/^(.+?) finished the (.+?) season with (?:the )?(.+?) following (?:his|a) trade from (?:the )?(.+?)\.$/i);
  if (finishedMatch) {
    return `${localizeCommonTerms(finishedMatch[1])}在${localizeCommonTerms(finishedMatch[2])}赛季末效力于${localizeCommonTerms(finishedMatch[3])}，此前由${localizeCommonTerms(finishedMatch[4])}交易而来。`;
  }

  const acquiredMatch = original.match(/^(?:The )?(.+?) acquired (.+?) at (.+?) from (?:the )?(.+?)\.$/i);
  if (acquiredMatch) {
    return `${localizeCommonTerms(acquiredMatch[1])}在${localizeCommonTerms(acquiredMatch[3])}从${localizeCommonTerms(acquiredMatch[4])}得到${localizeCommonTerms(acquiredMatch[2])}。`;
  }

  const statsMatch = original.match(/^In (.+?) with (?:the )?(.+?), (.+?) averaged (.+?) while shooting (.+?) percent on three-pointers\.$/i);
  if (statsMatch) {
    return `${localizeCommonTerms(statsMatch[3])}在效力${localizeCommonTerms(statsMatch[2])}期间，${localizeCommonTerms(statsMatch[1])}场均${localizeCommonTerms(statsMatch[4])}，三分命中率${statsMatch[5]}%。`;
  }

  const midlevelMatch = original.match(/^(?:The )?(.+?) are using (?:the )?non-taxpayer midlevel exception to sign (.+?) and will be hard capped at (?:the )?first apron\.$/i);
  if (midlevelMatch) {
    return `${localizeCommonTerms(midlevelMatch[1])}将使用非纳税人中产特例签下${localizeCommonTerms(midlevelMatch[2])}，并受到第一土豪线硬工资帽限制。`;
  }

  return localizeCommonTerms(original)
    .replace(/\band\b/gi, '和')
    .replace(/\bwith\b/gi, '为')
    .replace(/\bin\b/gi, '在')
    .replace(/\baveraged\b/gi, '场均')
    .replace(/\bacquired\b/gi, '得到')
    .replace(/\s+/g, ' ')
    .trim();
}

function isUsefulChineseSentence(sentence = '') {
  const englishWords = sentence.match(/[A-Za-z]{3,}/g) || [];
  const knownNameWords = sentence.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
  return englishWords.length - knownNameWords.length <= 4;
}

function buildChineseSummary(title, summary, category) {
  const titleZh = translateTitle(title, category);
  const sentences = summary
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const coreSentences = sentences
    .slice(0, 4)
    .map(summarizeSentence)
    .filter(isUsefulChineseSentence)
    .slice(0, 2);
  const summaryZh = coreSentences.length
    ? `据 RealGM 报道，${coreSentences.join(' ')}`
    : `据 RealGM 报道，${titleZh}`;

  const keyPoints = [
    titleZh,
    ...coreSentences.filter((sentence) => sentence.length <= 160)
  ].slice(0, 3);

  return { titleZh, summaryZh, keyPoints };
}

function extractImageUrl(html = '', baseUrl = '') {
  const patterns = [
    /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
    /<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i,
    /<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i,
    /<meta\s+content=["']([^"']+)["']\s+name=["']twitter:image["']/i
  ];

  const imageUrl = patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean);
  if (!imageUrl) return '';

  try {
    return new URL(imageUrl, baseUrl).href;
  } catch {
    return '';
  }
}

async function fetchArticleImage(link) {
  if (!link) return '';

  try {
    const response = await fetch(link, {
      headers: {
        'User-Agent': 'nba-quick-news/0.1 (+https://github.com/)'
      }
    });

    if (!response.ok) return '';
    return extractImageUrl(await response.text(), link);
  } catch {
    return '';
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function normalizeItem(item, index) {
  const title = stripHtml(item.title);
  const link = String(item.link || '').trim();
  const pubDate = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();
  const summary = stripHtml(item.description);
  const category = classify(title, summary);
  const chinese = buildChineseSummary(title, summary, category);

  return {
    id: link || `${title}-${index}`,
    title,
    titleZh: chinese.titleZh,
    link,
    pubDate,
    summary,
    summaryZh: chinese.summaryZh,
    keyPoints: chinese.keyPoints,
    imageUrl: await fetchArticleImage(link),
    source: SOURCE,
    category
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

    const items = (await mapWithConcurrency(rawItems, 4, normalizeItem)).filter((item) => item.title && item.link);
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
