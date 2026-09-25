/**
 * Libreria locale di copy standard per tutti i PDF preventivo.
 * È separata dalla UI così i preset possono essere testati e riutilizzati
 * anche da wizard, importatori o controlli qualità futuri.
 */
import type { AiTemplateDraft } from "@/components/preventivi/AiTemplateReviewDialog";

export type StandardTemplateModule =
  | "serramenti"
  | "fotovoltaico"
  | "ristrutturazione"
  | "bagni"
  | "tetti"
  | "climatizzazione"
  | "elettrico"
  | "termoidraulico"
  | "pavimenti"
  | "piscine";

export type StandardCopyStyle = "chiara" | "premium" | "tecnica" | "essenziale";

const MODULE_WORDS: Record<StandardTemplateModule, { label: string; subject: string; area: string }> = {
  serramenti: { label: "Serramenti", subject: "serramenti", area: "la casa" },
  fotovoltaico: { label: "Fotovoltaico", subject: "impianto fotovoltaico", area: "la tua energia" },
  ristrutturazione: { label: "Ristrutturazione", subject: "ristrutturazione", area: "la tua casa" },
  bagni: { label: "Bagni", subject: "bagno", area: "il tuo bagno" },
  tetti: { label: "Tetti", subject: "copertura", area: "la tua casa" },
  climatizzazione: { label: "Climatizzazione", subject: "impianto di climatizzazione", area: "il comfort di casa" },
  elettrico: { label: "Elettrico / Domotica", subject: "impianto elettrico", area: "la tua casa" },
  termoidraulico: { label: "Termoidraulico", subject: "impianto termoidraulico", area: "il comfort di casa" },
  pavimenti: { label: "Pavimenti & Resine", subject: "pavimento e rivestimento", area: "i tuoi ambienti" },
  piscine: { label: "Piscine", subject: "piscina", area: "il tuo spazio all'aperto" },
};

const list = (items: Array<[string, string]>) => items.map(([titolo, descrizione]) => ({ titolo, descrizione }));

/** Genera un kit completo: tutte le aree testuali comuni vengono valorizzate insieme. */
export function buildStandardTextTemplate(module: StandardTemplateModule, style: StandardCopyStyle): AiTemplateDraft {
  const words = MODULE_WORDS[module];
  const premium = style === "premium";
  const technical = style === "tecnica";
  const short = style === "essenziale";
  const prefix = premium ? "Una scelta progettata per valorizzare" : technical ? "Una soluzione verificabile per" : "Un progetto chiaro per";

  const esigenze = list([
    ["Capire la soluzione giusta", `Valutiamo esigenze, ambiente, vincoli e priorità prima di proporre ${words.subject}.`],
    ["Avere un investimento leggibile", "Voci, quantità, inclusioni ed esclusioni sono presentate senza costi nascosti."],
    ["Ridurre imprevisti e tempi morti", "Rilievo, coordinamento e controlli seguono un percorso definito fin dall'inizio."],
    ["Ottenere un risultato che duri", `Scegliamo materiali e lavorazioni coerenti con l'uso reale di ${words.area}.`],
  ]);
  const soluzione = list([
    ["Sopralluogo e rilievo", "Raccogliamo misure, condizioni esistenti e richieste del cliente prima del computo."],
    ["Proposta personalizzata", `Confrontiamo alternative e definiamo ${words.subject} in base a prestazioni, estetica e budget.`],
    ["Lavorazione organizzata", "Condividiamo calendario, responsabilità, materiali e modalità operative."],
    ["Verifica e consegna", "Controlliamo il risultato, consegniamo la documentazione prevista e restiamo disponibili."],
  ]);
  const usp = list([
    ["Un referente dall'inizio alla fine", "Una regia unica per domande, decisioni e aggiornamenti."],
    ["Preventivo voce per voce", "Il cliente vede cosa è incluso, cosa è opzionale e quali condizioni si applicano."],
    ["Scelte motivate", "Ogni proposta è collegata a un'esigenza concreta, non a una promessa generica."],
    ["Controlli documentati", "Le verifiche finali e la documentazione vengono definite prima della consegna."],
  ]);
  const garanzie = list([
    ["Materiali identificati", "Marca, modello o classe prestazionale vengono indicati quando disponibili."],
    ["Posa e lavorazione controllate", "La squadra segue una checklist interna prima della consegna."],
    ["Documenti finali", "Raccogliamo manuali, schede e dichiarazioni applicabili all'intervento."],
    ["Assistenza dopo la consegna", "Per richieste e regolazioni il referente resta disponibile secondo le condizioni concordate."],
  ]);
  const percorso = [
    { titolo: "1. Conosciamoci", descrizione: "Raccogliamo obiettivi, priorità e vincoli del progetto." },
    { titolo: "2. Rilievo e proposta", descrizione: "Verifichiamo gli spazi e costruiamo una proposta leggibile." },
    { titolo: "3. Conferma", descrizione: "Rivediamo insieme voci, tempi, condizioni e varianti." },
    { titolo: "4. Realizzazione", descrizione: "Coordiniamo le attività e aggiorniamo il cliente sui passaggi importanti." },
    { titolo: "5. Verifica finale", descrizione: "Controlliamo il risultato e consegniamo quanto previsto." },
  ];
  const cronoprogramma = [
    { fase: "Rilievo e definizione", durata: "1–2 giorni", descrizione: "Sopralluogo, misure e conferma delle esigenze." },
    { fase: "Scelta e ordine", durata: "da concordare", descrizione: "Materiali, finiture, accessori e calendario." },
    { fase: "Preparazione", durata: "da concordare", descrizione: "Organizzazione del cantiere e coordinamento delle squadre." },
    { fase: "Lavori e controlli", durata: "da concordare", descrizione: "Esecuzione, verifica e consegna documenti." },
  ];
  const faq = [
    { domanda: "Il sopralluogo è sempre necessario?", risposta: "Lo definiamo in base alla complessità dell'intervento: serve quando misure e condizioni esistenti incidono sulla proposta." },
    { domanda: "Posso confrontare più soluzioni?", risposta: "Sì. Possiamo presentare alternative con differenze di prestazioni, finiture, tempi e investimento." },
    { domanda: "Cosa succede dopo l'accettazione?", risposta: "Confermiamo dati, materiali, calendario e condizioni prima di avviare la lavorazione." },
    { domanda: "Cosa è escluso dal prezzo?", risposta: "Le esclusioni sono indicate nel dettaglio economico e nelle condizioni del preventivo: chiedici ogni dubbio prima della firma." },
    { domanda: "Come gestite eventuali varianti?", risposta: "Le valutiamo prima dell'esecuzione e le formalizziamo con relativo aggiornamento dell'offerta." },
  ];

  return {
    cover_title: short ? `${words.label}: proposta` : `${prefix} ${words.subject}.`,
    cover_subtitle: short ? "Soluzione, tempi e investimento in un unico documento." : `Dalla prima analisi alla consegna, con ${words.area} al centro.`,
    chi_siamo: `<p>Seguiamo progetti di ${words.subject} con un metodo concreto: ascolto, rilievo, proposta chiara e verifica finale. L'obiettivo è aiutarti a scegliere con consapevolezza e avere un referente durante ogni fase.</p>`,
    esigenze: technical ? esigenze.slice(0, 4) : esigenze,
    soluzione: short ? soluzione.slice(0, 3) : soluzione,
    usp: premium ? usp.slice(0, 3) : usp,
    garanzie: technical ? garanzie : garanzie.slice(0, 3),
    percorso: short ? percorso.slice(0, 4) : percorso,
    cronoprogramma: short ? cronoprogramma.slice(0, 3) : cronoprogramma,
    faq: short ? faq.slice(0, 4) : faq,
    payment_terms_text: "Il pagamento segue le milestone indicate nel preventivo. Eventuali lavorazioni aggiuntive o varianti vengono concordate e approvate prima dell'esecuzione.",
    validity_text: "Offerta valida 30 giorni, salvo diversa indicazione riportata nel preventivo. Materiali, disponibilità e tempi vengono confermati al momento dell'ordine.",
    footer_text: "Grazie per averci coinvolto nel progetto. Per chiarimenti o per fissare il prossimo passo, contatta il tuo referente.",
  };
}
