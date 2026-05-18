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
          subscription_plans (
            name,
            price_monthly,
            price_yearly
          )
        `)
        .eq("id", companyId!)
        .single();

      if (error) throw error;
      // v8.6.58 — Lettura best-effort delle colonne ciclo abbonamento
      // (current_period_*, cancel_at_period_end, billing_cycle). Se non
      // esistono nello schema (pre-migration), restano undefined.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cExtra = company as unknown as Record<string, any>;

      const plan = company.subscription_plans as any;
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
        currentPeriodStart: cExtra.current_period_start ?? null,
        currentPeriodEnd: cExtra.current_period_end ?? null,
        cancelAtPeriodEnd: Boolean(cExtra.cancel_at_period_end),
        billingCycle:
          cExtra.billing_cycle === "yearly" || cExtra.billing_cycle === "monthly"
            ? cExtra.billing_cycle
            : null,
      };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
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

      return ((data as any[]) ?? []).map((row: any) => ({
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
