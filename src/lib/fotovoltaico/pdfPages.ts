export type FvPdfPageId =
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
  | "decisione";

export interface FvPdfPageOrderItem {
  id: FvPdfPageId;
  visible: boolean;
}

export interface FvPdfPageMeta {
  id: FvPdfPageId;
  label: string;
  descrizione: string;
  obbligatoria: boolean;
}

export const FV_PDF_PAGES_META: FvPdfPageMeta[] = [
  {
    id: "investimento",
    label: "Investimento",
    descrizione: "Prezzo, proposta di valore, inclusi e detrazione.",
    obbligatoria: true,
  },
  {
    id: "anteprima",
    label: "Anteprima impianto",
    descrizione: "Vista tetto, layout pannelli e fonte dati.",
    obbligatoria: false,
  },
  {
    id: "componenti",
    label: "Componenti scelti",
    descrizione: "Prodotti reali scelti nel preventivo e arricchiti dal listino.",
    obbligatoria: true,
  },
  {
    id: "macro_categorie",
    label: "Pagine linee prodotto",
    descrizione: "Pagine dedicate lette dalle macro-categorie del listino.",
    obbligatoria: false,
  },
  {
    id: "produzione",
    label: "Produzione",
    descrizione: "Producibilita mensile, fonte dati e qualita tetto.",
    obbligatoria: false,
  },
  {
    id: "flussi",
    label: "Flussi energia",
    descrizione: "Autoconsumo, autosufficienza e energia ceduta.",
    obbligatoria: false,
  },
  {
    id: "risparmio",
    label: "Risparmio",
    descrizione: "Bolletta prima/dopo e risparmio mensile.",
    obbligatoria: false,
  },
  {
    id: "costi_futuri",
    label: "Costi futuri",
    descrizione: "Scenario costo energia nei prossimi anni.",
    obbligatoria: false,
  },
  {
    id: "piano_pagamento",
    label: "Piano economico",
    descrizione: "Rata, risparmio e costo netto mensile. Esce solo con un finanziamento.",
    obbligatoria: false,
  },
  {
    id: "bollette_240",
    label: "Perche farlo ora",
    descrizione: "Narrativa su aumento bollette e urgenza.",
    obbligatoria: false,
  },
  {
    id: "cassa_25",
    label: "Cassa 25 anni",
    descrizione: "Cashflow, breakeven e valore cumulato.",
    obbligatoria: false,
  },
  {
    id: "co2",
    label: "Impatto CO2",
    descrizione: "Beneficio ambientale in equivalenze semplici.",
    obbligatoria: false,
  },
  {
    id: "garanzie",
    label: "Chi siamo e garanzie",
    descrizione: "Azienda, prova sociale, certificazioni e garanzie.",
    obbligatoria: false,
  },
  {
    id: "iter",
    label: "Percorso cliente",
    descrizione: "Iter pratiche, installazione, allaccio e servizi inclusi.",
    obbligatoria: false,
  },
  {
    id: "faq",
    label: "FAQ",
    descrizione: "Domande e risposte scritte nel modello: senza, la pagina non esce.",
    obbligatoria: false,
  },
  {
    id: "decisione",
    label: "CTA e firma",
    descrizione: "Riepilogo offerta e contatti; dopo, le condizioni, la pagina della firma e il modulo di recesso.",
    obbligatoria: true,
  },
];

export const FV_PDF_PAGES_DEFAULT: FvPdfPageOrderItem[] = FV_PDF_PAGES_META.map((page) => ({
  id: page.id,
  visible: true,
}));

export function normalizeFvPdfPagesOrder(
  saved: FvPdfPageOrderItem[] | null | undefined,
): FvPdfPageOrderItem[] {
  const validIds = new Set<FvPdfPageId>(FV_PDF_PAGES_META.map((page) => page.id));
  const mandatoryIds = new Set<FvPdfPageId>(
    FV_PDF_PAGES_META.filter((page) => page.obbligatoria).map((page) => page.id),
  );
  const out: FvPdfPageOrderItem[] = [];
  const seen = new Set<FvPdfPageId>();

  for (const item of saved ?? []) {
    if (!item || !validIds.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push({
      id: item.id,
      visible: mandatoryIds.has(item.id) ? true : Boolean(item.visible),
    });
  }

  for (const page of FV_PDF_PAGES_META) {
    if (!seen.has(page.id)) {
      out.push({ id: page.id, visible: true });
    }
  }

  return out;
}
