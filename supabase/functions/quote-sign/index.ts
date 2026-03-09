import { corsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Public endpoint (no auth) for viewing, signing, or refusing a quote.
 * Actions: "view", "sign", "refuse"
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token, action, signed_by_name, refuse_reason } = await req.json();

    if (!token || !action) {
      return errorResponse("token e action richiesti");
    }

    // Validate token is UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(token)) {
      return errorResponse("Token non valido", 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Load quote by token
    const { data: quote, error: qErr } = await supabaseAdmin
      .from("quotes")
      .select("*")
      .eq("signature_token", token)
      .single();

    if (qErr || !quote) {
      return jsonResponse({ valid: false, reason: "token_invalid" }, 404);
    }

    // Check expiration
    if (quote.expires_at && new Date(quote.expires_at) < new Date()) {
      // Auto-expire if still in "inviata"
      if (quote.status === "inviata") {
        await supabaseAdmin
          .from("quotes")
          .update({ status: "scaduta", updated_at: new Date().toISOString() })
          .eq("id", quote.id);
      }
      return jsonResponse({ valid: false, reason: "expired", quote_number: quote.quote_number });
    }

    // Get client IP
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("cf-connecting-ip")
      || "unknown";

    switch (action) {
      case "view": {
        // Track first view
        if (!quote.viewed_at) {
          await supabaseAdmin
            .from("quotes")
            .update({ viewed_at: new Date().toISOString() })
            .eq("id", quote.id);
        }

        // Load items for display
        const { data: items = [] } = await supabaseAdmin
          .from("quote_items")
          .select("name, description, quantity, unit_of_measure, unit_price, discount_percent, vat_rate, line_total, item_type, sort_order")
          .eq("quote_id", quote.id)
          .order("sort_order");

        // Load company info
        const { data: company } = await supabaseAdmin
          .from("companies")
          .select("name, email, phone, address, logo_url, vat_number")
          .eq("id", quote.company_id)
          .single();

        // Check if signed PDF exists
        let pdfUrl: string | null = null;
        if (quote.pdf_storage_path) {
          const { data: signedData } = await supabaseAdmin.storage
            .from("quote-pdfs")
            .createSignedUrl(quote.pdf_storage_path, 3600);
          pdfUrl = signedData?.signedUrl || null;
        }

        return jsonResponse({
          valid: true,
          status: quote.status,
          quote: {
            quote_number: quote.quote_number,
            title: quote.title,
            description: quote.description,
            notes: quote.notes,
            client_name: quote.client_name,
            client_company: quote.client_company,
            expires_at: quote.expires_at,
            subtotal: quote.subtotal,
            discount_percent: quote.discount_percent,
            discount_amount: quote.discount_amount,
            vat_amount: quote.vat_amount,
            total: quote.total,
            created_at: quote.created_at,
            signed_at: quote.signed_at,
            signed_by_name: quote.signed_by_name,
            refused_at: quote.refused_at,
            refused_reason: quote.refused_reason,
          },
          items,
          company: company || {},
          pdf_url: pdfUrl,
        });
      }

      case "sign": {
        if (quote.status !== "inviata") {
          return jsonResponse({
            valid: false,
            reason: quote.status === "accettata" ? "already_signed" : "invalid_status",
            status: quote.status,
          });
        }

        if (!signed_by_name || signed_by_name.trim().length < 2) {
          return errorResponse("Nome obbligatorio per la firma");
        }

        await supabaseAdmin
          .from("quotes")
          .update({
            status: "accettata",
            signed_at: new Date().toISOString(),
            signed_by_name: signed_by_name.trim(),
            signed_by_ip: clientIp,
            updated_at: new Date().toISOString(),
          })
          .eq("id", quote.id);

        return jsonResponse({ success: true, message: "Offerta accettata con successo" });
      }

      case "refuse": {
        if (quote.status !== "inviata") {
          return jsonResponse({
            valid: false,
            reason: "invalid_status",
            status: quote.status,
          });
        }

        await supabaseAdmin
          .from("quotes")
          .update({
            status: "rifiutata",
            refused_at: new Date().toISOString(),
            refused_reason: refuse_reason || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", quote.id);

        return jsonResponse({ success: true, message: "Offerta rifiutata" });
      }

      default:
        return errorResponse("Azione non valida. Usa: view, sign, refuse");
    }
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("quote-sign error:", e);
    return errorResponse("Errore interno", 500);
  }
});
