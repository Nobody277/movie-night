/**
 * Helper for TMDB API: developer.themoviedb.org
 * @module api
*/
export const TMDB_BASE_URL = 'https://tmdb-proxy.movie-night.workers.dev';
export const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500'; // Poster / movie-card
export const TMDB_BACKDROP_BASE_URL = 'https://image.tmdb.org/t/p/w1280'; // Big Poster / featured-hero
const runtimeCache = new Map(); // Saving movies/tv runtime so we don't have to fetch it again
const inflightRequests = new Map(); // In-flight request deduplication so we don't make duplicate requests
const responseCache = new Map(); // Simple response cache with TTL + LRU eviction
const RESPONSE_CACHE_MAX_ENTRIES = 200; // Max number of entries in the response cache

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

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * Gets data from TMDB
 * @param {string} endpoint - API path beginning with "/" (e.g. "/trending/movie/week").
 * @param {object} [opts]
 * @param {number} [opts.ttlMs=60000] - Cache TTL in milliseconds
 * @param {number} [opts.maxRetries=3] - Retries on 429/5xx
 * @returns {Promise<any|null>} Parsed JSON response or `null` on failure.
 * @example fetchTMDBData('/trending/movie/week')
 * @example fetchTMDBData('/trending/movie/week', { ttlMs: 60000, maxRetries: 3, signal: AbortSignal.timeout(10000) })
 */
export async function fetchTMDBData(endpoint, opts = {}) {
  const { ttlMs = 60000, maxRetries = 3, signal } = opts;
  const cacheKey = endpoint;

  // If we have a cached entry then just return it
  const cached = responseCache.get(cacheKey);
  if (cached) {
    if (cached.expiresAt > Date.now()) {
      // If the cached entry is still good then we can just return it
      responseCache.delete(cacheKey);
      responseCache.set(cacheKey, cached);
      return cached.data;
    } else {
      responseCache.delete(cacheKey);
    }
  }

  // Check to make sure we don't have a request for this endpoint that has already been made
  if (!signal && inflightRequests.has(cacheKey)) {
    try { return await inflightRequests.get(cacheKey); } catch (err) { console.warn('TMDB in-flight dedupe promise rejected:', err); }
  }

  // If we've made it this far then we can make the request... finally
  const doFetch = async () => {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        const fetchOpts = { headers: { 'Content-Type': 'application/json' } };
        if (signal) fetchOpts.signal = signal;
        const res = await fetch(`${TMDB_BASE_URL}${endpoint}`, fetchOpts); // Example: https://tmdb-proxy.movie-night.workers.dev/trending/movie/week
        if (res.ok) {
          const data = await res.json();
          responseCache.set(cacheKey, { data, expiresAt: Date.now() + ttlMs });
          deleteOldestEntry();
          return data;
        }
        // 429: Too Many Requests
        // 5xx: Server Error

        // I WANT MY DATA! But we'll need to wait... until the server stops bitching.
        if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
          if (attempt === maxRetries) break;
          const retryAfterHeader = res.headers.get('retry-after');
          const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
          const backoff = retryAfterMs != null ? retryAfterMs : (300 * Math.pow(2, attempt)) + Math.floor(Math.random() * 120);
          await sleep(backoff);
          attempt += 1;
          continue;
        }

        // Welp the server threw a fit and can't give us the data we want ¯\_(ツ)_/¯
        throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        if (attempt === maxRetries) {
          console.error('TMDB API error:', err);
          return null;
        }
        // Alright lets try it again and then wait until the server stops crying.
        const backoff = (300 * Math.pow(2, attempt)) + Math.floor(Math.random() * 120);
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
  // When a signal is provided we skip dedupe tracking so callers can cancel independently
  return await doFetch();
}

/**
 * Same shit but for popularity instead of trending (big difference ik)
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

export async function getPopularMoviesLast7Days() {
  return await getPopularLast7Days('movie');
}

export async function getPopularTVLast7Days() {
  return await getPopularLast7Days('tv');
}

export async function getTrendingMovies() {
  return await fetchTMDBData('/trending/movie/week');
}

export async function getTrendingTV() {
  return await fetchTMDBData('/trending/tv/week');
}

/**
 * Gets a whole list of movie genres from TMDB (19 Genres)
 * @returns {Promise<{id:number,name:string}[]|null>}
 */
export async function getAllMovieGenres() {
  const data = await fetchTMDBData('/genre/movie/list', { ttlMs: 24 * 60 * 60 * 1000 });
  const arr = Array.isArray(data?.genres) ? data.genres : [];
  return arr;
}

/**
 * Gets an even bigger list of tv genres from TMDB (16 Genres)
 * @returns {Promise<{id:number,name:string}[]|null>}
 */
export async function getAllTVGenres() {
  const data = await fetchTMDBData('/genre/tv/list', { ttlMs: 24 * 60 * 60 * 1000 });
  const arr = Array.isArray(data?.genres) ? data.genres : [];
  return arr;
}

/**
 * Gets popular movies from the past month.
 * @returns {Promise<any|null>} TMDB response payload or `null` on failure.
 */
export async function getPopularMovies() {
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const dateString = formatDate(oneMonthAgo); // Format looks like 2025-10-05 | YYYY-MM-DD
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

/**
 * Format a Date as YYYY-MM-DD.
 * @param {Date} d
 * @returns {string}
 */
export function formatDate(d) {
  return d.toISOString().split('T')[0];
}

/**
 * Builds common query params for both movie and TV discovery.
 * if you call this you should set the date keys to their media type. (TV uses first_air_date, movies use primary_release_date)
 * @param {URLSearchParams} qp - The query params to set
 * @param {string} [sortBy] - TMDB sort_by (e.g., "popularity.desc").
 * @param {string|null} [startDate] - YYYY-MM-DD for primary_release_date.gte
 * @param {string|null} [endDate] - YYYY-MM-DD for primary_release_date.lte
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
  const { sortBy = 'popularity.desc', startDate = null, endDate = null, genreIds = [], page = 1, voteCountGte, voteAverageGte } = params;

  const qp = new URLSearchParams();
  setCommonDiscoverParams(qp, { sortBy, startDate, endDate, genreIds, page, voteCountGte, voteAverageGte });
  if (startDate) qp.set('primary_release_date.gte', startDate);
  if (endDate) qp.set('primary_release_date.lte', endDate);
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
  const { sortBy = 'popularity.desc', startDate = null, endDate = null, genreIds = [], page = 1, voteCountGte, voteAverageGte } = params;

  const qp = new URLSearchParams();
  setCommonDiscoverParams(qp, { sortBy, startDate, endDate, genreIds, page, voteCountGte, voteAverageGte });
  if (startDate) qp.set('first_air_date.gte', startDate);
  if (endDate) qp.set('first_air_date.lte', endDate);
  return await fetchTMDBData(`/discover/tv?${qp.toString()}`);
}

export const img = {
  poster: (path) => path ? `${TMDB_IMAGE_BASE_URL}${path}` : '',
  backdrop: (path) => path ? `${TMDB_BACKDROP_BASE_URL}${path}` : ''
};

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
  try {
    const pageList = Array.from({ length: Math.max(1, pages) }, (_, i) => i + 1);
    const counts = new Map();

    const results = await Promise.all(pageList.map((p) => discoverMovies({ sortBy, startDate, endDate, page: p, voteCountGte: 50 })));
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
  try {
    const pageList = Array.from({ length: Math.max(1, pages) }, (_, i) => i + 1);
    const counts = new Map();

    const results = await Promise.all(pageList.map((p) => discoverTV({ sortBy, startDate, endDate, page: p, voteCountGte: 50 })));
    results.forEach((data) => {
      const arr = Array.isArray(data?.results) ? data.results : [];
      arr.forEach((m) => {
        if (Array.isArray(m?.genre_ids)) m.genre_ids.forEach((gid) => counts.set(gid, (counts.get(gid) || 0) + 1));
      });
    });

    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([gid]) => gid);
    return sorted.slice(0, Math.max(0, limit));
  } catch (e) {
    console.error('Failed to get top TV genres', e);
    return null;
  }
}

/**
 * Get runtime (in minutes) for a movie or TV show by id.
 * @param {number|string} id - TMDB id.
 * @param {('movie'|'tv')} [mediaType='movie'] - Media type.
 * @returns {Promise<number|null>} Runtime in minutes, or `null` if unavailable.
 */
export async function getTitleRuntime(id, mediaType = 'movie') {
  const key = `${mediaType}:${id}`;
  if (runtimeCache.has(key)) return runtimeCache.get(key);
  try {
    const endpoint = mediaType === 'tv' ? `/tv/${id}` : `/movie/${id}`;
    const details = await fetchTMDBData(endpoint);
    let value = null;
    if (details) {
      if (mediaType === 'tv') {
        // If it's a tv show then we return the number of episodes instead.
        if (typeof details.number_of_episodes === 'number') value = details.number_of_episodes;
      } else {
        value = details.runtime ?? null;
      }
    }
    runtimeCache.set(key, value);
    return value;
  } catch (e) {
    console.error('Failed to fetch runtime', e);
    return null;
  }
}