/**
 * Constants! Because magic numbers are for wizards, not engineers. Though we're basically wizards at this point.
 * @module constants
 */

// TMDB API Configuration
export const TMDB_BASE_URL = 'https://tmdb-proxy.movie-night.workers.dev';
export const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500'; // Poster / movie-card
export const TMDB_BACKDROP_BASE_URL = 'https://image.tmdb.org/t/p/w1280'; // Big Poster / featured-hero
export const TMDB_BACKDROP_W780_BASE_URL = 'https://image.tmdb.org/t/p/w780'; // Smaller hero for narrow screens
export const TMDB_BACKDROP_ORIGINAL_BASE_URL = 'https://image.tmdb.org/t/p/original'; // Highest res for hero zoom

// Cache Configuration
export const RESPONSE_CACHE_MAX_ENTRIES = 200;
export const RUNTIME_CACHE_MAX_SIZE = 500;
export const RUNTIME_MAX_CONCURRENCY = 6;

// Timeout & TTL Constants
export const DEFAULT_CACHE_TTL_MS = 60000; // 1 minute
export const LONG_CACHE_TTL_MS = 86400000; // 24 hours
export const VIDEO_CACHE_TTL_MS = 600000; // 10 minutes
export const PROVIDER_CACHE_TTL_MS = 300000; // 5 minutes
export const MAX_RETRIES = 3;
export const BASE_BACKOFF_MS = 300;
export const BACKOFF_JITTER_MS = 120;

// UI Constants
export const INTERSECTION_OBSERVER_MARGIN = '200px 0px';
export const HERO_ROTATION_INTERVAL_MS = 6000;
export const SEARCH_DEBOUNCE_MS = 250;
export const PAGE_TRANSITION_DURATION_MS = 150;

// Content Limits
export const MAX_RAIL_ITEMS = 20;
export const MAX_SEARCH_RESULTS = 5;
export const MAX_HERO_SLIDES = 8;
export const MAX_PROVIDER_ICONS = 8;