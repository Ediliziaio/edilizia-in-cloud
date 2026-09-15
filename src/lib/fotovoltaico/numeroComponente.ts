/**
 * Lettura dei numeri digitati in "Componenti FV" (prezzo di vendita, potenza,
 * capacità).
 *
 * Prima la schermata faceva `Number(testo.replace(",", "."))`: sostituiva solo
 * la PRIMA virgola e non conosceva il punto delle migliaia. "1.200,50"
 * diventava "1.200.50", cioè NaN, e il salvataggio metteva 0 senza dire
 * niente — un pannello da 1.200 € finiva nel preventivatore a zero.
 *
 * Qui si riusa la regola dei separatori già condivisa dal resto dell'app
 * (`normalizeDecimalSeparators`) e si distinguono i tre casi che la
 * schermata deve trattare in modo diverso.
 */
import { normalizeDecimalSeparators } from "@/lib/parseDecimalIT";

/**
 * - `undefined` → campo vuoto (nessun valore inserito)
 * - `null`      → c'è scritto qualcosa ma non è un numero valido (o è negativo)
 * - numero      → il valore letto
 */
export function leggiNumeroComponente(raw: string | null | undefined): number | null | undefined {
  const testo = (raw ?? "").trim();
  if (testo === "") return undefined;

  const pulito = testo.replace(/[\s€$£]|EUR/gi, "");
  if (!/\d/.test(pulito)) return null;
  // Un prezzo o una potenza negativi non hanno senso: meglio fermarsi che salvarli.
  if (pulito.startsWith("-")) return null;

  const valore = Number(normalizeDecimalSeparators(pulito));
  return Number.isFinite(valore) ? valore : null;
}
