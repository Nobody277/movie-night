let instance = null;

/**
 * Initializes the p5.js background animation with a 2D wireframe grid and wave effect.
 * 
 * @returns {void}
 */
export function startBackground() {
  if (!window.p5 || instance) return;

  const sketch = (p) => {
    let xLines = [];
    let yLines = [];
    let gridSpacing = 48;
    let gridColorBase = { r: 255, g: 255, b: 255 };
    let targetFps = 60;
    let headerHeight = 0;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /**
     * Gets the current height of the site header element.
     * 
     * @returns {number} The header height in pixels, or 0 if not found.
     */
    function getHeaderHeight() {
      try {
        const header = document.querySelector('.site-header');
        if (header) {
          return header.offsetHeight || 0;
        }
      } catch {}
      return 0;
    }

    /**
     * Recomputes the grid layout to create perfect squares that align to screen edges.
     * The grid starts below the header and extends to the bottom of the screen.
     * 
     * @returns {void}
     */
    function recomputeGrid() {
      const width = p.width;
      const fullHeight = p.height;
      
      headerHeight = getHeaderHeight();
      const visibleHeight = fullHeight - headerHeight;
      
      const minDimension = Math.min(width, visibleHeight);
      const targetCellCount = Math.max(15, Math.min(25, Math.floor(minDimension / 40)));
      
      const baseSpacing = Math.max(36, Math.min(80, Math.floor(minDimension / targetCellCount)));
      
      let cellCount = Math.floor(minDimension / baseSpacing);
      cellCount = Math.max(1, cellCount);
      
      gridSpacing = minDimension / cellCount;
      
      const xCellCount = Math.round(width / gridSpacing);
      const yCellCount = Math.round(visibleHeight / gridSpacing);
      
      const xExactSpacing = width / xCellCount;
      const yExactSpacing = visibleHeight / yCellCount;

      xLines = [];
      for (let i = 0; i <= xCellCount; i++) {
        const x = i * xExactSpacing;
        xLines.push(Math.round(x));
      }
      xLines[0] = 0;
      xLines[xLines.length - 1] = width;

      yLines = [];
      for (let i = 0; i <= yCellCount; i++) {
        const y = headerHeight + (i * yExactSpacing);
        yLines.push(Math.round(y));
      }
      yLines[0] = headerHeight;
      yLines[yLines.length - 1] = fullHeight;
    }

    /**
     * p5.js setup function - initializes the canvas and grid.
     * 
     * @returns {void}
     */
    p.setup = function() {
      p.pixelDensity(1);
      p.createCanvas(p.windowWidth, p.windowHeight);
      p.frameRate(targetFps);
      recomputeGrid();
      p.background(0);

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) p.noLoop();
        else p.loop();
      });

      try {
        const css = getComputedStyle(document.documentElement).getPropertyValue('--grid-rgb').trim();
        if (css) {
          const parts = css.split(',').map(s => Number(s.trim()));
          if (parts.length === 3 && parts.every(n => Number.isFinite(n))) {
            gridColorBase = { r: parts[0] || 255, g: parts[1] || 255, b: parts[2] || 255 };
          }
        }
      } catch {}
    };

    /**
     * p5.js draw function - renders the animated grid each frame.
     * 
     * @returns {void}
     */
    p.draw = function() {
      p.background(0);
      if (reduceMotion) {
        drawGridStatic();
        return;
      }
      drawGrid();
    };

    /**
     * p5.js windowResized function - handles window resize events.
     * 
     * @returns {void}
     */
    p.windowResized = function() {
      p.pixelDensity(1);
      p.resizeCanvas(p.windowWidth, p.windowHeight, true);
      recomputeGrid();
      p.background(0);
    };
    
    const headerObserver = new MutationObserver(() => {
      recomputeGrid();
    });
    
    setTimeout(() => {
      try {
        const header = document.querySelector('.site-header');
        if (header) {
          headerObserver.observe(header, { 
            attributes: true, 
            attributeFilter: ['style', 'class'],
            childList: true,
            subtree: true
          });
        }
      } catch {}
    }, 100);

    /**
     * Draws the animated grid with wave effects on horizontal and vertical lines.
     * 
     * @returns {void}
     */
    function drawGrid() {
      const time = p.frameCount * 0.02;

      for (let i = 0; i < yLines.length; i++) {
        const y = yLines[i];
        const wave = (Math.sin(time + i * 0.35) + 1) * 0.5;
        let brightness = 0.12 + wave * 0.18;
        brightness = Math.min(1, brightness);

        const r = Math.floor(gridColorBase.r * brightness);
        const g = Math.floor(gridColorBase.g * brightness);
        const b = Math.floor(gridColorBase.b * brightness);
        p.stroke(r, g, b, 150);
        p.strokeWeight(1);
        p.line(0, y, p.width, y);
      }

      for (let i = 0; i < xLines.length; i++) {
        const x = xLines[i];
        const wave = (Math.sin(time * 0.85 + i * 0.45) + 1) * 0.5;
        let brightness = 0.10 + wave * 0.18;
        brightness = Math.min(1, brightness);

        const r = Math.floor(gridColorBase.r * brightness);
        const g = Math.floor(gridColorBase.g * brightness);
        const b = Math.floor(gridColorBase.b * brightness);
        p.stroke(r, g, b, 150);
        p.strokeWeight(1);
        p.line(x, 0, x, p.height);
      }
    }

    /**
     * Draws a static grid without animation effects.
     * Used when the user has reduced motion preferences enabled.
     * 
     * @returns {void}
     */
    function drawGridStatic() {
      for (let i = 0; i < yLines.length; i++) {
        const y = yLines[i];
        const r = Math.floor(gridColorBase.r * 0.22);
        const g = Math.floor(gridColorBase.g * 0.22);
        const b = Math.floor(gridColorBase.b * 0.22);
        p.stroke(r, g, b, 150);
        p.strokeWeight(1);
        p.line(0, y, p.width, y);
      }
      for (let i = 0; i < xLines.length; i++) {
        const x = xLines[i];
        const r = Math.floor(gridColorBase.r * 0.20);
        const g = Math.floor(gridColorBase.g * 0.20);
        const b = Math.floor(gridColorBase.b * 0.20);
        p.stroke(r, g, b, 150);
        p.strokeWeight(1);
        p.line(x, 0, x, p.height);
      }
    }
  };

  instance = new window.p5(sketch);
  window.p5Instance = instance;
}

/**
 * Cleans up and removes the p5.js background animation instance.
 * Removes the canvas element and resets the instance reference.
 * 
 * @returns {void}
 */
export function destroyBackground() {
  try {
    if (instance && typeof instance.remove === 'function') {
      instance.remove();
    }
  } catch {}
  const existingCanvas = document.querySelector('canvas.p5Canvas');
  if (existingCanvas) existingCanvas.remove();
  instance = null;
  window.p5Instance = null;
}