/**
 * Reusable accessible menu component
 * Supports nested submenus, keyboard navigation, ARIA roles
 */
let activeMenu = null;
let activeSubmenu = null;
let focusedIndex = -1;
let submenuTimeout = null;

/**
 * Create and show a context menu
 * @param {Object} options
 * @param {HTMLElement} options.trigger - Element that triggered the menu
 * @param {Array} options.items - Menu items
 * @param {Function} options.onClose - Callback when menu closes
 * @returns {Object} Menu controller
 */
export function showMenu(options) {
  const { trigger, items, onClose, position = 'right' } = options;

  closeMenu();

  const menu = createMenuElement(items, position);
  document.body.appendChild(menu);
  activeMenu = menu;

  positionMenu(menu, trigger, position);

  trigger.setAttribute('aria-expanded', 'true');
  trigger.setAttribute('aria-controls', menu.id);

  requestAnimationFrame(() => {
    const firstItem = menu.querySelector('[role="menuitem"]:not([disabled])');
    if (firstItem) {
      firstItem.focus();
      focusedIndex = 0;
    }
  });

  const handleOutsideClick = (e) => {
    if (!menu.contains(e.target) && !trigger.contains(e.target)) {
      closeMenu();
    }
  };

  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
      trigger.focus();
    }
  };

  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
  }, 0);

  function cleanup() {
    document.removeEventListener('click', handleOutsideClick);
    document.removeEventListener('keydown', handleEscape);
    if (menu.parentNode) menu.parentNode.removeChild(menu);
    trigger.setAttribute('aria-expanded', 'false');
    activeMenu = null;
    activeSubmenu = null;
    focusedIndex = -1;
    if (onClose) onClose();
  }

  menu._cleanup = cleanup;

  return {
    close: closeMenu,
    element: menu
  };
}

/**
 * Close active menu
 */
export function closeMenu() {
  if (activeSubmenu) {
    if (activeSubmenu.parentNode) activeSubmenu.parentNode.removeChild(activeSubmenu);
    activeSubmenu = null;
  }
  if (activeMenu && activeMenu._cleanup) {
    activeMenu._cleanup();
  }
  if (submenuTimeout) {
    clearTimeout(submenuTimeout);
    submenuTimeout = null;
  }
}

// Private Helper Functions

/**
 * Create menu element
 * @param {Array} items
 * @param {string} position
 * @returns {HTMLElement}
 */
function createMenuElement(items, position) {
  const menu = document.createElement('div');
  menu.className = `popover-menu ${position === 'right' ? 'menu-right' : ''}`;
  menu.setAttribute('role', 'menu');
  menu.id = `menu-${Date.now()}`;

  items.forEach((item, idx) => {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'menu-sep';
      sep.setAttribute('role', 'separator');
      menu.appendChild(sep);
      return;
    }

    const menuItem = document.createElement('button');
    menuItem.className = 'menu-item';
    menuItem.setAttribute('role', 'menuitem');
    menuItem.setAttribute('type', 'button');
    menuItem.tabIndex = -1;
    
    if (item.disabled) {
      menuItem.setAttribute('disabled', 'true');
      menuItem.setAttribute('aria-disabled', 'true');
    }

    const label = document.createElement('span');
    label.textContent = item.label;
    menuItem.appendChild(label);

    if (item.submenu) {
      menuItem.setAttribute('aria-haspopup', 'menu');
      menuItem.setAttribute('aria-expanded', 'false');
      const arrow = document.createElement('span');
      arrow.className = 'submenu-arrow';
      arrow.textContent = '›';
      menuItem.appendChild(arrow);

      menuItem.addEventListener('mouseenter', () => {
        if (submenuTimeout) clearTimeout(submenuTimeout);
        submenuTimeout = setTimeout(() => {
          openSubmenu(menuItem, item.submenu);
        }, 150);
      });

      menuItem.addEventListener('mouseleave', () => {
        if (submenuTimeout) {
          clearTimeout(submenuTimeout);
          submenuTimeout = null;
        }
      });

      menuItem.addEventListener('click', (e) => {
        e.stopPropagation();
        openSubmenu(menuItem, item.submenu);
      });
    } else {
      menuItem.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.action) item.action();
        closeMenu();
      });
    }

    menuItem.addEventListener('keydown', (e) => {
      handleMenuKeydown(e, menu, menuItem, item);
    });

    menu.appendChild(menuItem);
  });

  return menu;
}

/**
 * Open submenu
 * @param {HTMLElement} parentItem
 * @param {Array} submenuItems
 */
function openSubmenu(parentItem, submenuItems) {
  if (activeSubmenu) {
    if (activeSubmenu.parentNode) activeSubmenu.parentNode.removeChild(activeSubmenu);
  }

  const submenu = createMenuElement(submenuItems, 'right');
  submenu.classList.add('submenu');
  document.body.appendChild(submenu);
  activeSubmenu = submenu;

  const rect = parentItem.getBoundingClientRect();
  submenu.style.position = 'fixed';
  submenu.style.left = `${rect.right}px`;
  submenu.style.top = `${rect.top}px`;

  requestAnimationFrame(() => {
    const submenuRect = submenu.getBoundingClientRect();
    if (submenuRect.right > window.innerWidth) {
      submenu.style.left = `${rect.left - submenuRect.width}px`;
    }
    if (submenuRect.bottom > window.innerHeight) {
      submenu.style.top = `${Math.max(8, window.innerHeight - submenuRect.height - 8)}px`;
    }
  });

  parentItem.setAttribute('aria-expanded', 'true');

  requestAnimationFrame(() => {
    const firstItem = submenu.querySelector('[role="menuitem"]:not([disabled])');
    if (firstItem) firstItem.focus();
  });

  let leaveTimeout = null;
  const handleLeave = () => {
    leaveTimeout = setTimeout(() => {
      if (activeSubmenu === submenu) {
        submenu.remove();
        activeSubmenu = null;
        parentItem.setAttribute('aria-expanded', 'false');
      }
    }, 200);
  };

  const handleEnter = () => {
    if (leaveTimeout) clearTimeout(leaveTimeout);
  };

  submenu.addEventListener('mouseleave', handleLeave);
  submenu.addEventListener('mouseenter', handleEnter);
  parentItem.addEventListener('mouseenter', handleEnter);
}

/**
 * Handle keyboard navigation
 * @param {KeyboardEvent} e
 * @param {HTMLElement} menu
 * @param {HTMLElement} currentItem
 * @param {Object} item
 */
function handleMenuKeydown(e, menu, currentItem, item) {
  const items = Array.from(menu.querySelectorAll('[role="menuitem"]:not([disabled])'));
  const currentIndex = items.indexOf(currentItem);

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      focusNextItem(items, currentIndex);
      break;
    
    case 'ArrowUp':
      e.preventDefault();
      focusPreviousItem(items, currentIndex);
      break;
    
    case 'ArrowRight':
      if (item.submenu) {
        e.preventDefault();
        openSubmenu(currentItem, item.submenu);
      }
      break;
    
    case 'ArrowLeft':
      if (activeSubmenu && menu === activeSubmenu) {
        e.preventDefault();
        activeSubmenu.remove();
        activeSubmenu = null;
        currentItem.setAttribute('aria-expanded', 'false');
      }
      break;
    
    case 'Home':
      e.preventDefault();
      if (items[0]) items[0].focus();
      break;
    
    case 'End':
      e.preventDefault();
      if (items[items.length - 1]) items[items.length - 1].focus();
      break;
    
    case 'Enter':
    case ' ':
      e.preventDefault();
      currentItem.click();
      break;
    
    case 'Escape':
      e.preventDefault();
      closeMenu();
      break;
    
    default:
      if (e.key.length === 1) {
        const char = e.key.toLowerCase();
        const next = items.find((item, idx) => {
          if (idx <= currentIndex) return false;
          const text = item.textContent?.toLowerCase() || '';
          return text.startsWith(char);
        });
        if (next) {
          next.focus();
        } else {
          const first = items.find(item => {
            const text = item.textContent?.toLowerCase() || '';
            return text.startsWith(char);
          });
          if (first) first.focus();
        }
      }
  }
}

/**
 * Focus next menu item
 * @param {Array} items
 * @param {number} currentIndex
 */
function focusNextItem(items, currentIndex) {
  const nextIndex = (currentIndex + 1) % items.length;
  if (items[nextIndex]) items[nextIndex].focus();
}

/**
 * Focus previous menu item
 * @param {Array} items
 * @param {number} currentIndex
 */
function focusPreviousItem(items, currentIndex) {
  const prevIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
  if (items[prevIndex]) items[prevIndex].focus();
}

/**
 * Position menu relative to trigger
 * @param {HTMLElement} menu
 * @param {HTMLElement} trigger
 * @param {string} position
 */
function positionMenu(menu, trigger, position) {
  const rect = trigger.getBoundingClientRect();
  menu.style.position = 'fixed';
  
  if (position === 'right') {
    menu.style.left = `${rect.right + 8}px`;
    menu.style.top = `${rect.top}px`;
  } else if (position === 'bottom') {
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 4}px`;
  } else {
    menu.style.left = `${rect.right + 8}px`;
    menu.style.top = `${rect.top}px`;
  }

  requestAnimationFrame(() => {
    const menuRect = menu.getBoundingClientRect();
    
    if (menuRect.right > window.innerWidth) {
      menu.style.left = `${rect.left - menuRect.width - 8}px`;
    }
    
    if (menuRect.bottom > window.innerHeight) {
      menu.style.top = `${Math.max(8, window.innerHeight - menuRect.height - 8)}px`;
    }
    
    if (menuRect.left < 0) {
      menu.style.left = '8px';
    }
    
    if (menuRect.top < 0) {
      menu.style.top = '8px';
    }
  });
}