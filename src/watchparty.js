/**
 * Read the party id from the URL query parameter `party`.
 * @returns {string|null} The party id if present, else null.
 */
export function getPartyIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('party') || null;
}

/**
 * Create a new party id and return a shareable URL with `?party=<id>`.
 * Uses `crypto.randomUUID()` when available, falls back to timestamp.
 * @returns {{ id: string, url: string }}
 */
export function createPartyLink() {
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
  const url = new URL(window.location.href);
  url.searchParams.set('party', id);
  return { id, url: url.toString() };
}