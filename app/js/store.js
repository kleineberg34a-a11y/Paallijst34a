// IndexedDB-opslag. Elke functie opent een eigen transactie en geeft een Promise terug.
const DB_NAAM = 'paallijst';
const DB_VERSIE = 1;
let dbBelofte = null;

export function open() {
  navigator.storage?.persist?.();
  dbBelofte ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAAM, DB_VERSIE);
    r.onupgradeneeded = () => {
      const db = r.result;
      const events = db.createObjectStore('events', { keyPath: 'id' });
      events.createIndex('periodeId', 'periodeId');
      for (const naam of ['bewoners', 'producten', 'periodes']) db.createObjectStore(naam, { keyPath: 'id' });
      db.createObjectStore('instellingen');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbBelofte;
}

const verzoek = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

const klaar = (t) => new Promise((resolve, reject) => {
  t.oncomplete = () => resolve();
  t.onerror = () => reject(t.error);
  t.onabort = () => reject(t.error);
});

export async function alles(storeNaam) {
  const db = await open();
  return verzoek(db.transaction(storeNaam).objectStore(storeNaam).getAll());
}

export async function bewaar(storeNaam, items) {
  const db = await open();
  const t = db.transaction(storeNaam, 'readwrite');
  const s = t.objectStore(storeNaam);
  for (const it of items) s.put(it);
  return klaar(t);
}

export async function eventsVanPeriode(periodeId) {
  const db = await open();
  const lijst = await verzoek(db.transaction('events').objectStore('events').index('periodeId').getAll(periodeId));
  return lijst.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
}

export async function instelling(key, fallback) {
  const db = await open();
  const v = await verzoek(db.transaction('instellingen').objectStore('instellingen').get(key));
  return v === undefined ? fallback : v;
}

export async function zetInstelling(key, waarde) {
  const db = await open();
  const t = db.transaction('instellingen', 'readwrite');
  t.objectStore('instellingen').put(waarde, key);
  return klaar(t);
}

export async function wisAlles() {
  const db = await open();
  const namen = [...db.objectStoreNames];
  const t = db.transaction(namen, 'readwrite');
  for (const n of namen) t.objectStore(n).clear();
  return klaar(t);
}
