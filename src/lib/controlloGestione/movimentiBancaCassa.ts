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
 *
 * Un movimento RIPARTITO (15/11/2026: 1.000 € al fornitore, 700 di materiali e
 * 300 di trasporto) va in tante righe quante sono le quote. La scrittura di
 * prima nota collegata si divide nella stessa proporzione; l'eventuale
 * centesimo di arrotondamento va alla quota più grande, così il totale resta
 * quello di prima.
 */
import type { MovimentoRegistrato } from "./rendicontoCassa";
import type { VoceCassa } from "./vociCassa";

export interface QuotaBancaCassa {
  id: string;
  nome: string;
  codice: string;
  in: VoceCassa | null;
  out: VoceCassa | null;
  cents: number;
}

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
  /** Le quote, se il movimento è ripartito su più voci (somma = |cents|). */
  quote?: QuotaBancaCassa[] | null;
}

/**
 * Divide `totale` centesimi nella proporzione delle quote. Interi, somma
 * esatta: il resto dell'arrotondamento va alla quota più grande.
 */
export function dividiNelleQuote(totale: number, quote: { cents: number }[]): number[] {
  const base = quote.reduce((s, q) => s + Math.abs(q.cents), 0);
  if (!base) return quote.map(() => 0);
  const parti = quote.map((q) => Math.floor((totale * Math.abs(q.cents)) / base));
  let resto = totale - parti.reduce((s, x) => s + x, 0);
  const ordine = quote.map((q, i) => i).sort((a, b) => Math.abs(quote[b].cents) - Math.abs(quote[a].cents));
  for (let k = 0; resto > 0; k = (k + 1) % ordine.length, resto--) parti[ordine[k]]++;
  return parti;
}

const ripartito = (b: MovimentoBancaCassa | undefined): b is MovimentoBancaCassa & { quote: QuotaBancaCassa[] } =>
  !!b?.voce && Array.isArray(b.quote) && b.quote.length > 1;

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
  //    Se il movimento è ripartito, la scrittura si divide nelle sue quote.
  const out: MovimentoRegistrato[] = registrati.flatMap((r) => {
    const b = r.bankTransactionId ? perTx.get(r.bankTransactionId) : undefined;
    const entrata = r.direction === "entrata";
    if (ripartito(b)) {
      const parti = dividiNelleQuote(Math.round(Math.abs(Number(r.amount)) * 100), b.quote);
      return b.quote.map((q, i) => ({
        ...r,
        id: `${r.id}#${i}`,
        amount: (Math.sign(Number(r.amount)) || 1) * parti[i] / 100,
        voceCassa: (entrata ? q.in : q.out) ?? null,
        voceNome: q.nome,
        codiceCassa: q.codice,
      }));
    }
    const riga = b ? rigaDellaVoce(b.voce, entrata) : null;
    if (riga) return [{ ...r, voceCassa: riga, voceNome: b!.voce!.nome, codiceCassa: b!.voce!.codice }];
    return b?.voce ? [{ ...r, codiceCassa: b.voce.codice }] : [r];
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
    const riga: MovimentoRegistrato = {
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
      codiceCassa: b.voce?.codice ?? null,
    };
    if (ripartito(b)) {
      const parti = dividiNelleQuote(assoluto, b.quote);
      b.quote.forEach((q, i) =>
        out.push({ ...riga, id: `banca:${b.id}#${i}`, amount: parti[i] / 100, voceCassa: (entrata ? q.in : q.out) ?? null, voceNome: q.nome, codiceCassa: q.codice }),
      );
    } else out.push(riga);
  }
  return { registrati: out, forseDoppi, daBanca };
}
