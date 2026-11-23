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
