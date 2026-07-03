import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";

Deno.serve(async (req: Request) => {
  const corsH = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsH });
  }

  const errore = (status: number, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsH, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return errore(400, "token obbligatorio");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Carica sigReq via token
    const { data: sigReq, error: fetchErr } = await supabaseAdmin
      .from("signature_requests")
      .select("id, status, tipo_documento, tipo_firmatario, signer_name, signer_email, expires_at, sessione_id, order_id, quote_id, company_id, signed_at")
      .eq("token", token)
      .single();

    if (fetchErr || !sigReq) {
      return errore(404, "Link di firma non trovato o scaduto");
    }

    // Guardia stato: link non più utilizzabile (annullato, scaduto o rifiutato).
    // NB: 'signed' è gestito subito dopo con schermata di conferma dedicata.
    if (sigReq.status === "expired" || sigReq.status === "cancelled") {
      return errore(410, "Questo link di firma non è più valido: è scaduto o è stato annullato.");
    }
    if (sigReq.status === "refused") {
      return errore(410, "Questo documento è stato rifiutato e non è più firmabile.");
    }

    // Guardia scadenza server-side: se la data di scadenza è passata e il documento
    // non è stato firmato, il link è scaduto (410) — non aprire il documento.
    if (
      sigReq.status !== "signed" &&
      sigReq.expires_at &&
      new Date(sigReq.expires_at) < new Date()
    ) {
      // Allinea lo stato in DB (best-effort) così i controlli successivi sono coerenti.
      await supabaseAdmin
        .from("signature_requests")
        .update({ status: "expired" })
        .eq("id", sigReq.id)
        .neq("status", "signed");
      return errore(410, "Link di firma scaduto");
    }

    // Già firmato: non esporre l'intero flusso, solo i dati per la conferma
    if (sigReq.status === "signed") {
      return new Response(
        JSON.stringify({
          already_signed: true,
          signed_at: sigReq.signed_at ?? null,
          tipo_documento: sigReq.tipo_documento ?? "order",
          signer_name: sigReq.signer_name,
        }),
        { status: 200, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // Nome azienda
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("name")
      .eq("id", sigReq.company_id)
      .single();

    const branding = await getBrandingForCompany(supabaseAdmin, sigReq.company_id);
    const azienda_nome = company?.name ?? branding.platformName;

    // Carica dettagli documento in base al tipo
    let documento_titolo = "Documento";
    let pdf_url: string | null = null;

    const tipo = sigReq.tipo_documento ?? "order";

    if (tipo === "sessione" && sigReq.sessione_id) {
      const { data: sessione } = await supabaseAdmin
        .from("documento_sessioni")
        .select("nome, pdf_url")
        .eq("id", sigReq.sessione_id)
        .single();
      if (sessione) {
        documento_titolo = sessione.nome;
        pdf_url = sessione.pdf_url ?? null;
      }
    } else if (tipo === "quote" && sigReq.quote_id) {
      const { data: quote } = await supabaseAdmin
        .from("quotes")
        .select("title, quote_number")
        .eq("id", sigReq.quote_id)
        .single();
      if (quote) {
        documento_titolo = `Preventivo ${quote.quote_number}`;
      }
    } else if (tipo === "order" && sigReq.order_id) {
      const { data: order } = await supabaseAdmin
        .from("orders")
        .select("order_code, description")
        .eq("id", sigReq.order_id)
        .single();
      if (order) {
        documento_titolo = `Ordine ${order.order_code}`;
      }
    } else if (tipo === "odv") {
      documento_titolo = "Variante";
    }

    // Per B2C: carica fea_configurazione
    let b2c_testo_recesso: string | null = null;
    let b2c_clausole: unknown[] | null = null;

    if (sigReq.tipo_firmatario === "b2c") {
      const { data: feaConfig } = await supabaseAdmin
        .from("fea_configurazione")
        .select("testo_recesso_b2c, clausole_vess")
        .eq("company_id", sigReq.company_id)
        .single();

      if (feaConfig) {
        b2c_testo_recesso = feaConfig.testo_recesso_b2c ?? null;
        b2c_clausole = feaConfig.clausole_vess ?? null;
      }
    }

    // Audit log link_aperto
    await supabaseAdmin.from("fea_audit_log").insert({
      request_id: sigReq.id,
      company_id: sigReq.company_id,
      evento: "link_aperto",
      ip: req.headers.get("x-forwarded-for") ?? null,
      user_agent: req.headers.get("user-agent") ?? null,
    });

    // Costruisci e ritorna payload FEASessionePubblica
    const payload = {
      request_id: sigReq.id,
      tipo_documento: tipo,
      tipo_firmatario: sigReq.tipo_firmatario,
      signer_name: sigReq.signer_name,
      azienda_nome,
      documento_titolo,
      pdf_url,
      status: sigReq.status,
      expires_at: sigReq.expires_at,
      signed_at: sigReq.signed_at ?? null,
      b2c_testo_recesso,
      b2c_clausole,
    };

    return new Response(
      JSON.stringify(payload),
      { status: 200, headers: { ...corsH, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("fea-documento-pubblico error:", err);
    return new Response(
      JSON.stringify({ error: "Errore interno del server" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
