/**
 * Il telaio a L e a Z nel disegno.
 *
 * Il telaio a Z ha un'aletta che dall'interno si vede come una cornice attorno al
 * serramento; la sua larghezza dipende dal produttore e dalla posa (28, 30, 35, 40,
 * 60, 65 mm: ogni linea ha le sue). Il telaio a L non ha aletta a vista.
 */
export interface TelaioDisegno {
  tipo: "L" | "Z";
  /** Larghezza dell'aletta a Z, in mm. */
  alettaMm?: number;
}

/** L'aletta che si disegna quando il telaio è a Z ma nessuno ha ancora detto la misura («Da decidere»). */
export const ALETTA_DI_SERIE_MM = 35;

/**
 * «Telaio a L», «Telaio a Z 35», «Z 60», «Telaio a Z da 4 cm», «Aletta 35 mm Salamander»: il tipo e la
 * larghezza dell'aletta, se c'è. Una voce che parla di aletta è un telaio a Z anche se non dice «Z»: nei
 * listini la misura sta nelle voci del valore «Telaio a Z».
 */
export function telaioDaEtichetta(etichetta: string | null | undefined): TelaioDisegno | null {
  if (!etichetta) return null;
  const k = etichetta.toLowerCase();
  if (/(^|[^a-z])z([^a-z]|$)/.test(k) || /\baletta\b/.test(k)) {
    // Meglio il numero con l'unità («35 mm»): il primo numero può essere la serie del profilo («Salamander 76»).
    const m = /(\d+(?:[.,]\d+)?)\s*(cm|mm)\b/.exec(k) ?? /(\d+(?:[.,]\d+)?)\s*()/.exec(k);
    if (!m) return { tipo: "Z" };
    const n = parseFloat(m[1].replace(",", "."));
    const mm = m[2] === "cm" ? n * 10 : n;
    return { tipo: "Z", alettaMm: mm >= 10 && mm <= 120 ? Math.round(mm) : undefined };
  }
  if (/(^|[^a-z])l([^a-z]|$)/.test(k)) return { tipo: "L" };
  return null;
}
