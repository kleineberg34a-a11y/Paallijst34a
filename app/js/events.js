export function nieuwId(prefix = 'e') {
  return `${prefix}_${crypto.randomUUID()}`;
}

function basis(type, periodeId, now) {
  return { id: nieuwId(), ts: new Date(now).toISOString(), periodeId, type, synced: false };
}

export function streepEvents(bestelling, periodeId, now) {
  const groep = nieuwId('g');
  return bestelling.filter((r) => r.aantal > 0).map((r) => ({
    ...basis('streep', periodeId, now), groep, bewonerId: r.bewonerId, productId: r.productId, aantal: r.aantal,
  }));
}

export function donatieEvent(bewonerId, productId, kratten, periodeId, now) {
  const e = { ...basis('donatie', periodeId, now), bewonerId, productId, aantal: kratten };
  e.groep = e.id;
  return e;
}

export function correctieEvent(bewonerId, productId, aantal, periodeId, now) {
  return { ...basis('correctie', periodeId, now), bewonerId, productId, aantal };
}

export function statiegeldTerugEvent(bewonerId, kratten, periodeId, now) {
  return { ...basis('statiegeld_terug', periodeId, now), bewonerId, aantal: kratten };
}

export function voorraadEvent(productId, stand, periodeId, now, data) {
  return { ...basis('voorraad', periodeId, now), productId, aantal: stand, ...(data ? { data } : {}) };
}

export function ongedaanEvent(teruggedraaid, periodeId, now) {
  return { ...basis('ongedaan', periodeId, now), verwijst: teruggedraaid.map((e) => e.id) };
}

export function beheerEvent(type, data, periodeId, now) {
  return { ...basis(type, periodeId, now), data };
}

export function afsluitingEvent(periodeId, data, now) {
  return { ...basis('afsluiting', periodeId, now), data };
}

export function periodeStartEvent(periodeId, now) {
  return basis('periode_start', periodeId, now);
}
