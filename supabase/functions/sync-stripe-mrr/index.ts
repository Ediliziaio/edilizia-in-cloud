import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  metadata: Record<string, string>;
  items: {
    data: Array<{
      price: {
        unit_amount: number | null;
        recurring: { interval: string; interval_count: number } | null;
      };
    }>;
  };
}

interface StripeListResponse {
  data: StripeSubscription[];
  has_more: boolean;
}

async function fetchStripeSubscriptions(apiKey: string): Promise<StripeSubscription[]> {
  const all: StripeSubscription[] = [];
  let startingAfter: string | undefined;

  while (true) {
    const params = new URLSearchParams({ status: "active", limit: "100" });
    if (startingAfter) params.set("starting_after", startingAfter);

    const res = await fetch(`https://api.stripe.com/v1/subscriptions?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) throw new Error(`Stripe API error: ${res.status}`);

    const json = await res.json() as StripeListResponse;
    all.push(...json.data);

    if (!json.has_more) break;
    startingAfter = json.data[json.data.length - 1]?.id;
  }

  return all;
}

function calcMrrCents(sub: StripeSubscription): number {
  return sub.items.data.reduce((sum, item) => {
    const amount = item.price.unit_amount ?? 0;
    const interval = item.price.recurring?.interval ?? "month";
    const count = item.price.recurring?.interval_count ?? 1;
    if (interval === "year") return sum + Math.round(amount / 12 / count);
    if (interval === "month") return sum + Math.round(amount / count);
    return sum;
  }, 0);
}

type InternalCompany = {
  id: string;
  name: string | null;
  status: string | null;
  payment_method: string | null;
  stripe_subscription_status: string | null;
  subscription_plans: {
    price_monthly: number | null;
    price_yearly: number | null;
  } | null;
  company_subscriptions?: Array<{
    status: string | null;
    stripe_subscription_id: string | null;
    billing_period: string | null;
  }> | null;
};

const NON_PAYING_METHODS = new Set([
  "",
  "none",
  "free",
  "trial",
  "gift",
  "gifted",
  "gratis",
  "omaggio",
  "manual_free",
  "complimentary",
  "comp",
]);

function norm(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function companyMrrCents(company: InternalCompany): number {
  const plan = company.subscription_plans;
  if (!plan) return 0;
  const sub =
    company.company_subscriptions?.find((s) => norm(s.status) === "active") ??
    company.company_subscriptions?.[0] ??
    null;
  const monthly = Number(plan.price_monthly ?? 0);
  if (norm(sub?.billing_period) === "yearly") {
    const yearly = Number(plan.price_yearly ?? 0);
    return Math.round((yearly > 0 ? yearly / 12 : monthly) * 100);
  }
  return Math.round(monthly * 100);
}

function countsAsPaidRevenue(company: InternalCompany): boolean {
  if (company.status !== "active") return false;
  if (companyMrrCents(company) <= 0) return false;

  const stripeStatus = norm(company.stripe_subscription_status);
  const hasActiveStripeSub =
    company.company_subscriptions?.some(
      (sub) => norm(sub.status) === "active" && !!sub.stripe_subscription_id
    ) ?? false;
  if (stripeStatus === "active" || hasActiveStripeSub) return true;
  if (["canceled", "cancelled", "unpaid", "past_due"].includes(stripeStatus)) return false;

  const paymentMethod = norm(company.payment_method);
  return !!paymentMethod && !NON_PAYING_METHODS.has(paymentMethod) && paymentMethod !== "stripe";
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: "STRIPE_SECRET_KEY non configurata" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch subscriptions da Stripe
    const subscriptions = await fetchStripeSubscriptions(stripeKey);
    const mrrStripe = subscriptions.reduce((s, sub) => s + calcMrrCents(sub), 0);
    const aziendeAttivaStripe = subscriptions.length;

    // Calcola MRR interno pagante: accessi demo/regalati restano utilizzabili,
    // ma non devono entrare in MRR, ARR o riconciliazione revenue.
    const { data: companies } = await supabase
      .from("companies")
      .select("id, name, status, payment_method, stripe_subscription_status, subscription_plans:subscription_plan_id(price_monthly, price_yearly), company_subscriptions(status, stripe_subscription_id, billing_period)")
      .eq("status", "active")
      .eq("is_platform_admin_company", false);

    const paidCompanies = ((companies ?? []) as InternalCompany[]).filter(countsAsPaidRevenue);
    const mrrInterno = paidCompanies.reduce((s, c) => s + companyMrrCents(c), 0);

    const aziendeAttivaInterno = paidCompanies.length;

    // Breakdown per piano (Stripe metadata.plan_name)
    const breakdownPerPiano: Record<string, number> = {};
    subscriptions.forEach((sub) => {
      const planName = sub.metadata?.plan_name ?? "sconosciuto";
      breakdownPerPiano[planName] = (breakdownPerPiano[planName] ?? 0) + calcMrrCents(sub);
    });

    const oggi = new Date().toISOString().split("T")[0];

    // Salva snapshot
    const { error: upsertError } = await supabase.from("mrr_snapshots").upsert(
      {
        data: oggi,
        mrr_stripe_cents: mrrStripe,
        mrr_interno_cents: mrrInterno,
        aziende_attive_stripe: aziendeAttivaStripe,
        aziende_attive_interno: aziendeAttivaInterno,
        breakdown_per_piano: breakdownPerPiano,
        dettaglio_discrepanze: [],
      },
      { onConflict: "data" }
    );

    if (upsertError) throw new Error(upsertError.message);

    return new Response(
      JSON.stringify({
        ok: true,
        mrr_stripe: mrrStripe,
        mrr_interno: mrrInterno,
        discrepanza: mrrStripe - mrrInterno,
        aziende_stripe: aziendeAttivaStripe,
        data: oggi,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    console.error("[sync-stripe-mrr]", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
