/**
 * Anime detection and player utilities
 * @module anime-utils
 */

import { fetchTMDBData } from './api.js';
import { LONG_CACHE_TTL_MS } from './constants.js';

const ANIMATION_GENRE_ID = 16;
const ANIME_COUNTRIES = ['JP', 'KR', 'CN'];

export function isAnime(details, type) {
  if (!details) return false;

  const genres = Array.isArray(details.genres) 
    ? details.genres.map(g => g.id)
    : (Array.isArray(details.genre_ids) ? details.genre_ids : []);
  
  const hasAnimationGenre = genres.includes(ANIMATION_GENRE_ID);
  if (!hasAnimationGenre) return false;

  const originCountry = type === 'tv' 
    ? (details.origin_country || [])
    : (Array.isArray(details.production_countries) 
        ? details.production_countries.map(c => c.iso_3166_1)
        : []);

  const isFromAnimeCountry = Array.isArray(originCountry) && 
    originCountry.some(country => ANIME_COUNTRIES.includes(country));
  
  return isFromAnimeCountry;
}

export async function checkIsAnime(type, id, partialDetails = null) {
  try {
    if (partialDetails && (partialDetails.genres || partialDetails.genre_ids)) {
      const hasGenres = Array.isArray(partialDetails.genres) || Array.isArray(partialDetails.genre_ids);
      const hasCountry = type === 'tv' 
        ? Array.isArray(partialDetails.origin_country)
        : Array.isArray(partialDetails.production_countries);
      
      if (hasGenres && hasCountry) {
        return isAnime(partialDetails, type);
      }
    }

    const endpoint = type === 'tv' ? `/tv/${id}` : `/movie/${id}`;
    const details = await fetchTMDBData(endpoint, { ttlMs: LONG_CACHE_TTL_MS });
    
    if (!details) return false;
    
    return isAnime(details, type);
  } catch (error) {
    console.error('Failed to check if anime:', error);
    return false;
  }
}

export function buildAnimeEmbedUrl(tmdbId, season = 1, episode = 1, audio = 'dub') {
  return `https://api.cinetaro.buzz/anime/tmdb/${audio}/${tmdbId}/${season}/${episode}`;
}

export function getAnimeEmbedUrl(type, tmdbId, season = 1, episode = 1, audio = 'dub') {
  const finalSeason = type === 'movie' ? 1 : (season || 1);
  const finalEpisode = type === 'movie' ? 1 : (episode || 1);
  
  return buildAnimeEmbedUrl(tmdbId, finalSeason, finalEpisode, audio);
}