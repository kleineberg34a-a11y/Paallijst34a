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
