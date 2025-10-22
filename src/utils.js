/**
 * Shared utility functions
 * @module utils
 */

// Sleep function. Not for you, for the code. You should probably get some sleep too though.
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

/**
 * Filter images by language preference (English or no language).
 * @param {Array} imageArray - Array of image objects with iso_639_1
 * @returns {Array} Filtered array (or original if no matches)
 */
export function preferEnglishImages(imageArray) {
  const en = imageArray.filter(i => (i.iso_639_1 || '').toLowerCase() === 'en' || !i.iso_639_1 || i.iso_639_1 === 'xx');
  return en.length ? en : imageArray;
}

// Picks a random item from an array. It's like a lottery but everyone's a winner... or loser depending on your data.
/**
 * Pick a random element from an array.
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