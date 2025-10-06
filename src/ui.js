import { img, getTitleRuntime } from "./api.js";

/**
 * Returns the genre name given a id from TMDB.
 * @param {number} id - TMDB genre id.
 * @returns {string}
 */
export function getGenreName(id) {
  const genres = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
    99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
    27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
    10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western', 10759: 'Action & Adventure',
    10762: 'Kids', 10763: 'News', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy',
    10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics'
  };
  return genres[id] || '';
}

/**
 * Format minutes as a compact string (e.g., "115min").
 * @param {number|null} minutes
 * @returns {string}
 */
export function formatMinutesOrEpisodes(value, mediaType) {
  if (value == null || isNaN(value)) return '--';
  const total = Math.max(0, Math.floor(Number(value)));
  if (mediaType === 'tv') return `${total} Eps`;
  return `${total}min`;
}

/**
 * Create a movie card element from a TMDB movie.
 * @param {Object} movie
 * @param {number} movie.id
 * @param {string} movie.title
 * @param {string} [movie.poster_path]
 * @param {number} [movie.vote_average]
 * @param {string} [movie.release_date]
 * @param {Array<number>} [movie.genre_ids]
 * @param {string} [movie.media_type]
 * @returns {HTMLElement}
 */
export function createMovieCard(movie) {
  const card = document.createElement('article');
  card.className = 'movie-card';
  try { card.setAttribute('tabindex', '0'); } catch {}

  const posterUrl = movie.poster_path ? img.poster(movie.poster_path) : null;
  const rating = typeof movie.vote_average === 'number' ? movie.vote_average.toFixed(1) : 'N/A';
  const title = movie.title || movie.name || '';
  const releaseYear = (movie.release_date || movie.first_air_date) ? new Date(movie.release_date || movie.first_air_date).getFullYear() : 'N/A';
  const genres = movie.genre_ids ? movie.genre_ids.slice(0, 2).map(id => getGenreName(id)).join(', ') : '';
  const mediaType = movie.media_type || (movie.first_air_date ? 'tv' : 'movie');

  try { card.setAttribute('data-id', String(movie.id)); card.setAttribute('data-type', mediaType); } catch {}

  card.innerHTML = `
    ${posterUrl ? `<img src="${posterUrl}" alt="${title}" class="poster-img" loading="lazy">` : '<div class="poster-skeleton"></div>'}
    <div class="movie-info">
      <h3 class="movie-title">${title}</h3>
    </div>
    <div class="movie-overlay">
      <div class="overlay-content">
        <div class="overlay-rating">★ ${rating}</div>
        <div class="overlay-year">${releaseYear}</div>
        ${genres ? `<div class="overlay-genres">${genres}</div>` : ''}
        <div class="overlay-tags">
          <span class="meta-tag type">${mediaType === 'tv' ? 'Show' : 'Movie'}</span>
          <span class="meta-tag runtime"><span class="meta-runtime" data-id="${movie.id}" data-type="${mediaType}">--</span></span>
        </div>
      </div>
    </div>
  `;

  if (posterUrl) {
    const img = card.querySelector('.poster-img');
    if (img) {
      img.addEventListener('load', () => { img.classList.add('loaded'); });
      if (img.complete) img.classList.add('loaded');
    }
  }

  requestAnimationFrame(() => adjustOverlayHeightFor(card));
  const ro = ensureCardOverlayResizeObserver();
  ro.observe(card);
  return card;
}

/**
 * Create a skeleton placeholder card for loading states.
 * @returns {HTMLElement}
 */
export function createSkeletonCard() {
  const card = document.createElement('article');
  card.className = 'movie-card skeleton';
  card.innerHTML = `
    <div class="poster-skeleton shimmer"></div>
    <div class="movie-info">
      <div class="line-skeleton short shimmer"></div>
      <div class="line-skeleton long shimmer"></div>
    </div>
    <div class="movie-overlay"></div>
  `;
  return card;
}

let runtimeObserver = null;
let cardOverlayResizeObserver = null;
let addTooltip = null;
let pendingRuntimeUpdates = [];
let runtimeFlushScheduled = false;

function getAddTooltip() {
  if (!addTooltip) {
    addTooltip = document.createElement('div');
    addTooltip.className = 'card-add-tooltip';
    addTooltip.textContent = 'Add to My List';
    document.body.appendChild(addTooltip);
  }
  return addTooltip;
}

function adjustOverlayHeightFor(card) {
  const movieInfo = card.querySelector('.movie-info');
  const overlay = card.querySelector('.movie-overlay');
  if (movieInfo && overlay) {
    const cardRect = card.getBoundingClientRect();
    const infoRect = movieInfo.getBoundingClientRect();
    const bottomOffset = cardRect.bottom - infoRect.top - 1;
    overlay.style.bottom = `${bottomOffset}px`;
  }
}

function ensureCardOverlayResizeObserver() {
  if (cardOverlayResizeObserver) return cardOverlayResizeObserver;
  cardOverlayResizeObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      const el = entry.target;
      if (el && el.classList && el.classList.contains('movie-card')) adjustOverlayHeightFor(el);
    });
  });
  return cardOverlayResizeObserver;
}

function scheduleRuntimeFlush() {
  if (runtimeFlushScheduled) return;
  runtimeFlushScheduled = true;
  Promise.resolve().then(() => {
    const list = pendingRuntimeUpdates.splice(0);
    runtimeFlushScheduled = false;
    list.forEach(({ el, val, type }) => { el.textContent = formatMinutesOrEpisodes(val, type); });
  });
}

export function ensureRuntimeObserver() {
  if (runtimeObserver) return runtimeObserver;
  runtimeObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      obs.unobserve(el);
      const id = el.getAttribute('data-id');
      const type = el.getAttribute('data-type') || 'movie';
      if (!id) return;
      getTitleRuntime(id, type).then((val) => {
        const inSearchItem = !!el.closest('.search-item');
        if (inSearchItem && (!val || val <= 0)) {
          const item = el.closest('.search-item');
          if (item) {
            const results = item.closest('.search-results');
            item.remove();
            if (results && results.querySelectorAll('.search-item').length === 0) {
              results.classList.remove('open');
              results.innerHTML = '';
            }
          }
          return;
        }
        pendingRuntimeUpdates.push({ el, val, type });
        scheduleRuntimeFlush();
      });
    });
  }, { rootMargin: '200px 0px' });
  return runtimeObserver;
}

export function startRuntimeTags() {
  const observer = ensureRuntimeObserver();
  document.querySelectorAll('.meta-runtime').forEach((el) => observer.observe(el));
}

/**
 * Populate a carousel rail with movie cards using the provided fetcher.
 * @param {HTMLElement|null} rail - Section element containing a `.rail-track`.
 * @param {() => Promise<any|null>} fetchFunction - Fetcher returning TMDB results.
 * @returns {Promise<void>}
 */
export async function populateRail(rail, fetchFunction, options) {
  if (!rail) return;
  const track = rail.querySelector('.rail-track');
  if (!track) return;

  const opts = Object.assign({ minCards: 20, maxAttempts: 3, attempt: 0 }, options || {});

  if (rail.dataset.retryTimeoutId) {
    try { window.clearTimeout(Number(rail.dataset.retryTimeoutId)); } catch {}
    delete rail.dataset.retryTimeoutId;
  }

  const shouldShowSkeletons = opts.attempt === 0 || track.children.length === 0;
  if (shouldShowSkeletons) {
    track.innerHTML = '';
    const skeletonCount = Math.min(10, Math.max(6, Math.floor(track.clientWidth / 190)));
    for (let i = 0; i < skeletonCount; i++) {
      track.appendChild(createSkeletonCard());
    }
  }

  const scheduleRetry = () => {
    if (opts.attempt >= opts.maxAttempts) return;
    const delay = Math.min(10000, 1500 * Math.pow(2, opts.attempt)) + Math.floor(Math.random() * 300);
    const id = window.setTimeout(() => {
      if (!rail.isConnected) return;
      populateRail(rail, fetchFunction, Object.assign({}, opts, { attempt: opts.attempt + 1 }));
    }, delay);
    rail.dataset.retryTimeoutId = String(id);
  };

  try {
    const mo = new MutationObserver(() => {
      if (!rail.isConnected && rail.dataset.retryTimeoutId) {
        try { window.clearTimeout(Number(rail.dataset.retryTimeoutId)); } catch {}
        delete rail.dataset.retryTimeoutId;
        try { mo.disconnect(); } catch {}
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  } catch {}

  try {
    const data = await fetchFunction();
    const results = Array.isArray(data?.results) ? data.results : [];
    const moviesWithPosters = results.filter(movie => movie.poster_path);
    const movies = moviesWithPosters.slice(0, 20);

    if (!movies.length) { scheduleRetry(); return; }

    track.innerHTML = '';
    movies.forEach((movie, index) => {
      const card = createMovieCard(movie);
      card.style.animationDelay = `${Math.min(index, 12) * 40}ms`;
      track.appendChild(card);
    });
    startMovieCards();
    startRuntimeTags();
    rail.classList.add('revealed');

    if (movies.length < opts.minCards) scheduleRetry();
  } catch (error) {
    console.error('Error populating rail:', error);
    scheduleRetry();
  }
}

export function startMovieCards() {
  const cards = document.querySelectorAll('.movie-card');
  cards.forEach((card) => {
    if (card.querySelector('.card-add')) return;
    const btn = document.createElement('button');
    btn.className = 'card-add';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Add to My List');
    btn.textContent = '+';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      btn.blur();
    });
    card.appendChild(btn);
    const tooltip = getAddTooltip();
    btn.addEventListener('mouseenter', () => {
      const rect = btn.getBoundingClientRect();
      tooltip.style.left = `${rect.right + 8}px`;
      tooltip.style.top = `${rect.top + rect.height / 2}px`;
      tooltip.style.transform = 'translateY(-50%)';
      tooltip.classList.add('visible');
    });
    btn.addEventListener('mouseleave', () => { tooltip.classList.remove('visible'); });

    const titleElement = card.querySelector('.movie-title');
    if (titleElement) {
      let titleTooltip = null;
      const showTitleTooltip = () => {
        if (titleElement.scrollWidth > titleElement.clientWidth) {
          if (!titleTooltip) {
            titleTooltip = document.createElement('div');
            titleTooltip.className = 'title-tooltip';
            titleTooltip.textContent = titleElement.textContent || '';
            document.body.appendChild(titleTooltip);
          }
          const rect = titleElement.getBoundingClientRect();
          titleTooltip.style.left = `${rect.left + rect.width / 2}px`;
          titleTooltip.style.top = `${rect.bottom + 8}px`;
          titleTooltip.classList.add('visible');
        }
      };
      const hideTitleTooltip = () => { if (titleTooltip) titleTooltip.classList.remove('visible'); };
      titleElement.addEventListener('mouseenter', showTitleTooltip);
      titleElement.addEventListener('mouseleave', hideTitleTooltip);
    }
  });
}

export function setupRail(sectionEl) {
  const track = sectionEl.querySelector('.rail-track');
  const prev = sectionEl.querySelector('.rail-prev');
  const next = sectionEl.querySelector('.rail-next');
  if (!track) return;

  try {
    sectionEl.setAttribute('role', 'region');
    const title = sectionEl.querySelector('.section-title');
    if (title && title.textContent) sectionEl.setAttribute('aria-label', title.textContent);
  } catch {}

  const step = () => Math.round(track.clientWidth * 0.9);
  prev && prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
  next && next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));

  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); track.scrollBy({ left: step(), behavior: 'smooth' }); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); track.scrollBy({ left: -step(), behavior: 'smooth' }); }
  });

  let dragging = false, startX = 0, startScroll = 0;
  const start = (x) => { dragging = true; startX = x; startScroll = track.scrollLeft; };
  const move = (x) => { if (dragging) track.scrollLeft = startScroll - (x - startX); };
  const end = () => { dragging = false; };

  track.addEventListener('mousedown', e => start(e.pageX));
  window.addEventListener('mousemove', e => move(e.pageX));
  window.addEventListener('mouseup', end);

  track.addEventListener('touchstart', e => start(e.touches[0].pageX), { passive: true });
  track.addEventListener('touchmove', e => move(e.touches[0].pageX), { passive: true });
  window.addEventListener('touchend', end);
}

export function disposeUI() {
  try { if (runtimeObserver) { runtimeObserver.disconnect(); runtimeObserver = null; } } catch {}
  try { if (cardOverlayResizeObserver) { cardOverlayResizeObserver.disconnect(); cardOverlayResizeObserver = null; } } catch {}
  try { if (addTooltip) { addTooltip.classList.remove('visible'); } } catch {}
}