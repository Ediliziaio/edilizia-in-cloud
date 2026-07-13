import { describe, expect, it } from "vitest";
import {
  getFvPdfRenderedPagesCount,
  renderFvPdfHtml,
  type FvPdfTemplateData,
} from "../../../supabase/functions/_shared/fvHtmlTemplate.ts";

function basePdfData(): FvPdfTemplateData {
  return {
    azienda: {
      name: "Demo Solar",
      tagline: "Fotovoltaico chiavi in mano",
      phone: "+39 02 123456",
      email: "info@demo.it",
      website: "https://demo.it",
      vat_number: "IT123",
    },
    cliente: {
      nome: "Mario",
      cognome: "Rossi",
      indirizzo: "Via Roma 1",
      comune: "Milano",
      cap: "20100",
      provincia: "MI",
      tipologia_immobile: "Villa",
    },
    progetto: {
      numero: "FV-TEST",
      titolo: "Mario Rossi",
      creato_il: "2026-05-23T10:00:00Z",
      valido_giorni: 30,
      venditore: "Venditore Demo",
      potenza_kwp: 6,
      numero_pannelli: 12,
      has_accumulo: true,
      capacita_accumulo_kwh: 5,
      consumo_annuo_kwh: 4200,
      costo_kwh_attuale: 0.32,
      profilo_consumo: "misto",
      ore_sole_annue: 1450,
      superficie_tetto_disponibile_mq: 55,
    },
    costi: {
      prezzo_vendita_iva_inclusa: 18000,
      iva_perc: 10,
      detrazione_eur: 9000,
      detrazione_perc: 50,
      costo_netto_dopo_detrazione: 9000,
    },
    finanziamento: {
      finanziaria: "Demo Finance",
      durata_mesi: 84,
      rata_mensile: 230,
      tan_perc: 4,
      taeg_perc: 5,
      importo_finanziato: 18000,
    },
    scenario: {
      risparmio_mensile_eur: 150,
      risparmio_anno1_eur: 1800,
      risparmio_25_anni_eur: 46000,
      payback_anni: 8,
      npv_25_anni: 24000,
      cassa_anno_per_anno: [
        { anno: 0, cumulato: -18000 },
        { anno: 8, cumulato: 0 },
        { anno: 25, cumulato: 46000 },
      ],
    },
    flows: {
      produzione_kwh: 7400,
      autoconsumo_kwh: 4200,
      ceduto_rete_kwh: 3200,
      prelievo_rete_kwh: 900,
      autoconsumo_pct: 0.57,
      autosufficienza_pct: 0.78,
      consumo_da_rete_pct: 0.22,
      consumo_da_fv_pct: 0.78,
    },
    componenti: [
      {
        categoria: "pannello",
        descrizione: "Pannello 500 W",
        marca: "Demo",
        modello: "PV500",
        quantita: 12,
        potenza_w: 500,
        garanzia_anni: 25,
      },
      {
        categoria: "inverter",
        descrizione: "Inverter 6 kW",
        marca: "Demo",
        modello: "INV6",
        quantita: 1,
        garanzia_anni: 10,
      },
    ],
  };
}

describe("fotovoltaico PDF template", () => {
  it("renders a screen-only action bar for printing or saving the PDF", () => {
    const html = renderFvPdfHtml(basePdfData());

    expect(html).toContain('class="pdf-action-bar"');
    expect(html).toContain("Stampa / Salva PDF");
    expect(html).toContain("window.print()");
    expect(html).toContain(".pdf-action-bar { display: none !important; }");
  });

  it("renders roof data provenance and flags estimated roof data", () => {
    const html = renderFvPdfHtml({
      ...basePdfData(),
      progetto: {
        ...basePdfData().progetto,
        fonte_dati_tetto: "manuale",
        qualita_dati_tetto: "mock",
        imagery_date: "2026-05-01",
      },
    });

    expect(html).toContain("Fonte dati tetto");
    expect(html).toContain("dato manuale");
    expect(html).toContain("Dati tetto stimati");
    expect(html).toContain("confermare con sopralluogo");
  });

  it("renders the actual project services included in the quote", () => {
    const html = renderFvPdfHtml({
      ...basePdfData(),
      servizi: [
        {
          tipo: "pratica",
          descrizione: "Pratica ENEA e dossier detrazione",
          quantita: 1,
          prezzo_vendita: 450,
          note_operative: "Dossier pronto per commercialista entro fine lavori",
        },
        {
          tipo: "allaccio",
          descrizione: "Gestione TICA e allaccio rete",
          quantita: 1,
          prezzo_vendita: 650,
          note_operative: null,
        },
      ],
    });

    expect(html).toContain("Servizi inclusi nella proposta");
    expect(html).toContain("Pratica ENEA e dossier detrazione");
    expect(html).toContain("Dossier pronto per commercialista");
    expect(html).toContain("Gestione TICA e allaccio rete");
  });

  it("uses listino macro-category media when component images are missing", () => {
    const html = renderFvPdfHtml({
      ...basePdfData(),
      template: {
        listino_macrocategorie_fv: [
          {
            nome: "Moduli fotovoltaici premium",
            descrizione_estesa:
              "Immagine reale della macro-categoria pannelli usata nel PDF commerciale.",
            immagine_url: "https://cdn.example.test/fv/pannelli-premium.webp",
          },
        ],
      },
    });

    expect(html).toContain("https://cdn.example.test/fv/pannelli-premium.webp");
    expect(html).toContain("Moduli fotovoltaici premium");
    expect(html).toContain("Immagine reale della macro-categoria pannelli");
  });

  it("renders dedicated FV macro-category pages from the listino when enabled", () => {
    const html = renderFvPdfHtml({
      ...basePdfData(),
      template: {
        listino_macrocategorie_fv: [
          {
            nome: "Pannelli alta efficienza",
            descrizione_estesa:
              "Pagina dedicata dal listino FV con storytelling tecnico, garanzie prodotto e resa nel tempo.",
            immagine_url: "https://cdn.example.test/fv/pagina-pannelli.webp",
            mostra_pagina_dedicata_pdf: true,
          },
          {
            nome: "Batterie accumulo",
            descrizione_estesa: "Non deve comparire se non c'e' un componente accumulo nel progetto.",
            immagine_url: "https://cdn.example.test/fv/accumulo.webp",
            mostra_pagina_dedicata_pdf: true,
          },
        ],
      },
    });

    expect(html).toContain("Pagina dedicata · Linea prodotto");
    expect(html).toContain("Pannelli alta efficienza");
    expect(html).toContain("https://cdn.example.test/fv/pagina-pannelli.webp");
    expect(html).toContain("storytelling tecnico");
    expect(html).not.toContain("Non deve comparire se non c&#039;e&#039; un componente accumulo");
  });

  it("renders company FV conversion blocks inside the generated HTML", () => {
    const html = renderFvPdfHtml({
      ...basePdfData(),
      template: {
        valore_proposta_html:
          "<p>Analisi bolletta, sopralluogo tecnico e pratiche incluse con numeri chiari.</p>",
        garanzie_conversione: [
          {
            icona: "shield",
            titolo: "Sopralluogo tecnico prima dell'ordine",
            descrizione: "Verifichiamo tetto, quadri, passaggi cavi e vincoli prima della conferma.",
          },
        ],
        faq_items: [
          {
            domanda: "L'accumulo e' sempre obbligatorio?",
            risposta: "No, viene consigliato solo quando profilo consumi e ritorno economico lo giustificano.",
          },
        ],
        urgenza_attiva: true,
        urgenza_titolo: "Prezzi componenti bloccati",
        urgenza_descrizione: "Conferma entro validita preventivo per mantenere condizioni e disponibilita.",
        condizioni_legali_attivo: true,
        condizioni_legali_testo:
          "<p>Offerta soggetta a sopralluogo, acconto, saldo e verifica pratiche di connessione.</p>",
      },
    });

    expect(html).toContain("Analisi bolletta, sopralluogo tecnico");
    expect(html).toContain("Sopralluogo tecnico prima dell&#039;ordine");
    expect(html).toContain("L&#039;accumulo e&#039; sempre obbligatorio?");
    expect(html).toContain("Prezzi componenti bloccati");
    expect(html).toContain("Condizioni commerciali");
  });

  it("renders operational rental legal notes when the PDF uses noleggio FV", () => {
    const html = renderFvPdfHtml({
      ...basePdfData(),
      finanziamento: {
        ...basePdfData().finanziamento!,
        finanziaria: "Noleggio operativo FV",
      },
      template: {
        noleggio_note_legali:
          "Canone, deducibilita e condizioni di riscatto devono essere confermati dal partner finanziario.",
      },
    });

    expect(html).toContain("Nota noleggio operativo");
    expect(html).toContain("Canone, deducibilita");
  });

  it("renders customizable FV cover settings from the company template", () => {
    const html = renderFvPdfHtml({
      ...basePdfData(),
      template: {
        pdf_cover_eyebrow: "Analisi solare personalizzata",
        pdf_cover_hero: "Energia pulita per casa Rossi",
        pdf_cover_subhero: "Impianto 6 kWp con accumulo e pratiche incluse.",
        pdf_cover_image_url: "https://cdn.example.test/fv/cover-tetto.webp",
        pdf_cover_bg_color: "#123456",
        pdf_cover_text_color: "#FAFAFA",
        pdf_cover_overlay_opacity: 42,
        pdf_cover_text_align: "center",
        pdf_cover_logo_position: "hidden",
        pdf_cover_show_client_card: false,
      },
    });

    expect(html).toContain("Analisi solare personalizzata");
    expect(html).toContain("Energia pulita per casa Rossi");
    expect(html).toContain("Impianto 6 kWp con accumulo");
    expect(html).toContain("https://cdn.example.test/fv/cover-tetto.webp");
    expect(html).toContain("#123456");
    expect(html).toContain("#FAFAFA");
    expect(html).not.toContain("Preparato per");
  });

  it("uses the FV page order to hide optional pages without freezing dynamic product data", () => {
    const html = renderFvPdfHtml({
      ...basePdfData(),
      componenti: [
        ...basePdfData().componenti,
        {
          categoria: "accumulo",
          descrizione: "Batteria dinamica dal preventivo",
          marca: "Demo",
          modello: "BAT5",
          quantita: 1,
          capacita_kwh: 5,
          garanzia_anni: 10,
        },
      ],
      template: {
        pdf_pages_order: [
          { id: "componenti", visible: true },
          { id: "investimento", visible: true },
          { id: "macro_categorie", visible: true },
          { id: "faq", visible: false },
          { id: "decisione", visible: true },
        ],
        listino_macrocategorie_fv: [
          {
            nome: "Batterie accumulo",
            descrizione_estesa: "Pagina dedicata letta dal listino e mostrata solo se scelta nel preventivo.",
            immagine_url: "https://cdn.example.test/fv/accumulo-listino.webp",
            mostra_pagina_dedicata_pdf: true,
          },
        ],
      },
    });

    expect(html.indexOf("Pagina 2 · I componenti")).toBeLessThan(html.indexOf("Pagina 3 · L'investimento"));
    expect(html).toContain("Batteria dinamica dal preventivo");
    expect(html).toContain("Pagina dedicata letta dal listino");
    expect(html).not.toContain("Pagina 4 · Domande frequenti");
  });

  it("calculates the dynamic rendered page count used by the PDF footer and audit log", () => {
    const data: FvPdfTemplateData = {
      ...basePdfData(),
      componenti: [
        ...basePdfData().componenti,
        {
          categoria: "accumulo",
          descrizione: "Batteria dinamica dal preventivo",
          marca: "Demo",
          modello: "BAT5",
          quantita: 1,
          capacita_kwh: 5,
          garanzia_anni: 10,
        },
      ],
      template: {
        pdf_pages_order: [
          { id: "investimento", visible: true },
          { id: "anteprima", visible: false },
          { id: "componenti", visible: true },
          { id: "macro_categorie", visible: true },
          { id: "produzione", visible: false },
          { id: "flussi", visible: false },
          { id: "risparmio", visible: false },
          { id: "costi_futuri", visible: false },
          { id: "piano_pagamento", visible: false },
          { id: "bollette_240", visible: false },
          { id: "cassa_25", visible: false },
          { id: "co2", visible: false },
          { id: "garanzie", visible: false },
          { id: "iter", visible: false },
          { id: "faq", visible: false },
          { id: "decisione", visible: true },
        ],
        listino_macrocategorie_fv: [
          {
            nome: "Batterie accumulo",
            descrizione_estesa: "Pagina dedicata letta dal listino.",
            immagine_url: "https://cdn.example.test/fv/accumulo-listino.webp",
            mostra_pagina_dedicata_pdf: true,
          },
        ],
      },
    };

    const html = renderFvPdfHtml(data);

    expect(getFvPdfRenderedPagesCount(data)).toBe(5);
    expect(html).toContain('<span class="pnum">5 / 5</span>');
    expect(html).not.toContain("Pagina 6");
  });
});

// ── 13/7/2026 — Verifica esplicita richiesta: nel PDF gli ELENCHI componenti
// e le FOTO prodotto devono comparire. Copre la catena edge→template:
// image_url (foto articolo, base64 o URL) → <img>; senza foto → icona SVG
// fallback; marca/modello/quantità/chip specs sempre presenti.
describe("fotovoltaico PDF — elenco componenti e foto prodotti", () => {
  it("mostra la foto del prodotto quando image_url è presente", () => {
    const d = basePdfData();
    d.componenti = [
      {
        categoria: "pannello",
        descrizione: "Modulo monocristallino",
        marca: "SunPower",
        modello: "MAX-540",
        quantita: 16,
        potenza_w: 540,
        garanzia_anni: 25,
        image_url: "data:image/jpeg;base64,QUJD",
      },
      {
        categoria: "inverter",
        descrizione: "Inverter ibrido",
        marca: "Huawei",
        modello: "SUN2000",
        quantita: 1,
        garanzia_anni: 10,
      },
    ];
    const html = renderFvPdfHtml(d);
    // Foto reale del pannello embedded
    expect(html).toContain('src="data:image/jpeg;base64,QUJD"');
    // Marca e modello in card
    expect(html).toContain("SunPower");
    expect(html).toContain("MAX-540");
    expect(html).toContain("Huawei");
    // Quantità e chip specs
    expect(html).toContain("16 pezzi");
    expect(html).toContain("540 Wp");
    expect(html).toContain("25 anni");
  });

  it("senza foto usa l'icona SVG di categoria (mai card vuota)", () => {
    const d = basePdfData();
    const html = renderFvPdfHtml(d);
    // La pagina componenti c'è con le card dei 2 componenti fixture
    expect(html).toContain("I componenti");
    expect(html).toContain("PV500");
    expect(html).toContain("INV6");
    // Nessuna immagine articolo → fallback vettoriale nella card prodotto
    expect(html).toContain('class="product-img"');
    expect(html.match(/product-card/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it("le voci del kit/bundle mostrano descrizione, quantità e foto", () => {
    const d = basePdfData();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (d as any).bundle = {
      nome: "Kit Casa 6 kW",
      descrizione: "Tutto incluso",
      fv_kwp: 6,
      fv_accumulo_kwh: 10,
      voci: [
        { descrizione: "Pannello 500W", quantita: 12, foto: "data:image/png;base64,WFla" },
        { descrizione: "Inverter ibrido", quantita: 1, foto: null },
      ],
    };
    const html = renderFvPdfHtml(d);
    expect(html).toContain("Kit Casa 6 kW");
    expect(html).toContain("Pannello 500W");
    expect(html).toContain('src="data:image/png;base64,WFla"');
    expect(html).toContain("× 12");
  });
});
