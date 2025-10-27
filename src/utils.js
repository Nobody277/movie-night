/**
 * Shared utility functions
 * @module utils
 */

// Time & Date Utilities

/**
 * Delays execution for the specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
 * Extract year from a date string.
 * @param {string} dateString - Date string (e.g., "2024-10-22")
 * @returns {string} Year as string or empty string if invalid
 */
export function formatYear(dateString) {
  try {
    if (!dateString) return "";
    const y = new Date(dateString).getFullYear();
    if (Number.isFinite(y)) return String(y);
  } catch {}
  return "";
}

// Image Utilities

/**
 * Filter images by language preference (English or no language).
 * @param {Array} imageArray - Array of image objects with iso_639_1
 * @returns {Array} Filtered array (or original if no matches)
 */
export function preferEnglishImages(imageArray) {
  const en = imageArray.filter(i => (i.iso_639_1 || '').toLowerCase() === 'en' || !i.iso_639_1 || i.iso_639_1 === 'xx');
  return en.length ? en : imageArray;
}

/**
 * Pick a random element from an array
 * @param {Array} array
 * @returns {*} Random element or undefined if empty
 */
export function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Select preferred image from TMDB images object.
 * @param {Object} images - Object with backdrops and posters arrays
 * @param {boolean} preferBackdrops - Whether to prefer backdrops over posters
 * @returns {string|null} Image file_path or null
 */
export function selectPreferredImage(images, preferBackdrops = true) {
  const backs = Array.isArray(images?.backdrops) ? images.backdrops : [];
  const posters = Array.isArray(images?.posters) ? images.posters : [];
  
  if (preferBackdrops && backs.length) {
    const preferred = preferEnglishImages(backs);
    const selected = pickRandom(preferred);
    if (selected?.file_path) return selected.file_path;
  }
  
  if (posters.length) {
    const preferred = preferEnglishImages(posters);
    const selected = pickRandom(preferred);
    if (selected?.file_path) return selected.file_path;
  }
  
  if (!preferBackdrops && backs.length) {
    const preferred = preferEnglishImages(backs);
    const selected = pickRandom(preferred);
    if (selected?.file_path) return selected.file_path;
  }
  
  return null;
}

/**
 * Check if a file path represents a backdrop image
 * @param {string} filePath - The file path to check
 * @param {Object} images - The images object containing backdrops and posters arrays
 * @returns {boolean} True if the file path is a backdrop
 */
export function isBackdropImage(filePath, images) {
  const backs = Array.isArray(images?.backdrops) ? images.backdrops : [];
  return backs.some(b => b.file_path === filePath);
}

// URL Utilities

/**
 * Convert pretty URL to file path
 * @param {string} url - The pretty URL
 * @returns {string} The corresponding file path
 */
export function prettyUrlToFile(url) {
  if (!url) return 'index.html';
  let p = String(url || '');
  if (p.startsWith('/movie-night')) p = p.slice('/movie-night'.length);
  if (!p.startsWith('/')) p = '/' + p;
  if (p === '/' || p === '/home' || p === 'home' || p === '/index.html' || p === 'index.html') return 'index.html';
  if (p === '/movies' || p === 'movies') return 'movies.html';
  if (p.startsWith('/movies/movie:')) return 'details.html';
  if (p.startsWith('/tv/tv:')) return 'details.html';
  if (p === '/tv' || p === 'tv') return 'tv.html';
  if (p === '/search' || p === 'search' || p.startsWith('/search?') || p.startsWith('search?')) return 'search.html' + (p.includes('?') ? p.slice(p.indexOf('?')) : '');
  if (p === '/my-list' || p === 'my-list') return 'my-list.html';
  if (url.includes('.html')) return url;
  return url;
}

/**
 * Convert file URL to pretty URL
 * @param {string} url - The file URL
 * @returns {string} The pretty URL
 */
export function fileUrlToPretty(url) {
  if (url.includes('movies.html')) return '/movie-night/movies';
  if (url.includes('index.html')) return '/movie-night/';
  if (url.includes('details.html')) return window.location.pathname || '/movie-night/movies';
  if (url.includes('tv.html')) return '/movie-night/tv';
  if (url.includes('search.html')) return '/movie-night/search' + (url.includes('?') ? url.slice(url.indexOf('?')) : '');
  if (url.includes('my-list.html')) return '/movie-night/my-list';
  return url.startsWith('/') ? url : `/${url}`;
}

// Event Handler Utilities

/**
 * Attach standard trailer button event handlers
 * @param {HTMLElement} button - The trailer button element
 * @param {string} trailerUrl - The trailer URL
 */
export function attachTrailerButtonHandlers(button, trailerUrl) {
  try {
    if (button.dataset.trailerBound === '1') return;
    button.dataset.trailerBound = '1';
    
    button.removeAttribute('disabled');
    
    button.addEventListener('click', (e) => {
      if (e && (e.ctrlKey || e.metaKey)) {
        try { window.open(trailerUrl, '_blank', 'noopener,noreferrer'); } catch {}
        return;
      }
      try { window.open(trailerUrl, '_blank', 'noopener,noreferrer'); } catch {}
    });
    
    button.addEventListener('mousedown', (e) => {
      if (e && e.button === 1) {
        try { e.preventDefault(); } catch {}
      }
    });
    
    button.addEventListener('auxclick', (e) => {
      if (!e || e.button !== 1) return;
      try { window.open(trailerUrl, '_blank', 'noopener,noreferrer'); } catch {}
    });
  } catch (error) {
    console.error('Failed to attach trailer button handlers:', error);
  }
}

/**
 * Attach standard card navigation handlers
 * @param {HTMLElement} card - The card element
 * @param {string} path - The destination path
 */
export function attachCardNavigationHandlers(card, path) {
  try {
    if (card.dataset.cardNavBound === '1') return;
    card.dataset.cardNavBound = '1';
    
    card.addEventListener('click', (e) => {
      const target = e.target;
      if (target && (target.closest('.card-add') || target.closest('.movie-overlay'))) return;
      if (e && (e.ctrlKey || e.metaKey)) {
        const pretty = path.startsWith('/movie-night') ? path : `/movie-night${path}`;
        try { window.open(pretty, '_blank', 'noopener,noreferrer'); } catch {}
        return;
      }
      try {
        if (window.pageTransition) window.pageTransition.navigateTo(path);
        else window.location.href = path;
      } catch {
        try { window.location.href = path; } catch {}
      }
    });

    card.addEventListener('mousedown', (e) => {
      if (e && e.button === 1) {
        const target = e.target;
        if (target && (target.closest('.card-add') || target.closest('.movie-overlay'))) return;
        try { e.preventDefault(); } catch {}
      }
    });

    card.addEventListener('auxclick', (e) => {
      if (!e || e.button !== 1) return;
      const target = e.target;
      if (target && (target.closest('.card-add') || target.closest('.movie-overlay'))) return;
      const pretty = path.startsWith('/movie-night') ? path : `/movie-night${path}`;
      try { window.open(pretty, '_blank', 'noopener,noreferrer'); } catch {}
    });
  } catch (error) {
    console.error('Failed to attach card navigation handlers:', error);
  }
}