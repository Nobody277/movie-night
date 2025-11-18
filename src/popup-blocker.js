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
  
  console.log('Blocked popup attempt:', url);
  return null;
};

// Prevent navigation away from the site
let userInitiatedNavigation = false;

// Track user clicks to allow legitimate navigation
document.addEventListener('click', (e) => {
  // Check if click is on a legitimate link
  const link = e.target.closest('a');
  if (link && link.href && !link.href.startsWith('javascript:')) {
    userInitiatedNavigation = true;
    setTimeout(() => { userInitiatedNavigation = false; }, 1000);
  }
}, true);

// Block beforeunload if not user-initiated
window.addEventListener('beforeunload', (e) => {
  if (!userInitiatedNavigation) {
    e.preventDefault();
    e.returnValue = '';
    console.log('Blocked potential redirect attempt');
  }
}, true);

// Block focus stealing
let lastFocusTime = Date.now();
window.addEventListener('blur', () => {
  const now = Date.now();
  if (now - lastFocusTime < 1000) {
    // Rapid blur/focus might be an ad trying to steal focus
    console.log('Detected potential focus stealing attempt');
    setTimeout(() => window.focus(), 10);
  }
  lastFocusTime = now;
});

// Monitor and block suspicious iframes being added dynamically
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.tagName === 'IFRAME') {
        const src = node.src || '';
        // Allow our player iframes
        if (!src.includes('vidsrc.cc') && !node.classList.contains('player-iframe')) {
          console.log('Blocked suspicious iframe:', src);
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

console.log('Popup blocker initialized');
