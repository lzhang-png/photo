import { fileFingerprint } from "./persistence";

const DB_NAME = "photo-editor-files";
const DB_VERSION = 1;
const STORE = "files";

type CachedFileRecord = {
  id: string;
  blob: Blob;
  name: string;
  type: string;
  fingerprint: string;
  lastModified: number;
};

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
        db.createObjectStore(STORE, { keyPath: "id" });
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

export async function cacheSourceFile(photoId: string, file: File): Promise<void> {
  const db = await openDb();
  const record: CachedFileRecord = {
    id: photoId,
    blob: file,
    name: file.name,
    type: file.type,
    fingerprint: fileFingerprint(file),
    lastModified: file.lastModified,
  };
  const tx = db.transaction(STORE, "readwrite");
  await requestToPromise(tx.objectStore(STORE).put(record));
}

export async function loadCachedSourceFile(photoId: string): Promise<File | null> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const record = await requestToPromise<CachedFileRecord | undefined>(
    tx.objectStore(STORE).get(photoId),
  );
  if (!record) return null;
  return new File([record.blob], record.name, {
    type: record.type,
    lastModified: record.lastModified,
  });
}

export async function deleteCachedSourceFile(photoId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  await requestToPromise(tx.objectStore(STORE).delete(photoId));
}

export async function clearSourceFileCache(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  await requestToPromise(tx.objectStore(STORE).clear());
}
