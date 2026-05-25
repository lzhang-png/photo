import type { CurvePoint } from "./curve";
import { DEFAULT_CURVE } from "./curve";
import type { FilmId } from "./filmStocks";
import {
  cloneGeometry,
  DEFAULT_GEOMETRY,
  type Geometry,
} from "./geometry";

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
  vintage: number;
  film: FilmId;
  geometry: Geometry;
  curve: CurvePoint[];
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
    vintage: adj.vintage,
    film: adj.film,
    curve: adj.curve.map((p) => ({ ...p })),
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
  };
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
  vintage: 0,
  film: "none",
  geometry: cloneGeometry(DEFAULT_GEOMETRY),
  curve: DEFAULT_CURVE.map((p) => ({ ...p })),
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
  key: keyof Omit<Adjustments, "curve" | "film" | "geometry">;
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
  { key: "vintage", label: "Vintage", min: 0, max: 1, step: 0.01 },
];
