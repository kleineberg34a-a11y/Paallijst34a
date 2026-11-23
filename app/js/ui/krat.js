import { esc, knop, bovenbalk, terugKnop, chip } from './html.js';
import { kratten } from '../tekst.js';
import { KRAT } from '../domain.js';

export function render(ctx) {
  const { data, ui, hulp } = ctx;
  const f = ui.formulier.krat ?? { donor: null, aantal: 1 };
  const product = hulp.actieveProducten().find((p) => p.doneren);
  if (!product) return bovenbalk(ctx, terugKnop()) + '<div class="page"><p class="hint">Er is geen product dat aan het huis gedoneerd kan worden.</p></div>';
  const pnaam = product.naam.toLowerCase();
  const n = f.aantal;
  const nu = data.stand.voorraad[product.id] ?? 0;
  const samenvatting = f.donor
    ? `${hulp.naam(f.donor)}: +${kratten(n)} gedoneerd · +${kratten(n)} statiegeld · voorraad ${pnaam} +${KRAT * n} (wordt ${nu + KRAT * n})`
    : 'Kies eerst wie de krat heeft gekocht.';
  const chips = hulp.actieveBewoners().map((b) => chip(b.naam, 'kiesDonor', { bewoner: b.id }, b.id === f.donor)).join('');

  return bovenbalk(ctx, terugKnop())
    + '<div class="page">'
    + `<div class="ph"><h1>Krat ${esc(pnaam)} bijzetten voor het huis</h1></div>`
    + `<div><p class="lbl">Wie doneert?</p><div class="chips">${chips}</div></div>`
    + '<div><p class="lbl">Aantal kratten</p><div class="step">'
    + knop('−', 'kratAantal', { delta: -1, 'aria-label': 'Minder' }, 'sq')
    + `<span class="v">${n}</span>`
    + knop('+', 'kratAantal', { delta: 1, 'aria-label': 'Meer' }, 'sq')
    + '</div></div>'
    + `<div class="sum">${esc(samenvatting)}</div>`
    + `<div class="row" style="max-width: 560px">${knop('Annuleren', 'naar', { scherm: 'hoofd' })}${knop('Bijzetten', 'bijzetten', { disabled: !f.donor }, 'btn btn-primary btn-big')}</div>`
    + '</div>';
}
