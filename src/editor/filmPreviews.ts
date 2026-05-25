import { DEFAULT_ADJUSTMENTS, type Adjustments } from "./adjustments";
import { FILM_STOCKS, type FilmId } from "./filmStocks";
import { Pipeline, type DecodedImage } from "./pipeline";

/** Bundled landscape sample (Unsplash, free to use). */
const PREVIEW_SAMPLE_URL = "/film-preview-sample.jpg";
const PREVIEW_W = 128;
const PREVIEW_H = 72;

let previewCache: Record<FilmId, string> | null = null;
let previewPromise: Promise<Record<FilmId, string>> | null = null;

async function loadFilmPreviewSource(): Promise<DecodedImage> {
  const res = await fetch(PREVIEW_SAMPLE_URL);
  if (!res.ok) {
    throw new Error(`Failed to load film preview sample (${res.status})`);
  }

  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = PREVIEW_W;
  canvas.height = PREVIEW_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create preview canvas");

  const scale = Math.max(PREVIEW_W / bitmap.width, PREVIEW_H / bitmap.height);
  const sw = PREVIEW_W / scale;
  const sh = PREVIEW_H / scale;
  const sx = (bitmap.width - sw) / 2;
  const sy = (bitmap.height - sh) / 2;
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, PREVIEW_W, PREVIEW_H);
  bitmap.close();

  const data = ctx.getImageData(0, 0, PREVIEW_W, PREVIEW_H);
  return {
    width: PREVIEW_W,
    height: PREVIEW_H,
    pixels: data.data,
    flipY: true,
    format: "srgb8",
  };
}

function previewAdjustments(film: FilmId): Adjustments {
  return {
    ...DEFAULT_ADJUSTMENTS,
    film,
    curve: DEFAULT_ADJUSTMENTS.curve.map((p) => ({ ...p })),
  };
}

/** Render each film stock once through the real shader pipeline. */
export function buildFilmPreviewUrls(): Promise<Record<FilmId, string>> {
  if (previewCache) return Promise.resolve(previewCache);
  if (previewPromise) return previewPromise;

  previewPromise = (async () => {
    const sample = await loadFilmPreviewSource();
    const canvas = document.createElement("canvas");
    const pipeline = new Pipeline(canvas);
    pipeline.setImage(sample);
    pipeline.setSize(PREVIEW_W, PREVIEW_H);

    const urls = {} as Record<FilmId, string>;
    for (const stock of FILM_STOCKS) {
      pipeline.render(previewAdjustments(stock.id));
      urls[stock.id] = canvas.toDataURL("image/jpeg", 0.85);
    }

    previewCache = urls;
    return urls;
  })();

  return previewPromise;
}
