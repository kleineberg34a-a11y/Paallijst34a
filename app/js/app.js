import * as store from './store.js';
import { berekenStand, dagStart } from './domain.js';
import {
  nieuwId, streepEvents, ongedaanEvent, voorraadEvent, periodeStartEvent, donatieEvent,
  correctieEvent, statiegeldTerugEvent, beheerEvent, afsluitingEvent,
} from './events.js';
import { voegToe, haalAf } from './bestelling.js';
import { hashPin, pogingToegestaan, registreerPoging, STANDAARD_PIN } from './pin.js';
import { stuur, syncWachtrij } from './sync.js';
import { kratten, maakCsv, maakMailTekst, bestandsnaam } from './tekst.js';
import { melding } from './ui/html.js';
import * as hoofdscherm from './ui/hoofdscherm.js';
import * as krat from './ui/krat.js';
import * as overzicht from './ui/overzicht.js';
import * as pinScherm from './ui/pin.js';
import * as instellingen from './ui/instellingen.js';

const MELDING_SEC = 15;
const STIL_HOOFD_MS = 30000;
const STIL_SCHERM_MS = 30000;
const STIL_INSTELLINGEN_MS = 120000;
const SYNC_MS = 30000;
const INSTELLING_SLEUTELS = ['scriptUrl', 'sleutel', 'laatsteSync', 'syncFout', 'pinZout', 'pinHash', 'pinIsStandaard', 'pinGuard'];

const SCHERMEN = {
  hoofd: hoofdscherm,
  krat,
  overzicht,
  pin: pinScherm,
  instellingen,
};

// ---------- toestand ----------

const ctx = {
  data: { bewoners: [], producten: [], periode: null, events: [], stand: null, instellingen: {} },
  ui: { scherm: 'hoofd', tab: 'bewoners', productId: null, bestelling: [], melding: null, formulier: {} },
  hulp: {
    naam: (id) => ctx.data.bewoners.find((b) => b.id === id)?.naam ?? id,
    productNaam: (id) => ctx.data.producten.find((p) => p.id === id)?.naam ?? id,
    actieveBewoners: () => ctx.data.bewoners.filter((b) => b.status === 'actief'),
    actieveProducten: () => ctx.data.producten.filter((p) => p.actief).sort((a, b) => a.volgorde - b.volgorde),
    standaardProduct: () => {
      const act = ctx.hulp.actieveProducten();
      return act.find((p) => p.standaard) ?? act[0] ?? null;
    },
  },
};

const nu = () => new Date();

export function toon(tekst, soort, sec = 6) {
  ctx.ui.melding = { tekst, sec, duur: sec, soort };
}

async function zet(key, waarde) {
  ctx.data.instellingen[key] = waarde;
  await store.zetInstelling(key, waarde);
}

// ---------- laden ----------

async function eersteStart() {
  const periode = { id: nieuwId('p'), start: nu().toISOString() };
  const producten = [
    { id: 'pils', naam: 'Pils', krat: true, doneren: true, standaard: true, actief: true, volgorde: 1 },
    { id: 'wijn', naam: 'Wijn', krat: false, doneren: false, standaard: false, actief: true, volgorde: 2 },
  ];
  await store.bewaar('producten', producten);
  await store.bewaar('periodes', [periode]);
  const t = nu();
  await store.bewaar('events', [periodeStartEvent(periode.id, t), ...producten.map((p) => voorraadEvent(p.id, 0, periode.id, t))]);
  const zout = crypto.randomUUID();
  await store.zetInstelling('pinZout', zout);
  await store.zetInstelling('pinHash', await hashPin(STANDAARD_PIN, zout));
  await store.zetInstelling('pinIsStandaard', true);
  await store.zetInstelling('stamdataVuil', true);
}

async function laad() {
  if ((await store.alles('producten')).length === 0) await eersteStart();
  ctx.data.bewoners = await store.alles('bewoners');
  ctx.data.producten = await store.alles('producten');
  const periodes = (await store.alles('periodes')).sort((a, b) => (a.start < b.start ? -1 : 1));
  ctx.data.periodes = periodes;
  ctx.data.periode = periodes[periodes.length - 1];
  ctx.data.events = await store.eventsVanPeriode(ctx.data.periode.id);
  // Niet-gesyncte gebeurtenissen uit eerdere periodes (bv. de afsluiting) gaan ook mee in de wachtrij.
  ctx.data.restWachtrij = (await store.alles('events'))
    .filter((e) => !e.synced && e.periodeId !== ctx.data.periode.id)
    .sort((a, b) => (a.ts < b.ts ? -1 : 1));
  const inst = {};
  for (const k of INSTELLING_SLEUTELS) inst[k] = await store.instelling(k, null);
  inst.pinGuard ??= { fouten: 0, geblokkeerdTot: 0 };
  ctx.data.instellingen = inst;
  ctx.ui.productId = ctx.hulp.standaardProduct()?.id ?? null;
  herbereken();
}

// ---------- rekenen, boeken, sync ----------

function herbereken() {
  ctx.data.stand = berekenStand({
    events: ctx.data.events,
    bewoners: ctx.data.bewoners.filter((b) => b.status !== 'weg'),
    producten: ctx.data.producten,
    now: nu(),
  });
  ctx.data.instellingen.wachtrij = ongesynct().length;
}

const ongesynct = () => [...(ctx.data.restWachtrij ?? []), ...ctx.data.events].filter((e) => !e.synced);

export async function boek(events) {
  await store.bewaar('events', events);
  ctx.data.events.push(...events);
  herbereken();
  render();
  probeerSync();
}

let syncBezig = false;

export async function probeerSync() {
  const { scriptUrl, sleutel } = ctx.data.instellingen;
  if (!scriptUrl || syncBezig) return false;
  syncBezig = true;
  try {
    const open = ongesynct();
    const ids = new Set(await syncWachtrij({ events: open, url: scriptUrl, sleutel }));
    if (ids.size) {
      const gedaan = open.filter((e) => ids.has(e.id));
      for (const e of gedaan) e.synced = true;
      await store.bewaar('events', gedaan);
      ctx.data.restWachtrij = ctx.data.restWachtrij.filter((e) => !e.synced);
    }
    if (await store.instelling('stamdataVuil', false)) {
      await stuur(scriptUrl, sleutel, 'stamdata', { bewoners: ctx.data.bewoners, producten: ctx.data.producten });
      await store.zetInstelling('stamdataVuil', false);
    }
    await zet('laatsteSync', nu().toISOString());
    await zet('syncFout', null);
    return true;
  } catch (err) {
    await zet('syncFout', String(err?.message ?? err));
    return false;
  } finally {
    syncBezig = false;
    ctx.data.instellingen.wachtrij = ongesynct().length;
  }
}

// ---------- navigatie ----------

function naarHoofd() {
  ctx.ui.scherm = 'hoofd';
  ctx.ui.bestelling = [];
  ctx.ui.formulier = {};
  ctx.ui.productId = ctx.hulp.standaardProduct()?.id ?? null;
}

// ---------- acties ----------

const ACTIES = {
  kiesProduct: ({ product }) => { ctx.ui.productId = product; },
  streep: ({ bewoner }) => {
    if (!ctx.ui.productId) return;
    ctx.ui.bestelling = voegToe(ctx.ui.bestelling, bewoner, ctx.ui.productId);
  },
  minEen: ({ bewoner, product }) => { ctx.ui.bestelling = haalAf(ctx.ui.bestelling, bewoner, product); },
  plusKrat: ({ bewoner, product }) => { ctx.ui.bestelling = voegToe(ctx.ui.bestelling, bewoner, product, 24); },
  wisBestelling: () => { ctx.ui.bestelling = []; },
  doorvoeren: async () => {
    if (!ctx.ui.bestelling.length) return;
    const events = streepEvents(ctx.ui.bestelling, ctx.data.periode.id, nu());
    const tekst = events.map((e) => `${ctx.hulp.naam(e.bewonerId)} +${e.aantal} ${ctx.hulp.productNaam(e.productId).toLowerCase()}`).join(', ');
    ctx.ui.bestelling = [];
    ctx.ui.productId = ctx.hulp.standaardProduct()?.id ?? null;
    ctx.ui.melding = { tekst: `Geboekt: ${tekst}`, sec: MELDING_SEC, groepIds: events.map((e) => e.id) };
    await boek(events);
  },
  ongedaan: async () => {
    const m = ctx.ui.melding;
    if (!m?.groepIds) return;
    ctx.ui.melding = null;
    const doel = ctx.data.events.filter((e) => m.groepIds.includes(e.id));
    if (doel.length) await boek([ongedaanEvent(doel, ctx.data.periode.id, nu())]);
  },
  naar: ({ scherm }) => {
    naarHoofd();
    ctx.ui.scherm = scherm;
  },

  // krat bijzetten
  kiesDonor: ({ bewoner }) => { kratFormulier().donor = bewoner; },
  kratAantal: ({ delta }) => {
    const f = kratFormulier();
    f.aantal = Math.min(10, Math.max(1, f.aantal + Number(delta)));
  },
  bijzetten: async () => {
    const f = kratFormulier();
    const product = ctx.hulp.actieveProducten().find((p) => p.doneren);
    if (!f.donor || !product) return;
    const e = donatieEvent(f.donor, product.id, f.aantal, ctx.data.periode.id, nu());
    const tekst = `Bijgezet: ${kratten(f.aantal)} ${product.naam.toLowerCase()} door ${ctx.hulp.naam(f.donor)}`;
    naarHoofd();
    ctx.ui.melding = { tekst, sec: MELDING_SEC, groepIds: [e.id] };
    await boek([e]);
  },

  // pincode
  pinToets: async ({ toets }) => {
    const f = ctx.ui.formulier;
    f.pin ??= '';
    if (toets === 'annuleer') { naarHoofd(); return; }
    if (toets === 'wis') { f.pin = f.pin.slice(0, -1); f.pinFout = null; return; }
    if (f.pin.length >= 4) return;
    f.pin += toets;
    f.pinFout = null;
    if (f.pin.length < 4) return;
    const inst = ctx.data.instellingen;
    const t = Date.now();
    if (!pogingToegestaan(inst.pinGuard, t)) {
      f.pin = '';
      f.pinFout = `Te veel pogingen — wacht nog ${Math.ceil((inst.pinGuard.geblokkeerdTot - t) / 1000)} s`;
      return;
    }
    const goed = (await hashPin(f.pin, inst.pinZout)) === inst.pinHash;
    await zet('pinGuard', registreerPoging(inst.pinGuard, goed, t));
    if (goed) {
      naarHoofd();
      ctx.ui.scherm = 'instellingen';
      ctx.ui.tab = 'bewoners';
    } else {
      f.pin = '';
      f.pinFout = ctx.data.instellingen.pinGuard.geblokkeerdTot
        ? `Te veel pogingen — wacht nog ${Math.ceil((ctx.data.instellingen.pinGuard.geblokkeerdTot - t) / 1000)} s`
        : 'Onjuiste pincode';
    }
  },
};

function kratFormulier() {
  return (ctx.ui.formulier.krat ??= { donor: null, aantal: 1 });
}

// ---------- instellingen ----------

const lees = (id) => document.getElementById(id)?.value.trim() ?? '';
const geldigMail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const bewoner = (id) => ctx.data.bewoners.find((b) => b.id === id);
const product = (id) => ctx.data.producten.find((p) => p.id === id);

function vervang(lijst, item) {
  const i = lijst.findIndex((x) => x.id === item.id);
  if (i < 0) lijst.push(item); else lijst[i] = item;
}

async function bewaarBewoner(b, actie) {
  await store.bewaar('bewoners', [b]);
  vervang(ctx.data.bewoners, b);
  await store.zetInstelling('stamdataVuil', true);
  await boek([beheerEvent('bewoner', { actie, id: b.id, naam: b.naam }, ctx.data.periode.id, nu())]);
}

async function bewaarProducten(lijst, actie, naam, extraEvents = []) {
  await store.bewaar('producten', lijst);
  for (const p of lijst) vervang(ctx.data.producten, p);
  await store.zetInstelling('stamdataVuil', true);
  const t = nu();
  await boek([...extraEvents, beheerEvent('product', { actie, naam }, ctx.data.periode.id, t)]);
}

function heeftBoekingen(id) {
  const ongedaan = new Set(ctx.data.events.filter((e) => e.type === 'ongedaan').flatMap((e) => e.verwijst));
  return ctx.data.events.some((e) => e.bewonerId === id && !ongedaan.has(e.id));
}

Object.assign(ACTIES, {
  kiesTab: ({ tab }) => { ctx.ui.tab = tab; ctx.ui.formulier = {}; },

  // bewoners
  bewonerToevoegen: async () => {
    const naam = lees('nieuw-naam');
    const email = lees('nieuw-email');
    if (!naam) { toon('Vul een naam in', 'fout'); return; }
    if (email && !geldigMail(email)) { toon('Dat mailadres klopt niet', 'fout'); return; }
    await bewaarBewoner({ id: nieuwId('b'), naam, hoofd: false, email, status: 'actief' }, 'toegevoegd');
    toon(`${naam} toegevoegd`, 'ok');
  },
  bewonerBewerk: ({ bewoner: id }) => { ctx.ui.formulier.bewerk = id ?? null; },
  bewonerOpslaan: async ({ bewoner: id }) => {
    const b = bewoner(id);
    const naam = lees('bw-naam');
    const email = lees('bw-email');
    if (!naam) { toon('Vul een naam in', 'fout'); return; }
    if (email && !geldigMail(email)) { toon('Dat mailadres klopt niet', 'fout'); return; }
    if (b.hoofd && !email) { toon('Een hoofdbewoner heeft een mailadres nodig', 'fout'); return; }
    ctx.ui.formulier.bewerk = null;
    await bewaarBewoner({ ...b, naam, email }, b.naam === naam ? 'gewijzigd' : `hernoemd (was ${b.naam})`);
  },
  bewonerHoofd: async ({ bewoner: id }) => {
    const b = bewoner(id);
    if (!b.hoofd && !b.email) { toon('Vul eerst een mailadres in', 'fout'); return; }
    await bewaarBewoner({ ...b, hoofd: !b.hoofd }, b.hoofd ? 'geen hoofdbewoner meer' : 'is hoofdbewoner');
  },
  bewonerVerwijderen: async ({ bewoner: id }) => {
    const b = bewoner(id);
    const status = heeftBoekingen(id) ? 'vertrekt' : 'weg';
    await bewaarBewoner({ ...b, status }, status === 'vertrekt' ? 'vertrekt na afsluiten' : 'verwijderd');
  },
  bewonerTerugzetten: async ({ bewoner: id }) => {
    await bewaarBewoner({ ...bewoner(id), status: 'actief' }, 'teruggezet');
  },

  // producten
  productToevoegen: async () => {
    const naam = lees('nieuw-product');
    if (!naam) { toon('Vul een naam in', 'fout'); return; }
    const basis = naam.toLowerCase().replace(/\s+/g, '') || 'product';
    let id = basis;
    for (let i = 2; product(id); i++) id = `${basis}${i}`;
    const volgorde = Math.max(0, ...ctx.data.producten.map((p) => p.volgorde)) + 1;
    const p = { id, naam, krat: false, doneren: false, standaard: false, actief: true, volgorde };
    await bewaarProducten([p], 'toegevoegd', naam, [voorraadEvent(id, 0, ctx.data.periode.id, nu())]);
    toon(`${naam} toegevoegd`, 'ok');
  },
  productBewerk: ({ product: id }) => { ctx.ui.formulier.hernoem = id ?? null; },
  productHernoemen: async ({ product: id }) => {
    const p = product(id);
    const naam = lees('pr-naam');
    if (!naam) { toon('Vul een naam in', 'fout'); return; }
    ctx.ui.formulier.hernoem = null;
    if (naam !== p.naam) await bewaarProducten([{ ...p, naam }], `hernoemd (was ${p.naam})`, naam);
  },
  productToggle: async ({ product: id, veld }) => {
    const p = product(id);
    const aan = !p[veld];
    if (veld === 'standaard') {
      if (!aan) { toon('Maak een ander product standaard; er is altijd precies één standaardproduct', 'fout'); return; }
      const lijst = ctx.data.producten.map((x) => ({ ...x, standaard: x.id === id, actief: x.id === id ? true : x.actief }));
      await bewaarProducten(lijst, 'is standaard', p.naam);
      return;
    }
    if (veld === 'actief' && !aan && p.standaard) { toon('Het standaardproduct kan niet gedeactiveerd worden', 'fout'); return; }
    const labels = { krat: 'krat-knop', doneren: 'doneren', actief: 'actief' };
    await bewaarProducten([{ ...p, [veld]: aan }], `${labels[veld]} ${aan ? 'aan' : 'uit'}`, p.naam);
  },

  // voorraad
  voorraadStap: ({ product: id, delta }) => {
    const c = (ctx.ui.formulier.voorraad ??= {});
    c[id] = (c[id] ?? ctx.data.stand.voorraad[id] ?? 0) + Number(delta);
  },
  voorraadOpslaan: async () => {
    const c = ctx.ui.formulier.voorraad ?? {};
    const t = nu();
    const events = ctx.hulp.actieveProducten()
      .filter((p) => c[p.id] !== undefined && c[p.id] !== (ctx.data.stand.voorraad[p.id] ?? 0))
      .map((p) => voorraadEvent(p.id, c[p.id], ctx.data.periode.id, t));
    ctx.ui.formulier.voorraad = undefined;
    if (!events.length) { toon('Geen wijzigingen'); return; }
    await boek(events);
    toon('Voorraad opgeslagen', 'ok');
  },

  // statiegeld
  sgKies: ({ bewoner: id }) => { sgFormulier().bewoner = id; },
  sgStap: ({ delta }) => { const f = sgFormulier(); f.aantal = Math.max(1, f.aantal + Number(delta)); },
  statiegeldBoeken: async () => {
    const f = sgFormulier();
    if (!f.bewoner) return;
    await boek([statiegeldTerugEvent(f.bewoner, f.aantal, ctx.data.periode.id, nu())]);
    toon(`Geboekt: statiegeld −${kratten(f.aantal)} op ${ctx.hulp.naam(f.bewoner)}`, 'ok');
    ctx.ui.formulier.sg = undefined;
  },

  // correcties
  corrKies: ({ bewoner: b, product: p }) => {
    const f = corrFormulier();
    if (b) f.bewoner = b;
    if (p) f.product = p;
  },
  corrStap: ({ delta }) => {
    const f = corrFormulier();
    f.delta += Number(delta);
    if (f.delta === 0) f.delta = Number(delta);
  },
  correctieBoeken: async () => {
    const f = corrFormulier();
    if (!f.bewoner || !f.product) return;
    await boek([correctieEvent(f.bewoner, f.product, f.delta, ctx.data.periode.id, nu())]);
    toon(`Correctie geboekt: ${ctx.hulp.naam(f.bewoner)} ${f.delta > 0 ? '+' : '−'}${Math.abs(f.delta)} ${ctx.hulp.productNaam(f.product).toLowerCase()}`, 'ok');
    ctx.ui.formulier.corr = undefined;
  },

  // logboek
  logPeriode: async ({ waarde }) => {
    const f = ctx.ui.formulier;
    f.logPeriode = waarde;
    f.logEvents = waarde === ctx.data.periode.id ? undefined : await store.eventsVanPeriode(waarde);
  },

  // pincode & koppeling
  pinWijzigen: async () => {
    const a = lees('pin-nieuw');
    const b = lees('pin-herhaal');
    if (!/^\d{4}$/.test(a)) { toon('De pincode moet uit 4 cijfers bestaan', 'fout'); return; }
    if (a !== b) { toon('De twee pincodes zijn niet gelijk', 'fout'); return; }
    const zout = crypto.randomUUID();
    await zet('pinZout', zout);
    await zet('pinHash', await hashPin(a, zout));
    await zet('pinIsStandaard', false);
    toon('Pincode gewijzigd', 'ok');
  },
  koppelingOpslaan: async () => {
    const url = lees('kop-url');
    const sleutel = lees('kop-sleutel');
    await zet('scriptUrl', url || null);
    await zet('sleutel', sleutel || null);
    if (!url) { ctx.ui.formulier.kopStatus = { ok: false, tekst: 'Koppeling verwijderd' }; return; }
    try {
      await stuur(url, sleutel, 'ping');
      ctx.ui.formulier.kopStatus = { ok: true, tekst: 'Verbonden' };
      await store.zetInstelling('stamdataVuil', true);
      probeerSync();
    } catch (err) {
      ctx.ui.formulier.kopStatus = { ok: false, tekst: `Niet verbonden: ${err?.message ?? err}` };
    }
  },
  syncNu: async () => {
    if (!ctx.data.instellingen.scriptUrl) { toon('Vul eerst de script-URL en sleutel in', 'fout'); return; }
    const ok = await synchroniseerAlles();
    toon(ok ? 'Alles gesynchroniseerd' : `Synchroniseren mislukt: ${ctx.data.instellingen.syncFout}`, ok ? 'ok' : 'fout');
  },
});

// ---------- afsluiten en herstellen ----------

const offline = () => !ctx.data.instellingen.scriptUrl || navigator.onLine === false;

Object.assign(ACTIES, {
  kiesOntvanger: ({ bewoner: id }) => { ctx.ui.formulier.ontvanger = id; ctx.ui.formulier.bevestig = false; },

  afsluiten: async () => {
    const f = ctx.ui.formulier;
    const inst = ctx.data.instellingen;
    const hoofden = instellingen.hoofdbewoners(ctx);
    const ontvanger = hoofden.find((b) => b.id === f.ontvanger) ?? hoofden[0];
    if (!ontvanger) { toon('Er is geen hoofdbewoner met een mailadres', 'fout'); return; }
    if (offline()) { f.bevestig = false; toon('Geen verbinding: afsluiten kan alleen met wifi', 'fout', 8); return; }
    if (!f.bevestig) { f.bevestig = true; return; }
    f.bevestig = false;

    toon('Bezig met afsluiten…', null, 60);
    render();
    if (!(await synchroniseerAlles())) {
      toon(`Afsluiten mislukt: synchroniseren lukt niet (${inst.syncFout ?? 'onbekende fout'}). Er is niets veranderd.`, 'fout', 10);
      return;
    }
    herbereken();
    const t = nu();
    const g = instellingen.afsluitGegevens(ctx, t);
    const oud = ctx.data.periode;
    const aan = ontvanger.email;
    try {
      await stuur(inst.scriptUrl, inst.sleutel, 'afsluiten', {
        aan, onderwerp: instellingen.onderwerp(g), tekst: maakMailTekst(g), csv: maakCsv(g),
        bestandsnaam: bestandsnaam(g.tot), periodeId: oud.id, van: g.van, tot: g.tot,
      });
    } catch (err) {
      toon(`Afsluiten mislukt: ${err?.message ?? err}. Er is niets veranderd.`, 'fout', 10);
      return;
    }

    const nieuw = { id: nieuwId('p'), start: t.toISOString() };
    await store.bewaar('events', [afsluitingEvent(oud.id, { ontvanger: aan, van: g.van, tot: g.tot }, t)]);
    await store.bewaar('periodes', [nieuw]);
    await store.bewaar('events', [
      periodeStartEvent(nieuw.id, t),
      ...ctx.data.producten.map((p) => voorraadEvent(p.id, g.stand.voorraad[p.id] ?? 0, nieuw.id, t, { overgenomen: true })),
    ]);
    await store.bewaar('bewoners', ctx.data.bewoners.filter((b) => b.status === 'vertrekt').map((b) => ({ ...b, status: 'weg' })));
    await store.zetInstelling('stamdataVuil', true);
    await laad();
    ctx.ui.scherm = 'instellingen';
    ctx.ui.tab = 'afsluiten';
    const tekst = `Verstuurd naar ${aan} met CSV-bijlage. Nieuwe periode gestart.`;
    ctx.ui.formulier = { afgesloten: tekst };
    toon(tekst, 'ok', 10);
    probeerSync();
  },

  herstellen: async ({ stap }) => {
    if (stap !== 'ja') { ctx.ui.formulier.herstelVraag = true; return; }
    ctx.ui.formulier.herstelVraag = false;
    if (offline()) { toon('Geen verbinding of geen koppeling: herstellen kan alleen met wifi en een ingevulde script-URL', 'fout', 8); return; }
    const inst = ctx.data.instellingen;
    toon('Gegevens ophalen uit de Sheet…', null, 60);
    render();
    let r;
    try {
      r = await stuur(inst.scriptUrl, inst.sleutel, 'herstel');
    } catch (err) {
      toon(`Herstellen mislukt: ${err?.message ?? err}. Er is niets veranderd.`, 'fout', 10);
      return;
    }
    const bewaren = {};
    for (const k of ['scriptUrl', 'sleutel', 'pinZout', 'pinHash', 'pinIsStandaard']) bewaren[k] = await store.instelling(k, null);
    await store.wisAlles();
    for (const [k, v] of Object.entries(bewaren)) if (v !== null) await store.zetInstelling(k, v);
    await store.bewaar('bewoners', r.bewoners);
    await store.bewaar('producten', r.producten);
    await store.bewaar('periodes', [r.periode]);
    await store.bewaar('events', r.events.map((e) => ({ ...e, synced: true })));
    location.reload();
  },
});

function sgFormulier() {
  return (ctx.ui.formulier.sg ??= { bewoner: null, aantal: 1 });
}

function corrFormulier() {
  return (ctx.ui.formulier.corr ??= { bewoner: null, product: ctx.hulp.standaardProduct()?.id, delta: -1 });
}

// Sync herhalen tot de wachtrij leeg is (max. 10 rondes).
async function synchroniseerAlles() {
  for (let i = 0; i < 10; i++) {
    while (syncBezig) await new Promise((r) => setTimeout(r, 200));
    if (!(await probeerSync())) return false;
    if (!ongesynct().length) return true;
  }
  return false;
}

// ---------- weergave ----------

export function render() {
  const app = document.getElementById('app');
  const scroll = [...app.querySelectorAll('[data-scroll]')].map((el) => [el.dataset.scroll, el.scrollTop]);
  const scherm = SCHERMEN[ctx.ui.scherm] ?? SCHERMEN.hoofd;
  app.innerHTML = `<div class="app">${scherm.render(ctx)}${melding(ctx)}</div>`;
  for (const [k, top] of scroll) {
    const el = app.querySelector(`[data-scroll="${k}"]`);
    if (el) el.scrollTop = top;
  }
}

let actieBezig = false;

function opKlik(ev) {
  const el = ev.target.closest('[data-actie]');
  if (!el || el.disabled) return;
  voerUit(el.dataset.actie, { ...el.dataset });
}

function opWijzig(ev) {
  const el = ev.target.closest('[data-wijzig]');
  if (el) voerUit(el.dataset.wijzig, { ...el.dataset, waarde: el.value });
}

async function voerUit(naam, args) {
  const actie = ACTIES[naam];
  if (!actie || actieBezig) return;
  actieBezig = true;
  try {
    await actie(args);
  } catch (err) {
    console.error(err);
    toon(`Fout: ${err?.message ?? err}`, 'fout');
  } finally {
    actieBezig = false;
  }
  herbereken();
  render();
}

// ---------- timers ----------

let laatsteAanraking = Date.now();
let huidigeDag = dagStart(nu()).getTime();

function tik() {
  const m = ctx.ui.melding;
  if (m) {
    m.sec -= 1;
    const el = document.querySelector('.toast');
    if (m.sec <= 0) {
      ctx.ui.melding = null;
      el?.remove();
    } else if (el) {
      const sec = el.querySelector('.sec');
      if (sec) sec.textContent = `nog ${m.sec} s`;
      el.querySelector('.bar div').style.width = `${Math.round((m.sec / (m.duur || MELDING_SEC)) * 100)}%`;
    }
  }

  const stil = Date.now() - laatsteAanraking;
  const ui = ctx.ui;
  if (ui.scherm === 'hoofd') {
    const standaard = ctx.hulp.standaardProduct()?.id ?? null;
    if (stil >= STIL_HOOFD_MS && (ui.bestelling.length || ui.productId !== standaard)) {
      naarHoofd();
      render();
    }
  } else if (stil >= (ui.scherm === 'instellingen' ? STIL_INSTELLINGEN_MS : STIL_SCHERM_MS)) {
    naarHoofd();
    render();
  }

  const dag = dagStart(nu()).getTime();
  if (dag !== huidigeDag) {
    huidigeDag = dag;
    herbereken();
    if (ui.scherm !== 'instellingen') render();
  }
}

// ---------- start ----------

async function start() {
  const app = document.getElementById('app');
  try {
    await laad();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="app"><div class="page"><h1>Opstarten mislukt</h1><p class="hint">${String(err?.message ?? err)}</p></div></div>`;
    return;
  }
  app.addEventListener('click', opKlik);
  app.addEventListener('change', opWijzig);
  for (const t of ['pointerdown', 'keydown', 'input']) document.addEventListener(t, () => { laatsteAanraking = Date.now(); }, true);
  setInterval(tik, 1000);
  setInterval(probeerSync, SYNC_MS);
  window.addEventListener('online', probeerSync);
  render();
  probeerSync();
  navigator.serviceWorker?.register('sw.js').catch(() => {});
}

start();
