import { esc, knop, bovenbalk, ICOON } from './html.js';
import { aantalVoorBewoner, totaalPerProduct } from '../bestelling.js';

export function aantallenTekst(per, producten) {
  const delen = producten.filter((p) => per[p.id]).map((p) => `${per[p.id]} ${p.naam.toLowerCase()}`);
  return delen.join(', ') || '0';
}

export function render(ctx) {
  const { data, ui, hulp } = ctx;
  const producten = hulp.actieveProducten();
  const gekozen = producten.find((p) => p.id === ui.productId) ?? hulp.standaardProduct();
  const voorraad = data.stand.voorraad[gekozen?.id] ?? 0;
  const kanDoneren = producten.some((p) => p.doneren);

  const prodKnoppen = producten
    .map((p) => knop(esc(p.naam), 'kiesProduct', { product: p.id }, `pbtn${p.id === gekozen?.id ? ' on' : ''}`))
    .join('');
  const rechts = `<div class="prod">${prodKnoppen}`
    + `<span class="s${voorraad <= 6 ? ' low' : ''}">${voorraad} ${esc(gekozen?.naam.toLowerCase() ?? '')} op voorraad</span></div>`
    + knop(`${ICOON.overzicht}Overzicht`, 'naar', { scherm: 'overzicht' })
    + (kanDoneren ? knop(`${ICOON.krat}Krat bijzetten`, 'naar', { scherm: 'krat' }) : '')
    + knop(`${ICOON.slot}Instellingen`, 'naar', { scherm: 'pin', 'aria-label': 'Instellingen' });

  const bewoners = hulp.actieveBewoners();
  const tegels = bewoners.map((b) => {
    const n = aantalVoorBewoner(ui.bestelling, b.id);
    const t = data.stand.perBewoner[b.id]?.producten[gekozen?.id] ?? { vandaag: 0, periode: 0 };
    return knop(
      `<div class="hd"><span class="nm">${esc(b.naam)}</span>${n > 0 ? `<span class="badge">+${n}</span>` : ''}</div>`
        + `<span class="sub">${esc(gekozen?.naam ?? '')}: vandaag ${t.vandaag} · periode ${t.periode}</span>`,
      'streep', { bewoner: b.id }, `tile${n > 0 ? ' on' : ''}`,
    );
  }).join('') || '<div class="leeg">Nog geen bewoners. Voeg ze toe via Instellingen → Bewoners.</div>';

  const waarschuwing = data.instellingen.pinIsStandaard
    ? '<div class="warn">Standaardpincode 0000 in gebruik — wijzig hem bij Instellingen</div>' : '';

  const leeg = ui.bestelling.length === 0;
  const regels = ui.bestelling.map((r) => {
    const p = data.producten.find((x) => x.id === r.productId);
    const naam = hulp.naam(r.bewonerId);
    const pnaam = p?.naam ?? r.productId;
    return `<div class="row">${knop(
      `<span>${esc(naam)}<span class="pr">${esc(pnaam)}</span></span><span class="c">${r.aantal}</span>`,
      'minEen', { bewoner: r.bewonerId, product: r.productId, 'aria-label': `Eén ${pnaam.toLowerCase()} minder voor ${naam}` }, 'rowbtn',
    )}${p?.krat ? knop('+krat<br>(24)', 'plusKrat', { bewoner: r.bewonerId, product: r.productId }, 'krat') : '<span class="nokrat"></span>'}</div>`;
  }).join('');

  const lijst = leeg
    ? '<div class="empty">Nog niets gekozen.<br>Kies bovenin het product en tik links op wie er iets pakt.</div>'
    : `<div class="rows" data-scroll="hoofd-rows">${regels}</div>`;
  const alleProducten = [...data.producten].sort((a, b) => a.volgorde - b.volgorde);

  return bovenbalk(ctx, rechts)
    + `<div class="body"><div class="links">${waarschuwing}<div class="names" data-scroll="hoofd-names">${tegels}</div></div>`
    + '<div class="side"><h2>Bestellijst</h2>'
    + `<p class="hint">Tik op een naam voor +1 ${esc(gekozen?.naam.toLowerCase() ?? '')}. Tik hier op een regel voor −1.</p>`
    + lijst
    + `<div class="total"><span>Totaal</span><b>${esc(aantallenTekst(totaalPerProduct(ui.bestelling), alleProducten))}</b></div>`
    + `<div class="row">${knop('Wissen', 'wisBestelling', { disabled: leeg })}${knop('Doorvoeren', 'doorvoeren', { disabled: leeg }, 'btn btn-primary btn-big')}</div>`
    + '</div></div>';
}
