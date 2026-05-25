import type { Adjustments } from "./adjustments";
import { migrateGeometry } from "./geometry";
import { normalizeRawSettings, type RawSettings } from "./rawSettings";

export const STORAGE_KEY = "photo-editor-session";

export type PhotoId = string;

export type PersistedPhoto = {
  id: PhotoId;
  filename: string;
  fingerprint: string;
  isRaw: boolean;
  adjustments: Adjustments;
  rawSettings: RawSettings;
};

export type PersistedSession = {
  version: 1;
  activePhotoId: PhotoId | null;
  photoOrder: PhotoId[];
  photos: PersistedPhoto[];
};

export function fileFingerprint(file: File): string {
  return `${file.name}|${file.lastModified}|${file.size}`;
}

export function cloneAdjustments(adj: Adjustments): Adjustments {
  return {
    ...adj,
    definition: typeof adj.definition === "number" ? adj.definition : 0,
    sharpen: typeof adj.sharpen === "number" ? adj.sharpen : 0,
    luminanceNoise:
      typeof adj.luminanceNoise === "number" ? adj.luminanceNoise : 0,
    colorNoise: typeof adj.colorNoise === "number" ? adj.colorNoise : 0,
    filmGrain: typeof adj.filmGrain === "number" ? adj.filmGrain : 0,
    vintage: typeof adj.vintage === "number" ? adj.vintage : 0,
    geometry: migrateGeometry(adj.geometry),
    curve: adj.curve.map((p) => ({ ...p })),
  };
}

export function cloneRawSettings(
  raw: Partial<RawSettings> | RawSettings,
): RawSettings {
  return normalizeRawSettings(raw);
}

export function serializeSession(session: PersistedSession): string {
  return JSON.stringify(session, null, 2);
}

export function parseSession(json: string): PersistedSession | null {
  try {
    const data = JSON.parse(json) as PersistedSession;
    if (data.version !== 1 || !Array.isArray(data.photoOrder)) return null;
    if (!Array.isArray(data.photos)) return null;
    return data;
  } catch {
    return null;
  }
}

export function loadSession(): PersistedSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return parseSession(raw);
}

export function saveSession(session: PersistedSession): void {
  localStorage.setItem(STORAGE_KEY, serializeSession(session));
}
