import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { ruoliNellAzienda } from "../_shared/amministraAzienda.ts";
import { isSuperAdminEmailAllowed } from "../_shared/auth.ts";
import { providerId, validateMassiveInput, vatNumber } from "../_shared/billingMassive.ts";
import { italaClientFromStored } from "../_shared/italaSecrets.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
Deno.serve(async req => {
  const cors = { ...getCorsHeaders(req), "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Metodo non ammesso." }, 405);
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const { data: { user }, error: authError } = await admin.auth.getUser(auth.replace(/^Bearer /, ""));
    if (authError || !user) return json({ error: "Sessione non valida." }, 401);
    // Bound request sizes before parsing, including chunked requests.
    const text = await req.text();
    if (text.length > 3_000_000) return json({ error: "Richiesta troppo grande (massimo 2 MB firmati)." }, 413);
    const body = JSON.parse(text) as Record<string, unknown>;
    const companyId = typeof body.company_id === "string" ? body.company_id : "";
    if (!companyId || !await canAccessCompany(admin, user.id, companyId)) return json({ error: "Accesso negato all'azienda." }, 403);
    const roles = await ruoliNellAzienda(admin, user.id, companyId);
    const isAdmin = roles.includes("company_admin") || (roles.includes("super_admin") && isSuperAdminEmailAllowed(user.email));
    if (!isAdmin) return json({ error: "Solo l'amministratore può gestire le richieste massive." }, 403);
    const { data: profile } = await admin.from("profiles").select("is_blocked").eq("id", user.id).maybeSingle();
    if (profile?.is_blocked) return json({ error: "Utente bloccato." }, 403);
    const [{ data: an }, { data: co }] = await Promise.all([
      admin.from("anagrafica_azienda").select("partita_iva").eq("company_id", companyId).maybeSingle(),
      admin.from("companies").select("vat_number").eq("id", companyId).maybeSingle(),
    ]);
    // The client can never choose another company's VAT, including on multi-company provider accounts.
    const vat = vatNumber(an?.partita_iva || co?.vat_number);
    const action = String(body.action ?? "");
    const input = action === "create" ? validateMassiveInput({ ...body, partita_iva: vat }) : null;
    if (action === "create" && body.provider_enabled !== true) return json({ error: "Conferma prima l'abilitazione del provider in Fatture e Corrispettivi." }, 400);

    if (body.provider === "ade_direct") {
      const gateway = Deno.env.get("SMTS_GATEWAY_URL"), secret = Deno.env.get("SMTS_GATEWAY_SECRET");
      if (!gateway || !secret) return json({ configured: false, error: "Il canale diretto AdE richiede il servizio SMTS con certificati e accreditamento completato." }, 503);
      const target = new URL("/actions", gateway);
      if (target.protocol !== "https:") return json({ error: "Gateway SMTS non configurato con HTTPS." }, 503);
      const r = await fetch(target, { method: "POST", redirect: "error", signal: AbortSignal.timeout(55_000),
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action, company_id: companyId, partita_iva: vat, input,
          id: body.id, file_id: body.file_id, signed_base64: body.signed_base64 }),
      });
      return json(await r.json(), r.status);
    }
    if (body.provider !== "itala") return json({ error: "Provider non valido." }, 400);
    const { data: integration, error: intError } = await admin.from("billing_integrations")
      .select("api_key, provider_vat_number").eq("company_id", companyId).eq("provider", "itala").eq("is_active", true).maybeSingle();
    if (intError || !integration?.api_key) return json({ error: "Collega prima Fattura Elettronica API con le credenziali API della scheda personale." }, 409);
    if (integration.provider_vat_number && vatNumber(integration.provider_vat_number) !== vat) return json({ error: "La partita IVA è cambiata: riconnetti il provider." }, 409);
    const client = await italaClientFromStored(integration.api_key);
    if (action === "list") {
      const page = Math.max(1, Math.min(1000, Number(body.page) || 1));
      return json({ requests: await client.listRequests(vat, page), environment: client.environment, page });
    }
    if (action === "credit") return json({ credit: await client.request("/credito"), environment: client.environment });
    if (action === "create") {
      if (body.confirm_create_credit !== true) return json({ error: "La creazione costa 1 credito: conferma il costo prima di procedere." }, 409);
      const created = await client.create(input!);
      return json({ ...created, stato: "CREATO", environment: client.environment });
    }
    if (action === "import_page") {
      const page = Number(body.page ?? 1);
      if (!Number.isInteger(page) || page < 1 || page > 10000) return json({ error: "Pagina non valida." }, 400);
      const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/billing-import`, {
        method: "POST", signal: AbortSignal.timeout(55_000),
        headers: { Authorization: auth, apikey: Deno.env.get("SUPABASE_ANON_KEY")!, "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, provider: "itala", itala_page: page }),
      });
      const result = await r.json();
      if (!r.ok || result.error) return json({ error: "Importazione non completata. Controlla il collegamento ITALA e il registro delle sincronizzazioni." }, 400);
      return json({ imported: (result.imported ?? 0) + (result.received?.imported ?? 0),
        duplicates: (result.updated ?? 0) + (result.received?.updated ?? 0),
        failed: (result.failed ?? 0) + (result.received?.failed ?? 0), errors: result.errors ?? [], next_page: result.next_page ?? null });
    }
    const id = providerId(body.id);
    const owned = await client.ownedRequest(id, vat);
    if (action === "status") return json(owned);
    if (action === "sign") {
      const signed = typeof body.signed_base64 === "string" ? body.signed_base64 : "";
      if (!signed || signed.length > 2_800_000 || !/^[A-Za-z0-9+/=\r\n]+$/.test(signed)) return json({ error: "Carica un file CAdES .p7m valido (massimo 2 MB)." }, 400);
      if (owned.stato !== "CREATO") return json({ error: "La richiesta è già stata inoltrata o non è firmabile." }, 409);
      return json(await client.request(`/richieste-massive/${id}`, "PATCH", { file_richiesta_signed_base64: signed }));
    }
    if (action === "pay") {
      const documents = owned.num_documenti;
      if (owned.stato !== "PRONTO" || !Number.isSafeInteger(documents) || documents! < 0) return json({ error: "Il conteggio dei documenti non è ancora disponibile." }, 409);
      if (body.confirm_credits !== documents) return json({ error: "Il numero di documenti è cambiato. Aggiorna l'esito e conferma il costo corrente." }, 409);
      return json(await client.request(`/richieste-massive/${id}/pagamento`, "POST"));
    }
    return json({ error: "Operazione non supportata." }, 400);
  } catch (e) {
    console.error("billing-massive: operazione non completata", e instanceof Error ? e.name : "unknown");
    return json({ error: e instanceof Error ? e.message : "Operazione non completata." }, 400);
  }
});
