/**
 * I movimenti di banca nel rendiconto di cassa (14/11/2026).
 *
 * Il consuntivo legge la prima nota. Due cose mancavano:
 *  1. un movimento di banca non ancora registrato in prima nota non c'era: in
 *     Demo Azienda 2 erano 27 movimenti per ~101.000 €. Soldi veri, già nel
 *     saldo del conto, fuori dal cash flow. Adesso entrano: con la loro
 *     categoria se ce l'hanno, altrimenti in «Da classificare».
 *  2. la categoria scelta sul movimento non arrivava: il rendiconto leggeva il
 *     testo copiato nella prima nota al momento dell'import. Adesso, se il
 *     movimento ha una categoria CONFERMATA, vale quella.
 *
 * Un movimento senza prima nota collegata può però avere una scrittura gemella
 * fatta a mano e mai collegata (stessi soldi, stesso giorno o quasi): contarli
 * entrambi raddoppierebbe l'importo. Se c'è una scrittura non collegata con lo
 * stesso verso e lo stesso importo entro 5 giorni, il movimento di banca resta
 * fuori e si conta tra i «forse doppi»: il saldo resta quello della prima nota.
 */
import type { MovimentoRegistrato } from "./rendicontoCassa";
import type { VoceCassa } from "./vociCassa";

export interface MovimentoBancaCassa {
  id: string;
  data: string;
  /** Con segno: incasso +, uscita −. */
  cents: number;
  categoria: string | null;
  descrizione: string | null;
  controparte: string | null;
  in_prima_nota: boolean;
  voce: { id: string; nome: string; codice: string; in: VoceCassa | null; out: VoceCassa | null; origine: string | null } | null;
}

const GIORNI_GEMELLO = 5;
const giorni = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/** La riga del rendiconto che la voce indica per quel verso. */
export function rigaDellaVoce(voce: MovimentoBancaCassa["voce"], entrata: boolean): VoceCassa | null {
  if (!voce) return null;
  return (entrata ? voce.in : voce.out) ?? null;
}

export function uniscMovimentiBanca(
  registrati: MovimentoRegistrato[],
  banca: MovimentoBancaCassa[],
): { registrati: MovimentoRegistrato[]; forseDoppi: { numero: number; cents: number }; daBanca: number } {
  const perTx = new Map(banca.map((b) => [b.id, b]));
  // 1. La categoria confermata del movimento vince sul testo della prima nota.
  const out: MovimentoRegistrato[] = registrati.map((r) => {
    const b = r.bankTransactionId ? perTx.get(r.bankTransactionId) : undefined;
    const riga = b ? rigaDellaVoce(b.voce, r.direction === "entrata") : null;
    return riga ? { ...r, voceCassa: riga, voceNome: b!.voce!.nome } : r;
  });

  // 2. I movimenti senza prima nota, tranne quelli che hanno una scrittura gemella non collegata.
  const liberi = registrati.filter((r) => !r.bankTransactionId);
  const usati = new Set<string>();
  const forseDoppi = { numero: 0, cents: 0 };
  let daBanca = 0;
  for (const b of banca) {
    if (b.in_prima_nota || !Number.isFinite(b.cents) || b.cents === 0 || !b.data) continue;
    const entrata = b.cents > 0;
    const assoluto = Math.abs(b.cents);
    const gemello = liberi.find(
      (r) =>
        !usati.has(r.id) &&
        (r.direction === "entrata") === entrata &&
        Math.round(Number(r.amount) * 100) === assoluto &&
        giorni(r.entry_date, b.data) <= GIORNI_GEMELLO,
    );
    if (gemello) {
      usati.add(gemello.id);
      forseDoppi.numero++;
      forseDoppi.cents += b.cents;
      continue;
    }
    daBanca++;
    out.push({
      id: `banca:${b.id}`,
      direction: entrata ? "entrata" : "uscita",
      amount: assoluto / 100,
      entry_date: b.data,
      category: b.categoria,
      description: b.descrizione,
      supplierName: b.controparte,
      bankTransactionId: b.id,
      fonteBanca: true,
      voceCassa: rigaDellaVoce(b.voce, entrata),
      voceNome: b.voce?.nome ?? null,
    });
  }
  return { registrati: out, forseDoppi, daBanca };
}
