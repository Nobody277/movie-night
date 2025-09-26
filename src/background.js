/**
 * Background animation (p5.js) module.
 *
 * Provides functions to initialize and destroy a particle-based
 * gradient animation rendered via p5.js onto a full-window canvas.
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
    let particles = [];
    const num = 1000;
    const noiseScale = 0.01/2;

    p.setup = function() {
      p.pixelDensity(1);
      p.createCanvas(p.windowWidth, p.windowHeight);
      p.frameRate(60);
      for (let i = 0; i < num; i++) {
        particles.push(p.createVector(p.random(p.width), p.random(p.height)));
      }
      p.background(0);

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) p.noLoop();
        else p.loop();
      });
    };

    p.draw = function() {
      p.background(0, 10);
      for (let i = 0; i < num; i++) {
        const particle = particles[i];

        const gradientFactor = particle.x / p.width;
        const r = p.lerp(174, 119, gradientFactor);
        const g = p.lerp(44, 118, gradientFactor);
        const b = p.lerp(241, 255, gradientFactor);

        p.stroke(r, g, b);
        p.point(particle.x, particle.y);

        const n = p.noise(particle.x * noiseScale, particle.y * noiseScale, p.frameCount * noiseScale * noiseScale);
        const a = p.TAU * n;
        particle.x += p.cos(a);
        particle.y += p.sin(a);
        if (!onScreen(particle, p)) {
          particle.x = p.random(p.width);
          particle.y = p.random(p.height);
        }
      }
    };

    p.windowResized = function() {
      p.pixelDensity(1);
      p.resizeCanvas(p.windowWidth, p.windowHeight, true);
      p.background(0);
    };

    function onScreen(v, p) {
      return v.x >= 0 && v.x <= p.width && v.y >= 0 && v.y <= p.height;
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