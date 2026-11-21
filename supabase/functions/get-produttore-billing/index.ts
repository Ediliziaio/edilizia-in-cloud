import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { wholesaleQuote } from "../_shared/produttoreWholesale.ts";
import { resolveProduttore } from "../_shared/produttore.ts";

/**
 * get-produttore-billing — "Il tuo conto" del produttore. Calcola, per i rivenditori
 * che paga lui (comped), il costo wholesale (listino scontato di reseller_wholesale_pct)
 * con breakdown e totali; elenca a parte i rivenditori "paga lui" (che pagano la
 * piattaforma direttamente). Sola lettura/aggregazione: nessun addebito (la riscossione
 * live è lo Step 2).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

interface RivItem {
  id: string;
  name: string;
  status: string | null;
  comped: boolean;
  plan_name: string | null;
  list_price: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const ctx = await resolveProduttore(req, corsH);
    const admin = ctx.supabaseAdmin;

    const { data: me, error: producerError } = await admin
      .from("companies").select("reseller_wholesale_pct, payment_method, reseller_billing_mode")
      .eq("id", ctx.produttoreId).maybeSingle();
    if (producerError) throw producerError;
    const period = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" }).format(new Date());
    const { data: account, error: accountError } = await admin.from("produttori_conti_wholesale")
      .select("period, amount_cents, stripe_status").eq("produttore_id", ctx.produttoreId).eq("period", period).maybeSingle();
    if (accountError) throw accountError;

    const { data: rivs, error } = await admin
      .from("companies")
      .select("id, name, status, billing_comped, subscription_plans:subscription_plan_id(name, price_monthly)")
      .eq("parent_company_id", ctx.produttoreId)
      .order("created_at", { ascending: false });
    if (error) return errorResponse(`Errore lettura rivenditori: ${error.message}`, 500, corsH);

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const mapped: RivItem[] = (rivs ?? []).map((r: Row) => ({
      id: r.id as string,
      name: r.name as string,
      status: (r.status as string | null) ?? null,
      comped: !!r.billing_comped,
      plan_name: (r.subscription_plans?.name as string | undefined) ?? null,
      list_price: Number(r.subscription_plans?.price_monthly ?? 0),
    }));

    const quote = wholesaleQuote(rivs ?? [], Number(me?.reseller_wholesale_pct ?? 0));
    const prices = new Map(quote.items.map((item) => [item.id, item]));
    const comped = mapped.filter((r) => r.comped).map((r) => ({
      ...r, your_price: (prices.get(r.id)?.amount_cents ?? 0) / 100,
    }));
    const selfPaid = mapped.filter((r) => !r.comped).map(({ id, name, plan_name, list_price, status }) => ({ id, name, plan_name, list_price, status }));

    const listTotal = quote.items.reduce((sum, item) => sum + item.list_cents, 0) / 100;
    const yourTotal = quote.total / 100;

    return jsonResponse({
      success: true,
      wholesale_pct: quote.pct,
      current_account: account ? { period, amount: account.amount_cents / 100, status: account.stripe_status } : null,
      payment_method: (me?.payment_method as string | null) ?? null,
      billing_mode: (me?.reseller_billing_mode as string | null) ?? "fabbrica_paga",
      items: comped,
      self_paid: selfPaid,
      totals: { list: listTotal, yours: yourTotal, saving: round2(listTotal - yourTotal) },
    }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("get-produttore-billing error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
