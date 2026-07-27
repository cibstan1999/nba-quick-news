import './style.css';

const categories = ['最新', '交易', '签约', '伤病', '选秀', '流言', '比赛', '分析', '其他'];
const workerNewsUrl = 'https://nba-quick-news-worker.cibstan1999.workers.dev/data/news.json';
const workerCacheKey = 'nba-quick-news:last-worker-payload:v1';

const app = document.querySelector('#app');

const state = {
  items: [],
  highlights: [],
  updatedAt: '',
  lastFetchStatus: {},
  query: '',
  category: '最新',
  visibleCount: 15,
  loading: true,
  error: '',
  usingCachedData: false
};

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value, options = {}) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options
  }).format(date);
}

function getAgeHours(value) {
  const time = new Date(value || '').getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, (Date.now() - time) / 36e5);
}

function getFreshnessState() {
  const ageHours = getAgeHours(state.updatedAt);
  const status = state.lastFetchStatus?.status || 'unknown';

  if (ageHours === null) {
    return { level: 'danger', label: '暂无成功更新时间', detail: '新闻数据状态未知。' };
  }

  if (ageHours > 24) {
    return { level: 'danger', label: '新闻数据已超过 24 小时未更新', detail: `约 ${Math.round(ageHours)} 小时未成功更新。` };
  }

  if (status === 'fetch-failed' || status === 'cached-fallback') {
    return {
      level: 'warning',
      label: status === 'cached-fallback' ? '正在显示上次缓存' : '本轮抓取失败',
      detail: '已保留最近一次通过质量检查的内容。'
    };
  }

  if (ageHours > 6) {
    return { level: 'warning', label: '新闻数据可能延迟', detail: `约 ${Math.round(ageHours)} 小时未成功更新。` };
  }

  if (ageHours > 2) {
    return { level: 'soft', label: '更新稍有延迟', detail: `约 ${Math.round(ageHours)} 小时前更新。` };
  }

  return { level: 'ok', label: status === 'partial-success' ? '部分内容待重试' : '更新正常', detail: '新闻数据仍然新鲜。' };
}

function getPrimaryTitle(item = {}) {
  return item.titleZh ||
    item.headlineZh ||
    item.oneLineZh ||
    item.displayTitle ||
    item.originalTitle ||
    item.title ||
    '无标题';
}

function getOriginalTitle(item = {}) {
  return item.originalTitle || item.title || '';
}

function isSameText(a = '', b = '') {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function isChineseSnippet(value = '') {
  const text = String(value).trim();
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latinChars = (text.match(/[A-Za-z]/g) || []).length;
  return chineseChars >= 6 && chineseChars >= latinChars * 0.35;
}

function isGenericChineseSnippet(value = '') {
  return /相关消息更新|相关动态|交易影响继续发酵|休赛期后续动向|签约动向更新|最新动态|后续影响/.test(String(value));
}

function hasUnsafeEnglishCopy(value = '') {
  return /\b(?:officially|his|her|their|signs?|signed|contract|with|from|after|before|expected|reportedly|latest|update)\b/i.test(String(value));
}

function isUsableChineseCopy(value = '') {
  return isChineseSnippet(value) &&
    !isGenericChineseSnippet(value) &&
    !hasUnsafeEnglishCopy(value);
}

function isLowInfoHighlight(text = '') {
  return /open thread|game thread|podcast|odds|championship odds|fantasy|trade grades|preview|discussion|survey|reacts|mailbag|questions/i.test(text);
}

function isUsableChineseHighlight(text = '') {
  const value = String(text || '').trim();
  return isUsableChineseCopy(value) &&
    !/相关消息更新|相关动态|后续动向|继续更新|值得关注|原文聚焦|更多背景/.test(value) &&
    !isLowInfoHighlight(value);
}

function compactHighlightText(text = '') {
  return String(text || '')
    .replace(/^据\s*(?:Yahoo Sports|RealGM|原文)\s*报道，?/, '')
    .split(/(?<=[。！？!?])\s*/)[0]
    .replace(/[。！？!?]+$/, '')
    .trim();
}

function getHighlightText(item = {}, highlight = {}) {
  const candidates = [
    item.oneLineZh,
    compactHighlightText(item.summaryZh),
    highlight.text,
    item.headlineZh
  ].map(compactHighlightText);
  return candidates.find(isUsableChineseHighlight) || '';
}

async function fetchWorkerNews() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(workerNewsUrl, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`Worker feed unavailable (${response.status})`);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.items)) throw new Error('Worker returned an invalid payload.');
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function readCachedWorkerNews() {
  try {
    const raw = localStorage.getItem(workerCacheKey);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    return payload && Array.isArray(payload.items) ? payload : null;
  } catch (error) {
    console.warn('Cached Worker payload is invalid', error);
    return null;
  }
}

function cacheWorkerNews(payload) {
  if (!Array.isArray(payload?.items) || payload.items.length === 0) return;
  try {
    localStorage.setItem(workerCacheKey, JSON.stringify(payload));
  } catch (error) {
    console.warn('Unable to cache the latest Worker payload', error);
  }
}

function applyWorkerPayload(payload, { cached = false } = {}) {
  state.items = Array.isArray(payload.items) ? payload.items : [];
  state.highlights = Array.isArray(payload.highlights) ? payload.highlights : [];
  state.updatedAt = payload.updatedAt || '';
  state.lastFetchStatus = {
    ...(payload.lastFetchStatus || {}),
    ...(cached ? { status: 'cached-fallback' } : {})
  };
  state.usingCachedData = cached;
}

function getHighlightItems() {
  const byId = new Map();
  const byLink = new Map();
  state.items.forEach((item) => {
    if (item.id) byId.set(item.id, item);
    if (item.link) byLink.set(item.link, item);
    if (item.url) byLink.set(item.url, item);
  });

  const fromFeed = state.highlights
    .map((highlight) => {
      const matched = byId.get(highlight.id) || byLink.get(highlight.link);
      return {
        ...highlight,
        matched,
        text: matched ? getHighlightText(matched, highlight) : highlight.text
      };
    });

  const fromItems = state.items
    .filter((item) => (item.importance || 1) >= 4)
    .filter((item) => ['交易', '签约', '伤病', '选秀', '流言', '重要流言'].includes(item.category) || item.sourceCount > 1)
    .map((item) => ({
      id: item.id,
      link: item.url || item.link,
      category: item.category,
      source: item.source,
      text: getHighlightText(item),
      matched: item
    }));

  const seen = new Set();
  return [...fromFeed, ...fromItems]
    .filter((item) => item.text && isUsableChineseHighlight(item.text) && !isLowInfoHighlight(`${item.text} ${item.matched?.originalTitle || ''}`))
    .filter((item) => {
      const key = item.matched?.eventKey || item.id || item.link || item.text;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.matched?.importance || 0) - (a.matched?.importance || 0))
    .slice(0, 3);
}

function getFilteredItems() {
  const query = state.query.trim().toLowerCase();

  return state.items.filter((item) => {
    const matchesCategory = state.category === '最新' || item.category === state.category;
    const haystack =
      `${getPrimaryTitle(item)} ${item.originalTitle} ${item.summaryZh} ${item.oneLineZh} ${item.category} ${item.source}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    return matchesCategory && matchesQuery;
  });
}

function renderStatusCard() {
  const updatedLabel = state.updatedAt
    ? formatDate(state.updatedAt, { year: 'numeric', second: '2-digit' })
    : 'Waiting for first update';
  const checkedLabel = state.lastFetchStatus?.checkedAt
    ? formatDate(state.lastFetchStatus.checkedAt, { year: 'numeric', second: '2-digit' })
    : '尚未检查';
  const fetchStatus = state.lastFetchStatus?.status || 'unknown';
  const freshness = getFreshnessState();

  return `
    <div class="status-card ${escapeHtml(freshness.level)}" aria-label="Feed status">
      <p class="status-line">
        <span>更新于 ${escapeHtml(updatedLabel)}</span>
        <span>${escapeHtml(freshness.label)}</span>
        <span>最近检查 ${escapeHtml(checkedLabel)}</span>
      </p>
      <p class="status-detail">${escapeHtml(fetchStatus)} · ${escapeHtml(freshness.detail)}</p>
    </div>
  `;
}

function renderResults() {
  const filteredItems = getFilteredItems();
  const visibleItems = filteredItems.slice(0, state.visibleCount);
  const count = document.querySelector('#newsCount');
  const list = document.querySelector('#newsList');
  const loadMore = document.querySelector('#loadMoreSlot');

  if (count) {
    count.textContent = state.loading ? '正在加载...' : `${filteredItems.length} 条新闻`;
  }

  if (list) {
    list.innerHTML = filteredItems.length
      ? visibleItems.map(renderCard).join('')
      : '<article class="empty-state"><h2>没有找到相关新闻</h2><p>换个关键词或分类试试。</p></article>';
  }

  if (loadMore) {
    const hasMore = filteredItems.length > state.visibleCount;
    loadMore.innerHTML = hasMore
      ? `<button class="load-more" type="button">加载更多</button>`
      : '';
    loadMore.querySelector('button')?.addEventListener('click', () => {
      state.visibleCount += 15;
      renderResults();
    });
  }
}

function updateCategoryTabs() {
  document.querySelectorAll('[data-category]').forEach((button) => {
    const active = button.dataset.category === state.category;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
}

function refreshDynamicSections() {
  const status = document.querySelector('#feedStatus');
  const notice = document.querySelector('#noticeSlot');
  const highlights = document.querySelector('#highlightsSlot');

  if (status) status.innerHTML = renderStatusCard();
  if (notice) notice.innerHTML = state.error ? `<p class="notice">${escapeHtml(state.error)}</p>` : '';
  if (highlights) highlights.innerHTML = renderHighlights();
  renderResults();
}

function bindControls() {
  const searchInput = document.querySelector('#searchInput');
  let isComposing = false;

  searchInput?.addEventListener('compositionstart', () => {
    isComposing = true;
  });

  searchInput?.addEventListener('compositionend', (event) => {
    isComposing = false;
    state.query = event.target.value;
    state.visibleCount = 15;
    renderResults();
  });

  searchInput?.addEventListener('input', (event) => {
    state.query = event.target.value;
    if (!isComposing) {
      state.visibleCount = 15;
      renderResults();
    }
  });

  document.querySelectorAll('[data-category]').forEach((button) => {
    button.addEventListener('click', () => {
      state.category = button.dataset.category;
      state.visibleCount = 15;
      updateCategoryTabs();
      renderResults();
    });
  });
}

function render() {
  app.innerHTML = `
    <main class="shell">
      <header class="site-header">
        <div>
          <p class="eyebrow">NBA 中文速览</p>
          <h1>NBA Quick News</h1>
          <p class="subtitle">3 分钟刷完 NBA 今日流言、签约与交易。</p>
        </div>
        <div id="feedStatus">${renderStatusCard()}</div>
      </header>

      <section class="controls" aria-label="News filters">
        <label class="search">
          <span>搜索</span>
          <input id="searchInput" type="search" value="${escapeHtml(state.query)}" placeholder="搜索球员、球队、交易、伤病..." autocomplete="off" />
        </label>
        <div class="category-tabs" role="tablist" aria-label="Categories">
          ${categories
            .map(
              (category) => `
                <button class="tab ${category === state.category ? 'active' : ''}" type="button" data-category="${category}" aria-selected="${category === state.category}">
                  ${category}
                </button>
              `
            )
            .join('')}
        </div>
      </section>

      <div id="noticeSlot">${state.error ? `<p class="notice">${escapeHtml(state.error)}</p>` : ''}</div>

      <div id="highlightsSlot">${renderHighlights()}</div>

      <section class="news-meta" aria-live="polite">
        <span id="newsCount">${state.loading ? '正在加载...' : `${getFilteredItems().length} 条新闻`}</span>
        <span>来源：RealGM · Cloudflare AI 编辑</span>
      </section>

      <section id="newsList" class="news-list" aria-label="NBA news stories"></section>
      <div id="loadMoreSlot" class="load-more-slot"></div>
    </main>
  `;

  bindControls();
  renderResults();
}

function renderHighlights() {
  const highlights = getHighlightItems();
  if (!highlights.length) return '';

  return `
    <section class="highlights" aria-label="今日速览">
      <div class="section-heading">
        <h2>今日速览</h2>
        <span>3 条重点</span>
      </div>
      <ol>
        ${highlights
          .map(
            (item, index) => `
              <li>
                <span class="highlight-index">${String(index + 1).padStart(2, '0')}</span>
                <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.text)}</a>
              </li>
            `
          )
          .join('')}
      </ol>
    </section>
  `;
}

function renderCard(item) {
  const displayTitle = getPrimaryTitle(item);
  const originalTitle = getOriginalTitle(item);
  const showOriginalTitle = originalTitle && !isSameText(originalTitle, displayTitle);
  const dekZh = item.dekZh || '';
  const summaryZh = isChineseSnippet(item.summaryZh)
    ? item.summaryZh
    : (isChineseSnippet(item.oneLineZh) && !isGenericChineseSnippet(item.oneLineZh) ? item.oneLineZh : '');
  const goldenQuoteZh = item.goldenQuoteZh || '';
  const source = item.source || 'Original source';
  const url = item.url || item.link;
  const publishedAt = item.publishedAt || item.pubDate;
  const relatedItems = Array.isArray(item.relatedItems) ? item.relatedItems : [];

  return `
    <article class="news-card ${item.imageUrl ? 'has-image' : ''}">
      ${
        item.imageUrl
          ? `<a class="thumb" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="Open original image source">
              <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(displayTitle)} 缩略图" loading="lazy" referrerpolicy="no-referrer" />
            </a>`
          : ''
      }
      <div class="card-body">
        <div class="card-topline">
          <time datetime="${escapeHtml(publishedAt || '')}">${escapeHtml(formatDate(publishedAt))}</time>
          <span>${escapeHtml(source)}</span>
        </div>
        <h2><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(displayTitle)}</a></h2>
        ${showOriginalTitle ? `<p class="original-title">${escapeHtml(originalTitle)}</p>` : ''}
        ${dekZh ? `<p class="dek">${escapeHtml(dekZh)}</p>` : ''}
        ${summaryZh ? `<p class="summary">${escapeHtml(summaryZh)}</p>` : ''}
        ${goldenQuoteZh ? `<blockquote class="golden-quote">${escapeHtml(goldenQuoteZh)}</blockquote>` : ''}
        <div class="card-tags">
          <span class="pill">${escapeHtml(item.category || '其他')}</span>
          ${item.isMerged ? '<span class="merged-note">多源报道</span>' : ''}
        </div>
        ${renderRelatedItems(relatedItems)}
        <div class="card-footer">
          <span>${relatedItems.length ? `相关报道 ${relatedItems.length} 条` : '原站链接'}</span>
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">查看原文</a>
        </div>
      </div>
    </article>
  `;
}

function renderRelatedItems(relatedItems) {
  if (!relatedItems.length) return '';

  return `
    <details class="related-items">
      <summary>相关报道 ${relatedItems.length} 条</summary>
      <ul>
        ${relatedItems
          .map(
            (item) => `
              <li>
                <a href="${escapeHtml(item.url || item.link || '#')}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || item.originalTitle || 'Related report')}</a>
                <span>${escapeHtml(item.source || 'Source')} · ${escapeHtml(formatDate(item.publishedAt || item.pubDate))}${item.angle ? ` · ${escapeHtml(item.angle)}` : ''}</span>
              </li>
            `
          )
          .join('')}
      </ul>
    </details>
  `;
}

async function loadNews() {
  try {
    const data = await fetchWorkerNews();
    const cached = readCachedWorkerNews();
    if (data.items.length === 0 && cached?.items?.length) {
      applyWorkerPayload(cached, { cached: true });
      state.error = 'Worker 暂时没有可展示的已验收内容，正在显示上一次成功缓存。';
    } else {
      applyWorkerPayload(data);
      cacheWorkerNews(data);
    }
  } catch (error) {
    const cached = readCachedWorkerNews();
    if (cached?.items?.length) {
      applyWorkerPayload(cached, { cached: true });
      state.error = 'Worker 暂时不可用，正在显示上一次成功缓存。';
    } else {
      state.error = '暂时无法读取新闻，且此浏览器还没有可用缓存。';
    }
    console.error('Unable to load the canonical Worker feed', error);
  } finally {
    state.loading = false;
    refreshDynamicSections();
  }
}

render();
loadNews();
