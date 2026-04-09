import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    const { order_id, company_id } = await req.json();
    if (!order_id || !company_id) {
      return errorResponse("order_id e company_id sono obbligatori", 400);
    }

    // Fetch order data
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, description, work_start_date, expected_date, company_id")
      .eq("id", order_id)
      .eq("company_id", company_id)
      .single();

    if (orderError || !order) {
      return errorResponse("Ordine non trovato", 404);
    }

    // Count lavoratori
    const { count: workerCount } = await supabaseAdmin
      .from("order_employees")
      .select("*", { count: "exact", head: true })
      .eq("order_id", order_id);

    // Fetch anagrafica azienda
    const { data: anagrafica } = await supabaseAdmin
      .from("anagrafica_azienda")
      .select("ragione_sociale, partita_iva, indirizzo")
      .eq("company_id", company_id)
      .maybeSingle();

    // Fetch subappaltatori tramite purchase_orders
    const { data: purchaseOrders } = await supabaseAdmin
      .from("purchase_orders")
      .select("supplier_id, suppliers(name)")
      .eq("company_id", company_id)
      .eq("order_id", order_id);

    const subappaltatori = (purchaseOrders || [])
      .map((po: any) => po.suppliers?.name)
      .filter(Boolean);

    // Compose prompt data
    const cantiereData = {
      descrizione_lavori: order.description,
      data_inizio: order.work_start_date,
      data_fine_prevista: order.expected_date,
      numero_lavoratori: workerCount || 1,
      impresa: anagrafica?.ragione_sociale || "Non specificata",
      partita_iva: anagrafica?.partita_iva || "",
      indirizzo_sede: anagrafica?.indirizzo || "",
      subappaltatori: subappaltatori.join(", ") || "Nessuno",
    };

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return errorResponse("ANTHROPIC_API_KEY non configurata", 500);
    }

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system: `Sei un esperto di sicurezza sul lavoro italiano specializzato in edilizia. Genera un POS (Piano Operativo di Sicurezza) completo conforme al D.Lgs 81/2008 art. 89 in italiano professionale.
Il POS deve includere OBBLIGATORIAMENTE tutte le sezioni richieste dalla normativa:
1. DATI IDENTIFICATIVI IMPRESA (ragione sociale, P.IVA, RSPP, RLS, Medico Competente, posizione INAIL/PAT)
2. DESCRIZIONE LAVORI E FASI (lavorazioni, cronoprogramma, numero lavoratori per fase)
3. VALUTAZIONE RISCHI SPECIFICI EDILIZIA (caduta dall'alto, elettrocuzione, macchine/attrezzature, rumore/vibrazioni, polveri/agenti chimici) con relative misure di prevenzione
4. DPI (Dispositivi Protezione Individuale) obbligatori per mansione
5. PROCEDURE DI EMERGENZA (numeri emergenza 112/115/118, punto raccolta, primo soccorso)
6. ELENCO SUBAPPALTATORI con verifica DURC

Output: JSON con campi:
- tipo_lavori (string)
- fasi_lavori (array di {fase, durata, lavoratori})
- rischi_presenti (array di {rischio, livello, misura_prevenzione})
- dpi_richiesti (array di {mansione, dpi})
- procedure_operative (testo completo formattato)
- procedure_emergenza (testo con numeri e procedure)
- note_sicurezza (testo)
Rispondi SOLO con JSON valido, senza markdown.`,
        messages: [
          {
            role: "user",
            content: `Genera il POS completo D.Lgs.81/08 per questo cantiere edile: ${JSON.stringify(cantiereData, null, 2)}`,
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const err = await claudeResponse.text();
      return errorResponse(`Errore Claude API: ${err}`, 502);
    }

    const claudeData = await claudeResponse.json();
    const rawContent = claudeData.content?.[0]?.text || "{}";

    let parsed: any = {};
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      parsed = { tipo_lavori: order.description, procedure_operative: rawContent };
    }

    // Save to pos_documents
    const { data: posDoc, error: insertError } = await supabaseAdmin
      .from("pos_documents")
      .insert({
        company_id,
        order_id,
        tipo_lavori: parsed.tipo_lavori || order.description,
        indirizzo_cantiere: anagrafica?.indirizzo || "Da specificare",
        data_inizio: order.work_start_date,
        data_fine_prevista: order.expected_date,
        numero_lavoratori: workerCount || 1,
        rischi_presenti: parsed.rischi_presenti || [],
        dpi_richiesti: parsed.dpi_richiesti || [],
        procedure_operative: parsed.procedure_operative || "",
        generated_content: rawContent,
        generated_by: "ai",
        created_by: userId,
      })
      .select()
      .single();

    if (insertError) {
      return errorResponse(`Errore salvataggio: ${insertError.message}`, 500);
    }

    return jsonResponse({ success: true, document: posDoc });
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(`Errore interno: ${String(err)}`, 500);
  }
});
