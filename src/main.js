import "./style.css";
import { fetchTMDBData, img } from "./api.js";
import { startBackground, destroyBackground } from "./background.js";
import { startHomePage } from "./home.js";
import { startMoviesPage } from "./movies.js";
import { startTVPage } from "./tv.js";
import { startRuntimeTags, getGenreName, setupRail, startMovieCards, disposeUI, createMovieCard } from "./ui.js";
import { sleep, prettyUrlToFile, fileUrlToPretty } from "./utils.js";

import { PAGE_TRANSITION_DURATION_MS, SEARCH_DEBOUNCE_MS, MAX_SEARCH_RESULTS, CARD_WIDTH_PX, DEFAULT_CONTAINER_WIDTH_PX, MIN_SKELETON_COUNT, MAX_SKELETON_COUNT_SEARCH, MIN_SEARCH_QUERY_LENGTH, TRUNCATION_THRESHOLD_PX, SEARCH_RESULT_GENRE_LIMIT } from "./constants.js";

if (typeof document !== 'undefined') {
  const removeNoFouc = () => document.body && document.body.classList.remove('no-fouc');
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(removeNoFouc), { once: true });
  } else {
    requestAnimationFrame(removeNoFouc);
  }
}

// Utility Functions

/**
 * Updates site icons (favicon, OG image, etc.)
 */
function updateSiteIcons() {
  try {
    const faviconUrl = './movienight.svg';

    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'icon');
      document.head.appendChild(link);
    }
    link.setAttribute('type', 'image/svg+xml');
    link.setAttribute('href', faviconUrl);

    const og = document.querySelector('meta[property="og:image"]');
    if (og) og.setAttribute('content', faviconUrl);
    const tw = document.querySelector('meta[name="twitter:image"]');
    if (tw) tw.setAttribute('content', faviconUrl);
  } catch {}
}

/**
 * Announces a message to screen readers via live region
 * @param {string} message
 */
function announce(message) {
  try {
    let region = document.getElementById('sr-live-region');
    if (!region) {
      region = document.createElement('div');
      region.id = 'sr-live-region';
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('aria-atomic', 'true');
      region.className = 'sr-only';
      document.body.appendChild(region);
    }
    region.textContent = String(message || '');
  } catch {}
}

// PageTransition Class

/**
 * Handles smooth page transitions without full page reloads
 */
class PageTransition {
  /**
   * Initialize the page transition system
   */
  constructor() {
    this.isTransitioning = false;
    this.start();
  }

  /**
   * Set up the transition system
   */
  start() {
    this.createLoadingOverlay();
    this.wrapMainContent();
    this.bindNavigationEvents();
    this.handleHistoryNavigation();
  }

  /**
   * Create the loading overlay element
   */
  createLoadingOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'page-loading-overlay';
    document.body.appendChild(overlay);
    this.overlay = overlay;
  }

  /**
   * Wrap page content in a transition container
   */
  wrapMainContent() {
    const body = document.body;
    const container = document.createElement('div');
    container.className = 'page-container';
    
    const children = Array.from(body.children);
    children.forEach(child => {
      if (!child.classList.contains('page-loading-overlay') && 
          child.tagName !== 'SCRIPT') {
        container.appendChild(child);
      }
    });
    
    body.insertBefore(container, body.firstChild);
    this.container = container;
  }

  /**
   * Bind click handlers for internal navigation
   */
  bindNavigationEvents() {
    if (this._navBound) return;
    this._navBound = true;
    document.body.addEventListener('click', (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href) return;
      
      const isExternal = href.startsWith('http://') || href.startsWith('https://');
      if (!isExternal) {
        e.preventDefault();
        if (this.isTransitioning) return;
        this.navigateTo(href);
      }
    }, { capture: true });
  }

  /**
   * Handle browser back/forward navigation
   */
  handleHistoryNavigation() {
    window.addEventListener('popstate', (e) => {
      const path = window.location.pathname;
      this.navigateTo(path, false);
    });
  }

  /**
   * Fetch page content from URL
   * @param {string} url
   * @returns {Promise<{doc: Document, fileUrl: string}>}
   */
  async fetchPageContent(url) {
    const targetUrl = prettyUrlToFile(url);
    const response = await fetch(targetUrl);
    const html = await response.text();
    const parser = new DOMParser();
    return { doc: parser.parseFromString(html, 'text/html'), fileUrl: targetUrl };
  }

  /**
   * Resolve the pretty URL to push to history
   * @param {string} url - Original URL
   * @param {string} targetUrl - File URL
   * @returns {string}
   */
  resolveHistoryUrl(url, targetUrl) {
    let pretty = fileUrlToPretty(targetUrl);
    try {
      const original = String(url || '');
      if (original === '/' || original === '/home') {
        pretty = '/movie-night';
      } else if (original === '/movies') {
        pretty = '/movie-night/movies';
      } else if (original === '/tv' || original.endsWith('/tv') || original === 'tv') {
        pretty = '/movie-night/tv';
      } else if (original.startsWith('/movies/movie:') || original.startsWith('movies/movie:') || original.startsWith('/movie-night/movies/movie:')) {
        const prefixed = original.startsWith('/movie-night') ? original.slice('/movie-night'.length) : (original.startsWith('/') ? original : `/${original}`);
        pretty = `/movie-night${prefixed}`;
      } else if (original.startsWith('/tv/tv:') || original.startsWith('tv/tv:') || original.startsWith('/movie-night/tv/tv:')) {
        const prefixed = original.startsWith('/movie-night') ? original.slice('/movie-night'.length) : (original.startsWith('/') ? original : `/${original}`);
        pretty = `/movie-night${prefixed}`;
      } else if (original === '/search' || original.endsWith('/search') || original === 'search' || original.startsWith('/search?')) {
        pretty = original.startsWith('/search?') ? `/movie-night${original}` : '/movie-night/search';
      } else if (original === '/my-list' || original.endsWith('/my-list') || original === 'my-list') {
        pretty = '/movie-night/my-list';
      }
    } catch {}
    return pretty;
  }

  /**
   * Perform transition sequence with callback
   * @param {Function} callback
   * @returns {Promise<void>}
   */
  async performTransitionSequence(callback) {
    this.container.classList.add('page-transitioning');
    this.overlay.classList.add('active');
    await this.wait(PAGE_TRANSITION_DURATION_MS);
    
    await callback();
    
    await this.wait(PAGE_TRANSITION_DURATION_MS);
    this.overlay.classList.remove('active');
    this.container.classList.remove('page-transitioning');
  }

  /**
   * Navigate to a new page with transition
   * @param {string} url 
   * @param {boolean} pushHistory 
   * @returns {Promise<void>}
   */
  async navigateTo(url, pushHistory = true) {
    if (this.isTransitioning) return;
    
    this.isTransitioning = true;
    
    try {
      await this.performTransitionSequence(async () => {
        const { doc: newDoc, fileUrl: targetUrl } = await this.fetchPageContent(url);
        
        this.updatePageContent(newDoc);
        
        if (pushHistory) {
          const pretty = this.resolveHistoryUrl(url, targetUrl);
          window.history.pushState(null, '', pretty);
        }
        
        this.reinitializePageFeatures();
      });
    } catch (error) {
      console.error('Page transition failed for URL:', url, error);
      window.location.href = url;
    } finally {
      this.isTransitioning = false;
    }
  }

  /**
   * Updates page content with new document
   * @param {Document} newDoc - Parsed HTML document
   */
  updatePageContent(newDoc) {
    try { disposeUI(); } catch {}
    document.title = newDoc.title;
    
    const currentMetas = document.querySelectorAll('meta[name], meta[property]');
    const newMetas = newDoc.querySelectorAll('meta[name], meta[property]');
    const preserve = new Set(['viewport','theme-color']);
    currentMetas.forEach(meta => {
      const name = meta.getAttribute('name');
      if (name && preserve.has(name)) return;
      meta.remove();
    });
    newMetas.forEach(meta => {
      const name = meta.getAttribute('name');
      if (name && preserve.has(name)) return;
      document.head.appendChild(meta.cloneNode(true));
    });

    try {
      const providerGroup = document.getElementById('provider-meta-group');
      if (providerGroup) providerGroup.remove();
      const group = document.createElement('div');
      group.id = 'provider-meta-group';
      document.head.appendChild(group);
    } catch {}
    
    const newContainer = document.createElement('div');
    newContainer.className = 'page-container';
    
    const newBody = newDoc.body;
    const children = Array.from(newBody.children);
    children.forEach(child => {
      if (!child.classList.contains('page-loading-overlay') && 
          child.tagName !== 'SCRIPT') {
        newContainer.appendChild(child.cloneNode(true));
      }
    });
    
    this.container.replaceWith(newContainer);
    this.container = newContainer;
    try {
      const main = this.container.querySelector('main') || this.container;
      main.setAttribute('tabindex','-1');
      main.focus();
      announce(`Page loaded: ${document.title}`);
    } catch {}
  }

  /**
   * Reinitialize page-specific features after transition
   */
  reinitializePageFeatures() {
    startSearchFunctionality();
    try {
      document.querySelectorAll('.search-results').forEach((el) => { el.classList.remove('open'); el.innerHTML = ''; });
    } catch {}
    startHomePage();
    const path = window.location.pathname;
    if (path.includes('/movies/movie:') || path.includes('/tv/tv:')) {
      import('./details.js').then(m => m.startDetailsPage && m.startDetailsPage());
    } else if (path.includes('/movies')) {
      startMoviesPage();
    } else if (path.includes('/tv')) {
      startTVPage();
      try {
        document.title = 'Movie Night - TV Shows';
        const setMeta = (selector, attr, value) => {
          const el = document.querySelector(selector);
          if (el) el.setAttribute(attr, value);
        };
        setMeta('meta[name="description"]', 'content', 'Browse TV shows on Movie Night.');
        setMeta('meta[property="og:title"]', 'content', 'Movie Night - TV Shows');
        setMeta('meta[property="og:description"]', 'content', 'Browse TV shows on Movie Night.');
        setMeta('meta[name="twitter:title"]', 'content', 'Movie Night - TV Shows');
        setMeta('meta[name="twitter:description"]', 'content', 'Browse TV shows on Movie Night.');
        const h = document.querySelector('.page-title');
        if (h) h.textContent = 'TV Shows';
        const placeholder = document.querySelector('#search-input');
        if (placeholder && placeholder instanceof HTMLInputElement) {
          placeholder.placeholder = 'Search TV shows, movies...';
        }
      } catch {}
    } else if (path.includes('/my-list')) {
      import('./my-list.js').then(m => m.startMyListPage && m.startMyListPage());
    } else if (path.includes('/search')) {
      startSearchPage();
    }
    startMovieCards();
    document.querySelectorAll('.rail').forEach(setupRail);
    this.reinitializeP5Animation();
    updateSiteIcons();
    this.bindNavigationEvents();
  }

  /**
   * Restart the p5.js background animation
   */
  reinitializeP5Animation() {
    if (window.p5) {
      try { destroyBackground(); } catch {}
      startBackground();
    }
  }

  /**
   * Wait for a specified duration
   * @param {number} ms
   * @returns {Promise<void>}
   */
  wait(ms) {
    return sleep(ms);
  }
}

// Page Initialization

const pageTransition = new PageTransition();
try { window.pageTransition = pageTransition; } catch {}

(function handleInitialPrettyRoute() {
  try {
    let path = window.location.pathname || '';
    if (path.startsWith('/movie-night')) path = path.slice('/movie-night'.length) || '/';
    if (path.startsWith('//')) path = path.slice(1);
    if (!path.startsWith('/')) path = '/' + path;
    const shouldPretty = path === '/' || path === '/home' || path === '/index.html' || path === '/movies' || path === '/tv' || path === '/my-list' || path.startsWith('/movies/movie:') || path.startsWith('/tv/tv:') || path.startsWith('/search');
    if (shouldPretty) {
      const pretty = `/movie-night${path}`;
      try { window.history.replaceState(null, '', pretty); } catch {}
      if (path.startsWith('/movies/movie:') || path.startsWith('/tv/tv:')) {
        pageTransition.navigateTo(pretty, false);
        return;
      }
    }
  } catch {}
  pageTransition.reinitializePageFeatures();
})();

/**
 * Initialize search box functionality
 */
function startSearchFunctionality() {
  const searchToggle = document.querySelector('.search-toggle');
  const searchBox = document.querySelector('.search-box');
  const searchInput = document.querySelector('.search-input');
  const searchContainer = document.querySelector('.search-container');
  let resultsEl = null;
  let closeSearchResults = () => {};

  if (searchToggle && searchBox && searchInput) {
    try {
      searchInput.setAttribute('autocomplete', 'off');
      searchInput.setAttribute('spellcheck', 'false');
      searchInput.setAttribute('autocapitalize', 'off');
      searchInput.setAttribute('autocorrect', 'off');
      searchInput.setAttribute('inputmode', 'search');
      searchInput.setAttribute('aria-autocomplete', 'list');
      searchInput.setAttribute('name', `site-search-${Date.now()}`);
    } catch {}
    let pointerDownInsideSearch = false;
    document.addEventListener('pointerdown', (e) => {
      pointerDownInsideSearch = !!(searchContainer && searchContainer.contains(e.target));
    });

    searchToggle.addEventListener('click', () => {
      const willOpen = !searchBox.classList.contains('active');
      searchBox.classList.toggle('active');
      searchToggle.setAttribute('aria-expanded', String(willOpen));
      if (willOpen) searchInput.focus();
    });

    document.addEventListener('click', (e) => {
      const clickedOutside = !searchToggle.contains(e.target) && !searchBox.contains(e.target);
      if (clickedOutside && !pointerDownInsideSearch) {
        searchBox.classList.remove('active');
        searchToggle.setAttribute('aria-expanded', 'false');
        closeSearchResults();
      }
      pointerDownInsideSearch = false;
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchBox.classList.contains('active')) {
        searchBox.classList.remove('active');
        searchToggle.setAttribute('aria-expanded', 'false');
        searchToggle.focus();
      }
    });
  }

  if (searchBox && searchInput) {
    resultsEl = document.createElement('div');
    resultsEl.className = 'search-results';
    resultsEl.id = 'search-results';
    searchBox.appendChild(resultsEl);

    let debounceTimer = null;
    let activeIndex = -1;
    let items = [];

    const doSearch = async (q) => {
      if (!q || q.trim().length < MIN_SEARCH_QUERY_LENGTH) { renderResults([]); return; }
      try {
        const data = await fetchTMDBData(`/search/multi?query=${encodeURIComponent(q)}&include_adult=false`);
        let results = Array.isArray(data?.results) ? data.results : [];
        results = results.filter(r => (r.media_type === 'movie' || r.media_type === 'tv') && !!r.poster_path);
        renderResults(results.slice(0, MAX_SEARCH_RESULTS));
      } catch (e) {
        renderResults([]);
      }
    };

    const renderResults = (list) => {
      items = list;
      activeIndex = -1;
      if (!list.length) { closeSearchResults(); return; }
      resultsEl.innerHTML = list.map(buildResultHTML).join('');
      resultsEl.classList.add('open');
      Array.from(resultsEl.querySelectorAll('.search-item')).forEach((el, idx) => {
        el.id = `search-option-${idx}`;
        el.setAttribute('aria-selected', 'false');
        el.addEventListener('mouseenter', () => setActive(idx));
        el.addEventListener('mouseleave', () => setActive(-1));
        el.addEventListener('click', () => selectItem(idx));
      });
      startRuntimeTags();
      requestAnimationFrame(() => {
        const titles = resultsEl.querySelectorAll('.search-title');
        titles.forEach((t) => {
          t.removeAttribute('title');
          const isTruncated = t.scrollHeight > t.clientHeight + TRUNCATION_THRESHOLD_PX;
          if (isTruncated) t.setAttribute('title', t.textContent || '');
        });
      });
    };

    const setActive = (idx) => {
      activeIndex = idx;
      const els = Array.from(resultsEl.querySelectorAll('.search-item'));
      els.forEach((el, i) => {
        const isActive = i === idx;
        el.classList.toggle('active', isActive);
        el.setAttribute('aria-selected', String(isActive));
      });
      const activeEl = els[Math.max(0, idx)];
      if (activeEl) searchInput.setAttribute('aria-activedescendant', activeEl.id || '');
    };

    const selectItem = (idx) => {
      const item = items[idx];
      if (!item) return;
      closeSearchResults();
      searchBox.classList.remove('active');
      searchToggle.setAttribute('aria-expanded', 'false');
      const mediaType = item.media_type === 'tv' ? 'tv' : 'movie';
      const dest = mediaType === 'tv' ? `/tv/tv:${item.id}` : `/movies/movie:${item.id}`;
      pageTransition.navigateTo(dest);
    };

    closeSearchResults = () => {
      resultsEl.classList.remove('open');
      resultsEl.innerHTML = '';
      items = [];
      activeIndex = -1;
    };

    const buildResultHTML = (r) => {
      const mediaType = r.media_type;
      const poster = r.poster_path ? img.poster(r.poster_path) : '';
      const title = r.title || r.name || '';
      const year = (r.release_date || r.first_air_date) ? new Date(r.release_date || r.first_air_date).getFullYear() : '';
      const rating = typeof r.vote_average === 'number' ? r.vote_average.toFixed(1) : null;
      const genres = Array.isArray(r.genre_ids) ? r.genre_ids.slice(0, SEARCH_RESULT_GENRE_LIMIT).map(id => getGenreName(id)).filter(Boolean).join(', ') : '';
      return `
        <div class="search-item" role="option">
          <img class="search-thumb" src="${poster}" alt="" loading="lazy" />
          <div>
            <p class="search-title" title="${title}">${title}</p>
            <div class="search-meta">
              ${rating ? `<span class=\"search-rating\">★ ${rating}</span>` : ''}
              <span class="meta-tag type">${mediaType === 'tv' ? 'Show' : 'Movie'}</span>
              <span class="meta-tag runtime"><span class="meta-runtime" data-id="${r.id}" data-type="${mediaType}">--</span></span>
              ${year ? `<span class=\"meta-tag year\">${year}</span>` : ''}
            </div>
            ${genres ? `<div class=\"search-genres\">${genres}</div>` : ''}
          </div>
        </div>
      `;
    };

    searchInput.addEventListener('input', () => {
      const q = searchInput.value;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => doSearch(q), SEARCH_DEBOUNCE_MS);
    });

    searchInput.setAttribute('role', 'combobox');
    searchInput.setAttribute('aria-controls', resultsEl.id);
    resultsEl.setAttribute('role', 'listbox');
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (resultsEl.classList.contains('open') && activeIndex >= 0) {
          e.preventDefault();
          selectItem(activeIndex);
        } else {
          const query = searchInput.value.trim();
          if (query) {
            e.preventDefault();
            searchBox.classList.remove('active');
            searchToggle.setAttribute('aria-expanded', 'false');
            pageTransition.navigateTo(`/search?q=${encodeURIComponent(query)}`);
          }
        }
        return;
      }
      if (!resultsEl.classList.contains('open')) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(Math.min(items.length - 1, activeIndex + 1));
        const el = resultsEl.querySelectorAll('.search-item')[Math.max(0, activeIndex)];
        if (el) searchInput.setAttribute('aria-activedescendant', el.id || '');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(Math.max(-1, activeIndex - 1));
        const el = resultsEl.querySelectorAll('.search-item')[Math.max(0, activeIndex)];
        if (el) searchInput.setAttribute('aria-activedescendant', el.id || '');
      } else if (e.key === 'Escape') {
        closeSearchResults();
      }
    });
  }
}

if (window.p5) {
  pageTransition.reinitializeP5Animation();
}

/**
 * Initialize the search results page
 */
function startSearchPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const query = urlParams.get('q');
  if (query) performSearch(query);
}

/**
 * Perform search and render results
 * @param {string} query
 * @returns {Promise<void>}
 */
async function performSearch(query) {
  const grid = document.getElementById('search-results-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const skeletonCount = Math.min(MAX_SKELETON_COUNT_SEARCH, Math.max(MIN_SKELETON_COUNT, Math.floor((grid.clientWidth || DEFAULT_CONTAINER_WIDTH_PX) / CARD_WIDTH_PX)));
  for (let i = 0; i < skeletonCount; i++) {
    const skel = document.createElement('article');
    skel.className = 'movie-card skeleton';
    skel.innerHTML = '<div class="poster-skeleton shimmer"></div><div class="movie-info"><div class="line-skeleton short shimmer"></div><div class="line-skeleton long shimmer"></div></div><div class="movie-overlay"></div>';
    grid.appendChild(skel);
  }
  try {
    const data = await fetchTMDBData(`/search/multi?query=${encodeURIComponent(query)}&include_adult=false`);
    let results = Array.isArray(data?.results) ? data.results : [];
    results = results.filter(r => (r.media_type === 'movie' || r.media_type === 'tv') && !!r.poster_path);
    grid.innerHTML = '';
    if (results.length === 0) {
      grid.innerHTML = '<div class="no-results">No results found.</div>';
      return;
    }
    results.forEach(movie => {
      const card = createMovieCard(movie);
      grid.appendChild(card);
    });
    startMovieCards();
    startRuntimeTags();
  } catch (error) {
    console.error('Search failed for query:', query, error);
    grid.innerHTML = '<div class="error">Search failed. Please try again.</div>';
  }
}