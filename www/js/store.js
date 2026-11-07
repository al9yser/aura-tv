// Persistence: small settings in localStorage, large playlists in IndexedDB.
// Every call is wrapped so private mode / blocked storage never breaks the app.

export const LS = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('aura.' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch (_) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('aura.' + key, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  },
  del(key) { try { localStorage.removeItem('aura.' + key); } catch (_) { /* ignore */ } },
};

const mem = new Map();
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open('aura', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch (_) { resolve(null); }
  });
  return dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction('kv', mode);
    const r = fn(t.objectStore('kv'));
    t.oncomplete = () => resolve(r && r.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function kvGet(key) {
  const db = await openDb();
  if (!db) return mem.get(key);
  try { return await tx(db, 'readonly', (s) => s.get(key)); } catch (_) { return mem.get(key); }
}

export async function kvSet(key, value) {
  const db = await openDb();
  if (!db) { mem.set(key, value); return; }
  try { await tx(db, 'readwrite', (s) => s.put(value, key)); } catch (_) { mem.set(key, value); }
}

export async function kvDel(key) {
  mem.delete(key);
  const db = await openDb();
  if (!db) return;
  try { await tx(db, 'readwrite', (s) => s.delete(key)); } catch (_) { /* ignore */ }
}
