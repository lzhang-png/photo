import { fileFingerprint } from "./persistence";

const DB_NAME = "photo-editor-access";
const DB_VERSION = 1;
const STORE = "handles";
const DIRECTORY_KEY = "sourceDirectory";

const IMAGE_EXT =
  /\.(jpe?g|png|webp|avif|heic|heif|cr2|cr3|crw|nef|nrw|arw|dng|raf|rw2|orf|pef|srw|raw|x3f|erf|kdc|mrw|sr2|srf)$/i;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export function supportsDirectoryPicker(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export function supportsOpenFilePicker(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const handle = await requestToPromise<FileSystemDirectoryHandle | undefined>(
      tx.objectStore(STORE).get(DIRECTORY_KEY),
    );
    return handle ?? null;
  } catch {
    return null;
  }
}

export async function saveDirectoryHandle(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  await requestToPromise(tx.objectStore(STORE).put(handle, DIRECTORY_KEY));
}

export async function clearDirectoryHandle(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    await requestToPromise(tx.objectStore(STORE).delete(DIRECTORY_KEY));
  } catch {
    // ignore
  }
}

export async function pickPhotoDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsDirectoryPicker()) return null;
  try {
    const handle = await window.showDirectoryPicker!({ mode: "read" });
    await saveDirectoryHandle(handle);
    return handle;
  } catch (err) {
    if ((err as DOMException).name === "AbortError") return null;
    throw err;
  }
}

export async function ensureDirectoryReadAccess(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const current = await handle.queryPermission({ mode: "read" });
  if (current === "granted") return true;
  const next = await handle.requestPermission({ mode: "read" });
  return next === "granted";
}

async function* walkFiles(
  dir: FileSystemDirectoryHandle,
): AsyncGenerator<FileSystemFileHandle> {
  for await (const entry of dir.values()) {
    if (entry.kind === "file") {
      yield entry as FileSystemFileHandle;
    } else {
      yield* walkFiles(entry as FileSystemDirectoryHandle);
    }
  }
}

/** Find catalog files by fingerprint under a remembered folder. */
export async function findFilesInDirectory(
  dir: FileSystemDirectoryHandle,
  fingerprints: Set<string>,
): Promise<Map<string, File>> {
  const remaining = new Set(fingerprints);
  const found = new Map<string, File>();

  for await (const fileHandle of walkFiles(dir)) {
    if (!IMAGE_EXT.test(fileHandle.name)) continue;
    const file = await fileHandle.getFile();
    const fp = fileFingerprint(file);
    if (!remaining.has(fp)) continue;
    found.set(fp, file);
    remaining.delete(fp);
    if (remaining.size === 0) break;
  }

  return found;
}

const OPEN_TYPES: FilePickerAcceptType[] = [
  {
    description: "Images",
    accept: {
      "image/*": [
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".avif",
        ".heic",
        ".cr2",
        ".cr3",
        ".nef",
        ".arw",
        ".dng",
        ".raf",
        ".rw2",
        ".orf",
        ".pef",
        ".srw",
        ".raw",
      ],
    },
  },
];

/** Open photos via the File System Access API, starting in the remembered folder. */
export async function pickPhotoFiles(): Promise<File[] | null> {
  if (!supportsOpenFilePicker()) return null;
  try {
    const startIn = (await loadDirectoryHandle()) ?? undefined;
    const handles = await window.showOpenFilePicker!({
      multiple: true,
      types: OPEN_TYPES,
      ...(startIn ? { startIn } : {}),
    });
    return Promise.all(handles.map((handle) => handle.getFile()));
  } catch (err) {
    if ((err as DOMException).name === "AbortError") return [];
    throw err;
  }
}
