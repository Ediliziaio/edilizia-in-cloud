import { distanza, intersezioneAssi, sulTratto, type Segmento } from "./geometria.ts";
import type { Punto, Quota, RiferimentoQuota } from "./modello.ts";

export function puntoMedio({ p1, p2 }: Segmento): Punto {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

export function risolviRiferimentoQuota(r: RiferimentoQuota, muri: ReadonlyMap<string, Segmento>): Punto | undefined {
  const muro = muri.get(r.muroId);
  if (!muro) return;
  if (r.tipo === "estremo") return muro[r.estremo];
  if (r.tipo === "medio") return puntoMedio(muro);
  const altro = muri.get(r.altroMuroId);
  const incrocio = altro && intersezioneAssi(muro, altro);
  if (incrocio && altro && sulTratto(incrocio.tA, muro) && sulTratto(incrocio.tB, altro)) return incrocio.punto;
}

/** Conserva l'ultima posizione nota se l'aggancio non è più risolvibile. */
export function seguiQuota<T extends Quota>(q: T, muri: ReadonlyMap<string, Segmento>): { quota: T; daRivedere: boolean } {
  const r1 = q.riferimenti?.p1, r2 = q.riferimenti?.p2;
  const a = r1 && risolviRiferimentoQuota(r1, muri), b = r2 && risolviRiferimentoQuota(r2, muri);
  const p1 = a ?? q.p1, p2 = b ?? q.p2;
  const cambiata = p1.x !== q.p1.x || p1.y !== q.p1.y || p2.x !== q.p2.x || p2.y !== q.p2.y;
  if (cambiata && distanza(p1, p2) < 1) return { quota: q, daRivedere: true };
  return { quota: cambiata ? { ...q, p1, p2 } : q, daRivedere: !!((r1 && !a) || (r2 && !b)) };
}

export function rinominaRiferimentiQuota(q: Quota, ids: ReadonlyMap<string, string>): Quota["riferimenti"] {
  if (!q.riferimenti) return;
  const sposta = (r?: RiferimentoQuota): RiferimentoQuota | undefined => {
    if (!r) return;
    const muroId = ids.get(r.muroId);
    if (!muroId) return;
    if (r.tipo !== "intersezione") return { ...r, muroId };
    const altroMuroId = ids.get(r.altroMuroId);
    if (altroMuroId) return { ...r, muroId, altroMuroId };
  };
  const p1 = sposta(q.riferimenti.p1), p2 = sposta(q.riferimenti.p2);
  if (p1 || p2) return { ...(p1 && { p1 }), ...(p2 && { p2 }) };
}
