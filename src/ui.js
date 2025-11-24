import { img, getTitleRuntime, getTitleImages } from "./api.js";
import * as listStore from "./list-store.js";
import { showMenu } from "./menu.js";
import { preferEnglishImages, attachCardNavigationHandlers } from "./utils.js";

import { RUNTIME_MAX_CONCURRENCY, INTERSECTION_OBSERVER_MARGIN, MAX_RAIL_ITEMS, CARD_WIDTH_PX, MIN_SKELETON_COUNT, MAX_SKELETON_COUNT_RAIL, CARD_ANIMATION_DELAY_MS, MAX_ANIMATION_DELAY_INDEX, RAIL_RETRY_BASE_DELAY_MS, RAIL_RETRY_MAX_DELAY_MS, RAIL_RETRY_BACKOFF_MULTIPLIER, RAIL_RETRY_JITTER_MS, TOOLTIP_OFFSET_PX, SCROLL_STEP_MULTIPLIER, GRID_CHUNK_SIZE } from "./constants.js";

// Module State (Private)

const posterChoiceCache = new Map();

let runtimeObserver = null;
let cardOverlayResizeObserver = null;
let addTooltip = null;
let pendingRuntimeUpdates = [];
let runtimeFlushScheduled = false;
let runtimeActiveCount = 0;
const runtimeQueue = [];
const runtimePendingByKey = new Map(); // key -> { elements:Set<HTMLElement>, type:string }

// Public Utility Functions (Exports)

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
 * Clean up UI observers and tooltips
 */
export function disposeUI() {
  try { if (runtimeObserver) { runtimeObserver.disconnect(); runtimeObserver = null; } } catch {}
  try { if (cardOverlayResizeObserver) { cardOverlayResizeObserver.disconnect(); cardOverlayResizeObserver = null; } } catch {}
  try { if (addTooltip) { addTooltip.classList.remove('visible'); } } catch {}
}

// Public Card Creation Functions (Exports)

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

  const mediaType = movie.media_type || (movie.first_air_date ? 'tv' : 'movie');
  const choiceKey = `${mediaType}:${movie.id}`;
  let posterUrl = null;
  if (posterChoiceCache.has(choiceKey)) {
    const chosenPath = posterChoiceCache.get(choiceKey);
    posterUrl = chosenPath ? img.poster(chosenPath) : (movie.poster_path ? img.poster(movie.poster_path) : null);
  }
  const rating = typeof movie.vote_average === 'number' ? movie.vote_average.toFixed(1) : 'N/A';
  const title = movie.title || movie.name || '';
  const releaseYear = (movie.release_date || movie.first_air_date) ? new Date(movie.release_date || movie.first_air_date).getFullYear() : 'N/A';
  const genres = movie.genre_ids ? movie.genre_ids.slice(0, 2).map(id => getGenreName(id)).join(', ') : '';

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

  try {
    const useRandom = !!(movie && (movie.backdrop_path || movie.poster_path));
    if (useRandom) {
      (async () => {
        const images = await getTitleImages(movie.id, mediaType);
        const posters = Array.isArray(images?.posters) ? images.posters : [];
        let chosenPath = null;
        if (posterChoiceCache.has(choiceKey)) {
          chosenPath = posterChoiceCache.get(choiceKey);
        } else if (posters.length) {
          const list = preferEnglishImages(posters);
          const pick = list[Math.floor(Math.random() * list.length)];
          chosenPath = pick && pick.file_path ? pick.file_path : null;
          posterChoiceCache.set(choiceKey, chosenPath);
        }
        const targetSrc = chosenPath ? img.poster(chosenPath) : (movie.poster_path ? img.poster(movie.poster_path) : null);
        const existingImg = card.querySelector('.poster-img');
        if (existingImg) {
          if (targetSrc && targetSrc !== existingImg.getAttribute('src')) {
            existingImg.addEventListener('load', () => { existingImg.classList.add('loaded'); }, { once: true });
            existingImg.setAttribute('src', targetSrc);
          }
        } else if (targetSrc) {
          const skel = card.querySelector('.poster-skeleton');
          const newImg = document.createElement('img');
          newImg.className = 'poster-img';
          newImg.setAttribute('alt', title);
          newImg.setAttribute('loading', 'lazy');
          newImg.addEventListener('load', () => { newImg.classList.add('loaded'); }, { once: true });
          newImg.src = targetSrc;
          if (skel && skel.parentNode) skel.parentNode.replaceChild(newImg, skel);
        }
      })();
    }
  } catch {}

  requestAnimationFrame(() => adjustOverlayHeightFor(card));
  const ro = ensureCardOverlayResizeObserver();
  ro.observe(card);
  return card;
}

/**
 * Create a person card element from a TMDB person result
 * @param {Object} person
 * @param {number} person.id
 * @param {string} person.name
 * @param {string} [person.profile_path]
 * @param {string} [person.known_for_department]
 * @param {Array} [person.known_for]
 * @returns {HTMLElement}
 */
export function createPersonCard(person) {
  const card = document.createElement('article');
  card.className = 'movie-card person-card';
  try { card.setAttribute('tabindex', '0'); } catch {}

  const name = person.name || 'Unknown';
  const profileUrl = person.profile_path ? img.poster(person.profile_path) : null;
  const department = person.known_for_department || 'Actor';
  const knownFor = Array.isArray(person.known_for) ? person.known_for : [];

  const knownForText = knownFor
    .slice(0, 2)
    .map(item => item.title || item.name || '')
    .filter(Boolean)
    .join(', ') || '';

  try { 
    card.setAttribute('data-id', String(person.id)); 
    card.setAttribute('data-type', 'person'); 
  } catch {}

  card.innerHTML = `
    ${profileUrl ? `<img src="${profileUrl}" alt="${name}" class="poster-img" loading="lazy">` : '<div class="poster-skeleton"></div>'}
    <div class="movie-info">
      <h3 class="movie-title">${name}</h3>
    </div>
    <div class="movie-overlay">
      <div class="overlay-content">
        <div class="overlay-tags">
          <span class="meta-tag type">${department}</span>
        </div>
        ${knownForText ? `<div class="overlay-genres">${knownForText}</div>` : ''}
      </div>
    </div>
  `;

  if (profileUrl) {
    const imgEl = card.querySelector('.poster-img');
    if (imgEl) {
      imgEl.addEventListener('load', () => { imgEl.classList.add('loaded'); });
      if (imgEl.complete) imgEl.classList.add('loaded');
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

/**
 * Initialize interactive features for movie cards
 */
export function startMovieCards() {
  const cards = document.querySelectorAll('.movie-card');
  cards.forEach((card) => {
    if (card.querySelector('.card-add')) return;
    
    const id = card.getAttribute('data-id');
    const type = card.getAttribute('data-type') || 'movie';
    const isPersonCard = card.classList.contains('person-card');
    
    if (isPersonCard) {
      const nameEl = card.querySelector('.movie-title');
      const name = nameEl ? nameEl.textContent : '';
      if (id && name) {
        const query = encodeURIComponent(name);
        const path = `/search?q=${query}&person=${id}`;
        attachCardNavigationHandlers(card, path);
      }
      return;
    }
    
    const btn = document.createElement('button');
    btn.className = 'card-add';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Add to My List');
    btn.textContent = '+';
    
    if (id && type) {
      updateAddButton(btn, { id, type });
    }
    
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      btn.blur();
      const titleEl = card.querySelector('.movie-title');
      const title = titleEl ? titleEl.textContent : '';
      const posterImg = card.querySelector('.poster-img');
      const poster = posterImg ? posterImg.getAttribute('src') : null;
      
      const ratingEl = card.querySelector('.overlay-rating');
      const rating = ratingEl ? parseFloat(ratingEl.textContent.replace('★', '').trim()) : 0;
      
      const yearEl = card.querySelector('.overlay-year');
      const year = yearEl ? yearEl.textContent.trim() : '';
      
      if (id && type) {
        showAddToListMenu(btn, { 
          id, 
          type, 
          title, 
          poster,
          vote_average: rating,
          release_date: type === 'movie' && year ? `${year}-01-01` : null,
          first_air_date: type === 'tv' && year ? `${year}-01-01` : null
        });
      }
    });
    
    card.appendChild(btn);
    const tooltip = getAddTooltip();
    btn.addEventListener('mouseenter', () => {
      const rect = btn.getBoundingClientRect();
      tooltip.style.left = `${rect.right + TOOLTIP_OFFSET_PX}px`;
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
          titleTooltip.style.top = `${rect.bottom + TOOLTIP_OFFSET_PX}px`;
          titleTooltip.classList.add('visible');
        }
      };
      const hideTitleTooltip = () => { if (titleTooltip) titleTooltip.classList.remove('visible'); };
      titleElement.addEventListener('mouseenter', showTitleTooltip);
      titleElement.addEventListener('mouseleave', hideTitleTooltip);
    }

    if (id && (type === 'movie' || type === 'tv')) {
      const path = type === 'tv' ? `/tv/tv:${id}` : `/movies/movie:${id}`;
      attachCardNavigationHandlers(card, path);
    }
  });
}

// Public Runtime & Observer Functions (Exports)

/**
 * Creates or returns the global IntersectionObserver for runtime tags
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
      const key = `${type}:${id}`;
      let bucket = runtimePendingByKey.get(key);
      if (!bucket) {
        bucket = { elements: new Set(), type };
        runtimePendingByKey.set(key, bucket);
        enqueueRuntimeTask(async () => {
          let val = null;
          try { val = await getTitleRuntime(id, type); } catch {}
          const targets = Array.from(bucket.elements);
          runtimePendingByKey.delete(key);
          targets.forEach((targetEl) => {
            const inSearchItem = !!targetEl.closest('.search-item');
            if (inSearchItem && (!val || val <= 0)) {
              const item = targetEl.closest('.search-item');
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
            pendingRuntimeUpdates.push({ el: targetEl, val, type });
          });
          scheduleRuntimeFlush();
        });
      }
      bucket.elements.add(el);
    });
  }, { rootMargin: INTERSECTION_OBSERVER_MARGIN });
  return runtimeObserver;
}

/**
 * Initialize intersection observers for runtime badges
 * @returns {void}
 */
export function startRuntimeTags() {
  const observer = ensureRuntimeObserver();
  document.querySelectorAll('.meta-runtime').forEach((el) => observer.observe(el));
}

// Public Rail Functions (Exports)

/**
 * Render skeleton cards in a rail track
 * @param {HTMLElement} track
 * @returns {number} Number of skeletons created
 */
export function renderRailSkeletons(track) {
  track.innerHTML = '';
  const skeletonCount = Math.min(MAX_SKELETON_COUNT_RAIL, Math.max(MIN_SKELETON_COUNT, Math.floor(track.clientWidth / CARD_WIDTH_PX)));
  for (let i = 0; i < skeletonCount; i++) {
    track.appendChild(createSkeletonCard());
  }
  return skeletonCount;
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

  const opts = Object.assign({ minCards: MAX_RAIL_ITEMS, maxAttempts: 3, attempt: 0 }, options || {});

  if (rail.dataset.retryTimeoutId) {
    try { window.clearTimeout(Number(rail.dataset.retryTimeoutId)); } catch {}
    delete rail.dataset.retryTimeoutId;
  }

  const shouldShowSkeletons = opts.attempt === 0 || track.children.length === 0;
  if (shouldShowSkeletons) {
    renderRailSkeletons(track);
  }

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
    const movies = moviesWithPosters.slice(0, MAX_RAIL_ITEMS);

    if (!movies.length) { scheduleRailRetry(rail, fetchFunction, opts); return; }

    track.innerHTML = '';
    movies.forEach((movie, index) => {
      const card = createMovieCard(movie);
      card.style.animationDelay = `${Math.min(index, MAX_ANIMATION_DELAY_INDEX) * CARD_ANIMATION_DELAY_MS}ms`;
      track.appendChild(card);
    });
    startMovieCards();
    startRuntimeTags();
    rail.classList.add('revealed');

    if (movies.length < opts.minCards) scheduleRailRetry(rail, fetchFunction, opts);
  } catch (error) {
    console.error('Error populating rail:', rail.getAttribute('data-genre-id') || 'unknown', error);
    scheduleRailRetry(rail, fetchFunction, opts);
  } finally {
    if (!rail.isConnected && rail.dataset.retryTimeoutId) {
      try { window.clearTimeout(Number(rail.dataset.retryTimeoutId)); } catch {}
      delete rail.dataset.retryTimeoutId;
    }
  }
}

/**
 * Sets up navigation and drag behavior for a carousel rail
 * @param {HTMLElement} sectionEl
 */
export function setupRail(sectionEl) {
  const track = sectionEl.querySelector('.rail-track');
  const prev = sectionEl.querySelector('.rail-prev');
  const next = sectionEl.querySelector('.rail-next');
  if (!track) return;

  try {
    sectionEl.setAttribute('role', 'region');
    const title = sectionEl.querySelector('.section-title');
    if (title && title.textContent)     sectionEl.setAttribute('aria-label', title.textContent);
  } catch {}

  const step = () => Math.round(track.clientWidth * SCROLL_STEP_MULTIPLIER);
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

// Public List Management Functions (Exports)

/**
 * Update add button appearance based on list status
 * @param {HTMLElement} button
 * @param {Object} item
 */
export function updateAddButton(button, item) {
  const existingLists = listStore.findItem(item.id, item.type);
  const isInList = existingLists.length > 0;
  
  if (isInList) {
    if (button.classList.contains('card-add')) {
      button.textContent = '✓';
      button.className = 'card-add in-list';
    } else {
      // Details page button: show only a checkmark, not a remove label
      button.textContent = '✓';
      button.className = button.className.replace(/\bin-list\b/g, '') + ' in-list';
    }
    button.setAttribute('aria-label', 'Remove from My List');
  } else {
    if (button.classList.contains('card-add')) {
      button.textContent = '+';
      button.className = 'card-add';
    } else {
      button.textContent = 'Add to List';
      button.className = button.className.replace(/\bin-list\b/g, '');
    }
    button.setAttribute('aria-label', 'Add to My List');
  }
}

/**
 * Show add to list menu
 * @param {HTMLElement} trigger
 * @param {Object} item
 */
export function showAddToListMenu(trigger, item) {
  const state = listStore.getState();
  const { lists, customLists } = state;
  
  const existingLists = listStore.findItem(item.id, item.type);
  
  if (existingLists.length > 0) {
    const removeItems = existingLists.map(listId => {
      const list = lists[listId] || customLists[listId];
      return {
        label: `Remove from ${list.name}`,
        action: () => {
          listStore.remove(item.id, item.type, listId);
          updateAddButton(trigger, item);
        }
      };
    });
    
    showMenu({ trigger, items: removeItems, position: 'right' });
  } else {
    const addToListItems = [];

    ['watching', 'plan', 'complete'].forEach(id => {
      const list = lists[id];
      if (list) {
        addToListItems.push({
          label: list.name,
          action: () => {
            listStore.add(item, list.id);
            updateAddButton(trigger, item);
          }
        });
      }
    });

    // Custom lists
    const customListsArray = Object.values(customLists).sort((a, b) => (a.order || 0) - (b.order || 0));
    if (customListsArray.length > 0) {
      addToListItems.push({ separator: true });
      customListsArray.forEach(list => {
        addToListItems.push({
          label: list.name,
          action: () => {
            listStore.add(item, list.id);
            updateAddButton(trigger, item);
          }
        });
      });
    }

    showMenu({ trigger, items: addToListItems, position: 'right' });
  }
}

// Private Helper Functions

function pumpRuntimeQueue() {
  while (runtimeActiveCount < RUNTIME_MAX_CONCURRENCY && runtimeQueue.length > 0) {
    const task = runtimeQueue.shift();
    if (!task) break;
    runtimeActiveCount += 1;
    Promise.resolve()
      .then(task)
      .finally(() => {
        runtimeActiveCount -= 1;
        pumpRuntimeQueue();
      });
  }
}

function enqueueRuntimeTask(fn) {
  runtimeQueue.push(fn);
  pumpRuntimeQueue();
}

/**
 * Gets or creates the add button tooltip element
 * @returns {HTMLElement}
 */
function getAddTooltip() {
  if (!addTooltip) {
    addTooltip = document.createElement('div');
    addTooltip.className = 'card-add-tooltip';
    addTooltip.textContent = 'Add to My List';
    document.body.appendChild(addTooltip);
  }
  return addTooltip;
}

/**
 * Adjusts the movie card overlay height to account for title overflow
 * @param {HTMLElement} card
 */
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

/**
 * Creates or returns the global ResizeObserver for card overlays
 * @returns {ResizeObserver}
 */
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

/**
 * Schedules a batched flush of pending runtime updates
 */
function scheduleRuntimeFlush() {
  if (runtimeFlushScheduled) return;
  runtimeFlushScheduled = true;
  Promise.resolve().then(() => {
    const list = pendingRuntimeUpdates.splice(0);
    runtimeFlushScheduled = false;
    list.forEach(({ el, val, type }) => { el.textContent = formatMinutesOrEpisodes(val, type); });
  });
}

/**
 * Schedule a retry for rail population
 * @param {HTMLElement} rail
 * @param {Function} fetchFunction
 * @param {Object} options
 * @returns {number|null} Timeout ID
 */
function scheduleRailRetry(rail, fetchFunction, options) {
  if (options.attempt >= options.maxAttempts) return null;
  if (!rail.isConnected) return null;
  const delay = Math.min(RAIL_RETRY_MAX_DELAY_MS, RAIL_RETRY_BASE_DELAY_MS * Math.pow(RAIL_RETRY_BACKOFF_MULTIPLIER, options.attempt)) + Math.floor(Math.random() * RAIL_RETRY_JITTER_MS);
  const id = window.setTimeout(() => {
    if (!rail.isConnected) return;
    populateRail(rail, fetchFunction, Object.assign({}, options, { attempt: options.attempt + 1 }));
  }, delay);
  rail.dataset.retryTimeoutId = String(id);
  return id;
}

/**
 * Handle share item
 * @param {Object} item
 */
function handleShare(item) {
  const url = `${window.location.origin}/movie-night/${item.type === 'tv' ? 'tv' : 'movies'}/${item.type}:${item.id}`;
  
  if (navigator.share) {
    navigator.share({
      title: item.title,
      url: url
    }).catch(err => {
      if (err.name !== 'AbortError') {
        copyToClipboard(url);
      }
    });
  } else {
    copyToClipboard(url);
  }
}

/**
 * Handle export item
 * @param {Object} item
 */
function handleExportItem(item) {
  const json = JSON.stringify(item, null, 2);
  copyToClipboard(json);
}

/**
 * Copy to clipboard
 * @param {string} text
 */
function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
    }).catch(err => {
      console.error('Copy failed:', err);
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

/**
 * Fallback copy method
 * @param {string} text
 */
function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
  } catch (err) {
    console.error('Fallback copy failed:', err);
  }
  document.body.removeChild(textarea);
}