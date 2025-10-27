/**
 * List Store - Client-side data model for managing user lists
 * Handles default lists (watching, plan, complete) and custom lists
 * Persists to localStorage with version control and error handling
 */
const STORAGE_KEY = 'mn:list:v1';
const STORAGE_VERSION = 1;
const SAVE_DEBOUNCE_MS = 300;

export const DEFAULT_LISTS = {
  WATCHING: 'watching',
  PLAN: 'plan',
  COMPLETE: 'complete'
};

let state = {
  version: STORAGE_VERSION,
  lists: {
    [DEFAULT_LISTS.WATCHING]: { id: DEFAULT_LISTS.WATCHING, name: 'Watching', items: [], order: 0 },
    [DEFAULT_LISTS.PLAN]: { id: DEFAULT_LISTS.PLAN, name: 'Plan to Watch', items: [], order: 1 },
    [DEFAULT_LISTS.COMPLETE]: { id: DEFAULT_LISTS.COMPLETE, name: 'Complete', items: [], order: 2 }
  },
  customLists: {},
  nextCustomId: 1
};

let listeners = new Set();
let saveTimeoutId = null;


/**
 * Get current state (read-only copy)
 * @returns {{lists:Object, customLists:Object, version:number}} State snapshot containing lists, customLists, and version
 */
export function getState() {
  return {
    lists: { ...state.lists },
    customLists: { ...state.customLists },
    version: state.version
  };
}

/**
 * Subscribe to state changes
 * @param {Function} listener - Callback receiving new state
 * @returns {Function} Unsubscribe function
 */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Create a new custom list
 * @param {string} name - List name
 * @returns {string} New list ID
 */
export function createList(name) {
  const id = `custom-${state.nextCustomId++}`;
  state.customLists[id] = {
    id,
    name: String(name || 'New List'),
    items: [],
    order: Object.keys(state.customLists).length
  };
  saveState();
  notify();
  return id;
}

/**
 * Rename a list
 * @param {string} id - List ID
 * @param {string} name - New name
 */
export function renameList(id, name) {
  const list = state.lists[id] || state.customLists[id];
  if (!list) return;
  list.name = String(name || 'Untitled');
  saveState();
  notify();
}

/**
 * Delete a custom list (cannot delete default lists)
 * @param {string} id - List ID
 */
export function deleteList(id) {
  if (Object.values(DEFAULT_LISTS).includes(id)) {
    console.warn('Cannot delete default list');
    return;
  }
  delete state.customLists[id];
  saveState();
  notify();
}

/**
 * Add an item to a list
 * @param {Object} item - { id, type, title, poster, backdrop, vote_average, genre_ids, ... }
 * @param {string} listId - Target list ID
 */
export function add(item, listId) {
  const list = state.lists[listId] || state.customLists[listId];
  if (!list) return;

  // Check if already exists
  const key = `${item.type}:${item.id}`;
  const exists = list.items.some(i => `${i.type}:${i.id}` === key);
  if (exists) return;

  list.items.push({
    id: item.id,
    type: item.type,
    title: item.title || item.name || 'Untitled',
    poster: item.poster || item.poster_path || null,
    backdrop: item.backdrop || item.backdrop_path || null,
    vote_average: item.vote_average || 0,
    genre_ids: item.genre_ids || [],
    release_date: item.release_date || null,
    first_air_date: item.first_air_date || null,
    addedAt: Date.now()
  });

  saveState();
  notify();
}

/**
 * Move an item from one list to another
 * @param {string} itemId - Item ID
 * @param {string} itemType - Item type (movie/tv)
 * @param {string} fromId - Source list ID
 * @param {string} toId - Target list ID
 */
export function move(itemId, itemType, fromId, toId) {
  const fromList = state.lists[fromId] || state.customLists[fromId];
  const toList = state.lists[toId] || state.customLists[toId];
  if (!fromList || !toList) return;

  const key = `${itemType}:${itemId}`;
  const idx = fromList.items.findIndex(i => `${i.type}:${i.id}` === key);
  if (idx === -1) return;

  const [item] = fromList.items.splice(idx, 1);
  
  // Check if already exists in target
  const exists = toList.items.some(i => `${i.type}:${i.id}` === key);
  if (!exists) {
    toList.items.push(item);
  }

  saveState();
  notify();
}

/**
 * Remove an item from a list
 * @param {string} itemId - Item ID
 * @param {string} itemType - Item type (movie/tv)
 * @param {string} fromId - List ID
 */
export function remove(itemId, itemType, fromId) {
  const list = state.lists[fromId] || state.customLists[fromId];
  if (!list) return;

  const key = `${itemType}:${itemId}`;
  const idx = list.items.findIndex(i => `${i.type}:${i.id}` === key);
  if (idx !== -1) {
    list.items.splice(idx, 1);
    saveState();
    notify();
  }
}

/**
 * Check if an item exists in any list
 * @param {string} itemId - Item ID
 * @param {string} itemType - Item type (movie/tv)
 * @returns {string[]} Array of list IDs containing the item
 */
export function findItem(itemId, itemType) {
  const key = `${itemType}:${itemId}`;
  const found = [];
  
  Object.values(state.lists).forEach(list => {
    if (list.items.some(i => `${i.type}:${i.id}` === key)) {
      found.push(list.id);
    }
  });
  
  Object.values(state.customLists).forEach(list => {
    if (list.items.some(i => `${i.type}:${i.id}` === key)) {
      found.push(list.id);
    }
  });
  
  return found;
}

/**
 * Export lists as JSON string
 * @returns {string} JSON string
 */
export function exportLists() {
  return JSON.stringify({
    version: STORAGE_VERSION,
    lists: state.lists,
    customLists: state.customLists,
    exportedAt: Date.now()
  }, null, 2);
}

/**
 * Import lists from JSON string
 * @param {string} json - JSON string
 * @param {Object} options - { merge: boolean }
 */
export function importLists(json, options = {}) {
  try {
    const data = JSON.parse(json);
    if (!data || typeof data !== 'object') throw new Error('Invalid JSON');
    if (data.version !== STORAGE_VERSION) throw new Error('Version mismatch');

    if (options.merge) {
      // Merge lists
      if (data.lists) {
        Object.keys(data.lists).forEach(key => {
          if (DEFAULT_LISTS[key.toUpperCase()]) {
            // Merge default lists
            const existing = state.lists[key];
            const imported = data.lists[key];
            if (existing && imported && Array.isArray(imported.items)) {
              imported.items.forEach(item => {
                const itemKey = `${item.type}:${item.id}`;
                const exists = existing.items.some(i => `${i.type}:${i.id}` === itemKey);
                if (!exists) existing.items.push(item);
              });
            }
          }
        });
      }
      if (data.customLists) {
        Object.values(data.customLists).forEach(list => {
          const newId = createList(list.name);
          const newList = state.customLists[newId];
          if (newList && Array.isArray(list.items)) {
            newList.items = deduplicateItems(list.items);
          }
        });
      }
    } else {
      // Replace all
      if (data.lists) {
        Object.keys(DEFAULT_LISTS).forEach(key => {
          const id = DEFAULT_LISTS[key];
          if (data.lists[id]) {
            state.lists[id].items = deduplicateItems(data.lists[id].items || []);
          }
        });
      }
      if (data.customLists) {
        state.customLists = {};
        Object.values(data.customLists).forEach(list => {
          const id = createList(list.name);
          const newList = state.customLists[id];
          if (newList && Array.isArray(list.items)) {
            newList.items = deduplicateItems(list.items);
          }
        });
      }
    }

    saveState();
    notify();
  } catch (err) {
    console.error('Failed to import lists:', err);
    throw err;
  }
}

/**
 * Generate shareable URL data (base64 encoded JSON)
 * @returns {string} Base64 encoded data
 */
export function generateShareData() {
  try {
    const data = exportLists();
    return btoa(encodeURIComponent(data));
  } catch (err) {
    console.error('Failed to generate share data:', err);
    return '';
  }
}

/**
 * Parse shareable URL data
 * @param {string} encoded - Base64 encoded data
 * @returns {Object} Parsed data
 */
export function parseShareData(encoded) {
  try {
    const decoded = decodeURIComponent(atob(encoded));
    return JSON.parse(decoded);
  } catch (err) {
    console.error('Failed to parse share data:', err);
    throw err;
  }
}

// Private Helper Functions

/**
 * Load state from localStorage with validation
 * @returns {void}
 */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    if (parsed.version !== STORAGE_VERSION) return;

    // Validate and merge
    if (parsed.lists && typeof parsed.lists === 'object') {
      Object.keys(DEFAULT_LISTS).forEach(key => {
        const id = DEFAULT_LISTS[key];
        if (!parsed.lists[id]) {
          parsed.lists[id] = state.lists[id];
        } else {
          if (!Array.isArray(parsed.lists[id].items)) parsed.lists[id].items = [];
          parsed.lists[id].items = deduplicateItems(parsed.lists[id].items);
        }
      });
      state.lists = parsed.lists;
    }

    if (parsed.customLists && typeof parsed.customLists === 'object') {
      Object.values(parsed.customLists).forEach(list => {
        if (list && Array.isArray(list.items)) {
          list.items = deduplicateItems(list.items);
        }
      });
      state.customLists = parsed.customLists;
    }

    if (typeof parsed.nextCustomId === 'number') {
      state.nextCustomId = parsed.nextCustomId;
    }
  } catch (err) {
    console.error('Failed to load list state:', err);
  }
}

/**
 * Deduplicate items by {type, id}
 * @param {Array} items
 * @returns {Array}
 */
function deduplicateItems(items) {
  const seen = new Set();
  return items.filter(item => {
    if (!item || !item.type || !item.id) return false;
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Save state to localStorage with debouncing
 * @returns {void}
 */
function saveState() {
  if (saveTimeoutId) clearTimeout(saveTimeoutId);
  saveTimeoutId = setTimeout(() => {
    try {
      const data = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY, data);
    } catch (err) {
      console.error('Failed to save list state:', err);
      if (err.name === 'QuotaExceededError') {
        console.warn('Storage quota exceeded. Consider exporting and clearing old lists.');
      }
    }
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Notify all subscribers of state change
 * @returns {void}
 */
function notify() {
  listeners.forEach(fn => {
    try { fn(getState()); } catch (err) {
      console.error('Listener error:', err);
    }
  });
}

// Initialize on load
loadState();