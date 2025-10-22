/**
 * Media-related utilities that depend on API functions.
 * This module breaks the circular dependency between utils.js and api.js.
 * @module media-utils
 */

import { fetchTMDBData } from './api.js';
import { VIDEO_CACHE_TTL_MS, LONG_CACHE_TTL_MS, MAX_RETRIES } from './constants.js';

// YouTube trailer fetcher. Because who doesn't want to watch a 2-minute trailer before committing to a 2-hour movie?
/**
 * Fetch YouTube trailer URL for a movie or TV show.
 * Prioritizes: trailer > teaser > clip
 * @param {('movie'|'tv')} type - Media type
 * @param {number|string} id - TMDB id
 * @returns {Promise<string|null>} YouTube URL or null
 */
export async function fetchTrailerUrl(type, id) {
  try {
    const data = await fetchTMDBData(`/${type}/${id}/videos`, { ttlMs: VIDEO_CACHE_TTL_MS, maxRetries: MAX_RETRIES });
    const list = Array.isArray(data?.results) ? data.results : [];
    const youtube = list.filter(v => v && v.site === 'YouTube' && v.key);
    if (youtube.length === 0) return null;
    const typeOf = (v) => (v.type || '').toLowerCase();
    const bucket = (t) => youtube.filter(v => typeOf(v) === t);
    const pickBest = (arr) => {
      if (!arr.length) return null;
      const preferEn = arr.filter(v => (v.iso_639_1 || '').toLowerCase() === 'en');
      const candidates = preferEn.length ? preferEn : arr;
      candidates.sort((a, b) => {
        const officialCmp = (b.official ? 1 : 0) - (a.official ? 1 : 0);
        if (officialCmp !== 0) return officialCmp;
        const resCmp = (b.size || 0) - (a.size || 0);
        if (resCmp !== 0) return resCmp;
        const timeCmp = (b.published_at ? Date.parse(b.published_at) : 0) - (a.published_at ? Date.parse(a.published_at) : 0);
        return timeCmp;
      });
      return candidates[0] || null;
    };
    const order = ['trailer', 'teaser', 'clip'];
    let best = null;
    for (const t of order) { best = pickBest(bucket(t)); if (best) break; }
    if (!best) best = pickBest(youtube);
    return best && best.key ? `https://www.youtube.com/watch?v=${best.key}` : null;
  } catch {
    return null;
  }
}

/**
 * Fetch images (backdrops/posters) for a title.
 * @param {('movie'|'tv')} type - Media type
 * @param {number|string} id - TMDB id
 * @returns {Promise<any|null>}
 */
export async function fetchTitleImages(type, id) {
  try {
    const data = await fetchTMDBData(`/${type}/${id}/images`, { ttlMs: LONG_CACHE_TTL_MS, maxRetries: MAX_RETRIES });
    return data || null;
  } catch {
    return null;
  }
}

