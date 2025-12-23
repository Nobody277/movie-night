import { bestBackdropForSize, fetchTMDBData, img } from "./api.js";
import { fetchTitleImages, fetchTrailerUrl } from "./media-utils.js";
import { attachTrailerButtonHandlers, formatYear, isBackdropImage, selectPreferredImage } from "./utils.js";
import { checkIsAnime, getAnimeEmbedUrl } from "./anime-utils.js";
import { MAX_PROVIDER_ICONS, PROVIDER_CACHE_TTL_MS, PROVIDER_FETCH_TIMEOUT_MS, PROVIDER_MAX_RETRIES, VIDEO_CACHE_TTL_MS } from "./constants.js";
import { showAddToListMenu, updateAddButton } from "./ui.js";
import * as listStore from "./list-store.js";

// Source priority list (best to worst)
// Cinetaro is always first for anime, then follows this priority for all content
const SOURCE_PRIORITY = [
  'vidsrc',           // vidsrc.cc
  '111movies',        // 111Movies
  'vidup',            // VidUp
  'vidfast',          // VidFast
  'vidrock',          // VidRock
  'vidlink',          // VidLink
  'vidsrcwtf3',       // VidSrc WTF 3
  'vidzee',           // VidZee
  'videasy',          // Videasy
  'vidnest',          // VidNest
  'moviesapi',        // MoviesAPI
  'vidsrcto',         // VidSrc TO
  'vixsrc',           // VixSrc
  'vidsrcme',         // VidSrc ME
  '2embed',           // 2Embed
  'vidora',           // Vidora
  'rivestream',       // RiveStream
  'filmku',           // Filmku
  'godrive',          // GoDrive
  'autoembed',        // AutoEmbed
  'bidsrc',           // BidSrc
  'smashy',           // Smashy
  'vidsrcwtf1',       // VidSrc WTF 1
  'vidsrcwtf2',       // VidSrc WTF 2
  'vidsrcwtf4',       // VidSrc WTF 4
  'spencerdevs',      // SpencerDevs
  'vidsrccx',         // VidSrc CX
  'vidsync',          // VidSync
  'primesrc'          // PrimeSrc
];

const SOURCES = {
  vidsrc: {
    name: 'VidSrc',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://vidsrc.cc/v2/embed/movie/${details.id}?autoPlay=false`;
      } else if (type === 'tv') {
        return `https://vidsrc.cc/v2/embed/tv/${details.id}/${season}/${episode}?autoPlay=false`;
      }
      return null;
    }
  },
  cinetaro: {
    name: 'Cinetaro',
    getUrl: (type, details, season = 1, episode = 1, audio = 'sub') => {
      return getAnimeEmbedUrl(type, details.id, season, episode, audio);
    }
  },
  '111movies': {
    name: '111Movies',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://111movies.com/movie/${details.id}`;
      } else if (type === 'tv') {
        return `https://111movies.com/tv/${details.id}/${season}/${episode}`;
      }
      return null;
    }
  },
  '2embed': {
    name: '2Embed',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://www.2embed.stream/embed/movie/${details.id}`;
      } else if (type === 'tv') {
        return `https://www.2embed.stream/embed/tv/${details.id}/${season}/${episode}`;
      }
      return null;
    }
  },
  'autoembed': {
    name: 'AutoEmbed',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://player.autoembed.cc/embed/movie/${details.id}`;
      } else if (type === 'tv') {
        return `https://player.autoembed.cc/embed/tv/${details.id}/${season}/${episode}`;
      }
      return null;
    }
  },
  'bidsrc': {
    name: 'BidSrc',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://bidsrc.pro/movie/${details.id}`;
      } else if (type === 'tv') {
        return `https://bidsrc.pro/tv/${details.id}/${season}/${episode}`;
      }
      return null;
    }
  },
  'vidsrcwtf1': {
    name: 'VidSrc WTF 1',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://vidsrc.wtf/api/1/movie/?id=${details.id}&color=e01621`;
      } else if (type === 'tv') {
        return `https://vidsrc.wtf/api/1/tv/?id=${details.id}&s=${season}&e=${episode}&color=e01621`;
      }
      return null;
    }
  },
  'vidsrcwtf2': {
    name: 'VidSrc WTF 2',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://vidsrc.wtf/api/2/movie/?id=${details.id}&color=e01621`;
      } else if (type === 'tv') {
        return `https://vidsrc.wtf/api/2/tv/?id=${details.id}&s=${season}&e=${episode}&color=e01621`;
      }
      return null;
    }
  },
  'vidsrcwtf3': {
    name: 'VidSrc WTF 3',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://vidsrc.wtf/api/3/movie/?id=${details.id}&color=e01621`;
      } else if (type === 'tv') {
        return `https://vidsrc.wtf/api/3/tv/?id=${details.id}&s=${season}&e=${episode}&color=e01621`;
      }
      return null;
    }
  },
  'vidsrcwtf4': {
    name: 'VidSrc WTF 4', // TODO: Fix fullscreen
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://vidsrc.wtf/api/4/movie/?id=${details.id}&color=e01621`;
      } else if (type === 'tv') {
        return `https://vidsrc.wtf/api/4/tv/?id=${details.id}&s=${season}&e=${episode}&color=e01621`;
      }
      return null;
    }
  },
  'filmku': {
    name: 'Filmku',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://filmku.stream/embed/${details.id}`;
      } else if (type === 'tv') {
        return `https://filmku.stream/embed/${details.id}/${season}/${episode}`;
      }
      return null;
    }
  },
  'fmovies4u': {
    name: 'FMovies4U',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://fmovies4u.com/embed/tmdb-movie-${details.id}`;
      } else if (type === 'tv') {
        return `https://fmovies4u.com/embed/tmdb-tv-${details.id}/${season}/${episode}`;
      }
      return null;
    }
  },
  'godrive': {
    name: 'GoDrive',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://godriveplayer.com/player.php?tmdb=${details.id}`;
      } else if (type === 'tv') {
        return `https://godriveplayer.com/player.php?type=series&tmdb=${details.id}&season=${season}&episode=${episode}`;
      }
      return null;
    }
  },
  'moviesapi': {
    name: 'MoviesAPI',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://moviesapi.club/movie/${details.id}`;
      } else if (type === 'tv') {
        return `https://moviesapi.club/tv/${details.id}-${season}-${episode}`;
      }
      return null;
    }
  },
  'primesrc': {
    name: 'PrimeSrc',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://primesrc.me/embed/movie?tmdb=${details.id}`;
      } else if (type === 'tv') {
        return `https://primesrc.me/embed/tv?tmdb=${details.id}&season=${season}&episode=${episode}`;
      }
      return null;
    }
  },
  'rivestream': {
    name: 'RiveStream',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://rivestream.org/embed?type=movie&id=${details.id}`;
      } else if (type === 'tv') {
        return `https://rivestream.org/embed?type=tv&id=${details.id}&season=${season}&episode=${episode}`;
      }
      return null;
    }
  },
  'smashy': {
    name: 'Smashy',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://player.smashy.stream/movie/${details.id}`;
      } else if (type === 'tv') {
        return `https://player.smashy.stream/tv/${details.id}?s=${season}&e=${episode}`;
      }
      return null;
    }
  },
  'spencerdevs': {
    name: 'SpencerDevs',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://spencerdevs.xyz/movie/${details.id}`;
      } else if (type === 'tv') {
        return `https://spencerdevs.xyz/tv/${details.id}/${season}/${episode}`;
      }
      return null;
    }
  },
  'vidora': {
    name: 'Vidora',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://vidora.su/movie/${details.id}`;
      } else if (type === 'tv') {
        return `https://vidora.su/tv/${details.id}/${season}/${episode}`;
      }
      return null;
    }
  },
  'videasy': {
    name: 'Videasy',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://player.videasy.net/movie/${details.id}`;
      } else if (type === 'tv') {
        return `https://player.videasy.net/tv/${details.id}/${season}/${episode}`;
      }
      return null;
    }
  },
  'vidfast': {
    name: 'VidFast',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://vidfast.pro/movie/${details.id}`;
      } else if (type === 'tv') {
        return `https://vidfast.pro/tv/${details.id}/${season}/${episode}`;
      }
      return null;
    }
  },
  'vidify': {
    name: 'Vidify',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        const url = `https://player.vidify.top/embed/movie/${details.id}?autoplay=false&poster=true&chromecast=true&servericon=true&setting=true&pip=true&logourl=https%3A%2F%2Fi.ibb.co%2F67wTJd9R%2Fpngimg-com-netflix-PNG11.png&font=Roboto&fontcolor=6f63ff&fontsize=20&opacity=0.5&primarycolor=3b82f6&secondarycolor=1f2937&iconcolor=ffffff`;
        console.log('[Vidify Debug] Movie URL:', url);
        return url;
      } else if (type === 'tv') {
        const url = `https://player.vidify.top/embed/tv/${details.id}/${season}/${episode}?autoplay=false&poster=true&chromecast=true&servericon=true&setting=true&pip=true&logourl=https%3A%2F%2Fi.ibb.co%2F67wTJd9R%2Fpngimg-com-netflix-PNG11.png&font=Roboto&fontcolor=6f63ff&fontsize=20&opacity=0.5&primarycolor=3b82f6&secondarycolor=1f2937&iconcolor=ffffff`;
        return url;
      }
      return null;
    }
  },
  'vidzee': {
    name: 'VidZee',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://player.vidzee.wtf/embed/movie/${details.id}`;
      } else if (type === 'tv') {
        return `https://player.vidzee.wtf/embed/tv/${details.id}/${season}/${episode}`;
      }
      return null;
    }
  },
  'vidlink': {
    name: 'VidLink',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://vidlink.pro/movie/${details.id}`;
      } else if (type === 'tv') {
        return `https://vidlink.pro/tv/${details.id}/${season}/${episode}`;
      }
      return null;
    }
  },
  'vidnest': {
    name: 'VidNest',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://vidnest.fun/movie/${details.id}`;
      } else if (type === 'tv') {
        return `https://vidnest.fun/tv/${details.id}/${season}/${episode}`;
      }
      return null;
    }
  },
  'vidsrccx': {
    name: 'VidSrc CX',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://vidsrc.cx/embed/movie/${details.id}`;
      } else if (type === 'tv') {
        return `https://vidsrc.cx/embed/tv/${details.id}/${season}/${episode}`;
      }
      return null;
    }
  },
  'vidsrcme': {
    name: 'VidSrc ME',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://vidsrcme.ru/embed/movie?tmdb=${details.id}`;
      } else if (type === 'tv') {
        return `https://vidsrc-embed.ru/embed/tv?tmdb=${details.id}&season=${season}&episode=${episode}`;
      }
      return null;
    }
  },
  'vidsrcto': {
    name: 'VidSrc TO',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://vidsrc.to/embed/movie/${details.id}`;
      } else if (type === 'tv') {
        return `https://vidsrc.to/embed/tv/${details.id}/${season}/${episode}`;
      }
      return null;
    }
  },
  'vidrock': {
    name: 'VidRock',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://vidrock.net/movie/${details.id}`;
      } else if (type === 'tv') {
        return `https://vidrock.net/tv/${details.id}/${season}/${episode}`;
      }
      return null;
    }
  },
  'vixsrc': {
    name: 'VixSrc',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://vixsrc.to/movie/${details.id}/`;
      } else if (type === 'tv') {
        return `https://vixsrc.to/tv/${details.id}/${season}/${episode}/`;
      }
      return null;
    }
  },
  'vidsync': {
    name: 'VidSync',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://vidsync.xyz/embed/movie?tmdb=${details.id}`;
      } else if (type === 'tv') {
        return `https://vidsync.xyz/embed/tv?tmdb=${details.id}&s=${season}&e=${episode}`;
      }
      return null;
    }
  },
  'vidup': {
    name: 'VidUp',
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://vidup.to/movie/${details.id}`;
      } else if (type === 'tv') {
        return `https://vidup.to/tv/${details.id}/${season}/${episode}`;
      }
      return null;
    }
  }
};

let currentDetailsToken = 0;

/**
 * Initialize details page hero, metadata, trailer, providers
 * @returns {Promise<void>}
 */
export async function startDetailsPage() {
  const myToken = ++currentDetailsToken;
  const hero = document.getElementById("details-hero") || document.querySelector(".featured-hero");
  if (!hero) return;
  hero.classList.add("loading");
  try { hero.classList.add('no-zoom'); } catch {}
  renderHeroSkeleton(hero);

  const { type, id } = parseTypeAndId();
  if (!type || !id) {
    const t = hero.querySelector(".featured-title");
    if (t) t.textContent = "Title not found";
    hero.classList.remove("loading");
    return;
  }

  try {
    const data = await fetchDetailsData(type, id);
    
    if (myToken !== currentDetailsToken) return;
    
    renderDetailsHero(hero, data, type, myToken, currentDetailsToken);
    
    if (myToken !== currentDetailsToken) return;
    
    enrichDetailsWithProviders(hero, type, id, myToken, currentDetailsToken);
    
    if (myToken !== currentDetailsToken) return;
    
    await renderDetailsBody(type, id, data.details, myToken, currentDetailsToken);

    if (myToken === currentDetailsToken) {
      const urlParams = new URLSearchParams(window.location.search);
      const hash = window.location.hash;
      const shouldAutoPlay = urlParams.get('play') === 'true' || hash === '#play';
      
      if (shouldAutoPlay) {
        const season = parseInt(urlParams.get('season')) || 1;
        const episode = parseInt(urlParams.get('episode')) || 1;
        setTimeout(() => {
          triggerHeroPlayer(type, id, season, episode);
        }, 500);
      }
    }

  } catch (e) {
    console.error("Failed to load details page for", type, id, e);
    const contentEl = hero.querySelector(".featured-hero-content");
    if (contentEl) contentEl.innerHTML = `<h3 class="featured-title">Failed to load</h3>`;
  } finally {
    hero.classList.remove("loading");
  }
}

/**
 * Parse media type and ID from URL pathname
 * @returns {Object} {type: string|null, id: number|null}
 */
function parseTypeAndId() {
  try {
    const path = window.location.pathname || "";
    const segments = path.split("/").filter(Boolean);
    const token = segments.find((s) => s.includes(":"));
    if (!token) return { type: null, id: null };
    const [type, idStr] = token.split(":");
    const idNum = Number(idStr);
    if ((type === "movie" || type === "tv") && Number.isFinite(idNum) && idNum > 0) {
      return { type, id: idNum };
    }
  } catch {}
  return { type: null, id: null };
}

/**
 * Fetch details with external IDs for TV shows
 * @param {string} type
 * @param {number} id
 * @returns {Promise<Object>}
 */
async function fetchDetailsWithExternalIds(type, id) {
  const endpoint = type === 'tv' ? `/tv/${id}` : `/movie/${id}`;
  const details = await fetchTMDBData(endpoint);
  if (!details) throw new Error("Missing details");

  if (type === 'tv') {
    try {
      const externalIds = await fetchTMDBData(`/tv/${id}/external_ids`);
      if (externalIds) {
        details.external_ids = externalIds;
      }
    } catch (error) {
      console.error('Failed to fetch external IDs:', error);
    }
  }

  return details;
}

/**
 * Fetch details data for a title
 * @param {string} type
 * @param {number} id
 * @returns {Promise<Object>}
 */
async function fetchDetailsData(type, id) {
  try {
    const details = await fetchDetailsWithExternalIds(type, id);

    const title = details.title || details.name || "Untitled";
    const year = formatYear(details.release_date || details.first_air_date);
    const rating = typeof details.vote_average === "number" ? details.vote_average.toFixed(1) : null;
    
    let backdropUrl = "";
    const heroWidth = (() => { 
      try { 
        return (document.getElementById("details-hero") || document.querySelector(".featured-hero")).clientWidth || window.innerWidth || 1280; 
      } catch { 
        return 1280; 
      } 
    })();
    
    try {
      const images = await fetchTitleImages(type, id);
      const filePath = selectPreferredImage(images, true);
      if (filePath) {
        const isBackdrop = isBackdropImage(filePath, images);
        backdropUrl = isBackdrop ? bestBackdropForSize(filePath, heroWidth) : img.poster(filePath);
      }
    } catch {}
    
    if (!backdropUrl) {
      backdropUrl = details.backdrop_path ? bestBackdropForSize(details.backdrop_path, heroWidth)
        : (details.poster_path ? img.poster(details.poster_path) : "");
    }
    
    const runtimeOrEps = formatRuntimeOrEpisodes(details, type);

    return { details, title, year, rating, backdropUrl, runtimeOrEps };
  } catch (error) {
    console.error('Failed to fetch details data for', type, id, error);
    throw error;
  }
}

/**
 * Detect user's region from browser language
 * @returns {string}
 */
function detectRegion() {
  try {
    const locale = navigator.language || navigator.userLanguage || 'en-US';
    const m = String(locale).match(/-([A-Za-z]{2})$/);
    return (m && m[1] ? m[1] : 'US').toUpperCase();
  } catch { return 'US'; }
}

/**
 * Fetch watch provider data for a title
 * @param {string} type
 * @param {number} id
 * @param {string} region
 * @returns {Promise<Array>}
 */
async function fetchWatchProviders(type, id, region) {
  try {
    const data = await fetchTMDBData(`/${type}/${id}/watch/providers`, { maxRetries: PROVIDER_MAX_RETRIES, ttlMs: PROVIDER_CACHE_TTL_MS, signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS) : undefined });
    const byRegion = data && data.results ? data.results[region] || data.results['US'] || null : null;
    if (!byRegion) return [];
    const pools = [];
    if (Array.isArray(byRegion.flatrate)) pools.push(...byRegion.flatrate);
    if (Array.isArray(byRegion.free)) pools.push(...byRegion.free);
    if (Array.isArray(byRegion.ads)) pools.push(...byRegion.ads);
    if (Array.isArray(byRegion.rent)) pools.push(...byRegion.rent);
    if (Array.isArray(byRegion.buy)) pools.push(...byRegion.buy);
    const seen = new Set();
    const list = [];
    pools.forEach((p) => {
      if (!p || !p.provider_id || seen.has(p.provider_id)) return;
      seen.add(p.provider_id);
      list.push({ id: p.provider_id, name: p.provider_name, logo: p.logo_path });
    });
    return list.slice(0, MAX_PROVIDER_ICONS);
  } catch { return []; }
}

/**
 * Render skeleton loading state for hero section
 * @param {HTMLElement} root
 */
function renderHeroSkeleton(root) {
  if (!root) return;
  root.innerHTML = `
    <div class="featured-hero-bg"></div>
    <div class="featured-hero-overlay"></div>
    <div class="featured-hero-content">
      <h3 class="featured-title">Loading...</h3>
      <div class="featured-meta">
        <span class="meta-tag">Loading</span>
      </div>
      <div class="featured-cta">
        <button class="btn watch-now" type="button" disabled>Watch Now</button>
        <button class="btn" type="button" disabled>Watch Trailer</button>
      </div>
    </div>
  `;
}

/**
 * Render hero section with details data
 * @param {HTMLElement} hero
 * @param {Object} data
 * @param {string} type
 * @param {number} myToken
 * @param {number} currentDetailsToken
 */
function renderDetailsHero(hero, data, type, myToken, currentDetailsToken) {
  try {
    const { title, year, rating, backdropUrl, runtimeOrEps, details } = data;
    
    if (myToken !== currentDetailsToken) return;
    
    const bgEl = hero.querySelector(".featured-hero-bg");
    if (bgEl) {
      bgEl.classList.remove("slide-enter");
      void bgEl.offsetWidth;
      bgEl.style.backgroundImage = backdropUrl ? `url('${backdropUrl}')` : "";
      bgEl.classList.add("slide-enter");
    }

    const contentEl = hero.querySelector(".featured-hero-content");
    if (contentEl) {
      contentEl.classList.remove("slide-enter");
      void contentEl.offsetWidth;
      contentEl.innerHTML = `
        <h3 class="featured-title">${title}</h3>
        <div class="featured-meta">
          ${rating ? `<span class=\"meta-tag rating\">★ ${rating}</span>` : ""}
          ${year ? `<span class=\"meta-tag year\">${year}</span>` : ""}
          <span class="meta-tag type">${type === 'tv' ? 'Show' : 'Movie'}</span>
          <span class="meta-tag runtime">${runtimeOrEps}</span>
        </div>
        <div class="featured-providers" aria-label="Streaming providers"></div>
        <div class="featured-cta">
          <button class="btn watch-now" type="button">Watch Now</button>
          <button class="btn watch-trailer" type="button">Watch Trailer</button>
          <button class="btn add-to-list" type="button" aria-label="Add to My List">Add to List</button>
        </div>`;
      if (myToken !== currentDetailsToken) return;
      contentEl.classList.add("slide-enter");
      
      const watchNowBtn = contentEl.querySelector('.watch-now');
      if (watchNowBtn) {
        attachWatchNowHandler(watchNowBtn, type, details);
      }
      
      const addToListBtn = contentEl.querySelector('.add-to-list');
      if (addToListBtn) {
        attachAddToListHandler(addToListBtn, type, details);
      }
    }

    try { document.title = `${title} (${year || ''}) - Movie Night`.trim(); } catch {}
  } catch (error) {
    console.error('Failed to render details hero:', error);
  }
}

/**
 * Enrich details with providers and trailer
 * @param {HTMLElement} hero
 * @param {string} type
 * @param {number} id
 * @param {number} myToken
 * @param {number} currentDetailsToken
 */
async function enrichDetailsWithProviders(hero, type, id, myToken, currentDetailsToken) {
  try {
    const region = detectRegion();
    const providers = await fetchWatchProviders(type, id, region);
    if (myToken !== currentDetailsToken) return;
    if (Array.isArray(providers) && providers.length) {
      renderProviderIcons(providers, hero);
      updateProviderMetaTags(providers);
    }
  } catch (error) {
    console.error('Failed to fetch providers for', type, id, error);
  }

  try {
    const trailerBtn = hero.querySelector('.watch-trailer');
    const trailerUrl = await fetchTrailerUrl(type, id);
    if (myToken !== currentDetailsToken) return;
    if (trailerBtn) {
      if (trailerUrl) {
        attachTrailerButtonHandlers(trailerBtn, trailerUrl);
      } else {
        try { trailerBtn.setAttribute('disabled', 'true'); } catch {}
      }
    }
  } catch (error) {
    console.error('Failed to fetch trailer for', type, id, error);
  }
}

/**
 * Render provider icons in hero section
 * @param {Array} providers
 * @param {HTMLElement} hero
 */
function renderProviderIcons(providers, hero) {
  const container = hero.querySelector('.featured-providers');
  if (!container) return;
  const base = 'https://image.tmdb.org/t/p/w92';
  const html = providers.map((p) => {
    const src = p.logo ? `${base}${p.logo}` : '';
    return `<img class="provider-icon" src="${src}" alt="${p.name}" title="${p.name}" style="height:24px;width:auto;border-radius:4px;margin-right:6px;display:inline-block;vertical-align:middle;" loading="lazy">`;
  }).join('');
  container.innerHTML = html;
}

/**
 * Update meta tags with provider information
 * @param {Array} providers
 */
function updateProviderMetaTags(providers) {
  try {
    const head = document.head;
    let group = document.getElementById('provider-meta-group');
    if (!group) { group = document.createElement('div'); group.id = 'provider-meta-group'; head.appendChild(group); }
    group.innerHTML = '';
    const base = 'https://image.tmdb.org/t/p/w92';
    providers.slice(0, MAX_PROVIDER_ICONS).forEach((p, idx) => {
      if (!p || !p.logo) return;
      const link = document.createElement('link');
      link.setAttribute('rel', 'icon');
      link.setAttribute('type', 'image/png');
      link.setAttribute('sizes', '32x32');
      link.setAttribute('data-provider', String(p.id));
      link.setAttribute('href', `${base}${p.logo}`);
      group.appendChild(link);
      const meta = document.createElement('meta');
      meta.setAttribute('name', `provider:${idx+1}`);
      meta.setAttribute('content', p.name);
      group.appendChild(meta);
    });
  } catch {}
}

/**
 * Format runtime for movies or episode count for TV shows
 * @param {Object} details
 * @param {string} type
 * @returns {string}
 */
function formatRuntimeOrEpisodes(details, type) {
  if (type === 'tv') {
    if (Number.isFinite(details?.number_of_episodes) && details.number_of_episodes > 0) return `${details.number_of_episodes} Eps`;
    if (Array.isArray(details?.episode_run_time) && Number.isFinite(details.episode_run_time[0])) return `${details.episode_run_time[0]}min`;
    return '--';
  }
  const minutes = Number(details?.runtime);
  if (!Number.isFinite(minutes) || minutes <= 0) return "--";
  return `${Math.floor(minutes)}min`;
}

/**
 * Set up navigation buttons for a horizontal scrolling rail
 * @param {string} railSelector - CSS selector for the rail element
 * @param {string} prevSelector - CSS selector for the previous button
 * @param {string} nextSelector - CSS selector for the next button
 */
function setupRail(railSelector, prevSelector, nextSelector) {
  const rail = document.querySelector(railSelector);
  const prev = document.querySelector(prevSelector);
  const next = document.querySelector(nextSelector);
  
  if (!rail) return;
  
  const SCROLL_STEP_MULTIPLIER = 0.9;
  const step = () => Math.round(rail.clientWidth * SCROLL_STEP_MULTIPLIER);
  
  if (prev) {
    prev.addEventListener('click', () => {
      rail.scrollBy({ left: -step(), behavior: 'smooth' });
    });
  }
  
  if (next) {
    next.addEventListener('click', () => {
      rail.scrollBy({ left: step(), behavior: 'smooth' });
    });
  }
  
  rail.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      rail.scrollBy({ left: step(), behavior: 'smooth' });
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      rail.scrollBy({ left: -step(), behavior: 'smooth' });
    }
  });
  
  let dragging = false, startX = 0, startScroll = 0;
  const start = (x) => { dragging = true; startX = x; startScroll = rail.scrollLeft; };
  const move = (x) => { if (dragging) rail.scrollLeft = startScroll - (x - startX); };
  const end = () => { dragging = false; };
  
  rail.addEventListener('mousedown', e => start(e.pageX));
  window.addEventListener('mousemove', e => move(e.pageX));
  window.addEventListener('mouseup', end);
  
  rail.addEventListener('touchstart', e => start(e.touches[0].pageX), { passive: true });
  rail.addEventListener('touchmove', e => move(e.touches[0].pageX), { passive: true });
  window.addEventListener('touchend', end);
}

/**
 * Set up navigation buttons for the cast rail
 */
function setupCastRail() {
  setupRail('.detail-cast-rail', '.detail-cast-prev', '.detail-cast-next');
}

/**
 * Attach click handlers to image cards to open image viewer
 * @param {string} selector - CSS selector for image cards
 * @param {Array} images - Array of image objects
 * @param {string} imageType - 'backdrop' or 'poster'
 */
function attachImageClickHandlers(selector, images, imageType) {
  const cards = document.querySelectorAll(selector);
  cards.forEach(card => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      const index = parseInt(card.dataset.imageIndex) || 0;
      openImageViewer(images, imageType, index);
    });
  });
}

/**
 * Open image viewer modal with zoom and navigation
 * @param {Array} images - Array of image objects with file_path
 * @param {string} imageType - 'backdrop' or 'poster'
 * @param {number} startIndex - Starting image index
 */
function openImageViewer(images, imageType, startIndex = 0) {
  if (!Array.isArray(images) || images.length === 0) return;
  
  let currentIndex = Math.max(0, Math.min(startIndex, images.length - 1));
  let zoomLevel = 1;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPanX = 0;
  let dragStartPanY = 0;
  let controlsVisible = true;
  
  const modal = document.createElement('div');
  modal.className = 'image-viewer-modal';
  
  const getImageUrl = (imagePath) => {
    if (imageType === 'backdrop') {
      return img.backdropHi(imagePath);
    } else {
      // Use original size for posters too
      return imagePath ? `https://image.tmdb.org/t/p/original${imagePath}` : '';
    }
  };
  
  const updateImage = () => {
    const currentImage = images[currentIndex];
    if (!currentImage?.file_path) return;
    
    const imgElement = modal.querySelector('.image-viewer-img');
    if (imgElement) {
      imgElement.src = getImageUrl(currentImage.file_path);
      imgElement.dataset.loaded = 'false';
      imgElement.style.opacity = '0';
    }
    
    const counter = modal.querySelector('.image-viewer-counter');
    if (counter) {
      counter.textContent = `${currentIndex + 1} / ${images.length}`;
    }
    
    // Reset zoom and pan when changing images
    zoomLevel = 1;
    panX = 0;
    panY = 0;
    updateZoom();
  };
  
  const getMousePositionInImage = (e) => {
    const imgElement = modal.querySelector('.image-viewer-img');
    const container = modal.querySelector('.image-viewer-container');
    if (!imgElement || !container) return { x: 0, y: 0 };
    
    const rect = container.getBoundingClientRect();
    const containerCenterX = rect.left + rect.width / 2;
    const containerCenterY = rect.top + rect.height / 2;
    
    // Mouse position relative to container center
    const mouseX = e.clientX - containerCenterX;
    const mouseY = e.clientY - containerCenterY;
    
    return { x: mouseX, y: mouseY };
  };
  
  const zoomAtPoint = (delta, mouseX, mouseY) => {
    const oldZoom = zoomLevel;
    const zoomFactor = delta > 0 ? 1.2 : 1 / 1.2;
    const newZoom = Math.max(1, Math.min(zoomLevel * zoomFactor, 5));
    
    if (newZoom === oldZoom) return;
    
    // Calculate the point in image coordinates before zoom
    const pointX = (mouseX - panX * oldZoom) / oldZoom;
    const pointY = (mouseY - panY * oldZoom) / oldZoom;
    
    // Calculate new pan to keep the point under the mouse
    panX = (mouseX - pointX * newZoom) / newZoom;
    panY = (mouseY - pointY * newZoom) / newZoom;
    
    zoomLevel = newZoom;
    
    // Reset pan if zoomed out to 1x
    if (zoomLevel === 1) {
      panX = 0;
      panY = 0;
    }
    
    updateZoom();
  };
  
  const updateZoom = () => {
    const imgElement = modal.querySelector('.image-viewer-img');
    const container = modal.querySelector('.image-viewer-container');
    if (!imgElement || !container) return;
    
    imgElement.style.transform = `scale(${zoomLevel}) translate(${panX}px, ${panY}px)`;
    container.classList.toggle('zoomed', zoomLevel > 1);
  };
  
  const resetZoom = () => {
    zoomLevel = 1;
    panX = 0;
    panY = 0;
    updateZoom();
  };
  
  const toggleControls = () => {
    controlsVisible = !controlsVisible;
    const controls = modal.querySelector('.image-viewer-controls');
    const navButtons = modal.querySelectorAll('.image-viewer-nav');
    const eyeBtn = modal.querySelector('.image-viewer-toggle-controls');
    
    if (controls) {
      controls.classList.toggle('hidden', !controlsVisible);
    }
    
    navButtons.forEach(btn => {
      btn.classList.toggle('hidden', !controlsVisible);
    });
    
    if (eyeBtn) {
      eyeBtn.innerHTML = controlsVisible 
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><path d="M15.008,6.083l.881-1.441c.216-.354,.105-.815-.248-1.031-.354-.215-.815-.105-1.031,.248l-.907,1.482c-.678-.331-1.388-.588-2.124-.769l.333-1.655c.082-.406-.182-.802-.587-.883-.405-.078-.802,.181-.883,.587l-.339,1.685c-.364-.037-.732-.057-1.103-.057s-.739,.02-1.103,.057l-.339-1.685c-.082-.406-.48-.666-.883-.587-.406,.082-.669,.477-.587,.883l.333,1.655c-.736,.181-1.446,.438-2.124,.769l-.907-1.482c-.215-.353-.677-.463-1.031-.248-.353,.216-.464,.678-.248,1.031l.881,1.441c-.594,.402-1.154,.867-1.668,1.392-.29,.295-.285,.771,.011,1.061,.295,.29,.77,.285,1.061-.011,1.754-1.789,4.1-2.774,6.605-2.774s4.851,.985,6.605,2.774c.147,.15,.341,.225,.536,.225,.189,0,.379-.071,.525-.214,.296-.29,.301-.765,.011-1.061-.515-.525-1.074-.99-1.668-1.392Z" fill="currentColor"/><circle cx="9" cy="10.5" r="3.5" fill="currentColor"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><path d="M16.666,6.734c-.295-.29-.77-.285-1.061,.011-1.754,1.789-4.1,2.774-6.605,2.774s-4.851-.985-6.605-2.774c-.29-.295-.765-.3-1.061-.011-.296,.29-.301,.765-.011,1.061,.515,.525,1.074,.99,1.669,1.393l-.881,1.441c-.216,.353-.105,.815,.249,1.031,.122,.075,.257,.11,.391,.11,.252,0,.499-.127,.64-.359l.906-1.482c.678,.331,1.388,.588,2.124,.769l-.333,1.655c-.082,.406,.182,.802,.587,.883,.05,.01,.1,.015,.149,.015,.35,0,.663-.246,.734-.602l.339-1.685c.364,.037,.732,.057,1.103,.057s.739-.02,1.103-.057l.339,1.685c.072,.356,.385,.602,.734,.602,.049,0,.099-.005,.149-.015,.406-.082,.669-.477,.587-.883l-.333-1.655c.736-.181,1.446-.438,2.124-.769l.906,1.482c.141,.231,.388,.359,.64,.359,.134,0,.269-.036,.391-.11,.354-.216,.465-.678,.249-1.031l-.881-1.441c.594-.403,1.154-.867,1.669-1.393,.29-.295,.285-.771-.011-1.061Z" fill="currentColor"/></svg>`;
    }
  };
  
  const nextImage = () => {
    if (currentIndex < images.length - 1) {
      currentIndex++;
      updateImage();
      const prevBtn = modal.querySelector('.image-viewer-prev');
      const nextBtn = modal.querySelector('.image-viewer-next');
      if (prevBtn) prevBtn.disabled = currentIndex === 0;
      if (nextBtn) nextBtn.disabled = currentIndex === images.length - 1;
    }
  };
  
  const prevImage = () => {
    if (currentIndex > 0) {
      currentIndex--;
      updateImage();
      const prevBtn = modal.querySelector('.image-viewer-prev');
      const nextBtn = modal.querySelector('.image-viewer-next');
      if (prevBtn) prevBtn.disabled = currentIndex === 0;
      if (nextBtn) nextBtn.disabled = currentIndex === images.length - 1;
    }
  };
  
  modal.innerHTML = `
    <div class="image-viewer-overlay"></div>
    <button class="image-viewer-close" aria-label="Close viewer" type="button">&times;</button>
    <button class="image-viewer-toggle-controls" aria-label="Toggle controls" type="button" title="Toggle controls">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><path d="M15.008,6.083l.881-1.441c.216-.354,.105-.815-.248-1.031-.354-.215-.815-.105-1.031,.248l-.907,1.482c-.678-.331-1.388-.588-2.124-.769l.333-1.655c.082-.406-.182-.802-.587-.883-.405-.078-.802,.181-.883,.587l-.339,1.685c-.364-.037-.732-.057-1.103-.057s-.739,.02-1.103,.057l-.339-1.685c-.082-.406-.48-.666-.883-.587-.406,.082-.669,.477-.587,.883l.333,1.655c-.736,.181-1.446,.438-2.124,.769l-.907-1.482c-.215-.353-.677-.463-1.031-.248-.353,.216-.464,.678-.248,1.031l.881,1.441c-.594,.402-1.154,.867-1.668,1.392-.29,.295-.285,.771,.011,1.061,.295,.29,.77,.285,1.061-.011,1.754-1.789,4.1-2.774,6.605-2.774s4.851,.985,6.605,2.774c.147,.15,.341,.225,.536,.225,.189,0,.379-.071,.525-.214,.296-.29,.301-.765,.011-1.061-.515-.525-1.074-.99-1.668-1.392Z" fill="currentColor"/><circle cx="9" cy="10.5" r="3.5" fill="currentColor"/></svg>
    </button>
    <button class="image-viewer-nav image-viewer-prev" aria-label="Previous image" type="button" ${currentIndex === 0 ? 'disabled' : ''}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M15 18l-6-6 6-6"/>
      </svg>
    </button>
    <button class="image-viewer-nav image-viewer-next" aria-label="Next image" type="button" ${currentIndex === images.length - 1 ? 'disabled' : ''}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 18l6-6-6-6"/>
      </svg>
    </button>
    <div class="image-viewer-container">
      <img class="image-viewer-img" src="${getImageUrl(images[currentIndex]?.file_path)}" alt="${imageType === 'backdrop' ? 'Backdrop' : 'Poster'}" />
    </div>
    <div class="image-viewer-controls">
      <div class="image-viewer-counter">${currentIndex + 1} / ${images.length}</div>
    </div>
  `;
  
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  
  const imgElement = modal.querySelector('.image-viewer-img');
  const container = modal.querySelector('.image-viewer-container');
  const closeBtn = modal.querySelector('.image-viewer-close');
  const prevBtn = modal.querySelector('.image-viewer-prev');
  const nextBtn = modal.querySelector('.image-viewer-next');
  const toggleControlsBtn = modal.querySelector('.image-viewer-toggle-controls');
  
  // Image load handler
  if (imgElement) {
    imgElement.addEventListener('load', () => {
      imgElement.dataset.loaded = 'true';
      imgElement.style.opacity = '1';
    });
  }
  
  // Close handlers
  const closeViewer = () => {
    modal.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', handleKeydown);
  };
  
  closeBtn?.addEventListener('click', closeViewer);
  modal.querySelector('.image-viewer-overlay')?.addEventListener('click', closeViewer);
  
  // Toggle controls handler
  toggleControlsBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleControls();
  });
  
  // Navigation handlers
  prevBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    prevImage();
  });
  
  nextBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    nextImage();
  });
  
  // Mouse wheel zoom at mouse position
  container?.addEventListener('wheel', (e) => {
    e.preventDefault();
    const mousePos = getMousePositionInImage(e);
    zoomAtPoint(e.deltaY, mousePos.x, mousePos.y);
  }, { passive: false });
  
  // Drag to pan when zoomed
  container?.addEventListener('mousedown', (e) => {
    if (zoomLevel > 1) {
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartPanX = panX;
      dragStartPanY = panY;
      container.style.cursor = 'grabbing';
    }
  });
  
  window.addEventListener('mousemove', (e) => {
    if (isDragging && zoomLevel > 1) {
      panX = dragStartPanX + (e.clientX - dragStartX) / zoomLevel;
      panY = dragStartPanY + (e.clientY - dragStartY) / zoomLevel;
      updateZoom();
    }
  });
  
  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      if (container) container.style.cursor = zoomLevel > 1 ? 'grab' : 'default';
    }
  });
  
  // Touch support for pinch zoom and pan
  let touchStartDistance = 0;
  let touchStartZoom = 1;
  let touchStartPanX = 0;
  let touchStartPanY = 0;
  let touchStartCenterX = 0;
  let touchStartCenterY = 0;
  
  container?.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      touchStartDistance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
      touchStartZoom = zoomLevel;
      touchStartPanX = panX;
      touchStartPanY = panY;
      
      const rect = container.getBoundingClientRect();
      touchStartCenterX = ((touch1.clientX + touch2.clientX) / 2) - (rect.left + rect.width / 2);
      touchStartCenterY = ((touch1.clientY + touch2.clientY) / 2) - (rect.top + rect.height / 2);
    } else if (e.touches.length === 1 && zoomLevel > 1) {
      isDragging = true;
      dragStartX = e.touches[0].clientX;
      dragStartY = e.touches[0].clientY;
      dragStartPanX = panX;
      dragStartPanY = panY;
    }
  }, { passive: true });
  
  container?.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
      const scale = distance / touchStartDistance;
      const newZoom = Math.max(1, Math.min(touchStartZoom * scale, 5));
      
      if (newZoom !== zoomLevel) {
        const rect = container.getBoundingClientRect();
        const centerX = ((touch1.clientX + touch2.clientX) / 2) - (rect.left + rect.width / 2);
        const centerY = ((touch1.clientY + touch2.clientY) / 2) - (rect.top + rect.height / 2);
        
        const pointX = (centerX - touchStartPanX * touchStartZoom) / touchStartZoom;
        const pointY = (centerY - touchStartPanY * touchStartZoom) / touchStartZoom;
        
        panX = (centerX - pointX * newZoom) / newZoom;
        panY = (centerY - pointY * newZoom) / newZoom;
        zoomLevel = newZoom;
        
        if (zoomLevel === 1) {
          panX = 0;
          panY = 0;
        }
        
        updateZoom();
      }
    } else if (e.touches.length === 1 && isDragging && zoomLevel > 1) {
      e.preventDefault();
      panX = dragStartPanX + (e.touches[0].clientX - dragStartX) / zoomLevel;
      panY = dragStartPanY + (e.touches[0].clientY - dragStartY) / zoomLevel;
      updateZoom();
    }
  }, { passive: false });
  
  container?.addEventListener('touchend', () => {
    isDragging = false;
  }, { passive: true });
  
  // Keyboard handlers
  const handleKeydown = (e) => {
    if (e.key === 'Escape') {
      closeViewer();
    } else if (e.key === 'ArrowLeft') {
      prevImage();
    } else if (e.key === 'ArrowRight') {
      nextImage();
    } else if (e.key === '0') {
      resetZoom();
    } else if (e.key === 'h' || e.key === 'H') {
      toggleControls();
    }
  };
  
  document.addEventListener('keydown', handleKeydown);
  
  // Update cursor when zoomed
  if (container) {
    container.style.cursor = zoomLevel > 1 ? 'grab' : 'default';
  }
}

/**
 * Render details body section with overview, cast, crew, etc.
 * @param {string} type
 * @param {number} id
 * @param {Object} details
 * @param {number} myToken
 * @param {number} currentDetailsToken
 */
async function renderDetailsBody(type, id, details, myToken, currentDetailsToken) {
  const bodyEl = document.getElementById('details-body');
  if (!bodyEl) return;
  
  try {
    const normalizeTvAggregateCast = (arr) => {
      const castArr = Array.isArray(arr) ? arr : [];
      return castArr.map((p) => {
        const role0 = Array.isArray(p?.roles) ? p.roles[0] : null;
        const character = (role0 && role0.character) ? role0.character : (p?.character || '');
        const episodeCount = Array.isArray(p?.roles)
          ? p.roles.reduce((sum, r) => sum + (Number(r?.episode_count) || 0), 0)
          : (Number(p?.total_episode_count) || 0);
        return { ...p, character, episodeCount };
      });
    };

    let cast = [];
    let crew = [];

    if (type === 'tv') {
      const [aggCredits, stdCredits] = await Promise.all([
        fetchTMDBData(`/tv/${id}/aggregate_credits`),
        fetchTMDBData(`/tv/${id}/credits`)
      ]);
      cast = normalizeTvAggregateCast(Array.isArray(aggCredits?.cast) ? aggCredits.cast : []);
      crew = Array.isArray(stdCredits?.crew) ? stdCredits.crew : [];
    } else {
      const credits = await fetchTMDBData(`/movie/${id}/credits`);
      cast = Array.isArray(credits?.cast) ? credits.cast : [];
      crew = Array.isArray(credits?.crew) ? credits.crew : [];
    }

    if (myToken !== currentDetailsToken) return;
    const director = crew.find(c => c.job === 'Director');
    const writers = crew.filter(c => c.department === 'Writing').slice(0, 3);
    const producers = crew.filter(c => c.job === 'Producer' || c.job === 'Executive Producer').slice(0, 2);
    
    let html = '';
    
    if (details.overview) {
      html += `
        <div class="detail-section">
          <h3 class="detail-title">Overview</h3>
          <p class="detail-overview">${details.overview}</p>
        </div>
      `;
    }
    
    if (type === 'tv' && details.number_of_seasons > 0) {
      html += `
        <div class="detail-section">
          <div class="season-header">
            <h3 class="detail-title">Episodes</h3>
            <div class="season-controls">
              <div class="season-dropdown">
                <button class="season-toggle" id="season-toggle">Season 1</button>
                <div class="season-menu" id="season-menu">
                  ${Array.from({ length: details.number_of_seasons }, (_, i) => i + 1)
                    .map(num => `<button class="season-option" data-season="${num}">Season ${num}</button>`)
                    .join('')}
                </div>
              </div>
              <div class="episode-filter-dropdown">
                <button class="episode-filter-toggle" id="episode-filter-toggle">Episode Order</button>
                <div class="episode-filter-menu" id="episode-filter-menu">
                  <button class="episode-filter-option active" data-filter="episode">Episode Order</button>
                  <button class="episode-filter-option" data-filter="rating">Best Rated</button>
                  <button class="episode-filter-option" data-filter="popular">Most Popular</button>
                </div>
              </div>
            </div>
          </div>
          <div class="episodes-grid" id="episodes-grid">
            <div class="episodes-loading">Loading episodes...</div>
          </div>
        </div>
      `;
    }
    
    const castList = cast.slice(0, 30);
    if (castList.length > 0) {
      html += `
        <div class="detail-section">
          <div class="detail-cast-header">
            <h3 class="detail-title">Cast</h3>
            <div class="detail-cast-cta">
              <button class="rail-btn detail-cast-prev" aria-label="Scroll left" type="button">
                <span class="rail-icon">‹</span>
              </button>
              <button class="rail-btn detail-cast-next" aria-label="Scroll right" type="button">
                <span class="rail-icon">›</span>
              </button>
            </div>
          </div>
          <div class="detail-cast-rail" tabindex="0">
      `;
      castList.forEach(person => {
        const hasProfile = Boolean(person?.profile_path);
        const imgUrl = hasProfile ? img.poster(person.profile_path) : '';
        const eps = Number(person?.episodeCount) || 0;
        const epsLabel = eps > 0 ? `${eps} Episode${eps === 1 ? '' : 's'}` : '';
        html += `
          <div class="detail-cast-card">
            ${hasProfile
              ? `<img src="${imgUrl}" alt="${person.name}" class="detail-cast-img" loading="lazy">`
              : `<div class="detail-cast-img detail-cast-img--placeholder" role="img" aria-label="${person?.name || 'Cast member'}">
                   <svg class="detail-cast-placeholder-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true" focusable="false">
                     <!--!Font Awesome Free v7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.-->
                     <path d="M320 312C386.3 312 440 258.3 440 192C440 125.7 386.3 72 320 72C253.7 72 200 125.7 200 192C200 258.3 253.7 312 320 312zM290.3 368C191.8 368 112 447.8 112 546.3C112 562.7 125.3 576 141.7 576L498.3 576C514.7 576 528 562.7 528 546.3C528 447.8 448.2 368 349.7 368L290.3 368z"/>
                   </svg>
                 </div>`
            }
            <div class="detail-cast-name">${person.name}</div>
            <div class="detail-cast-char">${person.character || ''}</div>
            ${epsLabel ? `<div class="detail-cast-eps">${epsLabel}</div>` : ``}
          </div>
        `;
      });
      html += '</div></div>';
    }
    
    const majorCrew = [];
    if (director) majorCrew.push({ role: 'Director', name: director.name });
    
    if (writers.length > 0) {
      majorCrew.push({ role: 'Writer', name: writers[0].name });
    }
    
    const cinematographer = crew.find(c => c.job === 'Director of Photography');
    if (cinematographer) {
      majorCrew.push({ role: 'Cinematography', name: cinematographer.name });
    }
    
    const composer = crew.find(c => c.job === 'Original Music Composer' || c.department === 'Sound');
    if (composer) {
      majorCrew.push({ role: 'Music', name: composer.name });
    }
    
    if (majorCrew.length > 0) {
      html += '<div class="detail-section"><h3 class="detail-title">Crew</h3><div class="detail-crew-list">';
      majorCrew.forEach(member => {
        html += `<div class="detail-crew-item"><span class="crew-role">${member.role}</span><span class="crew-name">${member.name}</span></div>`;
      });
      html += '</div></div>';
    }
    
    // Fetch images for backdrops and posters sections
    let imagesData = null;
    try {
      imagesData = await fetchTitleImages(type, id);
    } catch (error) {
      console.error('Failed to fetch images:', error);
    }
    
    if (myToken !== currentDetailsToken) return;
    
    // Render backdrops section
    const backdrops = Array.isArray(imagesData?.backdrops) ? imagesData.backdrops : [];
    if (backdrops.length > 0) {
      html += `
        <div class="detail-section">
          <div class="detail-cast-header">
            <h3 class="detail-title">Backdrops</h3>
            <div class="detail-cast-cta">
              <button class="rail-btn detail-backdrops-prev" aria-label="Scroll left" type="button">
                <span class="rail-icon">‹</span>
              </button>
              <button class="rail-btn detail-backdrops-next" aria-label="Scroll right" type="button">
                <span class="rail-icon">›</span>
              </button>
            </div>
          </div>
          <div class="detail-images-rail detail-backdrops-rail" tabindex="0">
      `;
      backdrops.slice(0, 20).forEach((image, index) => {
        if (!image?.file_path) return;
        const imgUrl = img.backdrop(image.file_path);
        html += `
          <div class="detail-image-card" data-image-type="backdrop" data-image-index="${index}" data-image-path="${image.file_path}">
            <img src="${imgUrl}" alt="Backdrop" class="detail-image-img" loading="lazy">
          </div>
        `;
      });
      html += '</div></div>';
    }
    
    // Render posters section
    const posters = Array.isArray(imagesData?.posters) ? imagesData.posters : [];
    if (posters.length > 0) {
      html += `
        <div class="detail-section">
          <div class="detail-cast-header">
            <h3 class="detail-title">Posters</h3>
            <div class="detail-cast-cta">
              <button class="rail-btn detail-posters-prev" aria-label="Scroll left" type="button">
                <span class="rail-icon">‹</span>
              </button>
              <button class="rail-btn detail-posters-next" aria-label="Scroll right" type="button">
                <span class="rail-icon">›</span>
              </button>
            </div>
          </div>
          <div class="detail-images-rail detail-posters-rail" tabindex="0">
      `;
      posters.slice(0, 20).forEach((image, index) => {
        if (!image?.file_path) return;
        const imgUrl = img.poster(image.file_path);
        html += `
          <div class="detail-image-card" data-image-type="poster" data-image-index="${index}" data-image-path="${image.file_path}">
            <img src="${imgUrl}" alt="Poster" class="detail-image-img" loading="lazy">
          </div>
        `;
      });
      html += '</div></div>';
    }
    
    bodyEl.innerHTML = html;
    
    setupCastRail();
    if (backdrops.length > 0) {
      setupRail('.detail-backdrops-rail', '.detail-backdrops-prev', '.detail-backdrops-next');
      attachImageClickHandlers('.detail-backdrops-rail .detail-image-card', backdrops, 'backdrop');
    }
    if (posters.length > 0) {
      setupRail('.detail-posters-rail', '.detail-posters-prev', '.detail-posters-next');
      attachImageClickHandlers('.detail-posters-rail .detail-image-card', posters, 'poster');
    }
    
    if (type === 'tv' && details.number_of_seasons > 0) {
      const seasonToggle = document.getElementById('season-toggle');
      const seasonMenu = document.getElementById('season-menu');
      const filterToggle = document.getElementById('episode-filter-toggle');
      const filterMenu = document.getElementById('episode-filter-menu');
      
      let currentSeason = 1;
      let currentFilter = 'episode';
      const totalSeasons = details.number_of_seasons;
      
      if (seasonToggle && seasonMenu) {
        loadSeasonEpisodes(id, 1, details.external_ids?.imdb_id, 'episode', totalSeasons);
        
        seasonToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          seasonMenu.classList.toggle('open');
          if (filterMenu) filterMenu.classList.remove('open');
        });
        
        seasonMenu.querySelectorAll('.season-option').forEach(btn => {
          btn.addEventListener('click', (e) => {
            currentSeason = parseInt(btn.dataset.season);
            seasonToggle.textContent = `Season ${currentSeason}`;
            seasonMenu.classList.remove('open');
            loadSeasonEpisodes(id, currentSeason, details.external_ids?.imdb_id, currentFilter, totalSeasons);
          });
        });
      }
      
      if (filterToggle && filterMenu) {
        filterToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          filterMenu.classList.toggle('open');
          if (seasonMenu) seasonMenu.classList.remove('open');
        });
        
        filterMenu.querySelectorAll('.episode-filter-option').forEach(btn => {
          btn.addEventListener('click', (e) => {
            currentFilter = btn.dataset.filter;
            filterToggle.textContent = btn.textContent;
            filterMenu.classList.remove('open');
            
            filterMenu.querySelectorAll('.episode-filter-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            loadSeasonEpisodes(id, currentSeason, details.external_ids?.imdb_id, currentFilter, totalSeasons);
          });
        });
      }
      
      document.addEventListener('click', (e) => {
        if (seasonToggle && seasonMenu && !seasonToggle.contains(e.target) && !seasonMenu.contains(e.target)) {
          seasonMenu.classList.remove('open');
        }
        if (filterToggle && filterMenu && !filterToggle.contains(e.target) && !filterMenu.contains(e.target)) {
          filterMenu.classList.remove('open');
        }
      });
    }
  } catch (error) {
    console.error('Failed to render details body:', error);
  }
}

/**
 * Load and display episodes for a specific season
 * @param {number} tvId
 * @param {number} seasonNumber
 * @param {string} imdbId - Deprecated, kept for backward compatibility
 * @param {string} sortBy - 'episode', 'rating', or 'popular'
 * @param {number} totalSeasons - Total number of seasons
 */
async function loadSeasonEpisodes(tvId, seasonNumber, imdbId, sortBy = 'episode', totalSeasons = 1) {
  const grid = document.getElementById('episodes-grid');
  if (!grid) return;
  
  grid.innerHTML = '<div class="episodes-loading">Loading episodes...</div>';
  
  try {
    let episodes = [];
    
    if (sortBy === 'rating' || sortBy === 'popular') {
      const seasonPromises = [];
      for (let i = 1; i <= totalSeasons; i++) {
        seasonPromises.push(fetchTMDBData(`/tv/${tvId}/season/${i}`));
      }
      
      const allSeasons = await Promise.all(seasonPromises);
      
      allSeasons.forEach((seasonData, index) => {
        if (seasonData && Array.isArray(seasonData.episodes)) {
          seasonData.episodes.forEach(ep => {
            episodes.push({
              ...ep,
              season_number: index + 1
            });
          });
        }
      });
      
      if (sortBy === 'rating') {
        episodes.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
      } else if (sortBy === 'popular') {
        episodes.sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));
      }
    } else {
      const seasonData = await fetchTMDBData(`/tv/${tvId}/season/${seasonNumber}`);
      
      if (!seasonData || !Array.isArray(seasonData.episodes)) {
        grid.innerHTML = '<div class="episodes-loading">No episodes found</div>';
        return;
      }
      
      episodes = seasonData.episodes.map(ep => ({
        ...ep,
        season_number: seasonNumber
      }));
    }
    
    if (episodes.length === 0) {
      grid.innerHTML = '<div class="episodes-loading">No episodes found</div>';
      return;
    }
    
    let html = '';
    episodes.forEach(ep => {
      const stillUrl = ep.still_path ? img.backdrop(ep.still_path) : '';
      const rating = ep.vote_average ? ep.vote_average.toFixed(1) : 'N/A';
      const voteCount = ep.vote_count || 0;
      const airDate = ep.air_date ? new Date(ep.air_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      const epSeasonNum = ep.season_number || seasonNumber;
      
      const episodeLabel = sortBy !== 'episode' 
        ? `S${epSeasonNum} E${ep.episode_number} • ${ep.name}`
        : `${ep.episode_number}. ${ep.name}`;
      
      html += `
        <div class="episode-card" data-episode="${ep.episode_number}" data-season="${epSeasonNum}">
          <div class="episode-still-wrapper">
            ${stillUrl ? `<img src="${stillUrl}" alt="${ep.name}" class="episode-still" loading="lazy">` : '<div class="episode-still-placeholder"></div>'}
            <button class="episode-play-btn" data-tv-id="${tvId}" data-season="${epSeasonNum}" data-episode="${ep.episode_number}">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>
          </div>
          <div class="episode-info">
            <div class="episode-header">
              <span class="episode-number">${episodeLabel}</span>
              <span class="episode-rating">★ ${rating}${sortBy === 'popular' ? ` (${voteCount})` : ''}</span>
            </div>
            ${airDate ? `<div class="episode-date">${airDate}</div>` : ''}
            ${ep.overview ? `<div class="episode-overview">${ep.overview}</div>` : ''}
          </div>
        </div>
      `;
    });
    
    grid.innerHTML = html;
    
    grid.querySelectorAll('.episode-play-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const episodeTvId = parseInt(btn.dataset.tvId) || tvId;
        const season = parseInt(btn.dataset.season) || 1;
        const episode = parseInt(btn.dataset.episode) || 1;
        
        await triggerHeroPlayer('tv', episodeTvId, season, episode);
      });
    });
    
  } catch (error) {
    console.error('Failed to load season episodes:', error);
    grid.innerHTML = '<div class="episodes-loading">Failed to load episodes</div>';
  }
}

/**
 * Format date string to readable format
 * @param {string} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

/**
 * Trigger player in hero section (exported for external use)
 * @param {string} type
 * @param {number} id
 * @param {number} [season=1]
 * @param {number} [episode=1]
 */
export async function triggerHeroPlayer(type, id, season = 1, episode = 1) {
  try {
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const hero = document.getElementById("details-hero") || document.querySelector(".featured-hero");
    if (!hero) {
      console.warn('Hero element not found, retrying...');
      setTimeout(() => triggerHeroPlayer(type, id, season, episode), 200);
      return;
    }
    
    let details;
    try {
      details = await fetchDetailsWithExternalIds(type, id);
    } catch (error) {
      console.error('Failed to fetch details:', error);
      return;
    }
    
    const isAnimeTitle = await checkIsAnime(type, id, details);
    
    const availableSources = [];
    let defaultAudio = 'sub';
    
    if (isAnimeTitle) {
      const cinetaroUrl = SOURCES.cinetaro.getUrl(type, details, season, episode, defaultAudio);
      if (cinetaroUrl) {
        availableSources.push({ id: 'cinetaro', ...SOURCES.cinetaro });
      }
    }
    
    const allSourceIds = [...SOURCE_PRIORITY, 'fmovies4u', 'vidify'];
    allSourceIds.forEach(sourceId => {
      const source = SOURCES[sourceId];
      if (source) {
        const sourceUrl = source.getUrl(type, details, season, episode);
        if (sourceUrl) {
          availableSources.push({ id: sourceId, ...source });
        }
      }
    });
    
    if (availableSources.length === 0) {
      console.error('No available sources');
      return;
    }
    
    // Sort sources by priority and select the first one
    const sortedSources = sortSourcesByPriority(availableSources);
    const defaultSource = sortedSources[0]?.id || null;
    
    hero.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    showPlayerInHero(hero, type, details, availableSources, defaultSource, defaultAudio, isAnimeTitle, season, episode);
  } catch (error) {
    console.error('Failed to trigger hero player:', error);
  }
}

/**
 * Attach Watch Now button handler
 * @param {HTMLElement} btn
 * @param {string} type
 * @param {Object} details
 */
function attachWatchNowHandler(btn, type, details) {
  if (!btn) return;
  
  btn.addEventListener('click', async () => {
    await triggerHeroPlayer(type, details.id, 1, 1);
  });
}

/**
 * Attach Add to List button handler
 * @param {HTMLElement} btn
 * @param {string} type
 * @param {Object} details
 */
function attachAddToListHandler(btn, type, details) {
  if (!btn) return;
  
  const item = {
    id: details.id,
    type: type,
    title: details.title || details.name || 'Untitled',
    name: details.name || details.title || 'Untitled',
    poster_path: details.poster_path,
    backdrop_path: details.backdrop_path,
    vote_average: details.vote_average || 0,
    genre_ids: details.genres ? details.genres.map(g => g.id) : (details.genre_ids || []),
    release_date: details.release_date || null,
    first_air_date: details.first_air_date || null
  };
  
  updateAddButton(btn, item);
  
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    btn.blur();
    showAddToListMenu(btn, item);
  });
}

/**
 * Updates visibility of audio selectors based on active source
 * @param {HTMLElement} sourceSelector - Source selector container
 * @param {string} activeSourceId - Currently active source ID
 * @param {boolean} isAnime - Whether this is an anime title
 */
function updateAudioSelectorsVisibility(sourceSelector, activeSourceId, isAnime) {
  const sourceWrappers = sourceSelector.querySelectorAll('.source-btn-wrapper');
  sourceWrappers.forEach(wrapper => {
    const wrapperSourceId = wrapper.dataset.sourceId;
    const audioSelector = wrapper.querySelector('.source-audio-selector');
    const shouldShow = isAnime && wrapperSourceId === 'cinetaro' && wrapperSourceId === activeSourceId;
    
    if (audioSelector) {
      audioSelector.style.display = shouldShow ? 'flex' : 'none';
    }
  });
}

/**
 * Detects if the user is on a mobile device
 * @returns {boolean} True if on mobile device
 */
function isMobileDevice() {
  const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isSmallScreen = window.innerWidth <= 768;
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
  
  return (hasTouchScreen && isSmallScreen) || isMobileUA;
}

/**
 * Gets the priority index for a source (lower = higher priority)
 * @param {string} sourceId - Source identifier
 * @returns {number} Priority index, or Infinity if not found
 */
function getSourcePriority(sourceId) {
  const index = SOURCE_PRIORITY.indexOf(sourceId);
  return index === -1 ? Infinity : index;
}

/**
 * Sorts sources by priority (best to worst)
 * @param {Array} sources - Array of source objects
 * @returns {Array} Sorted sources array
 */
function sortSourcesByPriority(sources) {
  return [...sources].sort((a, b) => {
    // Cinetaro always comes first for anime
    if (a.id === 'cinetaro') return -1;
    if (b.id === 'cinetaro') return 1;
    
    const priorityA = getSourcePriority(a.id);
    const priorityB = getSourcePriority(b.id);
    
    return priorityA - priorityB;
  });
}

/**
 * Checks if a source is a VidSrc WTF source
 * @param {string} sourceId - Source identifier
 * @returns {boolean} True if source is VidSrc WTF
 */
function isVidSrcWTFSource(sourceId) {
  return sourceId && (sourceId === 'vidsrcwtf1' || sourceId === 'vidsrcwtf2' || sourceId === 'vidsrcwtf3' || sourceId === 'vidsrcwtf4');
}

/**
 * Gets embed URL for a source
 * @param {Object} sourceObj - Source object
 * @param {string} type - Media type ('movie' or 'tv')
 * @param {Object} details - Media details
 * @param {number} season - Season number
 * @param {number} episode - Episode number
 * @param {string} defaultAudio - Default audio track
 * @returns {string|null} Embed URL or null
 */
function getSourceEmbedUrl(sourceObj, type, details, season, episode, defaultAudio) {
  if (sourceObj.id === 'cinetaro') {
    return sourceObj.getUrl(type, details, season, episode, defaultAudio);
  }
  return sourceObj.getUrl(type, details, season, episode);
}

/**
 * Builds HTML for a source button wrapper
 * @param {Object} source - Source object with id and name
 * @param {string} defaultSource - ID of the default source
 * @param {boolean} isAnime - Whether this is an anime title
 * @param {string} defaultAudio - Default audio track ('sub' or 'dub')
 * @returns {string} HTML string for the source wrapper
 */
function buildSourceWrapperHtml(source, defaultSource, isAnime, defaultAudio) {
  const isCinetaro = source.id === 'cinetaro';
  const isActive = source.id === defaultSource;
  const showAudioButtons = isAnime && isCinetaro && isActive;
  
  return `
    <div class="source-btn-wrapper" data-source-id="${source.id}">
      <button 
        class="source-btn ${isActive ? 'active' : ''}" 
        data-source="${source.id}"
        title="${source.name}"
      >
        ${source.name}
      </button>
      ${showAudioButtons ? `
        <div class="source-audio-selector">
          <button class="audio-btn ${defaultAudio === 'sub' ? 'active' : ''}" data-audio="sub">SUB</button>
          <button class="audio-btn ${defaultAudio === 'dub' ? 'active' : ''}" data-audio="dub">DUB</button>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Show player in hero section
 * @param {HTMLElement} hero
 * @param {string} type
 * @param {Object} details
 * @param {Array} availableSources
 * @param {string} defaultSource
 * @param {string} defaultAudio
 * @param {boolean} isAnime
 * @param {number} [season=1]
 * @param {number} [episode=1]
 */
function showPlayerInHero(hero, type, details, availableSources, defaultSource, defaultAudio, isAnime, season = 1, episode = 1) {
  const existingPlayer = hero.querySelector('.hero-player-container');
  if (existingPlayer) {
    existingPlayer.remove();
  }
  
  const mainContainer = hero.closest('.container') || hero.parentElement;
  const existingSourceSelector = mainContainer?.querySelector('.hero-source-selector');
  if (existingSourceSelector) {
    existingSourceSelector.remove();
  }
  
  const overlay = hero.querySelector('.featured-hero-overlay');
  const content = hero.querySelector('.featured-hero-content');
  
  if (overlay) overlay.classList.add('fade-out');
  if (content) content.classList.add('fade-out');
  
  const defaultSourceObj = availableSources.find(s => s.id === defaultSource);
  if (!defaultSourceObj) return;
  
  const embedUrl = getSourceEmbedUrl(defaultSourceObj, type, details, season, episode, defaultAudio);
  if (!embedUrl) return;
  
  const playerContainer = document.createElement('div');
  playerContainer.className = 'hero-player-container';
  playerContainer.dataset.season = season;
  playerContainer.dataset.episode = episode;
  
  const isVidSrcWTF = isVidSrcWTFSource(defaultSource);
  const fullscreenButtonHtml = `
    <button class="vidsrcwtf-fullscreen-btn" type="button" aria-label="Fullscreen" title="Fullscreen" style="display: ${isVidSrcWTF ? 'flex' : 'none'};">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
      </svg>
    </button>
  `;
  
  playerContainer.innerHTML = `
    <div class="hero-player-wrapper">
      <iframe 
        src="${embedUrl}" 
        frameborder="0"
        allowfullscreen
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        class="hero-player-iframe"
        referrerpolicy="no-referrer"
      ></iframe>
      ${fullscreenButtonHtml}
    </div>
  `;
  
  const sourceSelector = document.createElement('div');
  sourceSelector.className = 'hero-source-selector';
  sourceSelector.dataset.isAnime = isAnime;
  sourceSelector.dataset.defaultAudio = defaultAudio;
  
  const sortedSources = sortSourcesByPriority(availableSources);
  
  const sourcesHtml = sortedSources
    .map(source => buildSourceWrapperHtml(source, defaultSource, isAnime, defaultAudio))
    .join('');
  
  const isMobile = isMobileDevice();
  const adBlockerBannerHtml = isMobile
    ? `
      <div class="source-adblocker-banner">
        <span>Please use an ad blocker for the love of god please!</span>
        <a href="https://brave.com/download/" target="_blank" rel="noopener noreferrer">Get Brave Browser</a>
      </div>
    `
    : `
      <div class="source-adblocker-banner">
        <span>Please use an ad blocker for the love of god please!</span>
        <a href="https://chromewebstore.google.com/detail/ddkjiahejlhfcafbddmgiahcphecmpfh?utm_source=item-share-cb" target="_blank" rel="noopener noreferrer">Get uBlock Origin</a>
      </div>
    `;
  
  sourceSelector.innerHTML = sourcesHtml + adBlockerBannerHtml;
  
  hero.appendChild(playerContainer);
  
  if (mainContainer) {
    mainContainer.insertBefore(sourceSelector, hero.nextSibling);
  } else {
    hero.parentElement.appendChild(sourceSelector);
  }
  
  const iframe = playerContainer.querySelector('.hero-player-iframe');
  
  // Add fullscreen button handler for VidSrc WTF sources
  const fullscreenBtn = playerContainer.querySelector('.vidsrcwtf-fullscreen-btn');
  if (fullscreenBtn) {
    console.log('[VidSrc WTF] Fullscreen button found, isVidSrcWTF:', isVidSrcWTF);
    fullscreenBtn.addEventListener('click', () => {
      if (iframe.requestFullscreen) {
        iframe.requestFullscreen();
      } else if (iframe.webkitRequestFullscreen) {
        iframe.webkitRequestFullscreen();
      } else if (iframe.mozRequestFullScreen) {
        iframe.mozRequestFullScreen();
      } else if (iframe.msRequestFullscreen) {
        iframe.msRequestFullscreen();
      }
    });
  } else {
    console.warn('[VidSrc WTF] Fullscreen button not found!');
  }
  
  
  setTimeout(() => {
    playerContainer.classList.add('fade-in');
    sourceSelector.classList.add('fade-in');
  }, 50);
  
  playerContainer._cleanup = () => { };
  
  const sourceButtons = sourceSelector.querySelectorAll('.source-btn');
  sourceButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const sourceId = btn.dataset.source;
      const sourceObj = availableSources.find(s => s.id === sourceId);
      if (!sourceObj) return;
      
      const currentSeason = parseInt(playerContainer.dataset.season) || season;
      const currentEpisode = parseInt(playerContainer.dataset.episode) || episode;
      
      sourceButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      updateAudioSelectorsVisibility(sourceSelector, sourceId, isAnime);
      
      const activeAudio = sourceSelector.querySelector('.audio-btn.active')?.dataset.audio || defaultAudio;
      const newUrl = getSourceEmbedUrl(sourceObj, type, details, currentSeason, currentEpisode, activeAudio);
      
      if (newUrl) {
        iframe.src = newUrl;
        
        // Show/hide fullscreen button based on source
        const fullscreenBtn = playerContainer.querySelector('.vidsrcwtf-fullscreen-btn');
        if (fullscreenBtn) {
          if (isVidSrcWTFSource(sourceId)) {
            fullscreenBtn.style.display = 'flex';
          } else {
            fullscreenBtn.style.display = 'none';
          }
        }
      }
    });
  });
  
  if (isAnime) {
    const audioButtons = sourceSelector.querySelectorAll('.audio-btn');
    audioButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const audio = btn.dataset.audio;
        const audioSelector = btn.closest('.source-audio-selector');
        if (audioSelector) {
          audioSelector.querySelectorAll('.audio-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
        
        const activeSource = sourceSelector.querySelector('.source-btn.active')?.dataset.source;
        if (activeSource === 'cinetaro') {
          const sourceObj = availableSources.find(s => s.id === 'cinetaro');
          if (sourceObj) {
            const currentSeason = parseInt(playerContainer.dataset.season) || season;
            const currentEpisode = parseInt(playerContainer.dataset.episode) || episode;
            const newUrl = getSourceEmbedUrl(sourceObj, type, details, currentSeason, currentEpisode, audio);
            if (newUrl) {
              iframe.src = newUrl;
            }
          }
        }
      });
    });
  }
  
  const closePlayer = () => {
    if (playerContainer._cleanup) {
      playerContainer._cleanup();
    }
    
    playerContainer.classList.remove('fade-in');
    playerContainer.classList.add('fade-out');
    sourceSelector.classList.remove('fade-in');
    sourceSelector.classList.add('fade-out');
    setTimeout(() => {
      playerContainer.remove();
      sourceSelector.remove();
      if (overlay) overlay.classList.remove('fade-out');
      if (content) content.classList.remove('fade-out');
    }, 300);
    document.removeEventListener('keydown', handleEsc);
  };
  
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      closePlayer();
    }
  };
  document.addEventListener('keydown', handleEsc);
}

/**
 * Open player modal with embed URL (kept for backward compatibility)
 * @param {string} embedUrl
 * @param {boolean} [isAnime=false]
 * @param {number} [tmdbId]
 * @param {number} [season]
 * @param {number} [episode]
 * @param {string} [type]
 */
function openPlayerModal(embedUrl, isAnime = false, tmdbId = null, season = 1, episode = 1, type = 'tv') {
  const modal = document.createElement('div');
  modal.className = 'player-modal';
  
  let audioSelector = '';
  if (isAnime && tmdbId) {
    audioSelector = `
      <div class="player-audio-selector">
        <button class="audio-btn active" data-audio="sub">SUB</button>
        <button class="audio-btn" data-audio="dub">DUB</button>
      </div>
    `;
  }
  
  modal.innerHTML = `
    <div class="player-modal-overlay"></div>
    <button class="player-modal-close" aria-label="Close player">&times;</button>
    <div class="player-modal-content">
      ${audioSelector}
      <iframe 
        src="${embedUrl}" 
        frameborder="0"
        allowfullscreen
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        class="player-iframe"
        referrerpolicy="no-referrer"
      ></iframe>
    </div>
  `;
  
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  
  const iframe = modal.querySelector('.player-iframe');
  iframe.addEventListener('load', () => {
    try {
      if (iframe.contentWindow) {
        const originalOpen = iframe.contentWindow.open;
        iframe.contentWindow.open = function() {
          return null;
        };
      }
    } catch (e) {
    }
  });
  
  if (isAnime && tmdbId) {
    const audioButtons = modal.querySelectorAll('.audio-btn');
    audioButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const audio = btn.dataset.audio;
        audioButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const newUrl = getAnimeEmbedUrl(type, tmdbId, season, episode, audio);
        iframe.src = newUrl;
      });
    });
  }
  
  const closeModal = () => {
    modal.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', handleEsc);
  };
  
  modal.querySelector('.player-modal-close').addEventListener('click', closeModal);
  
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  };
  document.addEventListener('keydown', handleEsc);
}
