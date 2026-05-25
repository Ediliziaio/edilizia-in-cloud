/**
 * Management Tips V5 - Consigli gestionali per il manager
 * Basato sul Manuale Output V2.0 - Sezione 9
 * 
 * Testi narrativi destinati al manager diretto del candidato
 */

import { TraitCode } from '../types';
import { personalizzaTesto } from './traitNarrativesV5';

export interface ManagementTip {
  id: string;
  condition: (traits: Record<TraitCode, number>, syndromes?: string[]) => boolean;
  testo: string;
  priorita: number; // Lower = show first
  isPriorityOne?: boolean; // For GP < 21 case
}

export const MANAGEMENT_TIPS: ManagementTip[] = [
  // PRIORITÀ ASSOLUTA - GP basso
  {
    id: 'gp_critico',
    condition: (t) => t.GP < 21,
    testo: "PRIORITÀ ASSOLUTA: scopri chi causa pressioni e aiutala a risolvere. Tutto il resto è secondario. Finché la PSP non è gestita, qualsiasi investimento formativo è sprecato.",
    priorita: 0,
    isPriorityOne: true
  },
  
  // AUT - Automotivazione
  {
    id: 'aut_alto',
    condition: (t) => t.AUT > 50,
    testo: "Dagli sfide ambiziose. Non assegnarle compiti banali o si annoierà e diventerà insofferente. Proponile obiettivi che la facciano sentire che sta costruendo qualcosa di importante.",
    priorita: 1
  },
  {
    id: 'aut_basso',
    condition: (t) => t.AUT < 20,
    testo: "Ha bisogno di incoraggiamento costante. Celebra ogni piccolo successo. Mostra fiducia in lei prima che la dimostri. Ricordale regolarmente il suo valore e i suoi progressi.",
    priorita: 2
  },
  
  // DET - Determinazione
  {
    id: 'det_alto',
    condition: (t) => t.DET > 40,
    testo: "Apprezza la sua schiettezza. Non punirla per la franchezza o smetterà di dirti cose importanti. Se vuoi il suo meglio, crea un ambiente dove parlare chiaro è premiato.",
    priorita: 3
  },
  {
    id: 'det_basso',
    condition: (t) => t.DET < 20,
    testo: "Crea un ambiente sicuro dove possa esprimersi. Chiedi esplicitamente la sua opinione nelle riunioni. Ringraziala quando la dà. Non reagire mai male a un suo feedback o si chiuderà per mesi.",
    priorita: 3
  },
  
  // ADS - Autodisciplina
  {
    id: 'ads_alto',
    condition: (t) => t.ADS > 40,
    testo: "È autonoma. Dalle obiettivi chiari e lasciala lavorare. Il micromanagement la frustra e la demotiva. Fai check-in periodici ma non quotidiani.",
    priorita: 4
  },
  {
    id: 'ads_basso',
    condition: (t) => t.ADS < 20,
    testo: "Ha bisogno di struttura esterna: checklist, scadenze chiare, check-in frequenti (almeno settimanali), milestone intermedie. Non lasciarla sola con compiti complessi e lunghi.",
    priorita: 4
  },
  
  // PRO - Proattività
  {
    id: 'pro_basso',
    condition: (t) => t.PRO < 10,
    testo: "Scegli le parole con cura quando dai feedback. Non è in malafede: è sensibile. Usa sempre il metodo sandwich: riconosci qualcosa di positivo, poi l'area di miglioramento, poi chiudi con fiducia.",
    priorita: 5
  },
  
  // COM - Comprensione
  {
    id: 'com_basso',
    condition: (t) => t.COM < 0,
    testo: "Non forzare collaborazioni con persone molto diverse da lei all'inizio. Introduci gradualmente la diversità. Se serve farle lavorare con qualcuno che non sopporta, prepara il terreno con un colloquio preventivo.",
    priorita: 6
  },
  
  // RC - Resistenza al Cambiamento
  {
    id: 'rc_alto',
    condition: (t) => t.RC > 45,
    testo: "I cambiamenti vanno introdotti con numeri, dati e benefici concreti. Non con entusiasmo o motivazione. Dalle tempo per adattarsi - almeno il doppio di quello che daresti a un'altra persona.",
    priorita: 7
  },
  {
    id: 'rc_basso',
    condition: (t) => t.RC < -14,
    testo: "È imprevedibile. Non lasciarla decidere da sola su questioni importanti. Struttura le decisioni con procedure chiare e check intermedi.",
    priorita: 7
  },
  
  // LDR + HRM combo
  {
    id: 'ldr_hrm_gap',
    condition: (t) => t.LDR > 40 && t.HRM < 10,
    testo: "Vuole guidare ma non sa gestire. Affiancala con un mentore esperto in people management. Non promuoverla a ruoli di gestione finché non dimostra di saper far crescere almeno una persona.",
    priorita: 8
  },
  
  // S07 - Creativo Dispersivo (basato su RC e ORG)
  {
    id: 's07_creativo_dispersivo',
    condition: (t) => t.RC >= -14 && t.RC <= 14 && t.ORG < 30,
    testo: "Limitale le opzioni. Non lasciarla in un campo aperto di possibilità o inizierà mille cose. Dalle UN progetto alla volta e pretendi il completamento prima di passare al successivo.",
    priorita: 9
  },
  
  // VEN + COM combo
  {
    id: 'ven_com_gap',
    condition: (t) => t.VEN > 50 && t.COM < 0,
    testo: "Insegnale ad ascoltare. Dopo ogni riunione chiedi: 'Cosa hanno detto gli altri che ti ha colpito?' Forza l'ascolto attivo finché non diventa un'abitudine.",
    priorita: 10
  }
];

// Testo finale sempre presente
export const MANAGEMENT_CLOSING_TEXT = "Ricorda: i tratti di [Nome] sono il risultato di anni di esperienze e decisioni. Non cambieranno in settimane. La persona ha costruito questi schemi perché a un certo punto della sua vita le hanno funzionato. Per cambiarli, deve sperimentare che i NUOVI comportamenti funzionano MEGLIO dei vecchi. Questo richiede pazienza, coerenza e un ambiente che premia il cambiamento. Misura i progressi su base semestrale, non settimanale.";

// Helper per ottenere i consigli attivi
export function getActiveManagementTips(
  traits: Record<TraitCode, number>,
  syndromes?: string[]
): ManagementTip[] {
  return MANAGEMENT_TIPS
    .filter(tip => tip.condition(traits, syndromes))
    .sort((a, b) => a.priorita - b.priorita);
}

// Helper per ottenere i consigli personalizzati
export function getPersonalizedManagementTips(
  traits: Record<TraitCode, number>,
  nome: string,
  sesso: string | null,
  syndromes?: string[]
): { tip: ManagementTip; testo: string }[] {
  const activeTips = getActiveManagementTips(traits, syndromes);
  
  return activeTips.map(tip => ({
    tip,
    testo: personalizzaTesto(tip.testo, nome, sesso)
  }));
}

// Helper per il testo di chiusura personalizzato
export function getPersonalizedClosingText(nome: string, sesso: string | null): string {
  return personalizzaTesto(MANAGEMENT_CLOSING_TEXT, nome, sesso);
}
