/**
 * mockPdfData.ts — Dati demo per anteprima PDF nel template editor.
 *
 * Genera un `SerramentoPdfEnriched` mockato con cliente/serramenti/numeri
 * fittizi ma realistici. Usato dall'anteprima live del template editor
 * (Personalizzazione PDF preventivo → "Anteprima PDF") per mostrare come
 * apparirà il PDF con le modifiche correnti, prima di salvarle.
 *
 * NOTE:
 *  - Nessuna chiamata di rete: tutto puro JS, generato deterministicamente.
 *  - Le immagini fittizie sono URL placeholder (sentinel) — se la rete è KO
 *    il PDF mostra il placeholder grigio invece di rompersi.
 *  - Il template passato dall'editor (mock o reale) determina la grafica;
 *    qui forniamo solo i DATI del preventivo, non il template.
 */
import type {
  SrProgettoDetail, SrProgettoRow, SrSerramentoRow, SrAccessorioRow,
  SrMediaRow, SrCalcoloRisparmioRow, SrServizioRow, SrTemplatePdfRow,
} from "@/types/serramenti";
import type {
  SerramentoPdfEnriched, SerramentoPdfConsulente, SerramentoPdfFamilyData,
  SerramentoPdfMacroField, SerramentoPdfMacroPagina,
} from "@/hooks/useSerramentoPDF";
import { toDataUrl } from "@/lib/serramenti/pdfImageUtils";

const MOCK_FAMILY_ID = "demo-family-aluminio-2ante";
const MOCK_MACRO_ID = "demo-macro-infissi";

/**
 * Costruisce un SerramentoPdfEnriched mockato. Accetta il `template` corrente
 * dal template editor (con tutte le personalizzazioni live) così l'anteprima
 * riflette esattamente le modifiche in corso.
 *
 * Async perché chiama toDataUrl() per pre-convertire le immagini del template
 * (logo, cover image, chi siamo) da webp → JPEG/PNG: react-pdf non supporta
 * webp e l'utente vede l'anteprima nera/vuota altrimenti.
 */
export async function buildMockPdfData(opts: {
  template: Partial<SrTemplatePdfRow> | null;
  companyName?: string | null;
  companyLogoUrl?: string | null;
  companyIndirizzo?: string | null;
  consulenteNome?: string | null;
  consulenteFoto?: string | null;
}): Promise<SerramentoPdfEnriched> {
  const now = new Date().toISOString();

  const progetto: SrProgettoRow = {
    id: "demo-progetto-id",
    company_id: "demo-company",
    code: "SF-DEMO-0001",
    stato: "bozza",
    created_by: null,
    created_at: now,
    updated_at: now,
    cliente_id: null,
    cliente_nome: "Mario",
    cliente_cognome: "Rossi",
    cliente_indirizzo: "Via Roma 12",
    cliente_citta: "Milano",
    cliente_cap: "20100",
    cliente_provincia: "MI",
    cliente_telefono: "+39 333 1234567",
    cliente_email: "mario.rossi@example.com",
    cliente_codice_fiscale: null,
    cantiere_indirizzo: "Via Roma 12",
    cantiere_citta: "Milano",
    cantiere_cap: "20100",
    cantiere_provincia: "MI",
    cantiere_lat: null,
    cantiere_lng: null,
    cantiere_zona_climatica: "E",
    cantiere_piano: "2° piano",
    cantiere_condominio: true,
    cantiere_vincoli: null,
    tipo_intervento: "sostituzione",
    intervento_titolo: null,
    intervento_sintesi: "Sostituzione di 3 finestre con serramenti in alluminio a taglio termico.",
    materiale_principale: "alluminio",
    totale_serramenti: 3,
    totale_accessori: 0,
    metri_quadri_totali: 5.4,
    esigenze: [
      {
        titolo: "Spifferi e correnti d'aria",
        descrizione: "Già a ottobre devi tenere le tende chiuse perché entra freddo dalle finestre. Con telai a triplo battuta e perimetro sigillato a regola d'arte, l'aria fredda resta fuori.",
      },
      {
        titolo: "Condensa e muffa al mattino",
        descrizione: "Ogni mattina d'inverno asciughi i vetri con lo straccio e sotto le finestre è già spuntata la prima macchia di muffa. Vetri basso-emissivi e telai a taglio termico portano la condensa a zero.",
      },
      {
        titolo: "Estetica datata della casa",
        descrizione: "I serramenti vecchi tradiscono l'età della casa: si notano appena entri. Profili sottili e finiture scelte con te ringiovaniscono la facciata di 15 anni.",
      },
    ],
    soluzione: [
      {
        titolo: "Serramenti misurati al millimetro sulla tua casa",
        descrizione: "Niente cataloghi standard adattati ad occhio. Veniamo a casa tua con il laser e produciamo serramenti unici per i tuoi fori.",
      },
      {
        titolo: "Posa qualificata, scritta in contratto",
        descrizione: "Il 60% dei problemi sui serramenti nuovi nasce da una posa fatta male. Le nostre squadre posano secondo norma UNI 11673.",
      },
    ],
    perche_noi: [
      "Oltre 1.200 finestre installate nella tua provincia negli ultimi 24 mesi",
      "Showroom aperto al pubblico: tocchi materiali, finiture e maniglie prima di scegliere",
      "Sopralluogo tecnico gratuito e senza impegno",
      "Tempi di consegna garantiti contrattualmente, con penale a nostro carico se sforiamo",
    ],
    incluso_investimento: [
      "Smontaggio dei vecchi serramenti e smaltimento in discarica autorizzata",
      "Posa eseguita da squadre interne specializzate — mai subappaltata",
      "Sopralluogo tecnico a casa tua con rilievo al millimetro",
      "Tripla sigillatura perimetrale: zero infiltrazioni anche dopo 10 anni",
    ],
    testimonianze: [],
    prossimi_passi: null,
    totale_min: 3600,
    totale_max: 4400,
    iva_inclusa: true,
    iva_percentuale: 22,
    sconto_percentuale: 0,
    sconto_importo: 0,
    fin_anticipo_pct: 30,
    fin_piani: [
      {
        nome: "Standard",
        mesi: 60,
        tasso: 4.75,
        rata_mese: 95,
        anticipo: 1200,
        finanziato: 2800,
      },
    ],
    fin_tabella_id: null,
    fin_tabella_riga_id: null,
    discount_rule_id: null,
    pagamento_milestones: [
      { label: "Acconto alla firma", percentuale: 30, when: "Firma contratto" },
      { label: "Finanziamento", percentuale: 70, when: "Erogato all'inizio lavori" },
    ],
    schema_pagamento: "acconto_finanziato",
    varianti_attive: false,
    varianti: [],
    variante_selezionata: null,
    risparmio_calcolato: true,
    risparmio_eur_anno: 140,
    detrazione_aliquota: 50,
    detrazione_eur_totale: 2000,
    detrazione_eur_anno: 200,
    payback_anni: 12,
    co2_risparmiata_t_anno: null,
    consulente_id: null,
    consulenza_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    consulenza_luogo: "Casa cliente",
    crono_giorni_produzione: 60,
    crono_giorni_posa: 3,
    crono_giorni_collaudo: 1,
    valido_fino_giorni: 15,
    valido_fino_data: null,
    public_token: null,
    public_url: null,
    allow_self_signing: false,
    firmato_il: null,
    firma_cliente_url: null,
    referral_amount_eur: 0,
    sopralluogo_id: null,
    sopralluogo_eseguito_il: null,
    opportunita_id: null,
    ordine_id: null,
    pdf_url: null,
    pdf_generated_at: null,
    pdf_html_url: null,
  };

  const serramenti: SrSerramentoRow[] = [
    {
      id: "demo-srm-1",
      progetto_id: progetto.id,
      company_id: progetto.company_id,
      position: 0,
      tipologia: "finestra",
      tipologia_label: "Finestra a 2 ante",
      ambiente: "Cucina",
      materiale: "alluminio",
      serie: "Square Plus",
      vetro: "Basso-emissivo 4-16-4",
      vetro_specs: null,
      apertura: "anta_ribalta",
      colore_interno: "Bianco RAL 9010",
      colore_esterno: "Antracite RAL 7016",
      larghezza_mm: 1200,
      altezza_mm: 1500,
      quantita: 2,
      metri_quadri: 3.6,
      family_id: MOCK_FAMILY_ID,
      macrocategoria_override_id: null,
      listino_voce_id: null,
      prezzo_unitario: 1200,
      prezzo_totale: 2400,
      foto_storage_path: null,
      foto_render_path: null,
      note: null,
      created_at: now,
      updated_at: now,
    },
    {
      id: "demo-srm-2",
      progetto_id: progetto.id,
      company_id: progetto.company_id,
      position: 1,
      tipologia: "porta_finestra",
      tipologia_label: "Porta-finestra 1 anta",
      ambiente: "Soggiorno",
      materiale: "alluminio",
      serie: "Square Plus",
      vetro: "Basso-emissivo 4-16-4",
      vetro_specs: null,
      apertura: "anta_ribalta",
      colore_interno: "Bianco RAL 9010",
      colore_esterno: "Antracite RAL 7016",
      larghezza_mm: 900,
      altezza_mm: 2200,
      quantita: 1,
      metri_quadri: 1.98,
      family_id: null,
      macrocategoria_override_id: null,
      listino_voce_id: null,
      prezzo_unitario: 1600,
      prezzo_totale: 1600,
      foto_storage_path: null,
      foto_render_path: null,
      note: null,
      created_at: now,
      updated_at: now,
    },
  ];

  const accessori: SrAccessorioRow[] = [];
  const media: SrMediaRow[] = [];
  const risparmio: SrCalcoloRisparmioRow | null = null;
  const servizi: SrServizioRow[] = [];

  const detail: SrProgettoDetail = {
    progetto,
    serramenti,
    accessori,
    media,
    risparmio,
    servizi,
    manodopera: [],
  };

  const consulente: SerramentoPdfConsulente = {
    nome: opts.consulenteNome || "Marco Bianchi",
    ruolo: "Consulente tecnico",
    telefono: "+39 02 12345678",
    email: "marco.bianchi@example.com",
    foto_url: opts.consulenteFoto ?? null,
  };

  const familiesById: Record<string, SerramentoPdfFamilyData> = {
    [MOCK_FAMILY_ID]: {
      id: MOCK_FAMILY_ID,
      nome: "Finestra Alluminio Square Plus",
      descrizione: "Profilo in alluminio a taglio termico, spessore 70 mm, vetro basso-emissivo 4-16-4 con gas Argon. Trasmittanza Uw 1,3 W/m²K. Classe energetica A.",
      immagine_url: null,
      custom_field_values: {
        materiale: "alluminio",
        spessore_profilo: "70mm",
        uw: "1.3",
        classe_energetica: "A",
      },
      macrocategoria_id: MOCK_MACRO_ID,
    },
  };

  const fieldsByMacro: Record<string, SerramentoPdfMacroField[]> = {
    [MOCK_MACRO_ID]: [
      {
        field_key: "materiale", field_label: "Materiale", field_type: "text",
        field_unit: null, field_options: null, show_in_pdf: true, sort_order: 1,
      },
      {
        field_key: "spessore_profilo", field_label: "Spessore profilo",
        field_type: "text", field_unit: null, field_options: null,
        show_in_pdf: true, sort_order: 2,
      },
      {
        field_key: "uw", field_label: "Uw", field_type: "number",
        field_unit: "W/m²K", field_options: null, show_in_pdf: true, sort_order: 3,
      },
      {
        field_key: "classe_energetica", field_label: "Classe", field_type: "text",
        field_unit: null, field_options: null, show_in_pdf: true, sort_order: 4,
      },
    ],
  };

  const macroPagineDedicate: SerramentoPdfMacroPagina[] = [
    {
      macro_id: MOCK_MACRO_ID,
      nome: "Infissi in alluminio premium",
      descrizione_estesa:
        "I nostri infissi in alluminio sono prodotti con profili a taglio termico spessore 70 mm e vetro basso-emissivo 4-16-4 con gas Argon.\n\n" +
        "Le caratteristiche tecniche garantiscono prestazioni di eccellenza:\n" +
        "- Trasmittanza termica Uw 1,3 W/m²K\n" +
        "- Abbattimento acustico fino a 38 dB\n" +
        "- Tenuta all'aria classe 4\n" +
        "- Resistenza al vento classe C3\n\n" +
        "Tutti i nostri infissi sono certificati secondo le normative europee vigenti e installati da squadre interne formate direttamente in azienda.",
      immagine_url: null,
    },
  ];

  const macroImageById: Record<string, string | null> = {
    [MOCK_MACRO_ID]: null,
  };

  // Pre-converti le immagini del template (webp → JPEG/PNG) in parallelo.
  // Senza questo step, l'anteprima mostra box vuoti perché react-pdf non
  // supporta webp e gli URL Supabase fornisco webp per default.
  const tpl = opts.template ?? null;
  const [
    inlinedLogo,
    inlinedChiSiamoFoto,
    inlinedCoverImage,
  ] = await Promise.all([
    toDataUrl(tpl?.logo_url ?? opts.companyLogoUrl ?? null),
    toDataUrl(tpl?.chi_siamo_foto_url ?? null),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toDataUrl((tpl as any)?.pdf_cover_image_url ?? null),
  ]);
  const inlinedTemplate = tpl ? {
    ...tpl,
    logo_url: inlinedLogo ?? tpl.logo_url,
    chi_siamo_foto_url: inlinedChiSiamoFoto ?? tpl.chi_siamo_foto_url,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdf_cover_image_url: inlinedCoverImage ?? (tpl as any).pdf_cover_image_url,
  } : null;

  return {
    detail,
    template: inlinedTemplate as SrTemplatePdfRow | null,
    company: {
      name: opts.companyName ?? "La tua Azienda",
      ragione_sociale: opts.companyName ?? "La tua Azienda",
      indirizzo: opts.companyIndirizzo ?? "Via Esempio 1, 20100 Milano",
      telefono: "+39 02 87654321",
      email: "info@example.com",
      partita_iva: "01234567890",
      logo_url: inlinedLogo ?? opts.companyLogoUrl ?? null,
      website: "www.example.com",
    },
    consulente,
    familiesById,
    fieldsByMacro,
    macroPagineDedicate,
    macroImageById,
    autoFallbackMacroId: null,
  };
}
