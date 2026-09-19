// sdi-onboarding — registra il cedente (P.IVA azienda) sul provider openapi.it
// (POST /IT-configurations) e traccia lo stato in sdi_cedente_config.
//
// Modello intermediario scalabile: UN account openapi della piattaforma registra
// N cedenti (1 per azienda). La registrazione è idempotente ("already exists" →
// stato 'registrato'). L'attivazione finale (delega SDI) resta un passo fiscale
// che si completa nel pannello openapi / AdE.
//
// Auth: JWT utente con accesso all'azienda (verifyCompanyAccess). company_id nel body.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { leggiImpostazionePiattaforma } from "../_shared/getPlatformSetting.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const cors = getCorsHeaders(req);
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Non autorizzato" }, 401);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return json({ error: "Non autorizzato" }, 401);

    const { company_id } = await req.json().catch(() => ({}));
    if (!company_id) return json({ error: "company_id obbligatorio" }, 400);

    try {
      await verifyCompanyAccess(supabase, user.id, company_id);
    } catch {
      return json({ error: "Accesso negato a questa azienda" }, 403);
    }

    // Dati anagrafici azienda
    const { data: azienda } = await supabase.from("anagrafica_azienda")
      .select("partita_iva, ragione_sociale, pec, email").eq("company_id", company_id).single();
    if (!azienda) return json({ error: "Anagrafica azienda non trovata" }, 404);

    const fiscalId = String(azienda.partita_iva || "").replace(/\D/g, "");
    const name = azienda.ragione_sociale || "";
    const email = azienda.pec || azienda.email || "";
    if (fiscalId.length !== 11) return json({ error: "P.IVA azienda non valida (11 cifre)." }, 422);
    if (!name) return json({ error: "Ragione sociale azienda mancante." }, 422);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Email/PEC azienda mancante o non valida (richiesta per la registrazione SDI)." }, 422);

    // Token + ambiente openapi (platform-level)
    // Il token dal 19/09/2026 sta nel Vault.
    const tokenSalvato = await leggiImpostazionePiattaforma("openapi_it_token");
    const { data: envRow } = await supabase.from("platform_settings").select("value").eq("key", "openapi_env").maybeSingle();
    const token = (tokenSalvato || Deno.env.get("OPENAPI_IT_TOKEN") || "").trim();
    const env = (envRow?.value || "prod").toLowerCase();
    const invBase = (env === "sandbox" || env === "test") ? "test.invoice.openapi.com" : "invoice.openapi.com";
    if (!token) return json({ error: "openapi_it_token non configurato (scope SDI Electronic Invoicing)." }, 400);

    // Registrazione cedente (idempotente)
    let stato = "errore";
    let lastError: string | null = null;
    let providerConfigId: string | null = null;
    try {
      const resp = await fetch(`https://${invBase}/IT-configurations`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fiscal_id: fiscalId, name, email }),
      });
      const result = await resp.json().catch(() => null) as any;
      if (resp.ok && result && result.success !== false) {
        // Richiede un body parseabile (un 200 vuoto/non-JSON NON è una conferma).
        stato = "registrato";
        providerConfigId = result?.data?.id || result?.data?.uuid || null;
      } else if (result?.error === 111 || /already exists/i.test(String(result?.message || ""))) {
        stato = "registrato"; // già presente → ok
      } else {
        lastError = result?.message || `HTTP ${resp.status}`;
      }
    } catch (e) {
      lastError = (e as Error).message;
    }

    // Upsert stato
    const { data: row, error: upErr } = await supabase.from("sdi_cedente_config").upsert({
      company_id, provider: "openapi", fiscal_id: fiscalId, name, email,
      provider_config_id: providerConfigId, stato, last_error: lastError,
      registered_at: stato === "registrato" ? new Date().toISOString() : null,
      last_checked_at: new Date().toISOString(),
    }, { onConflict: "company_id" }).select("*").single();
    if (upErr) return json({ error: `Errore salvataggio stato: ${upErr.message}` }, 500);

    return json({
      success: stato === "registrato",
      stato,
      fiscal_id: fiscalId,
      error: lastError,
      config: row,
      // promemoria: la registrazione non basta — serve la delega/attivazione SDI
      next_step: stato === "registrato"
        ? "Cedente registrato. Completa la delega SDI (codice destinatario / delega AdE) per attivare invio e ricezione."
        : "Registrazione fallita: verifica i dati anagrafici e il token openapi.",
    }, stato === "registrato" ? 200 : 502);
  } catch (err) {
    return json({ error: `Errore interno: ${(err as Error).message}` }, 500);
  }
});
