/**
 * Stato effettivo di pagamento di un'azienda (SuperAdmin).
 *
 * NB: la colonna `companies.payment_method` è TEXT senza enum DB, quindi
 * accetta qualsiasi stringa. Il valore `"comped"` rappresenta aziende regalate
 * (demo, referral, early-adopter, accordi speciali) — non vanno contate in MRR.
 *
 * Stati derivati:
 *   - paying       → azienda attiva + metodo di pagamento valido
 *   - trial        → in trial (non sta ancora pagando)
 *   - comped       → regalata / non pagante per policy
 *   - suspended    → sospesa (perdita MRR, non conteggiare)
 *   - unconfigured → attiva ma senza metodo di pagamento (stato incompleto)
 *   - cancelled    → cancellata
 *   - expired      → trial scaduto senza upgrade
 */

export type PaymentMethod =
  | "none"
  | "stripe"
  | "bank_transfer"
  | "sepa_debit"
  | "comped"
  | "other";

export type EffectivePaymentStatus =
  | "paying"
  | "trial"
  | "comped"
  | "suspended"
  | "unconfigured"
  | "cancelled"
  | "expired";

/** Metadata UI per lo stato (label, icona concettuale, semantica colore). */
export const PAYMENT_STATUS_META: Record<
  EffectivePaymentStatus,
  {
    label: string;
    shortLabel: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    /** classes Tailwind per badge custom (override variant quando serve un tint specifico). */
    className: string;
    description: string;
  }
> = {
  paying: {
    label: "Pagante",
    shortLabel: "PAGANTE",
    variant: "default",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300",
    description: "Abbonamento attivo con metodo di pagamento valido",
  },
  trial: {
    label: "In prova",
    shortLabel: "TRIAL",
    variant: "outline",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-300",
    description: "Periodo di prova in corso — non pagante",
  },
  comped: {
    label: "Regalata",
    shortLabel: "REGALATA",
    variant: "outline",
    className:
      "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border-violet-300",
    description:
      "Accesso gratuito concesso (demo, partner, early adopter) — esclusa dal MRR",
  },
  suspended: {
    label: "Sospesa",
    shortLabel: "SOSPESA",
    variant: "destructive",
    className:
      "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-300",
    description: "Accesso sospeso — MRR in pausa",
  },
  unconfigured: {
    label: "Metodo mancante",
    shortLabel: "NON CONFIG.",
    variant: "outline",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-300",
    description:
      "Azienda attiva ma senza metodo di pagamento configurato — MRR a rischio",
  },
  cancelled: {
    label: "Cancellata",
    shortLabel: "CANCELLATA",
    variant: "secondary",
    className: "bg-muted text-muted-foreground",
    description: "Cliente cancellato",
  },
  expired: {
    label: "Trial scaduto",
    shortLabel: "SCADUTA",
    variant: "secondary",
    className:
      "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300",
    description: "Periodo di prova scaduto senza upgrade",
  },
};

export interface CompanyPaymentShape {
  status?: string | null;
  payment_method?: string | null;
  trial_ends_at?: string | null;
  stripe_subscription_status?: string | null;
}

/**
 * Calcola lo stato di pagamento effettivo.
 *
 * Precedenza:
 *   1. Se payment_method === "comped" → sempre COMPED, anche se trial/active
 *      (policy decide, indipendente da status).
 *   2. Se status terminale (suspended/cancelled/expired) → mappa 1:1.
 *   3. Se status === "trial" → TRIAL.
 *   4. Se status === "active":
 *        - metodo valido (stripe/bank_transfer/sepa_debit/other) → PAYING
 *        - metodo "none"/null → UNCONFIGURED (attivo ma MRR a rischio)
 */
export function getEffectivePaymentStatus(
  company: CompanyPaymentShape | null | undefined,
): EffectivePaymentStatus {
  if (!company) return "unconfigured";
  const method = (company.payment_method ?? "none") as PaymentMethod;
  const status = (company.status ?? "trial").toLowerCase();

  // 1) Policy override: comped
  if (method === "comped") return "comped";

  // 2) Stati terminali
  if (status === "suspended") return "suspended";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "expired") return "expired";

  // 3) Trial
  if (status === "trial") return "trial";

  // 4) Active
  if (status === "active") {
    if (method === "none" || !method) return "unconfigured";
    return "paying";
  }

  // Fallback difensivo
  return "unconfigured";
}

/** True solo se l'azienda sta effettivamente contribuendo al MRR. */
export function isEffectivelyPaying(
  company: CompanyPaymentShape | null | undefined,
): boolean {
  return getEffectivePaymentStatus(company) === "paying";
}

/**
 * MRR da contabilizzare per l'azienda.
 * Ritorna il prezzo del piano se paying, 0 altrimenti.
 * Il "prezzo di listino" rimane visibile come informazione aggiuntiva in UI.
 */
export function getEffectiveMRR(
  company: CompanyPaymentShape | null | undefined,
  planMonthlyPrice: number | null | undefined,
): number {
  return isEffectivelyPaying(company) ? (planMonthlyPrice ?? 0) : 0;
}
