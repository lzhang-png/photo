import type { DecodedImage } from "./pipeline";

const THUMB_MAX = 72;

/**
 * Build a small filmstrip JPEG without allocating a full-resolution canvas
 * (important for large RAWs, e.g. 5500×3700 ≈ 80MB).
 */
export function createThumbnail(image: DecodedImage): string {
  const scale = THUMB_MAX / Math.max(image.width, image.height);
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  const stepX = image.width / w;
  const stepY = image.height / h;
  const src = image.pixels;
  const thumb = new Uint8ClampedArray(w * h * 4);

  for (let ty = 0; ty < h; ty++) {
    const sy = Math.min(image.height - 1, Math.floor(ty * stepY));
    // flipY=true → pixels are top-down (same as canvas); WebGL flips in the shader only.
    const row = image.flipY ? sy : image.height - 1 - sy;
    for (let tx = 0; tx < w; tx++) {
      const sx = Math.min(image.width - 1, Math.floor(tx * stepX));
      const si = (row * image.width + sx) * 4;
      const ti = (ty * w + tx) * 4;
      thumb[ti] = src[si];
      thumb[ti + 1] = src[si + 1];
      thumb[ti + 2] = src[si + 2];
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
