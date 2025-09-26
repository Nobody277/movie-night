import "./style.css";
import { initBackground, destroyBackground } from "./background.js";
import { fetchTMDBData, TMDB_IMAGE_BASE_URL } from "./api.js";
import { initializeRuntimeTags, getGenreName, setupRail, initializeMovieCards } from "./ui.js";
import { initializeHomePage } from "./home.js";
import { initializeGenresToggle, initializeSortDropdown, initializeTimeDropdown, initializeControlButtons } from "./movies.js";

// Remove initial no-FOUC class as soon as possible
if (typeof document !== 'undefined') {
  const removeNoFouc = () => document.body && document.body.classList.remove('no-fouc');
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(removeNoFouc), { once: true });
  } else {
    requestAnimationFrame(removeNoFouc);
  }
}

/**
 * Handles SPA-like page transitions and reinitialization of interactive features.
 */
class PageTransition {
  constructor() {
    this.isTransitioning = false;
    this.init();
  }

  init() {
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
    
    // Move all body content except scripts and overlay to container
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
    // Find all navigation links
    const navLinks = document.querySelectorAll('a[href]');
    
    navLinks.forEach(link => {
      // Only handle internal navigation links
      const href = link.getAttribute('href');
      if (href && (href.startsWith('/') || href.includes('.html')) && 
          !href.startsWith('http') && !href.startsWith('#')) {
        
        link.addEventListener('click', (e) => {
          e.preventDefault();
          this.navigateTo(href);
        });
      }
    });
  }

  handleHistoryNavigation() {
    window.addEventListener('popstate', (e) => {
      const path = window.location.pathname;
      this.navigateTo(path, false);
    });
  }

  /**
   * Navigate to a new URL with a fade transition and DOM swap.
   * @param {string} url - Target path or HTML file.
   * @param {boolean} [pushHistory=true] - Whether to push a new history state.
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
        if (u === '/' || u === '/home') return 'index.html';
        if (u === '/movies') return 'movies.html';
        if (u.includes('.html')) return u;
        return u;
      };
      const fileToPretty = (u) => {
        if (u.includes('movies.html')) return '/movies';
        if (u.includes('index.html')) return '/home';
        return u.startsWith('/') ? u : `/${u}`;
      };

      const targetUrl = prettyToFile(url);
      const response = await fetch(targetUrl);
      const html = await response.text();
      
      const parser = new DOMParser();
      const newDoc = parser.parseFromString(html, 'text/html');
      
      this.updatePageContent(newDoc);
      
      if (pushHistory) {
        const pretty = fileToPretty(targetUrl);
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
   * Replace current page content and meta tags with those from the provided document.
   * @param {Document} newDoc - Parsed HTML document.
   */
  updatePageContent(newDoc) {
    // Update title
    document.title = newDoc.title;
    
    // Update meta tags
    const currentMetas = document.querySelectorAll('meta[name], meta[property]');
    const newMetas = newDoc.querySelectorAll('meta[name], meta[property]');
    
    currentMetas.forEach(meta => meta.remove());
    newMetas.forEach(meta => document.head.appendChild(meta.cloneNode(true)));
    
    // Update main content
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
    
    // Replace current container
    this.container.replaceWith(newContainer);
    this.container = newContainer;
  }

  reinitializePageFeatures() {
    initializeSearchFunctionality();
    initializeGenresToggle();
    initializeSortDropdown();
    initializeTimeDropdown();
    initializeControlButtons();
    initializeMovieCards();
    document.querySelectorAll('.rail').forEach(setupRail);
    
    initializeHomePage();
    
    this.reinitializeP5Animation();
    
    this.bindNavigationEvents();
  }

  /** Recreate the background p5 canvas if available on the page. */
  reinitializeP5Animation() {
    if (window.p5) {
      try { destroyBackground(); } catch {}
      initBackground();
    }
  }

  /**
   * Wait for the specified number of milliseconds.
   * @param {number} ms - Milliseconds to wait.
   * @returns {Promise<void>}
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const pageTransition = new PageTransition();
pageTransition.reinitializePageFeatures();

function initializeSearchFunctionality() {
  const searchToggle = document.querySelector('.search-toggle');
  const searchBox = document.querySelector('.search-box');
  const searchInput = document.querySelector('.search-input');
  const searchContainer = document.querySelector('.search-container');
  let resultsEl = null;
  let closeSearchResults = () => {};

  if (searchToggle && searchBox && searchInput) {
    // Reduce browser autocomplete interference
    try {
      searchInput.setAttribute('autocomplete', 'off');
      searchInput.setAttribute('spellcheck', 'false');
      searchInput.setAttribute('autocapitalize', 'off');
      searchInput.setAttribute('autocorrect', 'off');
      searchInput.setAttribute('inputmode', 'search');
      searchInput.setAttribute('aria-autocomplete', 'list');
      // Unique name each load helps Chrome avoid surfacing saved suggestions
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
      // reset after handling click
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

  // Autocomplete wiring
  if (searchBox && searchInput) {
    resultsEl = document.createElement('div');
    resultsEl.className = 'search-results';
    searchBox.appendChild(resultsEl);

    let debounceTimer = null;
    let activeIndex = -1;
    let items = [];

    const doSearch = async (q) => {
      if (!q || q.trim().length < 2) { renderResults([]); return; }
      try {
        const data = await fetchTMDBData(`/search/multi?query=${encodeURIComponent(q)}&include_adult=false`);
        let results = Array.isArray(data?.results) ? data.results : [];
        // Keep movies and tv shows only
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
      // attach events and lazy runtime
      Array.from(resultsEl.querySelectorAll('.search-item')).forEach((el, idx) => {
        el.addEventListener('mouseenter', () => setActive(idx));
        el.addEventListener('mouseleave', () => setActive(-1));
        el.addEventListener('click', () => selectItem(idx));
      });
      initializeRuntimeTags();
      // Only show tooltips for truncated titles
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
      Array.from(resultsEl.querySelectorAll('.search-item')).forEach((el, i) => {
        el.classList.toggle('active', i === idx);
      });
    };

    const selectItem = (idx) => {
      const item = items[idx];
      if (!item) return;
      // Navigate to movies page for now; could deep link later
      closeSearchResults();
      searchBox.classList.remove('active');
      searchToggle.setAttribute('aria-expanded', 'false');
      const pageLink = document.querySelector('a[href="movies"]');
      if (pageLink) pageLink.click();
    };

    closeSearchResults = () => {
      resultsEl.classList.remove('open');
      resultsEl.innerHTML = '';
      items = [];
      activeIndex = -1;
    };

    const buildResultHTML = (r) => {
      const mediaType = r.media_type;
      const poster = r.poster_path ? `${TMDB_IMAGE_BASE_URL}${r.poster_path}` : '';
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

    searchInput.addEventListener('keydown', (e) => {
      if (!resultsEl.classList.contains('open')) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(Math.min(items.length - 1, activeIndex + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(Math.max(-1, activeIndex - 1));
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