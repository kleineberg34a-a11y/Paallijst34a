# Paallijst Huize Kleineberg — bouwplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een offline werkende paallijst-webapp voor de Nokia T20 in Huize Kleineberg, met back-up naar een Google Sheet en een afsluitmail met CSV via het huis-Gmailaccount.

**Architecture:** Vanilla JavaScript (ES-modules, geen build-stap) in `app/`, gehost op GitHub Pages. Alle tellers worden berekend uit een logboek van gebeurtenissen dat alleen aangroeit (IndexedDB op de tablet). Een Google Apps Script, gebonden aan de Sheet in het huisaccount, ontvangt gebeurtenissen, verstuurt de afsluitmail en levert gegevens terug voor herstel.

**Tech Stack:** HTML/CSS/JS (ES2022-modules), IndexedDB, Service Worker, Node 24 `node --test` voor unit-tests, Google Apps Script (V8), GitHub Actions + GitHub Pages.

## Global Constraints

- Ontwerp: `docs/superpowers/specs/2026-11-23-paallijst-design.md`. Uiterlijk en indeling: `docs/mockup/Main.dc.html` (kleuren, lettertypen, CSS-klassen en teksten daaruit overnemen).
- Doelapparaat: Nokia T20, liggend, 1280×768 CSS-pixels (viewport), Chrome op Android.
- Alle teksten in de UI in het Nederlands.
- Krat = 24 stuks. "Vandaag" loopt van 06:00 tot 06:00.
- Ongedaan maken: 15 seconden. Hoofdscherm: na 30 s zonder aanraking bestellijst wissen + standaardproduct. Instellingen: na 2 min zonder aanraking vergrendelen. Pincode: 4 cijfers; na 5 foute pogingen 60 s blokkeren.
- Voorraad rood bij ≤ 6; mag negatief worden.
- CSV: puntkomma-gescheiden, UTF-8 met BOM, regeleinde `\r\n`.
- Geen geheimen in de repository. Script-URL en sleutel alleen in de instellingen op de tablet en in de Script Properties.
- Geen externe JS-bibliotheken. Lettertypen Inter en Space Grotesk via Google Fonts mogen.
- Tests: `node --test` vanuit de repo-root moet groen zijn vóór elke commit.
- Commitberichten eindigen met `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Bestandsstructuur

```
app/
  index.html               app-shell: <div id="app">, laadt js/app.js als module
  styles.css               CSS uit de mockup (klassen .app .top .tile .side …)
  manifest.webmanifest     PWA-manifest (fullscreen, landscape)
  sw.js                    service worker (offline cache)
  icon-192.png, icon-512.png
  js/
    domain.js              dagStart(), berekenStand()            — puur, getest
    events.js              fabrieken voor gebeurtenissen          — puur, getest
    bestelling.js          bestellijst-hulpfuncties               — puur, getest
    tekst.js               logtekst, CSV, mailtekst, datumformaat — puur, getest
    pin.js                 hashPin(), pincode-blokkering          — puur, getest
    sync.js                communicatie met Apps Script           — getest met nep-fetch
    store.js               IndexedDB-opslag
    app.js                 toestand, acties, timers, klik-afhandeling, render
    ui/hoofdscherm.js      render(ctx) → HTML
    ui/krat.js             render(ctx) → HTML
    ui/overzicht.js        render(ctx) → HTML
    ui/pin.js              render(ctx) → HTML
    ui/instellingen.js     render(ctx) → HTML
    ui/html.js             esc() en kleine HTML-hulpjes
tests/
  domain.test.js  events.test.js  bestelling.test.js  tekst.test.js  pin.test.js  sync.test.js
apps-script/Code.gs        Google Apps Script (in de Sheet plakken)
.github/workflows/pages.yml
docs/inrichten.md          stappenplan Sheet, Apps Script, GitHub Pages, tablet
package.json               { "type": "module" } zodat node de modules laadt
```

## Gegevensmodel (geldt voor alle taken)

```js
// Bewoner
{ id: 'b_…', naam: 'Olaf', hoofd: true, email: 'olaf@…', status: 'actief' | 'vertrekt' | 'weg' }
// Product
{ id: 'pils', naam: 'Pils', krat: true, doneren: true, standaard: true, actief: true, volgorde: 1 }
// Periode
{ id: 'p_…', start: '2026-11-01T…Z' }
// Gebeurtenis
{ id, ts /* ISO */, periodeId, type, groep?, bewonerId?, productId?, aantal?, verwijst? /* id[] */, data? /* object */, synced: false }
// type ∈ 'streep' | 'correctie' | 'donatie' | 'statiegeld_terug' | 'voorraad' | 'ongedaan'
//        | 'bewoner' | 'product' | 'afsluiting' | 'periode_start'
// Stand (uitkomst van berekenStand)
{ perBewoner: { [bewonerId]: { producten: { [productId]: { vandaag, periode } }, krattenGedoneerd, statiegeld } },
  voorraad: { [productId]: number },
  totalen: { producten: { [productId]: { vandaag, periode } }, krattenGedoneerd, statiegeld } }
```

Effect per type in `berekenStand` (gebeurtenissen waarnaar een `ongedaan` verwijst tellen niet mee):

| type | effect |
|---|---|
| streep | periode += aantal; vandaag += aantal als ts ≥ dagStart(now); voorraad −= aantal |
| correctie | periode += aantal (kan negatief); voorraad −= aantal |
| donatie | krattenGedoneerd += aantal; statiegeld += aantal; voorraad += 24 × aantal |
| statiegeld_terug | statiegeld −= aantal |
| voorraad | voorraad = aantal (absolute stand) |
| overige | geen effect op tellers |

Een nieuwe periode begint met een `periode_start` plus één `voorraad`-gebeurtenis per product met de doorlopende stand. Daardoor is de voorraad altijd uit de gebeurtenissen van de lopende periode te berekenen.

---

### Task 1: Projectbasis en rekenkern

**Files:**
- Create: `package.json`, `app/js/domain.js`, `tests/domain.test.js`

**Interfaces:**
- Produces: `dagStart(now: Date|number): Date`, `berekenStand({ events, bewoners, producten, now }): Stand`, `KRAT = 24`.

- [ ] **Step 1: package.json**

```json
{ "name": "paallijst", "private": true, "type": "module", "scripts": { "test": "node --test" } }
```

- [ ] **Step 2: Schrijf de falende tests** — `tests/domain.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dagStart, berekenStand } from '../app/js/domain.js';

const t = (d, h, m = 0) => new Date(2026, 10, d, h, m).toISOString(); // november 2026, lokale tijd

test('dagStart: na 06:00 is het vandaag 06:00', () => {
  assert.deepEqual(dagStart(new Date(2026, 10, 23, 22, 0)), new Date(2026, 10, 23, 6, 0));
  assert.deepEqual(dagStart(new Date(2026, 10, 23, 6, 0)), new Date(2026, 10, 23, 6, 0));
});

test('dagStart: voor 06:00 hoort bij de dag ervoor', () => {
  assert.deepEqual(dagStart(new Date(2026, 10, 24, 1, 30)), new Date(2026, 10, 23, 6, 0));
  assert.deepEqual(dagStart(new Date(2026, 10, 23, 5, 59)), new Date(2026, 10, 22, 6, 0));
});

test('berekenStand: alle gebeurtenistypes', () => {
  const producten = [{ id: 'pils' }, { id: 'wijn' }];
  const bewoners = [{ id: 'olaf' }, { id: 'tijn' }];
  const events = [
    { id: 'e1', ts: t(20, 10), type: 'voorraad', productId: 'pils', aantal: 30 },
    { id: 'e2', ts: t(22, 21), type: 'streep', bewonerId: 'olaf', productId: 'pils', aantal: 2 },
    { id: 'e3', ts: t(23, 20), type: 'streep', bewonerId: 'olaf', productId: 'pils', aantal: 3 },
    { id: 'e4', ts: t(23, 21), type: 'streep', bewonerId: 'tijn', productId: 'wijn', aantal: 1 },
    { id: 'e5', ts: t(23, 21, 30), type: 'donatie', bewonerId: 'tijn', productId: 'pils', aantal: 1 },
    { id: 'e6', ts: t(23, 21, 40), type: 'streep', bewonerId: 'tijn', productId: 'pils', aantal: 5 },
    { id: 'e7', ts: t(23, 21, 41), type: 'ongedaan', verwijst: ['e6'] },
    { id: 'e8', ts: t(23, 21, 50), type: 'statiegeld_terug', bewonerId: 'olaf', aantal: 1 },
    { id: 'e9', ts: t(23, 21, 55), type: 'correctie', bewonerId: 'olaf', productId: 'pils', aantal: -1 },
  ];
  const s = berekenStand({ events, bewoners, producten, now: new Date(2026, 10, 23, 22, 0) });
  assert.deepEqual(s.perBewoner.olaf.producten.pils, { vandaag: 3, periode: 4 });
  assert.deepEqual(s.perBewoner.tijn.producten.wijn, { vandaag: 1, periode: 1 });
  assert.deepEqual(s.perBewoner.tijn.producten.pils, { vandaag: 0, periode: 0 });
  assert.equal(s.perBewoner.tijn.krattenGedoneerd, 1);
  assert.equal(s.perBewoner.tijn.statiegeld, 1);
  assert.equal(s.perBewoner.olaf.statiegeld, -1);
  assert.equal(s.voorraad.pils, 50); // 30 − 2 − 3 + 24 + 1
  assert.equal(s.voorraad.wijn, -1);
  assert.deepEqual(s.totalen.producten.pils, { vandaag: 3, periode: 4 });
  assert.equal(s.totalen.krattenGedoneerd, 1);
  assert.equal(s.totalen.statiegeld, 0);
});

test('berekenStand: bewoner zonder gebeurtenissen staat op 0', () => {
  const s = berekenStand({ events: [], bewoners: [{ id: 'a' }], producten: [{ id: 'pils' }], now: new Date() });
  assert.deepEqual(s.perBewoner.a, { producten: { pils: { vandaag: 0, periode: 0 } }, krattenGedoneerd: 0, statiegeld: 0 });
  assert.equal(s.voorraad.pils, 0);
});
```

- [ ] **Step 3: Draai de tests en zie ze falen** — Run: `node --test` · Expected: FAIL, `Cannot find module …/app/js/domain.js`

- [ ] **Step 4: Implementeer** — `app/js/domain.js`

```js
export const KRAT = 24;
export const DAG_START_UUR = 6;

export function dagStart(now) {
  const d = new Date(now);
  if (d.getHours() < DAG_START_UUR) d.setDate(d.getDate() - 1);
  d.setHours(DAG_START_UUR, 0, 0, 0);
  return d;
}

function leeg(producten) {
  const p = {};
  for (const pr of producten) p[pr.id] = { vandaag: 0, periode: 0 };
  return { producten: p, krattenGedoneerd: 0, statiegeld: 0 };
}

export function berekenStand({ events, bewoners, producten, now }) {
  const start = dagStart(now).getTime();
  const ongedaan = new Set();
  for (const e of events) if (e.type === 'ongedaan') for (const id of e.verwijst) ongedaan.add(id);

  const perBewoner = {};
  for (const b of bewoners) perBewoner[b.id] = leeg(producten);
  const voorraad = {};
  for (const p of producten) voorraad[p.id] = 0;

  for (const e of events) {
    if (ongedaan.has(e.id)) continue;
    const b = e.bewonerId ? (perBewoner[e.bewonerId] ??= leeg(producten)) : null;
    const pid = e.productId;
    if (pid && !(pid in voorraad)) voorraad[pid] = 0;
    const teller = () => (b.producten[pid] ??= { vandaag: 0, periode: 0 });
    switch (e.type) {
      case 'streep': {
        const tl = teller();
        tl.periode += e.aantal;
        if (new Date(e.ts).getTime() >= start) tl.vandaag += e.aantal;
        voorraad[pid] -= e.aantal;
        break;
      }
      case 'correctie': teller().periode += e.aantal; voorraad[pid] -= e.aantal; break;
      case 'donatie': b.krattenGedoneerd += e.aantal; b.statiegeld += e.aantal; voorraad[pid] += KRAT * e.aantal; break;
      case 'statiegeld_terug': b.statiegeld -= e.aantal; break;
      case 'voorraad': voorraad[pid] = e.aantal; break;
    }
  }

  const totalen = { producten: {}, krattenGedoneerd: 0, statiegeld: 0 };
  for (const p of producten) totalen.producten[p.id] = { vandaag: 0, periode: 0 };
  for (const s of Object.values(perBewoner)) {
    for (const [pid, tl] of Object.entries(s.producten)) {
      const tt = (totalen.producten[pid] ??= { vandaag: 0, periode: 0 });
      tt.vandaag += tl.vandaag; tt.periode += tl.periode;
    }
    totalen.krattenGedoneerd += s.krattenGedoneerd;
    totalen.statiegeld += s.statiegeld;
  }
  return { perBewoner, voorraad, totalen };
}
```

- [ ] **Step 5: Draai de tests** — Run: `node --test` · Expected: 4 tests PASS
- [ ] **Step 6: Commit** — `git add package.json app/js/domain.js tests/domain.test.js` · `git commit -m "Rekenkern: dagStart en berekenStand"`

---

### Task 2: Gebeurtenissen en bestellijst

**Files:**
- Create: `app/js/events.js`, `app/js/bestelling.js`, `tests/events.test.js`, `tests/bestelling.test.js`

**Interfaces:**
- Consumes: niets.
- Produces (`events.js`), alle met `now: Date|number` als laatste argument, alle geven `synced: false`:
  - `nieuwId(prefix = 'e'): string`
  - `streepEvents(bestelling: {bewonerId, productId, aantal}[], periodeId, now): Event[]` (zelfde `groep`, regels met aantal ≤ 0 overgeslagen)
  - `donatieEvent(bewonerId, productId, kratten, periodeId, now): Event` (met `groep` = eigen id)
  - `correctieEvent(bewonerId, productId, aantal, periodeId, now)`
  - `statiegeldTerugEvent(bewonerId, kratten, periodeId, now)`
  - `voorraadEvent(productId, stand, periodeId, now, data?)`
  - `ongedaanEvent(teruggedraaid: Event[], periodeId, now)` → `verwijst` = ids
  - `beheerEvent(type: 'bewoner'|'product', data: {actie, naam, …}, periodeId, now)`
  - `afsluitingEvent(periodeId, data: {ontvanger, van, tot}, now)`
  - `periodeStartEvent(periodeId, now)`
- Produces (`bestelling.js`), onveranderlijk (geven nieuwe array terug):
  - `voegToe(lijst, bewonerId, productId, n = 1)` — telt op bij bestaande regel (bewoner+product) of voegt achteraan toe
  - `haalAf(lijst, bewonerId, productId)` — −1, regel weg bij 0
  - `totaalPerProduct(lijst): { [productId]: number }`
  - `aantalVoorBewoner(lijst, bewonerId): number`

- [ ] **Step 1: Falende tests** — `tests/events.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../app/js/events.js';

const NU = new Date(2026, 10, 23, 21, 0);

test('streepEvents: één groep, nulregels overgeslagen', () => {
  const ev = E.streepEvents([
    { bewonerId: 'olaf', productId: 'pils', aantal: 2 },
    { bewonerId: 'tijn', productId: 'wijn', aantal: 1 },
    { bewonerId: 'x', productId: 'pils', aantal: 0 },
  ], 'p1', NU);
  assert.equal(ev.length, 2);
  assert.equal(ev[0].groep, ev[1].groep);
  assert.notEqual(ev[0].id, ev[1].id);
  assert.deepEqual(
    { type: ev[0].type, periodeId: ev[0].periodeId, ts: ev[0].ts, bewonerId: ev[0].bewonerId, productId: ev[0].productId, aantal: ev[0].aantal, synced: ev[0].synced },
    { type: 'streep', periodeId: 'p1', ts: NU.toISOString(), bewonerId: 'olaf', productId: 'pils', aantal: 2, synced: false });
});

test('ongedaanEvent verwijst naar de ids', () => {
  const a = E.donatieEvent('tijn', 'pils', 1, 'p1', NU);
  const o = E.ongedaanEvent([a], 'p1', NU);
  assert.equal(o.type, 'ongedaan');
  assert.deepEqual(o.verwijst, [a.id]);
  assert.equal(a.groep, a.id);
});

test('overige fabrieken', () => {
  assert.equal(E.correctieEvent('olaf', 'pils', -2, 'p1', NU).aantal, -2);
  assert.equal(E.statiegeldTerugEvent('olaf', 3, 'p1', NU).type, 'statiegeld_terug');
  assert.equal(E.voorraadEvent('pils', 40, 'p1', NU).aantal, 40);
  assert.deepEqual(E.beheerEvent('bewoner', { actie: 'toegevoegd', naam: 'Joelle' }, 'p1', NU).data, { actie: 'toegevoegd', naam: 'Joelle' });
  assert.equal(E.afsluitingEvent('p1', { ontvanger: 'a@b.nl', van: 'x', tot: 'y' }, NU).type, 'afsluiting');
  assert.equal(E.periodeStartEvent('p2', NU).periodeId, 'p2');
  assert.match(E.nieuwId('p'), /^p_/);
});
```

`tests/bestelling.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voegToe, haalAf, totaalPerProduct, aantalVoorBewoner } from '../app/js/bestelling.js';

test('voegToe telt op en behoudt volgorde', () => {
  let l = [];
  l = voegToe(l, 'joelle', 'pils');
  l = voegToe(l, 'olaf', 'pils');
  l = voegToe(l, 'olaf', 'pils');
  l = voegToe(l, 'olaf', 'wijn');
  l = voegToe(l, 'tijn', 'pils', 24);
  assert.deepEqual(l, [
    { bewonerId: 'joelle', productId: 'pils', aantal: 1 },
    { bewonerId: 'olaf', productId: 'pils', aantal: 2 },
    { bewonerId: 'olaf', productId: 'wijn', aantal: 1 },
    { bewonerId: 'tijn', productId: 'pils', aantal: 24 },
  ]);
  assert.deepEqual(totaalPerProduct(l), { pils: 27, wijn: 1 });
  assert.equal(aantalVoorBewoner(l, 'olaf'), 3);
});

test('haalAf verwijdert bij 0 en is onveranderlijk', () => {
  const l = [{ bewonerId: 'olaf', productId: 'pils', aantal: 1 }];
  const n = haalAf(l, 'olaf', 'pils');
  assert.deepEqual(n, []);
  assert.equal(l.length, 1);
});
```

- [ ] **Step 2: Draai** — `node --test` · Expected: FAIL (modules ontbreken)

- [ ] **Step 3: Implementeer** — `app/js/events.js`

```js
export function nieuwId(prefix = 'e') {
  return `${prefix}_${crypto.randomUUID()}`;
}

function basis(type, periodeId, now) {
  return { id: nieuwId(), ts: new Date(now).toISOString(), periodeId, type, synced: false };
}

export function streepEvents(bestelling, periodeId, now) {
  const groep = nieuwId('g');
  return bestelling.filter((r) => r.aantal > 0).map((r) => ({
    ...basis('streep', periodeId, now), groep, bewonerId: r.bewonerId, productId: r.productId, aantal: r.aantal,
  }));
}

export function donatieEvent(bewonerId, productId, kratten, periodeId, now) {
  const e = { ...basis('donatie', periodeId, now), bewonerId, productId, aantal: kratten };
  e.groep = e.id;
  return e;
}

export function correctieEvent(bewonerId, productId, aantal, periodeId, now) {
  return { ...basis('correctie', periodeId, now), bewonerId, productId, aantal };
}

export function statiegeldTerugEvent(bewonerId, kratten, periodeId, now) {
  return { ...basis('statiegeld_terug', periodeId, now), bewonerId, aantal: kratten };
}

export function voorraadEvent(productId, stand, periodeId, now, data) {
  return { ...basis('voorraad', periodeId, now), productId, aantal: stand, ...(data ? { data } : {}) };
}

export function ongedaanEvent(teruggedraaid, periodeId, now) {
  return { ...basis('ongedaan', periodeId, now), verwijst: teruggedraaid.map((e) => e.id) };
}

export function beheerEvent(type, data, periodeId, now) {
  return { ...basis(type, periodeId, now), data };
}

export function afsluitingEvent(periodeId, data, now) {
  return { ...basis('afsluiting', periodeId, now), data };
}

export function periodeStartEvent(periodeId, now) {
  return basis('periode_start', periodeId, now);
}
```

`app/js/bestelling.js`

```js
const zelfde = (r, b, p) => r.bewonerId === b && r.productId === p;

export function voegToe(lijst, bewonerId, productId, n = 1) {
  if (lijst.some((r) => zelfde(r, bewonerId, productId))) {
    return lijst.map((r) => (zelfde(r, bewonerId, productId) ? { ...r, aantal: r.aantal + n } : r));
  }
  return [...lijst, { bewonerId, productId, aantal: n }];
}

export function haalAf(lijst, bewonerId, productId) {
  return lijst
    .map((r) => (zelfde(r, bewonerId, productId) ? { ...r, aantal: r.aantal - 1 } : r))
    .filter((r) => r.aantal > 0);
}

export function totaalPerProduct(lijst) {
  const t = {};
  for (const r of lijst) t[r.productId] = (t[r.productId] ?? 0) + r.aantal;
  return t;
}

export function aantalVoorBewoner(lijst, bewonerId) {
  return lijst.filter((r) => r.bewonerId === bewonerId).reduce((a, r) => a + r.aantal, 0);
}
```

- [ ] **Step 4: Draai** — `node --test` · Expected: alle tests PASS
- [ ] **Step 5: Commit** — `git add app/js/events.js app/js/bestelling.js tests/events.test.js tests/bestelling.test.js` · `git commit -m "Gebeurtenissen en bestellijst"`

---

### Task 3: Teksten — logboek, CSV en mail

**Files:**
- Create: `app/js/tekst.js`, `tests/tekst.test.js`

**Interfaces:**
- Consumes: `KRAT` uit `domain.js`; `Stand`-vorm uit Task 1.
- Produces:
  - `kratten(n): string` → `'1 krat'`, `'-1 krat'`, `'3 kratten'`, `'0 kratten'`
  - `isoDatum(d: Date|string): string` → `'2026-11-23'` (lokale datum)
  - `tijdLabel(ts): string` → `'ma 23 nov 21:14'`
  - `beschrijf(e: Event, naam: (id)=>string, productNaam: (id)=>string): string`
  - `maakCsv({ bewoners, producten, stand, van, tot }): string`
  - `maakMailTekst({ bewoners, producten, stand, van, tot }): string`
  - `bestandsnaam(tot): string` → `'paallijst_2026-11-23.csv'`

- [ ] **Step 1: Falende tests** — `tests/tekst.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kratten, isoDatum, tijdLabel, beschrijf, maakCsv, maakMailTekst, bestandsnaam } from '../app/js/tekst.js';

const bewoners = [{ id: 'olaf', naam: 'Olaf' }, { id: 'tijn', naam: 'Tijn; jr' }];
const producten = [{ id: 'pils', naam: 'Pils' }, { id: 'wijn', naam: 'Wijn' }];
const stand = {
  perBewoner: {
    olaf: { producten: { pils: { vandaag: 3, periode: 4 }, wijn: { vandaag: 0, periode: 0 } }, krattenGedoneerd: 0, statiegeld: -1 },
    tijn: { producten: { pils: { vandaag: 0, periode: 0 }, wijn: { vandaag: 1, periode: 1 } }, krattenGedoneerd: 1, statiegeld: 1 },
  },
  voorraad: { pils: 50, wijn: -1 },
  totalen: { producten: { pils: { vandaag: 3, periode: 4 }, wijn: { vandaag: 1, periode: 1 } }, krattenGedoneerd: 1, statiegeld: 0 },
};
const args = { bewoners, producten, stand, van: '2026-11-01', tot: '2026-11-23' };

test('kratten', () => {
  assert.equal(kratten(1), '1 krat');
  assert.equal(kratten(-1), '-1 krat');
  assert.equal(kratten(3), '3 kratten');
  assert.equal(kratten(0), '0 kratten');
});

test('datums', () => {
  assert.equal(isoDatum(new Date(2026, 10, 3, 23, 0)), '2026-11-03');
  assert.equal(tijdLabel(new Date(2026, 10, 23, 21, 4).toISOString()), 'ma 23 nov 21:04');
  assert.equal(bestandsnaam('2026-11-23'), 'paallijst_2026-11-23.csv');
});

test('maakCsv', () => {
  assert.equal(maakCsv(args),
    '﻿bewoner;pils;wijn;kratten_gedoneerd;statiegeld_kratten;periode_van;periode_tot\r\n' +
    'Olaf;4;0;0;-1;2026-11-01;2026-11-23\r\n' +
    '"Tijn; jr";0;1;1;1;2026-11-01;2026-11-23\r\n');
});

test('maakMailTekst', () => {
  const m = maakMailTekst(args);
  assert.match(m, /^Paallijst Huize Kleineberg\nPeriode: 2026-11-01 t\/m 2026-11-23\n/);
  assert.match(m, /\nOlaf: 4 pils, 0 wijn · 0 kratten gedoneerd · statiegeld -1 krat\n/);
  assert.match(m, /\nTotaal: 4 pils, 1 wijn · 1 krat gedoneerd · statiegeld 0 kratten\n/);
  assert.match(m, /\nVoorraad: 50 pils, -1 wijn\n/);
  assert.match(m, /CSV-bijlage/);
});

test('beschrijf', () => {
  const naam = (id) => ({ olaf: 'Olaf' })[id] ?? id;
  const pn = (id) => ({ pils: 'Pils' })[id] ?? id;
  assert.equal(beschrijf({ type: 'streep', bewonerId: 'olaf', productId: 'pils', aantal: 2 }, naam, pn), 'Olaf +2 pils');
  assert.equal(beschrijf({ type: 'correctie', bewonerId: 'olaf', productId: 'pils', aantal: -1 }, naam, pn), 'Correctie: Olaf −1 pils');
  assert.equal(beschrijf({ type: 'donatie', bewonerId: 'olaf', productId: 'pils', aantal: 2 }, naam, pn), 'Olaf doneert 2 kratten pils (+48 voorraad, +2 kratten statiegeld)');
  assert.equal(beschrijf({ type: 'statiegeld_terug', bewonerId: 'olaf', aantal: 1 }, naam, pn), 'Statiegeld terug: Olaf −1 krat (geld ontvangen)');
  assert.equal(beschrijf({ type: 'voorraad', productId: 'pils', aantal: 40 }, naam, pn), 'Voorraad pils gezet op 40');
  assert.equal(beschrijf({ type: 'ongedaan', verwijst: ['a', 'b'] }, naam, pn), 'Ongedaan gemaakt (2 boekingen)');
  assert.equal(beschrijf({ type: 'bewoner', data: { actie: 'toegevoegd', naam: 'Joelle' } }, naam, pn), 'Bewoner toegevoegd: Joelle');
  assert.equal(beschrijf({ type: 'product', data: { actie: 'gewijzigd', naam: 'Wijn' } }, naam, pn), 'Product gewijzigd: Wijn');
  assert.equal(beschrijf({ type: 'afsluiting', data: { ontvanger: 'a@b.nl' } }, naam, pn), 'Periode afgesloten en gemaild naar a@b.nl');
  assert.equal(beschrijf({ type: 'periode_start' }, naam, pn), 'Nieuwe periode gestart');
});
```

- [ ] **Step 2: Draai** — `node --test` · Expected: FAIL (module ontbreekt)

- [ ] **Step 3: Implementeer** — `app/js/tekst.js`

```js
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
  const regels = [`Paallijst Huize Kleineberg`, `Periode: ${van} t/m ${tot}`, ''];
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
```

- [ ] **Step 4: Draai** — `node --test` · Expected: alle tests PASS
- [ ] **Step 5: Commit** — `git add app/js/tekst.js tests/tekst.test.js` · `git commit -m "Logboektekst, CSV en mailtekst"`

---

### Task 4: Pincode

**Files:**
- Create: `app/js/pin.js`, `tests/pin.test.js`

**Interfaces:**
- Produces: `hashPin(pin, zout): Promise<string>` (hex SHA-256 van `zout + ':' + pin`), `MAX_FOUTEN = 5`, `BLOKKEER_MS = 60000`, `pogingToegestaan(guard, nu): boolean`, `registreerPoging(guard, goed, nu): guard` met `guard = { fouten: number, geblokkeerdTot: number }`, `STANDAARD_PIN = '0000'`.

- [ ] **Step 1: Falende tests** — `tests/pin.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPin, pogingToegestaan, registreerPoging } from '../app/js/pin.js';

test('hashPin is deterministisch en zoutafhankelijk', async () => {
  const a = await hashPin('1234', 'zout');
  assert.equal(a, await hashPin('1234', 'zout'));
  assert.notEqual(a, await hashPin('1234', 'ander'));
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('blokkeren na 5 fouten, 60 s', () => {
  let g = { fouten: 0, geblokkeerdTot: 0 };
  for (let i = 0; i < 4; i++) g = registreerPoging(g, false, 1000);
  assert.deepEqual(g, { fouten: 4, geblokkeerdTot: 0 });
  g = registreerPoging(g, false, 1000);
  assert.deepEqual(g, { fouten: 0, geblokkeerdTot: 61000 });
  assert.equal(pogingToegestaan(g, 60999), false);
  assert.equal(pogingToegestaan(g, 61000), true);
  assert.deepEqual(registreerPoging({ fouten: 3, geblokkeerdTot: 0 }, true, 5), { fouten: 0, geblokkeerdTot: 0 });
});
```

- [ ] **Step 2: Draai** — `node --test` · Expected: FAIL

- [ ] **Step 3: Implementeer** — `app/js/pin.js`

```js
export const MAX_FOUTEN = 5;
export const BLOKKEER_MS = 60000;
export const STANDAARD_PIN = '0000';

export async function hashPin(pin, zout) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${zout}:${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function pogingToegestaan(guard, nu) {
  return !guard.geblokkeerdTot || nu >= guard.geblokkeerdTot;
}

export function registreerPoging(guard, goed, nu) {
  if (goed) return { fouten: 0, geblokkeerdTot: 0 };
  const fouten = guard.fouten + 1;
  return fouten >= MAX_FOUTEN ? { fouten: 0, geblokkeerdTot: nu + BLOKKEER_MS } : { fouten, geblokkeerdTot: 0 };
}
```

- [ ] **Step 4: Draai** — `node --test` · Expected: PASS
- [ ] **Step 5: Commit** — `git add app/js/pin.js tests/pin.test.js` · `git commit -m "Pincode-hash en blokkering"`

---

### Task 5: Sync-client voor Apps Script

**Files:**
- Create: `app/js/sync.js`, `tests/sync.test.js`

**Interfaces:**
- Produces:
  - `stuur(url, sleutel, actie, payload = {}, fetchFn = fetch): Promise<object>` — POST, `Content-Type: text/plain;charset=utf-8` (voorkomt CORS-preflight bij Apps Script), body `JSON.stringify({ sleutel, actie, ...payload })`. Gooit `Error` bij HTTP-fout of `ok: false` (bericht = `fout` uit het antwoord).
  - `syncWachtrij({ events, url, sleutel, fetchFn }): Promise<string[]>` — stuurt maximaal 200 niet-gesyncte events (zonder het veld `synced`), geeft de verstuurde ids terug; `[]` als er niets is of geen url.
- Apps Script-acties (contract met Task 9): `ping`, `events {events}`, `stamdata {bewoners, producten}`, `afsluiten {aan, onderwerp, tekst, csv, bestandsnaam, periodeId, van, tot}`, `herstel` → `{ ok, bewoners, producten, periode, events }`.

- [ ] **Step 1: Falende tests** — `tests/sync.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stuur, syncWachtrij } from '../app/js/sync.js';

function nepFetch(antwoord, status = 200) {
  const calls = [];
  const fn = async (url, opts) => { calls.push({ url, opts }); return { ok: status < 400, status, json: async () => antwoord }; };
  fn.calls = calls;
  return fn;
}

test('stuur: post text/plain met sleutel en actie', async () => {
  const f = nepFetch({ ok: true, x: 1 });
  const r = await stuur('https://s', 'geheim', 'ping', {}, f);
  assert.deepEqual(r, { ok: true, x: 1 });
  assert.equal(f.calls[0].opts.method, 'POST');
  assert.equal(f.calls[0].opts.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.deepEqual(JSON.parse(f.calls[0].opts.body), { sleutel: 'geheim', actie: 'ping' });
});

test('stuur: fout van script wordt Error', async () => {
  await assert.rejects(stuur('https://s', 'k', 'ping', {}, nepFetch({ ok: false, fout: 'Ongeldige sleutel' })), /Ongeldige sleutel/);
  await assert.rejects(stuur('https://s', 'k', 'ping', {}, nepFetch({}, 500)), /HTTP 500/);
});

test('syncWachtrij stuurt alleen open events zonder synced-veld', async () => {
  const f = nepFetch({ ok: true });
  const ids = await syncWachtrij({
    events: [{ id: 'a', synced: true }, { id: 'b', synced: false, type: 'streep' }],
    url: 'https://s', sleutel: 'k', fetchFn: f,
  });
  assert.deepEqual(ids, ['b']);
  assert.deepEqual(JSON.parse(f.calls[0].opts.body).events, [{ id: 'b', type: 'streep' }]);
});

test('syncWachtrij zonder url of zonder open events doet niets', async () => {
  const f = nepFetch({ ok: true });
  assert.deepEqual(await syncWachtrij({ events: [{ id: 'b', synced: false }], url: '', sleutel: 'k', fetchFn: f }), []);
  assert.deepEqual(await syncWachtrij({ events: [], url: 'https://s', sleutel: 'k', fetchFn: f }), []);
  assert.equal(f.calls.length, 0);
});
```

- [ ] **Step 2: Draai** — `node --test` · Expected: FAIL

- [ ] **Step 3: Implementeer** — `app/js/sync.js`

```js
export async function stuur(url, sleutel, actie, payload = {}, fetchFn = fetch) {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ sleutel, actie, ...payload }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.fout || 'Onbekende fout van het script');
  return json;
}

export async function syncWachtrij({ events, url, sleutel, fetchFn = fetch }) {
  const open = events.filter((e) => !e.synced).slice(0, 200);
  if (!url || open.length === 0) return [];
  await stuur(url, sleutel, 'events', { events: open.map(({ synced, ...rest }) => rest) }, fetchFn);
  return open.map((e) => e.id);
}
```

- [ ] **Step 4: Draai** — `node --test` · Expected: PASS
- [ ] **Step 5: Commit** — `git add app/js/sync.js tests/sync.test.js` · `git commit -m "Sync-client voor Apps Script"`

---

### Task 6: Opslag, app-kern en hoofdscherm

Vanaf hier is het UI-werk. Uiterlijk komt uit `docs/mockup/Main.dc.html`: neem de CSS uit het `<style>`-blok daar letterlijk over in `app/styles.css` (zonder de `body{margin:0}`-regel aan te passen) en bouw dezelfde HTML-structuur en teksten na. De mockup is een prototype in een ander formaat (`{{…}}`, `<sc-if>`, `<sc-for>`); vertaal dat naar gewone template-strings.

**Files:**
- Create: `app/index.html`, `app/styles.css`, `app/js/store.js`, `app/js/app.js`, `app/js/ui/html.js`, `app/js/ui/hoofdscherm.js`

**Interfaces:**
- Consumes: Task 1–5.
- Produces:
  - `store.js`: `open()`, `alles(storeNaam)`, `bewaar(storeNaam, items[])`, `eventsVanPeriode(periodeId)` (gesorteerd op `ts`), `instelling(key, fallback)`, `zetInstelling(key, waarde)`, `wisAlles()`. Stores: `events` (keyPath `id`, index `periodeId`), `bewoners`, `producten`, `periodes` (keyPath `id`), `instellingen` (sleutel-waarde, out-of-line keys). Database `paallijst`, versie 1.
  - `ui/html.js`: `esc(s)` (escapet `& < > " '`), `knop(tekst, actie, attrs = {}, klasse = 'btn')` → `<button class="…" data-actie="…" data-…>`.
  - `app.js`: één `ctx`-object dat aan elke `render(ctx)` wordt gegeven:
    ```js
    ctx = {
      data: { bewoners, producten, periode, events, stand, instellingen: { scriptUrl, sleutel, laatsteSync, wachtrij } },
      ui:   { scherm: 'hoofd'|'krat'|'overzicht'|'pin'|'instellingen', tab, productId, bestelling, melding /* {tekst, sec, groepIds} | null */, formulier /* per-scherm invoer */ },
      hulp: { naam(id), productNaam(id), actieveBewoners(), actieveProducten(), standaardProduct() },
    }
    ```
  - Klikafhandeling: één `click`-listener op `#app`; het dichtstbijzijnde element met `data-actie` bepaalt de actie, `dataset` levert de argumenten. Acties staan in een object `ACTIES` in `app.js`: `{ [naam]: async (dataset) => … }`. Na elke actie: `herbereken()` (stand) en `render()`.
  - Elk scherm exporteert `render(ctx): string`.

- [ ] **Step 1: `app/index.html`**

```html
<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
  <meta name="theme-color" content="#15171c">
  <title>Paallijst Huize Kleineberg</title>
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: `app/styles.css`** — kopieer het volledige `<style>`-blok uit `docs/mockup/Main.dc.html`. Pas daarna aan: `.app{width:100vw;height:100vh}` in plaats van vaste 1280×768, en voeg toe: `html,body{height:100%;background:#15171c;overscroll-behavior:none;user-select:none;-webkit-tap-highlight-color:transparent}`.

- [ ] **Step 3: `app/js/store.js`** — IndexedDB-wrapper volgens de interface hierboven. Elke functie opent een transactie en geeft een Promise terug. `bewaar` gebruikt `put` per item in één transactie. `instelling(key, fallback)` geeft `fallback` als de sleutel ontbreekt. Roep in `open()` ook `navigator.storage?.persist?.()` aan.

- [ ] **Step 4: `app/js/app.js` — kern**
  - **Eerste start** (geen producten in de opslag): maak Pils (`id 'pils'`, standaard, krat, doneren, volgorde 1) en Wijn (`id 'wijn'`, volgorde 2), een periode (`nieuwId('p')`, start = nu), een `periode_start`-event en voor beide producten een `voorraadEvent(…, 0)`. Zet instelling `pinZout` (random UUID) en `pinHash` = `hashPin(STANDAARD_PIN, zout)`, en `pinIsStandaard = true`.
  - **Laden**: bewoners, producten, de laatste periode (op `start`), `eventsVanPeriode(periode.id)`, instellingen.
  - `boek(events[])`: bewaar in de store, voeg toe aan `ctx.data.events`, `herbereken()`, `render()`, dan `probeerSync()` (niet afwachten).
  - `herbereken()`: `ctx.data.stand = berekenStand({ events, bewoners: alle bewoners met status ≠ 'weg', producten, now: new Date() })`.
  - `probeerSync()`: als er een `scriptUrl` is: `syncWachtrij`, markeer teruggegeven ids als `synced: true` (store + geheugen), zet `laatsteSync`. Als instelling `stamdataVuil` waar is: `stuur(…, 'stamdata', { bewoners, producten })` en zet `stamdataVuil` op false. Fouten alleen opslaan in `ctx.data.instellingen.syncFout` (geen pop-up). Draai `probeerSync()` ook elke 30 s en bij het `online`-event.
  - **Timers**: elke 1 s: verlaag `ui.melding.sec`, wis de melding bij 0. Inactiviteit: bij elke `pointerdown` de teller resetten; op het hoofdscherm na 30 s `bestelling = []` en `productId = standaardProduct().id`; buiten het hoofdscherm na 30 s (krat/overzicht/pin) of 2 min (instellingen) terug naar het hoofdscherm.
  - `render()`: kies de render-functie op basis van `ui.scherm` en zet `#app.innerHTML`.
  - Registreer de service worker (`navigator.serviceWorker?.register('sw.js')`) — het bestand komt in Task 10; een mislukte registratie mag de app niet stoppen.

- [ ] **Step 5: `app/js/ui/hoofdscherm.js`** — bovenbalk + namenraster + bestellijst + melding, zoals in de mockup (blokken `.top`, `.body`, `.names`, `.side`, `.toast`).
  - Productkeuze: een `.pbtn` per actief product (`data-actie="kiesProduct" data-product="…"`), het gekozen product met klasse `on`; daarnaast `<span class="s">` met `"<voorraad> <product> op voorraad"`, klasse `low` bij ≤ 6.
  - Knoppen: Overzicht (`naar` met `data-scherm="overzicht"`), Krat bijzetten (`naar` / `krat`, alleen tonen als er een product met `doneren` is), Instellingen (`naar` / `pin`).
  - Tegels: alleen bewoners met status `actief`. Tekst: naam, badge `+n` (n = `aantalVoorBewoner`), sub `"<Product>: vandaag x · periode y"`. `data-actie="streep" data-bewoner="…"`.
  - Bestellijst-regels: `data-actie="minEen" data-bewoner data-product`; knop `+krat (24)` alleen bij `krat`-producten met `data-actie="plusKrat"`. Lege lijst: tekst uit de mockup. Totaal = `totaalPerProduct`, geformatteerd als `"3 pils, 1 wijn"`. Knoppen *Wissen* (`wisBestelling`) en *Doorvoeren* (`doorvoeren`), beide `disabled` bij een lege lijst.
  - Melding (als `ui.melding`): tekst, `"nog x s"`, knop *Ongedaan maken* (`ongedaan`), balk met breedte `sec/15*100%`.
  - Acties in `app.js`: `kiesProduct`, `streep` (voegToe met gekozen product), `minEen`, `plusKrat` (voegToe n=24), `wisBestelling`, `doorvoeren` (→ `streepEvents`, `boek`, melding `"Geboekt: Olaf +2 pils, …"` met `groepIds` = ids, 15 s, bestelling leeg, product terug naar standaard), `ongedaan` (→ `ongedaanEvent` van de events met die ids, `boek`, melding weg), `naar` (zet scherm, wist bestelling en pin-invoer).
  - Als `pinIsStandaard` waar is: toon bovenaan de namen een smalle waarschuwingsbalk "Standaardpincode 0000 in gebruik — wijzig hem bij Instellingen".

- [ ] **Step 6: Handmatige controle** — Run (vanuit de repo-root): `npx --yes http-server app -p 8080 -c-1` en open `http://localhost:8080` in Chrome, apparaatmodus 1280×768. Controleer:
  1. Eerste start toont Pils (geselecteerd) en Wijn, voorraad `0 pils op voorraad` in rood, waarschuwing standaardpincode, geen namen (nog geen bewoners — tijdelijk testen door in DevTools-console `indexedDB` te vullen is niet nodig; ga door naar Task 8 voor bewoners, of voeg tijdelijk in `app.js` bij eerste start twee testbewoners toe en haal die vóór de commit weg).
  2. Strepen, −1, +krat, Wissen, Doorvoeren, Ongedaan maken binnen 15 s werken; na herladen van de pagina is de stand bewaard.
  3. `node --test` blijft groen.
- [ ] **Step 7: Commit** — `git add app` · `git commit -m "Opslag, app-kern en hoofdscherm"`

---

### Task 7: Krat bijzetten, overzicht en pincodescherm

**Files:**
- Create: `app/js/ui/krat.js`, `app/js/ui/overzicht.js`, `app/js/ui/pin.js`
- Modify: `app/js/app.js` (acties + render-keuze)

**Interfaces:**
- Consumes: `ctx`, `ACTIES`, `boek` uit Task 6; `donatieEvent`; `hashPin`, `pogingToegestaan`, `registreerPoging`.
- Produces: acties `kiesDonor`, `kratAantal` (`data-delta` ±1, bereik 1–10), `bijzetten`, `pinToets` (`data-toets` = cijfer, `wis` of `annuleer`).

- [ ] **Step 1: `ui/krat.js`** — zoals het krat-scherm in de mockup. Alleen bewoners met status `actief` als chips. Product = het eerste actieve product met `doneren` (nu pils). Samenvatting: `"<Naam>: +n krat gedoneerd · +n krat statiegeld · voorraad <product> +24n (wordt X)"`, of `"Kies eerst wie de krat heeft gekocht."`. *Bijzetten* disabled zonder donor.
- [ ] **Step 2: Actie `bijzetten`** — `boek([donatieEvent(donor, product, n, periode, nu)])`, terug naar hoofdscherm, melding `"Bijgezet: n krat <product> door <Naam>"` (15 s, `groepIds` = [id]), formulier leeg.
- [ ] **Step 3: `ui/overzicht.js`** — tabel zoals in de mockup: per actief product kolommen `<Product> vandaag` en `<Product> periode`, dan `Kratten gedoneerd`, `Statiegeld (kratten)`. Rijen: bewoners met status `actief` en `vertrekt` (label "vertrekt"). Totaalregel uit `stand.totalen`. Kop: `"Periode <d mmm jjjj> – nu · alleen lezen"`.
- [ ] **Step 4: `ui/pin.js` + actie `pinToets`** — vier bolletjes, toetsenblok 1–9, `Wis`, 0, `×` (annuleer → hoofdscherm). Bij 4 cijfers: als `pogingToegestaan` onwaar is, toon `"Te veel pogingen — wacht nog X s"`; anders hash vergelijken met `pinHash`, `registreerPoging` bewaren als instelling `pinGuard`. Goed → scherm `instellingen`, tab `bewoners`. Fout → `"Onjuiste pincode"`, invoer leeg.
- [ ] **Step 5: Handmatige controle** — krat bijzetten verhoogt voorraad met 24 en is binnen 15 s ongedaan te maken; overzicht klopt met de tegels; pincode 0000 opent instellingen; 5× fout blokkeert 60 s. `node --test` groen.
- [ ] **Step 6: Commit** — `git add app` · `git commit -m "Krat bijzetten, overzicht en pincode"`

---

### Task 8: Instellingen

**Files:**
- Create: `app/js/ui/instellingen.js`
- Modify: `app/js/app.js`

**Interfaces:**
- Consumes: alles uit Task 1–7.
- Produces: acties per tab (namen hieronder). Invoervelden zijn gewone `<input>`-elementen; hun waarde wordt bij de klik op de bijbehorende knop uitgelezen via `document.getElementById(...)` (geen live binding nodig). Elke wijziging van bewoners of producten: opslaan, een `beheerEvent` boeken en instelling `stamdataVuil = true`.

- [ ] **Step 1: Navigatie** — linkerkolom met tabs (mockup `.nav`/`.navb`): Bewoners, Producten, Voorraad, Statiegeld, Correcties, Logboek, Afsluiten & mailen, Pincode & koppeling. Actie `kiesTab`. Bovenbalk-knop *Vergrendelen* → hoofdscherm.
- [ ] **Step 2: Bewoners** — tabel naam / mailadres / hoofdbewoner / acties. Onder de tabel een formulier *Naam* + *Mailadres* + knop *Toevoegen* (`bewonerToevoegen`; naam verplicht, id = `nieuwId('b')`, status `actief`). Per rij: *Bewerken* opent de rij als invoervelden met *Opslaan* (`bewonerOpslaan`); *Hoofdbewoner aan/uit* (`bewonerHoofd`; aanzetten vereist een mailadres, anders melding "Vul eerst een mailadres in"); *Verwijderen* (`bewonerVerwijderen`): heeft de bewoner gebeurtenissen in de lopende periode → status `vertrekt`, anders → `weg`. Bij status `vertrekt` toont de knop *Terugzetten* (→ `actief`).
- [ ] **Step 3: Producten** — tabel naam / standaard / krat-knop / doneren / actief / voorraad. Formulier *Naam* + *Toevoegen* (`productToevoegen`; id = naam in kleine letters zonder spaties, uniek gemaakt; krat/doneren nee; boek `voorraadEvent(id, 0, …)`). Per rij *Hernoemen* (invoerveld + *Opslaan*, `productHernoemen`; de id blijft gelijk) en toggles `productToggle` met `data-veld` ∈ `standaard|krat|doneren|actief`. `standaard` aanzetten zet het bij alle andere producten uit; het standaardproduct kan niet gedeactiveerd worden.
- [ ] **Step 4: Voorraad** — per actief product een stepper (−, waarde, +, en `+24` bij krat-producten) op een conceptwaarde in `ui.formulier.voorraad`, startend op de huidige stand. *Opslaan* (`voorraadOpslaan`) boekt een `voorraadEvent` voor elk product waarvan de waarde veranderd is.
- [ ] **Step 5: Statiegeld** — chips van bewoners (`actief` + `vertrekt`), stepper aantal (≥ 1), samenvatting zoals in de mockup, *Boeken* (`statiegeldBoeken` → `statiegeldTerugEvent`).
- [ ] **Step 6: Correcties** — chips bewoner, chips product, stepper aantal (niet 0, mag negatief), samenvatting zoals in de mockup, *Correctie boeken* (`correctieBoeken` → `correctieEvent`).
- [ ] **Step 7: Logboek** — alle gebeurtenissen van de lopende periode, nieuwste bovenaan: `tijdLabel(ts)` en `beschrijf(e, naam, productNaam)`. Labels: `correctie` bij type correctie/voorraad/statiegeld_terug/ongedaan, `donatie` bij donatie; regels waarnaar een `ongedaan` verwijst krijgen een doorhaling (`text-decoration: line-through`). Een keuzelijst toont ook eerdere periodes (`periodes`-store) en laadt dan `eventsVanPeriode(id)` alleen voor weergave.
- [ ] **Step 8: Pincode & koppeling** — velden *Nieuwe pincode* en *Herhaal* (4 cijfers, `inputmode="numeric"`), knop *Pincode wijzigen* (`pinWijzigen`; nieuwe zout, nieuwe hash, `pinIsStandaard = false`). Velden *Script-URL* en *Sleutel* met *Opslaan en testen* (`koppelingOpslaan` → bewaren, dan `stuur(url, sleutel, 'ping')`, toon "Verbonden" of de foutmelding). Status: laatste sync (`tijdLabel`), aantal in wachtrij (`events.filter(e => !e.synced).length`), laatste syncfout. Knop *Nu synchroniseren* (`syncNu`). Knop *Herstellen vanuit Sheet* komt in Task 9.
- [ ] **Step 9: Handmatige controle** — bewoners toevoegen/hernoemen/hoofdbewoner/verwijderen werkt en verschijnt op het hoofdscherm; product "Fris" toevoegen verschijnt in de productkeuze; voorraad, statiegeld en correctie verschijnen in overzicht en logboek; na 2 min inactiviteit vergrendelt het scherm. `node --test` groen.
- [ ] **Step 10: Commit** — `git add app` · `git commit -m "Instellingen: bewoners, producten, voorraad, statiegeld, correcties, logboek, pincode"`

---

### Task 9: Apps Script, afsluiten en herstel

**Files:**
- Create: `apps-script/Code.gs`
- Modify: `app/js/app.js`, `app/js/ui/instellingen.js`

**Interfaces:**
- Consumes: `stuur`, `syncWachtrij`, `maakCsv`, `maakMailTekst`, `bestandsnaam`, `isoDatum`, event-fabrieken.
- Produces: acties `kiesOntvanger`, `afsluiten`, `herstellen`.

- [ ] **Step 1: `apps-script/Code.gs`**

```js
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
```

- [ ] **Step 2: Afsluiten (tab *Afsluiten & mailen*)** — chips voor hoofdbewoners met mailadres (`kiesOntvanger`), voorbeeld van de mail (`maakMailTekst`, in een `.mail`-blok, met Van/Aan/Onderwerp/Bijlage-regels), knop *Afsluiten, mailen en op 0 zetten* (`afsluiten`). Actie `afsluiten`:
  1. Geen `scriptUrl` of `navigator.onLine === false` → melding "Geen verbinding: afsluiten kan alleen met wifi", stop.
  2. Herhaal `probeerSync()` tot de wachtrij leeg is (max. 10 rondes); lukt dat niet → foutmelding, stop.
  3. `van = isoDatum(periode.start)`, `tot = isoDatum(new Date())`; bewoners in de mail/CSV = status `actief` of `vertrekt`; producten = actief.
  4. `stuur(url, sleutel, 'afsluiten', { aan, onderwerp: 'Paallijst Huize Kleineberg – ' + van + ' t/m ' + tot, tekst, csv, bestandsnaam: bestandsnaam(tot), periodeId, van, tot })`. Bij een fout: melding met de foutmelding, er verandert niets.
  5. Bij succes: boek `afsluitingEvent(oude periode, { ontvanger: aan, van, tot })`; maak nieuwe periode (`nieuwId('p')`, start = nu, opslaan in `periodes`); boek in de nieuwe periode `periodeStartEvent` en per product `voorraadEvent(id, stand.voorraad[id], nieuw, nu, { overgenomen: true })`; zet bewoners met status `vertrekt` op `weg`; `stamdataVuil = true`; laad de nieuwe periode; toon groene melding "Verstuurd naar <aan> met CSV-bijlage. Nieuwe periode gestart."
- [ ] **Step 3: Herstellen (tab *Pincode & koppeling*)** — knop *Herstellen vanuit Sheet* (`herstellen`) met een bevestigingsstap in de UI ("Dit vervangt alle gegevens op deze tablet door die uit de Sheet. Doorgaan?" → *Ja, herstellen*). Actie: `stuur(…, 'herstel')`; bij succes: `wisAlles()` behalve de instellingen `scriptUrl`, `sleutel`, `pinZout`, `pinHash`, `pinIsStandaard`; bewaar bewoners, producten, periode en events (allemaal `synced: true`); herladen.
- [ ] **Step 4: Controle met echte Sheet** — volg `docs/inrichten.md` stap 1–2 (Task 10) om de Sheet en het script te maken (of doe het nu alvast). Vul URL en sleutel in op de app, *Opslaan en testen* → "Verbonden". Streep iets → binnen 30 s staat het in het tabblad *Gebeurtenissen*, zonder dubbele rijen bij *Nu synchroniseren*. Afsluiten naar een hoofdbewoner → mail met CSV komt aan, CSV opent goed in Excel, tellers staan op 0, voorraad is doorgelopen. Wis daarna in Chrome de sitegegevens en herstel vanuit de Sheet → de stand is terug. `node --test` groen.
- [ ] **Step 5: Commit** — `git add apps-script app` · `git commit -m "Apps Script, afsluiten en herstellen"`

---

### Task 10: PWA, publicatie en inrichtingsdocument

**Files:**
- Create: `app/manifest.webmanifest`, `app/sw.js`, `app/icon-192.png`, `app/icon-512.png`, `.github/workflows/pages.yml`, `docs/inrichten.md`

- [ ] **Step 1: `app/manifest.webmanifest`**

```json
{
  "name": "Paallijst Huize Kleineberg",
  "short_name": "Paallijst",
  "start_url": "./",
  "scope": "./",
  "display": "fullscreen",
  "orientation": "landscape",
  "background_color": "#15171c",
  "theme_color": "#15171c",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Iconen** — maak twee PNG's (192 en 512 px): amberkleurige (#f5b301) achtergrond met de letter "P" in #1a1400, Space Grotesk of een vet schreefloos lettertype. Bijvoorbeeld met een klein Node-script dat een SVG naar PNG rendert, of handmatig; het script hoort niet in de repo.

- [ ] **Step 3: `app/sw.js`**

```js
const CACHE = 'paallijst-v1';
const BESTANDEN = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'js/app.js', 'js/domain.js', 'js/events.js', 'js/bestelling.js', 'js/tekst.js', 'js/pin.js', 'js/sync.js', 'js/store.js',
  'js/ui/html.js', 'js/ui/hoofdscherm.js', 'js/ui/krat.js', 'js/ui/overzicht.js', 'js/ui/pin.js', 'js/ui/instellingen.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BESTANDEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return; // POST naar Apps Script nooit cachen
  const url = new URL(e.request.url);
  if (url.origin !== location.origin && !url.host.endsWith('fonts.googleapis.com') && !url.host.endsWith('fonts.gstatic.com')) return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const kopie = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, kopie));
      return res;
    })),
  );
});
```

Afspraak: bij elke uitrol met gewijzigde bestanden het versienummer in `CACHE` ophogen.

- [ ] **Step 4: `.github/workflows/pages.yml`**

```yaml
name: Publiceren
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  publiceer:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: node --test
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: app
      - id: deploy
        uses: actions/deploy-pages@v4
```

- [ ] **Step 5: `docs/inrichten.md`** — stappenplan in het Nederlands, met deze onderdelen:
  1. **Google Sheet**: inloggen als kleineberg34a@gmail.com → nieuwe Sheet "Paallijst Kleineberg".
  2. **Apps Script**: in de Sheet *Extensies → Apps Script* → inhoud van `apps-script/Code.gs` plakken → *Projectinstellingen → Scripteigenschappen*: `SLEUTEL` = een lange willekeurige tekst → *Implementeren → Nieuwe implementatie → Web-app*, uitvoeren als *Ik*, toegang *Iedereen* → toestemming geven → de web-app-URL kopiëren. Uitleg: na een wijziging in Code.gs een *nieuwe versie* implementeren onder dezelfde implementatie.
  3. **GitHub Pages**: repository *Settings → Pages → Source: GitHub Actions*; na een push staat de app op `https://kleineberg34a-a11y.github.io/Paallijst34a/`.
  4. **Tablet**: Chrome → het adres openen → menu → *Toevoegen aan startscherm*; app openen; *Instellingen* (pincode 0000) → pincode wijzigen → URL en sleutel invullen → *Opslaan en testen*; bewoners en hoofdbewoners invullen; voorraad tellen en invoeren.
  5. **Android**: *Instellingen → Display → Time-out scherm* op de langste waarde of via *Ontwikkelaarsopties → Stay awake* (tablet aan de lader); *Instellingen → Beveiliging → App vastzetten* aanzetten en de Paallijst vastzetten.
  6. **Updates**: nieuwe versie wordt na push automatisch gepubliceerd; op de tablet de app twee keer openen (de service worker haalt de nieuwe versie op).
- [ ] **Step 6: Controle** — `node --test` groen; push naar GitHub; in het tabblad *Actions* slaagt "Publiceren"; de app opent op het Pages-adres; in Chrome DevTools → *Application* is de service worker actief en werkt de app met *Offline* aangevinkt.
- [ ] **Step 7: Commit en push** — `git add app .github docs/inrichten.md` · `git commit -m "PWA, publicatie via GitHub Pages en inrichtingsdocument"` · `git push`

---

### Task 11: Eindtest op de tablet

- [ ] **Step 1** — Richt de T20 in volgens `docs/inrichten.md`.
- [ ] **Step 2** — Doorloop één keer: strepen (pils en wijn, meerdere personen), −1, +krat, doorvoeren, ongedaan maken, krat bijzetten, overzicht, wifi uit → strepen → wifi aan → wachtrij loopt leeg, correctie, statiegeld terug, voorraad tellen, afsluiten met testmail naar de hoofdbewoner, CSV openen in Excel.
- [ ] **Step 3** — Noteer gevonden problemen als losse punten in `docs/eindtest.md`, los ze op met een eigen commit per probleem, en push.
