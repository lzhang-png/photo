import { create } from "zustand";
import { Adjustments, DEFAULT_ADJUSTMENTS, applyEditSettings, extractEditSettings, type EditSettings } from "../editor/adjustments";
import {
  cloneAdjustments,
  cloneRawSettings,
  fileFingerprint,
  loadSession,
  saveSession,
  STORAGE_KEY,
  type PhotoId,
  type PersistedSession,
} from "../editor/persistence";
import type { DecodedImage } from "../editor/pipeline";
import { createThumbnailSafe } from "../editor/thumbnail";
import {
  normalizeGeometry,
  type Geometry,
} from "../editor/geometry";
import type { DecodeProgress } from "../editor/decodeProgress";
import {
  DEFAULT_RAW_SETTINGS,
  type RawSettings,
} from "../editor/rawSettings";
import { loadUiPrefs, saveUiPrefs } from "../editor/uiPrefs";

export type PhotoRecord = {
  id: PhotoId;
  filename: string;
  fingerprint: string;
  sourceFile: File | null;
  isRaw: boolean;
  adjustments: Adjustments;
  rawSettings: RawSettings;
  image: DecodedImage | null;
  thumbnailUrl: string | null;
};

type EditorState = {
  photos: Record<PhotoId, PhotoRecord>;
  photoOrder: PhotoId[];
  activePhotoId: PhotoId | null;
  status: string | null;
  decodeProgress: DecodeProgress | null;
  cropEditing: boolean;
  showHistogram: boolean;
  editSettingsClipboard: EditSettings | null;

  addPhoto: (
    image: DecodedImage,
    file: File,
    isRaw: boolean,
    makeActive?: boolean,
  ) => PhotoId;
  setActivePhoto: (id: PhotoId) => void;
  removePhoto: (id: PhotoId) => void;
  setDecodedImage: (image: DecodedImage) => void;
  setAdjustment: <K extends keyof Adjustments>(
    key: K,
    value: Adjustments[K],
  ) => void;
  setGeometry: (patch: Partial<Geometry>) => void;
  setRawSetting: <K extends keyof RawSettings>(
    key: K,
    value: RawSettings[K],
  ) => void;
  resetAdjustments: () => void;
  resetRawSettings: () => void;
  copyEditSettings: () => void;
  pasteEditSettings: () => void;
  setStatus: (msg: string | null) => void;
  setDecodeProgress: (progress: DecodeProgress | null) => void;
  setCropEditing: (editing: boolean) => void;
  toggleHistogram: () => void;
  setShowHistogram: (visible: boolean) => void;
  clearCatalog: () => void;
};

function buildInitialCatalog(): Pick<
  EditorState,
  "photos" | "photoOrder" | "activePhotoId"
> {
  const session = loadSession();
  if (!session) {
    return { photos: {}, photoOrder: [], activePhotoId: null };
  }
  const photos: Record<PhotoId, PhotoRecord> = {};
  for (const p of session.photos) {
    photos[p.id] = {
      id: p.id,
      filename: p.filename,
      fingerprint: p.fingerprint,
      sourceFile: null,
      isRaw: p.isRaw,
      adjustments: cloneAdjustments(p.adjustments),
      rawSettings: cloneRawSettings(p.rawSettings),
      image: null,
      thumbnailUrl: null,
    };
  }
  return {
    photos,
    photoOrder: session.photoOrder.filter((id) => photos[id]),
    activePhotoId:
      session.activePhotoId && photos[session.activePhotoId]
        ? session.activePhotoId
        : (session.photoOrder.find((id) => photos[id]) ?? null),
  };
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(getState: () => EditorState) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const s = getState();
    const session: PersistedSession = {
      version: 1,
      activePhotoId: s.activePhotoId,
      photoOrder: s.photoOrder,
      photos: s.photoOrder
        .map((id) => s.photos[id])
        .filter(Boolean)
        .map((p) => ({
          id: p.id,
          filename: p.filename,
          fingerprint: p.fingerprint,
          isRaw: p.isRaw,
          adjustments: cloneAdjustments(p.adjustments),
          rawSettings: cloneRawSettings(p.rawSettings),
        })),
    };
    saveSession(session);
  }, 250);
}

function getActive(state: EditorState): PhotoRecord | null {
  if (!state.activePhotoId) return null;
  return state.photos[state.activePhotoId] ?? null;
}

function withImage(
  record: PhotoRecord,
  image: DecodedImage,
): PhotoRecord {
  return {
    ...record,
    image,
    thumbnailUrl: createThumbnailSafe(image),
  };
}

function updateActive(
  state: EditorState,
  patch: Partial<PhotoRecord>,
): Partial<EditorState> {
  const active = getActive(state);
  if (!active) return {};
  return {
    photos: {
      ...state.photos,
      [active.id]: { ...active, ...patch },
    },
  };
}

const initialCatalog = buildInitialCatalog();
const initialPrefs = loadUiPrefs();

export const useEditor = create<EditorState>((set, get) => ({
  ...initialCatalog,
  status: null,
  decodeProgress: null,
  cropEditing: false,
  showHistogram: initialPrefs.showHistogram,
  editSettingsClipboard: null,

  addPhoto: (image, file, isRaw, makeActive = true) => {
    const fingerprint = fileFingerprint(file);
    const existing = Object.values(get().photos).find(
      (p) => p.fingerprint === fingerprint,
    );

    if (existing) {
      set((s) => ({
        photos: {
          ...s.photos,
          [existing.id]: withImage(
            { ...existing, sourceFile: file, isRaw },
            image,
          ),
        },
        activePhotoId: makeActive ? existing.id : s.activePhotoId,
      }));
      schedulePersist(get);
      return existing.id;
    }

    const id = crypto.randomUUID();
    const record: PhotoRecord = withImage(
      {
        id,
        filename: file.name,
        fingerprint,
        sourceFile: file,
        isRaw,
        adjustments: cloneAdjustments(DEFAULT_ADJUSTMENTS),
        rawSettings: cloneRawSettings(DEFAULT_RAW_SETTINGS),
        image: null,
        thumbnailUrl: null,
      },
      image,
    );

    set((s) => ({
      photos: { ...s.photos, [id]: record },
      photoOrder: [...s.photoOrder, id],
      activePhotoId: makeActive ? id : s.activePhotoId ?? id,
    }));
    schedulePersist(get);
    return id;
  },

  setActivePhoto: (id) => {
    if (!get().photos[id]) return;
    set({ cropEditing: false, activePhotoId: id });
    schedulePersist(get);
  },

  removePhoto: (id) => {
    set((s) => {
      const { [id]: _, ...rest } = s.photos;
      const photoOrder = s.photoOrder.filter((pid) => pid !== id);
      let activePhotoId = s.activePhotoId;
      if (activePhotoId === id) {
        const idx = s.photoOrder.indexOf(id);
        activePhotoId =
          photoOrder[Math.min(idx, photoOrder.length - 1)] ?? null;
      }
      return { photos: rest, photoOrder, activePhotoId };
    });
    schedulePersist(get);
  },

  setDecodedImage: (image) => {
    set((s) => {
      const active = getActive(s);
      if (!active) return {};
      return updateActive(s, withImage(active, image));
    });
    schedulePersist(get);
  },

  setAdjustment: (key, value) => {
    set((s) => {
      const active = getActive(s);
      if (!active) return {};
      return updateActive(s, {
        adjustments: { ...active.adjustments, [key]: value },
      });
    });
    schedulePersist(get);
  },

  setGeometry: (patch) => {
    set((s) => {
      const active = getActive(s);
      if (!active) return {};
      const geometry = normalizeGeometry({
        ...active.adjustments.geometry,
        ...patch,
      });
      return updateActive(s, {
        adjustments: { ...active.adjustments, geometry },
      });
    });
    schedulePersist(get);
  },

  setRawSetting: (key, value) => {
    set((s) => {
      const active = getActive(s);
      if (!active) return {};
      return updateActive(s, {
        rawSettings: { ...active.rawSettings, [key]: value },
      });
    });
    schedulePersist(get);
  },

  resetAdjustments: () => {
    set((s) =>
      updateActive(s, {
        adjustments: cloneAdjustments(DEFAULT_ADJUSTMENTS),
      }),
    );
    schedulePersist(get);
  },

  resetRawSettings: () => {
    set((s) =>
      updateActive(s, {
        rawSettings: cloneRawSettings(DEFAULT_RAW_SETTINGS),
      }),
    );
    schedulePersist(get);
  },

  copyEditSettings: () => {
    const active = getActive(get());
    if (!active) return;
    set({ editSettingsClipboard: extractEditSettings(active.adjustments) });
    set({ status: "Copied edit settings" });
  },

  pasteEditSettings: () => {
    const clipboard = get().editSettingsClipboard;
    const active = getActive(get());
    if (!clipboard || !active) return;
    set((s) =>
      updateActive(s, {
        adjustments: applyEditSettings(active.adjustments, clipboard),
      }),
    );
    schedulePersist(get);
    set({ status: "Pasted edit settings" });
  },

  setStatus: (status) => set({ status }),

  setDecodeProgress: (decodeProgress) => set({ decodeProgress }),

  setCropEditing: (cropEditing) => set({ cropEditing }),

  toggleHistogram: () => {
    const next = !get().showHistogram;
    set({ showHistogram: next });
    saveUiPrefs({ showHistogram: next });
  },

  setShowHistogram: (visible) => {
    set({ showHistogram: visible });
    saveUiPrefs({ showHistogram: visible });
  },

  clearCatalog: () => {
    set({
      photos: {},
      photoOrder: [],
      activePhotoId: null,
      cropEditing: false,
      editSettingsClipboard: null,
    });
    localStorage.removeItem(STORAGE_KEY);
  },
}));

// Selectors for active photo fields
export function selectActivePhoto(s: EditorState): PhotoRecord | null {
  return getActive(s);
}

export function selectImage(s: EditorState) {
  return getActive(s)?.image ?? null;
}

export function selectFilename(s: EditorState) {
  return getActive(s)?.filename ?? null;
}

export function selectSourceFile(s: EditorState) {
  return getActive(s)?.sourceFile ?? null;
}

export function selectIsRaw(s: EditorState) {
  return getActive(s)?.isRaw ?? false;
}

export function selectAdjustments(s: EditorState) {
  return getActive(s)?.adjustments ?? DEFAULT_ADJUSTMENTS;
}

export function selectRawSettings(s: EditorState) {
  return getActive(s)?.rawSettings ?? DEFAULT_RAW_SETTINGS;
}

export function selectNeedsReopen(s: EditorState): boolean {
  return (
    s.photoOrder.length > 0 &&
    s.photoOrder.some((id) => !s.photos[id]?.sourceFile)
  );
}
