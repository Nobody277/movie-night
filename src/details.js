import { bestBackdropForSize, fetchTMDBData, img } from "./api.js";
import { fetchTitleImages, fetchTrailerUrl } from "./media-utils.js";
import { attachTrailerButtonHandlers, formatYear, isBackdropImage, selectPreferredImage } from "./utils.js";

import { MAX_PROVIDER_ICONS, PROVIDER_CACHE_TTL_MS, PROVIDER_FETCH_TIMEOUT_MS, PROVIDER_MAX_RETRIES, VIDEO_CACHE_TTL_MS } from "./constants.js";

// Module State (Private)

let currentDetailsToken = 0;

// Public Exports

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

  } catch (e) {
    console.error("Failed to load details page for", type, id, e);
    const contentEl = hero.querySelector(".featured-hero-content");
    if (contentEl) contentEl.innerHTML = `<h3 class="featured-title">Failed to load</h3>`;
  } finally {
    hero.classList.remove("loading");
  }
}

// Data Fetching Functions (Private)

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

// Rendering Functions (Private)

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
        </div>`;
      if (myToken !== currentDetailsToken) return;
      contentEl.classList.add("slide-enter");
      
      const watchNowBtn = contentEl.querySelector('.watch-now');
      if (watchNowBtn) {
        attachWatchNowHandler(watchNowBtn, type, details);
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

// Utility Functions (Private)

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
 * Attach Watch Now button handler
 * @param {HTMLElement} btn
 * @param {string} type
 * @param {Object} details
 */
function attachWatchNowHandler(btn, type, details) {
  if (!btn) return;
  
  btn.addEventListener('click', async () => {
    try {
      let embedUrl = '';
      
      if (type === 'movie') {
        // For movies, use TMDB ID
        const tmdbId = details.id;
        embedUrl = `https://vidsrc.cc/v2/embed/movie/${tmdbId}?autoPlay=false`;
      } else if (type === 'tv') {
        // For TV shows, we need IMDB ID
        const imdbId = details.external_ids?.imdb_id;
        if (imdbId) {
          embedUrl = `https://vidsrc.cc/v2/embed/tv/${imdbId}?autoPlay=false`;
        } else {
          console.error('No IMDB ID found for TV show');
          return;
        }
      }
      
      if (embedUrl) {
        openPlayerModal(embedUrl);
      }
    } catch (error) {
      console.error('Failed to open player:', error);
    }
  });
}

/**
 * Open player modal with embed URL
 * @param {string} embedUrl
 */
function openPlayerModal(embedUrl) {
  // Create modal overlay
  const modal = document.createElement('div');
  modal.className = 'player-modal';
  modal.innerHTML = `
    <div class="player-modal-overlay"></div>
    <div class="player-modal-content">
      <button class="player-modal-close" aria-label="Close player">&times;</button>
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
  
  // Block popup attempts
  const iframe = modal.querySelector('.player-iframe');
  iframe.addEventListener('load', () => {
    try {
      // Prevent the iframe from opening new windows
      if (iframe.contentWindow) {
        const originalOpen = iframe.contentWindow.open;
        iframe.contentWindow.open = function() {
          console.log('Blocked popup attempt from embedded player');
          return null;
        };
      }
    } catch (e) {
      // Cross-origin restriction - sandbox will handle it
      console.log('Iframe sandboxed - popups blocked by browser');
    }
  });
  
  const closeModal = () => {
    modal.remove();
    document.body.style.overflow = '';
  };
  
  modal.querySelector('.player-modal-close').addEventListener('click', closeModal);
  modal.querySelector('.player-modal-overlay').addEventListener('click', closeModal);
  
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);
}
