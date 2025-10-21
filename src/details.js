import { fetchTMDBData, img } from "./api.js";

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

function formatYear(dateString) {
  try {
    if (!dateString) return "";
    const y = new Date(dateString).getFullYear();
    if (Number.isFinite(y)) return String(y);
  } catch {}
  return "";
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
    try {
      const images = await fetchTitleImages(type, id);
      const backs = Array.isArray(images?.backdrops) ? images.backdrops : [];
      const posters = Array.isArray(images?.posters) ? images.posters : [];
      const prefer = (arr) => {
        const en = arr.filter(i => (i.iso_639_1 || '').toLowerCase() === 'en' || !i.iso_639_1 || i.iso_639_1 === 'xx');
        return en.length ? en : arr;
      };
      const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
      if (backs.length) {
        const b = pick(prefer(backs));
        if (b && b.file_path) backdropUrl = (b.width && b.width >= 1920) ? img.backdrop(b.file_path) : img.backdrop(b.file_path);
      }
      if (!backdropUrl && posters.length) {
        const p = pick(prefer(posters));
        if (p && p.file_path) backdropUrl = img.poster(p.file_path);
      }
    } catch {}
    if (!backdropUrl) {
      backdropUrl = details.backdrop_path ? img.backdrop(details.backdrop_path)
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
          trailerBtn.addEventListener('click', () => {
            try { window.open(trailerUrl, '_blank', 'noopener,noreferrer'); } catch {}
          }, { once: true });
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
    const data = await fetchTMDBData(`/${type}/${id}/watch/providers`, { maxRetries: 2, ttlMs: 300000, signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(1500) : undefined });
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
    return list.slice(0, 8);
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
    providers.slice(0, 8).forEach((p, idx) => {
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

async function fetchTrailerUrl(type, id) {
  try {
    const data = await fetchTMDBData(`/${type}/${id}/videos`, { ttlMs: 10 * 60 * 1000, maxRetries: 2 });
    const list = Array.isArray(data?.results) ? data.results : [];
    const youtube = list.filter(v => v && v.site === 'YouTube' && v.key);
    if (youtube.length === 0) return null;
    const typeOf = (v) => (v.type || '').toLowerCase();
    const bucket = (t) => youtube.filter(v => typeOf(v) === t);
    const pickBest = (arr) => {
      if (!arr.length) return null;
      const preferEn = arr.filter(v => (v.iso_639_1 || '').toLowerCase() === 'en');
      const candidates = preferEn.length ? preferEn : arr;
      candidates.sort((a, b) => {
        const officialCmp = (b.official ? 1 : 0) - (a.official ? 1 : 0);
        if (officialCmp !== 0) return officialCmp;
        const resCmp = (b.size || 0) - (a.size || 0);
        if (resCmp !== 0) return resCmp;
        const timeCmp = (b.published_at ? Date.parse(b.published_at) : 0) - (a.published_at ? Date.parse(a.published_at) : 0);
        return timeCmp;
      });
      return candidates[0] || null;
    };
    const order = ['trailer', 'teaser', 'clip'];
    let best = null;
    for (const t of order) { best = pickBest(bucket(t)); if (best) break; }
    if (!best) best = pickBest(youtube);
    return best && best.key ? `https://www.youtube.com/watch?v=${best.key}` : null;
  } catch {
    return null;
  }
}

async function fetchTitleImages(type, id) {
  try {
    const data = await fetchTMDBData(`/${type}/${id}/images`, { ttlMs: 24 * 60 * 60 * 1000, maxRetries: 2 });
    return data || null;
  } catch {
    return null;
  }
}