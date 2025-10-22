import { fetchTMDBData, img, bestBackdropForSize } from "./api.js";
import { selectPreferredImage, formatYear } from "./utils.js";
import { fetchTrailerUrl, fetchTitleImages } from "./media-utils.js";
import { VIDEO_CACHE_TTL_MS, PROVIDER_CACHE_TTL_MS, MAX_PROVIDER_ICONS } from "./constants.js";

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

let currentDetailsToken = 0;

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
    const endpoint = type === 'tv' ? `/tv/${id}` : `/movie/${id}`;
    const details = await fetchTMDBData(endpoint);
    if (!details) throw new Error("Missing details");

    const title = details.title || details.name || "Untitled";
    const year = formatYear(details.release_date || details.first_air_date);
    const rating = typeof details.vote_average === "number" ? details.vote_average.toFixed(1) : null;
    let backdropUrl = "";
    const heroWidth = (() => { try { return (document.getElementById("details-hero") || document.querySelector(".featured-hero")).clientWidth || window.innerWidth || 1280; } catch { return 1280; } })();
    try {
      const images = await fetchTitleImages(type, id);
      const filePath = selectPreferredImage(images, true);
      if (filePath) {
        // Check if it's a backdrop by seeing if it exists in the backdrops array
        const backs = Array.isArray(images?.backdrops) ? images.backdrops : [];
        const isBackdrop = backs.some(b => b.file_path === filePath);
        backdropUrl = isBackdrop ? bestBackdropForSize(filePath, heroWidth) : img.poster(filePath);
      }
    } catch {}
    if (!backdropUrl) {
      backdropUrl = details.backdrop_path ? bestBackdropForSize(details.backdrop_path, heroWidth)
        : (details.poster_path ? img.poster(details.poster_path) : "");
    }
    const runtimeOrEps = formatRuntimeOrEpisodes(details, type);

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
    }

    try { document.title = `${title} (${year || ''}) - Movie Night`.trim(); } catch {}

    try {
      const region = detectRegion();
      const providers = await fetchWatchProviders(type, id, region);
      if (myToken !== currentDetailsToken) return;
      if (Array.isArray(providers) && providers.length) renderProviderIcons(providers, hero);
      updateProviderMetaTags(providers);
    } catch {}

    try {
      const trailerBtn = hero.querySelector('.watch-trailer');
      const trailerUrl = await fetchTrailerUrl(type, id);
      if (myToken !== currentDetailsToken) return;
      if (trailerBtn) {
        if (trailerUrl) {
          try { trailerBtn.removeAttribute('disabled'); } catch {}
          
          trailerBtn.addEventListener('click', (e) => {
            if (e && (e.ctrlKey || e.metaKey)) {
              try { window.open(trailerUrl, '_blank', 'noopener,noreferrer'); } catch {}
              return;
            }
            try { window.open(trailerUrl, '_blank', 'noopener,noreferrer'); } catch {}
          }, { once: true });
          
          trailerBtn.addEventListener('mousedown', (e) => {
            if (e && e.button === 1) {
              try { e.preventDefault(); } catch {}
            }
          });
          
          trailerBtn.addEventListener('auxclick', (e) => {
            if (!e || e.button !== 1) return;
            try { window.open(trailerUrl, '_blank', 'noopener,noreferrer'); } catch {}
          });
        } else {
          try { trailerBtn.setAttribute('disabled', 'true'); } catch {}
        }
      }
    } catch {}
  } catch (e) {
    console.error("Failed to load details", e);
    const contentEl = hero.querySelector(".featured-hero-content");
    if (contentEl) contentEl.innerHTML = `<h3 class="featured-title">Failed to load</h3>`;
  } finally {
    hero.classList.remove("loading");
  }
}

function detectRegion() {
  try {
    const locale = navigator.language || navigator.userLanguage || 'en-US';
    const m = String(locale).match(/-([A-Za-z]{2})$/);
    return (m && m[1] ? m[1] : 'US').toUpperCase();
  } catch { return 'US'; }
}

async function fetchWatchProviders(type, id, region) {
  try {
    const data = await fetchTMDBData(`/${type}/${id}/watch/providers`, { maxRetries: 2, ttlMs: PROVIDER_CACHE_TTL_MS, signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(1500) : undefined });
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