/**
 * Cross Patterns V5 - Pattern cross-area (combinazioni di tratti)
 * Basato sul Manuale Output V2.0 - Capitolo 5
 * 
 * Questi pattern rivelano dinamiche profonde combinando più tratti
 */

import { TraitCode } from '../types';
import { personalizzaTesto } from './traitNarrativesV5';

export type PatternTipo = 'positivo' | 'critico' | 'neutro';

export interface CrossPattern {
  id: string;
  nome: string;
  tipo: PatternTipo;
  condition: (traits: Record<TraitCode, number>, macro: { essere: number; fare: number; avere: number }, eta?: number) => boolean;
  testo: string;
  priorita: number; // Lower = higher priority
}

export const CROSS_PATTERNS: CrossPattern[] = [
  // ==========================================
  // PATTERN POSITIVI
  // ==========================================
  
  {
    id: 'base_eccellenza',
    nome: 'Il Realizzatore',
    tipo: 'positivo',
    condition: (t) => t.ORG > 40 && t.AUT > 40 && t.ADS > 40,
    testo: "[Nome] ha le tre colonne portanti dell'efficacia professionale: sa dove vuole andare (ORG), ci crede (AUT), e lavora con metodo (ADS). Questa combinazione è rara e preziosa. Le persone così non hanno bisogno di supervisione: danno risultati in autonomia. Sono i pilastri su cui costruire un'organizzazione solida. Il manager ideale deve solo indicare la direzione e togliersi di mezzo.",
    priorita: 1
  },
  
  {
    id: 'costruttore_opportunita',
    nome: 'Costruttore di Opportunità',
    tipo: 'positivo',
    condition: (t) => t.AUT > 35 && t.VEN > 30 && t.ESP > 30,
    testo: "[Nome] ha il profilo del costruttore di opportunità: sogna in grande, coinvolge gli altri e costruisce relazioni ampie. Le persone così aprono porte che altri non vedono, creano connessioni inaspettate, generano entusiasmo collettivo. Il rischio è la dispersione: senza disciplina (ADS) e organizzazione (ORG) solide, l'energia si disperde in mille direzioni senza produrre risultati concreti.",
    priorita: 2
  },
  
  {
    id: 'collante_team',
    nome: 'Il Costruttore di Relazioni',
    tipo: 'positivo',
    condition: (t) => t.PRO > 20 && t.COM > 15 && t.ESP > 15,
    testo: "[Nome] è il costruttore naturale di relazioni. Quando c'è tensione, stempera. Quando qualcuno è in difficoltà, aiuta. Quando serve comprensione, la offre. Ha una rete estesa e sa coinvolgere. Queste persone rendono l'ambiente di lavoro migliore per tutti e il loro valore va ben oltre le loro prestazioni individuali.",
    priorita: 3
  },
  
  {
    id: 'profilo_imprenditoriale',
    nome: 'Profilo Imprenditoriale',
    tipo: 'positivo',
    condition: (t) => t.ORG > 40 && t.AUT > 35 && t.ADS > 40 && t.DET > 35 && t.VEN > 30,
    testo: "[Nome] ha un profilo imprenditoriale completo: sa dove vuole andare, ci crede, lavora con metodo, parla chiaro e coinvolge. Se anche gli indicatori (FIN, SUC, PRI) sono allineati, questa persona ha il DNA per costruire qualcosa di importante. Da mettere in posizioni dove può esprimere il pieno potenziale.",
    priorita: 1
  },
  
  {
    id: 'manager_completo',
    nome: 'Manager Completo',
    tipo: 'positivo',
    condition: (t) => t.LDR > 44 && t.DET > 35 && t.HRM > 10 && t.PRO > 20,
    testo: "[Nome] ha il profilo del manager completo: influenza (LDR), delega (DET), fa crescere (HRM) e collabora (PRO). Questa combinazione è quella che ogni azienda cerca per i ruoli di responsabilità. Non solo guida - guida BENE.",
    priorita: 2
  },
  
  {
    id: 'esecutore_ideale',
    nome: 'Esecutore Ideale',
    tipo: 'positivo',
    condition: (t) => t.ADS > 44 && t.ORG > 40 && t.PRO > 20 && t.GP > 30,
    testo: "[Nome] è l'esecutore ideale: organizzata, disciplinata, collaborativa e senza pressioni emotive. Metti questa persona su un progetto e sai che verrà portato a termine con qualità e senza drammi.",
    priorita: 3
  },
  
  // ==========================================
  // PATTERN CRITICI
  // ==========================================
  
  {
    id: 'sognatore_non_realizza',
    nome: 'Sognatore che Non Realizza',
    tipo: 'critico',
    condition: (t, macro) => macro.essere > 60 && macro.fare < 40,
    testo: "C'è un grande divario tra ciò che [Nome] pensa e ciò che fa. Ha visione e ambizione ma non le traduce in azione. È il classico profilo del 'sognatore che non realizza': parla di progetti grandiosi ma non ne completa nessuno. Il rischio è la frustrazione cronica: sa perfettamente dove vuole andare ma non ci arriva. E questo genera rabbia silenziosa verso se stessa e verso gli altri. Il lavoro più importante è sull'AREA FARE: costruire abitudini di esecuzione, disciplina quotidiana, capacità di dire le cose.",
    priorita: 1
  },
  
  {
    id: 'lavoratore_solitario',
    nome: 'Lavoratore Solitario',
    tipo: 'critico',
    condition: (t, macro) => macro.fare > 60 && macro.avere < 35,
    testo: "[Nome] lavora moltissimo ma in solitudine. Fa, produce, esegue - però non costruisce relazioni. È la persona che arriva prima di tutti e va via per ultima, ma nessuno se ne accorge. Il rischio è il burnout: lavora tanto senza il supporto degli altri e prima o poi il carico diventa insostenibile. Ancora più grave: senza relazioni, il suo lavoro non viene riconosciuto e non genera le opportunità che meriterebbe.",
    priorita: 2
  },
  
  {
    id: 'relazionale_senza_direzione',
    nome: 'Relazionale Senza Direzione',
    tipo: 'critico',
    condition: (t, macro) => macro.avere > 60 && macro.essere < 40,
    testo: "[Nome] è bravissima con le persone ma non sa dove sta andando. Costruisce relazioni ampie, è amata dai colleghi, ha una rete estesa - ma senza una direzione. È la persona che tutti vogliono a pranzo ma nessuno mette a capo di un progetto. Il suo talento relazionale viene sprecato perché manca il contenuto: visione, pianificazione, ambizione.",
    priorita: 2
  },
  
  {
    id: 'ambizione_senza_disciplina',
    nome: 'Ambizione Senza Disciplina',
    tipo: 'critico',
    condition: (t) => t.AUT > 60 && t.ADS < 20,
    testo: "Grande ambizione, pochissima disciplina. [Nome] sogna in grande ma non fa il lavoro quotidiano necessario per arrivarci. Parla di progetti grandiosi che poi non porta a termine. Ha entusiasmo a fiumi per le nuove idee e zero costanza nel portarle avanti. È il classico 'grande inizio, nessun finale'. Ha bisogno di qualcuno che la tenga con i piedi per terra e le insegni che i risultati si costruiscono con il lavoro monotono di ogni giorno, non con i lampi di genio.",
    priorita: 1
  },
  
  {
    id: 'troppo_buona',
    nome: 'Troppo Buona per il Suo Bene',
    tipo: 'critico',
    condition: (t) => t.DET < 20 && t.PRO > 30,
    testo: "[Nome] è troppo buona per il suo bene. Aiuta tutti ma non chiede niente in cambio. Si carica dei problemi altrui senza mai dire 'basta'. Si fa in quattro per gli altri e non si concede il diritto di chiedere aiuto, riconoscimento o supporto. Questo la porta al sovraccarico cronico e alla frustrazione silenziosa. Le persone intorno a lei la danno per scontata perché lei non fa nulla per ricordare che anche lei ha bisogno.",
    priorita: 3
  },
  
  {
    id: 'comunicatore_sordo',
    nome: 'Comunicatore Sordo',
    tipo: 'critico',
    condition: (t) => t.VEN > 50 && t.COM < 0,
    testo: "[Nome] sa coinvolgere ma non sa ascoltare. Comunica, trascina, entusiasma - ma in una sola direzione: la sua. Non accoglie il feedback, non ascolta le obiezioni, non considera i punti di vista diversi. All'inizio le persone si entusiasmano, ma col tempo si stancano di non essere ascoltate e la fiducia crolla.",
    priorita: 2
  },
  
  {
    id: 'perfezionista_intollerante',
    nome: 'Perfezionista Intollerante',
    tipo: 'critico',
    condition: (t) => t.ORG > 50 && t.RC > 45 && t.COM < 0,
    testo: "[Nome] è la perfezionista intollerante: organizzata, precisa, rigida e critica. Vuole che tutto funzioni secondo le sue regole e non tollera deviazioni. Le persone intorno a lei si sentono controllate, giudicate e soffocate. Produce risultati di altissima qualità MA a un costo umano elevato. Se gestisce persone, il turnover sarà alto.",
    priorita: 2
  },
  
  {
    id: 'bomba_orologeria',
    nome: 'Bomba a Orologeria',
    tipo: 'critico',
    condition: (t) => t.AUT > 50 && t.GP < 21 && t.DET > 40,
    testo: "[Nome] è ambiziosa, sotto pressione e molto diretta. Questa combinazione la rende una bomba a orologeria: ha l'energia, ha la voglia di affermarsi, ha la bocca per dirlo - e ha qualcuno che la sta facendo impazzire. In queste condizioni, la sua determinazione diventa aggressività, la sua ambizione diventa rivalsa, la sua schiettezza diventa provocazione. Può ottenere risultati straordinari ma anche creare conflitti devastanti.",
    priorita: 1
  },
  
  {
    id: 'leader_demotivante',
    nome: 'Leader che Demotiva',
    tipo: 'critico',
    condition: (t) => t.HRM < 0 && t.LDR > 30,
    testo: "[Nome] vuole guidare ma non sa far crescere le persone. Ha l'istinto del leader ma demotiva chi gestisce. È come un capitano che ispira la ciurma dalla prua ma poi affonda la nave con le sue decisioni. Senza un lavoro serio sullo stile di gestione, le persone migliori se ne andranno e resteranno solo quelle che non hanno alternative.",
    priorita: 1
  },
  
  {
    id: 'lavora_non_monetizza',
    nome: 'Lavora Ma Non Monetizza',
    tipo: 'critico',
    condition: (t) => t.FIN < 0 && t.AUT > 40 && t.ADS > 30,
    testo: "[Nome] lavora sodo e ci crede, ma non riesce a monetizzare il proprio valore. Il problema non è l'impegno - è qualcosa di più profondo. Forse il prodotto/servizio che offre non ha mercato. Forse la sua strategia è sbagliata. Forse ha qualcuno accanto che erode i suoi risultati. Va indagato: una persona ambiziosa e disciplinata che non guadagna ha un blocco strutturale da trovare e rimuovere.",
    priorita: 2
  },
  
  {
    id: 'stagnazione_professionale',
    nome: 'Stagnazione Professionale',
    tipo: 'critico',
    condition: (t, macro, eta) => t.SUC < 30 && t.PRI < 30 && (eta || 0) > 35,
    testo: "[Nome] ha superato i 35 anni senza stabilità professionale e con principi disallineati. Più passa il tempo, più sarà difficile invertire la rotta. Il rischio è che si sia ormai 'adagiata' sulla convinzione che il mondo sia ingiusto e che non ci sia nulla da fare. Serve un intervento deciso: un cambio di mentalità prima ancora di un cambio di competenze.",
    priorita: 1
  },
  
  {
    id: 'paradosso_inerzia',
    nome: 'Paradosso dell\'Inerzia',
    tipo: 'critico',
    condition: (t) => t.ORG > 40 && t.AUT > 40 && t.GP > 40 && t.ADS < 20 && t.DET < 20 && t.VEN < 20 && t.HRM < 20,
    testo: "Il paradosso di [Nome]: sa perfettamente cosa dovrebbe fare ma non lo fa. Ha la direzione, ha la fiducia, ha la serenità - eppure non agisce. È come avere il motore acceso e il freno a mano tirato. Il blocco è nell'esecuzione: potrebbe essere paura del fallimento, un trauma passato legato all'azione, o una convinzione profonda che 'non ne vale la pena'. È uno dei profili più frustranti da gestire perché il potenziale c'è tutto - ma resta inespresso.",
    priorita: 1
  },
  
  {
    id: 'isolamento_totale',
    nome: 'Isolamento Professionale Totale',
    tipo: 'critico',
    condition: (t) => t.LDR < 10 && t.PRO < 10 && t.COM < 10 && t.ESP < 10,
    testo: "[Nome] è professionalmente sola. Non ha influenza, non è d'aiuto, non accoglie, non conosce persone. Questo isolamento è il freno più grande e più invisibile alla sua crescita. Nessun talento individuale può compensare l'assenza di relazioni. In un mondo interconnesso, lavorare da soli equivale a combattere con una mano legata dietro la schiena.",
    priorita: 1
  },
  
  {
    id: 'idee_senza_fare',
    nome: 'Grandi Idee Zero Fatti',
    tipo: 'critico',
    condition: (t) => t.ORG < 0 && t.AUT > 50 && t.ADS < 10,
    testo: "[Nome] ha grandi idee e zero esecuzione. È la persona che in riunione ha sempre la proposta geniale ma poi non fa nulla per realizzarla. Dopo un po', i colleghi smettono di ascoltarla perché hanno capito che alle parole non seguono mai i fatti. Per sbloccarla: assegnarle obiettivi piccolissimi e misurabili. Un passo alla volta.",
    priorita: 2
  },
  
  {
    id: 'comunicazione_unidirezionale',
    nome: 'Comunicazione Unidirezionale',
    tipo: 'critico',
    condition: (t) => t.VEN > 40 && t.DET > 40 && t.COM < -15,
    testo: "[Nome] sa parlare e sa essere diretta, ma non sa ascoltare. La sua comunicazione è potente ma unidirezionale: trasmette ma non riceve. Questo la rende efficace nel breve termine (convince, chiude, vende) ma devastante nel lungo termine (le relazioni si deteriorano, i collaboratori si demotivano, i clienti non tornano).",
    priorita: 2
  },

  // ==========================================
  // PATTERN MANCANTI DAL MANUALE V2.0
  // ==========================================

  {
    id: 'venditore_senza_etica',
    nome: 'Il Venditore Senza Etica',
    tipo: 'critico',
    condition: (t) => t.VEN > 40 && t.PRI < 30,
    testo: "[Nome] vende bene ma senza principi solidi. Questa combinazione è pericolosa: raggiunge gli obiettivi ma con metodi discutibili. Può promettere ciò che non può mantenere, gonfiare i numeri, o sacrificare la relazione di lungo termine per la chiusura immediata. Il rischio per l'azienda è reputazionale e legale.",
    priorita: 1
  },

  {
    id: 'pianificatore_solitario',
    nome: 'Il Pianificatore Solitario',
    tipo: 'critico',
    condition: (t) => t.ORG > 50 && t.ESP < 15,
    testo: "[Nome] crea piani perfetti che nessuno conosce. Organizza tutto nei minimi dettagli ma non comunica, non coinvolge, non condivide. Il risultato: piani eccellenti che restano nel cassetto perché nessuno sa che esistono. Per sbloccare questa persona, serve forzare la condivisione sistematica del suo lavoro.",
    priorita: 2
  },

  {
    id: 'ambizioso_reattivo',
    nome: "L'Ambizioso Reattivo",
    tipo: 'critico',
    condition: (t) => t.AUT > 50 && t.PRO < 10,
    testo: "[Nome] è ambizioso ma prende le critiche come attacchi personali. Ha grandi aspirazioni ma reagisce male al feedback negativo. Invece di usare le osservazioni per crescere, le vive come minacce alla sua identità. Questo crea un muro invisibile tra la persona e chi potrebbe aiutarla a migliorare.",
    priorita: 2
  },

  {
    id: 'avere_senza_essere',
    nome: "L'Avere Senza Essere",
    tipo: 'critico',
    condition: (t) => t.ESP > 49 && t.ORG < 26 && t.AUT < 30,
    testo: "[Nome] conosce tutti ma non sa dove sta andando. Ha una rete estesa, è conosciuta e apprezzata - ma senza direzione e senza ambizione. Il suo network è un asset inutilizzato perché manca il contenuto: visione, pianificazione, drive. Le relazioni restano superficiali perché non portano a nulla di concreto.",
    priorita: 2
  },

  {
    id: 'non_affrontatore',
    nome: 'Il Non-Affrontatore',
    tipo: 'critico',
    condition: (t, _macro, _eta) => {
      const mainTraits: (keyof typeof t)[] = ['ORG', 'AUT', 'GP', 'ADS', 'DET', 'VEN', 'HRM', 'LDR', 'PRO', 'COM', 'ESP'];
      const maxTrait = Math.max(...mainTraits.map(k => t[k]));
      return t.GP === maxTrait && t.GP > 0 && t.DET < 30;
    },
    testo: "[Nome] non chiude mai le situazioni. GP è il tratto più alto: significa che evita i confronti, rimanda le decisioni difficili, e non affronta i problemi di petto. Se è anche basso in DET, il quadro peggiora: ha paura di dire le cose e non chiude mai le trattative. Per ruoli commerciali o di responsabilità, questo è un blocco critico.",
    priorita: 1
  },

  {
    id: 'il_martello',
    nome: 'Il Martello',
    tipo: 'critico',
    condition: (t) => t.DET > 44 && t.COM < 0,
    testo: "[Nome] dice tutto ma non ascolta nessuno. Ha una determinazione altissima che diventa arma contundente nelle relazioni. Comunica in una sola direzione: la sua. Non accoglie obiezioni, non considera alternative, non ascolta feedback. Ottiene risultati nel breve termine ma distrugge le relazioni nel lungo termine. Le persone intorno si sentono bulldozerate, non ascoltate, non rispettate.",
    priorita: 1
  },

  {
    id: 'fuori_rotta_complessivo',
    nome: 'Fuori Rotta Complessivo',
    tipo: 'critico',
    condition: (t) => t.FIN < 15 && t.SUC < 30 && t.PRI < 20,
    testo: "[Nome] ha tutti e tre gli indicatori di prosperità al di sotto delle soglie critiche: finanze deboli, successo limitato e principi disallineati. Questo non è un singolo punto debole ma un pattern sistemico: la direzione complessiva della vita professionale è fuori rotta. Serve un intervento profondo che parta dai principi fondamentali prima ancora delle competenze tecniche.",
    priorita: 1
  },
];

// Helper per trovare tutti i pattern attivi per un profilo
export function getActivePatterns(
  traits: Record<TraitCode, number>,
  macro: { essere: number; fare: number; avere: number },
  eta?: number
): CrossPattern[] {
  return CROSS_PATTERNS
    .filter(pattern => pattern.condition(traits, macro, eta))
    .sort((a, b) => a.priorita - b.priorita);
}

// Helper per ottenere i pattern con testo personalizzato
export function getPersonalizedPatterns(
  traits: Record<TraitCode, number>,
  macro: { essere: number; fare: number; avere: number },
  nome: string,
  sesso: string | null,
  eta?: number
): { pattern: CrossPattern; testo: string }[] {
  const activePatterns = getActivePatterns(traits, macro, eta);
  
  return activePatterns.map(pattern => ({
    pattern,
    testo: personalizzaTesto(pattern.testo, nome, sesso)
  }));
}

// Separa pattern positivi e critici
export function categorizePatterns(
  patterns: { pattern: CrossPattern; testo: string }[]
): { positivi: { pattern: CrossPattern; testo: string }[]; critici: { pattern: CrossPattern; testo: string }[] } {
  return {
    positivi: patterns.filter(p => p.pattern.tipo === 'positivo'),
    critici: patterns.filter(p => p.pattern.tipo === 'critico')
  };
}
