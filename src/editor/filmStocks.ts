export type FilmId = "none" | "portra" | "velvia" | "trix" | "cinestill";

export type FilmStock = {
  id: FilmId;
  label: string;
  hint: string;
};

export const FILM_STOCKS: FilmStock[] = [
  { id: "none", label: "None", hint: "No film emulation" },
  { id: "portra", label: "Portra 400", hint: "Warm, soft, natural skin tones" },
  { id: "velvia", label: "Velvia 50", hint: "Punchy contrast and saturated color" },
  { id: "trix", label: "Tri-X 400", hint: "Classic B&W with rich grain" },
  { id: "cinestill", label: "CineStill 800T", hint: "Tungsten cool shadows, warm glow" },
];

/** Values passed to the fragment shader `u_film` uniform. */
export const FILM_SHADER_INDEX: Record<FilmId, number> = {
  none: 0,
  portra: 1,
  velvia: 2,
  trix: 3,
  cinestill: 4,
};
