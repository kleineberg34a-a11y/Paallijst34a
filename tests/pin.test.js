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
