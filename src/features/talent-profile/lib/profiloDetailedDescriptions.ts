/**
 * Descrizioni Complete per ogni Profilo - Manuale Talent Profiler V5
 * 
 * Per ogni profilo include:
 * - Chi è questa persona
 * - Cosa la motiva
 * - Cosa la blocca/teme
 * - Come gestirla in azienda
 * - Cosa darle
 * - Cosa NON darle
 * - Come farla crescere
 * - Errori da evitare
 * - Ruoli ideali
 */

import { ProfiloTipo } from '../types';

export interface AspettativeTemporali {
  breveTermine: string;  // Primi 3 mesi
  medioTermine: string;  // 3-12 mesi
  lungoTermine: string;  // Oltre 12 mesi
}

export interface ProfiloDetailedDescription {
  tipo: ProfiloTipo;
  titolo: string;
  motto: string;
  chiE: string;
  cosaMotiva: string[];
  cosaBlocca: string[];
  comeGestirlo: string[];
  cosaDare: string[];
  cosaNonDare: string[];
  comeFarloCrescere: string[];
  erroriEvitare: string[];
  ruoliIdeali: string[];
  alertHR: string;
  livelloRischio: 'basso' | 'medio' | 'alto';
  potenzialeCrescita: 'limitato' | 'moderato' | 'elevato';
  aspettativeTemporali: AspettativeTemporali;
}

export const PROFILI_DETAILED: Record<ProfiloTipo, ProfiloDetailedDescription> = {
  'LEADER_NATURALE': {
    tipo: 'LEADER_NATURALE',
    titolo: 'Leader Naturale',
    motto: '"Dammi una visione e la realizzerò."',
    chiE: 'Capitano nato. Assume responsabilità totale, guida con carisma, ispira il team. Alta capacità decisionale combinata con resilienza allo stress. Vede il quadro generale e sa tradurlo in azione.',
    cosaMotiva: [
      'Potere decisionale reale',
      'Visione strategica da realizzare',
      'Team da guidare e sviluppare',
      'Riconoscimento della leadership',
      'Sfide significative',
    ],
    cosaBlocca: [
      'Micromanagement dall\'alto',
      'Decisioni calate senza coinvolgimento',
      'Burocrazia che rallenta l\'azione',
      'Team passivo o resistente',
      'Mancanza di risorse per agire',
    ],
    comeGestirlo: [
      'Delegare responsabilità reali con autonomia',
      'Coinvolgerlo nelle decisioni strategiche',
      'Dargli obiettivi sfidanti e risorse adeguate',
      'Riconoscere pubblicamente i suoi risultati',
      'Proteggerlo dalla burocrazia inutile',
    ],
    cosaDare: [
      'Autorità decisionale effettiva',
      'Team competente da gestire',
      'Budget adeguato',
      'Accesso al management',
      'Visibilità interna ed esterna',
    ],
    cosaNonDare: [
      'Responsabilità senza potere',
      'Obiettivi impossibili senza risorse',
      'Micromanagement',
      'Ruoli puramente esecutivi',
      'Isolamento dalle decisioni',
    ],
    comeFarloCrescere: [
      'Exposure al board/top management',
      'Progetti cross-funzionali',
      'Mentoring executive',
      'Gestione di crisi/turnaround',
      'Formazione su competenze strategiche',
    ],
    erroriEvitare: [
      'Sottovalutare il suo ego (va gestito, non ignorato)',
      'Non riconoscere pubblicamente i risultati',
      'Dargli un team inadeguato',
      'Limitare la sua autonomia decisionale',
      'Ignorare i suoi input strategici',
    ],
    ruoliIdeali: ['Direzione generale', 'Business Unit Manager', 'Direttore Commerciale', 'COO'],
    alertHR: 'Risorsa strategica. Alto potenziale di impatto ma richiede gestione attenta dell\'ego e spazio per esprimersi.',
    livelloRischio: 'basso',
    potenzialeCrescita: 'elevato',
    aspettativeTemporali: {
      breveTermine: 'Valutazione rapida dell\'ambiente e del team. Testerà i confini della sua autonomia e identificherà alleati e ostacoli. Aspettatevi proposte di cambiamento precoci.',
      medioTermine: 'Costruzione progressiva di influenza e risultati misurabili. Richiederà sempre più spazio decisionale. Performance eccellente se supportato.',
      lungoTermine: 'Se valorizzato e promosso, loyalty altissima. Se frustrato o bloccato, alto rischio di uscita verso posizioni di maggior responsabilità altrove.',
    },
  },

  'COMMERCIALE_NATURALE': {
    tipo: 'COMMERCIALE_NATURALE',
    titolo: 'Commerciale Naturale',
    motto: '"Le relazioni sono il mio carburante."',
    chiE: 'Cacciatore nato. Vive per la conquista commerciale, ama le relazioni, si energizza con il contatto umano. Sa adattarsi a interlocutori diversi e chiudere le trattative. Ambizioso e orientato al risultato economico.',
    cosaMotiva: [
      'Bonus legati ai risultati concreti',
      'Sfide commerciali ambiziose',
      'Riconoscimento pubblico dei successi',
      'Autonomia di movimento',
      'Varietà di clienti e situazioni',
    ],
    cosaBlocca: [
      'Procedure rigide e burocratiche',
      'Lavoro da scrivania/back office',
      'Obiettivi irraggiungibili',
      'Micromanagement quotidiano',
      'Mancanza di incentivi chiari',
    ],
    comeGestirlo: [
      'Target ambiziosi ma raggiungibili',
      'Libertà di gestione del tempo',
      'Feedback frequenti sui risultati',
      'Incentivi chiari e immediati',
      'Celebrazione pubblica dei successi',
    ],
    cosaDare: [
      'Portafoglio clienti sfidante',
      'Sistema incentivante motivante',
      'Auto/benefit per mobilità',
      'Strumenti CRM efficienti',
      'Formazione sulle tecniche di vendita avanzate',
    ],
    cosaNonDare: [
      'Compiti amministrativi eccessivi',
      'Ruoli statici/da scrivania',
      'Regole troppo stringenti',
      'Clienti già saturi senza potenziale',
      'Obiettivi senza leva commerciale',
    ],
    comeFarloCrescere: [
      'Key Account Management',
      'Team Lead commerciale',
      'Business Development',
      'Negoziazione complessa',
      'Gestione grandi clienti',
    ],
    erroriEvitare: [
      'Limitare la sua autonomia di movimento',
      'Non celebrare i successi',
      'Assegnare clienti senza potenziale',
      'Sovraccaricarlo di burocrazia',
      'Ignorare il suo bisogno di riconoscimento',
    ],
    ruoliIdeali: ['Ufficio vendite', 'Business Development', 'Account Manager', 'Sales Manager'],
    alertHR: 'Ottima risorsa commerciale se gli incentivi sono chiari. Rischio: può perdere interesse se non vede risultati economici.',
    livelloRischio: 'basso',
    potenzialeCrescita: 'elevato',
    aspettativeTemporali: {
      breveTermine: 'Entusiasmo iniziale e rapida costruzione di relazioni. Potrebbe sottovalutare procedure aziendali per concentrarsi subito sui clienti.',
      medioTermine: 'Picco di performance se gli incentivi sono chiari e raggiungibili. Rischio calo motivazionale se non vede risultati economici concreti.',
      lungoTermine: 'Fedeltà condizionata ai guadagni. Potrebbe cercare alternative se si sente sottopagato o se il piano provvigionale diventa meno attraente.',
    },
  },

  'ESECUTORE_AFFIDABILE': {
    tipo: 'ESECUTORE_AFFIDABILE',
    titolo: 'Esecutore Affidabile',
    motto: '"Dammi le regole e le rispetto alla perfezione."',
    chiE: 'Pilastro operativo. Combina alta efficienza con rispetto delle procedure. Affidabile, costante, preciso. Non cerca protagonismo ma garantisce che le cose funzionino.',
    cosaMotiva: [
      'Procedure chiare e stabili',
      'Riconoscimento della costanza',
      'Ambiente ordinato e prevedibile',
      'Feedback positivo sulla qualità',
      'Stabilità lavorativa',
    ],
    cosaBlocca: [
      'Caos e disorganizzazione',
      'Cambiamenti continui senza preavviso',
      'Mancanza di procedure',
      'Responsabilità decisionali complesse',
      'Pressione temporale estrema',
    ],
    comeGestirlo: [
      'Fornire procedure documentate',
      'Comunicare cambiamenti con anticipo',
      'Riconoscere la qualità del lavoro',
      'Proteggere dalla pressione eccessiva',
      'Mantenere stabilità ambientale',
    ],
    cosaDare: [
      'Procedure chiare e scritte',
      'Strumenti di lavoro adeguati',
      'Tempo per fare bene le cose',
      'Feedback costruttivo',
      'Ambiente ordinato',
    ],
    cosaNonDare: [
      'Improvvisazione continua',
      'Responsabilità strategiche',
      'Ruoli commerciali/relazionali spinti',
      'Deadline impossibili',
      'Ambiguità sui compiti',
    ],
    comeFarloCrescere: [
      'Specializzazione tecnica',
      'Responsabilità di processo',
      'Formatore interno',
      'Referente qualità',
      'Ruoli di controllo',
    ],
    erroriEvitare: [
      'Chiedere creatività/improvvisazione',
      'Ignorare il suo bisogno di ordine',
      'Cambiare spesso le regole',
      'Non riconoscere la costanza',
      'Esporlo a clienti difficili',
    ],
    ruoliIdeali: ['Amministrazione', 'Produzione', 'Controllo Qualità', 'Operations'],
    alertHR: 'Risorsa stabile e affidabile. Non cercate in lui iniziativa o creatività, ma precisione e costanza.',
    livelloRischio: 'basso',
    potenzialeCrescita: 'moderato',
    aspettativeTemporali: {
      breveTermine: 'Curva di apprendimento sulle procedure aziendali. Richiede guida iniziale e documentazione chiara. Non aspettatevi iniziativa spontanea.',
      medioTermine: 'Performance costante e affidabile una volta inserito. Affidabilità crescente con la familiarità delle procedure.',
      lungoTermine: 'Risorsa stabile e prevedibile. Non aspettatevi che cerchi promozioni attivamente, ma loyalty alta se trattato bene.',
    },
  },

  'CREATIVO_DESTABILIZZANTE': {
    tipo: 'CREATIVO_DESTABILIZZANTE',
    titolo: 'Creativo Destabilizzante',
    motto: '"Le regole sono fatte per essere ripensate."',
    chiE: 'Innovatore irrequieto. Alta flessibilità e creatività, ma scarsa disciplina. Porta idee fresche ma può destabilizzare ambienti strutturati. Difficile da gestire in contesti rigidi.',
    cosaMotiva: [
      'Libertà creativa',
      'Progetti innovativi',
      'Riconoscimento delle idee',
      'Varietà di stimoli',
      'Sfide non convenzionali',
    ],
    cosaBlocca: [
      'Procedure rigide',
      'Routine ripetitive',
      'Micromanagement',
      'Ambiente conservatore',
      'Mancanza di ascolto',
    ],
    comeGestirlo: [
      'Dare spazio per sperimentare (controllato)',
      'Affiancare con profilo metodico',
      'Focalizzare su progetti specifici',
      'Valorizzare le idee migliori',
      'Impostare deadline flessibili ma chiare',
    ],
    cosaDare: [
      'Progetti innovativi',
      'Tempo per pensare/sperimentare',
      'Ascolto delle idee',
      'Team che complementa le debolezze',
      'Riconoscimento della creatività',
    ],
    cosaNonDare: [
      'Ruoli procedurali',
      'Compiti ripetitivi',
      'Ambiente rigido',
      'Micromanagement',
      'Isolamento',
    ],
    comeFarloCrescere: [
      'Innovation Lab',
      'R&D',
      'Startup interne',
      'Progetti speciali',
      'Ruoli di design/UX',
    ],
    erroriEvitare: [
      'Metterlo in ruoli procedurali',
      'Ignorare le sue idee',
      'Aspettarsi precisione esecutiva',
      'Lasciarlo senza supervisione',
      'Inserirlo in team troppo rigidi',
    ],
    ruoliIdeali: ['R&D', 'Marketing creativo', 'Design', 'Startup', 'Innovation'],
    alertHR: 'Potenziale innovativo alto ma rischio operativo. Necessita environment giusto e supervisione.',
    livelloRischio: 'medio',
    potenzialeCrescita: 'elevato',
    aspettativeTemporali: {
      breveTermine: 'Luna di miele creativa con idee fresche. Rischio disorganizzazione e scontro con procedure esistenti. Monitorare l\'integrazione.',
      medioTermine: 'Possibile scontro con la struttura se non gestito. Potenziale conflitto con profili metodici. O porta valore innovativo o crea tensioni.',
      lungoTermine: 'O si integra nel contesto (raro) o cerca ambienti più liberi e creativi. Turnover medio-alto se frustrato.',
    },
  },

  'TECNICO_SPECIALISTA': {
    tipo: 'TECNICO_SPECIALISTA',
    titolo: 'Tecnico Specialista',
    motto: '"La competenza è tutto."',
    chiE: 'Expert solitario. Altissima competenza tecnica, preferisce lavorare sui problemi piuttosto che sulle persone. Schematico e metodico, eccellente nel suo campo specifico.',
    cosaMotiva: [
      'Sfide tecniche complesse',
      'Riconoscimento della competenza',
      'Autonomia operativa',
      'Aggiornamento continuo',
      'Problemi da risolvere',
    ],
    cosaBlocca: [
      'Gestione persone forzata',
      'Meeting infiniti',
      'Politica aziendale',
      'Mancanza di strumenti adeguati',
      'Semplificazione eccessiva',
    ],
    comeGestirlo: [
      'Assegnare problemi tecnici sfidanti',
      'Proteggere da meeting inutili',
      'Riconoscere la competenza pubblicamente',
      'Fornire strumenti adeguati',
      'Lasciare autonomia operativa',
    ],
    cosaDare: [
      'Formazione tecnica avanzata',
      'Strumenti all\'avanguardia',
      'Progetti complessi',
      'Tempo per concentrarsi',
      'Riconoscimento dell\'expertise',
    ],
    cosaNonDare: [
      'Ruoli di gestione persone',
      'Compiti commerciali',
      'Presentazioni frequenti',
      'Interrupt continui',
      'Semplificazioni eccessive',
    ],
    comeFarloCrescere: [
      'Senior Technical path',
      'Tech Lead (tecnico, non gestionale)',
      'Specializzazione di nicchia',
      'Mentoring tecnico',
      'Certificazioni avanzate',
    ],
    erroriEvitare: [
      'Forzare ruoli manageriali',
      'Ignorare la competenza',
      'Interrompere continuamente',
      'Non investire in formazione',
      'Sottovalutare i suoi input tecnici',
    ],
    ruoliIdeali: ['Ufficio tecnico', 'R&D', 'IT Specialist', 'Ingegneria', 'Consulenza tecnica'],
    alertHR: 'Expert prezioso. Non forzatelo in ruoli gestionali. La sua competenza è il valore.',
    livelloRischio: 'basso',
    potenzialeCrescita: 'moderato',
    aspettativeTemporali: {
      breveTermine: 'Valutazione rapida delle sfide tecniche e degli strumenti disponibili. Richiede tempo per concentrarsi, non interrompete.',
      medioTermine: 'Approfondimento expertise e contributo tecnico crescente. Performance eccellente se lasciato lavorare sui problemi.',
      lungoTermine: 'Se valorizzato tecnicamente, loyalty alta. Se forzato in ruoli gestionali, rischio frustrazione e uscita.',
    },
  },

  'AMMINISTRATIVO_METODICO': {
    tipo: 'AMMINISTRATIVO_METODICO',
    titolo: 'Amministrativo Metodico',
    motto: '"L\'ordine è la base di tutto."',
    chiE: 'Guardiano delle procedure. Trova soddisfazione nella precisione, nella quadratura dei conti, nel rispetto delle scadenze. Altamente schematico, affidabile nei compiti ripetitivi.',
    cosaMotiva: [
      'Procedure definite e stabili',
      'Riconoscimento della precisione',
      'Ambiente ordinato',
      'Scadenze chiare',
      'Risultati misurabili',
    ],
    cosaBlocca: [
      'Caos organizzativo',
      'Cambiamenti frequenti',
      'Pressione temporale estrema',
      'Eccezioni continue',
      'Ambiguità nelle regole',
    ],
    comeGestirlo: [
      'Documentare le procedure',
      'Comunicare scadenze con anticipo',
      'Mantenere ambiente ordinato',
      'Limitare le eccezioni',
      'Riconoscere la precisione',
    ],
    cosaDare: [
      'Procedure scritte e aggiornate',
      'Tempo per fare le cose bene',
      'Strumenti adeguati',
      'Formazione normativa',
      'Ambiente stabile',
    ],
    cosaNonDare: [
      'Urgenze continue',
      'Compiti commerciali',
      'Ruoli di improvvisazione',
      'Responsabilità ambigue',
      'Contatto clienti difficili',
    ],
    comeFarloCrescere: [
      'Specializzazione (bilancio, fiscale, controllo gestione)',
      'Responsabilità di processo',
      'Referente compliance',
      'Formatore interno',
      'Ruoli di audit',
    ],
    erroriEvitare: [
      'Chiedere flessibilità estrema',
      'Non fornire procedure chiare',
      'Ignorare il suo bisogno di ordine',
      'Cambiare spesso le regole',
      'Esporlo a situazioni caotiche',
    ],
    ruoliIdeali: ['Amministrazione', 'Controllo Gestione', 'Compliance', 'Fiscale', 'Contabilità'],
    alertHR: 'Risorsa affidabile per ruoli procedurali. Eccellente in ambienti stabili e ordinati.',
    livelloRischio: 'basso',
    potenzialeCrescita: 'moderato',
    aspettativeTemporali: {
      breveTermine: 'Apprendimento delle procedure aziendali specifiche. Richiede documentazione chiara e tempo per assimilare.',
      medioTermine: 'Affidabilità crescente e precisione costante. Diventa riferimento per le procedure una volta inserito.',
      lungoTermine: 'Risorsa stabile e fedele. Non cercherà cambiamenti, ma garantisce continuità operativa eccellente.',
    },
  },

  'COLLABORATORE_CRESCITA': {
    tipo: 'COLLABORATORE_CRESCITA',
    titolo: 'Collaboratore in Crescita',
    motto: '"Sono pronto a imparare."',
    chiE: 'Profilo bilanciato con potenziale. Punteggi nella media con margini di sviluppo. Persona stabile che può crescere con il giusto investimento formativo e gestionale.',
    cosaMotiva: [
      'Opportunità di crescita',
      'Formazione e sviluppo',
      'Feedback costruttivo',
      'Mentoring',
      'Obiettivi progressivi',
    ],
    cosaBlocca: [
      'Stagnazione',
      'Mancanza di feedback',
      'Assenza di percorso',
      'Sottovalutazione',
      'Ruoli troppo complessi subito',
    ],
    comeGestirlo: [
      'Definire percorso di crescita',
      'Fornire feedback regolare',
      'Assegnare mentor',
      'Aumentare gradualmente responsabilità',
      'Investire in formazione',
    ],
    cosaDare: [
      'Piano di sviluppo',
      'Formazione mirata',
      'Mentor/tutor',
      'Obiettivi progressivi',
      'Feedback costruttivo',
    ],
    cosaNonDare: [
      'Responsabilità eccessive subito',
      'Stagnazione senza percorso',
      'Critiche distruttive',
      'Abbandono formativo',
      'Ruoli inadatti al livello',
    ],
    comeFarloCrescere: [
      'Formazione su competenze chiave',
      'Progetti affiancati',
      'Rotazione controllata',
      'Coaching',
      'Obiettivi SMART progressivi',
    ],
    erroriEvitare: [
      'Aspettarsi performance da senior',
      'Non investire in formazione',
      'Lasciarlo senza guida',
      'Non definire un percorso',
      'Confrontarlo con profili senior',
    ],
    ruoliIdeali: ['Entry level in qualsiasi funzione', 'Junior roles', 'Ruoli di supporto'],
    alertHR: 'Investimento formativo necessario. Potenziale da sviluppare con pazienza e metodo.',
    livelloRischio: 'basso',
    potenzialeCrescita: 'elevato',
    aspettativeTemporali: {
      breveTermine: 'Fase di apprendimento intensivo. Richiede mentoring strutturato e feedback frequente. Non lasciarlo solo.',
      medioTermine: 'Crescita progressiva delle competenze se ben guidato. Inizia a contribuire autonomamente.',
      lungoTermine: 'Potenziale trasformazione in profilo più definito. L\'investimento formativo determina la direzione.',
    },
  },

  'PROFESSIONISTA_AUTONOMO': {
    tipo: 'PROFESSIONISTA_AUTONOMO',
    titolo: 'Professionista Autonomo',
    motto: '"Dammi l\'obiettivo, ci penso io."',
    chiE: 'Freelancer interno. Alta autonomia, preferisce lavorare da solo, eccellente nel portare risultati senza supervisione. Poco incline al lavoro di team e alla collaborazione.',
    cosaMotiva: [
      'Autonomia operativa',
      'Obiettivi chiari e misurabili',
      'Libertà di metodo',
      'Riconoscimento dei risultati',
      'Spazio per concentrarsi',
    ],
    cosaBlocca: [
      'Micromanagement',
      'Lavoro di team forzato',
      'Meeting continui',
      'Dipendenza da altri',
      'Procedure rigide',
    ],
    comeGestirlo: [
      'Definire obiettivi, non metodi',
      'Lasciare autonomia operativa',
      'Limitare i meeting',
      'Valutare sui risultati',
      'Rispettare il bisogno di indipendenza',
    ],
    cosaDare: [
      'Progetti autonomi',
      'Libertà di gestione tempo',
      'Obiettivi chiari',
      'Spazio fisico/mentale',
      'Riconoscimento dell\'output',
    ],
    cosaNonDare: [
      'Lavoro in team continuo',
      'Supervisione stretta',
      'Meeting frequenti',
      'Dipendenza da altri',
      'Ruoli di coordinamento',
    ],
    comeFarloCrescere: [
      'Progetti sempre più complessi',
      'Consulenza interna',
      'Specializzazione',
      'Expert path',
      'Progetti speciali autonomi',
    ],
    erroriEvitare: [
      'Forzare il lavoro di team',
      'Micromanagement',
      'Non rispettare l\'autonomia',
      'Valutare sul processo, non sul risultato',
      'Inserirlo in ruoli di coordinamento',
    ],
    ruoliIdeali: ['Consulente interno', 'Specialista', 'Project owner', 'Professionista senior'],
    alertHR: 'Eccellente per risultati individuali. Non forzare la collaborazione di team.',
    livelloRischio: 'basso',
    potenzialeCrescita: 'moderato',
    aspettativeTemporali: {
      breveTermine: 'Definizione chiara degli obiettivi e del perimetro di autonomia. Non forzate il team-working iniziale.',
      medioTermine: 'Risultati eccellenti sui progetti assegnati. Minima interazione con il team ma output di qualità.',
      lungoTermine: 'Risorsa stabile finché rispettata l\'autonomia. Se forzato a collaborare troppo, rischio uscita.',
    },
  },

  'SUPPORTO_OPERATIVO': {
    tipo: 'SUPPORTO_OPERATIVO',
    titolo: 'Supporto Operativo',
    motto: '"Dimmi cosa fare e lo faccio."',
    chiE: 'Esecutore puro. Preferisce ruoli ben definiti con compiti chiari. Non cerca responsabilità o autonomia, ma esegue con affidabilità ciò che gli viene assegnato.',
    cosaMotiva: [
      'Compiti chiari e definiti',
      'Supervisione disponibile',
      'Stabilità',
      'Routine prevedibile',
      'Riconoscimento della costanza',
    ],
    cosaBlocca: [
      'Autonomia forzata',
      'Responsabilità decisionali',
      'Ambiguità nei compiti',
      'Cambiamenti frequenti',
      'Pressione eccessiva',
    ],
    comeGestirlo: [
      'Fornire istruzioni chiare',
      'Essere disponibile per domande',
      'Mantenere routine stabile',
      'Verificare la comprensione',
      'Riconoscere l\'affidabilità',
    ],
    cosaDare: [
      'Istruzioni precise',
      'Supervisione accessibile',
      'Ambiente stabile',
      'Compiti ripetibili',
      'Feedback positivo',
    ],
    cosaNonDare: [
      'Autonomia decisionale',
      'Responsabilità complesse',
      'Ruoli di front-line',
      'Improvvisazione',
      'Obiettivi ambigui',
    ],
    comeFarloCrescere: [
      'Ampliamento graduale dei compiti',
      'Formazione su procedure specifiche',
      'Mentoring sulle basi',
      'Ruoli di supporto a senior',
      'Specializzazione operativa',
    ],
    erroriEvitare: [
      'Aspettarsi iniziativa',
      'Lasciarlo senza guida',
      'Assegnare compiti ambigui',
      'Criticare la mancanza di autonomia',
      'Forzare responsabilità',
    ],
    ruoliIdeali: ['Supporto operativo', 'Data entry', 'Assistente', 'Ruoli esecutivi base'],
    alertHR: 'Esecutore affidabile per compiti definiti. Non aspettatevi iniziativa o autonomia.',
    livelloRischio: 'basso',
    potenzialeCrescita: 'limitato',
    aspettativeTemporali: {
      breveTermine: 'Istruzioni chiare e supervisione attenta iniziale. Verificate la comprensione dei compiti assegnati.',
      medioTermine: 'Affidabilità sui compiti ripetitivi una volta appresi. Non aspettatevi iniziativa o miglioramenti spontanei.',
      lungoTermine: 'Risorsa stabile per compiti operativi. Fedeltà alta se trattato bene, ma crescita limitata.',
    },
  },

  'IN_TRANSIZIONE': {
    tipo: 'IN_TRANSIZIONE',
    titolo: 'Profilo in Transizione',
    motto: '"Ho bisogno di tempo per ritrovarmi."',
    chiE: 'Persona in difficoltà. Stress Zone attiva o multiple aree critiche indicano un momento di transizione/difficoltà. Non il momento ideale per valutazioni definitive.',
    cosaMotiva: [
      'Supporto e comprensione',
      'Ambiente protetto',
      'Stabilità',
      'Tempo per recuperare',
      'Obiettivi raggiungibili',
    ],
    cosaBlocca: [
      'Pressione aggiuntiva',
      'Giudizio',
      'Responsabilità eccessive',
      'Ambiente stressante',
      'Aspettative elevate',
    ],
    comeGestirlo: [
      'Verificare la situazione personale',
      'Offrire supporto (EAP se disponibile)',
      'Ridurre pressione temporaneamente',
      'Monitorare senza giudicare',
      'Rivalutare dopo periodo definito',
    ],
    cosaDare: [
      'Tempo per recuperare',
      'Supporto HR/EAP',
      'Ambiente comprensivo',
      'Obiettivi ridotti temporaneamente',
      'Colloqui di supporto',
    ],
    cosaNonDare: [
      'Pressione aggiuntiva',
      'Giudizio',
      'Responsabilità extra',
      'Deadline strette',
      'Esposizione a situazioni stressanti',
    ],
    comeFarloCrescere: [
      'Prima stabilizzare',
      'Poi rivalutare il profilo',
      'Supporto professionale se necessario',
      'Percorso di reinserimento graduale',
      'Coaching di supporto',
    ],
    erroriEvitare: [
      'Assumere decisioni definitive ora',
      'Ignorare i segnali di difficoltà',
      'Aggiungere pressione',
      'Non offrire supporto',
      'Etichettare negativamente',
    ],
    ruoliIdeali: ['Ruoli protetti temporaneamente', 'Percorso di reinserimento graduale'],
    alertHR: '⚠️ ATTENZIONE: Profilo con segnali di difficoltà significativa. Colloquio approfondito OBBLIGATORIO prima di qualsiasi decisione. Supportare la persona prima di valutare il candidato.',
    livelloRischio: 'alto',
    potenzialeCrescita: 'limitato',
    aspettativeTemporali: {
      breveTermine: 'Fase di stabilizzazione necessaria. Evitare pressioni e aspettative elevate. Colloquio di supporto prioritario.',
      medioTermine: 'Rivalutazione del profilo dopo periodo di stabilizzazione. Possibile emersione di un profilo più definito.',
      lungoTermine: 'Se supportato adeguatamente, possibile recupero completo. Altrimenti rischio di deterioramento ulteriore.',
    },
  },
};

/**
 * Ottiene la descrizione completa per un profilo
 */
export function getProfiloDetailedDescription(tipo: ProfiloTipo | null): ProfiloDetailedDescription | null {
  if (!tipo) return null;
  return PROFILI_DETAILED[tipo] || null;
}

/**
 * Ottiene i ruoli ideali per un profilo
 */
export function getProfiloIdealRoles(tipo: ProfiloTipo | null): string[] {
  const desc = getProfiloDetailedDescription(tipo);
  return desc?.ruoliIdeali || [];
}

/**
 * Ottiene il livello di rischio per un profilo
 */
export function getProfiloRiskLevel(tipo: ProfiloTipo | null): 'basso' | 'medio' | 'alto' {
  const desc = getProfiloDetailedDescription(tipo);
  return desc?.livelloRischio || 'medio';
}
