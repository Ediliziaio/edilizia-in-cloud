/** Geometria di riferimento in centimetri, nel sistema del piano con Y verso l'alto. */
export interface TavolaDwg {
  riquadro: { x: number; y: number; larghezza: number; altezza: number };
  layer: LayerDwg[];
}

export interface LayerDwg {
  nome: string;
  /** Tracciati SVG geometrici. I layer densi possono essere compressi con prefisso «gz:». */
  linee: string;
  campiture: string;
}

const LIMITE_TRACCIATI = 1_400_000;
export const LIMITE_TRACCIATO_DWG_DECOMPRESSO = 3_000_000;
const oggetto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finito = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export const tracciatoSvgDwg = (v: string) => v === "" || /^M[MLQCZmlqcz0-9., -]+$/.test(v);
const tracciato = (v: unknown): v is string => typeof v === "string" && v.length <= LIMITE_TRACCIATI &&
  (v.startsWith("gz:") ? /^gz:[A-Za-z0-9+/]+={0,2}$/.test(v) : tracciatoSvgDwg(v));

export function tavolaDwgValida(v: unknown): v is TavolaDwg {
  if (!oggetto(v) || !oggetto(v.riquadro) || !Array.isArray(v.layer) || !v.layer.length || v.layer.length > 256) return false;
  const { x, y, larghezza, altezza } = v.riquadro;
  if (!finito(x) || !finito(y) || !finito(larghezza) || larghezza <= 0 || !finito(altezza) || altezza <= 0) return false;
  const nomi = new Set<string>();
  let dimensione = 0;
  for (const l of v.layer) {
    if (!oggetto(l) || typeof l.nome !== "string" || !l.nome.trim() || l.nome.length > 255 || nomi.has(l.nome)
      || !tracciato(l.linee) || !tracciato(l.campiture) || (!l.linee && !l.campiture)) return false;
    nomi.add(l.nome);
    dimensione += l.linee.length + l.campiture.length;
    if (dimensione > LIMITE_TRACCIATI) return false;
  }
  return true;
}
