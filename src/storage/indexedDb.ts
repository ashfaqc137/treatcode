import { emptyAppData, type AppData } from "../types";

export interface StudyStorage {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
  clear(): Promise<void>;
}
const DB = "treatcode";
const STORE = "app";
const KEY = "data";
function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export const indexedDbStorage: StudyStorage = {
  async load() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result ?? emptyAppData());
      req.onerror = () => reject(req.error);
    });
  },
  async save(data) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(data, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  async clear() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};
