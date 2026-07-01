import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

const FEEDS = [
  {
    source: 'RealGM',
    feed: 'https://basketball.realgm.com/rss/wiretap/15/0.xml'
  },
  {
    source: 'Yahoo Sports',
    feed: 'https://sports.yahoo.com/nba/rss.xml'
  }
];
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(rootDir, 'public', 'data', 'news.json');

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true
});

const FETCH_HEADERS = {
  Accept: 'application/rss+xml, application/xml, text/xml, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'User-Agent':
    'Mozilla/5.0 (compatible; NBAQuickNews/0.1; +https://github.com/cibstan1999/nba-quick-news)'
};

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
  ['Cavs', '骑士'],
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
  ['Blazers', '开拓者'],
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
    ['签约', ['sign', 'signed', 'signing', 'contract', 'extension', 'free agent', 'free agency', 'waive', 'waived', 'deal']],
    ['伤病', ['injury', 'injured', 'surgery', 'ankle', 'knee', 'hamstring', 'out indefinitely', 'rehab']],
    ['选秀', ['draft', 'pick', 'prospect', 'lottery', 'combine', 'rookie']],
    ['季后赛', ['playoff', 'finals', 'semifinals', 'postseason', 'championship']]
  ];

  return rules.find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))?.[0] || '其他';
}

function normalizeSpacing(value = '') {
  return String(value)
    .replace(/\s+([，。！？：；、])/g, '$1')
    .replace(/([，。！？：；、])\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripSourcePhrases(value = '') {
  return String(value)
    .replace(/,\s*(?:AP )?source says$/i, '')
    .replace(/,\s*according to report$/i, '')
    .replace(/,\s*according to .+$/i, '')
    .trim();
}

function hasMachineEnglish(value = '') {
  const text = String(value);
  return /\b(?:considered|expected|agree|agrees|signing|signed|sign|named|with|from|into|onto|upon|under|over|after|before|during|likely|believed|pursuing|delaying|leading|target|source says|free agency|contract|deal|traded|trade|rumors|tracker|reacts|survey|continue|continued|host|play host|interested|according)\b/i.test(text);
}

function safeTitle(titleZh, originalTitle) {
  const cleaned = normalizeSpacing(titleZh);
  return hasMachineEnglish(cleaned) ? stripSourcePhrases(originalTitle) : cleaned;
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
    .replace(/\bone year\b/gi, '一年')
    .replace(/\bTwo-Year\b/gi, '两年')
    .replace(/\btwo-year\b/gi, '两年')
    .replace(/\btwo year\b/gi, '两年')
    .replace(/\bThree-Year\b/gi, '三年')
    .replace(/\bthree-year\b/gi, '三年')
    .replace(/\bthree year\b/gi, '三年')
    .replace(/\bFour-Year\b/gi, '四年')
    .replace(/\bfour-year\b/gi, '四年')
    .replace(/\bfour year\b/gi, '四年')
    .replace(/\bFive-Year\b/gi, '五年')
    .replace(/\bfive-year\b/gi, '五年')
    .replace(/\bfive year\b/gi, '五年')
    .replace(/\b(\d+)-year\b/gi, (_, years) => `${years}年`)
    .replace(/\$(\d+(?:\.\d+)?)M\b/g, (_, amount) => `${Number(amount) * 100}万美元`)
    .replace(/\$(\d+(?:\.\d+)?) million\b/gi, (_, amount) => `${Number(amount) * 100}万美元`)
    .replace(/\bpoints\b/gi, '分')
    .replace(/\brebounds\b/gi, '篮板')
    .replace(/\bassists\b/gi, '助攻')
    .replace(/\bsteals\b/gi, '抢断')
    .replace(/\bblocks\b/gi, '盖帽')
    .replace(/\bgames\b/gi, '场')
    .replace(/\bminutes\b/gi, '分钟')
    .replace(/\blast season\b/gi, '上赛季')
    .replace(/\bleft wrist fracture\b/gi, '左手腕骨折')
    .replace(/\bsprained toe\b/gi, '脚趾扭伤')
    .replace(/\bthree-pointers\b/gi, '三分球')
    .replace(/\bplayoff games\b/gi, '季后赛')
    .replace(/\bregular season games\b/gi, '常规赛')
    .replace(/\bfree agency\b/gi, '自由市场')
    .replace(/\bveteran guard\b/gi, '老将后卫')
    .replace(/\bguard\b/gi, '后卫')
    .replace(/\bstarting small forward\b/gi, '首发小前锋')
    .replace(/\bfail to retain\b/gi, '未能留住')
    .replace(/\bcontract extension\b/gi, '续约合同')
    .replace(/\bdeal\b/gi, '合同')
    .replace(/\bcontract\b/gi, '合同')
    .replace(/\bagreement\b/gi, '协议')
    .replace(/\bagree to\b/gi, '达成')
    .replace(/\bagreed to\b/gi, '达成')
    .replace(/\breached agreement on\b/gi, '达成')
    .replace(/\bwith a mutual option for Year 2\b/gi, '，第二年为双方选项')
    .replace(/\bat the tax midlevel exception\b/gi, '，使用税中产特例')
    .replace(/\band\b/gi, '和')
    .replace(/\bin\b/gi, '在')
    .replace(/\bthe\s+/gi, '')
    .replace(/\ba\s+/gi, '')
    .replace(/\s+,/g, '，')
    .replace(/,\s*/g, '，')
    .replace(/\s+\./g, '。')
    .replace(/\s+和\s+/g, '和')
    .replace(/在\s+(\d)/g, '在$1')
    .replace(/(\d(?:\.\d+)?)\s+(分|篮板|助攻|抢断|盖帽|分钟|场)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

function translateTitle(title = '', category = '其他') {
  const joiningContractMatch = title.match(/^(.+?) joining (.+?) on (.+?) contract(?: as .+)?$/i);
  if (joiningContractMatch) {
    return `${localizeCommonTerms(joiningContractMatch[1])}将加盟${localizeCommonTerms(joiningContractMatch[2])}，合同为${localizeCommonTerms(joiningContractMatch[3])}`;
  }

  const cleanTitle = stripSourcePhrases(title);

  const kesslerTargetMatch = cleanTitle.match(/^(.+?) considered (.+?) top target in free agency$/i);
  if (kesslerTargetMatch) {
    return `${localizeCommonTerms(kesslerTargetMatch[2])}将${localizeCommonTerms(kesslerTargetMatch[1])}视为自由市场重点目标`;
  }

  const teamTopTargetMatch = cleanTitle.match(/^(.+?) considered (.+?) top target$/i);
  if (teamTopTargetMatch) {
    return `${localizeCommonTerms(teamTopTargetMatch[2])}将${localizeCommonTerms(teamTopTargetMatch[1])}视为重点目标`;
  }

  const kawhiBackTorontoMatch = title.match(/^(.+?) going back to Toronto after Raptors make deal with Clippers(?:,.*)?$/i);
  if (kawhiBackTorontoMatch) {
    return `${localizeCommonTerms(kawhiBackTorontoMatch[1])}将重返多伦多，猛龙与快船达成交易`;
  }

  const kawhiTradedMatch = title.match(/^(.+?) traded to Toronto Raptors$/i);
  if (kawhiTradedMatch) {
    return `${localizeCommonTerms(kawhiTradedMatch[1])}被交易至多伦多猛龙`;
  }

  const sixersTrackerMatch = title.match(/^Sixers free agency tracker: Oubre, Grimes, Drummond set to become free agents and more$/i);
  if (sixersTrackerMatch) {
    return '76人自由市场追踪：Oubre、Grimes、Drummond等人成为自由球员';
  }

  const agreesExtensionMatch = title.match(/^(.+?) agrees to a contract extension with (?:the )?(.+)$/i);
  if (agreesExtensionMatch) {
    return `${localizeCommonTerms(agreesExtensionMatch[1])}与${localizeCommonTerms(agreesExtensionMatch[2])}达成续约合同`;
  }

  const nbaCupFinalMatch = title.match(/^Butler[’']s iconic Hinkle Fieldhouse will play host to the next NBA Cup final in December$/i);
  if (nbaCupFinalMatch) {
    return '巴特勒大学Hinkle Fieldhouse将在12月承办下一届NBA杯决赛';
  }

  const nilEraMatch = title.match(/^Dusty May addresses role of NIL era in Michigan departure, how it can be ‘segue’ to NBA$/i);
  if (nilEraMatch) {
    return 'Dusty May谈NIL时代对离开密歇根的影响，以及它如何成为通往NBA的过渡';
  }

  const jaylenBrownTradeTalksMatch = title.match(/^(.+?), (.+?), (.+?) Not Heavily Engaged With Celtics On Jaylen Brown Trade$/i);
  if (jaylenBrownTradeTalksMatch) {
    return `${localizeCommonTerms(jaylenBrownTradeTalksMatch[1])}、${localizeCommonTerms(jaylenBrownTradeTalksMatch[2])}和${localizeCommonTerms(jaylenBrownTradeTalksMatch[3])}并未积极与凯尔特人谈Jaylen Brown交易`;
  }

  const noPersonalIssuesMatch = title.match(/^(.+?), (.+?) Had No Personal Issues During Time With Lakers$/i);
  if (noPersonalIssuesMatch) {
    return `${localizeCommonTerms(noPersonalIssuesMatch[1])}和${localizeCommonTerms(noPersonalIssuesMatch[2])}在湖人共事期间没有私人矛盾`;
  }

  const lebronCandidatesMatch = title.match(/^(.+?), (.+?), (.+?) Considered Leading Candidates To Sign LeBron James$/i);
  if (lebronCandidatesMatch) {
    return `${localizeCommonTerms(lebronCandidatesMatch[1])}、${localizeCommonTerms(lebronCandidatesMatch[2])}和${localizeCommonTerms(lebronCandidatesMatch[3])}被视为签下LeBron James的热门候选`;
  }

  const durenResignMatch = title.match(/^(.+?) likely to resign with (.+?), leave (.+?) still searching for star center$/i);
  if (durenResignMatch) {
    return `${localizeCommonTerms(durenResignMatch[1])}可能与${localizeCommonTerms(durenResignMatch[2])}续约，${localizeCommonTerms(durenResignMatch[3])}仍在寻找明星中锋`;
  }

  const sixersDeanWadeMatch = title.match(/^Sixers agree to deal with forward (.+?) at start of free agency$/i);
  if (sixersDeanWadeMatch) {
    return `76人在自由市场开启时与前锋${localizeCommonTerms(sixersDeanWadeMatch[1])}达成合同`;
  }

  const bucksSignMatch = title.match(/^Bucks sign (.+?) to (.+?) deal as free agency begins$/i);
  if (bucksSignMatch) {
    return `雄鹿在自由市场开启后签下${localizeCommonTerms(bucksSignMatch[1])}，合同为${localizeCommonTerms(bucksSignMatch[2])}`;
  }

  const lebronNextTeamMatch = title.match(/^LeBron James next team 2026: Will LeBron join (.+?), (.+?) on Warriors\? Reunion with Heat\?$/i);
  if (lebronNextTeamMatch) {
    return `LeBron James下一站猜想：是否联手${localizeCommonTerms(lebronNextTeamMatch[1])}、${localizeCommonTerms(lebronNextTeamMatch[2])}或重返热火`;
  }

  const pistonsOfferMatch = title.match(/^Pistons Increase Offer To (.+?), Have No Interest In Sign-And-Trade$/i);
  if (pistonsOfferMatch) {
    return `${localizeCommonTerms('Pistons')}提高对${localizeCommonTerms(pistonsOfferMatch[1])}的报价，无意进行先签后换`;
  }

  const kawhiRetireMatch = title.match(/^Kawhi Leonard Envisions Retiring With Raptors; Familiarity With Front Office, City Of Toronto Drove Return$/i);
  if (kawhiRetireMatch) {
    return 'Kawhi Leonard希望在猛龙退役，对管理层和多伦多的熟悉推动他回归';
  }

  const hardenDelayMatch = title.match(/^James Harden Delaying Signing, Cavaliers Pursuing Max Strus Trade To Open LeBron James MLE Path$/i);
  if (hardenDelayMatch) {
    return 'James Harden推迟签约，骑士追求Max Strus交易以打开LeBron James中产路径';
  }

  const lebronTacticMatch = title.match(/^LeBron James’ incredibly sneaky tactic to protect Bronny’s future before blockbuster Lakers decision$/i);
  if (lebronTacticMatch) {
    return 'LeBron James在湖人重大决定前保护Bronny未来的策略';
  }

  const expectedDealsMatch = title.match(/^(.+?) believed to likely secure deals with (.+)$/i);
  if (expectedDealsMatch) {
    return `${localizeCommonTerms(expectedDealsMatch[1])}有望签下${localizeCommonTerms(expectedDealsMatch[2])}`;
  }

  const groupCupMatch = title.match(/^(.+?) named to (.+?) for (.+?) NBA Cup$/i);
  if (groupCupMatch) {
    return `${localizeCommonTerms(groupCupMatch[1])}被分入${localizeCommonTerms(groupCupMatch[3])}NBA杯${localizeCommonTerms(groupCupMatch[2])}`;
  }

  const loseGuardMatch = title.match(/^The (.+?) lose defensive guard to (?:the )?(.+)$/i);
  if (loseGuardMatch) {
    return `${localizeCommonTerms(loseGuardMatch[1])}失去防守型后卫，球员转投${localizeCommonTerms(loseGuardMatch[2])}`;
  }

  const superstarLeaveMatch = title.match(/^Basketball superstar (.+?) to leave LA Lakers$/i);
  if (superstarLeaveMatch) {
    return `${localizeCommonTerms(superstarLeaveMatch[1])}将离开洛杉矶湖人`;
  }

  const teardownTradeMatch = title.match(/^Warriors rival (.+?) continue teardown with (.+?) trade$/i);
  if (teardownTradeMatch) {
    return `${localizeCommonTerms(teardownTradeMatch[1])}交易${localizeCommonTerms(teardownTradeMatch[2])}后继续调整阵容`;
  }

  const lebronMeaningMatch = title.match(/^The Warriors know exactly what LeBron meant to the Lakers$/i);
  if (lebronMeaningMatch) {
    return '勇士清楚勒布朗对湖人的意义';
  }

  const jaylenConceptMatch = title.match(/^(.+?) To (.+?) With (.+?) Following Concept Floated By (.+)$/i);
  if (jaylenConceptMatch) {
    return `${localizeCommonTerms(jaylenConceptMatch[4])}提出设想：${localizeCommonTerms(jaylenConceptMatch[1])}和${localizeCommonTerms(jaylenConceptMatch[3])}前往${localizeCommonTerms(jaylenConceptMatch[2])}`;
  }

  const salaryCapProjectionMatch = title.match(/^NBA Projects Salary Cap Growth To Slow To (.+?) Percent In (.+?) At (.+)$/i);
  if (salaryCapProjectionMatch) {
    return `NBA预计${salaryCapProjectionMatch[2]}赛季工资帽增速放缓至${salaryCapProjectionMatch[1]}%，工资帽约为${localizeCommonTerms(salaryCapProjectionMatch[3])}`;
  }

  const meetInFreeAgencyMatch = title.match(/^(.+?) plans to meet with (.+?) in free agency$/i);
  if (meetInFreeAgencyMatch) {
    return `${localizeCommonTerms(meetInFreeAgencyMatch[1])}计划在自由市场与${localizeCommonTerms(meetInFreeAgencyMatch[2])}会面`;
  }

  const reactsSurveyMatch = title.match(/^(.+?) Reacts Survey: who are you looking forward to seeing at Summer League\?$/i);
  if (reactsSurveyMatch) {
    return `${localizeCommonTerms(reactsSurveyMatch[1])}球迷调查：夏季联赛最期待谁的表现`;
  }

  const teamSigningDealMatch = title.match(/^(.+?) signing (.+?) to (.+?) deal$/i);
  if (teamSigningDealMatch) {
    return `${localizeCommonTerms(teamSigningDealMatch[1])}将签下${localizeCommonTerms(teamSigningDealMatch[2])}，合同为${localizeCommonTerms(teamSigningDealMatch[3])}`;
  }

  const teamSignPositionContractMatch = title.match(/^(.+?) sign (?:guard\s+)?(.+?) to (.+?) contract$/i);
  if (teamSignPositionContractMatch) {
    return `${localizeCommonTerms(teamSignPositionContractMatch[1])}签下${localizeCommonTerms(teamSignPositionContractMatch[2])}，合同为${localizeCommonTerms(teamSignPositionContractMatch[3])}`;
  }

  const playerSignsDealWithTeamMatch = title.match(/^(.+?) signs (.+?) deal with (.+)$/i);
  if (playerSignsDealWithTeamMatch) {
    return `${localizeCommonTerms(playerSignsDealWithTeamMatch[1])}与${localizeCommonTerms(playerSignsDealWithTeamMatch[3])}签下${localizeCommonTerms(playerSignsDealWithTeamMatch[2])}合同`;
  }

  const teamAddsShootingMatch = title.match(/^(.+?) add elite shooting with (.+?) signing$/i);
  if (teamAddsShootingMatch) {
    return `${localizeCommonTerms(teamAddsShootingMatch[1])}签下${localizeCommonTerms(teamAddsShootingMatch[2])}，补强外线投射`;
  }

  const notInterestedTradeMatch = title.match(/^The (.+?) are not interested in trading (.+?), according to report$/i);
  if (notInterestedTradeMatch) {
    return `${localizeCommonTerms(notInterestedTradeMatch[1])}无意交易${localizeCommonTerms(notInterestedTradeMatch[2])}`;
  }

  const expectedToSignMatch = title.match(/^(.+?) Expected To Sign (.+?); Continue Pursuit Of (.+)$/i);
  if (expectedToSignMatch) {
    return `${localizeCommonTerms(expectedToSignMatch[1])}预计签下${localizeCommonTerms(expectedToSignMatch[2])}，并继续追求${localizeCommonTerms(expectedToSignMatch[3])}`;
  }

  const leavesForDealMatch = title.match(/^(.+?) leaves (.+?) for (.+?) deal with (.+)$/i);
  if (leavesForDealMatch) {
    return `${localizeCommonTerms(leavesForDealMatch[1])}离开${localizeCommonTerms(leavesForDealMatch[2])}，与${localizeCommonTerms(leavesForDealMatch[4])}签下${localizeCommonTerms(leavesForDealMatch[3])}合同`;
  }

  const freeAgencyRetainMatch = title.match(/^(.+?) fail to retain starting small forward in free agency$/i);
  if (freeAgencyRetainMatch) {
    return `${localizeCommonTerms(freeAgencyRetainMatch[1])}在自由市场未能留住首发小前锋`;
  }

  const tradeImpactMatch = title.match(/^What's next for (.+?)\? What (.+?) trade means for roster$/i);
  if (tradeImpactMatch) {
    return `${localizeCommonTerms(tradeImpactMatch[1])}下一步怎么走：${localizeCommonTerms(tradeImpactMatch[2])}交易对阵容的影响`;
  }

  const extensionMatch = title.match(/^(.+?) Agrees to Contract Extension With (.+)$/i);
  if (extensionMatch) {
    return `${localizeCommonTerms(extensionMatch[1])}与${localizeCommonTerms(extensionMatch[2])}达成续约合同`;
  }

  const sourceSaysDealMatch = title.match(/^(.+?) agree to (?:an? )?(.+?),\s*(\d+)-year deal with (.+?)(?:,.*)?$/i);
  if (sourceSaysDealMatch) {
    return `${localizeCommonTerms(sourceSaysDealMatch[1])}与${localizeCommonTerms(sourceSaysDealMatch[4])}达成${localizeCommonTerms(`${sourceSaysDealMatch[3]}-year`)}、${localizeCommonTerms(sourceSaysDealMatch[2])}合同`;
  }

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

  return safeTitle(`${categoryPrefix}：${localizeCommonTerms(cleanTitle)}`, title);
}

function summarizeSentence(sentence = '') {
  const original = sentence.trim();

  const agreementMatch = original.match(/^(.+?) and (?:the )?(.+?) (?:have|has) agreed to an? (.+?) (?:deal|contract)(.*)\.$/i);
  if (agreementMatch) {
    return `${localizeCommonTerms(agreementMatch[1])}与${localizeCommonTerms(agreementMatch[2])}达成${localizeCommonTerms(agreementMatch[3])}合同${localizeCommonTerms(agreementMatch[4])}。`;
  }

  const reachedMatch = original.match(/^(.+?) and (?:the )?(.+?) have reached agreement on an? (.+?) (?:deal|contract)(.*)\.$/i);
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

  const lastSeasonStatsMatch = original.match(/^In (.+?) with (?:the )?(.+?) last season, (.+?) averaged (.+?)\.$/i);
  if (lastSeasonStatsMatch) {
    const minutesMatch = lastSeasonStatsMatch[4].match(/^(.+?) in ([\d.]+) minutes$/i);
    const stats = minutesMatch
      ? `${localizeCommonTerms(minutesMatch[1])}，出场${minutesMatch[2]}分钟`
      : localizeCommonTerms(lastSeasonStatsMatch[4]);
    return `${localizeCommonTerms(lastSeasonStatsMatch[3])}上赛季为${localizeCommonTerms(lastSeasonStatsMatch[2])}出战${localizeCommonTerms(lastSeasonStatsMatch[1])}，场均${stats}。`;
  }

  const midlevelMatch = original.match(/^(?:The )?(.+?) are using (?:the )?non-taxpayer midlevel exception to sign (.+?) and will be hard capped at (?:the )?first apron\.$/i);
  if (midlevelMatch) {
    return `${localizeCommonTerms(midlevelMatch[1])}将使用非纳税人中产特例签下${localizeCommonTerms(midlevelMatch[2])}，并受到第一土豪线硬工资帽限制。`;
  }

  const loseKeyPlayerMatch = original.match(/^(.+?) lose key player to Philadelphia\.$/i);
  if (loseKeyPlayerMatch) {
    return `${localizeCommonTerms(loseKeyPlayerMatch[1])}有关键球员转投费城。`;
  }

  const appearedMatch = original.match(/^(.+?) appeared in just (.+?) games last season due to (.+?)\.$/i);
  if (appearedMatch) {
    return `${localizeCommonTerms(appearedMatch[1])}上赛季因${localizeCommonTerms(appearedMatch[3])}只出战${appearedMatch[2]}场。`;
  }

  const simpleStatsMatch = original.match(/^(.+?) averaged (.+?)\.$/i);
  if (simpleStatsMatch) {
    const minutesMatch = simpleStatsMatch[2].match(/^(.+?) in ([\d.]+) minutes$/i);
    if (minutesMatch) {
      return `${localizeCommonTerms(simpleStatsMatch[1])}场均${localizeCommonTerms(minutesMatch[1])}，出场${minutesMatch[2]}分钟。`;
    }

    return `${localizeCommonTerms(simpleStatsMatch[1])}场均${localizeCommonTerms(simpleStatsMatch[2])}。`;
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
  return englishWords.length - knownNameWords.length <= 1;
}

function getMoneyTokens(value = '') {
  return value.match(/\d+(?:\.\d+)?万美元/g) || [];
}

function getDurationTokens(value = '') {
  return value.match(/(?:\d+|[一二三四五六七八九十两]+)年/g) || [];
}

function getLeadName(value = '') {
  return value.match(/^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)*/)?.[0] || '';
}

function isDuplicateOfTitle(sentence = '', titleZh = '') {
  const leadName = getLeadName(titleZh);
  const titleMoney = getMoneyTokens(titleZh);
  const sentenceMoney = getMoneyTokens(sentence);
  const titleDuration = getDurationTokens(titleZh);
  const sentenceDuration = getDurationTokens(sentence);
  const sameMoney = titleMoney.length && titleMoney.some((token) => sentenceMoney.includes(token));
  const sameDuration = titleDuration.length && titleDuration.some((token) => sentenceDuration.includes(token));

  return Boolean(
    leadName &&
      sentence.includes(leadName) &&
      sentence.includes('达成') &&
      sentence.includes('合同') &&
      sameMoney &&
      sameDuration
  );
}

function buildChineseSummary(title, summary, category, source) {
  const titleZh = translateTitle(title, category);
  const sentences = summary
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !/represented by/i.test(sentence));
  const coreSentences = sentences
    .slice(0, 4)
    .map(summarizeSentence)
    .filter(isUsefulChineseSentence)
    .filter((sentence) => !isDuplicateOfTitle(sentence, titleZh))
    .slice(0, 2);
  const leadSummary = hasMachineEnglish(titleZh) ? `这是一条关于 ${stripSourcePhrases(title)} 的NBA动态。` : `${titleZh}。`;
  const detailSummary = coreSentences.length ? coreSentences.join(' ') : '';
  const summaryZh = `据 ${source} 报道，${leadSummary}${detailSummary}`;

  const keyPoints = coreSentences.filter((sentence) => sentence.length <= 160).slice(0, 3);

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

function getRssImageUrl(item = {}, link = '') {
  const candidates = [
    item.enclosure?.['@_url'],
    item['media:content']?.['@_url'],
    item['media:thumbnail']?.['@_url']
  ];
  const imageUrl = candidates.find(Boolean);
  if (!imageUrl) return '';

  try {
    return new URL(imageUrl, link).href;
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

async function normalizeItem(item, index, feedConfig) {
  const title = stripHtml(item.title);
  if (/Get Your Latest NBA News From RealGM|^RealGM Radio:/i.test(title)) {
    return null;
  }

  const link = String(item.link || '').trim();
  const pubDate = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();
  const summary = stripHtml(item.description);
  const category = classify(title, summary);
  const chinese = buildChineseSummary(title, summary, category, feedConfig.source);
  const rssImageUrl = getRssImageUrl(item, link);

  return {
    id: link || `${title}-${index}`,
    title,
    titleZh: chinese.titleZh,
    link,
    pubDate,
    summary,
    summaryZh: chinese.summaryZh,
    keyPoints: chinese.keyPoints,
    imageUrl: rssImageUrl || (await fetchArticleImage(link)),
    source: feedConfig.source,
    feed: feedConfig.feed,
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

function parseExistingPayload(existingFeed) {
  if (!existingFeed) return null;

  try {
    return JSON.parse(existingFeed);
  } catch {
    return null;
  }
}

async function writePayload(payload) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function rebuildFromExistingFeed() {
  const existingFeed = await readExistingFeed();
  if (!existingFeed) {
    throw new Error('No existing public/data/news.json file found.');
  }

  const existing = JSON.parse(existingFeed);
  const sourceConfigs = Array.isArray(existing.sources) ? existing.sources : FEEDS;
  const items = dedupeAndSort(
    toArray(existing.items)
      .map((item, index) => {
        const title = stripHtml(item.title);
        if (!title) return null;

        const source = item.source?.split(' / ')[0] || 'Unknown';
        const feedConfig = sourceConfigs.find((config) => config.source === source) || { source, feed: item.feed || '' };
        const summary = stripHtml(item.summary);
        const category = classify(title, summary);
        const chinese = buildChineseSummary(title, summary, category, feedConfig.source);

        return {
          ...item,
          id: item.link || `${title}-${index}`,
          title,
          titleZh: chinese.titleZh,
          summary,
          summaryZh: chinese.summaryZh,
          keyPoints: chinese.keyPoints,
          source: Array.isArray(item.sources) && item.sources.length ? item.sources.join(' / ') : item.source || feedConfig.source,
          sources: item.sources,
          feed: feedConfig.feed,
          category,
          imageUrl: item.imageUrl || ''
        };
      })
      .filter(Boolean)
  );

  const payload = {
    sources: sourceConfigs,
    updatedAt: existing.updatedAt || new Date().toISOString(),
    lastFetchStatus: {
      status: 'rebuilt-from-cache',
      checkedAt: new Date().toISOString(),
      message: 'Rebuilt derived news fields from the existing local JSON cache.'
    },
    highlights: buildHighlights(items),
    items
  };

  await writePayload(payload);
  console.log(`Rebuilt ${items.length} cached stories in ${path.relative(rootDir, outputPath)}`);
}

async function fetchWithRetry(url, options = {}, retries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  throw lastError;
}

async function fetchFeed(feedUrl) {
  const response = await fetchWithRetry(feedUrl, {
    headers: FETCH_HEADERS
  });

  if (!response.ok) {
    throw new Error(`${feedUrl} request failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function getFeedItems(parsed) {
  return toArray(parsed?.rss?.channel?.item || parsed?.feed?.entry);
}

function getTimestamp(item) {
  const date = new Date(item.pubDate || item.published || item.updated || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getPrimaryPerson(title = '') {
  const patterns = [
    /^(.+?),\s*.+? Agree To/i,
    /^(.+?) leaves .+? for/i,
    /^.+? signing (.+?) to/i,
    /^.+? sign (?:guard\s+)?(.+?) to/i,
    /^(.+?) signs .+? deal with/i,
    /^(.+?) Agrees to Contract Extension/i,
    /^.+? with (?:forward\s+|veteran guard\s+|guard\s+)?(.+?)(?:,| at |$)/i,
    /^(.+?) traded to/i
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1]) return stripSourcePhrases(match[1]).trim();
  }

  return title.match(/[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2}/)?.[0] || '';
}

function getTeamTokens(value = '') {
  const text = localizeCommonTerms(value);
  return Array.from(teamNames.values()).filter((team) => text.includes(team));
}

function getEventTeam(value = '') {
  const text = localizeCommonTerms(value);
  const matches = Array.from(teamNames.values())
    .map((team) => ({ team, index: text.lastIndexOf(team) }))
    .filter((entry) => entry.index >= 0)
    .sort((a, b) => b.index - a.index);
  return matches[0]?.team || '';
}

function getDuplicateKey(item) {
  const person = getPrimaryPerson(item.title).toLowerCase();
  const money = getMoneyTokens(item.titleZh || item.summaryZh || item.title)[0] || '';
  const eventTeam = getEventTeam(`${item.title} ${item.titleZh}`);

  if (person && eventTeam && ['签约', '交易'].includes(item.category)) {
    return [person, eventTeam].join('|');
  }

  if (person && money) {
    return [person, money].join('|');
  }

  return '';
}

function mergeDuplicateGroup(group) {
  if (group.length === 1) return group[0];

  const sorted = [...group].sort((a, b) => {
    const imageDelta = Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl));
    if (imageDelta) return imageDelta;
    return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
  });
  const primary = { ...sorted[0] };
  const sources = [
    ...new Set(
      sorted
        .flatMap((item) => item.sources || String(item.source || '').split(' / '))
        .map((source) => source.trim())
        .filter(Boolean)
    )
  ];

  primary.source = sources.join(' / ');
  primary.sources = sources;
  primary.sourceLinks = sorted.map((item) => ({ source: item.source, link: item.link }));
  primary.originalTitles = sorted.map((item) => item.title);
  primary.isMerged = true;

  const detailItem = sorted
    .filter((item) => item.summaryZh)
    .sort((a, b) => b.summaryZh.length - a.summaryZh.length)[0];
  if (detailItem && detailItem.summaryZh.length > primary.summaryZh.length) {
    primary.summaryZh = detailItem.summaryZh;
    primary.keyPoints = detailItem.keyPoints;
  }

  return primary;
}

function dedupeAndSort(items) {
  const exactSeen = new Set();
  const groups = new Map();
  const singles = [];

  for (const item of items) {
    const exactKey = item.link || `${item.source}:${item.title.toLowerCase()}`;
    if (exactSeen.has(exactKey)) continue;
    exactSeen.add(exactKey);

    const duplicateKey = getDuplicateKey(item);
    if (!duplicateKey) {
      singles.push(item);
      continue;
    }

    if (!groups.has(duplicateKey)) groups.set(duplicateKey, []);
    groups.get(duplicateKey).push(item);
  }

  return [...singles, ...Array.from(groups.values()).map(mergeDuplicateGroup)]
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 120);
}

function scoreHighlight(item) {
  const text = `${item.title} ${item.titleZh} ${item.summary}`.toLowerCase();
  let score = 0;
  if (['签约', '交易', '伤病', '选秀'].includes(item.category)) score += 5;
  if (/(lebron|kawhi|harden|doncic|brown|lakers|warriors|celtics|suns|nets|sixers|bucks|heat|cavaliers)/i.test(text)) score += 3;
  if (/(free agency|trade|sign|deal|contract|extension|injury|draft|target|rumor|pursuit|acquire)/i.test(text)) score += 3;
  if (getMoneyTokens(`${item.titleZh} ${item.summaryZh}`).length) score += 2;
  if (item.isMerged) score += 2;
  return score;
}

function toHighlightText(item) {
  return normalizeSpacing((item.titleZh || item.title).replace(/^NBA动态：/, '').replace(/^签约动态：/, '').replace(/^交易动态：/, ''));
}

function buildHighlights(items) {
  return [...items]
    .map((item) => ({ item, score: scoreHighlight(item) }))
    .sort((a, b) => b.score - a.score || new Date(b.item.pubDate).getTime() - new Date(a.item.pubDate).getTime())
    .slice(0, 5)
    .map(({ item }) => ({
      id: item.id,
      text: toHighlightText(item),
      category: item.category,
      source: item.source,
      link: item.link
    }));
}

async function main() {
  if (process.argv.includes('--from-cache')) {
    await rebuildFromExistingFeed();
    return;
  }

  const existingFeed = await readExistingFeed();

  try {
    const feedResults = await Promise.all(
      FEEDS.map(async (feedConfig) => {
        try {
          const xml = await fetchFeed(feedConfig.feed);
          const parsed = parser.parse(xml);
          const rawItems = getFeedItems(parsed);

          if (!rawItems.length) {
            throw new Error(`${feedConfig.source} RSS did not contain any items.`);
          }

          const items = await mapWithConcurrency(rawItems, 4, (item, index) => normalizeItem(item, index, feedConfig));
          return { feedConfig, items: items.filter((item) => item?.title && item?.link), error: null };
        } catch (error) {
          return { feedConfig, items: [], error };
        }
      })
    );

    const failedFeeds = feedResults.filter((result) => result.error);
    for (const result of failedFeeds) {
      console.error(`${result.feedConfig.source} fetch failed: ${result.error instanceof Error ? result.error.message : result.error}`);
    }

    const items = dedupeAndSort(feedResults.flatMap((result) => result.items));

    if (!items.length) {
      const existingPayload = parseExistingPayload(existingFeed);
      if (existingPayload === null) {
        throw new Error('No RSS items were fetched from any source.');
      }

      const checkedAt = new Date().toISOString();
      const failedFeedDetails = failedFeeds.map((result) => ({
        source: result.feedConfig.source,
        feed: result.feedConfig.feed,
        error: result.error instanceof Error ? result.error.message : String(result.error),
        cause: result.error?.cause ? String(result.error.cause) : undefined
      }));
      const payload = {
        ...existingPayload,
        updatedAt: checkedAt,
        lastFetchStatus: {
          status: 'error',
          checkedAt,
          message: 'All RSS feeds failed or returned no usable items. Kept existing news items.',
          fetchedItems: 0,
          failedFeeds: failedFeedDetails
        }
      };

      await writePayload(payload);
      console.error('No RSS items were fetched. Kept existing news items and wrote per-feed failure details.');
      return;
    }

    const payload = {
      sources: FEEDS,
      updatedAt: new Date().toISOString(),
      lastFetchStatus: {
        status: failedFeeds.length ? 'partial-success' : 'success',
        checkedAt: new Date().toISOString(),
        fetchedItems: items.length,
        failedFeeds: failedFeeds.map((result) => ({
          source: result.feedConfig.source,
          feed: result.feedConfig.feed,
          error: result.error instanceof Error ? result.error.message : String(result.error)
        }))
      },
      highlights: buildHighlights(items),
      items
    };

    await writePayload(payload);
    console.log(`Wrote ${items.length} stories to ${path.relative(rootDir, outputPath)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    const existingPayload = parseExistingPayload(existingFeed);
    if (existingPayload === null) {
      process.exitCode = 1;
      return;
    }

    const checkedAt = new Date().toISOString();
    const payload = {
      ...existingPayload,
      updatedAt: checkedAt,
      lastFetchStatus: {
        status: 'error',
        checkedAt,
        message: 'RSS fetch failed. Kept existing news items and updated fetch status.',
        error: error instanceof Error ? error.message : String(error)
      }
    };

    await writePayload(payload);
    console.error('Fetch failed. Kept existing news items and wrote lastFetchStatus to public/data/news.json.');
  }
}

main();
