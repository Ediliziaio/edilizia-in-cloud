/**
 * Testi interpretativi completi per ogni scala e range di punteggio
 * Secondo il Manuale Talent Profiler V3 - Capitolo 13
 */

import { ScalaCode, SCALE_LABELS } from '../types';

export interface ScaleRangeText {
  scala: ScalaCode;
  rangeMin: number;
  rangeMax: number;
  livello: string;
  testo: string;
  implicazioni: string;
  domande_colloquio: string[];
}

/**
 * Range di punteggio standard (Manuale V3)
 * 0-39: Critico
 * 40-59: Carenza Significativa
 * 60-79: Carenza Moderata (Out Point)
 * 80-119: Nella Norma
 * 120-159: Sopra la Media
 * 160-200: Eccellenza (Strength Point)
 */

export const SCALE_RANGE_TEXTS: ScaleRangeText[] = [
  // ==================== STILE DI VITA (SV) ====================
  {
    scala: 'SV',
    rangeMin: 0,
    rangeMax: 39,
    livello: 'Critico',
    testo: 'Il candidato mostra segnali di crisi personale grave. Possibili situazioni: divorzio in corso, lutto recente, problemi economici seri, conflitti familiari gravi, problemi di salute non risolti.',
    implicazioni: 'IMPOSSIBILE garantire performance stabili. La mente è altrove. Qualsiasi pressione lavorativa potrebbe essere la goccia che fa traboccare il vaso. Rischio elevato di assenze, cali improvvisi, conflitti.',
    domande_colloquio: [
      'So che può essere personale, ma come sta in questo periodo della sua vita?',
      'C\'è qualcosa che la preoccupa particolarmente in questo momento?',
      'Ha un sistema di supporto (famiglia, amici) su cui può contare?'
    ]
  },
  {
    scala: 'SV',
    rangeMin: 40,
    rangeMax: 59,
    livello: 'Carenza Significativa',
    testo: 'Significativo disagio nella sfera personale. Probabile squilibrio vita-lavoro cronico, relazioni personali problematiche o insoddisfazione generale. Non in crisi acuta ma in difficoltà persistente.',
    implicazioni: 'Performance ridotta del 20-30%. Difficoltà a gestire picchi di lavoro. Tendenza a portare problemi personali sul lavoro. Richiede ambiente comprensivo e flessibile.',
    domande_colloquio: [
      'Come descriverebbe il suo equilibrio attuale tra vita personale e lavoro?',
      'Cosa le piacerebbe cambiare nella sua vita quotidiana?',
      'Qual è stata la sfida più grande che ha dovuto affrontare recentemente?'
    ]
  },
  {
    scala: 'SV',
    rangeMin: 60,
    rangeMax: 79,
    livello: 'Sotto la Media',
    testo: 'Sfera personale non ottimale ma gestibile. Possibile insoddisfazione moderata, stress familiare contenuto o fase di transizione (nuovo figlio, trasferimento, cambio casa).',
    implicazioni: 'Impatto limitato sulla performance in condizioni normali. Sotto stress potrebbe mostrare cali. Beneficia di flessibilità oraria e comprensione.',
    domande_colloquio: [
      'Cosa la motiva a cercare un nuovo lavoro in questo momento?',
      'Come gestisce le giornate più impegnative?'
    ]
  },
  {
    scala: 'SV',
    rangeMin: 80,
    rangeMax: 119,
    livello: 'Nella Norma',
    testo: 'Equilibrio vita-lavoro nella media. Situazione personale stabile senza particolari criticità. Persona generalmente soddisfatta della propria vita.',
    implicazioni: 'Nessun impatto particolare sulla performance. Base solida per affrontare il lavoro con serenità.',
    domande_colloquio: []
  },
  {
    scala: 'SV',
    rangeMin: 120,
    rangeMax: 159,
    livello: 'Sopra la Media',
    testo: 'Ottimo equilibrio personale. Relazioni soddisfacenti, hobby coltivati, senso di realizzazione. Affronta la vita con positività.',
    implicazioni: 'Risorsa stabile e affidabile. Porta energia positiva al team. Gestisce lo stress con più facilità degli altri.',
    domande_colloquio: []
  },
  {
    scala: 'SV',
    rangeMin: 160,
    rangeMax: 200,
    livello: 'Eccellenza',
    testo: 'PUNTO DI FORZA. Vita personale pienamente soddisfacente. Persona equilibrata, serena, con basi solide che le permettono di affrontare qualsiasi sfida professionale con lucidità.',
    implicazioni: 'Asset prezioso. Può essere punto di riferimento per colleghi in difficoltà. Performance stabili anche sotto pressione. Eccellente gestione dei confini vita-lavoro.',
    domande_colloquio: []
  },

  // ==================== MOTIVAZIONE (MO) ====================
  {
    scala: 'MO',
    rangeMin: 0,
    rangeMax: 39,
    livello: 'Critico',
    testo: 'Motivazione quasi assente. Il candidato non mostra alcuna spinta intrinseca. Possibile burnout, depressione lavorativa o totale disallineamento con il settore.',
    implicazioni: 'RISCHIO ELEVATISSIMO di abbandono nei primi mesi. Non sosterrà alcuno sforzo extra. Necessita supervisione costante per completare anche compiti base.',
    domande_colloquio: [
      'Cosa la spinge a candidarsi per questa posizione?',
      'Quali sono i suoi obiettivi professionali a 3 anni?',
      'Cosa la appassiona nel suo lavoro?'
    ]
  },
  {
    scala: 'MO',
    rangeMin: 40,
    rangeMax: 59,
    livello: 'Carenza Significativa',
    testo: 'Bassa motivazione intrinseca. Lavora principalmente per necessità economica, non per passione. Difficoltà a mantenere l\'impegno nel tempo.',
    implicazioni: 'Performance minime accettabili. Non farà nulla in più del dovuto. Tendenza a rallentare quando non osservato. Richiede incentivi esterni costanti.',
    domande_colloquio: [
      'Cosa la entusiasma del suo lavoro attuale?',
      'Come si motiva quando i compiti sono ripetitivi?',
      'Qual è stato il progetto che l\'ha coinvolta di più e perché?'
    ]
  },
  {
    scala: 'MO',
    rangeMin: 60,
    rangeMax: 79,
    livello: 'Sotto la Media',
    testo: 'Motivazione moderata. Lavora discretamente ma senza entusiasmo. Preferisce routine a sfide. Non cerca attivamente nuovi obiettivi.',
    implicazioni: 'Adatto a ruoli stabili e prevedibili. Non adatto a posizioni che richiedono proattività e iniziativa. Può crescere con giusti stimoli.',
    domande_colloquio: [
      'Cosa l\'ha attratta di questa opportunità?',
      'Come reagisce quando le viene proposta una nuova sfida?'
    ]
  },
  {
    scala: 'MO',
    rangeMin: 80,
    rangeMax: 119,
    livello: 'Nella Norma',
    testo: 'Motivazione adeguata. Persona che lavora con impegno costante. Reagisce positivamente agli stimoli ma non li cerca autonomamente.',
    implicazioni: 'Performance affidabili in condizioni standard. Beneficia di obiettivi chiari e feedback regolari.',
    domande_colloquio: []
  },
  {
    scala: 'MO',
    rangeMin: 120,
    rangeMax: 159,
    livello: 'Sopra la Media',
    testo: 'Buona motivazione intrinseca. Persona che trova soddisfazione nel lavoro ben fatto. Cerca attivamente miglioramenti.',
    implicazioni: 'Elemento trainante. Può influenzare positivamente colleghi meno motivati. Eccellente per ruoli con obiettivi sfidanti.',
    domande_colloquio: []
  },
  {
    scala: 'MO',
    rangeMin: 160,
    rangeMax: 200,
    livello: 'Eccellenza',
    testo: 'PUNTO DI FORZA. Altissima motivazione intrinseca. Persona che lavora con passione, cerca eccellenza, non si accontenta. Vede il lavoro come realizzazione personale.',
    implicazioni: 'Asset strategico. Può guidare progetti complessi. ATTENZIONE: se la motivazione non è canalizzata correttamente, rischio di frustrazione se l\'azienda non offre sfide adeguate.',
    domande_colloquio: []
  },

  // ==================== CAPACITÀ DI FRONTEGGIARE (CF) ====================
  {
    scala: 'CF',
    rangeMin: 0,
    rangeMax: 39,
    livello: 'Critico',
    testo: 'Resilienza quasi nulla. Il candidato crolla sotto qualsiasi pressione. Possibile stato ansioso cronico, evitamento sistematico delle difficoltà, incapacità di gestire imprevisti.',
    implicazioni: 'INCOMPATIBILE con ruoli che prevedono qualsiasi forma di stress. Rischio di blocco operativo, assenze frequenti, necessità di supporto costante. Qualsiasi scadenza urgente sarà un problema.',
    domande_colloquio: [
      'Mi racconti di una situazione difficile che ha dovuto affrontare. Come l\'ha gestita?',
      'Cosa fa quando si sente sotto pressione?',
      'Come reagisce quando qualcosa non va secondo i piani?'
    ]
  },
  {
    scala: 'CF',
    rangeMin: 40,
    rangeMax: 59,
    livello: 'Carenza Significativa',
    testo: 'Bassa resilienza. Gestisce situazioni ordinarie ma entra in difficoltà con pressioni moderate. Tendenza a evitare conflitti e problemi.',
    implicazioni: 'Richiede ambiente protetto. Non adatto a ruoli di front-line o con clienti difficili. Necessita supervisore che filtri le pressioni. Rischio di burnout se esposto a stress prolungato.',
    domande_colloquio: [
      'Come ha gestito il momento più stressante della sua carriera?',
      'Cosa fa per recuperare dopo una giornata pesante?',
      'Ha strategie per gestire lo stress?'
    ]
  },
  {
    scala: 'CF',
    rangeMin: 60,
    rangeMax: 79,
    livello: 'Sotto la Media',
    testo: 'Resilienza moderata. Gestisce pressioni normali ma fatica con stress intenso o prolungato. Recupera lentamente dopo periodi difficili.',
    implicazioni: 'Adatto a ruoli con stress prevedibile e contenuto. Monitorare durante picchi di lavoro. Beneficia di pause regolari e supporto nei momenti critici.',
    domande_colloquio: [
      'Come gestisce le scadenze ravvicinate?',
      'Cosa la aiuta a mantenere la calma nei momenti difficili?'
    ]
  },
  {
    scala: 'CF',
    rangeMin: 80,
    rangeMax: 119,
    livello: 'Nella Norma',
    testo: 'Buona capacità di gestione dello stress ordinario. Affronta le difficoltà con risorse adeguate. Recupera in tempi normali.',
    implicazioni: 'Nessuna particolare criticità. Performance stabili in condizioni standard. Può gestire picchi occasionali.',
    domande_colloquio: []
  },
  {
    scala: 'CF',
    rangeMin: 120,
    rangeMax: 159,
    livello: 'Sopra la Media',
    testo: 'Elevata resilienza. Gestisce bene situazioni stressanti, mantiene lucidità sotto pressione, recupera velocemente.',
    implicazioni: 'Adatto a ruoli sfidanti. Può supportare colleghi in difficoltà. Affidabile nei momenti critici.',
    domande_colloquio: []
  },
  {
    scala: 'CF',
    rangeMin: 160,
    rangeMax: 200,
    livello: 'Eccellenza',
    testo: 'PUNTO DI FORZA. Eccezionale capacità di fronteggiare. Rimane lucido e operativo anche in situazioni di crisi. Gli ostacoli lo motivano invece di abbatterlo.',
    implicazioni: 'Asset strategico per ruoli ad alta pressione. Può gestire emergenze e guidare team in situazioni critiche. Ottimo per vendite, management, ruoli di responsabilità.',
    domande_colloquio: []
  },

  // ==================== EFFICIENZA (EF) ====================
  {
    scala: 'EF',
    rangeMin: 0,
    rangeMax: 39,
    livello: 'Critico',
    testo: 'Disorganizzazione grave. Incapacità di rispettare scadenze, gestire priorità, mantenere ordine. Probabile ADHD non diagnosticato o grave deficit organizzativo.',
    implicazioni: 'INCOMPATIBILE con ruoli che richiedono affidabilità. Scadenze sistematicamente mancate. Necessita supervisione costante e check continui. Rischio operativo elevato.',
    domande_colloquio: [
      'Come organizza la sua giornata lavorativa tipo?',
      'Quali strumenti usa per gestire scadenze e priorità?',
      'Mi racconti di una volta in cui ha dovuto gestire più compiti contemporaneamente.'
    ]
  },
  {
    scala: 'EF',
    rangeMin: 40,
    rangeMax: 59,
    livello: 'Carenza Significativa',
    testo: 'Scarsa autodisciplina. Difficoltà nel seguire procedure, rispettare tempi, mantenere ordine. Lavora a singhiozzo, alterna periodi produttivi a stasi.',
    implicazioni: 'Richiede supervisione stretta. Non adatto a lavoro autonomo. Scadenze vanno monitorate attivamente. Può migliorare con formazione su time management.',
    domande_colloquio: [
      'Come gestisce le scadenze multiple?',
      'Qual è il suo punto debole nell\'organizzazione del lavoro?',
      'Cosa fa quando si rende conto di essere in ritardo su un compito?'
    ]
  },
  {
    scala: 'EF',
    rangeMin: 60,
    rangeMax: 79,
    livello: 'Sotto la Media',
    testo: 'Efficienza moderata. Rispetta le scadenze principali ma può trascurare dettagli. Organizzazione migliorabile.',
    implicazioni: 'Adatto a ruoli con supervisione moderata. Beneficia di sistemi e procedure chiari. Non ideale per project management o ruoli che richiedono precisione assoluta.',
    domande_colloquio: [
      'Come si assicura di non dimenticare compiti importanti?',
      'Preferisce lavorare con procedure definite o in modo più libero?'
    ]
  },
  {
    scala: 'EF',
    rangeMin: 80,
    rangeMax: 119,
    livello: 'Nella Norma',
    testo: 'Efficienza adeguata. Rispetta scadenze e procedure con affidabilità. Organizzazione del lavoro nella norma.',
    implicazioni: 'Performance prevedibili e affidabili. Nessuna particolare criticità.',
    domande_colloquio: []
  },
  {
    scala: 'EF',
    rangeMin: 120,
    rangeMax: 159,
    livello: 'Sopra la Media',
    testo: 'Elevata efficienza. Eccellente nella gestione del tempo, delle priorità e delle procedure. Lavoro ordinato e puntuale.',
    implicazioni: 'Affidabile per ruoli che richiedono precisione. Può supportare colleghi meno organizzati. Ottimo per ruoli amministrativi e di controllo.',
    domande_colloquio: []
  },
  {
    scala: 'EF',
    rangeMin: 160,
    rangeMax: 200,
    livello: 'Eccellenza',
    testo: 'PUNTO DI FORZA. Eccezionale efficienza operativa. Maestro nell\'ottimizzare processi, rispettare scadenze, mantenere standard elevati costantemente.',
    implicazioni: 'Asset operativo. Ideale per ruoli che richiedono precisione assoluta (compliance, qualità, operations). Può diventare riferimento metodologico per il team.',
    domande_colloquio: []
  },

  // ==================== EFFICACIA (EC) ====================
  {
    scala: 'EC',
    rangeMin: 0,
    rangeMax: 39,
    livello: 'Critico',
    testo: 'Determinazione quasi nulla. Abbandona al primo ostacolo. Non porta a termine i progetti. Evita qualsiasi sfida.',
    implicazioni: 'INCOMPATIBILE con qualsiasi ruolo che richieda risultati. Non raggiunge obiettivi autonomamente. Necessita guida costante per completare anche compiti semplici.',
    domande_colloquio: [
      'Mi racconti di un progetto difficile che ha portato a termine.',
      'Come reagisce quando qualcosa non funziona come previsto?',
      'Qual è stato il suo più grande fallimento e cosa ha imparato?'
    ]
  },
  {
    scala: 'EC',
    rangeMin: 40,
    rangeMax: 59,
    livello: 'Carenza Significativa',
    testo: 'Bassa determinazione. Inizia progetti con entusiasmo ma fatica a completarli. Si scoraggia facilmente. Preferisce compiti brevi e semplici.',
    implicazioni: 'Non adatto a ruoli con obiettivi a lungo termine. Richiede suddivisione in micro-obiettivi. Supervisione necessaria per garantire completamento.',
    domande_colloquio: [
      'Come mantiene la motivazione su progetti lunghi?',
      'Cosa fa quando si blocca su un problema?',
      'Preferisce molti piccoli compiti o pochi grandi progetti?'
    ]
  },
  {
    scala: 'EC',
    rangeMin: 60,
    rangeMax: 79,
    livello: 'Sotto la Media',
    testo: 'Determinazione moderata. Porta a termine i compiti ma senza particolare tenacia. Può arrendersi se le difficoltà sono significative.',
    implicazioni: 'Adatto a ruoli con obiettivi chiari e supporto disponibile. Beneficia di mentoring nei momenti difficili.',
    domande_colloquio: [
      'Come affronta gli obiettivi che sembrano molto difficili?',
      'Cosa la aiuta a non mollare?'
    ]
  },
  {
    scala: 'EC',
    rangeMin: 80,
    rangeMax: 119,
    livello: 'Nella Norma',
    testo: 'Determinazione adeguata. Porta a termine gli obiettivi con costanza. Gestisce gli ostacoli normali senza particolari difficoltà.',
    implicazioni: 'Performance affidabili. Raggiunge obiettivi standard senza problemi.',
    domande_colloquio: []
  },
  {
    scala: 'EC',
    rangeMin: 120,
    rangeMax: 159,
    livello: 'Sopra la Media',
    testo: 'Elevata determinazione. Persegue gli obiettivi con tenacia. Non si scoraggia facilmente. Trova soluzioni alternative quando necessario.',
    implicazioni: 'Affidabile per progetti complessi. Può guidare iniziative sfidanti. Buon candidato per ruoli di responsabilità.',
    domande_colloquio: []
  },
  {
    scala: 'EC',
    rangeMin: 160,
    rangeMax: 200,
    livello: 'Eccellenza',
    testo: 'PUNTO DI FORZA. Eccezionale determinazione. Non si arrende MAI. Trova sempre un modo per raggiungere l\'obiettivo. Gli ostacoli lo motivano.',
    implicazioni: 'Asset strategico per progetti sfidanti. Può trascinare team verso obiettivi ambiziosi. ATTENZIONE: verificare che non diventi testardaggine controproducente.',
    domande_colloquio: []
  },

  // ==================== QUANTITÀ RESPONSABILITÀ (QN) ====================
  {
    scala: 'QN',
    rangeMin: 0,
    rangeMax: 39,
    livello: 'Critico',
    testo: 'Rifiuta qualsiasi carico di lavoro. Non accetta responsabilità. Cerca sempre di delegare o evitare. Possibile burnout passato o profilo passivo cronico.',
    implicazioni: 'INCOMPATIBILE con qualsiasi ruolo che richieda autonomia. Necessita supervisione totale. Non gestirà mai più di un compito alla volta.',
    domande_colloquio: [
      'Quante attività riesce a gestire contemporaneamente?',
      'Come reagisce quando le viene assegnato un compito in più?',
      'Preferisce un carico ridotto ma costante o periodi intensi alternati a pause?'
    ]
  },
  {
    scala: 'QN',
    rangeMin: 40,
    rangeMax: 59,
    livello: 'Carenza Significativa',
    testo: 'Preferisce carichi leggeri. Si sente sopraffatto facilmente. Evita di prendere impegni aggiuntivi.',
    implicazioni: 'Non sovraccaricare. Adatto a ruoli con compiti ben definiti e limitati. Rischio di paralisi se le richieste aumentano.',
    domande_colloquio: [
      'Come si sente quando ha molte cose da fare?',
      'Qual è il suo modo di dire no a richieste eccessive?'
    ]
  },
  {
    scala: 'QN',
    rangeMin: 60,
    rangeMax: 79,
    livello: 'Sotto la Media',
    testo: 'Gestisce carichi moderati. Può sentirsi sotto pressione se le richieste aumentano. Preferisce stabilità.',
    implicazioni: 'Adatto a ruoli stabili. Introdurre nuove responsabilità gradualmente.',
    domande_colloquio: [
      'Come gestisce i periodi di picco?'
    ]
  },
  {
    scala: 'QN',
    rangeMin: 80,
    rangeMax: 119,
    livello: 'Nella Norma',
    testo: 'Gestisce normali carichi di lavoro senza difficoltà. Equilibrio adeguato tra produttività e sostenibilità.',
    implicazioni: 'Nessuna criticità. Carichi standard sono gestibili.',
    domande_colloquio: []
  },
  {
    scala: 'QN',
    rangeMin: 120,
    rangeMax: 159,
    livello: 'Sopra la Media',
    testo: 'Buona capacità di gestire carichi elevati. Non teme responsabilità multiple. Organizzato nel multitasking.',
    implicazioni: 'Affidabile per ruoli complessi. Può assumere responsabilità aggiuntive.',
    domande_colloquio: []
  },
  {
    scala: 'QN',
    rangeMin: 160,
    rangeMax: 200,
    livello: 'Eccellenza',
    testo: 'PUNTO DI FORZA. Eccezionale capacità di gestione. Può gestire molteplici responsabilità simultaneamente senza perdere qualità.',
    implicazioni: 'Asset per ruoli ad alta complessità. ATTENZIONE: verificare che non sia sovraccarico attuale. Alto QN può mascherare rischio burnout se combinato con basso SV.',
    domande_colloquio: []
  },

  // ==================== QUALITÀ RESPONSABILITÀ (QR) ====================
  {
    scala: 'QR',
    rangeMin: 0,
    rangeMax: 39,
    livello: 'Critico',
    testo: 'Rifiuta completamente la responsabilità dei risultati. Attribuisce sempre cause esterne (sfortuna, colleghi, sistema). Mentalità da vittima.',
    implicazioni: 'INCOMPATIBILE con qualsiasi ruolo di responsabilità. Non ammetterà mai errori. Tenderà a creare conflitti e a incolpare altri.',
    domande_colloquio: [
      'Quando un progetto non va bene, a cosa lo attribuisce?',
      'Mi racconti di un suo errore significativo e cosa ha fatto.',
      'Chi o cosa influenza maggiormente i suoi risultati?'
    ]
  },
  {
    scala: 'QR',
    rangeMin: 40,
    rangeMax: 59,
    livello: 'Carenza Significativa',
    testo: 'Bassa assunzione di responsabilità. Tende a giustificare fallimenti con fattori esterni. Difficoltà ad ammettere errori.',
    implicazioni: 'Non adatto a ruoli di leadership. Richiede supervisione per garantire accountability. Può creare problemi in team.',
    domande_colloquio: [
      'Come reagisce quando qualcosa che ha fatto non funziona?',
      'Qual è il feedback più critico che ha ricevuto e come l\'ha gestito?'
    ]
  },
  {
    scala: 'QR',
    rangeMin: 60,
    rangeMax: 79,
    livello: 'Sotto la Media',
    testo: 'Responsabilità moderata. Accetta la responsabilità in situazioni chiare ma può tendere a giustificarsi quando le cose si complicano.',
    implicazioni: 'Sviluppare cultura del feedback. Aiutare a vedere gli errori come opportunità di crescita.',
    domande_colloquio: [
      'Come gestisce le critiche al suo lavoro?'
    ]
  },
  {
    scala: 'QR',
    rangeMin: 80,
    rangeMax: 119,
    livello: 'Nella Norma',
    testo: 'Adeguata assunzione di responsabilità. Riconosce il proprio ruolo nei risultati, positivi o negativi.',
    implicazioni: 'Profilo equilibrato. Gestisce l\'accountability in modo maturo.',
    domande_colloquio: []
  },
  {
    scala: 'QR',
    rangeMin: 120,
    rangeMax: 159,
    livello: 'Sopra la Media',
    testo: 'Elevato senso di responsabilità. Si sente owner dei progetti. Ammette errori e cerca soluzioni.',
    implicazioni: 'Ottimo per ruoli di responsabilità. Può guidare team e progetti.',
    domande_colloquio: []
  },
  {
    scala: 'QR',
    rangeMin: 160,
    rangeMax: 200,
    livello: 'Eccellenza',
    testo: 'PUNTO DI FORZA. Leadership naturale nella responsabilità. Si sente completamente responsabile dei risultati. Proattivo nel risolvere problemi.',
    implicazioni: 'Asset per ruoli direttivi. ATTENZIONE: può assumere troppo su di sé. Verificare che deleghi adeguatamente.',
    domande_colloquio: []
  },

  // ==================== SPAZIO VITALE (SP) - AMBIZIONE (Manuale V5) ====================
  // CORREZIONE V5: SP = AMBIZIONE, obiettivi personali materiali/economici
  // Basso SP = nessun obiettivo, incompatibile con vendita
  // COMBINAZIONE CRITICA: Alta MO + Basso SP = "Motore che gira a vuoto"
  {
    scala: 'SP',
    rangeMin: 0,
    rangeMax: 39,
    livello: 'Critico',
    testo: 'Nessuna ambizione personale. Mancano completamente obiettivi materiali ed economici. Non desidera migliorare la propria condizione.',
    implicazioni: 'INCOMPATIBILE con ruoli commerciali: come può convincere altri a comprare se non desidera nulla per sé? Può funzionare solo in ruoli di mera esecuzione senza obiettivi di crescita.',
    domande_colloquio: [
      'Cosa desidera raggiungere nella vita a livello economico e materiale?',
      'Quali sono i suoi obiettivi per i prossimi 5 anni?',
      'Cosa la motiva a lavorare oltre alla necessità economica base?'
    ]
  },
  {
    scala: 'SP',
    rangeMin: 40,
    rangeMax: 59,
    livello: 'Carenza Significativa',
    testo: 'Bassa ambizione. Manca una spinta verso obiettivi materiali concreti. Non cerca miglioramenti significativi della propria condizione economica.',
    implicazioni: 'ATTENZIONE per vendita: se combinato con alta MO = "Motore che gira a vuoto". Sembra motivato ma produce poco perché manca la meta. Adatto a ruoli stabili senza target.',
    domande_colloquio: [
      'Cosa vorrebbe cambiare della sua situazione economica attuale?',
      'Ha obiettivi di carriera specifici che desidera raggiungere?'
    ]
  },
  {
    scala: 'SP',
    rangeMin: 60,
    rangeMax: 79,
    livello: 'Sotto la Media',
    testo: 'Ambizione moderata. Ha qualche obiettivo ma non particolarmente forte. Non è guidato da traguardi economici specifici.',
    implicazioni: 'Può funzionare in ruoli stabili ma NON in vendita o ruoli con obiettivi sfidanti. Manca la spinta per fare quel passo in più.',
    domande_colloquio: [
      'Cosa la farebbe sentire realizzato professionalmente tra 3 anni?',
      'Quanto sono importanti per lei gli incentivi economici?'
    ]
  },
  {
    scala: 'SP',
    rangeMin: 80,
    rangeMax: 119,
    livello: 'Nella Norma',
    testo: 'Ambizione nella media. Ha obiettivi personali ma non è particolarmente spinto. Cerca un equilibrio più che la crescita massima.',
    implicazioni: 'Profilo equilibrato. Performance stabili ma potrebbe non brillare in ruoli ad alta competizione.',
    domande_colloquio: []
  },
  {
    scala: 'SP',
    rangeMin: 120,
    rangeMax: 159,
    livello: 'Sopra la Media',
    testo: 'Buona ambizione. Ha obiettivi chiari di crescita materiale ed economica. Sa cosa vuole e lavora per ottenerlo.',
    implicazioni: 'Buon profilo per ruoli commerciali e di crescita. Risponde bene a incentivi e bonus.',
    domande_colloquio: []
  },
  {
    scala: 'SP',
    rangeMin: 160,
    rangeMax: 200,
    livello: 'Eccellenza',
    testo: 'PUNTO DI FORZA. Persona molto ambiziosa con obiettivi materiali chiari e definiti. Vuole migliorare significativamente la propria condizione. Ha fame di risultati.',
    implicazioni: 'IDEALE per vendita e ruoli con bonus/incentivi. La sua ambizione è il motore che lo spinge a performare. Assicurarsi che gli obiettivi aziendali siano allineati con i suoi.',
    domande_colloquio: []
  },

  // ==================== PARTECIPAZIONE (PA) ====================
  {
    scala: 'PA',
    rangeMin: 0,
    rangeMax: 39,
    livello: 'Critico',
    testo: 'Isolamento relazionale grave. Evita qualsiasi interazione. Possibile fobia sociale o trauma relazionale. Non partecipa a nulla.',
    implicazioni: 'INCOMPATIBILE con qualsiasi ruolo che richieda lavoro in team. Non parteciperà a riunioni, eventi, collaborazioni. Sarà un\'isola.',
    domande_colloquio: [
      'Come si trova a lavorare in team?',
      'Mi racconti di una collaborazione che ha funzionato bene.',
      'Cosa prova quando deve interagire con molte persone?'
    ]
  },
  {
    scala: 'PA',
    rangeMin: 40,
    rangeMax: 59,
    livello: 'Carenza Significativa',
    testo: 'Bassa partecipazione relazionale. Preferisce lavorare da solo. Partecipa a team only quando obbligato.',
    implicazioni: 'Adatto a ruoli individuali. Se inserito in team, rischio di isolamento. Non adatto a ruoli commerciali o di interfaccia.',
    domande_colloquio: [
      'Preferisce lavorare da solo o in team?',
      'Come contribuisce alle riunioni?'
    ]
  },
  {
    scala: 'PA',
    rangeMin: 60,
    rangeMax: 79,
    livello: 'Sotto la Media',
    testo: 'Partecipazione moderata. Collabora quando necessario ma non cerca attivamente interazioni. Contributo discreto in team.',
    implicazioni: 'Funziona in team strutturati. Non sarà leader sociale. Va bene per ruoli misti individuo/team.',
    domande_colloquio: [
      'Come preferisce comunicare con i colleghi?'
    ]
  },
  {
    scala: 'PA',
    rangeMin: 80,
    rangeMax: 119,
    livello: 'Nella Norma',
    testo: 'Partecipazione adeguata. Collabora efficacemente in team. Partecipa attivamente a riunioni e iniziative.',
    implicazioni: 'Nessuna criticità. Buon giocatore di squadra.',
    domande_colloquio: []
  },
  {
    scala: 'PA',
    rangeMin: 120,
    rangeMax: 159,
    livello: 'Sopra la Media',
    testo: 'Elevata partecipazione. Cerca attivamente collaborazione. Costruisce relazioni. Anima riunioni e iniziative.',
    implicazioni: 'Ottimo per ruoli che richiedono networking. Può essere catalizzatore di team.',
    domande_colloquio: []
  },
  {
    scala: 'PA',
    rangeMin: 160,
    rangeMax: 200,
    livello: 'Eccellenza',
    testo: 'PUNTO DI FORZA. Eccezionale propensione relazionale. Costruisce reti, coinvolge, ispira. Naturalmente al centro delle dinamiche sociali.',
    implicazioni: 'Asset per ruoli commerciali, HR, leadership. Può essere informalmente leader del team. ATTENZIONE: può soffrire in ruoli troppo isolati.',
    domande_colloquio: []
  },

  // ==================== SCHEMATICITÀ (SC) - RANGE SPECIALI ====================
  {
    scala: 'SC',
    rangeMin: 0,
    rangeMax: 59,
    livello: 'Molto Flessibile',
    testo: 'Schematicità molto bassa = Flessibilità molto alta. Persona che si adatta facilmente, non ama routine e procedure. Può essere percepito come "caotico".',
    implicazioni: 'OTTIMO per ruoli creativi, startup, ambienti dinamici. NON ADATTO a ruoli che richiedono procedure strette (compliance, qualità, amministrazione).',
    domande_colloquio: [
      'Come si trova con procedure e regole rigide?',
      'Preferisce libertà o struttura nel suo lavoro?'
    ]
  },
  {
    scala: 'SC',
    rangeMin: 60,
    rangeMax: 89,
    livello: 'Flessibile',
    testo: 'Buona flessibilità. Accetta cambiamenti senza difficoltà. Può seguire procedure ma non ne dipende.',
    implicazioni: 'Adatto a ruoli dinamici con necessità di adattamento. Gestisce bene l\'incertezza.',
    domande_colloquio: []
  },
  {
    scala: 'SC',
    rangeMin: 90,
    rangeMax: 140,
    livello: 'Equilibrato (OTTIMALE)',
    testo: 'RANGE OTTIMALE. Equilibrio tra struttura e flessibilità. Sa seguire procedure quando serve e adattarsi quando necessario.',
    implicazioni: 'Profilo ideale per la maggior parte dei ruoli. Combina affidabilità e adattabilità.',
    domande_colloquio: []
  },
  {
    scala: 'SC',
    rangeMin: 141,
    rangeMax: 170,
    livello: 'Rigido',
    testo: 'Alta schematicità. Preferisce procedure definite, routine stabili. Fatica con cambiamenti improvvisi.',
    implicazioni: 'OTTIMO per ruoli procedurali (amministrazione, compliance, controllo qualità). NON ADATTO a ruoli che richiedono adattamento frequente.',
    domande_colloquio: [
      'Come reagisce quando i piani cambiano all\'improvviso?',
      'Come gestisce l\'incertezza?'
    ]
  },
  {
    scala: 'SC',
    rangeMin: 171,
    rangeMax: 200,
    livello: 'Molto Rigido',
    testo: 'Schematicità estrema. Rigidità significativa. Forte bisogno di routine, procedure, prevedibilità. Cambiamenti sono fonte di stress.',
    implicazioni: 'SOLO per ruoli altamente procedurali. RISCHIO in ambienti dinamici. Può bloccarsi di fronte a imprevisti. Se combinato con basso CF, rischio di breakdown.',
    domande_colloquio: [
      'Mi racconti di una volta in cui ha dovuto cambiare completamente approccio. Come l\'ha vissuta?',
      'Cosa prova quando le regole cambiano senza preavviso?',
      'Come gestisce le eccezioni alle procedure?'
    ]
  }
];

/**
 * Ottiene il testo interpretativo per una scala e un valore specifico
 */
export function getScaleRangeText(scala: ScalaCode, valore: number): ScaleRangeText | null {
  const text = SCALE_RANGE_TEXTS.find(
    t => t.scala === scala && valore >= t.rangeMin && valore <= t.rangeMax
  );
  return text || null;
}

