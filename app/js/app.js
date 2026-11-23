import * as store from './store.js';
import { berekenStand, dagStart } from './domain.js';
import { nieuwId, streepEvents, ongedaanEvent, voorraadEvent, periodeStartEvent } from './events.js';
import { voegToe, haalAf } from './bestelling.js';
import { hashPin, STANDAARD_PIN } from './pin.js';
import { stuur, syncWachtrij } from './sync.js';
import { melding } from './ui/html.js';
import * as hoofdscherm from './ui/hoofdscherm.js';

const MELDING_SEC = 15;
const STIL_HOOFD_MS = 30000;
const STIL_SCHERM_MS = 30000;
const STIL_INSTELLINGEN_MS = 120000;
const SYNC_MS = 30000;
const INSTELLING_SLEUTELS = ['scriptUrl', 'sleutel', 'laatsteSync', 'syncFout', 'pinZout', 'pinHash', 'pinIsStandaard', 'pinGuard'];

const SCHERMEN = { hoofd: hoofdscherm };

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
  ctx.data.periode = periodes[periodes.length - 1];
  ctx.data.events = await store.eventsVanPeriode(ctx.data.periode.id);
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
  ctx.data.instellingen.wachtrij = ctx.data.events.filter((e) => !e.synced).length;
}

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
    const ids = new Set(await syncWachtrij({ events: ctx.data.events, url: scriptUrl, sleutel }));
    if (ids.size) {
      const gedaan = ctx.data.events.filter((e) => ids.has(e.id));
      for (const e of gedaan) e.synced = true;
      await store.bewaar('events', gedaan);
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
    ctx.data.instellingen.wachtrij = ctx.data.events.filter((e) => !e.synced).length;
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
};

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

async function opKlik(ev) {
  const el = ev.target.closest('[data-actie]');
  if (!el || el.disabled || actieBezig) return;
  const actie = ACTIES[el.dataset.actie];
  if (!actie) return;
  actieBezig = true;
  try {
    await actie({ ...el.dataset });
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
  for (const t of ['pointerdown', 'keydown', 'input']) document.addEventListener(t, () => { laatsteAanraking = Date.now(); }, true);
  setInterval(tik, 1000);
  setInterval(probeerSync, SYNC_MS);
  window.addEventListener('online', probeerSync);
  render();
  probeerSync();
  navigator.serviceWorker?.register('sw.js').catch(() => {});
}

start();
