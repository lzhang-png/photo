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
  autoBright: false,
  demosaicQuality: 3,
};

export const DENOISE_OPTIONS: { value: 0 | 1 | 2; label: string }[] = [
  { value: 0, label: "Off" },
  { value: 1, label: "Light" },
  { value: 2, label: "Full" },
];

export function toLibrawOptions(
  settings: RawSettings,
  opts?: { halfSize?: boolean },
) {
  return {
    useCameraWb: true,
    outputBps: 8,
    outputColor: 1,
    noAutoBright: !settings.autoBright,
    fbddNoiserd: settings.denoise,
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
