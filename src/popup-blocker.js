/**
 * Popup Blocker Utility
 * Prevents unwanted popups and redirects from embedded content
 */

const originalWindowOpen = window.open;
window.open = function(...args) {
  const url = args[0];
  
  if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
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