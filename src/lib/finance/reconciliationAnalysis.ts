/**
 * reconciliationAnalysis — logica pura della riconciliazione bancaria.
 *
 * Estratto da BankReconciliation.tsx per renderlo testabile senza React/Supabase.
 * Tutto in sola lettura: nessun movimento di denaro, nessuna scrittura.
 * Copre: scoring di match transazione↔fattura e rilevamento anomalie/segnali
 * (fatture scadute, accrediti senza fattura, match ambigui, possibili duplicati).
 */

import { AlertTriangle, CalendarClock, Copy, HelpCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const fmtEur = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);

export interface MatchSuggestion {
  invoice: any;
  score: number;
  reasons: string[];
}

/** Fuzzy name matching: confronta nomi normalizzati (alfanumerici, lowercase). */
export function fuzzyMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const na = normalize(a);
  const nb = normalize(b);
  return na.includes(nb) || nb.includes(na);
}

/**
 * Calcola un punteggio di compatibilità tra una transazione bancaria e una
 * fattura aperta. Restituisce null sotto la soglia minima (score < 50).
 * Pesi: importo esatto +50 / simile +35, IBAN +30, nome +20.
 */
export function computeMatchScore(tx: any, inv: any): MatchSuggestion | null {
  let score = 0;
  const reasons: string[] = [];
  const txAmount = Math.abs(tx.amount);
  const invTotal = Number(inv.total || 0) - Number(inv.paid_amount || 0);

  // Amount match (within 1% or €5)
  const diff = Math.abs(txAmount - invTotal);
  const tolerance = Math.max(invTotal * 0.01, 5);
  if (diff === 0) {
    score += 50;
    reasons.push("Importo esatto");
  } else if (diff <= tolerance) {
    score += 35;
    reasons.push(`Importo simile (diff. ${fmtEur(diff)})`);
  }

  // IBAN match
  if (tx.creditor_iban && inv.bank_iban) {
    const txIban = tx.creditor_iban.replace(/\s/g, "").toUpperCase();
    const invIban = inv.bank_iban.replace(/\s/g, "").toUpperCase();
    if (txIban === invIban) {
      score += 30;
      reasons.push("IBAN corrispondente");
    }
  }
  if (tx.debtor_iban && inv.bank_iban) {
    const txIban = tx.debtor_iban.replace(/\s/g, "").toUpperCase();
    const invIban = inv.bank_iban.replace(/\s/g, "").toUpperCase();
    if (txIban === invIban) {
      score += 30;
      reasons.push("IBAN corrispondente");
    }
  }

  // Name match
  const txName = tx.creditor_name || tx.debtor_name || tx.description || "";
  const invName = inv.client_company_name || "";
  if (fuzzyMatch(txName, invName)) {
    score += 20;
    reasons.push("Nome cliente simile");
  }

  if (score < 50) return null;
  return { invoice: inv, score, reasons };
}

/** Soglia minima di punteggio per un auto-match (riconciliazione automatica). */
export const AUTO_MATCH_MIN_SCORE = 80;
/** Distacco minimo sul 2° candidato per considerare il match NON ambiguo. */
export const AUTO_MATCH_AMBIGUITY_MARGIN = 15;

/**
 * Sceglie l'unico match forte e NON ambiguo per una transazione, pensato per
 * l'auto-riconciliazione (che muove denaro: aggiorna paid_amount/status della
 * fattura). Ritorna null se nessun candidato raggiunge la soglia, oppure se il
 * secondo candidato è troppo vicino al primo: in quel caso il match è ambiguo e
 * deve deciderlo l'utente, per evitare di agganciare un incasso alla fattura
 * sbagliata.
 */
export function pickAutoMatch(tx: any, invoices: any[]): MatchSuggestion | null {
  const ranked = invoices
    .map((inv) => computeMatchScore(tx, inv))
    .filter((m): m is MatchSuggestion => m !== null && m.score >= AUTO_MATCH_MIN_SCORE)
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return null;
  const [top, second] = ranked;
  if (second && top.score - second.score < AUTO_MATCH_AMBIGUITY_MARGIN) return null;
  return top;
}

export type ReconSeverity = "critical" | "warning" | "info";

export interface ReconAnomaly {
  id: string;
  severity: ReconSeverity;
  icon: LucideIcon;
  title: string;
  detail: string;
  /** Quale lista filtrare al click */
  target: "tx" | "inv";
  /** ID degli elementi coinvolti (transazioni o fatture) */
  ids: string[];
}

const normName = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Rileva anomalie e segnali sui dati bancari (sola lettura, nessun movimento):
 * fatture scadute non incassate, accrediti senza fattura corrispondente,
 * match ambigui (più candidati forti) e possibili pagamenti duplicati.
 */
export function detectReconAnomalies(transactions: any[], invoices: any[]): ReconAnomaly[] {
  const out: ReconAnomaly[] = [];
  if (transactions.length === 0 && invoices.length === 0) return out;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Fatture scadute non ancora incassate
  const overdue = invoices.filter((i) => {
    const rem = Number(i.total || 0) - Number(i.paid_amount || 0);
    if (rem <= 0) return false;
    if (i.status === "overdue") return true;
    return i.due_date ? new Date(i.due_date) < today : false;
  });
  if (overdue.length) {
    const amt = overdue.reduce(
      (s, i) => s + (Number(i.total || 0) - Number(i.paid_amount || 0)),
      0,
    );
    out.push({
      id: "overdue",
      severity: "warning",
      icon: CalendarClock,
      target: "inv",
      ids: overdue.map((i) => i.id),
      title: `${overdue.length} fatture scadute non incassate`,
      detail: `${fmtEur(amt)} oltre la data di scadenza. Verifica incassi non registrati o sollecita il cliente.`,
    });
  }

  // 2. Accrediti senza fattura corrispondente + 3. match ambiguo (singola passata)
  const noMatchIds: string[] = [];
  let noMatchAmt = 0;
  const ambiguousIds: string[] = [];
  for (const tx of transactions) {
    let hasMatch = false;
    let strong = 0;
    for (const inv of invoices) {
      const m = computeMatchScore(tx, inv);
      if (m) {
        hasMatch = true;
        if (m.score >= 70) strong++;
      }
    }
    if (!hasMatch) {
      noMatchIds.push(tx.id);
      noMatchAmt += Math.abs(tx.amount);
    }
    if (strong >= 2) ambiguousIds.push(tx.id);
  }
  if (noMatchIds.length) {
    out.push({
      id: "nomatch",
      severity: "info",
      icon: HelpCircle,
      target: "tx",
      ids: noMatchIds,
      title: `${noMatchIds.length} incassi senza fattura corrispondente`,
      detail: `${fmtEur(noMatchAmt)} di accrediti non agganciabili a nessuna fattura aperta: potrebbe mancare la fattura o essere un incasso extra.`,
    });
  }
  if (ambiguousIds.length) {
    out.push({
      id: "ambiguous",
      severity: "warning",
      icon: AlertTriangle,
      target: "tx",
      ids: ambiguousIds,
      title: `${ambiguousIds.length} transazioni con match ambiguo`,
      detail: `Più fatture risultano compatibili: verifica manualmente prima di riconciliare per evitare abbinamenti errati.`,
    });
  }

  // 4. Possibili pagamenti duplicati (stesso importo + intestatario entro 7 giorni)
  const groups = new Map<string, { id: string; t: number }[]>();
  for (const tx of transactions) {
    const name = normName(tx.creditor_name || tx.debtor_name || "");
    if (!name) continue; // serve un intestatario per valutare il duplicato
    const key = `${Math.round(Math.abs(tx.amount) * 100)}|${name}`;
    const t = tx.booking_date ? new Date(tx.booking_date).getTime() : NaN;
    const entry = { id: tx.id as string, t };
    const arr = groups.get(key);
    if (arr) arr.push(entry);
    else groups.set(key, [entry]);
  }
  const dupIds: string[] = [];
  let dupGroups = 0;
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    const valid = arr.filter((e) => !Number.isNaN(e.t)).sort((a, b) => a.t - b.t);
    if (valid.length >= 2 && valid[valid.length - 1].t - valid[0].t <= 7 * 86400000) {
      dupGroups++;
      for (const e of valid) dupIds.push(e.id);
    }
  }
  if (dupGroups) {
    out.push({
      id: "duplicates",
      severity: "warning",
      icon: Copy,
      target: "tx",
      ids: dupIds,
      title: `${dupGroups} possibili pagamenti duplicati`,
      detail: `Accrediti con stesso importo e stesso intestatario a pochi giorni di distanza: controlla che non siano doppi incassi o importazioni ripetute.`,
    });
  }

  return out;
}
