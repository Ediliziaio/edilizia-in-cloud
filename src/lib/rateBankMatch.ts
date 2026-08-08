// ============================================================================
// rateBankMatch — match euristico rate di commessa non pagate ↔ accrediti banca
// ============================================================================
// Gemello lato ENTRATE di costiBankMatch: per ogni rata non incassata propone
// il bonifico in entrata piu' plausibile. Solo proposta client-side: la
// scrittura (rata pagata a data banca + Prima Nota con bank_transaction_id)
// la fa il dialog, mai questo modulo.
// Punteggio: importo esatto > ~1% + vicinanza alla data prevista + cliente
// citato nella descrizione. Un movimento chiude UNA sola rata (greedy).
// Le rate sono gia' importi LORDI (nascono dal totale ivato della commessa).
// ============================================================================

import { differenceInCalendarDays, parseISO } from "date-fns";

export interface RataDaIncassare {
  id: string;
  label: string;
  /** Importo MOSTRATO (per il saldo e' quello calcolato, non il campo DB). */
  amount: number;
  expected_date?: string | null;
}

export interface CreditTxLite {
  id: string;
  booking_date: string;         // yyyy-MM-dd
  amount: number;               // positivo per gli accrediti
  description?: string | null;
  debtor_name?: string | null;  // chi ha pagato (per gli accrediti)
}

export interface RataBankMatch {
  rata: RataDaIncassare;
  tx: CreditTxLite;
  score: number;                // 0-100
  strength: "forte" | "possibile";
}

const STRONG_THRESHOLD = 70;
const MIN_THRESHOLD = 45;
// Un acconto puo' arrivare in anticipo sulla data prevista, un saldo in ritardo.
const DAYS_BEFORE_EXPECTED = 60;
const DAYS_AFTER_EXPECTED = 120;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-zà-ù0-9 ]/gi, " ").replace(/\s+/g, " ").trim();
}

/** true se un token significativo (≥4 char) del cliente compare nel testo del movimento */
function clientMentioned(clienteNome: string | null | undefined, tx: CreditTxLite): boolean {
  const cliente = normalize(clienteNome ?? "");
  if (!cliente) return false;
  const hay = normalize(`${tx.description ?? ""} ${tx.debtor_name ?? ""}`);
  if (!hay) return false;
  const stop = new Set(["srl", "spa", "snc", "sas", "srls", "societa", "italia"]);
  return cliente
    .split(" ")
    .filter((t) => t.length >= 4 && !stop.has(t))
    .some((t) => hay.includes(t));
}

export function matchRateToBankTransactions(
  rate: RataDaIncassare[],
  transactions: CreditTxLite[],
  clienteNome?: string | null,
): RataBankMatch[] {
  const credits = transactions.filter((t) => (Number(t.amount) || 0) > 0 && t.booking_date);
  const candidates: RataBankMatch[] = [];

  for (const rata of rate) {
    if (!(rata.amount > 0)) continue;

    for (const tx of credits) {
      const txDate = parseISO(tx.booking_date);
      if (Number.isNaN(txDate.getTime())) continue;

      // Vicinanza alla data prevista. Molte rate non ce l'hanno: in quel caso
      // niente punti data e niente finestra — decidono importo e cliente.
      let datePts = 0;
      if (rata.expected_date) {
        const expected = parseISO(rata.expected_date);
        if (!Number.isNaN(expected.getTime())) {
          const dist = differenceInCalendarDays(txDate, expected);
          if (dist < -DAYS_BEFORE_EXPECTED || dist > DAYS_AFTER_EXPECTED) continue;
          datePts = Math.max(0, 30 - Math.floor(Math.abs(dist) / 4));
        }
      }

      const txAmt = Number(tx.amount) || 0;
      let amountPts: number;
      if (Math.abs(txAmt - rata.amount) <= 0.01) amountPts = 50;
      else if (Math.abs(txAmt - rata.amount) <= Math.max(1, rata.amount * 0.01)) amountPts = 28;
      else continue;

      const clientPts = clientMentioned(clienteNome, tx) ? 20 : 0;
      const score = amountPts + datePts + clientPts;
      if (score < MIN_THRESHOLD) continue;

      candidates.push({
        rata,
        tx,
        score,
        strength: score >= STRONG_THRESHOLD ? "forte" : "possibile",
      });
    }
  }

  // Greedy: punteggio decrescente, ogni rata e ogni movimento al massimo una volta
  candidates.sort((a, b) => b.score - a.score);
  const usedRate = new Set<string>();
  const usedTxs = new Set<string>();
  const result: RataBankMatch[] = [];
  for (const c of candidates) {
    if (usedRate.has(c.rata.id) || usedTxs.has(c.tx.id)) continue;
    usedRate.add(c.rata.id);
    usedTxs.add(c.tx.id);
    result.push(c);
  }
  return result;
}
