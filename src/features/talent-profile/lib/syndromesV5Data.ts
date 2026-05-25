/**
 * Database Sindromi V5 - Descrizioni Estese e Raccomandazioni
 *
 * 24 sindromi con:
 * - Descrizione estesa (80-150 parole)
 * - Impatto organizzativo
 * - Segnali da osservare in colloquio
 * - Domande specifiche per il colloquio
 * - Raccomandazioni gestionali
 * - Ruoli controindicati
 */

import { SyndromeSeverity } from '../types';

export interface SyndromeExtendedData {
  code: string;
  name: string;
  severity: SyndromeSeverity;
  shortDescription: string;
  extendedDescription: string;
  organizationalImpact: string;
  warningSignals: string[];
  interviewQuestions: string[];
  managementTips: string[];
  contraindicatedRoles: string[];
  category: 'primary' | 'secondary';
}

export const SYNDROMES_V5_DATA: Record<string, SyndromeExtendedData> = {
  // ==========================================
  // SINDROMI RED - CRITICHE
  // ==========================================

  S01: {
    code: 'S01',
    name: 'PERSONA DEMOTIVANTE CRONICA',
    severity: 'RED',
    shortDescription: 'SEMPRE NON IDONEA. Porta al fallimento chi gestisce.',
    extendedDescription: `Questa persona presenta un pattern sistematico di negatività che pervade ogni aspetto della vita lavorativa. Tende a vedere ostacoli dove non esistono, a minimizzare i successi altrui e a massimizzare i problemi. La sua presenza in un team riduce progressivamente la motivazione di tutti i collaboratori, creando un effetto domino di disimpegno. Il pattern è cronico e resistente al cambiamento: anche in contesti positivi, questa persona troverà elementi negativi su cui focalizzarsi. L'impatto è particolarmente devastante sui nuovi assunti e sulle persone in crescita.`,
    organizationalImpact: `Può causare un aumento del turnover del 40% nel suo team. I colleghi tendono a evitare interazioni, riducendo drasticamente la collaborazione. I progetti subiscono ritardi cronici dovuti al clima negativo. I talenti ad alto potenziale cercano trasferimento o dimissioni entro 6-12 mesi. Il costo nascosto in termini di produttività persa e clima aziendale può superare 3-5 volte lo stipendio annuo.`,
    warningSignals: [
      'Parla prevalentemente di esperienze negative nelle posizioni precedenti',
      'Attribuisce i fallimenti sempre ad altri (colleghi, capi, azienda, mercato)',
      'Non cita mai successi personali o di team spontaneamente',
      'Tono vocale piatto, linguaggio pessimistico, postura chiusa',
      'Critica le politiche aziendali attuali già durante il colloquio',
      'Minimizza i propri risultati quando li descrive'
    ],
    interviewQuestions: [
      'Qual è stato il suo più grande successo professionale e come lo ha ottenuto?',
      'Come reagisce quando un progetto va meglio del previsto?',
      'Mi racconti di un momento in cui ha motivato un collega in difficoltà',
      'Cosa la entusiasma del suo lavoro? Mi faccia un esempio recente',
      'Come descriverebbe il suo impatto sul morale del team nella posizione attuale?'
    ],
    managementTips: [
      'NON ASSUMERE in nessun caso',
      'Se già presente in organico, isolare immediatamente da ruoli di team',
      'Valutare percorso di uscita incentivata',
      'Non affidare nuovi assunti o junior a questa persona',
      'Documentare attentamente i comportamenti per eventuali provvedimenti'
    ],
    contraindicatedRoles: [
      'Tutti i ruoli con gestione persone',
      'Ruoli customer facing',
      'Team work di qualsiasi tipo',
      'Formazione e onboarding',
      'Ruoli di interfaccia tra reparti'
    ],
    category: 'primary'
  },

  S02: {
    code: 'S02',
    name: 'SP (SOPPRESSIVA)',
    severity: 'RED',
    shortDescription: 'SEMPRE NON IDONEA. Porta aziende al fallimento. Possibili comportamenti poco etici.',
    extendedDescription: `Pattern comportamentale caratterizzato da manipolazione sistematica e tendenza a sabotare il successo altrui. Questa persona può apparire inizialmente collaborativa e competente, ma nel tempo emerge un pattern di comportamenti volti a destabilizzare colleghi percepiti come minaccia. Usa informazioni riservate come arma, crea alleanze per poi tradirle, e può arrivare a comportamenti al limite del mobbing. Possibili problematiche etiche significative: questa persona può giustificare comportamenti scorretti in nome di obiettivi personali. La manipolazione è spesso sottile e difficile da documentare.`,
    organizationalImpact: `Rischio elevato di cause legali per mobbing o discriminazione. Può creare fazioni interne che paralizzano l'organizzazione. I migliori talenti se ne vanno entro 12 mesi. In aziende piccole (sotto 50 dipendenti), può portare al fallimento dell'intera organizzazione. Il danno reputazionale può persistere per anni dopo l'uscita della persona.`,
    warningSignals: [
      'Riferimenti frequenti a ingiustizie subite nelle posizioni precedenti',
      'Difficoltà a riconoscere meriti altrui, anche quando esplicitamente richiesto',
      'Risposte evasive o contraddittorie su uscite da aziende precedenti',
      'Tendenza a criticare ex colleghi e capi con dettagli personali',
      'Eccessiva adulazione iniziale seguita da critiche sottili',
      'Cerca di ottenere informazioni riservate già in fase di colloquio'
    ],
    interviewQuestions: [
      'Come ha gestito situazioni in cui un collega ha avuto più successo di lei?',
      'Può raccontarmi di un conflitto lavorativo significativo e come si è risolto?',
      'Perché ha lasciato le sue ultime 3 posizioni? (approfondire incongruenze)',
      'Mi descriva un momento in cui ha aiutato un collega a crescere professionalmente',
      'Come reagisce quando scopre che un collega ha parlato male di lei?'
    ],
    managementTips: [
      'ASSOLUTAMENTE NON ASSUMERE',
      'Se identificata post-assunzione, predisporre uscita immediata',
      'Documentare ogni comportamento con testimoni e date',
      'Coinvolgere legale aziendale prima di qualsiasi confronto',
      'Proteggere attivamente le persone che hanno lavorato con questa figura'
    ],
    contraindicatedRoles: [
      'Tutti i ruoli senza eccezione',
      'Mai ruoli con accesso a informazioni sensibili',
      'Mai ruoli con autorità su altri',
      'Mai ruoli con contatto clienti strategici'
    ],
    category: 'primary'
  },

  S03: {
    code: 'S03',
    name: 'TROUBLE',
    severity: 'RED',
    shortDescription: 'Bomba a mano. Idonea SOLO con controllo costante. Se RC>45 diventa SP.',
    extendedDescription: `Persona con alto potenziale ma estremamente instabile e imprevedibile. Come una bomba a mano: può esplodere in qualsiasi momento creando danni significativi. L'alta automotivazione combinata con scarsa gestione delle pressioni crea un pattern di comportamenti estremi: performance eccellenti alternate a crolli improvvisi, conflitti accesi, decisioni impulsive. In contesti non controllati, questa persona può causare danni irreparabili a relazioni con clienti, progetti strategici o clima interno. Se presenta anche alta Resistenza al Cambiamento (RC>45), il profilo evolve verso SP con rischi di manipolazione.`,
    organizationalImpact: `Imprevedibilità crea stress costante nel team. Un singolo episodio può compromettere relazioni con clienti chiave. I colleghi sviluppano strategie di evitamento che riducono la collaborazione. Il costo di supervisione costante è elevato. Rischio di azioni legali per comportamenti impulsivi.`,
    warningSignals: [
      'Racconta episodi di conflitti accesi con colleghi o superiori',
      'Alternanza di entusiasmo estremo e critiche feroci durante il colloquio',
      'Reazioni emotive intense a domande neutre',
      'Storia lavorativa con pattern di "inizi brillanti" seguiti da uscite improvvise',
      'Difficoltà a mantenere un tono emotivo stabile nell\'arco del colloquio'
    ],
    interviewQuestions: [
      'Come gestisce la pressione quando le cose non vanno come previsto?',
      'Mi racconti di una situazione in cui ha perso il controllo e come ha rimediato',
      'Come reagiscono i suoi colleghi quando lei è sotto stress?',
      'Qual è stata la sua reazione più impulsiva sul lavoro e cosa ha imparato?',
      'Come descriverebbe il suo rapporto con l\'autorità e le regole aziendali?'
    ],
    managementTips: [
      'Se si decide di assumere: supervisione costante e strutturata',
      'Mai lasciare da sola con clienti strategici',
      'Obiettivi a breve termine con check frequenti',
      'Piano chiaro di escalation per gestire crisi',
      'Documentare tutto per eventuali provvedimenti',
      'Valutare attentamente se RC>45: rischio evoluzione in SP'
    ],
    contraindicatedRoles: [
      'Ruoli con autonomia decisionale elevata',
      'Gestione clienti strategici',
      'Posizioni di leadership',
      'Ruoli che richiedono equilibrio emotivo costante',
      'Interfaccia con stakeholder esterni'
    ],
    category: 'primary'
  },

  S04: {
    code: 'S04',
    name: 'PERSONA DEMOTIVANTE',
    severity: 'RED',
    shortDescription: 'SEMPRE NON IDONEA. Amplifica difficoltà, demotiva.',
    extendedDescription: `Pattern simile a S01 ma con focus specifico sulla capacità di amplificare ogni difficoltà e demotivare attivamente chi le sta intorno. Questa persona non è semplicemente negativa: ha una capacità attiva di identificare i punti deboli delle situazioni e delle persone, e di amplificarli. In presenza di problemi reali, li ingigantisce; in assenza di problemi, li crea. Il suo impatto sul morale è immediato e misurabile: i team che includono questa persona mostrano cali di produttività del 20-30% entro i primi 3 mesi.`,
    organizationalImpact: `Calo produttività team del 20-30%. Aumento significativo di assenteismo e malattie stress-correlate. I nuovi progetti falliscono a tasso doppio rispetto alla norma. Le persone evitano di proporre idee innovative per paura di critiche. Il clima tossico si diffonde per contagio anche a team adiacenti.`,
    warningSignals: [
      'Ogni risposta include un "però" o un elemento negativo',
      'Parla dei colleghi attuali in termini problematici',
      'Evidenzia spontaneamente tutti i rischi di ogni opportunità',
      'Non mostra entusiasmo per nessun aspetto del ruolo proposto',
      'Il linguaggio non verbale comunica chiusura e diffidenza'
    ],
    interviewQuestions: [
      'Qual è stata l\'ultima volta che si è sentito genuinamente entusiasta sul lavoro?',
      'Come supporta i colleghi quando affrontano sfide difficili?',
      'Mi descriva un progetto che considera un successo e perché',
      'Cosa la motiva ad alzarsi la mattina per andare al lavoro?',
      'Come reagisce quando un\'idea a cui teneva viene criticata?'
    ],
    managementTips: [
      'NON ASSUMERE',
      'Se già in organico, intervento immediato con HR',
      'Separare fisicamente dai team ad alta performance',
      'Non includere in progetti strategici',
      'Valutare compatibilità con ruoli completamente individuali'
    ],
    contraindicatedRoles: [
      'Qualsiasi ruolo di team',
      'Customer facing',
      'Formazione e mentoring',
      'Innovazione e sviluppo',
      'Ruoli con visibilità interna'
    ],
    category: 'primary'
  },

  // ==========================================
  // SINDROMI ORANGE - ATTENZIONE
  // ==========================================

  S05: {
    code: 'S05',
    name: 'ATTEGGIAMENTO DEMOTIVANTE',
    severity: 'ORANGE',
    shortDescription: '50% casi problemi etica. NON IDONEA ruoli chiave.',
    extendedDescription: `Versione meno grave delle sindromi demotivanti, ma con correlazione significativa (50%) con problemi etici. Questa persona non è necessariamente tossica, ma il suo atteggiamento generale tende al pessimismo e può minare il morale del team in momenti critici. La combinazione di bassa gestione pressioni e scarsa proattività crea un pattern di passività aggressiva: non sabota attivamente, ma non contribuisce positivamente. Nel 50% dei casi, questo pattern nasconde problemi più profondi legati all'etica professionale.`,
    organizationalImpact: `Rallentamento decisioni in momenti critici. I colleghi si stancano di compensare la sua passività. Rischio etico nel 50% dei casi. Non adatta a ruoli chiave dove l'energia positiva è essenziale. Impatto negativo su nuovi assunti che la osservano come modello.`,
    warningSignals: [
      'Risposte vaghe su come affronta le sfide',
      'Tendenza a minimizzare il proprio contributo ai successi',
      'Linguaggio che denota passività ("capita", "succede", "non dipende da me")',
      'Scarso interesse per le opportunità di crescita proposte',
      'Riferimenti a regole non rispettate da altri come giustificazione'
    ],
    interviewQuestions: [
      'Come affronta situazioni in cui le regole aziendali le sembrano ingiuste?',
      'Mi racconti di una volta in cui ha preso l\'iniziativa nonostante non fosse richiesto',
      'Cosa pensa di chi ottiene successo "piegando" un po\' le regole?',
      'Come motiva se stesso nei periodi difficili?'
    ],
    managementTips: [
      'Non idonea per ruoli chiave o strategici',
      'Può funzionare in ruoli operativi ben definiti',
      'Monitoraggio etico regolare',
      'Non affidare responsabilità di budget o accesso a dati sensibili',
      'Se si assume: obiettivi chiari, supervisione regolare'
    ],
    contraindicatedRoles: [
      'Ruoli manageriali',
      'Posizioni con autonomia di budget',
      'Accesso a informazioni riservate',
      'Interfaccia clienti strategici',
      'Ruoli di compliance o audit'
    ],
    category: 'primary'
  },

  S06: {
    code: 'S06',
    name: 'POTENZIALI PROBLEMI ETICA',
    severity: 'ORANGE',
    shortDescription: 'Attendibilità 85%. Richiede approfondimento in colloquio.',
    extendedDescription: `Questo pattern indica con attendibilità dell'85% potenziali problemi legati all'etica professionale. Può manifestarsi in varie forme: dalla piccola disonestà quotidiana (note spese gonfiate, orari non rispettati) fino a comportamenti più gravi (conflitti di interesse, uso improprio di risorse aziendali). Le 6 diverse combinazioni che attivano questa sindrome coprono un ampio spettro di profili, ma tutti condividono una tendenza a giustificare comportamenti al limite. È fondamentale un approfondimento mirato in colloquio.`,
    organizationalImpact: `Rischio reputazionale per l'azienda. Possibili perdite finanziarie dirette. Effetto contagio: altri dipendenti osservano e imitano. Se in posizione di responsabilità, può creare cultura di tolleranza per comportamenti scorretti. Rischio legale in caso di violazioni normative.`,
    warningSignals: [
      'Risposte evasive su precedenti esperienze lavorative',
      'Giustifica comportamenti scorretti di altri',
      'Mostra disprezzo per regole "burocratiche"',
      'Parla di "zone grigie" come normali',
      'Ha difficoltà a fare esempi di quando ha fatto la cosa giusta anche se difficile',
      'Negozia eccessivamente su benefit e condizioni'
    ],
    interviewQuestions: [
      'Mi racconti di una situazione in cui ha scelto di fare la cosa giusta anche se era più difficile',
      'Come si comporta quando vede un collega fare qualcosa di scorretto?',
      'Qual è la sua opinione sulle regole aziendali che sembrano rallentare il lavoro?',
      'Ha mai avuto pressioni per comportarsi in modo non etico? Come ha gestito?',
      'Cosa pensa di chi "allunga" le note spese o gli orari?'
    ],
    managementTips: [
      'Approfondimento obbligatorio prima dell\'assunzione',
      'Se si assume: no ruoli con accesso a risorse finanziarie',
      'Controlli regolari su note spese e orari',
      'Mai posizioni con conflitti di interesse potenziali',
      'Formazione etica obbligatoria e monitorata'
    ],
    contraindicatedRoles: [
      'Gestione budget e finanze',
      'Acquisti e fornitori',
      'Ruoli con accesso a dati sensibili clienti',
      'Compliance e audit',
      'Rappresentanza legale dell\'azienda'
    ],
    category: 'primary'
  },

  S07: {
    code: 'S07',
    name: 'CREATIVO DISPERSIVO',
    severity: 'ORANGE',
    shortDescription: 'Inizia progetti, non completa. Non adatto a ruoli che richiedono follow-through.',
    extendedDescription: `Persona con genuina creatività e capacità di generare idee, ma con seria difficoltà a portare a termine ciò che inizia. Il pattern è caratterizzato da entusiasmo iniziale elevato che si spegne rapidamente quando emergono le prime difficoltà o quando l'idea diventa "vecchia" per la persona. La bassa organizzazione combinata con apertura al cambiamento crea un ciclo continuo di nuove iniziative abbandonate. Può essere una risorsa valida se affiancata da figure complementari che completano l'esecuzione.`,
    organizationalImpact: `Progetti avviati e non completati consumano risorse. I colleghi si frustrano nel dover completare il lavoro altrui. Le deadline vengono sistematicamente mancate. L'eccesso di idee non implementate crea confusione strategica. Tuttavia, può essere fonte di innovazione se gestita correttamente.`,
    warningSignals: [
      'Curriculum con molti progetti brevi o cambi frequenti',
      'Entusiasmo visibile quando parla di nuove idee',
      'Vago sui dettagli di come ha concluso progetti passati',
      'Tende a parlare del "cosa" ma non del "come"',
      'Si annoia visibilmente quando si parla di processi e procedure'
    ],
    interviewQuestions: [
      'Mi racconti di un progetto complesso che ha portato a termine dalla A alla Z',
      'Come gestisce la noia quando un progetto entra nella fase di esecuzione?',
      'Qual è il suo rapporto con deadline e scadenze?',
      'Come reagisce quando le viene chiesto di completare il lavoro di altri?',
      'Può farmi esempi di idee che ha avuto e che sono diventate realtà concreta?'
    ],
    managementTips: [
      'Può funzionare in ruoli puramente creativi/ideazione',
      'Affiancare sempre con figure "esecutive"',
      'Obiettivi a breve termine con check frequenti',
      'Non affidare progetti da gestire in autonomia',
      'Valorizzare la creatività ma strutturare l\'esecuzione'
    ],
    contraindicatedRoles: [
      'Project manager',
      'Ruoli che richiedono follow-through autonomo',
      'Posizioni con deadline critiche',
      'Ruoli amministrativi o procedurali',
      'Gestione operativa quotidiana'
    ],
    category: 'primary'
  },

  S08: {
    code: 'S08',
    name: 'GHOST',
    severity: 'ORANGE',
    shortDescription: '80% prestazioni inferiori al grafico. Profilo troppo uniforme.',
    extendedDescription: `Profilo che appare "troppo bello" per essere vero: tutti i valori alti e uniformi in modo sospetto. Nel 80% dei casi, le prestazioni reali sono significativamente inferiori a quanto il profilo suggerirebbe. Può indicare: risposte socialmente desiderabili al test, scarsa consapevolezza di sé, o effettiva incapacità di differenziare le proprie competenze. In ogni caso, il profilo non è affidabile per la valutazione. È necessario un approfondimento significativo in colloquio con domande comportamentali specifiche.`,
    organizationalImpact: `Rischio di assumere basandosi su un profilo non realistico. Le aspettative saranno sistematicamente deluse. La persona potrebbe non avere consapevolezza delle proprie aree di miglioramento. Difficile da sviluppare perché non riconosce i propri limiti.`,
    warningSignals: [
      'Risposte generiche che potrebbero applicarsi a chiunque',
      'Difficoltà a citare esempi specifici e dettagliati',
      'Autorappresentazione uniformemente positiva',
      'Poca autocritica genuina',
      'Le referenze non confermano il livello di eccellenza descritto'
    ],
    interviewQuestions: [
      'Mi descriva un suo punto debole reale e come sta lavorando per migliorarlo',
      'Qual è stata la critica più dura che ha ricevuto e cosa ha imparato?',
      'Mi racconti di un fallimento significativo e cosa ha fatto dopo',
      'Come reagiscono i suoi colleghi quando commette un errore?',
      'In quale area specifica sa di dover crescere di più?'
    ],
    managementTips: [
      'Approfondimento obbligatorio con assessment comportamentale',
      'Verificare referenze in modo dettagliato',
      'Se si assume: periodo di prova con obiettivi misurabili',
      'Non basare decisioni solo sul profilo psicometrico',
      'Preparare piano di sviluppo per costruire consapevolezza'
    ],
    contraindicatedRoles: [
      'Valutare caso per caso dopo approfondimento',
      'Inizialmente evitare ruoli con alta autonomia',
      'Ruoli con feedback frequente preferibili'
    ],
    category: 'primary'
  },

  S09: {
    code: 'S09',
    name: 'ROBOTISMO AL CONTRARIO',
    severity: 'ORANGE',
    shortDescription: 'Fa opposto di richiesto. Non idonea Capo Area/Direttore Vendite.',
    extendedDescription: `Pattern paradossale: persona con alta automotivazione che sistematicamente fa l'opposto di ciò che le viene richiesto. Non si tratta di ribellione consapevole, ma di un meccanismo automatico di opposizione. Può essere legato a bassa gestione delle pressioni (reagisce opponendosi) o alta resistenza al cambiamento negativa (rifiuta ogni input esterno). Particolarmente pericolosa in ruoli commerciali di leadership dove il coordinamento è essenziale. L'alta energia viene convogliata nella direzione sbagliata.`,
    organizationalImpact: `Le direttive strategiche non vengono implementate. Il team non sa cosa aspettarsi. I clienti ricevono messaggi incoerenti. Le iniziative aziendali falliscono a livello locale. Confusione e frustrazione nei collaboratori.`,
    warningSignals: [
      'Racconta di aver fatto "a modo suo" nonostante indicazioni diverse',
      'Presenta il non seguire le regole come virtù',
      'Ha avuto conflitti con superiori sulle modalità di lavoro',
      'Critica le strategie aziendali delle aziende precedenti',
      'Enfatizza eccessivamente l\'autonomia come valore'
    ],
    interviewQuestions: [
      'Come reagisce quando le viene chiesto di fare qualcosa in modo diverso dal suo?',
      'Mi racconti di una volta in cui ha seguito istruzioni che non condivideva',
      'Come bilancia autonomia e allineamento alle direttive aziendali?',
      'Cosa fa quando la strategia aziendale non coincide con la sua visione?'
    ],
    managementTips: [
      'Non idonea per ruoli di Capo Area o Direttore Vendite',
      'Se si assume: ruolo con obiettivi chiari ma metodi flessibili',
      'Comunicare il "perché" delle richieste, non solo il "cosa"',
      'Monitorare allineamento con direttive aziendali',
      'Coinvolgere nelle decisioni per ridurre opposizione'
    ],
    contraindicatedRoles: [
      'Capo Area vendite',
      'Direttore Vendite',
      'Ruoli che richiedono implementazione di strategie top-down',
      'Posizioni in franchising o reti coordinate',
      'Ruoli con protocolli rigidi da seguire'
    ],
    category: 'primary'
  },

  S10: {
    code: 'S10',
    name: 'DISACCORDO Tipo 1',
    severity: 'YELLOW',
    shortDescription: 'Genera disaccordi inconsapevoli. Richiede coaching comunicativo.',
    extendedDescription: `Persona con buone capacità commerciali (automotivazione, determinazione, vendita) ma carente nelle competenze relazionali (proattività, comprensione). Questo squilibrio genera disaccordi frequenti senza che la persona ne sia consapevole. Pensa di comunicare efficacemente ma i messaggi arrivano distorti. I colleghi e clienti si sentono non compresi o forzati. Con coaching comunicativo mirato, questo pattern può essere corretto. Il potenziale è presente, va solo sviluppata la componente relazionale.`,
    organizationalImpact: `Conflitti frequenti con clienti e colleghi. Chiusure commerciali compromesse da approccio troppo aggressivo. Clima di incomprensione nel team. Tuttavia, con sviluppo appropriato, può diventare una risorsa efficace.`,
    warningSignals: [
      'Interrompe frequentemente durante il colloquio',
      'Non coglie i segnali non verbali dell\'interlocutore',
      'Le risposte non sempre centrano la domanda posta',
      'Enfatizza i risultati quantitativi, minimizza aspetti relazionali'
    ],
    interviewQuestions: [
      'Come si assicura che il cliente abbia capito la sua proposta?',
      'Mi racconti di una negoziazione difficile e come l\'ha gestita',
      'Come reagisce quando un cliente dice che non si sente ascoltato?',
      'Cosa significa per lei "vendita consultiva"?'
    ],
    managementTips: [
      'Può essere assunta con piano di sviluppo comunicativo',
      'Coaching su ascolto attivo e intelligenza emotiva',
      'Affiancare inizialmente a figure con alte competenze relazionali',
      'Feedback regolare sulla qualità della comunicazione',
      'Role-playing su situazioni di incomprensione'
    ],
    contraindicatedRoles: [
      'Ruoli che richiedono mediazione',
      'Customer care',
      'Gestione reclami',
      'HR e relazioni interne'
    ],
    category: 'primary'
  },

  S11: {
    code: 'S11',
    name: 'DISACCORDO Tipo 2',
    severity: 'YELLOW',
    shortDescription: 'Attacca chi non concorda. Gestire con attenzione in team.',
    extendedDescription: `Pattern più aggressivo del Tipo 1: questa persona non solo genera disaccordi, ma attacca attivamente chi esprime opinioni diverse. La combinazione di alta gestione pressioni, proattività e determinazione con bassa comprensione crea un "bulldozer" che travolge le resistenze invece di gestirle. I colleghi imparano a non contraddirla per evitare conflitti, creando un ambiente di conformismo forzato. La persona è spesso inconsapevole del proprio impatto intimidatorio.`,
    organizationalImpact: `Clima di paura nel team. Le buone idee non emergono perché nessuno osa contraddire. I conflitti si incancreniscono invece di risolversi. Alto rischio di segnalazioni HR. I talenti se ne vanno o si appiattiscono.`,
    warningSignals: [
      'Reazioni visibilmente irritate quando viene contraddetto nel colloquio',
      'Racconta di "aver messo a posto" colleghi che la pensavano diversamente',
      'Linguaggio combattivo ("battaglia", "vincere", "imporsi")',
      'Non cita mai situazioni in cui ha cambiato idea'
    ],
    interviewQuestions: [
      'Mi racconti di una volta in cui un collega aveva ragione e lei torto',
      'Come gestisce il dissenso nel suo team?',
      'Cosa pensa di chi ha opinioni molto diverse dalle sue?',
      'Come reagisce quando le sue idee vengono criticate?'
    ],
    managementTips: [
      'Gestire con attenzione in contesti di team',
      'Formazione obbligatoria su gestione conflitti',
      'Regole chiare su come esprimere disaccordo',
      'Monitorare dinamiche con colleghi più junior',
      'Coaching su impatto del proprio comportamento'
    ],
    contraindicatedRoles: [
      'Leadership di team vulnerabili',
      'Ruoli che richiedono costruzione consenso',
      'Mediazione e negoziazione complessa',
      'Formazione e mentoring'
    ],
    category: 'primary'
  },

  S12: {
    code: 'S12',
    name: 'INSUCCESSO COMMERCIALE',
    severity: 'YELLOW',
    shortDescription: 'Scarsi risultati commerciali nonostante attitudine. Pattern di rigidità.',
    extendedDescription: `Pattern che indica scarsi risultati commerciali nonostante apparente attitudine alla vendita. La combinazione di età >40 anni, alta resistenza al cambiamento (RC>44), principi "sbagliati" (SUC<69, FIN<30) suggerisce che la persona abbia sviluppato abitudini rigide che non funzionano più nel mercato attuale. Continua a usare approcci obsoleti, resiste ai cambiamenti metodologici, e giustifica i risultati scarsi con fattori esterni. Il potenziale commerciale non si traduce in risultati.`,
    organizationalImpact: `Investimento in training senza risultati. Occupa territorio commerciale senza svilupparlo. Può demotivare colleghi più giovani con atteggiamento "ho sempre fatto così". Resistente a nuovi strumenti e metodologie.`,
    warningSignals: [
      'Risultati in calo negli ultimi anni nonostante l\'esperienza',
      'Critica i "nuovi metodi" di vendita',
      'Parla molto di relazioni storiche, poco di nuove acquisizioni',
      'Resistente a discutere di KPI e metriche moderne',
      'Giustifica i risultati con il "mercato cambiato"'
    ],
    interviewQuestions: [
      'Come sono cambiati i suoi metodi di vendita negli ultimi 5 anni?',
      'Qual è il suo approccio all\'acquisizione di nuovi clienti oggi?',
      'Come usa la tecnologia nel suo processo di vendita?',
      'Mi racconti dell\'ultimo nuovo approccio commerciale che ha adottato'
    ],
    managementTips: [
      'Valutare attentamente: il cambiamento richiede investimento significativo',
      'Se si assume: coaching intensivo su nuove metodologie',
      'Obiettivi chiari su nuove acquisizioni vs gestione esistente',
      'Affiancare a figure innovative per contaminazione positiva',
      'Monitorare resistenza al cambiamento nel tempo'
    ],
    contraindicatedRoles: [
      'Sviluppo nuovi mercati',
      'Ruoli che richiedono innovazione commerciale',
      'Vendita di prodotti/servizi innovativi',
      'Lead generation digitale'
    ],
    category: 'primary'
  },

  S13: {
    code: 'S13',
    name: 'FUORI ROTTA',
    severity: 'YELLOW',
    shortDescription: 'Principi sbagliati per prosperità. Richiede riallineamento valori.',
    extendedDescription: `Persona con sistema di valori e principi non allineati con quelli necessari per prosperare professionalmente. La combinazione di SUC<69, PRI<40 e FIN<30 indica che le credenze fondamentali su successo, principi etici e gestione finanziaria sono disfunzionali. Non si tratta di incompetenza tecnica, ma di una "bussola interna" mal calibrata. Questa persona prenderà decisioni che sembrano logiche a lei ma che porteranno regolarmente a risultati subottimali. Richiede un lavoro profondo di riallineamento.`,
    organizationalImpact: `Decisioni strategiche sbagliate. Pattern di errori ripetuti. Difficoltà a comprendere perché certi comportamenti non funzionano. Resistenza a feedback correttivo perché le basi logiche sono diverse.`,
    warningSignals: [
      'Definizione di "successo" non allineata con il ruolo',
      'Priorità dichiarate non coerenti con le aspettative aziendali',
      'Difficoltà a spiegare la logica di scelte passate',
      'Pattern di decisioni che sembrano controintuitive'
    ],
    interviewQuestions: [
      'Come definisce il successo professionale per lei?',
      'Quali sono i suoi principi guida nelle decisioni lavorative?',
      'Mi racconti di una decisione importante e la logica che ha seguito',
      'Cosa considera un uso "saggio" del denaro a livello aziendale?'
    ],
    managementTips: [
      'Valutare se il riallineamento è possibile e conveniente',
      'Coaching sui principi e valori aziendali',
      'Esplicitare le aspettative e le logiche decisionali',
      'Feedback frequente sulle decisioni prese',
      'Monitorare allineamento nel tempo'
    ],
    contraindicatedRoles: [
      'Ruoli con alta autonomia decisionale',
      'Gestione budget significativi',
      'Posizioni strategiche',
      'Ruoli che definiscono cultura aziendale'
    ],
    category: 'primary'
  },

  S14: {
    code: 'S14',
    name: 'POCA PRECISIONE',
    severity: 'YELLOW',
    shortDescription: 'Non adatta ruoli impiegatizi/back office. Troppo orientata alla vendita.',
    extendedDescription: `Profilo fortemente orientato alla vendita (alta automotivazione e attitudine commerciale) ma carente nelle competenze di precisione e dettaglio. Questa persona è naturalmente portata per ruoli dinamici e orientati ai risultati, ma soffre in contesti che richiedono accuratezza, procedure, lavoro amministrativo. Non è un difetto in sé: è una caratteristica che deve essere collocata nel ruolo giusto. Inserirla in ruoli impiegatizi o back office genererà frustrazione e errori.`,
    organizationalImpact: `Se nel ruolo sbagliato: errori frequenti, frustrazione, turnover rapido. Nel ruolo giusto: può essere molto performante. Il costo è principalmente di mis-match, non di persona problematica.`,
    warningSignals: [
      'CV con prevalenza di ruoli commerciali',
      'Impazienza visibile quando si parla di processi',
      'Poca attenzione ai dettagli delle domande',
      'Orientamento marcato ai risultati vs processi'
    ],
    interviewQuestions: [
      'Come gestisce attività che richiedono alta precisione?',
      'Qual è il suo rapporto con procedure e documentazione?',
      'Mi racconti di un lavoro che richiedeva grande attenzione ai dettagli',
      'Come bilancia velocità e accuratezza?'
    ],
    managementTips: [
      'Collocare in ruoli commerciali o dinamici',
      'Evitare responsabilità amministrative',
      'Affiancare con supporto operativo per dettagli',
      'Valorizzare le competenze commerciali',
      'Non forzare in ruoli non adatti'
    ],
    contraindicatedRoles: [
      'Back office amministrativo',
      'Ruoli impiegatizi procedurali',
      'Contabilità e finanza operativa',
      'Data entry e lavori di precisione',
      'Compliance e audit'
    ],
    category: 'primary'
  },

  S15: {
    code: 'S15',
    name: 'PROFILO TUTTO BASSO',
    severity: 'ORANGE',
    shortDescription: 'Condizione PSP anche se GP non lo indica. Relazione demotivante in corso.',
    extendedDescription: `Profilo con tutti i tratti molto bassi (<=+10) che indica probabile condizione di PSP (Potenziale Stress da Pressione) indipendentemente dal valore di GP. Questa configurazione suggerisce che la persona stia attraversando un periodo di forte demotivazione, spesso causato da una relazione demotivante in corso (capo tossico, ambiente lavorativo negativo, problemi personali gravi). Non è necessariamente una caratteristica stabile della persona: potrebbe essere un'istantanea di un momento difficile. Tuttavia, l'assunzione in queste condizioni è rischiosa.`,
    organizationalImpact: `La persona non è in grado di dare il meglio. Rischio di amplificare problemi esistenti. Se la causa è esterna, cambiare ambiente potrebbe aiutare, ma non è garantito. Se la causa è interna, la situazione potrebbe non migliorare.`,
    warningSignals: [
      'Energia visibilmente bassa durante tutto il colloquio',
      'Risposte brevi e poco elaborate',
      'Difficoltà a trovare aspetti positivi da raccontare',
      'Riferimenti a situazioni difficili attuali',
      'Linguaggio corporeo che comunica sfinimento'
    ],
    interviewQuestions: [
      'Come descriverebbe il suo stato d\'animo professionale attuale?',
      'Cosa l\'ha portata a cercare un nuovo lavoro in questo momento?',
      'Come era la sua energia lavorativa 2-3 anni fa rispetto ad oggi?',
      'C\'è qualcosa che sta influenzando il suo benessere lavorativo?'
    ],
    managementTips: [
      'Approfondire le cause del profilo basso',
      'Valutare se situazione transitoria o stabile',
      'Se si assume: supporto intensivo iniziale',
      'Monitorare evoluzione nel primo trimestre',
      'Considerare un periodo di "detox" prima di valutare'
    ],
    contraindicatedRoles: [
      'Ruoli ad alta pressione',
      'Posizioni con responsabilità immediate',
      'Ruoli visibili o strategici',
      'Situazioni che richiedono alta energia'
    ],
    category: 'primary'
  },

  S16: {
    code: 'S16',
    name: 'BRUTTO CARATTERE',
    severity: 'YELLOW',
    shortDescription: 'Difficoltà relazionali evidenti. Non adatto a ruoli di contatto.',
    extendedDescription: `Pattern caratterizzato da bassa proattività e comprensione che si manifesta in difficoltà relazionali evidenti. Non si tratta di cattive intenzioni, ma di una scarsa capacità naturale di costruire e mantenere relazioni positive. La persona può essere competente tecnicamente ma risulta "difficile" da gestire e poco piacevole nelle interazioni. Questo limita significativamente i ruoli in cui può essere efficace.`,
    organizationalImpact: `Colleghi evitano collaborazione. Clienti e partner preferiscono altre interfacce. Il clima del team peggiora. Tuttavia, in ruoli tecnici individuali può essere produttiva.`,
    warningSignals: [
      'Tono brusco o scortese durante il colloquio',
      'Poca attenzione alle reazioni dell\'interlocutore',
      'Risposte che non tengono conto del contesto sociale',
      'Difficoltà a descrivere relazioni positive con colleghi'
    ],
    interviewQuestions: [
      'Come descriverebbe il suo rapporto con i colleghi attuali?',
      'Mi racconti di una situazione in cui ha dovuto adattare il suo stile comunicativo',
      'Come reagisce quando qualcuno la critica per il modo in cui comunica?',
      'Cosa pensano di lei i suoi colleghi?'
    ],
    managementTips: [
      'Collocare in ruoli tecnici individuali',
      'Minimizzare interfacce con clienti e partner',
      'Coaching sulle soft skills se la persona è aperta',
      'Non forzare in ruoli relazionali',
      'Valorizzare le competenze tecniche'
    ],
    contraindicatedRoles: [
      'Customer facing',
      'Ruoli commerciali',
      'HR e gestione persone',
      'Rappresentanza aziendale',
      'Ruoli che richiedono networking'
    ],
    category: 'primary'
  },

  S17: {
    code: 'S17',
    name: 'GP PIÙ ALTO',
    severity: 'YELLOW',
    shortDescription: 'Non affronta situazioni. Se venditore con DET<30: NON IDONEO.',
    extendedDescription: `Configurazione in cui la Gestione Pressioni (GP) è il tratto più alto del profilo. Indica una persona che è bravissima a sopportare lo stress ma che non affronta attivamente le situazioni problematiche. Preferisce resistere piuttosto che risolvere. In ruoli commerciali, questo è particolarmente problematico se combinato con bassa Determinazione (DET<30): la persona sopporterà i "no" dei clienti senza mai trasformarli in "sì".`,
    organizationalImpact: `Problemi non risolti che si accumulano. In ambito commerciale: pipeline che non avanza. Opportunità perse per mancanza di azione. La resilienza diventa passività.`,
    warningSignals: [
      'Racconta di aver "sopportato" situazioni difficili senza risolverle',
      'Poca enfasi su azioni concrete intraprese',
      'Linguaggio passivo ("è successo", "è andata così")',
      'Resistenza a descrivere momenti di iniziativa'
    ],
    interviewQuestions: [
      'Mi racconti di un problema che ha risolto attivamente, non solo sopportato',
      'Qual è la differenza tra resistere e agire secondo lei?',
      'Come gestisce le obiezioni ripetute di un cliente?',
      'Quando decide che è il momento di agire invece di aspettare?'
    ],
    managementTips: [
      'Se venditore con DET<30: NON IDONEO',
      'Per altri ruoli: sviluppare orientamento all\'azione',
      'Obiettivi che richiedono iniziativa, non solo resistenza',
      'Coaching su problem solving attivo',
      'Monitorare che la resilienza non diventi passività'
    ],
    contraindicatedRoles: [
      'Vendita (se DET<30)',
      'Ruoli che richiedono iniziativa costante',
      'Gestione crisi attiva',
      'Sviluppo business'
    ],
    category: 'primary'
  },

  S18: {
    code: 'S18',
    name: 'EGO',
    severity: 'YELLOW',
    shortDescription: 'Ego ipertrofico. Difficile da gestire, resiste al feedback.',
    extendedDescription: `Profilo caratterizzato da ego ipertrofico: bassa organizzazione, altissima automotivazione, alte competenze commerciali, ma bassissima proattività e comprensione verso gli altri combinata con altissima espansività. Questa persona crede fermamente in se stessa, è molto visibile, ma è quasi impossibile da gestire perché resiste a qualsiasi feedback che non confermi la sua autoimmagine. Può essere molto performante in autonomia totale ma diventa problematica appena si tenta di dirigerla.`,
    organizationalImpact: `Impossibile da coordinare con altri. I feedback vengono ignorati o contestati. Può creare conflitti con capi e colleghi. Tuttavia, se lasciata libera in ambiti specifici, può generare risultati.`,
    warningSignals: [
      'Autopromozione costante durante il colloquio',
      'Difficoltà ad accettare domande che implicano imperfezione',
      'Minimizza contributi altrui ai propri successi',
      'Reagisce male a feedback anche costruttivo',
      'Parla molto più di quanto ascolti'
    ],
    interviewQuestions: [
      'Mi racconti di un feedback critico che ha ricevuto e cosa ha fatto',
      'In quali aree pensa di dover migliorare significativamente?',
      'Come gestisce situazioni in cui deve seguire indicazioni di altri?',
      'Qual è stato il suo più grande errore professionale?'
    ],
    managementTips: [
      'Valutare se l\'autonomia totale è possibile',
      'Se sì: obiettivi chiari, libertà sui metodi',
      'Se no: probabilmente non funzionerà',
      'Non investire in coaching che non verrà accettato',
      'Minimizzare le interfacce con altri team'
    ],
    contraindicatedRoles: [
      'Ruoli che richiedono collaborazione stretta',
      'Posizioni subordinate con supervisione attiva',
      'Team con cultura di feedback reciproco',
      'Ruoli che richiedono adattamento continuo'
    ],
    category: 'primary'
  },

  S19: {
    code: 'S19',
    name: 'RC GRAVE',
    severity: 'ORANGE',
    shortDescription: 'Altamente dispersiva, impulsiva. Vulcano di idee ma non ne completa nessuna.',
    extendedDescription: `Resistenza al Cambiamento gravemente negativa (RC <= -29). Questa persona presenta un pattern di estrema apertura al cambiamento che sconfina nella dispersività. È un vulcano di idee: ne genera continuamente ma raramente le porta a termine. Cambia direzione frequentemente, spesso prima di vedere i risultati delle azioni intraprese. L'impulsività decisionale può portare a scelte affrettate che poi vengono rapidamente abbandonate. In contesti che richiedono persistenza e follow-through, questo pattern è fortemente problematico.`,
    organizationalImpact: `Costo elevato di progetti iniziati e abbandonati. I colleghi si frustrano nel vedere continui cambiamenti di direzione. La pianificazione a lungo termine diventa impossibile. Le risorse vengono disperse su troppe iniziative simultanee. Tuttavia, può essere preziosa in ruoli puramente creativi/ideazione se affiancata da figure esecutive.`,
    warningSignals: [
      'Curriculum con molti cambi di direzione o progetti brevi',
      'Entusiasmo per nuove idee ma vago su come le ha concluse',
      'Difficoltà a descrivere progetti portati a termine',
      'Impazienza visibile quando si parla di dettagli operativi',
      'Tende a interrompere per proporre alternative'
    ],
    interviewQuestions: [
      'Mi racconti di un progetto importante che ha portato a termine nonostante le difficoltà',
      'Come gestisce la tentazione di cambiare direzione quando emerge una nuova opportunità?',
      'Qual è il suo rapporto con la routine e le attività ripetitive?',
      'Come reagiscono i suoi colleghi quando propone cambiamenti?'
    ],
    managementTips: [
      'Affiancare sempre con figure "completers" che portano a termine',
      'Obiettivi a brevissimo termine (1-2 settimane)',
      'Check frequenti per evitare derive',
      'Valorizzare la creatività incanalandola in processi strutturati',
      'Non affidare progetti lunghi in autonomia'
    ],
    contraindicatedRoles: [
      'Project manager',
      'Ruoli che richiedono persistenza plurimensile',
      'Gestione operativa quotidiana',
      'Ruoli amministrativi o procedurali',
      'Posizioni con deadline critiche non negoziabili'
    ],
    category: 'primary'
  },

  // ==========================================
  // SINDROMI SECONDARIE (SS1-SS6)
  // ==========================================

  SS1: {
    code: 'SS1',
    name: 'FA COSE MA NON LE FA FARE',
    severity: 'YELLOW',
    shortDescription: 'Alta autodisciplina ma bassa determinazione nella delega.',
    extendedDescription: `Persona molto disciplinata e capace di eseguire compiti in prima persona (alta autodisciplina), ma con difficoltà a far fare le cose agli altri (bassa determinazione). Questo pattern crea un collo di bottiglia: la persona diventa indispensabile ma sovraccarica. Non è adatta a ruoli di leadership che richiedono di ottenere risultati attraverso altri. Funziona bene come contributore individuale di alto livello.`,
    organizationalImpact: `Collo di bottiglia nelle attività. Difficoltà a scalare. Burnout potenziale. Il team non si sviluppa perché la persona non delega.`,
    warningSignals: [
      'Parla molto di cosa fa personalmente, poco di cosa fa fare',
      'Difficoltà a descrivere successi ottenuti attraverso altri',
      'Tendenza a "riprendere in mano" lavori delegati'
    ],
    interviewQuestions: [
      'Come gestisce la delega di attività importanti?',
      'Mi racconti di un risultato ottenuto principalmente attraverso il lavoro di altri',
      'Come reagisce quando un collaboratore non esegue come lei avrebbe fatto?'
    ],
    managementTips: [
      'Ruoli da contributore individuale senior',
      'Sviluppare competenze di delega se destinata a leadership',
      'Non affidare team grandi',
      'Valorizzare capacità esecutiva personale'
    ],
    contraindicatedRoles: [
      'Management di team numerosi',
      'Ruoli che richiedono risultati attraverso altri',
      'Direzione di progetti complessi'
    ],
    category: 'secondary'
  },

  SS2: {
    code: 'SS2',
    name: 'DISACCORDO IMPORTANTE',
    severity: 'YELLOW',
    shortDescription: 'Combinazione di pressione e scarsa comprensione genera conflitti.',
    extendedDescription: `La combinazione di bassa gestione pressioni e bassa comprensione crea una persona che sotto stress non riesce a comprendere gli altri e genera conflitti significativi. Quando le cose vanno bene può funzionare, ma nei momenti critici diventa una fonte di problemi relazionali. Il pattern è particolarmente evidente in situazioni di deadline, pressione commerciale o cambiamenti organizzativi.`,
    organizationalImpact: `Conflitti nei momenti critici quando la collaborazione è più necessaria. Relazioni danneggiate che persistono oltre la crisi. Evitamento della persona in situazioni di stress.`,
    warningSignals: [
      'Racconta conflitti avvenuti in momenti di stress',
      'Difficoltà a comprendere il punto di vista altrui sotto pressione',
      'Pattern di relazioni deteriorate in contesti difficili'
    ],
    interviewQuestions: [
      'Come comunica con i colleghi quando è sotto pressione?',
      'Mi racconti di un conflitto avvenuto durante un periodo stressante',
      'Come mantiene le relazioni quando le cose si fanno difficili?'
    ],
    managementTips: [
      'Coaching su gestione stress e comunicazione',
      'Supporto proattivo nei momenti di pressione',
      'Ruoli con pressione prevedibile e gestibile',
      'Non isolare durante le crisi'
    ],
    contraindicatedRoles: [
      'Ruoli ad alta pressione costante',
      'Gestione crisi',
      'Interfaccia in situazioni tese'
    ],
    category: 'secondary'
  },

  SS3: {
    code: 'SS3',
    name: 'PERFEZIONISTA',
    severity: 'YELLOW',
    shortDescription: 'Alta organizzazione ma poca tolleranza per gli errori altrui.',
    extendedDescription: `Persona estremamente organizzata (ORG>64) ma con bassa comprensione (COM<0). Questo crea un perfezionista che si aspetta dagli altri lo stesso livello di precisione che richiede a se stesso, ma non ha la pazienza di insegnare o tollerare errori. Può essere molto produttivo individualmente ma tossico per il team. I collaboratori si sentono costantemente giudicati e inadeguati.`,
    organizationalImpact: `Alta qualità del lavoro personale. Basso morale del team. Turnover nei collaboratori diretti. Difficoltà a costruire team funzionali.`,
    warningSignals: [
      'Critiche dettagliate sui difetti altrui',
      'Difficoltà a lodare il lavoro non perfetto',
      'Standard molto alti che "nessuno rispetta"'
    ],
    interviewQuestions: [
      'Come gestisce gli errori dei collaboratori?',
      'Quando un lavoro è "abbastanza buono" per lei?',
      'Come bilancia qualità e relazioni nel team?'
    ],
    managementTips: [
      'Valorizzare la precisione in ruoli individuali',
      'Coaching su feedback costruttivo',
      'Non affidare sviluppo di junior',
      'Regole chiare su come comunicare le correzioni'
    ],
    contraindicatedRoles: [
      'Mentoring e formazione',
      'Leadership di team in crescita',
      'Ruoli che richiedono alta tolleranza'
    ],
    category: 'secondary'
  },

  SS4: {
    code: 'SS4',
    name: 'ESECUTORE',
    severity: 'YELLOW',
    shortDescription: 'Profilo positivo: affidabile, organizzato, proattivo.',
    extendedDescription: `Questa è una sindrome "positiva" - un pattern che indica un profilo particolarmente affidabile. La combinazione di buona organizzazione, gestione pressioni e proattività crea una persona su cui si può contare per eseguire compiti in modo affidabile. Non è una figura di leadership naturale ma è il cuore operativo di qualsiasi organizzazione. Valorizzare e trattenere.`,
    organizationalImpact: `Stabilità operativa. Affidabilità nelle consegne. Punto di riferimento per il team. Basso rischio di sorprese negative.`,
    warningSignals: [
      'Nessun segnale di allarme - profilo positivo',
      'Verificare che non sia sottovalutato/sottopagato (rischio turnover)'
    ],
    interviewQuestions: [
      'Cosa la motiva a dare sempre il meglio?',
      'Come gestisce richieste che superano le sue responsabilità?',
      'Quali sono le sue aspettative di crescita?'
    ],
    managementTips: [
      'Valorizzare e riconoscere il contributo',
      'Percorsi di crescita come specialist senior',
      'Non sovraccaricare approfittando dell\'affidabilità',
      'Sviluppare se interessata/o a leadership'
    ],
    contraindicatedRoles: [
      'Nessuna controindicazione specifica',
      'Valutare interesse per ruoli di leadership prima di proporli'
    ],
    category: 'secondary'
  },

  SS5: {
    code: 'SS5',
    name: 'ZERBINO',
    severity: 'YELLOW',
    shortDescription: 'Alta proattività ma non si impone. Rischio di essere sfruttato.',
    extendedDescription: `Persona molto proattiva (PRO>40) ma con bassa determinazione (DET<35). Questo crea qualcuno che fa molto per gli altri ma non riesce a far valere i propri diritti e bisogni. Rischio concreto di essere sfruttato dai colleghi o di accumulare frustrazione che esplode improvvisamente. Ha bisogno di protezione e sviluppo dell'assertività.`,
    organizationalImpact: `Risorsa che rischia di essere sfruttata. Burnout probabile se non protetta. Quando "esplode" può creare conflitti significativi.`,
    warningSignals: [
      'Difficoltà a dire di no anche a richieste irragionevoli',
      'Parla di aver fatto "più del dovuto" senza riconoscimenti',
      'Frustrazione trattenuta che emerge in commenti indiretti'
    ],
    interviewQuestions: [
      'Come gestisce quando le vengono chieste cose oltre le sue responsabilità?',
      'Quando ha detto di no a una richiesta lavorativa?',
      'Come fa valere le sue esigenze nel team?'
    ],
    managementTips: [
      'Proteggere da sovraccarico',
      'Coaching su assertività',
      'Monitorare carico di lavoro',
      'Riconoscere e valorizzare i contributi'
    ],
    contraindicatedRoles: [
      'Ruoli che richiedono negoziazione dura',
      'Posizioni dove verrà pressata da molte richieste',
      'Interfaccia con personalità aggressive'
    ],
    category: 'secondary'
  },

  SS6: {
    code: 'SS6',
    name: 'RC ELEVATA',
    severity: 'YELLOW',
    shortDescription: 'Rigidità elevata. Resiste ai cambiamenti, si giustifica. Gestire con numeri.',
    extendedDescription: `Resistenza al Cambiamento molto elevata (RC>=45). Questa persona resiste a qualsiasi cambiamento e quando sbaglia tende a giustificarsi invece di ammettere l'errore. Non è cattiva fede: è un meccanismo difensivo profondo. La gestione richiede pazienza, dati oggettivi e non confronto diretto. Può funzionare in contesti stabili ma è problematica in ambienti dinamici.`,
    organizationalImpact: `Rallentamento nell'adozione di novità. Conflitti durante i cambiamenti organizzativi. Energie spese per convincere invece che per agire. Tuttavia, può essere stabilizzante in contesti già funzionanti.`,
    warningSignals: [
      'Critiche ai cambiamenti nelle aziende precedenti',
      'Enfasi su "come si faceva prima"',
      'Difficoltà ad ammettere errori, tendenza a giustificare'
    ],
    interviewQuestions: [
      'Come ha vissuto l\'ultimo grande cambiamento nella sua azienda?',
      'Mi racconti di una volta in cui ha cambiato idea su qualcosa di importante',
      'Come reagisce quando le sue abitudini lavorative devono cambiare?'
    ],
    managementTips: [
      'Usare dati e numeri per argomentare cambiamenti',
      'Coinvolgere nella pianificazione, non imporre',
      'Tempi di adattamento più lunghi',
      'Non aspettarsi ammissioni di errore dirette',
      'Valorizzare la stabilità che può portare'
    ],
    contraindicatedRoles: [
      'Ruoli in ambienti ad alto cambiamento',
      'Startup e contesti agili',
      'Ruoli che richiedono innovazione continua',
      'Change management'
    ],
    category: 'secondary'
  }
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Ottiene i dati estesi di una sindrome dal codice
 */
export function getSyndromeExtendedData(code: string): SyndromeExtendedData | undefined {
  return SYNDROMES_V5_DATA[code];
}

/**
 * Filtra sindromi per severità
 */
export function getSyndromesBySeverity(severity: SyndromeSeverity): SyndromeExtendedData[] {
  return Object.values(SYNDROMES_V5_DATA).filter(s => s.severity === severity);
}

/**
 * Calcola il livello di criticità globale (LIV 1-8)
 * Basato sul numero e gravità delle sindromi attive
 */
export function calculateCriticalityLevel(activeSyndromeCodes: string[]): number {
  if (activeSyndromeCodes.length === 0) return 1;

  const syndromes = activeSyndromeCodes.map(code => SYNDROMES_V5_DATA[code]).filter(Boolean);

  const redCount = syndromes.filter(s => s.severity === 'RED').length;
  const orangeCount = syndromes.filter(s => s.severity === 'ORANGE').length;
  const yellowCount = syndromes.filter(s => s.severity === 'YELLOW').length;

  // LIV 8 (max criticità): 2+ RED
  if (redCount >= 2) return 8;
  // LIV 7: 1 RED + 2+ ORANGE
  if (redCount >= 1 && orangeCount >= 2) return 7;
  // LIV 6: 1 RED
  if (redCount >= 1) return 6;
  // LIV 5: 3+ ORANGE
  if (orangeCount >= 3) return 5;
  // LIV 4: 2 ORANGE
  if (orangeCount >= 2) return 4;
  // LIV 3: 1 ORANGE + 2+ YELLOW
  if (orangeCount >= 1 && yellowCount >= 2) return 3;
  // LIV 2: 1 ORANGE o 3+ YELLOW
  if (orangeCount >= 1 || yellowCount >= 3) return 2;
  // LIV 1: solo YELLOW o nessuna
  return 1;
}

/**
 * Ottiene etichetta per livello di criticità
 */
export function getCriticalityLabel(level: number): { label: string; color: string } {
  const labels: Record<number, { label: string; color: string }> = {
    1: { label: 'BASSO', color: 'text-green-600' },
    2: { label: 'LIEVE', color: 'text-lime-600' },
    3: { label: 'MODERATO', color: 'text-yellow-600' },
    4: { label: 'SIGNIFICATIVO', color: 'text-amber-600' },
    5: { label: 'ELEVATO', color: 'text-orange-600' },
    6: { label: 'ALTO', color: 'text-red-500' },
    7: { label: 'MOLTO ALTO', color: 'text-red-600' },
    8: { label: 'CRITICO', color: 'text-red-700' }
  };
  return labels[level] || labels[1];
}

/**
 * Genera semaforo visivo per la severità
 */
export function getSeverityTrafficLight(severity: SyndromeSeverity): {
  bgColor: string;
  borderColor: string;
  textColor: string;
  label: string;
} {
  const config: Record<SyndromeSeverity, { bgColor: string; borderColor: string; textColor: string; label: string }> = {
    RED: {
      bgColor: 'bg-red-50',
      borderColor: 'border-red-500',
      textColor: 'text-red-700',
      label: 'CRITICA'
    },
    ORANGE: {
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-500',
      textColor: 'text-orange-700',
      label: 'ATTENZIONE'
    },
    YELLOW: {
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-500',
      textColor: 'text-yellow-700',
      label: 'MONITORARE'
    }
  };
  return config[severity];
}
