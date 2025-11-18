/**
 * My List Page - View, manage, reorder, and move items across lists
 * Supports drag-and-drop, import/export, and sharing
 */

import { fetchTMDBData, img } from "./api.js";
import * as listStore from "./list-store.js";
import { showMenu } from "./menu.js";
import { createMovieCard, startRuntimeTags, startMovieCards, updateAddButton } from "./ui.js";

import { TOOLTIP_OFFSET_PX } from "./constants.js";

// Module State (Private)

let unsubscribe = null;
let dragState = {
  draggedItem: null,
  dragSourceList: null
};

// Public Exports

/**
 * Initialize My List page
 */
export function startMyListPage() {
  const root = document.getElementById('my-list-root');
  if (!root) return;

  if (unsubscribe) unsubscribe();

  unsubscribe = listStore.subscribe(() => {
    render();
  });

  render();

  setupToolbar();

  checkForImport();
}

// Rendering Functions (Private)

/**
 * Render all lists
 * @returns {void}
 */
function render() {
  const root = document.getElementById('my-list-root');
  if (!root) return;

  const state = listStore.getState();
  const { lists, customLists } = state;

  root.innerHTML = '';

  const defaultOrder = ['watching', 'plan', 'complete'];
  defaultOrder.forEach(id => {
    const list = lists[id];
    if (list) renderList(list, root, false);
  });

  const customListsArray = Object.values(customLists).sort((a, b) => (a.order || 0) - (b.order || 0));
  customListsArray.forEach(list => {
    renderList(list, root, true);
  });

  startRuntimeTags();
}

/**
 * Render a single list section
 * @param {Object} list
 * @param {HTMLElement} container
 * @param {boolean} isCustom
 */
function renderList(list, container, isCustom) {
  const section = document.createElement('section');
  section.className = 'rail list-section';
  section.dataset.listId = list.id;
  section.dataset.expanded = 'false';

  const railHead = document.createElement('div');
  railHead.className = 'rail-head';

  const railTitle = document.createElement('div');
  railTitle.className = 'rail-title';

  const title = document.createElement('h2');
  title.className = 'section-title';
  title.textContent = list.name;

  const count = document.createElement('p');
  count.className = 'section-subtitle';
  count.textContent = `${list.items?.length || 0} ${list.items?.length === 1 ? 'item' : 'items'}`;

  railTitle.appendChild(title);
  railTitle.appendChild(count);
  railHead.appendChild(railTitle);

  const railCta = document.createElement('div');
  railCta.className = 'rail-cta';

  const expandBtn = document.createElement('button');
  expandBtn.className = 'rail-btn expand-btn';
  expandBtn.type = 'button';
  expandBtn.setAttribute('aria-label', 'Expand list');
  expandBtn.innerHTML = '<span class="rail-icon">⊞</span>';
  expandBtn.addEventListener('click', () => toggleExpand(section, expandBtn));

  const actionsWrap = document.createElement('span');
  actionsWrap.className = 'list-title-actions';
  const renameBtn = document.createElement('button');
  renameBtn.className = 'rail-btn small';
  renameBtn.type = 'button';
  renameBtn.setAttribute('aria-label', 'Rename list');
  renameBtn.innerHTML = '<span class="rail-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="14" height="14" fill="currentColor"><path d="M100.4 417.2C104.5 402.6 112.2 389.3 123 378.5L304.2 197.3L338.1 163.4C354.7 180 389.4 214.7 442.1 267.4L476 301.3L442.1 335.2L260.9 516.4C250.2 527.1 236.8 534.9 222.2 539L94.4 574.6C86.1 576.9 77.1 574.6 71 568.4C64.9 562.2 62.6 553.3 64.9 545L100.4 417.2zM156 413.5C151.6 418.2 148.4 423.9 146.7 430.1L122.6 517L209.5 492.9C215.9 491.1 221.7 487.8 226.5 483.2L155.9 413.5zM510 267.4C493.4 250.8 458.7 216.1 406 163.4L372 129.5C398.5 103 413.4 88.1 416.9 84.6C430.4 71 448.8 63.4 468 63.4C487.2 63.4 505.6 71 519.1 84.6L554.8 120.3C568.4 133.9 576 152.3 576 171.4C576 190.5 568.4 209 554.8 222.5C551.3 226 536.4 240.9 509.9 267.4z"/></svg></span>';
  renameBtn.addEventListener('click', () => renameListPrompt(list.id, list.name));
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'rail-btn small';
  deleteBtn.type = 'button';
  deleteBtn.setAttribute('aria-label', 'Delete list');
  deleteBtn.innerHTML = '<span class="rail-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="14" height="14" fill="currentColor"><path d="M232.7 69.9L224 96L128 96C110.3 96 96 110.3 96 128C96 145.7 110.3 160 128 160L512 160C529.7 160 544 145.7 544 128C544 110.3 529.7 96 512 96L416 96L407.3 69.9C402.9 56.8 390.7 48 376.9 48L263.1 48C249.3 48 237.1 56.8 232.7 69.9zM512 208L128 208L149.1 531.1C150.7 556.4 171.7 576 197 576L443 576C468.3 576 489.3 556.4 490.9 531.1L512 208z"/></svg></span>';
  deleteBtn.addEventListener('click', () => deleteListPrompt(list.id, list.name));
  actionsWrap.appendChild(renameBtn);
  actionsWrap.appendChild(deleteBtn);
  title.appendChild(actionsWrap);

  const shareBtn = document.createElement('button');
  shareBtn.className = 'rail-btn';
  shareBtn.type = 'button';
  shareBtn.setAttribute('aria-label', 'Share list');
  shareBtn.innerHTML = '<span class="rail-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="16" height="16" fill="currentColor"><path d="M371.8 82.4C359.8 87.4 352 99 352 112L352 192L240 192C142.8 192 64 270.8 64 368C64 481.3 145.5 531.9 164.2 542.1C166.7 543.5 169.5 544 172.3 544C183.2 544 192 535.1 192 524.3C192 516.8 187.7 509.9 182.2 504.8C172.8 496 160 478.4 160 448.1C160 395.1 203 352.1 256 352.1L352 352.1L352 432.1C352 445 359.8 456.7 371.8 461.7C383.8 466.7 397.5 463.9 406.7 454.8L566.7 294.8C579.2 282.3 579.2 262 566.7 249.5L406.7 89.5C397.5 80.3 383.8 77.6 371.8 82.6z"/></svg></span>';
  shareBtn.addEventListener('click', () => handleShareList(list));


  // Navigation buttons
  const prevBtn = document.createElement('button');
  prevBtn.className = 'rail-btn rail-prev';
  prevBtn.type = 'button';
  prevBtn.setAttribute('aria-label', 'Scroll left');
  prevBtn.innerHTML = '<span class="rail-icon">‹</span>';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'rail-btn rail-next';
  nextBtn.type = 'button';
  nextBtn.setAttribute('aria-label', 'Scroll right');
  nextBtn.innerHTML = '<span class="rail-icon">›</span>';

  railCta.appendChild(expandBtn);
  railCta.appendChild(shareBtn);
  railCta.appendChild(prevBtn);
  railCta.appendChild(nextBtn);
  railHead.appendChild(railCta);
  section.appendChild(railHead);

  const track = document.createElement('div');
  track.className = 'rail-track';
  track.setAttribute('tabindex', '0');

  if (!list.items || list.items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    
    let emptyMessage = 'N/A';
    if (list.id === 'watching') {
      emptyMessage = 'Maybe start watching something?';
    } else if (list.id === 'plan') {
      emptyMessage = 'Put stuff you will never watch here';
    } else if (list.id === 'complete') {
      emptyMessage = 'Have you never watched anything to completion?';
    }
    
    empty.textContent = emptyMessage;
    track.appendChild(empty);
  } else {
    list.items.forEach(async (item) => {
      const placeholderCard = createMovieCard({
        id: item.id,
        media_type: item.type,
        title: item.title,
        name: item.title,
        poster_path: item.poster,
        backdrop_path: item.backdrop,
        vote_average: item.vote_average || 0,
        genre_ids: item.genre_ids || [],
        release_date: item.release_date,
        first_air_date: item.first_air_date
      });

      placeholderCard.addEventListener('click', (e) => {
        const target = e.target;
        if (target && (target.closest('.card-add') || target.closest('.movie-overlay'))) return;
        const path = item.type === 'tv' ? `/tv/tv:${item.id}` : `/movies/movie:${item.id}`;
        if (e && (e.ctrlKey || e.metaKey)) {
          const pretty = path.startsWith('/movie-night') ? path : `/movie-night${path}`;
          try { window.open(pretty, '_blank', 'noopener,noreferrer'); } catch {}
          return;
        }
        try {
          const pretty = path.startsWith('/movie-night') ? path : `/movie-night${path}`;
          window.location.href = pretty;
        } catch {}
      });

      placeholderCard.addEventListener('mousedown', (e) => {
        if (e && e.button === 1) {
          const target = e.target;
          if (target && (target.closest('.card-add') || target.closest('.movie-overlay'))) return;
          try { e.preventDefault(); } catch {}
        }
      });

      placeholderCard.addEventListener('auxclick', (e) => {
        if (!e || e.button !== 1) return;
        const target = e.target;
        if (target && (target.closest('.card-add') || target.closest('.movie-overlay'))) return;
        const path = item.type === 'tv' ? `/tv/tv:${item.id}` : `/movies/movie:${item.id}`;
        const pretty = path.startsWith('/movie-night') ? path : `/movie-night${path}`;
        try { window.open(pretty, '_blank', 'noopener,noreferrer'); } catch {}
      });

      addCardActionMenu(placeholderCard, item, list.id);
      addTitleTooltip(placeholderCard);

      track.appendChild(placeholderCard);
      
      startRuntimeTags();

      const hasMetadata = item.vote_average !== undefined && item.genre_ids && item.genre_ids.length > 0;
      
      if (!hasMetadata) {
        try {
          const endpoint = item.type === 'tv' ? `/tv/${item.id}` : `/movie/${item.id}`;
          const fullData = await fetchTMDBData(endpoint);
        
          if (fullData && placeholderCard.isConnected) {
            const updatedCard = createMovieCard({
              id: fullData.id,
              media_type: item.type,
              title: fullData.title || fullData.name,
              name: fullData.name || fullData.title,
              poster_path: fullData.poster_path || item.poster,
              backdrop_path: fullData.backdrop_path || item.backdrop,
              vote_average: fullData.vote_average || 0,
              genre_ids: fullData.genres ? fullData.genres.map(g => g.id) : [],
              release_date: fullData.release_date,
              first_air_date: fullData.first_air_date
            });

            updatedCard.addEventListener('click', (e) => {
              const target = e.target;
              if (target && (target.closest('.card-add') || target.closest('.movie-overlay'))) return;
              const path = item.type === 'tv' ? `/tv/tv:${item.id}` : `/movies/movie:${item.id}`;
              if (e && (e.ctrlKey || e.metaKey)) {
                const pretty = path.startsWith('/movie-night') ? path : `/movie-night${path}`;
                try { window.open(pretty, '_blank', 'noopener,noreferrer'); } catch {}
                return;
              }
              try {
                const pretty = path.startsWith('/movie-night') ? path : `/movie-night${path}`;
                window.location.href = pretty;
              } catch {}
            });

            updatedCard.addEventListener('mousedown', (e) => {
              if (e && e.button === 1) {
                const target = e.target;
                if (target && (target.closest('.card-add') || target.closest('.movie-overlay'))) return;
                try { e.preventDefault(); } catch {}
              }
            });

            updatedCard.addEventListener('auxclick', (e) => {
              if (!e || e.button !== 1) return;
              const target = e.target;
              if (target && (target.closest('.card-add') || target.closest('.movie-overlay'))) return;
              const path = item.type === 'tv' ? `/tv/tv:${item.id}` : `/movies/movie:${item.id}`;
              const pretty = path.startsWith('/movie-night') ? path : `/movie-night${path}`;
              try { window.open(pretty, '_blank', 'noopener,noreferrer'); } catch {}
            });

            addCardActionMenu(updatedCard, item, list.id);
            addTitleTooltip(updatedCard);

            if (placeholderCard.parentNode) {
              placeholderCard.parentNode.replaceChild(updatedCard, placeholderCard);
            }
            
            startRuntimeTags();
          }
        } catch (error) {
          console.error(`Failed to fetch details for ${item.type}:${item.id}`, error);
        }
      }
    });
  }

  section.appendChild(track);

  const railSetup = (async () => {
    const { setupRail } = await import('./ui.js');
    setupRail(section);
  })();

  section.classList.add('revealed');

  container.appendChild(section);
}

/**
 * Generate preview of imported lists
 * @param {Object} data
 * @returns {string}
 */
function generatePreview(data) { // Security Risk: This function is used to generate a preview of imported lists. It is not sanitized and can be used to inject HTML into the page.
  let html = '<ul class="preview-list">';
  
  if (data.lists) {
    const defaultLists = ['watching', 'plan', 'complete'];
    defaultLists.forEach(id => {
      const list = data.lists[id];
      if (list && list.items) {
        html += `<li><strong>${list.name || id}:</strong> ${list.items.length} items</li>`;
      }
    });
  }

  if (data.customLists) {
    Object.values(data.customLists).forEach(list => {
      html += `<li><strong>${list.name}:</strong> ${list.items?.length || 0} items</li>`;
    });
  }

  html += '</ul>';
  return html;
}

// UI Interaction Functions (Private)

/**
 * Toggle expand/collapse for a list
 * @param {HTMLElement} section
 * @param {HTMLElement} button
 */
function toggleExpand(section, button) {
  const isExpanded = section.dataset.expanded === 'true';
  
  if (isExpanded) {
    section.dataset.expanded = 'false';
    section.classList.remove('expanded');
    button.innerHTML = '<span class="rail-icon">⊞</span>';
    button.setAttribute('aria-label', 'Expand list');
  } else {
    section.dataset.expanded = 'true';
    section.classList.add('expanded');
    button.innerHTML = '<span class="rail-icon">⊟</span>';
    button.setAttribute('aria-label', 'Collapse list');
  }
}

/**
 * Set up drag navigation for expanded view (disabled)
 */
function setupExpandedDragNavigation(section, track) {}

/**
 * Add title tooltip to a card
 * @param {HTMLElement} card
 */
function addTitleTooltip(card) {
  const titleElement = card.querySelector('.movie-title');
  if (titleElement) {
    let titleTooltip = null;
    const showTitleTooltip = () => {
      if (titleElement.scrollWidth > titleElement.clientWidth) {
        if (!titleTooltip) {
          titleTooltip = document.createElement('div');
          titleTooltip.className = 'title-tooltip';
          titleTooltip.textContent = titleElement.textContent || '';
          document.body.appendChild(titleTooltip);
        }
        const rect = titleElement.getBoundingClientRect();
        titleTooltip.style.left = `${rect.left + rect.width / 2}px`;
        titleTooltip.style.top = `${rect.bottom + TOOLTIP_OFFSET_PX}px`;
        titleTooltip.classList.add('visible');
      }
    };
    const hideTitleTooltip = () => { if (titleTooltip) titleTooltip.classList.remove('visible'); };
    titleElement.addEventListener('mouseenter', showTitleTooltip);
    titleElement.addEventListener('mouseleave', hideTitleTooltip);
  }
}

/**
 * Add action menu to card
 * @param {HTMLElement} card
 * @param {Object} item
 * @param {string} currentListId
 */
function addCardActionMenu(card, item, currentListId) {
  let btn = card.querySelector('.card-add');
  if (!btn) {
    btn = document.createElement('button');
    btn.className = 'card-add';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Actions');
    btn.textContent = '⋯';
    card.appendChild(btn);
  } else {
    btn.textContent = '⋯';
  }

  const oldHandler = btn.onclick;
  btn.onclick = null;
  btn.removeEventListener('click', oldHandler);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    showCardMenu(btn, item, currentListId);
  });
}

/**
 * Show card action menu
 * @param {HTMLElement} trigger
 * @param {Object} item
 * @param {string} currentListId
 */
function showCardMenu(trigger, item, currentListId) {
  const state = listStore.getState();
  const { lists, customLists } = state;

  const moveItems = [];

  ['watching', 'plan', 'complete'].forEach(id => {
    const list = lists[id];
    if (list && list.id !== currentListId) {
      moveItems.push({
        label: `Move to ${list.name}`,
        action: () => listStore.move(item.id, item.type, currentListId, list.id)
      });
    }
  });

  Object.values(customLists).forEach(list => {
    if (list.id !== currentListId) {
      moveItems.push({
        label: `Move to ${list.name}`,
        action: () => listStore.move(item.id, item.type, currentListId, list.id)
      });
    }
  });

  if (moveItems.length === 0) {
    moveItems.push({ label: 'No other lists', disabled: true });
  }

  const items = [
    {
      label: 'Move to...',
      submenu: moveItems
    },
    { separator: true },
    {
      label: 'Remove from list',
      action: () => listStore.remove(item.id, item.type, currentListId)
    }
  ];

  showMenu({ trigger, items, position: 'right' });
}

/**
 * Set up toolbar actions
 */
function setupToolbar() {
  const createListBtn = document.getElementById('create-list-btn');

  if (createListBtn) {
    createListBtn.addEventListener('click', () => toggleCreateInline(createListBtn));
  }
}

// Import/Export Functions (Private)

/**
 * Handle export lists functionality
 */
function handleExport() {
  const json = listStore.exportLists();
  
  // Create modal
  const modal = createModal('Export Lists', `
    <p>Copy the JSON below or download as a file:</p>
    <textarea readonly class="export-textarea" rows="10">${json}</textarea>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="copy-export-btn">Copy to Clipboard</button>
      <button class="btn btn-primary" id="download-export-btn">Download JSON</button>
    </div>
  `);

  document.body.appendChild(modal);

  const copyBtn = modal.querySelector('#copy-export-btn');
  const downloadBtn = modal.querySelector('#download-export-btn');
  const textarea = modal.querySelector('.export-textarea');

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      textarea.select();
      navigator.clipboard.writeText(json).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => copyBtn.textContent = 'Copy to Clipboard', 2000);
      }).catch(err => {
        console.error('Copy failed:', err);
        alert('Copy failed. Please select and copy manually.');
      });
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `movie-night-lists-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
}

/**
 * Handle import lists functionality
 */
function handleImport() {
  const modal = createModal('Import Lists', `
    <p>Paste JSON or upload a file:</p>
    <textarea class="import-textarea" rows="10" placeholder="Paste JSON here..."></textarea>
    <div class="modal-file-input">
      <label for="import-file-input" class="btn btn-secondary">Choose File</label>
      <input type="file" id="import-file-input" accept="application/json,.json" style="display: none;">
      <span class="file-name"></span>
    </div>
    <div class="modal-options">
      <label>
        <input type="radio" name="import-mode" value="merge" checked> Merge with existing lists
      </label>
      <label>
        <input type="radio" name="import-mode" value="replace"> Replace all lists
      </label>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="cancel-import-btn">Cancel</button>
      <button class="btn btn-primary" id="confirm-import-btn">Import</button>
    </div>
  `);

  document.body.appendChild(modal);

  const textarea = modal.querySelector('.import-textarea');
  const fileInput = modal.querySelector('#import-file-input');
  const fileName = modal.querySelector('.file-name');
  const confirmBtn = modal.querySelector('#confirm-import-btn');
  const cancelBtn = modal.querySelector('#cancel-import-btn');

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        fileName.textContent = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
          textarea.value = e.target.result;
        };
        reader.readAsText(file);
      }
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      const json = textarea.value.trim();
      if (!json) {
        alert('Please paste JSON or select a file.');
        return;
      }

      const mode = modal.querySelector('input[name="import-mode"]:checked')?.value || 'merge';

      try {
        listStore.importLists(json, { merge: mode === 'merge' });
        closeModal(modal);
        alert('Lists imported successfully!');
      } catch (err) {
        console.error('Import failed:', err);
        alert(`Import failed: ${err.message}`);
      }
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => closeModal(modal));
  }
}

/**
 * Handle share lists functionality
 */
function handleShare() {
  try {
    const encoded = listStore.generateShareData();
    const shareUrl = `${window.location.origin}${window.location.pathname}?data=${encoded}`;

    const modal = createModal('Share Lists', `
      <p>Share this URL with others to let them import your lists:</p>
      <input readonly class="share-url-input" value="${shareUrl}">
      <div class="modal-actions">
        <button class="btn btn-secondary" id="copy-share-btn">Copy URL</button>
        ${navigator.share ? '<button class="btn btn-primary" id="native-share-btn">Share</button>' : ''}
      </div>
    `);

    document.body.appendChild(modal);

    const urlInput = modal.querySelector('.share-url-input');
    const copyBtn = modal.querySelector('#copy-share-btn');
    const nativeShareBtn = modal.querySelector('#native-share-btn');

    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        urlInput.select();
        navigator.clipboard.writeText(shareUrl).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => copyBtn.textContent = 'Copy URL', 2000);
        }).catch(err => {
          console.error('Copy failed:', err);
          alert('Copy failed. Please select and copy manually.');
        });
      });
    }

    if (nativeShareBtn && navigator.share) {
      nativeShareBtn.addEventListener('click', async () => {
        try {
          await navigator.share({
            title: 'My Movie Night Lists',
            url: shareUrl
          });
        } catch (err) {
          console.error('Share failed:', err);
        }
      });
    }
  } catch (err) {
    console.error('Share failed:', err);
    alert('Failed to generate share URL.');
  }
}

/**
 * Handle share single list
 * @param {Object} list
 */
function handleShareList(list) {
  try {
    alert(`Under construction come back later`);
  } catch {}
}

/**
 * Handle import into specific list
 * @param {string} listId
 */
function handleImportInto(listId) {
  // Reuse import modal but import only into this list by merging
  try {
    const modal = createModal('Import into list', `
      <p>Paste JSON to import items into this list.</p>
      <textarea class="import-textarea" rows="10" placeholder='{"items": [...]}'></textarea>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="cancel-import-into">Cancel</button>
        <button class="btn btn-primary" id="confirm-import-into">Import</button>
      </div>
    `);
    document.body.appendChild(modal);

    const textarea = modal.querySelector('.import-textarea');
    const cancelBtn = modal.querySelector('#cancel-import-into');
    const confirmBtn = modal.querySelector('#confirm-import-into');
    if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal(modal));
    if (confirmBtn) confirmBtn.addEventListener('click', () => {
      try {
        const data = JSON.parse(textarea.value || '{}');
        if (Array.isArray(data.items)) {
          data.items.forEach((it) => {
            if (it && it.id && it.type) listStore.add(it, listId);
          });
          closeModal(modal);
        } else {
          alert('Invalid JSON: expected an object with an "items" array.');
        }
      } catch (err) {
        alert('Invalid JSON.');
      }
    });
  } catch {}
}

/**
 * Check for import from URL
 */
function checkForImport() {
  const params = new URLSearchParams(window.location.search);
  const dataParam = params.get('data');
  
  if (!dataParam) return;

  try {
    const data = listStore.parseShareData(dataParam);
    
    // Show preview modal
    const previewModal = createModal('Import Shared Lists', `
      <p>Someone shared their lists with you. Preview:</p>
      <div class="import-preview">
        ${generatePreview(data)}
      </div>
      <div class="modal-options">
        <label>
          <input type="radio" name="import-mode-url" value="merge" checked> Merge with existing lists
        </label>
        <label>
          <input type="radio" name="import-mode-url" value="replace"> Replace all lists
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="cancel-import-url-btn">Cancel</button>
        <button class="btn btn-primary" id="confirm-import-url-btn">Import</button>
      </div>
    `);

    document.body.appendChild(previewModal);

    const confirmBtn = previewModal.querySelector('#confirm-import-url-btn');
    const cancelBtn = previewModal.querySelector('#cancel-import-url-btn');

    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        const mode = previewModal.querySelector('input[name="import-mode-url"]:checked')?.value || 'merge';
        try {
          listStore.importLists(JSON.stringify(data), { merge: mode === 'merge' });
          closeModal(previewModal);
          // Remove data param from URL
          const url = new URL(window.location.href);
          url.searchParams.delete('data');
          window.history.replaceState(null, '', url.toString());
          alert('Lists imported successfully!');
        } catch (err) {
          console.error('Import failed:', err);
          alert(`Import failed: ${err.message}`);
        }
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        closeModal(previewModal);
        // Remove data param from URL
        const url = new URL(window.location.href);
        url.searchParams.delete('data');
        window.history.replaceState(null, '', url.toString());
      });
    }
  } catch (err) {
    console.error('Failed to parse share data:', err);
    alert('Invalid share URL.');
  }
}

// List Management Functions (Private)

/**
 * Toggle inline list creation input
 * @param {HTMLElement} button
 */
function toggleCreateInline(button) {
  const container = button.parentElement;
  let input = container.querySelector('#create-list-input');
  if (input) {
    input.remove();
    button.textContent = 'Create List';
    return;
  }

  // Create inline input
  input = document.createElement('input');
  input.type = 'text';
  input.id = 'create-list-input';
  input.className = 'input';
  input.placeholder = 'New list name';
  input.setAttribute('aria-label', 'New list name');
  input.style.marginLeft = '8px';
  input.style.minWidth = '200px';

  // Insert after button
  button.insertAdjacentElement('afterend', input);
  button.textContent = 'Create';

  const submit = () => {
    const name = (input.value || '').trim();
    if (name) {
      listStore.createList(name);
      input.remove();
      button.textContent = 'Create List';
    } else {
      input.focus();
    }
  };

  // Enter to submit, Escape to cancel
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') { input.remove(); button.textContent = 'Create List'; }
  });
  button.addEventListener('click', submit, { once: true });
  try { input.focus(); } catch {}
}

/**
 * Rename list with inline editing
 * @param {string} listId
 * @param {string} currentName
 */
function renameListPrompt(listId, currentName) {
  // Find the title element for this list
  const section = document.querySelector(`[data-list-id="${listId}"]`);
  if (!section) return;
  
  const title = section.querySelector('.section-title');
  if (!title) return;
  
  // Create inline input
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentName;
  input.className = 'input';
  input.style.fontSize = 'inherit';
  input.style.fontWeight = 'inherit';
  input.style.color = 'inherit';
  input.style.background = 'rgba(21,25,35,0.35)';
  input.style.border = '1px solid rgba(255,255,255,0.18)';
  input.style.borderRadius = '6px';
  input.style.padding = '4px 8px';
  input.style.margin = '0';
  input.style.minWidth = '120px';
  input.style.maxWidth = '300px';
  
  // Hide the actions
  const actionsWrap = title.querySelector('.list-title-actions');
  if (actionsWrap) actionsWrap.style.display = 'none';
  
  // Store original text content
  const originalText = title.textContent;
  
  // Clear title content and add input
  title.textContent = '';
  title.appendChild(input);
  
  // Focus and select text
  input.focus();
  input.select();
  
  const submit = () => {
    const newName = (input.value || '').trim();
    if (newName && newName !== currentName) {
      listStore.renameList(listId, newName);
    }
    
    // Restore original state
    title.textContent = newName || currentName;
    if (actionsWrap) actionsWrap.style.display = '';
  };
  
  const cancel = () => {
    title.textContent = currentName;
    if (actionsWrap) actionsWrap.style.display = '';
  };
  
  // Handle key events
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });
  
  // Handle blur (click outside)
  input.addEventListener('blur', () => {
    // Small delay to allow for potential click events
    setTimeout(() => {
      if (input.parentNode) {
        submit();
      }
    }, 100);
  });
}

/**
 * Delete list with confirmation dropdown
 * @param {string} listId
 * @param {string} name
 */
function deleteListPrompt(listId, name) {
  // Find the delete button for this list
  const section = document.querySelector(`[data-list-id="${listId}"]`);
  if (!section) return;
  
  const deleteBtn = section.querySelector('[aria-label="Delete list"]');
  if (!deleteBtn) return;
  
  // Create confirmation dropdown
  const dropdown = document.createElement('div');
  dropdown.className = 'popover-menu delete-confirmation';
  dropdown.style.position = 'absolute';
  dropdown.style.top = '100%';
  dropdown.style.left = '0';
  dropdown.style.marginTop = '8px';
  dropdown.style.minWidth = '200px';
  dropdown.style.zIndex = '10000';
  
  dropdown.innerHTML = `
    <div style="padding: 12px;">
      <p style="margin: 0 0 12px; font-size: 14px; color: var(--text);">Are you sure you want to delete "${name}"?</p>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button class="btn btn-secondary" id="cancel-delete-btn" style="padding: 6px 12px; font-size: 13px;">No</button>
        <button class="btn btn-primary" id="confirm-delete-btn" style="padding: 6px 12px; font-size: 13px; background: #ff6b6b; border-color: #ff6b6b;">Yes</button>
      </div>
    </div>
  `;
  
  // Position the dropdown relative to the delete button
  const buttonRect = deleteBtn.getBoundingClientRect();
  const sectionRect = section.getBoundingClientRect();
  
  dropdown.style.position = 'fixed';
  dropdown.style.top = `${buttonRect.bottom + 8}px`;
  dropdown.style.left = `${buttonRect.left}px`;
  
  // Add to document
  document.body.appendChild(dropdown);
  
  // Get buttons
  const cancelBtn = dropdown.querySelector('#cancel-delete-btn');
  const confirmBtn = dropdown.querySelector('#confirm-delete-btn');
  
  const closeDropdown = () => {
    if (dropdown.parentNode) {
      dropdown.parentNode.removeChild(dropdown);
    }
  };
  
  // Handle cancel
  cancelBtn.addEventListener('click', closeDropdown);
  
  // Handle confirm
  confirmBtn.addEventListener('click', () => {
    listStore.deleteList(listId);
    closeDropdown();
  });
  
  // Handle click outside
  const handleClickOutside = (e) => {
    if (!dropdown.contains(e.target) && !deleteBtn.contains(e.target)) {
      closeDropdown();
      document.removeEventListener('click', handleClickOutside);
    }
  };
  
  // Add click outside listener with a small delay
  setTimeout(() => {
    document.addEventListener('click', handleClickOutside);
  }, 10);
  
  // Handle escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeDropdown();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  
  document.addEventListener('keydown', handleEscape);
}

// Modal Utilities (Private)

/**
 * Create modal element
 * @param {string} title
 * @param {string} content
 * @returns {HTMLElement}
 */
function createModal(title, content) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" type="button" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body">
        ${content}
      </div>
    </div>
  `;

  const closeBtn = modal.querySelector('.modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeModal(modal));
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal(modal);
    }
  });

  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      closeModal(modal);
      document.removeEventListener('keydown', escHandler);
    }
  });

  return modal;
}

/**
 * Close and remove modal
 * @param {HTMLElement} modal
 */
function closeModal(modal) {
  if (modal && modal.parentNode) {
    modal.parentNode.removeChild(modal);
  }
}