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
import { normalizePdfPagesOrder } from "@/types/serramenti";
import type {
  SerramentoPdfEnriched, SerramentoPdfConsulente, SerramentoPdfFamilyData,
  SerramentoPdfMacroField, SerramentoPdfMacroPagina, SerramentoPdfLineaPagina,
} from "@/hooks/useSerramentoPDF";
import { toDataUrl } from "@/lib/serramenti/pdfImageUtils";
import { CAMPI_IMMAGINE_SERRAMENTI, firmaImmagine, firmaImmaginiModello } from "@/lib/storage/immaginiModelloPdf";
import { blocchiAccesi, fotoDeiBlocchi, fotoDellePagine } from "@/lib/pdf/fotoBlocchi";
import { votiOnlineAzienda } from "@/lib/pdf/votiOnline";
import { datiTecniciScheda } from "@/lib/listino/schedeLinea";
import { applySerramentiModulePreview, type SerramentiTemplateModuleId } from "@/lib/moduli-vendita/serramentiTemplateModules";

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
  moduleId?: SerramentiTemplateModuleId;
  template: Partial<SrTemplatePdfRow> | null;
  companyName?: string | null;
  companyLogoUrl?: string | null;
  /** Logo versione chiara (Brand & Azienda) per la copertina su sfondo scuro. */
  companyLogoDarkUrl?: string | null;
  /** Colore del marchio (Brand & Azienda): il PDF lo eredita se il modello è al colore di fabbrica. */
  companyBrandColor?: string | null;
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
	        descrizione: "Se vicino alle finestre senti aria fredda, il problema può dipendere da telaio, guarnizioni e posa. La proposta valuta prodotto e sigillature in modo coerente.",
	      },
	      {
	        titolo: "Condensa e muffa al mattino",
	        descrizione: "Condensa e aloni vicino al foro finestra indicano dispersione, ponti termici o aerazione non corretta. La soluzione punta a ridurre questi punti critici.",
	      },
	      {
	        titolo: "Estetica datata della casa",
	        descrizione: "Profili, colori, maniglie e accessori vengono scelti in modo coerente con lo stile dell'abitazione e con le finiture esistenti.",
	      },
	    ],
    soluzione: [
	      {
	        titolo: "Serramenti misurati al millimetro sulla tua casa",
	        descrizione: "Prima dell'ordine verifichiamo misure, fuori squadra, soglie, spallette e condizioni del foro finestra.",
	      },
	      {
	        titolo: "Posa qualificata, scritta in contratto",
	        descrizione: "La posa viene pianificata in base al tipo di parete e alla situazione esistente, con lavorazioni incluse indicate nel preventivo.",
	      },
	    ],
	    perche_noi: [
	      "Un referente unico segue preventivo, rilievo, posa e collaudo",
	      "Ogni voce del preventivo è spiegata prima della firma",
	      "Rilievo tecnico prima dell'ordine definitivo",
	      "Materiali, finiture e accessori riepilogati per iscritto",
	    ],
	    incluso_investimento: [
	      "Sopralluogo tecnico con rilievo misure e verifica condizioni di posa",
	      "Smontaggio dei vecchi serramenti, se previsto dal preventivo",
	      "Fornitura dei nuovi serramenti con finiture e accessori concordati",
	      "Posa e regolazione iniziale di ante, maniglie e ferramenta",
	    ],
    testimonianze: [],
    prossimi_passi: null,
    totale_min: 3600,
    totale_max: 4400,
    iva_inclusa: true,
    iva_percentuale: 10,
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
    public_token: "demo-firma-token",
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
    note_interne: null,
    note_cliente: "Preventivo demo generato per verificare impaginazione e dati tecnici prima dell'invio al cliente.",
    parent_id: null,
    revision_number: 1,
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
      supplier_catalog_id: null,
      supplier_product_line_id: null,
      prezzo_unitario: 1200,
      prezzo_totale: 2400,
      valori_assi: {},
      foto_storage_path: null,
      foto_render_path: null,
      note: null,
      posa_esclusa: false,
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
      supplier_catalog_id: null,
      supplier_product_line_id: null,
      prezzo_unitario: 1600,
      prezzo_totale: 1600,
      valori_assi: {},
      foto_storage_path: null,
      foto_render_path: null,
      note: null,
      posa_esclusa: false,
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

  // La scheda della linea come la scrive l'azienda nel listino.
  const lineeDedicate: SerramentoPdfLineaPagina[] = [
    {
      id: "demo-linea-alluminio-70",
      nome: "Alluminio a taglio termico 70",
      tipologia: "Infissi in alluminio premium",
      descrizione:
        "Profili in alluminio da 70 mm con barrette isolanti in poliammide: il freddo non passa dal telaio e sul lato interno non si forma condensa.\n\n" +
        "Di serie:\n" +
        "- Guarnizione centrale in EPDM\n" +
        "- Ferramenta anta-ribalta con nottolini antieffrazione\n" +
        "- Verniciatura a polveri garantita 10 anni",
      immagine_url: null,
      dati: datiTecniciScheda({ profondita_mm: 70, camere: null, guarnizioni: 3, uw: 1.3 }).map(({ etichetta, valore }) => ({
        etichetta,
        valore,
      })),
      scheda_tecnica_url: null,
      scheda_tecnica_nome: null,
      prodotti: "Finestra Alluminio Square Plus",
    },
  ];

  const publicUrl = "https://app.ediliziaincloud.com/stima/demo-firma-token";

  // Le immagini del modello sono percorsi nel bucket privato: prima si firmano,
  // insieme al logo dato come logo dell'azienda (l'editor passa quello del modello).
  const [tpl, companyLogoUrl] = await Promise.all([
    firmaImmaginiModello(opts.template ?? null, CAMPI_IMMAGINE_SERRAMENTI),
    firmaImmagine(opts.companyLogoUrl),
  ]);

  // Pre-converti le immagini del template (webp → JPEG/PNG) in parallelo.
  // Senza questo step, l'anteprima mostra box vuoti perché react-pdf non
  // supporta webp e gli URL Supabase fornisco webp per default.
  const [
    inlinedLogo,
    inlinedChiSiamoFoto,
    inlinedCoverImage,
    inlinedLogoDark,
    fotoBlocchi,
    fotoPagine,
    votiOnline,
  ] = await Promise.all([
    toDataUrl(tpl?.logo_url ?? companyLogoUrl ?? null),
    toDataUrl(tpl?.chi_siamo_foto_url ?? null),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toDataUrl((tpl as any)?.pdf_cover_image_url ?? null),
    toDataUrl(opts.companyLogoDarkUrl ?? null),
    fotoDeiBlocchi("serramenti", tpl?.pdf_blocchi, blocchiAccesi(normalizePdfPagesOrder(tpl?.pdf_pages_order ?? null))),
    fotoDellePagine("serramenti", tpl?.pdf_blocchi, ["percorso", "confronto", "cta", "proposta", "allegato", "dettagli"]),
    // Il voto vero dell'azienda anche nell'anteprima del modello: «Dicono di noi» com'è.
    opts.moduleId ? Promise.resolve(null) : votiOnlineAzienda(tpl?.company_id ?? null),
  ]);
  const inlinedTemplate = tpl ? {
    ...tpl,
    logo_url: inlinedLogo ?? tpl.logo_url,
    chi_siamo_foto_url: inlinedChiSiamoFoto ?? tpl.chi_siamo_foto_url,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdf_cover_image_url: inlinedCoverImage ?? (tpl as any).pdf_cover_image_url,
    pdf_blocchi_foto: fotoBlocchi,
    pdf_pagine_foto: fotoPagine,
  } : null;

  return {
    // Dalla copia firmata anche i testi di esempio: il modello non firmato serve solo a firmarlo.
    detail: opts.moduleId ? applySerramentiModulePreview(detail, tpl ?? {}, opts.moduleId) : detail,
    template: inlinedTemplate as SrTemplatePdfRow | null,
    company: {
      name: opts.companyName ?? "La tua Azienda",
      ragione_sociale: opts.companyName ?? "La tua Azienda",
      indirizzo: opts.companyIndirizzo ?? (opts.moduleId ? null : "Via Esempio 1, 20100 Milano"),
      telefono: opts.moduleId ? tpl?.telefono : "+39 02 87654321",
      email: opts.moduleId ? tpl?.email : "info@example.com",
      partita_iva: opts.moduleId ? tpl?.partita_iva : "01234567890",
      logo_url: inlinedLogo ?? companyLogoUrl ?? null,
      brand_logo_dark_url: inlinedLogoDark ?? opts.companyLogoDarkUrl ?? null,
      brand_primary_color: opts.companyBrandColor ?? null,
      website: opts.moduleId ? null : "www.example.com",
      recensioni_online: votiOnline,
    },
    consulente: opts.moduleId ? null : consulente,
    familiesById: opts.moduleId ? {} : familiesById,
    fieldsByMacro: opts.moduleId ? {} : fieldsByMacro,
    macroPagineDedicate: opts.moduleId ? [] : macroPagineDedicate,
    lineeDedicate: opts.moduleId ? [] : lineeDedicate,
    macroNomeById: opts.moduleId ? {} : {
      [MOCK_MACRO_ID]: "Infissi in alluminio premium",
    },
    axisLabelByKey: {},
    supplierLineById: {},
    publicUrl: opts.moduleId ? null : publicUrl,
    autoFallbackMacroId: null,
    // Come nel PDF vero di chi non ha spento «Mostra sconti applicati».
    mostraSconti: true,
  };
}
