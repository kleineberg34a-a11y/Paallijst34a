import { esc, bovenbalk, terugKnop } from './html.js';
import { datumLabel } from '../tekst.js';

const LEEG = { producten: {}, krattenGedoneerd: 0, statiegeld: 0 };

export function render(ctx) {
  const { data, hulp } = ctx;
  const producten = hulp.actieveProducten();
  const bewoners = data.bewoners.filter((b) => b.status === 'actief' || b.status === 'vertrekt');
  const cellen = (s) => producten.map((p) => {
    const t = s.producten[p.id] ?? { vandaag: 0, periode: 0 };
    return `<td class="n">${t.vandaag}</td><td class="n">${t.periode}</td>`;
  }).join('');

  const koppen = producten.map((p) => `<th class="n">${esc(p.naam)} vandaag</th><th class="n">${esc(p.naam)} periode</th>`).join('');
  const rijen = bewoners.map((b) => {
    const s = data.stand.perBewoner[b.id] ?? LEEG;
    const tag = b.status === 'vertrekt' ? '<span class="tag x">vertrekt</span>' : '';
    return `<tr><td>${esc(b.naam)}${tag}</td>${cellen(s)}<td class="n">${s.krattenGedoneerd}</td><td class="n">${s.statiegeld}</td></tr>`;
  }).join('');
  const t = data.stand.totalen;

  return bovenbalk(ctx, terugKnop())
    + '<div class="page" data-scroll="overzicht">'
    + `<div class="ph"><h1>Overzicht</h1><span class="hint">Periode ${esc(datumLabel(data.periode.start))} – nu · alleen lezen</span></div>`
    + '<table class="tbl">'
    + `<thead><tr><th>Bewoner</th>${koppen}<th class="n">Kratten gedoneerd</th><th class="n">Statiegeld (kratten)</th></tr></thead>`
    + `<tbody>${rijen}<tr class="tot"><td>Totaal</td>${cellen(t)}<td class="n">${t.krattenGedoneerd}</td><td class="n">${t.statiegeld}</td></tr></tbody>`
    + '</table></div>';
}
