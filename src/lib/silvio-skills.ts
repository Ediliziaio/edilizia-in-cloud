/**
 * silvio-skills — Shortcut prompts riusabili da SilvioChatSheet (sheet
 * laterale) e InternalChat (chat team full-page). Pattern slash command:
 * click su skill → riempie il draft con un template, l'utente conferma.
 */

export type SilvioSkillCategory = "data" | "doc" | "operations" | "advisor" | "talent";

export interface SilvioSkill {
  id: string;
  emoji: string;
  label: string;
  hint: string;
  template: string; // prompt da incollare nel draft
  category: SilvioSkillCategory;
}

export const SILVIO_SKILLS: SilvioSkill[] = [
  // 📊 Dati aziendali
  { id: "cashflow",   emoji: "💰", label: "Cashflow 30gg",        hint: "Forecast cassa prossimi 30 giorni",
    template: "Mostrami il cashflow forecast prossimi 30 giorni con dettaglio entrate/uscite e segnale eventuali tensioni di liquidità.",
    category: "data" },
  { id: "margini",    emoji: "📊", label: "Margine commesse",     hint: "Quali commesse erodono margine",
    template: "Quali commesse stanno erodendo margine? Mostrami le top 5 con margine più basso e perché.",
    category: "data" },
  { id: "crediti",    emoji: "⚠️", label: "Crediti scaduti",      hint: "Clienti in ritardo grave",
    template: "Quali clienti hanno crediti scaduti gravi (oltre 60 giorni)? Lista con importo e ultimo contatto.",
    category: "data" },
  { id: "pipeline",   emoji: "🎯", label: "Pipeline preventivi",  hint: "Stato vendite + conversion",
    template: "Stato pipeline commerciale: preventivi inviati, accettati, in attesa. Tasso di conversion ultimi 90 giorni.",
    category: "data" },
  { id: "operai",     emoji: "👷", label: "Operai + costi",       hint: "Headcount + costo personale",
    template: "Quanti operai ho attivi e qual è il costo del personale al mese? Voglio anche dettaglio per ruolo.",
    category: "data" },
  { id: "magazzino",  emoji: "📦", label: "Magazzino sotto soglia", hint: "Articoli da riordinare",
    template: "Cosa devo riordinare in magazzino? Quali articoli sono sotto soglia minima?",
    category: "data" },
  { id: "mese-scorso", emoji: "📅", label: "Bilancio mese scorso", hint: "Fatturato + incassi + spese + confronto",
    template: "Com'è andato il mese scorso? Voglio fatturato emesso, incassi reali, spese, margine cash, top clienti e confronto vs mese precedente.",
    category: "data" },

  // 📄 Documenti
  { id: "ddt",        emoji: "🚚", label: "Analizza DDT",          hint: "Carica foto/PDF di un DDT",
    template: "Ti carico un DDT (in allegato). Estrai mittente, righe merce, totali. Se trovi un OdA aperto del fornitore, suggerisci il collegamento.",
    category: "doc" },
  { id: "computo",    emoji: "📐", label: "Estrai computo",        hint: "Computo metrico → preventivo",
    template: "Ti carico un computo metrico (in allegato). Estrai voci, prezzi, U.M. e suggerisci anomalie/sotto-prezzo rispetto al mercato.",
    category: "doc" },
  { id: "fattura",    emoji: "🧾", label: "Analizza fattura",      hint: "Fattura attiva/passiva",
    template: "Ti carico una fattura (in allegato). Estrai numero, data, P.IVA, totali e dimmi se è in regola.",
    category: "doc" },
  { id: "contratto",  emoji: "📜", label: "Review contratto",      hint: "Analisi clausole + rischi",
    template: "Ti carico un contratto (in allegato). Fammi review: parti, oggetto, importi, scadenze, penali, clausole rischiose.",
    category: "doc" },

  // 🏗️ Operations
  { id: "cantiere",   emoji: "🏗️", label: "Stato cantiere",       hint: "Avanzamento + costi commessa",
    template: "Stato del cantiere {nome cantiere}: avanzamento, ore consumate, costi reali vs preventivo, anomalie.",
    category: "operations" },
  { id: "subappalti", emoji: "🤝", label: "Subappalti aperti",     hint: "Lavori in subappalto",
    template: "Lista subappalti in corso: subappaltatore, importo, % completamento, eventuali ritardi.",
    category: "operations" },

  // 🧠 Advisor strategico (multi-area Council)
  { id: "assumere",   emoji: "💼", label: "Posso assumere?",       hint: "Multi-area: HR + Finance + Strategic",
    template: "In base ai dati attuali della mia azienda, posso permettermi di assumere un nuovo operaio? Voglio l'analisi cross-area: cassa, CCNL, pipeline cantieri.",
    category: "advisor" },
  { id: "rischi",     emoji: "🚨", label: "Allerta crisi",         hint: "Indici codice crisi D.Lgs 14/2019",
    template: "Calcolami gli indici di allerta crisi d'impresa (Codice Crisi D.Lgs 14/2019). Sono in zona di pericolo?",
    category: "advisor" },
  { id: "search_kb",  emoji: "🔍", label: "Cerca in KB",           hint: "Cerca nel cervello aziendale",
    template: "Cerca nella knowledge base: ",
    category: "advisor" },

  // 🎯 Talent Assessment (HR + selezioni)
  { id: "talent_sintesi", emoji: "📋", label: "Sintetizza candidato", hint: "Riassunto 60 secondi del report",
    template: "Riassumi il candidato {nome cognome} per il ruolo {ruolo} in 60 secondi: verdetto, 3 punti forti, 2 rischi concreti, 1 raccomandazione operativa. Parla in italiano colloquiale per imprenditore (non psicologico).",
    category: "talent" },
  { id: "talent_domande", emoji: "❓", label: "Domande colloquio",   hint: "5 domande critiche personalizzate",
    template: "Genera 5 domande di colloquio personalizzate per {nome cognome} (ruolo: {ruolo}). Basale sui suoi 3 tratti più sensibili e sulle sindromi attive. Per ogni domanda spiega cosa stai cercando di osservare.",
    category: "talent" },
  { id: "talent_confronto", emoji: "⚖️", label: "Confronta candidati", hint: "Chi prendo tra A e B?",
    template: "Confronta {nome A} e {nome B} per il ruolo {ruolo}. Chi prenderesti e perché? Considera fit %, sindromi RED, compatibilità col team. Output: vincitore + 3 motivi + 1 cautela.",
    category: "talent" },
  { id: "talent_email_offerta", emoji: "✉️", label: "Email offerta",  hint: "Bozza email proposta lavoro",
    template: "Scrivi una email di offerta di lavoro per {nome cognome} per il ruolo {ruolo}. Tono caldo ma professionale, personalizzata sui suoi tratti dominanti. Includi: ruolo, sede, prossimo passo. Lunghezza max 150 parole.",
    category: "talent" },
  { id: "talent_email_rifiuto", emoji: "📧", label: "Email rifiuto",  hint: "Bozza email educata di no",
    template: "Scrivi una email di rifiuto educata e rispettosa per {nome cognome}, candidato per il ruolo {ruolo}. Non dire le ragioni vere (sindromi/fit basso), usa formula tipo 'altri profili più allineati'. Lascia porta aperta per futuro. Max 100 parole.",
    category: "talent" },
];

export const SILVIO_SKILL_CATEGORY_LABELS: Record<SilvioSkillCategory, string> = {
  data: "📊 Dati aziendali",
  doc: "📄 Documenti",
  operations: "🏗️ Operations",
  advisor: "🧠 Advisor strategico",
  talent: "🎯 Talent Assessment",
};
