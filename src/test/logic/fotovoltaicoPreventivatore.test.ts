import { describe, expect, it } from "vitest";
import {
  buildFvTemplateQualityItems,
  buildFvServiceRows,
  calcolaFvNoleggioOperativo,
  calcolaFvEconomicsGuard,
  calcolaFvCommercialReadiness,
  DEFAULT_FV_FAQ,
  DEFAULT_FV_GARANZIE,
  shouldSuggestFvAccumulo,
} from "@/lib/fotovoltaico/preventivatore";

const listinoMacrosFvPronte = [
  {
    nome: "Pannelli fotovoltaici premium",
    descrizione_estesa: "Moduli ad alta efficienza selezionati per resa, garanzia e affidabilita nel tempo.",
    immagine_url: "https://cdn.example.test/fv/pannelli.webp",
    verticali_abilitati: ["fotovoltaico"],
    attivo: true,
  },
  {
    nome: "Inverter ibrido",
    descrizione_estesa: "Gestione produzione, accumulo e monitoraggio energetico con assistenza Italia.",
    immagine_url: "https://cdn.example.test/fv/inverter.webp",
    verticali_abilitati: ["fotovoltaico"],
    attivo: true,
  },
  {
    nome: "Accumulo batterie",
    descrizione_estesa: "Batteria dimensionata sui consumi serali reali e sulla resilienza energetica.",
    immagine_url: "https://cdn.example.test/fv/accumulo.webp",
    verticali_abilitati: ["fotovoltaico"],
    attivo: true,
  },
];

describe("fotovoltaico preventivatore", () => {
  it("flags template and business settings that make a FV offer weak or risky", () => {
    const items = buildFvTemplateQualityItems({
      presentazione_impresa_html: "",
      recensioni: [],
      certificazioni: [],
      garanzie_conversione: [],
      faq_items: [],
      margine_target_pct: null,
      costo_kwp_base: null,
      cpl_max_sostenibile: null,
      capacita_installazioni_mese: null,
      zona_servita_note: "",
      listino_macrocategorie_fv: [],
    });

    expect(items.some((item) => item.level === "critical" && item.section === "Valore")).toBe(true);
    expect(items.some((item) => item.section === "Economia")).toBe(true);
    expect(items.some((item) => item.section === "Conversione")).toBe(true);
    expect(items.some((item) => item.section === "Listino" && item.title.includes("Macro-categorie"))).toBe(true);
  });

  it("accepts a complete consultative FV template without fake blockers, including generic listino macros", () => {
    const items = buildFvTemplateQualityItems({
      presentazione_impresa_html:
        "<p>Installiamo impianti fotovoltaici chiavi in mano con analisi consumi, sopralluogo tecnico e pratiche complete.</p>",
      valore_proposta_html:
        "<p>Il preventivo mostra risparmio reale, payback, accumulo consigliato, garanzie e prossimi passi.</p>",
      recensioni: [{ quote: "Analisi chiara e tempi rispettati.", autore: "Cliente verificato" }],
      certificazioni: [{ nome: "Installatore FER qualificato" }],
      cantieri_galleria: [{ descrizione: "Impianto 6 kWp con accumulo a Monza" }],
      garanzie_conversione: DEFAULT_FV_GARANZIE,
      faq_items: DEFAULT_FV_FAQ,
      condizioni_legali_attivo: true,
      condizioni_legali_testo:
        "Validita offerta, acconto, saldo, pratiche incluse, condizioni di sopralluogo e gestione varianti.",
      margine_target_pct: 0.35,
      costo_kwp_base: 1450,
      costo_accumulo_kwh: 680,
      costo_pratiche_default: 850,
      cpl_max_sostenibile: 120,
      capacita_installazioni_mese: 6,
      zona_servita_note: "Monza Brianza, Milano nord, Lecco.",
      listino_macrocategorie_fv: listinoMacrosFvPronte.map((macro) => ({
        ...macro,
        verticali_abilitati: [],
      })),
    });

    expect(items).toEqual([
      expect.objectContaining({
        level: "ok",
        title: "Template FV pronto",
      }),
    ]);
  });

  it("blocks commercial readiness when the plant exceeds roof capacity or listino is incomplete", () => {
    const readiness = calcolaFvCommercialReadiness({
      consumo_annuo_kwh: 3200,
      costo_kwh_attuale: 0.32,
      potenza_kwp: 9,
      potenza_max_kwp: 6,
      numero_pannelli_scelti: 20,
      numero_pannelli_max: 14,
      produzione_annua_stimata_kwh: 11800,
      con_accumulo: false,
      listinoCompleto: false,
      tariffaInstallazioneConfigurata: false,
      tettoMock: true,
    });

    expect(readiness.status).toBe("blocked");
    expect(readiness.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "roof_capacity_exceeded" }),
        expect.objectContaining({ code: "missing_price_list" }),
      ]),
    );
  });

  it("recommends a FV offer when economics, roof and pricing are coherent", () => {
    const readiness = calcolaFvCommercialReadiness({
      consumo_annuo_kwh: 4200,
      costo_kwh_attuale: 0.34,
      potenza_kwp: 5.4,
      potenza_max_kwp: 7,
      numero_pannelli_scelti: 10,
      numero_pannelli_max: 14,
      produzione_annua_stimata_kwh: 6500,
      con_accumulo: true,
      capacita_accumulo_kwh: 5,
      listinoCompleto: true,
      tariffaInstallazioneConfigurata: true,
      tettoMock: false,
      payback_anni: 8,
      margine_pct: 0.34,
    });

    expect(readiness.status).toBe("ready");
    expect(readiness.score).toBeGreaterThanOrEqual(80);
    expect(readiness.nextAction).toContain("offerta");
  });

  it("suggests storage for evening and mixed consumption profiles", () => {
    expect(shouldSuggestFvAccumulo("sera")).toBe(true);
    expect(shouldSuggestFvAccumulo("misto")).toBe(true);
    expect(shouldSuggestFvAccumulo("giorno")).toBe(false);
  });

  it("blocks scale decisions when margin is below target and CPL would burn profit", () => {
    const guard = calcolaFvEconomicsGuard({
      prezzo_vendita_netto: 10000,
      costo_totale_netto: 7800,
      margine_pct: 0.22,
      margine_target_pct: 0.35,
      cpl_max_sostenibile: 900,
      payback_anni: 13,
      rata_mensile_eur: 360,
      risparmio_mensile_eur: 95,
    });

    expect(guard.status).toBe("blocked");
    expect(guard.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "margin_below_target", level: "critical" }),
        expect.objectContaining({ code: "cpl_too_high_for_margin" }),
      ]),
    );
    expect(guard.metrics.margine_eur).toBe(2200);
  });

  it("allows a FV offer to scale when margin, CPL and monthly cashflow are coherent", () => {
    const guard = calcolaFvEconomicsGuard({
      prezzo_vendita_netto: 14500,
      costo_totale_netto: 9100,
      margine_pct: 0.3724,
      margine_target_pct: 0.35,
      cpl_max_sostenibile: 120,
      payback_anni: 7.8,
      rata_mensile_eur: 210,
      risparmio_mensile_eur: 145,
    });

    expect(guard.status).toBe("ready");
    expect(guard.score).toBeGreaterThanOrEqual(85);
    expect(guard.nextAction).toContain("scalare");
  });

  it("builds FV service rows from the company catalog instead of hardcoded practices", () => {
    const rows = buildFvServiceRows({
      catalogo: [
        {
          codice: "pratica_gse",
          descrizione: "Pratica GSE aziendale",
          prezzo_netto_default: 300,
          margine_pct_default: 0.25,
          note_operative: "Inclusa fino a 20 kWp",
          ordinamento: 4,
        },
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({
        tipo: "pratica_gse",
        descrizione: "Pratica GSE aziendale",
        prezzo_netto: 300,
        prezzo_vendita: 400,
        ordinamento: 4,
      }),
    ]);
  });

  it("uses the FV template default cost for fallback practices when catalog is empty", () => {
    const rows = buildFvServiceRows({
      catalogo: [],
      costoPraticheDefault: 900,
    });

    expect(rows).toHaveLength(3);
    expect(rows.reduce((sum, row) => sum + row.prezzo_netto, 0)).toBe(900);
    expect(rows.every((row) => row.prezzo_vendita > row.prezzo_netto)).toBe(true);
  });

  it("models operational rental for companies with no upfront and tax-adjusted monthly cost", () => {
    const rental = calcolaFvNoleggioOperativo({
      archetipo: "pmi",
      investimentoNetto: 42000,
      risparmioAnno1: 9600,
      durataMesi: 84,
      manutenzioneAnnua: 600,
      aliquotaRisparmioFiscale: 0.24,
    });

    expect(rental.eligible).toBe(true);
    expect(rental.canone_mensile).toBeGreaterThan(0);
    expect(rental.anticipo_eur).toBe(0);
    expect(rental.beneficio_fiscale_mensile).toBeGreaterThan(0);
    expect(rental.costo_effettivo_mensile).toBeLessThan(rental.canone_mensile);
    expect(rental.status).toBe("recommended");
  });

  it("uses company rental settings to tune the operational rental factor", () => {
    const standard = calcolaFvNoleggioOperativo({
      archetipo: "pmi",
      investimentoNetto: 60000,
      risparmioAnno1: 12000,
      durataMesi: 84,
      manutenzioneAnnua: 480,
      aliquotaRisparmioFiscale: 0.24,
    });

    const configured = calcolaFvNoleggioOperativo({
      archetipo: "pmi",
      investimentoNetto: 60000,
      risparmioAnno1: 12000,
      durataMesi: 84,
      manutenzioneAnnua: 480,
      aliquotaRisparmioFiscale: 0.24,
      fattoreCanone: 1.08,
    });

    expect(configured.canone_mensile).toBeLessThan(standard.canone_mensile);
    expect(configured.copertura_canone_pct).toBeGreaterThan(standard.copertura_canone_pct);
  });

  it("does not recommend operational rental for private residential archetypes", () => {
    const rental = calcolaFvNoleggioOperativo({
      archetipo: "privato_prima",
      investimentoNetto: 18000,
      risparmioAnno1: 2200,
      durataMesi: 84,
    });

    expect(rental.eligible).toBe(false);
    expect(rental.status).toBe("not_eligible");
    expect(rental.nextAction).toContain("aziende");
  });

  it("flags incomplete operational rental template settings", () => {
    const items = buildFvTemplateQualityItems({
      presentazione_impresa_html:
        "<p>Azienda FV specializzata in sopralluoghi, pratiche e assistenza post-vendita con metodo documentato.</p>",
      valore_proposta_html:
        "<p>Analisi bolletta, payback, pratiche, garanzie e alternative economiche spiegate in modo chiaro.</p>",
      recensioni: [{ quote: "Ottimo lavoro e tempi rispettati", autore: "Cliente" }],
      certificazioni: [{ nome: "FER" }],
      garanzie_conversione: DEFAULT_FV_GARANZIE,
      faq_items: DEFAULT_FV_FAQ,
      margine_target_pct: 0.35,
      costo_kwp_base: 1450,
      costo_accumulo_kwh: 680,
      costo_pratiche_default: 850,
      manutenzione_annua_eur: 180,
      cpl_max_sostenibile: 120,
      capacita_installazioni_mese: 6,
      zona_servita_note: "Milano, Monza Brianza, Lecco",
      listino_macrocategorie_fv: listinoMacrosFvPronte,
      noleggio_operativo_attivo: true,
      noleggio_durata_default_mesi: 12,
      noleggio_fattore_default: 0.6,
      noleggio_aliquota_fiscale_pct: null,
      noleggio_note_legali: "",
    });

    expect(items.some((item) => item.title.includes("Noleggio operativo"))).toBe(true);
  });
});
