/**
 * Helper for TMDB API: developer.themoviedb.org
 * @module api
*/
import { formatDate, sleep } from './utils.js';

import { TMDB_BASE_URL, TMDB_IMAGE_BASE_URL, TMDB_BACKDROP_BASE_URL, TMDB_BACKDROP_W780_BASE_URL, TMDB_BACKDROP_ORIGINAL_BASE_URL, RESPONSE_CACHE_MAX_ENTRIES, DEFAULT_CACHE_TTL_MS, LONG_CACHE_TTL_MS, MAX_RETRIES, BASE_BACKOFF_MS, BACKOFF_JITTER_MS } from './constants.js';

const runtimeCache = new Map();
const inflightRequests = new Map();
const responseCache = new Map();

// Core API Functions (Exports)

/**
 * Gets data from TMDB
 * @param {string} endpoint - API path beginning with "/" (e.g. "/trending/movie/week").
 * @param {object} [opts]
 * @param {number} [opts.ttlMs] - Cache TTL in milliseconds
 * @param {number} [opts.maxRetries] - Retries on 429/5xx
 * @returns {Promise<any|null>} Parsed JSON response or `null` on failure.
 * @example fetchTMDBData('/trending/movie/week')
 * @example fetchTMDBData('/trending/movie/week', { ttlMs: 60000, maxRetries: 3, signal: AbortSignal.timeout(10000) })
 */
export async function fetchTMDBData(endpoint, opts = {}) {
  const { ttlMs = DEFAULT_CACHE_TTL_MS, maxRetries = MAX_RETRIES, signal } = opts;
  const cacheKey = endpoint;

  const cached = responseCache.get(cacheKey);
  if (cached) {
    if (cached.expiresAt > Date.now()) {
      responseCache.delete(cacheKey);
      responseCache.set(cacheKey, cached);
      return cached.data;
    } else {
      responseCache.delete(cacheKey);
    }
  }

  if (!signal && inflightRequests.has(cacheKey)) {
    try { return await inflightRequests.get(cacheKey); } catch (err) { console.warn('TMDB in-flight dedupe promise rejected:', err); }
  }
  const doFetch = async () => {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        const fetchOpts = { headers: { 'Content-Type': 'application/json' }, cache: 'no-store' };
        if (signal) fetchOpts.signal = signal;
        const bust = attempt > 0 ? `${endpoint.includes('?') ? '&' : '?'}__bust=${Date.now()}` : '';
        const url = `${TMDB_BASE_URL}${endpoint}${bust}`; // Example: https://tmdb-proxy.movie-night.workers.dev/trending/movie/week
        const res = await fetch(url, fetchOpts);
        if (res.status === 204) {
          return null;
        }
        if (res.ok) {
          const data = await res.json();
          responseCache.set(cacheKey, { data, expiresAt: Date.now() + ttlMs });
          deleteOldestEntry();
          return data;
        }

        if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
          if (attempt === maxRetries) break;
          const retryAfterHeader = res.headers.get('retry-after');
          const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
          const backoff = retryAfterMs != null ? retryAfterMs : (BASE_BACKOFF_MS * Math.pow(2, attempt)) + Math.floor(Math.random() * BACKOFF_JITTER_MS);
          await sleep(backoff);
          attempt += 1;
          continue;
        }

        throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        if (attempt === maxRetries) {
          console.error('TMDB API error:', err);
          return null;
        }
        const backoff = (BASE_BACKOFF_MS * Math.pow(2, attempt)) + Math.floor(Math.random() * BACKOFF_JITTER_MS);
        await sleep(backoff);
        attempt += 1;
      }
    }
    return null;
  };

  if (!signal) {
    const p = doFetch().finally(() => { inflightRequests.delete(cacheKey); });
    inflightRequests.set(cacheKey, p);
    return await p;
  }
  return await doFetch();
}

export const img = {
  poster: (path) => path ? `${TMDB_IMAGE_BASE_URL}${path}` : '',
  backdrop: (path) => path ? `${TMDB_BACKDROP_BASE_URL}${path}` : '',
  backdropHi: (path) => path ? `${TMDB_BACKDROP_ORIGINAL_BASE_URL}${path}` : ''
};

/**
 * Picks the most appropriate TMDB backdrop URL based on container width and device pixel ratio.
 * This keeps the hero sharp without fetching unnecessarily large images.
 * @param {string} filePath - TMDB file_path (e.g. "/abc.jpg")
 * @param {number} containerCssWidth - The hero container CSS width in pixels
 * @param {number} [devicePixelRatio=window.devicePixelRatio||1]
 * @returns {string}
 */
export function bestBackdropForSize(filePath, containerCssWidth, devicePixelRatio = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1) {
  if (!filePath) return '';
  const target = Math.max(1, Math.floor(containerCssWidth * Math.min(3, Math.max(1, devicePixelRatio))));
  // Available widths of interest: 780, 1280, original (~3840+)
  const diff780 = Math.abs(780 - target);
  const diff1280 = Math.abs(1280 - target);
  // Prefer the smallest size that is >= target, with a small bias toward larger to avoid upscaling
  if (target <= 780) {
    return `${TMDB_BACKDROP_W780_BASE_URL}${filePath}`;
  }
  if (target <= 1280) {
    return `${TMDB_BACKDROP_BASE_URL}${filePath}`;
  }
  // Very large or retina wide screens → original
  return `${TMDB_BACKDROP_ORIGINAL_BASE_URL}${filePath}`;
}

/**
 * Fetch images (backdrops/posters) for a title.
 * @param {number|string} id
 * @param {('movie'|'tv')} [mediaType='movie']
 * @returns {Promise<any|null>}
 */
export async function getTitleImages(id, mediaType = 'movie') {
  try {
    const endpoint = mediaType === 'tv' ? `/tv/${id}/images` : `/movie/${id}/images`;
    return await fetchTMDBData(endpoint, { ttlMs: LONG_CACHE_TTL_MS, maxRetries: 2 });
  } catch {
    return null;
  }
}

// Trending & Popular Functions (Exports)

/**
 * Get popular movies from the last 7 days
 * @returns {Promise<any|null>}
 */
export async function getPopularMoviesLast7Days() {
  return await getPopularLast7Days('movie');
}

/**
 * Get popular TV from the last 7 days
 * @returns {Promise<any|null>}
 */
export async function getPopularTVLast7Days() {
  return await getPopularLast7Days('tv');
}

/**
 * Fetch weekly trending movies
 * @returns {Promise<any|null>}
 */
export async function getTrendingMovies() {
  return await fetchTMDBData('/trending/movie/week');
}

/**
 * Fetch weekly trending TV shows
 * @returns {Promise<any|null>}
 */
export async function getTrendingTV() {
  return await fetchTMDBData('/trending/tv/week');
}

/**
 * Gets popular movies from the past month.
 * @returns {Promise<any|null>} TMDB response payload or `null` on failure.
 */
export async function getPopularMovies() {
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const dateString = formatDate(oneMonthAgo);
  return await fetchTMDBData(`/discover/movie?sort_by=popularity.desc&primary_release_date.gte=${dateString}`);
}

/**
 * Gets new movies from the past 30 days but if we get fewer than 10 results, then we try the last 60 days and just hope for the best.
 * @returns {Promise<any|null>} TMDB response payload or `null` on failure.
 */
export async function getNewReleases() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const today = new Date();
  const startDate30 = formatDate(thirtyDaysAgo);
  const startDate60 = formatDate(sixtyDaysAgo);
  const endDate = formatDate(today);
  let result = await fetchTMDBData(`/discover/movie?sort_by=primary_release_date.desc&primary_release_date.gte=${startDate30}&primary_release_date.lte=${endDate}&page=1&include_adult=false&vote_count.gte=10`);
  
  if (result && result.results && result.results.length < 10) {
    result = await fetchTMDBData(`/discover/movie?sort_by=primary_release_date.desc&primary_release_date.gte=${startDate60}&primary_release_date.lte=${endDate}&page=1&include_adult=false&vote_count.gte=10`);
  }
  
  return result;
}

// Genre Functions (Exports)

/**
 * Gets a whole list of movie genres from TMDB (19 Genres)
 * @returns {Promise<{id:number,name:string}[]|null>}
 */
export async function getAllMovieGenres() {
  const data = await fetchTMDBData('/genre/movie/list', { ttlMs: LONG_CACHE_TTL_MS });
  const arr = Array.isArray(data?.genres) ? data.genres : [];
  return arr;
}

/**
 * Gets an even bigger list of tv genres from TMDB (16 Genres)
 * @returns {Promise<{id:number,name:string}[]|null>}
 */
export async function getAllTVGenres() {
  const data = await fetchTMDBData('/genre/tv/list', { ttlMs: LONG_CACHE_TTL_MS });
  const arr = Array.isArray(data?.genres) ? data.genres : [];
  return arr;
}

/**
 * Gets the most frequent genres in a set time.
 * @param {string|null} [startDate]
 * @param {string|null} [endDate]
 * @param {string} [sortBy='popularity.desc']
 * @param {number} [pages=2]
 * @param {number} [limit=12]
 * @returns {Promise<number[]|null>}
 */
export async function getTopGenres({ startDate = null, endDate = null, sortBy = 'popularity.desc', pages = 2, limit = 12 } = {}) {
  return await getTopGenresByMediaType({ mediaType: 'movie', startDate, endDate, sortBy, pages, limit });
}

/**
 * If you want to get the most common genres in the last 30 days.
 * @param {number} [limit=12] - Max number of genre ids to return
 * @returns {Promise<number[]|null>}
 */
export async function getTopGenresLast30Days(limit = 12) {
  try {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const start = formatDate(thirtyDaysAgo);
    const end = formatDate(today);

    return await getTopGenres({ startDate: start, endDate: end, sortBy: 'popularity.desc', limit });
  } catch (e) {
    console.error('Failed to get top genres', e);
    return null;
  }
}

/**
 * Gets the most common TV genres in a set time.
 * @param {string|null} [startDate]
 * @param {string|null} [endDate]
 * @param {string} [sortBy='popularity.desc']
 * @param {number} [pages=2]
 * @param {number} [limit=12]
 * @returns {Promise<number[]|null>}
 */
export async function getTopTVGenres({ startDate = null, endDate = null, sortBy = 'popularity.desc', pages = 2, limit = 12 } = {}) {
  return await getTopGenresByMediaType({ mediaType: 'tv', startDate, endDate, sortBy, pages, limit });
}

// Discovery Functions (Exports)

/**
 * Gets movies with params of your choosing.
 * @param {string} [sortBy] - TMDB sort_by (e.g., "popularity.desc").
 * @param {string|null} [startDate] - YYYY-MM-DD for primary_release_date.gte
 * @param {string|null} [endDate] - YYYY-MM-DD for primary_release_date.lte
 * @param {number[]} [genreIds] - One or more TMDB genre ids (e.g., [18, 53])
 * @param {number} [page=1] - Result page
 * @param {number} [voteCountGte] - Optional minimum vote count
 * @param {number} [voteAverageGte] - Optional minimum vote average
 * @returns {Promise<any|null>}
 */
export async function discoverMovies(params = {}) {
  const { sortBy = 'popularity.desc', startDate = null, endDate = null, genreIds = [], page = 1, voteCountGte, voteAverageGte, genreMatchAll = false, genreIdsOr = [] } = params;

  const qp = new URLSearchParams();
  setCommonDiscoverParams(qp, { sortBy, startDate, endDate, genreIds, page, voteCountGte, voteAverageGte });
  if (startDate) qp.set('primary_release_date.gte', startDate);
  if (endDate) qp.set('primary_release_date.lte', endDate);
  if (genreMatchAll && Array.isArray(genreIds) && genreIds.length > 1) qp.set('with_genres', genreIds.join(','));
  if (Array.isArray(genreIdsOr) && genreIdsOr.length > 1) qp.set('with_genres', genreIdsOr.join('|'));
  return await fetchTMDBData(`/discover/movie?${qp.toString()}`);
}

/**
 * Gets TV with params of your choosing.
 * @param {string} [sortBy] - TMDB sort_by (e.g., "popularity.desc").
 * @param {string|null} [startDate] - YYYY-MM-DD for first_air_date.gte
 * @param {string|null} [endDate] - YYYY-MM-DD for first_air_date.lte
 * @param {number[]} [genreIds] - One or more TMDB genre ids (e.g., [18, 53])
 * @param {number} [page=1] - Result page
 * @param {number} [voteCountGte] - Optional minimum vote count
 * @param {number} [voteAverageGte] - Optional minimum vote average
 * @returns {Promise<any|null>}
 */
export async function discoverTV(params = {}) {
  const { sortBy = 'popularity.desc', startDate = null, endDate = null, genreIds = [], page = 1, voteCountGte, voteAverageGte, genreMatchAll = false, genreIdsOr = [] } = params;

  const qp = new URLSearchParams();
  setCommonDiscoverParams(qp, { sortBy, startDate, endDate, genreIds, page, voteCountGte, voteAverageGte });
  if (startDate) qp.set('first_air_date.gte', startDate);
  if (endDate) qp.set('first_air_date.lte', endDate);
  if (genreMatchAll && Array.isArray(genreIds) && genreIds.length > 1) qp.set('with_genres', genreIds.join(','));
  if (Array.isArray(genreIdsOr) && genreIdsOr.length > 1) qp.set('with_genres', genreIdsOr.join('|'));
  return await fetchTMDBData(`/discover/tv?${qp.toString()}`);
}

// Runtime Functions (Exports)

/**
 * Get runtime (in minutes) for a movie or TV show by id.
 * @param {number|string} id - TMDB id.
 * @param {('movie'|'tv')} [mediaType='movie'] - Media type.
 * @returns {Promise<number|null>} Runtime in minutes, or `null` if unavailable.
 */
export async function getTitleRuntime(id, mediaType = 'movie') {
  const key = `${mediaType}:${id}`;
  if (runtimeCache.has(key)) {
    const cached = runtimeCache.get(key);
    if (typeof cached === 'number' && cached > 0) return cached;
    try { runtimeCache.delete(key); } catch {}
  }
  try {
    const endpoint = mediaType === 'tv' ? `/tv/${id}` : `/movie/${id}`;
    const details = await fetchTMDBData(endpoint);
    let value = null;
    if (details) {
      if (mediaType === 'tv') {
        if (typeof details.number_of_episodes === 'number') value = details.number_of_episodes;
      } else {
        value = details.runtime ?? null;
      }
    }
    if (typeof value === 'number' && value > 0) runtimeCache.set(key, value);
    return value;
  } catch (e) {
    console.error('Failed to fetch runtime', e);
    return null;
  }
}

// Cache Management (Internal Helpers)

/**
 * Delete the oldest entry in the response cache if it's over the max number of entries
 * @returns {void}
 */
function deleteOldestEntry() {
  while (responseCache.size > RESPONSE_CACHE_MAX_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey === undefined) break;
    responseCache.delete(oldestKey);
  }
}

/**
 * Gets popular movies or TV shows from the last 7 days
 * @param {string} mediaType - 'movie' or 'tv'
 * @returns {Promise<any|null>}
 */
function getPopularLast7Days(mediaType) {
  const today = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 7);
  const start = formatDate(sevenDaysAgo);
  const end = formatDate(today);
  const commonParams = { sortBy: 'popularity.desc', startDate: start, endDate: end, page: 1, voteCountGte: 10 };
  return mediaType === 'tv' ? discoverTV(commonParams) : discoverMovies(commonParams);
}

/**
 * Builds common query params for both movie and TV discovery
 * @param {URLSearchParams} qp - The query params to set
 * @param {string} [sortBy] - TMDB sort_by (e.g., "popularity.desc")
 * @param {string|null} [startDate] - YYYY-MM-DD for date filter
 * @param {string|null} [endDate] - YYYY-MM-DD for date filter
 * @param {number[]} [genreIds] - One or more TMDB genre ids (e.g., [18, 53])
 * @param {number} [page=1] - Result page
 * @param {number} [voteCountGte] - Optional minimum vote count
 * @param {number} [voteAverageGte] - Optional minimum vote average
 */
function setCommonDiscoverParams(qp, { sortBy, startDate, endDate, genreIds, page, voteCountGte, voteAverageGte } = {}) {
  qp.set('include_adult', 'false');
  qp.set('page', String(Math.max(1, page || 1)));
  if (sortBy) qp.set('sort_by', sortBy);
  if (Array.isArray(genreIds) && genreIds.length) qp.set('with_genres', genreIds.join(','));
  if (Number.isFinite(voteCountGte)) qp.set('vote_count.gte', String(voteCountGte));
  if (Number.isFinite(voteAverageGte)) qp.set('vote_average.gte', String(voteAverageGte));
}

/**
 * Internal function to get top genres by media type
 * @param {string} mediaType - 'movie' or 'tv'
 * @param {string|null} [startDate]
 * @param {string|null} [endDate]
 * @param {string} [sortBy='popularity.desc']
 * @param {number} [pages=2]
 * @param {number} [limit=12]
 * @returns {Promise<number[]|null>}
 */
async function getTopGenresByMediaType({ mediaType, startDate = null, endDate = null, sortBy = 'popularity.desc', pages = 2, limit = 12 }) {
  try {
    const pageList = Array.from({ length: Math.max(1, pages) }, (_, i) => i + 1);
    const counts = new Map();

    const discoverFn = mediaType === 'tv' ? discoverTV : discoverMovies;
    const results = await Promise.all(pageList.map((p) => discoverFn({ sortBy, startDate, endDate, page: p, voteCountGte: 50 })));
    results.forEach((data) => {
      const arr = Array.isArray(data?.results) ? data.results : [];
      arr.forEach((m) => {
        if (Array.isArray(m?.genre_ids)) m.genre_ids.forEach((gid) => counts.set(gid, (counts.get(gid) || 0) + 1));
      });
    });

    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([gid]) => gid);
    return sorted.slice(0, Math.max(0, limit));
  } catch (e) {
    console.error('Failed to get top genres', e);
    return null;
  }
}
