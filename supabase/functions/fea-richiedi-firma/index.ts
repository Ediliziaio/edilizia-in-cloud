import { getCorsHeaders } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  const corsH = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsH });
  }

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    const body = await req.json();
    const {
      tipo_documento,
      documento_id,
      tipo_firmatario,
      signer_email,
      signer_name,
      expires_giorni = 30,
    } = body;

    // Validazione campi obbligatori
    if (!tipo_documento || !documento_id || !tipo_firmatario || !signer_email || !signer_name) {
      return new Response(
        JSON.stringify({ error: "Campi obbligatori mancanti: tipo_documento, documento_id, tipo_firmatario, signer_email, signer_name" }),
        { status: 400, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    if (!["order", "quote", "sessione", "odv"].includes(tipo_documento)) {
      return new Response(
        JSON.stringify({ error: "tipo_documento non valido" }),
        { status: 400, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    if (!["b2b", "b2c"].includes(tipo_firmatario)) {
      return new Response(
        JSON.stringify({ error: "tipo_firmatario non valido: b2b o b2c" }),
        { status: 400, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // Carica profilo utente
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("company_id, first_name, last_name")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      return new Response(
        JSON.stringify({ error: "Profilo utente non trovato" }),
        { status: 404, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    const company_id = profile.company_id;

    // Carica nome azienda
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("name")
      .eq("id", company_id)
      .single();

    const azienda_nome = company?.name ?? "Edilizia in Cloud";

    // Token univoco
    const token = crypto.randomUUID().replace(/-/g, "");

    // Calcola scadenza
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expires_giorni);

    // Costruisci insertPayload
    const insertPayload: Record<string, unknown> = {
      company_id,
      token,
      signer_email,
      signer_name,
      status: "pending",
      expires_at: expiresAt.toISOString(),
      created_by: userId,
      tipo_documento,
      tipo_firmatario,
    };

    // Assegna ID documento in base al tipo
    if (tipo_documento === "order") {
      insertPayload.order_id = documento_id;
    } else if (tipo_documento === "quote") {
      insertPayload.quote_id = documento_id;
    } else if (tipo_documento === "sessione") {
      insertPayload.sessione_id = documento_id;
    }
    // odv: nessun ID specifico (fallback)

    // Inserisce in signature_requests
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("signature_requests")
      .insert(insertPayload)
      .select("id, token")
      .single();

    if (insertErr || !inserted) {
      console.error("Insert error:", insertErr);
      return new Response(
        JSON.stringify({ error: "Errore nella creazione della richiesta di firma" }),
        { status: 500, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    const request_id = inserted.id;

    // Chiama internamente fea-genera-otp
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    try {
      const otpRes = await fetch(`${supabaseUrl}/functions/v1/fea-genera-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ request_id, azienda_nome }),
      });

      if (!otpRes.ok) {
        const otpErr = await otpRes.text();
        console.error("OTP generation failed:", otpErr);
        // Non blocchiamo: la richiesta è creata, l'OTP può essere rigenerato
      }
    } catch (otpErr) {
      console.error("OTP call error:", otpErr);
    }

    // Audit log
    await supabaseAdmin.from("fea_audit_log").insert({
      request_id,
      company_id,
      evento: "sessione_creata",
      metadati: { tipo_documento, tipo_firmatario, signer_email },
    });

    return new Response(
      JSON.stringify({ success: true, request_id, token: inserted.token }),
      { status: 200, headers: { ...corsH, "Content-Type": "application/json" } }
    );
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("fea-richiedi-firma error:", err);
    return new Response(
      JSON.stringify({ error: "Errore interno del server" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
