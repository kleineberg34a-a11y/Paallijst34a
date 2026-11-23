import { datumLabel } from '../tekst.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// Deze sleutels worden gewone HTML-attributen; alle andere worden data-…
const GEWOON = new Set(['disabled', 'id', 'style', 'title', 'aria-label']);

function attributen(attrs) {
  return Object.entries(attrs)
    .filter(([, v]) => v !== false && v !== null && v !== undefined)
    .map(([k, v]) => {
      const naam = GEWOON.has(k) ? k : `data-${k}`;
      return v === true ? ` ${naam}` : ` ${naam}="${esc(v)}"`;
    })
    .join('');
}

// `tekst` is HTML (mag iconen of <br> bevatten); escape gebruikersinvoer vooraf met esc().
export function knop(tekst, actie, attrs = {}, klasse = 'btn') {
  return `<button class="${klasse}" data-actie="${esc(actie)}"${attributen(attrs)}>${tekst}</button>`;
}

export const ICOON = {
  overzicht: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"></path></svg>',
  krat: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"></rect><path d="M3 12h18M8 7V4h8v3"></path></svg>',
  slot: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>',
  terug: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"></path></svg>',
};

export function bovenbalk(ctx, rechts) {
  return `<div class="top"><div class="brand"><b>Huize Kleineberg</b><span>Paallijst · periode sinds ${esc(datumLabel(ctx.data.periode.start))}</span></div>${rechts}</div>`;
}

export const terugKnop = (label = 'Terug') => knop(`${ICOON.terug}${esc(label)}`, 'naar', { scherm: 'hoofd' }, 'btn btn-primary');

// Melding onderin: met groepIds een ongedaan-knop (15 s), anders een korte statusmelding.
export function melding(ctx) {
  const m = ctx.ui.melding;
  if (!m) return '';
  const undo = m.groepIds ? knop('Ongedaan maken', 'ongedaan', {}, 'btn btn-primary') : '';
  const pct = Math.round((m.sec / (m.duur || 15)) * 100);
  return `<div class="toast${m.soort ? ` ${m.soort}` : ''}"><div class="ln"><span class="tx">${esc(m.tekst)}</span>`
    + `${m.groepIds ? `<span class="sec">nog ${m.sec} s</span>` : ''}${undo}</div>`
    + `<div class="bar"><div style="width: ${pct}%"></div></div></div>`;
}

export const chip = (tekst, actie, attrs, aan) => knop(esc(tekst), actie, attrs, `chip${aan ? ' on' : ''}`);
