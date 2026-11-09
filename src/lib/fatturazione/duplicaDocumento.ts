// «Duplica»: cosa passa dal documento alla sua copia (09/11/2026).
//
// Una regola sola per elenco, dettaglio ed editor. L'elenco passava la riga
// così com'era: dall'8/11 quella riga arriva da una vista ridotta, senza righe né
// pagamento, e la copia nasceva con le sole note — ma anche con lo stato SDI e gli
// incassi dell'originale. Per questo si elenca cosa si copia, non cosa si toglie:
// una colonna nuova resta fuori finché qualcuno non decide che deve passare.
//
// Chi parte dall'elenco deve prima rileggere il documento intero.

import type { DocumentoFiscale, RigaDocumento, ScadenzaPagamento } from "@/types/fatturazione";

const CAMPI_DA_COPIARE = [
  "anagrafica_id", "cliente_snapshot", "serie",
  "riepilogo_iva", "subtotale", "imponibile_totale", "iva_totale", "totale_documento", "totale_da_pagare",
  "sconto_globale_percentuale", "sconto_globale_valore", "arrotondamento", "bollo_virtuale", "bollo_importo",
  "ritenuta_acconto", "ritenuta_tipo", "ritenuta_aliquota", "ritenuta_causale", "ritenuta_importo",
  "cassa_previdenziale", "cassa_tipo", "cassa_aliquota", "cassa_imponibile", "cassa_importo", "cassa_aliquota_iva", "cassa_ritenuta",
  "rivalsa_inps", "rivalsa_tipo", "rivalsa_aliquota", "rivalsa_importo",
  "altra_ritenuta", "altra_ritenuta_tipo", "altra_ritenuta_aliquota", "altra_ritenuta_causale", "altra_ritenuta_importo",
  "metodo_pagamento_codice", "iban_pagamento", "bic_pagamento", "nome_banca", "intestatario_conto",
  "esigibilita_iva", "allega_pdf_sdi", "emesso_in_seguito_a", "cig", "cup", "codice_commessa_convenzione", "causale",
  "note_documento", "note_interne", "probabilita_chiusura", "testo_intro", "testo_conclusivo",
  "ddt_causale_trasporto", "ddt_numero_colli", "ddt_peso", "ddt_aspetto_beni", "ddt_porto", "ddt_mezzo_trasporto",
  "ddt_indirizzo_consegna", "ddt_vettore",
] as const satisfies readonly (keyof DocumentoFiscale)[];

/** Un'integrazione regolarizza una sola fattura ricevuta: copiarla la integrerebbe due volte. */
export function siPuoDuplicare(tipo: string | null | undefined): boolean {
  return !["reverse_charge_interno", "integrazione_servizi_estero", "integrazione_beni_ue", "integrazione_beni_extra_ue"].includes(String(tipo));
}

const GIORNO_MS = 86_400_000;
const adUtc = (giorno: string) => Date.parse(`${giorno.slice(0, 10)}T00:00:00Z`);

/** Oggi sul calendario italiano: la data che la copia prenderà nascendo. */
function oggiItalia(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

/** Stessa distanza dalla data del documento: «a 30 giorni» resta a 30 giorni. */
function spostaData(data: string | undefined, partenza: string | undefined, oggi: string): string | undefined {
  if (!data || !partenza) return undefined;
  const giorni = Math.round((adUtc(data) - adUtc(partenza)) / GIORNO_MS);
  if (Number.isNaN(giorni)) return undefined;
  return new Date(adUtc(oggi) + giorni * GIORNO_MS).toISOString().slice(0, 10);
}

/**
 * I dati con cui nasce la copia: una bozza da modificare, con numero, data, stato,
 * dati SDI, incassi e collegamenti (commessa, DDT, documento correlato) azzerati.
 */
export function datiCopiaDocumento(
  doc: Partial<DocumentoFiscale>,
  oggi: string = oggiItalia(),
): Partial<DocumentoFiscale> {
  const copia: Record<string, unknown> = {};
  for (const campo of CAMPI_DA_COPIARE) {
    const valore = doc[campo];
    if (valore !== undefined && valore !== null) copia[campo] = valore;
  }

  // Id nuovi: quelli vecchi agganciano la riga a SAL e fasi già fatturati.
  // La nota copiata resta legata alla fattura che storna: conta il limite e l'XML la dichiara.
  if ((doc.tipo === "nota_credito" || doc.tipo === "nota_debito") && doc.documento_correlato_id) {
    copia.documento_correlato_id = doc.documento_correlato_id;
  }

  copia.righe = (doc.righe ?? []).map((riga: RigaDocumento, i) => ({
    ...riga,
    id: crypto.randomUUID(),
    numero_linea: i + 1,
  }));

  const dataScadenza = spostaData(doc.data_scadenza, doc.data_emissione, oggi);
  if (dataScadenza) copia.data_scadenza = dataScadenza;
  const dataValidita = spostaData(doc.data_validita, doc.data_emissione, oggi);
  if (dataValidita) copia.data_validita = dataValidita;

  copia.scadenze_pagamento = (doc.scadenze_pagamento ?? []).map((rata: ScadenzaPagamento) => {
    const { pagato_at: _pagatoIl, pagato_importo: _pagatoImporto, ...resto } = rata;
    return {
      ...resto,
      data_scadenza: spostaData(rata.data_scadenza, doc.data_emissione, oggi) ?? rata.data_scadenza,
      pagato: false,
    };
  });

  return copia as Partial<DocumentoFiscale>;
}
