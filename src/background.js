/**
 * Background animation (p5.js) module.
 *
 * Renders a 2D wireframe grid with a subtle wave animation.
 *
 * @module background
 */

let instance = null;

/**
 * Initialize the background p5 sketch (idempotent).
 * Creates a full-screen canvas and starts the animation loop.
 */
export function initBackground() {
  if (!window.p5 || instance) return;

  const sketch = (p) => {
    let xLines = [];
    let yLines = [];
    let gridSpacing = 48;
    let gridColorBase = { r: 255, g: 255, b: 255 };
    let targetFps = 60;

    function recomputeGrid() {
      const base = Math.min(p.width, p.height);
      gridSpacing = Math.max(36, Math.min(80, Math.floor(base / 20)));

      xLines = [];
      for (let x = 0; x <= p.width; x += gridSpacing) xLines.push(Math.floor(x));

      yLines = [];
      for (let y = 0; y <= p.height; y += gridSpacing) yLines.push(Math.floor(y));
    }

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
    };

    p.draw = function() {
      p.background(0);
      drawGrid();
    };

    p.windowResized = function() {
      p.pixelDensity(1);
      p.resizeCanvas(p.windowWidth, p.windowHeight, true);
      recomputeGrid();
      p.background(0);
    };

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
  };

  instance = new window.p5(sketch);
  window.p5Instance = instance;
}

/**
 * Destroy the background p5 sketch and remove its canvas.
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