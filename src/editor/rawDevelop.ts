/**
 * Default RAW develop look: slightly softer, less saturated, and denoised.
 */

import type { RawSettings } from "./rawSettings";

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function muteAndSoftenPixel(r: number, g: number, b: number): [number, number, number] {
  const lum = luma(r, g, b);
  const sat = 0.86;
  let nr = lum + (r - lum) * sat;
  let ng = lum + (g - lum) * sat;
  let nb = lum + (b - lum) * sat;

  const contrast = 0.94;
  nr = (nr - 0.5) * contrast + 0.5;
  ng = (ng - 0.5) * contrast + 0.5;
  nb = (nb - 0.5) * contrast + 0.5;

  return [clamp01(nr), clamp01(ng), clamp01(nb)];
}

/** Separable 3-tap box blur, blended with original for a soft look. */
function softBlurBlend(
  pixels: Uint8Array,
  width: number,
  height: number,
  strength: number,
): void {
  const n = width * height;
  const tmp = new Uint8Array(n * 3);
  const keep = 1 - strength;

  const at = (x: number, y: number, c: number) => {
    const cx = Math.max(0, Math.min(width - 1, x));
    const cy = Math.max(0, Math.min(height - 1, y));
    return (cy * width + cx) * 4 + c;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let dx = -1; dx <= 1; dx++) {
          sum += pixels[at(x + dx, y, c)];
        }
        tmp[o + c] = Math.round(sum / 3);
      }
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pi = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const cy = Math.max(0, Math.min(height - 1, y + dy));
          sum += tmp[(cy * width + x) * 3 + c];
        }
        const blurred = sum / 3;
        pixels[pi + c] = Math.round(
          pixels[pi + c] * keep + blurred * strength,
        );
      }
    }
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Luminance-weighted blur; stronger in shadows where noise is worst. */
function shadowDenoise(
  pixels: Uint8Array,
  width: number,
  height: number,
  strength: number,
): void {
  if (strength <= 0) return;

  const n = width * height;
  const tmp = new Float32Array(n);
  const at = (x: number, y: number) => {
    const cx = Math.max(0, Math.min(width - 1, x));
    const cy = Math.max(0, Math.min(height - 1, y));
    return cy * width + cx;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const i = at(x + dx, y + dy) * 4;
          sum += luma(pixels[i] / 255, pixels[i + 1] / 255, pixels[i + 2] / 255);
          count++;
        }
      }
      tmp[y * width + x] = sum / count;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pi = (y * width + x) * 4;
      const r = pixels[pi] / 255;
      const g = pixels[pi + 1] / 255;
      const b = pixels[pi + 2] / 255;
      const l = luma(r, g, b);
      const blurredL = tmp[y * width + x];
      const shadowMask = 1 - smoothstep(0.08, 0.45, l);
      const mix = strength * shadowMask;
      if (mix < 1e-4) continue;

      const scale = (l * (1 - mix) + blurredL * mix) / Math.max(l, 1e-5);
      pixels[pi] = Math.round(clamp01(r * scale) * 255);
      pixels[pi + 1] = Math.round(clamp01(g * scale) * 255);
      pixels[pi + 2] = Math.round(clamp01(b * scale) * 255);
    }
  }
}

/** Apply the default neutral RAW develop preset in place. */
export function applyRawDevelopPreset(
  pixels: Uint8Array,
  width: number,
  height: number,
  denoise: RawSettings["denoise"] = 2,
): void {
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b] = muteAndSoftenPixel(
      pixels[i] / 255,
      pixels[i + 1] / 255,
      pixels[i + 2] / 255,
    );
    pixels[i] = Math.round(r * 255);
    pixels[i + 1] = Math.round(g * 255);
    pixels[i + 2] = Math.round(b * 255);
  }

  if (denoise > 0) {
    shadowDenoise(pixels, width, height, denoise === 2 ? 0.55 : 0.3);
  }
  softBlurBlend(pixels, width, height, denoise === 2 ? 0.22 : 0.18);
}
