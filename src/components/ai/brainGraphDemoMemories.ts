/**
 * brainGraphDemoMemories — memorie pre-popolate per la Demo Azienda S.r.l.
 *
 * Set di ~50 memorie realistiche per un'impresa edile italiana, distribuite
 * tra le personas AI standard di Edilizia in Cloud. Le memorie sono pensate
 * per generare cross-persona edges visibili nel grafo: condividono keyword
 * tematiche (cantiere Bianchi, fornitore Cementi Lombardi, IVA agevolata,
 * ecc.) così che il grafo mostri il cervello che "pensa trasversalmente".
 *
 * Usato dal componente AIBrainGraph per popolare la company demo con un
 * click. Non viene MAI inserito automaticamente — l'utente deve attivare
 * esplicitamente il seed.
 */

import type { Database } from "@/integrations/supabase/types";

type MemoryType = Database["public"]["Tables"]["ai_persona_memory"]["Row"]["memory_type"];

export interface DemoMemory {
  persona_key: string;
  memory_type: MemoryType;
  content: string;
  confidence: number;
  hits_count: number;
}

/**
 * Lista delle memorie da inserire. Le persona_key usate sono quelle standard
 * delle 18 personas Edilizia in Cloud — il sistema filtra runtime per usare
 * solo quelle effettivamente presenti in `ai_personas`.
 */
export const DEMO_MEMORIES: DemoMemory[] = [
  // ─── CFO / FINANCE ───────────────────────────────────────────────────────
  { persona_key: "cfo", memory_type: "preference", content: "Florin preferisce vedere il P&L mensile invece che settimanale", confidence: 0.95, hits_count: 12 },
  { persona_key: "cfo", memory_type: "fact",       content: "Cliente Bianchi Srl ha sempre pagato in ritardo medio di 45 giorni nel 2025", confidence: 0.92, hits_count: 18 },
  { persona_key: "cfo", memory_type: "decision",   content: "Politica aziendale: scaglione IVA 10% solo per ristrutturazioni edilizie, mai per nuove costruzioni", confidence: 1.0, hits_count: 8 },
  { persona_key: "cfo", memory_type: "pattern",    content: "Marzo e novembre sono mesi di picco fatturazione — concentrare incassi prima della chiusura", confidence: 0.88, hits_count: 7 },
  { persona_key: "cfo", memory_type: "avoid",      content: "Non concedere mai dilazioni oltre 90 giorni — politica aziendale rigida dal 2024", confidence: 1.0, hits_count: 22 },

  // ─── CONTABILE ─────────────────────────────────────────────────────────────
  { persona_key: "contabile", memory_type: "fact",       content: "Fornitore Cementi Lombardi richiede sempre bonifico anticipato, no riba", confidence: 0.95, hits_count: 9 },
  { persona_key: "contabile", memory_type: "preference", content: "Florin vuole vedere riconciliazione SDI ogni lunedì mattina", confidence: 0.9, hits_count: 14 },
  { persona_key: "contabile", memory_type: "decision",   content: "Tutte le fatture sotto i 500€ vanno in registro semplificato per ridurre carico contabile", confidence: 0.85, hits_count: 6 },
  { persona_key: "contabile", memory_type: "pattern",    content: "Le fatture Bianchi Srl arrivano sempre l'ultimo giorno utile per detrazione IVA", confidence: 0.87, hits_count: 11 },

  // ─── PM CANTIERE / OPERATIONS ──────────────────────────────────────────────
  { persona_key: "pm_cantiere", memory_type: "fact",       content: "Il cantiere Bianchi Via Roma 12 va sempre in ritardo per problemi di accesso mezzi", confidence: 0.93, hits_count: 16 },
  { persona_key: "pm_cantiere", memory_type: "preference", content: "Florin preferisce ricevere report cantieri il venerdì sera, non lunedì", confidence: 0.88, hits_count: 8 },
  { persona_key: "pm_cantiere", memory_type: "decision",   content: "Tutti i cantieri sopra 50k€ richiedono sopralluogo settimanale obbligatorio", confidence: 1.0, hits_count: 15 },
  { persona_key: "pm_cantiere", memory_type: "pattern",    content: "I cantieri Bianchi Srl richiedono sempre 3-4 varianti in corso d'opera", confidence: 0.91, hits_count: 13 },
  { persona_key: "pm_cantiere", memory_type: "avoid",      content: "Non assegnare mai cantiere Bianchi Via Roma al capocantiere Rossi — conflitti pregressi", confidence: 0.95, hits_count: 5 },
  { persona_key: "pm_cantiere", memory_type: "fact",       content: "Cementi Lombardi consegna sempre dopo le 10 — programmare scarichi di conseguenza", confidence: 0.9, hits_count: 19 },

  // ─── COMMERCIALE / SALES ──────────────────────────────────────────────────
  { persona_key: "commerciale", memory_type: "fact",       content: "Cliente Bianchi Srl preferisce trattare via WhatsApp invece che email", confidence: 0.88, hits_count: 21 },
  { persona_key: "commerciale", memory_type: "preference", content: "Florin vuole essere CC in tutti i preventivi sopra 30k€", confidence: 1.0, hits_count: 17 },
  { persona_key: "commerciale", memory_type: "decision",   content: "Politica preventivi: validità 30 giorni standard, 60 giorni solo per clienti storici", confidence: 0.95, hits_count: 9 },
  { persona_key: "commerciale", memory_type: "pattern",    content: "I clienti del settore ristrutturazioni edilizie firmano in media dopo 2-3 incontri", confidence: 0.86, hits_count: 12 },
  { persona_key: "commerciale", memory_type: "avoid",      content: "Non offrire mai sconti immediati a Bianchi Srl — preferiscono trattare a lungo", confidence: 0.9, hits_count: 7 },

  // ─── HR / PERSONALE ───────────────────────────────────────────────────────
  { persona_key: "hr", memory_type: "fact",       content: "Capocantiere Rossi ha turni preferenziali martedì-sabato, riposo domenica e lunedì", confidence: 0.92, hits_count: 11 },
  { persona_key: "hr", memory_type: "preference", content: "Florin preferisce assumere a chiamata invece di contratti a termine fissi", confidence: 0.88, hits_count: 14 },
  { persona_key: "hr", memory_type: "decision",   content: "Tutti i nuovi assunti devono fare corso sicurezza D.Lgs 81/08 prima di entrare in cantiere", confidence: 1.0, hits_count: 8 },
  { persona_key: "hr", memory_type: "pattern",    content: "I muratori da Romania restano in media 8-12 mesi, poi tornano a casa per la stagione", confidence: 0.84, hits_count: 6 },

  // ─── ACQUISTI / PROCUREMENT ───────────────────────────────────────────────
  { persona_key: "acquisti", memory_type: "fact",       content: "Cementi Lombardi fa sempre lo sconto del 5% su ordini sopra 10 ton", confidence: 0.95, hits_count: 23 },
  { persona_key: "acquisti", memory_type: "preference", content: "Florin vuole vedere tutti gli ordini sopra 5k€ prima dell'invio al fornitore", confidence: 0.93, hits_count: 19 },
  { persona_key: "acquisti", memory_type: "decision",   content: "Fornitori principali: Cementi Lombardi per cemento, Edilcasa per laterizi, Ferramenta Verdi per minuteria", confidence: 1.0, hits_count: 28 },
  { persona_key: "acquisti", memory_type: "avoid",      content: "Non ordinare mai da Edilfast Srl — qualità scarsa e tempi consegna inaffidabili", confidence: 0.97, hits_count: 4 },

  // ─── MARKETING ────────────────────────────────────────────────────────────
  { persona_key: "marketing", memory_type: "preference", content: "Florin preferisce contenuti social tecnici (timelapse cantieri) invece di lifestyle", confidence: 0.9, hits_count: 13 },
  { persona_key: "marketing", memory_type: "fact",       content: "Il target principale sono geometri di Milano e Monza-Brianza, età 35-55", confidence: 0.88, hits_count: 9 },
  { persona_key: "marketing", memory_type: "decision",   content: "Budget Meta Ads: massimo 800€/mese, 60% Instagram 40% Facebook", confidence: 0.95, hits_count: 7 },
  { persona_key: "marketing", memory_type: "pattern",    content: "Le ricerche organiche per 'ristrutturazioni edilizie Milano' crescono a marzo-aprile e settembre", confidence: 0.82, hits_count: 5 },

  // ─── LEGAL / COMPLIANCE ───────────────────────────────────────────────────
  { persona_key: "legal", memory_type: "fact",       content: "Contratto Bianchi Srl prevede clausola penale 2% per ogni settimana di ritardo cantiere", confidence: 0.95, hits_count: 6 },
  { persona_key: "legal", memory_type: "decision",   content: "Tutti i contratti sopra 20k€ richiedono fideiussione bancaria del 10% importo lavori", confidence: 1.0, hits_count: 11 },
  { persona_key: "legal", memory_type: "avoid",      content: "Non firmare mai contratti con clausola di risoluzione unilaterale senza preavviso", confidence: 1.0, hits_count: 8 },

  // ─── STRATEGY / CEO ───────────────────────────────────────────────────────
  { persona_key: "strategy", memory_type: "fact",       content: "Obiettivo 2026: aumentare fatturato del 20% concentrandosi su ristrutturazioni edilizie premium", confidence: 0.98, hits_count: 16 },
  { persona_key: "strategy", memory_type: "preference", content: "Florin vuole brief strategici brevi (max 200 parole) con 3 azioni concrete", confidence: 0.93, hits_count: 21 },
  { persona_key: "strategy", memory_type: "decision",   content: "Non espandere in Lazio o Campania nel 2026 — focus solo Lombardia e Piemonte", confidence: 0.9, hits_count: 5 },
  { persona_key: "strategy", memory_type: "pattern",    content: "I migliori clienti vengono sempre da referral di geometri — investire in relazioni professionisti", confidence: 0.87, hits_count: 10 },

  // ─── SUPPORT / ASSISTENZA ─────────────────────────────────────────────────
  { persona_key: "support", memory_type: "fact",       content: "Bianchi Srl chiama sempre il lunedì mattina per segnalare problemi del weekend", confidence: 0.85, hits_count: 14 },
  { persona_key: "support", memory_type: "decision",   content: "Tickets cantiere bloccato hanno priorità massima — risposta entro 1h durante orari lavoro", confidence: 1.0, hits_count: 12 },
  { persona_key: "support", memory_type: "pattern",    content: "Il 60% dei ticket sono richieste varianti, non veri problemi tecnici", confidence: 0.83, hits_count: 8 },

  // ─── TECH / IT ────────────────────────────────────────────────────────────
  { persona_key: "tech", memory_type: "preference", content: "Florin preferisce automazioni invisibili che funzionano in background, no UI complesse", confidence: 0.92, hits_count: 7 },
  { persona_key: "tech", memory_type: "decision",   content: "Tutte le foto cantieri vanno salvate automaticamente su drive aziendale, mai locale su telefono", confidence: 0.95, hits_count: 9 },

  // ─── SICUREZZA / RSPP ─────────────────────────────────────────────────────
  { persona_key: "rspp", memory_type: "fact",       content: "DVR aggiornato a gennaio 2026 — prossima revisione gennaio 2027", confidence: 1.0, hits_count: 4 },
  { persona_key: "rspp", memory_type: "decision",   content: "Tutti i cantieri Bianchi richiedono PSC aggiornato per ogni variante", confidence: 0.95, hits_count: 6 },
  { persona_key: "rspp", memory_type: "avoid",      content: "Mai consentire lavori in quota senza DPI categoria 3 — anche se 'è solo per 5 minuti'", confidence: 1.0, hits_count: 3 },
];

/**
 * Persona key fallback chain — se un persona_key non esiste nel sistema,
 * proviamo questi alternativi. Questo rende il seed robusto a piccole
 * variazioni nei nomi delle 18 personas.
 */
export const PERSONA_FALLBACKS: Record<string, string[]> = {
  cfo:         ["cfo", "amministrazione", "finance"],
  contabile:   ["contabile", "amministrazione", "accounting"],
  pm_cantiere: ["pm_cantiere", "operations", "cantiere", "project_manager"],
  commerciale: ["commerciale", "sales", "vendita"],
  hr:          ["hr", "personale", "human_resources"],
  acquisti:    ["acquisti", "procurement", "purchasing"],
  marketing:   ["marketing", "comunicazione"],
  legal:       ["legal", "legale", "compliance"],
  strategy:    ["strategy", "ceo", "strategia"],
  support:     ["support", "assistenza", "customer_care"],
  tech:        ["tech", "it", "tecnologia"],
  rspp:        ["rspp", "sicurezza", "safety"],
};
