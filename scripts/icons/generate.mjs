// Generates the app icons from a vector description (no image tools needed): node scripts/icons/generate.mjs
// Motif: a shield holding a clock whose used part of the hour is filled in.
// Shapes are rendered as signed distance fields with analytic anti-aliasing and written with pngjs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const INDIGO = [0x4c, 0x6e, 0xf5];
const TEAL = [0x0c, 0xa6, 0x78];
const INK = [0x2b, 0x3a, 0x9e];
const ORANGE = [0xff, 0x92, 0x2b];
const WHITE = [0xff, 0xff, 0xff];

// Glyph geometry in centered units (the glyph spans roughly -0.47..0.47, y grows downwards).
const SHIELD = { halfWidth: 0.37, top: -0.45, shoulder: 0.0, tip: 0.48, corner: 0.06 };
const CLOCK = [0, -0.06];
const CLOCK_R = 0.215;
const RING = 0.036;
const HAND_R = 0.022;
// The "used" wedge runs clockwise from 12 o'clock to this angle.
const WEDGE_DEG = 125;

const circle = (c, r) => (x, y) => Math.hypot(x - c[0], y - c[1]) - r;
const segment = (a, b, r) => (x, y) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) - r;
};
const union =
  (...fs) =>
  (x, y) =>
    Math.min(...fs.map((f) => f(x, y)));
const intersect =
  (...fs) =>
  (x, y) =>
    Math.max(...fs.map((f) => f(x, y)));

/** Straight sides down to the shoulder, then a parabola to the tip; the whole outline is rounded by `corner`. */
function shield({ halfWidth, top, shoulder, tip, corner }) {
  const w = halfWidth - corner;
  const t0 = top + corner;
  const t1 = tip - corner;
  return (x, y) => {
    const ax = Math.abs(x);
    let d;
    if (y <= shoulder) {
      const dx = ax - w;
      const dy = t0 - y;
      d = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
    } else {
      const t = (y - shoulder) / (t1 - shoulder);
      const width = w * (1 - t * t);
      const slope = (2 * w * t) / (t1 - shoulder);
      // Horizontal distance to the curve, corrected by its slope to approximate the true distance.
      d = (ax - width) / Math.hypot(1, slope);
    }
    return d - corner;
  };
}

const rad = (WEDGE_DEG * Math.PI) / 180;
const handEnd = (len, angle) => [CLOCK[0] + len * Math.sin(angle), CLOCK[1] - len * Math.cos(angle)];
const wedge = intersect(
  circle(CLOCK, CLOCK_R - RING / 2),
  (x) => -(x - CLOCK[0]),
  (x, y) => Math.sin(rad) * (y - CLOCK[1]) + Math.cos(rad) * (x - CLOCK[0]),
);
const ring = (x, y) => Math.abs(circle(CLOCK, CLOCK_R)(x, y)) - RING / 2;
const hands = union(
  segment(CLOCK, handEnd(CLOCK_R * 0.62, 0), HAND_R),
  segment(CLOCK, handEnd(CLOCK_R * 0.78, rad), HAND_R),
  circle(CLOCK, HAND_R * 1.6),
);
const shieldShape = shield(SHIELD);

/**
 * Renders layers onto a `size`² canvas. `scale` maps glyph units to the canvas (1 = the full width).
 * A layer is { sdf, color: [r,g,b] | (u,v)=>[r,g,b], erase?: true }; the background is a layer with sdf = null.
 */
function render(size, scale, layers) {
  const png = new PNG({ width: size, height: size });
  const unitPerPx = 1 / (size * scale);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = (px + 0.5) / size;
      const v = (py + 0.5) / size;
      const x = (u - 0.5) / scale;
      const y = (v - 0.5) / scale;
      let [r, g, b, a] = [0, 0, 0, 0];
      for (const layer of layers) {
        // Coverage from the distance in pixels: 1 inside, 0 outside, linear across one pixel.
        const cov = layer.sdf ? Math.max(0, Math.min(1, 0.5 - layer.sdf(x, y) / unitPerPx)) : 1;
        if (cov === 0) continue;
        if (layer.erase) {
          a *= 1 - cov;
          continue;
        }
        const c = typeof layer.color === 'function' ? layer.color(u, v) : layer.color;
        const na = cov + a * (1 - cov);
        r = (c[0] * cov + r * a * (1 - cov)) / na;
        g = (c[1] * cov + g * a * (1 - cov)) / na;
        b = (c[2] * cov + b * a * (1 - cov)) / na;
        a = na;
      }
      const i = (py * size + px) * 4;
      png.data[i] = Math.round(r);
      png.data[i + 1] = Math.round(g);
      png.data[i + 2] = Math.round(b);
      png.data[i + 3] = Math.round(a * 255);
    }
  }
  return PNG.sync.write(png);
}

const gradient = (u, v) => {
  const t = Math.max(0, Math.min(1, (u + v) / 2));
  return INDIGO.map((c, i) => c + (TEAL[i] - c) * t);
};

const colorGlyph = [
  { sdf: shieldShape, color: WHITE },
  { sdf: wedge, color: ORANGE },
  { sdf: ring, color: INK },
  { sdf: hands, color: INK },
];
// Single-color silhouette (Android monochrome icon, notification icon): the clock is cut out of the shield.
const monoGlyph = [
  { sdf: shieldShape, color: WHITE },
  { sdf: union(ring, hands), erase: true },
];
const background = { sdf: null, color: gradient };

// ICON_OUT=<dir> writes somewhere else for a preview.
const outDir = (process.env.ICON_OUT ?? new URL('../../assets/', import.meta.url).pathname).replace(/\/$/, '');
mkdirSync(outDir, { recursive: true });
const out = (name, data) => {
  writeFileSync(`${outDir}/${name}`, data);
  console.log(`wrote ${outDir}/${name}`);
};

// Adaptive icon layers are 108dp with a 66dp safe circle: keep the glyph within ~0.29 of the center.
out('icon.png', render(1024, 0.72, [background, ...colorGlyph]));
out('android-icon-background.png', render(512, 1, [background]));
out('android-icon-foreground.png', render(512, 0.52, colorGlyph));
out('android-icon-monochrome.png', render(432, 0.52, monoGlyph));
