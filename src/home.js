import { getTrendingMovies, getPopularMovies, getNewReleases } from "./api.js";
import { populateRail } from "./ui.js";

export function startHomePage() {
  const rails = document.querySelectorAll('.rail');
  if (rails.length === 0) return;

  rails.forEach(rail => {
    const kind = (rail.dataset && rail.dataset.rail) || '';
    switch (kind) {
      case 'trending':
        populateRail(rail, getTrendingMovies); break;
      case 'popular':
        populateRail(rail, getPopularMovies); break;
      case 'new':
        populateRail(rail, getNewReleases); break;
      default: {
        const titleElement = rail.querySelector('.section-title');
        const title = (titleElement?.textContent || '').toLowerCase();
        if (title.includes('trending')) populateRail(rail, getTrendingMovies);
        else if (title.includes('popular')) populateRail(rail, getPopularMovies);
        else if (title.includes('new releases')) populateRail(rail, getNewReleases);
      }
    }
  });
}