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
  stripe_customer_id: string | null;
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

// Deve restare allineata a NON_PAYING_METHODS in src/lib/adminRevenue.ts:
// e' la stessa domanda ("questo cliente lo sto fatturando?") posta in due
// runtime diversi. Il valore canonico scritto dalla UI e' "comped" — mancava,
// e siccome e' l'unico che la UI produce, TUTTI i regalati entravano in MRR.
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
  "comped",
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

/**
 * Entra in MRR solo chi paga davvero.
 *
 * Il metodo di pagamento decide per PRIMO: marcare un'azienda come regalata e'
 * una dichiarazione esplicita ("questa non la fatturo"), e deve battere
 * qualunque residuo Stripe rimasto attivo da un abbonamento precedente.
 * Prima il controllo Stripe veniva prima, quindi bastava una sottoscrizione
 * dimenticata per far rientrare un regalo nel fatturato.
 */
function countsAsPaidRevenue(company: InternalCompany): boolean {
  if (company.status !== "active") return false;
  if (companyMrrCents(company) <= 0) return false;

  // Un metodo "regalo" DICHIARATO batte tutto. Il metodo vuoto invece non
  // dichiara niente: la' decide Stripe, altrimenti un pagante a cui non e'
  // stato compilato il campo sparirebbe dal fatturato.
  const paymentMethod = norm(company.payment_method);
  if (paymentMethod && NON_PAYING_METHODS.has(paymentMethod)) return false;

  const stripeStatus = norm(company.stripe_subscription_status);
  const hasActiveStripeSub =
    company.company_subscriptions?.some(
      (sub) => norm(sub.status) === "active" && !!sub.stripe_subscription_id
    ) ?? false;
  if (stripeStatus === "active" || hasActiveStripeSub) return true;
  if (["canceled", "cancelled", "unpaid", "past_due"].includes(stripeStatus)) return false;

  // Metodo manuale configurato (bonifico, SDD...): si fattura fuori da Stripe.
  // "stripe" senza abbonamento attivo invece non incassa niente.
  return !!paymentMethod && paymentMethod !== "stripe";
}

/** Regalata: ha un piano a pagamento, ma per scelta non le viene chiesto nulla. */
function isRegalata(company: InternalCompany): boolean {
  if (company.status !== "active") return false;
  if (companyMrrCents(company) <= 0) return false;
  const method = norm(company.payment_method);
  return !!method && NON_PAYING_METHODS.has(method);
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  // Auth: cron secret (chiamata schedulata) oppure verify_jwt del gateway per
  // il pulsante "Sync ora" del super-admin. Senza questo, con verify_jwt=false
  // la funzione sarebbe pubblica.
  const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  const reqSecret = req.headers.get("x-cron-secret");
  const authz = req.headers.get("Authorization");
  const isCron = !!cronSecret && reqSecret === cronSecret;
  if (!isCron && !authz?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    // Calcola MRR interno pagante: accessi demo/regalati restano utilizzabili,
    // ma non devono entrare in MRR, ARR o riconciliazione revenue.
    const { data: companies } = await supabase
      .from("companies")
      .select("id, name, status, payment_method, stripe_customer_id, stripe_subscription_status, subscription_plans:subscription_plan_id(price_monthly, price_yearly), company_subscriptions(status, stripe_subscription_id, billing_period)")
      .eq("status", "active")
      .eq("is_platform_admin_company", false);

    const attive = (companies ?? []) as InternalCompany[];

    // L'account Stripe e' CONDIVISO con gli altri prodotti AEDIX. Una
    // sottoscrizione che non risale a nessuna azienda non e' fatturato di
    // Edilizia in Cloud, ed e' il motivo per cui il cruscotto ha letto 243,13
    // il 4 settembre e 127 il giorno dopo: quattro abbonamenti di un altro
    // prodotto si erano chiusi, e finche' erano dentro gonfiavano un numero
    // che non era mai stato nostro. Restano contati, ma a parte.
    const perCustomer = new Map<string, InternalCompany>();
    for (const c of attive) {
      if (c.stripe_customer_id) perCustomer.set(c.stripe_customer_id, c);
    }
    const subNostre = subscriptions.filter((sub) => perCustomer.has(sub.customer));
    const subAltrui = subscriptions.filter((sub) => !perCustomer.has(sub.customer));

    const mrrStripe = subNostre.reduce((s, sub) => s + calcMrrCents(sub), 0);
    const aziendeAttivaStripe = subNostre.length;
    const mrrAltriProdotti = subAltrui.reduce((s, sub) => s + calcMrrCents(sub), 0);

    const paidCompanies = attive.filter(countsAsPaidRevenue);
    const mrrInterno = paidCompanies.reduce((s, c) => s + companyMrrCents(c), 0);
    const aziendeAttivaInterno = paidCompanies.length;

    // Quanto vale, a listino, quello che stiamo regalando. Non e' fatturato e
    // non deve sommarsi al MRR, ma senza questo numero non si sa se un mese
    // piatto e' un mercato fermo o troppa generosita'.
    const regalate = attive.filter(isRegalata);
    const mrrRegalato = regalate.reduce((s, c) => s + companyMrrCents(c), 0);

    // Breakdown per piano (Stripe metadata.plan_name)
    const breakdownPerPiano: Record<string, number> = {};
    subNostre.forEach((sub) => {
      const planName = sub.metadata?.plan_name ?? "sconosciuto";
      breakdownPerPiano[planName] = (breakdownPerPiano[planName] ?? 0) + calcMrrCents(sub);
    });

    // Riconciliazione per azienda: dov'e' che Stripe e noi diciamo cose diverse.
    // Questo campo e' sempre stato scritto vuoto, ed e' il motivo per cui il
    // divario Stripe/interno non era spiegabile da nessuna parte. Le
    // sottoscrizioni di altri prodotti restano elencate qui: non sono
    // un'anomalia da inseguire, ma vanno viste.
    const dettaglioDiscrepanze: Array<{
      company_id: string; nome: string; mrr_stripe: number; mrr_interno: number; motivo: string;
    }> = [];
    const visteSuStripe = new Set<string>();

    for (const sub of subscriptions) {
      const c = perCustomer.get(sub.customer);
      const mrrSub = calcMrrCents(sub);
      if (!c) {
        dettaglioDiscrepanze.push({
          company_id: "", nome: sub.metadata?.plan_name ?? sub.customer,
          mrr_stripe: mrrSub, mrr_interno: 0, motivo: "altro prodotto AEDIX",
        });
        continue;
      }
      visteSuStripe.add(c.id);
      const mrrNostro = countsAsPaidRevenue(c) ? companyMrrCents(c) : 0;
      if (mrrNostro !== mrrSub) {
        dettaglioDiscrepanze.push({
          company_id: c.id, nome: c.name ?? "(senza nome)",
          mrr_stripe: mrrSub, mrr_interno: mrrNostro,
          motivo: mrrNostro === 0 ? "non contata come pagante" : "prezzo diverso dal piano",
        });
      }
    }
    // Chi contiamo noi ma su cui Stripe non incassa: e' il caso piu' pericoloso,
    // perche' gonfia il MRR senza che arrivi un euro.
    for (const c of paidCompanies) {
      if (visteSuStripe.has(c.id)) continue;
      dettaglioDiscrepanze.push({
        company_id: c.id, nome: c.name ?? "(senza nome)",
        mrr_stripe: 0, mrr_interno: companyMrrCents(c),
        motivo: "nessun abbonamento attivo su Stripe",
      });
    }

    const oggi = new Date().toISOString().split("T")[0];

    // Salva snapshot
    const { error: upsertError } = await supabase.from("mrr_snapshots").upsert(
      {
        data: oggi,
        mrr_stripe_cents: mrrStripe,
        mrr_interno_cents: mrrInterno,
        aziende_attive_stripe: aziendeAttivaStripe,
        aziende_attive_interno: aziendeAttivaInterno,
        // Scritto da questa versione, quella che esclude i regalati: gli
        // snapshot piu' vecchi restano marcati inattendibili.
        calcolo_affidabile: true,
        mrr_regalato_cents: mrrRegalato,
        aziende_regalate: regalate.length,
        mrr_altri_prodotti_cents: mrrAltriProdotti,
        sottoscrizioni_altri_prodotti: subAltrui.length,
        breakdown_per_piano: breakdownPerPiano,
        dettaglio_discrepanze: dettaglioDiscrepanze,
      },
      { onConflict: "data" }
    );

    if (upsertError) throw new Error(upsertError.message);

    return new Response(
      JSON.stringify({
        ok: true,
        mrr_stripe: mrrStripe,
        mrr_altri_prodotti: mrrAltriProdotti,
        mrr_interno: mrrInterno,
        mrr_regalato: mrrRegalato,
        aziende_regalate: regalate.length,
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
