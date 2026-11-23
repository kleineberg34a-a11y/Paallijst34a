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
