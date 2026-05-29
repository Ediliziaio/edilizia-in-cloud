/**
 * email-ai-ddt-carico — MP-EMAIL-AI-07 · DDT estratto → proposta di carico
 *
 * Riusa la bozza estratta da MP-06 (campi.righe del DDT). NON ri-legge il PDF.
 *   1) Match ODA: per riferimento_ordine (oda_number/supplier_reference) o, in
 *      fallback, ultimo ordine aperto del fornitore (per nome → suppliers).
 *   2) Confronto righe: articolo per articolo, qta in bolla vs qta ordinata
 *      (sku esatto, poi descrizione). Scostamenti EVIDENZIATI, mai nascosti.
 *   3) Salva una BOZZA di carico (stato 'bozza'). La giacenza NON si tocca:
 *      l'aggiornamento è azione umana successiva (mai movimento cieco).
 *
 * Endpoint POST: { documento_estratto_id: uuid }  · Auth: Bearer (staff interno).
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { parseImporto } from "../_shared/doc-validation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Stati ODA considerati "aperti" per il match in fallback (non chiusi/annullati).
const ODA_STATI_CHIUSI = new Set(["closed", "cancelled", "annullato", "chiuso", "completed", "completato"]);

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Auth required" }, 401, cors);
    const { data: u } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!u.user) return json({ error: "Invalid token" }, 401, cors);

    const body = await req.json().catch(() => ({}));
    const docId: string = (body.documento_estratto_id || "").toString();
    if (!docId) return json({ error: "documento_estratto_id required" }, 400, cors);

    // ── Carica la bozza estratta (MP-06) ───────────────────────────────────
    const { data: doc, error: docErr } = await supabase
      .from("email_documento_estratto")
      .select("id, company_id, email_id, tipo, campi, fornitore_match_id")
      .eq("id", docId)
      .maybeSingle();
    if (docErr || !doc) return json({ error: "documento_non_trovato" }, 404, cors);

    const campi = (doc.campi || {}) as Record<string, any>;
    const righeRaw: any[] = Array.isArray(campi.righe) ? campi.righe : [];
    if (righeRaw.length === 0) return json({ error: "nessuna_riga", reason: "Il documento non ha righe articolo estratte." }, 422, cors);

    const numero: string | null = campi.numero?.valore ?? null;
    const dataDdt: string | null = campi.data?.valore ?? null;
    const riferimento: string | null = campi.riferimento_ordine?.valore ?? null;
    const ragione: string | null = campi.fornitore_ragione_sociale?.valore ?? null;

    // ── Match ODA ───────────────────────────────────────────────────────────
    let po: any = null;
    if (riferimento) {
      // SICUREZZA: ref è AI-estratto (untrusted). NIENTE .or() con stringa interpolata
      // (filter-injection PostgREST). Due .ilike() parametrizzate: supabase-js
      // URL-encoda il valore → niente sintassi-filtro iniettabile.
      const ref = riferimento.toString().trim().slice(0, 80);
      const sel = "id, oda_number, supplier_reference, supplier_id, status";
      const byOda = await supabase.from("purchase_orders").select(sel)
        .eq("company_id", doc.company_id).ilike("oda_number", `%${ref}%`).limit(1).maybeSingle();
      po = byOda.data ?? null;
      if (!po) {
        const bySupRef = await supabase.from("purchase_orders").select(sel)
          .eq("company_id", doc.company_id).ilike("supplier_reference", `%${ref}%`).limit(1).maybeSingle();
        po = bySupRef.data ?? null;
      }
    }
    if (!po && ragione) {
      const { data: sup } = await supabase
        .from("suppliers").select("id").eq("company_id", doc.company_id).ilike("name", ragione).limit(1).maybeSingle();
      if (sup) {
        const { data: pos } = await supabase
          .from("purchase_orders")
          .select("id, oda_number, supplier_reference, supplier_id, status")
          .eq("company_id", doc.company_id).eq("supplier_id", sup.id)
          .order("issue_date", { ascending: false }).limit(5);
        po = (pos || []).find((p: any) => !ODA_STATI_CHIUSI.has((p.status || "").toLowerCase())) ?? null;
      }
    }

    // ── Carica righe ordine + confronto ─────────────────────────────────────
    let poItems: any[] = [];
    if (po) {
      const { data: items } = await supabase
        .from("purchase_order_items")
        .select("id, description, sku, quantity, quantity_received, unit_of_measure")
        .eq("purchase_order_id", po.id);
      poItems = items || [];
    }

    const usedItem = new Set<string>();
    const righe = righeRaw.map((r) => {
      const descr = (r.descrizione ?? r.descr ?? "").toString();
      const codice = (r.codice ?? r.sku ?? "").toString().trim();
      const qtaBolla = parseImporto(r.qta ?? r.quantita ?? r.quantity) ?? 0;
      // match: sku esatto → descrizione contiene
      let match: any = null;
      if (codice) match = poItems.find((it) => !usedItem.has(it.id) && (it.sku || "").toString().trim().toLowerCase() === codice.toLowerCase());
      if (!match && descr) {
        const d = descr.toLowerCase().slice(0, 40);
        match = poItems.find((it) => !usedItem.has(it.id) && (it.description || "").toString().toLowerCase().includes(d));
      }
      if (match) usedItem.add(match.id);
      const qtaOrdine = match ? (parseImporto(match.quantity) ?? 0) : null;
      const scostamento = qtaOrdine == null ? null : Number((qtaBolla - qtaOrdine).toFixed(3));
      let note: string | null = null;
      if (qtaOrdine == null) note = "Articolo non presente nell'ordine";
      else if (scostamento && scostamento !== 0) note = scostamento > 0 ? "Consegnato più dell'ordinato" : "Consegnato meno dell'ordinato";
      return { descrizione: descr, codice: codice || null, qta_bolla: qtaBolla, qta_ordine: qtaOrdine, scostamento, po_item_id: match?.id ?? null, note };
    });

    // articoli a ordine non consegnati (mancanti nella bolla)
    const mancanti = poItems.filter((it) => !usedItem.has(it.id)).map((it) => ({
      descrizione: (it.description || "").toString(), codice: it.sku ?? null,
      qta_bolla: 0, qta_ordine: parseImporto(it.quantity) ?? 0,
      scostamento: -(parseImporto(it.quantity) ?? 0), po_item_id: it.id, note: "Ordinato ma non in bolla",
    }));
    const righeFinali = [...righe, ...mancanti];
    const scostamentiTotali = righeFinali.filter((r) => r.scostamento == null || r.scostamento !== 0).length;

    // ── Salva bozza carico (sostituisce eventuale bozza viva per il documento) ─
    await supabase.from("email_ddt_carico").delete().eq("documento_estratto_id", docId).eq("stato", "bozza");
    const { data: carico, error: insErr } = await supabase
      .from("email_ddt_carico")
      .insert({
        company_id: doc.company_id,
        email_id: doc.email_id,
        documento_estratto_id: docId,
        fornitore_match_id: doc.fornitore_match_id,
        ddt_numero: numero,
        ddt_data: dataDdt && /^\d{4}-\d{2}-\d{2}$/.test(dataDdt) ? dataDdt : null,
        purchase_order_id: po?.id ?? null,
        purchase_order_numero: po?.oda_number ?? null,
        senza_ordine: !po,
        righe: righeFinali,
        scostamenti_totali: scostamentiTotali,
        created_by: u.user.id,
      })
      .select("*").single();
    if (insErr) return json({ error: "save_failed", detail: insErr.message }, 500, cors);

    return json({ ok: true, carico, ordine_collegato: !!po, scostamenti: scostamentiTotali }, 200, cors);
  } catch (e) {
    console.error("[email-ai-ddt-carico] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500, cors);
  }
});

function json(payload: any, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
