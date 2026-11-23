import { esc, knop, bovenbalk, terugKnop } from './html.js';

const TOETSEN = [['1'], ['2'], ['3'], ['4'], ['5'], ['6'], ['7'], ['8'], ['9'], ['Wis', 'wis'], ['0'], ['×', 'annuleer']];

export function render(ctx) {
  const f = ctx.ui.formulier;
  const pin = f.pin ?? '';
  const bolletjes = [0, 1, 2, 3].map((i) => `<span class="dot${i < pin.length ? ' f' : ''}"></span>`).join('');
  const toetsen = TOETSEN.map(([label, toets = label]) => knop(esc(label), 'pinToets', { toets }, 'key')).join('');
  return bovenbalk(ctx, terugKnop())
    + '<div class="pinwrap"><div class="pincard">'
    + '<h1>Pincode</h1>'
    + '<p class="hint">Instellingen zijn beveiligd.</p>'
    + `<div class="dots">${bolletjes}</div>`
    + (f.pinFout ? `<p class="err">${esc(f.pinFout)}</p>` : '')
    + `<div class="keys">${toetsen}</div>`
    + '</div></div>';
}
