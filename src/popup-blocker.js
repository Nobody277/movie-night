/**
 * Popup Blocker Utility
 * Prevents unwanted popups and redirects from embedded content
 */

const originalWindowOpen = window.open;
window.open = function(...args) {
  const url = args[0];
  
  if (!url) return null;
  
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return originalWindowOpen.apply(this, args);
  }
  
  const urlStr = String(url);
  if (
    urlStr.includes('/movie-night') ||
    urlStr.includes('/movies/movie:') ||
    urlStr.includes('/tv/tv:') ||
    urlStr.includes('details.html') ||
    urlStr.includes('movies.html') ||
    urlStr.includes('tv.html') ||
    urlStr.includes('search.html') ||
    urlStr.includes('my-list.html') ||
    urlStr.includes('index.html') ||
    (urlStr.startsWith('/') && !urlStr.includes('://') && !urlStr.startsWith('//')) ||
    (urlStr.endsWith('.html') && !urlStr.includes('://') && !urlStr.startsWith('//'))
  ) {
    return originalWindowOpen.apply(this, args);
  }
  
  return null;
};

// Block focus stealing
let lastFocusTime = Date.now();
window.addEventListener('blur', () => {
  const now = Date.now();
  if (now - lastFocusTime < 1000) {
    setTimeout(() => window.focus(), 10);
  }
  lastFocusTime = now;
});

const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.tagName === 'IFRAME') {
        const src = node.src || '';
        if (!src.includes('vidsrc.cc') && !node.classList.contains('player-iframe')) {
          node.remove();
        }
      }
    });
  });
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});