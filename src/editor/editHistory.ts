import type { Adjustments } from "./adjustments";
import type { PhotoId } from "./persistence";
import {
  cloneAdjustments,
  cloneRawSettings,
  cloneSocialTemplate,
} from "./persistence";
import type { RawSettings } from "./rawSettings";
import type { SocialTemplate } from "./socialTemplate";

export type PhotoEditSnapshot = {
  adjustments: Adjustments;
  rawSettings: RawSettings;
  socialTemplate: SocialTemplate;
};

const MAX_HISTORY = 50;
const DEBOUNCE_MS = 400;

type HistoryStacks = {
  past: PhotoEditSnapshot[];
  future: PhotoEditSnapshot[];
};

const stacks: Record<string, HistoryStacks> = {};
const batchCapture: Record<string, PhotoEditSnapshot | null> = {};
const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};
let skipRecording = false;
let onHistoryChange: (() => void) | null = null;

export function setHistoryChangeListener(fn: (() => void) | null) {
  onHistoryChange = fn;
}

export function snapshotFromPhoto(photo: {
  adjustments: Adjustments;
  rawSettings: RawSettings;
  socialTemplate: SocialTemplate;
}): PhotoEditSnapshot {
  return {
    adjustments: cloneAdjustments(photo.adjustments),
    rawSettings: cloneRawSettings(photo.rawSettings),
    socialTemplate: cloneSocialTemplate(photo.socialTemplate),
  };
}

function snapshotsEqual(a: PhotoEditSnapshot, b: PhotoEditSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function ensureStacks(id: PhotoId): HistoryStacks {
  if (!stacks[id]) stacks[id] = { past: [], future: [] };
  return stacks[id];
}

function commitCapture(photoId: PhotoId) {
  const captured = batchCapture[photoId];
  batchCapture[photoId] = null;
  if (!captured || skipRecording) return;

  const hist = ensureStacks(photoId);
  const top = hist.past[hist.past.length - 1];
  if (top && snapshotsEqual(top, captured)) return;

  hist.past.push(captured);
  if (hist.past.length > MAX_HISTORY) hist.past.shift();
  hist.future = [];
  onHistoryChange?.();
}

/** Queue a pre-edit snapshot; commits after edits idle. */
export function recordEditHistory(photoId: PhotoId, snapshot: PhotoEditSnapshot) {
  if (skipRecording) return;

  if (!batchCapture[photoId]) {
    batchCapture[photoId] = snapshot;
  }

  if (debounceTimers[photoId]) clearTimeout(debounceTimers[photoId]);
  debounceTimers[photoId] = setTimeout(() => {
    delete debounceTimers[photoId];
    commitCapture(photoId);
  }, DEBOUNCE_MS);
}

export function flushEditHistory(photoId: PhotoId) {
  if (debounceTimers[photoId]) {
    clearTimeout(debounceTimers[photoId]);
    delete debounceTimers[photoId];
  }
  commitCapture(photoId);
}

export function canUndoPhoto(photoId: PhotoId | null): boolean {
  if (!photoId) return false;
  return (stacks[photoId]?.past.length ?? 0) > 0;
}

export function canRedoPhoto(photoId: PhotoId | null): boolean {
  if (!photoId) return false;
  return (stacks[photoId]?.future.length ?? 0) > 0;
}

export function undoPhoto(
  photoId: PhotoId,
  current: PhotoEditSnapshot,
): PhotoEditSnapshot | null {
  flushEditHistory(photoId);
  const hist = ensureStacks(photoId);
  if (hist.past.length === 0) return null;

  skipRecording = true;
  batchCapture[photoId] = null;

  hist.future.unshift(current);
  const prev = hist.past.pop()!;
  onHistoryChange?.();
  skipRecording = false;
  return prev;
}

export function redoPhoto(
  photoId: PhotoId,
  current: PhotoEditSnapshot,
): PhotoEditSnapshot | null {
  flushEditHistory(photoId);
  const hist = ensureStacks(photoId);
  if (hist.future.length === 0) return null;

  skipRecording = true;
  batchCapture[photoId] = null;

  hist.past.push(current);
  const next = hist.future.shift()!;
  onHistoryChange?.();
  skipRecording = false;
  return next;
}

export function clearPhotoHistory(photoId: PhotoId) {
  delete stacks[photoId];
  delete batchCapture[photoId];
  if (debounceTimers[photoId]) clearTimeout(debounceTimers[photoId]);
  delete debounceTimers[photoId];
}

export function clearAllEditHistory() {
  for (const id of Object.keys(stacks)) clearPhotoHistory(id);
  onHistoryChange?.();
}
