/**
 * Edge Function: sr-public-progetto
 *
 * Endpoint PUBBLICO (no auth) per il microsito cliente.
 * Restituisce i dati minimi necessari per visualizzare il preventivo
 * via token firmato (sr_progetti.public_token).
 *
 * Sicurezza:
 *  - Solo progetti con stato in (da_consegnare, consegnato, in_valutazione, accettato)
 *  - Solo se public_token è fornito e combacia
 *  - Non espone note_interne, prezzi_unitari serramenti, costo medio finanziamento
 *
 * Body: { token: string }
 * Output: { ok, progetto, pdf_url, azienda }
 */
import { jsonResponse, errorResponse } from "../_shared/headers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS pubblico per microsito (qualsiasi origine)
const PUBLIC_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

interface Payload {
  token: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: PUBLIC_CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, PUBLIC_CORS_HEADERS);

  try {
    const p = (await req.json()) as Payload;
    if (!p.token || typeof p.token !== "string" || p.token.length < 16) {
      return errorResponse("Token mancante o non valido", 400, PUBLIC_CORS_HEADERS);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Carica il progetto via token
    const { data: prog, error: progErr } = await sb
      .from("sr_progetti")
      .select(`
        id, code, stato, company_id,
        cliente_nome, cliente_cognome, cliente_citta, cliente_indirizzo,
        cantiere_citta, cantiere_indirizzo,
        tipo_intervento, intervento_titolo, intervento_sintesi,
        totale_serramenti, totale_accessori,
        totale_min, totale_max, iva_inclusa,
        risparmio_eur_anno, detrazione_aliquota, detrazione_eur_totale,
        payback_anni, co2_risparmiata_t_anno,
        consulenza_at, consulenza_luogo, consulente_id,
        crono_giorni_produzione, crono_giorni_posa, crono_giorni_collaudo,
        valido_fino_data,
        pdf_html_url, public_token,
        allow_self_signing, firmato_il
      `)
      .eq("public_token", p.token)
      .maybeSingle();

    if (progErr || !prog) {
      return errorResponse("Stima non trovata o link scaduto", 404, PUBLIC_CORS_HEADERS);
    }

    // Verifica stato visibile pubblicamente
    const visibleStati = ["da_consegnare", "consegnato", "in_valutazione", "accettato"];
    if (!visibleStati.includes(prog.stato)) {
      return errorResponse("Stima non disponibile al momento", 403, PUBLIC_CORS_HEADERS);
    }

    // Carica azienda branding
    const { data: company } = await sb
      .from("companies")
      .select("name, business_name, legal_address, legal_city, legal_postal_code, legal_province, phone, email, vat_number, logo_url")
      .eq("id", prog.company_id)
      .maybeSingle();

    // Carica template PDF (per logo/branding fallback)
    const { data: tpl } = await sb
      .from("sr_template_pdf")
      .select("ragione_sociale, telefono, email, indirizzo_completo, logo_url, colore_primario, partita_iva")
      .eq("company_id", prog.company_id)
      .maybeSingle();

    // Carica consulente
    let consulente = null;
    if (prog.consulente_id) {
      const { data: cons } = await sb
        .from("profiles")
        .select("first_name, last_name, email, phone")
        .eq("id", prog.consulente_id)
        .maybeSingle();
      if (cons) {
        consulente = {
          nome: [cons.first_name, cons.last_name].filter(Boolean).join(" ") || "Consulente",
          email: cons.email,
          telefono: cons.phone,
        };
      }
    }

    // Rinfresca signed URL del PDF (lo signed dura 7g, se scaduto serve refresh)
    let pdfUrl = prog.pdf_html_url;
    if (pdfUrl) {
      try {
        const url = new URL(pdfUrl);
        const pathMatch = url.pathname.match(/sr-progetti\/(.+)/);
        if (pathMatch) {
          const storagePath = pathMatch[1].split("?")[0];
          const { data: signed } = await sb.storage
            .from("sr-progetti")
            .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
          if (signed?.signedUrl) pdfUrl = signed.signedUrl;
        }
      } catch {
        // fallback: mantieni URL originale
      }
    }

    const companyAddress = [
      company?.legal_address,
      [company?.legal_postal_code, company?.legal_city].filter(Boolean).join(" "),
      company?.legal_province,
    ].filter(Boolean).join(", ");

    return jsonResponse({
      ok: true,
      progetto: {
        code: prog.code,
        stato: prog.stato,
        cliente_nome: prog.cliente_nome,
        cliente_cognome: prog.cliente_cognome,
        cliente_citta: prog.cliente_citta,
        cantiere_citta: prog.cantiere_citta,
        tipo_intervento: prog.tipo_intervento,
        intervento_titolo: prog.intervento_titolo,
        intervento_sintesi: prog.intervento_sintesi,
        totale_serramenti: prog.totale_serramenti,
        totale_min: Number(prog.totale_min) || 0,
        totale_max: Number(prog.totale_max) || 0,
        iva_inclusa: !!prog.iva_inclusa,
        risparmio_eur_anno: prog.risparmio_eur_anno != null ? Number(prog.risparmio_eur_anno) : null,
        detrazione_eur_totale: prog.detrazione_eur_totale != null ? Number(prog.detrazione_eur_totale) : null,
        payback_anni: prog.payback_anni != null ? Number(prog.payback_anni) : null,
        co2_risparmiata_t_anno: prog.co2_risparmiata_t_anno != null ? Number(prog.co2_risparmiata_t_anno) : null,
        consulenza_at: prog.consulenza_at,
        consulenza_luogo: prog.consulenza_luogo,
        valido_fino_data: prog.valido_fino_data,
        allow_self_signing: !!prog.allow_self_signing,
        firmato_il: prog.firmato_il,
      },
      pdf_url: pdfUrl,
      azienda: {
        nome: tpl?.ragione_sociale || company?.business_name || company?.name || "Azienda",
        indirizzo: tpl?.indirizzo_completo || companyAddress || null,
        telefono: tpl?.telefono || company?.phone,
        email: tpl?.email || company?.email,
        // Come nel PDF: prima la P.IVA del modello, poi quella dell'anagrafica.
        partita_iva: tpl?.partita_iva || company?.vat_number,
        logo_url: tpl?.logo_url || company?.logo_url,
        colore_primario: tpl?.colore_primario || "#2D7D5C",
      },
      consulente,
    }, 200, PUBLIC_CORS_HEADERS);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sr-public-progetto] error", msg);
    return errorResponse("Errore caricamento stima", 500, PUBLIC_CORS_HEADERS);
  }
});
