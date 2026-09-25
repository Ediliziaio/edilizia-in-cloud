import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    const { quote_id } = await req.json();
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

    // 2b. La copia di firma di un preventivo di modulo (source «modulo:…») non ha
    // righe: le voci stanno nella tabella del modulo. Convertirla creava una
    // commessa col solo totale; la commessa si fa dal preventivo del modulo.
    if (typeof quote.source === "string" && quote.source.startsWith("modulo:")) {
      return errorResponse(
        "Questo preventivo appartiene a un modulo (Tetti, Bagni…): la commessa si crea dal preventivo del modulo, non da qui.",
        409,
      );
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
    const totaleIvato = round2(Number(quote.total ?? 0));
    const conSubtotale = Number(quote.subtotal ?? 0) > 0;
    const imponibile = conSubtotale
      ? round2(Number(quote.subtotal) - Number(quote.discount_amount ?? 0))
      : totaleIvato;
    // Un'aliquota sola sulla commessa: quella media del preventivo, così
    // imponibile × aliquota ridà l'IVA del preventivo anche con aliquote miste.
    const aliquotaMedia = conSubtotale && imponibile > 0
      ? round2((Number(quote.vat_amount ?? 0) / imponibile) * 100)
      : 0;
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

    const { data: order, error: insertErr } = await supabaseAdmin
      .from("orders")
      .insert(orderData)
      .select("id")
      .single();
    if (insertErr || !order) {
      console.error("Errore creazione cantiere:", insertErr);
      return errorResponse(`Errore creazione cantiere: ${insertErr?.message || "errore sconosciuto"}`, 500);
    }

    // 5a. Piano dei pagamenti del preventivo → rate della commessa.
    // La card del builder promette "riportate automaticamente nella commessa":
    // qui invece arrivava acconto 0 e saldo = totale. Il trigger
    // sync_installments_to_order_columns allinea le colonne legacy di orders.
    const fasiPagamento = Array.isArray(quote.payment_phases)
      ? (quote.payment_phases as Array<Record<string, unknown>>).filter((p) => p && typeof p === "object")
      : [];
    if (fasiPagamento.length > 0) {
      const tipiRata = new Set(["deposit", "balance", "financing"]);
      // Le fasi del preventivo sono sul totale IVA inclusa; le rate della
      // commessa stanno sull'imponibile, come nelle altre commesse: si riportano
      // in proporzione e l'ultima prende i centesimi di arrotondamento.
      const fattore = totaleIvato > 0 ? imponibile / totaleIvato : 1;
      let assegnato = 0;
      const rate = fasiPagamento.map((p, idx) => {
        const tipo = tipiRata.has(String(p.type)) ? String(p.type) : (idx === fasiPagamento.length - 1 ? "balance" : "deposit");
        const ultima = idx === fasiPagamento.length - 1;
        const importo = ultima && fattore !== 1
          ? round2(imponibile - assegnato)
          : round2((Number(p.amount) || 0) * fattore);
        assegnato = round2(assegnato + importo);
        return {
          order_id: order.id,
          position: idx,
          label: String(p.label ?? "").trim() || (tipo === "balance" ? "Saldo" : `Acconto ${idx + 1}`),
          type: tipo,
          amount: importo,
          is_paid: false,
        };
      });
      const { error: rateErr } = await supabaseAdmin.from("order_installments").insert(rate);
      if (rateErr) console.error("Rate preventivo→commessa non copiate:", rateErr);
    }

    // 5b. Copia le RIGHE del preventivo (quote_items) → order_items.
    // Senza questo la commessa nasceva col solo totale aggregato, priva di
    // articoli/prezzi/IVA per riga → impossibili distinta materiali, margini per
    // riga e ordini fornitore. Saltiamo le categorie non-articolo (subtotale/sconto/nota).
    // Spina misure (family_id/axis_selections/misure_preventivo/measure_status) e
    // sconto riga: stessa mappatura di useQuotePrefill, così le due strade
    // preventivo→commessa producono la stessa commessa.
    let righeAvviso: string | null = null;
    const SKIP_CATEGORIES = new Set(["subtotale", "sconto", "nota"]);
    const { data: quoteItems, error: qiErr } = await supabaseAdmin
      .from("quote_items")
      .select("*")
      .eq("quote_id", quote_id)
      .order("sort_order", { ascending: true });
    if (qiErr) {
      console.error("Errore lettura righe preventivo:", qiErr);
    } else if (quoteItems && quoteItems.length > 0) {
      // Le righe OPZIONALI sono proposte che il cliente non ha scelto: il PDF le
      // mostra a parte e le tiene fuori dal totale. Portarle nella commessa
      // faceva sì che la somma delle righe superasse il totale accettato.
      const rows = (quoteItems as Array<Record<string, unknown>>)
        .filter((r) => !SKIP_CATEGORIES.has(String(r.item_category ?? "")))
        .filter((r) => r.is_optional !== true)
        .map((r, idx) => {
          const suMisura = !!r.family_id;
          const mx = r.misura_x as number | null | undefined;
          const my = r.misura_y as number | null | undefined;
          const misurePreventivo = mx != null || my != null
            ? { ...(mx != null ? { larghezza: Number(mx) } : {}), ...(my != null ? { altezza: Number(my) } : {}) }
            : null;
          return {
            // NB: order_items NON ha company_id (l'azienda si legge dalla commessa):
            // passarlo faceva fallire in silenzio l'intera copia delle righe.
            order_id:         order.id,
            name:             String(r.name ?? ""),
            description:      (r.description as string | null) ?? null,
            quantity:         Number(r.quantity) || 1,
            status:           "da_ordinare",
            position:         idx,
            unit_price:       r.unit_price != null ? Number(r.unit_price) : null,
            purchase_price:   r.prezzo_acquisto != null ? Number(r.prezzo_acquisto) : 0,
            vat_rate:         r.vat_rate != null ? Number(r.vat_rate) : null,
            discount_percent: r.discount_percent != null ? Number(r.discount_percent) : null,
            family_id:        suMisura ? (r.family_id as string) : null,
            axis_selections:  suMisura ? ((r.axis_selections as Record<string, string> | null) ?? null) : null,
            misure_preventivo: suMisura ? misurePreventivo : null,
            measure_status:   suMisura ? "da_rilevare" : null,
          };
        });

      // Col prezzo scritto a mano le righe copiate sono a 0€ (chi non carica il
      // listino): non sommano più all'imponibile della commessa. Una riga di
      // aggiustamento fa tornare i conti, come nei preventivatori di mestiere
      // (src/lib/moduli/convertiInCommessa.ts).
      if (Number(quote.prezzo_manuale ?? 0) > 0 && rows.length > 0) {
        const sommaRighe = round2(rows.reduce((s, r) => s + (Number(r.unit_price) || 0) * (Number(r.quantity) || 1), 0));
        const differenza = round2(imponibile - sommaRighe);
        if (Math.abs(differenza) >= 0.01) {
          rows.push({
            order_id:          order.id,
            name:              differenza > 0 ? "Prezzo a corpo" : "Sconto commerciale",
            description:       "Differenza tra il prezzo scritto a mano nel preventivo e le righe di dettaglio.",
            quantity:          1,
            status:            "da_ordinare",
            position:          rows.length,
            unit_price:        differenza,
            purchase_price:    0,
            vat_rate:          aliquotaMedia,
            discount_percent:  null,
            family_id:         null,
            axis_selections:   null,
            misure_preventivo: null,
            measure_status:    null,
          });
        }
      }

      if (rows.length > 0) {
        const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(rows);
        if (itemsErr) {
          // Non blocchiamo: il cantiere esiste già; ma lo diciamo al chiamante,
          // prima la risposta era success:true con la commessa vuota.
          console.error("Errore copia righe preventivo→commessa:", itemsErr);
          righeAvviso = `Righe non copiate: ${itemsErr.message}`;
        }
      }
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
