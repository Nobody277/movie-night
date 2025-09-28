/**
 * Movies page controls: genres, sort, time range, and control focus handling.
 *
 * @module movies
 */

import { getTrendingMovies, TMDB_BACKDROP_BASE_URL, TMDB_IMAGE_BASE_URL, discoverMovies, getTopGenresLast30Days, getTopGenres, getPopularMoviesLast7Days, getAllMovieGenres } from "./api.js";
import { initializeRuntimeTags, populateRail, setupRail, getGenreName } from "./ui.js";

/**
 * Initialize genres panel toggle, selection state, and counter.
 */
export function initializeGenresToggle() {
  const genresToggle = document.querySelector('.genres-toggle');
  const genresPanel = document.getElementById('genres-panel');
  const genresCounter = document.querySelector('.genres-counter');
  if (genresToggle && genresPanel) {
    (async () => {
      try {
        const all = await getAllMovieGenres();
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
    function updateGenreCounter() {
      const checkedGenres = document.querySelectorAll('.genre-input:checked');
      const count = checkedGenres.length;
      if (genresCounter) {
        if (count > 0) {
          genresCounter.textContent = ` (${count} selected)`;
          genresCounter.style.display = '';
        } else {
          genresCounter.style.display = 'none';
        }
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

    document.addEventListener('click', (e) => {
      if (!genresToggle.contains(e.target) && !genresPanel.contains(e.target)) {
        genresPanel.classList.remove('open');
        genresToggle.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        genresPanel.classList.remove('open');
        genresToggle.setAttribute('aria-expanded', 'false');
        genresToggle.focus();
      }
    });
  }
}

/**
 * Initialize sort dropdown interactions.
 */
export function initializeSortDropdown() {
  const sortGroup = document.querySelector('.sort-group');
  const sortToggle = document.querySelector('.sort-toggle');
  const sortMenu = document.getElementById('sort-menu');
  if (sortGroup && sortToggle && sortMenu) {
    const sortLabel = sortToggle.querySelector('.sort-label');
    const sortArrow = sortToggle.querySelector('.sort-arrow');

    const closeMenu = () => {
      sortMenu.classList.remove('open');
      sortToggle.setAttribute('aria-expanded', 'false');
    };
    const openMenu = () => {
      sortMenu.classList.add('open');
      sortToggle.setAttribute('aria-expanded', 'true');
    };

    sortToggle.addEventListener('click', () => {
      const willOpen = !sortMenu.classList.contains('open');
      if (willOpen) openMenu(); else closeMenu();
    });

    sortMenu.addEventListener('click', (e) => {
      const option = e.target.closest('.sort-option');
      if (!option) return;
      const label = option.getAttribute('data-label') || '';
      const dir = option.getAttribute('data-dir') || 'desc';
      if (sortLabel) sortLabel.textContent = label;
      if (sortArrow) {
        sortArrow.setAttribute('data-dir', dir);
        sortArrow.textContent = dir === 'asc' ? '↑' : '↓';
      }
      closeMenu();
    });

    document.addEventListener('click', (e) => { if (!sortGroup.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); sortToggle.focus(); } });
  }
}

/**
 * Initialize time period dropdown interactions.
 */
export function initializeTimeDropdown() {
  const timeGroup = document.querySelector('.time-group');
  const timeToggle = document.querySelector('.time-toggle');
  const timeMenu = document.getElementById('time-menu');
  if (timeGroup && timeToggle && timeMenu) {
    const timeLabel = timeToggle.querySelector('.time-label');

    const closeMenu = () => {
      timeMenu.classList.remove('open');
      timeToggle.setAttribute('aria-expanded', 'false');
    };
    const openMenu = () => {
      timeMenu.classList.add('open');
      timeToggle.setAttribute('aria-expanded', 'true');
    };

    timeToggle.addEventListener('click', () => {
      const willOpen = !timeMenu.classList.contains('open');
      if (willOpen) openMenu(); else closeMenu();
    });

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

/**
 * Enhance control buttons so they don't retain focus outlines after click.
 */
export function initializeControlButtons() {
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
        if (sortLabel && sortArrow) {
          sortLabel.textContent = 'Popularity';
          sortArrow.setAttribute('data-dir', 'desc');
          sortArrow.textContent = '↓';
        }
      }
      if (timeToggle) {
        const timeLabel = timeToggle.querySelector('.time-label');
        if (timeLabel) timeLabel.textContent = 'All time';
        timeToggle.setAttribute('data-value', 'all');
      }
      clearFiltersBtn.blur();
      initializeMovieRails();
    });
  }

  const applyBtn = document.querySelector('.apply-filters');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      initializeMovieRails();
      applyBtn.blur();
    });
  }
}

/**
 * Initialize the Featured movie with the most popular movie of the week.
 */
export async function initializeFeaturedHero() {
  const hero = document.querySelector('.featured-hero');
  if (!hero) return;
  try {
    hero.classList.add('loading');
    const data = await getPopularMoviesLast7Days();
    let results = Array.isArray(data?.results) ? data.results : [];
    results = results.filter(m => m && (m.backdrop_path || m.poster_path)).slice(0, 8);
    if (!results.length) { hero.style.display = 'none'; return; }

    hero.innerHTML = `
      <div class="featured-hero-bg"></div>
      <div class="featured-hero-overlay"></div>
      <div class="featured-hero-content"></div>
    `;

    const bgEl = hero.querySelector('.featured-hero-bg');
    const contentEl = hero.querySelector('.featured-hero-content');

    const renderSlide = (movie) => {
      const title = movie.title || movie.name || 'Featured';
      const mediaType = movie.media_type || 'movie';
      const year = (movie.release_date || movie.first_air_date)
        ? new Date(movie.release_date || movie.first_air_date).getFullYear()
        : '';
      const rating = typeof movie.vote_average === 'number' ? movie.vote_average.toFixed(1) : null;
      const backdropUrl = movie.backdrop_path
        ? `${TMDB_BACKDROP_BASE_URL}${movie.backdrop_path}`
        : (movie.poster_path ? `${TMDB_IMAGE_BASE_URL}${movie.poster_path}` : '');

      if (bgEl) {
        bgEl.classList.remove('slide-enter'); void bgEl.offsetWidth;
        bgEl.style.backgroundImage = backdropUrl ? `url('${backdropUrl}')` : '';
        bgEl.classList.add('slide-enter');
      }
      if (contentEl) {
        contentEl.classList.remove('slide-enter'); void contentEl.offsetWidth;
        contentEl.innerHTML = `
          <h3 class="featured-title">${title}</h3>
          <div class="featured-meta">
            ${rating ? `<span class=\"meta-tag rating\">★ ${rating}</span>` : ''}
            ${year ? `<span class=\"meta-tag year\">${year}</span>` : ''}
            <span class=\"meta-tag type\">${mediaType === 'tv' ? 'Show' : 'Movie'}</span>
            <span class=\"meta-tag runtime\"><span class=\"meta-runtime\" data-id=\"${movie.id}\" data-type=\"${mediaType}\">--</span></span>
          </div>
          <div class=\"featured-cta\">
            <button class=\"btn watch-now\" type=\"button\">Watch Now</button>
            <button class=\"btn learn-more\" type=\"button\">Learn More</button>
          </div>`;
        contentEl.classList.add('slide-enter');
        const watchBtn = contentEl.querySelector('.watch-now');
        const learnBtn = contentEl.querySelector('.learn-more');
        const scrollTarget = document.querySelector('.genre-rails') || document.querySelector('.movie-grid');
        const scrollToGrid = () => { if (scrollTarget) scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
        if (watchBtn) watchBtn.addEventListener('click', scrollToGrid);
        if (learnBtn) learnBtn.addEventListener('click', scrollToGrid);
      }
      initializeRuntimeTags();
      hero.classList.add('ready');
    };

    let index = 0;
    renderSlide(results[index]);
    const advance = () => { index = (index + 1) % results.length; renderSlide(results[index]); };
    let timer = window.setInterval(advance, 6000);
    const pause = () => { if (timer) { window.clearInterval(timer); timer = null; } };
    const resume = () => { if (!timer) { timer = window.setInterval(advance, 6000); } };
    hero.addEventListener('mouseenter', pause);
    hero.addEventListener('mouseleave', resume);
    hero.addEventListener('focusin', pause);
    hero.addEventListener('focusout', resume);

  } catch (e) {
    console.error('Failed to initialize featured hero', e);
    hero.style.display = 'none';
  } finally {
    hero.classList.remove('loading');
  }
}

/**
 * Build one horizontal rail section for a genre.
 * @param {number} genreId
 * @param {string} title
 * @param {() => Promise<any|null>} fetchFunction
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

  // Populate asynchronously
  populateRail(section, fetchFunction);
  // Enable arrows/drag
  setupRail(section);
  return section;
}

/**
 * Resolve current filter state from controls.
 */
function getCurrentFilters() {
  // sort
  const sortToggle = document.querySelector('.sort-toggle');
  const sortArrow = sortToggle ? sortToggle.querySelector('.sort-arrow') : null;
  const sortDir = (sortArrow && sortArrow.getAttribute('data-dir')) || 'desc';
  const sortLabel = sortToggle ? (sortToggle.querySelector('.sort-label')?.textContent || 'Popularity') : 'Popularity';
  let sortBy = 'popularity.desc';
  const lower = sortLabel.toLowerCase();
  if (lower.includes('rating')) sortBy = `vote_average.${sortDir}`;
  else if (lower.includes('newest')) sortBy = `primary_release_date.${sortDir}`;
  else sortBy = `popularity.${sortDir}`;

  // time
  const timeToggle = document.querySelector('.time-toggle');
  const timeValue = (timeToggle && timeToggle.getAttribute('data-value')) || 'all';
  const today = new Date();
  let startDate = null;
  let endDate = today.toISOString().split('T')[0];
  if (timeValue === 'week') {
    const d = new Date(); d.setDate(d.getDate() - 7); startDate = d.toISOString().split('T')[0];
  } else if (timeValue === 'month') {
    const d = new Date(); d.setDate(d.getDate() - 30); startDate = d.toISOString().split('T')[0];
  } else if (timeValue === 'year') {
    const d = new Date(); d.setFullYear(d.getFullYear() - 1); startDate = d.toISOString().split('T')[0];
  } else {
    startDate = null; endDate = null;
  }

  // genres - read TMDB ids from data-attribute
  const checked = Array.from(document.querySelectorAll('.genre-input:checked'));
  const selectedGenreIds = checked
    .map((input) => Number(input.getAttribute('data-genre-id')))
    .filter((n) => Number.isFinite(n));
  
  if (!startDate && !endDate && sortBy.startsWith('popularity')) {
    sortBy = 'vote_count.desc';
  }

  return { sortBy, startDate, endDate, selectedGenreIds };
}

export async function initializeMovieRails() {
  const railsContainer = document.querySelector('.genre-rails');
  if (!railsContainer) return;

  railsContainer.innerHTML = '';

  // Determine base genres: if user selected genres, use those; else top genres last 30 days
  const { sortBy, startDate, endDate, selectedGenreIds } = getCurrentFilters();
  let baseGenres = selectedGenreIds.slice(0);
  if (!baseGenres.length) {
    let computed = null;
    if (!startDate && !endDate) {
      computed = await getTopGenres({ startDate: null, endDate: null, sortBy: 'vote_count.desc', pages: 2, limit: 12 });
    } else {
      computed = await getTopGenres({ startDate, endDate, sortBy: 'popularity.desc', pages: 2, limit: 12 });
    }
    baseGenres = Array.isArray(computed) ? computed : [];
  }

  // Helper to build fetcher per-genre that respects sort/time filters
  const strongSignals = sortBy.startsWith('vote_average') ? { voteAverageGte: 6.5, voteCountGte: 100 } : { voteCountGte: 50 };
  const makeFetcher = (gid) => async () => {
    const data = await discoverMovies({ sortBy, startDate, endDate, genreIds: [gid], page: 1, ...strongSignals });
    if (!data || !Array.isArray(data.results)) return data;
    const filtered = data.results.filter((m) => Array.isArray(m?.genre_ids) && m.genre_ids.slice(0, 2).includes(gid));
    return Object.assign({}, data, { results: filtered });
  };

  // Render initial batch (6 rails)
  const initial = baseGenres.slice(0, 6);
  initial.forEach((gid) => {
    const title = getGenreName(gid) || 'Genre';
    const section = createGenreRailSection(gid, title, makeFetcher(gid));
    railsContainer.appendChild(section);
  });

  // Infinite vertical scroll: load more rails in batches of 4
  let nextIndex = initial.length;
  const loadMore = () => {
    if (nextIndex >= baseGenres.length) return;
    const batch = baseGenres.slice(nextIndex, nextIndex + 4);
    batch.forEach((gid) => {
      const title = getGenreName(gid) || 'Genre';
      const section = createGenreRailSection(gid, title, makeFetcher(gid));
      railsContainer.insertBefore(section, sentinel);
    });
    nextIndex += batch.length;
  };

  const sentinel = document.createElement('div');
  sentinel.style.height = '0px';
  sentinel.style.margin = '0';
  sentinel.style.padding = '0';
  railsContainer.appendChild(sentinel);
  const io = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) {
      loadMore();
    }
  }, { rootMargin: '1200px 0px' });
  io.observe(sentinel);
}