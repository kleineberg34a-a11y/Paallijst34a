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
