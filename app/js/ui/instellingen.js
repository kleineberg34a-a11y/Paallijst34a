import { esc, knop, bovenbalk, terugKnop, chip } from './html.js';
import { kratten, tijdLabel, datumLabel, beschrijf, isoDatum, bestandsnaam, maakMailTekst } from '../tekst.js';
import { KRAT } from '../domain.js';

export const TABS = [
  ['bewoners', 'Bewoners'], ['producten', 'Producten'], ['voorraad', 'Voorraad'], ['statiegeld', 'Statiegeld'],
  ['correcties', 'Correcties'], ['logboek', 'Logboek'], ['afsluiten', 'Afsluiten & mailen'], ['pincode', 'Pincode & koppeling'],
];

const ja = (v) => (v ? 'Ja' : 'Nee');
const inp = (id, waarde = '', extra = '') => `<input class="inp" id="${id}" value="${esc(waarde)}" autocomplete="off" ${extra}>`;
const veld = (label, html) => `<label class="field">${label}${html}</label>`;
const ph = (titel, rechts = '') => `<div class="ph"><h1>${titel}</h1>${rechts}</div>`;
const LEEG = { producten: {}, krattenGedoneerd: 0, statiegeld: 0 };
const stepper = (actie, waarde, attrs = {}) => '<div class="step">'
  + knop('−', actie, { ...attrs, delta: -1, 'aria-label': 'Minder' }, 'sq')
  + `<span class="v">${waarde}</span>`
  + knop('+', actie, { ...attrs, delta: 1, 'aria-label': 'Meer' }, 'sq') + '</div>';
const blokKnop = (tekst, actie, attrs = {}, klasse = 'btn btn-primary btn-big') => `<div class="row" style="max-width: 320px">${knop(tekst, actie, attrs, klasse)}</div>`;

// ---------- Bewoners ----------

function bewoners(ctx) {
  const { data, ui } = ctx;
  const f = ui.formulier;
  const rijen = data.bewoners.filter((b) => b.status !== 'weg').map((b) => {
    if (f.bewerk === b.id) {
      return `<tr><td>${inp('bw-naam', b.naam)}</td><td>${inp('bw-email', b.email, 'type="email"')}</td><td></td>`
        + `<td><div class="acts">${knop('Opslaan', 'bewonerOpslaan', { bewoner: b.id }, 'smallbtn on')}${knop('Annuleren', 'bewonerBewerk', {}, 'smallbtn')}</div></td></tr>`;
    }
    const tags = (b.hoofd ? '<span class="tag h">hoofdbewoner</span>' : '')
      + (b.status === 'vertrekt' ? '<span class="tag x">weg na afsluiten</span>' : '');
    const weg = b.status === 'vertrekt'
      ? knop('Terugzetten', 'bewonerTerugzetten', { bewoner: b.id }, 'smallbtn')
      : knop('Verwijderen', 'bewonerVerwijderen', { bewoner: b.id }, 'smallbtn');
    return `<tr><td>${esc(b.naam)}${tags}</td><td>${esc(b.email || '—')}</td>`
      + `<td>${knop(b.hoofd ? 'Ja – uitzetten' : 'Nee – aanzetten', 'bewonerHoofd', { bewoner: b.id }, 'smallbtn')}</td>`
      + `<td><div class="acts">${knop('Bewerken', 'bewonerBewerk', { bewoner: b.id }, 'smallbtn')}${weg}</div></td></tr>`;
  }).join('');
  return ph('Bewoners')
    + '<table class="tbl"><thead><tr><th>Naam</th><th>Mailadres</th><th>Hoofdbewoner</th><th>Acties</th></tr></thead>'
    + `<tbody>${rijen || '<tr><td colspan="4" class="hint">Nog geen bewoners.</td></tr>'}</tbody></table>`
    + `<div class="form">${veld('Naam', inp('nieuw-naam'))}${veld('Mailadres (alleen nodig voor hoofdbewoners)', inp('nieuw-email', '', 'type="email"'))}`
    + `${knop('+ Toevoegen', 'bewonerToevoegen', {}, 'btn btn-primary')}</div>`
    + '<p class="hint">Verwijderde bewoners met streepjes blijven tot het afsluiten in de periode staan en verdwijnen daarna.</p>';
}

// ---------- Producten ----------

function producten(ctx) {
  const { data, ui } = ctx;
  const lijst = [...data.producten].sort((a, b) => a.volgorde - b.volgorde);
  const toggle = (p, veld) => knop(ja(p[veld]), 'productToggle', { product: p.id, veld }, `smallbtn${p[veld] ? ' on' : ''}`);
  const rijen = lijst.map((p) => {
    const naam = ui.formulier.hernoem === p.id
      ? `<div class="acts">${inp('pr-naam', p.naam)}${knop('Opslaan', 'productHernoemen', { product: p.id }, 'smallbtn on')}${knop('Annuleren', 'productBewerk', {}, 'smallbtn')}</div>`
      : `${esc(p.naam)}${p.actief ? '' : '<span class="tag x">inactief</span>'}`;
    return `<tr><td>${naam}</td><td>${toggle(p, 'standaard')}</td><td>${toggle(p, 'krat')}</td><td>${toggle(p, 'doneren')}</td><td>${toggle(p, 'actief')}</td>`
      + `<td class="n">${data.stand.voorraad[p.id] ?? 0}</td>`
      + `<td>${ui.formulier.hernoem === p.id ? '' : knop('Hernoemen', 'productBewerk', { product: p.id }, 'smallbtn')}</td></tr>`;
  }).join('');
  return ph('Producten')
    + '<table class="tbl"><thead><tr><th>Product</th><th>Standaard</th><th>Krat-knop (+24)</th><th>Doneren aan huis</th><th>Actief</th><th class="n">Voorraad</th><th></th></tr></thead>'
    + `<tbody>${rijen}</tbody></table>`
    + `<div class="form">${veld('Naam nieuw product', inp('nieuw-product'))}${knop('+ Product toevoegen', 'productToevoegen', {}, 'btn btn-primary')}</div>`
    + '<p class="hint">Het standaardproduct staat bij het openen en na elke boeking geselecteerd. De andere producten staan ernaast in de productkeuze.</p>';
}

// ---------- Voorraad ----------

function voorraad(ctx) {
  const { data, ui, hulp } = ctx;
  const concept = ui.formulier.voorraad ?? {};
  const rijen = hulp.actieveProducten().map((p) => {
    const nu = data.stand.voorraad[p.id] ?? 0;
    const v = concept[p.id] ?? nu;
    return '<div class="step">'
      + `<span class="nm">${esc(p.naam)}</span>`
      + knop('−', 'voorraadStap', { product: p.id, delta: -1, 'aria-label': `Minder ${p.naam}` }, 'sq')
      + `<span class="v">${v}</span>`
      + knop('+', 'voorraadStap', { product: p.id, delta: 1, 'aria-label': `Meer ${p.naam}` }, 'sq')
      + (p.krat ? knop('+24 (krat)', 'voorraadStap', { product: p.id, delta: KRAT }, 'smallbtn') : '')
      + `<span class="hint">nu ${nu}</span></div>`;
  }).join('');
  return ph('Voorraad aanpassen')
    + '<p class="hint">Tel wat er in huis is en zet het hier goed. Elke wijziging komt in het logboek.</p>'
    + rijen + blokKnop('Opslaan', 'voorraadOpslaan');
}

// ---------- Statiegeld ----------

const wieTelt = (ctx) => ctx.data.bewoners.filter((b) => b.status === 'actief' || b.status === 'vertrekt');

function statiegeld(ctx) {
  const { data, ui, hulp } = ctx;
  const f = ui.formulier.sg ?? { bewoner: null, aantal: 1 };
  const chips = wieTelt(ctx).map((b) => chip(b.naam, 'sgKies', { bewoner: b.id }, b.id === f.bewoner)).join('');
  let sum = 'Kies wie de lege kratten heeft weggebracht.';
  if (f.bewoner) {
    const n = hulp.naam(f.bewoner);
    const stand = (data.stand.perBewoner[f.bewoner] ?? LEEG).statiegeld;
    sum = `${n} heeft ${kratten(f.aantal)} leeg weggebracht en het statiegeld ontvangen → statiegeld −${kratten(f.aantal)} op ${n} (stand wordt ${stand - f.aantal}).`;
  }
  return ph('Statiegeld terugboeken')
    + '<p class="hint">Wie heeft de lege kratten weggebracht? Het geld komt op zijn of haar rekening, dus het wordt op die persoon geboekt en later verrekend.</p>'
    + `<div><p class="lbl">Weggebracht door</p><div class="chips">${chips}</div></div>`
    + `<div><p class="lbl">Aantal lege kratten</p>${stepper('sgStap', f.aantal)}</div>`
    + `<div class="sum">${esc(sum)}</div>`
    + blokKnop('Boeken', 'statiegeldBoeken', { disabled: !f.bewoner });
}

// ---------- Correcties ----------

function correcties(ctx) {
  const { data, ui, hulp } = ctx;
  const f = ui.formulier.corr ?? { bewoner: null, product: hulp.standaardProduct()?.id, delta: -1 };
  const chips = wieTelt(ctx).map((b) => chip(b.naam, 'corrKies', { bewoner: b.id }, b.id === f.bewoner)).join('');
  const pchips = hulp.actieveProducten().map((p) => chip(p.naam, 'corrKies', { product: p.id }, p.id === f.product)).join('');
  const d = f.delta;
  let sum = 'Kies eerst de bewoner.';
  if (f.bewoner && f.product) {
    const pn = hulp.productNaam(f.product).toLowerCase();
    const nu = (data.stand.perBewoner[f.bewoner] ?? LEEG).producten[f.product]?.periode ?? 0;
    sum = `${hulp.naam(f.bewoner)}: ${d > 0 ? '+' : ''}${d} ${pn} in deze periode (nu ${nu}, wordt ${nu + d}). Voorraad ${pn} gaat ${d > 0 ? 'omlaag' : 'omhoog'} met ${Math.abs(d)}.`;
  }
  return ph('Correctie achteraf')
    + `<div><p class="lbl">Bewoner</p><div class="chips">${chips}</div></div>`
    + `<div><p class="lbl">Product</p><div class="chips">${pchips}</div></div>`
    + `<div><p class="lbl">Erbij of eraf</p>${stepper('corrStap', `${d > 0 ? '+' : ''}${d}`)}</div>`
    + `<div class="sum">${esc(sum)}</div>`
    + blokKnop('Correctie boeken', 'correctieBoeken', { disabled: !(f.bewoner && f.product) });
}

// ---------- Logboek ----------

export function logRegels(events, naam, productNaam) {
  const ongedaan = new Set(events.filter((e) => e.type === 'ongedaan').flatMap((e) => e.verwijst));
  const regels = [];
  for (const e of events) {
    const vorige = regels[regels.length - 1];
    if (e.type === 'streep' && vorige?.groep && vorige.groep === e.groep) {
      vorige.teksten.push(beschrijf(e, naam, productNaam));
      vorige.ids.push(e.id);
      continue;
    }
    regels.push({ ts: e.ts, type: e.type, groep: e.type === 'streep' ? e.groep : null, ids: [e.id], teksten: [beschrijf(e, naam, productNaam)] });
  }
  return regels.reverse().map((r) => ({ ...r, weg: r.ids.every((id) => ongedaan.has(id)) }));
}

const CORR_TYPES = new Set(['correctie', 'voorraad', 'statiegeld_terug', 'ongedaan']);

function logboek(ctx) {
  const { data, ui, hulp } = ctx;
  const f = ui.formulier;
  const events = f.logEvents ?? data.events;
  const opties = [...(data.periodes ?? [])].sort((a, b) => (a.start < b.start ? 1 : -1)).map((p) => {
    const label = p.id === data.periode.id ? `Lopende periode (sinds ${datumLabel(p.start)})` : `Periode vanaf ${datumLabel(p.start)}`;
    return `<option value="${esc(p.id)}"${p.id === (f.logPeriode ?? data.periode.id) ? ' selected' : ''}>${esc(label)}</option>`;
  }).join('');
  const rijen = logRegels(events, hulp.naam, hulp.productNaam).map((r) => {
    const tag = CORR_TYPES.has(r.type) ? '<span class="tag c">correctie</span>' : r.type === 'donatie' ? '<span class="tag d">donatie</span>' : '';
    return `<tr${r.weg ? ' class="weg"' : ''}><td>${esc(tijdLabel(r.ts))}</td><td>${esc(r.teksten.join(', '))}${tag}</td></tr>`;
  }).join('');
  return ph('Logboek', `<select class="inp" data-wijzig="logPeriode">${opties}</select>`)
    + '<p class="hint">Elke handeling, nieuwste bovenaan. Doorgestreept = ongedaan gemaakt.</p>'
    + `<table class="tbl"><thead><tr><th style="width: 190px">Tijd</th><th>Handeling</th></tr></thead><tbody>${rijen}</tbody></table>`;
}

// ---------- Afsluiten ----------

export const hoofdbewoners = (ctx) => ctx.data.bewoners.filter((b) => b.hoofd && b.email && b.status !== 'weg');

export function afsluitGegevens(ctx, nu = new Date()) {
  const { data, hulp } = ctx;
  return {
    bewoners: wieTelt(ctx),
    producten: hulp.actieveProducten(),
    stand: data.stand,
    van: isoDatum(data.periode.start),
    tot: isoDatum(nu),
  };
}

export const onderwerp = (g) => `Paallijst Huize Kleineberg – ${g.van} t/m ${g.tot}`;

function afsluiten(ctx) {
  const f = ctx.ui.formulier;
  const hoofden = hoofdbewoners(ctx);
  const ontvanger = hoofden.find((b) => b.id === f.ontvanger) ?? hoofden[0];
  const g = afsluitGegevens(ctx);
  const chips = hoofden.map((b) => chip(`${b.naam} · ${b.email}`, 'kiesOntvanger', { bewoner: b.id }, b.id === ontvanger?.id)).join('')
    || '<p class="hint">Er is nog geen hoofdbewoner met een mailadres. Stel die in bij Bewoners.</p>';
  const regels = maakMailTekst(g).split('\n').map((r) => (r ? `<div>${esc(r)}</div>` : '<br>')).join('');
  const knopTekst = f.bevestig ? 'Zeker weten? Tik nogmaals om af te sluiten' : 'Afsluiten, mailen en op 0 zetten';
  return ph('Periode afsluiten en mailen')
    + (f.afgesloten ? `<div class="ok">${esc(f.afgesloten)}</div>` : '')
    + `<div><p class="lbl">Versturen naar (hoofdbewoners)</p><div class="chips">${chips}</div></div>`
    + '<div class="mail">'
    + `<div class="m">Van: het huis-Gmailaccount · Aan: ${esc(ontvanger?.email ?? '(geen hoofdbewoner met mailadres)')}</div>`
    + `<div class="m">Onderwerp: ${esc(onderwerp(g))}</div>`
    + `<div class="m">Bijlage: ${esc(bestandsnaam(g.tot))}</div><br>${regels}</div>`
    + `<div class="row" style="max-width: 520px">${knop(knopTekst, 'afsluiten', { disabled: !ontvanger }, 'btn btn-danger btn-big')}</div>`
    + '<p class="hint">Afsluiten kan alleen met wifi. Eerst worden alle handelingen naar de Sheet gestuurd; pas als de mail verstuurd is, gaan de tellers op 0. De voorraad loopt door.</p>';
}

// ---------- Pincode & koppeling ----------

function pincode(ctx) {
  const inst = ctx.data.instellingen;
  const f = ctx.ui.formulier;
  const pinVeld = (id) => inp(id, '', 'type="password" inputmode="numeric" maxlength="4" pattern="[0-9]*"');
  const status = [
    inst.scriptUrl ? (inst.syncFout ? 'Niet verbonden' : 'Ingesteld') : 'Nog niet gekoppeld',
    `laatste sync ${inst.laatsteSync ? tijdLabel(inst.laatsteSync) : 'nog nooit'}`,
    `${inst.wachtrij ?? 0} in wachtrij`,
  ].join(' · ');
  return ph('Pincode en koppeling')
    + `<div><p class="lbl">Pincode${inst.pinIsStandaard ? ' <span class="tag x">standaard 0000</span>' : ''}</p>`
    + `<div class="form">${veld('Nieuwe pincode', pinVeld('pin-nieuw'))}${veld('Herhaal', pinVeld('pin-herhaal'))}${knop('Pincode wijzigen', 'pinWijzigen')}</div></div>`
    + '<div><p class="lbl">Google Apps Script-koppeling (huisaccount)</p>'
    + `<div class="form">${veld('Script-URL', inp('kop-url', inst.scriptUrl ?? '', 'style="width: 520px" type="url"'))}`
    + `${veld('Sleutel', inp('kop-sleutel', inst.sleutel ?? '', 'style="width: 240px"'))}${knop('Opslaan en testen', 'koppelingOpslaan', {}, 'btn btn-primary')}</div></div>`
    + (f.kopStatus ? `<div class="${f.kopStatus.ok ? 'ok' : 'sum'}">${esc(f.kopStatus.tekst)}</div>` : '')
    + `<div class="field">Synchronisatie<div>${esc(status)}${inst.syncFout ? `<br><span class="err">Laatste fout: ${esc(inst.syncFout)}</span>` : ''}</div></div>`
    + `<div class="acts">${knop('Nu synchroniseren', 'syncNu')}${herstelBlok(ctx)}</div>`
    + '<div class="field">Back-up Google Sheet<div>“Paallijst Kleineberg” in het huis-Gmailaccount</div></div>';
}

function herstelBlok(ctx) {
  if (!ctx.ui.formulier.herstelVraag) return knop('Herstellen vanuit Sheet', 'herstellen', {}, 'btn btn-danger');
  return '<div class="sum">Dit vervangt alle gegevens op deze tablet door die uit de Sheet. Doorgaan?'
    + `<div class="acts" style="margin-top: 10px">${knop('Ja, herstellen', 'herstellen', { stap: 'ja' }, 'btn btn-danger')}`
    + `${knop('Annuleren', 'kiesTab', { tab: 'pincode' })}</div></div>`;
}

const TABBLAD = { bewoners, producten, voorraad, statiegeld, correcties, logboek, afsluiten, pincode };

export function render(ctx) {
  const tab = TABBLAD[ctx.ui.tab] ? ctx.ui.tab : 'bewoners';
  const nav = TABS.map(([id, label]) => knop(esc(label), 'kiesTab', { tab: id }, `navb${id === tab ? ' on' : ''}`)).join('');
  return bovenbalk(ctx, terugKnop('Vergrendelen'))
    + `<div class="set"><div class="nav">${nav}</div><div class="page" data-scroll="inst-${tab}">${TABBLAD[tab](ctx)}</div></div>`;
}
