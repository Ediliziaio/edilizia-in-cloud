import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { separaVoci, contrattoPreventivo } from "../_shared/destinazioneVocePreventivo.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { righeCommessaDaPreventivo } from "../_shared/righeCommessaDaPreventivo.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    const { quote_id, expected_version } = await req.json();
    if (!quote_id) return errorResponse("quote_id richiesto");

    // 1. Carica il preventivo
    const { data: quote, error: qErr } = await supabaseAdmin
      .from("quotes")
      .select("*")
      .eq("id", quote_id)
      .single();
    if (qErr || !quote) return errorResponse("Preventivo non trovato", 404);

    // 2. Accesso all'azienda del preventivo (anche multi-azienda e super admin)
    await requireCompanyAccess(supabaseAdmin, userId, quote.company_id, getCorsHeaders(req));

    // 2a. Si crea una commessa: serve la stessa regola della creazione
    // nell'app, amministratore o «Ordini e Commesse» con la modifica (che il
    // trigger spegne in «Sola lettura»). Prima bastava un profilo
    // nell'azienda, anche da cliente del portale (25/09/2026).
    const { data: puoCreare } = await supabaseAdmin.rpc("has_permission_for_company", {
      _user_id: userId,
      _permission: "can_edit_orders",
      _company_id: quote.company_id,
    });
    if (puoCreare !== true) {
      return errorResponse("Non hai il permesso di creare commesse (chiedi all'amministratore).", 403);
    }

    // 2b. La copia di firma di un preventivo di modulo (source «modulo:…») non ha
    // righe: le voci stanno nella tabella del modulo. Convertirla creava una
    // commessa col solo totale; la commessa si fa dal preventivo del modulo.
    if (typeof quote.source === "string" && quote.source.startsWith("modulo:")) {
      return errorResponse(
        "Questo preventivo appartiene a un modulo (Tetti, Bagni…): la commessa si crea dal preventivo del modulo, non da qui.",
        409,
      );
    }

    if (expected_version != null && Number(expected_version) !== Number(quote.version)) {
      return errorResponse("Il preventivo è cambiato: riaprilo e controlla le voci prima di continuare.", 409);
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
    // P1 FIX: arrotonda a 2 decimali gli importi monetari per evitare che
    // valori float approssimati dal DB diventino mismatch tra preventivo
    // (dopo round2 in UI) e cantiere (senza round2) — es. 1234.567 → 1234.57.
    const round2 = (n: number) => Math.round(n * 100) / 100;
    // Nella commessa total_amount è l'IMPONIBILE: l'elenco lo chiama così e il
    // PDF della commessa ci aggiunge l'IVA di vat_rate. Prima ci finiva il totale
    // IVA inclusa del preventivo, e l'IVA si contava due volte.
    const { totaleIvato, imponibile, aliquotaMedia } = contrattoPreventivo(quote);
    const orderData: Record<string, unknown> = {
      company_id:     quote.company_id,
      quote_id:       quote.id,
      quote_number:   quote.quote_number ?? null,
      status:         "confermato",
      description:    quote.title || quote.quote_number || "Cantiere da preventivo",
      total_amount:   imponibile,
      vat_rate:       aliquotaMedia,
      deposit_amount: 0,
      balance_amount: imponibile,
      client_name:    quote.client_name    ?? null,
      client_email:   quote.client_email   ?? null,
      client_phone:   quote.client_phone   ?? null,
      client_company: quote.client_company ?? null,
      client_address: quote.client_address ?? null,
      internal_notes: quote.notes          ?? null,
      created_by:     userId,
    };

    // Il cliente va COLLEGATO, non solo copiato come testo: senza customer_id la
    // commessa non compare nel portale del cliente né nel suo storico, e il
    // nome in chiaro non basta a nessuna ricerca. Il contatto CRM sa a quale
    // profilo cliente corrisponde (marketing_contacts.customer_profile_id).
    if (quote.contact_id) {
      const { data: contatto } = await supabaseAdmin
        .from("marketing_contacts")
        .select("customer_profile_id")
        .eq("id", quote.contact_id)
        .maybeSingle();
      if (contatto?.customer_profile_id) orderData.customer_id = contatto.customer_profile_id;
    }

    // Campi opzionali presenti solo se la colonna esiste.
    // Usiamo Record<string, unknown> invece di `any` per safety —
    // `in` guard già garantisce presenza della chiave.
    const quoteRecord = quote as Record<string, unknown>;
    if ("indirizzo_lavori" in quoteRecord) {
      orderData.indirizzo_lavori = quoteRecord.indirizzo_lavori ?? null;
    }
    if ("tipo_lavoro" in quoteRecord) {
      orderData.tipo_lavoro = quoteRecord.tipo_lavoro ?? null;
    }

    const { data: quoteItems, error: qiErr } = await supabaseAdmin.from("quote_items").select("*").eq("quote_id", quote_id).order("sort_order", {ascending:true});
    if (qiErr) return errorResponse("Non riesco a verificare le voci del preventivo.", 500);
    if (separaVoci(quoteItems ?? []).daVerificare.length) return errorResponse("Ci sono voci da classificare: rivedi il preventivo.", 409);
    const rows = righeCommessaDaPreventivo(quoteItems ?? []).map((r, position) => ({...r, status:"da_ordinare",position}));
    // Stessi importi e stessa proporzione del flusso precedente: cambia soltanto la transazione.
    const fasiPagamento = Array.isArray(quote.payment_phases) ? quote.payment_phases : [];
    let assegnato = 0;
    const fattore = totaleIvato > 0 ? imponibile / totaleIvato : 1;
    const rate = fasiPagamento.map((p: Record<string, unknown>, idx: number) => {
      const ultima = idx === fasiPagamento.length-1;
      const amount = ultima && fattore !== 1 ? round2(imponibile-assegnato) : round2((Number(p.amount)||0)*fattore);
      assegnato = round2(assegnato+amount);
      return {position:idx,label:String(p.label ?? "").trim() || (ultima ? "Saldo" : `Acconto ${idx+1}`),
        type:["deposit","balance","financing"].includes(String(p.type)) ? p.type : ultima ? "balance" : "deposit",amount,is_paid:false};
    });
    // La RPC conserva il JWT del chiamante: gli stessi permessi della creazione ordinaria.
    const utente = createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!, {
      global:{headers:{Authorization:req.headers.get("Authorization")!}},auth:{persistSession:false,autoRefreshToken:false}
    });
    const {data: result,error: conversionError} = await utente.rpc("crea_commessa_preventivo_atomic", {
      p_quote_id:quote_id,p_order_data:orderData,p_items:rows,p_installments:rate,p_quote_version:quote.version
    });
    if (conversionError || !result?.id) return errorResponse(conversionError?.message || "Creazione commessa non riuscita.",409);
    const order = {id:result.id};
    const righeAvviso: string | null = null;

    // 7. Chiude la catena commerciale: se il preventivo era legato a un
    // deal, la commessa lo ricorda (orders.opportunity_id) e l'opportunità
    // ancora aperta diventa VINTA — è il momento in cui il fatto è certo,
    // niente dati inventati. Tutto best-effort: la commessa esiste già.
    const opportunityId = (quote as Record<string, unknown>).opportunity_id as string | null | undefined;
    if (opportunityId) {
      try {
        await supabaseAdmin
          .from("orders")
          .update({ opportunity_id: opportunityId })
          .eq("id", order.id);
      } catch (eLink) {
        console.error("Aggancio opportunità→commessa non riuscito:", eLink);
      }
      try {
        const { data: opp } = await supabaseAdmin
          .from("marketing_opportunities")
          .select("id, status, pipeline_id")
          .eq("id", opportunityId)
          .eq("company_id", quote.company_id)
          .maybeSingle();
        if (opp && opp.status === "open") {
          // Se la pipeline ha una fase "vinta", il kanban resta coerente.
          const { data: faseVinta } = await supabaseAdmin
            .from("marketing_pipeline_stages")
            .select("id")
            .eq("pipeline_id", opp.pipeline_id)
            .eq("auto_status", "won")
            .order("position")
            .limit(1)
            .maybeSingle();
          await supabaseAdmin
            .from("marketing_opportunities")
            .update({
              status: "won", // won_at lo mette il trigger DB
              ...(faseVinta ? { stage_id: faseVinta.id } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq("id", opportunityId);
        }
      } catch (eWin) {
        console.error("Chiusura opportunità come vinta non riuscita:", eWin);
      }
    }

    return jsonResponse({ success: true, order_id: order.id, avviso: righeAvviso });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("converti-preventivo-cantiere error:", e);
    return errorResponse("Errore interno del server", 500);
  }
});
