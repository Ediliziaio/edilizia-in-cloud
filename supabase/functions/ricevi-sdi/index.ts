// supabase/functions/ricevi-sdi/index.ts
// Edge Function per ricevere fatture passive dal SDI (via webhook Aruba o upload manuale)
// Parsea XML FatturaPA, estrae i dati e salva in fatture_ricevute.
//
// Dal 24/09/2026 lettura e salvataggio stanno in _shared (fatturaRicevutaXml.ts
// e salvaFatturaRicevuta.ts): li usa anche openapi-fatture-ricevute, e le due
// strade devono registrare la stessa fattura allo stesso modo.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";
import { corsHeaders } from "../_shared/headers.ts";
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";
import type { LettoreXml } from "../_shared/fatturapaReader.ts";
import { leggiFatturaRicevuta } from "../_shared/fatturaRicevutaXml.ts";
import { avvisaFatturaRicevuta, salvaFatturaRicevuta } from "../_shared/salvaFatturaRicevuta.ts";

const lettore = () => new DOMParser() as unknown as LettoreXml;

// ─── Main Handler ────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const contentType = req.headers.get("content-type") ?? "";

    // Two modes:
    // 1. Webhook from SDI provider (XML body + signature)
    // 2. Manual upload from authenticated user (JSON with xml_content + company_id)

    if (contentType.includes("application/xml") || contentType.includes("text/xml")) {
      // ── MODE 1: Webhook (XML body) ──
      const secret = Deno.env.get("BILLING_WEBHOOK_SECRET");
      if (!secret) {
        return new Response("Server configuration error", { status: 500 });
      }

      const signature = req.headers.get("x-webhook-signature") || req.headers.get("x-signature");
      if (!signature) {
        return new Response("Unauthorized: missing signature", { status: 401 });
      }

      const xmlBody = await req.text();

      // HMAC verification
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(xmlBody));
      const expectedSig = Array.from(new Uint8Array(sigBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      if (signature !== expectedSig) {
        return new Response("Unauthorized: invalid signature", { status: 401 });
      }

      const parsed = leggiFatturaRicevuta(xmlBody, lettore());
      if (!parsed) {
        await supabase.from("sdi_log").insert({
          company_id: null as unknown as string,
          evento: "ricevi_sdi_parse_failed",
          messaggio: "XML body non parsabile in webhook handler",
          xml_content: xmlBody.slice(0, 5000),
        }).then(() => {}, () => {});
        return new Response("Bad request: invalid XML", { status: 400 });
      }

      // Find company by P.IVA del cessionario (l'azienda che riceve la fattura)
      const destPiva = parsed.cessionario_piva;
      const destCf = parsed.cessionario_cf;

      // Match per P.IVA del cessionario, con fallback al Codice Fiscale (cessionari
      // identificati solo da CF). maybeSingle + limit(1): niente 500 se due aziende
      // condividono/typo la stessa P.IVA.
      let azienda: { company_id: string } | null = null;
      if (destPiva) {
        const { data } = await supabase.from("anagrafica_azienda")
          .select("company_id").eq("partita_iva", destPiva).limit(1).maybeSingle();
        azienda = data ?? null;
      }
      if (!azienda && destCf) {
        const { data } = await supabase.from("anagrafica_azienda")
          .select("company_id").eq("codice_fiscale", destCf).limit(1).maybeSingle();
        azienda = data ?? null;
      }

      if (!azienda) {
        // Log: nessuna azienda trovata per questo destinatario
        await supabase.from("sdi_log").insert({
          company_id: null as unknown as string,
          evento: "fattura_ricevuta_no_match",
          messaggio: `Destinatario non trovato (P.IVA ${destPiva || "—"} / CF ${destCf || "—"})`,
          xml_content: xmlBody.slice(0, 5000),
        }).then(() => {}, () => {});
        return new Response("OK", { status: 200 });
      }

      // Doppione (id SDI o fornitore + numero + data), file, riga: una strada sola.
      const esito = await salvaFatturaRicevuta(supabase, { companyId: azienda.company_id, xml: xmlBody, letta: parsed });
      if (esito.errore) throw new Error(esito.errore);
      if (esito.doppione) {
        // Anche la corsa concorrente (23505) è un doppione: 200, così il
        // provider non ritenta all'infinito.
        return new Response(JSON.stringify({ success: true, duplicate: true, id: esito.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Log. Niente documento_id: in sdi_log punta a documenti_fiscali (le
      // emesse), e l'id di una ricevuta faceva fallire la riga in silenzio.
      await supabase.from("sdi_log").insert({
        company_id: azienda.company_id,
        evento: "fattura_ricevuta",
        sdi_id: parsed.sdi_id_trasmissione,
        messaggio: `Fattura ricevuta da ${parsed.cedente_ragione_sociale} - ${parsed.numero_fattura}`,
        xml_content: xmlBody.slice(0, 5000),
      });

      // ── Notifica in-app agli admin dell'azienda ──
      if (esito.id) await avvisaFatturaRicevuta(supabase, azienda.company_id, esito.id, parsed);

      return new Response(
        JSON.stringify({ success: true, id: esito.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // ── MODE 2: Upload manuale (JSON body con JWT auth) ──
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Non autorizzato" }), {
          status: 401,
          headers: corsHeaders,
        });
      }

      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Non autorizzato" }), {
          status: 401,
          headers: corsHeaders,
        });
      }

      const { xml_content, company_id } = await req.json();
      if (!xml_content || !company_id) {
        return new Response(
          JSON.stringify({ error: "xml_content e company_id obbligatori" }),
          { status: 400, headers: corsHeaders }
        );
      }

      // SECURITY: company_id arriva dal body — verifica che l'utente appartenga
      // a quell'azienda prima di scrivere fatture/storage (anti cross-tenant).
      try {
        await verifyCompanyAccess(supabase, user.id, company_id);
      } catch {
        return new Response(JSON.stringify({ error: "Accesso negato a questa azienda" }), {
          status: 403,
          headers: corsHeaders,
        });
      }

      const parsed = leggiFatturaRicevuta(String(xml_content), lettore());
      if (!parsed) {
        return new Response(
          JSON.stringify({ error: "Il file non è una fattura elettronica leggibile (mancano fornitore, numero o data)." }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const esito = await salvaFatturaRicevuta(supabase, { companyId: company_id, xml: String(xml_content), letta: parsed });
      if (esito.errore) throw new Error(esito.errore);
      if (esito.doppione) {
        return new Response(JSON.stringify({ success: true, duplicate: true, id: esito.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ success: true, id: esito.id, parsed }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (e) {
    console.error("ricevi-sdi error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
