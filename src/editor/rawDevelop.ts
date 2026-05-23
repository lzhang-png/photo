/**
 * RAW develop preset — applied once after libraw decode, before the half-float
 * upload. Operates on linear-light RGBA `Float32Array` data.
 *
 * Historically this pass also baked in a desaturation + low contrast "softer
 * default look". With the linear half-float pipeline we no longer want to crush
 * the very highlights we've just gained headroom to recover, so the muting is
 * gone. Only denoise (FBDD ran inside libraw + this shadow-weighted blur)
 * remains, since noise reduction is a real-image-quality concern.
 */

import type { RawSettings } from "./rawSettings";

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function clampPos(x: number): number {
  return x > 0 ? x : 0;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Separable 3-tap box blur on the RGB channels, blended with the source. */
function softBlurBlend(
  pixels: Float32Array,
  width: number,
  height: number,
  strength: number,
): void {
  if (strength <= 0) return;
  const n = width * height;
  const tmp = new Float32Array(n * 3);
  const keep = 1 - strength;

  const idx = (x: number, y: number) => {
    const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
    return cy * width + cx;
  };

  // Horizontal pass into tmp (RGB-only, 3 floats per pixel)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) {
        const sum =
          pixels[idx(x - 1, y) * 4 + c] +
          pixels[idx(x, y) * 4 + c] +
          pixels[idx(x + 1, y) * 4 + c];
        tmp[o + c] = sum / 3;
      }
    }
  }

  // Vertical pass blended back into pixels
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pi = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const sum =
          tmp[idx(x, y - 1) * 3 + c] +
          tmp[idx(x, y) * 3 + c] +
          tmp[idx(x, y + 1) * 3 + c];
        const blurred = sum / 3;
        pixels[pi + c] = pixels[pi + c] * keep + blurred * strength;
      }
    }
  }
}

/** Luminance-weighted blur; stronger in shadows where noise is worst. */
function shadowDenoise(
  pixels: Float32Array,
  width: number,
  height: number,
  strength: number,
): void {
  if (strength <= 0) return;
  const n = width * height;
  const blurLuma = new Float32Array(n);

  const idx = (x: number, y: number) => {
    const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
    return cy * width + cx;
  };

  // 5×5 box blur of luminance, used to estimate the local mean for the dark
  // pixels we want to denoise.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const i = idx(x + dx, y + dy) * 4;
          sum += luma(pixels[i], pixels[i + 1], pixels[i + 2]);
        }
      }
      blurLuma[y * width + x] = sum / 25;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pi = (y * width + x) * 4;
      const r = pixels[pi];
      const g = pixels[pi + 1];
      const b = pixels[pi + 2];
      const Y = luma(r, g, b);
      const Yblur = blurLuma[y * width + x];
      // Mask in linear-light luminance; 18% gray is the soft cutoff.
      const shadowMask = 1 - smoothstep(0.02, 0.18, Y);
      const mix = strength * shadowMask;
      if (mix < 1e-4) continue;
      const scale = (Y * (1 - mix) + Yblur * mix) / Math.max(Y, 1e-6);
      pixels[pi] = clampPos(r * scale);
      pixels[pi + 1] = clampPos(g * scale);
      pixels[pi + 2] = clampPos(b * scale);
    }
  }
}

/**
 * Apply the default RAW develop preset to a linear-light RGBA `Float32Array`.
 *
 * Compared with the previous version this no longer mutes saturation, drops
 * contrast, or otherwise pre-bakes a softened look — that work now happens at
 * adjustment time inside the linear shader, where it can be undone or pushed
 * further without losing the headroom we just unlocked.
 */
export function applyRawDevelopPreset(
  pixels: Float32Array,
  width: number,
  height: number,
  denoise: RawSettings["denoise"] = 1,
): void {
  if (denoise > 0) {
    shadowDenoise(pixels, width, height, denoise === 2 ? 0.55 : 0.3);
    softBlurBlend(pixels, width, height, denoise === 2 ? 0.15 : 0.1);
  }
}
