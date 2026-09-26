import type { TetListItem, TetTemplatePdf } from "@/types/tetti";
import { CAPITOLI_EDILI } from "@/components/preventivi/pdf/ordineCapitoli";
import type { ContenutoBlocco } from "../../../supabase/functions/_shared/blocchiPreventivo";
import { completeModulePhotography } from "./modulePhotography";
import { createTettiModuleTemplate, type TettiTemplateModuleId } from "./tettiTemplateModules";
import { completeRifacimentoTemplate } from "./fullRifacimentoModule";
import { completeTettiEdition } from "./fullTettiFactory";
import { riparazioniContent } from "./fullRiparazioniModule";
import { isolamentoContent } from "./fullIsolamentoModule";
import { impermeabilizzazioneContent } from "./fullImpermeabilizzazioneModule";
import { lattoneriaContent } from "./fullLattoneriaModule";
import { amiantoContent, lineaVitaContent, lucernariContent } from "./fullTettiExtra";

/** Full editions keep the original DocumentoEdilePDF and the original area editor. */
export const FULL_TETTI_MODULES: readonly TettiTemplateModuleId[] = ["rifacimento", "ripasso", "riparazioni", "isolamento", "impermeabilizzazione", "lattoneria", "amianto", "linea-vita", "lucernari"];
export const isFullTettiTemplate = (template: TetTemplatePdf) => template.pdf_blocchi?.modulo_edizione === 2;
type Entry = readonly [string, string];
const entries = (values: readonly Entry[]): TetListItem[] => values.map(([titolo, descrizione]) => ({ titolo, descrizione }));
const board = "/module-art/tetti-ripasso-dettagli.jpg";
const cover = "/module-art/tetti.jpg";
const block = (titolo: string, intro: string, values: readonly Entry[], foto?: string): ContenutoBlocco & { senzaFoto: boolean } => ({
  occhiello: "MANUTENZIONE DELLA COPERTURA", titolo, intro,
  voci: values.map(([titolo, testo], i) => ({ titolo, testo, icona: (["verifica", "strati", "installazione", "documenti"] as const)[i % 4] })),
  escluse: [], foto: foto ? [foto] : [], senzaFoto: !foto,
  nota: foto ? "Immagine illustrativa, non riferita a un cantiere eseguito. Le lavorazioni incluse sono solo quelle descritte nel computo." : null,
});

export function createFullTettiTemplate(base: TetTemplatePdf, id: TettiTemplateModuleId): TetTemplatePdf {
  const seed = createTettiModuleTemplate(base, id);
  // Set before every edition captures its defaults (also the early-return editions).
  seed.pdf_blocchi = { ...seed.pdf_blocchi, modulo_intervento: id };
  if (id === "rifacimento") return completeRifacimentoTemplate(seed, base);
  if (id === "riparazioni") return completeTettiEdition(seed, base, riparazioniContent);
  if (id === "isolamento") return completeTettiEdition(seed, base, isolamentoContent);
  if (id === "impermeabilizzazione") return completeTettiEdition(seed, base, impermeabilizzazioneContent);
  if (id === "lattoneria") return completeTettiEdition(seed, base, lattoneriaContent);
  if (id === "amianto") return completeTettiEdition(seed, base, amiantoContent);
  if (id === "linea-vita") return completeTettiEdition(seed, base, lineaVitaContent);
  if (id === "lucernari") return completeTettiEdition(seed, base, lucernariContent);
  if (id !== "ripasso") return seed;
  const template: TetTemplatePdf = {
    ...seed,
    cover_title: "Il ripasso del tuo *tetto*.",
    cover_subtitle: "Recuperare il manto riutilizzabile. Intervenire sui punti che ne hanno bisogno.",
    cover_eyebrow: "RIPASSO E MANUTENZIONE", cover_image_url: cover,
    cover_bg_color: "#392e28", cover_overlay_opacity: 0.74,
    cover_title_size: 38, cover_subtitle_size: 13,
    color_primary: base.color_primary || "#563e32", color_accent: base.color_accent || "#b66b42",
    show_chi_siamo: !!base.chi_siamo?.trim(),
    condizioni_legali_testo: null, condizioni_legali_attivo: false, modulo_recesso_attivo: false,
    esigenze: entries([
      ["Capire dove intervenire", "Individuare tegole spostate, elementi rotti e raccordi critici, distinguendo i difetti visibili dalle condizioni degli strati sottostanti."],
      ["Conservare il materiale recuperabile", "Valutare stato, compatibilità e disponibilità dei ricambi prima di stabilire le quantità da sostituire."],
      ["Evitare aspettative sbagliate", "Definire l'area interessata e i limiti della manutenzione: un ripasso non equivale al rifacimento completo della copertura."],
    ]),
    soluzione: entries([
      ["Un rilievo dei punti interessati", "La proposta identifica le falde e le zone su cui lavorare. Eventuali verifiche non accessibili vengono segnalate come approfondimenti."],
      ["Riordino e sostituzioni mirate", "Le tegole recuperabili vengono riposizionate; quelle non idonee si sostituiscono secondo le quantità e le caratteristiche riportate nel computo."],
      ["Raccordi e consegna verificabili", "I raccordi inclusi e le verifiche finali sono descritti prima dell'avvio. Le criticità residue vengono annotate, non nascoste dal lavoro finito."],
    ]),
    usp: entries([
      ["Quantità leggibili", "Superfici, elementi da sostituire e tratti di raccordo hanno voci distinte: puoi comprendere a cosa si riferisce il prezzo."],
      ["Scelte documentate", "Materiali recuperati e ricambi vengono identificati, senza promettere un'uniformità cromatica impossibile da verificare prima della scelta."],
      ["Varianti concordate", "Se l'apertura localizzata rivela altri problemi, si definiscono lavorazioni, prezzo e tempi aggiuntivi prima di proseguire."],
    ]),
    percorso: entries([
      ["01 · Verifica e perimetro", "Si rilevano le aree accessibili, i difetti visibili e gli accessi necessari. Il computo chiarisce i limiti dell'intervento."],
      ["02 · Materiali e conferma", "Si concordano quantità, ricambi compatibili e raccordi da trattare, insieme alle condizioni dell'offerta."],
      ["03 · Organizzazione e ripasso", "Date e fasi tengono conto di accessi, protezioni e condizioni meteo. Eventuali imprevisti vengono condivisi."],
      ["04 · Riscontro e consegna", "Si verifica l'ambito eseguito, si annotano le criticità residue e si condividono le indicazioni di manutenzione pertinenti."],
    ]),
    garanzie: entries([
      ["Ambito riconoscibile", "Il riepilogo delle opere eseguite distingue le parti trattate da quelle della copertura rimaste invariate."],
      ["Ricambi identificati", "Prodotto e caratteristiche dei materiali nuovi vengono indicati nella documentazione disponibile del fornitore."],
      ["Condizioni esplicite", "Durate, coperture e modalità di assistenza sono quelle riportate nei documenti applicabili; non si presumono garanzie aggiuntive sull'intero tetto."],
      ["Manutenzione successiva", "Frequenza dei controlli e attività successive vanno definite in base a stato, esposizione e caratteristiche della copertura."],
    ]),
    cronoprogramma: [
      { fase: "Rilievo e definizione", durata: "Da concordare", descrizione: "Conferma delle zone, delle quantità e degli accessi." },
      { fase: "Preparazione", durata: "Da concordare", descrizione: "Disponibilità dei ricambi, organizzazione degli accessi e delle protezioni previste." },
      { fase: "Ripasso", durata: "Da concordare", descrizione: "Riordino, sostituzioni puntuali e revisione dei raccordi inclusi, per aree pianificate." },
      { fase: "Verifica e consegna", durata: "Da concordare", descrizione: "Riscontro delle opere e delle eventuali criticità residue. Il calendario tiene conto del meteo." },
    ],
    faq: [
      ...seed.faq,
      { domanda: "Quante tegole verranno sostituite?", risposta: "La quantità prevista è riportata nel computo. Se il controllo delle aree interessate evidenzia ulteriori elementi non recuperabili, la variazione viene quantificata e concordata." },
      { domanda: "Si interviene anche su isolamento e membrana?", risposta: "Non automaticamente. Il ripasso riguarda il manto e i raccordi descritti. Isolamento, membrana e struttura richiedono voci e valutazioni specifiche." },
      { domanda: "I ricambi avranno lo stesso colore?", risposta: "Forma e compatibilità vanno verificate. Materiali nuovi e tegole invecchiate possono avere differenze cromatiche: eventuali campioni si valutano prima della conferma." },
      { domanda: "Come incidono pioggia e accessi sui tempi?", risposta: "Le date dipendono dalle condizioni di accesso e dal meteo compatibile con le lavorazioni. Eventuali ripianificazioni vengono condivise, senza lasciare implicite opere provvisionali aggiuntive." },
      { domanda: "Il ripasso risolve ogni infiltrazione?", risposta: "Non si può dedurre dal solo riordino del manto. Cause non visibili o parti estranee all'intervento possono richiedere approfondimenti e una soluzione diversa." },
      { domanda: "Le foto sono quelle del mio tetto?", risposta: "Solo le immagini caricate e identificate come rilievi del tuo immobile. Le immagini illustrative del modello spiegano l'intervento ma non documentano un lavoro già eseguito." },
    ],
    // Empty real proof sections stay available and disappear naturally until supplied.
    pdf_ordine_capitoli: CAPITOLI_EDILI.map(c => ({ chiave: c.chiave, visibile: true })),
    pdf_blocchi: {
      ...seed.pdf_blocchi, modulo_edizione: 2,
      modulo_foto: [{ url: cover, nome: "Copertura esistente · illustrativa" }, { url: board, nome: "Tavola ripasso e ricambi · illustrativa" }],
      comeFunziona: block("Recuperare, riordinare, *sostituire*.", "Il ripasso lavora sulle parti del manto indicate nell'offerta. La decisione tra manutenzione e rifacimento dipende dalle condizioni riscontrate, non soltanto dall'aspetto esterno.", [
        ["Verificare", "Individuare le zone interessate, gli elementi non idonei e le limitazioni del rilievo."],
        ["Recuperare", "Conservare le tegole giudicate riutilizzabili nelle aree oggetto dell'intervento."],
        ["Riordinare", "Riposizionare gli elementi e trattare i raccordi secondo le lavorazioni concordate."],
        ["Sostituire", "Inserire ricambi compatibili nelle quantità previste, documentando le eventuali variazioni."],
      ], board),
      compreso: {
        ...block("Il perimetro, *senza equivoci*.", "Questa pagina aiuta a leggere il computo. Le descrizioni generali non aggiungono lavorazioni al prezzo: quantità, materiali e inclusioni devono essere espliciti nelle voci.", [
          ["Zone del manto", "Falde e superfici interessate dal riordino, come individuate nel rilievo e nel computo."],
          ["Tegole di ricambio", "Numero e tipologia degli elementi nuovi, distinti da quelli recuperati."],
          ["Raccordi selezionati", "Soli tratti e punti singolari descritti; non una revisione implicita dell'intera copertura."],
          ["Accessi e gestione materiali", "Opere provvisionali, movimentazione e gestione dei materiali rimossi solo se elencate."],
        ]),
        escluse: [
          { titolo: "Non è un rifacimento integrale", testo: "Struttura, nuovo isolamento e sostituzione estesa della membrana restano fuori, salvo voci espressamente concordate.", icona: "verifica" },
          { titolo: "Altre opere da valutare", testo: "Danni interni, bonifiche, difetti non accessibili e opere ulteriori richiedono valutazioni e prezzi separati.", icona: "documenti" },
        ],
      },
      protezione: block("Organizzare il cantiere, *prima di salire*.", "Accessi e misure di protezione vengono definiti dai soggetti competenti in base all'immobile e alle lavorazioni. Questa proposta non sostituisce la valutazione tecnica del cantiere.", [
        ["Accessi", "Concordare disponibilità degli spazi, percorsi e mezzi previsti per raggiungere la copertura."],
        ["Aree interessate", "Individuare passaggi e superfici sottostanti da delimitare e proteggere durante le lavorazioni."],
        ["Meteo e fasi", "Pianificare le aree di lavoro e le eventuali protezioni temporanee secondo le condizioni effettive."],
        ["Materiali e rimozioni", "Definire movimentazione, deposito temporaneo e gestione dei materiali rimossi inclusi nell'offerta."],
      ]),
      controlli: block("Controlli sulle parti *effettivamente trattate*.", "Il riscontro finale riguarda le lavorazioni previste. Le aree non accessibili e gli elementi rimasti invariati vengono distinti da quelli controllati.", [
        ["Manto riordinato", "Verifica visiva del posizionamento e della stabilità degli elementi nelle zone interessate."],
        ["Sostituzioni", "Riscontro dei ricambi, della compatibilità e delle quantità effettivamente posate."],
        ["Raccordi", "Controllo dei soli raccordi interessati. Eventuali prove ulteriori vanno concordate e definite."],
        ["Criticità residue", "Annotazione delle anomalie che richiedono approfondimenti o lavorazioni esterne al perimetro."],
      ]),
      documenti: block("Un riepilogo utile, *anche dopo i lavori*.", "I documenti da consegnare vengono concordati nell'offerta e riferiti ai materiali e alle opere effettivamente forniti.", [
        ["Ambito eseguito", "Elenco delle zone trattate e delle lavorazioni, comprese le varianti concordate."],
        ["Materiali impiegati", "Identificazione dei ricambi e schede disponibili dei materiali utilizzati."],
        ["Riscontro finale", "Riepilogo dei controlli previsti e delle eventuali riserve o criticità residue."],
        ["Contatti e manutenzione", "Riferimento per le segnalazioni e indicazioni applicabili alla copertura esistente."],
      ]),
      diario: block("Prima, durante e dopo: *le zone del tuo tetto*.", "Un eventuale diario fotografico si concorda prima dell'avvio. Serve a mostrare l'ambito lavorato, non ad attribuire al ripasso risultati su parti non trattate.", [
        ["Prima", "Zone oggetto del rilievo e difetti visibili che motivano l'intervento."],
        ["Durante", "Elementi recuperati, sostituzioni e dettagli accessibili dei raccordi previsti."],
        ["Dopo", "Le stesse zone a lavoro concluso, con eventuali differenze o criticità annotate."],
      ]),
      pagina_computo: { senzaFoto: true }, pagina_compreso: { senzaFoto: true },
      pagina_chiusura: { foto: [cover] },
    },
  };
  template.pdf_blocchi = completeModulePhotography(template.pdf_blocchi, "tetti");
  template.pdf_blocchi = { ...template.pdf_blocchi, modulo_defaults: structuredClone(template.pdf_blocchi) };
  return template;
}

/** Upgrades are explicit drafts: unchanged v1 defaults only, never stored here. */
export function upgradeTettiModuleTemplate(saved: TetTemplatePdf, base: TetTemplatePdf, id: TettiTemplateModuleId): TetTemplatePdf {
  const old = createTettiModuleTemplate(base, id);
  const next = createFullTettiTemplate(base, id);
  const merged = { ...saved } as Record<string, unknown>;
  for (const [key, value] of Object.entries(next)) {
    if (!(key in saved) || JSON.stringify(saved[key as keyof TetTemplatePdf]) === JSON.stringify(old[key as keyof TetTemplatePdf])) merged[key] = value;
  }
  const blocks = { ...saved.pdf_blocchi };
  for (const [key, value] of Object.entries(next.pdf_blocchi || {})) {
    if (!(key in blocks) || JSON.stringify(blocks[key]) === JSON.stringify(old.pdf_blocchi?.[key])) blocks[key] = value;
  }
  blocks.modulo_edizione = 2;
  merged.pdf_blocchi = blocks;
  return merged as unknown as TetTemplatePdf;
}
