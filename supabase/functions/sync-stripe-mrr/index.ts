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

    // Calcola MRR interno da companies con piano attivo
    const { data: pianiAttivi } = await supabase
      .from("companies")
      .select("subscription_plans:subscription_plan_id(price_monthly)")
      .eq("status", "active")
      .eq("is_platform_admin_company", false);

    const mrrInterno = (pianiAttivi ?? []).reduce((s, c) => {
      const plan = c.subscription_plans as { price_monthly: number } | null;
      return s + (plan ? Math.round(plan.price_monthly * 100) : 0);
    }, 0);

    const aziendeAttivaInterno = pianiAttivi?.length ?? 0;

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
