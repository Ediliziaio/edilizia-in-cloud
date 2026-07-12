// ============================================================================
// costiBankMatch — match euristico costi non pagati ↔ movimenti bancari
// ============================================================================
// Ponte "pagamenti scaduti ↔ banca": propone per ogni costo non pagato il
// movimento bancario in uscita più plausibile, così l'utente li chiude in un
// click invece di ricopiare date a mano. Solo proposta client-side: la
// scrittura passa dalle mutation esistenti (che generano anche Prima Nota).
// Punteggio: importo (lordo esatto > netto esatto > ~1%) + vicinanza data +
// fornitore citato nella descrizione. Un movimento chiude UN solo costo
// (assegnazione greedy per punteggio decrescente).
// ============================================================================

import { differenceInCalendarDays, parseISO } from "date-fns";
import type { UnifiedCost } from "@/lib/costsUtils";

export interface BankTxLite {
  id: string;
  booking_date: string;         // yyyy-MM-dd
  amount: number;               // negativo per gli addebiti
  description?: string | null;
  creditor_name?: string | null;
}

export interface CostBankMatch {
  cost: UnifiedCost;
  tx: BankTxLite;
  score: number;                // 0-100
  strength: "forte" | "possibile";
  amountKind: "lordo" | "netto" | "vicino";
}

const STRONG_THRESHOLD = 70;
const MIN_THRESHOLD = 45;
// Finestra temporale: un pagamento può precedere la scadenza o arrivare in ritardo
const DAYS_BEFORE_DUE = 45;
const DAYS_AFTER_DUE = 120;

function gross(cost: UnifiedCost): number {
  const net = Number(cost.amount) || 0;
  const vat = Number(cost.vat_rate ?? 0);
  return Math.round(net * (1 + vat / 100) * 100) / 100;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-zà-ù0-9 ]/gi, " ").replace(/\s+/g, " ").trim();
}

/** true se un token significativo (≥4 char) del fornitore compare nel testo del movimento */
function supplierMentioned(cost: UnifiedCost, tx: BankTxLite): boolean {
  const supplier = normalize(cost.supplierName ?? "");
  if (!supplier) return false;
  const hay = normalize(`${tx.description ?? ""} ${tx.creditor_name ?? ""}`);
  if (!hay) return false;
  const stop = new Set(["srl", "spa", "snc", "sas", "srls", "societa", "italia"]);
  return supplier
    .split(" ")
    .filter((t) => t.length >= 4 && !stop.has(t))
    .some((t) => hay.includes(t));
}

function amountScore(cost: UnifiedCost, txAbs: number): { pts: number; kind: CostBankMatch["amountKind"] } | null {
  const lordo = gross(cost);
  const netto = Number(cost.amount) || 0;
  const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, a * 0.01);
  if (Math.abs(txAbs - lordo) <= 0.01) return { pts: 50, kind: "lordo" };
  if (Math.abs(txAbs - netto) <= 0.01) return { pts: 40, kind: "netto" };
  if (close(lordo, txAbs) || close(netto, txAbs)) return { pts: 28, kind: "vicino" };
  return null;
}

export function matchCostsToBankTransactions(
  costs: UnifiedCost[],
  transactions: BankTxLite[],
): CostBankMatch[] {
  const debits = transactions.filter((t) => (Number(t.amount) || 0) < 0 && t.booking_date);
  const candidates: CostBankMatch[] = [];

  for (const cost of costs) {
    if (cost.is_paid) continue;
    if (!cost.due_date || cost.due_date === "9999-12-31") continue;
    const due = parseISO(cost.due_date);
    if (Number.isNaN(due.getTime())) continue;

    for (const tx of debits) {
      const txDate = parseISO(tx.booking_date);
      if (Number.isNaN(txDate.getTime())) continue;
      const dist = differenceInCalendarDays(txDate, due);
      if (dist < -DAYS_BEFORE_DUE || dist > DAYS_AFTER_DUE) continue;

      const amt = amountScore(cost, Math.abs(Number(tx.amount) || 0));
      if (!amt) continue;

      // Vicinanza data: 30 punti a distanza 0, decrescono di 1 ogni 4 giorni
      const datePts = Math.max(0, 30 - Math.floor(Math.abs(dist) / 4));
      const supplierPts = supplierMentioned(cost, tx) ? 20 : 0;
      const score = amt.pts + datePts + supplierPts;
      if (score < MIN_THRESHOLD) continue;

      candidates.push({
        cost,
        tx,
        score,
        strength: score >= STRONG_THRESHOLD ? "forte" : "possibile",
        amountKind: amt.kind,
      });
    }
  }

  // Greedy: punteggio decrescente, ogni costo e ogni movimento al massimo una volta
  candidates.sort((a, b) => b.score - a.score);
  const usedCosts = new Set<string>();
  const usedTxs = new Set<string>();
  const result: CostBankMatch[] = [];
  for (const c of candidates) {
    if (usedCosts.has(c.cost.id) || usedTxs.has(c.tx.id)) continue;
    usedCosts.add(c.cost.id);
    usedTxs.add(c.tx.id);
    result.push(c);
  }
  return result;
}
