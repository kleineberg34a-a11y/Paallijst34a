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
