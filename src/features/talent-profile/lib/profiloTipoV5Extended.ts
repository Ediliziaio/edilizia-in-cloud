/**
 * Testi estesi per i Profili Tipo V5
 * 
 * Descrizioni complete per ogni profilo, da usare in ExecutiveSummaryCardV5Updated
 * e altri componenti che necessitano di testi dettagliati.
 */

import { ProfiloTipoV5 } from '../types';

export interface ProfiloTipoV5Extended {
  code: ProfiloTipoV5;
  label: string;
  labelBreve: string;
  emoji: string;
  colorClass: string;
  bgColorClass: string;
  descrizioneBreve: string;
  descrizioneEstesa: string;
  puntiForza: string[];
  areeAttenzione: string[];
  contestoIdeale: string;
  ruoliIdeali: string[];
  ruoliDaEvitare: string[];
  comeGestirlo: string[];
  tempoOnboarding: string;
  probabilitaSuccesso: { min: number; max: number };
}

export const PROFILI_TIPO_V5_EXTENDED: Record<ProfiloTipoV5, ProfiloTipoV5Extended> = {
  LEADER: {
    code: 'LEADER',
    label: 'Leader Naturale',
    labelBreve: 'Leader',
    emoji: '👑',
    colorClass: 'text-emerald-700 dark:text-emerald-400',
    bgColorClass: 'bg-emerald-50 dark:bg-emerald-950/30',
    descrizioneBreve: 'Profilo eccellente in tutte le aree. Pronto per responsabilità elevate.',
    descrizioneEstesa: `Questo profilo rappresenta l'eccellenza professionale completa. La persona dimostra padronanza in tutte e tre le macro-aree: sa PENSARE in modo strutturato (ESSERE), sa AGIRE con efficacia (FARE), e sa COSTRUIRE relazioni che generano valore (AVERE). È raro trovare un equilibrio così marcato.

Può guidare team, gestire progetti complessi e rappresentare l'azienda verso l'esterno. Non ha bisogno di supervisione stretta: si auto-motiva, si auto-organizza e produce risultati in autonomia. Il suo impatto sul team è tipicamente positivo: alza il livello di tutti.

Attenzione: un profilo così forte può annoiarsi se non gli vengono date sfide adeguate. Richiede ruoli con reale responsabilità e autonomia decisionale.`,
    puntiForza: [
      'Visione strategica e capacità esecutiva',
      'Auto-motivazione e disciplina elevate',
      'Capacità di influenzare positivamente gli altri',
      'Gestione efficace dello stress',
      'Affidabilità e coerenza comportamentale'
    ],
    areeAttenzione: [
      'Può sottovalutare chi ha ritmi diversi',
      'Rischio di accentrare troppo',
      'Necessita sfide continue per rimanere motivato'
    ],
    contestoIdeale: 'Aziende in crescita, ruoli con autonomia decisionale, progetti strategici',
    ruoliIdeali: ['Direzione Generale', 'Direzione Commerciale', 'HR Manager', 'Project Manager Senior'],
    ruoliDaEvitare: ['Ruoli puramente operativi', 'Posizioni senza autonomia', 'Back-office routinario'],
    comeGestirlo: [
      'Affidagli progetti sfidanti con obiettivi ambiziosi',
      'Dagli autonomia decisionale e responsabilità reali',
      'Coinvolgilo nelle decisioni strategiche',
      'Offrigli percorsi di crescita chiari'
    ],
    tempoOnboarding: '1-2 mesi',
    probabilitaSuccesso: { min: 80, max: 95 }
  },

  STRATEGIST: {
    code: 'STRATEGIST',
    label: 'Stratega Visionario',
    labelBreve: 'Strategist',
    emoji: '🎯',
    colorClass: 'text-blue-700 dark:text-blue-400',
    bgColorClass: 'bg-blue-50 dark:bg-blue-950/30',
    descrizioneBreve: 'Forte pensiero strategico, necessita supporto nell\'esecuzione.',
    descrizioneEstesa: `Questo profilo eccelle nel PENSARE: ha visione, sa organizzare le idee, si motiva autonomamente. Tuttavia, presenta un gap significativo nell'area del FARE: le idee non sempre si traducono in azioni concrete.

È il classico "architetto" che disegna strutture brillanti ma che ha bisogno di "muratori" per costruirle. In un contesto giusto, può essere una risorsa strategica preziosa. In un contesto sbagliato (ruolo operativo, deadline stringenti, lavoro solitario), può diventare frustrante per sé e per gli altri.

La chiave è affiancargli figure complementari che trasformino le sue visioni in piani esecutivi. Non metterlo mai da solo su progetti che richiedono completamento autonomo.`,
    puntiForza: [
      'Visione strategica e capacità di pianificazione',
      'Auto-motivazione e fiducia in sé',
      'Capacità di vedere il quadro generale',
      'Creatività e pensiero laterale'
    ],
    areeAttenzione: [
      'Difficoltà nel passare dall\'idea all\'azione',
      'Tendenza a procrastinare sui dettagli',
      'Può perdere interesse una volta definita la strategia',
      'Rischio di "paralisi da analisi"'
    ],
    contestoIdeale: 'Ruoli di consulenza, pianificazione, business development, con team esecutivo di supporto',
    ruoliIdeali: ['Consulente Strategico', 'Business Developer', 'Product Manager', 'Analista Senior'],
    ruoliDaEvitare: ['Responsabile Operativo', 'Ruoli con deadline quotidiane', 'Posizioni isolate'],
    comeGestirlo: [
      'Affiancargli un "esecutore" che trasformi le sue idee in azioni',
      'Definire checkpoint intermedi per evitare dispersione',
      'Valorizzare i suoi contributi strategici pubblicamente',
      'Non caricarlo di task operativi ripetitivi'
    ],
    tempoOnboarding: '2-3 mesi',
    probabilitaSuccesso: { min: 60, max: 75 }
  },

  EXECUTOR: {
    code: 'EXECUTOR',
    label: 'Esecutore Affidabile',
    labelBreve: 'Executor',
    emoji: '⚡',
    colorClass: 'text-amber-700 dark:text-amber-400',
    bgColorClass: 'bg-amber-50 dark:bg-amber-950/30',
    descrizioneBreve: 'Eccellente nell\'azione e nei risultati. Potrebbe beneficiare di sviluppo strategico.',
    descrizioneEstesa: `Questo profilo è una macchina da guerra operativa: disciplinato, determinato, capace di portare a termine ciò che inizia. L'area FARE è il suo punto di forza assoluto. Tuttavia, l'area ESSERE (pensiero strategico) è meno sviluppata.

È la persona che vuoi quando c'è da "chiudere" un progetto, gestire una crisi operativa, o garantire che le cose vengano fatte. Non è il profilo che genera visioni innovative, ma è quello che le realizza.

Attenzione a non metterlo in ruoli che richiedono pianificazione strategica autonoma. Funziona al meglio quando riceve direzione chiara e ha libertà sui "come", non sui "cosa".`,
    puntiForza: [
      'Affidabilità estrema nell\'esecuzione',
      'Determinazione e capacità di "chiudere"',
      'Disciplina e rispetto delle scadenze',
      'Orientamento concreto ai risultati'
    ],
    areeAttenzione: [
      'Meno efficace nella pianificazione a lungo termine',
      'Può faticare con ambiguità e cambiamenti frequenti',
      'Rischio di "tunnel vision" sui task',
      'Necessita direzione strategica esterna'
    ],
    contestoIdeale: 'Ruoli operativi con obiettivi chiari, project management, operations',
    ruoliIdeali: ['Responsabile Operativo', 'Project Manager', 'Responsabile Produzione', 'Sales Executive'],
    ruoliDaEvitare: ['Ruoli puramente strategici', 'Posizioni di staff senza deliverable concreti'],
    comeGestirlo: [
      'Fornirgli obiettivi chiari e misurabili',
      'Lasciarlo libero sui metodi una volta definiti i goal',
      'Riconoscere pubblicamente i risultati ottenuti',
      'Supportarlo con visione strategica quando necessario'
    ],
    tempoOnboarding: '1-2 mesi',
    probabilitaSuccesso: { min: 70, max: 85 }
  },

  SPECIALIST: {
    code: 'SPECIALIST',
    label: 'Specialista Tecnico',
    labelBreve: 'Specialist',
    emoji: '🔬',
    colorClass: 'text-purple-700 dark:text-purple-400',
    bgColorClass: 'bg-purple-50 dark:bg-purple-950/30',
    descrizioneBreve: 'Competenze verticali di alto livello. Ideale per ruoli tecnici.',
    descrizioneEstesa: `Questo profilo presenta un picco marcato in una specifica area, con le altre meno sviluppate. È il classico "esperto di settore": eccelle nel suo dominio ma può faticare in contesti che richiedono competenze trasversali.

Può essere una risorsa preziosa in ruoli che richiedono expertise profonda. Non è il profilo da mettere in posizioni generaliste o che richiedono flessibilità su più fronti.

La chiave è capire QUALE sia l'area di eccellenza e posizionarlo di conseguenza. Uno specialista ESSERE sarà diverso da uno specialista FARE.`,
    puntiForza: [
      'Expertise profonda in un\'area specifica',
      'Affidabilità nel proprio dominio',
      'Focus e concentrazione elevati',
      'Contributo tecnico di alto valore'
    ],
    areeAttenzione: [
      'Meno flessibile su compiti fuori dal proprio ambito',
      'Può faticare in team molto eterogenei',
      'Rischio di isolamento professionale',
      'Necessita ruoli coerenti con la specializzazione'
    ],
    contestoIdeale: 'Ruoli tecnici specialistici, consulenza di settore, R&D',
    ruoliIdeali: ['Responsabile Tecnico', 'Specialista di Prodotto', 'Consulente Tecnico', 'Buyer Specializzato'],
    ruoliDaEvitare: ['Ruoli generalisti', 'Posizioni che richiedono competenze trasversali'],
    comeGestirlo: [
      'Valorizzare la sua expertise specifica',
      'Non forzarlo in ruoli generalisti',
      'Coinvolgerlo come "esperto" nelle decisioni di settore',
      'Offrire percorsi di crescita verticale'
    ],
    tempoOnboarding: '2-3 mesi',
    probabilitaSuccesso: { min: 65, max: 80 }
  },

  GROWTH_POTENTIAL: {
    code: 'GROWTH_POTENTIAL',
    label: 'Potenziale in Crescita',
    labelBreve: 'Growth',
    emoji: '🌱',
    colorClass: 'text-teal-700 dark:text-teal-400',
    bgColorClass: 'bg-teal-50 dark:bg-teal-950/30',
    descrizioneBreve: 'Profilo equilibrato con margini di crescita. Investimento a medio termine.',
    descrizioneEstesa: `Questo profilo presenta un equilibrio tra le aree, con tutte le macro-aree in fascia media (40-60%). Non ci sono eccellenze evidenti, ma nemmeno carenze critiche. È un profilo "base solida" su cui costruire.

La buona notizia: non ci sono sindromi gravi e il profilo è lavorabile. La sfida: richiede investimento in formazione e sviluppo per esprimere il potenziale.

È il classico profilo "junior promettente" o "professionista in transizione" che può crescere significativamente con il giusto supporto. Non aspettarti risultati immediati, ma con pazienza può diventare una risorsa preziosa.`,
    puntiForza: [
      'Equilibrio tra le diverse aree',
      'Assenza di criticità bloccanti',
      'Plasticità e capacità di apprendimento',
      'Base solida su cui costruire'
    ],
    areeAttenzione: [
      'Nessuna eccellenza distintiva immediata',
      'Richiede investimento in sviluppo',
      'Risultati non immediati',
      'Necessita mentoring e guida'
    ],
    contestoIdeale: 'Ruoli entry-level con percorso di crescita, aziende con programmi di sviluppo',
    ruoliIdeali: ['Junior con percorso strutturato', 'Ruoli operativi con training on the job', 'Posizioni con mentoring'],
    ruoliDaEvitare: ['Ruoli senior autonomi', 'Posizioni che richiedono risultati immediati'],
    comeGestirlo: [
      'Definire un piano di sviluppo a 12-24 mesi',
      'Affiancargli un mentor esperto',
      'Feedback frequenti e costruttivi',
      'Celebrare i progressi incrementali'
    ],
    tempoOnboarding: '3-6 mesi',
    probabilitaSuccesso: { min: 50, max: 70 }
  },

  IN_TRANSIZIONE: {
    code: 'IN_TRANSIZIONE',
    label: 'Profilo in Transizione',
    labelBreve: 'Transizione',
    emoji: '🔄',
    colorClass: 'text-orange-700 dark:text-orange-400',
    bgColorClass: 'bg-orange-50 dark:bg-orange-950/30',
    descrizioneBreve: 'Profilo in evoluzione. Richiede attenzione e supporto specifico.',
    descrizioneEstesa: `Questo profilo presenta pattern misti e potenzialmente alcune sindromi attive. Non è un "no" definitivo, ma richiede attenzione e valutazione approfondita.

Può trattarsi di una persona che sta attraversando un momento di cambiamento (personale o professionale), oppure di un profilo che ha sviluppato alcune competenze a scapito di altre in modo disomogeneo.

Prima di decidere, è fondamentale un colloquio approfondito per capire il contesto. Alcune sindromi sono temporanee (legate a stress), altre sono strutturali. La differenza cambia tutto.`,
    puntiForza: [
      'Potenziale sottostante da esplorare',
      'Possibile crescita se supportato',
      'Alcune aree possono essere solide'
    ],
    areeAttenzione: [
      'Pattern comportamentali da verificare',
      'Sindromi potenzialmente attive',
      'Richiede colloquio approfondito',
      'Non adatto a ruoli critici senza verifica'
    ],
    contestoIdeale: 'Ruoli con supervisione, contesti supportivi, posizioni con margine di errore',
    ruoliIdeali: ['Ruoli operativi con supervisione', 'Posizioni non critiche', 'Team con supporto'],
    ruoliDaEvitare: ['Ruoli ad alta responsabilità', 'Posizioni isolate', 'Contesti ad alto stress'],
    comeGestirlo: [
      'Colloquio approfondito prima di decidere',
      'Se assunto, supervisione attenta nei primi mesi',
      'Verificare periodicamente lo stato',
      'Essere pronti a intervenire se necessario'
    ],
    tempoOnboarding: '3-6 mesi con monitoraggio',
    probabilitaSuccesso: { min: 35, max: 55 }
  },

  CRITICAL: {
    code: 'CRITICAL',
    label: 'Profilo Critico',
    labelBreve: 'Critico',
    emoji: '⚠️',
    colorClass: 'text-red-700 dark:text-red-400',
    bgColorClass: 'bg-red-50 dark:bg-red-950/30',
    descrizioneBreve: 'Sindromi critiche rilevate. Valutazione approfondita necessaria.',
    descrizioneEstesa: `Questo profilo presenta almeno una sindrome critica (S01-S04). Queste sindromi sono considerate bloccanti perché associate a comportamenti che possono danneggiare team, clienti o l'organizzazione.

NON significa che la persona sia "cattiva" - può essere in un momento di difficoltà estrema, può avere sviluppato pattern disfunzionali per esperienze passate, o può semplicemente non essere adatta a contesti lavorativi strutturati.

La raccomandazione standard è NON PROCEDERE con l'assunzione. Se per motivi specifici si decide comunque di proseguire, è fondamentale un piano di gestione del rischio con monitoraggio costante.`,
    puntiForza: [
      'Può avere competenze tecniche valide',
      'In rari casi, il contesto può essere temporaneo'
    ],
    areeAttenzione: [
      'Sindromi critiche attive (S01-S04)',
      'Rischio elevato per team e organizzazione',
      'Pattern comportamentali problematici',
      'Non adatto alla maggior parte dei ruoli'
    ],
    contestoIdeale: 'Sconsigliato in contesti organizzativi standard',
    ruoliIdeali: [],
    ruoliDaEvitare: ['Tutti i ruoli con interazione con altri', 'Ruoli con clienti', 'Posizioni di responsabilità'],
    comeGestirlo: [
      'Raccomandazione standard: NON ASSUMERE',
      'Se già in organico: piano di uscita o isolamento',
      'Mai affidare nuovi assunti o junior',
      'Documentare attentamente ogni comportamento'
    ],
    tempoOnboarding: 'N/A - Non raccomandato',
    probabilitaSuccesso: { min: 10, max: 30 }
  }
};

/**
 * Ottiene i testi estesi per un profilo tipo V5
 */
export function getProfiloTipoV5Extended(profiloTipo: ProfiloTipoV5): ProfiloTipoV5Extended {
  return PROFILI_TIPO_V5_EXTENDED[profiloTipo];
}

/**
 * Ottiene i ruoli alternativi consigliati in base al profilo tipo
 */
export function getRuoliAlternativi(
  profiloTipoV5: ProfiloTipoV5,
  ruoloRichiesto: string
): string[] {
  const profilo = PROFILI_TIPO_V5_EXTENDED[profiloTipoV5];
  // Filtra il ruolo richiesto dai ruoli ideali
  return profilo.ruoliIdeali.filter(r => 
    r.toLowerCase() !== ruoloRichiesto.toLowerCase()
  );
}
