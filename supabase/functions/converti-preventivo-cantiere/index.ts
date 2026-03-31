import { corsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsHeaders);

    const { quote_id } = await req.json();
    if (!quote_id) return errorResponse("quote_id richiesto");

    // 1. Carica il preventivo
    const { data: quote, error: qErr } = await supabaseAdmin
      .from("quotes")
      .select("*")
      .eq("id", quote_id)
      .single();
    if (qErr || !quote) return errorResponse("Preventivo non trovato", 404);

    // 2. Verifica che l'utente appartenga all'azienda del preventivo
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();
    if (!profile || profile.company_id !== quote.company_id) {
      return errorResponse("Non autorizzato", 403);
    }

    // 3. Verifica stato preventivo
    if (quote.status !== "accettata") {
      return errorResponse(
        `Il preventivo deve essere in stato 'accettata' per essere convertito (stato attuale: ${quote.status})`,
        400
      );
    }

    // 4. Controlla se esiste già un cantiere per questo preventivo
    const { data: existingOrder } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("quote_id", quote_id)
      .maybeSingle();
    if (existingOrder) {
      return errorResponse(
        `Esiste già un cantiere associato a questo preventivo (ID: ${existingOrder.id})`,
        409
      );
    }

    // 5. Crea il cantiere (order)
    const orderData: Record<string, unknown> = {
      company_id:     quote.company_id,
      quote_id:       quote.id,
      quote_number:   quote.quote_number ?? null,
      status:         "confermato",
      description:    quote.title || quote.quote_number || "Cantiere da preventivo",
      total_amount:   Number(quote.total ?? 0),
      deposit_amount: 0,
      balance_amount: Number(quote.total ?? 0),
      client_name:    quote.client_name    ?? null,
      client_email:   quote.client_email   ?? null,
      client_phone:   quote.client_phone   ?? null,
      client_company: quote.client_company ?? null,
      client_address: quote.client_address ?? null,
      internal_notes: quote.notes          ?? null,
      created_by:     userId,
    };

    // Campi opzionali presenti solo se la colonna esiste
    if ("indirizzo_lavori" in quote) {
      orderData.indirizzo_lavori = (quote as any).indirizzo_lavori ?? null;
    }
    if ("tipo_lavoro" in quote) {
      orderData.tipo_lavoro = (quote as any).tipo_lavoro ?? null;
    }

    const { data: order, error: insertErr } = await supabaseAdmin
      .from("orders")
      .insert(orderData)
      .select("id")
      .single();
    if (insertErr || !order) {
      console.error("Errore creazione cantiere:", insertErr);
      return errorResponse(`Errore creazione cantiere: ${insertErr?.message || "errore sconosciuto"}`, 500);
    }

    // 6. Aggiorna stato preventivo a 'convertita'
    const { error: updateErr } = await supabaseAdmin
      .from("quotes")
      .update({ status: "convertita", updated_at: new Date().toISOString() })
      .eq("id", quote_id);
    if (updateErr) {
      console.error("Errore aggiornamento stato preventivo:", updateErr);
      // Non blocchiamo: il cantiere è già stato creato
    }

    return jsonResponse({ success: true, order_id: order.id });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("converti-preventivo-cantiere error:", e);
    return errorResponse("Errore interno del server", 500);
  }
});
