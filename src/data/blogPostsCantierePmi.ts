/**
 * Articoli settembre 2026 — long-tail operativa dove i concorrenti grandi non
 * ci sono e dove le SERP oggi premiano chi c'è (myAEDES, Cantir, Factorial).
 *
 * Regole del sito: nessuna cifra di listino, nessun attacco nominale ai
 * concorrenti, tono imprenditore-a-imprenditore, vocabolario del cantiere.
 */
import type { BlogPost } from "./blogPosts";
import { FLO_AVATAR } from "./blogAuthor";

export const blogPostsCantierePmi: BlogPost[] = [
  {
    id: "sept-2026-rapportino",
    slug: "rapportino-di-cantiere-app-e-modello",
    faqs: [
      {
        q: "Il rapportino di cantiere è obbligatorio per legge?",
        a: "Come documento a sé no. Ma le informazioni che contiene sì, in molti casi: le ore per il costo della manodopera e per la congruità nei lavori pubblici, le presenze per la Cassa Edile, l'avanzamento per i SAL. Il rapportino è il modo più semplice per avere quei dati ogni sera invece che ricostruirli a fine mese.",
      },
      {
        q: "Cosa deve contenere un rapportino giornaliero di cantiere?",
        a: "Data e cantiere, chi c'era e quante ore, le lavorazioni fatte e a che punto sono, i materiali usati e quelli arrivati, i mezzi, il meteo, eventuali problemi o fermi, le foto e — se serve — la firma di chi lo compila e del cliente. Tutto il resto è facoltativo.",
      },
      {
        q: "Meglio il rapportino su carta o con un'app?",
        a: "La carta funziona finché nessuno deve ricopiarla. Se la sera in ufficio qualcuno ribatte le ore in Excel, la carta costa più dell'app. L'app vince quando le foto le scatti durante il giorno, le ore arrivano dalle timbrature e il PDF si fa da solo: il rapportino diventa due minuti, non venti.",
      },
    ],
    title: "Rapportino di Cantiere: App e Modello Gratis",
    excerpt:
      "Cosa deve contenere, un modello da copiare, e come farlo in 2 minuti dal telefono con foto, ore e firma. Senza ricopiare niente la sera.",
    category: "Gestione Cantieri",
    tags: ["rapportino cantiere", "giornale lavori", "app cantiere", "gestione cantieri"],
    publishedAt: "2026-09-05",
    readTime: 8,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage: "/blog/covers/digitalizzare-impresa-edile.jpg",
    content: [
      {
        type: "intro",
        body: "Il rapportino di cantiere è il documento che nessuno ha voglia di compilare alle cinque del pomeriggio e che tutti vorrebbero avere quando il cliente contesta un lavoro, quando il commercialista chiede le ore per cantiere, o quando il SAL va giustificato. Questa guida dice cosa deve contenere davvero, ti dà un modello da copiare, e spiega quando la carta basta e quando invece un'app fa la differenza — perché la differenza non è la tecnologia, è chi ricopia i dati la sera.",
      },
      {
        type: "section",
        heading: "A cosa serve davvero un rapportino (non è burocrazia)",
        body: "Un rapportino ben fatto risponde a quattro domande che prima o poi arrivano tutte. Quanto è costata la manodopera su questo cantiere? Le ore per persona e per giorno sono il costo vero, e senza rapportino il margine della commessa lo scopri a fine lavori. A che punto siamo? Il SAL si giustifica con le lavorazioni fatte e con le foto, non con la memoria. Chi c'era? Presenze e ore servono per la Cassa Edile e, nei lavori pubblici, per la verifica di congruità della manodopera. Cos'è successo? Il fermo per pioggia, il materiale arrivato sbagliato, la richiesta del cliente fatta a voce: scritte il giorno stesso valgono, ricordate tre mesi dopo no.\n\nDetta così, la burocrazia sparisce. Il rapportino è il registro dei soldi e delle responsabilità del cantiere, un giorno alla volta.",
      },
      {
        type: "list",
        heading: "Cosa deve contenere: la lista minima",
        items: [
          "Data e cantiere (commessa): sembra ovvio, ma il 'rapportino di ieri' senza data è carta straccia.",
          "Chi c'era e quante ore ciascuno: operai, capocantiere, subappaltatori. Sono il costo della manodopera e la base per Cassa Edile e congruità.",
          "Lavorazioni fatte e a che punto sono: non 'lavorato in cantiere', ma 'posa massetto piano primo, 60%'.",
          "Materiali usati e materiali arrivati: con i DDT si chiude il cerchio con il magazzino e con le fatture dei fornitori.",
          "Mezzi e attrezzature: gru, piattaforma, escavatore. Chi noleggia, sa perché.",
          "Meteo e fermi: la pioggia che ferma il getto va scritta il giorno stesso, non spiegata dopo al cliente.",
          "Foto con data, ora e posizione: prima, durante, dopo. Sono la prova nelle contestazioni e il contenuto del SAL.",
          "Note e problemi: la richiesta del cliente, l'imprevisto, la variante fatta a voce.",
          "Firma di chi compila e, a fine lavori, del cliente: trasforma il rapportino da appunto a documento.",
        ],
      },
      {
        type: "table",
        heading: "Modello di rapportino giornaliero (da copiare)",
        headers: ["Voce", "Cosa scrivere", "Esempio"],
        rows: [
          ["Data / Cantiere", "Giorno e commessa", "05/09/2026 — Villa Rossi, Bergamo"],
          ["Presenze e ore", "Nome, ore, ruolo", "Marco B. 8h posatore · Luca V. 8h aiuto · Sub. Elettra 2 persone 6h"],
          ["Lavorazioni", "Cosa e a che punto", "Massetto piano primo 60% · Tracce impianti bagno 100%"],
          ["Materiali", "Usati / arrivati (DDT)", "Usati 40 sacchi premiscelato · Arrivati 12 pallet blocchi (DDT 4471)"],
          ["Mezzi", "Attrezzature e noli", "Piattaforma 12 m (noleggio) · Betoniera"],
          ["Meteo / fermi", "Condizioni e ore perse", "Pioggia dalle 14, getto rinviato: 2h perse ×3 persone"],
          ["Foto", "Quante e di cosa", "6 foto: massetto prima/dopo, tracce bagno, materiale arrivato"],
          ["Note", "Richieste, problemi, varianti", "Cliente chiede spostamento presa cucina: da quotare"],
          ["Firme", "Compilatore / cliente", "Capocantiere · Cliente (a fine lavori)"],
        ],
      },
      {
        type: "section",
        heading: "Carta o app? La domanda giusta è: chi ricopia?",
        body: "La carta ha un vantaggio vero: non si scarica, non ha bisogno di campo e tutti la sanno usare. Ha un difetto altrettanto vero: la sera qualcuno la ricopia. In Excel per le ore, nella chat per le foto, nel file del SAL per l'avanzamento. Tre ricopiature al giorno per cantiere, ognuna con i suoi errori, e il rapportino di carta finisce in una cartellina che nessuno riapre.\n\nSe nella tua impresa nessuno ricopia niente — perché il commercialista si accontenta del totale mensile e i clienti non contestano — la carta ti basta e non ha senso cambiare. Se invece ogni sera il titolare o la segretaria ribatte i dati, stai pagando due volte lo stesso lavoro. È lì che l'app ripaga, e ripaga il primo giorno.",
      },
      {
        type: "section",
        heading: "Come si fa in 2 minuti dal telefono",
        body: "Un'app di rapportini funziona se toglie lavoro, non se lo sposta dalla carta allo schermo. Le cose che fanno la differenza sono poche e precise. Le foto si scattano durante il giorno, davanti al lavoro, e la sera sono già lì: nessuno deve ricaricarle dalla galleria. Le ore arrivano dalle timbrature della squadra, e il capocantiere le conferma invece di digitarle. La descrizione si detta a voce, in dialetto se serve, e diventa testo. Il cliente firma sullo schermo a fine lavori, e il PDF con foto, ore e firma si genera da solo e va in ufficio senza che nessuno lo chieda. Se in cantiere non c'è campo, si compila lo stesso e parte quando torna la rete.\n\nCosì il rapportino diventa la conferma di cose già successe, non una compilazione. Due minuti alla fine della giornata, spesso meno. È il modo in cui lo abbiamo costruito in [Edilizia in Cloud](/funzionalita/gestione-cantieri): foto con data, ora e posizione impresse, dettatura vocale, firma del cliente, PDF automatico e [app per gli operai](/funzionalita/app-cantiere-mobile) che funziona anche senza copertura.",
      },
      {
        type: "callout",
        variant: "info",
        body: "Un dettaglio che vale più di tutto il resto: le foto con data, ora e coordinate GPS impresse sull'immagine. Nelle contestazioni è la differenza tra «il cliente dice che non era così» e «ecco la foto delle 14:32 con la posizione del cantiere».",
      },
      {
        type: "section",
        heading: "Gli errori che vediamo più spesso",
        body: "Il primo è chiedere troppo: un rapportino con trenta campi obbligatori non lo compila nessuno, e l'app finisce nel cassetto come la carta. Le voci obbligatorie devono essere quattro o cinque, il resto facoltativo. Il secondo è farlo compilare all'ufficio invece che a chi era in cantiere: perde la metà delle informazioni e tutte le foto. Il terzo è non chiudere il cerchio: un rapportino che non alimenta il costo della commessa, il SAL e il costo del personale è un diario, non uno strumento. Il quarto è la firma dimenticata: a fine lavori, senza la firma del cliente, il rapportino vale la metà davanti a una contestazione.",
      },
      {
        type: "section",
        heading: "Da dove partire lunedì",
        body: "Scegli un cantiere solo e un capocantiere che ha voglia di provare. Per una settimana fategli compilare il rapportino a fine giornata, con il modello sopra o con un'app in prova. Venerdì guardate insieme cosa è uscito: le ore per persona tornano con le presenze? Le foto raccontano l'avanzamento? Le note contengono cose che altrimenti sareste andati a cercare? Se la risposta è sì tre volte, estendete agli altri cantieri. Se la squadra si è lamentata, il modello chiedeva troppo: togliete campi, non aggiungetene.\n\nSe vuoi confrontare le app disponibili prima di scegliere, abbiamo scritto [dove arrivano davvero le app gratuite per il cantiere](/blog/app-gestione-cantieri-gratis) e [quando il software gratis regge e quando cede](/blog/software-gestione-cantieri-gratis).",
      },
      {
        type: "cta",
        body: "Vuoi provare il rapportino con foto, ore dalle timbrature, dettatura vocale e firma del cliente? Edilizia in Cloud è gratis per 31 giorni, senza carta di credito: carica un cantiere vero e fai compilare la squadra per una settimana.",
      },
    ],
  },
  {
    id: "sept-2026-pmi",
    slug: "gestionale-cantiere-piccola-impresa-edile",
    faqs: [
      {
        q: "Una piccola impresa edile ha davvero bisogno di un gestionale?",
        a: "Con due o tre persone e un cantiere alla volta, spesso no: Excel e WhatsApp reggono. Il bisogno nasce quando i cantieri aperti diventano tre o quattro insieme, la squadra supera le cinque persone e il titolare non sa più, a fine mese, quale commessa ha guadagnato e quale no. Lì i dati sparsi iniziano a costare più del gestionale.",
      },
      {
        q: "Quanto ci mette una piccola impresa a partire con un gestionale?",
        a: "Con un gestionale pensato per le PMI edili, una settimana: un pomeriggio per caricare anagrafiche e cantieri aperti, un giorno perché la squadra timbri e faccia i rapportini dal telefono, il resto per emettere la prima fattura dal SAL. Se il fornitore parla di mesi di implementazione, è un software per un'impresa più grande della tua.",
      },
      {
        q: "Il gestionale serve al titolare o alla squadra?",
        a: "A tutti e due, ma per motivi diversi. La squadra deve poterlo usare dal telefono in trenta secondi: ore, foto, rapportino. Il titolare ci guarda il margine per commessa e la cassa. Se una delle due parti non lo usa, l'altra non ha dati. Per questo la prova va fatta con la squadra, non con una demo in ufficio.",
      },
    ],
    title: "Gestionale Cantiere per Piccola Impresa Edile",
    excerpt:
      "Da 3 a 15 persone il titolare fa tutto. Le 6 cose che servono davvero in un gestionale, le 10 che non servono, e come partire in una settimana.",
    category: "Digitalizzazione",
    tags: ["gestionale cantieri", "piccola impresa edile", "PMI edilizia", "software edilizia"],
    publishedAt: "2026-09-05",
    readTime: 9,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage: "/blog/covers/digitalizzazione-impresa-edile-passo-passo.jpg",
    content: [
      {
        type: "intro",
        body: "In Italia ci sono più di cinquecentomila imprese edili e nove su dieci lavorano con Excel, WhatsApp e un blocco note. Non per arretratezza: perché i gestionali, per anni, sono stati costruiti per l'impresa da cinquanta persone con un ufficio tecnico e uno amministrativo. La piccola impresa — da tre a quindici persone, dove il titolare fa il preventivo la sera, il cantiere di giorno e la fattura il sabato — aveva bisogno di un'altra cosa. Questa guida dice quale.",
      },
      {
        type: "section",
        heading: "Cosa cambia da 3 a 15 persone",
        body: "Con tre persone e un cantiere alla volta, tutto sta nella testa del titolare e funziona. Il problema arriva con il secondo e il terzo cantiere aperti insieme: le ore della squadra vanno divise per commessa, i materiali arrivano su tre indirizzi, i SAL hanno scadenze diverse e i fornitori vanno pagati mentre i clienti pagano in ritardo. È il momento in cui la sera si ricopia, il sabato si fattura, e a fine anno il commercialista dice che l'utile c'è ma nessuno sa da quale cantiere sia venuto — o quale l'abbia mangiato.\n\nUn gestionale per una piccola impresa serve a una cosa sola: sapere ogni settimana se ogni cantiere sta guadagnando, senza aggiungere lavoro a nessuno. Tutto il resto è di contorno.",
      },
      {
        type: "list",
        heading: "Le 6 cose che servono davvero",
        items: [
          "Margine per commessa in tempo reale: preventivo contro costi reali (ore, materiali, subappalti) mentre il cantiere è aperto. È il motivo per cui si compra un gestionale.",
          "Ore e presenze dal telefono: la squadra timbra o compila il rapportino in trenta secondi; il costo della manodopera per cantiere nasce da lì, non dall'Excel del sabato.",
          "Preventivo → cantiere → SAL → fattura, senza ricopiare: la fattura elettronica esce dal SAL, con SDI, reverse charge e ritenute già a posto.",
          "Foto e documenti attaccati al cantiere: la foto delle 14:32 con la posizione, il DDT, la variante chiesta a voce. Quando il cliente contesta, sono lì.",
          "Scadenze e cassa: chi devo pagare questa settimana, chi mi deve pagare, quanto resta. Una schermata, non tre fogli.",
          "Adempimenti italiani senza moduli extra: Cassa Edile, DURC dei subappaltatori, ritenute, congruità se fai lavori pubblici. Un software internazionale qui si ferma.",
        ],
      },
      {
        type: "list",
        heading: "Le 10 cose che non servono (ancora)",
        items: [
          "BIM e modellazione 5D: serve a chi progetta, non a chi esegue.",
          "Multi-società e consolidato: quando avrai la seconda società ne riparliamo.",
          "Workflow approvativi a quattro livelli: in una PMI approva il titolare, punto.",
          "Contabilità generale completa dentro il gestionale: quella la fa il commercialista; al gestionale basta esportare bene.",
          "Business intelligence con cento report: ne guarderai tre. Devono essere quelli giusti.",
          "Integrazioni con venti software: ne usi due, che siano fatte bene.",
          "Portale fornitori con gare online: hai gli stessi tre fornitori da dieci anni.",
          "Gestione flotta con telematica: due furgoni non sono una flotta.",
          "Moduli a pagamento per ogni funzione: il costo totale del primo anno deve stare su un foglio.",
          "Mesi di implementazione con consulente: se serve un consulente per iniziare, non è per te.",
        ],
      },
      {
        type: "section",
        heading: "L'errore più comune: il gestionale dell'impresa grande",
        body: "Succede spesso: un amico con un'impresa da sessanta persone consiglia il suo software, si fa la demo, sembra completo, si firma. Sei mesi dopo lo usa solo la segretaria per le fatture, la squadra è tornata a WhatsApp e il titolare ha pagato un anno di canone per un modulo. Non è colpa del software: è fatto per un'altra impresa, con un ufficio che lo alimenta. Nella piccola impresa il gestionale lo alimenta chi sta in cantiere, dal telefono, tra un getto e l'altro. Se non è pensato per quel momento, non avrà mai dati dentro.\n\nLa prova è semplice: se il capocantiere non riesce a compilare un rapportino in due minuti dal telefono, con foto e ore, quel gestionale non fa per una piccola impresa. Non importa cos'altro sappia fare.",
      },
      {
        type: "section",
        heading: "Il costo del «gratis»",
        body: "Excel è gratis, WhatsApp è gratis, il blocco note è gratis. Il costo sta nel tempo: due ore la sera a ricopiare, il sabato a fatturare, e soprattutto nel margine che non vedi. Una commessa che chiude in perdita del dieci per cento su un lavoro da cinquantamila euro sono cinquemila euro spariti senza che nessuno se ne sia accorto in corsa. Il gestionale non si giustifica con quanto costa: si giustifica con la prima commessa che smetti di fare in perdita perché l'hai vista in tempo. Ne abbiamo scritto in [dove regge e dove cede il software gratuito per i cantieri](/blog/software-gestione-cantieri-gratis).",
      },
      {
        type: "table",
        heading: "Partire in una settimana: il piano",
        headers: ["Giorno", "Cosa fare", "Chi"],
        rows: [
          ["Lunedì", "Caricare clienti, fornitori e i cantieri aperti (import da Excel)", "Titolare, 2 ore"],
          ["Martedì", "La squadra installa l'app e timbra; il capocantiere fa il primo rapportino con foto", "Squadra, 10 minuti a testa"],
          ["Mercoledì", "Inserire il preventivo del cantiere principale come budget della commessa", "Titolare, 1 ora"],
          ["Giovedì", "Registrare i DDT arrivati e le ore della settimana: il margine inizia a muoversi", "Ufficio o titolare"],
          ["Venerdì", "Emettere il SAL e la prima fattura elettronica dal gestionale", "Titolare, 30 minuti"],
          ["Settimana dopo", "Guardare il margine per commessa. Decidere con i numeri, non a sensazione", "Titolare"],
        ],
      },
      {
        type: "callout",
        variant: "warning",
        body: "Se il fornitore ti propone una demo guidata di trenta minuti invece di una prova con i tuoi dati e la tua squadra, chiedi la prova. Una piccola impresa lo capisce in una settimana se un gestionale le serve; non ha bisogno di una presentazione.",
      },
      {
        type: "section",
        heading: "Come è fatto un gestionale per la piccola impresa",
        body: "Lo abbiamo costruito partendo da qui: [Edilizia in Cloud](/per/imprese-edili) nasce dentro un'impresa edile vera, per il titolare che fa tutto e per la squadra che sta in cantiere. Preventivo, cantiere, rapportini con foto e firma, SAL, fattura elettronica, operai e margini in una piattaforma sola, dal telefono. Utenti illimitati, perché in una piccola impresa il gestionale lo devono usare tutti o non lo usa nessuno; nessun modulo da aggiungere dopo; e una prova gratuita di 31 giorni con i tuoi dati, non una demo. Se vuoi capire come si confronta con le altre famiglie di software, la [classifica dei gestionali per imprese edili](/blog/miglior-gestionale-edilizia-guida-scelta) mette tutto in una tabella.",
      },
      {
        type: "cta",
        body: "Hai tra tre e quindici persone e vuoi vedere il margine di ogni cantiere senza aggiungere lavoro a nessuno? Prova Edilizia in Cloud gratis per 31 giorni: carichi un cantiere vero lunedì, venerdì hai la prima fattura dal SAL.",
      },
    ],
  },
];
