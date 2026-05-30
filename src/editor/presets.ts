import { normalizeEditSettings, type EditSettings } from "./adjustments";

export const PRESETS_STORAGE_KEY = "photo-editor-presets";

export type NamedPreset = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  edits: EditSettings;
};

export function cloneNamedPreset(preset: NamedPreset): NamedPreset {
  return {
    ...preset,
    edits: normalizeEditSettings(preset.edits),
  };
}

export function createNamedPreset(name: string, edits: EditSettings): NamedPreset {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    edits: normalizeEditSettings(edits),
  };
}

export function loadNamedPresets(): NamedPreset[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as { presets?: unknown };
    if (!Array.isArray(data.presets)) return [];
    return data.presets
      .map((entry) => normalizeStoredPreset(entry))
      .filter((p): p is NamedPreset => p !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveNamedPresets(presets: NamedPreset[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      PRESETS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        presets: presets.map(cloneNamedPreset),
      }),
    );
  } catch {
    // ignore quota errors
  }
}

function normalizeStoredPreset(entry: unknown): NamedPreset | null {
  if (!entry || typeof entry !== "object") return null;
  const row = entry as Partial<NamedPreset>;
  if (typeof row.id !== "string" || typeof row.name !== "string") return null;
  if (typeof row.createdAt !== "number" || typeof row.updatedAt !== "number") {
    return null;
  }
  return cloneNamedPreset({
    id: row.id,
    name: row.name.trim(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    edits: normalizeEditSettings(row.edits),
  });
}
