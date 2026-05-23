import { halfToFloat } from "./halfFloat";
import type { DecodedImage } from "./pipeline";

const THUMB_MAX = 72;

function linearToSrgb(c: number): number {
  if (c <= 0) return 0;
  if (c >= 1) return 1;
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/**
 * Build a small filmstrip JPEG without allocating a full-resolution canvas
 * (important for large RAWs, e.g. 5500×3700 ≈ 80MB).
 *
 * Reads the source format (sRGB 8-bit or linear half-float 16-bit) and
 * produces an 8-bit sRGB-encoded `ImageData` for `toDataURL`.
 */
export function createThumbnail(image: DecodedImage): string {
  const scale = THUMB_MAX / Math.max(image.width, image.height);
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  const stepX = image.width / w;
  const stepY = image.height / h;
  const src = image.pixels;
  const thumb = new Uint8ClampedArray(w * h * 4);
  const isLinear = image.format === "linear16";

  for (let ty = 0; ty < h; ty++) {
    const sy = Math.min(image.height - 1, Math.floor(ty * stepY));
    // flipY=true → pixels are top-down (same as canvas); WebGL flips in the shader only.
    const row = image.flipY ? sy : image.height - 1 - sy;
    for (let tx = 0; tx < w; tx++) {
      const sx = Math.min(image.width - 1, Math.floor(tx * stepX));
      const si = (row * image.width + sx) * 4;
      const ti = (ty * w + tx) * 4;
      if (isLinear) {
        const u16 = src as Uint16Array;
        thumb[ti] = Math.round(linearToSrgb(halfToFloat(u16[si])) * 255);
        thumb[ti + 1] = Math.round(linearToSrgb(halfToFloat(u16[si + 1])) * 255);
        thumb[ti + 2] = Math.round(linearToSrgb(halfToFloat(u16[si + 2])) * 255);
      } else {
        thumb[ti] = src[si];
        thumb[ti + 1] = src[si + 1];
        thumb[ti + 2] = src[si + 2];
      }
      thumb[ti + 3] = 255;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create thumbnail canvas");
  ctx.putImageData(new ImageData(thumb, w, h), 0, 0);
  return canvas.toDataURL("image/jpeg", 0.75);
}

export function createThumbnailSafe(image: DecodedImage): string | null {
  try {
    return createThumbnail(image);
  } catch {
    return null;
  }
}
