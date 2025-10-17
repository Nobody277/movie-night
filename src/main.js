import "./style.css";
import { startBackground, destroyBackground } from "./background.js";
import { fetchTMDBData, img } from "./api.js";
import { startRuntimeTags, getGenreName, setupRail, startMovieCards, disposeUI } from "./ui.js";
import { startHomePage } from "./home.js";
import { startMoviesPage } from "./movies.js";
import { startTVPage } from "./tv.js";

if (typeof document !== 'undefined') {
  const removeNoFouc = () => document.body && document.body.classList.remove('no-fouc');
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(removeNoFouc), { once: true });
  } else {
    requestAnimationFrame(removeNoFouc);
  }
}

function updateSiteIcons() {
  try {
    const faviconUrl = new URL('../movienight.svg', import.meta.url).href;

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

// Screen reader stuff for screen readers yk those people...
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

class PageTransition {
  constructor() {
    this.isTransitioning = false;
    this.start();
  }

  start() {
    this.createLoadingOverlay();
    this.wrapMainContent();
    this.bindNavigationEvents();
    this.handleHistoryNavigation();
  }

  createLoadingOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'page-loading-overlay';
    document.body.appendChild(overlay);
    this.overlay = overlay;
  }

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

  handleHistoryNavigation() {
    window.addEventListener('popstate', (e) => {
      const path = window.location.pathname;
      this.navigateTo(path, false);
    });
  }

  /**
   * Takes you to a magical new page with a fade transition.
   * @param {string} url 
   * @param {boolean} pushHistory 
   * @returns {Promise<void>}
   */
  async navigateTo(url, pushHistory = true) {
    if (this.isTransitioning) return;
    
    this.isTransitioning = true;
    
    try {
      this.container.classList.add('page-transitioning');
      this.overlay.classList.add('active');
      
      await this.wait(150);

      const prettyToFile = (u) => {
        if (!u) return 'index.html';
        if (u === '/' || u === '/home' || u === 'home' || u === 'index.html') return 'index.html';
        if (u === '/movies' || u === 'movies') return 'movies.html';
        if (u === '/tv' || u === 'tv') return 'tv.html';
        if (u === '/my-list' || u === 'my-list') return 'index.html'; // My List doesn't have its own page yet
        if (u.includes('.html')) return u;
        return u;
      };
      const fileToPretty = (u) => {
        if (u.includes('movies.html')) return '/movie-night/movies';
        if (u.includes('index.html')) return '/movie-night/';
        if (u.includes('tv.html')) return '/movie-night/tv';
        return u.startsWith('/') ? u : `/${u}`;
      };

      const targetUrl = prettyToFile(url);
      const response = await fetch(targetUrl);
      const html = await response.text();
      
      const parser = new DOMParser();
      const newDoc = parser.parseFromString(html, 'text/html');
      
      this.updatePageContent(newDoc);
      
      if (pushHistory) {
        let pretty = fileToPretty(targetUrl);
        try {
          const original = String(url || '');
          if (original === '/tv' || original.endsWith('/tv') || original === 'tv') {
            pretty = '/movie-night/tv';
          }
        } catch {}
        window.history.pushState(null, '', pretty);
      }
      
      await this.wait(150);
      
      this.overlay.classList.remove('active');
      this.container.classList.remove('page-transitioning');
      
      this.reinitializePageFeatures();
      
    } catch (error) {
      console.error('Page transition failed:', error);
      window.location.href = url;
    }
    
    this.isTransitioning = false;
  }

  /**
   * Updates page content...
   * @param {Document} newDoc - Parsed HTML document. If you give me raw html I will kill you.
   */
  updatePageContent(newDoc) {
    // Updating stuff so lets delete the old stuff and not make memory leaks Mhm.
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

  reinitializePageFeatures() {
    startSearchFunctionality();
    try {
      document.querySelectorAll('.search-results').forEach((el) => { el.classList.remove('open'); el.innerHTML = ''; });
    } catch {}
    startHomePage();
    const path = window.location.pathname;
    if (path.includes('/movies')) {
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
    }
    startMovieCards();
    document.querySelectorAll('.rail').forEach(setupRail);
    this.reinitializeP5Animation();
    updateSiteIcons();
    this.bindNavigationEvents();
  }

  reinitializeP5Animation() {
    if (window.p5) {
      try { destroyBackground(); } catch {}
      startBackground();
    }
  }

  wait(ms) { // Guess what this does. You get a cookie if you figure it out.
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const pageTransition = new PageTransition();
pageTransition.reinitializePageFeatures();

function startSearchFunctionality() {
  const searchToggle = document.querySelector('.search-toggle');
  const searchBox = document.querySelector('.search-box');
  const searchInput = document.querySelector('.search-input');
  const searchContainer = document.querySelector('.search-container');
  let resultsEl = null;
  let closeSearchResults = () => {};

  if (searchToggle && searchBox && searchInput) {
    // We are just gonna turn off auto complete cause its annoying.
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
      if (!q || q.trim().length < 2) { renderResults([]); return; }
      try {
        const data = await fetchTMDBData(`/search/multi?query=${encodeURIComponent(q)}&include_adult=false`);
        let results = Array.isArray(data?.results) ? data.results : [];
        results = results.filter(r => (r.media_type === 'movie' || r.media_type === 'tv') && !!r.poster_path);
        renderResults(results.slice(0, 5));
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
          const isTruncated = t.scrollHeight > t.clientHeight + 1;
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
      const dest = mediaType === 'tv' ? `/tv?selected=${mediaType}:${item.id}` : `/movies?selected=${mediaType}:${item.id}`;
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
      const genres = Array.isArray(r.genre_ids) ? r.genre_ids.slice(0, 2).map(id => getGenreName(id)).filter(Boolean).join(', ') : '';
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
      debounceTimer = setTimeout(() => doSearch(q), 250);
    });

    searchInput.setAttribute('role', 'combobox');
    searchInput.setAttribute('aria-controls', resultsEl.id);
    resultsEl.setAttribute('role', 'listbox');
    searchInput.addEventListener('keydown', (e) => {
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
      } else if (e.key === 'Enter') {
        if (activeIndex >= 0) {
          e.preventDefault();
          selectItem(activeIndex);
        }
      } else if (e.key === 'Escape') {
        closeSearchResults();
      }
    });
  }
}

if (window.p5) {
  pageTransition.reinitializeP5Animation();
}