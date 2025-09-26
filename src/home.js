/**
 * Home page initialization.
 * Loads rails for Trending, Popular, and New Releases.
 *
 * @module home
 */

import { getTrendingMovies, getPopularMovies, getNewReleases } from "./api.js";
import { populateRail } from "./ui.js";

/**
 * Initialize and populate rails on the home page.
 */
export function initializeHomePage() {
  const rails = document.querySelectorAll('.rail');
  if (rails.length === 0) return;

  rails.forEach(rail => {
    const titleElement = rail.querySelector('.section-title');
    if (!titleElement) return;
    const title = (titleElement.textContent || '').toLowerCase();
    if (title.includes('trending')) {
      populateRail(rail, getTrendingMovies);
    } else if (title.includes('popular')) {
      populateRail(rail, getPopularMovies);
    } else if (title.includes('new releases')) {
      populateRail(rail, getNewReleases);
    }
  });
}