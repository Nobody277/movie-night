/**
 * UI helpers: DOM builders, runtime tags, rails, and interactions.
 *
 * @module ui
 */

import { TMDB_IMAGE_BASE_URL, getTitleRuntime } from "./api.js";

/**
 * Return a human-readable genre name for a TMDB genre id.
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
export function formatMinutes(minutes) {
  if (minutes == null || isNaN(minutes)) return '--';
  const total = Math.max(0, Math.floor(Number(minutes)));
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

  const posterUrl = movie.poster_path ? `${TMDB_IMAGE_BASE_URL}${movie.poster_path}` : null;
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';
  const releaseYear = movie.release_date ? new Date(movie.release_date).getFullYear() : 'N/A';
  const genres = movie.genre_ids ? movie.genre_ids.slice(0, 2).map(id => getGenreName(id)).join(', ') : '';
  const mediaType = movie.media_type || 'movie';

  card.innerHTML = `
    ${posterUrl ? `<img src="${posterUrl}" alt="${movie.title}" class="poster-img" loading="lazy">` : '<div class="poster-skeleton"></div>'}
    <div class="movie-info">
      <h3 class="movie-title">${movie.title}</h3>
    </div>
    <div class="movie-overlay">
      <div class="overlay-content">
        <div class="overlay-rating">★ ${rating}</div>
        <div class="overlay-year">${releaseYear}</div>
        ${genres ? `<div class="overlay-genres">${genres}</div>` : ''}
        <div class="overlay-tags">
          <span class="meta-tag type">${mediaType === 'tv' ? 'Show' : 'Movie'}</span>
          <span class="meta-tag runtime"><span class="meta-runtime" data-id="${movie.id}" data-type="${mediaType}">--:--</span></span>
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

  const adjustOverlayHeight = () => {
    const movieInfo = card.querySelector('.movie-info');
    const overlay = card.querySelector('.movie-overlay');
    if (movieInfo && overlay) {
      const cardRect = card.getBoundingClientRect();
      const infoRect = movieInfo.getBoundingClientRect();
      const bottomOffset = cardRect.bottom - infoRect.top - 1;
      overlay.style.bottom = `${bottomOffset}px`;
    }
  };

  setTimeout(adjustOverlayHeight, 0);
  window.addEventListener('resize', adjustOverlayHeight);
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

/** Singleton intersection observer for runtime tags. */
let runtimeObserver = null;

/**
 * Observe and lazily populate runtime badges when in view.
 * @returns {IntersectionObserver}
 */
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
      getTitleRuntime(id, type).then((mins) => {
        const inSearchItem = !!el.closest('.search-item');
        if (inSearchItem && (!mins || mins <= 0)) {
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
        el.textContent = formatMinutes(mins);
      });
    });
  }, { rootMargin: '200px 0px' });
  return runtimeObserver;
}

/**
 * Start observing all `.meta-runtime` elements on the page.
 */
export function initializeRuntimeTags() {
  const observer = ensureRuntimeObserver();
  document.querySelectorAll('.meta-runtime').forEach((el) => observer.observe(el));
}

/**
 * Populate a carousel rail with movie cards using the provided fetcher.
 * @param {HTMLElement|null} rail - Section element containing a `.rail-track`.
 * @param {() => Promise<any|null>} fetchFunction - Fetcher returning TMDB results.
 * @returns {Promise<void>}
 */
export async function populateRail(rail, fetchFunction) {
  if (!rail) return;
  const track = rail.querySelector('.rail-track');
  if (!track) return;

  track.innerHTML = '';
  const skeletonCount = Math.min(10, Math.max(6, Math.floor(track.clientWidth / 190)));
  for (let i = 0; i < skeletonCount; i++) {
    track.appendChild(createSkeletonCard());
  }

  try {
    const data = await fetchFunction();
    if (!data || !data.results) return;
    track.innerHTML = '';
    const moviesWithPosters = data.results.filter(movie => movie.poster_path);
    const movies = moviesWithPosters.slice(0, 20);
    movies.forEach((movie, index) => {
      const card = createMovieCard(movie);
      card.style.animationDelay = `${Math.min(index, 12) * 40}ms`;
      track.appendChild(card);
    });
    initializeMovieCards();
    initializeRuntimeTags();
    rail.classList.add('revealed');
  } catch (error) {
    console.error('Error populating rail:', error);
  }
}

/**
 * Enhance movie cards with controls and title tooltips.
 */
export function initializeMovieCards() {
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

    const tooltip = document.createElement('div');
    tooltip.className = 'card-add-tooltip';
    tooltip.textContent = 'Add to My List';
    document.body.appendChild(tooltip);

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

/**
 * Initialize scroll, keyboard, and drag interactions for a horizontal rail.
 * @param {HTMLElement} sectionEl - Section element with `.rail-track`.
 */
export function setupRail(sectionEl) {
  const track = sectionEl.querySelector('.rail-track');
  const prev = sectionEl.querySelector('.rail-prev');
  const next = sectionEl.querySelector('.rail-next');
  if (!track) return;

  const step = () => Math.round(track.clientWidth * 0.9);
  prev && prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
  next && next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));

  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') track.scrollBy({ left: step(), behavior: 'smooth' });
    if (e.key === 'ArrowLeft') track.scrollBy({ left: -step(), behavior: 'smooth' });
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