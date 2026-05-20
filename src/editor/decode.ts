import type { DecodeProgressCallback } from "./decodeProgress";
import type { DecodedImage } from "./pipeline";
import { decodeWithLibraw } from "./librawClient";
import { applyRawDevelopPreset } from "./rawDevelop";
import { DEFAULT_RAW_SETTINGS, type RawSettings } from "./rawSettings";

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
      report(v * 0.82, label),
    ));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`RAW decode failed: ${msg || "unknown error"}`);
  }

  const img = unpackImageData(image);
  if (img.src.length === 0) {
    throw new Error(
      "RAW decode: libraw returned no image pixels (file may be unsupported or corrupt)",
    );
  }

  report(0.88, "Processing");
  const channels = resolveChannels(img);
  const { width, height } = pickDimensions(img, channels, meta);
  const pixels = toRgba(img.src, width, height, channels);
  report(0.95, "Applying develop");
  applyRawDevelopPreset(pixels, width, height, settings.denoise);
  report(1, "Done");

  return { width, height, pixels, flipY: true };
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
  src: Uint8Array;
  width?: number;
  height?: number;
  colors: number;
  bits: number;
};

function unpackImageData(raw: unknown): UnpackedRaw {
  if (raw && typeof raw === "object" && "data" in raw) {
    const img = raw as RawImageData;
    const bits = typeof img.bits === "number" ? img.bits : 8;
    const bytes = toRgb8(img.data, bits);
    // Own a contiguous copy — worker transfers can leave awkward views.
    const src = new Uint8Array(bytes);
    const colors = typeof img.colors === "number" ? img.colors : 3;
    const width = typeof img.width === "number" ? img.width : undefined;
    const height = typeof img.height === "number" ? img.height : undefined;
    return { src, width, height, colors, bits };
  }
  return {
    src: asPixelBytes(raw as Uint8Array | ArrayBuffer | ArrayBufferView),
    colors: 3,
    bits: 8,
  };
}

function asPixelBytes(raw: Uint8Array | ArrayBuffer | ArrayBufferView): Uint8Array {
  if (raw instanceof Uint8Array) return new Uint8Array(raw);
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (ArrayBuffer.isView(raw)) {
    return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  }
  throw new Error("RAW decode: unexpected imageData type");
}

function toRgb8(
  data: RawImageData["data"],
  bits: number,
): Uint8Array {
  if (bits === 16) {
    const u16 =
      data instanceof Uint16Array
        ? data
        : data instanceof ArrayBuffer
          ? new Uint16Array(data)
          : new Uint16Array(
              data.buffer,
              data.byteOffset,
              data.byteLength / 2,
            );
    const u8 = new Uint8Array(u16.length);
    for (let i = 0; i < u16.length; i++) u8[i] = u16[i] >> 8;
    return u8;
  }
  return asPixelBytes(data);
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

function toRgba(
  src: Uint8Array,
  width: number,
  height: number,
  channels: number,
): Uint8Array {
  const pixels = width * height;
  const expected = pixels * 4;

  if (channels === 4) {
    if (src.length < expected) {
      throw new Error(
        `RAW decode: buffer size ${src.length} is smaller than ${width}×${height} RGBA`,
      );
    }
    if (src.length === expected) return src;
    return src.slice(0, expected);
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

  const pixelsOut = new Uint8Array(expected);
  for (let i = 0, j = 0; i < expectedRgb; i += 3, j += 4) {
    pixelsOut[j] = src[i];
    pixelsOut[j + 1] = src[i + 1];
    pixelsOut[j + 2] = src[i + 2];
    pixelsOut[j + 3] = 255;
  }
  return pixelsOut;
}

export async function decode(
  file: File,
  rawSettings: RawSettings = DEFAULT_RAW_SETTINGS,
  onProgress?: DecodeProgressCallback,
): Promise<DecodedImage> {
  if (isRawFile(file)) return decodeRaw(file, rawSettings, onProgress);
  return decodeStandard(file, onProgress);
}
