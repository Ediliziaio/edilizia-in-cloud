import { getCorsHeaders } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { checkPaymentMethod, PAYMENT_METHOD_REQUIRED_MESSAGE } from "../_shared/requirePaymentMethod.ts";

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
    } = body;
    // Categoria "umana" del documento (verbale_consegna, collaudo_finale, ...)
    // e note libere: arrivano dall'app campo, si salvano sulla richiesta così
    // ufficio e storico vedono COSA si sta facendo firmare, non un generico
    // "order".
    const categoria = typeof body.categoria === "string" ? body.categoria.slice(0, 64) : null;
    const noteRichiesta = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 2000) : null;
    const expiresGiorniRaw = Number(body.expires_giorni ?? body.scadenza_giorni ?? 30);
    const expiresGiorni = Number.isFinite(expiresGiorniRaw)
      ? Math.min(Math.max(Math.trunc(expiresGiorniRaw), 1), 365)
      : 30;

    // Validazione campi obbligatori
    if (!tipo_documento || !documento_id || !tipo_firmatario || !signer_email || !signer_name) {
      return new Response(
        JSON.stringify({ error: "Campi obbligatori mancanti: tipo_documento, documento_id, tipo_firmatario, signer_email, signer_name" }),
        { status: 400, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    if (!["order", "quote", "sessione", "odv", "fv"].includes(tipo_documento)) {
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

    // Gate "carta obbligatoria": la firma digitale (FEA + OTP SMS/email) ha un costo.
    const pmCheck = await checkPaymentMethod(supabaseAdmin, company_id);
    if (!pmCheck.allowed) {
      return new Response(
        JSON.stringify({ error: pmCheck.message ?? PAYMENT_METHOD_REQUIRED_MESSAGE, code: "payment_method_required" }),
        { status: 402, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // Carica nome azienda
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("name")
      .eq("id", company_id)
      .single();

    const branding = await getBrandingForCompany(supabaseAdmin, company_id);
    const azienda_nome = company?.name ?? branding.platformName;

    // Token univoco
    const token = crypto.randomUUID().replace(/-/g, "");

    // Calcola scadenza
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresGiorni);

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
      categoria,
      note: noteRichiesta,
    };

    // Assegna ID documento in base al tipo
    if (tipo_documento === "order") {
      insertPayload.order_id = documento_id;
    } else if (tipo_documento === "quote") {
      insertPayload.quote_id = documento_id;
    } else if (tipo_documento === "sessione") {
      insertPayload.sessione_id = documento_id;
    } else if (tipo_documento === "fv") {
      // Preventivo Fotovoltaico (fv_progetti). Richiede colonna fv_progetto_id
      // su signature_requests (migration 20270618030000_signature_requests_fv_progetto).
      insertPayload.fv_progetto_id = documento_id;
    }
    // odv: nessun ID specifico (fallback)

    // Best-effort: scarica il PDF del documento (se esiste) e calcola
    // l'hash SHA-256 per l'integrità (documento_hash). Se fallisce si
    // procede comunque senza hash.
    try {
      let pdfUrl: string | null = null;
      if (tipo_documento === "sessione") {
        const { data: sessione } = await supabaseAdmin
          .from("documento_sessioni")
          .select("pdf_url")
          .eq("id", documento_id)
          .single();
        pdfUrl = sessione?.pdf_url ?? null;
      } else if (tipo_documento === "quote") {
        const { data: quote } = await supabaseAdmin
          .from("quotes")
          .select("pdf_url")
          .eq("id", documento_id)
          .single();
        pdfUrl = quote?.pdf_url ?? null;
      }

      if (pdfUrl) {
        const pdfRes = await fetchWithTimeout(pdfUrl, { timeoutMs: 15_000 });
        if (!pdfRes.ok) throw new Error(`Download PDF fallito: HTTP ${pdfRes.status}`);
        const pdfBytes = await pdfRes.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", pdfBytes);
        insertPayload.documento_hash = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      }
    } catch (hashErr) {
      console.warn("documento_hash non calcolato:", hashErr instanceof Error ? hashErr.message : hashErr);
    }

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

    if (tipo_documento === "quote") {
      const { error: quoteUpdateErr } = await supabaseAdmin
        .from("quotes")
        .update({
          status: "inviata",
          signature_token: inserted.token,
          sent_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          client_email: signer_email,
          client_name: signer_name,
          updated_at: new Date().toISOString(),
        })
        .eq("id", documento_id)
        .eq("company_id", company_id);

      if (quoteUpdateErr) {
        console.error("Quote FEA sync error:", quoteUpdateErr);
      }
    }

    // Chiama internamente fea-genera-otp
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    let otpInviato = false;

    try {
      // P2-5: fn interna → timeout 15s (cold start + generazione OTP).
      const otpRes = await fetchWithTimeout(`${supabaseUrl}/functions/v1/fea-genera-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ request_id, azienda_nome }),
        timeoutMs: 15_000,
      });

      if (!otpRes.ok) {
        const otpErr = await otpRes.text();
        console.error("OTP generation failed:", otpErr);
        // Non blocchiamo: la richiesta è creata, l'OTP può essere rigenerato
      } else {
        otpInviato = true;
        // Audit: link + OTP inviati via email al firmatario
        await supabaseAdmin.from("fea_audit_log").insert({
          request_id,
          company_id,
          evento: "link_inviato",
          metadati: { signer_email },
        });
      }
    } catch (otpErr) {
      console.error("OTP call error:", otpErr);
    }

    // Audit log
    await supabaseAdmin.from("fea_audit_log").insert({
      request_id,
      company_id,
      evento: "sessione_creata",
      metadati: { tipo_documento, tipo_firmatario, signer_email, categoria },
    });

    return new Response(
      JSON.stringify({ success: true, request_id, token: inserted.token, otp_inviato: otpInviato }),
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
