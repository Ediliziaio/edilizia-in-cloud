import type { RitaglioPianta } from "./documentoImmagine";

export const UNITA_DWG = {
  1: "Pollici",
  2: "Piedi",
  4: "Millimetri",
  5: "Centimetri",
  6: "Metri",
} as const;

export type UnitaDwg = keyof typeof UNITA_DWG;
export type RettangoloDwg = [sinistra: number, basso: number, destra: number, alto: number];
export type QuotaDwg = { id: string; testo: string; lunghezza: number; angolo: number; punto: [number, number] };
export type RiferimentoDwg = { unita: UnitaDwg | null; rettangolo: RettangoloDwg; quote?: QuotaDwg[] };
export type PianoDwg = { nome: string; quota: number; rettangolo: RettangoloDwg };
export type RichiestaModelloDwg = { unita: UnitaDwg; altezza: number; layerMuri?: string; piani: PianoDwg[]; controlloGeometria?: boolean };
export const MASSIMO_PIANI_DWG = 6;
export const METRI_PER_UNITA_DWG: Record<UnitaDwg, number> = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1 };
export type RiscontroQuotaDwg = { quota: QuotaDwg; metri: number };

export function unitaDwgValida(unita: unknown): unita is UnitaDwg {
  return typeof unita === "number" && Object.hasOwn(UNITA_DWG, unita);
}

export function rettangoloDwgValido(v: unknown): v is RettangoloDwg {
  return Array.isArray(v) && v.length === 4
    && v.every((c) => typeof c === "number" && Number.isFinite(c) && Math.abs(c) <= 1e10)
    && v[2] > v[0] && v[3] > v[1];
}

export function ritaglioInCoordinateDwg(inquadratura: RettangoloDwg, taglio: RitaglioPianta): RettangoloDwg {
  const [x0, y0, x1, y1] = inquadratura;
  const w = x1 - x0, h = y1 - y0;
  return [
    x0 + w * taglio.x / 100,
    y1 - h * (taglio.y + taglio.height) / 100,
    x0 + w * (taglio.x + taglio.width) / 100,
    y1 - h * taglio.y / 100,
  ];
}

const oggetto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

export function leggiQuoteDwg(dato: unknown): QuotaDwg[] {
  if (!Array.isArray(dato)) return [];
  const ids = new Set<string>();
  return dato.slice(0, 20).filter((q): q is QuotaDwg => {
    if (!oggetto(q) || typeof q.id !== "string" || !/^[0-9a-f]{1,16}$/i.test(q.id) || ids.has(q.id)
      || typeof q.testo !== "string" || q.testo.length > 22 || !/^\d+(?:[.,]\d+)?(?:\s*(?:mm|cm|m))?$/i.test(q.testo)
      || typeof q.lunghezza !== "number" || !(q.lunghezza > 0 && q.lunghezza <= 1e10)
      || typeof q.angolo !== "number" || !(q.angolo >= 0 && q.angolo < 180)
      || !Array.isArray(q.punto) || q.punto.length !== 2 || !q.punto.every(v => typeof v === "number" && Math.abs(v) <= 1e10)) return false;
    ids.add(q.id);
    return true;
  });
}

export function direzioniDistinteDwg(a: QuotaDwg, b: QuotaDwg) {
  const angolo = Math.abs(a.angolo - b.angolo);
  return a.id !== b.id && Math.min(angolo, 180 - angolo) >= 20;
}

export function unitaCompatibiliDwg(riscontri: RiscontroQuotaDwg[]) {
  if (!riscontri.length) return [];
  return Object.keys(UNITA_DWG).map(Number).filter(unitaDwgValida).filter(unita => riscontri.every(({ quota, metri }) =>
    Math.abs(quota.lunghezza * METRI_PER_UNITA_DWG[unita] - metri) <= Math.max(0.001, metri * 0.005) + 1e-9,
  ));
}

export function validaRichiestaModelloDwg(input: unknown): RichiestaModelloDwg {
  if (!oggetto(input) || !unitaDwgValida(input.unita) || typeof input.altezza !== "number"
    || !Number.isFinite(input.altezza) || input.altezza < 200 || input.altezza > 800
    || !Array.isArray(input.piani) || !input.piani.length || input.piani.length > MASSIMO_PIANI_DWG) {
    throw new Error("Controlla l’unità, l’altezza dei muri e i piani selezionati.");
  }
  const piani: PianoDwg[] = input.piani.map((p: unknown) => {
    if (!oggetto(p) || typeof p.nome !== "string" || !p.nome.trim() || p.nome.trim().length > 70
      || typeof p.quota !== "number" || !Number.isFinite(p.quota) || p.quota < -5000 || p.quota > 30000
      || !rettangoloDwgValido(p.rettangolo)) {
      throw new Error("Ogni piano richiede un nome, una quota e un ritaglio valido.");
    }
    return { nome: p.nome.trim(), quota: p.quota, rettangolo: p.rettangolo };
  });
  if (new Set(piani.map((p) => p.quota)).size < piani.length) throw new Error("Assegna una quota diversa a ogni piano.");
  const layerMuri = typeof input.layerMuri === "string" ? input.layerMuri.trim().slice(0, 120) : "";
  return { unita: input.unita, altezza: input.altezza, layerMuri, piani, ...(input.controlloGeometria === true && { controlloGeometria: true }) };
}
