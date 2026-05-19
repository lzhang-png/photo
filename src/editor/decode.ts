import type { DecodedImage } from "./pipeline";

const RAW_EXTENSIONS = new Set([
  "arw", "cr2", "cr3", "crw", "dng", "erf", "kdc", "mrw",
  "nef", "nrw", "orf", "pef", "raf", "raw", "rw2", "sr2",
  "srf", "srw", "x3f",
]);

export function isRawFile(file: File): boolean {
  const dot = file.name.lastIndexOf(".");
  if (dot < 0) return false;
  return RAW_EXTENSIONS.has(file.name.slice(dot + 1).toLowerCase());
}

// Standard formats (JPEG/PNG/WebP/AVIF/etc) — decode via the browser.
export async function decodeStandard(file: File): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return {
    width: data.width,
    height: data.height,
    pixels: data.data,
    flipY: false,
  };
}

// RAW formats — decode via libraw-wasm (loaded lazily).
// libraw-wasm produces top-down RGB pixel data after demosaic + WB.
export async function decodeRaw(file: File): Promise<DecodedImage> {
  const { default: LibRaw } = await import("libraw-wasm");
  const buffer = new Uint8Array(await file.arrayBuffer());
  const lr = new LibRaw();
  await lr.open(buffer, {
    useCameraWb: true,
    outputBps: 8,
    outputColor: 1, // sRGB
    noAutoBright: false,
  });

  const meta = (await lr.metadata(true)) as Record<string, unknown>;
  const raw = await lr.imageData();

  const { width, height } = inferDimensions(meta, raw.length);

  // libraw-wasm produces 3 channels (RGB) interleaved; upconvert to RGBA.
  const expectedRgb = width * height * 3;
  const expectedRgba = width * height * 4;
  const src = raw instanceof Uint8Array ? raw : new Uint8Array(raw.buffer);
  let pixels: Uint8Array;
  if (src.length === expectedRgba) {
    pixels = src;
  } else if (src.length === expectedRgb) {
    pixels = new Uint8Array(expectedRgba);
    for (let i = 0, j = 0; i < expectedRgb; i += 3, j += 4) {
      pixels[j] = src[i];
      pixels[j + 1] = src[i + 1];
      pixels[j + 2] = src[i + 2];
      pixels[j + 3] = 255;
    }
  } else {
    throw new Error(
      `RAW decode: buffer size ${src.length} does not match ${width}×${height} (RGB or RGBA)`,
    );
  }

  return { width, height, pixels, flipY: true };
}

function inferDimensions(meta: Record<string, unknown>, bufLen: number) {
  const widthKeys = ["width", "iwidth", "outWidth", "output_width"];
  const heightKeys = ["height", "iheight", "outHeight", "output_height"];

  let width = 0;
  let height = 0;
  for (const k of widthKeys) {
    const v = meta[k];
    if (typeof v === "number" && v > 0) {
      width = v;
      break;
    }
  }
  for (const k of heightKeys) {
    const v = meta[k];
    if (typeof v === "number" && v > 0) {
      height = v;
      break;
    }
  }
  if (width && height) return { width, height };

  // Fallback: derive from sensor dims + aspect, against the actual buffer length.
  const rawW = typeof meta.raw_width === "number" ? (meta.raw_width as number) : 0;
  const rawH = typeof meta.raw_height === "number" ? (meta.raw_height as number) : 0;
  if (rawW && rawH) {
    // Try RGB (3) and RGBA (4) channel counts.
    for (const ch of [3, 4]) {
      const pixels = bufLen / ch;
      // libraw output is usually close to raw_width × raw_height (minus borders).
      // Search for a width close to rawW that divides pixels evenly.
      for (let w = rawW; w >= rawW - 64 && w > 0; w--) {
        if (pixels % w === 0) {
          const h = pixels / w;
          if (Math.abs(h - rawH) < 64) return { width: w, height: h };
        }
      }
    }
  }

  throw new Error(
    "RAW decode: could not determine output dimensions from metadata: " +
      JSON.stringify(Object.keys(meta)),
  );
}
export async function decode(file: File): Promise<DecodedImage> {
  if (isRawFile(file)) return decodeRaw(file);
  return decodeStandard(file);
}
