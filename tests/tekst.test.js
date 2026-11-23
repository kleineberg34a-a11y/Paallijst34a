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
