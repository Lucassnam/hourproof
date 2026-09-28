export type StoredProofFile = { id: string; name: string; type: string; size: number; category: string; month: string; addedAt: string; blob: Blob };

const DB_NAME = "hourproof-proof-files";
const STORE = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProofFile(file: File, category: string, month: string): Promise<StoredProofFile> {
  const record: StoredProofFile = { id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, category, month, addedAt: new Date().toISOString(), blob: file };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return record;
}

export async function listProofFiles(): Promise<StoredProofFile[]> {
  const db = await openDb();
  const records = await new Promise<StoredProofFile[]>((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return records;
}

export async function deleteProofFile(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
