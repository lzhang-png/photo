export type FilmId =
  | "none"
  | "portra"
  | "gold"
  | "ektar"
  | "kodachrome"
  | "velvia"
  | "pro400h"
  | "cinestill"
  | "lomo"
  | "polaroid"
  | "trix"
  | "hp5"
  | "acros";

export type FilmStock = {
  id: FilmId;
  label: string;
  hint: string;
};

export const FILM_STOCKS: FilmStock[] = [
  { id: "none", label: "None", hint: "No film emulation" },
  { id: "portra", label: "Portra 400", hint: "Warm, soft, natural skin tones" },
  { id: "gold", label: "Gold 200", hint: "Golden highlights, warm consumer color" },
  { id: "ektar", label: "Ektar 100", hint: "Vivid color, fine grain, saturated reds" },
  { id: "kodachrome", label: "Kodachrome 64", hint: "Rich reds and deep blues, classic slide" },
  { id: "velvia", label: "Velvia 50", hint: "Punchy contrast and saturated color" },
  { id: "pro400h", label: "Pro 400H", hint: "Pastel, airy, low contrast — wedding look" },
  { id: "cinestill", label: "CineStill 800T", hint: "Tungsten cool shadows, warm glow" },
  { id: "lomo", label: "Lomo", hint: "Vivid, vignetted, cross-processed feel" },
  { id: "polaroid", label: "Polaroid 600", hint: "Faded shadows, instant film tones" },
  { id: "trix", label: "Tri-X 400", hint: "Classic B&W with rich grain" },
  { id: "hp5", label: "HP5+", hint: "Smooth medium-contrast B&W" },
  { id: "acros", label: "Acros 100", hint: "Clean, fine-grain B&W with deep blacks" },
];

/** Values passed to the fragment shader `u_film` uniform. */
export const FILM_SHADER_INDEX: Record<FilmId, number> = {
  none: 0,
  portra: 1,
  velvia: 2,
  trix: 3,
  cinestill: 4,
  gold: 5,
  ektar: 6,
  kodachrome: 7,
  pro400h: 8,
  lomo: 9,
  polaroid: 10,
  hp5: 11,
  acros: 12,
};
