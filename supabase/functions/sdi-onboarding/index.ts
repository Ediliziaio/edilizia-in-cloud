// sdi-onboarding — registra il cedente (P.IVA azienda) sul provider openapi.it
// (POST /IT-configurations) e traccia lo stato in sdi_cedente_config.
//
// Modello intermediario scalabile: UN account openapi della piattaforma registra
// N cedenti (1 per azienda). La registrazione è idempotente ("already exists" →
// stato 'registrato'). L'attivazione finale (delega SDI) resta un passo fiscale
// che si completa nel pannello openapi / AdE.
//
// Dal 24/09/2026 la registrazione chiede anche la RICEZIONE (supplier_invoice)
// e lascia a openapi l'indirizzo da chiamare quando arriva una fattura di un
// fornitore (openapi-fatture-ricevute, con un gettone nell'intestazione).
// Da sola non cambia niente: le fatture arrivano a openapi solo se l'azienda
// registra all'Agenzia delle Entrate il codice destinatario PIC7CPS. Se openapi
// rifiuta la parte nuova, si riprova senza: l'invio non deve mai restare
// bloccato per la ricezione. Per un'azienda già registrata si aggiorna la
// configurazione (PATCH), e un nuovo clic su «Ri-verifica» la rimette a posto.
//
// Auth: JWT utente con accesso all'azienda (verifyCompanyAccess). company_id nel body.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { leggiImpostazionePiattaforma } from "../_shared/getPlatformSetting.ts";
import { gettoneCallback } from "../_shared/ricevuteOpenapi.ts";

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

    // Invio e ricezione, più la chiamata di openapi quando arriva una fattura.
    const ricezione = {
      customer_invoice: true,
      supplier_invoice: true,
      api_configurations: [{
        event: "supplier-invoice",
        callback: {
          url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/openapi-fatture-ricevute`,
          method: "JSON",
          field: "data",
          retry: 3,
          headers: { "x-callback-token": await gettoneCallback(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!) },
        },
      }],
    };
    const senzaCallback = { customer_invoice: true, supplier_invoice: true };
    const auth = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
    // deno-lint-ignore no-explicit-any
    const chiama = async (metodo: string, url: string, corpo: unknown): Promise<{ ok: boolean; status: number; result: any }> => {
      const resp = await fetch(url, { method: metodo, headers: auth, body: JSON.stringify(corpo) });
      const result = await resp.json().catch((): null => null);
      // Serve un corpo leggibile: un 200 vuoto non è una conferma.
      return { ok: resp.ok && !!result && result.success !== false, status: resp.status, result };
    };
    const giaPresente = (result: { error?: unknown; message?: unknown } | null) =>
      result?.error === 111 || /already exists/i.test(String(result?.message || ""));

    // Registrazione cedente (idempotente). Tre corpi, dal più completo a quello
    // di prima del 24/09: si scende solo se openapi rifiuta i dati (4xx), non se
    // è giù (5xx o rete), che si ritenta col prossimo clic.
    let stato = "errore";
    let lastError: string | null = null;
    let providerConfigId: string | null = null;
    let ricezioneStato: string | null = null;
    try {
      const corpi: Array<[string, Record<string, unknown>]> = [
        ["con_callback", { fiscal_id: fiscalId, name, email, ...ricezione }],
        ["senza_callback", { fiscal_id: fiscalId, name, email, ...senzaCallback }],
        ["solo_invio", { fiscal_id: fiscalId, name, email }],
      ];
      for (const [tipo, corpo] of corpi) {
        const r = await chiama("POST", `https://${invBase}/IT-configurations`, corpo);
        if (r.ok) {
          stato = "registrato";
          providerConfigId = r.result?.data?.id || r.result?.data?.uuid || null;
          ricezioneStato = tipo;
          lastError = null;
          break;
        }
        if (giaPresente(r.result)) {
          stato = "registrato"; // già presente → ok, si aggiorna la configurazione
          const url = `https://${invBase}/IT-configurations/${fiscalId}`;
          const p1 = await chiama("PATCH", url, ricezione);
          const p2 = p1.ok ? p1 : await chiama("PATCH", url, senzaCallback);
          ricezioneStato = p1.ok ? "con_callback" : p2.ok ? "senza_callback" : "non_aggiornata";
          if (!p2.ok) lastError = `Ricezione non attivata su openapi: ${p2.result?.message || `HTTP ${p2.status}`}`;
          break;
        }
        lastError = r.result?.message || `HTTP ${r.status}`;
        if (r.status >= 500) break;
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
      // Com'è stata configurata la ricezione: con la callback, solo col giro
      // orario, o per niente (registrazione di prima del 24/09).
      ricezione_openapi: ricezioneStato,
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
        ? "Azienda registrata: le fatture partono allo SDI. Per ricevere qui quelle dei fornitori, registra all'Agenzia delle Entrate il codice destinatario PIC7CPS."
        : "Registrazione fallita: verifica i dati anagrafici e il token openapi.",
    }, stato === "registrato" ? 200 : 502);
  } catch (err) {
    return json({ error: `Errore interno: ${(err as Error).message}` }, 500);
  }
});
