import { bestBackdropForSize, fetchTMDBData, img } from "./api.js";
import { fetchTitleImages, fetchTrailerUrl } from "./media-utils.js";
import { attachTrailerButtonHandlers, formatYear, isBackdropImage, selectPreferredImage } from "./utils.js";
import { checkIsAnime, getAnimeEmbedUrl } from "./anime-utils.js";
import { MAX_PROVIDER_ICONS, PROVIDER_CACHE_TTL_MS, PROVIDER_FETCH_TIMEOUT_MS, PROVIDER_MAX_RETRIES, VIDEO_CACHE_TTL_MS } from "./constants.js";
import { showAddToListMenu, updateAddButton } from "./ui.js";
import * as listStore from "./list-store.js";

const SOURCES_WITHOUT_SANDBOX = ['111movies', '2embed', 'filmku', 'godrive', 'moviesapi', 'primesrc', 'smashy', 'vidora', 'videasy', 'vidfast', 'vidlink', 'vidsrc', 'vidsrcme', 'vidsrcto', 'vidrock', 'vixsrc', 'vidup'];

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
  'vidsrcwtf': {
    name: 'VidSrc WTF', // TODO: Fix fullscreen
    getUrl: (type, details, season = 1, episode = 1) => {
      if (type === 'movie') {
        return `https://vidsrc.wtf/api/1/movie/?id=${details.id}&color=e01621`;
      } else if (type === 'tv') {
        const tvId = details.external_ids?.tvdb_id || details.id;
        return `https://vidsrc.wtf/api/1/tv/?id=${tvId}&s=${season}&e=${episode}&color=e01621`;
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
        const tvId = details.external_ids?.tvdb_id || details.id;
        return `https://fmovies4u.com/embed/tmdb-tv-${tvId}/${season}/${episode}`;
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
        const tvId = details.external_ids?.tvdb_id || details.id;
        return `https://godriveplayer.com/player.php?type=series&tmdb=${tvId}&season=${season}&episode=${episode}`;
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
        const tvId = details.external_ids?.tvdb_id || details.id;
        return `https://moviesapi.club/tv/${tvId}-${season}-${episode}`;
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
        const tvId = details.external_ids?.tvdb_id || details.id;
        return `https://primesrc.me/embed/tv?tmdb=${tvId}&season=${season}&episode=${episode}`;
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
        const tvId = details.external_ids?.tvdb_id || details.id;
        return `https://rivestream.org/embed?type=tv&id=${tvId}&season=${season}&episode=${episode}`;
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
        const tvId = details.external_ids?.tvdb_id || details.id;
        return `https://player.smashy.stream/tv/${tvId}?s=${season}&e=${episode}`;
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
        const tvId = details.external_ids?.tvdb_id || details.id;
        return `https://spencerdevs.xyz/tv/${tvId}/${season}/${episode}`;
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
        return `https://player.vidify.top/embed/movie/${details.id}`;
      } else if (type === 'tv') {
        const tvId = details.external_ids?.tvdb_id || details.id;
        return `https://player.vidify.top/embed/tv/${tvId}/${season}/${episode}`;
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
        const tvId = details.external_ids?.tvdb_id || details.id;
        return `https://player.vidzee.wtf/embed/tv/${tvId}/${season}/${episode}`;
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
        const tvId = details.external_ids?.tvdb_id || details.id;
        return `https://vidlink.pro/tv/${tvId}/${season}/${episode}`;
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
        const tvId = details.external_ids?.tvdb_id || details.id;
        return `https://vidnest.fun/tv/${tvId}/${season}/${episode}`;
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
        const tvId = details.external_ids?.tvdb_id || details.id;
        return `https://vidsrc.cx/embed/tv/${tvId}/${season}/${episode}`;
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
        const tvId = details.external_ids?.tvdb_id || details.id;
        return `https://vidsrc-embed.ru/embed/tv?tmdb=${tvId}&season=${season}&episode=${episode}`;
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
 * Fetch details data for a title
 * @param {string} type
 * @param {number} id
 * @returns {Promise<Object>}
 */
async function fetchDetailsData(type, id) {
  try {
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
 * Set up navigation buttons for the cast rail
 */
function setupCastRail() {
  const rail = document.querySelector('.detail-cast-rail');
  const prev = document.querySelector('.detail-cast-prev');
  const next = document.querySelector('.detail-cast-next');
  
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
    const credits = await fetchTMDBData(`/${type}/${id}/credits`);
    if (myToken !== currentDetailsToken) return;
    const cast = Array.isArray(credits?.cast) ? credits.cast : [];
    const crew = Array.isArray(credits?.crew) ? credits.crew : [];
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
    
    const castWithImages = cast.filter(person => person.profile_path);
    if (castWithImages.length > 0) {
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
      castWithImages.forEach(person => {
        const imgUrl = img.poster(person.profile_path);
        html += `
          <div class="detail-cast-card">
            <img src="${imgUrl}" alt="${person.name}" class="detail-cast-img" loading="lazy">
            <div class="detail-cast-name">${person.name}</div>
            <div class="detail-cast-char">${person.character || ''}</div>
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
    
    bodyEl.innerHTML = html;
    
    setupCastRail();
    
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
      const endpoint = type === 'tv' ? `/tv/${id}` : `/movie/${id}`;
      details = await fetchTMDBData(endpoint);
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
    } catch (error) {
      console.error('Failed to fetch details:', error);
      return;
    }
    
    const isAnimeTitle = await checkIsAnime(type, id, details);
    
    const availableSources = [];
    let defaultSource = null;
    let defaultAudio = 'sub';
    
    if (isAnimeTitle) {
      availableSources.push({ id: 'cinetaro', ...SOURCES.cinetaro });
      defaultSource = 'cinetaro';
      
      const vidsrcUrl = SOURCES.vidsrc.getUrl(type, details, season, episode);
      if (vidsrcUrl) {
        availableSources.push({ id: 'vidsrc', ...SOURCES.vidsrc });
      }
      
      const movies111Url = SOURCES['111movies'].getUrl(type, details, season, episode);
      if (movies111Url) {
        availableSources.push({ id: '111movies', ...SOURCES['111movies'] });
      }
      
      const embed2Url = SOURCES['2embed'].getUrl(type, details, season, episode);
      if (embed2Url) {
        availableSources.push({ id: '2embed', ...SOURCES['2embed'] });
      }
      
      const otherSources = ['autoembed', 'bidsrc', 'vidsrcwtf', 'filmku', 'fmovies4u', 'godrive', 'moviesapi', 'primesrc', 'rivestream', 'smashy', 'spencerdevs', 'vidora', 'videasy', 'vidfast', 'vidify', 'vidzee', 'vidlink', 'vidnest', 'vidsrccx', 'vidsrcme', 'vidsrcto', 'vidrock', 'vixsrc', 'vidsync', 'vidup'];
      otherSources.forEach(sourceId => {
        const sourceUrl = SOURCES[sourceId]?.getUrl(type, details, season, episode);
        if (sourceUrl) {
          availableSources.push({ id: sourceId, ...SOURCES[sourceId] });
        }
      });
    } else {
      const vidsrcUrl = SOURCES.vidsrc.getUrl(type, details, season, episode);
      if (vidsrcUrl) {
        availableSources.push({ id: 'vidsrc', ...SOURCES.vidsrc });
        defaultSource = 'vidsrc';
      }
      
      const movies111Url = SOURCES['111movies'].getUrl(type, details, season, episode);
      if (movies111Url) {
        availableSources.push({ id: '111movies', ...SOURCES['111movies'] });
      }
      
      const embed2Url = SOURCES['2embed'].getUrl(type, details, season, episode);
      if (embed2Url) {
        availableSources.push({ id: '2embed', ...SOURCES['2embed'] });
      }
      
      const otherSources = ['autoembed', 'bidsrc', 'vidsrcwtf', 'filmku', 'fmovies4u', 'godrive', 'moviesapi', 'primesrc', 'rivestream', 'smashy', 'spencerdevs', 'vidora', 'videasy', 'vidfast', 'vidify', 'vidzee', 'vidlink', 'vidnest', 'vidsrccx', 'vidsrcme', 'vidsrcto', 'vidrock', 'vixsrc', 'vidsync', 'vidup'];
      otherSources.forEach(sourceId => {
        const sourceUrl = SOURCES[sourceId]?.getUrl(type, details, season, episode);
        if (sourceUrl) {
          availableSources.push({ id: sourceId, ...SOURCES[sourceId] });
        }
      });
    }
    
    if (availableSources.length === 0) {
      console.error('No available sources');
      return;
    }
    
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
  
  let embedUrl = '';
  if (defaultSource === 'cinetaro') {
    embedUrl = defaultSourceObj.getUrl(type, details, season, episode, defaultAudio);
  } else {
    embedUrl = defaultSourceObj.getUrl(type, details, season, episode);
  }
  
  if (!embedUrl) return;
  
  const playerContainer = document.createElement('div');
  playerContainer.className = 'hero-player-container';
  playerContainer.dataset.season = season;
  playerContainer.dataset.episode = episode;
  
  const useSandbox = !SOURCES_WITHOUT_SANDBOX.includes(defaultSource);
  
  playerContainer.innerHTML = `
    <div class="hero-player-wrapper">
      <iframe 
        src="${embedUrl}" 
        frameborder="0"
        allowfullscreen
        ${useSandbox ? 'sandbox="allow-same-origin allow-scripts allow-forms allow-presentation"' : ''}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        class="hero-player-iframe"
        referrerpolicy="no-referrer"
      ></iframe>
    </div>
  `;
  
  const sourceSelector = document.createElement('div');
  sourceSelector.className = 'hero-source-selector';
  sourceSelector.dataset.isAnime = isAnime;
  sourceSelector.dataset.defaultAudio = defaultAudio;
  
  const sourceButtonsHtml = availableSources.map((source, index) => {
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
  }).join('');
  
  sourceSelector.innerHTML = sourceButtonsHtml;
  
  hero.appendChild(playerContainer);
  
  if (mainContainer) {
    mainContainer.insertBefore(sourceSelector, hero.nextSibling);
  } else {
    hero.parentElement.appendChild(sourceSelector);
  }
  
  const iframe = playerContainer.querySelector('.hero-player-iframe');
  if (!useSandbox) {
    iframe.removeAttribute('sandbox');
  }
  
  setTimeout(() => {
    playerContainer.classList.add('fade-in');
    sourceSelector.classList.add('fade-in');
  }, 50);
  let iframeInteractionTime = 0;
  let navigationBlocked = false;
  
  iframe.addEventListener('mouseenter', () => {
    iframeInteractionTime = Date.now();
    navigationBlocked = true;
  });
  
  iframe.addEventListener('mouseleave', () => {
    setTimeout(() => {
      navigationBlocked = false;
    }, 1000);
  });
  
  iframe.addEventListener('load', () => {
    try {
      if (iframe.contentWindow) {
        try {
          const iframeWindow = iframe.contentWindow;
          const originalOpen = iframeWindow.open;
          iframeWindow.open = function(...args) {
            const url = args[0];
            if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
              return originalOpen.apply(this, args);
            }
            return null;
          };
        } catch (e) {
        }
      }
    } catch (e) {
    }
  });
  
  let lastBlurTime = 0;
  const blurHandler = () => {
    const now = Date.now();
    const timeSinceInteraction = now - iframeInteractionTime;
    
    if (timeSinceInteraction < 2000 && now - lastBlurTime < 500) {
      setTimeout(() => {
        if (!document.hasFocus()) {
          window.focus();
        }
      }, 10);
    }
    lastBlurTime = now;
  };
  
  window.addEventListener('blur', blurHandler, { capture: true });
  
  playerContainer._cleanup = () => {
    window.removeEventListener('blur', blurHandler, { capture: true });
    navigationBlocked = false;
  };
  
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
      
      const sourceWrappers = sourceSelector.querySelectorAll('.source-btn-wrapper');
      sourceWrappers.forEach(wrapper => {
        const wrapperSourceId = wrapper.dataset.sourceId;
        const audioSelector = wrapper.querySelector('.source-audio-selector');
        const isCinetaro = wrapperSourceId === 'cinetaro';
        const isActive = wrapperSourceId === sourceId;
        
        if (audioSelector) {
          if (isAnime && isCinetaro && isActive) {
            audioSelector.style.display = 'flex';
          } else {
            audioSelector.style.display = 'none';
          }
        }
      });
      
      let newUrl = '';
      if (sourceId === 'cinetaro') {
        const activeAudio = sourceSelector.querySelector('.audio-btn.active')?.dataset.audio || defaultAudio;
        newUrl = sourceObj.getUrl(type, details, currentSeason, currentEpisode, activeAudio);
      } else {
        newUrl = sourceObj.getUrl(type, details, currentSeason, currentEpisode);
      }
      
      if (newUrl) {
        if (SOURCES_WITHOUT_SANDBOX.includes(sourceId)) {
          iframe.removeAttribute('sandbox');
        } else {
          iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-presentation');
        }
        iframe.src = newUrl;
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
            const newUrl = sourceObj.getUrl(type, details, currentSeason, currentEpisode, audio);
            if (newUrl) {
              iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-presentation');
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
        sandbox="allow-same-origin allow-scripts allow-forms allow-presentation"
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