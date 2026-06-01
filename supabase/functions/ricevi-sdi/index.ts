// supabase/functions/ricevi-sdi/index.ts
// Edge Function per ricevere fatture passive dal SDI (via webhook Aruba o upload manuale)
// Parsea XML FatturaPA, estrae i dati e salva in fatture_ricevute

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";
import { corsHeaders } from "../_shared/headers.ts";
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";

// ─── XML Parser Helpers (DOMParser via deno-dom WASM) ─────────────

function getTagText(doc: Document, tag: string): string {
  const el = doc.getElementsByTagName(tag)[0];
  return el?.textContent?.trim() ?? "";
}

function getTagNum(doc: Document, tag: string): number {
  const v = getTagText(doc, tag);
  return v ? parseFloat(v) || 0 : 0;
}

interface ParsedFattura {
  cedente_piva: string;
  cedente_cf: string;
  cedente_ragione_sociale: string;
  cedente_paese: string;
  cedente_indirizzo: string;
  cedente_cap: string;
  cedente_comune: string;
  cedente_provincia: string;
  tipo_documento: string;
  numero_fattura: string;
  data_fattura: string;
  imponibile_totale: number;
  iva_totale: number;
  totale_documento: number;
  righe: Array<Record<string, unknown>>;
  riepilogo_iva: Array<Record<string, unknown>>;
  sdi_id_trasmissione: string;
  sdi_progressivo: string;
}

function parseFatturaPA(xmlString: string): ParsedFattura {
  const doc = new DOMParser().parseFromString(xmlString, "text/xml");
  if (!doc) {
    throw new Error("XML FatturaPA non parsabile (body vuoto o non valido)");
  }

  // Trasmissione
  const sdiId = getTagText(doc, "IdentificativoSdI");
  const progressivo = getTagText(doc, "ProgressivoInvio");

  // Cedente (fornitore)
  const cedenti = doc.getElementsByTagName("CedentePrestatore");
  const ced = cedenti[0];
  let cedPiva = "";
  let cedCf = "";
  let cedRagSoc = "";
  let cedPaese = "IT";
  let cedIndirizzo = "";
  let cedCap = "";
  let cedComune = "";
  let cedProvincia = "";

  if (ced) {
    const idFiscale = ced.getElementsByTagName("IdFiscaleIVA")[0];
    if (idFiscale) {
      cedPaese = idFiscale.getElementsByTagName("IdPaese")[0]?.textContent?.trim() ?? "IT";
      cedPiva = idFiscale.getElementsByTagName("IdCodice")[0]?.textContent?.trim() ?? "";
    }
    cedCf = ced.getElementsByTagName("CodiceFiscale")[0]?.textContent?.trim() ?? "";
    cedRagSoc = ced.getElementsByTagName("Denominazione")[0]?.textContent?.trim() ?? "";
    if (!cedRagSoc) {
      const nome = ced.getElementsByTagName("Nome")[0]?.textContent?.trim() ?? "";
      const cognome = ced.getElementsByTagName("Cognome")[0]?.textContent?.trim() ?? "";
      cedRagSoc = [nome, cognome].filter(Boolean).join(" ");
    }
    const sede = ced.getElementsByTagName("Sede")[0];
    if (sede) {
      cedIndirizzo = sede.getElementsByTagName("Indirizzo")[0]?.textContent?.trim() ?? "";
      cedCap = sede.getElementsByTagName("CAP")[0]?.textContent?.trim() ?? "";
      cedComune = sede.getElementsByTagName("Comune")[0]?.textContent?.trim() ?? "";
      cedProvincia = sede.getElementsByTagName("Provincia")[0]?.textContent?.trim() ?? "";
    }
  }

  // Dati generali documento
  const tipoDoc = getTagText(doc, "TipoDocumento") || "TD01";
  const numero = getTagText(doc, "Numero");
  const data = getTagText(doc, "Data");
  const totaleDocs = getTagNum(doc, "ImportoTotaleDocumento");

  // Righe (DettaglioLinee)
  const righeNodes = doc.getElementsByTagName("DettaglioLinee");
  const righe: Array<Record<string, unknown>> = [];
  let imponibileTot = 0;

  for (let i = 0; i < righeNodes.length; i++) {
    const r = righeNodes[i];
    const descrizione = r.getElementsByTagName("Descrizione")[0]?.textContent?.trim() ?? "";
    const quantita = parseFloat(r.getElementsByTagName("Quantita")[0]?.textContent ?? "1") || 1;
    const prezzoUnitario = parseFloat(r.getElementsByTagName("PrezzoUnitario")[0]?.textContent ?? "0") || 0;
    const prezzoTotale = parseFloat(r.getElementsByTagName("PrezzoTotale")[0]?.textContent ?? "0") || 0;
    const aliquotaIva = parseFloat(r.getElementsByTagName("AliquotaIVA")[0]?.textContent ?? "22") || 0;
    const natura = r.getElementsByTagName("Natura")[0]?.textContent?.trim() ?? null;

    imponibileTot += prezzoTotale;
    righe.push({
      numero_linea: i + 1,
      descrizione,
      quantita,
      prezzo_unitario: prezzoUnitario,
      imponibile: prezzoTotale,
      aliquota_iva: String(aliquotaIva),
      natura_iva: natura,
    });
  }

  // Riepilogo IVA (DatiRiepilogo)
  const riepilogoNodes = doc.getElementsByTagName("DatiRiepilogo");
  const riepilogoIva: Array<Record<string, unknown>> = [];
  let ivaTot = 0;

  for (let i = 0; i < riepilogoNodes.length; i++) {
    const r = riepilogoNodes[i];
    const aliquota = parseFloat(r.getElementsByTagName("AliquotaIVA")[0]?.textContent ?? "0") || 0;
    const imponibile = parseFloat(r.getElementsByTagName("ImponibileImporto")[0]?.textContent ?? "0") || 0;
    const imposta = parseFloat(r.getElementsByTagName("Imposta")[0]?.textContent ?? "0") || 0;
    const natura = r.getElementsByTagName("Natura")[0]?.textContent?.trim() ?? null;

    ivaTot += imposta;
    riepilogoIva.push({ aliquota: String(aliquota), natura, imponibile, imposta });
  }

  return {
    cedente_piva: cedPiva,
    cedente_cf: cedCf,
    cedente_ragione_sociale: cedRagSoc || "Fornitore sconosciuto",
    cedente_paese: cedPaese,
    cedente_indirizzo: cedIndirizzo,
    cedente_cap: cedCap,
    cedente_comune: cedComune,
    cedente_provincia: cedProvincia,
    tipo_documento: tipoDoc,
    numero_fattura: numero,
    data_fattura: data,
    imponibile_totale: Math.round(imponibileTot * 100) / 100,
    iva_totale: Math.round(ivaTot * 100) / 100,
    totale_documento: totaleDocs || Math.round((imponibileTot + ivaTot) * 100) / 100,
    righe,
    riepilogo_iva: riepilogoIva,
    sdi_id_trasmissione: sdiId,
    sdi_progressivo: progressivo,
  };
}

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

      const parsed = parseFatturaPA(xmlBody);

      // Find company by P.IVA del cessionario (l'azienda che riceve la fattura)
      const xmlDoc = new DOMParser().parseFromString(xmlBody, "text/xml");
      if (!xmlDoc) {
        await supabase.from("sdi_log").insert({
          company_id: null as unknown as string,
          evento: "ricevi_sdi_parse_failed",
          messaggio: "XML body non parsabile in webhook handler",
          xml_content: xmlBody.slice(0, 5000),
        }).then(() => {}, () => {});
        return new Response("Bad request: invalid XML", { status: 400 });
      }
      const cessionario = xmlDoc.getElementsByTagName("CessionarioCommittente")[0];
      const destPiva =
        cessionario?.getElementsByTagName("IdCodice")[0]?.textContent?.trim() ?? "";

      const { data: azienda } = await supabase
        .from("anagrafica_azienda")
        .select("company_id")
        .eq("partita_iva", destPiva)
        .single();

      if (!azienda) {
        // Log: nessuna azienda trovata per questa P.IVA destinatario
        await supabase.from("sdi_log").insert({
          company_id: null as unknown as string,
          evento: "fattura_ricevuta_no_match",
          messaggio: `P.IVA destinatario ${destPiva} non trovata`,
          xml_content: xmlBody.slice(0, 5000),
        }).then(() => {}, () => {});
        return new Response("OK", { status: 200 });
      }

      // Upload XML to storage
      const xmlPath = `${azienda.company_id}/ricevute/IT${parsed.cedente_piva}_${parsed.numero_fattura.replace(/[^a-zA-Z0-9-]/g, "_")}.xml`;
      await supabase.storage
        .from("fatture-xml")
        .upload(xmlPath, new Blob([xmlBody], { type: "application/xml" }), { upsert: true });

      // Check duplicato
      if (parsed.sdi_id_trasmissione) {
        const { data: existing } = await supabase
          .from("fatture_ricevute")
          .select("id")
          .eq("sdi_id_trasmissione", parsed.sdi_id_trasmissione)
          .maybeSingle();

        if (existing) {
          return new Response(JSON.stringify({ success: true, duplicate: true, id: existing.id }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Insert
      const { data: inserted, error: insertErr } = await supabase
        .from("fatture_ricevute")
        .insert({
          company_id: azienda.company_id,
          sdi_id_trasmissione: parsed.sdi_id_trasmissione || null,
          sdi_progressivo: parsed.sdi_progressivo || null,
          cedente_piva: parsed.cedente_piva,
          cedente_cf: parsed.cedente_cf,
          cedente_ragione_sociale: parsed.cedente_ragione_sociale,
          cedente_paese: parsed.cedente_paese,
          cedente_indirizzo: parsed.cedente_indirizzo,
          cedente_cap: parsed.cedente_cap,
          cedente_comune: parsed.cedente_comune,
          cedente_provincia: parsed.cedente_provincia,
          tipo_documento: parsed.tipo_documento,
          numero_fattura: parsed.numero_fattura,
          data_fattura: parsed.data_fattura,
          imponibile_totale: parsed.imponibile_totale,
          iva_totale: parsed.iva_totale,
          totale_documento: parsed.totale_documento,
          righe: parsed.righe,
          riepilogo_iva: parsed.riepilogo_iva,
          xml_raw: xmlBody,
          xml_url: xmlPath,
          stato: "non_letta",
        })
        .select("id")
        .single();

      if (insertErr) throw insertErr;

      // Log
      await supabase.from("sdi_log").insert({
        company_id: azienda.company_id,
        documento_id: inserted?.id,
        evento: "fattura_ricevuta",
        sdi_id: parsed.sdi_id_trasmissione,
        messaggio: `Fattura ricevuta da ${parsed.cedente_ragione_sociale} - ${parsed.numero_fattura}`,
        xml_content: xmlBody.slice(0, 5000),
      });

      // ── Notifica in-app agli admin dell'azienda ──
      try {
        const { data: adminRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("company_id", azienda.company_id)
          .in("role", ["company_admin", "admin"]);

        if (adminRoles && adminRoles.length > 0) {
          await supabase.from("notifications").insert(
            adminRoles.map((r: any) => ({
              company_id: azienda.company_id,
              user_id: r.user_id,
              type: "fattura_ricevuta",
              title: "Nuova fattura passiva ricevuta",
              body: `Fattura ${parsed.numero_fattura} da ${parsed.cedente_ragione_sociale} — €${parsed.totale_documento.toFixed(2)}`,
              entity_type: "fattura_ricevuta",
              entity_id: inserted?.id,
              action_url: "/azienda/fatturazione/ricevute",
            }))
          );
        }
      } catch (notifErr) {
        // Notifica non critica — logga ma non bloccare
        console.warn("Notifica fattura ricevuta fallita:", notifErr);
      }

      return new Response(
        JSON.stringify({ success: true, id: inserted?.id }),
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

      const parsed = parseFatturaPA(xml_content);

      // Upload XML to storage
      const xmlPath = `${company_id}/ricevute/IT${parsed.cedente_piva}_${parsed.numero_fattura.replace(/[^a-zA-Z0-9-]/g, "_")}.xml`;
      await supabase.storage
        .from("fatture-xml")
        .upload(xmlPath, new Blob([xml_content], { type: "application/xml" }), { upsert: true });

      // Check duplicate
      if (parsed.sdi_id_trasmissione) {
        const { data: existing } = await supabase
          .from("fatture_ricevute")
          .select("id")
          .eq("sdi_id_trasmissione", parsed.sdi_id_trasmissione)
          .maybeSingle();

        if (existing) {
          return new Response(JSON.stringify({ success: true, duplicate: true, id: existing.id }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const { data: inserted, error: insertErr } = await supabase
        .from("fatture_ricevute")
        .insert({
          company_id,
          sdi_id_trasmissione: parsed.sdi_id_trasmissione || null,
          sdi_progressivo: parsed.sdi_progressivo || null,
          cedente_piva: parsed.cedente_piva,
          cedente_cf: parsed.cedente_cf,
          cedente_ragione_sociale: parsed.cedente_ragione_sociale,
          cedente_paese: parsed.cedente_paese,
          cedente_indirizzo: parsed.cedente_indirizzo,
          cedente_cap: parsed.cedente_cap,
          cedente_comune: parsed.cedente_comune,
          cedente_provincia: parsed.cedente_provincia,
          tipo_documento: parsed.tipo_documento,
          numero_fattura: parsed.numero_fattura,
          data_fattura: parsed.data_fattura,
          imponibile_totale: parsed.imponibile_totale,
          iva_totale: parsed.iva_totale,
          totale_documento: parsed.totale_documento,
          righe: parsed.righe,
          riepilogo_iva: parsed.riepilogo_iva,
          xml_raw: xml_content,
          xml_url: xmlPath,
          stato: "non_letta",
        })
        .select("id")
        .single();

      if (insertErr) throw insertErr;

      return new Response(
        JSON.stringify({ success: true, id: inserted?.id, parsed }),
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
