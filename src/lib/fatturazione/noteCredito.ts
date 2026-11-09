import { supabase } from "@/integrations/supabase/client";
import type { DocumentoFiscale, RigaDocumento } from "@/types/fatturazione";
import { calcolaRiepilogoIVA, calcolaTotaliDocumento } from "./calcoli";

/** Quanto hanno già stornato le note di credito emesse su questa fattura. */
export async function stornatoDellaFattura(fatturaId: string): Promise<number> {
  const { data, error } = await supabase
    .from("documenti_fiscali" as never)
    .select("totale_da_pagare, totale_documento")
    .eq("documento_correlato_id", fatturaId)
    .eq("tipo", "nota_credito")
    .not("stato", "in", "(bozza,annullata)")
    .is("deleted_at", null);
  if (error) throw error;
  const note = (data ?? []) as unknown as { totale_da_pagare: number | null; totale_documento: number | null }[];
  return note.reduce((somma, n) => somma + Math.abs(Number(n.totale_da_pagare ?? n.totale_documento ?? 0)), 0);
}

/**
 * Creates a credit note (Nota di Credito) from an existing invoice.
 * @param fatturaOriginaleId - ID of the original invoice
 * @param modalita - 'totale' for full reversal, 'parziale' for partial (empty lines)
 */
export async function creaNotaCredito(
  fatturaOriginaleId: string,
  modalita: "totale" | "parziale"
): Promise<Partial<DocumentoFiscale>> {
  // Load original invoice
  const { data, error } = await supabase
    .from("documenti_fiscali" as never)
    .select("*")
    .eq("id", fatturaOriginaleId)
    .is("deleted_at", null)
    .single();

  if (error) throw new Error("Impossibile caricare la fattura originale");
  const fattura = data as unknown as DocumentoFiscale;

  // Uno storno «totale» vale l'intera fattura: se una nota ne ha già stornato una
  // parte supererebbe il dovuto, e l'emissione lo rifiuterebbe solo alla fine.
  if (modalita === "totale" && (await stornatoDellaFattura(fatturaOriginaleId)) > 0.01) {
    throw new Error("Su questa fattura c'è già una nota di credito: usa lo storno parziale per il resto.");
  }

  // Gli importi restano POSITIVI. Il segno di una nota di credito non sta
  // negli importi: sta nel tipo di documento, ed è già scritto una volta sola
  // in `documento_segno()`, che per 'nota_credito' vale -1. Scriverli negativi
  // significa applicare il segno due volte, e il database lo fa davvero:
  //
  //   • `documento_stornato()` somma le note di credito per sottrarle dal
  //     residuo. Con importi negativi sottraeva un negativo: su una fattura da
  //     1.220 € stornata per intero il residuo diventava 2.440 € invece di
  //     zero, e il ramo che marca la fattura come stornata non scattava mai
  //     perché −1.220 non è mai maggiore di 1.220.
  //   • `silvio_tool_quadro_incassi` moltiplica l'incassato per
  //     `documento_segno(tipo)`: una nota di credito negativa finiva per
  //     AUMENTARE gli incassi invece di ridurli.
  //
  // È anche la forma giusta per lo SdI: nel TD04 gli importi si indicano
  // positivi, è il tipo documento a dire che è un accredito.
  const righe: RigaDocumento[] =
    modalita === "totale"
      ? fattura.righe.map((r, i) => ({
          ...r,
          id: crypto.randomUUID(),
          numero_linea: i + 1,
          quantita: Math.abs(r.quantita),
          imponibile: Math.abs(r.imponibile),
          imposta: Math.abs(r.imposta),
          totale_riga: Math.abs(r.totale_riga),
        }))
      : [];

  // Ricalcola riepilogo_iva dalle righe, conservando l'esigibilità IVA
  // della fattura originale (es. split payment "S" per PA — senza questo
  // la NC tornava a esigibilità immediata, incoerente con l'XML originale).
  const riepilogo_iva = righe.length > 0
    ? calcolaRiepilogoIVA(righe, {
        esigibilitaDefault: fattura.esigibilita_iva as "I" | "D" | "S" | undefined,
      })
    : [];

  // Sconto, ritenuta e contributi della fattura valgono anche per la nota: senza,
  // lo storno «totale» non coincideva con la fattura. Importi fissi (sconto a valore,
  // bollo, arrotondamento) solo se si storna tutto; nel parziale restano le percentuali.
  const percentuali = {
    sconto_globale_percentuale: fattura.sconto_globale_percentuale,
    ritenuta_acconto: fattura.ritenuta_acconto, ritenuta_tipo: fattura.ritenuta_tipo,
    ritenuta_aliquota: fattura.ritenuta_aliquota, ritenuta_causale: fattura.ritenuta_causale,
    cassa_previdenziale: fattura.cassa_previdenziale, cassa_tipo: fattura.cassa_tipo, cassa_aliquota: fattura.cassa_aliquota,
    cassa_aliquota_iva: fattura.cassa_aliquota_iva, cassa_ritenuta: fattura.cassa_ritenuta,
    rivalsa_inps: fattura.rivalsa_inps, rivalsa_tipo: fattura.rivalsa_tipo, rivalsa_aliquota: fattura.rivalsa_aliquota,
    altra_ritenuta: fattura.altra_ritenuta, altra_ritenuta_tipo: fattura.altra_ritenuta_tipo,
    altra_ritenuta_aliquota: fattura.altra_ritenuta_aliquota, altra_ritenuta_causale: fattura.altra_ritenuta_causale,
  };
  const fissi = modalita === "totale"
    ? {
        sconto_globale_valore: fattura.sconto_globale_valore, bollo_virtuale: fattura.bollo_virtuale,
        bollo_importo: fattura.bollo_importo, arrotondamento: fattura.arrotondamento,
        cassa_imponibile: fattura.cassa_imponibile,
      }
    : {};
  const totali = calcolaTotaliDocumento(righe, {
    scontoGlobalePerc: percentuali.sconto_globale_percentuale,
    scontoGlobaleValore: fissi.sconto_globale_valore,
    bolloVirtuale: fissi.bollo_virtuale,
    bolloImporto: fissi.bollo_importo,
    ritenutaAcconto: percentuali.ritenuta_acconto,
    ritenutaAliquota: percentuali.ritenuta_aliquota,
    cassaPrevidenziale: percentuali.cassa_previdenziale,
    cassaAliquota: percentuali.cassa_aliquota,
    cassaImponibile: fissi.cassa_imponibile,
    cassaAliquotaIva: percentuali.cassa_aliquota_iva,
    cassaRitenuta: percentuali.cassa_ritenuta,
    rivalsaInps: percentuali.rivalsa_inps,
    rivalsaAliquota: percentuali.rivalsa_aliquota,
    altraRitenuta: percentuali.altra_ritenuta,
    altraRitenutaAliquota: percentuali.altra_ritenuta_aliquota,
    arrotondamento: fissi.arrotondamento,
    esigibilitaDefault: fattura.esigibilita_iva as "I" | "D" | "S" | undefined,
    splitPayment: fattura.esigibilita_iva === "S",
  });

  return {
    tipo: "nota_credito",
    documento_correlato_id: fatturaOriginaleId,
    anagrafica_id: fattura.anagrafica_id,
    cliente_snapshot: fattura.cliente_snapshot,
    righe,
    riepilogo_iva,
    ...percentuali,
    ...fissi,
    // I totali scritti subito: dal dettaglio si può emettere senza riaprire l'editor.
    subtotale: totali.subtotale,
    imponibile_totale: totali.imponibile_totale,
    iva_totale: totali.iva_totale,
    totale_documento: totali.totale_documento,
    totale_da_pagare: totali.totale_da_pagare,
    ritenuta_importo: totali.ritenuta_importo,
    cassa_importo: totali.cassa_importo,
    rivalsa_importo: totali.rivalsa_importo,
    altra_ritenuta_importo: totali.altra_ritenuta_importo,
    esigibilita_iva: fattura.esigibilita_iva,
    cig: fattura.cig,
    cup: fattura.cup,
    codice_commessa_convenzione: fattura.codice_commessa_convenzione,
    metodo_pagamento_codice: fattura.metodo_pagamento_codice,
    iban_pagamento: fattura.iban_pagamento,
    bic_pagamento: fattura.bic_pagamento,
    nome_banca: fattura.nome_banca,
    intestatario_conto: fattura.intestatario_conto,
    note_documento: `Nota di Credito a storno ${modalita === "totale" ? "totale" : "parziale"} della fattura N° ${fattura.numero} del ${fattura.data_emissione}`,
  };
}

/**
 * After a credit note is emitted, update the original invoice's payment status.
 */
export async function applicaStornoSuFattura(
  fatturaId: string,
  importoNC: number
): Promise<void> {
  const { data, error: fetchErr } = await supabase
    .from("documenti_fiscali" as never)
    .select("totale_da_pagare, importo_pagato")
    .eq("id", fatturaId)
    .is("deleted_at", null)
    .single();

  if (fetchErr) throw fetchErr;
  const doc = data as unknown as { totale_da_pagare: number; importo_pagato: number };

  const nuovoPagato = doc.importo_pagato + Math.abs(importoNC);
  const nuovoStato = nuovoPagato >= doc.totale_da_pagare ? "stornata" : "parzialmente_pagata";

  const { error } = await supabase
    .from("documenti_fiscali" as never)
    .update({
      importo_pagato: nuovoPagato,
      stato: nuovoStato,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", fatturaId);

  if (error) throw error;
}
