import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    const body = await req.json();
    const quote_id: string | undefined = body?.quote_id;
    const note: string | undefined = body?.note;

    if (!quote_id) {
      return errorResponse("quote_id richiesto");
    }

    // Il preventivo, poi l'accesso alla SUA azienda (anche multi-azienda e
    // super admin): prima valeva solo l'azienda del profilo.
    const { data: quote, error: quoteErr } = await supabaseAdmin
      .from("quotes")
      .select("*")
      .eq("id", quote_id)
      .single();

    if (quoteErr || !quote) {
      return errorResponse("Preventivo non trovato", 404);
    }
    await requireCompanyAccess(supabaseAdmin, userId, quote.company_id, corsH);
    const companyId: string = quote.company_id;

    // Load all quote items
    const { data: items, error: itemsErr } = await supabaseAdmin
      .from("quote_items")
      .select("*")
      .eq("quote_id", quote_id)
      .order("sort_order");

    if (itemsErr) {
      return errorResponse("Errore caricamento voci preventivo");
    }

    // Get current max version_num for this quote
    const { data: maxVersionRow, error: maxVersionErr } = await supabaseAdmin
      .from("quote_versions")
      .select("version_num")
      .eq("quote_id", quote_id)
      .order("version_num", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (maxVersionErr) {
      return errorResponse("Errore recupero versioni preventivo");
    }

    const nextVersionNum: number = (maxVersionRow?.version_num ?? 0) + 1;

    const snapshot = {
      quote,
      items: items ?? [],
      saved_at: new Date().toISOString(),
    };

    // Insert new version
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("quote_versions")
      .insert({
        quote_id,
        company_id: companyId,
        version_num: nextVersionNum,
        snapshot,
        created_by: userId,
        note: note ?? null,
      })
      .select("version_num")
      .single();

    if (insertErr || !inserted) {
      console.error("salva-versione-preventivo: insert error", insertErr);
      return errorResponse("Errore salvataggio versione", 500);
    }

    return jsonResponse({ success: true, version_num: inserted.version_num });
  } catch (err: unknown) {
    // If requireAuth threw a Response (401), propagate it
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("salva-versione-preventivo:", message);
    return errorResponse(message, 500);
  }
});
