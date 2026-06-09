import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { resolveProduttore, loadOwnedReseller } from "../_shared/produttore.ts";

/**
 * get-reseller-detail — dati di dettaglio di UN rivenditore per il produttore:
 * contatto admin + stato invito + ultimo accesso, conteggi (utenti/commesse/clienti),
 * attività recenti. Usa il service role (legge dati del figlio, fuori dalla RLS del
 * produttore) con guardia anti-IDOR centralizzata. Ogni lettura è best-effort: un
 * conteggio che fallisce non rompe il dettaglio.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const body = await req.json();
    const resellerId = String(body?.reseller_id ?? "");
    if (!resellerId) return errorResponse("reseller_id richiesto", 400, corsH);

    const ctx = await resolveProduttore(req, corsH);
    const reseller = await loadOwnedReseller(
      ctx, resellerId, corsH,
      "id, name, email, status, billing_comped, payment_method, created_at, subscription_plan_id, subscription_plans:subscription_plan_id(name, price_monthly)",
    );
    const admin = ctx.supabaseAdmin;

    // Admin del rivenditore (primo profilo dell'azienda figlia).
    const { data: profiles } = await admin
      .from("profiles").select("id, email, first_name").eq("company_id", resellerId).limit(1);
    const adminProfile = (profiles ?? [])[0] ?? null;

    // Stato invito + ultimo accesso dall'utente auth (best-effort).
    let invite: { email: string | null; confirmed: boolean; last_sign_in_at: string | null } | null = null;
    if (adminProfile?.id) {
      try {
        const { data: u } = await admin.auth.admin.getUserById(adminProfile.id);
        const au = u?.user;
        invite = {
          email: au?.email ?? adminProfile.email ?? reseller.email ?? null,
          confirmed: !!(au?.email_confirmed_at || au?.last_sign_in_at),
          last_sign_in_at: au?.last_sign_in_at ?? null,
        };
      } catch (_e) {
        invite = { email: adminProfile.email ?? reseller.email ?? null, confirmed: false, last_sign_in_at: null };
      }
    } else {
      invite = { email: reseller.email ?? null, confirmed: false, last_sign_in_at: null };
    }

    // Conteggi isolati (ogni tabella in try separato).
    const countOf = async (table: string): Promise<number | null> => {
      try {
        const { count } = await admin.from(table).select("id", { count: "exact", head: true }).eq("company_id", resellerId);
        return count ?? 0;
      } catch (_e) {
        return null;
      }
    };
    const [users, orders, customers] = await Promise.all([
      countOf("profiles"), countOf("orders"), countOf("customers"),
    ]);

    // Attività recenti.
    const { data: activity } = await admin
      .from("subscription_logs").select("event_type, notes, created_at")
      .eq("company_id", resellerId).order("created_at", { ascending: false }).limit(8);

    return jsonResponse({
      success: true,
      reseller: {
        id: reseller.id,
        name: reseller.name,
        email: reseller.email ?? null,
        status: reseller.status,
        billing_comped: reseller.billing_comped,
        payment_method: reseller.payment_method,
        created_at: reseller.created_at,
        subscription_plan_id: reseller.subscription_plan_id,
        plan_name: reseller.subscription_plans?.name ?? null,
        plan_price: Number(reseller.subscription_plans?.price_monthly ?? 0),
      },
      invite,
      counts: { users, orders, customers },
      activity: activity ?? [],
    }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("get-reseller-detail error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
