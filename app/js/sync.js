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
