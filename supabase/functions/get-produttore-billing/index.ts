import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
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

    const { data: me } = await admin
      .from("companies").select("reseller_wholesale_pct, payment_method, reseller_billing_mode")
      .eq("id", ctx.produttoreId).maybeSingle();
    const pct = Math.min(100, Math.max(0, Number(me?.reseller_wholesale_pct ?? 0)));
    const factor = 1 - pct / 100;

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

    const comped = mapped.filter((r) => r.comped).map((r) => ({ ...r, your_price: round2(r.list_price * factor) }));
    const selfPaid = mapped.filter((r) => !r.comped).map(({ id, name, plan_name, list_price, status }) => ({ id, name, plan_name, list_price, status }));

    const listTotal = round2(comped.reduce((s, r) => s + r.list_price, 0));
    const yourTotal = round2(comped.reduce((s, r) => s + r.your_price, 0));

    return jsonResponse({
      success: true,
      wholesale_pct: pct,
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
