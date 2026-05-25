/**
 * Trait Narratives V5 - Testi narrativi per ogni tratto e fascia
 * Basato sul Manuale Output V2.0
 * 
 * Ogni testo usa [Nome] come placeholder per il nome del candidato
 */

import { TraitCode } from '../types';

export type TraitFascia = 'eccellente' | 'buono' | 'discreto' | 'mediocre' | 'carenza' | 'critico' | 'grave';

export interface TraitNarrativeConfig {
  soglie: { min: number; max: number; fascia: TraitFascia }[];
  testi: Record<TraitFascia, string>;
}

// Helper per determinare la fascia in base al punteggio
export function getFascia(punteggio: number, config: TraitNarrativeConfig): TraitFascia {
  for (const { min, max, fascia } of config.soglie) {
    if (punteggio >= min && punteggio <= max) {
      return fascia;
    }
  }
  return 'mediocre';
}

// Helper per sostituire [Nome] con il nome reale e gestire genere M/F
export function personalizzaTesto(testo: string, nome: string, sesso: string | null): string {
  let risultato = testo.replace(/\[Nome\]/g, nome);
  
  // Gestione desinenze M/F
  if (sesso?.toLowerCase() === 'f') {
    risultato = risultato
      .replace(/fiero\/a/g, 'fiera')
      .replace(/partito\/a/g, 'partita')
      .replace(/andato\/a/g, 'andata')
      .replace(/inserita\/o/g, 'inserita')
      .replace(/idonea\/o/g, 'idonea')
      .replace(/convinta/g, 'convinta')
      .replace(/coinvolta/g, 'coinvolta');
  } else {
    risultato = risultato
      .replace(/fiero\/a/g, 'fiero')
      .replace(/partito\/a/g, 'partito')
      .replace(/andato\/a/g, 'andato')
      .replace(/inserita\/o/g, 'inserito')
      .replace(/idonea\/o/g, 'idoneo');
  }
  
  return risultato;
}

export const TRAIT_NARRATIVES: Record<TraitCode, TraitNarrativeConfig> = {
  // ==========================================
  // AREA ESSERE (Come Pensa)
  // ==========================================
  
  ORG: {
    soglie: [
      { min: 66, max: 100, fascia: 'eccellente' },
      { min: 50, max: 65, fascia: 'buono' },
      { min: 40, max: 49, fascia: 'discreto' },
      { min: 30, max: 39, fascia: 'mediocre' },
      { min: 15, max: 29, fascia: 'carenza' },
      { min: 0, max: 14, fascia: 'critico' },
      { min: -100, max: -1, fascia: 'grave' }
    ],
    testi: {
      eccellente: "[Nome] ha una mente straordinariamente organizzata. Sa esattamente dove vuole andare e ha una mappa mentale precisa di come arrivarci. Pianifica con anticipo, gestisce il tempo con rigore quasi chirurgico, e raramente si lascia sopraffare dagli imprevisti. Quando un problema si presenta, non va nel panico: lo scompone, lo analizza, lo risolve pezzo per pezzo. Le persone intorno a lei si sentono rassicurate dalla sua lucidità. Ha sempre chiaro cosa deve fare oggi, questa settimana, questo mese. I suoi colleghi sanno che se [Nome] dice 'ci penso io', la cosa è fatta. Unica nota: questa precisione può diventare rigidità se non bilanciata da flessibilità - soprattutto se anche RC è alto.",
      buono: "[Nome] ha ottime capacità organizzative. Ha una visione chiara dei suoi obiettivi e sa pianificare il percorso per raggiungerli. Gestisce bene il tempo nella grande maggioranza delle situazioni. Quando le cose si complicano - troppi stimoli simultanei, scadenze che si accavallano, richieste impreviste - può perdere leggermente il focus, ma recupera in fretta. La sua pianificazione non è maniacale ma è efficace: sa distinguere l'urgente dall'importante e agisce di conseguenza.",
      discreto: "[Nome] ha buone capacità organizzative nella vita quotidiana. Riesce a gestire le priorità e a tenere il filo delle attività in condizioni normali. Tuttavia, quando la complessità aumenta - più progetti contemporanei, scadenze ravvicinate, interferenze esterne - tende a perdere un po' la bussola. Non è disorganizzata, ma non ha quel margine di sicurezza che le permette di gestire il caos con serenità. Beneficerebbe molto di strumenti di pianificazione (agende, software, routine mattutine) che la aiutino a mantenere il focus anche sotto pressione.",
      mediocre: "[Nome] riesce a organizzarsi in condizioni normali e con carichi di lavoro gestibili. Ma quando le cose si complicano - e nel lavoro si complicano spesso - tende a perdere la bussola. Apre più attività di quante riesca a gestire, fatica a dire di no alle richieste, e finisce per reagire agli eventi invece di guidarli. Ha bisogno di un ambiente strutturato, con procedure chiare e qualcuno che la aiuti a stabilire le priorità. Se lasciata a se stessa in un contesto caotico, il rischio di blocco o dispersione è alto.",
      carenza: "[Nome] ha una relazione difficile con la pianificazione. Le intenzioni ci sono, ma tra il dire e il fare c'è di mezzo la quotidianità che la travolge. Apre cicli di azione senza completarli. Inizia la giornata con un'idea di cosa fare e la finisce avendo fatto tutt'altro. Le email non lette si accumulano, le scadenze si avvicinano senza che se ne accorga, i progetti restano a metà. Non è pigrizia: è mancanza di metodo. L'ambiente e gli eventi esterni dettano la sua agenda. Ha bisogno urgente di strumenti e abitudini di pianificazione, e di qualcuno che la aiuti a costruirli.",
      critico: "[Nome] fatica seriamente a organizzare il proprio tempo e le proprie priorità. Le giornate passano senza una direzione chiara. I progetti si accumulano senza mai essere completati. Le scadenze vengono mancate non per cattiva volontà ma per pura incapacità di gestire il flusso. Le persone intorno a lei non sanno mai cosa aspettarsi in termini di tempistiche. Questo crea frustrazione sia per lei che per il team. È una delle prime aree su cui intervenire perché senza organizzazione, tutto il resto crolla.",
      grave: "[Nome] vive in una condizione di dispersione mentale profonda. Non ha una direzione, non ha un piano, non ha una lista di priorità. Le interferenze esterne dominano completamente la sua giornata: qualsiasi cosa arrivi - un messaggio, una telefonata, un'urgenza altrui - diventa la cosa più importante. Non riesce a distinguere ciò che conta da ciò che non conta. Completa pochissimo di ciò che inizia. Senza un intervento strutturato e immediato sulla pianificazione e gestione del tempo, qualsiasi altro miglioramento sarà instabile e temporaneo. È come cercare di costruire una casa su un terreno che frana."
    }
  },
  
  AUT: {
    soglie: [
      { min: 71, max: 100, fascia: 'eccellente' },
      { min: 50, max: 70, fascia: 'buono' },
      { min: 35, max: 49, fascia: 'discreto' },
      { min: 20, max: 34, fascia: 'mediocre' },
      { min: 10, max: 19, fascia: 'carenza' },
      { min: 0, max: 9, fascia: 'critico' },
      { min: -100, max: -1, fascia: 'grave' }
    ],
    testi: {
      eccellente: "[Nome] ha un'ambizione fuori dal comune. Sogna in grandissimo e crede fermamente di poter realizzare quei sogni. Questa forza interiore è il suo motore principale: la spinge ad affrontare sfide che altri eviterebbero, a rialzarsi dopo i fallimenti, a non accontentarsi mai. Vede opportunità dove altri vedono problemi. Tuttavia, un'ambizione così forte può diventare un'arma a doppio taglio: se non è accompagnata da disciplina (ADS), relazioni sane (AVERE) e gestione delle pressioni (GP), può trasformarsi in arroganza, impazienza o incapacità di lavorare in team. Le persone molto ambiziose tendono a sottovalutare i rischi e a sopravvalutare le proprie capacità. La chiave è incanalare questa energia straordinaria nella direzione giusta.",
      buono: "[Nome] ha una forte fiducia in se stessa e nelle proprie possibilità. Sogna in grande e si lancia nelle opportunità con convinzione. Non ha paura di mettersi in gioco e crede che impegnandosi possa ottenere risultati importanti. Questa motivazione interna è un asset prezioso: non ha bisogno che qualcuno le dica cosa fare o la spinga ad agire. Si muove da sola. Nei momenti di difficoltà può vacillare, ma trova sempre la forza di rialzarsi. Il suo entusiasmo è contagioso per chi le sta intorno.",
      discreto: "[Nome] ha una buona dose di fiducia in se stessa. Crede nelle proprie capacità e si pone obiettivi significativi, anche se non sempre grandiosi. Ha l'energia per inseguire le opportunità quando si presentano. In momenti di forte pressione o dopo un fallimento può avere dubbi su di sé, ma recupera abbastanza velocemente. Non è il tipo che si butta a capofitto in tutto, ma quando decide di impegnarsi lo fa con convinzione.",
      mediocre: "La fiducia in se stessa c'è ma è fragile. [Nome] ha bisogno di conferme esterne per sentirsi sicura: un complimento del capo, un risultato positivo, il supporto dei colleghi. In un ambiente che la valorizza, fiorisce e dà il meglio. In un ambiente critico o competitivo, si ritira e si spegne. I suoi sogni sono realistici ma modesti - non si permette di immaginare qualcosa di veramente grande perché teme la delusione. Ha bisogno di qualcuno che creda in lei un po' più di quanto lei creda in se stessa.",
      carenza: "La motivazione interna è debole. [Nome] si muove più per dovere, per necessità economica o per pressione esterna che per un desiderio genuino di realizzazione personale. I sogni si sono ridimensionati nel tempo - forse a causa di delusioni, fallimenti o semplicemente della routine. Non si lancia in nuove opportunità a meno che non sia costretta. Ha bisogno che qualcuno la stimoli costantemente, le ricordi il suo valore, le mostri che può ottenere di più. Senza questo stimolo esterno, tende a sedersi.",
      critico: "[Nome] ha pochissima fiducia nelle proprie possibilità. Non si pone obiettivi ambiziosi perché non crede di poterli raggiungere. Vede il futuro come una ripetizione del presente, o peggio. Si è convinta che il massimo che può ottenere è già qui. Questa convinzione è diventata una profezia che si auto-avvera: non prova, non rischia, non si espone - e quindi non ottiene. Per invertire la rotta serve un lavoro paziente di ricostruzione della fiducia, partendo da sfide piccole e concrete che le dimostrino che il miglioramento è possibile.",
      grave: "[Nome] ha sostanzialmente rinunciato. I sogni sono spenti, la fiducia è evaporata, l'energia vitale è ai minimi. Non è depressione clinica (non sta a noi diagnosticarla), ma è una resa silenziosa. Si è convinta che le cose non cambieranno, che il suo destino è segnato, che impegnarsi non serve. Questa condizione non si risolve con un corso di motivazione: richiede un percorso lungo, un ambiente protettivo e un mentor paziente che riaccenda la scintilla un passo alla volta. La buona notizia: anche le fiamme più deboli possono essere ravvivate, se si soffia con delicatezza."
    }
  },
  
  GP: {
    soglie: [
      { min: 66, max: 100, fascia: 'eccellente' },
      { min: 40, max: 65, fascia: 'buono' },
      { min: 30, max: 39, fascia: 'discreto' },
      { min: 21, max: 29, fascia: 'mediocre' },
      { min: 10, max: 20, fascia: 'carenza' },
      { min: 0, max: 9, fascia: 'critico' },
      { min: -100, max: -1, fascia: 'grave' }
    ],
    testi: {
      eccellente: "[Nome] è emotivamente stabile e serena. Non ci sono relazioni problematiche significative nel suo ambiente attuale. Questo le permette di avere la mente libera per concentrarsi su obiettivi e crescita. È in una buona fase per investire su di sé.",
      buono: "Emotivamente [Nome] è in una buona fase. Le relazioni nel suo ambiente sono gestibili, non ci sono fonti di stress significative legate a persone specifiche. Ha la serenità necessaria per affrontare nuove sfide e concentrarsi sulla crescita professionale.",
      discreto: "[Nome] sta gestendo qualche tensione nell'ambiente, ma nulla di particolarmente grave. Ci sono piccole frizioni - un collega difficile, una situazione familiare non ideale - ma riesce a funzionare senza grossi contraccolpi. Non è al massimo della serenità, ma è operativa.",
      mediocre: "C'è qualcosa che disturba [Nome] a livello relazionale. Non è una crisi conclamata, ma un rumore di fondo costante: una persona che la irrita, una situazione non risolta che le pesa. Questo sottrae energia e attenzione a tutto il resto. In condizioni normali funziona bene, ma nei momenti di stress questa tensione di fondo emerge e amplifica le difficoltà. Sarebbe utile identificare la fonte della tensione e gestirla.",
      carenza: "SEGNALE IMPORTANTE: [Nome] sta subendo l'influenza negativa di qualcuno nel suo ambiente - potrebbe essere un superiore, un collega, un familiare, un socio. Questa persona le causa stress, preoccupazioni, demotivazione. L'impatto non è solo emotivo: quando si subisce qualcuno, TUTTI gli altri tratti ne risentono. L'organizzazione cala perché la mente è occupata dal problema. L'autodisciplina cala perché lo stress toglie energia. La proattività cala perché si diventa reattivi. Finché questa relazione non viene gestita, qualsiasi intervento formativo avrà efficacia limitata. È la PRIMA cosa da affrontare.",
      critico: "[Nome] è in una situazione di forte pressione emotiva. Qualcuno nel suo ambiente sta avendo un impatto devastante sulla sua serenità e sulla sua capacità di funzionare. Potrebbe essere un superiore che la svaluta, un collega che le crea problemi, un familiare che la condiziona. Gli effetti si vedono su tutto il profilo: confusione, demotivazione, reattività, chiusura. Non è possibile valutare il suo VERO potenziale in queste condizioni. Prima di qualsiasi altra considerazione, bisogna identificare chi causa questa pressione e definire un piano per gestirla.",
      grave: "[Nome] è in una relazione fortemente tossica con qualcuno. Lo stress è ai massimi livelli. Potrebbe manifestare sintomi fisici (insonnia, tensione, stanchezza cronica) e comportamentali (irritabilità, chiusura, reattività esagerata). In queste condizioni, il questionario stesso potrebbe non riflettere il vero profilo della persona - sta compilando mentre è 'sotto attacco' emotivo. Qualsiasi punteggio va letto con questa lente. L'unica priorità è gestire la relazione tossica. Tutto il resto è secondario. Se è un candidato: valutare se la situazione è temporanea (e quindi il profilo migliorerà) o strutturale (e quindi il rischio di inserimento è alto)."
    }
  },
  
  // ==========================================
  // AREA FARE (Come Agisce)
  // ==========================================
  
  ADS: {
    soglie: [
      { min: 56, max: 100, fascia: 'eccellente' },
      { min: 44, max: 55, fascia: 'buono' },
      { min: 35, max: 43, fascia: 'discreto' },
      { min: 25, max: 34, fascia: 'mediocre' },
      { min: 15, max: 24, fascia: 'carenza' },
      { min: 0, max: 14, fascia: 'critico' },
      { min: -100, max: -1, fascia: 'grave' }
    ],
    testi: {
      eccellente: "[Nome] è una persona di rara affidabilità. Quando prende un impegno, lo rispetta. Quando dice che farà qualcosa entro una certa data, lo fa - spesso anche prima. Cura i dettagli con attenzione quasi maniacale. Le scadenze vengono rispettate, gli accordi mantenuti, i problemi affrontati senza procrastinare. È il tipo di persona che non ha bisogno di reminder: ha già fatto prima che tu glielo ricordi. I colleghi e i superiori la considerano un punto di riferimento. Se c'è una cosa che non funziona, è che a volte pretende lo stesso standard dagli altri - e quando non lo trova, può diventare frustrata o critica.",
      buono: "[Nome] è molto affidabile. Mantiene gli impegni, rispetta le scadenze, lavora con costanza. Non ha bisogno di supervisione continua per portare a termine i compiti. Qualche rara volta, sotto pressione estrema o con troppi fronti aperti, può tralasciare un dettaglio o arrivare in ritardo su qualcosa. Ma sono eccezioni, non la regola. È il tipo di persona che puoi mettere su un progetto e dimenticarti: lo porterà avanti.",
      discreto: "[Nome] è generalmente affidabile. Porta a termine la maggior parte degli impegni con un buon livello di qualità. Ha un senso di responsabilità sviluppato e ci tiene a fare bene. Non è perfetta nell'esecuzione - a volte qualcosa le sfugge, a volte sottovaluta i tempi - ma è consapevole delle sue lacune e cerca di compensare. Sotto pressione forte può perdere un po' di precisione, ma il risultato complessivo è più che accettabile.",
      mediocre: "L'affidabilità di [Nome] è discreta ma non costante. Nei periodi tranquilli rispetta gli impegni senza problemi. Ma quando la pressione sale - scadenze ravvicinate, richieste multiple, problemi imprevisti - inizia a tralasciare cose, a rimandare, a perdere dettagli. Non è inaffidabile per scelta: è che la sua disciplina interna non regge i carichi pesanti. Ha bisogno di supporto esterno: checklist, reminder, scadenze intermedie, check-in regolari. Con questi strumenti può funzionare bene.",
      carenza: "[Nome] ha una relazione complicata con la disciplina. Le intenzioni sono buone: vuole fare bene, vuole rispettare gli impegni. Ma tra l'intenzione e l'azione c'è un gap significativo. Procrastina, sottovaluta i tempi, si distrae, tralascia dettagli importanti. Le persone intorno a lei hanno imparato a non fidarsi completamente delle sue promesse - non per cattiveria, ma per esperienza. Ha bisogno di un sistema esterno rigido che la tenga in carreggiata. Se lasciata senza struttura, il risultato sarà mediocre.",
      critico: "[Nome] fatica seriamente a mantenere gli impegni presi. Procrastina in modo sistematico, sottovaluta costantemente i tempi, trascura dettagli che poi creano problemi. Le scadenze vengono mancate regolarmente. Le promesse restano tali. I colleghi hanno smesso di contare su di lei per cose importanti. Non è in malafede: è che la sua disciplina interna è insufficiente. Si aspetta dagli altri cose che lei stessa non garantisce, e questo crea frustrazione reciproca. È una delle aree più urgenti da affrontare.",
      grave: "La mancanza di disciplina è un problema strutturale per [Nome]. Non mantiene gli accordi, non rispetta le scadenze, non cura i dettagli, non porta a termine i progetti. C'è un divario enorme tra quello che dice di voler fare e quello che effettivamente fa. Questo genera sfiducia nel team, caos organizzativo e tensioni continue. Le persone intorno a lei finiscono per fare il suo lavoro, generando risentimento. In un ruolo dove l'affidabilità è essenziale, questa condizione è bloccante. Prima di qualsiasi crescita professionale, serve un intervento profondo sulle abitudini quotidiane."
    }
  },
  
  DET: {
    soglie: [
      { min: 56, max: 100, fascia: 'eccellente' },
      { min: 44, max: 55, fascia: 'buono' },
      { min: 35, max: 43, fascia: 'discreto' },
      { min: 20, max: 34, fascia: 'mediocre' },
      { min: 0, max: 19, fascia: 'carenza' },
      { min: -100, max: -1, fascia: 'critico' }
    ],
    testi: {
      eccellente: "[Nome] non ha paura di dire le cose come stanno. È diretta, chiara, assertiva. Quando qualcuno sbaglia, glielo fa notare senza giri di parole. Quando serve delegare, delega con istruzioni precise. Quando deve chiedere qualcosa di scomodo - un aumento, una scadenza, un pagamento - lo fa senza esitare. Le persone intorno a lei sanno SEMPRE cosa pensa e cosa si aspetta. Questa chiarezza è un enorme vantaggio in ruoli di responsabilità: il team non deve interpretare, indovinare, supporre. Sa esattamente dove sta. Il rovescio della medaglia: può risultare troppo dura con chi non regge la schiettezza.",
      buono: "[Nome] sa essere diretta quando serve. Delega con chiarezza, corregge gli errori apertamente, fa richieste senza troppi giri di parole. Non ha paura del confronto costruttivo. Con alcune persone particolarmente sensibili o gerarchicamente superiori può ammorbidire un po' il messaggio, ma il contenuto arriva sempre. È una qualità preziosa soprattutto in posizioni dove bisogna gestire persone o clienti.",
      discreto: "[Nome] riesce a essere diretta nella maggior parte delle situazioni professionali. Sa delegare, sa correggere, sa fare richieste. Con le persone con cui ha un buon rapporto è schietta e chiara. La difficoltà emerge con persone ostiche, superiori, o in situazioni emotivamente cariche: in quei casi tende ad ammorbidire troppo il messaggio o a rimandare la conversazione difficile. Con un po' di allenamento sulla comunicazione assertiva può diventare molto efficace.",
      mediocre: "[Nome] ha difficoltà a parlare chiaro in situazioni professionali impegnative. Riesce a esprimersi bene con colleghi alla pari e amici, ma con superiori, clienti difficili o in situazioni di conflitto fa giri di parole, evita il punto, preferisce mandare un'email piuttosto che parlare di persona. Non delega bene perché non riesce a dare istruzioni precise. Non corregge gli errori perché teme la reazione dell'altro. Non fa richieste dirette (aumenti, pagamenti, scadenze) perché si sente a disagio. Il risultato: le persone intorno a lei non capiscono cosa vuole, i problemi non vengono affrontati, il lavoro si accumula sulle sue spalle.",
      carenza: "Parlare chiaro è una delle sfide più grandi per [Nome]. Evita qualsiasi tipo di confronto diretto. Non dice mai cosa pensa veramente. Non delega perché non riesce a chiedere. Non corregge perché teme la reazione. Non fa richieste perché si sente inadeguata a farle. Preferisce fare tutto da sola piuttosto che affrontare una conversazione scomoda. Questo la sovraccarica enormemente e crea confusione in chi lavora con lei: nessuno sa cosa vuole, cosa si aspetta, cosa la infastidisce. La frustrazione si accumula in silenzio fino a esplodere nei momenti peggiori.",
      critico: "[Nome] evita il confronto a ogni costo. Non esprime MAI il suo punto di vista se c'è rischio di disaccordo. Non delega, non corregge, non chiede. Subisce le situazioni in silenzio, accumula risentimento, e poi reagisce in modo sproporzionato nel momento sbagliato. Le persone intorno a lei camminano su un campo minato senza saperlo: non ricevono mai feedback onesto e poi vengono investite da una reazione emotiva che non capiscono. Per qualsiasi ruolo di responsabilità questa è una condizione bloccante. Serve un percorso strutturato su assertività, confini personali e comunicazione diretta.",
      grave: "[Nome] evita il confronto a ogni costo. Non esprime MAI il suo punto di vista se c'è rischio di disaccordo. Non delega, non corregge, non chiede. Subisce le situazioni in silenzio, accumula risentimento, e poi reagisce in modo sproporzionato nel momento sbagliato."
    }
  },
  
  VEN: {
    soglie: [
      { min: 61, max: 100, fascia: 'eccellente' },
      { min: 40, max: 60, fascia: 'buono' },
      { min: 30, max: 39, fascia: 'discreto' },
      { min: 15, max: 29, fascia: 'mediocre' },
      { min: 0, max: 14, fascia: 'carenza' },
      { min: -100, max: -1, fascia: 'critico' }
    ],
    testi: {
      eccellente: "[Nome] ha un talento naturale per la comunicazione e il coinvolgimento. Quando parla, le persone si accendono. Sa raccontare storie, dipingere visioni, creare entusiasmo. Le sue presentazioni sono coinvolgenti, le sue telefonate producono risultati, le sue riunioni sono energiche. È il tipo di persona che entra in una stanza e cambia l'atmosfera. In un ruolo commerciale o di leadership, questa capacità vale oro. L'unico rischio: può promettere troppo per entusiasmo e creare aspettative che poi è difficile mantenere.",
      buono: "[Nome] sa comunicare con efficacia. Riesce a coinvolgere le persone nelle sue idee, a trasmettere entusiasmo quando è appassionata di un argomento, a creare connessione nelle conversazioni. Non è un oratore nato ma è più che competente. Sa adattare il messaggio al pubblico e sa rendere interessanti anche argomenti tecnici.",
      discreto: "[Nome] ha capacità comunicative nella media. Riesce a trasmettere le informazioni necessarie ma non sempre con il coinvolgimento desiderato. In situazioni informali comunica bene; in contesti formali (presentazioni, trattative, riunioni importanti) può risultare piatta o poco incisiva. Con un po' di allenamento su public speaking e storytelling può migliorare significativamente.",
      mediocre: "La comunicazione non è il forte di [Nome]. Fatica a trasmettere entusiasmo, a coinvolgere gli altri nelle sue idee, a rendere interessanti i suoi messaggi. Le sue presentazioni sono informative ma non coinvolgenti. Le conversazioni di vendita o persuasione la mettono a disagio. Il risultato: le sue idee restano spesso inascoltate non perché sbagliate, ma perché presentate in modo poco efficace.",
      carenza: "[Nome] ha serie difficoltà nel comunicare e coinvolgere. Le sue idee restano chiuse nella sua testa perché non riesce a trasmetterle con efficacia. In riunioni tende a restare in silenzio. In trattative non riesce a creare connessione. In presentazioni risulta monotona. Questo la condanna a lavorare in ombra, senza il riconoscimento e il supporto che meriterebbe.",
      critico: "[Nome] è comunicativamente isolata. Non riesce a coinvolgere nessuno nei propri progetti. Lavora da sola perché non sa come portare gli altri dalla sua parte. Questo è un handicap grave in qualsiasi contesto professionale moderno dove la collaborazione è essenziale. Serve un intervento profondo sulle capacità comunicative di base.",
      grave: "[Nome] è comunicativamente isolata. Non riesce a coinvolgere nessuno nei propri progetti. Lavora da sola perché non sa come portare gli altri dalla sua parte."
    }
  },
  
  HRM: {
    soglie: [
      { min: 41, max: 100, fascia: 'eccellente' },
      { min: 20, max: 40, fascia: 'buono' },
      { min: 10, max: 19, fascia: 'discreto' },
      { min: 0, max: 9, fascia: 'mediocre' },
      { min: -100, max: -1, fascia: 'carenza' }
    ],
    testi: {
      eccellente: "[Nome] ha un talento raro: sa far crescere le persone. Chi lavora con lei migliora - diventa più autonomo, più consapevole, più motivato. Ha l'istinto del mentore: capisce quando dare spazio e quando intervenire, quando incoraggiare e quando correggere. Le persone che ha gestito nel tempo la ricordano come una figura determinante nella loro crescita professionale.",
      buono: "[Nome] ha una discreta capacità di gestione delle persone. Sa motivare, sa dare feedback, sa creare un ambiente abbastanza positivo. Non è un mentore nato ma è un buon gestore: le persone sotto di lei si sentono seguite e supportate nella maggior parte dei casi.",
      discreto: "La gestione delle persone è un'area in cui [Nome] ha margini di miglioramento significativi. Riesce a gestire in condizioni normali ma non ha un impatto trasformativo. Le persone sotto di lei non peggiorano ma nemmeno fioriscono.",
      mediocre: "[Nome] fatica nella gestione delle persone. Non è il suo forte e lo sa. Tende a evitare le conversazioni difficili, a non dare feedback tempestivo, a non investire tempo nella crescita dei collaboratori. Le persone sotto di lei si sentono poco seguite.",
      carenza: "Le persone gestite da [Nome] tendono a demotivarsi. Il suo stile di gestione - che sia troppo critico, troppo assente, troppo controllante o troppo inconsistente - produce l'effetto opposto a quello desiderato. Potrebbe non rendersene conto, ma il turnover e l'insoddisfazione dei suoi collaboratori raccontano una storia chiara. Se ha ruoli di gestione, serve un intervento urgente sullo stile manageriale. Se non gestisce persone, meglio mantenerla su ruoli individuali.",
      critico: "Le persone gestite da [Nome] tendono a demotivarsi. Il suo stile di gestione produce l'effetto opposto a quello desiderato.",
      grave: "Le persone gestite da [Nome] tendono a demotivarsi. Il suo stile di gestione produce l'effetto opposto a quello desiderato."
    }
  },
  
  // ==========================================
  // AREA AVERE (Come si Relaziona)
  // ==========================================
  
  LDR: {
    soglie: [
      { min: 56, max: 100, fascia: 'eccellente' },
      { min: 44, max: 55, fascia: 'buono' },
      { min: 30, max: 43, fascia: 'discreto' },
      { min: 10, max: 29, fascia: 'mediocre' },
      { min: -100, max: 9, fascia: 'carenza' }
    ],
    testi: {
      eccellente: "[Nome] ha una leadership naturale fortissima. Le persone la guardano prima di prendere decisioni, la seguono spontaneamente, la rispettano anche senza un titolo formale. Ha il carisma di chi sa guidare: quando parla, gli altri ascoltano. Quando decide, gli altri seguono. Quando c'è un momento di crisi, gli altri si rivolgono a lei. Questa predisposizione è innata - non si insegna. Va solo incanalata nel contesto giusto e bilanciata con comprensione e proattività per evitare che diventi autoritarismo.",
      buono: "[Nome] ha una leadership naturale marcata. Le persone la percepiscono come un punto di riferimento e tendono a seguirla. Ha l'istinto di chi vuole guidare: propone, decide, orienta. In situazioni di incertezza è spesso la prima a prendere l'iniziativa. Questo la rende adatta a posizioni di responsabilità.",
      discreto: "[Nome] ha una discreta capacità di influenza. Non è un leader carismatico che trascina le folle, ma in contesti familiari e con il team abituale riesce a guidare e orientare. Ha bisogno di costruire l'autorità nel tempo, attraverso i risultati e la fiducia, piuttosto che imporla immediatamente.",
      mediocre: "[Nome] non ha una leadership naturale particolarmente sviluppata. Non è il primo punto di riferimento quando c'è da prendere una decisione. Può guidare piccoli gruppi in ambiti specifici dove ha competenza, ma in contesti più ampi o con persone nuove fatica a farsi seguire.",
      carenza: "[Nome] non ha influenza naturale sugli altri. Tende a seguire piuttosto che guidare. Non è il tipo che prende l'iniziativa in un gruppo o che orienta le decisioni. In posizioni di leadership formale avrebbe serie difficoltà a farsi rispettare e seguire. Il suo valore emerge in ruoli dove l'esecuzione individuale conta più dell'influenza sugli altri.",
      critico: "[Nome] non ha influenza naturale sugli altri. Tende a seguire piuttosto che guidare.",
      grave: "[Nome] non ha influenza naturale sugli altri. Tende a seguire piuttosto che guidare."
    }
  },
  
  PRO: {
    soglie: [
      { min: 51, max: 100, fascia: 'eccellente' },
      { min: 30, max: 50, fascia: 'buono' },
      { min: 20, max: 29, fascia: 'discreto' },
      { min: 10, max: 19, fascia: 'mediocre' },
      { min: 0, max: 9, fascia: 'carenza' },
      { min: -20, max: -1, fascia: 'critico' },
      { min: -100, max: -21, fascia: 'grave' }
    ],
    testi: {
      eccellente: "[Nome] è una persona straordinariamente causativa. Di fronte a un problema, la sua reazione istintiva è 'come lo risolvo?' e mai 'di chi è la colpa?'. Non si offende, non prende le cose sul personale, non alimenta drammi. Quando c'è tensione nel team, è lei che stempera. Quando qualcuno la critica, ci riflette invece di reagire. Quando le cose vanno male, cerca la sua parte di responsabilità prima di guardare gli altri. Queste persone sono il collante che tiene insieme i team: senza di loro, i piccoli attriti diventano grandi conflitti.",
      buono: "[Nome] è generalmente una persona causativa e collaborativa. Cerca soluzioni piuttosto che colpevoli, non si offende facilmente, si mette in discussione quando riceve feedback. In momenti di forte stress può diventare un po' reattiva - ci rimane male per una critica, si irrita per un'ingiustizia - ma recupera velocemente e torna alla modalità costruttiva. Nel complesso, lavorare con lei è piacevole.",
      discreto: "[Nome] è collaborativa nella maggior parte delle situazioni quotidiane. Quando tutto va bene, è una buona collega. Quando le cose si complicano - conflitti, critiche, errori - inizia a emergere una certa reattività. Ci mette un po' a digerire le critiche, tende a percepire ingiustizie dove magari non ce ne sono, a volte incolpa le circostanze o gli altri. Non è una persona difficile, ma ha bisogno di un ambiente dove il feedback viene dato con attenzione.",
      mediocre: "[Nome] tende a prendere le cose sul personale. Le critiche, anche costruttive, la feriscono. I problemi vengono spesso attribuiti agli altri o alle circostanze. Quando qualcosa va male, la sua prima reazione non è 'cosa posso fare io?' ma 'perché mi succede questo?'. Questa reattività crea tensione nelle relazioni professionali: i colleghi imparano a 'dosare' le parole con lei, e questo impedisce una comunicazione aperta e onesta.",
      carenza: "[Nome] è decisamente permalosa. Ci rimane male per quasi tutto: un'osservazione, un feedback, una decisione che non la coinvolge. Le critiche la devastano e ci mette giorni a recuperare. Tende a vedere intenzionalità negativa nelle azioni degli altri anche quando non c'è. Lavorare con lei richiede costante attenzione a come si formulano le cose. Questo rallenta i processi e crea un'atmosfera di camminamento su uova.",
      critico: "[Nome] è reattiva e tende a ostacolare piuttosto che aiutare. Incolpa gli altri per i propri problemi, si offende per qualsiasi cosa, alimenta drammi e conflitti. Non è in malafede: è un meccanismo di difesa radicato che la porta a percepire il mondo come ostile. Ma l'effetto sulle persone intorno è devastante: la comunicazione si blocca, i conflitti si moltiplicano, il morale del team crolla.",
      grave: "[Nome] è fortemente reattiva e ostile. Qualsiasi interazione può trasformarsi in un conflitto. Le critiche scatenano reazioni sproporzionate. I problemi sono SEMPRE colpa degli altri. Non c'è spazio per il dialogo costruttivo perché tutto viene percepito come attacco personale. In un team, questa persona è un elemento altamente destabilizzante. In fase di selezione, è un segnale di allarme grave."
    }
  },
  
  COM: {
    soglie: [
      { min: 41, max: 100, fascia: 'eccellente' },
      { min: 25, max: 40, fascia: 'buono' },
      { min: 15, max: 24, fascia: 'discreto' },
      { min: 0, max: 14, fascia: 'mediocre' },
      { min: -15, max: -1, fascia: 'carenza' },
      { min: -38, max: -16, fascia: 'critico' },
      { min: -100, max: -39, fascia: 'grave' }
    ],
    testi: {
      eccellente: "[Nome] ha una capacità straordinaria di accogliere la diversità. Ascolta con genuino interesse opinioni diverse dalle sue, non giudica, cerca di capire il punto di vista dell'altro anche quando è lontanissimo dal proprio. Le persone si sentono a proprio agio nel condividere idee, dubbi e problemi con lei perché sanno di non essere giudicate. Questa qualità la rende preziosa in qualsiasi contesto dove la collaborazione tra persone diverse è importante.",
      buono: "[Nome] è una persona comprensiva e aperta. Accetta opinioni diverse, ascolta con attenzione, non giudica facilmente. Ha la maturità di capire che il proprio punto di vista non è l'unico valido. I colleghi la apprezzano per questa qualità e tendono a confidarsi con lei.",
      discreto: "[Nome] è generalmente comprensiva ma selettiva. Con le persone che stima e con cui condivide valori, è aperta e accogliente. Con persone molto diverse da lei - per mentalità, cultura, approccio - può fare più fatica ad accettare le differenze. Non è intollerante, ma non è nemmeno completamente aperta.",
      mediocre: "La comprensione di [Nome] è limitata. Tende a fidarsi solo di chi la pensa come lei e a diffidare degli altri. Ha un approccio 'i miei vs gli altri' che limita la qualità delle sue collaborazioni. Non è una persona cattiva: semplicemente fatica a mettersi nei panni degli altri quando sono troppo diversi da lei.",
      carenza: "[Nome] tende a giudicare. Ha un approccio bianco/nero: le cose sono giuste o sbagliate, le persone sono in gamba o non lo sono. Le sfumature la infastidiscono. Chi la pensa diversamente viene liquidato senza troppo ascolto. Le persone intorno a lei si sentono giudicate e tendono a non aprirsi, a non condividere problemi, a nascondere errori. Questo crea un ambiente di lavoro rigido e poco creativo.",
      critico: "[Nome] è intollerante. 'O con me o contro di me' potrebbe essere il suo motto. Non accetta visioni diverse, non ascolta chi non la pensa come lei, taglia i ponti rapidamente. Le relazioni professionali sono fragili: basta un disaccordo per mandarle in frantumi. Gestire un team per lei significa imporre la propria visione, non costruire consenso. Questo limita enormemente la qualità del lavoro e la fidelizzazione dei collaboratori.",
      grave: "[Nome] ha un livello di intolleranza che rappresenta un DISQUALIFIER per la maggior parte dei ruoli professionali. Non ascolta, non accoglie, non tollera. Ogni opinione diversa dalla sua è un affronto personale. Le relazioni vengono distrutte per motivi insignificanti. In un team, questa persona crea un clima di terrore dove nessuno osa esprimere un'idea diversa. È una delle condizioni più difficili da modificare perché la persona è convinta di avere ragione e che il problema siano gli altri."
    }
  },
  
  ESP: {
    soglie: [
      { min: 51, max: 100, fascia: 'eccellente' },
      { min: 30, max: 50, fascia: 'buono' },
      { min: 15, max: 29, fascia: 'discreto' },
      { min: 0, max: 14, fascia: 'mediocre' },
      { min: -100, max: -1, fascia: 'carenza' }
    ],
    testi: {
      eccellente: "[Nome] è una persona estremamente socievole. Conosce molte persone, ne conosce di nuove ogni settimana, coltiva le relazioni con naturalezza. La sua rete è ampia e diversificata: colleghi, amici, conoscenti, contatti professionali. Questa rete è la sua porta verso opportunità che altri non vedono: informazioni, collaborazioni, raccomandazioni, occasioni. È il tipo di persona che 'conosce qualcuno' per qualsiasi cosa. In un'azienda, il suo network è un asset prezioso.",
      buono: "[Nome] è socievole e apre relazioni con facilità. Ha una rete relazionale buona che coltiva con discreta costanza. Non è il tipo che conosce tutti, ma ha abbastanza contatti da avere sempre un punto di riferimento quando serve.",
      discreto: "[Nome] è selettiva nelle relazioni. Ha un cerchio ristretto di persone fidate con cui si trova bene e non sente il bisogno di ampliarlo costantemente. Questo non è un problema di per sé, ma limita le opportunità che nascono dal networking. Quando serve un contatto nuovo o un'informazione, potrebbe non avere a chi rivolgersi.",
      mediocre: "[Nome] è poco propensa a nuove conoscenze. Si accontenta della cerchia ristretta e non investe tempo nel costruire nuove relazioni professionali. Questo la isola da opportunità, informazioni e supporto. In un mondo dove 'chi conosci' conta quanto 'cosa sai', questa chiusura è un freno.",
      carenza: "[Nome] è socialmente ritirata. Ha pochissime relazioni professionali e non ne cerca di nuove. Lavora in solitudine, non partecipa a eventi, non fa networking. Questo isolamento la priva di opportunità, risorse e supporto. La solitudine professionale è uno dei freni più subdoli alla crescita: non si vede, non fa rumore, ma erode lentamente ogni possibilità di avanzamento.",
      critico: "[Nome] è socialmente ritirata. Ha pochissime relazioni professionali e non ne cerca di nuove.",
      grave: "[Nome] è socialmente ritirata. Ha pochissime relazioni professionali e non ne cerca di nuove."
    }
  },
  
  // ==========================================
  // INDICATORI (Stabilità e Principi)
  // ==========================================
  
  RC: {
    soglie: [
      { min: 56, max: 100, fascia: 'eccellente' },
      { min: 45, max: 55, fascia: 'buono' },
      { min: 30, max: 44, fascia: 'discreto' },
      { min: 15, max: 29, fascia: 'mediocre' },
      { min: -14, max: 14, fascia: 'carenza' }, // Fascia Guru/Creativa
      { min: -19, max: -15, fascia: 'critico' },
      { min: -100, max: -20, fascia: 'grave' }
    ],
    testi: {
      eccellente: "[Nome] è una persona estremamente strutturata, metodica e coerente - ma anche rigida. Ha le sue procedure, i suoi schemi mentali, le sue abitudini, e non li cambia facilmente. Di fronte a un cambiamento - un nuovo software, una nuova procedura, un nuovo collega - la prima reazione è resistenza. Non è ostilità: è che il suo cervello funziona bene dentro schemi consolidati e si sente minacciato da tutto ciò che li rompe. Per farle accettare qualcosa di nuovo, servono numeri, dati, statistiche, prove concrete. Le discussioni emotive o motivazionali non funzionano. Questa rigidità ha un lato positivo: è coerente, prevedibile, affidabile nelle sue routine. Ma in contesti dove serve adattabilità e velocità di cambiamento, diventa un ostacolo.",
      buono: "[Nome] è una persona molto strutturata. Ha metodi consolidati e li segue con rigore. Il cambiamento non la entusiasma ma riesce ad accettarlo se le vengono date ragioni valide e tempo per adattarsi. Non ama le sorprese e preferisce pianificare tutto in anticipo. È affidabile nelle sue routine ma può risultare poco flessibile in situazioni che richiedono improvvisazione.",
      discreto: "[Nome] ha un buon equilibrio tra struttura e flessibilità. Sa seguire procedure e metodi ma sa anche adattarsi quando serve. Non ha paura del cambiamento ma nemmeno lo cerca attivamente. È una persona su cui si può contare per mantenere la rotta senza essere schiava delle abitudini.",
      mediocre: "[Nome] è abbastanza flessibile e aperta al cambiamento. Non si aggrappa alle procedure e accetta di buon grado nuovi approcci. A volte potrebbe essere un po' troppo rapida nel cambiare direzione, senza dare abbastanza tempo ai piani in corso di dimostrare il loro valore.",
      carenza: "[Nome] è nella fascia più creativa. Ha una mente flessibile, piena di idee, aperta a qualsiasi possibilità. Vede connessioni che altri non vedono, ha intuizioni brillanti, propone soluzioni innovative. Ma questa creatività ha un prezzo: la costanza. Se ORG è bassa (sotto 30), questa combinazione produce il CREATIVO DISPERSIVO: una persona che inizia cento progetti e non ne finisce nessuno. Ha bisogno di qualcuno che la tenga concentrata e la aiuti a portare a termine le idee migliori.",
      critico: "[Nome] è una persona piuttosto instabile nelle sue convinzioni. Cambia idea con frequenza, ha approcci diversi in aree diverse della vita, non mantiene una linea coerente nel tempo. Questa incoerenza può creare confusione in chi lavora con lei: un giorno dice una cosa, il giorno dopo un'altra. In ruoli dove la stabilità e la prevedibilità sono importanti (amministrazione, produzione), questa condizione è problematica.",
      grave: "[Nome] è altamente instabile e incoerente. Professa principi in un'area della vita e opera all'opposto in un'altra. Cambia idea rapidamente, spesso in modo contraddittorio. È imprevedibile nelle reazioni e nelle decisioni. Ha intuizioni che possono essere brillanti ma non ha la costanza per sfruttarle. Non lasciarla decidere da sola su questioni importanti. Non adatta a ruoli procedurali, amministrativi o di responsabilità produttiva."
    }
  },
  
  FIN: {
    soglie: [
      { min: 51, max: 100, fascia: 'eccellente' },
      { min: 30, max: 50, fascia: 'buono' },
      { min: 10, max: 29, fascia: 'discreto' },
      { min: 0, max: 9, fascia: 'mediocre' },
      { min: -100, max: -1, fascia: 'carenza' }
    ],
    testi: {
      eccellente: "[Nome] gestisce le proprie finanze con grande consapevolezza. Risparmia regolarmente, investe con criterio, pianifica il futuro finanziario. Ha riserve significative che le danno sicurezza e libertà di scelta. Questo indica maturità, visione a lungo termine e un rapporto sano con il denaro. È il tipo di persona che non prenderà decisioni professionali disperate perché ha le spalle coperte.",
      buono: "[Nome] ha una gestione finanziaria discreta. Mette qualcosa da parte, ha un minimo di pianificazione, non è in difficoltà. Non è ancora al livello di sicurezza ideale ma è sulla strada giusta.",
      discreto: "[Nome] non presta sufficiente attenzione alla gestione finanziaria. Spende quello che guadagna senza costruire riserve significative. Non investe, non pianifica il futuro finanziario, vive alla giornata dal punto di vista economico. Questo la rende vulnerabile agli imprevisti e può spingerla a prendere decisioni professionali dettate dalla necessità piuttosto che dalla strategia.",
      mediocre: "[Nome] ha una gestione finanziaria molto debole. Le riserve sono minime o assenti. Non c'è pianificazione finanziaria. Potrebbe essere sotto pressione economica. Questo ha un impatto diretto sulle scelte professionali: accetta lavori per necessità, non può permettersi di rischiare, le urgenze finanziarie distraggono dal lavoro.",
      carenza: "[Nome] è in seria difficoltà finanziaria. Questo non è solo un problema di gestione del denaro: spesso indica problemi più profondi. Forse non riesce a monetizzare il proprio valore (lavora tanto ma guadagna poco), forse ha un prodotto/servizio lacunoso, forse subisce l'influenza di persone demotivanti che erodono la sua capacità di guadagno. Va indagato a fondo: la situazione finanziaria è spesso il SINTOMO, non la CAUSA.",
      critico: "[Nome] è in seria difficoltà finanziaria. La situazione finanziaria è spesso il SINTOMO, non la CAUSA.",
      grave: "[Nome] è in seria difficoltà finanziaria. La situazione finanziaria è spesso il SINTOMO, non la CAUSA."
    }
  },
  
  SUC: {
    soglie: [
      { min: 70, max: 100, fascia: 'eccellente' },
      { min: 45, max: 69, fascia: 'buono' },
      { min: 30, max: 44, fascia: 'discreto' },
      { min: 10, max: 29, fascia: 'mediocre' },
      { min: -100, max: 9, fascia: 'carenza' }
    ],
    testi: {
      eccellente: "[Nome] ha raggiunto risultati importanti e stabilità nella sua carriera. Ha una storia professionale coerente, con progressi tangibili e riconoscimenti concreti. Questo conferma che il suo profilo si traduce in performance reali. La stabilità raggiunta le dà la sicurezza per affrontare nuove sfide senza l'ansia di chi deve ancora dimostrare il proprio valore.",
      buono: "[Nome] ha ottenuto risultati discreti nella sua carriera. C'è una traiettoria positiva con alcuni successi significativi, ma non ha ancora raggiunto la piena stabilità professionale. È in una fase di costruzione dove i prossimi 2-3 anni saranno determinanti per consolidare o perdere quanto ottenuto.",
      discreto: "[Nome] ha una carriera con alti e bassi. Alcuni risultati ci sono ma non sono costanti. Potrebbe aver cambiato settore, ruolo o azienda più volte senza trovare la propria strada definitiva. Non è instabilità grave ma manca ancora quel 'colpo' che consolida la carriera.",
      mediocre: "[Nome] non ha ancora raggiunto stabilità professionale. La carriera è frammentata, con cambiamenti frequenti e risultati modesti. Potrebbe aver avuto sfortuna, potrebbe essere nel settore sbagliato, o potrebbe avere un profilo che non si adatta ai ruoli che ha ricoperto. In ogni caso, i numeri parlano: servono risultati concreti, e presto.",
      carenza: "[Nome] ha una storia professionale molto fragile. Pochi risultati, molti cambiamenti, nessuna stabilità. Questo può indicare un profondo disallineamento tra le sue capacità e i ruoli scelti, oppure problemi strutturali nel profilo (mancanza di disciplina, principi disallineati, relazioni tossiche). Il TalentProfile può aiutare a capire DOVE sta il blocco e come rimuoverlo.",
      critico: "[Nome] ha una storia professionale molto fragile. Pochi risultati, molti cambiamenti, nessuna stabilità.",
      grave: "[Nome] ha una storia professionale molto fragile. Pochi risultati, molti cambiamenti, nessuna stabilità."
    }
  },
  
  PRI: {
    soglie: [
      { min: 71, max: 100, fascia: 'eccellente' },
      { min: 50, max: 70, fascia: 'buono' },
      { min: 35, max: 49, fascia: 'discreto' },
      { min: 20, max: 34, fascia: 'mediocre' },
      { min: -100, max: 19, fascia: 'carenza' }
    ],
    testi: {
      eccellente: "[Nome] ha principi professionali molto solidi e allineati con quelli che portano al successo. Capisce le regole del gioco: sa che i risultati contano, che bisogna dare più di quanto si riceve, che la crescita si costruisce con l'impegno e non con le lamentele. La sua etica del lavoro è un asset importante e crea fiducia nei colleghi e nei superiori.",
      buono: "[Nome] ha buoni principi professionali, sostanzialmente allineati. Ha una buona comprensione delle dinamiche del mondo del lavoro e un'etica professionale rispettabile. Qualche piccolo disallineamento potrebbe emergere in situazioni specifiche ma nulla di grave.",
      discreto: "I principi professionali di [Nome] sono nella media. Ha una comprensione sufficiente delle regole del gioco ma non sempre le applica con coerenza. Potrebbe avere qualche convinzione limitante - ad esempio che l'azienda 'debba' dare di più, o che l'impegno da solo basti a prescindere dai risultati. Queste convinzioni creano frizioni lente ma costanti.",
      mediocre: "[Nome] mostra un disallineamento significativo nei principi professionali. Ha alcune convinzioni che remano contro il suo stesso successo: potrebbe pensare che sia l'azienda a dover garantire la crescita, che lo stipendio debba aumentare con l'anzianità e non con i risultati, che il datore di lavoro sia 'contro' i dipendenti. Queste convinzioni, se non corrette, creano un atteggiamento passivo-aggressivo che alla lunga soffoca la carriera.",
      carenza: "I principi professionali di [Nome] sono gravemente disallineati. La sua visione del mondo del lavoro è distorta: crede che sia l'azienda a doverle garantire opportunità, denaro e responsabilità a prescindere dalla qualità del suo operato. Non si prende responsabilità per i propri risultati. Incolpa il sistema, il mercato, il datore di lavoro. Questa mentalità è un freno enorme: finché non cambia, nessun intervento tecnico o formativo produrrà risultati duraturi.",
      critico: "I principi professionali di [Nome] sono gravemente disallineati. La sua visione del mondo del lavoro è distorta.",
      grave: "I principi professionali di [Nome] sono gravemente disallineati. La sua visione del mondo del lavoro è distorta."
    }
  },
  
  // CTRL non ha narrativa - è solo per validazione
  CTRL: {
    soglie: [],
    testi: {
      eccellente: "",
      buono: "",
      discreto: "",
      mediocre: "",
      carenza: "",
      critico: "",
      grave: ""
    }
  }
};

// Helper per ottenere il testo narrativo di un tratto
export function getTraitNarrative(
  tratto: TraitCode, 
  punteggio: number, 
  nome: string, 
  sesso: string | null
): string {
  const config = TRAIT_NARRATIVES[tratto];
  if (!config || !config.soglie.length) return '';
  
  const fascia = getFascia(punteggio, config);
  const testo = config.testi[fascia] || '';
  
  return personalizzaTesto(testo, nome, sesso);
}

// Caso speciale per GP quando è il tratto più alto
export function getGPSpecialNarrative(
  gpValue: number,
  isHighestTrait: boolean,
  nome: string,
  sesso: string | null
): string | null {
  if (gpValue > 65 && isHighestTrait) {
    const testo = "Attenzione: il profilo di [Nome] mostra un segnale particolare. La Gestione Pressioni è il tratto più alto - più alto della sua organizzazione, della sua ambizione, della sua disciplina. Questo suggerisce che [Nome] sta 'incelofanando' qualcosa: c'è una situazione o una persona problematica che non vuole affrontare. Finge che vada tutto bene, incassa in silenzio, sorride mentre dentro si accumula tensione. Questo equilibrio apparente è fragile: prima o poi la diga cederà e la reazione sarà sproporzionata. In colloquio, indagare con delicatezza: 'C'è qualche situazione nel suo ambiente che la mette a disagio ma che preferisce non affrontare?'";
    return personalizzaTesto(testo, nome, sesso);
  }
  return null;
}
