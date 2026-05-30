import type { CurvePoint } from "./curve";
import { DEFAULT_CURVE } from "./curve";
import { FILM_SHADER_INDEX, type FilmId } from "./filmStocks";
import {
  cloneGeometry,
  DEFAULT_GEOMETRY,
  type Geometry,
} from "./geometry";
import {
  type LinearGradientMask,
} from "./masks";

export type Adjustments = {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  temperature: number;
  tint: number;
  vibrance: number;
  saturation: number;
  definition: number;
  sharpen: number;
  luminanceNoise: number;
  colorNoise: number;
  filmGrain: number;
  filmGrainSize: number;
  filmGrainDensity: number;
  filmGrainRoughness: number;
  filmGrainSoftness: number;
  filmGrainColor: number;
  filmGrainResponse: number;
  vintage: number;
  film: FilmId;
  geometry: Geometry;
  curve: CurvePoint[];
  linearMasks: LinearGradientMask[];
};

/** Tone, color, film, and curve — everything except crop/rotate/straighten. */
export type EditSettings = Omit<Adjustments, "geometry">;

export function extractEditSettings(adj: Adjustments): EditSettings {
  return {
    exposure: adj.exposure,
    contrast: adj.contrast,
    highlights: adj.highlights,
    shadows: adj.shadows,
    whites: adj.whites,
    blacks: adj.blacks,
    temperature: adj.temperature,
    tint: adj.tint,
    vibrance: adj.vibrance,
    saturation: adj.saturation,
    definition: adj.definition,
    sharpen: adj.sharpen,
    luminanceNoise: adj.luminanceNoise,
    colorNoise: adj.colorNoise,
    filmGrain: adj.filmGrain,
    filmGrainSize: adj.filmGrainSize,
    filmGrainDensity: adj.filmGrainDensity,
    filmGrainRoughness: adj.filmGrainRoughness,
    filmGrainSoftness: adj.filmGrainSoftness,
    filmGrainColor: adj.filmGrainColor,
    filmGrainResponse: adj.filmGrainResponse,
    vintage: adj.vintage,
    film: adj.film,
    curve: adj.curve.map((p) => ({ ...p })),
    linearMasks: adj.linearMasks.map((m) => ({
      ...m,
      p0: { ...m.p0 },
      p1: { ...m.p1 },
      light: { ...m.light },
      color: { ...m.color },
    })),
  };
}

export function applyEditSettings(
  adj: Adjustments,
  edits: EditSettings,
): Adjustments {
  return {
    ...adj,
    ...edits,
    geometry: cloneGeometry(adj.geometry),
    curve: edits.curve.map((p) => ({ ...p })),
    linearMasks: edits.linearMasks.map((m) => ({
      ...m,
      p0: { ...m.p0 },
      p1: { ...m.p1 },
      light: { ...m.light },
      color: { ...m.color },
    })),
  };
}

export function editSettingsEqual(a: EditSettings, b: EditSettings): boolean {
  if (a.film !== b.film) return false;
  const keys = [
    "exposure",
    "contrast",
    "highlights",
    "shadows",
    "whites",
    "blacks",
    "temperature",
    "tint",
    "vibrance",
    "saturation",
    "definition",
    "sharpen",
    "luminanceNoise",
    "colorNoise",
    "filmGrain",
    "filmGrainSize",
    "filmGrainDensity",
    "filmGrainRoughness",
    "filmGrainSoftness",
    "filmGrainColor",
    "filmGrainResponse",
    "vintage",
  ] as const;
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  if (a.curve.length !== b.curve.length) return false;
  for (let i = 0; i < a.curve.length; i++) {
    if (a.curve[i]!.x !== b.curve[i]!.x || a.curve[i]!.y !== b.curve[i]!.y) {
      return false;
    }
  }
  return true;
}

/** Fill missing fields and clamp stored preset values to current schema. */
export function normalizeEditSettings(
  partial?: Partial<EditSettings> | null,
): EditSettings {
  const base = extractEditSettings(DEFAULT_ADJUSTMENTS);
  if (!partial) return base;

  const film =
    partial.film && partial.film in FILM_SHADER_INDEX
      ? partial.film
      : base.film;

  return extractEditSettings({
    ...DEFAULT_ADJUSTMENTS,
    ...partial,
    film,
    curve: Array.isArray(partial.curve)
      ? partial.curve.map((p) => ({ x: p.x, y: p.y }))
      : base.curve,
  });
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,
  definition: 0,
  sharpen: 0,
  luminanceNoise: 0,
  colorNoise: 0,
  filmGrain: 0,
  filmGrainSize: 0.1,
  filmGrainDensity: 0.9,
  filmGrainRoughness: 0.4,
  filmGrainSoftness: 0.35,
  filmGrainColor: 0.25,
  filmGrainResponse: 0.25,
  vintage: 0,
  film: "none",
  geometry: cloneGeometry(DEFAULT_GEOMETRY),
  curve: DEFAULT_CURVE.map((p) => ({ ...p })),
  linearMasks: [],
};

/** Hold-to-compare: decoded look with current crop, no edit sliders. */
export function originalPreviewAdjustments(adj: Adjustments): Adjustments {
  return {
    ...DEFAULT_ADJUSTMENTS,
    geometry: cloneGeometry(adj.geometry),
    curve: DEFAULT_CURVE.map((p) => ({ ...p })),
  };
}

export type SliderSpec = {
  key: keyof Omit<Adjustments, "curve" | "film" | "geometry" | "linearMasks">;
  label: string;
  min: number;
  max: number;
  step: number;
};

export const TONE_SLIDERS: SliderSpec[] = [
  { key: "exposure", label: "Exposure", min: -4, max: 4, step: 0.01 },
  { key: "contrast", label: "Contrast", min: -1, max: 1, step: 0.01 },
  { key: "highlights", label: "Highlights", min: -1, max: 1, step: 0.01 },
  { key: "shadows", label: "Shadows", min: -1, max: 1, step: 0.01 },
  { key: "whites", label: "Whites", min: -1, max: 1, step: 0.01 },
  { key: "blacks", label: "Blacks", min: -1, max: 1, step: 0.01 },
];

export const COLOR_SLIDERS: SliderSpec[] = [
  { key: "temperature", label: "Temperature", min: -1, max: 1, step: 0.01 },
  { key: "tint", label: "Tint", min: -1, max: 1, step: 0.01 },
  { key: "vibrance", label: "Vibrance", min: -1, max: 1, step: 0.01 },
  { key: "saturation", label: "Saturation", min: -1, max: 1, step: 0.01 },
];

export const DETAIL_SLIDERS: SliderSpec[] = [
  { key: "definition", label: "Definition", min: -1, max: 1, step: 0.01 },
  { key: "sharpen", label: "Sharpening", min: 0, max: 1, step: 0.01 },
  { key: "luminanceNoise", label: "Luminance Noise", min: 0, max: 1, step: 0.01 },
  { key: "colorNoise", label: "Color Noise", min: 0, max: 1, step: 0.01 },
];

export const EFFECTS_SLIDERS: SliderSpec[] = [
  { key: "filmGrain", label: "Film Grain", min: 0, max: 1, step: 0.01 },
  { key: "filmGrainSize", label: "Grain Size", min: 0, max: 1, step: 0.01 },
  { key: "filmGrainDensity", label: "Grain Density", min: 0, max: 1, step: 0.01 },
  { key: "filmGrainRoughness", label: "Roughness", min: 0, max: 1, step: 0.01 },
  { key: "filmGrainSoftness", label: "Softness", min: 0, max: 1, step: 0.01 },
  { key: "filmGrainColor", label: "Color Grain", min: 0, max: 1, step: 0.01 },
  { key: "filmGrainResponse", label: "Tone Response", min: 0, max: 1, step: 0.01 },
  { key: "vintage", label: "Vintage", min: 0, max: 1, step: 0.01 },
];
