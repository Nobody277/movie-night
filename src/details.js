import { bestBackdropForSize, fetchTMDBData, img } from "./api.js";
import { fetchTitleImages, fetchTrailerUrl } from "./media-utils.js";
import { attachTrailerButtonHandlers, formatYear, isBackdropImage, selectPreferredImage } from "./utils.js";
import { checkIsAnime, getAnimeEmbedUrl } from "./anime-utils.js";

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
    
    if (myToken !== currentDetailsToken) return;
    
    // Render details body with overview, cast, crew, etc.
    await renderDetailsBody(type, id, data.details, myToken, currentDetailsToken);

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
 * @param {string} imdbId
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
            <button class="episode-play-btn" data-imdb="${imdbId}" data-season="${epSeasonNum}" data-episode="${ep.episode_number}">
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
        const imdbId = btn.dataset.imdb;
        const season = parseInt(btn.dataset.season) || 1;
        const episode = parseInt(btn.dataset.episode) || 1;
        
        try {
          let embedUrl = '';
          
          if (tvId) {
            const isAnimeTitle = await checkIsAnime('tv', tvId);
            
            if (isAnimeTitle) {
              embedUrl = getAnimeEmbedUrl('tv', tvId, season, episode, 'sub');
              openPlayerModal(embedUrl, true, tvId, season, episode);
            } else if (imdbId) {
              embedUrl = `https://vidsrc.cc/v2/embed/tv/${imdbId}/${season}/${episode}?autoPlay=false`;
              openPlayerModal(embedUrl);
            } else {
              console.error('No IMDB ID available for this show');
              return;
            }
          } else {
            console.error('No TV ID available');
            return;
          }
        } catch (error) {
          console.error('Failed to open episode player:', error);
        }
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
      const isAnimeTitle = await checkIsAnime(type, details.id, details);
      
      if (isAnimeTitle) {
        const tmdbId = details.id;
        embedUrl = getAnimeEmbedUrl(type, tmdbId, 1, 1, 'sub');
        openPlayerModal(embedUrl, true, tmdbId, 1, 1, type);
      } else {
        if (type === 'movie') {
          const tmdbId = details.id;
          embedUrl = `https://vidsrc.cc/v2/embed/movie/${tmdbId}?autoPlay=false`;
          openPlayerModal(embedUrl);
        } else if (type === 'tv') {
          const imdbId = details.external_ids?.imdb_id;
          if (imdbId) {
            embedUrl = `https://vidsrc.cc/v2/embed/tv/${imdbId}?autoPlay=false`;
            openPlayerModal(embedUrl);
          } else {
            console.error('No IMDB ID found for TV show');
            return;
          }
        }
      }
    } catch (error) {
      console.error('Failed to open player:', error);
    }
  });
}

/**
 * Open player modal with embed URL
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