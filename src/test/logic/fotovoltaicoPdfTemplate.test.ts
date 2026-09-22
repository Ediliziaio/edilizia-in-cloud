import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BADGE_GARANZIE_FV,
  badgeGaranzieDalSito,
  FOTO_DI_SERIE_FV,
  FV_PDF_PAGES_DEFAULT,
  FV_PDF_PAGES_META,
  fotoBlocchiDalSito,
  fotoDeiBlocchiFv,
  fotoDiSerieDalSito,
  getFvPdfRenderedPagesCount,
  normalizeFvPdfPagesOrder,
  renderFvPdfHtml,
  type FvPdfTemplateData,
} from "../../../supabase/functions/_shared/fvHtmlTemplate.ts";
import { FV_PDF_PAGES_META as PAGINE_DELL_EDITOR, normalizeFvPdfPagesOrder as ordineDellEditor } from "@/lib/fotovoltaico/pdfPages";
import { condizioniStandard } from "../../../supabase/functions/_shared/condizioniStandard.ts";
import { calcolaBollettaPrimaDopo, calcolaEnergyFlows, quotaAutoconsumo } from "../../../supabase/functions/_shared/fvCalcoli.ts";
import { indirizzoCompleto } from "../../../supabase/functions/_shared/fvHtmlTemplate.ts";

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

  it("col prezzo a corpo elenca pratiche e posa senza importi che non tornano col totale", () => {
    const servizi = [
      { tipo: "pratica", descrizione: "Pratica GSE", quantita: 1, prezzo_vendita: 450, note_operative: null },
      { tipo: "installazione", descrizione: "Posa impianto", quantita: 1, prezzo_vendita: 1200, note_operative: "Ore previste: 24" },
    ];
    const aCorpo = renderFvPdfHtml({
      ...basePdfData(),
      costi: { ...basePdfData().costi, prezzo_a_corpo: true },
      servizi,
    });
    expect(aCorpo).toContain("Pratica GSE");
    expect(aCorpo).toContain("Ore previste: 24");
    expect(aCorpo.match(/class="service-meta">[^<]*€/g)).toBeNull();

    const scontato = renderFvPdfHtml({
      ...basePdfData(),
      costi: { ...basePdfData().costi, sconto_applicato: true },
      servizi,
    });
    expect(scontato.match(/class="service-meta">[^<]*€/g)).toBeNull();

    const dalListino = renderFvPdfHtml({ ...basePdfData(), servizi });
    expect(dalListino).toMatch(/class="service-meta">[^<]*€[^<]*\+ IVA/);
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
    // Dal 20/09/2026 le condizioni non stanno più in un riquadrino sotto la firma:
    // hanno una pagina loro, dopo la decisione, con quello che si firma.
    expect(html).toContain("Quello che<br/>firmiamo insieme.");
    expect(html).toContain("Offerta soggetta a sopralluogo");
    // Dal 21/09/2026 la firma ha una pagina sua, dopo le condizioni.
    expect(html).toContain("Firma del<br/>contratto.");
    expect(html).toContain("dopo le condizioni generali");
    expect(html).not.toContain("Condizioni commerciali");
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

    // L'occhiello non porta più «Pagina N ·»: si riconosce la pagina dalla sua etichetta.
    const occhiello = (testo: string) => html.indexOf(`<div class="eyebrow">${testo}</div>`);
    expect(occhiello("I componenti")).toBeGreaterThan(-1);
    expect(occhiello("I componenti")).toBeLessThan(occhiello("L'investimento"));
    expect(html).not.toMatch(/class="eyebrow">[^<]*Pagina \d/);
    expect(html).toContain("Batteria dinamica dal preventivo");
    expect(html).toContain("Pagina dedicata letta dal listino");
    expect(html).not.toContain('<div class="eyebrow">Domande frequenti</div>');
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
          { id: "come_funziona", visible: false },
          { id: "protezione", visible: false },
          { id: "controlli", visible: false },
          { id: "documenti", visible: false },
          { id: "diario", visible: false },
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

    // Copertina, investimento, componenti, batterie, decisione e — dal 21/09/2026 —
    // la pagina della firma, che segue sempre la decisione.
    expect(getFvPdfRenderedPagesCount(data)).toBe(6);
    expect(html).toContain('<span class="pnum">6 / 6</span>');
    expect(html).not.toContain('<span class="pnum">7 /');
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

// 14/09/2026 — Il PDF non stampa a nome dell'azienda numeri e promesse che
// nessuno ha scritto: 25 preventivi in contanti ricevevano rata, TAN e TAEG.
describe("fotovoltaico PDF — niente numeri e promesse inventate", () => {
  const pagineDisegnate = (html: string) => html.match(/<div class="page">/g)?.length ?? 0;

  it("senza finanziamento non mostra rata, TAN, TAEG né il piano economico", () => {
    const d: FvPdfTemplateData = { ...basePdfData(), finanziamento: null };
    const html = renderFvPdfHtml(d);

    expect(html).not.toContain("Il piano economico");
    expect(html).not.toContain("TAEG");
    expect(html).not.toContain("TAN nominale");
    expect(html).not.toContain("Costo netto reale");
    expect(html).not.toContain("Cofidis");
    expect(pagineDisegnate(html)).toBe(getFvPdfRenderedPagesCount(d));
  });

  it("un tasso che manca si legge n.d., non 4,75% o 5,40%", () => {
    const d = basePdfData();
    d.finanziamento = { ...d.finanziamento!, tan_perc: null, taeg_perc: null };
    const html = renderFvPdfHtml(d);

    expect(html).toContain("Il piano economico");
    expect(html).toContain('<td class="num-cell">n.d.</td>');
    expect(html).not.toContain("4,75");
    expect(html).not.toContain("5,40");
  });

  it("senza modello dell'azienda non inventa garanzie, FAQ, tempi e certificazioni", () => {
    const d = basePdfData();
    const html = renderFvPdfHtml(d);

    for (const inventato of [
      "Albo installatori GSE",
      "Intervento entro 48h",
      "Estendibile a 15 anni",
      "Polizza RC",
      "Cosa succede se vendo casa",
      "7 settimane",
      "KYC",
      "3 giornate",
      "certificata RID GSE",
      "Domande frequenti",
    ]) {
      expect(html).not.toContain(inventato);
    }
    // Le garanzie vere: quelle del produttore, con gli anni dei componenti scelti.
    expect(html).toContain("Garanzia del produttore di 25 anni");
    expect(pagineDisegnate(html)).toBe(getFvPdfRenderedPagesCount(d));
  });

  it("il kit senza copertina entra nel numero di pagine del piè di pagina", () => {
    const d = basePdfData();
    d.bundle = { nome: "Kit Casa 6 kW", voci: [{ descrizione: "Pannello 500W", quantita: 12 }] };
    const html = renderFvPdfHtml(d);
    const totale = getFvPdfRenderedPagesCount(d);

    expect(pagineDisegnate(html)).toBe(totale);
    expect(html).toContain(`<span class="pnum">${totale} / ${totale}</span>`);
  });
});

// 21/09/2026 — La firma ha una pagina sua, dopo le condizioni: si firma dopo averle
// lette, come negli edili e nei Serramenti. Nella pagina della decisione, piena di
// riquadri (passo successivo, urgenza, noleggio), la firma non lasciava posto al prezzo.
describe("fotovoltaico PDF — la pagina della firma", () => {
  const pagineDisegnate = (html: string) => html.match(/<div class="page">/g)?.length ?? 0;
  // Il modulo di recesso lo accende l'azienda (spento di serie dal 21/09/2026).
  const conCondizioni = (recesso = true): FvPdfTemplateData => ({
    ...basePdfData(),
    template: { condizioni_legali_attivo: true, condizioni_legali_testo: condizioniStandard("fotovoltaico"), modulo_recesso_attivo: recesso },
  });

  it("condizioni, poi la firma col riepilogo e la seconda firma, poi il modulo di recesso", () => {
    const d = conCondizioni();
    const html = renderFvPdfHtml(d);
    const condizioni = html.indexOf("Quello che<br/>firmiamo insieme.");
    const firma = html.indexOf("Firma del<br/>contratto.");
    const seconda = html.indexOf("Seconda firma del Committente");
    const recesso = html.indexOf("Modulo di recesso.");
    expect(condizioni).toBeGreaterThan(0);
    expect(firma).toBeGreaterThan(condizioni);
    expect(seconda).toBeGreaterThan(firma);
    expect(recesso).toBeGreaterThan(seconda);
    // Che cosa si firma, e chi firma.
    const paginaFirma = html.slice(firma, recesso);
    for (const voce of ["Impresa", "Committente", "Oggetto", "Documento", "Importo", "Validità", "Per l'impresa", "Firma del committente"]) {
      expect(paginaFirma).toContain(voce);
    }
    expect(paginaFirma).toMatch(/Impianto fotovoltaico [\d,]+ kWp/);
    expect(paginaFirma).toContain("condizioni generali di contratto che la accompagnano");
    expect(pagineDisegnate(html)).toBe(getFvPdfRenderedPagesCount(d));
  });

  it("con l'interruttore spento niente modulo, anche se le condizioni nominano il recesso", () => {
    const d = conCondizioni(false);
    const html = renderFvPdfHtml(d);
    expect(html).toContain("Firma del<br/>contratto.");
    expect(html).not.toContain("Modulo di recesso.");
    expect(html).not.toContain("basta il modulo allegato");
    expect(pagineDisegnate(html)).toBe(getFvPdfRenderedPagesCount(d));
  });

  it("la pagina della decisione non porta più la firma: dice come si firma", () => {
    const html = renderFvPdfHtml(conCondizioni());
    const decisione = html.slice(html.indexOf("La tua decisione"), html.indexOf("Quello che<br/>firmiamo insieme."));
    expect(decisione).toContain("Come si firma");
    expect(decisione).not.toContain('class="sig-box"');
  });

  it("senza condizioni la firma segue la decisione, senza seconda firma né modulo", () => {
    const d: FvPdfTemplateData = { ...basePdfData(), template: { condizioni_legali_attivo: false } };
    const html = renderFvPdfHtml(d);
    expect(html).toContain("Firma del<br/>contratto.");
    expect(html).toContain("«Firma del contratto» che segue");
    expect(html).not.toContain("Seconda firma del Committente");
    expect(html).not.toContain("Modulo di recesso.");
    expect(html).not.toContain("condizioni generali di contratto che la accompagnano");
    expect(pagineDisegnate(html)).toBe(getFvPdfRenderedPagesCount(d));
  });

  it("la decisione non si nasconde: il contratto esce sempre, anche se l'ordine salvato la spegne", () => {
    const d = conCondizioni();
    d.template = {
      ...d.template,
      pdf_pages_order: normalizeFvPdfPagesOrder(null).map((p) => (p.id === "decisione" ? { ...p, visible: false } : p)),
    };
    const html = renderFvPdfHtml(d);
    const totale = getFvPdfRenderedPagesCount(d);
    expect(html).toContain("Firma del<br/>contratto.");
    expect(pagineDisegnate(html)).toBe(totale);
    expect(html).toContain(`<span class="pnum">${totale} / ${totale}</span>`);
  });
});

// 21/09/2026 — «L'accumulo cambia tutto» stampava «~35%», «il doppio» e un
// risparmio pari al 40% di quello annuo per tutti: numeri che nessun calcolo aveva
// prodotto. Ora i due valori vengono dallo stesso modello, con e senza batteria.
describe("fotovoltaico PDF — l'accumulo con numeri calcolati", () => {
  it("con i flussi senza batteria stampa i due valori veri e i kWh in più", () => {
    const d = basePdfData();
    d.flows_senza_accumulo = { ...d.flows, autoconsumo_kwh: d.flows.autoconsumo_kwh - 1500, autoconsumo_pct: 0.25 };
    const html = renderFvPdfHtml(d);
    expect(html).toContain("Senza batteria useresti in casa il 25%");
    expect(html).toContain("1.500 kWh all'anno");
    expect(html).not.toContain("~35%");
    expect(html).not.toContain("il doppio");
  });

  it("senza quei flussi non inventa la percentuale senza batteria né il risparmio in più", () => {
    const html = renderFvPdfHtml(basePdfData());
    expect(html).toContain("L'accumulo cambia tutto.");
    expect(html).not.toContain("Senza batteria useresti");
    expect(html).not.toContain("~35%");
    expect(html).not.toMatch(/in più all'anno<\/strong> di risparmio/);
  });

  it("il generatore calcola i flussi senza batteria con gli stessi dati", () => {
    const src = readFileSync(resolve(process.cwd(), "supabase/functions/fv-genera-pdf/index.ts"), "utf8");
    expect(src).toContain("calcolaEnergyFlows({ ...ingressiFlussi, has_accumulo: false, capacita_accumulo_kwh: 0, autoconsumo_pct: quotaAutoconsumo(profilo, 0) })");
    expect(src).toContain("flows_senza_accumulo: flowsSenzaAccumulo,");
  });
});

// 21/09/2026 — Le foto di serie del documento (fatte da Florin): la CO₂ con il bosco
// e tre riquadri, gli installatori nelle fasi, l'impianto nell'investimento.
describe("fotovoltaico PDF — le foto di serie", () => {
  const conFoto = (): FvPdfTemplateData => ({ ...basePdfData(), foto_di_serie: fotoDiSerieDalSito("https://app.esempio.test") });
  const pagina = (html: string, occhiello: string) => {
    const i = html.indexOf(`<div class="eyebrow">${occhiello}</div>`);
    return html.slice(i, html.indexOf('<div class="page">', i));
  };

  it("i file stanno nel sito, uno per ogni foto", () => {
    for (const file of Object.values(FOTO_DI_SERIE_FV)) {
      expect(existsSync(resolve(process.cwd(), "public/pdf-stock/fotovoltaico", file))).toBe(true);
    }
  });

  it("con le foto: la CO₂ ha il bosco e tre riquadri, fasi e investimento la loro fascia", () => {
    const html = renderFvPdfHtml(conFoto());
    const co2 = pagina(html, "L'impatto sul pianeta");
    expect(co2).toContain('class="co2-foto"');
    expect(co2).toContain("co2-bosco.jpg");
    expect(co2.match(/class="co2-carta"/g)?.length).toBe(3);
    expect(co2).not.toContain('class="eq-row"');
    expect(pagina(html, "Iter pratiche")).toContain("fasi-installatori.jpg");
    expect(pagina(html, "L'investimento")).toContain("investimento-impianto.jpg");
  });

  it("senza foto (o con una che manca) le pagine restano quelle di prima", () => {
    const d = conFoto();
    d.foto_di_serie = { ...d.foto_di_serie, voli: null };
    const co2 = pagina(renderFvPdfHtml(d), "L'impatto sul pianeta");
    expect(co2).toContain('class="eq-row"');
    expect(co2).not.toContain('class="co2-carta"');
    const nessuna = renderFvPdfHtml(basePdfData());
    expect(nessuna).not.toContain('class="foto-fascia"');
  });

  it("i chilometri in auto hanno un paragone calcolato, non «quasi un giro del mondo» per tutti", () => {
    const html = renderFvPdfHtml(conFoto());
    expect(html).not.toContain("giro del mondo");
    expect(html).toMatch(/Come [\d.]+ viaggi Milano–Roma\./);
  });

  it("con più di sei fasi i servizi non si ripetono nella pagina delle fasi (restano nell'investimento)", () => {
    const d = conFoto();
    d.servizi = [{ descrizione: "Pratiche GSE e Comune", quantita: 1 }];
    d.template = { ...d.template, cronoprogramma: Array.from({ length: 7 }, (_, i) => ({ fase: `Fase ${i + 1}`, durata: "1 settimana", descrizione: "" })) };
    const html = renderFvPdfHtml(d);
    expect(pagina(html, "Iter pratiche")).not.toContain("Servizi inclusi nella proposta");
    expect(pagina(html, "L'investimento")).toContain("Pratiche GSE e Comune");
  });

  it("il generatore incorpora solo risposte che sono immagini", () => {
    const src = readFileSync(resolve(process.cwd(), "supabase/functions/fv-genera-pdf/index.ts"), "utf8");
    expect(src).toContain('if (dati?.startsWith("data:image/")) return dati;');
    // Prima il dominio che serve di sicuro le foto, poi APP_URL come riserva.
    expect(src).toContain('["https://app.ediliziaincloud.com", Deno.env.get("APP_URL")]');
    expect(src).toContain("fotoDiSerie(FOTO_DI_SERIE_FV.alberi)");
    expect(src).toContain("foto_di_serie: {");
  });
});


describe("fotovoltaico PDF — le pagine: un elenco solo, e i blocchi", () => {
  const ids = (pagine: Array<{ id: string }>) => pagine.map((p) => p.id);
  const visibile = (pagine: Array<{ id: string; visible: boolean }>, id: string) => pagine.find((p) => p.id === id)?.visible;
  const tutteAccese = () => FV_PDF_PAGES_META.map((p) => ({ id: p.id, visible: true }));
  const pagina = (html: string, occhiello: string) => {
    const i = html.indexOf(`<div class="eyebrow">${occhiello}</div>`);
    return i < 0 ? "" : html.slice(i, html.indexOf('<div class="page">', i));
  };

  it("l'editor mostra le pagine del PDF, nello stesso ordine: prima la fiducia, il prezzo dopo il valore", () => {
    // Fino al 22/09/2026 l'editor aveva una sua copia, col prezzo in testa.
    expect(PAGINE_DELL_EDITOR).toBe(FV_PDF_PAGES_META);
    expect(ordineDellEditor).toBe(normalizeFvPdfPagesOrder);
    const ordine = ids(FV_PDF_PAGES_DEFAULT);
    expect(ordine.slice(0, 2)).toEqual(["garanzie", "iter"]);
    expect(ordine.indexOf("investimento")).toBeGreaterThan(ordine.indexOf("cassa_25"));
    expect(ordine[ordine.length - 1]).toBe("decisione");
  });

  it("«Come funziona» accesa prima dell'anteprima; le pagine che promettono, accese prima di domande e firma", () => {
    const ordine = ids(FV_PDF_PAGES_DEFAULT);
    expect(ordine[ordine.indexOf("anteprima") - 1]).toBe("come_funziona");
    // Rispondono ai dubbi quando il cliente decide, non in testa con la fiducia.
    // Poi «Dicono di noi» (22/09/2026): il voto, le parole dei clienti, gli impianti fatti.
    expect(ordine.slice(ordine.indexOf("bollette_240") + 1, ordine.indexOf("faq"))).toEqual(["protezione", "controlli", "documenti", "diario", "recensioni"]);
    for (const id of ["come_funziona", "protezione", "controlli", "documenti", "diario"]) expect(visibile(FV_PDF_PAGES_DEFAULT, id)).toBe(true);
  });

  it("un ordine salvato prima dei blocchi li riceve al loro posto, non in fondo dopo la firma", () => {
    const salvato = ["garanzie", "iter", "anteprima", "componenti", "investimento", "decisione"].map((id) => ({ id, visible: true }));
    const pagine = normalizeFvPdfPagesOrder(salvato);
    expect(ids(pagine)[ids(pagine).length - 1]).toBe("decisione");
    expect(ids(pagine).indexOf("come_funziona")).toBeLessThan(ids(pagine).indexOf("anteprima"));
    expect(ids(pagine).indexOf("diario")).toBeLessThan(ids(pagine).indexOf("decisione"));
    expect(visibile(pagine, "protezione")).toBe(true);
    // spenta dall'azienda, resta spenta
    expect(visibile(normalizeFvPdfPagesOrder([{ id: "protezione", visible: false }]), "protezione")).toBe(false);
  });

  it("le foto dei blocchi accesi: al massimo due, dal sito nelle anteprime", () => {
    const template = { pdf_pages_order: tutteAccese(), pdf_blocchi: { diario: { senzaFoto: true } } };
    const foto = fotoDeiBlocchiFv(template);
    // «Come funziona» ha una tavola sola, verticale (22/09/2026): produzione, casa, batteria, sera.
    expect(foto.comeFunziona).toEqual(["/pdf-stock/fotovoltaico/tavola-giorno-e-sera.jpg"]);
    expect(foto.diario).toEqual([]);
    expect(fotoBlocchiDalSito("https://app.example.it/", template).comeFunziona[0]).toEqual({
      src: "https://app.example.it/pdf-stock/fotovoltaico/tavola-giorno-e-sera.jpg", diSerie: true,
    });
    // di serie accese tutte: le foto di tutti i blocchi
    expect(Object.keys(fotoDeiBlocchiFv({})).sort()).toEqual(["comeFunziona", "controlli", "diario", "documenti", "protezione"]);
    for (const file of Object.values(fotoDeiBlocchiFv({ pdf_pages_order: tutteAccese() })).flat()) {
      expect(existsSync(resolve(process.cwd(), `public${file}`))).toBe(true);
    }
  });

  it("le pagine dei blocchi escono coi testi di serie, l'accento, le icone e la nota sulle foto", () => {
    const d = basePdfData();
    d.template = { ...d.template, pdf_pages_order: tutteAccese() };
    d.blocchi_foto = { comeFunziona: [{ src: "data:image/jpeg;base64,AAAA", diSerie: true }] };
    const html = renderFvPdfHtml(d);
    const come = pagina(html, "Come funziona");
    expect(come).toContain('Dal tuo tetto <span class="accento">alla tua presa</span>.');
    expect(come).toContain('<img src="data:image/jpeg;base64,AAAA"');
    expect(come).toContain("Immagini indicative");
    expect(come).toContain("<svg");
    // senza foto il blocco esce coi soli testi, e senza la nota
    const sicurezza = pagina(html, "In sicurezza");
    expect(sicurezza).toContain("Lavoriamo sul tuo tetto");
    expect(sicurezza).not.toContain("<img");
    expect(sicurezza).not.toContain("Immagini indicative");
    // il conteggio delle pagine resta quello disegnato
    expect(html.split('<div class="page">').length - 1).toBe(getFvPdfRenderedPagesCount(d));
  });

  it("voci svuotate tornano di serie; spento, il blocco non esce", () => {
    const d = basePdfData();
    const vuoto = { voci: [{ titolo: "" }], senzaFoto: true };
    d.template = { ...d.template, pdf_blocchi: { comeFunziona: vuoto } };
    // voci vuote tornano di serie: il blocco esce comunque
    expect(pagina(renderFvPdfHtml(d), "Come funziona")).toContain("Produce");
    const senza = getFvPdfRenderedPagesCount({ ...d, template: { ...d.template, pdf_pages_order: normalizeFvPdfPagesOrder(null).map((p) => (p.id === "come_funziona" ? { ...p, visible: false } : p)) } });
    expect(senza).toBe(getFvPdfRenderedPagesCount(d) - 1);
  });

  it("il generatore incorpora le foto dei blocchi e passa i testi dell'azienda", () => {
    const src = readFileSync(resolve(process.cwd(), "supabase/functions/fv-genera-pdf/index.ts"), "utf8");
    expect(src).toContain("fotoDeiBlocchiFv(template as FvPdfTemplateData[\"template\"])");
    expect(src).toContain("blocchi_foto: blocchiFoto,");
    expect(src).toContain("pdf_blocchi: template.pdf_blocchi && typeof template.pdf_blocchi === \"object\" ? template.pdf_blocchi : null,");
    for (const anteprima of ["src/components/fotovoltaico/FvLivePreviewPanel.tsx", "src/components/fotovoltaico/FvTemplatePreviewDialog.tsx"]) {
      expect(readFileSync(resolve(process.cwd(), anteprima), "utf8")).toContain("blocchi_foto: typeof window !== \"undefined\" ? fotoBlocchiDalSito(window.location.origin");
    }
  });
});

describe("fotovoltaico PDF — i badge delle garanzie", () => {
  const garanzie = (html: string) => {
    const i = html.indexOf('<div class="guarantee-grid">');
    return html.slice(i, html.indexOf("</div>\n      <h3", i));
  };

  it("un badge per ogni icona, nel sito e piccolo", () => {
    for (const file of Object.values(BADGE_GARANZIE_FV)) {
      const percorso = resolve(process.cwd(), `public/pdf-stock/badge/${file}`);
      expect(existsSync(percorso)).toBe(true);
      expect(readFileSync(percorso).length).toBeLessThan(40_000);
    }
    expect(badgeGaranzieDalSito("https://app.example.it/").sun).toBe("https://app.example.it/pdf-stock/badge/energia-solare.png");
  });

  it("con i badge la scheda li mostra al posto della sigla; senza, resta la sigla", () => {
    const d = basePdfData();
    d.badge_garanzie = { sun: "data:image/png;base64,SOLE", shield: "data:image/png;base64,SCUDO" };
    const con = garanzie(renderFvPdfHtml(d));
    expect(con).toContain('<img class="g-badge" src="data:image/png;base64,SOLE"');
    // un'icona senza badge suo usa quello dello scudo
    expect(con).toContain('<img class="g-badge" src="data:image/png;base64,SCUDO"');
    expect(con).not.toContain('class="g-num"');
    const senza = garanzie(renderFvPdfHtml(basePdfData()));
    expect(senza).toContain('class="g-num"');
    expect(senza).not.toContain("g-badge");
  });

  it("il generatore incorpora i badge, le anteprime li prendono dal sito", () => {
    const src = readFileSync(resolve(process.cwd(), "supabase/functions/fv-genera-pdf/index.ts"), "utf8");
    expect(src).toContain("fotoDelBlocco(`/pdf-stock/badge/${file}`)");
    expect(src).toContain("badge_garanzie: badgeGaranzie,");
    for (const anteprima of ["src/components/fotovoltaico/FvLivePreviewPanel.tsx", "src/components/fotovoltaico/FvTemplatePreviewDialog.tsx"]) {
      expect(readFileSync(resolve(process.cwd(), anteprima), "utf8")).toContain("badge_garanzie: typeof window !== \"undefined\" ? badgeGaranzieDalSito(window.location.origin) : null,");
    }
  });
});

// 22/09/2026 — Il preventivo di prova di Demo Azienda 2 (FV-2026-0008, Vimercate,
// 6,02 kWp con 5 kWh) generato con le funzioni vere: i numeri di una pagina non
// tornavano con quelli dell'altra, e il contratto usciva senza cliente né importo.
describe("fotovoltaico PDF — numeri che tornano fra le pagine", () => {
  const profiloSera = { codice: "sera", autoconsumo_no_accumulo: 0.25, autoconsumo_accumulo_5kwh: 0.55, autoconsumo_accumulo_10kwh: 0.75, autoconsumo_accumulo_15kwh: 0.85 };

  it("autoconsumo con le fasce del calcolo finanziario, per il PDF e per il calcolo", () => {
    expect(quotaAutoconsumo(profiloSera, 0)).toBe(0.25);
    expect(quotaAutoconsumo(profiloSera, 5)).toBe(0.55);
    expect(quotaAutoconsumo(profiloSera, 8)).toBe(0.75);
    expect(quotaAutoconsumo(profiloSera, 15)).toBe(0.85);
    expect(quotaAutoconsumo(null, 5)).toBeNull();
    const calcolo = readFileSync(resolve(process.cwd(), "supabase/functions/fv-calcolo-finanziario/index.ts"), "utf8");
    expect(calcolo).toContain("quotaAutoconsumo(prof, prog.con_accumulo === false ? 0 : prog.capacita_accumulo_kwh ?? 0)");
  });

  it("i flussi usano la produzione e la quota del calcolo: 3.633 kWh in casa, come il risparmio", () => {
    const flussi = calcolaEnergyFlows({
      potenza_kwp: 6.02, has_accumulo: true, capacita_accumulo_kwh: 5, consumo_annuo_kwh: 4800, ore_sole_annue: 1480,
      profilo_consumo: "sera", produzione_kwh: 6605.31, autoconsumo_pct: quotaAutoconsumo(profiloSera, 5),
    });
    expect(flussi.produzione_kwh).toBe(6605);
    expect(flussi.autoconsumo_kwh).toBe(3633);
    expect(Math.round(flussi.autosufficienza_pct * 100)).toBe(76);
  });

  it("la bolletta prima e dopo somma giusto e torna col risparmio del titolo", () => {
    const righe = calcolaBollettaPrimaDopo({ consumo_annuo_kwh: 4800, prelievo_rete_kwh: 1167.08, prezzo_kwh: 0.3, ricavi_rid_eur: 297.24 });
    const voci = righe.filter((r) => !r.is_kwh_row && !r.is_total && r.oggi_eur > 0);
    const bolletta = righe.find((r) => r.voce === "Totale bolletta")!;
    expect(voci.reduce((s, r) => s + r.con_fv_eur, 0)).toBe(bolletta.con_fv_eur);
    expect(voci.reduce((s, r) => s + r.oggi_eur, 0)).toBe(bolletta.oggi_eur);
    // 1.089,88 € di bolletta (3.632,92 kWh × 0,30) più 297 € dal GSE: 1.387 €, il titolo della pagina.
    expect(bolletta.risparmio_eur).toBe(-1090);
    expect(righe[righe.length - 1]).toMatchObject({ voce: "Spesa netta per l'elettricità", risparmio_eur: -1387 });
    // Oneri e trasporto scendono coi kWh presi dalla rete: prima restavano fissi.
    expect(righe.find((r) => r.voce === "Oneri di sistema")!.con_fv_eur).toBeLessThan(righe.find((r) => r.voce === "Oneri di sistema")!.oggi_eur);
  });

  it("il contratto ha il nome del cliente e il prezzo, non il costo né il vuoto", () => {
    const src = readFileSync(resolve(process.cwd(), "supabase/functions/fv-genera-pdf/index.ts"), "utf8");
    expect(src).toContain("total: Number(prog.prezzo_vendita_iva_inclusa) || null,");
    expect(src).not.toContain("total: prog.costo_totale_netto");
    // Le colonne che il contratto usa ora si leggono.
    expect(src).toMatch(/\.select\(\s*"id, company_id, numero,[^"]*cliente_nome, cliente_cognome, cliente_email, cliente_telefono/);
  });

  it("l'indirizzo non si ripete, e la batteria si dice in copertina", () => {
    const cliente = { nome: "Chiara", cognome: "Brambilla", indirizzo: "Via Garibaldi, 42, 20871 Vimercate MB, Italia", comune: "Vimercate", cap: "20871", provincia: "MB" };
    expect(indirizzoCompleto(cliente)).toBe("Via Garibaldi, 42, 20871 Vimercate MB");
    expect(indirizzoCompleto({ ...cliente, indirizzo: "Via Garibaldi 42" })).toBe("Via Garibaldi 42, 20871 Vimercate (MB)");
    const base = basePdfData();
    const html = renderFvPdfHtml({ ...base, template: { ...base.template, pdf_cover_subhero_template: "Impianto fotovoltaico {potenza_kwp} {accumulo_kwh} per {indirizzo}." } });
    expect(html).toMatch(/kWp con accumulo da [\d,]+ kWh per Via Roma 1/);
  });

  it("niente promesse né previsioni senza fonte", () => {
    const html = renderFvPdfHtml(basePdfData());
    for (const frase of ["per sempre.", "puro profitto", "Breakeven", "Solo materiali", "durare 25+ anni", "in crescita del 15-25%", "L'investimento di", "Inflazione attesa: 3%"]) {
      expect(html).not.toContain(frase);
    }
    // «Perché farlo ora» (bollette +240% dal 2012) è spenta di serie.
    expect(FV_PDF_PAGES_DEFAULT.find((p) => p.id === "bollette_240")?.visible).toBe(false);
  });

  it("con PVGIS la fonte dei dati non dice due volte «non indicata»", () => {
    const base = basePdfData();
    const html = renderFvPdfHtml({ ...base, progetto: { ...base.progetto, fonte_dati_tetto: "pvgis", qualita_dati_tetto: null, imagery_date: null } });
    expect(html).toContain("irraggiamento medio della tua zona");
    expect(html).not.toContain("non indicata");
  });
});

describe("fotovoltaico PDF — «Dicono di noi» (22/09/2026)", () => {
  const recensioni = [
    { quote: "Installazione in una giornata, tetto pulito.", autore: "Famiglia Colombo", citta: "Sesto San Giovanni", intervento: "5,4 kWp" },
    { quote: "Le pratiche le hanno seguite loro.", autore: "Roberto M.", citta: "Cinisello Balsamo", intervento: null },
  ];

  it("il voto del Profilo azienda, le parole dei clienti e gli impianti hanno una pagina loro, prima delle domande", () => {
    const d = basePdfData();
    const html = renderFvPdfHtml({
      ...d,
      template: { ...d.template, recensioni },
      voti_online: [{ piattaforma: "google", voto: 4.8, numero: 126, aggiornato: "2026-09-22" }],
      cantieri_foto: ["data:image/png;base64,AAAA"],
    });
    expect(html).toContain("La parola ai<br/>nostri clienti.");
    expect(html).toContain('<div class="voto-numero">4,8<small>su 5</small></div>');
    expect(html).toContain("126 recensioni");
    expect(html).toContain("a settembre 2026");
    expect(html).toContain("I nostri impianti");
    // Nella pagina delle garanzie non si ripetono.
    expect(html).not.toContain("Cosa dicono i clienti");
    expect(html).not.toContain("I nostri cantieri");
  });

  it("senza voto, recensioni né impianti la pagina non esce; nascosta, le recensioni tornano nelle garanzie", () => {
    const d = basePdfData();
    expect(renderFvPdfHtml({ ...d, template: { ...d.template, recensioni: [] }, voti_online: [] })).not.toContain("La parola ai<br/>nostri clienti.");
    const nascosta = renderFvPdfHtml({
      ...d,
      template: { ...d.template, recensioni, pdf_pages_order: [{ id: "recensioni", visible: false }] },
    });
    expect(nascosta).not.toContain("La parola ai<br/>nostri clienti.");
    expect(nascosta).toContain("Cosa dicono i clienti");
  });

  it("un voto fuori scala o senza piattaforma non esce", () => {
    const d = basePdfData();
    const html = renderFvPdfHtml({ ...d, voti_online: [{ piattaforma: "google", voto: 7 }, { voto: 4.5 }] });
    expect(html).not.toContain('class="voto-card"');
  });
});
