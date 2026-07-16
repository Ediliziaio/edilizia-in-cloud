import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { safeRedirect } from "@/utils/safeRedirect";

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
  planName: string;
  planPriceMonthly: number;
  planPriceYearly: number;
  trialEndsAt: string | null;
  status: string;
  dunningStatus: string | null;
  paymentFailureCount: number;
  stripeCustomerId: string | null;
  stripeSubscriptionStatus: string | null;
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
          dunning_status,
          dunning_started_at,
          payment_failure_count,
          subscription_plans!companies_subscription_plan_id_fkey (
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

      const plan = company.subscription_plans as { name?: string; price_monthly?: number; price_yearly?: number } | null;
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
        planName: plan?.name ?? "Piano sconosciuto",
        planPriceMonthly: plan?.price_monthly ?? 0,
        planPriceYearly: plan?.price_yearly ?? 0,
        trialEndsAt: company.trial_ends_at ?? null,
        status: company.status ?? "active",
        dunningStatus,
        paymentFailureCount: company.payment_failure_count ?? 0,
        stripeCustomerId: company.stripe_customer_id ?? null,
        stripeSubscriptionStatus: company.stripe_subscription_status ?? null,
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

// ─── HOOK: APRIRE IL CUSTOMER PORTAL STRIPE ───────────────────────────────────

export function useOpenBillingPortal() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
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
      if (error) {
        // Mostra il messaggio REALE della edge function (es. "Stripe non configurato")
        // invece del generico "Edge Function returned a non-2xx status code".
        let real: string | null = null;
        try {
          const ctx = (error as { context?: unknown }).context;
          if (ctx instanceof Response) real = ((await ctx.json().catch(() => null)) as { error?: string } | null)?.error ?? null;
        } catch { /* ignore */ }
        throw new Error(real ?? error.message);
      }
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
