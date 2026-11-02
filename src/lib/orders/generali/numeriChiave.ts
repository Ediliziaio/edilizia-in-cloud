// src/lib/orders/generali/numeriChiave.ts
// I quattro numeri in cima alla generale (piano §3.3): valore, margine, da incassare e, per l'appalto,
// il residuo del contratto; per sviluppo e compravendita il capitale impegnato. Il margine è uno
// solo in tutta la pagina: se c'è il piano è la sua stima finale, che comprende costi comuni e interessi.
import type { ModelloGenerale, TotaliGenerale } from "@/lib/orders/commesseGenerali";

export interface NumeroChiave {
  id: "valore" | "margine" | "incassare" | "residuo" | "capitale" | "assegnare";
  valore: number | null;
}

export interface PianoPerNumeri { margineStima: number; capitaleMassimo: number }

/**
 * Il piano dice qualcosa sul margine solo se ha almeno un costo con un importo: le voci tipiche
 * di partenza hanno ricavo e costi a zero, e una generale nuova mostrerebbe un margine pari al valore.
 */
export function pianoPerNumeri(p: { confronto: { totali: { costi: { previsto: number }; margine: { stima: number } } }; capitale: { massimoStima: number } } | null | undefined): PianoPerNumeri | null {
  if (!p || !(p.confronto.totali.costi.previsto > 0)) return null;
  return { margineStima: p.confronto.totali.margine.stima, capitaleMassimo: p.capitale.massimoStima };
}

export function numeriChiave(
  modello: ModelloGenerale,
  t: Pick<TotaliGenerale, "base" | "margine" | "daIncassare" | "daAssegnare">,
  piano: PianoPerNumeri | null,
  extra: { costiComuni: number; aSal: number | null },
): NumeroChiave[] {
  const margine = piano ? piano.margineStima : t.margine === null ? null : t.margine - extra.costiComuni;
  const quarto: NumeroChiave = modello === "appalto"
    ? (extra.aSal !== null && t.base !== null
      ? { id: "residuo", valore: Math.round((t.base - extra.aSal) * 100) / 100 }
      : { id: "assegnare", valore: t.daAssegnare })
    : (piano ? { id: "capitale", valore: piano.capitaleMassimo } : { id: "assegnare", valore: t.daAssegnare });
  return [
    { id: "valore", valore: t.base },
    { id: "margine", valore: margine },
    { id: "incassare", valore: t.daIncassare },
    quarto,
  ];
}
