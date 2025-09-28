/**
 * TMDB API utilities and data fetchers.
 *
 * Exposes helpers to fetch data from TMDB and commonly used endpoints
 * for the app. All functions return `null` on error to simplify callers.
 *
 * Note: expects Vite-style env var `VITE_TMDB_API_KEY` to be available.
 * The value should be a TMDB v4 API bearer token.
 *
 * @module api
 */

/** Base TMDB REST API URL (uses Cloudflare Worker proxy by default). */
export const TMDB_BASE_URL = 'https://tmdb-proxy.movie-night.workers.dev';

/** Base image URL used for poster images. */
export const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
/** Base image URL used for backdrop/hero images. */
export const TMDB_BACKDROP_BASE_URL = 'https://image.tmdb.org/t/p/w1280';

/** Cached runtimes by key `${mediaType}:${id}`. */
const runtimeCache = new Map();

/** In-flight request deduplication. */
const inflightRequests = new Map();
/** Simple response cache with TTL. */
const responseCache = new Map();

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * Fetch JSON data from the TMDB API with retry/backoff, dedupe, and short cache.
 *
 * @param {string} endpoint - API path beginning with "/" (e.g. "/trending/movie/week").
 * @param {object} [opts]
 * @param {number} [opts.ttlMs=60000] - Cache TTL in milliseconds
 * @param {number} [opts.maxRetries=3] - Retries on 429/5xx
 * @returns {Promise<any|null>} Parsed JSON response or `null` on failure.
 */
export async function fetchTMDBData(endpoint, opts = {}) {
  const { ttlMs = 60000, maxRetries = 3 } = opts;
  const cacheKey = endpoint;

  // Serve from cache if fresh
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Dedupe concurrent requests for same endpoint
  if (inflightRequests.has(cacheKey)) {
    try { return await inflightRequests.get(cacheKey); } catch { /* fallthrough */ }
  }

  const doFetch = async () => {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        const res = await fetch(`${TMDB_BASE_URL}${endpoint}`, { headers: { 'Content-Type': 'application/json' } });
        if (res.ok) {
          const data = await res.json();
          responseCache.set(cacheKey, { data, expiresAt: Date.now() + ttlMs });
          return data;
        }

        // Retry on 429 or 5xx
        if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
          if (attempt === maxRetries) break;
          const retryAfterHeader = res.headers.get('retry-after');
          const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
          const backoff = retryAfterMs != null ? retryAfterMs : (300 * Math.pow(2, attempt)) + Math.floor(Math.random() * 120);
          await sleep(backoff);
          attempt += 1;
          continue;
        }

        // Non-retryable error
        throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        if (attempt === maxRetries) {
          console.error('TMDB API error:', err);
          return null;
        }
        // Network error: backoff and retry
        const backoff = (300 * Math.pow(2, attempt)) + Math.floor(Math.random() * 120);
        await sleep(backoff);
        attempt += 1;
      }
    }
    return null;
  };

  const p = doFetch().finally(() => { inflightRequests.delete(cacheKey); });
  inflightRequests.set(cacheKey, p);
  return await p;
}

/**
 * Get weekly trending movies from TMDB.
 * @returns {Promise<any|null>} TMDB response payload or `null` on failure.
 */
export async function getTrendingMovies() {
  return await fetchTMDBData('/trending/movie/week');
}

/**
 * Get the most popular movies in the past 7 days.
 * Uses discover with primary_release_date window as a proxy for "popular this week".
 */
export async function getPopularMoviesLast7Days() {
  const today = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 7);
  const start = sevenDaysAgo.toISOString().split('T')[0];
  const end = today.toISOString().split('T')[0];
  return await discoverMovies({ sortBy: 'popularity.desc', startDate: start, endDate: end, page: 1, voteCountGte: 10 });
}

/**
 * Get all TMDB movie genres.
 * @returns {Promise<{id:number,name:string}[]|null>}
 */
export async function getAllMovieGenres() {
  const data = await fetchTMDBData('/genre/movie/list', { ttlMs: 24 * 60 * 60 * 1000 });
  const arr = Array.isArray(data?.genres) ? data.genres : [];
  return arr;
}

/**
 * Discover popular movies from the past month.
 * @returns {Promise<any|null>} TMDB response payload or `null` on failure.
 */
export async function getPopularMovies() {
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const dateString = oneMonthAgo.toISOString().split('T')[0];
  return await fetchTMDBData(`/discover/movie?sort_by=popularity.desc&primary_release_date.gte=${dateString}`);
}

/**
 * Discover movies released within the last 30 days.
 * If fewer than 10 results, fallback to last 60 days.
 * @returns {Promise<any|null>} TMDB response payload or `null` on failure.
 */
export async function getNewReleases() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const today = new Date();
  const startDate30 = thirtyDaysAgo.toISOString().split('T')[0];
  const startDate60 = sixtyDaysAgo.toISOString().split('T')[0];
  const endDate = today.toISOString().split('T')[0];
  let result = await fetchTMDBData(`/discover/movie?sort_by=primary_release_date.desc&primary_release_date.gte=${startDate30}&primary_release_date.lte=${endDate}&page=1&include_adult=false&vote_count.gte=10`);
  
  // If we get fewer than 10 results, try last 60 days
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
function formatDate(d) {
  return d.toISOString().split('T')[0];
}

/**
 * Discover movies with flexible filters.
 *
 * @param {Object} params
 * @param {string} [params.sortBy] - TMDB sort_by (e.g., "popularity.desc").
 * @param {string|null} [params.startDate] - YYYY-MM-DD for primary_release_date.gte
 * @param {string|null} [params.endDate] - YYYY-MM-DD for primary_release_date.lte
 * @param {number[]} [params.genreIds] - One or more TMDB genre ids
 * @param {number} [params.page=1] - Result page
 * @param {number} [params.voteCountGte] - Optional minimum vote count
 * @returns {Promise<any|null>}
 */
export async function discoverMovies(params = {}) {
  const {
    sortBy = 'popularity.desc',
    startDate = null,
    endDate = null,
    genreIds = [],
    page = 1,
    voteCountGte,
    voteAverageGte
  } = params;

  const qp = new URLSearchParams();
  qp.set('include_adult', 'false');
  qp.set('page', String(Math.max(1, page)));
  if (sortBy) qp.set('sort_by', sortBy);
  if (startDate) qp.set('primary_release_date.gte', startDate);
  if (endDate) qp.set('primary_release_date.lte', endDate);
  if (Array.isArray(genreIds) && genreIds.length) qp.set('with_genres', genreIds.join(','));
  if (typeof voteCountGte === 'number') qp.set('vote_count.gte', String(voteCountGte));
  if (typeof voteAverageGte === 'number') qp.set('vote_average.gte', String(voteAverageGte));

  return await fetchTMDBData(`/discover/movie?${qp.toString()}`);
}

/**
 * get the most frequent movie genres among popular titles in the last 30 days.
 * Fetches a couple of pages to get a reasonable sample.
 *
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
    console.error('Failed to compute top genres', e);
    return null;
  }
}

/**
 * Get the most frequent genres for a given period and sort.
 * @param {Object} params
 * @param {string|null} [params.startDate]
 * @param {string|null} [params.endDate]
 * @param {string} [params.sortBy='popularity.desc']
 * @param {number} [params.pages=2]
 * @param {number} [params.limit=12]
 * @returns {Promise<number[]|null>}
 */
export async function getTopGenres({ startDate = null, endDate = null, sortBy = 'popularity.desc', pages = 2, limit = 12 } = {}) {
  try {
    const pageList = Array.from({ length: Math.max(1, pages) }, (_, i) => i + 1);
    const counts = new Map();

    // Fetch pages in parallel
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
    console.error('Failed to compute top genres', e);
    return null;
  }
}

/**
 * Fetch runtime (in minutes) for a movie or TV show by id.
 * Caches successful lookups for the session.
 *
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
    let minutes = null;
    if (details) {
      if (mediaType === 'tv') {
        if (Array.isArray(details.episode_run_time) && details.episode_run_time.length) {
          minutes = details.episode_run_time[0] ?? null;
        }
      } else {
        minutes = details.runtime ?? null;
      }
    }
    runtimeCache.set(key, minutes);
    return minutes;
  } catch (e) {
    console.error('Failed to fetch runtime', e);
    return null;
  }
}