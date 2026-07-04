import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

// Risolve l'utente "proprietario" del documento a cui inviare la notifica:
//  - quote → quotes.assigned_to || quotes.created_by
//  - order/odv/fv → orders.assigned_to || orders.created_by
//  - fallback → signature_requests.created_by
// deno-lint-ignore no-explicit-any
async function risolviOwner(admin: any, sigReq: {
  created_by?: string | null;
  tipo_documento?: string | null;
  quote_id?: string | null;
  order_id?: string | null;
}): Promise<string | null> {
  try {
    if (sigReq.tipo_documento === "quote" && sigReq.quote_id) {
      const { data } = await admin
        .from("quotes")
        .select("created_by, assigned_to")
        .eq("id", sigReq.quote_id)
        .single();
      const owner = data?.assigned_to || data?.created_by;
      if (owner) return owner;
    } else if (
      (sigReq.tipo_documento === "order" || sigReq.tipo_documento === "odv" || sigReq.tipo_documento === "fv") &&
      sigReq.order_id
    ) {
      const { data } = await admin
        .from("orders")
        .select("created_by, assigned_to")
        .eq("id", sigReq.order_id)
        .single();
      const owner = data?.assigned_to || data?.created_by;
      if (owner) return owner;
    }
  } catch (e) {
    console.warn("risolviOwner lookup error:", e);
  }
  return sigReq.created_by ?? null;
}

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

    // Solo il PRIMO IP: x-forwarded-for arriva come lista "client, proxy…" e la
    // colonna audit è INET — il cast su lista fallisce e l'evento andrebbe perso.
    const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "")
      .split(",")[0].trim() || null;
    const userAgent = req.headers.get("user-agent") ?? null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Carica signature_request via token
    const { data: sigReq, error: fetchErr } = await supabaseAdmin
      .from("signature_requests")
      .select("id, status, company_id, quote_id, order_id, tipo_documento, signer_name, created_by")
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

    // Audit log firma_rifiutata (non bloccante, ma l'errore va loggato)
    const { error: auditErr } = await supabaseAdmin.from("fea_audit_log").insert({
      request_id: sigReq.id,
      company_id: sigReq.company_id,
      evento: "firma_rifiutata",
      ip,
      user_agent: userAgent,
      metadati: { motivo: motivoPulito },
    });
    if (auditErr) {
      console.error("fea-rifiuta-firma audit error:", auditErr);
    }

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

    // Notifica interna al titolare del documento: la firma è stata rifiutata.
    // Non bloccante: un errore qui non deve invalidare il rifiuto già registrato.
    try {
      const ownerId = await risolviOwner(supabaseAdmin, sigReq);
      if (ownerId) {
        const signerLabel = sigReq.signer_name ?? "il cliente";
        await supabaseAdmin.rpc("create_notification", {
          p_company_id: sigReq.company_id,
          p_user_id: ownerId,
          p_type: "documento_rifiutato",
          p_title: `Documento rifiutato da ${signerLabel}`,
          p_body: motivoPulito
            ? `${signerLabel} ha rifiutato la firma del documento. Motivo: ${motivoPulito}`
            : `${signerLabel} ha rifiutato la firma del documento.`,
          p_entity_type: "signature_request",
          p_entity_id: sigReq.id,
          p_action_url: "/azienda/firma-elettronica",
        });
      }
    } catch (notifyErr) {
      console.warn("fea-rifiuta-firma notify owner error:", notifyErr);
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
