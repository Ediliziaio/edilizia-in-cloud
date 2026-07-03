import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

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
    const { token, motivo } = body;

    if (!token) {
      return errore(400, "token obbligatorio");
    }

    // IP dal header
    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? null;
    const userAgent = req.headers.get("user-agent") ?? null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Carica signature_request via token
    const { data: sigReq, error: fetchErr } = await supabaseAdmin
      .from("signature_requests")
      .select("id, status, company_id, quote_id")
      .eq("token", token)
      .single();

    if (fetchErr || !sigReq) {
      return errore(404, "Link di firma non trovato");
    }

    // Già firmato: non si può rifiutare
    if (sigReq.status === "signed") {
      return errore(409, "Documento già firmato");
    }

    // Già rifiutato: idempotente, ritorna ok senza riscrivere
    if (sigReq.status === "refused") {
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // Link non più utilizzabile (scaduto o annullato)
    if (sigReq.status === "expired" || sigReq.status === "cancelled") {
      return errore(410, "Questo link di firma non è più valido: è scaduto o è stato annullato.");
    }

    const ora = new Date().toISOString();
    const motivoPulito = typeof motivo === "string" && motivo.trim().length > 0
      ? motivo.trim()
      : null;

    // Aggiorna signature_requests → refused
    const { error: updateErr } = await supabaseAdmin
      .from("signature_requests")
      .update({
        status: "refused",
        refused_at: ora,
        rifiuto_motivo: motivoPulito,
        updated_at: ora,
      })
      .eq("id", sigReq.id);

    if (updateErr) {
      console.error("fea-rifiuta-firma update error:", updateErr);
      return errore(500, "Errore nella registrazione del rifiuto. Riprova tra qualche istante.");
    }

    // Audit log firma_rifiutata
    await supabaseAdmin.from("fea_audit_log").insert({
      request_id: sigReq.id,
      company_id: sigReq.company_id,
      evento: "firma_rifiutata",
      ip,
      user_agent: userAgent,
      metadati: { motivo: motivoPulito },
    });

    // Sync preventivo collegato: 'rifiutata' è uno stato valido di quotes (QuoteStatus).
    // Non-bloccante: un errore qui non deve invalidare il rifiuto già registrato.
    if (sigReq.quote_id) {
      const { error: quoteUpdateErr } = await supabaseAdmin
        .from("quotes")
        .update({ status: "rifiutata", updated_at: ora })
        .eq("id", sigReq.quote_id)
        .eq("company_id", sigReq.company_id);

      if (quoteUpdateErr) {
        console.error("fea-rifiuta-firma quote sync error:", quoteUpdateErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsH, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("fea-rifiuta-firma error:", err);
    return new Response(
      JSON.stringify({ error: "Errore interno del server" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
