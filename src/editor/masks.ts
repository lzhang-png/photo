import type { Adjustments } from "./adjustments";

export const MAX_LINEAR_MASKS = 4;

export type MaskId = string;

export type ToneMaskDeltas = Pick<
  Adjustments,
  "exposure" | "contrast" | "highlights" | "shadows" | "whites" | "blacks"
>;

export type ColorMaskDeltas = Pick<
  Adjustments,
  "temperature" | "tint" | "vibrance" | "saturation"
>;

export type LinearGradientMask = {
  id: MaskId;
  name: string;
  enabled: boolean;
  /** Source-normalized coords (0–1), y from visual top — matches crop / texUV. */
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  /** Softness along gradient axis, 0 = hard, ~0.15–0.35 typical. */
  feather: number;
  light: ToneMaskDeltas;
  color: ColorMaskDeltas;
};

export const DEFAULT_TONE_MASK: ToneMaskDeltas = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
};

export const DEFAULT_COLOR_MASK: ColorMaskDeltas = {
  temperature: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,
};

export function createLinearGradientMask(name?: string): LinearGradientMask {
  return {
    id: crypto.randomUUID(),
    name: name ?? "Linear",
    enabled: true,
    p0: { x: 0.15, y: 0.5 },
    p1: { x: 0.85, y: 0.5 },
    feather: 0.2,
    light: { ...DEFAULT_TONE_MASK },
    color: { ...DEFAULT_COLOR_MASK },
  };
}

export function cloneLinearGradientMask(m: LinearGradientMask): LinearGradientMask {
  return {
    ...m,
    p0: { ...m.p0 },
    p1: { ...m.p1 },
    light: { ...m.light },
    color: { ...m.color },
  };
}

export function normalizeLinearMasks(
  masks?: LinearGradientMask[] | null,
): LinearGradientMask[] {
  if (!Array.isArray(masks)) return [];
  return masks.map((m) => ({
    id: m.id ?? crypto.randomUUID(),
    name: m.name ?? "Linear",
    enabled: m.enabled !== false,
    p0: {
      x: clamp01(m.p0?.x ?? 0.15),
      y: clamp01(m.p0?.y ?? 0.5),
    },
    p1: {
      x: clamp01(m.p1?.x ?? 0.85),
      y: clamp01(m.p1?.y ?? 0.5),
    },
    feather: clamp(m.feather ?? 0.2, 0.02, 0.5),
    light: { ...DEFAULT_TONE_MASK, ...m.light },
    color: { ...DEFAULT_COLOR_MASK, ...m.color },
  }));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** CPU reference for tests — must match GLSL `linearGradientWeight`. */
export function linearGradientWeight(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  feather: number,
  pt: { x: number; y: number },
): number {
  const ax = p1.x - p0.x;
  const ay = p1.y - p0.y;
  const len2 = ax * ax + ay * ay;
  if (len2 < 1e-8) return 0;
  const t = ((pt.x - p0.x) * ax + (pt.y - p0.y) * ay) / len2;
  const f = Math.max(0.02, Math.min(0.5, feather));
  // A (t=0) → 1, B (t=1) → 0; feather softens the falloff near B.
  return Math.max(0, Math.min(1, 1 - smoothstep(1 - f, 1, t)));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export type PackedMaskUniforms = {
  count: number;
  lines: Float32Array; // 4 vec4: p0.xy, p1.xy per mask
  feather: Float32Array; // 4
  tone: Float32Array; // 4 vec4: exposure, contrast, highlights, shadows
  whitesBlacks: Float32Array; // 4 vec2
  color: Float32Array; // 4 vec4: temperature, tint, vibrance, saturation
};

export function packMaskUniforms(
  masks: LinearGradientMask[],
): PackedMaskUniforms {
  const active = masks.filter((m) => m.enabled).slice(0, MAX_LINEAR_MASKS);
  const lines = new Float32Array(16);
  const feather = new Float32Array(4);
  const tone = new Float32Array(16);
  const whitesBlacks = new Float32Array(8);
  const color = new Float32Array(16);

  active.forEach((m, i) => {
    lines[i * 4] = m.p0.x;
    lines[i * 4 + 1] = m.p0.y;
    lines[i * 4 + 2] = m.p1.x;
    lines[i * 4 + 3] = m.p1.y;
    feather[i] = m.feather;
    tone[i * 4] = m.light.exposure;
    tone[i * 4 + 1] = m.light.contrast;
    tone[i * 4 + 2] = m.light.highlights;
    tone[i * 4 + 3] = m.light.shadows;
    whitesBlacks[i * 2] = m.light.whites;
    whitesBlacks[i * 2 + 1] = m.light.blacks;
    color[i * 4] = m.color.temperature;
    color[i * 4 + 1] = m.color.tint;
    color[i * 4 + 2] = m.color.vibrance;
    color[i * 4 + 3] = m.color.saturation;
  });

  return { count: active.length, lines, feather, tone, whitesBlacks, color };
}
