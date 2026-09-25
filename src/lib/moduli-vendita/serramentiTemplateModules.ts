import { SR_PDF_PAGES_META, type SrTemplatePdfRow, type SrProgettoDetail } from "@/types/serramenti";

/** Independent PDF models. Quote-builder workflows remain a separate feature. */
export const SERRAMENTI_TEMPLATE_MODULES = [
  { id: "finestre", title: "Finestre e portefinestre", subtitle: "La luce di casa, con una soluzione su misura.", color: "#193b42",
    summary: "Infissi, vetri, aperture e posa definiti vano per vano.",
    needs: ["Verificare misure e condizioni dei vani", "Scegliere aperture e finiture", "Definire le prestazioni documentate del prodotto"],
    works: ["Rilievo dei vani interessati", "Fornitura degli infissi descritti", "Posa e sigillature previste", "Regolazione e verifica delle aperture"],
    excluded: "Ripristini murari, oscuranti e zanzariere sono compresi solo se elencati. Prestazioni e risparmi non si deducono dal solo materiale del telaio.",
    question: "Sono compresi anche persiane e zanzariere?", answer: "Solo se presenti nelle voci dell'offerta. Per ogni vano si specificano prodotti, accessori e lavorazioni inclusi.", sample: "Finestra a due ante", price: 950 },
  { id: "persiane", title: "Persiane e scuri", subtitle: "Luce e privacy, nel carattere della tua casa.", color: "#3c5245",
    summary: "Oscuranti esterni con materiali, lamelle e fissaggi dedicati.",
    needs: ["Regolare luce e privacy", "Verificare ingombri e apertura delle ante", "Abbinare materiale e colore alla facciata"],
    works: ["Rilievo di vani e fissaggi", "Fornitura delle persiane descritte", "Installazione della ferramenta prevista", "Regolazione delle ante e dei fermi"],
    excluded: "Finestre, vetri e opere sulla facciata non sono compresi se non elencati. Eventuali requisiti di sicurezza devono risultare dalla documentazione del prodotto.",
    question: "Le lamelle sono orientabili?", answer: "Dipende dal modello scelto. L'offerta deve precisare lamelle fisse oppure orientabili, numero di ante, ferramenta e finitura.", sample: "Persiana a due ante con lamelle fisse", price: 620 },
  { id: "avvolgibili", title: "Avvolgibili e cassonetti", subtitle: "Un gesto più semplice, ogni giorno.", color: "#35465f",
    summary: "Teli, guide, cassonetti e motorizzazioni con compatibilità verificata.",
    needs: ["Verificare telo, guide e cassonetto esistenti", "Scegliere comando manuale o motorizzato", "Definire materiale e finitura"],
    works: ["Rilievo degli ingombri disponibili", "Fornitura del telo descritto", "Installazione di guide e componenti previsti", "Prova di scorrimento e regolazione"],
    excluded: "Motore, collegamenti elettrici, automazioni e isolamento del cassonetto sono inclusi solo se indicati in offerta.",
    question: "Posso motorizzare l'avvolgibile?", answer: "La fattibilità dipende da rullo, spazio disponibile e alimentazione. Motore, comandi e collegamento elettrico vanno descritti e quotati separatamente quando previsti.", sample: "Avvolgibile con comando manuale", price: 310 },
  { id: "zanzariere", title: "Zanzariere", subtitle: "Aria e luce, con una barriera agli insetti.", color: "#285650",
    summary: "Reti e sistemi di apertura scelti in base al passaggio e allo spazio.",
    needs: ["Proteggere le aperture dagli insetti", "Mantenere agevole il passaggio", "Verificare lo spazio per guide e cassonetto"],
    works: ["Rilievo delle aperture", "Fornitura delle zanzariere descritte", "Installazione di guide e fissaggi", "Verifica di apertura e chiusura della rete"],
    excluded: "Riparazione degli infissi e opere murarie sono escluse se non elencate. La rete non è una protezione anticaduta né un dispositivo antieffrazione.",
    question: "Quale apertura conviene scegliere?", answer: "Avvolgibile, plissettata o a battente si scelgono in base alle misure, allo spazio disponibile e alla frequenza di passaggio. La soluzione viene confermata dopo il rilievo.", sample: "Zanzariera avvolgibile verticale", price: 180 },
  { id: "porte-ingresso", title: "Porte d’ingresso", subtitle: "Il benvenuto di casa, curato in ogni dettaglio.", color: "#493f38",
    summary: "Portoncini, serrature e rivestimenti con prestazioni dichiarate.",
    needs: ["Verificare vano, soglia e senso di apertura", "Definire serratura e accessori", "Scegliere rivestimenti e prestazioni documentate"],
    works: ["Rilievo del vano di ingresso", "Fornitura della porta descritta", "Posa di telaio e componenti previsti", "Regolazione e prova di chiusura"],
    excluded: "Opere murarie, impianti di accesso e dispositivi smart non sono inclusi se non elencati. Nessuna classe antieffrazione è presunta: deve essere documentata per il prodotto scelto.",
    question: "La porta è blindata?", answer: "Solo se il modello proposto ha le caratteristiche documentate richieste. L'offerta deve indicare prodotto, serratura ed eventuale classe certificata, senza promesse generiche.", sample: "Porta d’ingresso a un’anta", price: 1800 },
  { id: "porte-interne", title: "Porte interne", subtitle: "Spazi che dialogano, finiture che ti somigliano.", color: "#594d64",
    summary: "A battente o scorrevoli, con telai, maniglie e finiture coordinate.",
    needs: ["Coordinare porte e finiture degli ambienti", "Verificare vani e sensi di apertura", "Definire telai, coprifili e maniglie"],
    works: ["Rilievo dei vani interni", "Fornitura delle porte descritte", "Posa di telai e coprifili previsti", "Regolazione di ante e maniglie"],
    excluded: "Controtelai a scomparsa, demolizioni, tinteggiature e ripristini sono inclusi soltanto se descritti. Prestazioni acustiche o di resistenza al fuoco non sono presunte.",
    question: "Posso sostituire una porta a battente con una scorrevole?", answer: "Va verificato lo spazio sulla parete o la possibilità di inserire un controtelaio. Le opere necessarie devono essere riportate nell'offerta.", sample: "Porta interna a battente", price: 390 },
  { id: "combinato", title: "Intervento combinato", subtitle: "Un progetto coordinato, vano per vano.", color: "#253b55",
    summary: "Finestre, oscuranti e zanzariere in una proposta unica e leggibile.",
    needs: ["Abbinare più prodotti nello stesso vano", "Verificare ingombri e compatibilità", "Distinguere forniture e lavorazioni comuni"],
    works: ["Rilievo coordinato delle aperture", "Fornitura dei prodotti elencati per vano", "Installazione delle componenti previste", "Verifica delle aperture e delle interferenze"],
    excluded: "Ogni prodotto è incluso soltanto nei vani indicati. Lavorazioni comuni e ripristini devono essere esplicitati, evitando duplicazioni di costo.",
    question: "Tutti i vani avranno gli stessi prodotti?", answer: "Non necessariamente. Il riepilogo deve associare a ciascun vano i prodotti scelti e separare le lavorazioni comuni dalle singole forniture.", sample: "Finestra a due ante", price: 950 },
] as const;
export type SerramentiTemplateModuleId = typeof SERRAMENTI_TEMPLATE_MODULES[number]["id"];
export const findSerramentiTemplateModule = (id: string | null | undefined) => SERRAMENTI_TEMPLATE_MODULES.find(m => m.id === id);

/** Illustrative dimensions, never a substitute for the actual opening survey. */
export function serramentiModuleDemoSize(id: SerramentiTemplateModuleId) {
  const width = id === "porte-ingresso" ? 900 : id === "porte-interne" ? 800 : 1200;
  const height = id === "porte-ingresso" || id === "porte-interne" ? 2100 : 1400;
  return { larghezza_mm: width, altezza_mm: height, metri_quadri: width * height / 1_000_000 };
}

export function createSerramentiModuleTemplate(base: Partial<SrTemplatePdfRow>, id: SerramentiTemplateModuleId): Partial<SrTemplatePdfRow> {
  const m = findSerramentiTemplateModule(id)!;
  return {
    // Inherit identity only: do not copy unrelated claims, reviews or financial promises.
    id: `local-serramenti-${id}`, company_id: base.company_id,
    ragione_sociale: base.ragione_sociale, indirizzo_completo: base.indirizzo_completo,
    telefono: base.telefono, email: base.email, partita_iva: base.partita_iva, logo_url: base.logo_url,
    colore_primario: m.color, pdf_font_family: "helvetica",
    pdf_cover_hero: m.title, pdf_cover_subhero: m.subtitle, pdf_cover_subhero_template: null,
    pdf_cover_eyebrow: "PROPOSTA PERSONALIZZATA", pdf_cover_image_url: null,
    pdf_cover_bg_color: m.color, pdf_cover_text_color: "#ffffff", pdf_cover_title_color: "#ffffff",
    pdf_cover_subtitle_color: "#e2e8f0", pdf_cover_eyebrow_color: "#ffffff",
    pdf_cover_title_size: 36, pdf_cover_subtitle_size: 15, pdf_cover_eyebrow_size: 10,
    pdf_cover_text_align: "left", pdf_cover_text_vertical: "center",
    pdf_cover_overlay_style: "gradient", pdf_cover_overlay_opacity: 65,
    pdf_cover_decoration_style: "line", pdf_cover_show_decoration: true, pdf_cover_show_client_card: true,
    pdf_cover_logo_position: "top_left", pdf_cover_logo_size: 100, pdf_cover_logo_url: null,
    esigenze_default: m.needs.map(titolo => ({ titolo, descrizione: "" })),
    soluzione_default: m.works.map(titolo => ({ titolo, descrizione: "" })),
    perche_noi_default: ["Scelte e finiture riepilogate per iscritto", "Prodotti e lavorazioni distinti nell'offerta", "Varianti da concordare prima dell'esecuzione"],
    incluso_default: [...m.works], prossimi_passi_default: ["Confermiamo misure e scelte", "Verifichiamo insieme l'offerta", "Concordiamo tempi e modalità di intervento"],
    pdf_cta_finale_titolo: "Definiamo insieme il prossimo passo",
    pdf_cta_finale_passi: ["Controlla prodotti, quantità e finiture", "Segnalaci le modifiche desiderate", "Concordiamo la verifica tecnica prima dell'ordine"],
    faq_items: [{ domanda: m.question, risposta: m.answer }, { domanda: "Cosa non è compreso?", risposta: m.excluded },
      { domanda: "Come si gestiscono modifiche e imprevisti?", risposta: "Le variazioni si descrivono e si quotano per iscritto prima dell'esecuzione, indicando anche eventuali effetti sui tempi." }],
    chi_siamo_attivo: false, chi_siamo_titolo: "Chi siamo", chi_siamo_testo: "", chi_siamo_foto_url: null,
    testimonianze_default: [], recensioni_attivo: false, garanzie: [], gallery_lavori: [],
    certificazioni: [], bonus_aggiuntivi: [], confronto_attivo: false, confronto_righe: [],
    urgenza_attiva: false, early_bird_attivo: false, pdf_perche_noi_metriche: [],
    condizioni_legali_attivo: false, condizioni_legali_testo: "", modulo_recesso_attivo: false,
    pdf_mostra_firma_online: false, pdf_mostra_rata_mensile: false,
    pdf_mostra_recupero_fiscale: false, pdf_mostra_tabella_ecobonus: false, pdf_pagine_articolo_dedicate: false,
    pdf_show_revision_footer: true, pdf_show_legal_footer: false, brand_footer_attivo: false,
    percorso_cliente: { attivo: false, titolo: "Il tuo percorso", sottotitolo: "Tempi da concordare dopo il rilievo", fasi: [] },
    valido_giorni_default: 30, iva_percentuale_default: 22, anticipo_pct_default: 0,
    pdf_pages_order: SR_PDF_PAGES_META.map(p => ({ id: p.id, visible: p.obbligatoria || ["faq", "cta"].includes(p.id) })),
    pdf_blocchi: { ...Object.fromEntries(["percorso", "confronto", "cta", "proposta", "allegato", "dettagli"].map(key => [`pagina_${key}`, { senzaFoto: true }])), modulo_esclusioni: m.excluded },
  };
}

/** Replace ALL window-demo facts, not just the cover, with consistent module data. */
export function applySerramentiModulePreview(detail: SrProgettoDetail, template: Partial<SrTemplatePdfRow>, id: SerramentiTemplateModuleId): SrProgettoDetail {
  const m = findSerramentiTemplateModule(id)!;
  const samples = id === "combinato" ? [SERRAMENTI_TEMPLATE_MODULES[0], SERRAMENTI_TEMPLATE_MODULES[1], SERRAMENTI_TEMPLATE_MODULES[3]] : [m];
  const rows = samples.map((sample, index): SrProgettoDetail["serramenti"][number] => ({ ...detail.serramenti[0],
    id: `demo-${id}-${index}`, position: index, company_id: template.company_id ?? "demo-company",
    tipologia: "altro", tipologia_label: sample.sample, ambiente: "Vano dimostrativo",
    materiale: null, serie: null, vetro: null, vetro_specs: null, apertura: null,
    colore_interno: null, colore_esterno: null, ...serramentiModuleDemoSize(sample.id),
    quantita: 1, family_id: null,
    prezzo_unitario: sample.price, prezzo_totale: sample.price,
    note: "Esempio per l'anteprima: misure, caratteristiche e prezzo da definire nel preventivo.",
  }));
  const total = rows.reduce((sum, row) => sum + row.prezzo_totale, 0);
  return { ...detail, serramenti: rows, accessori: [], servizi: [], media: [], risparmio: null,
    progetto: { ...detail.progetto, company_id: template.company_id ?? "demo-company", code: "DEMO-MODULO",
      intervento_titolo: m.title, intervento_sintesi: m.summary, materiale_principale: null,
      totale_serramenti: rows.length, totale_accessori: 0, metri_quadri_totali: rows.reduce((sum, row) => sum + row.metri_quadri, 0),
      esigenze: template.esigenze_default ?? [], soluzione: template.soluzione_default ?? [],
      perche_noi: template.perche_noi_default ?? [], incluso_investimento: template.incluso_default ?? [],
      prossimi_passi: template.prossimi_passi_default ?? [], testimonianze: [],
      totale_min: total, totale_max: total, iva_percentuale: template.iva_percentuale_default ?? 22, iva_inclusa: false,
      fin_anticipo_pct: 0, fin_piani: [], pagamento_milestones: [], schema_pagamento: null,
      risparmio_calcolato: false, risparmio_eur_anno: 0, detrazione_aliquota: 0, detrazione_eur_totale: 0,
      detrazione_eur_anno: 0, payback_anni: null, consulenza_at: null, consulenza_luogo: null,
      crono_giorni_produzione: 0, crono_giorni_posa: 0, crono_giorni_collaudo: 0,
      valido_fino_giorni: template.valido_giorni_default ?? 30, public_token: null,
      note_cliente: "ANTEPRIMA DIMOSTRATIVA — dati cliente, misure e importi fittizi. Non è un'offerta da inviare.",
    },
  };
}
