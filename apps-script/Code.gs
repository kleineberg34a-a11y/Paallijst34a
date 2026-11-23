// Paallijst Huize Kleineberg — Google Apps Script (plakken in Extensies → Apps Script van de Sheet).
// Scripteigenschap SLEUTEL moet gelijk zijn aan de sleutel in de app. Zie docs/inrichten.md.

const TABS = { events: 'Gebeurtenissen', bewoners: 'Bewoners', producten: 'Producten', afsluitingen: 'Afsluitingen' };
const EVENT_KOL = ['id', 'ts', 'periodeId', 'type', 'groep', 'bewonerId', 'productId', 'aantal', 'verwijst', 'data'];
const BEWONER_KOL = ['id', 'naam', 'hoofd', 'email', 'status'];
const PRODUCT_KOL = ['id', 'naam', 'krat', 'doneren', 'standaard', 'actief', 'volgorde'];
const AFSLUIT_KOL = ['tijdstip', 'periodeId', 'van', 'tot', 'aan'];

function doPost(e) {
  let antwoord;
  try {
    const v = JSON.parse(e.postData.contents);
    const sleutel = PropertiesService.getScriptProperties().getProperty('SLEUTEL');
    if (!sleutel || v.sleutel !== sleutel) throw new Error('Ongeldige sleutel');
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (v.actie === 'ping') antwoord = { ok: true };
      else if (v.actie === 'events') antwoord = voegEventsToe(v.events);
      else if (v.actie === 'stamdata') antwoord = schrijfStamdata(v.bewoners, v.producten);
      else if (v.actie === 'afsluiten') antwoord = sluitAf(v);
      else if (v.actie === 'herstel') antwoord = herstel();
      else throw new Error('Onbekende actie: ' + v.actie);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    antwoord = { ok: false, fout: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(antwoord)).setMimeType(ContentService.MimeType.JSON);
}

function blad(naam, kolommen) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(naam);
  if (!sh) {
    sh = ss.insertSheet(naam);
    sh.getRange(1, 1, 1, kolommen.length).setValues([kolommen]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:Z').setNumberFormat('@'); // alles als tekst, geen automatische datumconversie
  }
  return sh;
}

function naarCel(v) {
  if (v === null || v === undefined) return '';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

function voegEventsToe(events) {
  const sh = blad(TABS.events, EVENT_KOL);
  const n = sh.getLastRow();
  const bekend = new Set(n > 1 ? sh.getRange(2, 1, n - 1, 1).getValues().map((r) => r[0]) : []);
  const nieuw = events.filter((ev) => !bekend.has(ev.id)).map((ev) => EVENT_KOL.map((k) => naarCel(ev[k])));
  if (nieuw.length) sh.getRange(n + 1, 1, nieuw.length, EVENT_KOL.length).setValues(nieuw);
  return { ok: true, toegevoegd: nieuw.length };
}

function overschrijf(naam, kolommen, items) {
  const sh = blad(naam, kolommen);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, kolommen.length).clearContent();
  const rijen = items.map((it) => kolommen.map((k) => naarCel(it[k])));
  if (rijen.length) sh.getRange(2, 1, rijen.length, kolommen.length).setValues(rijen);
}

function schrijfStamdata(bewoners, producten) {
  overschrijf(TABS.bewoners, BEWONER_KOL, bewoners);
  overschrijf(TABS.producten, PRODUCT_KOL, producten);
  return { ok: true };
}

function sluitAf(v) {
  GmailApp.sendEmail(v.aan, v.onderwerp, v.tekst, {
    name: 'Paallijst Huize Kleineberg',
    attachments: [Utilities.newBlob(v.csv, 'text/csv', v.bestandsnaam)],
  });
  blad(TABS.afsluitingen, AFSLUIT_KOL).appendRow([new Date().toISOString(), v.periodeId, v.van, v.tot, v.aan]);
  return { ok: true };
}

function leesTabel(naam, kolommen) {
  const sh = blad(naam, kolommen);
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, kolommen.length).getValues().map((r) => {
    const o = {};
    kolommen.forEach((k, i) => { o[k] = r[i]; });
    return o;
  });
}

const BOOL = (s) => s === true || s === 'true';

function herstel() {
  const bewoners = leesTabel(TABS.bewoners, BEWONER_KOL).map((b) => ({ ...b, hoofd: BOOL(b.hoofd) }));
  const producten = leesTabel(TABS.producten, PRODUCT_KOL).map((p) => ({
    ...p, krat: BOOL(p.krat), doneren: BOOL(p.doneren), standaard: BOOL(p.standaard), actief: BOOL(p.actief), volgorde: Number(p.volgorde),
  }));
  const alle = leesTabel(TABS.events, EVENT_KOL);
  if (!alle.length) throw new Error('Geen gebeurtenissen in de Sheet');
  const starts = alle.filter((e) => e.type === 'periode_start');
  const laatste = starts[starts.length - 1];
  if (!laatste) throw new Error('Geen periode gevonden in de Sheet');
  if (!producten.length) throw new Error('Geen producten in de Sheet');
  const events = alle.filter((e) => e.periodeId === laatste.periodeId).map((e) => {
    const o = { id: e.id, ts: e.ts, periodeId: e.periodeId, type: e.type };
    if (e.groep) o.groep = e.groep;
    if (e.bewonerId) o.bewonerId = e.bewonerId;
    if (e.productId) o.productId = e.productId;
    if (e.aantal !== '') o.aantal = Number(e.aantal);
    if (e.verwijst) o.verwijst = JSON.parse(e.verwijst);
    if (e.data) o.data = JSON.parse(e.data);
    return o;
  });
  return { ok: true, bewoners, producten, periode: { id: laatste.periodeId, start: laatste.ts }, events };
}
