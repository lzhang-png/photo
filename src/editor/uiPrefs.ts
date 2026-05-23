const STORAGE_KEY = "photo-editor-ui-prefs";

export const DEFAULT_SIDEBAR_WIDTH = 360;
export const MIN_SIDEBAR_WIDTH = 280;
export const MAX_SIDEBAR_WIDTH = 560;

export type UiPrefs = {
  showHistogram: boolean;
  sidebarWidth: number;
};

const DEFAULT_PREFS: UiPrefs = {
  showHistogram: false,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
};

function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)));
}

export function loadUiPrefs(): UiPrefs {
  if (typeof localStorage === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const data = JSON.parse(raw) as Partial<UiPrefs>;
    return {
      ...DEFAULT_PREFS,
      ...data,
      sidebarWidth: clampSidebarWidth(data.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH),
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveUiPrefs(prefs: Partial<UiPrefs>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...loadUiPrefs(), ...prefs }),
    );
  } catch {
    // ignore
  }
}
