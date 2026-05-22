/**
 * brainGraphDemoMemories — 150 memorie pre-popolate per Demo Azienda S.r.l.
 *
 * Dataset realistico per un'impresa edile italiana, con keyword condivise
 * massive per generare 80-100+ cross-persona edges visibili nel grafo.
 *
 * Entità ricorrenti (che generano cross-link):
 *   • Clienti: Bianchi Srl, Rossi Costruzioni, Verdi Edilizia, Milano Habitat
 *   • Fornitori: Cementi Lombardi, Edilcasa, Ferramenta Verdi
 *   • Cantieri: Via Roma 12, Via Milano 45, Centro Direzionale Garibaldi
 *   • Temi: ritardo pagamento, IVA 10%, varianti, fideiussione, sicurezza
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

export const DEMO_MEMORIES: DemoMemory[] = [
  // ═══ CFO / FINANCE (20 memorie) ═══════════════════════════════════════
  { persona_key: "cfo", memory_type: "preference", content: "Florin preferisce vedere il P&L mensile invece che settimanale", confidence: 0.95, hits_count: 18 },
  { persona_key: "cfo", memory_type: "fact",       content: "Cliente Bianchi Srl ha sempre pagato in ritardo medio di 45 giorni nel 2025", confidence: 0.92, hits_count: 28 },
  { persona_key: "cfo", memory_type: "fact",       content: "Rossi Costruzioni paga puntuale a 30 giorni, mai un ritardo", confidence: 0.95, hits_count: 14 },
  { persona_key: "cfo", memory_type: "fact",       content: "Verdi Edilizia ha richiesto dilazione 60gg sul cantiere Via Milano 45", confidence: 0.9, hits_count: 11 },
  { persona_key: "cfo", memory_type: "decision",   content: "Politica aziendale: scaglione IVA 10% solo per ristrutturazioni edilizie, mai per nuove costruzioni", confidence: 1.0, hits_count: 22 },
  { persona_key: "cfo", memory_type: "decision",   content: "Tutte le fatture sopra 50k€ richiedono approvazione CFO prima dell'emissione", confidence: 1.0, hits_count: 9 },
  { persona_key: "cfo", memory_type: "pattern",    content: "Marzo e novembre sono mesi di picco fatturazione — concentrare incassi prima della chiusura", confidence: 0.88, hits_count: 15 },
  { persona_key: "cfo", memory_type: "pattern",    content: "Margine medio cantieri Bianchi: 12% (sotto la media aziendale del 18%)", confidence: 0.91, hits_count: 7 },
  { persona_key: "cfo", memory_type: "avoid",      content: "Non concedere mai dilazioni oltre 90 giorni — politica aziendale rigida dal 2024", confidence: 1.0, hits_count: 24 },
  { persona_key: "cfo", memory_type: "avoid",      content: "Evitare anticipi fornitori superiori al 30% senza fideiussione bancaria", confidence: 0.97, hits_count: 8 },
  { persona_key: "cfo", memory_type: "fact",       content: "Cementi Lombardi richiede sempre bonifico anticipato 30%, no riba mai concessa", confidence: 0.95, hits_count: 19 },
  { persona_key: "cfo", memory_type: "fact",       content: "Costo medio mensile cementi: 12k€ (Cementi Lombardi 80% del totale)", confidence: 0.88, hits_count: 6 },
  { persona_key: "cfo", memory_type: "preference", content: "Florin vuole vedere riconciliazione SDI ogni lunedì mattina entro le 10:00", confidence: 0.93, hits_count: 20 },
  { persona_key: "cfo", memory_type: "decision",   content: "Budget annuale 2026: 1.8M€ fatturato, 280k€ utile operativo target", confidence: 0.98, hits_count: 13 },
  { persona_key: "cfo", memory_type: "fact",       content: "Cassa attesa fine trimestre Q1 2026: 145k€ disponibili", confidence: 0.85, hits_count: 4 },
  { persona_key: "cfo", memory_type: "pattern",    content: "Bianchi Srl chiede sempre sconto 5% extra sulle fatture sopra 20k€", confidence: 0.89, hits_count: 11 },
  { persona_key: "cfo", memory_type: "fact",       content: "Centro Direzionale Garibaldi: marginalità 22%, miglior cantiere 2025", confidence: 0.93, hits_count: 8 },
  { persona_key: "cfo", memory_type: "preference", content: "Florin chiede sempre breakdown costi per cantiere, non aggregato", confidence: 0.91, hits_count: 16 },
  { persona_key: "cfo", memory_type: "avoid",      content: "Mai accettare pagamenti in contanti oltre 1000€ — limite normativo", confidence: 1.0, hits_count: 5 },
  { persona_key: "cfo", memory_type: "decision",   content: "Riserva minima banca: 80k€ per coprire stipendi 2 mesi", confidence: 0.97, hits_count: 7 },

  // ═══ CONTABILE (12 memorie) ════════════════════════════════════════════
  { persona_key: "contabile", memory_type: "fact",       content: "Cementi Lombardi consegna sempre dopo le 10 con DDT cartaceo — registrare entro giornata", confidence: 0.95, hits_count: 14 },
  { persona_key: "contabile", memory_type: "fact",       content: "Edilcasa fattura sempre il 28 del mese, ricezione entro il 30", confidence: 0.92, hits_count: 9 },
  { persona_key: "contabile", memory_type: "preference", content: "Florin vuole vedere riconciliazione SDI ogni lunedì mattina", confidence: 0.9, hits_count: 17 },
  { persona_key: "contabile", memory_type: "decision",   content: "Tutte le fatture sotto i 500€ vanno in registro semplificato per ridurre carico contabile", confidence: 0.85, hits_count: 8 },
  { persona_key: "contabile", memory_type: "pattern",    content: "Le fatture Bianchi Srl arrivano sempre l'ultimo giorno utile per detrazione IVA", confidence: 0.87, hits_count: 13 },
  { persona_key: "contabile", memory_type: "pattern",    content: "Reverse charge applicato 70% delle fatture cantieri — verificare sempre regime IVA", confidence: 0.83, hits_count: 6 },
  { persona_key: "contabile", memory_type: "decision",   content: "Conservazione documenti SDI: 10 anni come da normativa, archivio sostitutivo attivo", confidence: 1.0, hits_count: 5 },
  { persona_key: "contabile", memory_type: "fact",       content: "Ferramenta Verdi fattura settimanale ogni venerdì — RIBA 30 gg fine mese", confidence: 0.9, hits_count: 11 },
  { persona_key: "contabile", memory_type: "avoid",      content: "Mai duplicare numerazione progressiva fatture — controllo SDI rigoroso", confidence: 1.0, hits_count: 3 },
  { persona_key: "contabile", memory_type: "fact",       content: "Codice tributo 1040 ritenute professionisti, scadenza 16 del mese successivo", confidence: 0.95, hits_count: 7 },
  { persona_key: "contabile", memory_type: "preference", content: "Florin preferisce report PDF inviato via email il primo del mese", confidence: 0.88, hits_count: 10 },
  { persona_key: "contabile", memory_type: "pattern",    content: "F24 mensile media 8500€ tra IVA, ritenute e contributi", confidence: 0.86, hits_count: 4 },

  // ═══ PM CANTIERE / OPERATIONS (22 memorie) ═════════════════════════════
  { persona_key: "pm_cantiere", memory_type: "fact",       content: "Il cantiere Bianchi Via Roma 12 va sempre in ritardo per problemi di accesso mezzi pesanti", confidence: 0.93, hits_count: 22 },
  { persona_key: "pm_cantiere", memory_type: "fact",       content: "Cantiere Via Milano 45 Verdi Edilizia: vincoli condominiali orari lavoro 8-18", confidence: 0.95, hits_count: 11 },
  { persona_key: "pm_cantiere", memory_type: "fact",       content: "Centro Direzionale Garibaldi: 18 mesi di lavori, terminus aprile 2027", confidence: 0.97, hits_count: 8 },
  { persona_key: "pm_cantiere", memory_type: "preference", content: "Florin preferisce ricevere report cantieri il venerdì sera, non lunedì mattina", confidence: 0.88, hits_count: 13 },
  { persona_key: "pm_cantiere", memory_type: "preference", content: "Foto cantiere ogni 3 giorni minimo — caricarle su drive aziendale entro sera", confidence: 0.92, hits_count: 19 },
  { persona_key: "pm_cantiere", memory_type: "decision",   content: "Tutti i cantieri sopra 50k€ richiedono sopralluogo settimanale obbligatorio del PM", confidence: 1.0, hits_count: 21 },
  { persona_key: "pm_cantiere", memory_type: "decision",   content: "Varianti in corso d'opera: sempre formalizzate per iscritto via email prima di iniziare", confidence: 1.0, hits_count: 14 },
  { persona_key: "pm_cantiere", memory_type: "pattern",    content: "I cantieri Bianchi Srl richiedono sempre 3-4 varianti in corso d'opera — preventivare buffer 15%", confidence: 0.91, hits_count: 17 },
  { persona_key: "pm_cantiere", memory_type: "pattern",    content: "Rossi Costruzioni mai richieste varianti, lavora con preventivo originale", confidence: 0.94, hits_count: 9 },
  { persona_key: "pm_cantiere", memory_type: "pattern",    content: "Cantieri Milano centro: tempi consegna materiali +30% per ZTL", confidence: 0.87, hits_count: 12 },
  { persona_key: "pm_cantiere", memory_type: "avoid",      content: "Non assegnare mai cantiere Bianchi Via Roma al capocantiere Rossi — conflitti pregressi del 2024", confidence: 0.95, hits_count: 6 },
  { persona_key: "pm_cantiere", memory_type: "avoid",      content: "Mai iniziare opere strutturali senza PSC firmato dal coordinatore sicurezza", confidence: 1.0, hits_count: 11 },
  { persona_key: "pm_cantiere", memory_type: "fact",       content: "Cementi Lombardi consegna sempre dopo le 10 — programmare scarichi di conseguenza", confidence: 0.9, hits_count: 23 },
  { persona_key: "pm_cantiere", memory_type: "fact",       content: "Squadra A (5 muratori): specializzata facciate, capocantiere Rossi", confidence: 0.92, hits_count: 7 },
  { persona_key: "pm_cantiere", memory_type: "fact",       content: "Squadra B (4 muratori): demolizioni e strutturale, capocantiere Bianchi", confidence: 0.92, hits_count: 7 },
  { persona_key: "pm_cantiere", memory_type: "decision",   content: "Materiale eccedente fine cantiere: ritorno fornitore se >100€ valore", confidence: 0.88, hits_count: 5 },
  { persona_key: "pm_cantiere", memory_type: "preference", content: "Florin vuole approval su tutti gli acquisti cantiere sopra 2000€", confidence: 0.93, hits_count: 16 },
  { persona_key: "pm_cantiere", memory_type: "fact",       content: "Milano Habitat: cliente nuovo 2026, primo cantiere su Via Garibaldi", confidence: 0.95, hits_count: 4 },
  { persona_key: "pm_cantiere", memory_type: "pattern",    content: "Cantieri estivi (giugno-agosto): produttività -25% per caldo, pianificare interni", confidence: 0.85, hits_count: 8 },
  { persona_key: "pm_cantiere", memory_type: "avoid",      content: "Mai promettere consegne luglio/agosto senza buffer 20% extra", confidence: 0.97, hits_count: 10 },
  { persona_key: "pm_cantiere", memory_type: "decision",   content: "DPI categoria 3 obbligatori per tutti i lavori in quota — controllo capocantiere quotidiano", confidence: 1.0, hits_count: 13 },
  { persona_key: "pm_cantiere", memory_type: "fact",       content: "Via Roma 12 Bianchi: penale 200€/settimana ritardo come da contratto", confidence: 0.95, hits_count: 9 },

  // ═══ COMMERCIALE / SALES (18 memorie) ══════════════════════════════════
  { persona_key: "commerciale", memory_type: "fact",       content: "Cliente Bianchi Srl preferisce trattare via WhatsApp invece che email", confidence: 0.88, hits_count: 31 },
  { persona_key: "commerciale", memory_type: "fact",       content: "Rossi Costruzioni: decisioni rapide, firma preventivo in 7 giorni", confidence: 0.93, hits_count: 12 },
  { persona_key: "commerciale", memory_type: "fact",       content: "Verdi Edilizia ha team commerciale di 3 persone, sempre bisogno 3 interlocutori", confidence: 0.87, hits_count: 8 },
  { persona_key: "commerciale", memory_type: "preference", content: "Florin vuole essere CC in tutti i preventivi sopra 30k€", confidence: 1.0, hits_count: 24 },
  { persona_key: "commerciale", memory_type: "preference", content: "Florin chiama personalmente clienti sopra 100k€ prima della firma", confidence: 0.91, hits_count: 9 },
  { persona_key: "commerciale", memory_type: "decision",   content: "Politica preventivi: validità 30 giorni standard, 60 giorni solo per clienti storici", confidence: 0.95, hits_count: 13 },
  { persona_key: "commerciale", memory_type: "decision",   content: "Sconto massimo concedibile senza approvazione: 5% solo per cantieri sopra 50k€", confidence: 0.97, hits_count: 16 },
  { persona_key: "commerciale", memory_type: "pattern",    content: "I clienti del settore ristrutturazioni edilizie firmano in media dopo 2-3 incontri", confidence: 0.86, hits_count: 18 },
  { persona_key: "commerciale", memory_type: "pattern",    content: "Geometri di Monza-Brianza: 40% dei lead, miglior canale referral", confidence: 0.88, hits_count: 10 },
  { persona_key: "commerciale", memory_type: "pattern",    content: "Lead da Instagram: tasso conversione 8%, lead da geometri: 35%", confidence: 0.84, hits_count: 6 },
  { persona_key: "commerciale", memory_type: "avoid",      content: "Non offrire mai sconti immediati a Bianchi Srl — preferiscono trattare a lungo", confidence: 0.9, hits_count: 11 },
  { persona_key: "commerciale", memory_type: "avoid",      content: "Mai accettare lavori con margine inferiore al 15% — politica aziendale", confidence: 1.0, hits_count: 14 },
  { persona_key: "commerciale", memory_type: "fact",       content: "Centro Direzionale Garibaldi: contratto vinto a 850k€, premio fine lavori 20k€", confidence: 0.97, hits_count: 7 },
  { persona_key: "commerciale", memory_type: "preference", content: "Florin preferisce firme con marca da bollo digitale via firma elettronica", confidence: 0.89, hits_count: 12 },
  { persona_key: "commerciale", memory_type: "fact",       content: "Bianchi Srl ha 4 cantieri storici 2023-2025, fatturato cumulato 320k€", confidence: 0.93, hits_count: 8 },
  { persona_key: "commerciale", memory_type: "decision",   content: "Lead non risposti dopo 48h: assegnare automaticamente al commerciale junior", confidence: 0.91, hits_count: 5 },
  { persona_key: "commerciale", memory_type: "pattern",    content: "Trimestre 4 (ott-dic): picco preventivi per inizio cantieri primavera", confidence: 0.87, hits_count: 9 },
  { persona_key: "commerciale", memory_type: "fact",       content: "Milano Habitat: primo contatto via referral geometra Bianchi (omonimia cliente)", confidence: 0.85, hits_count: 4 },

  // ═══ HR / PERSONALE (12 memorie) ═══════════════════════════════════════
  { persona_key: "hr", memory_type: "fact",       content: "Capocantiere Rossi ha turni preferenziali martedì-sabato, riposo domenica e lunedì", confidence: 0.92, hits_count: 15 },
  { persona_key: "hr", memory_type: "fact",       content: "Capocantiere Bianchi: contratto a tempo indeterminato dal 2022, RAL 38k€", confidence: 0.95, hits_count: 9 },
  { persona_key: "hr", memory_type: "preference", content: "Florin preferisce assumere a chiamata invece di contratti a termine fissi", confidence: 0.88, hits_count: 17 },
  { persona_key: "hr", memory_type: "preference", content: "Florin vuole colloquio finale personale per assunzioni sopra 35k€ RAL", confidence: 0.91, hits_count: 7 },
  { persona_key: "hr", memory_type: "decision",   content: "Tutti i nuovi assunti devono fare corso sicurezza D.Lgs 81/08 prima di entrare in cantiere", confidence: 1.0, hits_count: 12 },
  { persona_key: "hr", memory_type: "decision",   content: "Periodo prova standard: 30 giorni per muratori, 60 giorni per capocantieri", confidence: 0.97, hits_count: 6 },
  { persona_key: "hr", memory_type: "pattern",    content: "I muratori da Romania restano in media 8-12 mesi, poi tornano a casa per la stagione", confidence: 0.84, hits_count: 11 },
  { persona_key: "hr", memory_type: "pattern",    content: "Turnover annuale muratori: 35%, sopra media settore (28%)", confidence: 0.86, hits_count: 5 },
  { persona_key: "hr", memory_type: "avoid",      content: "Mai assumere senza visita medica obbligatoria preventiva", confidence: 1.0, hits_count: 8 },
  { persona_key: "hr", memory_type: "fact",       content: "Organico attuale: 12 persone (2 PM, 2 capocantieri, 8 muratori)", confidence: 0.98, hits_count: 14 },
  { persona_key: "hr", memory_type: "decision",   content: "Premio fine anno: 5% RAL se obiettivi raggiunti, valutazione individuale Florin", confidence: 0.93, hits_count: 4 },
  { persona_key: "hr", memory_type: "preference", content: "Florin preferisce comunicare ferie via WhatsApp gruppo aziendale", confidence: 0.85, hits_count: 8 },

  // ═══ ACQUISTI / PROCUREMENT (14 memorie) ═══════════════════════════════
  { persona_key: "acquisti", memory_type: "fact",       content: "Cementi Lombardi fa sempre lo sconto del 5% su ordini sopra 10 ton", confidence: 0.95, hits_count: 26 },
  { persona_key: "acquisti", memory_type: "fact",       content: "Edilcasa: sconto progressivo 3% a 15% in base al volume mensile", confidence: 0.93, hits_count: 13 },
  { persona_key: "acquisti", memory_type: "fact",       content: "Ferramenta Verdi: catalogo digitale, ordini via app entro le 18 per consegna 24h", confidence: 0.9, hits_count: 11 },
  { persona_key: "acquisti", memory_type: "preference", content: "Florin vuole vedere tutti gli ordini sopra 5k€ prima dell'invio al fornitore", confidence: 0.93, hits_count: 22 },
  { persona_key: "acquisti", memory_type: "preference", content: "Florin chiede sempre confronto 3 preventivi per acquisti sopra 10k€", confidence: 0.95, hits_count: 16 },
  { persona_key: "acquisti", memory_type: "decision",   content: "Fornitori principali: Cementi Lombardi per cemento, Edilcasa per laterizi, Ferramenta Verdi per minuteria", confidence: 1.0, hits_count: 32 },
  { persona_key: "acquisti", memory_type: "decision",   content: "Anticipo massimo fornitori: 30% solo con fideiussione bancaria assicurativa", confidence: 0.98, hits_count: 7 },
  { persona_key: "acquisti", memory_type: "decision",   content: "Stock minimo magazzino: cemento 2 ton, laterizi 500pz, ferramenta variabile", confidence: 0.92, hits_count: 9 },
  { persona_key: "acquisti", memory_type: "avoid",      content: "Non ordinare mai da Edilfast Srl — qualità scarsa e tempi consegna inaffidabili", confidence: 0.97, hits_count: 8 },
  { persona_key: "acquisti", memory_type: "avoid",      content: "Mai accettare consegne senza DDT firmato dal capocantiere ricevente", confidence: 1.0, hits_count: 5 },
  { persona_key: "acquisti", memory_type: "pattern",    content: "Cementi Lombardi aumenta prezzi sempre a gennaio +3% — anticipare ordini dicembre", confidence: 0.91, hits_count: 12 },
  { persona_key: "acquisti", memory_type: "pattern",    content: "Lead time medio fornitori cementi: 5-7 giorni, laterizi: 3-5 giorni", confidence: 0.88, hits_count: 10 },
  { persona_key: "acquisti", memory_type: "fact",       content: "Spesa media mensile materiali: 28k€ (cementi 50%, laterizi 30%, minuteria 20%)", confidence: 0.89, hits_count: 6 },
  { persona_key: "acquisti", memory_type: "fact",       content: "Sconto annuale Cementi Lombardi: 7k€ se volume sopra 130 ton", confidence: 0.93, hits_count: 4 },

  // ═══ MARKETING (12 memorie) ════════════════════════════════════════════
  { persona_key: "marketing", memory_type: "preference", content: "Florin preferisce contenuti social tecnici (timelapse cantieri) invece di lifestyle", confidence: 0.9, hits_count: 14 },
  { persona_key: "marketing", memory_type: "preference", content: "Florin vuole approvare ogni post Instagram prima della pubblicazione", confidence: 0.93, hits_count: 11 },
  { persona_key: "marketing", memory_type: "fact",       content: "Il target principale sono geometri di Milano e Monza-Brianza, età 35-55", confidence: 0.88, hits_count: 12 },
  { persona_key: "marketing", memory_type: "fact",       content: "Account Instagram: 2.4k follower, crescita 80 follower/mese organica", confidence: 0.92, hits_count: 6 },
  { persona_key: "marketing", memory_type: "fact",       content: "Best performer: post timelapse Centro Direzionale Garibaldi, 1200 like", confidence: 0.95, hits_count: 4 },
  { persona_key: "marketing", memory_type: "decision",   content: "Budget Meta Ads: massimo 800€/mese, 60% Instagram 40% Facebook", confidence: 0.95, hits_count: 9 },
  { persona_key: "marketing", memory_type: "decision",   content: "SEO: focus keyword \"ristrutturazioni edilizie Milano\" + zone limitrofe", confidence: 0.91, hits_count: 7 },
  { persona_key: "marketing", memory_type: "pattern",    content: "Le ricerche organiche per ristrutturazioni Milano crescono marzo-aprile e settembre", confidence: 0.82, hits_count: 8 },
  { persona_key: "marketing", memory_type: "pattern",    content: "Reel cantiere: engagement 5x post statici — privilegiare video", confidence: 0.87, hits_count: 5 },
  { persona_key: "marketing", memory_type: "avoid",      content: "Mai usare foto stock — solo materiale reale dei cantieri aziendali", confidence: 0.96, hits_count: 6 },
  { persona_key: "marketing", memory_type: "avoid",      content: "Non promettere mai prezzi specifici sui social — sempre \"contattaci per preventivo\"", confidence: 0.98, hits_count: 9 },
  { persona_key: "marketing", memory_type: "fact",       content: "Pixel Meta installato, conversione media 12€ per lead qualificato", confidence: 0.86, hits_count: 3 },

  // ═══ LEGAL / COMPLIANCE (8 memorie) ════════════════════════════════════
  { persona_key: "legal", memory_type: "fact",       content: "Contratto Bianchi Srl prevede clausola penale 2% per ogni settimana di ritardo cantiere", confidence: 0.95, hits_count: 11 },
  { persona_key: "legal", memory_type: "fact",       content: "Contratto Verdi Edilizia: foro competente Milano, mediazione obbligatoria", confidence: 0.93, hits_count: 5 },
  { persona_key: "legal", memory_type: "decision",   content: "Tutti i contratti sopra 20k€ richiedono fideiussione bancaria del 10% importo lavori", confidence: 1.0, hits_count: 16 },
  { persona_key: "legal", memory_type: "decision",   content: "Garanzia opere strutturali: 10 anni come da normativa, 2 anni per finiture", confidence: 1.0, hits_count: 7 },
  { persona_key: "legal", memory_type: "avoid",      content: "Non firmare mai contratti con clausola di risoluzione unilaterale senza preavviso", confidence: 1.0, hits_count: 12 },
  { persona_key: "legal", memory_type: "avoid",      content: "Mai accettare penali superiori al 10% del valore contrattuale", confidence: 0.97, hits_count: 8 },
  { persona_key: "legal", memory_type: "pattern",    content: "Contenziosi 2025: 2 casi aperti (Edilfast fornitore difettoso, ex dipendente)", confidence: 0.92, hits_count: 4 },
  { persona_key: "legal", memory_type: "preference", content: "Florin vuole vedere tutti i contratti sopra 50k€ con annotazioni prima della firma", confidence: 0.94, hits_count: 9 },

  // ═══ STRATEGY / CEO (10 memorie) ═══════════════════════════════════════
  { persona_key: "strategy", memory_type: "fact",       content: "Obiettivo 2026: aumentare fatturato del 20% concentrandosi su ristrutturazioni edilizie premium", confidence: 0.98, hits_count: 21 },
  { persona_key: "strategy", memory_type: "fact",       content: "Mercato Milano ristrutturazioni premium: 180M€ annui, quota nostra 0.4%", confidence: 0.86, hits_count: 5 },
  { persona_key: "strategy", memory_type: "preference", content: "Florin vuole brief strategici brevi (max 200 parole) con 3 azioni concrete", confidence: 0.93, hits_count: 26 },
  { persona_key: "strategy", memory_type: "preference", content: "Florin riserva venerdì pomeriggio per riflessioni strategiche, no riunioni operative", confidence: 0.89, hits_count: 12 },
  { persona_key: "strategy", memory_type: "decision",   content: "Non espandere in Lazio o Campania nel 2026 — focus solo Lombardia e Piemonte", confidence: 0.9, hits_count: 11 },
  { persona_key: "strategy", memory_type: "decision",   content: "Investimento 2026: 50k€ in marketing digital + 30k€ in software gestionali", confidence: 0.93, hits_count: 7 },
  { persona_key: "strategy", memory_type: "pattern",    content: "I migliori clienti vengono sempre da referral di geometri — investire in relazioni professionisti", confidence: 0.87, hits_count: 14 },
  { persona_key: "strategy", memory_type: "pattern",    content: "Cantieri sopra 100k€: 60% del fatturato ma 30% del numero — fascia premium prioritaria", confidence: 0.89, hits_count: 9 },
  { persona_key: "strategy", memory_type: "avoid",      content: "Mai prendere cantieri sotto i 20k€ — margine non sostenibile vs overhead", confidence: 0.95, hits_count: 13 },
  { persona_key: "strategy", memory_type: "fact",       content: "Visione 5 anni: 5M€ fatturato, 30 dipendenti, leader Lombardia ristrutturazioni premium", confidence: 0.96, hits_count: 6 },

  // ═══ SUPPORT / ASSISTENZA (8 memorie) ══════════════════════════════════
  { persona_key: "support", memory_type: "fact",       content: "Bianchi Srl chiama sempre il lunedì mattina per segnalare problemi del weekend", confidence: 0.85, hits_count: 16 },
  { persona_key: "support", memory_type: "fact",       content: "Verdi Edilizia preferisce comunicazione asincrona via email, mai chiamate", confidence: 0.88, hits_count: 7 },
  { persona_key: "support", memory_type: "decision",   content: "Tickets cantiere bloccato hanno priorità massima — risposta entro 1h durante orari lavoro", confidence: 1.0, hits_count: 14 },
  { persona_key: "support", memory_type: "decision",   content: "Tickets garanzia post-consegna: gestione separata, SLA 48h risposta", confidence: 0.95, hits_count: 6 },
  { persona_key: "support", memory_type: "pattern",    content: "Il 60% dei ticket sono richieste varianti, non veri problemi tecnici", confidence: 0.83, hits_count: 10 },
  { persona_key: "support", memory_type: "pattern",    content: "Picco ticket lunedì mattina (28%) e venerdì pomeriggio (22%)", confidence: 0.86, hits_count: 5 },
  { persona_key: "support", memory_type: "avoid",      content: "Mai chiudere ticket senza conferma scritta del cliente", confidence: 0.97, hits_count: 8 },
  { persona_key: "support", memory_type: "preference", content: "Florin vuole alert immediato su ticket aperti da Bianchi Srl o clienti VIP", confidence: 0.92, hits_count: 11 },

  // ═══ TECH / IT (6 memorie) ═════════════════════════════════════════════
  { persona_key: "tech", memory_type: "preference", content: "Florin preferisce automazioni invisibili che funzionano in background, no UI complesse", confidence: 0.92, hits_count: 9 },
  { persona_key: "tech", memory_type: "decision",   content: "Tutte le foto cantieri vanno salvate automaticamente su drive aziendale, mai locale su telefono", confidence: 0.95, hits_count: 12 },
  { persona_key: "tech", memory_type: "decision",   content: "Backup giornaliero database, retention 90 giorni su cloud Lombardia", confidence: 0.98, hits_count: 4 },
  { persona_key: "tech", memory_type: "fact",       content: "Software gestionale: Edilizia in Cloud, integrato con SDI Aruba", confidence: 0.96, hits_count: 8 },
  { persona_key: "tech", memory_type: "avoid",      content: "Mai installare software cracked sui device aziendali — politica GDPR", confidence: 1.0, hits_count: 3 },
  { persona_key: "tech", memory_type: "pattern",    content: "Capocantieri usano app cantiere 3x più dei muratori — privilegiare UX semplice", confidence: 0.84, hits_count: 6 },

  // ═══ SICUREZZA / RSPP (8 memorie) ══════════════════════════════════════
  { persona_key: "rspp", memory_type: "fact",       content: "DVR aggiornato a gennaio 2026 — prossima revisione gennaio 2027", confidence: 1.0, hits_count: 6 },
  { persona_key: "rspp", memory_type: "fact",       content: "Corso sicurezza muratori scadenza: marzo 2026 (5 persone), maggio 2026 (3 persone)", confidence: 0.97, hits_count: 8 },
  { persona_key: "rspp", memory_type: "decision",   content: "Tutti i cantieri Bianchi richiedono PSC aggiornato per ogni variante", confidence: 0.95, hits_count: 9 },
  { persona_key: "rspp", memory_type: "decision",   content: "Sopralluogo sicurezza obbligatorio prima dell'apertura di ogni cantiere", confidence: 1.0, hits_count: 11 },
  { persona_key: "rspp", memory_type: "avoid",      content: "Mai consentire lavori in quota senza DPI categoria 3 — anche se è solo per 5 minuti", confidence: 1.0, hits_count: 14 },
  { persona_key: "rspp", memory_type: "avoid",      content: "Mai accettare deroghe sulle distanze di sicurezza linee elettriche", confidence: 1.0, hits_count: 5 },
  { persona_key: "rspp", memory_type: "pattern",    content: "Near-miss reportati 2025: 4 casi, tutti legati a movimentazione materiali", confidence: 0.91, hits_count: 4 },
  { persona_key: "rspp", memory_type: "preference", content: "Florin vuole report sicurezza trimestrale con near-miss e azioni correttive", confidence: 0.93, hits_count: 7 },
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
