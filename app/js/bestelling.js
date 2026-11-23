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
