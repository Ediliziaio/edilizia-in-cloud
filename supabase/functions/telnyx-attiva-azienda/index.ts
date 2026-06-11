/**
 * telnyx-attiva-azienda
 * Crea SubAccount Telnyx per un'azienda + wallet + provider_config.
 * POST autenticato service_role: { company_id }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";

interface RequestBody { company_id: string }
interface TelnyxAttivaResponse { success: boolean; telnyx_account_id: string }

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl     = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const masterApiKey    = Deno.env.get("TELNYX_MASTER_API_KEY");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Autenticazione richiesta" }, 401);

    const { company_id } = await req.json() as RequestBody;
    if (!company_id) return json({ error: "company_id obbligatorio" }, 400);

    // SEC (P0): solo un membro della company (admin) può attivarla — no cross-tenant
    try {
      const { userId } = await requireAuth(req, corsHeaders);
      await requireCompanyAccess(adminClient, userId, company_id, corsHeaders, { allowedRoles: ["company_admin", "super_admin"] });
    } catch (e) {
      if (e instanceof Response) return e;
      throw e;
    }

    // Verifica che non esista già un account attivo
    const { data: existing } = await adminClient
      .from("sms_telnyx_accounts")
      .select("id, stato")
      .eq("company_id", company_id)
      .maybeSingle();

    if (existing?.stato === "attivo") {
      return json({ success: true, telnyx_account_id: existing.id });
    }

    let telnyxAccountId = `mock_${company_id.slice(0, 8)}`;

    // Se la master API key è disponibile, prova a creare il Managed Account
    // Telnyx (endpoint corretto: /v2/managed_accounts — /v2/accounts non
    // esiste). NOTA: i managed accounts richiedono l'abilitazione reseller
    // sull'account Telnyx; se non abilitati il fallback resta l'id locale,
    // che è OK perché l'invio usa comunque la master key. Il fallimento
    // viene loggato (prima era inghiottito in silenzio).
    if (masterApiKey) {
      try {
        const { data: comp } = await adminClient
          .from("companies")
          .select("name, business_name")
          .eq("id", company_id)
          .maybeSingle();
        const res = await fetch("https://api.telnyx.com/v2/managed_accounts", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${masterApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            business_name: comp?.business_name || comp?.name || `EiC ${company_id.slice(0, 8)}`,
            email: `sms+${company_id.slice(0, 8)}@ediliziaincloud.com`,
          }),
        });
        if (res.ok) {
          const body = await res.json() as { data: { id: string } };
          telnyxAccountId = body.data.id;
        } else {
          const errText = await res.text();
          console.warn(
            `[telnyx-attiva-azienda] Managed account non creato (${res.status}) — uso id locale, invii via master key. Dettaglio: ${errText.slice(0, 300)}`,
          );
        }
      } catch (e) {
        console.warn("[telnyx-attiva-azienda] Errore rete managed account — uso id locale:", e);
      }
    }

    // Salva il secret name (la API key verrà salvata nel Vault separatamente)
    const secretName = `telnyx_key_${company_id.replace(/-/g, "_")}`;

    // Inserisci/aggiorna sms_telnyx_accounts
    const { error: accountError } = await adminClient
      .from("sms_telnyx_accounts")
      .upsert({
        company_id,
        telnyx_account_id: telnyxAccountId,
        telnyx_api_key_secret_name: secretName,
        stato: "attivo",
        attivato_at: new Date().toISOString(),
      }, { onConflict: "company_id" });

    if (accountError) throw accountError;

    // Crea wallet se non esiste
    await adminClient
      .from("sms_wallet")
      .upsert({ company_id, crediti: 0, crediti_riservati: 0 }, { onConflict: "company_id" });

    // Crea provider_config se non esiste
    await adminClient
      .from("sms_provider_config")
      .upsert({ company_id, onboarding_completato: false }, { onConflict: "company_id" });

    const response: TelnyxAttivaResponse = { success: true, telnyx_account_id: telnyxAccountId };
    return json(response);

  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore interno";
    return json({ error: message }, 500);
  }
});
