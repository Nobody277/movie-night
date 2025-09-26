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

/** Cached runtimes by key `${mediaType}:${id}`. */
const runtimeCache = new Map();

/**
 * Fetch JSON data from the TMDB API with a bearer token.
 *
 * @param {string} endpoint - API path beginning with "/" (e.g. "/trending/movie/week").
 * @returns {Promise<any|null>} Parsed JSON response or `null` on failure.
 */
export async function fetchTMDBData(endpoint) {
  try {
    const response = await fetch(`${TMDB_BASE_URL}${endpoint}`, {
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('TMDB API error:', error);
    return null;
  }
}

/**
 * Get weekly trending movies from TMDB.
 * @returns {Promise<any|null>} TMDB response payload or `null` on failure.
 */
export async function getTrendingMovies() {
  return await fetchTMDBData('/trending/movie/week');
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