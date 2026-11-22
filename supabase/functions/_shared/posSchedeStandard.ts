import { applicaValutazione, lavorazioneVuota, programmaDemolizioniVuoto, type Lavorazione } from "./posModello.ts";
import { rischioTecnicoVuoto, tecnicaPosVuota } from "./posTecnica.ts";

export const FONTI_SCHEDE_POS = {
  modello: { titolo: "Ministero del Lavoro · Modello semplificato POS, Allegato I", url: "https://www.lavoro.gov.it/documenti-e-norme/normative/Documents/2014/Decreto_Interministeriale_9_settembre_2014.pdf" },
  cantieri: { titolo: "INAIL · Quaderni tecnici per i cantieri", url: "https://www.inail.it/portale/it/inail-comunica/news/notizia.2018.10.-quaderni-tecnici-per-i-cantieri-temporanei-o-mobili-sul-portale-inail-la-nuova-edizione.html" },
  infortuni: { titolo: "INAIL · Infortuni in edilizia, scheda Infor.MO 18", url: "https://www.inail.it/content/dam/inail-hub-site/documenti/2022/03/Scheda%2018%20InforMO%2C0.pdf" },
  elettrico: { titolo: "INAIL · Valutazione e gestione del rischio elettrico", url: "https://www.inail.it/portale/prevenzione-e-sicurezza/it/come-fare-per/conoscere-il-rischio/rischio-elettrico/valutazione-e-gestione-del-rischio.html" },
  sollevamento: { titolo: "INAIL · Scelta e messa a disposizione dell’attrezzatura", url: "https://www.inail.it/portale/prevenzione-e-sicurezza/it/come-fare-per/conoscere-il-rischio/attrezzature-di-lavoro/scelta-e-messa-a-disposizione-dell-attrezzatura.html" },
  strade: { titolo: "Ministero del Lavoro · Attività in presenza di traffico veicolare", url: "https://www.lavoro.gov.it/sites/default/files/documenti-e-norme/normative/Documents/2019/DI-22012019-segnaletica-stradale.pdf" },
} as const;

interface SchedaStandardPos {
  id: string;
  titolo: string;
  area: string;
  chiavi: readonly string[];
  descrizione: string;
  prima: string;
  durante: string;
  dopo: string;
  rischi: readonly [rischio: string, misuraDaAdattare: string][];
  quesiti: readonly string[];
  fonte: keyof typeof FONTI_SCHEDE_POS;
}

export const VERSIONE_SCHEDE_POS = 1;

export const SCHEDE_STANDARD_POS: readonly SchedaStandardPos[] = [
  {
    id: "allestimento", titolo: "Allestimento e logistica", area: "Opere edili",
    chiavi: ["allestimento", "logistica", "recinzione", "scarico materiali", "viabilita"],
    descrizione: "Predisposizione degli accessi, dei percorsi e delle aree di cantiere.",
    prima: "Verificare accessi, separazione dei percorsi, vincoli di transito e posizioni di scarico con le figure di cantiere.",
    durante: "Organizzare gli ingressi per area e fascia oraria. Registrare le consegne e le variazioni che interessano altre squadre.",
    dopo: "Controllare la percorribilità delle vie comuni e registrare la disponibilità delle aree predisposte.",
    rischi: [["Interferenza tra mezzi e pedoni", "Definire percorsi separati e chi presidia le manovre."], ["Urti e schiacciamenti durante la movimentazione", "Definire percorso di scarico, appoggi e aree accessibili agli addetti."]],
    quesiti: ["Dove sono accessi, area di scarico e deposito?", "Chi coordina consegne, pedoni e viabilità interna?"], fonte: "infortuni",
  },
  {
    id: "demolizioni", titolo: "Demolizioni e rimozioni", area: "Opere edili",
    chiavi: ["demolizione", "demolizioni", "rimozione", "rimozioni", "smontaggio murature"],
    descrizione: "Rimozione controllata degli elementi individuati dal progetto e gestione del materiale di risulta.",
    prima: "Individuare elementi da rimuovere, impianti interferenti, stabilità, materiali sospetti e locali da segregare.",
    durante: "Procedere nella sequenza concordata e trasferire i materiali attraverso i percorsi dedicati. Registrare le condizioni diverse dal previsto.",
    dopo: "Verificare la stabilità delle parti residue e formalizzare la riconsegna del locale.",
    rischi: [["Instabilità e caduta di parti", "Definire sequenza, segregazione e verifica tecnica preliminare."], ["Polveri e proiezioni", "Valutare composizione dei materiali, contenimento e aspirazione per l’attrezzatura effettiva."]],
    quesiti: ["Quali elementi e impianti sono stati verificati?", "Come si segregano l’area e il percorso dei materiali di risulta?"], fonte: "infortuni",
  },
  {
    id: "tramezzi", titolo: "Realizzazione di tramezzi", area: "Opere edili",
    chiavi: ["tramezz", "divisorio in laterizio", "divisori in laterizio"],
    descrizione: "Realizzazione di tramezzi nelle aree indicate dalla commessa.",
    prima: "Verificare le zone di lavoro, i materiali previsti e le indicazioni sui passaggi da mantenere disponibili.",
    durante: "Organizzare movimentazione, taglio e posa lungo il fronte concordato. Coordinare le attività nelle aree condivise.",
    dopo: "Verificare le condizioni per la consegna della zona e il ripristino dei passaggi.",
    rischi: [
      ["Movimentazione e deposito dei materiali", "Indicare percorso, modalità di movimentazione e area di deposito effettivi."],
      ["Polveri e interferenze durante la posa", "Confermare metodo di taglio, delimitazioni e gestione dei passaggi condivisi."],
    ],
    quesiti: ["In quale zona si realizza il tramezzo e con quali materiali?", "Quali percorsi restano disponibili e chi coordina la consegna dell’area?"],
    fonte: "infortuni",
  },
  {
    id: "varco", titolo: "Apertura di un varco", area: "Opere edili",
    chiavi: ["realizzazione varco", "realizzazione del varco", "apertura varco", "apertura di un varco", "apertura di varchi", "apertura varchi"],
    descrizione: "Apertura di un varco nell’elemento individuato nel progetto o nel sopralluogo.",
    prima: "Confermare la natura dell’elemento e verificare gli impianti interferenti. Definire con il tecnico competente le condizioni per iniziare.",
    durante: "Attenersi alla sequenza verificata per il cantiere e gestire le interferenze con passaggi e altre lavorazioni.",
    dopo: "Verificare le condizioni di stabilità e accessibilità prima della riconsegna.",
    rischi: [
      ["Instabilità o caduta di parti", "Collegare i riscontri sulla struttura, le eventuali opere provvisionali e la sequenza concordata."],
      ["Interferenza con impianti e persone", "Identificare impianti, delimitazioni e percorsi prima di autorizzare l’area di lavoro."],
    ],
    quesiti: ["Quale parete è interessata e come è stata verificata la sua natura?", "Quali impianti interferiscono e dove sono riportate le condizioni per iniziare?"],
    fonte: "infortuni",
  },
  {
    id: "murature", titolo: "Murature e ripristini strutturali", area: "Opere edili",
    chiavi: ["muratura", "murature", "ripristini struttural", "calcestruzzo", "sottofond", "massetto"],
    descrizione: "Realizzazione di nuove murature, riprese e ripristini nelle zone previste.",
    prima: "Verificare supporti, quote, accessi, stabilità e condizioni di consegna dell’area.",
    durante: "Organizzare la posa per tratti, tenere sotto controllo materiali e attrezzature e coordinare gli attraversamenti impiantistici.",
    dopo: "Controllare le condizioni delle porzioni realizzate, pulire il piano di lavoro e documentare le aree da lasciare interdette.",
    rischi: [["Movimentazione e perdita di stabilità dei materiali", "Identificare appoggi, percorso dei carichi e modalità di deposito."], ["Contatto con polveri o prodotti di ripristino", "Verificare prodotti, schede di sicurezza e contenimento secondo l’impiego."]],
    quesiti: ["Quali tratti richiedono una verifica di stabilità prima dell’intervento?", "Quali sono attrezzature e prodotti effettivamente impiegati?"], fonte: "infortuni",
  },
  {
    id: "ponteggi", titolo: "Ponteggi e opere provvisionali", area: "Opere edili",
    chiavi: ["pontegg", "trabattell", "opere provvisional", "apprestament", "parapetti provvisori"],
    descrizione: "Pianificazione dell’uso o messa in opera delle opere provvisionali previste per la fase.",
    prima: "Identificare il sistema, chi lo consegna, i controlli previsti e la documentazione applicabile.",
    durante: "Coordinare accessi, zone sottostanti e uso tra imprese secondo i documenti del sistema scelto.",
    dopo: "Registrare consegna, variazioni e condizioni di restituzione dell’area.",
    rischi: [["Caduta dall’alto o di materiali", "Verificare la protezione collettiva, gli accessi e l’interdizione delle zone sottostanti."], ["Condizioni di appoggio e stabilità", "Collegare i riscontri al sistema effettivo e alla documentazione applicabile."]],
    quesiti: ["Si tratta di montaggio, uso, modifica o smontaggio?", "Quale sistema è stato scelto e dove sono il PiMUS, se applicabile, e i riscontri di consegna?"], fonte: "cantieri",
  },
  {
    id: "copertura", titolo: "Coperture e lattonerie", area: "Opere edili",
    chiavi: ["copertura", "coperture", "falda", "lattoneri", "gronda", "lucernar"],
    descrizione: "Intervento su manto, strati di copertura e raccordi in lattoneria.",
    prima: "Verificare accesso, superfici fragili, bordi, condizioni meteo previste e delimitazioni a terra.",
    durante: "Procedere per zone autorizzate, controllando movimentazione materiali e interferenze con i fronti sottostanti.",
    dopo: "Mettere in sicurezza materiali, aperture e porzioni ancora in lavorazione prima di riconsegnare la zona.",
    rischi: [["Caduta dai bordi o attraverso la copertura", "Individuare parti fragili e protezioni collettive, verificando accesso e recupero in emergenza."], ["Caduta di materiali e cambi meteo", "Definire interdizioni, fissaggio dei componenti e criteri di sospensione."]],
    quesiti: ["Quali accessi, bordi e superfici fragili risultano dal sopralluogo?", "Quali protezioni e modalità di emergenza sono previste per la copertura?"], fonte: "cantieri",
  },
  {
    id: "facciate", titolo: "Facciate, cappotto e intonaci esterni", area: "Opere edili",
    chiavi: ["facciat", "cappotto", "isolamento termico", "rasatura armata", "intonaci esterni"],
    descrizione: "Ripristino o isolamento dei prospetti, con organizzazione dei fronti di lavoro.",
    prima: "Concordare il fronte e la separazione dalle altre imprese. Verificare accessi, appoggi e stato del supporto.",
    durante: "Organizzare posa e movimentazione per tratto e presidiare le zone sottostanti secondo le condizioni di cantiere.",
    dopo: "Verificare riconsegna del fronte, assenza di materiali instabili e delimitazioni residue.",
    rischi: [["Interferenza lungo la stessa verticale", "Coordinare fronti, interdizioni e riconsegna con le altre imprese."], ["Contatto con impasti, primer o rasanti", "Confermare prodotti, schede e modalità d’uso."]],
    quesiti: ["Quali prospetti e piani possono essere occupati contemporaneamente?", "Quale opera provvisionale e quali prodotti saranno usati?"], fonte: "cantieri",
  },
  {
    id: "scavi", titolo: "Scavi e sottoservizi", area: "Opere edili",
    chiavi: ["scav", "trincea", "sottoservizi", "sbancamento"],
    descrizione: "Scavi e posa o ripristino di sottoservizi nell’area delimitata.",
    prima: "Individuare reti presenti, ostacoli, zone di manovra e condizioni del terreno dai riscontri disponibili.",
    durante: "Coordinare operatori, mezzi, accessi e depositi secondo la sequenza stabilita per il sito.",
    dopo: "Proteggere lo scavo rimasto aperto e registrare i tratti consegnati o ripristinati.",
    rischi: [["Cedimento delle pareti dello scavo", "Far definire protezioni e modalità di accesso in base a terreno, geometria e sovraccarichi reali."], ["Interferenza con sottoservizi e mezzi", "Verificare il tracciato delle reti e delimitare le aree di manovra."]],
    quesiti: ["Quali sottoservizi sono stati individuati e con quali riscontri?", "Quali condizioni del terreno, geometrie e protezioni sono previste?"], fonte: "cantieri",
  },
  {
    id: "impermeabilizzazioni", titolo: "Impermeabilizzazioni e terrazze", area: "Opere edili",
    chiavi: ["impermeabilizz", "terrazze", "drenaggi", "membrana"],
    descrizione: "Preparazione del supporto, posa del sistema impermeabile e trattamento dei raccordi.",
    prima: "Confermare condizioni del fondo, accessi, protezione dei bordi e prodotti previsti.",
    durante: "Organizzare applicazione e ventilazione secondo il sistema scelto e delimitare le superfici trattate.",
    dopo: "Segnalare le aree con tempi di attesa, ripristinare passaggi e verificare i punti di raccordo.",
    rischi: [["Esposizione a prodotti o fumi", "Controllare schede di sicurezza e metodo a freddo o a caldo prima della valutazione."], ["Scivolamento o caduta da bordi", "Definire accessi, segregazione e protezioni per la geometria effettiva."]],
    quesiti: ["Quale sistema di posa e quali prodotti documentati sono previsti?", "Come si proteggono bordi, passaggi e aree con superficie ancora trattata?"], fonte: "cantieri",
  },
  {
    id: "serramenti", titolo: "Serramenti e vetrazioni", area: "Serramenti",
    chiavi: ["serrament", "finestra", "finestre", "portafinestr", "infiss", "vetrazion", "controtelai"],
    descrizione: "Rimozione o posa dei serramenti secondo le posizioni e le misure confermate per il cantiere.",
    prima: "Confermare vani, pesi, ingombri, itinerario delle consegne e protezione dei vani aperti.",
    durante: "Identificare i pezzi per vano. Coordinare movimentazione, sgombero del percorso, sostegno e fissaggio con chi opera sui fronti adiacenti.",
    dopo: "Controllare stabilità, regolazioni e accessi. Registrare i vani ancora aperti e le protezioni residue.",
    rischi: [["Caduta del componente, taglio o schiacciamento", "Verificare peso, presa, appoggio e ausilio scelto per vetro e telaio."], ["Caduta dal vano o interferenza con la facciata", "Confermare protezione del vano e coordinamento del fronte interessato."]],
    quesiti: ["Quali ausili si usano per movimentare telai e vetri?", "Come vengono protetti i vani aperti durante la sostituzione?"], fonte: "infortuni",
  },
  {
    id: "schermature", titolo: "Tapparelle, zanzariere, cassonetti e persiane", area: "Serramenti",
    chiavi: ["tapparell", "avvolgibil", "zanzarier", "cassonett", "persian", "schermatur", "oscurant"],
    descrizione: "Posa di schermature e chiusure accessorie per posizione, compresi gli eventuali comandi.",
    prima: "Verificare quote, supporti, accesso, protezione dei vani e confini tra posa meccanica e collegamento elettrico.",
    durante: "Gestire il fissaggio e la movimentazione delle parti, coordinando prove e alimentazioni con l’impresa incaricata.",
    dopo: "Controllare funzionamento, protezioni e disponibilità del vano prima della riconsegna.",
    rischi: [["Caduta dal vano o caduta di componenti", "Definire protezioni di vano, delimitazione sottostante e sostegno durante la posa."], ["Avvio o movimento inatteso delle parti", "Concordare la sequenza delle prove e chi gestisce i comandi e le alimentazioni."]],
    quesiti: ["Quali posizioni coinvolgono vani esposti o lavoro su fronte?", "Chi gestisce alimentazione e prove dei sistemi motorizzati?"], fonte: "infortuni",
  },
  {
    id: "porte", titolo: "Porte, portoni e chiusure interne", area: "Serramenti",
    chiavi: ["porta interna", "porte interne", "portone", "portoni", "porta vetrata", "porta tagliafuoco"],
    descrizione: "Movimentazione, fissaggio e regolazione di porte, portoni e relativi accessori.",
    prima: "Verificare tipo di chiusura, peso, percorso, appoggi e eventuale transito in prossimità del vano.",
    durante: "Coordinare sostegno, fissaggio e prove in un’area controllata. Preservare i percorsi di esodo.",
    dopo: "Verificare stabilità e funzionamento e consegnare gli eventuali riscontri specifici del sistema.",
    rischi: [["Schiacciamento o ribaltamento dell’anta", "Definire ausili, appoggi e controllo durante il fissaggio."], ["Interferenza con percorsi attivi", "Programmare le sostituzioni e verificare passaggi alternativi quando necessari."]],
    quesiti: ["Quali sono pesi, dimensioni e modalità di movimentazione?", "La posa interessa una via di esodo o una chiusura con requisiti specifici?"], fonte: "infortuni",
  },
  {
    id: "termoidraulica", titolo: "Impianti idrosanitari e termoidraulici", area: "Impianti",
    chiavi: ["termoidraulic", "idraulic", "idrosanitar", "radiante", "montanti acqua", "pompa di calore", "tubazion", "ventilazione meccanica", "collettore"],
    descrizione: "Posa e verifica di tubazioni, distribuzione, apparecchi e impianti meccanici.",
    prima: "Verificare percorsi, attraversamenti, impianti esistenti, accesso al locale tecnico e perimetro delle prove.",
    durante: "Organizzare la posa per zona e comunicare le tratte da ispezionare prima della chiusura di cavedi e partizioni.",
    dopo: "Raccogliere i riscontri delle verifiche e consegnare i tratti liberati alle imprese successive.",
    rischi: [["Contatto con energia e perdita di fluido in prova", "Definire procedura, isolamento, addetti e accessi al locale durante le verifiche."], ["Interferenza con impiantisti e cartongessisti", "Registrare la consegna dei tratti e il controllo prima delle chiusure."]],
    quesiti: ["Quali reti e prove sono previste per locale o piano?", "A chi e quando si rilasciano i cavedi prima della chiusura?"], fonte: "infortuni",
  },
  {
    id: "elettrico", titolo: "Impianto elettrico, quadri e prove", area: "Impianti",
    chiavi: ["elettric", "canalizzazion", "citofon", "quadri", "prese energia", "punti luce", "domotica"],
    descrizione: "Posa e verifica di dorsali, quadri, terminali e sistemi a servizio delle aree indicate.",
    prima: "Identificare impianti presenti, stato dei circuiti, zone interessate e incaricati delle verifiche.",
    durante: "Coordinare attività, accessi, messa in sicurezza e prove secondo le procedure definite dalle figure competenti.",
    dopo: "Registrare esiti e stato dei circuiti. Comunicare ai soggetti interessati le condizioni di riconsegna.",
    rischi: [["Contatto elettrico e riattivazione inattesa", "Chiarire chi controlla lo stato degli impianti e chi gestisce prove e riattivazione."], ["Interferenza con altre attività nei cavedi", "Organizzare consegna per zona e coordinare i lavori prima delle chiusure."]],
    quesiti: ["Quali impianti esistenti e circuiti sono interessati?", "Chi autorizza accessi e prove e come vengono coordinati con le altre imprese?"], fonte: "infortuni",
  },
  {
    id: "cartongesso", titolo: "Cartongesso, pareti e controsoffitti", area: "Finiture",
    chiavi: ["cartongess", "controsoffitt", "controparet", "lastre", "partizion"],
    descrizione: "Posa di struttura e lastre, formazione di partizioni e chiusura delle zone consegnate.",
    prima: "Verificare accessi, stoccaggio delle lastre, modalità di sollevamento e consegna degli impianti da chiudere.",
    durante: "Organizzare taglio e fissaggio in postazioni controllate e mantenere libere le aree di transito.",
    dopo: "Controllare stabilità, botole, accessibilità dei punti di ispezione e riconsegna della zona.",
    rischi: [["Caduta di lastre e sovraccarico durante la posa", "Definire ausili, appoggi e delimitazioni in base a geometria e dimensioni effettive."], ["Interferenza con attività impiantistiche", "Acquisire il riscontro di consegna dei cavedi prima di chiuderli."]],
    quesiti: ["Quali lastre, ausili e altezze di lavoro sono previsti?", "Chi conferma la consegna dei cavedi e delle zone da chiudere?"], fonte: "infortuni",
  },
  {
    id: "finiture", titolo: "Pavimenti, rivestimenti e tinteggiatura", area: "Finiture",
    chiavi: ["posa paviment", "pavimentazion", "rivestiment", "gres", "tinteggiatur", "pittur", "battiscop"],
    descrizione: "Preparazione delle superfici e posa o applicazione delle finiture interne o esterne.",
    prima: "Confermare condizioni del locale, area di taglio, percorsi alternativi e schede dei prodotti previsti.",
    durante: "Delimitare lavorazioni, tagli e superfici trattate. Coordinare eventuale ventilazione e riapertura dei passaggi.",
    dopo: "Rimuovere i residui e riconsegnare i locali e i percorsi secondo i tempi del prodotto utilizzato.",
    rischi: [["Polveri, proiezioni e rumore", "Valutare taglio, aspirazione, separazione dalla zona di transito e rapporto sul rumore pertinente."], ["Scivolamento o esposizione a prodotti", "Controllare schede e tempi per la riapertura delle aree."]],
    quesiti: ["Quali prodotti e attrezzature saranno impiegati?", "Come restano disponibili i percorsi quando una superficie è in lavorazione?"], fonte: "infortuni",
  },
  {
    id: "smobilizzo", titolo: "Smobilizzo, pulizia e consegna", area: "Finiture",
    chiavi: ["smobilizzo", "pulizia finale", "pulizia tecnica", "riconsegna aree", "consegna finale"],
    descrizione: "Rimozione programmata degli allestimenti e restituzione delle aree.",
    prima: "Verificare quali squadre sono ancora presenti e quali protezioni comuni servono fino alla fine.",
    durante: "Coordinare sgombero, carichi e rifiuti mantenendo vie di uscita durante il passaggio.",
    dopo: "Registrare la consegna, i riscontri conclusivi e le eventuali zone ancora interdette.",
    rischi: [["Rimozione anticipata di protezioni comuni", "Definire chi può autorizzare la rimozione e chi verifica le lavorazioni ancora attive."], ["Interferenza durante carico e pulizia", "Separare carrelli, mezzi e pedoni fino alla completa restituzione delle aree."]],
    quesiti: ["Quali protezioni devono restare disponibili fino a fine lavori?", "Chi conferma la restituzione delle aree e dei percorsi?"], fonte: "infortuni",
  },
  {
    id: "fotovoltaico", titolo: "Posa di impianti fotovoltaici", area: "Impianti",
    chiavi: ["fotovoltaic", "moduli fotovoltaici", "pannelli solari fotovoltaici", "stringhe solari"],
    descrizione: "Movimentazione, posa dei moduli e attività elettriche previste dal progetto.",
    prima: "Verificare accessi, supporti, eventuale lavoro in quota, percorsi di movimentazione e perimetro delle attività elettriche.",
    durante: "Coordinare posa meccanica e attività elettriche con le squadre incaricate. Verificare le condizioni dell’area prima delle prove.",
    dopo: "Registrare lo stato dell’impianto e degli accessi, i riscontri delle prove e le eventuali limitazioni residue.",
    rischi: [["Caduta dall’alto o di componenti", "Indicare per quali superfici e fronti servono protezioni e zone interdette."], ["Rischio elettrico durante posa e prove", "Far definire alle figure competenti le condizioni dei circuiti, le procedure e gli incarichi effettivi."]],
    quesiti: ["Dove si posano i moduli e quali accessi e protezioni sono confermati?", "Chi coordina attività elettriche, prove e riconsegna?"], fonte: "elettrico",
  },
  {
    id: "sollevamento", titolo: "Sollevamento e posa di carichi", area: "Opere edili",
    chiavi: ["sollevamento carich", "sollevamento material", "autogru", "autogrù", "gru a torre", "posa prefabbricat"],
    descrizione: "Organizzazione del sollevamento e del posizionamento dei carichi individuati per la fase.",
    prima: "Confermare carico, punti di presa, attrezzatura, percorso e condizioni delle aree di partenza e arrivo.",
    durante: "Seguire la procedura definita per l’attrezzatura e coordinare operatori e accessi lungo l’area coinvolta.",
    dopo: "Verificare stabilità e consegna della zona di posa e registrare le condizioni residue prima di riaprire i passaggi.",
    rischi: [["Caduta o oscillazione del carico", "Verificare compatibilità di carico, attrezzatura e accessori e individuare l’area da delimitare."], ["Interferenze con mezzi, persone e ostacoli", "Definire chi gestisce le manovre, le comunicazioni e i percorsi."]],
    quesiti: ["Quali carichi, accessori e attrezzature risultano dal piano di lavoro?", "Quale area e quali addetti sono coinvolti durante le manovre?"], fonte: "sollevamento",
  },
  {
    id: "traffico", titolo: "Lavori stradali in presenza di traffico", area: "Opere edili",
    chiavi: ["cantiere stradale", "cantieri stradali", "lavori stradali", "traffico veicolare", "segnaletica temporanea stradale"],
    descrizione: "Attività lungo la viabilità con possibile interferenza tra squadre e traffico.",
    prima: "Verificare il tratto, la disciplina del traffico, lo schema applicabile e gli incarichi previsti per la segnaletica.",
    durante: "Coordinare le attività secondo le procedure definite per il tratto e rilevare variazioni di visibilità, traffico o accessi.",
    dopo: "Registrare le modalità di rimozione della segnaletica e le condizioni autorizzate di restituzione della viabilità.",
    rischi: [["Investimento da traffico veicolare", "Verificare delimitazioni, schema segnaletico, comunicazioni e procedure per gli addetti."], ["Interferenza con pedoni e accessi laterali", "Definire percorsi, varchi e coordinamento con il gestore del tratto."]],
    quesiti: ["Quale schema si applica al tratto e chi ne verifica l’attuazione?", "Quali passaggi e accessi laterali devono restare disponibili?"], fonte: "strade",
  },
];

export const testoRicercaSchedePos = (v: string) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function suggerisciSchedePos(testo: string) {
  const normalizzato = " " + testoRicercaSchedePos(testo) + " ";
  if (/\b(?:sola fornitura|fornitura senza posa|esclusa la posa|posa esclusa)\b/.test(normalizzato)) {
    return /\b(?:scarico|consegna in cantiere)\b/.test(normalizzato)
      ? SCHEDE_STANDARD_POS.filter(s => s.id === "allestimento")
      : [];
  }
  const proposte = SCHEDE_STANDARD_POS.filter(s => s.chiavi.some(k => normalizzato.includes(" " + testoRicercaSchedePos(k))));
  // Un ripristino generico non descrive le verifiche necessarie per l’apertura in una parete esistente.
  return proposte.some(s => s.id === "varco" || s.id === "tramezzi") ? proposte.filter(s => s.id !== "murature") : proposte;
}

export function nuovaDaSchedaStandard(s: SchedaStandardPos, id: string): Lavorazione {
  const nuova: Lavorazione = {
    ...lavorazioneVuota(id),
    titolo: s.titolo, descrizione: s.descrizione, modalita: [s.prima, s.durante, s.dopo].join("\n"),
    origine: "modello", verificata: false,
    ...(["demolizioni", "varco"].includes(s.id) ? { programma_demolizioni: programmaDemolizioniVuoto() } : {}),
    fonti_scheda: { standard: { id: s.id, versione: VERSIONE_SCHEDE_POS }, quesiti: s.quesiti.map(domanda => ({ domanda, risposta: "" })) },
    tecnica: {
      ...tecnicaPosVuota(), prima: s.prima, durante: s.durante, dopo: s.dopo,
      rischi: s.rischi.map(([pericolo, misure_organizzative], i) => ({
        ...rischioTecnicoVuoto(`${id}-r${i + 1}`), pericolo, misure_organizzative,
      })),
    },
  };
  applicaValutazione(nuova, {
    righe: s.rischi.map(([rischio, misure]) => ({ rischio, misure, dpi: "", residuo: "" })),
    misure_comuni: "", dpi_comuni: "",
  });
  return nuova;
}
