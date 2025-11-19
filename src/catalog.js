/**
 * This is a helper for movie and tv pages and any future ones that need it.
 */

import { fetchTMDBData, img, getAllMovieGenres, getAllTVGenres, discoverMovies, discoverTV, getPopularMoviesLast7Days, getTopGenres, getTopTVGenres, getTrendingTV } from "./api.js";
import { fetchTrailerUrl, fetchTitleImages } from "./media-utils.js";
import { createMovieCard, createSkeletonCard, getGenreName as getMovieGenreName, populateRail, setupRail, startMovieCards, startRuntimeTags } from "./ui.js";
import { attachTrailerButtonHandlers, formatDate, isBackdropImage, selectPreferredImage } from "./utils.js";
import { checkIsAnime, getAnimeEmbedUrl } from "./anime-utils.js";

import { VIDEO_CACHE_TTL_MS, HERO_ROTATION_INTERVAL_MS, MAX_HERO_SLIDES, MAX_RAIL_ITEMS, VOTE_COUNT_MIN_BASIC, VOTE_COUNT_MIN_RATING_WINDOWED, VOTE_COUNT_MIN_RATING_ALLTIME, VOTE_COUNT_MIN_GRID, VOTE_AVERAGE_MIN, GENRE_DISCOVERY_PAGES, GENRE_DISCOVERY_LIMIT, MAX_DISCOVERY_PAGES, INITIAL_RAILS_COUNT, RAIL_BATCH_SIZE, GRID_LOAD_MORE_MARGIN, RAIL_LAZY_LOAD_MARGIN, GRID_CHUNK_SIZE } from "./constants.js";

// Helper Functions for Watch Now

/**
 * Attach Watch Now button handler
 * @param {HTMLElement} btn
 * @param {string} type
 * @param {Object} item
 */
function attachWatchNowHandler(btn, type, item) {
  if (!btn) return;
  
  btn.addEventListener('click', async () => {
    try {
      let embedUrl = '';
      const isAnimeTitle = await checkIsAnime(type, item.id, item);
      
      if (isAnimeTitle) {
        const tmdbId = item.id;
        embedUrl = getAnimeEmbedUrl(type, tmdbId, 1, 1, 'sub');
        openPlayerModal(embedUrl, true, tmdbId, 1, 1, type);
      } else {
        if (type === 'movie') {
          const tmdbId = item.id;
          embedUrl = `https://vidsrc.cc/v2/embed/movie/${tmdbId}?autoPlay=false`;
          openPlayerModal(embedUrl);
        } else if (type === 'tv') {
          try {
            const externalIds = await fetchTMDBData(`/tv/${item.id}/external_ids`);
            const imdbId = externalIds?.imdb_id;
            if (imdbId) {
              embedUrl = `https://vidsrc.cc/v2/embed/tv/${imdbId}?autoPlay=false`;
              openPlayerModal(embedUrl);
            } else {
              console.error('No IMDB ID found for TV show');
              return;
            }
          } catch (error) {
            console.error('Failed to fetch IMDB ID:', error);
            return;
          }
        }
      }
    } catch (error) {
      console.error('Failed to open player:', error);
    }
  });
}

/**
 * Open player modal with embed URL
 * @param {string} embedUrl
 * @param {boolean} [isAnime=false]
 * @param {number} [tmdbId]
 * @param {number} [season]
 * @param {number} [episode]
 * @param {string} [type]
 */
function openPlayerModal(embedUrl, isAnime = false, tmdbId = null, season = 1, episode = 1, type = 'tv') {
  const modal = document.createElement('div');
  modal.className = 'player-modal';
  
  let audioSelector = '';
  if (isAnime && tmdbId) {
    audioSelector = `
      <div class="player-audio-selector">
        <button class="audio-btn active" data-audio="sub">SUB</button>
        <button class="audio-btn" data-audio="dub">DUB</button>
      </div>
    `;
  }
  
  modal.innerHTML = `
    <div class="player-modal-overlay"></div>
    <button class="player-modal-close" aria-label="Close player">&times;</button>
    <div class="player-modal-content">
      ${audioSelector}
      <iframe 
        src="${embedUrl}" 
        frameborder="0" 
        allowfullscreen 
        sandbox="allow-same-origin allow-scripts allow-forms allow-presentation"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        class="player-iframe"
        referrerpolicy="no-referrer"
      ></iframe>
    </div>
  `;
  
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  
  const iframe = modal.querySelector('.player-iframe');
  iframe.addEventListener('load', () => {
    try {
      if (iframe.contentWindow) {
        const originalOpen = iframe.contentWindow.open;
        iframe.contentWindow.open = function() {
          return null;
        };
      }
    } catch (e) {
    }
  });
  
  if (isAnime && tmdbId) {
    const audioButtons = modal.querySelectorAll('.audio-btn');
    audioButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const audio = btn.dataset.audio;
        audioButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const newUrl = getAnimeEmbedUrl(type, tmdbId, season, episode, audio);
        iframe.src = newUrl;
      });
    });
  }
  
  const closeModal = () => {
    modal.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', handleEsc);
  };
  
  modal.querySelector('.player-modal-close').addEventListener('click', closeModal);
  
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  };
  document.addEventListener('keydown', handleEsc);
}

// Public Exports

/**
 * Initialize a catalog page according to a configuration.
 * @param {Object} config
 * @param {'movie'|'tv'} config.mediaType
 * @param {() => Promise<any|null>} config.fetchFeatured
 * @param {() => Promise<{id:number,name:string}[]|null>} config.fetchAllGenres
 * @param {(args:Object) => Promise<any|null>} config.discover
 * @param {(args:Object) => Promise<number[]|null>} config.getTopGenres
 * @param {(id:number, media:'movie'|'tv') => string} [config.getGenreName]
 */
export async function startCatalogPage(config) {
  setupDropdowns(config.mediaType);
  try {
    const sortMenu = document.getElementById('sort-menu');
    if (sortMenu) {
      sortMenu.setAttribute('role','menu');
      sortMenu.querySelectorAll('.sort-option').forEach(o => o.setAttribute('role','menuitemradio'));
    }
    const timeMenu = document.getElementById('time-menu');
    if (timeMenu) timeMenu.setAttribute('role','menu');
    const genresPanel = document.getElementById('genres-panel');
    const genresToggle = document.querySelector('.genres-toggle');
    if (genresPanel) genresPanel.setAttribute('role','dialog');
    if (genresToggle && genresPanel) genresToggle.setAttribute('aria-controls','genres-panel');
  } catch {}
  const refresh = async () => {
    const filters = resolveFilters();
    await startFeaturedHero(config, Object.assign({}, filters));
    const selectedCount = Array.isArray(filters.selectedGenreIds) ? filters.selectedGenreIds.length : 0;
    const useGrid = !!filters.mustContainAll || selectedCount <= 1;
    if (useGrid) {
      await renderGrid(config, Object.assign({}, filters));
    } else {
      await renderRails(config, Object.assign({}, filters));
    }
  };
  setupControls(() => { refresh(); });
  setupGenres(config);
  await refresh();
}

export function createMoviesConfig() {
  return {
    mediaType: 'movie',
    fetchFeatured: getPopularMoviesLast7Days,
    fetchAllGenres: getAllMovieGenres,
    discover: discoverMovies,
    getTopGenres: (args) => getTopGenres(args),
    getGenreName: (id) => defaultGetGenreName(id, 'movie')
  };
}

export function createTVConfig() {
  return {
    mediaType: 'tv',
    fetchFeatured: getTrendingTV,
    fetchAllGenres: getAllTVGenres,
    discover: discoverTV,
    getTopGenres: (args) => getTopTVGenres(args),
    getGenreName: (id) => defaultGetGenreName(id, 'tv')
  };
}

// UI Setup Functions (Private)

/**
 * Default genre name resolver
 * @param {number} id
 * @param {string} media
 * @returns {string}
 */
function defaultGetGenreName(id, media) {
  return getMovieGenreName(id) || '';
}

/**
 * Set up sort and time filter dropdowns
 * @param {string} mediaType
 */
function setupDropdowns(mediaType) {
  const sortGroup = document.querySelector('.sort-group');
  const sortToggle = document.querySelector('.sort-toggle');
  const sortMenu = document.getElementById('sort-menu');
  if (sortGroup && sortToggle && sortMenu) {
    const sortLabel = sortToggle.querySelector('.sort-label');
    const sortArrow = sortToggle.querySelector('.sort-arrow');
    const storageKey = `mn:filters:${mediaType || 'movie'}`;
    const readState = () => { try { const raw = sessionStorage.getItem(storageKey); return raw ? JSON.parse(raw) : {}; } catch { return {}; } };
    const writeState = (partial) => { try { const prev = readState(); sessionStorage.setItem(storageKey, JSON.stringify(Object.assign({}, prev, partial))); } catch {} };

    try {
      const state = readState();
      if (state && state.sortLabel) {
        if (sortLabel) sortLabel.textContent = state.sortLabel;
        const dir = state.sortDir || 'desc';
        if (sortArrow) { sortArrow.setAttribute('data-dir', dir); sortArrow.textContent = dir === 'asc' ? '↑' : '↓'; }
      }
    } catch {}
    const closeMenu = () => { sortMenu.classList.remove('open'); sortToggle.setAttribute('aria-expanded', 'false'); };
    const openMenu = () => { sortMenu.classList.add('open'); sortToggle.setAttribute('aria-expanded', 'true'); };
    sortToggle.addEventListener('click', () => { const willOpen = !sortMenu.classList.contains('open'); if (willOpen) openMenu(); else closeMenu(); });
    sortMenu.addEventListener('click', (e) => {
      const option = e.target.closest('.sort-option');
      if (!option) return;
      const label = option.getAttribute('data-label') || '';
      const dir = option.getAttribute('data-dir') || 'desc';
      if (sortLabel) sortLabel.textContent = label;
      if (sortArrow) { sortArrow.setAttribute('data-dir', dir); sortArrow.textContent = dir === 'asc' ? '↑' : '↓'; }
      writeState({ sortLabel: label, sortDir: dir });
      closeMenu();
    });
    document.addEventListener('click', (e) => { if (!sortGroup.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); sortToggle.focus(); } });
  }

  const timeGroup = document.querySelector('.time-group');
  const timeToggle = document.querySelector('.time-toggle');
  const timeMenu = document.getElementById('time-menu');
  if (timeGroup && timeToggle && timeMenu) {
    const timeLabel = timeToggle.querySelector('.time-label');
    const storageKey = `mn:filters:${mediaType || 'movie'}`;
    const readState = () => { try { const raw = sessionStorage.getItem(storageKey); return raw ? JSON.parse(raw) : {}; } catch { return {}; } };
    const writeState = (partial) => { try { const prev = readState(); sessionStorage.setItem(storageKey, JSON.stringify(Object.assign({}, prev, partial))); } catch {} };
    try {
      const state = readState();
      if (state && state.timeValue) {
        timeToggle.setAttribute('data-value', state.timeValue);
        const opt = timeMenu.querySelector(`.time-option[data-value="${state.timeValue}"]`);
        const lbl = opt ? (opt.getAttribute('data-label') || opt.textContent || '') : '';
        if (timeLabel && lbl) timeLabel.textContent = lbl;
      }
    } catch {}
    const closeMenu = () => { timeMenu.classList.remove('open'); timeToggle.setAttribute('aria-expanded', 'false'); };
    const openMenu = () => { timeMenu.classList.add('open'); timeToggle.setAttribute('aria-expanded', 'true'); };
    timeToggle.addEventListener('click', () => { const willOpen = !timeMenu.classList.contains('open'); if (willOpen) openMenu(); else closeMenu(); });
    timeMenu.addEventListener('click', (e) => {
      const option = e.target.closest('.time-option');
      if (!option) return;
      const label = option.getAttribute('data-label') || '';
      const value = option.getAttribute('data-value') || 'all';
      if (timeLabel) timeLabel.textContent = label;
      timeToggle.setAttribute('data-value', value);
      closeMenu();
      writeState({ timeValue: value });
    });
    document.addEventListener('click', (e) => { if (!timeGroup.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); timeToggle.focus(); } });
  }
}

/**
 * Set up filter control buttons
 * @param {Function} onApply
 */
function setupControls(onApply) {
  const clickableControls = document.querySelectorAll('.apply-filters, .clear-filters, .genres-toggle, .sort-toggle, .sort-option, .time-toggle, .time-option');
  clickableControls.forEach((el) => {
    el.addEventListener('mousedown', () => { el.addEventListener('mouseup', () => el.blur(), { once: true }); });
    el.addEventListener('click', () => { if (document.body.matches(':focus-within')) el.blur(); });
  });

  const clearFiltersBtn = document.querySelector('.clear-filters');
  const sortToggle = document.querySelector('.sort-toggle');
  const timeToggle = document.querySelector('.time-toggle');
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      document.querySelectorAll('.genre-input').forEach((input) => { input.checked = false; });
      const genresCounter = document.querySelector('.genres-counter');
      if (genresCounter) genresCounter.style.display = 'none';
      if (sortToggle) {
        const sortLabel = sortToggle.querySelector('.sort-label');
        const sortArrow = sortToggle.querySelector('.sort-arrow');
        if (sortLabel && sortArrow) { sortLabel.textContent = 'Popularity'; sortArrow.setAttribute('data-dir', 'desc'); sortArrow.textContent = '↓'; }
      }
      if (timeToggle) {
        const timeLabel = timeToggle.querySelector('.time-label');
        if (timeLabel) timeLabel.textContent = 'All time';
        timeToggle.setAttribute('data-value', 'all');
      }
      clearFiltersBtn.blur();
      onApply();
      try {
        const storageKey = `mn:filters:${(document.querySelector('main .page-title')?.textContent || '').toLowerCase().includes('tv') ? 'tv' : 'movie'}`;
        const next = { sortLabel: 'Popularity', sortDir: 'desc', timeValue: 'all', selectedGenreIds: [], mustContainAll: false };
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
    });
  }

  const applyBtn = document.querySelector('.apply-filters');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => { onApply(); applyBtn.blur(); });
  }
}

/**
 * Set up genre filter panel
 * @param {Object} config
 */
function setupGenres(config) {
  const genresToggle = document.querySelector('.genres-toggle');
  const genresPanel = document.getElementById('genres-panel');
  const genresCounter = document.querySelector('.genres-counter');
  if (!genresToggle || !genresPanel) return;

  (async () => {
    try {
      const all = await config.fetchAllGenres();
      const allGenres = Array.isArray(all) ? all : [];
      const list = genresPanel.querySelector('.genres-list');
      if (list) {
        list.innerHTML = '';
        const renderItem = (g) => {
          const li = document.createElement('li');
          const id = `g-${g.id}`;
          li.innerHTML = `<input class="genre-input" type="checkbox" id="${id}" data-genre-id="${g.id}"><label class="genre-label" for="${id}">${g.name}</label>`;
          return li;
        };
        allGenres.forEach(g => list.appendChild(renderItem(g)));
        const allLi = document.createElement('li');
        const allId = 'g-all-match';
        allLi.innerHTML = `<input class="genre-input" type="checkbox" id="${allId}" data-all-match="true"><label class="genre-label" for="${allId}">Must contain all genres</label>`;
        list.appendChild(allLi);
        const genreInputs = document.querySelectorAll('.genre-input');
        genreInputs.forEach(input => { input.addEventListener('change', updateGenreCounter); });
        try {
          const storageKey = `mn:filters:${config.mediaType || 'movie'}`;
          const raw = sessionStorage.getItem(storageKey);
          const state = raw ? JSON.parse(raw) : {};
          const selectedIds = Array.isArray(state?.selectedGenreIds) ? state.selectedGenreIds : [];
          const mustAll = !!state?.mustContainAll;
          document.querySelectorAll('.genre-input[data-genre-id]').forEach((input) => {
            const gid = Number(input.getAttribute('data-genre-id'));
            if (selectedIds.includes(gid)) input.checked = true;
          });
          const allMatchInput = document.querySelector('.genre-input[data-all-match="true"]');
          if (allMatchInput) allMatchInput.checked = mustAll;
          updateGenreCounter();
        } catch {}
        const persistGenres = () => {
          try {
            const storageKey = `mn:filters:${config.mediaType || 'movie'}`;
            const raw = sessionStorage.getItem(storageKey);
            const prev = raw ? JSON.parse(raw) : {};
            const checked = Array.from(document.querySelectorAll('.genre-input[data-genre-id]:checked'))
              .map((el) => Number(el.getAttribute('data-genre-id')))
              .filter((n) => Number.isFinite(n) && n > 0);
            const mustAll = !!document.querySelector('.genre-input[data-all-match="true"]:checked');
            const next = Object.assign({}, prev || {}, { selectedGenreIds: checked, mustContainAll: mustAll });
            sessionStorage.setItem(storageKey, JSON.stringify(next));
          } catch {}
        };
        document.querySelectorAll('.genre-input').forEach((input) => { input.addEventListener('change', persistGenres); });
      }
    } catch (error) {
      console.error('Failed to setup genres:', error);
    }
  })();

  /**
   * Update the genre counter badge
   */
  function updateGenreCounter() {
    const checkedGenres = document.querySelectorAll('.genre-input:checked');
    const count = Array.from(checkedGenres).filter((el) => !el.hasAttribute('data-all-match')).length;
    if (genresCounter) {
      if (count > 0) { genresCounter.textContent = ` (${count} selected)`; genresCounter.style.display = ''; }
      else { genresCounter.style.display = 'none'; }
    }
  }

  const genreInputs = document.querySelectorAll('.genre-input');
  genreInputs.forEach(input => { input.addEventListener('change', updateGenreCounter); });
  updateGenreCounter();

  genresToggle.addEventListener('click', () => {
    const willOpen = !genresPanel.classList.contains('open');
    genresPanel.classList.toggle('open', willOpen);
    genresToggle.setAttribute('aria-expanded', String(willOpen));
  });
  document.addEventListener('click', (e) => { if (!genresToggle.contains(e.target) && !genresPanel.contains(e.target)) { genresPanel.classList.remove('open'); genresToggle.setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { genresPanel.classList.remove('open'); genresToggle.setAttribute('aria-expanded', 'false'); genresToggle.focus(); } });
}

// Filter & Configuration Functions (Private)

/**
 * Resolve current filter state from UI
 * @returns {Object}
 */
function resolveFilters() {
  const sortToggle = document.querySelector('.sort-toggle');
  const sortArrow = sortToggle ? sortToggle.querySelector('.sort-arrow') : null;
  const sortDir = (sortArrow && sortArrow.getAttribute('data-dir')) || 'desc';
  const sortLabel = sortToggle ? (sortToggle.querySelector('.sort-label')?.textContent || 'Popularity') : 'Popularity';
  let sortBy = 'popularity.desc';
  const lower = sortLabel.toLowerCase();
  if (lower.includes('rating')) sortBy = `vote_average.${sortDir}`;
  else if (lower.includes('newest')) sortBy = `primary_release_date.${sortDir}`;
  else sortBy = `popularity.${sortDir}`;

  const timeToggle = document.querySelector('.time-toggle');
  const timeValue = (timeToggle && timeToggle.getAttribute('data-value')) || 'all';
  const today = new Date();
  let startDate = null;
  let endDate = formatDate(today);
  if (timeValue === 'week') { const d = new Date(); d.setDate(d.getDate() - 7); startDate = formatDate(d); }
  else if (timeValue === 'month') { const d = new Date(); d.setDate(d.getDate() - 30); startDate = formatDate(d); }
  else if (timeValue === '6months') { const d = new Date(); d.setMonth(d.getMonth() - 6); startDate = formatDate(d); }
  else if (timeValue === 'year') { const d = new Date(); d.setFullYear(d.getFullYear() - 1); startDate = formatDate(d); }
  else { startDate = null; endDate = null; }

  if (!startDate && !endDate && sortBy.startsWith('popularity')) {
    sortBy = `vote_count.${sortDir}`;
  }

  const checked = Array.from(document.querySelectorAll('.genre-input[data-genre-id]:checked'));
  const selectedGenreIds = checked
    .map((input) => Number(input.getAttribute('data-genre-id')))
    .filter((n) => Number.isFinite(n) && n > 0);
  const mustContainAll = !!document.querySelector('.genre-input[data-all-match="true"]:checked');
  return { sortBy, startDate, endDate, selectedGenreIds, mustContainAll };
}

/**
 * Create a genre-specific rail section
 * @param {number} genreId
 * @param {string} title
 * @param {Function} fetchFunction
 * @returns {HTMLElement}
 */
function createGenreRailSection(genreId, title, fetchFunction) {
  const section = document.createElement('section');
  section.className = 'rail';
  section.setAttribute('data-genre-id', String(genreId));
  section.innerHTML = `
    <div class="rail-head">
      <div class="rail-title">
        <h2 class="section-title">${title}</h2>
        <p class="section-subtitle">Top picks in ${title}</p>
      </div>
      <div class="rail-cta">
        <button class="rail-btn rail-prev" aria-label="Scroll left"><span class="rail-icon">‹</span></button>
        <button class="rail-btn rail-next" aria-label="Scroll right"><span class="rail-icon">›</span></button>
      </div>
    </div>
    <div class="rail-track" tabindex="0" aria-label="${title} carousel"></div>
  `;
  populateRail(section, fetchFunction);
  setupRail(section);
  return section;
}

// Hero & Featured Content Functions (Private)

/**
 * Start the featured hero carousel
 * @param {Object} config
 * @param {Object} filters
 * @returns {Promise<void>}
 */
async function startFeaturedHero(config, filters) {
  const hero = document.querySelector('.featured-hero');
  if (!hero) return;
  try {
    hero.classList.add('loading');
    const isRatingSort = filters.sortBy.startsWith('vote_average');
    const isAllTime = !filters.startDate && !filters.endDate;
    const voteCountMin = isRatingSort ? (isAllTime ? VOTE_COUNT_MIN_RATING_ALLTIME : VOTE_COUNT_MIN_RATING_WINDOWED) : VOTE_COUNT_MIN_BASIC;
    const strongSignals = isRatingSort ? { voteAverageGte: VOTE_AVERAGE_MIN, voteCountGte: voteCountMin } : { voteCountGte: voteCountMin };
    const normalizeSort = (s, media) => media === 'tv' ? s.replace('primary_release_date', 'first_air_date') : s;
    const sort = normalizeSort(filters.sortBy, config.mediaType);
    const releaseDesc = config.mediaType === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc';
    const [primary, relaxed, backup] = await Promise.all([
      config.discover({ sortBy: sort, startDate: filters.startDate, endDate: filters.endDate, genreIds: filters.selectedGenreIds, page: 1, ...strongSignals }),
      config.discover({ sortBy: releaseDesc, startDate: filters.startDate, endDate: filters.endDate, genreIds: filters.selectedGenreIds, page: 1 }),
      config.mediaType === 'tv' ? getTrendingTV() : getPopularMoviesLast7Days()
    ]);
    let results = Array.isArray(primary?.results) && primary.results.length ? primary.results
      : (Array.isArray(relaxed?.results) && relaxed.results.length ? relaxed.results
      : (Array.isArray(backup?.results) ? backup.results : []));
    results = results.filter(m => m && (m.backdrop_path || m.poster_path));

    try {
      const visibleIds = new Set(Array.from(document.querySelectorAll('.rail-track .movie-card'))
        .map(el => Number(el.getAttribute('data-id')))
        .filter(n => Number.isFinite(n)));
      if (visibleIds.size) {
        results = results.filter(r => !visibleIds.has(Number(r.id)));
      }
    } catch (error) {
      console.error('Failed to filter visible IDs:', error);
    }

    results = results.slice(0, MAX_HERO_SLIDES);
    if (!results.length) { hero.style.display = 'none'; return; }
    hero.style.display = '';

    hero.innerHTML = `
      <div class="featured-hero-bg"></div>
      <div class="featured-hero-overlay"></div>
      <div class="featured-hero-content"></div>
    `;

    const bgEl = hero.querySelector('.featured-hero-bg');
    const contentEl = hero.querySelector('.featured-hero-content');

    /**
     * Pick a random hero image for an item
     * @param {Object} item
     * @returns {Promise<string>}
     */
    const pickRandomHeroImage = async (item) => {
      try {
        const mediaType = item.media_type || config.mediaType;
        const images = await fetchTitleImages(mediaType, item.id);
        const filePath = selectPreferredImage(images, true);
        if (filePath) {
          // Determine if it's a backdrop or poster based on aspect ratio heuristic
          const isBackdrop = isBackdropImage(filePath, images);
          return isBackdrop ? img.backdrop(filePath) : img.poster(filePath);
        }
      } catch (error) {
        console.error('Failed to pick random hero image for item', item.id, error);
      }
      return item.backdrop_path ? img.backdrop(item.backdrop_path) : (item.poster_path ? img.poster(item.poster_path) : '');
    };

    /**
     * Render a hero slide
     * @param {Object} item
     * @returns {Promise<void>}
     */
    const renderSlide = async (item) => {
      const title = item.title || item.name || 'Featured';
      const mediaType = item.media_type || config.mediaType;
      const year = (item.release_date || item.first_air_date)
        ? new Date(item.release_date || item.first_air_date).getFullYear()
        : '';
      const rating = typeof item.vote_average === 'number' ? item.vote_average.toFixed(1) : null;
      const backdropUrl = await pickRandomHeroImage(item);

      if (bgEl) {
        const nextId = String(((Number(hero.dataset.bgToken) || 0) + 1));
        hero.dataset.bgToken = nextId;
        const url = backdropUrl || '';
        if (!url) return;
        const pre = new Image();
        try { pre.decoding = 'async'; } catch {}
        pre.onload = () => {
          if (hero.dataset.bgToken !== nextId) return;
          bgEl.classList.remove('slide-enter');
          void bgEl.offsetWidth;
          bgEl.style.backgroundImage = `url('${url}')`;
          bgEl.classList.add('slide-enter');
          bgEl.classList.add('visible');
        };
        pre.src = url;
      }
      if (contentEl) {
        contentEl.classList.remove('slide-enter'); void contentEl.offsetWidth;
        contentEl.innerHTML = `
          <h3 class="featured-title">${title}</h3>
          <div class="featured-meta">
            ${rating ? `<span class=\"meta-tag rating\">★ ${rating}</span>` : ''}
            ${year ? `<span class=\"meta-tag year\">${year}</span>` : ''}
            <span class=\"meta-tag type\">${mediaType === 'tv' ? 'Show' : 'Movie'}</span>
            <span class=\"meta-tag runtime\"><span class=\"meta-runtime\" data-id=\"${item.id}\" data-type=\"${mediaType}\">--</span></span>
          </div>
          <div class=\"featured-cta\">
            <button class=\"btn watch-now\" type=\"button\">Watch Now</button>
            <button class=\"btn watch-trailer\" type=\"button\">Watch Trailer</button>
          </div>`;
        contentEl.classList.add('slide-enter');
        
        // Attach Watch Now handler
        const watchNowBtn = contentEl.querySelector('.watch-now');
        if (watchNowBtn) {
          attachWatchNowHandler(watchNowBtn, mediaType, item);
        }
        
        const trailerBtn = contentEl.querySelector('.watch-trailer');
        if (trailerBtn) {
          const trailerUrl = await fetchTrailerUrl(mediaType, item.id);
          if (trailerUrl) {
            attachTrailerButtonHandlers(trailerBtn, trailerUrl);
          } else {
            trailerBtn.setAttribute('disabled', 'true');
          }
        }
      }
      startRuntimeTags();
      hero.classList.add('ready');
    };

    try { if (hero.dataset.featureTimerId) { window.clearInterval(Number(hero.dataset.featureTimerId)); delete hero.dataset.featureTimerId; } } catch {}

    let index = 0;
    await renderSlide(results[index]);
    const advance = () => { index = (index + 1) % results.length; renderSlide(results[index]); };
    let timer = window.setInterval(advance, HERO_ROTATION_INTERVAL_MS);
    hero.dataset.featureTimerId = String(timer);
    const pause = () => { if (timer) { window.clearInterval(timer); timer = null; } };
    const resume = () => { if (!timer) { timer = window.setInterval(advance, HERO_ROTATION_INTERVAL_MS); } };
    hero.addEventListener('mouseenter', pause);
    hero.addEventListener('mouseleave', resume);
    hero.addEventListener('focusin', pause);
    hero.addEventListener('focusout', resume);
  } catch (e) {
    console.error('Failed to start featured hero for', config.mediaType, e);
    hero.style.display = 'none';
  } finally {
    hero.classList.remove('loading');
  }
}

// Data Fetching Functions (Private)

/**
 * Find base genres for rail generation
 * @param {Object} config
 * @param {Object} filters
 * @returns {Promise<number[]>}
 */
function findBaseGenres(config, filters) {
  return (async () => {
    let base = filters.selectedGenreIds.slice(0);
    if (!base.length) {
      let data = null;
      if (!filters.startDate && !filters.endDate) {
        data = await config.getTopGenres({ startDate: null, endDate: null, sortBy: 'vote_count.desc', pages: GENRE_DISCOVERY_PAGES, limit: GENRE_DISCOVERY_LIMIT });
      } else {
        data = await config.getTopGenres({ startDate: filters.startDate, endDate: filters.endDate, sortBy: 'popularity.desc', pages: GENRE_DISCOVERY_PAGES, limit: GENRE_DISCOVERY_LIMIT });
      }
      base = Array.isArray(data) ? data : [];
    }
    return base;
  })();
}

/**
 * Build a factory function for genre-specific fetchers
 * @param {Object} config
 * @param {Object} filters
 * @param {Set} seenIds
 * @returns {Function}
 */
function buildFetcherFactory(config, filters, seenIds) {
  const isRatingSort = filters.sortBy.startsWith('vote_average');
  const isAllTime = !filters.startDate && !filters.endDate;
  const voteCountMin = isRatingSort ? (isAllTime ? VOTE_COUNT_MIN_RATING_ALLTIME : VOTE_COUNT_MIN_RATING_WINDOWED) : VOTE_COUNT_MIN_BASIC;
  const strongSignals = isRatingSort ? { voteAverageGte: VOTE_AVERAGE_MIN, voteCountGte: voteCountMin } : { voteCountGte: voteCountMin };
  const releaseDesc = config.mediaType === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc';
  return (gid) => async () => {
    const base = await config.discover({ sortBy: filters.sortBy, startDate: filters.startDate, endDate: filters.endDate, genreIds: [gid], page: 1, ...strongSignals });
    let list = Array.isArray(base?.results) ? base.results : [];
    if (list.length < MAX_RAIL_ITEMS) {
      const alt = await config.discover({ sortBy: releaseDesc, startDate: filters.startDate, endDate: filters.endDate, genreIds: [gid], page: 1 });
      const altList = Array.isArray(alt?.results) ? alt.results : [];
      const seenLocal = new Set(list.map(r => r?.id));
      list = list.concat(altList.filter(r => r && !seenLocal.has(r.id)));
    }
    
    if (list.length < MAX_RAIL_ITEMS) {
      const fallback = await config.discover({ sortBy: 'popularity.desc', genreIds: [gid], page: 1 });
      const fallbackList = Array.isArray(fallback?.results) ? fallback.results : [];
      const seenLocal = new Set(list.map(r => r?.id));
      list = list.concat(fallbackList.filter(r => r && !seenLocal.has(r.id)));
    }
    let filtered = list.filter(m => m && m.poster_path);
    filtered = filtered.filter((m) => Array.isArray(m?.genre_ids) && m.genre_ids.includes(gid));
    if (seenIds && seenIds.size) filtered = filtered.filter(m => !seenIds.has(m.id));
    
    if (filtered.length < MAX_RAIL_ITEMS) {
      for (let page = 2; page <= MAX_DISCOVERY_PAGES && filtered.length < MAX_RAIL_ITEMS; page++) {
        const moreData = await config.discover({ sortBy: 'popularity.desc', genreIds: [gid], page });
        const moreList = Array.isArray(moreData?.results) ? moreData.results : [];
        const moreFiltered = moreList.filter(m => m && m.poster_path && Array.isArray(m?.genre_ids) && m.genre_ids.includes(gid));
        const seenLocal = new Set(filtered.map(r => r?.id));
        const newItems = moreFiltered.filter(r => r && !seenLocal.has(r.id));
        filtered = filtered.concat(newItems);
      }
    }
    
    const results = filtered.slice(0, MAX_RAIL_ITEMS);
    if (seenIds) results.forEach(m => { try { seenIds.add(m.id); } catch {} });
    return { results };
  };
}

// Rendering Functions (Private)

/**
 * Render infinite-scroll grid view
 * @param {Object} config
 * @param {Object} filters
 * @returns {Promise<void>}
 */
async function renderGrid(config, filters) {
  const container = document.querySelector('.genre-rails');
  if (!container) return;
  container.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'movie-grid';
  container.appendChild(grid);

  const spinnerWrap = document.createElement('div');
  spinnerWrap.className = 'infinite-spinner';
  spinnerWrap.innerHTML = '<div class="spinner" aria-hidden="true"></div>';
  container.appendChild(spinnerWrap);

  const addSkeletons = (count) => {
    for (let i = 0; i < count; i++) grid.appendChild(createSkeletonCard());
  };
  const clearSkeletons = () => {
    grid.querySelectorAll('.skeleton').forEach((el) => el.remove());
  };

  addSkeletons(6);

  const normalizeSort = (s, media) => media === 'tv' ? s.replace('primary_release_date', 'first_air_date') : s;
  const sortBy = normalizeSort(filters.sortBy, config.mediaType);
  const isAllMatch = !!filters.mustContainAll && Array.isArray(filters.selectedGenreIds) && filters.selectedGenreIds.length >= 1;
  const clientFilterAll = isAllMatch && Array.isArray(filters.selectedGenreIds) && filters.selectedGenreIds.length >= 2;
  const isRatingSort = filters.sortBy.startsWith('vote_average');
  const isAllTime = !filters.startDate && !filters.endDate;
  const voteCountMin = isRatingSort ? (isAllTime ? VOTE_COUNT_MIN_RATING_ALLTIME : VOTE_COUNT_MIN_RATING_WINDOWED) : VOTE_COUNT_MIN_BASIC;
  const strongSignals = isRatingSort ? { voteAverageGte: VOTE_AVERAGE_MIN, voteCountGte: voteCountMin } : { voteCountGte: voteCountMin };
  const genreIds = isAllMatch
    ? filters.selectedGenreIds
    : (Array.isArray(filters.selectedGenreIds) && filters.selectedGenreIds.length === 1 ? [filters.selectedGenreIds[0]] : []);

  let page = 1;
  let hasMore = true;
  let totalPages = Infinity;
  let loading = false;
  /** @type {(p:number)=>Record<string,any>} */
  let activeArgsBuilder = (p) => primaryArgs(p);
  const seen = new Set();

  const fetchPage = async (args) => {
    const discoverArgs = Object.assign({}, args, {
      genreMatchAll: clientFilterAll,
      genreIdsOr: isAllMatch ? [] : (Array.isArray(filters.selectedGenreIds) && filters.selectedGenreIds.length >= 2 ? filters.selectedGenreIds : [])
    });
    const data = await config.discover(discoverArgs);
    const arr = Array.isArray(data?.results) ? data.results : [];
    let items = arr.filter((m) => m && m.poster_path);
    if (clientFilterAll) {
      const needed = new Set(filters.selectedGenreIds);
      items = items.filter((m) => Array.isArray(m?.genre_ids) && [...needed].every((gid) => m.genre_ids.includes(gid)));
    }
    const tp = Number.isFinite(data?.total_pages) ? Number(data.total_pages) : undefined;
    return { items, totalPages: tp };
  };

  const appendCards = (list) => {
    list.forEach((movie) => {
      if (movie && !seen.has(movie.id)) {
        seen.add(movie.id);
        const card = createMovieCard(movie);
        grid.appendChild(card);
      }
    });
  };

  const appendInChunks = async (items, chunkSize = GRID_CHUNK_SIZE) => {
    for (let i = 0; i < items.length; i += chunkSize) {
      const slice = items.slice(i, i + chunkSize);
      appendCards(slice);
      startMovieCards();
      startRuntimeTags();
      await new Promise((r) => requestAnimationFrame(r));
    }
  };

  let prefetched = null;
  let prefetchInFlight = null;
  const prefetchNext = async () => {
    if (prefetchInFlight || !hasMore) return;
    const args = activeArgsBuilder(page);
    prefetchInFlight = fetchPage(args)
      .then((res) => { prefetched = res; })
      .catch(() => { /* ignore */ })
      .finally(() => { prefetchInFlight = null; });
  };

  const primaryArgs = (p) => ({ sortBy, startDate: filters.startDate, endDate: filters.endDate, genreIds, page: p, ...strongSignals });
  const popularityWindowArgs = (p) => ({ sortBy: 'popularity.desc', startDate: filters.startDate, endDate: filters.endDate, genreIds, page: p, voteCountGte: isAllMatch ? undefined : VOTE_COUNT_MIN_GRID });
  const voteCountAllTimeArgs = (p) => ({ sortBy: 'vote_count.desc', genreIds, page: p, voteCountGte: VOTE_COUNT_MIN_BASIC });
  const popularityAllTimeArgs = (p) => ({ sortBy: 'popularity.desc', genreIds, page: p });

  const loadNextPage = async () => {
    if (!hasMore || loading) return;
    loading = true;
    try { spinnerWrap.style.display = ''; } catch {}
    try {
      if (page === 1) {
        const { items, totalPages: tp } = await fetchPage(primaryArgs(1));
        if (items.length > 0) {
          if (tp) totalPages = tp;
          clearSkeletons();
          await appendInChunks(items);
          activeArgsBuilder = (p) => primaryArgs(p);
          page = 2;
          await prefetchNext();
        } else {
          const popRes = await fetchPage(popularityWindowArgs(1));
          if (popRes.items.length > 0) {
            if (popRes.totalPages) totalPages = popRes.totalPages;
            clearSkeletons();
            await appendInChunks(popRes.items);
            activeArgsBuilder = (p) => popularityWindowArgs(p);
            page = 2;
            await prefetchNext();
          } else {
            const vcRes = await fetchPage(voteCountAllTimeArgs(1));
            if (vcRes.items.length > 0) {
              if (vcRes.totalPages) totalPages = vcRes.totalPages;
              clearSkeletons();
              await appendInChunks(vcRes.items);
              activeArgsBuilder = (p) => voteCountAllTimeArgs(p);
              page = 2;
              await prefetchNext();
            } else {
              const popAll = await fetchPage(popularityAllTimeArgs(1));
              if (popAll.items.length > 0) {
                clearSkeletons();
                await appendInChunks(popAll.items);
                activeArgsBuilder = (p) => popularityAllTimeArgs(p);
                page = 2;
                totalPages = popAll.totalPages ?? totalPages;
                await prefetchNext();
              } else {
              hasMore = false;
              clearSkeletons();
                // Empty state messaging
                const empty = document.createElement('div');
                empty.style.padding = '16px 0';
                empty.style.color = 'var(--muted)';
                empty.textContent = 'No results match all selected genres. Try removing a genre or unchecking "Must contain all genres".';
                container.insertBefore(empty, spinnerWrap);
              }
            }
          }
        }
      } else {
        let data;
        if (prefetched && Array.isArray(prefetched.items)) {
          data = prefetched;
          prefetched = null;
        } else {
          data = await fetchPage(activeArgsBuilder(page));
        }
        const { items } = data;
        if (items.length === 0) {
          hasMore = false;
        } else {
          await appendInChunks(items);
          page += 1;
          await prefetchNext();
        }
      }
      if (Number.isFinite(totalPages)) {
        hasMore = page <= totalPages;
      }
    } catch (e) {
      console.error('Failed to load grid page', page, 'for', config.mediaType, e);
      hasMore = false;
      clearSkeletons();
    } finally {
      loading = false;
      try { spinnerWrap.style.display = hasMore ? '' : 'none'; } catch {}
    }
  };

  await loadNextPage();

  const sentinel = document.createElement('div');
  sentinel.style.height = '1px';
  sentinel.style.width = '100%';
  container.appendChild(sentinel);
  const io = new IntersectionObserver(async (entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      await loadNextPage();
      if (!hasMore) io.disconnect();
    }
  }, { rootMargin: GRID_LOAD_MORE_MARGIN });
  io.observe(sentinel);
}

async function renderRails(config, filters) {
  const railsContainer = document.querySelector('.genre-rails');
  if (!railsContainer) return;
  railsContainer.innerHTML = '';

  const normalizeSort = (s, media) => media === 'tv' ? s.replace('primary_release_date', 'first_air_date') : s;
  const normalizedSort = normalizeSort(filters.sortBy, config.mediaType);
  const seenIds = new Set();

  const baseGenres = await findBaseGenres(config, filters);
  const makeFetcherFactory = buildFetcherFactory(config, Object.assign({}, filters, { sortBy: normalizedSort }), seenIds);
  const makeFetcher = (gid) => makeFetcherFactory(gid);

  const initial = baseGenres.slice(0, INITIAL_RAILS_COUNT);
  initial.forEach((gid) => {
    const title = (config.getGenreName || defaultGetGenreName)(gid, config.mediaType) || 'Genre';
    const section = createGenreRailSection(gid, title, makeFetcher(gid));
    railsContainer.appendChild(section);
  });

  let nextIndex = initial.length;
  const sentinel = document.createElement('div');
  sentinel.style.height = '0px';
  sentinel.style.margin = '0';
  sentinel.style.padding = '0';
  railsContainer.appendChild(sentinel);
  const loadMore = () => {
    if (nextIndex >= baseGenres.length) return;
    const batch = baseGenres.slice(nextIndex, nextIndex + RAIL_BATCH_SIZE);
    batch.forEach((gid) => {
      const title = (config.getGenreName || defaultGetGenreName)(gid, config.mediaType) || 'Genre';
      const section = createGenreRailSection(gid, title, makeFetcher(gid));
      railsContainer.insertBefore(section, sentinel);
    });
    nextIndex += batch.length;
  };
  const io = new IntersectionObserver((entries) => { if (entries.some(e => e.isIntersecting)) { loadMore(); } }, { threshold: 0, rootMargin: RAIL_LAZY_LOAD_MARGIN });
  io.observe(sentinel);

  const mo = new MutationObserver(() => {
    if (!railsContainer.isConnected) {
      try { io.disconnect(); } catch {}
      try { mo.disconnect(); } catch {}
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  startMovieCards();
  startRuntimeTags();
}