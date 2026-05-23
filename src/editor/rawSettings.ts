/** LibRaw processing options exposed in the UI (RAW files only). */
export type RawSettings = {
  /** FBDD denoise: 0 = off, 1 = light, 2 = full */
  denoise: 0 | 1 | 2;
  /** Stretch histogram to full range (can lift shadow noise). */
  autoBright: boolean;
  /** Demosaic quality (-q), 0–12 */
  demosaicQuality: number;
};

export const DEFAULT_RAW_SETTINGS: RawSettings = {
  denoise: 1,
  autoBright: true,
  demosaicQuality: 3,
};

/** UI options — Light and Full only. */
export const DENOISE_OPTIONS: {
  value: "light" | "full";
  denoise: 1 | 2;
  label: string;
}[] = [
  { value: "light", denoise: 1, label: "Light" },
  { value: "full", denoise: 2, label: "Full" },
];

export function denoiseToSelectValue(denoise: RawSettings["denoise"]): "light" | "full" {
  return denoise === 2 ? "full" : "light";
}

export function selectValueToDenoise(value: string): 1 | 2 {
  return value === "full" ? 2 : 1;
}

export function normalizeRawSettings(
  raw: Partial<RawSettings> & { preset?: unknown } | null | undefined,
): RawSettings {
  const base = { ...DEFAULT_RAW_SETTINGS, ...raw };
  return {
    denoise: base.denoise === 2 ? 2 : 1,
    autoBright: Boolean(base.autoBright),
    demosaicQuality: Math.round(
      Math.max(0, Math.min(12, base.demosaicQuality ?? 3)),
    ),
  };
}

export function toLibrawOptions(
  settings: RawSettings,
  opts?: { halfSize?: boolean },
) {
  const d = settings.denoise;
  return {
    useCameraWb: true,
    useCameraMatrix: 1,
    /**
     * Request 16 bits per channel from libraw so we have ~12-14 bits of
     * effective dynamic range to feed into the WebGL2 half-float pipeline.
     * Without this we'd ship-truncate to 8-bit *before* any develop step,
     * permanently clipping highlights that we could otherwise recover.
     */
    outputBps: 16,
    outputColor: 1,
    noAutoBright: !settings.autoBright,
    // LibRaw auto-bright stretches to near-white; dial back the final gain.
    ...(settings.autoBright
      ? { bright: 0.86, autoBrightThr: 0.003 }
      : {}),
    fbddNoiserd: d,
    /** Wavelet denoise threshold (dcraw -n); 0 = off. */
    threshold: d === 0 ? 0 : d === 1 ? 100 : 200,
    /** Median filter on color differences; helps chroma noise at full setting. */
    medPasses: d === 2 ? 1 : 0,
    userQual: Math.round(
      Math.max(0, Math.min(12, settings.demosaicQuality)),
    ),
    halfSize: opts?.halfSize ?? false,
  };
}

export function rawSettingsEqual(a: RawSettings, b: RawSettings): boolean {
  return (
    a.denoise === b.denoise &&
    a.autoBright === b.autoBright &&
    a.demosaicQuality === b.demosaicQuality
  );
}
