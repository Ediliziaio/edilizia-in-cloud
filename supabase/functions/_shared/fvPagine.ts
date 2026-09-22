/**
 * Le pagine del PDF Fotovoltaico: l'ordine di serie e le regole per l'ordine che
 * l'azienda salva nel modello.
 *
 * Un elenco solo, per il PDF (fvHtmlTemplate.ts) e per l'editor
 * (src/lib/fotovoltaico/pdfPages.ts). Fino al 22/09/2026 erano due: il PDF seguiva
 * l'ordine di vendita deciso il 29/06 (prima fiducia, prodotto e valore, poi il
 * prezzo), l'editor mostrava ancora quello di prima, col prezzo in testa, e
 * toccando una pagina qualsiasi l'azienda l'avrebbe salvato.
 *
 * Modulo puro, senza import: lo usano sia il browser sia le edge function.
 */

export type FvPdfPageId =
  | "recensioni"
  | "investimento"
  | "anteprima"
  | "componenti"
  | "macro_categorie"
  | "produzione"
  | "flussi"
  | "risparmio"
  | "costi_futuri"
  | "piano_pagamento"
  | "bollette_240"
  | "cassa_25"
  | "co2"
  | "garanzie"
  | "iter"
  | "faq"
  | "decisione"
  // I blocchi della libreria (_shared/blocchiPreventivo.ts): testi e foto di serie
  // per il fotovoltaico, che l'azienda cambia dall'ordine delle pagine.
  | "come_funziona"
  | "protezione"
  | "controlli"
  | "documenti"
  | "diario";

export interface FvPdfPageOrderItem {
  id: FvPdfPageId;
  visible: boolean;
}

export interface FvPdfPageMeta {
  id: FvPdfPageId;
  label: string;
  descrizione: string;
  obbligatoria: boolean;
  /**
   * false = la pagina nasce nascosta, anche nei modelli già salvati. Oggi nessuna:
   * dal 22/09/2026 anche i blocchi che promettono qualcosa nascono accesi.
   */
  diSerie?: boolean;
}

export const FV_PDF_PAGES_META: FvPdfPageMeta[] = [
  // Ordine di default in stile vendita (la "linea retta" di Belfort): prima la
  // FIDUCIA (chi siamo + garanzie) e il percorso, poi il DESIDERIO (prodotto e
  // prova), poi il VALORE (risparmio, cassa 25 anni), e SOLO dopo il PREZZO
  // (investimento + rata) e l'URGENZA. Il prezzo non si mostra mai prima del
  // valore. Questo e' lo standard; l'utente puo' sempre ri-trascinare.
  // — Atto 1: Fiducia —
  { id: "garanzie", label: "Chi siamo e garanzie", descrizione: "Azienda, prova sociale, certificazioni e garanzie.", obbligatoria: false },
  { id: "iter", label: "Percorso cliente", descrizione: "Iter pratiche, installazione, allaccio e servizi inclusi.", obbligatoria: false },
  // — Atto 2: Desiderio (prodotto e prova) —
  // Come funziona un impianto, con due foto tecniche: prima dell'impianto del cliente.
  { id: "come_funziona", label: "Come funziona un impianto", descrizione: "Produce, converte, conserva, scambia: spiegato con due foto tecniche.", obbligatoria: false },
  { id: "anteprima", label: "Anteprima impianto", descrizione: "Vista tetto, layout pannelli e fonte dati.", obbligatoria: false },
  { id: "componenti", label: "Componenti scelti", descrizione: "Prodotti reali scelti nel preventivo e arricchiti dal listino.", obbligatoria: true },
  { id: "macro_categorie", label: "Pagine linee prodotto", descrizione: "Pagine dedicate lette dalle macro-categorie del listino.", obbligatoria: false },
  { id: "produzione", label: "Produzione", descrizione: "Producibilita mensile, fonte dati e qualita tetto.", obbligatoria: false },
  { id: "flussi", label: "Flussi energia", descrizione: "Autoconsumo, autosufficienza e energia ceduta.", obbligatoria: false },
  // — Atto 3: Valore (quanto guadagna, prima del costo) —
  { id: "risparmio", label: "Risparmio", descrizione: "Bolletta prima/dopo e risparmio mensile.", obbligatoria: false },
  { id: "costi_futuri", label: "Costi futuri", descrizione: "Scenario costo energia nei prossimi anni.", obbligatoria: false },
  { id: "cassa_25", label: "Cassa 25 anni", descrizione: "Cashflow, breakeven e valore cumulato.", obbligatoria: false },
  { id: "co2", label: "Impatto CO2", descrizione: "Beneficio ambientale in equivalenze semplici.", obbligatoria: false },
  // — Atto 4: Offerta (ora il prezzo, e sembra piccolo) —
  { id: "investimento", label: "Investimento", descrizione: "Prezzo, proposta di valore, inclusi e detrazione.", obbligatoria: true },
  { id: "piano_pagamento", label: "Piano economico", descrizione: "Rata, risparmio e costo netto mensile. Esce solo con un finanziamento.", obbligatoria: false },
  // Spenta di serie dal 22/09/2026: numeri del picco del 2022 (+240% dal 2012) presentati
  // come tendenza, e toni da urgenza. L'azienda che la vuole la riaccende dall'ordine pagine.
  { id: "bollette_240", label: "Perché farlo ora", descrizione: "Aumento delle bollette 2012-2022 e urgenza: dati di quel periodo, da rileggere prima di accenderla.", obbligatoria: false, diSerie: false },
  // — Durante e dopo i lavori: rispondono ai dubbi proprio quando il cliente decide.
  // Promettono qualcosa: accese di serie (22/09/2026), l'azienda le rilegge e le
  // spegne se non lo fa. In testa, con la fiducia, erano sei pagine prima dell'impianto.
  { id: "protezione", label: "Sicurezza sul tetto", descrizione: "Come lavorate sul tetto e proteggete la casa.", obbligatoria: false },
  { id: "controlli", label: "Controlli di qualità", descrizione: "Cosa verificate prima di mettere in servizio l'impianto.", obbligatoria: false },
  { id: "documenti", label: "Documenti consegnati", descrizione: "Conformità, pratiche, garanzie e monitoraggio consegnati al cliente.", obbligatoria: false },
  { id: "diario", label: "Diario fotografico", descrizione: "Le foto dell'installazione, anche di quello che poi resta sotto i pannelli.", obbligatoria: false },
  // Il voto su Google o Trustpilot (Profilo azienda), le parole dei clienti e le foto
  // degli impianti fatti (dal 22/09/2026): prima erano due riquadri nella pagina delle
  // garanzie, in testa al documento. Qui stanno con le domande, dove il cliente decide.
  { id: "recensioni", label: "Dicono di noi", descrizione: "Il voto su Google o Trustpilot, le parole dei clienti e le foto dei vostri impianti. Esce se c'è almeno uno dei tre.", obbligatoria: false },
  // — Atto 5: Chiusura —
  { id: "faq", label: "FAQ", descrizione: "Domande e risposte scritte nel modello: senza, la pagina non esce.", obbligatoria: false },
  { id: "decisione", label: "CTA e firma", descrizione: "Riepilogo offerta e contatti; dopo, le condizioni, la pagina della firma e il modulo di recesso.", obbligatoria: true },
];

export const FV_PDF_PAGES_DEFAULT: FvPdfPageOrderItem[] = FV_PDF_PAGES_META.map((page) => ({
  id: page.id,
  visible: page.diSerie !== false,
}));

/**
 * L'ordine salvato, completato: gli id sconosciuti o doppi si scartano, le
 * obbligatorie restano visibili, e le pagine che mancano (arrivate dopo che
 * l'azienda ha salvato) entrano dopo quella che le precede nell'ordine di serie,
 * nascoste se nascono spente. Prima finivano in fondo, dopo la firma.
 */
export function normalizeFvPdfPagesOrder(
  saved: ReadonlyArray<{ id?: string | null; visible?: boolean | null } | null | undefined> | null | undefined,
): FvPdfPageOrderItem[] {
  const validIds = new Set<string>(FV_PDF_PAGES_META.map((page) => page.id));
  const mandatoryIds = new Set<string>(FV_PDF_PAGES_META.filter((page) => page.obbligatoria).map((page) => page.id));
  const out: FvPdfPageOrderItem[] = [];
  const seen = new Set<string>();

  for (const item of saved ?? []) {
    const id = item?.id;
    if (!id || !validIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id: id as FvPdfPageId, visible: mandatoryIds.has(id) ? true : Boolean(item?.visible) });
  }

  FV_PDF_PAGES_META.forEach((meta, i) => {
    if (seen.has(meta.id)) return;
    let dopo = -1;
    for (let j = i - 1; j >= 0 && dopo === -1; j--) {
      dopo = out.findIndex((it) => it.id === FV_PDF_PAGES_META[j].id);
    }
    out.splice(dopo + 1, 0, { id: meta.id, visible: meta.diSerie !== false });
    seen.add(meta.id);
  });

  return out;
}
