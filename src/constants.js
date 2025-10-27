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

// UI Dimension Constants
export const CARD_WIDTH_PX = 190;
export const DEFAULT_CONTAINER_WIDTH_PX = 800;
export const TOOLTIP_OFFSET_PX = 8;
export const SCROLL_STEP_MULTIPLIER = 0.9;

// Skeleton Loading Constants
export const MIN_SKELETON_COUNT = 6;
export const MAX_SKELETON_COUNT_RAIL = 10;
export const MAX_SKELETON_COUNT_SEARCH = 12;

// Animation Constants
export const CARD_ANIMATION_DELAY_MS = 40;
export const MAX_ANIMATION_DELAY_INDEX = 12;

// Discovery & Filtering Constants
export const VOTE_COUNT_MIN_BASIC = 50;
export const VOTE_COUNT_MIN_RATING_WINDOWED = 300;
export const VOTE_COUNT_MIN_RATING_ALLTIME = 1000;
export const VOTE_COUNT_MIN_GRID = 20;
export const VOTE_AVERAGE_MIN = 7.0;
export const GENRE_DISCOVERY_PAGES = 2;
export const GENRE_DISCOVERY_LIMIT = 12;
export const MAX_DISCOVERY_PAGES = 3;

// Retry & Timeout Constants
export const RAIL_RETRY_BASE_DELAY_MS = 1500;
export const RAIL_RETRY_MAX_DELAY_MS = 10000;
export const RAIL_RETRY_BACKOFF_MULTIPLIER = 2;
export const RAIL_RETRY_JITTER_MS = 300;
export const PROVIDER_FETCH_TIMEOUT_MS = 1500;
export const PROVIDER_MAX_RETRIES = 2;

// Intersection Observer Constants
export const GRID_LOAD_MORE_MARGIN = '1400px 0px';
export const RAIL_LAZY_LOAD_MARGIN = '1800px 0px';

// Rail & Grid Constants
export const INITIAL_RAILS_COUNT = 6;
export const RAIL_BATCH_SIZE = 4;
export const GRID_CHUNK_SIZE = 6;

// Search Constants
export const MIN_SEARCH_QUERY_LENGTH = 2;
export const TRUNCATION_THRESHOLD_PX = 1;
export const SEARCH_RESULT_GENRE_LIMIT = 2;