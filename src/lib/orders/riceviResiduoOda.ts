/**
 * «È arrivato tutto»: registra come ricevuto il residuo di ogni riga di un
 * ordine fornitore, con la stessa funzione del foglio «arrivo merce»
 * (`oda_registra_arrivo`). In una transazione: quantità ricevute, carico di
 * magazzino, movimenti, stato dell'ordine (che diventa «ricevuto» solo quando
 * tutte le righe sono coperte, e allora nasce il costo sulla commessa) e stato
 * della merce sul ticket collegato.
 *
 * La usano il bottone «Ricevuto» della scheda ordine e il modulo DDT quando la
 * bolla dice «ricevuto completo». Prima il modulo DDT metteva l'ordine a
 * «ricevuto» senza segnare una quantità né caricare il magazzino, e il bottone
 * cambiava lo stato prima di registrare le righe.
 *
 * Qui resta solo l'abbinamento riga → articolo di magazzino (codice interno,
 * barcode, poi nome; se non esiste lo si crea), perché la funzione vuole già
 * gli `stock_item_id` risolti.
 */
import { supabase } from "@/integrations/supabase/client";

export interface EsitoRicezioneResiduo {
  /** righe passate alla funzione (con residuo > 0) */
  righe: number;
  /** l'ordine non ha righe: lo stato si mette a mano, il costo nasce dal totale */
  senzaRighe: boolean;
  /** dopo l'arrivo tutte le righe sono coperte (l'ordine è «ricevuto») */
  completo: boolean;
  /** posizioni su misura lasciate fuori: si registrano dalla spunta per posizione */
  suMisura?: number;
  /** righe che la funzione non ha potuto registrare, col motivo */
  errori: Array<{ item_id?: string; errore?: string }>;
}

export async function riceviResiduoOda(params: {
  companyId: string;
  odaId: string;
  /** bolla già scritta a cui agganciare le righe; senza, la funzione ne crea una */
  ddtId?: string | null;
  data?: string | null;
  warehouseId?: string | null;
  note?: string | null;
}): Promise<EsitoRicezioneResiduo> {
  const { companyId, odaId } = params;

  // La bolla è la fonte della destinazione: anche modificando una bolla
  // esistente, una consegna diretta non deve creare articoli o carichi fittizi.
  let consegnaInCantiere = false;
  if (params.ddtId) {
    const { data: bolla, error: bollaErr } = await supabase
      .from("ddt_ricezione")
      .select("id, destinazione")
      .eq("id", params.ddtId)
      .eq("company_id", companyId)
      .eq("purchase_order_id", odaId)
      .single();
    if (bollaErr) throw bollaErr;
    consegnaInCantiere = (bolla as unknown as { destinazione?: string } | null)?.destinazione === "cantiere";
  }

  const { data: odaData, error: odaErr } = await supabase
    .from("purchase_orders")
    .select("delivery_warehouse_id, supplier_id")
    .eq("id", odaId)
    .eq("company_id", companyId)
    .single();
  if (odaErr) throw odaErr;

  const { data: items, error: itemsErr } = await supabase
    .from("purchase_order_items")
    .select("id, description, sku, quantity, quantity_received, unit_price, vat_rate, order_item_id")
    .eq("purchase_order_id", odaId);
  if (itemsErr) throw itemsErr;
  if (!items || items.length === 0) return { righe: 0, senzaRighe: true, completo: false, errori: [] };

  // Il su misura si spunta posizione per posizione: «è arrivato tutto» non vale per lui,
  // altrimenti un pezzo segnato rotto tornerebbe buono.
  const collegate = items.map((i) => i.order_item_id).filter((v): v is string => !!v);
  const suMisura = new Set<string>();
  if (collegate.length > 0) {
    const { data: righeCommessa, error: righeErr } = await supabase
      .from("order_items").select("id, gruppo_id, measure_status").in("id", collegate);
    if (righeErr) throw righeErr;
    for (const r of (righeCommessa ?? []) as unknown as Array<{ id: string; gruppo_id: string | null; measure_status: string | null }>) {
      if (r.gruppo_id != null || r.measure_status != null) suMisura.add(r.id);
    }
  }

  const warehouseId = consegnaInCantiere ? null : params.warehouseId ?? odaData?.delivery_warehouse_id ?? null;
  const righe: Array<{ item_id: string; quantity: number; stock_item_id: string | null }> = [];
  let suMisuraSaltate = 0;
  // L'articolo si cerca nel magazzino d'arrivo: il movimento si registra lì, e
  // un articolo preso da un altro magazzino ne alzava la giacenza (movimento su
  // A, merce su B). Se lì non c'è, nasce lì.
  const nelMagazzino: Record<string, string> = warehouseId ? { warehouse_id: warehouseId } : {};

  for (const item of items) {
    // Solo il residuo: se una parte è già arrivata, ricaricare la quantità
    // piena raddoppierebbe la giacenza.
    const qtyToLoad = Number(item.quantity) - (Number(item.quantity_received) || 0);
    if (qtyToLoad <= 0) continue;

    if (item.order_item_id && suMisura.has(item.order_item_id)) {
      suMisuraSaltate += 1;
      continue;
    }

    if (consegnaInCantiere) {
      righe.push({ item_id: item.id, quantity: qtyToLoad, stock_item_id: null });
      continue;
    }

    let stockItemId: string | null = null;

    if (item.sku) {
      // Lo SKU si confronta con codice interno o barcode, NON col nome: il
      // vecchio ilike("name", sku) non trovava mai nulla e a ogni ricezione
      // nasceva un articolo duplicato in inventario. Due eq separati invece di
      // .or(): lo SKU è testo libero e virgole e parentesi romperebbero .or().
      const { data: byCode, error: codeError } = await supabase
        .from("warehouse_stock").select("id")
        .eq("company_id", companyId).eq("internal_code", item.sku)
        .match(nelMagazzino).limit(1).maybeSingle();
      if (codeError) throw codeError;
      stockItemId = byCode?.id ?? null;
      if (!stockItemId) {
        const { data: byBarcode, error: barcodeError } = await supabase
          .from("warehouse_stock").select("id")
          .eq("company_id", companyId).eq("barcode", item.sku)
          .match(nelMagazzino).limit(1).maybeSingle();
        if (barcodeError) throw barcodeError;
        stockItemId = byBarcode?.id ?? null;
      }
    }

    if (!stockItemId && item.description) {
      const { data: byName, error: nameError } = await supabase
        .from("warehouse_stock").select("id")
        .eq("company_id", companyId).ilike("name", item.description)
        .match(nelMagazzino).limit(1).maybeSingle();
      if (nameError) throw nameError;
      stockItemId = byName?.id ?? null;
    }

    if (!stockItemId && item.description) {
      const { data: creato, error: errCreazione } = await supabase
        .from("warehouse_stock")
        .insert({
          company_id: companyId,
          warehouse_id: warehouseId,
          name: item.description,
          description: item.sku ? `SKU ${item.sku}` : null,
          quantity: 0, // la quantità la mette la funzione, con il movimento
          unit_cost: Number(item.unit_price ?? 0),
          vat_rate: Number(item.vat_rate ?? 22),
          supplier_id: odaData?.supplier_id ?? null,
          min_stock_level: 0,
        } as never)
        .select("id")
        .single();
      if (errCreazione) throw errCreazione;
      stockItemId = creato?.id ?? null;
    }

    righe.push({ item_id: item.id, quantity: qtyToLoad, stock_item_id: stockItemId });
  }

  // tutto già arrivato: niente da registrare (e nessuna bolla in più)
  if (righe.length === 0) return { righe: 0, senzaRighe: false, completo: suMisuraSaltate === 0, suMisura: suMisuraSaltate, errori: [] };

  const { data, error } = await supabase.rpc("oda_registra_arrivo", {
    p_oda_id: odaId,
    p_righe: righe as never,
    p_ddt_number: null,
    p_ddt_data: params.data ?? null,
    p_warehouse_id: warehouseId,
    p_note: params.note ?? null,
    p_ddt_file_url: null,
    p_ddt_id: params.ddtId ?? null,
  } as never);
  if (error) throw error;
  const esito = (Array.isArray(data) ? data[0] : data) as { oda_completo?: boolean; errori?: EsitoRicezioneResiduo["errori"] } | null;
  return {
    righe: righe.length,
    senzaRighe: false,
    completo: !!esito?.oda_completo,
    suMisura: suMisuraSaltate,
    errori: esito?.errori ?? [],
  };
}
