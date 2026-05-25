/**
 * Mappa Interiore — Motore di calcolo
 * Calcola le 5 dimensioni psicologiche profonde dai tratti V5
 * e genera profili narrativi, pattern combinatori e testi per il report.
 *
 * Basato su: PROMPT SISTEMA — MAPPA INTERIORE v1.0 (Febbraio 2026)
 *            TALENTPROFILE 360° — LA MAPPA INTERIORE Manuale v3.0
 */

import { TraitCode } from '../types';
import { SyndromeResult } from './syndromes';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AttaccamentoStile = 'sicuro' | 'ansioso' | 'evitante' | 'disorganizzato';

export interface AttaccamentoScores {
  sicuro: number;
  ansioso: number;
  evitante: number;
  disorganizzato: number;
}

export interface DifesaInfo {
  codice: string;
  frontend: string;
  livello: 'maturo' | 'nevrotico';
}

export interface BisognoInfo {
  codice: string;
  frontend: string;
  score: number;
}

export interface PatternResult {
  codice: string;
  frontend: string;
  azione: string;
  positivo?: boolean;
}

export type ProfiloNarrativoCode =
  | 'compresso'
  | 'performante_identitario'
  | 'protettore_ferito'
  | 'rigido_difensivo'
  | 'ambizioso_frustrato'
  | 'creativo_frammentato'
  | 'esecutore_invisibile'
  | 'equilibrato';

export interface DomandaColloquio {
  area: string;
  priorita: 'CRITICA' | 'ALTA' | 'MEDIA';
  domande: string[];
}

export interface MappaInterioreResult {
  dimensioni: {
    identitaRisultato: number;
    regolazioneEmotiva: number;
    attaccamento: {
      dominante: AttaccamentoStile;
      scores: AttaccamentoScores;
    };
    difesa: {
      dominante: DifesaInfo | null;
      secondaria: DifesaInfo | null;
    };
    bisogno: {
      primario: BisognoInfo;
      secondario: BisognoInfo | null;
    };
  };
  profiloNarrativo: ProfiloNarrativoCode;
  profiloNarrativoLabel: string;
  narrativa: {
    chi_e_nel_profondo: string;
    cosa_lo_guida: string;
    cosa_lo_blocca: string;
    potenziale_inespresso: string;
    la_chiave: string;
  };
  cosa_motiva: string[];
  cosa_blocca: string[];
  cosa_teme: string[];
  errori_da_evitare: string[];
  pattern_combinatori: PatternResult[];
  domande_colloquio_aggiuntive: DomandaColloquio[];
  override_piano_crescita: string[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function g(sesso: string | null): { o: string; a: string; lo: string; lui: string; il: string } {
  const f = sesso === 'F';
  return { o: f ? 'a' : 'o', a: f ? 'a' : 'o', lo: f ? 'la' : 'lo', lui: f ? 'lei' : 'lui', il: f ? 'la' : 'il' };
}

// ─── Dimensione 1: Identità-Risultato ──────────────────────────────────────────

export function calculateIdentitaRisultato(t: Record<string, number>): number {
  let score = 0;
  // Ambizione
  if (t.AUT > 60) score += 3;
  else if (t.AUT > 40) score += 2;
  else if (t.AUT > 25) score += 1;
  // Sensibilità al giudizio
  if (t.PRO < 0) score += 3;
  else if (t.PRO < 10) score += 2;
  else if (t.PRO < 25) score += 1;
  // Frustrazione
  if (t.SUC < 0 && t.AUT > 30) score += 1;
  if (t.FIN < 0 && t.AUT > 40) score += 1;
  // Moderatori
  if (t.COM > 30) score -= 1;
  if (t.PRI > 50) score -= 1;
  return clamp(score, 0, 10);
}

// ─── Dimensione 2: Regolazione Emotiva ─────────────────────────────────────────

export function calculateRegolazioneEmotiva(t: Record<string, number>): number {
  let score = 5;
  if (t.GP > 40) score += 1;
  else if (t.GP < 0) score -= 2;
  else if (t.GP < 21) score -= 1;

  if (t.PRO > 40) score += 2;
  else if (t.PRO > 20) score += 1;
  else if (t.PRO < 0) score -= 2;
  else if (t.PRO < 10) score -= 1;

  if (t.RC > 55) score -= 1;
  if (t.RC < -20) score -= 1;
  if (t.SUC > 50) score += 1;
  if (t.FIN > 30 && t.GP > 30) score += 1;
  if (t.ADS > 40) score += 1;
  else if (t.ADS < 10) score -= 1;
  return clamp(score, 0, 10);
}

// ─── Dimensione 3: Stile di Attaccamento ───────────────────────────────────────

export function calculateAttaccamento(t: Record<string, number>): { dominante: AttaccamentoStile; scores: AttaccamentoScores } {
  let sicuro = 5;
  if (t.PRO > 30 && t.COM > 20 && t.ESP > 15) sicuro += 3;
  if (t.GP > 40 && t.ADS > 25) sicuro += 2;
  if (t.DET > 25 && t.COM > 15) sicuro += 1;

  let ansioso = 0;
  if (t.AUT > 40 && t.PRO < 15) ansioso += 2;
  if (t.GP < 30 && t.AUT > 30) ansioso += 2;
  if (t.HRM > 30 && t.DET < 20) ansioso += 1;
  if (t.ESP > 40 && t.COM > 20 && t.DET < 15) ansioso += 1;

  let evitante = 0;
  if (t.COM < 0) evitante += 3;
  if (t.ESP < 10) evitante += 2;
  if (t.DET > 40 && t.COM < 10) evitante += 2;
  if (t.PRO < 0 && t.ESP < 20) evitante += 1;

  let disorganizzato = 0;
  if (t.GP < 0 && t.PRO < 0) disorganizzato += 3;
  if ((t.COM < -20 && t.ESP > 30) || (t.COM > 20 && t.ESP < 0)) disorganizzato += 2;
  if (t.AUT > 50 && t.SUC < 0 && t.GP < 21) disorganizzato += 2;

  const scores: AttaccamentoScores = { sicuro, ansioso, evitante, disorganizzato };
  const entries: [AttaccamentoStile, number][] = [
    ['sicuro', sicuro], ['ansioso', ansioso], ['evitante', evitante], ['disorganizzato', disorganizzato]
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return { dominante: entries[0][0], scores };
}

// ─── Dimensione 4: Meccanismo di Difesa ────────────────────────────────────────

const DIFESE_ORDERED: { codice: string; frontend: string; livello: 'maturo' | 'nevrotico'; check: (t: Record<string, number>) => boolean }[] = [
  { codice: 'sublimazione', frontend: 'Trasforma le difficoltà in energia produttiva', livello: 'maturo', check: t => t.AUT > 50 && t.ADS > 40 && t.PRO > 20 },
  { codice: 'umorismo', frontend: "Usa l'ironia come risorsa per gestire le difficoltà", livello: 'maturo', check: t => t.COM > 30 && t.PRO > 30 && t.ESP > 30 },
  { codice: 'razionalizzazione', frontend: 'Tende a trovare spiegazioni esterne per le difficoltà', livello: 'nevrotico', check: t => t.AUT > 40 && t.PRO < 15 },
  { codice: 'proiezione', frontend: 'Attribuisce agli altri le tensioni che sente dentro di sé', livello: 'nevrotico', check: t => t.PRO < 0 && t.COM < 0 },
  { codice: 'formazione_reattiva', frontend: "Nasconde le difficoltà dietro un'apparenza di serenità", livello: 'nevrotico', check: t => {
    const traitKeys = ['ORG','AUT','GP','ADS','DET','VEN','HRM','LDR','PRO','COM','ESP','RC','FIN','SUC','PRI'];
    const maxTrait = traitKeys.reduce((max, k) => t[k] > t[max] ? k : max, traitKeys[0]);
    return maxTrait === 'GP' && (t.PRO < 20 || t.DET < 20);
  }},
  { codice: 'intellettualizzazione', frontend: 'Analizza le situazioni con distacco, faticando a contattare le emozioni', livello: 'nevrotico', check: t => t.ORG > 50 && t.COM < 10 && t.DET > 30 },
  { codice: 'spostamento', frontend: 'Sotto pressione intensa può sfogare la frustrazione nel contesto sbagliato', livello: 'nevrotico', check: t => t.GP < 21 && t.PRO < 10 && t.DET > 25 },
];

export function calculateDifesa(t: Record<string, number>): { dominante: DifesaInfo | null; secondaria: DifesaInfo | null } {
  const matches: DifesaInfo[] = [];
  for (const d of DIFESE_ORDERED) {
    if (d.check(t)) {
      matches.push({ codice: d.codice, frontend: d.frontend, livello: d.livello });
      if (matches.length === 2) break;
    }
  }
  return { dominante: matches[0] || null, secondaria: matches[1] || null };
}

// ─── Dimensione 5: Bisogno Primario ───────────────────────────────────────────

const BISOGNI: { codice: string; frontend: string; calc: (t: Record<string, number>) => number }[] = [
  { codice: 'competenza', frontend: 'Sentirsi capace', calc: t => { let s = 0; if (t.AUT > 40) s += 3; if (t.ADS > 30 || t.SUC > 30) s += 2; return s; }},
  { codice: 'autonomia', frontend: 'Decidere come fare le cose', calc: t => { let s = 0; if (t.AUT > 50) s += 3; if (t.DET > 30) s += 2; if (t.ORG > 30) s += 1; return s; }},
  { codice: 'appartenenza', frontend: 'Sentirsi parte del team', calc: t => { let s = 0; if (t.ESP > 30) s += 3; if (t.COM > 15) s += 2; if (t.PRO > 20) s += 1; return s; }},
  { codice: 'sicurezza', frontend: 'Stabilità e prevedibilità', calc: t => { let s = 0; if (t.RC > 45) s += 3; if (t.GP < 30) s += 2; if (t.FIN < 20) s += 1; return s; }},
  { codice: 'riconoscimento', frontend: 'Vedere il proprio valore riconosciuto', calc: t => { let s = 0; if (t.AUT > 40 && t.PRO < 20) s += 3; if (t.VEN > 20) s += 2; return s; }},
  { codice: 'significato', frontend: 'Fare qualcosa che abbia senso', calc: t => { let s = 0; if (t.PRI > 50) s += 3; if (t.AUT > 30) s += 2; if (t.ORG > 30 || t.COM > 20) s += 1; return s; }},
];

export function calculateBisogno(t: Record<string, number>): { primario: BisognoInfo; secondario: BisognoInfo | null } {
  const scored = BISOGNI.map(b => ({ ...b, score: b.calc(t) })).sort((a, b) => b.score - a.score);
  const primario: BisognoInfo = { codice: scored[0].codice, frontend: scored[0].frontend, score: scored[0].score };
  const secondario = scored[1].score > 0 ? { codice: scored[1].codice, frontend: scored[1].frontend, score: scored[1].score } as BisognoInfo : null;
  return { primario, secondario };
}

// ─── Profilo Narrativo ────────────────────────────────────────────────────────

function assignProfiloNarrativo(
  t: Record<string, number>,
  identitaRisultato: number,
  syndromes: SyndromeResult[]
): ProfiloNarrativoCode {
  // 1. Compresso
  const traitKeys: TraitCode[] = ['ORG','AUT','GP','ADS','DET','VEN','HRM','LDR','PRO','COM','ESP','RC','FIN','SUC','PRI'];
  const negCount = traitKeys.filter(k => (t[k] ?? 0) < 0).length;
  if (t.GP < 21 && negCount >= 3) return 'compresso';
  // 2. Performante identitario
  if (identitaRisultato >= 7) return 'performante_identitario';
  // 3. Protettore ferito
  if (t.COM < 0 && t.ESP < 15 && t.PRO < 10) return 'protettore_ferito';
  // 4. Rigido difensivo
  if (t.RC > 50 && t.COM < 15) return 'rigido_difensivo';
  // 5. Ambizioso frustrato
  if (t.AUT > 40 && t.SUC < 30 && t.FIN < 20) return 'ambizioso_frustrato';
  // 6. Creativo frammentato
  if (t.RC >= -14 && t.RC <= 14 && t.ORG < 30) return 'creativo_frammentato';
  // 7. Esecutore invisibile
  const hasS04 = syndromes.some(s => s.code === 'S04' && s.isActive);
  if (hasS04 && t.AUT < 30) return 'esecutore_invisibile';
  // 8. Equilibrato
  return 'equilibrato';
}

const PROFILO_LABELS: Record<ProfiloNarrativoCode, string> = {
  compresso: 'Il Compresso',
  performante_identitario: 'Il Performante Identitario',
  protettore_ferito: 'Il Protettore Ferito',
  rigido_difensivo: 'Il Rigido Difensivo',
  ambizioso_frustrato: "L'Ambizioso Frustrato",
  creativo_frammentato: 'Il Creativo Frammentato',
  esecutore_invisibile: "L'Esecutore Invisibile",
  equilibrato: 'Equilibrato',
};

// ─── Badge Frontend Labels ────────────────────────────────────────────────────

export const ATTACCAMENTO_FRONTEND: Record<AttaccamentoStile, string> = {
  sicuro: 'Collaborativo e aperto',
  ansioso: 'Cerca conferme, molto coinvolto',
  evitante: 'Riservato e autonomo',
  disorganizzato: 'Complesso, alterna vicinanza e distanza',
};

export const BISOGNO_FRONTEND: Record<string, string> = {
  competenza: 'Sentirsi capace',
  autonomia: 'Decidere come fare le cose',
  appartenenza: 'Sentirsi parte del team',
  sicurezza: 'Stabilità e prevedibilità',
  riconoscimento: 'Vedere il proprio valore riconosciuto',
  significato: 'Fare qualcosa che abbia senso',
};

// ─── Pattern Combinatori ──────────────────────────────────────────────────────

function detectPatterns(
  identita: number,
  regolazione: number,
  attaccamento: AttaccamentoStile,
  difesa: DifesaInfo | null,
  bisogno: string,
  t: Record<string, number>
): PatternResult[] {
  const patterns: PatternResult[] = [];

  // Pattern 1
  if (identita >= 7 && regolazione <= 4) {
    patterns.push({
      codice: 'P1', frontend: 'Sotto la corazza c\'è una fragilità da proteggere',
      azione: 'Check-in emotivi regolari. Normalizzare il fallimento. Vacanze obbligatorie.'
    });
  }
  // Pattern 2
  if (attaccamento === 'ansioso' && bisogno === 'riconoscimento') {
    patterns.push({
      codice: 'P2', frontend: 'Ha bisogno di sapere che il suo lavoro conta',
      azione: 'Feedback settimanale. Riconoscimento pubblico. Insegnare auto-valutazione.'
    });
  }
  // Pattern 3
  if (attaccamento === 'evitante' && difesa?.codice === 'intellettualizzazione') {
    patterns.push({
      codice: 'P3', frontend: 'Analizza tutto ma fatica a connettersi emotivamente',
      azione: 'Non forzare. Compiti in coppia. Chiedere "cosa ne pensi?" non "come ti senti?"'
    });
  }
  // Pattern 4
  if (regolazione <= 3 && t.GP < 21) {
    patterns.push({
      codice: 'P4', frontend: 'Sta attraversando una tempesta e ha bisogno di un porto sicuro',
      azione: 'PRIMA proteggere, POI formare. Ridurre carico. Nessuna decisione definitiva.'
    });
  }
  // Pattern 5
  if (identita >= 7 && attaccamento === 'evitante' && t.RC > 50) {
    patterns.push({
      codice: 'P5', frontend: 'Il guerriero solitario che non chiede mai aiuto',
      azione: 'Monitoraggio proattivo. Normalizzare la vulnerabilità.'
    });
  }
  // Pattern 6: Bassa Identità + Bassa Regolazione + Compresso
  if (identita <= 3 && regolazione <= 3 && t.GP < 21) {
    const negCount = (['ORG','AUT','GP','ADS','DET','VEN','HRM','LDR','PRO','COM','ESP','RC','FIN','SUC','PRI'] as const).filter(k => (t[k] ?? 0) < 0).length;
    if (negCount >= 3) {
      patterns.push({
        codice: 'P6', frontend: 'Ha perso la bussola',
        azione: 'Intervento immediato. Colloquio riservato. Possibile supporto professionale.'
      });
    }
  }
  // Pattern 7
  if (regolazione >= 8 && attaccamento === 'sicuro' && (difesa?.codice === 'sublimazione' || difesa?.codice === 'umorismo' || difesa === null)) {
    patterns.push({
      codice: 'P7', frontend: 'Un punto di forza raro nel team',
      azione: difesa === null
        ? 'Profilo naturalmente integrato: trasforma le difficoltà in energia produttiva senza meccanismi difensivi. Valorizzare come mentore. Proteggere dal sovraccarico.'
        : 'Valorizzare come mentore. Proteggere dal sovraccarico.',
      positivo: true,
    });
  }

  return patterns;
}

// ─── Narrative Generation ─────────────────────────────────────────────────────

function generateNarrativa(
  profilo: ProfiloNarrativoCode,
  nome: string,
  sesso: string | null,
  t: Record<string, number>,
  bisognoPrimario: string,
  attaccamentoDominante: AttaccamentoStile,
  difesaDominante: DifesaInfo | null,
  identitaRisultato: number,
  regolazioneEmotiva: number,
): MappaInterioreResult['narrativa'] & { cosa_motiva: string[]; cosa_blocca: string[]; cosa_teme: string[]; errori_da_evitare: string[] } {
  const s = g(sesso);
  
  // Default structures per profilo
  const narratives: Record<ProfiloNarrativoCode, () => ReturnType<typeof generateNarrativa>> = {
    performante_identitario: () => ({
      chi_e_nel_profondo: `${nome} è una persona che ha costruito tutto intorno alla capacità di ottenere risultati. Quando vince, il mondo ha senso. Quando perde, il terreno scompare sotto i piedi. Non è un difetto: è una strategia che ${s.lo} ha res${s.o} fort${s.a} per anni. Ma ha un costo nascosto — ogni fallimento diventa un terremoto interiore che gli altri non vedono, perché ${nome} non mostra mai la vulnerabilità.`,
      cosa_lo_guida: `Il motore di ${nome} è il bisogno di dimostrare il proprio valore attraverso i risultati. Non lavora solo per il compenso: lavora per provare a sé stess${s.o} che vale. Ogni obiettivo raggiunto è una conferma, ogni sfida superata è ossigeno.`,
      cosa_lo_blocca: `Quando il risultato non arriva, ${nome} non vive un semplice insuccesso — vive una crisi di identità. La reazione può essere aggressività, chiusura o negazione. Non ammette facilmente gli errori perché farlo significherebbe mettere in discussione chi è, non solo cosa ha fatto.`,
      potenziale_inespresso: `Sotto l'armatura c'è una persona con determinazione, energia e capacità superiori alla media. Se ${nome} impara che cambiare approccio non significa essere incapace — ma essere PIÙ capace — diventa una risorsa straordinaria.`,
      la_chiave: 'Separare chi sei da cosa fai. Il progetto non ha funzionato ≠ tu non vali.',
      cosa_motiva: ['Risultati concreti e misurabili', 'Autonomia nell\'esecuzione', 'Riconoscimento del proprio valore', 'Obiettivi chiari e ambiziosi', 'Spazio per lavorare senza interferenze'],
      cosa_blocca: ['Fallimento pubblico', 'Mancanza di riconoscimento', 'Critiche percepite come attacchi personali', 'Obiettivi vaghi e non misurabili', 'Ambienti dove conta la politica più del merito'],
      cosa_teme: ['Non valere nulla se non raggiunge risultati', 'Che scoprano che sotto non c\'è niente di speciale', 'Dover dipendere da qualcuno'],
      errori_da_evitare: ['Non criticare la persona anziché il comportamento — per ' + nome + ' non c\'è differenza tra "hai sbagliato" e "non vali"', 'Non ignorare i successi pensando che siano scontati — ha bisogno che vengano visti', 'Non confrontarl' + s.o + ' pubblicamente con colleghi più performanti — vive il confronto come minaccia esistenziale'],
    }),

    compresso: () => ({
      chi_e_nel_profondo: `In questo momento ${nome} non sta esprimendo chi è davvero. È come un pallone a cui hanno tolto l'aria: la forma attuale non è la forma reale. Qualcosa nella sua vita — una relazione, una situazione, una pressione — sta assorbendo tutta l'energia disponibile. I punteggi bassi che emergono non raccontano le sue capacità: raccontano il peso che porta.`,
      cosa_lo_guida: `Sotto la pressione attuale, il bisogno primario di ${nome} è sopravvivere alla situazione. Non cerca eccellenza: cerca terreno stabile. Ha bisogno di sapere che qualcuno si accorge di come sta.`,
      cosa_lo_blocca: `La pressione in corso sta consumando tutte le risorse. ${nome} non ha energia per crescere, innovare o rischiare. Non è un limite caratteriale — è la conseguenza di un carico che in questo momento è troppo.`,
      potenziale_inespresso: `Il profilo reale di ${nome} è nascosto sotto la pressione attuale. Quando il peso si alleggerirà, emergeranno capacità che oggi non sono visibili. È fondamentale non prendere decisioni definitive basate su questo profilo.`,
      la_chiave: 'Prima togliere il peso, poi allenare. Non si nuota durante un naufragio.',
      cosa_motiva: ['Sentirsi protett' + s.o + ' e capit' + s.o, 'Tempo e spazio per recuperare', 'Piccoli successi che ricostruiscono fiducia', 'Sapere che qualcuno si accorge di come sta'],
      cosa_blocca: ['Pressioni aggiuntive', 'Giudizi sulla performance attuale', 'Aspettative irrealistiche', 'Isolamento', 'Confronti con periodi migliori'],
      cosa_teme: ['Che la situazione non cambierà mai', 'Di essere un peso per gli altri', 'Di perdere il lavoro nel momento di massima vulnerabilità'],
      errori_da_evitare: ['Non prendere decisioni definitive basate su questo profilo — non è il profilo reale di ' + nome, 'Non dire "devi reagire" o "devi essere forte" — sta già usando tutte le forze che ha', 'Non ignorare i segnali pensando che si risolverà da sol' + s.o],
    }),

    protettore_ferito: () => ({
      chi_e_nel_profondo: `${nome} è una persona che ha imparato a proteggersi. Tradimenti, rifiuti o giudizi del passato hanno costruito un muro. Sotto quel muro c'è il desiderio di connessione — ma la paura di essere ferit${s.o} di nuovo è più forte. Non è chiusura: è protezione.`,
      cosa_lo_guida: `${nome} cerca sicurezza relazionale. Ha bisogno di sapere che le persone intorno sono affidabili, coerenti, prevedibili. Quando si fida, è leale e protettiv${s.o}. Ma la fiducia va guadagnata un gesto alla volta.`,
      cosa_lo_blocca: `La difficoltà a fidarsi limita le collaborazioni. ${nome} tende a fare da sol${s.o} ciò che potrebbe condividere. Non chiede aiuto perché chiedere significherebbe esporsi. Questo genera isolamento progressivo.`,
      potenziale_inespresso: `Sotto l'armatura protettiva c'è una persona con sensibilità e profondità relazionale superiore alla media. Se ${nome} trova un ambiente sicuro e coerente, può diventare un collaboratore di straordinario valore — leale, attent${s.o}, protettiv${s.o} verso il team.`,
      la_chiave: 'La fiducia si costruisce un gesto coerente alla volta. Nessuna fretta.',
      cosa_motiva: ['Coerenza tra parole e fatti', 'Relazioni autentiche e prevedibili', 'Rispetto dei confini personali', 'Tempo per costruire fiducia'],
      cosa_blocca: ['Tradimenti di fiducia', 'Incoerenza del manager', 'Forzare la socializzazione', 'Esposizione pubblica non richiesta'],
      cosa_teme: ['Di essere ferit' + s.o + ' di nuovo', 'Che la fiducia data venga tradita', 'Di essere giudicat' + s.o + ' per la propria riservatezza'],
      errori_da_evitare: ['Non forzare ' + nome + ' ad aprirsi o a parlare di emozioni in gruppo', 'Non tradire mai la fiducia data — per ' + nome + ' non c\'è seconda possibilità', 'Non dire "dovresti aprirti di più" — è controproducente e conferma la paura'],
    }),

    rigido_difensivo: () => ({
      chi_e_nel_profondo: `${nome} è una persona che ha trovato un modo che funziona e vi si aggrappa con tutte le forze. La rigidità non è testardaggine: è un'armatura. Cambiare approccio significherebbe ammettere che il suo modo non è perfetto — e per ${nome}, "non perfetto" equivale a "non capace".`,
      cosa_lo_guida: `Il bisogno di ordine, prevedibilità e controllo. ${nome} cerca ambienti dove le regole sono chiare e non cambiano. Quando il terreno è stabile, è estremamente efficiente e affidabile.`,
      cosa_lo_blocca: `La rigidità che in tempi normali è efficienza, sotto pressione diventa fragilità. Quando l'imprevisto arriva e il metodo collaudato non funziona, ${nome} non ha alternative pronte. Anziché adattarsi, tende a raddoppiare lo sforzo nello stesso modo.`,
      potenziale_inespresso: `La struttura di ${nome} è un punto di forza raro. Se impara ad aggiungere flessibilità — non sostituendo il metodo ma affiancandogli alternative — diventa un profilo di altissimo livello. La chiave non è "cambiare" ma "ampliare".`,
      la_chiave: 'Cambiare approccio non significa che quello vecchio era sbagliato — significa averne DUE.',
      cosa_motiva: ['Ambiente organizzato con regole chiare', 'Autonomia nell\'esecuzione dentro obiettivi definiti', 'Risultati concreti e misurabili', 'Riconoscimento della propria affidabilità', 'Costruire qualcosa di duraturo'],
      cosa_blocca: ['Cambiamenti improvvisi senza preavviso', 'Ambienti caotici dove le regole cambiano', 'Mancanza di riconoscimento', 'Essere costrett' + s.o + ' a improvvisare senza preparazione', 'Isolamento relazionale'],
      cosa_teme: ['Che il terreno stabile su cui ha costruito tutto possa cedere', 'Di non avere un Piano B quando il Piano A non funziona', 'Di restare sol' + s.o + ' sotto il peso'],
      errori_da_evitare: ['Non cambiare le regole senza preavviso — ogni cambiamento va introdotto con anticipo e dati', 'Non ignorare la pressione pensando che "se la cava" — va monitorat' + s.o + ' proattivamente', 'Non forzare la flessibilità con la forza — "devi essere più elastic' + s.o + '" senza dire COME è controproducente'],
    }),

    ambizioso_frustrato: () => ({
      chi_e_nel_profondo: `${nome} sente un gap tra ciò che crede di meritare e ciò che ha ottenuto. La frustrazione accumulata oscilla tra rabbia e rassegnazione. Non è pigrizia: è il dolore di chi ha investito molto e non ha raccolto abbastanza.`,
      cosa_lo_guida: `L'ambizione è il motore — ma un motore che gira a vuoto senza carburante di successo. ${nome} ha bisogno di vedere risultati concreti per rialimentare la fiducia in sé stess${s.o}.`,
      cosa_lo_blocca: `Il rischio di autosabotaggio: il successo contraddirebbe l'identità di "quell${s.o} che non ce l'ha fatta". ${nome} può inconsciamente creare ostacoli proprio quando le cose iniziano ad andare bene.`,
      potenziale_inespresso: `L'ambizione di ${nome} è un carburante potente che oggi brucia a vuoto. Se incanalata verso successi immediati e concreti, può generare una spinta straordinaria. Ogni piccolo successo spezza il circolo della frustrazione.`,
      la_chiave: 'Il passato è passato. Ogni piccolo successo da oggi spezza il circolo.',
      cosa_motiva: ['Successi immediati e tangibili', 'Riconoscimento del potenziale', 'Obiettivi sfidanti ma raggiungibili', 'Autonomia e responsabilità'],
      cosa_blocca: ['Obiettivi troppo grandi e lontani', 'Confronto con colleghi di successo', 'Mancanza di prospettive concrete', 'Ambiente che non riconosce il merito'],
      cosa_teme: ['Di non farcela mai', 'Che il meglio sia già passato', 'Di essere dimenticat' + s.o],
      errori_da_evitare: ['Non alimentare il vittimismo — validare senza rinforzare le scuse', 'Non dare obiettivi troppo grandi che confermano "non ce la faccio"', 'Non confrontare ' + nome + ' con colleghi di successo — amplifica la frustrazione'],
    }),

    creativo_frammentato: () => ({
      chi_e_nel_profondo: `${nome} ha un cervello divergente. Genera connessioni dove altri non vedono nulla. È cresciut${s.o} sentendosi dire "concentrati" senza che nessuno spiegasse come. Ha concluso: "c'è qualcosa che non va in me." Non è vero — è semplicemente cablat${s.o} per la creatività.`,
      cosa_lo_guida: `La curiosità e il bisogno di esplorare. ${nome} cerca novità, stimoli, possibilità. Non è dispersione: è il modo in cui il suo cervello funziona al meglio — connettendo idee apparentemente slegate.`,
      cosa_lo_blocca: `La mancanza di struttura esterna. ${nome} genera mille idee ma fatica a completarne una. Non per mancanza di volontà, ma perché ogni nuova idea sembra più interessante di quella in corso.`,
      potenziale_inespresso: `La creatività di ${nome} è una risorsa rara. Se incanalata dentro una struttura esterna (deadline chiare, un progetto alla volta, un partner organizzato), può produrre risultati innovativi che nessun profilo "ordinato" potrebbe generare.`,
      la_chiave: 'Non togliere la creatività. Darle argini. UN progetto, UNA deadline.',
      cosa_motiva: ['Libertà creativa dentro confini chiari', 'Novità e stimoli', 'Vedere le proprie idee realizzate', 'Collaborazione con profili complementari'],
      cosa_blocca: ['Troppi progetti contemporaneamente', 'Giudizi sulla dispersione', 'Strutture troppo rigide', 'Compiti ripetitivi senza variazione'],
      cosa_teme: ['Di non essere capace di finire nulla', 'Che la propria diversità sia un difetto', 'Di essere giudicat' + s.o + ' come dispersiv' + s.o],
      errori_da_evitare: ['Non dire "sei dispersiv' + s.o + '" — è un\'etichetta che conferma la ferita', 'Non dare troppi progetti contemporaneamente — uno alla volta con supporto', 'Non togliere la libertà creativa in nome dell\'ordine — distrugge la motivazione'],
    }),

    esecutore_invisibile: () => {
      const scelta = t.GP > 30 && t.PRI > 30 && t.FIN > 20;
      if (scelta) {
        return {
          chi_e_nel_profondo: `${nome} ha trovato il proprio equilibrio. Non aspira a ruoli di leadership o visibilità — ha scelto consapevolmente un ruolo esecutivo dove può dare il meglio con costanza e affidabilità. Questa non è rinuncia: è maturità.`,
          cosa_lo_guida: `La stabilità e il senso di contribuire con competenza. ${nome} non cerca il palcoscenico: cerca la solidità di un ruolo dove sa di fare la differenza.`,
          cosa_lo_blocca: `Il rischio è che venga sottovalutat${s.o}. L'assenza di ambizione visibile non significa assenza di valore. ${nome} è il tipo di persona su cui si reggono le organizzazioni.`,
          potenziale_inespresso: `Non serve cercarlo altrove: il potenziale di ${nome} è esattamente dove si trova. Valorizzare la costanza, l'affidabilità, la competenza silenziosa.`,
          la_chiave: 'Non tutti devono essere leader. Valorizzare la costanza è un atto di intelligenza.',
          cosa_motiva: ['Stabilità e prevedibilità', 'Riconoscimento della competenza', 'Ruolo chiaro e definito', 'Continuità'],
          cosa_blocca: ['Pressioni per "crescere" in ruoli non desiderati', 'Sottovalutazione del contributo', 'Cambiamenti improvvisi'],
          cosa_teme: ['Di essere considerat' + s.o + ' poco ambiziós' + s.o, 'Di perdere il ruolo stabile', 'Di essere spint' + s.o + ' verso responsabilità non volute'],
          errori_da_evitare: ['Non cercare di trasformare ' + nome + ' in un leader — rispettare la scelta', 'Non sottovalutare il contributo silenzioso — è la colonna portante dell\'organizzazione', 'Non forzare la crescita verticale — offrire crescita orizzontale (competenze, qualità)'],
        };
      }
      return {
        chi_e_nel_profondo: `${nome} ha rinunciato. Non per carattere, ma dopo una serie di esperienze che hanno insegnato che "non serve a niente provare". È impotenza appresa: la persona è presente fisicamente ma ha smesso di investire emotivamente.`,
        cosa_lo_guida: `Sotto la rassegnazione c'è ancora un bisogno di sentirsi capace. Ma la paura di fallire di nuovo è più forte della speranza di riuscire.`,
        cosa_lo_blocca: `L'aspettativa di fallimento. ${nome} evita le sfide non per pigrizia ma per autoproteggersi da un'altra delusione. Ogni nuova responsabilità viene vissuta come rischio di conferma: "vedi, non ce la faccio."`,
        potenziale_inespresso: `C'è potenziale sotto la rassegnazione. Ma va ricostruito con pazienza: piccole responsabilità, grandi supporti. Ogni successo è un mattone nella ricostruzione della fiducia.`,
        la_chiave: 'Piccole responsabilità, grande supporto. Ricostruire la fiducia un successo alla volta.',
        cosa_motiva: ['Piccoli successi visibili', 'Supporto senza giudizio', 'Compiti gestibili e chiari', 'Vedere che il proprio contributo conta'],
        cosa_blocca: ['Sfide troppo grandi', 'Aspettative elevate', 'Giudizi sulla mancanza di ambizione', 'Confronti con colleghi performanti'],
        cosa_teme: ['Di confermare "non ce la faccio"', 'Di essere abbandonat' + s.o, 'Che nessuno creda più in ' + s.lui],
        errori_da_evitare: ['Non dare sfide troppo grandi che confermano "non ce la faccio"', 'Non giudicare la mancanza di ambizione — è una ferita, non un difetto', 'Non aspettarsi cambiamenti rapidi — la fiducia si ricostruisce lentamente'],
      };
    },

    equilibrato: () => {
      // Personalized equilibrato narrative based on specific trait distributions
      const idStabile = identitaRisultato <= 2;
      const reEccellente = regolazioneEmotiva >= 8;
      const espBassa = t.ESP < 10;
      const detBassa = t.DET < 20;

      // chi_e_nel_profondo
      let chi = '';
      if (idStabile && reEccellente) {
        chi = `${nome} è una persona che ha separato il proprio valore intrinseco dai risultati che ottiene. Quando fallisce, non si frantuma — impara. Quando vince, non si gonfia — costruisce. La sua forza non è nel carisma da palcoscenico ma nella capacità sistematica di trasformare problemi in soluzioni.`;
        if (espBassa || detBassa) {
          chi += ` Il suo tallone d'Achille non è emotivo ma relazionale: tende a fare da sol${s.o} ciò che potrebbe delegare${detBassa ? ', e a trattenere ciò che potrebbe dire' : ''}.`;
        }
      } else if (idStabile) {
        chi = `${nome} ha un senso di sé stabile, separato da ciò che ottiene. I fallimenti professionali non diventano terremoti personali. È in grado di dire "il progetto non ha funzionato" senza sentire "io non valgo." Questo è un punto di forza raro e prezioso.`;
      } else if (reEccellente) {
        chi = `${nome} ha una capacità di regolazione emotiva eccezionale. Sotto pressione resta lucid${s.o}, non si lascia travolgere dalle emozioni negative ma le trasforma in energia per agire. È un punto di riferimento naturale nei momenti difficili.`;
      } else {
        chi = `${nome} presenta un profilo psicologico equilibrato. Le dimensioni profonde sono nella norma, senza pattern disfunzionali significativi. Le risorse interne sono ben bilanciate.`;
      }

      // cosa_lo_guida
      let guida = '';
      if (bisognoPrimario === 'competenza') {
        guida = `Il motore principale è sentirsi capace e vedere che il lavoro produce risultati concreti. ${nome} non lavora per il riconoscimento ma per costruire cose che funzionano.`;
      } else if (bisognoPrimario === 'sicurezza') {
        guida = `Il bisogno di stabilità e prevedibilità guida ${nome}. Cerca terreno solido su cui costruire, metodi collaudati, certezze basate sui dati.`;
      } else {
        guida = `${nome} è guidat${s.o} da un mix bilanciato di bisogni. Non c'è un motore dominante che oscura gli altri: competenza, relazioni e stabilità si alternano in modo sano.`;
      }

      // cosa_lo_blocca
      let blocca = '';
      if (espBassa && detBassa) {
        blocca = `L'area di crescita di ${nome} non è psicologica ma comunicativa e relazionale. Sa cosa fare, sa come farlo, ma fa fatica a dirlo agli altri e a costruire la rete larga che amplificherebbe il suo impatto.`;
      } else if (espBassa) {
        blocca = `La rete relazionale è l'area di crescita principale. ${nome} tende a fare da sol${s.o} ciò che potrebbe condividere o delegare. Non è chiusura — è un'abitudine che limita l'impatto.`;
      } else if (detBassa) {
        blocca = `La comunicazione assertiva è l'area di crescita principale. ${nome} sa cosa pensa ma fatica a dirlo con chiarezza, soprattutto quando implica conflitto.`;
      } else {
        blocca = `Non emergono blocchi strutturali significativi. Le aree di miglioramento sono fisiologiche, non patologiche. ${nome} ha le risorse per affrontare le sfide con equilibrio.`;
      }

      // potenziale_inespresso
      let potenziale = '';
      if (idStabile && reEccellente) {
        potenziale = `Il profilo di base è eccezionalmente sano. Se ${nome} impara a costruire la rete relazionale che oggi manca${espBassa ? ` (ESP = ${t.ESP})` : ''} e a comunicare con più assertività${detBassa ? ` (DET = ${t.DET})` : ''}, diventa un profilo dirigenziale di altissimo livello.`;
      } else {
        potenziale = `Il potenziale di ${nome} non è nascosto sotto ferite o difese — è disponibile e accessibile. La sfida è indirizzarlo verso gli obiettivi giusti e fornire le opportunità di crescita adeguate.`;
      }

      // la_chiave
      let chiave = '';
      if (espBassa || detBassa) {
        chiave = `Non devi fare tutto tu per farlo bene — devi insegnare ad altri a farlo come lo faresti tu.`;
      } else if (idStabile && reEccellente) {
        chiave = 'Un profilo eccezionalmente equilibrato è una risorsa rara. La sfida è passare da eccellenza individuale a moltiplicatore di eccellenza.';
      } else {
        chiave = 'Un profilo equilibrato è una risorsa rara. Valorizzare, non dare per scontato.';
      }

      // motiva/blocca/teme/errori customized
      const motiva = ['Obiettivi chiari e stimolanti', 'Autonomia nell\'esecuzione', 'Vedere risultati concreti del proprio lavoro'];
      if (bisognoPrimario === 'competenza') motiva.push('Riconoscimento della propria competenza e affidabilità');
      if (bisognoPrimario === 'sicurezza') motiva.push('Ambiente organizzato con regole chiare e prevedibili');
      motiva.push('Costruire qualcosa di duraturo e strutturato');

      const blocchi = ['Micromanagement', 'Ambienti tossici o incoerenti'];
      if (espBassa) blocchi.push('Isolamento relazionale prolungato');
      if (detBassa) blocchi.push('Dover gestire conflitti diretti senza preparazione');
      if (t.RC > 45) blocchi.push('Cambiamenti improvvisi senza preavviso né spiegazione');
      blocchi.push('Mancanza di sfide');

      const teme = ['Stagnazione professionale'];
      if (espBassa) teme.push('Di restare sol' + s.o + ' sotto il peso senza nessuno su cui contare');
      if (detBassa) teme.push('Di non riuscire a farsi capire quando conta');
      teme.push('Perdita di equilibrio personale');

      const errori = [
        'Non dare per scontat' + s.o + ' — anche i profili equilibrati hanno bisogno di attenzione e riconoscimento',
        'Non sovraccaricare pensando che "tanto regge" — anche le risorse migliori si esauriscono',
      ];
      if (espBassa) errori.push(`Non lasciare ${nome} sol${s.o} troppo a lungo — la rete va costruita attivamente, non aspettata`);
      else errori.push('Non trascurare il feedback positivo — l\'equilibrio va alimentato');

      return {
        chi_e_nel_profondo: chi,
        cosa_lo_guida: guida,
        cosa_lo_blocca: blocca,
        potenziale_inespresso: potenziale,
        la_chiave: chiave,
        cosa_motiva: motiva,
        cosa_blocca: blocchi,
        cosa_teme: teme,
        errori_da_evitare: errori,
      };
    },
  };

  const gen = narratives[profilo]();
  return gen;
}

// ─── Identità-Risultato label ─────────────────────────────────────────────────

export function getIdentitaLabel(score: number): string {
  if (score <= 2) return 'Identità stabile';
  if (score <= 4) return 'Sensibilità lieve';
  if (score <= 6) return 'Fusione moderata';
  if (score <= 8) return 'Fusione significativa';
  return 'Fusione totale';
}

export function getRegolazioneLabel(score: number): string {
  if (score <= 2) return 'Disregolazione severa';
  if (score <= 4) return 'Regolazione fragile';
  if (score <= 6) return 'Sufficiente';
  if (score <= 8) return 'Buona';
  return 'Eccellente';
}

// ─── Main Function ────────────────────────────────────────────────────────────

export function calculateMappaInteriore(
  traits: Record<TraitCode, number>,
  candidatoNome: string,
  candidatoSesso: string | null,
  syndromes: SyndromeResult[],
  _eta?: number,
): MappaInterioreResult | null {
  const t = traits as Record<string, number>;

  const identitaRisultato = calculateIdentitaRisultato(t);
  const regolazioneEmotiva = calculateRegolazioneEmotiva(t);
  const attaccamento = calculateAttaccamento(t);
  const difesa = calculateDifesa(t);
  const bisogno = calculateBisogno(t);
  const profiloNarrativo = assignProfiloNarrativo(t, identitaRisultato, syndromes);

  // Visibility check: if everything balanced → null
  const idBalanced = identitaRisultato >= 4 && identitaRisultato <= 6;
  const regBalanced = regolazioneEmotiva >= 4 && regolazioneEmotiva <= 6;
  if (idBalanced && regBalanced && attaccamento.dominante === 'sicuro' && profiloNarrativo === 'equilibrato') {
    return null;
  }

  const narrativa = generateNarrativa(
    profiloNarrativo, candidatoNome, candidatoSesso, t,
    bisogno.primario.codice, attaccamento.dominante, difesa.dominante,
    identitaRisultato, regolazioneEmotiva
  );

  const pattern_combinatori = detectPatterns(
    identitaRisultato, regolazioneEmotiva, attaccamento.dominante,
    difesa.dominante, bisogno.primario.codice, t
  );

  const domande_colloquio_aggiuntive = generateDomandeColloquio(
    identitaRisultato, regolazioneEmotiva, attaccamento.dominante, difesa.dominante, t
  );

  const override_piano_crescita = generateOverridePiano(
    identitaRisultato, regolazioneEmotiva, attaccamento.dominante, difesa.dominante
  );

  return {
    dimensioni: {
      identitaRisultato,
      regolazioneEmotiva,
      attaccamento,
      difesa,
      bisogno,
    },
    profiloNarrativo,
    profiloNarrativoLabel: PROFILO_LABELS[profiloNarrativo],
    narrativa: {
      chi_e_nel_profondo: narrativa.chi_e_nel_profondo,
      cosa_lo_guida: narrativa.cosa_lo_guida,
      cosa_lo_blocca: narrativa.cosa_lo_blocca,
      potenziale_inespresso: narrativa.potenziale_inespresso,
      la_chiave: narrativa.la_chiave,
    },
    cosa_motiva: narrativa.cosa_motiva,
    cosa_blocca: narrativa.cosa_blocca,
    cosa_teme: narrativa.cosa_teme,
    errori_da_evitare: narrativa.errori_da_evitare,
    pattern_combinatori,
    domande_colloquio_aggiuntive,
    override_piano_crescita,
  };
}

// ─── Domande Colloquio di Secondo Livello ─────────────────────────────────────

function generateDomandeColloquio(
  identita: number,
  regolazione: number,
  attaccamento: AttaccamentoStile,
  difesa: DifesaInfo | null,
  t: Record<string, number>,
): DomandaColloquio[] {
  const domande: DomandaColloquio[] = [];

  if (regolazione <= 3) {
    domande.push({
      area: 'Gestione Emotiva',
      priorita: 'CRITICA',
      domande: [
        'Come gestisci i periodi particolarmente intensi? Cosa fai per ricaricarti?',
        'Raccontami dell\'ultima volta che ti sei sentito/a sotto pressione. Come ne sei uscito/a?',
        'Quando senti che il carico è troppo, cosa fai? A chi ti rivolgi?',
      ],
    });
  } else if (regolazione <= 4) {
    domande.push({
      area: 'Gestione Emotiva',
      priorita: 'ALTA',
      domande: [
        'Come gestisci i periodi particolarmente intensi? Cosa fai per ricaricarti?',
        'Raccontami dell\'ultima volta che ti sei sentito/a sotto pressione. Come ne sei uscito/a?',
      ],
    });
  }

  if (identita >= 7) {
    domande.push({
      area: 'Identità e Risultati',
      priorita: 'ALTA',
      domande: [
        'Quando un progetto non va come previsto, come ti senti? Cosa ti dici?',
        'C\'è differenza per te tra "il progetto non ha funzionato" e "io non sono capace"?',
        'Come reagisci quando qualcuno critica il tuo lavoro?',
      ],
    });
  }

  if (attaccamento === 'evitante') {
    domande.push({
      area: 'Relazioni e Collaborazione',
      priorita: 'ALTA',
      domande: [
        'Come preferisci lavorare: da solo/a o in team? Perché?',
        'Quando hai bisogno di un confronto su un problema, a chi ti rivolgi?',
        'C\'è qualcuno nel tuo contesto professionale con cui ti confidi?',
      ],
    });
  }

  if (t.GP < 21) {
    domande.push({
      area: 'Situazione Attuale',
      priorita: regolazione <= 3 ? 'CRITICA' : 'ALTA',
      domande: [
        'Come stai in questo periodo? Non parlo del lavoro — parlo di te.',
        'C\'è qualcosa nella tua vita che richiede molta energia in questo momento?',
      ],
    });
  }

  if (difesa?.codice === 'razionalizzazione') {
    domande.push({
      area: 'Consapevolezza di Sé',
      priorita: 'MEDIA',
      domande: [
        'Ti è mai capitato di capire solo dopo che avevi sbagliato approccio? Raccontami.',
        'Come reagisci quando qualcuno ti fa notare un errore?',
      ],
    });
  }

  if (t.RC > 55) {
    domande.push({
      area: 'Flessibilità',
      priorita: 'ALTA',
      domande: [
        'Raccontami di una volta in cui il tuo metodo abituale non ha funzionato. Cosa hai fatto?',
        'Se domani il tuo team ti proponesse un approccio completamente diverso dal tuo, come reagiresti?',
      ],
    });
  }

  if (t.ESP < 10) {
    const existing = domande.find(d => d.area === 'Relazioni e Collaborazione');
    if (!existing) {
      domande.push({
        area: 'Rete di Supporto',
        priorita: 'MEDIA',
        domande: [
          'Quando hai bisogno di un confronto su un problema, a chi ti rivolgi?',
          'C\'è qualcuno nel tuo contesto professionale con cui ti confidi?',
        ],
      });
    }
  }

  return domande;
}

// ─── Override Piano di Crescita ───────────────────────────────────────────────

function generateOverridePiano(
  identita: number,
  regolazione: number,
  attaccamento: AttaccamentoStile,
  difesa: DifesaInfo | null,
): string[] {
  const overrides: string[] = [];

  if (identita >= 7) {
    overrides.push('Lavorare sulla separazione identità-risultato in Fase 2: esercizi di auto-valutazione indipendente dai risultati');
  }
  if (regolazione <= 3) {
    overrides.push('Priorità Fase 1: stabilizzazione emotiva. Ridurre carico non necessario del 20-30%. Check-in settimanali di benessere, non di performance');
  }
  if (attaccamento === 'ansioso') {
    overrides.push('Feedback rassicurante ogni 1-2 settimane. Comunicazione proattiva su cambiamenti organizzativi');
  }
  if (attaccamento === 'evitante') {
    overrides.push('Comunicazione breve e fattuale. Non forzare la socializzazione. Connessioni strutturate: mentore, peer di fiducia');
  }
  if (difesa && difesa.livello === 'maturo') {
    overrides.push('Meccanismo di difesa maturo: segnalare come punto di forza nel feedback');
  }
  if (regolazione >= 8 && difesa === null && identita <= 2) {
    overrides.push('Profilo eccezionalmente sano: valorizzare come mentore naturale. Proteggere dal sovraccarico');
  }
  if (attaccamento === 'disorganizzato') {
    overrides.push('Attenzione: pattern relazionale complesso. Comunicazione molto chiara e prevedibile. Evitare messaggi ambigui');
  }

  return overrides;
}

// ─── Chart Data Helper ────────────────────────────────────────────────────────

export interface DimensioneChartItem {
  name: string;
  value: number;
  label: string;
  color: string;
  tooltip: string;
}

export function getDimensioniChartData(result: MappaInterioreResult): DimensioneChartItem[] {
  const { dimensioni } = result;
  const idScore = dimensioni.identitaRisultato;
  const reScore = dimensioni.regolazioneEmotiva;

  // Identità-Risultato: INVERTED (low = good)
  const idColor = idScore <= 3 ? '#22c55e' : idScore <= 6 ? '#f59e0b' : '#ef4444';
  const idLabel = getIdentitaLabel(idScore);

  // Regolazione Emotiva: NORMAL (high = good)
  const reColor = reScore <= 3 ? '#ef4444' : reScore <= 6 ? '#f59e0b' : '#22c55e';
  const reLabel = getRegolazioneLabel(reScore);

  // Attaccamento
  const attDom = dimensioni.attaccamento.dominante;
  const attScore = dimensioni.attaccamento.scores[attDom];
  const attColor = attDom === 'sicuro' ? '#22c55e' : attDom === 'disorganizzato' ? '#ef4444' : '#f59e0b';
  const attLabel = ATTACCAMENTO_FRONTEND[attDom];

  // Difese
  const hasDifesa = dimensioni.difesa.dominante !== null;
  const difScore = hasDifesa ? (dimensioni.difesa.dominante!.livello === 'maturo' ? 3 : 6) : 0;
  const difColor = !hasDifesa ? '#22c55e' : dimensioni.difesa.dominante!.livello === 'maturo' ? '#f59e0b' : '#ef4444';
  const difLabel = hasDifesa ? dimensioni.difesa.dominante!.frontend : 'Equilibrate';

  // Bisogno Primario
  const bisScore = dimensioni.bisogno.primario.score;
  const bisLabel = dimensioni.bisogno.primario.frontend;
  const bisColor = '#8b5cf6';

  return [
    { name: 'Identità-Risultato', value: idScore, label: idLabel, color: idColor, tooltip: `Score ${idScore}/10 — ${idLabel}. Basso = identità stabile (positivo).` },
    { name: 'Regolazione Emotiva', value: reScore, label: reLabel, color: reColor, tooltip: `Score ${reScore}/10 — ${reLabel}. Alto = regolazione eccellente.` },
    { name: 'Attaccamento', value: attScore, label: attLabel, color: attColor, tooltip: `Stile dominante: ${attLabel}. Score ${attScore}/10.` },
    { name: 'Difese', value: difScore, label: difLabel, color: difColor, tooltip: hasDifesa ? `Difesa attiva: ${difLabel}` : 'Nessuna difesa disfunzionale rilevata.' },
    { name: 'Bisogno Primario', value: bisScore, label: bisLabel, color: bisColor, tooltip: `Bisogno dominante: ${bisLabel}. Intensità ${bisScore}/10.` },
  ];
}
