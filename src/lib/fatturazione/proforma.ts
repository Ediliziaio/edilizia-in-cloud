import { supabase } from "@/integrations/supabase/client";
import type { DocumentoFiscale, RigaDocumento } from "@/types/fatturazione";
import { calcolaTotaliDocumento } from "./calcoli";

/**
 * Converts a proforma or preventivo into a fattura.
 * - Creates a new fattura with same data
 * - Marks original as 'annullata' with a reference note
 */
export async function convertiProformaInFattura(proformaId: string): Promise<DocumentoFiscale> {
  // Load original
  const { data: orig, error: fetchErr } = await supabase
    .from("documenti_fiscali" as never)
    .select("*")
    .eq("id", proformaId)
    .is("deleted_at", null)
    .single();

  if (fetchErr) throw fetchErr;
  const doc = orig as Record<string, unknown>;

  if (!["proforma", "preventivo"].includes(doc.tipo as string)) {
    throw new Error("Solo proforma e preventivi possono essere convertiti");
  }

  // A conversione fatta l'originale viene annullato: se lo e' gia', qualcuno
  // sta convertendo due volte lo stesso documento e ne uscirebbero DUE fatture
  // (con due numeri fiscali). L'interfaccia nasconde gia' il pulsante, questa
  // e' la rete sotto.
  if (doc.stato === "annullata") {
    throw new Error("Questo documento risulta gia' convertito in fattura");
  }

  const companyId = doc.company_id as string;

  // Ricalcola totali e riepilogo_iva dalle righe per garantire consistenza
  const righe = (doc.righe as RigaDocumento[]) || [];
  const totali = calcolaTotaliDocumento(righe, {
    scontoGlobalePerc: doc.sconto_globale_percentuale as number | undefined,
    scontoGlobaleValore: doc.sconto_globale_valore as number | undefined,
    bolloVirtuale: doc.bollo_virtuale as boolean | undefined,
    bolloImporto: doc.bollo_importo as number | undefined,
    ritenutaAcconto: doc.ritenuta_acconto as boolean | undefined,
    ritenutaAliquota: doc.ritenuta_aliquota as number | undefined,
    cassaPrevidenziale: doc.cassa_previdenziale as boolean | undefined,
    cassaAliquota: doc.cassa_aliquota as number | undefined,
    cassaImponibile: doc.cassa_imponibile as number | undefined,
    cassaAliquotaIva: doc.cassa_aliquota_iva as string | undefined,
    cassaRitenuta: doc.cassa_ritenuta as boolean | undefined,
    rivalsaInps: doc.rivalsa_inps as boolean | undefined,
    rivalsaAliquota: doc.rivalsa_aliquota as number | undefined,
    altraRitenuta: doc.altra_ritenuta as boolean | undefined,
    altraRitenutaAliquota: doc.altra_ritenuta_aliquota as number | undefined,
    arrotondamento: doc.arrotondamento as number | undefined,
    esigibilitaDefault: doc.esigibilita_iva as "I" | "D" | "S" | undefined,
    splitPayment: doc.esigibilita_iva === "S",
  });

  // Create fattura: da documento_crea come ogni altro documento (24/09/2026).
  // Nasce in bozza e senza numero: il numero lo dà l'emissione. Prima qui si
  // prendeva un numero di fattura subito, e una conversione abbandonata
  // lasciava un buco nella serie.
  const dati = {
    tipo: "fattura",
    // Data LOCALE, non UTC: con toISOString() tra mezzanotte e l'1/2 di
    // notte italiane la data di emissione slittava al giorno precedente.
    data_emissione: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`,
    anagrafica_id: doc.anagrafica_id,
    cliente_snapshot: doc.cliente_snapshot,
    stato: "bozza",
    righe: doc.righe,
    riepilogo_iva: totali.riepilogo_iva,
    subtotale: totali.subtotale,
    imponibile_totale: totali.imponibile_totale,
    iva_totale: totali.iva_totale,
    totale_documento: totali.totale_documento,
    totale_da_pagare: totali.totale_da_pagare,
    scadenze_pagamento: doc.scadenze_pagamento,
    metodo_pagamento_codice: doc.metodo_pagamento_codice,
    iban_pagamento: doc.iban_pagamento,
    note_documento: doc.note_documento,
    documento_correlato_id: proformaId,
    bollo_virtuale: doc.bollo_virtuale,
    ritenuta_acconto: doc.ritenuta_acconto,
    ritenuta_tipo: doc.ritenuta_tipo,
    ritenuta_aliquota: doc.ritenuta_aliquota,
    ritenuta_importo: doc.ritenuta_importo,
    cassa_previdenziale: doc.cassa_previdenziale,
    cassa_tipo: doc.cassa_tipo,
    cassa_aliquota: doc.cassa_aliquota,
    cassa_importo: doc.cassa_importo,
    cassa_imponibile: doc.cassa_imponibile,
    cassa_aliquota_iva: doc.cassa_aliquota_iva,
    cassa_ritenuta: doc.cassa_ritenuta,
    // Sconto globale
    sconto_globale_percentuale: doc.sconto_globale_percentuale,
    sconto_globale_valore: totali.scontoGlobaleValore,
    // Bollo
    bollo_importo: doc.bollo_importo,
    // Bank details
    bic_pagamento: doc.bic_pagamento,
    nome_banca: doc.nome_banca,
    intestatario_conto: doc.intestatario_conto,
    metodo_pagamento_nome: doc.metodo_pagamento_nome,
    // Rivalsa INPS
    rivalsa_inps: doc.rivalsa_inps,
    rivalsa_tipo: doc.rivalsa_tipo,
    rivalsa_aliquota: doc.rivalsa_aliquota,
    rivalsa_importo: totali.rivalsa_importo,
    // Altra ritenuta
    altra_ritenuta: doc.altra_ritenuta,
    altra_ritenuta_tipo: doc.altra_ritenuta_tipo,
    altra_ritenuta_aliquota: doc.altra_ritenuta_aliquota,
    altra_ritenuta_importo: totali.altra_ritenuta_importo,
    altra_ritenuta_causale: doc.altra_ritenuta_causale,
    // Ritenuta causale
    ritenuta_causale: doc.ritenuta_causale,
    // PA fields
    cig: doc.cig,
    cup: doc.cup,
    codice_commessa_convenzione: doc.codice_commessa_convenzione,
    // FE fields
    esigibilita_iva: doc.esigibilita_iva,
    arrotondamento: doc.arrotondamento,
    // Causale & note
    causale: doc.causale,
    note_interne: doc.note_interne,
    // Serie
    serie: doc.serie,
  };
  const { data: creato, error: createErr } = await supabase.rpc("documento_crea" as never, {
    p_company_id: companyId,
    p_dati: dati,
  } as never) as { data: { id?: string } | null; error: { message?: string } | null };
  if (createErr) throw new Error(createErr.message ?? "Creazione della fattura non riuscita");
  if (!creato?.id) throw new Error("La fattura non e' stata creata");

  const { data: newDoc, error: readErr } = await supabase
    .from("documenti_fiscali" as never)
    .select("*")
    .eq("id", creato.id)
    .single();
  if (readErr) throw readErr;

  // Mark original as annullata
  const { error: updateErr } = await supabase
    .from("documenti_fiscali" as never)
    .update({
      stato: "annullata",
      note_interne: "Convertito in fattura: la trovi tra le bozze, prende il numero quando la emetti",
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", proformaId);

  if (updateErr) {
    console.error('[proforma] Errore aggiornamento stato proforma originale:', updateErr.message, updateErr.code);
    throw new Error(`Impossibile aggiornare lo stato del documento originale: ${updateErr.message}`);
  }

  return newDoc as unknown as DocumentoFiscale;
}
