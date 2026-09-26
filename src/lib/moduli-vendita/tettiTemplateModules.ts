import type { TetComputoVoce, TetProgetto, TetTemplatePdf, TetListItem, TetCronoFase, TetProgettoMedia } from "@/types/tetti";
import type { ContenutoBlocco, VoceBlocco } from "../../../supabase/functions/_shared/blocchiPreventivo";
import { CAPITOLI_EDILI } from "@/components/preventivi/pdf/ordineCapitoli";

/** These are editable PDF models, not yet quote-builder configurations. */
export const TETTI_TEMPLATE_MODULES = [
  {
    id: "rifacimento", title: "Rifacimento del tetto", subtitle: "Una nuova copertura, con ogni lavorazione spiegata.",
    summary: "Rimozione del manto, nuova stratigrafia e finiture.",
    needs: ["Verificare lo stato della copertura", "Definire materiali e stratigrafia", "Coordinare accessi e protezioni"],
    works: ["Rimozione del manto esistente", "Verifica del supporto e preparazione", "Posa degli strati previsti dal progetto", "Nuovo manto e raccordi di copertura"],
    excluded: "Consolidamenti strutturali, bonifiche e modifiche non descritte nel computo richiedono una valutazione separata.",
    check: "Manto, fissaggi, raccordi e continuità degli strati previsti.",
    question: "Il rifacimento comprende anche la struttura?", answer: "Solo se indicato espressamente nelle lavorazioni. Lo stato della struttura va verificato prima di definire eventuali rinforzi o sostituzioni.",
    quantities: [180, 180, 180, 180], prices: [12, 16, 38, 44], units: ["mq", "mq", "mq", "mq"],
  },
  {
    id: "ripasso", title: "Ripasso del tetto", subtitle: "Recuperare ciò che funziona. Intervenire dove serve.",
    summary: "Riordino delle tegole e sostituzioni mirate, senza rifacimento completo.",
    needs: ["Individuare tegole spostate o danneggiate", "Valutare gli elementi recuperabili", "Distinguere manutenzione e rifacimento"],
    works: ["Verifica del manto di copertura", "Riordino e riposizionamento delle tegole", "Sostituzione degli elementi non recuperabili", "Revisione dei raccordi indicati nel computo"],
    excluded: "Nuova struttura, isolamento e sostituzione integrale della membrana non sono compresi, salvo voci esplicite nel computo.",
    check: "Stabilità delle tegole riordinate, elementi sostituiti e raccordi interessati.",
    question: "Il ripasso equivale a un tetto nuovo?", answer: "No. Conserva il manto riutilizzabile e riguarda le lavorazioni elencate. Difetti degli strati sottostanti possono richiedere un intervento diverso.",
    quantities: [120, 120, 35, 12], prices: [3, 15, 9, 32], units: ["mq", "mq", "cad", "ml"],
  },
  {
    id: "riparazioni", title: "Riparazioni e infiltrazioni", subtitle: "Un intervento mirato, con un perimetro chiaro.",
    summary: "Ricerca del punto critico, riparazione localizzata e verifica.",
    needs: ["Raccogliere i segnali dell'infiltrazione", "Identificare le zone accessibili da verificare", "Definire i limiti della riparazione"],
    works: ["Ispezione della zona segnalata", "Apertura localizzata del tratto interessato", "Ripristino del raccordo individuato", "Verifica finale della zona riparata"],
    excluded: "La riparazione non comprende il rifacimento dell'intera copertura né i danni interni, se non elencati. Cause non visibili richiedono ulteriori verifiche.",
    check: "Zona riparata e raccordi limitrofi accessibili; eventuali prove vanno concordate.",
    question: "Si può garantire la causa prima dell'ispezione?", answer: "Non sempre. L'acqua può percorrere gli strati prima di manifestarsi. L'esito delle verifiche definisce il perimetro dell'intervento e gli eventuali approfondimenti.",
    quantities: [1, 6, 1, 1], prices: [180, 35, 320, 90], units: ["corpo", "mq", "corpo", "corpo"],
  },
  {
    id: "isolamento", title: "Isolamento tetto e sottotetto", subtitle: "Più attenzione al comfort, a partire dalla copertura.",
    summary: "Soluzione isolante definita in base a supporto, uso e progetto.",
    needs: ["Valutare l'uso del sottotetto", "Definire spessore e materiale isolante", "Verificare continuità e gestione del vapore"],
    works: ["Preparazione del supporto interessato", "Posa dell'isolante previsto dal progetto", "Trattamento dei raccordi e delle discontinuità", "Realizzazione delle finiture previste"],
    excluded: "Rifacimento del manto, impianti e opere strutturali sono esclusi se non descritti. Prestazioni e risparmi dipendono dal progetto e dall'edificio.",
    check: "Continuità dell'isolante, raccordi e corrispondenza dei materiali al progetto.",
    question: "Quanto risparmierò sui consumi?", answer: "Il risparmio non si deduce dal solo spessore dell'isolante. Serve una valutazione dell'edificio, degli impianti e delle abitudini d'uso; eventuali stime vanno documentate.",
    quantities: [100, 100, 25, 100], prices: [5, 38, 16, 12], units: ["mq", "mq", "ml", "mq"],
  },
  {
    id: "impermeabilizzazione", title: "Coperture piane e terrazzi", subtitle: "Continuità della protezione, anche nei punti critici.",
    summary: "Supporto, sistema impermeabile, scarichi e risvolti.",
    needs: ["Verificare supporto e pendenze", "Individuare scarichi e punti singolari", "Scegliere un sistema compatibile con l'uso"],
    works: ["Preparazione del supporto della terrazza", "Posa del sistema impermeabile previsto", "Esecuzione dei risvolti e dei raccordi", "Verifica degli scarichi interessati"],
    excluded: "Rifacimento delle pendenze, pavimentazioni e interventi strutturali sono compresi soltanto se elencati. Le prove di tenuta vanno definite con il sistema scelto.",
    check: "Continuità del sistema, risvolti, giunti e raccordi agli scarichi.",
    question: "È sempre necessario rimuovere il pavimento?", answer: "Dipende dallo stato e dalla compatibilità del supporto. La soluzione va definita dopo la verifica, senza presumere che la sovrapposizione sia sempre possibile.",
    quantities: [80, 80, 40, 3], prices: [12, 42, 25, 80], units: ["mq", "mq", "ml", "cad"],
  },
  {
    id: "lattoneria", title: "Grondaie e lattoneria", subtitle: "Raccogliere e allontanare l'acqua, con dettagli curati.",
    summary: "Canali, pluviali, scossaline e raccordi su misura.",
    needs: ["Rilevare sviluppo e sezioni", "Scegliere materiale e finitura", "Verificare accessi e collegamenti agli scarichi"],
    works: ["Rimozione dei tratti di gronda previsti", "Fornitura e posa dei nuovi canali", "Posa dei pluviali previsti", "Realizzazione di scossaline e raccordi"],
    excluded: "Ripristini murari estesi, fognature e rifacimento del manto sono esclusi se non descritti. Accessi e mezzi di sollevamento vanno esplicitati nel computo.",
    check: "Pendenze, fissaggi, giunzioni e continuità del percorso di scarico.",
    question: "Materiale e colore si possono scegliere?", answer: "Sì, tra le soluzioni compatibili con progetto, vincoli e disponibilità. Materiale, finitura e sezioni devono essere indicati nell'offerta prima della conferma.",
    quantities: [30, 30, 18, 12], prices: [8, 38, 32, 36], units: ["ml", "ml", "ml", "ml"],
  },
  {
    id: "amianto", title: "Bonifica amianto", subtitle: "Rimozione o incapsulamento in sicurezza, con le carte in regola.",
    summary: "Valutazione, piano di lavoro all'ASL, bonifica e smaltimento tracciato.",
    needs: ["Valutare lo stato del cemento-amianto", "Scegliere tra rimozione e incapsulamento", "Rispettare la procedura e i tempi previsti"],
    works: ["Valutazione dello stato e piano di lavoro", "Allestimento e messa in sicurezza dell'area", "Rimozione o incapsulamento delle lastre", "Imballaggio, trasporto e smaltimento tracciato"],
    excluded: "La nuova copertura o sovracopertura, le pratiche per gli incentivi e le opere non descritte richiedono voci separate.",
    check: "Superfici bonificate, imballo sigillato, formulario e certificazione di avvenuto smaltimento.",
    question: "Posso rimuovere l'amianto da solo?", answer: "No, salvo i casi molto limitati previsti dalla normativa: la bonifica di una copertura la esegue una ditta abilitata, con un piano di lavoro trasmesso all'ASL prima di iniziare. È una tutela per la salute, non una formalità.",
    quantities: [1, 120, 120, 120], prices: [350, 8, 22, 14], units: ["corpo", "mq", "mq", "mq"],
  },
  {
    id: "linea-vita", title: "Linea vita e anticaduta", subtitle: "Ancoraggi e percorsi certificati per salire sul tetto in sicurezza.",
    summary: "Progetto, ancoraggi certificati, posa e documentazione per chi salirà.",
    needs: ["Rendere la copertura raggiungibile in sicurezza", "Progettare ancoraggi e percorsi", "Verificare la struttura di fissaggio"],
    works: ["Progetto del sistema anticaduta (tecnico)", "Posa degli ancoraggi sulla struttura", "Realizzazione delle linee e dei percorsi", "Verifiche, elaborato e istruzioni d'uso"],
    excluded: "Le verifiche periodiche successive, i rinforzi strutturali e le opere non elencate richiedono voci separate.",
    check: "Tenuta e fissaggio degli ancoraggi, raccordi impermeabili e documentazione del sistema.",
    question: "La linea vita è obbligatoria?", answer: "In molte situazioni è richiesta per accedere in sicurezza alla copertura, e alcune regioni la chiedono per gli interventi sul tetto. Le regole in vigore, che variano sul territorio, si verificano prima.",
    quantities: [1, 6, 20, 1], prices: [450, 120, 22, 250], units: ["corpo", "cad", "ml", "corpo"],
  },
  {
    id: "lucernari", title: "Lucernari e finestre da tetto", subtitle: "Luce dall'alto con raccordi a tenuta, senza infiltrazioni.",
    summary: "Apertura del manto, posa, raccordi impermeabili e finiture interne.",
    needs: ["Portare luce dove una finestra a parete non arriva", "Aprire il manto senza infiltrazioni", "Scegliere apertura e oscuramento"],
    works: ["Apertura del manto nei punti previsti", "Fornitura e posa delle finestre da tetto", "Raccordi impermeabili e scossaline", "Finitura degli sguinci interni"],
    excluded: "Le modifiche strutturali dell'orditura, le autorizzazioni e le opere non elencate richiedono voci separate.",
    check: "Tenuta delle scossaline, funzionamento di apertura e oscuranti, finitura degli sguinci.",
    question: "Non farà entrare acqua?", answer: "Non se i raccordi sono fatti bene: le scossaline attorno alla finestra, adatte al tipo di manto, sono ciò che tiene fuori l'acqua. È la parte più importante del lavoro.",
    quantities: [3, 3, 3, 12], prices: [180, 520, 140, 28], units: ["cad", "cad", "cad", "ml"],
  },
] as const;

export type TettiTemplateModuleId = typeof TETTI_TEMPLATE_MODULES[number]["id"];
export const findTettiTemplateModule = (id: string | null | undefined) => TETTI_TEMPLATE_MODULES.find(module => module.id === id);

export function createTettiModuleTemplate(base: TetTemplatePdf, id: TettiTemplateModuleId): TetTemplatePdf {
  const module = findTettiTemplateModule(id)!;
  const items = (values: readonly string[]): TetListItem[] => values.map((titolo): TetListItem => ({ titolo, descrizione: null }));
  const voci = (values: readonly string[]): VoceBlocco[] => values.map((titolo): VoceBlocco => ({ titolo, testo: null, icona: null }));
  const blocco = (titolo: string, intro: string, values: readonly string[]): ContenutoBlocco & { senzaFoto: boolean } => ({
    occhiello: module.title, titolo, intro, voci: voci(values), escluse: [], foto: [], senzaFoto: true, nota: null,
  });
  // Copy company identity, not unrelated testimonials, finance claims or full-roof chapters.
  return {
    ...structuredClone(base), id: `local-tetti-${id}`,
    cover_title: module.title, cover_subtitle: module.subtitle, cover_eyebrow: "PROPOSTA DI INTERVENTO",
    cover_image_url: "/cover-stock/tetti/1.jpg", cover_bg_color: "#182b34", cover_text_color: "#ffffff",
    cover_overlay_style: "gradient", cover_overlay_opacity: 0.65, cover_text_vertical: "bottom",
    cover_text_align: "left", cover_title_size: 34, cover_subtitle_size: 13, cover_eyebrow_size: 10,
    cover_show_decoration: false, cover_show_client_card: true,
    esigenze: items(module.needs), soluzione: items(module.works),
    usp: items(["Lavorazioni descritte voce per voce", "Inclusioni ed esclusioni esplicite", "Varianti da concordare prima dell'esecuzione"]),
    percorso: items(["Sopralluogo e rilievo", "Definizione dell'offerta", "Pianificazione e lavorazioni", "Verifica e consegna"]),
    cronoprogramma: module.works.map((fase): TetCronoFase => ({ fase, durata: "Da concordare", descrizione: null })),
    faq: [{ domanda: module.question, risposta: module.answer }, {
      domanda: "Come vengono gestiti gli imprevisti?", risposta: "Se emergono lavorazioni non incluse, si definiscono per iscritto ambito, prezzo e tempi prima di procedere con la variante.",
    }],
    testimonianze: [], gallery_lavori: [], garanzie: [], finanziamento_promo: null,
    default_detrazione_pct: 0, show_margine: false, show_garanzie: true, show_percorso: true, show_cronoprogramma: true,
    pdf_pagine_libere: [],
    pdf_ordine_capitoli: CAPITOLI_EDILI.map(c => ({ chiave: c.chiave, visibile:
      ["apertura", "chiSiamo", "progetto", "percorso", "piano", "compreso", "investimento", "garanzie", "tempi", "domande"].includes(c.chiave)
      || (id === "rifacimento" && ["comeFunziona", "protezione", "controlli", "documenti"].includes(c.chiave)),
    })),
    pdf_blocchi: {
      // The area fallback includes insulation/full-refit photographs: do not imply
      // those works are supplied by a maintenance or localized repair module.
      pagina_computo: { senzaFoto: id !== "rifacimento" },
      pagina_compreso: { senzaFoto: id !== "rifacimento" },
      pagina_chiusura: id === "rifacimento" ? {} : { foto: ["/cover-stock/tetti/1.jpg"] },
      comeFunziona: blocco("L'intervento, in pratica", module.summary, module.works),
      compreso: { ...blocco("Un perimetro chiaro", "Il prezzo comprende soltanto le quantità e le lavorazioni riportate nel computo.", module.works),
        escluse: [{ titolo: "Da valutare separatamente", testo: module.excluded, icona: null }] },
      protezione: blocco("Organizzare il cantiere", "Accessi e protezioni si definiscono in base alle condizioni reali dell'immobile.", ["Accesso alla copertura e delimitazione delle zone", "Protezione delle aree interessate", "Gestione delle condizioni meteo e delle fasi aperte"]),
      controlli: blocco("Verifiche di fine intervento", module.check, ["Controllo delle lavorazioni eseguite", "Segnalazione delle eventuali criticità residue", "Condivisione delle indicazioni di manutenzione"]),
      documenti: blocco("Documentazione dell'intervento", "I documenti previsti per questa fornitura vanno concordati nell'offerta.", ["Riepilogo delle lavorazioni eseguite", "Schede dei materiali utilizzati, se previste", "Istruzioni di manutenzione applicabili"]),
      diario: blocco("Le fasi del lavoro", "Le fotografie concordate documentano le zone interessate dall'intervento.", []),
    },
  };
}

/** A single sample payload is used by sidebar, dialog and open-in-tab previews. Never creates a project. */
export function buildTettiTemplatePreview(companyId: string, template: TetTemplatePdf, id: TettiTemplateModuleId = "rifacimento"): { progetto: TetProgetto; computo: TetComputoVoce[]; media: TetProgettoMedia[]; template: TetTemplatePdf } {
  const module = findTettiTemplateModule(id)!;
  const computo: TetComputoVoce[] = module.works.map((descrizione, i): TetComputoVoce => ({
    id: `preview-${i}`, progetto_id: "preview", company_id: companyId, capitolo_nome: module.title, descrizione,
    unita_misura: module.units[i] as TetComputoVoce["unita_misura"], quantita: module.quantities[i], prezzo_unitario: module.prices[i],
    costo_materiali: 0, costo_manodopera: 0, sconto_pct: 0, importo: module.quantities[i] * module.prices[i],
    margine_eur: 0, margine_pct: 0, listino_voce_id: null, ordine: i,
  }));
  const imponibile = computo.reduce((total, row) => total + row.importo, 0);
  const iva = template.default_iva_pct ?? 22;
  const progetto: TetProgetto = {
    id: "preview", company_id: companyId, code: "ANTEPRIMA", stato: "bozza", tipo_intervento: module.title,
    cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_email: null, cliente_telefono: null,
    cantiere_indirizzo: "Via Roma 1", cantiere_citta: "Milano", cantiere_provincia: "MI", cantiere_cap: "20100",
    immobile_tipo: "Abitazione", immobile_superficie_mq: 120, immobile_anno: null, immobile_piani: 1,
    numero_falde: id === "rifacimento" || id === "ripasso" ? 2 : null,
    superficie_pianta_mq: id === "lattoneria" || id === "riparazioni" ? null : id === "impermeabilizzazione" ? 80 : 120,
    pendenza_pct: null, perimetro_ml: null, amianto: false,
    opportunita_id: null, cliente_id: null, template_id: null, sconto_pct: 0, iva_pct: iva, detrazione_pct: 0,
    totale_imponibile: imponibile, totale: Math.round(imponibile * (1 + iva / 100) * 100) / 100,
    note: "Dati e prezzi dimostrativi: non costituiscono un'offerta. IVA da verificare per il singolo intervento.",
  };
  return { progetto, computo, media: [], template };
}
