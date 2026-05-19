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
  curve: [number, number, number, number];
};

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
  curve: [0, 0.25, 0.75, 1],
};

export type SliderSpec = {
  key: keyof Omit<Adjustments, "curve">;
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
