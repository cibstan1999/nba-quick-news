import './style.css';

const categories = ['最新', '交易', '签约', '伤病', '选秀', '季后赛', '其他'];

const app = document.querySelector('#app');

const state = {
  items: [],
  highlights: [],
  updatedAt: '',
  lastFetchStatus: {},
  query: '',
  category: '最新',
  loading: true,
  error: ''
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

  if (ageHours > 6) {
    return { level: 'warning', label: '新闻数据可能延迟', detail: `约 ${Math.round(ageHours)} 小时未成功更新。` };
  }

  if (ageHours > 2) {
    return { level: 'soft', label: '更新稍有延迟', detail: `约 ${Math.round(ageHours)} 小时前更新。` };
  }

  return { level: 'ok', label: status === 'partial-success' ? '部分源更新成功' : '更新正常', detail: '新闻数据仍然新鲜。' };
}

function getFilteredItems() {
  const query = state.query.trim().toLowerCase();

  return state.items.filter((item) => {
    const matchesCategory = state.category === '最新' || item.category === state.category;
    const haystack =
      `${item.displayTitle} ${item.originalTitle} ${item.headlineZh} ${item.dekZh} ${item.summaryZh} ${item.oneLineZh} ${item.category}`.toLowerCase();
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
      <span>最近成功更新</span>
      <strong>${escapeHtml(updatedLabel)}</strong>
      <dl>
        <div><dt>最近检查</dt><dd>${escapeHtml(checkedLabel)}</dd></div>
        <div><dt>状态</dt><dd>${escapeHtml(fetchStatus)}</dd></div>
      </dl>
      <p>${escapeHtml(freshness.label)} · ${escapeHtml(freshness.detail)}</p>
    </div>
  `;
}

function renderResults() {
  const filteredItems = getFilteredItems();
  const count = document.querySelector('#newsCount');
  const list = document.querySelector('#newsList');

  if (count) {
    count.textContent = state.loading ? '正在加载...' : `${filteredItems.length} 条新闻`;
  }

  if (list) {
    list.innerHTML = filteredItems.length
      ? filteredItems.map(renderCard).join('')
      : '<article class="empty-state"><h2>没有找到相关新闻</h2><p>换个关键词或分类试试。</p></article>';
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
    renderResults();
  });

  searchInput?.addEventListener('input', (event) => {
    state.query = event.target.value;
    if (!isComposing) {
      renderResults();
    }
  });

  document.querySelectorAll('[data-category]').forEach((button) => {
    button.addEventListener('click', () => {
      state.category = button.dataset.category;
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
        <span>来源：RealGM / Yahoo Sports</span>
      </section>

      <section id="newsList" class="news-list" aria-label="NBA news stories"></section>
    </main>
  `;

  bindControls();
  renderResults();
}

function renderHighlights() {
  return `
    <section class="highlights" aria-label="今日速览">
      <div class="section-heading">
        <h2>今日速览</h2>
        <span>打开就知道重点</span>
      </div>
      ${
        state.highlights.length
          ? `<ul>
              ${state.highlights
                .map(
                  (item) => `
                    <li>
                      <span class="mini-pill">${escapeHtml(item.category || 'NBA')}</span>
                      <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.text)}</a>
                    </li>
                  `
                )
                .join('')}
            </ul>`
          : '<p class="empty-highlight">暂无今日重点</p>'
      }
    </section>
  `;
}

function renderCard(item) {
  const displayTitle = item.displayTitle || item.originalTitle || item.title || 'Untitled';
  const dekZh = item.dekZh || '';
  const summaryZh = item.summaryZh || item.summary || '暂无摘要。';
  const goldenQuoteZh = item.goldenQuoteZh || '';
  const originalTitle = item.originalTitle || item.title || '';
  const showOriginalTitle = originalTitle && originalTitle !== displayTitle;
  const source = item.source || 'Original source';
  const url = item.url || item.link;
  const publishedAt = item.publishedAt || item.pubDate;
  const relatedItems = Array.isArray(item.relatedItems) ? item.relatedItems : [];

  return `
    <article class="news-card ${item.imageUrl ? 'has-image' : ''}">
      ${
        item.imageUrl
          ? `<a class="thumb" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="Open original image source">
              <img src="${escapeHtml(item.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />
            </a>`
          : ''
      }
      <div class="card-body">
        <div class="card-topline">
          <time datetime="${escapeHtml(publishedAt || '')}">${escapeHtml(formatDate(publishedAt))}</time>
        </div>
        <h2><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(displayTitle)}</a></h2>
        ${dekZh ? `<p class="dek">${escapeHtml(dekZh)}</p>` : ''}
        <p class="summary">${escapeHtml(summaryZh)}</p>
        ${goldenQuoteZh ? `<blockquote class="golden-quote">${escapeHtml(goldenQuoteZh)}</blockquote>` : ''}
        <div class="card-tags">
          <span class="pill">${escapeHtml(item.category || '其他')}</span>
          ${item.isMerged ? '<span class="merged-note">多源报道</span>' : ''}
          ${item.importance ? `<span class="importance">重要度 ${escapeHtml(item.importance)}</span>` : ''}
        </div>
        ${
          showOriginalTitle
            ? `<details class="original-title">
                <summary>英文原题</summary>
                <p>${escapeHtml(originalTitle)}</p>
              </details>`
            : ''
        }
        ${renderRelatedItems(relatedItems)}
        <div class="card-footer">
          <span>${escapeHtml(source)} 原文${item.imageUrl ? ' / 图片预览来自原站元数据' : ''}</span>
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
    const response = await fetch(`${import.meta.env.BASE_URL}data/news.json`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Feed unavailable (${response.status})`);
    }

    const data = await response.json();
    state.items = Array.isArray(data.items) ? data.items : [];
    state.highlights = Array.isArray(data.highlights) ? data.highlights : [];
    state.updatedAt = data.updatedAt || '';
    state.lastFetchStatus = data.lastFetchStatus || {};
  } catch (error) {
    state.error = '无法读取本地新闻数据。请运行 npm run fetch 后重试。';
    console.error(error);
  } finally {
    state.loading = false;
    refreshDynamicSections();
  }
}

render();
loadNews();
