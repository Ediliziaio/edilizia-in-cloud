import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { safeRedirect } from "@/utils/safeRedirect";
import { readInvokeError } from "@/lib/readInvokeError";
import { queryKeys } from "@/lib/queryKeys";

// ─── TIPI ─────────────────────────────────────────────────────────────────────

export interface SubscriptionInvoice {
  id: string;
  stripeInvoiceId: string;
  /** Importo pagato in CENTESIMI (es. 12700 = €127,00). Convertire con formatEurCents(). */
  amountPaid: number;
  /** Importo dovuto in CENTESIMI. Convertire con formatEurCents(). */
  amountDue: number;
  currency: string;
  status: "draft" | "open" | "paid" | "void" | "uncollectible";
  invoiceUrl: string | null;
  invoicePdf: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface BillingInfo {
  /** id del piano corrente su subscription_plans (per upgrade/downgrade in-app). */
  planId: string | null;
  planName: string;
  planPriceMonthly: number;
  planPriceYearly: number;
  trialEndsAt: string | null;
  status: string;
  dunningStatus: string | null;
  paymentFailureCount: number;
  stripeCustomerId: string | null;
  stripeSubscriptionStatus: string | null;
  /** companies.payment_method: stripe, none, comped, bank_transfer, sepa_debit, other. */
  paymentMethod: string | null;
  isInDunning: boolean;
  dunningDaysLeft: number;
  // v8.6.58 — Date e ciclo di fatturazione (popolate via sync da Stripe webhook
  // su companies.current_period_*). Se vuote = non disponibili (es. piano free).
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  billingCycle: "monthly" | "yearly" | null;
}

// ─── HOOK: INFO PIANO CORRENTE ─────────────────────────────────────────────────

export function useBillingInfo() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: ["billing-info", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<BillingInfo> => {
      const { data: company, error } = await supabase
        .from("companies")
        .select(`
          status,
          trial_ends_at,
          stripe_customer_id,
          stripe_subscription_status,
          payment_method,
          dunning_status,
          dunning_started_at,
          payment_failure_count,
          subscription_plans!companies_subscription_plan_id_fkey (
            id,
            name,
            price_monthly,
            price_yearly
          )
        `)
        .eq("id", companyId!)
        .single();

      if (error) throw error;

      // v8.6.90 — Le date di ciclo/cancellazione vivono in `company_subscriptions`
      // (scritte dal webhook Stripe: checkout, invoice.paid, subscription.updated).
      // Le leggiamo dalla riga attiva più recente. Best-effort: se manca o va in
      // errore, la card mostra comunque il piano senza date (mai blank).
      let sub: {
        current_period_start?: string | null;
        current_period_end?: string | null;
        billing_period?: string | null;
        canceled_at?: string | null;
        status?: string | null;
      } | null = null;
      try {
        const { data: subRow } = await supabase
          .from("company_subscriptions")
          .select("current_period_start, current_period_end, billing_period, canceled_at, status")
          .eq("company_id", companyId!)
          .in("status", ["active", "trialing", "past_due"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        sub = (subRow as typeof sub) ?? null;
      } catch {
        sub = null;
      }

      const plan = company.subscription_plans as { id?: string; name?: string; price_monthly?: number; price_yearly?: number } | null;
      const dunningStatus = company.dunning_status;
      const isInDunning = !!dunningStatus && dunningStatus !== "none";

      // Estimate dunning days left (14 day grace from dunning_started_at)
      let dunningDaysLeft = 0;
      if (isInDunning && company.dunning_started_at) {
        const graceEnd = new Date(company.dunning_started_at);
        graceEnd.setDate(graceEnd.getDate() + 14);
        dunningDaysLeft = Math.max(0, Math.ceil(
          (graceEnd.getTime() - Date.now()) / 86400000
        ));
      }

      return {
        planId: plan?.id ?? null,
        planName: plan?.name ?? "Piano sconosciuto",
        planPriceMonthly: plan?.price_monthly ?? 0,
        planPriceYearly: plan?.price_yearly ?? 0,
        trialEndsAt: company.trial_ends_at ?? null,
        status: company.status ?? "active",
        dunningStatus,
        paymentFailureCount: company.payment_failure_count ?? 0,
        stripeCustomerId: company.stripe_customer_id ?? null,
        stripeSubscriptionStatus: company.stripe_subscription_status ?? null,
        paymentMethod: company.payment_method ?? null,
        isInDunning,
        dunningDaysLeft,
        currentPeriodStart: sub?.current_period_start ?? null,
        currentPeriodEnd: sub?.current_period_end ?? null,
        cancelAtPeriodEnd: !!sub?.canceled_at,
        billingCycle:
          sub?.billing_period === "yearly" || sub?.billing_period === "monthly"
            ? sub.billing_period
            : null,
      };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

// ─── ABBONAMENTO DA ATTIVARE ──────────────────────────────────────────────────
// Chi paga fuori da Stripe (regalata, bonifico, addebito SEPA concordato, altro)
// non deve vedere «Attiva abbonamento»: pagherebbe due volte.
const METODI_FUORI_STRIPE = new Set(["comped", "bank_transfer", "sepa_debit", "other"]);
const ABBONAMENTO_STRIPE_IN_CORSO = new Set(["active", "trialing", "past_due"]);

/** Piano a pagamento assegnato, ma nessun abbonamento Stripe e nessun pagamento concordato a parte. */
export function abbonamentoDaAttivare(billing: BillingInfo | null | undefined): boolean {
  return !!billing?.planId
    && billing.planPriceMonthly > 0
    && !ABBONAMENTO_STRIPE_IN_CORSO.has(billing.stripeSubscriptionStatus ?? "")
    && !METODI_FUORI_STRIPE.has(billing.paymentMethod ?? "none");
}

// ─── HOOK: PREZZO MAX PIANO (per cross-sell dinamico) ─────────────────────────
/**
 * Restituisce il price_monthly massimo tra i piani published, così la card
 * cross-sell "Vuoi più funzionalità?" si mostra dinamicamente sotto questa
 * soglia senza hardcoded €547. Cache aggressiva (1h): cambia raramente.
 */
export function useTopPlanPrice() {
  return useQuery({
    queryKey: ["top-plan-price"],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("price_monthly")
        .order("price_monthly", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return 0;
      return (data?.price_monthly as number | undefined) ?? 0;
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

// ─── HOOK: STORICO FATTURE ─────────────────────────────────────────────────────

export function useInvoices() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: ["invoices", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<SubscriptionInvoice[]> => {
      const { data, error } = await supabase
        .from("subscription_invoices" as never)
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(24);

      if (error) throw error;

      type InvoiceRow = {
        id: string; stripe_invoice_id: string; amount_paid: number; amount_due: number;
        currency: string; status: string; invoice_url: string | null; invoice_pdf: string | null;
        period_start: string | null; period_end: string | null; paid_at: string | null; created_at: string;
      };
      return ((data as InvoiceRow[] | null) ?? []).map((row) => ({
        id: row.id,
        stripeInvoiceId: row.stripe_invoice_id,
        amountPaid: row.amount_paid,
        amountDue: row.amount_due,
        currency: row.currency,
        status: row.status as SubscriptionInvoice["status"],
        invoiceUrl: row.invoice_url,
        invoicePdf: row.invoice_pdf,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        paidAt: row.paid_at,
        createdAt: row.created_at,
      }));
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

// ─── HOOK: METODO DI PAGAMENTO DEFAULT (carta brand/last4/scadenza) ──────────

export interface StripePaymentMethod {
  hasMethod: boolean;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
  funding?: string;
  type?: string;
}

/**
 * Recupera il default payment method del customer Stripe (carta brand + last4
 * + scadenza). Usato dalla card "Metodo di pagamento" nella dashboard.
 *
 * - Resilient: se l'edge function non esiste o errore, ritorna {hasMethod:false}
 * - Cache 5 min: i cambi avvengono via Stripe portal, l'utente torna qui dopo
 */
export function useStripePaymentMethod() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: ["stripe-payment-method", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<StripePaymentMethod> => {
      try {
        const { data, error } = await supabase.functions.invoke("stripe-payment-method");
        if (error) return { hasMethod: false };
        return (data as StripePaymentMethod) ?? { hasMethod: false };
      } catch {
        return { hasMethod: false };
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: false,
  });
}

/**
 * Un 4xx/5xx di supabase.functions.invoke arriva come "Edge Function returned a
 * non-2xx status code": il motivo vero (es. "Stripe non configurato") è nel corpo.
 */
async function messaggioDellaFunzione(error: { message: string; context?: unknown }): Promise<string> {
  try {
    const ctx = error.context;
    if (ctx instanceof Response) {
      const corpo = (await ctx.json().catch(() => null)) as { error?: string } | null;
      if (corpo?.error) return corpo.error;
    }
  } catch { /* corpo illeggibile: resta il messaggio generico */ }
  return error.message;
}

// ─── HOOK: APRIRE IL CUSTOMER PORTAL STRIPE ───────────────────────────────────

/**
 * Opzioni per i deep-link del portale Stripe:
 *  - change_plan → pagina di conferma cambio piano (subscription_update_confirm)
 *  - cancel      → pagina di annullamento (subscription_cancel)
 * Senza opzioni si apre il portale generico (comportamento storico).
 */
export interface BillingPortalFlow {
  flow: "change_plan" | "cancel";
  planId?: string;
  billingPeriod?: "monthly" | "yearly";
}

export function useOpenBillingPortal() {
  return useMutation({
    // `| void` e non `?:` — con TVariables opzionale React Query richiederebbe
    // comunque l'argomento in mutate(); void mantiene validi i mutate() esistenti.
    mutationFn: async (opts: BillingPortalFlow | void) => {
      const { data, error } = await supabase.functions.invoke("customer-portal", {
        body: opts
          ? { flow: opts.flow, plan_id: opts.planId, billing_period: opts.billingPeriod }
          : {},
      });
      if (error) throw new Error(await messaggioDellaFunzione(error));
      return data as { url: string };
    },
    onSuccess: ({ url }) => {
      safeRedirect(url);
    },
    onError: (error: Error) => {
      toast.error("Errore nell'apertura del portale fatturazione", {
        description: error.message,
      });
    },
  });
}

// ─── HOOK: ADD-ON WHATSAPP BUSINESS ───────────────────────────────────────────
// Apre il checkout Stripe dell'add-on (abbonamento mensile a parte dal piano).
// Se risulta già attivo (piano, sblocco del super admin, add-on già pagato) non
// si paga niente: si rileggono le funzioni dell'azienda.

export function useAttivaAddonWhatsApp() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: { company_id: effectiveCompany?.id, type: "whatsapp_addon" },
      });
      if (error) throw new Error(await readInvokeError(error));
      const res = data as { url?: string; already_active?: boolean; error?: string } | null;
      if (res?.error) throw new Error(res.error);
      if (!res?.already_active && !res?.url) throw new Error("Pagina di pagamento non disponibile");
      return res;
    },
    onSuccess: (res) => {
      if (res?.url) {
        safeRedirect(res.url);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: [queryKeys.featureFlags.companyResolved(undefined)[0]] });
      void queryClient.invalidateQueries({ queryKey: ["feature-access"] });
      toast.success("WhatsApp Business è già attivo per la tua azienda");
    },
    onError: (error: Error) => {
      toast.error("Impossibile avviare l'attivazione dell'add-on", {
        description: error.message,
      });
    },
  });
}

// ─── HOOK: AGGIUNGI CARTA (setup) — funziona anche senza customer Stripe ───────
// Avvia un Stripe Checkout in modalità "setup": crea il customer se manca,
// raccoglie la carta (nessun addebito). Al termine il webhook setta
// companies.payment_method = "stripe" → gli strumenti a costo si sbloccano.

export function useStartCardSetup() {
  const { effectiveCompany } = useAuth();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: {
          company_id: effectiveCompany?.id,
          type: "setup_card",
          return_to: typeof window !== "undefined" ? window.location.pathname : undefined,
        },
      });
      if (error) throw new Error(await messaggioDellaFunzione(error));
      const res = data as { url?: string; error?: string };
      if (res?.error) throw new Error(res.error);
      if (!res?.url) throw new Error("URL checkout non disponibile");
      return res as { url: string };
    },
    onSuccess: ({ url }) => {
      safeRedirect(url);
    },
    onError: (error: Error) => {
      toast.error("Impossibile avviare l'aggiunta carta", {
        description: error.message,
      });
    },
  });
}

// ─── HOOK: ATTIVA ABBONAMENTO — pagamento del piano assegnato ──────────────────
// Per l'azienda con un piano a pagamento e nessun abbonamento Stripe: apre la
// pagina di pagamento del piano. A pagamento riuscito il webhook attiva tutto.

export function useStartPlanCheckout() {
  const { effectiveCompany } = useAuth();
  return useMutation({
    mutationFn: async ({ planId, billingPeriod = "monthly" }: { planId: string; billingPeriod?: "monthly" | "yearly" }) => {
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: {
          company_id: effectiveCompany?.id,
          plan_id: planId,
          billing_period: billingPeriod,
          return_to: typeof window !== "undefined" ? window.location.pathname : undefined,
        },
      });
      if (error) throw new Error(await messaggioDellaFunzione(error));
      const res = data as { url?: string; error?: string };
      if (res?.error) throw new Error(res.error);
      if (!res?.url) throw new Error("Pagina di pagamento non disponibile");
      return res as { url: string };
    },
    onSuccess: ({ url }) => {
      safeRedirect(url);
    },
    onError: (error: Error) => {
      toast.error("Impossibile aprire il pagamento", {
        description: error.message,
      });
    },
  });
}

// ─── HOOK: STATO RICARICA AUTOMATICA FALLITA ────────────────────────────────────
// Quando il credito scende sotto la soglia, auto-topup-trigger prova ad addebitare
// la carta. Se la carta viene rifiutata il tentativo resta registrato SOLO qui
// (company_auto_topup.failure_count > 0) e l'unico segnale che l'utente riceveva
// era l'email "Ricarica automatica non riuscita": in app non si vedeva NULLA.
// Questo hook espone lo stato "carta rifiutata" cosi' la pagina Abbonamento puo'
// mostrarlo con l'azione per aggiornare la carta. Aggrega i wallet (email/ai/
// whatsapp) in un solo stato: la carta e' una sola, il rifiuto e' lo stesso.
export interface AutoTopupFailure {
  failureCount: number;
  reason: string | null;
  lastFailureAt: string | null;
  nextAttemptAt: string | null;
  exhausted: boolean;
}

interface AutoTopupFailureRow {
  failure_count: number | null;
  last_failure_reason: string | null;
  last_failure_at: string | null;
  next_attempt_at: string | null;
  retries_exhausted_at: string | null;
}

export function useAutoTopupFailure() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: ["auto-topup-failure", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<AutoTopupFailure | null> => {
      // Colonne di fallimento assenti dai type generati (tabella aggiornata dopo):
      // stesso motivo per cui UnifiedAutoTopupCard usa il cast. Vedi types.ts.
      const { data, error } = await supabase
        .from("company_auto_topup" as any)
        .select("failure_count, last_failure_reason, last_failure_at, next_attempt_at, retries_exhausted_at")
        .eq("company_id", companyId!)
        .gt("failure_count", 0);
      if (error) {
        console.error("[useAutoTopupFailure]", error);
        return null;
      }
      const rows = (data ?? []) as AutoTopupFailureRow[];
      if (rows.length === 0) return null;

      let failureCount = 0;
      let lastFailureAt: string | null = null;
      let reason: string | null = null;
      let nextAttemptAt: string | null = null;
      let allExhausted = true;
      for (const r of rows) {
        if ((r.failure_count ?? 0) > failureCount) failureCount = r.failure_count ?? 0;
        // Il motivo segue il fallimento piu' recente
        if (r.last_failure_at && (!lastFailureAt || r.last_failure_at > lastFailureAt)) {
          lastFailureAt = r.last_failure_at;
          reason = r.last_failure_reason ?? reason;
        }
        // Prossimo tentativo = il piu' vicino tra i wallet non ancora esauriti
        if (!r.retries_exhausted_at) {
          allExhausted = false;
          if (r.next_attempt_at && (!nextAttemptAt || r.next_attempt_at < nextAttemptAt)) {
            nextAttemptAt = r.next_attempt_at;
          }
        }
      }
      return { failureCount, reason, lastFailureAt, nextAttemptAt, exhausted: allExhausted };
    },
  });
}
