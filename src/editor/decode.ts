import type { DecodeProgressCallback } from "./decodeProgress";
import { packHalves } from "./halfFloat";
import type { DecodedImage } from "./pipeline";
import { decodeWithLibraw } from "./librawClient";
import { applyRawDevelopPreset } from "./rawDevelop";
import { DEFAULT_RAW_SETTINGS, type RawSettings } from "./rawSettings";

/** sRGB-encoded 16-bit value -> linear-light float. */
const SRGB16_TO_LINEAR = (() => {
  const lut = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) {
    const c = i / 65535;
    lut[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return lut;
})();

/** sRGB-encoded 8-bit value -> linear-light float. Used when libraw only gives us 8-bit data. */
const SRGB8_TO_LINEAR = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    lut[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return lut;
})();

const RAW_EXTENSIONS = new Set([
  "arw", "cr2", "cr3", "crw", "dng", "erf", "kdc", "mrw",
  "nef", "nrw", "orf", "pef", "raf", "raw", "rw2", "sr2",
  "srf", "srw", "x3f",
]);

export function isRawFile(file: File): boolean {
  const dot = file.name.lastIndexOf(".");
  if (dot >= 0) {
    if (RAW_EXTENSIONS.has(file.name.slice(dot + 1).toLowerCase())) {
      return true;
    }
  }
  const mime = file.type.toLowerCase();
  return (
    mime.includes("raw") ||
    mime.includes("x-canon") ||
    mime.includes("x-nikon") ||
    mime.includes("x-sony") ||
    mime.includes("x-adobe-dng")
  );
}

export async function decodeStandard(
  file: File,
  onProgress?: DecodeProgressCallback,
): Promise<DecodedImage> {
  onProgress?.(0.15, "Loading image");
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  onProgress?.(0.65, "Converting");
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  onProgress?.(1, "Done");
  return {
    width: data.width,
    height: data.height,
    pixels: data.data,
    flipY: true,
    format: "srgb8",
  };
}

export async function decodeRaw(
  file: File,
  settings: RawSettings = DEFAULT_RAW_SETTINGS,
  onProgress?: DecodeProgressCallback,
): Promise<DecodedImage> {
  const report = (value: number, label?: string) => onProgress?.(value, label);

  let image: unknown;
  let meta: Record<string, unknown>;
  try {
    ({ image, meta } = await decodeWithLibraw(file, settings, (v, label) =>
      report(v * 0.78, label),
    ));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`RAW decode failed: ${msg || "unknown error"}`);
  }

  const img = unpackImageData(image);
  if (img.byteLength === 0) {
    throw new Error(
      "RAW decode: libraw returned no image pixels (file may be unsupported or corrupt)",
    );
  }

  report(0.82, "Processing");
  const channels = resolveChannels(img);
  const { width, height } = pickDimensions(img, channels, meta);

  report(0.88, "Linearizing");
  const rgbaLinear = toRgbaLinearFloat(img, width, height, channels);

  report(0.93, "Applying develop");
  applyRawDevelopPreset(rgbaLinear, width, height, settings.denoise);

  report(0.97, "Packing halves");
  const halves = packHalves(rgbaLinear);

  report(1, "Done");

  return { width, height, pixels: halves, flipY: true, format: "linear16" };
}

interface RawImageData {
  data: Uint8Array | Uint16Array | ArrayBuffer | ArrayBufferView;
  width?: number;
  height?: number;
  colors?: number;
  bits?: number;
  dataSize?: number;
}

type UnpackedRaw = {
  /** Original sample values, sRGB-encoded; bit depth matches `bits`. */
  src: Uint8Array | Uint16Array;
  width?: number;
  height?: number;
  colors: number;
  bits: 8 | 16;
  /** Length in samples (not bytes). */
  byteLength: number;
};

function unpackImageData(raw: unknown): UnpackedRaw {
  if (raw && typeof raw === "object" && "data" in raw) {
    const img = raw as RawImageData;
    const bits = (img.bits === 16 ? 16 : 8) as 8 | 16;
    const src = bits === 16 ? toU16(img.data) : toU8(img.data);
    const colors = typeof img.colors === "number" ? img.colors : 3;
    const width = typeof img.width === "number" ? img.width : undefined;
    const height = typeof img.height === "number" ? img.height : undefined;
    return { src, width, height, colors, bits, byteLength: src.length };
  }
  const src = toU8(raw as Uint8Array | ArrayBuffer | ArrayBufferView);
  return { src, colors: 3, bits: 8, byteLength: src.length };
}

function toU8(raw: RawImageData["data"]): Uint8Array {
  if (raw instanceof Uint8Array) return new Uint8Array(raw);
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (ArrayBuffer.isView(raw)) {
    return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  }
  throw new Error("RAW decode: unexpected imageData type");
}

function toU16(raw: RawImageData["data"]): Uint16Array {
  if (raw instanceof Uint16Array) return new Uint16Array(raw);
  if (raw instanceof ArrayBuffer) return new Uint16Array(raw);
  if (ArrayBuffer.isView(raw)) {
    // Some bindings hand us a Uint8Array view of 16-bit data; reinterpret.
    if (raw.byteLength % 2 !== 0) {
      throw new Error("RAW decode: 16-bit buffer has odd byte length");
    }
    return new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
  }
  throw new Error("RAW decode: unexpected imageData type for 16-bit");
}

/** Prefer 3 or 4 channel layouts that match the byte length. */
function resolveChannels(img: UnpackedRaw): number {
  const len = img.src.length;
  if (img.colors === 3 || img.colors === 4) {
    if (len % img.colors === 0) return img.colors;
  }
  if (len % 3 === 0) return 3;
  if (len % 4 === 0) return 4;
  throw new Error(`RAW decode: unexpected pixel buffer length ${len}`);
}

function channelsForBuffer(
  bufLen: number,
  width: number,
  height: number,
  channels: number,
): boolean {
  const pixels = width * height;
  if (pixels <= 0 || channels <= 0) return false;
  return bufLen === pixels * channels;
}

function tryPair(
  bufLen: number,
  channels: number,
  width?: number,
  height?: number,
): { width: number; height: number } | null {
  if (!width || !height) return null;
  if (channelsForBuffer(bufLen, width, height, channels)) {
    return { width, height };
  }
  if (channelsForBuffer(bufLen, height, width, channels)) {
    return { width: height, height: width };
  }
  return null;
}

/** Derive the missing dimension from buffer size when one side is known. */
function derivePair(
  bufLen: number,
  channels: number,
  width?: number,
  height?: number,
): { width: number; height: number } | null {
  if (width && width > 0 && bufLen % (width * channels) === 0) {
    const h = bufLen / (width * channels);
    if (h > 0) return { width, height: h };
  }
  if (height && height > 0 && bufLen % (height * channels) === 0) {
    const w = bufLen / (height * channels);
    if (w > 0) return { width: w, height };
  }
  return null;
}

function pickDimensions(
  img: UnpackedRaw,
  channels: number,
  meta: Record<string, unknown>,
): { width: number; height: number } {
  const bufLen = img.src.length;

  // 1) libraw imageData width/height (most reliable when present)
  const fromImage =
    tryPair(bufLen, channels, img.width, img.height) ??
    derivePair(bufLen, channels, img.width, img.height) ??
    derivePair(bufLen, channels, img.height, img.width);
  if (fromImage) return fromImage;

  // 2) Metadata output size (not sensor/raw_width which can differ)
  const metaCandidates: [number | undefined, number | undefined][] = [
    [meta.width as number, meta.height as number],
    [meta.height as number, meta.width as number],
    [meta.iwidth as number, meta.iheight as number],
    [meta.iheight as number, meta.iwidth as number],
    [meta.outWidth as number, meta.outHeight as number],
    [meta.output_width as number, meta.output_height as number],
  ];

  for (const [w, h] of metaCandidates) {
    const hit = tryPair(bufLen, channels, w, h) ?? derivePair(bufLen, channels, w, h);
    if (hit) return hit;
  }

  // 3) Sensor size — only if it matches the buffer exactly
  const rawW = meta.raw_width as number | undefined;
  const rawH = meta.raw_height as number | undefined;
  const fromSensor = tryPair(bufLen, channels, rawW, rawH);
  if (fromSensor) return fromSensor;

  throw new Error(
    `RAW decode: could not determine dimensions (buffer=${bufLen}, channels=${channels}, ` +
      `imageData=${img.width ?? "?"}×${img.height ?? "?"}, ` +
      `meta=${JSON.stringify(Object.keys(meta))})`,
  );
}

/**
 * Convert libraw's sRGB-encoded sample buffer (8- or 16-bit, RGB or RGBA) into
 * an RGBA `Float32Array` of linear-light values. Alpha is always 1.0. Uses a
 * 65536-entry LUT for the inverse sRGB transfer, so this is cheap even on
 * 50-megapixel RAWs.
 */
function toRgbaLinearFloat(
  img: UnpackedRaw,
  width: number,
  height: number,
  channels: number,
): Float32Array {
  const pixels = width * height;
  const expected = pixels * 4;
  const out = new Float32Array(expected);
  const src = img.src;
  const lut = img.bits === 16 ? SRGB16_TO_LINEAR : SRGB8_TO_LINEAR;

  if (channels === 4) {
    if (src.length < expected) {
      throw new Error(
        `RAW decode: buffer size ${src.length} is smaller than ${width}×${height} RGBA`,
      );
    }
    for (let i = 0; i < expected; i += 4) {
      out[i] = lut[src[i]];
      out[i + 1] = lut[src[i + 1]];
      out[i + 2] = lut[src[i + 2]];
      out[i + 3] = 1.0;
    }
    return out;
  }

  if (channels !== 3) {
    throw new Error(`RAW decode: unsupported channel count ${channels}`);
  }

  const expectedRgb = pixels * 3;
  if (src.length < expectedRgb) {
    throw new Error(
      `RAW decode: buffer size ${src.length} is smaller than ${width}×${height} RGB`,
    );
  }

  for (let i = 0, j = 0; i < expectedRgb; i += 3, j += 4) {
    out[j] = lut[src[i]];
    out[j + 1] = lut[src[i + 1]];
    out[j + 2] = lut[src[i + 2]];
    out[j + 3] = 1.0;
  }
  return out;
}

export async function decode(
  file: File,
  rawSettings: RawSettings = DEFAULT_RAW_SETTINGS,
  onProgress?: DecodeProgressCallback,
): Promise<DecodedImage> {
  if (isRawFile(file)) return decodeRaw(file, rawSettings, onProgress);
  return decodeStandard(file, onProgress);
}
