/**
 * Movies page controls: genres, sort, time range, and control focus handling.
 *
 * @module movies
 */

/**
 * Initialize genres panel toggle, selection state, and counter.
 */
export function initializeGenresToggle() {
  const genresToggle = document.querySelector('.genres-toggle');
  const genresPanel = document.getElementById('genres-panel');
  const genresCounter = document.querySelector('.genres-counter');
  if (genresToggle && genresPanel) {
    function updateGenreCounter() {
      const checkedGenres = document.querySelectorAll('.genre-input:checked');
      const count = checkedGenres.length;
      if (genresCounter) {
        if (count > 0) {
          genresCounter.textContent = ` (${count} selected)`;
          genresCounter.style.display = '';
        } else {
          genresCounter.style.display = 'none';
        }
      }
    }

    const genreInputs = document.querySelectorAll('.genre-input');
    genreInputs.forEach(input => { input.addEventListener('change', updateGenreCounter); });
    updateGenreCounter();

    genresToggle.addEventListener('click', () => {
      const willOpen = !genresPanel.classList.contains('open');
      genresPanel.classList.toggle('open', willOpen);
      genresToggle.setAttribute('aria-expanded', String(willOpen));
    });

    document.addEventListener('click', (e) => {
      if (!genresToggle.contains(e.target) && !genresPanel.contains(e.target)) {
        genresPanel.classList.remove('open');
        genresToggle.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        genresPanel.classList.remove('open');
        genresToggle.setAttribute('aria-expanded', 'false');
        genresToggle.focus();
      }
    });
  }
}

/**
 * Initialize sort dropdown interactions.
 */
export function initializeSortDropdown() {
  const sortGroup = document.querySelector('.sort-group');
  const sortToggle = document.querySelector('.sort-toggle');
  const sortMenu = document.getElementById('sort-menu');
  if (sortGroup && sortToggle && sortMenu) {
    const sortLabel = sortToggle.querySelector('.sort-label');
    const sortArrow = sortToggle.querySelector('.sort-arrow');

    const closeMenu = () => {
      sortMenu.classList.remove('open');
      sortToggle.setAttribute('aria-expanded', 'false');
    };
    const openMenu = () => {
      sortMenu.classList.add('open');
      sortToggle.setAttribute('aria-expanded', 'true');
    };

    sortToggle.addEventListener('click', () => {
      const willOpen = !sortMenu.classList.contains('open');
      if (willOpen) openMenu(); else closeMenu();
    });

    sortMenu.addEventListener('click', (e) => {
      const option = e.target.closest('.sort-option');
      if (!option) return;
      const label = option.getAttribute('data-label') || '';
      const dir = option.getAttribute('data-dir') || 'desc';
      if (sortLabel) sortLabel.textContent = label;
      if (sortArrow) {
        sortArrow.setAttribute('data-dir', dir);
        sortArrow.textContent = dir === 'asc' ? '↑' : '↓';
      }
      closeMenu();
    });

    document.addEventListener('click', (e) => { if (!sortGroup.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); sortToggle.focus(); } });
  }
}

/**
 * Initialize time period dropdown interactions.
 */
export function initializeTimeDropdown() {
  const timeGroup = document.querySelector('.time-group');
  const timeToggle = document.querySelector('.time-toggle');
  const timeMenu = document.getElementById('time-menu');
  if (timeGroup && timeToggle && timeMenu) {
    const timeLabel = timeToggle.querySelector('.time-label');

    const closeMenu = () => {
      timeMenu.classList.remove('open');
      timeToggle.setAttribute('aria-expanded', 'false');
    };
    const openMenu = () => {
      timeMenu.classList.add('open');
      timeToggle.setAttribute('aria-expanded', 'true');
    };

    timeToggle.addEventListener('click', () => {
      const willOpen = !timeMenu.classList.contains('open');
      if (willOpen) openMenu(); else closeMenu();
    });

    timeMenu.addEventListener('click', (e) => {
      const option = e.target.closest('.time-option');
      if (!option) return;
      const label = option.getAttribute('data-label') || '';
      const value = option.getAttribute('data-value') || 'all';
      if (timeLabel) timeLabel.textContent = label;
      timeToggle.setAttribute('data-value', value);
      closeMenu();
    });

    document.addEventListener('click', (e) => { if (!timeGroup.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); timeToggle.focus(); } });
  }
}

/**
 * Enhance control buttons so they don't retain focus outlines after click.
 */
export function initializeControlButtons() {
  const clickableControls = document.querySelectorAll('.apply-filters, .clear-filters, .genres-toggle, .sort-toggle, .sort-option, .time-toggle, .time-option');
  clickableControls.forEach((el) => {
    el.addEventListener('mousedown', () => { el.addEventListener('mouseup', () => el.blur(), { once: true }); });
    el.addEventListener('click', () => { if (document.body.matches(':focus-within')) el.blur(); });
  });

  const clearFiltersBtn = document.querySelector('.clear-filters');
  const sortToggle = document.querySelector('.sort-toggle');
  const timeToggle = document.querySelector('.time-toggle');
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      document.querySelectorAll('.genre-input').forEach((input) => { input.checked = false; });
      const genresCounter = document.querySelector('.genres-counter');
      if (genresCounter) genresCounter.style.display = 'none';
      if (sortToggle) {
        const sortLabel = sortToggle.querySelector('.sort-label');
        const sortArrow = sortToggle.querySelector('.sort-arrow');
        if (sortLabel && sortArrow) {
          sortLabel.textContent = 'Popularity';
          sortArrow.setAttribute('data-dir', 'desc');
          sortArrow.textContent = '↓';
        }
      }
      if (timeToggle) {
        const timeLabel = timeToggle.querySelector('.time-label');
        if (timeLabel) timeLabel.textContent = 'All time';
        timeToggle.setAttribute('data-value', 'all');
      }
      clearFiltersBtn.blur();
    });
  }
}