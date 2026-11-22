import type { Punto } from "./modello.ts";

export type EsitoRiscontroDwg = "da_rivedere" | "confermata" | "ignorata";

export interface TrattoRiscontroDwg {
  a: Punto;
  b: Punto;
  fonti: { handle: string; layer: string }[];
}

export type RiscontroDwg = {
  id: string;
  stato: EsitoRiscontroDwg;
  tratti: TrattoRiscontroDwg[];
} & (
  | { tipo: "chiusura" | "portoni"; modifica: { localeId: string; prima: Punto[]; dopo: Punto[] } }
  | { tipo: "sovrapposizione"; modifica?: never }
);

const oggetto = (dato: unknown): dato is Record<string, unknown> =>
  !!dato && typeof dato === "object" && !Array.isArray(dato);
const id = (v: unknown) => typeof v === "string" && /^[\w-]{1,100}$/.test(v);
const numero = (v: unknown) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e10;
const punto = (p: unknown) => oggetto(p) && numero(p.x) && numero(p.y);
const contorno = (p: unknown) => Array.isArray(p) && p.length >= 3 && p.length <= 100 && p.every(punto);

export function controlloDwgValido(dato: unknown): dato is RiscontroDwg[] {
  if (!Array.isArray(dato) || dato.length > 48) return false;
  const ids = new Set<string>(), locali = new Set<string>();
  return dato.every(r => {
    if (!oggetto(r) || typeof r.id !== "string" || !id(r.id) || ids.has(r.id)
      || !["da_rivedere", "confermata", "ignorata"].some(stato => stato === r.stato)
      || !Array.isArray(r.tratti) || !r.tratti.length || r.tratti.length > 8
      || !r.tratti.every(t => oggetto(t) && punto(t.a) && punto(t.b) && Array.isArray(t.fonti) && t.fonti.length <= 4
        && t.fonti.every(f => oggetto(f) && typeof f.handle === "string" && /^[0-9a-f]{1,16}$/i.test(f.handle)
          && typeof f.layer === "string" && f.layer.length <= 120))) return false;
    ids.add(r.id);
    if (r.tipo === "sovrapposizione") return r.modifica === undefined;
    const m = r.modifica;
    if (!(r.tipo === "chiusura" || r.tipo === "portoni") || !oggetto(m)
      || typeof m.localeId !== "string" || !id(m.localeId) || locali.has(m.localeId)
      || !contorno(m.prima) || !contorno(m.dopo)) return false;
    locali.add(m.localeId);
    return true;
  });
}
