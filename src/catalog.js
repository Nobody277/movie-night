/**
 * This is a helper for movie and tv pages and any future ones that need it.
 */

import { startRuntimeTags, setupRail, getGenreName as getMovieGenreName, populateRail, startMovieCards } from "./ui.js";
import {getPopularMoviesLast7Days,getAllMovieGenres,discoverMovies,getTopGenres,getAllTVGenres,discoverTV,getTopTVGenres,getTrendingTV} from "./api.js";
import { formatDate, img } from "./api.js";

function defaultGetGenreName(id, media) {
  return getMovieGenreName(id) || '';
}

// Dropdowns for sorting and time. Needed for all pages.
function setupDropdowns() {
  const sortGroup = document.querySelector('.sort-group');
  const sortToggle = document.querySelector('.sort-toggle');
  const sortMenu = document.getElementById('sort-menu');
  if (sortGroup && sortToggle && sortMenu) {
    const sortLabel = sortToggle.querySelector('.sort-label');
    const sortArrow = sortToggle.querySelector('.sort-arrow');
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
    });
    document.addEventListener('click', (e) => { if (!timeGroup.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); timeToggle.focus(); } });
  }
}

// Controls for applying filters, clearing filters, and toggling genres.
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
    });
  }

  const applyBtn = document.querySelector('.apply-filters');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => { onApply(); applyBtn.blur(); });
  }
}

// Genres dropdown for all pages.
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
        const genreInputs = document.querySelectorAll('.genre-input');
        genreInputs.forEach(input => { input.addEventListener('change', updateGenreCounter); });
      }
    } catch {}
  })();

  // Recursively updates the genre counter.
  function updateGenreCounter() {
    const checkedGenres = document.querySelectorAll('.genre-input:checked');
    const count = checkedGenres.length;
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
  else if (timeValue === 'year') { const d = new Date(); d.setFullYear(d.getFullYear() - 1); startDate = formatDate(d); }
  else { startDate = null; endDate = null; }

  if (!startDate && !endDate && sortBy.startsWith('popularity')) {
    sortBy = 'vote_count.desc';
  }

  const checked = Array.from(document.querySelectorAll('.genre-input:checked'));
  const selectedGenreIds = checked.map((input) => Number(input.getAttribute('data-genre-id'))).filter((n) => Number.isFinite(n));
  return { sortBy, startDate, endDate, selectedGenreIds };
}

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

async function startFeaturedHero(config, filters) {
  const hero = document.querySelector('.featured-hero');
  if (!hero) return;
  try {
    hero.classList.add('loading');
    const strongSignals = filters.sortBy.startsWith('vote_average') ? { voteAverageGte: 6.5, voteCountGte: 100 } : { voteCountGte: 50 };
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
    } catch {}

    results = results.slice(0, 8);
    if (!results.length) { hero.style.display = 'none'; return; }
    hero.style.display = '';

    hero.innerHTML = `
      <div class="featured-hero-bg"></div>
      <div class="featured-hero-overlay"></div>
      <div class="featured-hero-content"></div>
    `;

    const bgEl = hero.querySelector('.featured-hero-bg');
    const contentEl = hero.querySelector('.featured-hero-content');

    const renderSlide = (item) => {
      const title = item.title || item.name || 'Featured';
      const mediaType = item.media_type || config.mediaType;
      const year = (item.release_date || item.first_air_date)
        ? new Date(item.release_date || item.first_air_date).getFullYear()
        : '';
      const rating = typeof item.vote_average === 'number' ? item.vote_average.toFixed(1) : null;
      const backdropUrl = item.backdrop_path
        ? img.backdrop(item.backdrop_path)
        : (item.poster_path ? img.poster(item.poster_path) : '');

      if (bgEl) { bgEl.classList.remove('slide-enter'); void bgEl.offsetWidth; bgEl.style.backgroundImage = backdropUrl ? `url('${backdropUrl}')` : ''; bgEl.classList.add('slide-enter'); }
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
            <button class=\"btn learn-more\" type=\"button\">Learn More</button>
          </div>`;
        contentEl.classList.add('slide-enter');
      }
      startRuntimeTags();
      hero.classList.add('ready');
    };

    try { if (hero.dataset.featureTimerId) { window.clearInterval(Number(hero.dataset.featureTimerId)); delete hero.dataset.featureTimerId; } } catch {}

    let index = 0;
    renderSlide(results[index]);
    const advance = () => { index = (index + 1) % results.length; renderSlide(results[index]); };
    let timer = window.setInterval(advance, 6000);
    hero.dataset.featureTimerId = String(timer);
    const pause = () => { if (timer) { window.clearInterval(timer); timer = null; } };
    const resume = () => { if (!timer) { timer = window.setInterval(advance, 6000); } };
    hero.addEventListener('mouseenter', pause);
    hero.addEventListener('mouseleave', resume);
    hero.addEventListener('focusin', pause);
    hero.addEventListener('focusout', resume);
  } catch (e) {
    console.error('Failed to start featured hero', e);
    hero.style.display = 'none';
  } finally {
    hero.classList.remove('loading');
  }
}

function findBaseGenres(config, filters) {
  return (async () => {
    let base = filters.selectedGenreIds.slice(0);
    if (!base.length) {
      let data = null;
      if (!filters.startDate && !filters.endDate) {
        data = await config.getTopGenres({ startDate: null, endDate: null, sortBy: 'vote_count.desc', pages: 2, limit: 12 });
      } else {
        data = await config.getTopGenres({ startDate: filters.startDate, endDate: filters.endDate, sortBy: 'popularity.desc', pages: 2, limit: 12 });
      }
      base = Array.isArray(data) ? data : [];
    }
    return base;
  })();
}

function buildFetcherFactory(config, filters, seenIds) {
  const strongSignals = filters.sortBy.startsWith('vote_average') ? { voteAverageGte: 6.5, voteCountGte: 100 } : { voteCountGte: 50 };
  const releaseDesc = config.mediaType === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc';
  return (gid) => async () => {
    const base = await config.discover({ sortBy: filters.sortBy, startDate: filters.startDate, endDate: filters.endDate, genreIds: [gid], page: 1, ...strongSignals });
    let list = Array.isArray(base?.results) ? base.results : [];
    if (list.length < 20) {
      const alt = await config.discover({ sortBy: releaseDesc, startDate: filters.startDate, endDate: filters.endDate, genreIds: [gid], page: 1 });
      const altList = Array.isArray(alt?.results) ? alt.results : [];
      const seenLocal = new Set(list.map(r => r?.id));
      list = list.concat(altList.filter(r => r && !seenLocal.has(r.id)));
    }
    
    if (list.length < 20) {
      const fallback = await config.discover({ sortBy: 'popularity.desc', genreIds: [gid], page: 1 });
      const fallbackList = Array.isArray(fallback?.results) ? fallback.results : [];
      const seenLocal = new Set(list.map(r => r?.id));
      list = list.concat(fallbackList.filter(r => r && !seenLocal.has(r.id)));
    }
    let filtered = list.filter(m => m && m.poster_path);
    filtered = filtered.filter((m) => Array.isArray(m?.genre_ids) && m.genre_ids.includes(gid));
    if (seenIds && seenIds.size) filtered = filtered.filter(m => !seenIds.has(m.id));
    
    if (filtered.length < 20) {
      for (let page = 2; page <= 3 && filtered.length < 20; page++) {
        const moreData = await config.discover({ sortBy: 'popularity.desc', genreIds: [gid], page });
        const moreList = Array.isArray(moreData?.results) ? moreData.results : [];
        const moreFiltered = moreList.filter(m => m && m.poster_path && Array.isArray(m?.genre_ids) && m.genre_ids.includes(gid));
        const seenLocal = new Set(filtered.map(r => r?.id));
        const newItems = moreFiltered.filter(r => r && !seenLocal.has(r.id));
        filtered = filtered.concat(newItems);
      }
    }
    
    const results = filtered.slice(0, 20);
    if (seenIds) results.forEach(m => { try { seenIds.add(m.id); } catch {} });
    return { results };
  };
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

  const initial = baseGenres.slice(0, 6);
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
    const batch = baseGenres.slice(nextIndex, nextIndex + 4);
    batch.forEach((gid) => {
      const title = (config.getGenreName || defaultGetGenreName)(gid, config.mediaType) || 'Genre';
      const section = createGenreRailSection(gid, title, makeFetcher(gid));
      railsContainer.insertBefore(section, sentinel);
    });
    nextIndex += batch.length;
  };
  const io = new IntersectionObserver((entries) => { if (entries.some(e => e.isIntersecting)) { loadMore(); } }, { threshold: 0, rootMargin: '1800px 0px' });
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
  setupDropdowns();
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
    await renderRails(config, Object.assign({}, filters));
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