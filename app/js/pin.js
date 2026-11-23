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
