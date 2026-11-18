// Local history in IndexedDB: metrics only, never video. Every call fails soft.
const DB = 'swing-coach', STORE = 'analyses';
let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
  return dbp;
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode); const st = t.objectStore(STORE);
    let out; const r = fn(st); if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
export async function saveAnalysis(rec) { try { await tx('readwrite', (s) => s.put(rec)); return true; } catch (e) { return false; } }
export async function listAnalyses() { try { const a = await tx('readonly', (s) => s.getAll()); return (a || []).sort((x, y) => y.date - x.date); } catch (e) { return []; } }
export async function deleteAnalysis(id) { try { await tx('readwrite', (s) => s.delete(id)); return true; } catch (e) { return false; } }
export async function clearAnalyses() { try { await tx('readwrite', (s) => s.clear()); return true; } catch (e) { return false; } }
