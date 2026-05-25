/**
 * Sistema di Matching Ruoli V5 - Assessment Psicometrico
 *
 * Matching per mansioni basato sui 15 tratti V5:
 * - Responsabile Amministrativo
 * - Venditore/Commerciale
 * - Customer Care
 * - Direttore Generale
 * - HR Manager
 * - Marketing Manager
 * - Responsabile Tecnico
 * - Buyer/Acquisti
 * - Responsabile Produzione/Logistica
 * - Direttore Commerciale
 * - HR Recruiter
 * - Impiegato Amministrativo
 * - Project Manager
 * - Assistente di Direzione
 * - Imprenditore/Titolare
 * - Consulente Strategico
 * - Team Leader/Coordinatore
 * - Formatore/Coach
 * - Responsabile Qualità/Compliance
 * - Controller di Gestione
 * - Data Analyst
 * - Account Manager
 * - Office Manager
 * - Responsabile IT/Sistemi
 *
 * Include disqualifier e soglie tratti dal Manuale V5
 */

import { TraitCode } from '../types';
import {
  getActiveSyndromes,
  hasCriticalSyndromes,
  TraitScores,
  SyndromeResult
} from './syndromes';

// ============================================
// TIPI
// ============================================

export type FitVerdictV5 = 'NON_IDONEO' | 'DA_VALUTARE' | 'IDONEO_CON_RISERVA' | 'IDONEO';

export interface TraitRequirement {
  trait: TraitCode;
  soglia: number;
  tipo: 'min' | 'max' | 'range';
  rangeMax?: number;
  isCritical: boolean;
  label: string;
}

export interface RoleDisqualifier {
  condition: (traits: TraitScores, syndromes: SyndromeResult[]) => boolean;
  reason: string;
  severity: 'blocking' | 'warning';
}

export interface RoleProfileV5 {
  id: string;
  nome: string;
  categoria: 'direzione' | 'commerciale' | 'amministrativo' | 'tecnico' | 'operativo';
  descrizione: string;
  requisiti: TraitRequirement[];
  disqualifiers: RoleDisqualifier[];
  profiloIdeale: string;
  trattiFondamentali: TraitCode[];
  domandeColloquio: string[];
  /** true = soglie validate dal Manuale V2.0, false = soglie definite internamente */
  validatoManualeV2: boolean;
}

export interface RoleMatchResultV5 {
  ruolo: string;
  categoria: string;
  compatibilitaPct: number;
  requisitiSoddisfatti: { trait: TraitCode; label: string; valore: number; soglia: number }[];
  requisitiMancanti: { trait: TraitCode; label: string; valore: number; soglia: number; gap: number }[];
  disqualifiersAttivi: { reason: string; severity: 'blocking' | 'warning' }[];
  syndromiRilevanti: SyndromeResult[];
  verdict: FitVerdictV5;
  motivazione: string;
  domandeColloquio: string[];
}

export interface AllRolesCompatibilityV5 {
  ruoloRichiesto: RoleMatchResultV5;
  tuttiRuoli: { ruolo: string; compatibilita: number; verdict: FitVerdictV5 }[];
  ruoloIdeale: { ruolo: string; compatibilita: number } | null;
}

// ============================================
// PROFILI RUOLI V5
// ============================================

export const ROLE_PROFILES_V5: Record<string, RoleProfileV5> = {
  'Responsabile Amministrativo': {
    id: 'resp_amm',
    nome: 'Responsabile Amministrativo',
    categoria: 'amministrativo',
    descrizione: 'Gestione contabilità, bilancio, fiscalità e procedure amministrative',
    // Soglie allineate al Manuale V2: ORG>40, AUT≥-15, GP≥21, ADS>39, PRO>19, COM≥-15, RC>-19, PRI>39
    requisiti: [
      { trait: 'ORG', soglia: 40, tipo: 'min', isCritical: true, label: 'Organizzazione > 40' },
      { trait: 'AUT', soglia: -15, tipo: 'min', isCritical: false, label: 'Automotivazione ≥ -15' },
      { trait: 'GP', soglia: 21, tipo: 'min', isCritical: true, label: 'Gestione Pressioni ≥ 21' },
      { trait: 'ADS', soglia: 39, tipo: 'min', isCritical: true, label: 'Autodisciplina > 39' },
      { trait: 'PRO', soglia: 19, tipo: 'min', isCritical: false, label: 'Proattività > 19' },
      { trait: 'COM', soglia: -15, tipo: 'min', isCritical: false, label: 'Comprensione ≥ -15' },
      { trait: 'RC', soglia: -19, tipo: 'min', isCritical: true, label: 'RC > -19' },
      { trait: 'PRI', soglia: 39, tipo: 'min', isCritical: true, label: 'Principi > 39' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.ORG < 20,
        reason: 'Organizzazione troppo bassa per ruolo amministrativo',
        severity: 'blocking'
      },
      {
        condition: (t) => t.GP < 21,
        reason: 'PSP: non regge la pressione lavorativa',
        severity: 'blocking'
      },
      {
        condition: (t) => t.VEN > 60,
        reason: 'Troppo orientato alla vendita, soffrirà in ruolo back-office',
        severity: 'warning'
      },
      {
        condition: (_, s) => s.some(syn => ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S14'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome critica o problematica per ruolo amministrativo',
        severity: 'blocking'
      },
      {
        condition: (t, s) => s.some(syn => syn.code === 'S08' && syn.isActive) && t.COM <= 10,
        reason: 'S08 (Ghost) con comprensione bassa: prestazioni inferiori al grafico',
        severity: 'blocking'
      },
      {
        condition: (t) => t.COM < -38,
        reason: 'Comprensione troppo bassa per gestire relazioni interne',
        severity: 'blocking'
      },
    ],
    profiloIdeale: 'Persona metodica, precisa, affidabile. Ama le procedure e i numeri.',
    trattiFondamentali: ['ORG', 'ADS', 'PRI', 'GP'],
    domandeColloquio: [
      'Come organizza la gestione delle scadenze fiscali?',
      'Racconti di un errore contabile grave e come lo ha risolto.',
      'Come gestisce le priorità quando tutto sembra urgente?',
    ],
    validatoManualeV2: true,
  },

  'Venditore/Commerciale': {
    id: 'venditore',
    nome: 'Venditore/Commerciale',
    categoria: 'commerciale',
    descrizione: 'Sviluppo clienti, negoziazione, raggiungimento obiettivi di fatturato',
    // Soglie allineate al Manuale V2: AUT≥20, VEN≥30, ESP≥15, GP≥21, DET≥30, PRO≥10, COM≥0
    requisiti: [
      { trait: 'VEN', soglia: 30, tipo: 'min', isCritical: true, label: 'Attitudine Vendita ≥ 30' },
      { trait: 'DET', soglia: 30, tipo: 'min', isCritical: true, label: 'Determinazione ≥ 30' },
      { trait: 'GP', soglia: 21, tipo: 'min', isCritical: true, label: 'Gestione Pressioni ≥ 21' },
      { trait: 'AUT', soglia: 20, tipo: 'min', isCritical: false, label: 'Automotivazione ≥ 20' },
      { trait: 'ESP', soglia: 15, tipo: 'min', isCritical: false, label: 'Espansività ≥ 15' },
      { trait: 'PRO', soglia: 10, tipo: 'min', isCritical: false, label: 'Proattività ≥ 10' },
      { trait: 'COM', soglia: 0, tipo: 'min', isCritical: false, label: 'Comprensione ≥ 0' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.VEN < 20,
        reason: 'Attitudine vendita insufficiente',
        severity: 'blocking'
      },
      {
        condition: (t) => t.DET < 15,
        reason: 'Determinazione troppo bassa per gestire rifiuti e negoziazioni',
        severity: 'blocking'
      },
      {
        condition: (t) => t.GP < 21,
        reason: 'PSP: non regge la pressione commerciale',
        severity: 'blocking'
      },
      {
        condition: (_, s) => s.some(syn => ['S01', 'S02', 'S03', 'S04', 'S05', 'S08', 'S12'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome critica o problematica per ruolo commerciale',
        severity: 'blocking'
      },
      {
        condition: (_, s) => s.some(syn => syn.code === 'S17' && syn.isActive),
        reason: 'GP più alto: evita la chiusura, non affronta il cliente',
        severity: 'warning'
      },
      {
        condition: (t) => t.AUT > 60 && t.VEN < 20,
        reason: 'Alto AUT + Basso VEN: motivato ma non per vendere',
        severity: 'warning'
      },
    ],
    profiloIdeale: 'Cacciatore naturale. Ama la sfida, la conquista, il riconoscimento economico.',
    trattiFondamentali: ['VEN', 'DET', 'GP', 'ESP'],
    domandeColloquio: [
      'Quanto vuole guadagnare tra 3 anni? Cosa farà con quei soldi?',
      'Racconti della vendita più difficile che ha chiuso.',
      'Come reagisce quando un cliente le dice no per la quinta volta?',
      'Qual è il suo record di fatturato? Come lo ha raggiunto?',
    ],
    validatoManualeV2: true,
  },

  'Customer Care': {
    id: 'customer_care',
    nome: 'Customer Care',
    categoria: 'commerciale',
    descrizione: 'Gestione clienti, risoluzione problemi, fidelizzazione',
    // Soglie allineate al Manuale V2: PRO≥20, COM≥10, ESP≥10, GP≥21, ADS≥25
    requisiti: [
      { trait: 'PRO', soglia: 20, tipo: 'min', isCritical: true, label: 'Proattività ≥ 20' },
      { trait: 'COM', soglia: 10, tipo: 'min', isCritical: true, label: 'Comprensione ≥ 10' },
      { trait: 'GP', soglia: 21, tipo: 'min', isCritical: true, label: 'Gestione Pressioni ≥ 21' },
      { trait: 'ESP', soglia: 10, tipo: 'min', isCritical: false, label: 'Espansività ≥ 10' },
      { trait: 'ADS', soglia: 25, tipo: 'min', isCritical: false, label: 'Autodisciplina ≥ 25' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.COM < 0,
        reason: 'Comprensione negativa: non capirà le esigenze del cliente',
        severity: 'blocking'
      },
      {
        condition: (t) => t.PRO < 0,
        reason: 'Proattività negativa: non anticipa le esigenze del cliente',
        severity: 'blocking'
      },
      {
        condition: (t) => t.GP < 21,
        reason: 'PSP: non regge la pressione dei clienti difficili',
        severity: 'blocking'
      },
      {
        condition: (_, s) => s.some(syn => ['S01', 'S02', 'S03', 'S04', 'S06', 'S16'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome demotivante o problematica per ruolo customer care',
        severity: 'blocking'
      },
    ],
    profiloIdeale: 'Empatico, paziente, orientato alla soluzione. Ama aiutare le persone.',
    trattiFondamentali: ['PRO', 'COM', 'GP', 'ESP'],
    domandeColloquio: [
      'Racconti di un cliente molto arrabbiato e come lo ha gestito.',
      'Come fa a mantenere la calma dopo la decima telefonata difficile?',
      'Cosa fa quando il cliente ha ragione e l\'azienda ha torto?',
    ],
    validatoManualeV2: true,
  },

  'Direttore Generale': {
    id: 'dg',
    nome: 'Direttore Generale',
    categoria: 'direzione',
    descrizione: 'Responsabilità strategica, gestione risorse, risultati aziendali',
    requisiti: [
      { trait: 'LDR', soglia: 55, tipo: 'min', isCritical: true, label: 'Leadership ≥ 55' },
      { trait: 'AUT', soglia: 50, tipo: 'min', isCritical: true, label: 'Automotivazione ≥ 50' },
      { trait: 'DET', soglia: 50, tipo: 'min', isCritical: true, label: 'Determinazione ≥ 50' },
      { trait: 'GP', soglia: 40, tipo: 'min', isCritical: true, label: 'Gestione Pressioni ≥ 40' },
      { trait: 'HRM', soglia: 40, tipo: 'min', isCritical: false, label: 'HR Management ≥ 40' },
      { trait: 'SUC', soglia: 60, tipo: 'min', isCritical: false, label: 'Orientamento Successo ≥ 60' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.LDR < 40,
        reason: 'Leadership insufficiente per ruolo direttivo',
        severity: 'blocking'
      },
      {
        condition: (t) => t.HRM < 20,
        reason: 'Incapace di gestire le persone',
        severity: 'blocking'
      },
      {
        condition: (_, s) => s.some(syn => ['S01', 'S02', 'S03', 'S04'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome critica: porterebbe l\'azienda al fallimento',
        severity: 'blocking'
      },
      {
        condition: (t) => t.RC > 60,
        reason: 'Troppo rigido per guidare il cambiamento',
        severity: 'warning'
      },
    ],
    profiloIdeale: 'Leader visionario con capacità decisionale, resilienza e carisma.',
    trattiFondamentali: ['LDR', 'AUT', 'DET', 'HRM'],
    domandeColloquio: [
      'Racconti della decisione più difficile che ha dovuto prendere.',
      'Come ha gestito un collaboratore che non performava?',
      'Qual è stata la sua più grande vittoria aziendale?',
      'Come gestisce la pressione degli stakeholder?',
    ],
    validatoManualeV2: false,
  },

  'HR Manager': {
    id: 'hr_manager',
    nome: 'HR Manager',
    categoria: 'direzione',
    descrizione: 'Gestione risorse umane, sviluppo talenti, clima aziendale',
    requisiti: [
      { trait: 'HRM', soglia: 50, tipo: 'min', isCritical: true, label: 'HR Management ≥ 50' },
      { trait: 'COM', soglia: 45, tipo: 'min', isCritical: true, label: 'Comprensione ≥ 45' },
      { trait: 'PRO', soglia: 35, tipo: 'min', isCritical: true, label: 'Proattività ≥ 35' },
      { trait: 'LDR', soglia: 35, tipo: 'min', isCritical: false, label: 'Leadership ≥ 35' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.HRM < 30,
        reason: 'Capacità HR insufficienti',
        severity: 'blocking'
      },
      {
        condition: (t) => t.COM < 25,
        reason: 'Troppo poco empatico per gestire le persone',
        severity: 'blocking'
      },
      {
        condition: (_, s) => s.some(syn => ['S01', 'S04', 'S05'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome demotivante: danneggerà il clima aziendale',
        severity: 'blocking'
      },
    ],
    profiloIdeale: 'Custode delle persone. Bilancia esigenze aziendali e benessere dipendenti.',
    trattiFondamentali: ['HRM', 'COM', 'PRO', 'LDR'],
    domandeColloquio: [
      'Come ha gestito un conflitto grave tra colleghi?',
      'Racconti di un talento che ha sviluppato e fatto crescere.',
      'Come affronta le decisioni impopolari (licenziamenti, tagli)?',
    ],
    validatoManualeV2: false,
  },

  'Marketing Manager': {
    id: 'marketing_mgr',
    nome: 'Marketing Manager',
    categoria: 'commerciale',
    descrizione: 'Strategia marketing, brand, comunicazione, analisi mercato',
    // Soglie allineate al Manuale V2.0: ORG>=30, AUT>=25, VEN>=25, ESP>=15
    requisiti: [
      { trait: 'ORG', soglia: 30, tipo: 'min', isCritical: true, label: 'Organizzazione ≥ 30' },
      { trait: 'AUT', soglia: 25, tipo: 'min', isCritical: true, label: 'Automotivazione ≥ 25' },
      { trait: 'VEN', soglia: 25, tipo: 'min', isCritical: false, label: 'Attitudine Vendita ≥ 25' },
      { trait: 'ESP', soglia: 15, tipo: 'min', isCritical: false, label: 'Espansività ≥ 15' },
    ],
    disqualifiers: [
      {
        condition: (_, s) => s.some(syn => ['S01', 'S02', 'S03', 'S04', 'S06', 'S15'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome critica o problematica per ruolo marketing',
        severity: 'blocking'
      },
      {
        condition: (t) => t.RC > 55,
        reason: 'Troppo rigido per ruolo creativo',
        severity: 'warning'
      },
    ],
    profiloIdeale: 'Creativo strategico con visione, capacità di execution e orientamento ai risultati.',
    trattiFondamentali: ['ESP', 'AUT', 'PRO'],
    domandeColloquio: [
      'Racconti della campagna di cui va più fiero.',
      'Come misura il successo delle sue attività marketing?',
      'Come gestisce stakeholder che vogliono cambiare tutto?',
    ],
    validatoManualeV2: true,
  },

  'Responsabile Tecnico': {
    id: 'resp_tecnico',
    nome: 'Responsabile Tecnico',
    categoria: 'tecnico',
    descrizione: 'Gestione tecnica, progettazione, problem solving specialistico',
    requisiti: [
      { trait: 'ORG', soglia: 40, tipo: 'min', isCritical: true, label: 'Organizzazione ≥ 40' },
      { trait: 'ADS', soglia: 45, tipo: 'min', isCritical: true, label: 'Autodisciplina ≥ 45' },
      { trait: 'DET', soglia: 35, tipo: 'min', isCritical: false, label: 'Determinazione ≥ 35' },
      { trait: 'RC', soglia: 50, tipo: 'max', isCritical: false, label: 'RC ≤ 50 (aperto a nuove soluzioni)' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.ADS < 30,
        reason: 'Autodisciplina insufficiente per ruolo tecnico',
        severity: 'blocking'
      },
      {
        condition: (t) => t.ORG < 25,
        reason: 'Disorganizzato: non può gestire progetti tecnici complessi',
        severity: 'blocking'
      },
    ],
    profiloIdeale: 'Risolutore di problemi. Trova soddisfazione nel far funzionare le cose.',
    trattiFondamentali: ['ORG', 'ADS', 'DET'],
    domandeColloquio: [
      'Racconti del problema tecnico più complesso che ha risolto.',
      'Come gestisce le deadline tecniche aggressive?',
      'Come si tiene aggiornato sulle nuove tecnologie?',
    ],
    validatoManualeV2: false,
  },

  'Buyer/Acquisti': {
    id: 'buyer',
    nome: 'Buyer/Acquisti',
    categoria: 'amministrativo',
    descrizione: 'Gestione fornitori, negoziazione, ottimizzazione costi',
    requisiti: [
      { trait: 'DET', soglia: 45, tipo: 'min', isCritical: true, label: 'Determinazione ≥ 45' },
      { trait: 'ORG', soglia: 40, tipo: 'min', isCritical: true, label: 'Organizzazione ≥ 40' },
      { trait: 'FIN', soglia: 35, tipo: 'min', isCritical: true, label: 'Orientamento Finanze ≥ 35' },
      { trait: 'VEN', soglia: 30, tipo: 'min', isCritical: false, label: 'Attitudine Negoziale ≥ 30' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.DET < 25,
        reason: 'Determinazione insufficiente per negoziare con fornitori',
        severity: 'blocking'
      },
      {
        condition: (t) => t.FIN < 15,
        reason: 'Nessun orientamento al risparmio/valore',
        severity: 'blocking'
      },
    ],
    profiloIdeale: 'Guardiano del valore. Ottimizza costi, negozia duramente, garantisce qualità.',
    trattiFondamentali: ['DET', 'ORG', 'FIN', 'VEN'],
    domandeColloquio: [
      'Racconti della negoziazione più dura che ha condotto.',
      'Come bilancia qualità e risparmio?',
      'Come gestisce un fornitore storico che alza i prezzi?',
    ],
    validatoManualeV2: false,
  },

  'Responsabile Produzione/Logistica': {
    id: 'resp_prod_log',
    nome: 'Responsabile Produzione/Logistica',
    categoria: 'operativo',
    descrizione: 'Gestione flussi produttivi, logistica, efficienza operativa',
    // Soglie allineate al Manuale V2.0: ORG>44, GP>=21, ADS>44, DET>=30, PRO>=10, COM>=-10, RC>-19, PRI>=39
    requisiti: [
      { trait: 'ORG', soglia: 44, tipo: 'min', isCritical: true, label: 'Organizzazione > 44' },
      { trait: 'GP', soglia: 21, tipo: 'min', isCritical: true, label: 'Gestione Pressioni ≥ 21' },
      { trait: 'ADS', soglia: 44, tipo: 'min', isCritical: true, label: 'Autodisciplina > 44' },
      { trait: 'DET', soglia: 30, tipo: 'min', isCritical: false, label: 'Determinazione ≥ 30' },
      { trait: 'PRO', soglia: 10, tipo: 'min', isCritical: false, label: 'Proattività ≥ 10' },
      { trait: 'COM', soglia: -10, tipo: 'min', isCritical: false, label: 'Comprensione ≥ -10' },
      { trait: 'RC', soglia: -19, tipo: 'min', isCritical: true, label: 'RC > -19' },
      { trait: 'PRI', soglia: 39, tipo: 'min', isCritical: false, label: 'Principi ≥ 39' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.ORG < 35,
        reason: 'Organizzazione insufficiente per gestire flussi complessi',
        severity: 'blocking'
      },
      {
        condition: (t) => t.GP < 21,
        reason: 'PSP: non regge la pressione operativa',
        severity: 'blocking'
      },
      {
        condition: (t) => t.RC <= -19,
        reason: 'RC troppo bassa: dispersivo nella gestione operativa',
        severity: 'blocking'
      },
      {
        condition: (_, s) => s.some(syn => ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S08'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome critica o problematica per ruolo produttivo',
        severity: 'blocking'
      },
    ],
    profiloIdeale: 'Orchestratore dei flussi. Tiene tutto insieme, prevede problemi, risolve in tempo reale.',
    trattiFondamentali: ['ORG', 'ADS', 'GP', 'LDR'],
    domandeColloquio: [
      'Come gestisce un imprevisto che blocca la produzione?',
      'Racconti di come ha migliorato l\'efficienza di un processo.',
      'Come motiva un team operativo sotto pressione?',
    ],
    validatoManualeV2: true,
  },

  // ============================================
  // NUOVI RUOLI V5 (dal Manuale Completo)
  // ============================================

  'Direttore Commerciale': {
    id: 'dir_comm',
    nome: 'Direttore Commerciale',
    categoria: 'direzione',
    descrizione: 'Strategia vendite, gestione rete commerciale, obiettivi fatturato',
    requisiti: [
      { trait: 'LDR', soglia: 50, tipo: 'min', isCritical: true, label: 'Leadership ≥ 50' },
      { trait: 'VEN', soglia: 45, tipo: 'min', isCritical: true, label: 'Attitudine Vendita ≥ 45' },
      { trait: 'DET', soglia: 50, tipo: 'min', isCritical: true, label: 'Determinazione ≥ 50' },
      { trait: 'HRM', soglia: 35, tipo: 'min', isCritical: true, label: 'HR Management ≥ 35' },
      { trait: 'AUT', soglia: 45, tipo: 'min', isCritical: false, label: 'Automotivazione ≥ 45' },
      { trait: 'FIN', soglia: 40, tipo: 'min', isCritical: false, label: 'Orientamento Finanze ≥ 40' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.LDR < 35,
        reason: 'Leadership insufficiente per dirigere team commerciale',
        severity: 'blocking'
      },
      {
        condition: (t) => t.VEN < 30,
        reason: 'Senza esperienza vendita non può guidare venditori',
        severity: 'blocking'
      },
      {
        condition: (t) => t.HRM < 20,
        reason: 'Incapace di gestire e motivare la rete vendita',
        severity: 'blocking'
      },
      {
        condition: (_, s) => s.some(syn => ['S01', 'S02', 'S03', 'S04'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome critica: danneggerà l\'intera rete commerciale',
        severity: 'blocking'
      },
    ],
    profiloIdeale: 'Leader commerciale. Vende, ma soprattutto fa vendere gli altri. Visione strategica + execution.',
    trattiFondamentali: ['LDR', 'VEN', 'DET', 'HRM'],
    domandeColloquio: [
      'Come costruisce e motiva una rete vendita?',
      'Racconti del suo miglior anno commerciale: come lo ha ottenuto?',
      'Come gestisce un venditore che non performa?',
      'Qual è la sua strategia per entrare in un nuovo mercato?',
    ],
    validatoManualeV2: false,
  },

  'Imprenditore/Titolare': {
    id: 'imprenditore',
    nome: 'Imprenditore/Titolare',
    categoria: 'direzione',
    descrizione: 'Visione strategica, assunzione rischio, costruzione team, decisionalità a 360°',
    requisiti: [
      { trait: 'LDR', soglia: 45, tipo: 'min', isCritical: true, label: 'Leadership ≥ 45' },
      { trait: 'PRO', soglia: 40, tipo: 'min', isCritical: true, label: 'Proattività ≥ 40' },
      { trait: 'GP', soglia: 40, tipo: 'min', isCritical: true, label: 'Gestione Pressioni ≥ 40' },
      { trait: 'AUT', soglia: 40, tipo: 'min', isCritical: true, label: 'Automotivazione ≥ 40' },
      { trait: 'DET', soglia: 35, tipo: 'min', isCritical: false, label: 'Determinazione ≥ 35' },
      { trait: 'VEN', soglia: 20, tipo: 'min', isCritical: false, label: 'Attitudine Vendita ≥ 20' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.LDR < 30,
        reason: 'Leadership insufficiente per ruolo imprenditoriale',
        severity: 'blocking'
      },
      {
        condition: (t) => t.GP < 25,
        reason: 'Non regge la pressione imprenditoriale',
        severity: 'blocking'
      },
      {
        condition: (t) => t.PRO < 20,
        reason: 'Troppo passivo per guidare un\'impresa',
        severity: 'blocking'
      },
      {
        condition: (_, s) => s.some(syn => ['S01', 'S02', 'S03', 'S04'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome critica: rischio elevato per ruolo imprenditoriale',
        severity: 'blocking'
      },
    ],
    profiloIdeale: 'Visionario pragmatico. Decide, rischia, costruisce, ispira. Alto su tutti gli assi.',
    trattiFondamentali: ['LDR', 'PRO', 'GP', 'AUT', 'DET'],
    domandeColloquio: [
      'Qual è la decisione più rischiosa che ha preso e come è andata?',
      'Come costruisce e motiva il suo team?',
      'Racconti di un fallimento e cosa ha imparato.',
      'Come bilancia visione a lungo termine e operatività quotidiana?',
    ],
    validatoManualeV2: false,
  },

  'Consulente Strategico': {
    id: 'consulente_strat',
    nome: 'Consulente Strategico',
    categoria: 'tecnico',
    descrizione: 'Analisi strategica, consulenza direzionale, problem solving ad alto livello',
    requisiti: [
      { trait: 'ORG', soglia: 45, tipo: 'min', isCritical: true, label: 'Organizzazione ≥ 45' },
      { trait: 'AUT', soglia: 40, tipo: 'min', isCritical: true, label: 'Automotivazione ≥ 40' },
      { trait: 'PRO', soglia: 35, tipo: 'min', isCritical: true, label: 'Proattività ≥ 35' },
      { trait: 'COM', soglia: 30, tipo: 'min', isCritical: false, label: 'Comprensione ≥ 30' },
      { trait: 'GP', soglia: 30, tipo: 'min', isCritical: false, label: 'Gestione Pressioni ≥ 30' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.ORG < 30,
        reason: 'Organizzazione insufficiente per analisi complesse',
        severity: 'blocking'
      },
      {
        condition: (t) => t.AUT < 25,
        reason: 'Automotivazione insufficiente per lavoro autonomo',
        severity: 'blocking'
      },
      {
        condition: (_, s) => s.some(syn => ['S01', 'S02', 'S03', 'S04'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome critica: non può fornire consulenza affidabile',
        severity: 'blocking'
      },
      {
        condition: (t) => t.RC > 60,
        reason: 'Troppo rigido per proporre soluzioni innovative',
        severity: 'warning'
      },
    ],
    profiloIdeale: 'Pensatore analitico autonomo. Vede pattern, propone soluzioni, comunica con chiarezza.',
    trattiFondamentali: ['ORG', 'AUT', 'PRO', 'COM'],
    domandeColloquio: [
      'Racconti di un problema complesso che ha risolto con un approccio innovativo.',
      'Come presenta raccomandazioni scomode al cliente?',
      'Come gestisce l\'autonomia e l\'organizzazione del suo lavoro?',
      'Qual è il suo approccio metodologico nell\'analisi strategica?',
    ],
    validatoManualeV2: false,
  },

  'Team Leader/Coordinatore': {
    id: 'team_leader',
    nome: 'Team Leader/Coordinatore',
    categoria: 'direzione',
    descrizione: 'Leadership intermedia, coordinamento team, gestione persone senza ruolo dirigenziale',
    requisiti: [
      { trait: 'LDR', soglia: 35, tipo: 'min', isCritical: true, label: 'Leadership ≥ 35' },
      { trait: 'COM', soglia: 25, tipo: 'min', isCritical: true, label: 'Comprensione ≥ 25' },
      { trait: 'HRM', soglia: 30, tipo: 'min', isCritical: true, label: 'HR Management ≥ 30' },
      { trait: 'PRO', soglia: 30, tipo: 'min', isCritical: false, label: 'Proattività ≥ 30' },
      { trait: 'GP', soglia: 30, tipo: 'min', isCritical: false, label: 'Gestione Pressioni ≥ 30' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.LDR < 20,
        reason: 'Leadership insufficiente per coordinare un team',
        severity: 'blocking'
      },
      {
        condition: (t) => t.HRM < 15,
        reason: 'Incapace di gestire le dinamiche di gruppo',
        severity: 'blocking'
      },
      {
        condition: (t) => t.COM < 10,
        reason: 'Comprensione troppo bassa per gestire persone',
        severity: 'blocking'
      },
      {
        condition: (_, s) => s.some(syn => ['S01', 'S04', 'S05'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome demotivante: danneggerà il morale del team',
        severity: 'blocking'
      },
    ],
    profiloIdeale: 'Leader di prossimità. Guida con l\'esempio, ascolta, coordina senza imporre.',
    trattiFondamentali: ['LDR', 'COM', 'HRM', 'PRO'],
    domandeColloquio: [
      'Come motiva un collega in difficoltà?',
      'Racconti di un conflitto nel team e come lo ha risolto.',
      'Come bilancia le esigenze del team con gli obiettivi aziendali?',
      'Come gestisce un membro del team che non collabora?',
    ],
    validatoManualeV2: false,
  },

  'Formatore/Coach': {
    id: 'formatore',
    nome: 'Formatore/Coach',
    categoria: 'tecnico',
    descrizione: 'Formazione, coaching, sviluppo competenze, trasmissione know-how',
    requisiti: [
      { trait: 'COM', soglia: 35, tipo: 'min', isCritical: true, label: 'Comprensione ≥ 35' },
      { trait: 'HRM', soglia: 35, tipo: 'min', isCritical: true, label: 'HR Management ≥ 35' },
      { trait: 'PRO', soglia: 30, tipo: 'min', isCritical: true, label: 'Proattività ≥ 30' },
      { trait: 'ESP', soglia: 25, tipo: 'min', isCritical: false, label: 'Espansività ≥ 25' },
      { trait: 'DET', soglia: 25, tipo: 'min', isCritical: false, label: 'Determinazione ≥ 25' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.COM < 20,
        reason: 'Comprensione insufficiente per capire i bisogni formativi',
        severity: 'blocking'
      },
      {
        condition: (t) => t.ESP < 10,
        reason: 'Espansività troppo bassa per comunicare efficacemente',
        severity: 'blocking'
      },
      {
        condition: (t) => t.PRO < 15,
        reason: 'Troppo passivo per stimolare l\'apprendimento',
        severity: 'blocking'
      },
      {
        condition: (_, s) => s.some(syn => ['S01', 'S04', 'S05', 'S06'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome problematica per ruolo formativo',
        severity: 'blocking'
      },
    ],
    profiloIdeale: 'Trasmettitore di sapere. Empatico, paziente, ispira crescita negli altri.',
    trattiFondamentali: ['COM', 'HRM', 'PRO', 'ESP'],
    domandeColloquio: [
      'Come adatta il suo stile formativo a persone diverse?',
      'Racconti di una persona che ha fatto crescere significativamente.',
      'Come gestisce un partecipante demotivato o resistente?',
      'Qual è il suo approccio per rendere coinvolgente un argomento complesso?',
    ],
    validatoManualeV2: false,
  },

  'Responsabile Qualità/Compliance': {
    id: 'resp_qualita',
    nome: 'Responsabile Qualità/Compliance',
    categoria: 'amministrativo',
    descrizione: 'Controllo qualità, conformità normativa, gestione processi e standard',
    requisiti: [
      { trait: 'ORG', soglia: 50, tipo: 'min', isCritical: true, label: 'Organizzazione ≥ 50' },
      { trait: 'ADS', soglia: 45, tipo: 'min', isCritical: true, label: 'Autodisciplina ≥ 45' },
      { trait: 'PRI', soglia: 50, tipo: 'min', isCritical: true, label: 'Principi ≥ 50' },
      { trait: 'RC', soglia: 10, tipo: 'min', isCritical: false, label: 'RC ≥ 10 (rigore procedurale)' },
      { trait: 'GP', soglia: 25, tipo: 'min', isCritical: false, label: 'Gestione Pressioni ≥ 25' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.ORG < 35,
        reason: 'Organizzazione insufficiente per gestire standard qualitativi',
        severity: 'blocking'
      },
      {
        condition: (t) => t.PRI < 35,
        reason: 'Principi troppo bassi per garantire conformità',
        severity: 'blocking'
      },
      {
        condition: (t) => t.ADS < 30,
        reason: 'Autodisciplina insufficiente per lavoro di compliance',
        severity: 'blocking'
      },
      {
        condition: (_, s) => s.some(syn => ['S01', 'S02', 'S06'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome critica o etica per ruolo di garanzia qualità',
        severity: 'blocking'
      },
    ],
    profiloIdeale: 'Guardiano degli standard. Rigoroso, metodico, non scende a compromessi sulla qualità.',
    trattiFondamentali: ['ORG', 'ADS', 'PRI'],
    domandeColloquio: [
      'Come gestisce la resistenza al cambiamento quando introduce nuovi standard?',
      'Racconti di una non-conformità grave che ha scoperto e gestito.',
      'Come bilancia rigore normativo e operatività aziendale?',
      'Come si tiene aggiornato sulle normative del settore?',
    ],
    validatoManualeV2: false,
  },

  'HR Recruiter': {
    id: 'hr_recruiter',
    nome: 'HR Recruiter',
    categoria: 'amministrativo',
    descrizione: 'Selezione del personale, screening CV, colloqui, valutazione candidati',
    // Soglie allineate al Manuale V2.0: COM>=20, ESP>=20, PRO>=20, DET>=30, ORG>=30, VEN>=20
    requisiti: [
      { trait: 'COM', soglia: 20, tipo: 'min', isCritical: true, label: 'Comprensione ≥ 20' },
      { trait: 'ESP', soglia: 20, tipo: 'min', isCritical: true, label: 'Espansività ≥ 20' },
      { trait: 'PRO', soglia: 20, tipo: 'min', isCritical: true, label: 'Proattività ≥ 20' },
      { trait: 'DET', soglia: 30, tipo: 'min', isCritical: false, label: 'Determinazione ≥ 30' },
      { trait: 'ORG', soglia: 30, tipo: 'min', isCritical: false, label: 'Organizzazione ≥ 30' },
      { trait: 'VEN', soglia: 20, tipo: 'min', isCritical: false, label: 'Attitudine Vendita ≥ 20' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.COM < 10,
        reason: 'Comprensione insufficiente: non leggerà le persone',
        severity: 'blocking'
      },
      {
        condition: (t) => t.PRO < 10,
        reason: 'Troppo passivo per cercare attivamente talenti',
        severity: 'blocking'
      },
      {
        condition: (_, s) => s.some(syn => ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S08'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome critica o problematica per ruolo HR',
        severity: 'blocking'
      },
    ],
    profiloIdeale: 'Cacciatore di talenti. Empatico, proattivo, sa vedere oltre il CV.',
    trattiFondamentali: ['COM', 'PRO', 'ORG', 'ESP'],
    domandeColloquio: [
      'Come identifica un talento nascosto in un colloquio?',
      'Racconti di un\'assunzione di cui va particolarmente fiero.',
      'Come gestisce un candidato che rifiuta l\'offerta?',
      'Quali domande chiave fa sempre in un colloquio?',
    ],
    validatoManualeV2: true,
  },

  'Impiegato Amministrativo': {
    id: 'imp_amm',
    nome: 'Impiegato Amministrativo',
    categoria: 'amministrativo',
    descrizione: 'Attività amministrative, contabilità ordinaria, gestione documenti',
    // Soglie allineate al Manuale V2.0: ORG>=30, ADS>=30, PRO>=10, RC>-19, PRI>=30
    requisiti: [
      { trait: 'ORG', soglia: 30, tipo: 'min', isCritical: true, label: 'Organizzazione ≥ 30' },
      { trait: 'ADS', soglia: 30, tipo: 'min', isCritical: true, label: 'Autodisciplina ≥ 30' },
      { trait: 'PRO', soglia: 10, tipo: 'min', isCritical: false, label: 'Proattività ≥ 10' },
      { trait: 'RC', soglia: -19, tipo: 'min', isCritical: true, label: 'RC > -19' },
      { trait: 'PRI', soglia: 30, tipo: 'min', isCritical: false, label: 'Principi ≥ 30' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.ORG < 20,
        reason: 'Organizzazione insufficiente per lavoro amministrativo',
        severity: 'blocking'
      },
      {
        condition: (t) => t.ADS < 20,
        reason: 'Autodisciplina troppo bassa per lavoro ripetitivo',
        severity: 'blocking'
      },
      {
        condition: (t) => t.RC <= -19,
        reason: 'RC troppo bassa: dispersivo per ruolo amministrativo',
        severity: 'blocking'
      },
      {
        condition: (_, s) => s.some(syn => ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S14'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome critica o problematica per ruolo amministrativo',
        severity: 'blocking'
      },
      {
        condition: (t) => t.VEN > 65,
        reason: 'Troppo orientato alla vendita: soffrirà in back-office',
        severity: 'warning'
      },
    ],
    profiloIdeale: 'Affidabile e preciso. Ama l\'ordine, le procedure, i numeri che tornano.',
    trattiFondamentali: ['ORG', 'ADS'],
    domandeColloquio: [
      'Come organizza le sue attività giornaliere?',
      'Racconti di un errore che ha scoperto e corretto.',
      'Come gestisce le scadenze multiple?',
      'Cosa le piace del lavoro amministrativo?',
    ],
    validatoManualeV2: true,
  },

  'Project Manager': {
    id: 'project_manager',
    nome: 'Project Manager',
    categoria: 'tecnico',
    descrizione: 'Gestione progetti, coordinamento team, rispetto tempi e budget',
    requisiti: [
      { trait: 'ORG', soglia: 50, tipo: 'min', isCritical: true, label: 'Organizzazione ≥ 50' },
      { trait: 'GP', soglia: 40, tipo: 'min', isCritical: true, label: 'Gestione Pressioni ≥ 40' },
      { trait: 'LDR', soglia: 35, tipo: 'min', isCritical: true, label: 'Leadership ≥ 35' },
      { trait: 'PRO', soglia: 35, tipo: 'min', isCritical: false, label: 'Proattività ≥ 35' },
      { trait: 'COM', soglia: 25, tipo: 'min', isCritical: false, label: 'Comprensione ≥ 25' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.ORG < 35,
        reason: 'Organizzazione insufficiente per gestire progetti complessi',
        severity: 'blocking'
      },
      {
        condition: (t) => t.GP < 25,
        reason: 'Non regge la pressione delle deadline',
        severity: 'blocking'
      },
      {
        condition: (_, s) => s.some(syn => ['S01', 'S02', 'S03', 'S04'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome critica: non può coordinare team',
        severity: 'blocking'
      },
    ],
    profiloIdeale: 'Orchestratore di complessità. Sa tenere insieme persone, tempi, budget e qualità.',
    trattiFondamentali: ['ORG', 'GP', 'LDR', 'PRO'],
    domandeColloquio: [
      'Racconti di un progetto che ha gestito dall\'inizio alla fine.',
      'Come gestisce le priorità quando tutto è urgente?',
      'Come affronta uno stakeholder che cambia i requisiti a metà progetto?',
      'Qual è il suo approccio per gestire team cross-funzionali?',
    ],
    validatoManualeV2: false,
  },

  'Assistente di Direzione': {
    id: 'assistente_dir',
    nome: 'Assistente di Direzione',
    categoria: 'amministrativo',
    descrizione: 'Supporto direzionale, gestione agenda, coordinamento flussi informativi',
    requisiti: [
      { trait: 'ORG', soglia: 55, tipo: 'min', isCritical: true, label: 'Organizzazione ≥ 55' },
      { trait: 'ADS', soglia: 50, tipo: 'min', isCritical: true, label: 'Autodisciplina ≥ 50' },
      { trait: 'PRO', soglia: 40, tipo: 'min', isCritical: true, label: 'Proattività ≥ 40' },
      { trait: 'COM', soglia: 35, tipo: 'min', isCritical: false, label: 'Comprensione ≥ 35' },
      { trait: 'PRI', soglia: 45, tipo: 'min', isCritical: false, label: 'Principi ≥ 45 (riservatezza)' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.ORG < 40,
        reason: 'Organizzazione insufficiente per gestire agenda complessa',
        severity: 'blocking'
      },
      {
        condition: (t) => t.PRI < 30,
        reason: 'Principi troppo bassi: rischio riservatezza',
        severity: 'blocking'
      },
      {
        condition: (_, s) => s.some(syn => ['S01', 'S04', 'S16'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome problematica per ruolo di fiducia',
        severity: 'blocking'
      },
    ],
    profiloIdeale: 'Braccio destro affidabile. Anticipa, organizza, protegge. Riservatezza assoluta.',
    trattiFondamentali: ['ORG', 'ADS', 'PRO', 'PRI'],
    domandeColloquio: [
      'Come gestisce le richieste di ultima ora del dirigente?',
      'Racconti di una situazione riservata che ha dovuto gestire.',
      'Come fa a far rispettare le priorità del dirigente?',
      'Come gestisce le chiamate e le visite indesiderate?',
    ],
    validatoManualeV2: false,
  },

  // ============================================
  // NUOVI RUOLI V5 - Espansione a 24
  // ============================================

  'Controller di Gestione': {
    id: 'controller_gestione',
    nome: 'Controller di Gestione',
    categoria: 'amministrativo',
    descrizione: 'Analisi finanziaria, controllo costi, budgeting, reportistica direzionale',
    requisiti: [
      { trait: 'ORG', soglia: 45, tipo: 'min', isCritical: true, label: 'Organizzazione ≥ 45' },
      { trait: 'ADS', soglia: 40, tipo: 'min', isCritical: true, label: 'Autodisciplina ≥ 40' },
      { trait: 'FIN', soglia: 30, tipo: 'min', isCritical: true, label: 'Orientamento Finanze ≥ 30' },
      { trait: 'PRI', soglia: 40, tipo: 'min', isCritical: false, label: 'Principi ≥ 40' },
      { trait: 'GP', soglia: 25, tipo: 'min', isCritical: false, label: 'Gestione Pressioni ≥ 25' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.ORG < 30,
        reason: 'Organizzazione insufficiente per analisi finanziarie complesse',
        severity: 'blocking'
      },
      {
        condition: (t) => t.ADS < 25,
        reason: 'Autodisciplina insufficiente per rigore nei numeri',
        severity: 'blocking'
      },
      {
        condition: (_, s) => s.some(syn => ['S01', 'S02', 'S06'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome critica o etica per ruolo finanziario',
        severity: 'blocking'
      },
      {
        condition: (t) => t.FIN < 10,
        reason: 'Scarso orientamento finanziario per ruolo di controlling',
        severity: 'warning'
      },
    ],
    profiloIdeale: 'Analista rigoroso. Ama i numeri, la precisione, il controllo dei flussi economici.',
    trattiFondamentali: ['ORG', 'ADS', 'FIN', 'PRI'],
    domandeColloquio: [
      'Come struttura un report di controllo gestione mensile?',
      'Racconti di un\'anomalia nei dati che ha scoperto e come l\'ha gestita.',
      'Come gestisce le scadenze di chiusura quando mancano dati?',
      'Come comunica i risultati finanziari alla direzione?',
    ],
    validatoManualeV2: false,
  },

  'Data Analyst': {
    id: 'data_analyst',
    nome: 'Data Analyst',
    categoria: 'tecnico',
    descrizione: 'Analisi dati, reportistica, interpretazione trend, supporto decisionale',
    requisiti: [
      { trait: 'ORG', soglia: 40, tipo: 'min', isCritical: true, label: 'Organizzazione ≥ 40' },
      { trait: 'ADS', soglia: 40, tipo: 'min', isCritical: true, label: 'Autodisciplina ≥ 40' },
      { trait: 'AUT', soglia: 30, tipo: 'min', isCritical: true, label: 'Automotivazione ≥ 30' },
      { trait: 'GP', soglia: 25, tipo: 'min', isCritical: false, label: 'Gestione Pressioni ≥ 25' },
      { trait: 'PRO', soglia: 20, tipo: 'min', isCritical: false, label: 'Proattività ≥ 20' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.ORG < 25,
        reason: 'Organizzazione insufficiente per gestire dataset complessi',
        severity: 'blocking'
      },
      {
        condition: (t) => t.ADS < 25,
        reason: 'Autodisciplina insufficiente per lavoro analitico metodico',
        severity: 'blocking'
      },
      {
        condition: (_, s) => s.some(syn => ['S01', 'S02', 'S04'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome critica per ruolo analitico',
        severity: 'blocking'
      },
      {
        condition: (t) => t.PRO < 10,
        reason: 'Proattività bassa: rischio passività nell\'analisi',
        severity: 'warning'
      },
    ],
    profiloIdeale: 'Metodico e curioso. Trova pattern nei dati, trasforma numeri in insight actionable.',
    trattiFondamentali: ['ORG', 'ADS', 'AUT', 'GP'],
    domandeColloquio: [
      'Racconti di un\'analisi che ha cambiato una decisione aziendale.',
      'Come verifica la qualità e l\'affidabilità dei dati?',
      'Come comunica insight complessi a stakeholder non tecnici?',
      'Qual è il suo approccio quando i dati sono incompleti o contraddittori?',
    ],
    validatoManualeV2: false,
  },

  'Account Manager': {
    id: 'account_manager',
    nome: 'Account Manager',
    categoria: 'commerciale',
    descrizione: 'Gestione portafoglio clienti, fidelizzazione, upselling, relazione a lungo termine',
    requisiti: [
      { trait: 'COM', soglia: 35, tipo: 'min', isCritical: true, label: 'Comprensione ≥ 35' },
      { trait: 'VEN', soglia: 30, tipo: 'min', isCritical: true, label: 'Attitudine Vendita ≥ 30' },
      { trait: 'ESP', soglia: 20, tipo: 'min', isCritical: false, label: 'Espansività ≥ 20' },
      { trait: 'HRM', soglia: 25, tipo: 'min', isCritical: false, label: 'HR Management ≥ 25' },
      { trait: 'PRO', soglia: 25, tipo: 'min', isCritical: false, label: 'Proattività ≥ 25' },
      { trait: 'DET', soglia: 25, tipo: 'min', isCritical: false, label: 'Determinazione ≥ 25' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.COM < 15,
        reason: 'Comprensione insufficiente per gestire relazioni clienti',
        severity: 'blocking'
      },
      {
        condition: (_, s) => s.some(syn => ['S01', 'S02', 'S03', 'S05'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome critica per ruolo relazionale-commerciale',
        severity: 'blocking'
      },
      {
        condition: (t) => t.VEN < 15,
        reason: 'Attitudine vendita bassa per sviluppare il portafoglio',
        severity: 'warning'
      },
      {
        condition: (t) => t.ESP < 5,
        reason: 'Espansività troppo bassa per costruire relazioni durature',
        severity: 'warning'
      },
    ],
    profiloIdeale: 'Relazionale e strategico. Fidelizza, anticipa bisogni, fa crescere il cliente nel tempo.',
    trattiFondamentali: ['COM', 'VEN', 'ESP', 'HRM'],
    domandeColloquio: [
      'Racconti di un cliente che ha fidelizzato con successo. Come ha fatto?',
      'Come gestisce un cliente insoddisfatto che minaccia di andarsene?',
      'Come bilancia le esigenze del cliente con quelle dell\'azienda?',
      'Qual è la sua strategia per fare upselling senza essere invadente?',
    ],
    validatoManualeV2: false,
  },

  'Office Manager': {
    id: 'office_manager',
    nome: 'Office Manager',
    categoria: 'amministrativo',
    descrizione: 'Gestione ufficio, coordinamento servizi, supervisione procedure quotidiane',
    requisiti: [
      { trait: 'ORG', soglia: 40, tipo: 'min', isCritical: true, label: 'Organizzazione ≥ 40' },
      { trait: 'ADS', soglia: 35, tipo: 'min', isCritical: true, label: 'Autodisciplina ≥ 35' },
      { trait: 'COM', soglia: 30, tipo: 'min', isCritical: false, label: 'Comprensione ≥ 30' },
      { trait: 'HRM', soglia: 25, tipo: 'min', isCritical: false, label: 'HR Management ≥ 25' },
      { trait: 'PRO', soglia: 20, tipo: 'min', isCritical: false, label: 'Proattività ≥ 20' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.ORG < 25,
        reason: 'Organizzazione insufficiente per gestire un ufficio',
        severity: 'blocking'
      },
      {
        condition: (_, s) => s.some(syn => ['S01', 'S04', 'S16'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome problematica per ruolo di gestione ufficio',
        severity: 'blocking'
      },
      {
        condition: (t) => t.COM < 15,
        reason: 'Comprensione bassa per gestire persone e fornitori',
        severity: 'warning'
      },
    ],
    profiloIdeale: 'Punto di riferimento dell\'ufficio. Organizza, coordina, risolve. Tutti contano su di lei/lui.',
    trattiFondamentali: ['ORG', 'ADS', 'COM', 'HRM'],
    domandeColloquio: [
      'Come organizza le priorità quotidiane dell\'ufficio?',
      'Racconti di un\'emergenza organizzativa e come l\'ha gestita.',
      'Come gestisce le richieste multiple da diversi reparti?',
      'Come garantisce che le procedure vengano rispettate?',
    ],
    validatoManualeV2: false,
  },

  'Responsabile IT/Sistemi': {
    id: 'resp_it',
    nome: 'Responsabile IT/Sistemi',
    categoria: 'tecnico',
    descrizione: 'Gestione infrastruttura IT, sistemi informativi, problem solving tecnico',
    requisiti: [
      { trait: 'ORG', soglia: 45, tipo: 'min', isCritical: true, label: 'Organizzazione ≥ 45' },
      { trait: 'ADS', soglia: 40, tipo: 'min', isCritical: true, label: 'Autodisciplina ≥ 40' },
      { trait: 'GP', soglia: 30, tipo: 'min', isCritical: true, label: 'Gestione Pressioni ≥ 30' },
      { trait: 'PRO', soglia: 30, tipo: 'min', isCritical: false, label: 'Proattività ≥ 30' },
      { trait: 'AUT', soglia: 30, tipo: 'min', isCritical: false, label: 'Automotivazione ≥ 30' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.ORG < 30,
        reason: 'Organizzazione insufficiente per gestire infrastruttura IT',
        severity: 'blocking'
      },
      {
        condition: (t) => t.ADS < 25,
        reason: 'Autodisciplina insufficiente per ruolo IT strutturato',
        severity: 'blocking'
      },
      {
        condition: (_, s) => s.some(syn => ['S01', 'S02', 'S04'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome critica per ruolo tecnico-gestionale',
        severity: 'blocking'
      },
      {
        condition: (t) => t.GP < 15,
        reason: 'Gestione pressioni bassa: rischio sotto emergenze tecniche',
        severity: 'warning'
      },
    ],
    profiloIdeale: 'Problem solver tecnico. Gestisce sistemi, previene guasti, risolve sotto pressione.',
    trattiFondamentali: ['ORG', 'ADS', 'GP', 'PRO'],
    domandeColloquio: [
      'Racconti di un\'emergenza IT critica e come l\'ha risolta.',
      'Come pianifica la manutenzione preventiva dei sistemi?',
      'Come gestisce le richieste urgenti da diversi reparti?',
      'Come valuta e propone nuove soluzioni tecnologiche?',
    ],
    validatoManualeV2: false,
  },

  'Capocantiere': {
    id: 'capocantiere',
    nome: 'Capocantiere',
    categoria: 'operativo',
    descrizione: 'Coordinamento squadre, avanzamento lavori, sicurezza operativa e gestione imprevisti in cantiere',
    requisiti: [
      { trait: 'ORG', soglia: 45, tipo: 'min', isCritical: true, label: 'Organizzazione cantiere >= 45' },
      { trait: 'GP', soglia: 35, tipo: 'min', isCritical: true, label: 'Gestione Pressioni >= 35' },
      { trait: 'LDR', soglia: 30, tipo: 'min', isCritical: true, label: 'Leadership operativa >= 30' },
      { trait: 'PRI', soglia: 30, tipo: 'min', isCritical: true, label: 'Principi e sicurezza >= 30' },
      { trait: 'COM', soglia: 15, tipo: 'min', isCritical: false, label: 'Comprensione istruzioni >= 15' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.GP < 15,
        reason: 'Gestione pressione troppo bassa per ritmi e urgenze di cantiere',
        severity: 'blocking'
      },
      {
        condition: (t) => t.PRI < 10,
        reason: 'Principi bassi: rischio su sicurezza, procedure e responsabilita',
        severity: 'blocking'
      },
      {
        condition: (_, s) => s.some(syn => ['S01', 'S02', 'S04', 'S16'].includes(syn.code) && syn.isActive),
        reason: 'Sindrome critica incompatibile con guida squadra e sicurezza',
        severity: 'blocking'
      },
    ],
    profiloIdeale: 'Guida pratica, presente in cantiere, capace di far rispettare tempi, qualita e sicurezza.',
    trattiFondamentali: ['ORG', 'GP', 'LDR', 'PRI'],
    domandeColloquio: [
      'Come organizza una giornata di cantiere con piu squadre e fornitori?',
      'Racconti un imprevisto serio in cantiere e come lo ha gestito.',
      'Come fa rispettare sicurezza e procedure senza bloccare il lavoro?',
      'Come gestisce un operaio bravo tecnicamente ma indisciplinato?',
    ],
    validatoManualeV2: false,
  },

  'Tecnico Preventivista': {
    id: 'tecnico_preventivista',
    nome: 'Tecnico Preventivista',
    categoria: 'tecnico',
    descrizione: 'Analisi computi, rilievi, listini, marginalita e trasformazione tecnica in offerta commerciale',
    requisiti: [
      { trait: 'ORG', soglia: 45, tipo: 'min', isCritical: true, label: 'Organizzazione tecnica >= 45' },
      { trait: 'ADS', soglia: 40, tipo: 'min', isCritical: true, label: 'Autodisciplina nel dettaglio >= 40' },
      { trait: 'COM', soglia: 25, tipo: 'min', isCritical: true, label: 'Comprensione tecnica >= 25' },
      { trait: 'FIN', soglia: 20, tipo: 'min', isCritical: false, label: 'Sensibilita economica >= 20' },
      { trait: 'PRI', soglia: 25, tipo: 'min', isCritical: false, label: 'Affidabilita dati >= 25' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.ORG < 25 || t.ADS < 25,
        reason: 'Metodo insufficiente per preventivi accurati e ripetibili',
        severity: 'blocking'
      },
      {
        condition: (t) => t.COM < 0,
        reason: 'Comprensione troppo bassa per leggere richieste tecniche e computi',
        severity: 'blocking'
      },
    ],
    profiloIdeale: 'Preciso, analitico, capace di proteggere margine e tempi senza perdere il cliente.',
    trattiFondamentali: ['ORG', 'ADS', 'COM', 'FIN'],
    domandeColloquio: [
      'Come controlla che un preventivo non lasci fuori lavorazioni importanti?',
      'Racconti di un computo metrico complesso che ha trasformato in offerta.',
      'Come verifica margine, posa, trasporti e imprevisti prima di inviare il prezzo?',
      'Come gestisce una richiesta urgente senza perdere accuratezza?',
    ],
    validatoManualeV2: false,
  },

  'Posatore Serramenti': {
    id: 'posatore_serramenti',
    nome: 'Posatore Serramenti',
    categoria: 'operativo',
    descrizione: 'Installazione serramenti, posa qualificata, cura del cliente e rispetto dettagli tecnici',
    requisiti: [
      { trait: 'ADS', soglia: 35, tipo: 'min', isCritical: true, label: 'Autodisciplina in posa >= 35' },
      { trait: 'DET', soglia: 25, tipo: 'min', isCritical: true, label: 'Determinazione operativa >= 25' },
      { trait: 'ORG', soglia: 25, tipo: 'min', isCritical: true, label: 'Ordine strumenti/materiali >= 25' },
      { trait: 'COM', soglia: 10, tipo: 'min', isCritical: false, label: 'Comprensione schede tecniche >= 10' },
      { trait: 'PRI', soglia: 20, tipo: 'min', isCritical: false, label: 'Cura e responsabilita >= 20' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.ADS < 15,
        reason: 'Scarsa disciplina operativa: rischio errori di posa',
        severity: 'blocking'
      },
      {
        condition: (t) => t.PRI < 0,
        reason: 'Responsabilita bassa per lavoro in casa cliente',
        severity: 'blocking'
      },
    ],
    profiloIdeale: 'Operativo preciso, ordinato, rispettoso della casa del cliente e delle istruzioni di posa.',
    trattiFondamentali: ['ADS', 'DET', 'ORG', 'PRI'],
    domandeColloquio: [
      'Come prepara un intervento di posa prima di arrivare dal cliente?',
      'Racconti un errore di posa che ha corretto e cosa ha imparato.',
      'Come gestisce un cliente presente e ansioso durante il lavoro?',
      'Come controlla il lavoro prima di lasciare il cantiere?',
    ],
    validatoManualeV2: false,
  },

  'Commerciale Cantieri': {
    id: 'commerciale_cantieri',
    nome: 'Commerciale Cantieri',
    categoria: 'commerciale',
    descrizione: 'Vendita consulenziale su ristrutturazioni, serramenti, fotovoltaico e commesse ad alto valore',
    requisiti: [
      { trait: 'VEN', soglia: 35, tipo: 'min', isCritical: true, label: 'Attitudine vendita >= 35' },
      { trait: 'DET', soglia: 30, tipo: 'min', isCritical: true, label: 'Determinazione commerciale >= 30' },
      { trait: 'COM', soglia: 20, tipo: 'min', isCritical: true, label: 'Comprensione bisogni cliente >= 20' },
      { trait: 'GP', soglia: 25, tipo: 'min', isCritical: false, label: 'Gestione pressione trattativa >= 25' },
      { trait: 'FIN', soglia: 15, tipo: 'min', isCritical: false, label: 'Sensibilita a budget e margine >= 15' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.VEN < 20,
        reason: 'Spinta vendita insufficiente per trattative di cantiere',
        severity: 'blocking'
      },
      {
        condition: (t) => t.COM < 0,
        reason: 'Comprensione bassa: rischio offerte non allineate al bisogno',
        severity: 'warning'
      },
    ],
    profiloIdeale: 'Consulente commerciale tecnico: ascolta, guida, protegge il margine e chiude senza forzare.',
    trattiFondamentali: ['VEN', 'DET', 'COM', 'GP'],
    domandeColloquio: [
      'Come vende un intervento costoso quando il cliente confronta solo il prezzo?',
      'Racconti una trattativa lunga che ha chiuso con successo.',
      'Come coinvolge tecnico e preventivista senza perdere controllo commerciale?',
      'Come decide quando non inseguire un cliente non qualificato?',
    ],
    validatoManualeV2: false,
  },

  'Responsabile Commesse': {
    id: 'responsabile_commesse',
    nome: 'Responsabile Commesse',
    categoria: 'tecnico',
    descrizione: 'Gestione commesse, tempi, costi, fornitori, varianti e marginalita fino a consegna',
    requisiti: [
      { trait: 'ORG', soglia: 50, tipo: 'min', isCritical: true, label: 'Organizzazione commesse >= 50' },
      { trait: 'GP', soglia: 35, tipo: 'min', isCritical: true, label: 'Gestione pressioni >= 35' },
      { trait: 'FIN', soglia: 25, tipo: 'min', isCritical: true, label: 'Controllo margine >= 25' },
      { trait: 'LDR', soglia: 25, tipo: 'min', isCritical: false, label: 'Coordinamento persone >= 25' },
      { trait: 'PRO', soglia: 25, tipo: 'min', isCritical: false, label: 'Anticipo problemi >= 25' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.ORG < 30,
        reason: 'Organizzazione insufficiente per commesse multi-attore',
        severity: 'blocking'
      },
      {
        condition: (t) => t.GP < 15,
        reason: 'Rischio blocco sotto pressione di cliente, fornitori e squadre',
        severity: 'blocking'
      },
    ],
    profiloIdeale: 'Tiene insieme cliente, squadra, fornitori e margine. Decide, anticipa, chiude.',
    trattiFondamentali: ['ORG', 'GP', 'FIN', 'LDR'],
    domandeColloquio: [
      'Come monitora margine e avanzamento di una commessa?',
      'Racconti una variante gestita male e come la gestirebbe oggi.',
      'Come reagisce quando fornitore e squadra interna si scaricano responsabilita?',
      'Quali KPI controlla ogni settimana?',
    ],
    validatoManualeV2: false,
  },

  'Installatore Fotovoltaico': {
    id: 'installatore_fotovoltaico',
    nome: 'Installatore Fotovoltaico',
    categoria: 'operativo',
    descrizione: 'Installazione impianti FV, sicurezza in quota, precisione tecnica e coordinamento con elettricista',
    requisiti: [
      { trait: 'ADS', soglia: 35, tipo: 'min', isCritical: true, label: 'Disciplina tecnica >= 35' },
      { trait: 'PRI', soglia: 35, tipo: 'min', isCritical: true, label: 'Sicurezza e responsabilita >= 35' },
      { trait: 'COM', soglia: 15, tipo: 'min', isCritical: true, label: 'Comprensione schemi/istruzioni >= 15' },
      { trait: 'GP', soglia: 20, tipo: 'min', isCritical: false, label: 'Pressione operativa >= 20' },
      { trait: 'DET', soglia: 25, tipo: 'min', isCritical: false, label: 'Determinazione in installazione >= 25' },
    ],
    disqualifiers: [
      {
        condition: (t) => t.PRI < 15,
        reason: 'Responsabilita insufficiente per lavori elettrici e sicurezza in quota',
        severity: 'blocking'
      },
      {
        condition: (t) => t.COM < -10,
        reason: 'Comprensione troppo bassa per schemi e istruzioni tecniche',
        severity: 'blocking'
      },
    ],
    profiloIdeale: 'Tecnico operativo preciso, attento alla sicurezza, ordinato nei cablaggi e nelle procedure.',
    trattiFondamentali: ['ADS', 'PRI', 'COM', 'DET'],
    domandeColloquio: [
      'Come controlla sicurezza e materiali prima di salire in copertura?',
      'Racconti un problema tecnico durante una posa FV e come lo ha risolto.',
      'Come collabora con elettricista, caposquadra e cliente?',
      'Quali controlli finali fa prima di chiudere un impianto?',
    ],
    validatoManualeV2: false,
  },
};

// ============================================
// FUNZIONI DI MATCHING
// ============================================

/**
 * Verifica se un requisito è soddisfatto
 */
function checkRequirement(
  req: TraitRequirement,
  traits: TraitScores
): { ok: boolean; valore: number; gap: number } {
  const valore = traits[req.trait as keyof TraitScores] ?? 0;
  let ok = false;
  let gap = 0;

  switch (req.tipo) {
    case 'min':
      ok = valore >= req.soglia;
      gap = ok ? 0 : req.soglia - valore;
      break;
    case 'max':
      ok = valore <= req.soglia;
      gap = ok ? 0 : valore - req.soglia;
      break;
    case 'range':
      ok = valore >= req.soglia && valore <= (req.rangeMax || 100);
      if (valore < req.soglia) gap = req.soglia - valore;
      else if (valore > (req.rangeMax || 100)) gap = valore - (req.rangeMax || 100);
      break;
  }

  return { ok, valore, gap };
}

/**
 * Calcola il matching V5 per un singolo ruolo
 */
export function calculateRoleMatchingV5(
  ruolo: string,
  traits: TraitScores,
  candidateAge?: number
): RoleMatchResultV5 {
  const profile = ROLE_PROFILES_V5[ruolo];

  if (!profile) {
    return {
      ruolo,
      categoria: 'altro',
      compatibilitaPct: 50,
      requisitiSoddisfatti: [],
      requisitiMancanti: [],
      disqualifiersAttivi: [],
      syndromiRilevanti: [],
      verdict: 'DA_VALUTARE',
      motivazione: 'Ruolo non configurato nel sistema V5.',
      domandeColloquio: [],
    };
  }

  // Ottieni sindromi attive
  const syndromes = getActiveSyndromes(traits, candidateAge);

  const requisitiSoddisfatti: RoleMatchResultV5['requisitiSoddisfatti'] = [];
  const requisitiMancanti: RoleMatchResultV5['requisitiMancanti'] = [];
  const disqualifiersAttivi: RoleMatchResultV5['disqualifiersAttivi'] = [];

  // Verifica requisiti
  for (const req of profile.requisiti) {
    const { ok, valore, gap } = checkRequirement(req, traits);

    if (ok) {
      requisitiSoddisfatti.push({
        trait: req.trait,
        label: req.label,
        valore,
        soglia: req.soglia
      });
    } else {
      requisitiMancanti.push({
        trait: req.trait,
        label: req.label,
        valore,
        soglia: req.soglia,
        gap
      });
    }
  }

  // Verifica disqualifiers
  for (const disq of profile.disqualifiers) {
    if (disq.condition(traits, syndromes)) {
      disqualifiersAttivi.push({ reason: disq.reason, severity: disq.severity });
    }
  }

  // Sindromi rilevanti per il ruolo
  const syndromiRilevanti = syndromes.filter(s =>
    s.severity === 'RED' ||
    (s.severity === 'ORANGE' && s.isActive)
  );

  // Calcola compatibilità
  const totalReqs = profile.requisiti.length;
  const criticalReqs = profile.requisiti.filter(r => r.isCritical).length;
  const criticalOk = requisitiSoddisfatti.filter(r =>
    profile.requisiti.find(p => p.trait === r.trait)?.isCritical
  ).length;

  let compatibilitaPct = Math.round((criticalOk / criticalReqs) * 80);

  // Bonus per requisiti non-critici soddisfatti
  const nonCriticalOk = requisitiSoddisfatti.length - criticalOk;
  const nonCriticalTotal = totalReqs - criticalReqs;
  if (nonCriticalTotal > 0) {
    compatibilitaPct += Math.round((nonCriticalOk / nonCriticalTotal) * 20);
  }

  // Penalità per disqualifiers
  const blockingDisq = disqualifiersAttivi.filter(d => d.severity === 'blocking').length;
  const warningDisq = disqualifiersAttivi.filter(d => d.severity === 'warning').length;

  compatibilitaPct = Math.max(0, compatibilitaPct - (blockingDisq * 30) - (warningDisq * 10));

  // Penalità per sindromi
  if (hasCriticalSyndromes(traits, candidateAge)) {
    compatibilitaPct = Math.min(compatibilitaPct, 20);
  }

  // Determina verdetto
  let verdict: FitVerdictV5;
  let motivazione: string;

  if (blockingDisq > 0) {
    verdict = 'NON_IDONEO';
    motivazione = `NON IDONEO: ${disqualifiersAttivi.filter(d => d.severity === 'blocking').map(d => d.reason).join('; ')}`;
  } else if (hasCriticalSyndromes(traits, candidateAge)) {
    verdict = 'NON_IDONEO';
    motivazione = `NON IDONEO: sindromi critiche rilevate (${syndromiRilevanti.filter(s => s.severity === 'RED').map(s => s.code).join(', ')})`;
  } else if (requisitiMancanti.filter(r =>
    profile.requisiti.find(p => p.trait === r.trait)?.isCritical
  ).length >= 2) {
    verdict = 'NON_IDONEO';
    motivazione = `NON IDONEO: ${requisitiMancanti.length} requisiti critici non soddisfatti`;
  } else if (requisitiMancanti.filter(r =>
    profile.requisiti.find(p => p.trait === r.trait)?.isCritical
  ).length === 1) {
    verdict = 'DA_VALUTARE';
    motivazione = `DA VALUTARE: 1 requisito critico mancante (${requisitiMancanti[0]?.label}). Approfondire in colloquio.`;
  } else if (warningDisq > 0 || requisitiMancanti.length > 0) {
    verdict = 'IDONEO_CON_RISERVA';
    motivazione = `IDONEO CON RISERVA: requisiti critici OK, ma ${warningDisq + requisitiMancanti.length} punto/i di attenzione.`;
  } else {
    verdict = 'IDONEO';
    motivazione = `IDONEO: tutti i requisiti soddisfatti. Profilo eccellente per ${ruolo}.`;
  }

  return {
    ruolo,
    categoria: profile.categoria,
    compatibilitaPct,
    requisitiSoddisfatti,
    requisitiMancanti,
    disqualifiersAttivi,
    syndromiRilevanti,
    verdict,
    motivazione,
    domandeColloquio: profile.domandeColloquio,
  };
}

/**
 * Calcola la compatibilità con TUTTI i 24 ruoli V5
 */
export function calculateAllRolesCompatibilityV5(
  ruoloRichiesto: string,
  traits: TraitScores,
  candidateAge?: number
): AllRolesCompatibilityV5 {
  const ruoloRichiestoResult = calculateRoleMatchingV5(ruoloRichiesto, traits, candidateAge);

  const tuttiRuoli: { ruolo: string; compatibilita: number; verdict: FitVerdictV5 }[] = [];

  for (const ruolo of Object.keys(ROLE_PROFILES_V5)) {
    const result = calculateRoleMatchingV5(ruolo, traits, candidateAge);
    tuttiRuoli.push({
      ruolo,
      compatibilita: result.compatibilitaPct,
      verdict: result.verdict,
    });
  }

  // Ordina per compatibilità decrescente
  tuttiRuoli.sort((a, b) => b.compatibilita - a.compatibilita);

  // Identifica ruolo ideale (diverso da quello richiesto, se migliore)
  const ruoloIdeale = tuttiRuoli.find(r =>
    r.ruolo !== ruoloRichiesto &&
    r.compatibilita > ruoloRichiestoResult.compatibilitaPct &&
    (r.verdict === 'IDONEO' || r.verdict === 'IDONEO_CON_RISERVA')
  ) || null;

  return {
    ruoloRichiesto: ruoloRichiestoResult,
    tuttiRuoli,
    ruoloIdeale: ruoloIdeale ? { ruolo: ruoloIdeale.ruolo, compatibilita: ruoloIdeale.compatibilita } : null,
  };
}

// ============================================
// HELPER UI
// ============================================

export function getVerdictBadgeVariantV5(verdict: FitVerdictV5): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (verdict) {
    case 'IDONEO': return 'default';
    case 'IDONEO_CON_RISERVA': return 'secondary';
    case 'DA_VALUTARE': return 'outline';
    case 'NON_IDONEO': return 'destructive';
    default: return 'outline';
  }
}

export function getVerdictLabelV5(verdict: FitVerdictV5): string {
  const labels: Record<FitVerdictV5, string> = {
    'IDONEO': 'Idoneo',
    'IDONEO_CON_RISERVA': 'Idoneo con Riserva',
    'DA_VALUTARE': 'Da Valutare',
    'NON_IDONEO': 'Non Idoneo',
  };
  return labels[verdict];
}

export function getVerdictColorV5(verdict: FitVerdictV5): string {
  switch (verdict) {
    case 'IDONEO': return 'text-green-600';
    case 'IDONEO_CON_RISERVA': return 'text-amber-600';
    case 'DA_VALUTARE': return 'text-orange-600';
    case 'NON_IDONEO': return 'text-red-600';
    default: return 'text-gray-600';
  }
}

/**
 * Lista dei ruoli V5 disponibili
 */
export const RUOLI_V5 = Object.keys(ROLE_PROFILES_V5);

// ============================================
// MAPPING FUNZIONE DB → RUOLO V5
// ============================================

const FUNZIONE_TO_RUOLO_MAP: Record<string, string> = {
  'Direzione generale': 'Direttore Generale',
  'Ufficio vendite': 'Venditore/Commerciale',
  'Vendite': 'Venditore/Commerciale',
  'Amministrazione': 'Responsabile Amministrativo',
  'Produzione': 'Responsabile Produzione/Logistica',
  'Logistica': 'Responsabile Produzione/Logistica',
  'Ufficio marketing': 'Marketing Manager',
  'Marketing': 'Marketing Manager',
  'Risorse umane': 'HR Manager',
  'HR': 'HR Manager',
  'Customer care': 'Customer Care',
  'Assistenza clienti': 'Customer Care',
  'Acquisti': 'Buyer/Acquisti',
  'Ufficio tecnico': 'Responsabile Tecnico',
  'Ufficio acquisti': 'Buyer/Acquisti',
  'Ufficio risorse umane': 'HR Manager',
  'Direzione commerciale': 'Direttore Commerciale',
  'Imprenditore': 'Imprenditore/Titolare',
  'Titolare': 'Imprenditore/Titolare',
  'Consulenza': 'Consulente Strategico',
  'Coordinamento': 'Team Leader/Coordinatore',
  'Formazione': 'Formatore/Coach',
  'Qualità': 'Responsabile Qualità/Compliance',
  'Qualità/Compliance': 'Responsabile Qualità/Compliance',
  'Controllo di gestione': 'Controller di Gestione',
  'Data analysis': 'Data Analyst',
  'Account management': 'Account Manager',
  'Segreteria/Assistenza dir.': 'Office Manager',
  'IT': 'Responsabile IT/Sistemi',
  'Sistemi informativi': 'Responsabile IT/Sistemi',
  'IT/Sistemi informativi': 'Responsabile IT/Sistemi',
  'Selezione personale': 'HR Recruiter',
  'Project management': 'Project Manager',
  'Cantiere/Edilizia': 'Capocantiere',
  'Installazione/Manutenzione': 'Operaio/Installatore',
  'Preventivazione': 'Tecnico Preventivista',
  'Ufficio preventivi': 'Tecnico Preventivista',
  'Serramenti posa': 'Posatore Serramenti',
  'Posa serramenti': 'Posatore Serramenti',
  'Commerciale cantieri': 'Commerciale Cantieri',
  'Responsabile commessa': 'Responsabile Commesse',
  'Gestione commesse': 'Responsabile Commesse',
  'Fotovoltaico installazione': 'Installatore Fotovoltaico',
  'Installatore fotovoltaico': 'Installatore Fotovoltaico',
  'Impiegato amministrativo': 'Impiegato Amministrativo',
  'Assistente di direzione': 'Assistente di Direzione',
};

/**
 * Mappa il valore `funzione` dal database alla chiave corrispondente in ROLE_PROFILES_V5.
 * Se non trova corrispondenza, restituisce il valore originale (che verrà gestito come "ruolo non configurato").
 */
export function mapFunzioneToRuoloV5(funzione: string): string {
  return FUNZIONE_TO_RUOLO_MAP[funzione] || funzione;
}
