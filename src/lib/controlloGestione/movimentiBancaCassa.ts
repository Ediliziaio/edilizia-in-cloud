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
 * Importo, verso e data vicina segnalano una possibile doppia registrazione.
 * Il rendiconto conserva entrambi i movimenti fino a quando esiste un legame verificato.
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

  // 2. Le somiglianze si segnalano. Solo un collegamento già accertato evita il doppio conteggio.
  const liberi = registrati.filter((r) => !r.bankTransactionId && !/^cassa(?:\b|$)/i.test(r.accountLabel?.trim() ?? ""));
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
        (!r.supplierName || !b.controparte ||
          r.supplierName.trim().toLocaleLowerCase("it-IT") === b.controparte.trim().toLocaleLowerCase("it-IT")) &&
        (r.direction === "entrata") === entrata &&
        Math.round(Number(r.amount) * 100) === assoluto &&
        giorni(r.entry_date, b.data) <= GIORNI_GEMELLO,
    );
    if (gemello) {
      usati.add(gemello.id);
      forseDoppi.numero++;
      forseDoppi.cents += b.cents;
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

/**
 * Un pagamento o un incasso arrivato in banca IN ANTICIPO (15/11/2026): il
 * movimento entra nel consuntivo, ma la scadenza che lo prevedeva resta
 * aperta finché nessuno lo collega, e il previsto lo conta una seconda volta.
 *
 * Un previsto è «forse già in banca» se c'è un movimento di banca non ancora
 * in prima nota, degli ultimi 45 giorni, con:
 *  - stesso verso e stesso importo al centesimo;
 *  - la data del previsto tra 30 giorni prima e 20 giorni dopo il movimento;
 *  - la stessa controparte (una parola di almeno 4 lettere in comune) quando
 *    le hanno entrambi; senza controparte, la finestra è di 10 giorni.
 * Ogni movimento vale per un previsto solo, il più vicino di data. Le voci
 * inserite a mano nel cash flow non si toccano: sono una scelta di chi le ha scritte.
 * L'affitto del mese dopo (30 giorni più in là) non è mai preso per pagato.
 */
export interface PrevistoGiaInBanca {
  previsto: { id: string; descrizione: string; data: string; cents: number };
  banca: { id: string; data: string; descrizione: string | null; controparte: string | null };
}

const parole = (s: string | null | undefined) =>
  new Set(
    (s ?? "")
      .toLocaleLowerCase("it-IT")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length >= 4 && !["s.r.l", "spa", "srls", "snc", "sas"].includes(p)),
  );

export function previstiGiaInBanca<T extends { id: string; direction: "in" | "out"; cents: number; date: string | null; description: string; counterparty: string }>(
  previsti: T[],
  banca: MovimentoBancaCassa[],
  today: string,
): { restano: T[]; coppie: PrevistoGiaInBanca[] } {
  const da = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / 86_400_000;
  const candidati = banca.filter((b) => !b.in_prima_nota && b.cents !== 0 && b.data <= today && da(today, b.data) <= 45);
  const usati = new Set<string>();
  const tolti = new Set<string>();
  const coppie: PrevistoGiaInBanca[] = [];
  // Prima i movimenti di banca più vecchi: ognuno prende il previsto più vicino.
  for (const b of [...candidati].sort((x, y) => x.data.localeCompare(y.data) || x.id.localeCompare(y.id))) {
    const verso = b.cents > 0 ? "in" : "out";
    const nomiBanca = parole(b.controparte);
    let migliore: { p: T; distanza: number } | null = null;
    for (const p of previsti) {
      if (tolti.has(p.id) || !p.date || p.id.startsWith("manuale:") || p.direction !== verso || p.cents !== Math.abs(b.cents)) continue;
      const giorni = da(p.date, b.data);
      const nomiPrevisto = parole(p.counterparty);
      const entrambi = nomiBanca.size > 0 && nomiPrevisto.size > 0;
      if (entrambi && ![...nomiPrevisto].some((x) => nomiBanca.has(x))) continue;
      const [min, max] = entrambi ? [-30, 20] : [-10, 10];
      if (giorni < min || giorni > max) continue;
      if (!migliore || Math.abs(giorni) < migliore.distanza) migliore = { p, distanza: Math.abs(giorni) };
    }
    if (!migliore || usati.has(b.id)) continue;
    usati.add(b.id);
    tolti.add(migliore.p.id);
    coppie.push({
      previsto: { id: migliore.p.id, descrizione: migliore.p.description, data: migliore.p.date!, cents: verso === "in" ? migliore.p.cents : -migliore.p.cents },
      banca: { id: b.id, data: b.data, descrizione: b.descrizione, controparte: b.controparte },
    });
  }
  return { restano: previsti.filter((p) => !tolti.has(p.id)), coppie };
}
