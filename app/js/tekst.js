import { KRAT } from './domain.js';

const DAGEN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const twee = (n) => String(n).padStart(2, '0');

export const kratten = (n) => (Math.abs(n) === 1 ? `${n} krat` : `${n} kratten`);

export function isoDatum(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${twee(x.getMonth() + 1)}-${twee(x.getDate())}`;
}

export function tijdLabel(ts) {
  const d = new Date(ts);
  return `${DAGEN[d.getDay()]} ${d.getDate()} ${MAANDEN[d.getMonth()]} ${twee(d.getHours())}:${twee(d.getMinutes())}`;
}

export function datumLabel(ts) {
  const d = new Date(ts);
  return `${d.getDate()} ${MAANDEN[d.getMonth()]} ${d.getFullYear()}`;
}

export const bestandsnaam = (tot) => `paallijst_${tot}.csv`;

export function beschrijf(e, naam, productNaam) {
  const n = e.bewonerId ? naam(e.bewonerId) : '';
  const p = e.productId ? productNaam(e.productId).toLowerCase() : '';
  switch (e.type) {
    case 'streep': return `${n} +${e.aantal} ${p}`;
    case 'correctie': return `Correctie: ${n} ${e.aantal > 0 ? '+' : '−'}${Math.abs(e.aantal)} ${p}`;
    case 'donatie': return `${n} doneert ${kratten(e.aantal)} ${p} (+${KRAT * e.aantal} voorraad, +${kratten(e.aantal)} statiegeld)`;
    case 'statiegeld_terug': return `Statiegeld terug: ${n} −${kratten(e.aantal)} (geld ontvangen)`;
    case 'voorraad': return `Voorraad ${p} gezet op ${e.aantal}`;
    case 'ongedaan': return `Ongedaan gemaakt (${e.verwijst.length} ${e.verwijst.length === 1 ? 'boeking' : 'boekingen'})`;
    case 'bewoner': return `Bewoner ${e.data.actie}: ${e.data.naam}`;
    case 'product': return `Product ${e.data.actie}: ${e.data.naam}`;
    case 'afsluiting': return `Periode afgesloten en gemaild naar ${e.data.ontvanger}`;
    case 'periode_start': return 'Nieuwe periode gestart';
    default: return e.type;
  }
}

function csvVeld(v) {
  const s = String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const leegStand = { producten: {}, krattenGedoneerd: 0, statiegeld: 0 };

export function maakCsv({ bewoners, producten, stand, van, tot }) {
  const kop = ['bewoner', ...producten.map((p) => p.naam.toLowerCase()), 'kratten_gedoneerd', 'statiegeld_kratten', 'periode_van', 'periode_tot'];
  const regels = bewoners.map((b) => {
    const s = stand.perBewoner[b.id] ?? leegStand;
    return [b.naam, ...producten.map((p) => s.producten[p.id]?.periode ?? 0), s.krattenGedoneerd, s.statiegeld, van, tot];
  });
  return '﻿' + [kop, ...regels].map((r) => r.map(csvVeld).join(';')).join('\r\n') + '\r\n';
}

const aantallen = (per, producten) => producten.map((p) => `${per[p.id]?.periode ?? 0} ${p.naam.toLowerCase()}`).join(', ');

export function maakMailTekst({ bewoners, producten, stand, van, tot }) {
  const regels = ['Paallijst Huize Kleineberg', `Periode: ${van} t/m ${tot}`, ''];
  for (const b of bewoners) {
    const s = stand.perBewoner[b.id] ?? leegStand;
    regels.push(`${b.naam}: ${aantallen(s.producten, producten)} · ${kratten(s.krattenGedoneerd)} gedoneerd · statiegeld ${kratten(s.statiegeld)}`);
  }
  const t = stand.totalen;
  regels.push('', `Totaal: ${aantallen(t.producten, producten)} · ${kratten(t.krattenGedoneerd)} gedoneerd · statiegeld ${kratten(t.statiegeld)}`);
  regels.push(`Voorraad: ${producten.map((p) => `${stand.voorraad[p.id] ?? 0} ${p.naam.toLowerCase()}`).join(', ')}`);
  regels.push('', 'De CSV-bijlage bevat dezelfde gegevens voor de boekhouding.', '');
  return regels.join('\n');
}
