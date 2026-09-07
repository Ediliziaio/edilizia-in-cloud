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
    coverImage: "/blog/covers/rapportino-di-cantiere-app-e-modello.jpg",
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
    coverImage: "/blog/covers/gestionale-cantiere-piccola-impresa-edile.jpg",
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
  {
    id: "sept-2026-ddt",
    slug: "ddt-cantiere-digitale",
    title: "DDT di Cantiere: Cos'è, Quando Serve e Come Farlo Digitale",
    excerpt:
      "Cos'è il DDT in edilizia, quando è obbligatorio, cosa deve contenere e come gestirlo dal telefono: dal fornitore al cantiere fino al margine di commessa.",
    category: "Gestione Cantieri",
    tags: ["DDT cantiere", "documento di trasporto", "materiali cantiere", "magazzino cantiere", "margine di commessa"],
    publishedAt: "2026-09-07",
    readTime: 9,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage: "/blog/covers/ddt-cantiere-digitale.jpg",
    content: [
      {
        type: "intro",
        body: "Il DDT è il documento più maltrattato del cantiere. Arriva con il camion del fornitore, lo firma chi c'è, finisce in tasca, sul cruscotto del furgone o sotto un sacco di cemento. Poi, a fine mese, arriva la fattura e nessuno sa più se quel materiale era tutto, se era quello ordinato e su quale cantiere è finito.\n\nEppure il documento di trasporto è il punto in cui il costo dei materiali — spesso metà del costo di un lavoro — entra o non entra nel margine della commessa. In questa guida vediamo cos'è, quando è obbligatorio, cosa deve contenere e come gestirlo in digitale senza aggiungere lavoro a chi sta in cantiere.",
      },
      {
        type: "section",
        heading: "Cos'è il DDT (documento di trasporto)",
        body: "Il DDT è il documento che accompagna la merce quando viaggia: dal fornitore al cantiere, dal tuo magazzino al cantiere, da un cantiere all'altro. È stato introdotto dal DPR 472/1996 al posto della vecchia bolla di accompagnamento, e da allora è il documento che prova cosa è partito, quando, da chi e verso dove.\n\nNon è una fattura e non ha bisogno del prezzo: serve a identificare la merce e il motivo del trasporto. La fattura arriva dopo, e se è «differita» — cioè emessa a fine mese per tutte le consegne del periodo — si regge proprio sui DDT.\n\nIn cantiere il DDT ha due direzioni. In entrata: il fornitore consegna sabbia, laterizi, serramenti, e il DDT è la tua unica prova di quanto è arrivato davvero. In uscita: sposti materiale dal tuo deposito al cantiere o restituisci merce, e il DDT giustifica il trasporto se ti fermano su strada e tiene in ordine il magazzino.",
      },
      {
        type: "section",
        heading: "Quando il DDT è obbligatorio",
        body: "Il DDT è obbligatorio ogni volta che la fattura non viaggia con la merce. Nella pratica edile succede quasi sempre: i fornitori fatturano a fine mese — la fatturazione differita, entro il 15 del mese successivo alla consegna, come prevede l'articolo 21 del DPR 633/1972 — e ogni consegna va coperta da un DDT.\n\nServe anche quando il trasporto non è una vendita: trasferimenti tra il tuo magazzino e il cantiere, merce data in conto lavorazione (per esempio il ferro da sagomare), resi al fornitore, noleggio di attrezzature, materiale del cliente che passa da te. In tutti questi casi il DDT dice perché quella merce sta viaggiando, e ti evita che un controllo la consideri una vendita senza fattura.\n\nNon serve, invece, se la fattura è immediata e accompagna la merce (la fattura accompagnatoria, che contiene gli stessi dati del DDT) o per il trasporto di beni propri che non sono merce, come gli attrezzi della squadra sul furgone.",
      },
      {
        type: "list",
        heading: "Cosa deve contenere un DDT: i campi obbligatori",
        items: [
          "Data di emissione e numero progressivo",
          "Dati di chi spedisce (cedente) e di chi riceve (cessionario): ragione sociale, indirizzo, partita IVA",
          "Descrizione della merce: natura, qualità e quantità (per esempio «laterizi forati 8x25x25, 12 bancali, 4.800 pezzi»)",
          "Causale del trasporto: vendita, conto lavorazione, trasferimento, reso, noleggio, comodato",
          "Chi effettua il trasporto: mittente, destinatario o vettore, con i dati del vettore se è un terzo",
          "Data e ora di inizio del trasporto, se diverse dalla data di emissione",
          "Luogo di destinazione, quando è diverso dalla sede del destinatario: nel nostro caso, l'indirizzo del cantiere",
          "Firma di chi riceve, con le eventuali riserve («merce non controllata», «2 bancali danneggiati»)",
        ],
      },
      {
        type: "section",
        heading: "DDT in entrata: il momento in cui perdi soldi senza accorgertene",
        body: "Quando il camion arriva, in cantiere ci sono tre domande da fare in trenta secondi. È tutto? È quello che ho ordinato? È per questo cantiere?\n\nSe nessuno le fa, la fattura di fine mese passa così com'è. Il fornitore ha consegnato 10 bancali invece di 12 e nessuno ha scritto la riserva sul DDT; il prezzo in fattura è diverso da quello dell'ordine e nessuno confronta; il materiale era per via Roma ma è stato scaricato a via Verdi, e il margine di due cantieri è sbagliato in direzioni opposte.\n\nIl DDT è l'unico documento che può bloccare questi errori, ma solo se viene letto quando conta: al momento della consegna e al momento della fattura. Un DDT firmato «con riserva» e fotografato vale in una contestazione; un DDT nel cruscotto del furgone non vale niente.",
      },
      {
        type: "section",
        heading: "DDT in uscita: il magazzino che non torna",
        body: "Se hai un deposito, ogni materiale che parte per un cantiere dovrebbe uscire con un DDT di trasferimento. Non perché lo chieda il fisco per forza — è merce tua che resta tua — ma perché è l'unico modo per sapere cosa c'è ancora in magazzino e cosa è già costo di un cantiere.\n\nSenza DDT interni succede la cosa classica: il magazzino sulla carta è pieno, quello vero è vuoto, e il costo dei materiali finisce spalmato a fine anno su tutte le commesse insieme. Il cantiere che ha consumato di più sembra in utile, quello che ha consumato poco sembra in perdita, e le decisioni le prendi sui numeri sbagliati.\n\nUn DDT di trasferimento con causale, quantità e cantiere di destinazione mette il costo dove deve stare, il giorno in cui la merce parte.",
      },
      {
        type: "section",
        heading: "Il DDT e il margine di commessa",
        body: "Nei lavori edili i materiali pesano tra il 40 e il 60 per cento del costo, a seconda della lavorazione. Vuol dire che se i DDT non entrano nella commessa il giorno della consegna, il margine che leggi è finto fino all'arrivo delle fatture — e spesso anche dopo, perché la fattura di fine mese copre più cantieri e va spezzata a mano.\n\nCollegare il DDT alla commessa risolve il problema alla radice: la quantità consegnata diventa costo previsto sul cantiere subito, la fattura poi lo conferma o lo corregge. Il titolare vede stasera che il cantiere di via Roma ha consumato più laterizi del computo, non a marzo.",
      },
      {
        type: "section",
        heading: "DDT digitale: come funziona davvero",
        body: "Fare il DDT «in digitale» non vuol dire scannerizzare un foglio e metterlo in una cartella. Vuol dire tre cose.\n\nPrima: il DDT del fornitore si fotografa dal telefono nel momento della consegna, con la firma e le riserve, e la foto è già agganciata al cantiere e all'ordine. Se il gestionale legge il documento in automatico — numero, data, fornitore, righe — non c'è nulla da ricopiare.\n\nSeconda: il DDT in uscita si emette dal telefono o dall'ufficio con numerazione progressiva, causale e destinazione, e scarica il magazzino da solo. Il PDF parte al destinatario e resta nell'archivio della commessa.\n\nTerza: quando arriva la fattura, il gestionale la confronta con i DDT del periodo: quantità, prezzi, cantiere. Le differenze saltano fuori prima di pagare, non dopo.\n\nLa conservazione? Il DDT è un documento contabile: va tenuto per dieci anni (articolo 2220 del codice civile). In digitale è più facile che in un faldone, a patto che il file sia integro, ordinato e ritrovabile per numero, data e fornitore.",
      },
      {
        type: "list",
        heading: "Gli errori più comuni con i DDT in cantiere",
        items: [
          "Firmare senza contare: senza riserva scritta, la quantità in fattura è quella che vale",
          "DDT senza cantiere di destinazione: il costo finisce sull'impresa, non sulla commessa",
          "Fattura pagata senza confronto con i DDT: differenze di prezzo e quantità passano tutte",
          "Materiale spostato tra cantieri senza documento: il margine di due commesse sbagliato in direzioni opposte",
          "DDT cartacei persi prima di arrivare in ufficio: a fine mese si ricostruisce a memoria",
          "Numerazione in uscita non progressiva o doppia: il primo controllo la trova subito",
        ],
      },
      {
        type: "table",
        heading: "DDT, fattura accompagnatoria, bolla e ordine: le differenze",
        headers: ["Documento", "Cosa fa", "Quando si usa", "Prezzo"],
        rows: [
          ["DDT (documento di trasporto)", "Accompagna la merce e giustifica il trasporto", "Fatturazione differita, trasferimenti, conto lavorazione, resi, noleggi", "Non obbligatorio"],
          ["Fattura accompagnatoria", "Fattura e documento di trasporto in uno", "Vendita con fattura immediata che viaggia con la merce", "Sì"],
          ["Bolla di accompagnamento", "Il vecchio documento di trasporto", "Non esiste più: sostituita dal DDT nel 1996 (DPR 472/1996)", "—"],
          ["Ordine di acquisto", "Impegna il fornitore su quantità e prezzi prima della consegna", "Prima di ogni fornitura importante: è il metro con cui leggi DDT e fattura", "Sì"],
        ],
      },
      {
        type: "callout",
        variant: "info",
        heading: "Come funziona in Edilizia in Cloud",
        body: "Il capocantiere fotografa il DDT del fornitore dal telefono; la lettura automatica estrae numero, data, righe e quantità e li aggancia all'ordine e alla commessa. Il DDT in uscita si emette in due tocchi con numerazione progressiva e scarica il magazzino di cantiere. Quando arriva la fattura elettronica, il confronto con i DDT segnala le differenze di quantità e prezzo prima del pagamento, e tutto resta nell'archivio della commessa per dieci anni.",
      },
      {
        type: "section",
        heading: "Da dove partire domani mattina",
        body: "Non serve cambiare tutto insieme. Tre passi, in ordine.\n\nUno: chi riceve la merce conta e scrive la riserva sul DDT, sempre. È una regola, non un software.\n\nDue: ogni DDT viene fotografato il giorno stesso e associato al cantiere, anche solo con il nome del cantiere nel titolo della foto se non hai ancora un gestionale.\n\nTre: nessuna fattura di materiali viene pagata senza il confronto con i DDT del mese. Il primo mese troverai differenze. Il secondo, il fornitore lo saprà.",
      },
      {
        type: "cta",
        heading: "Prova la gestione dei DDT dal telefono",
        body: "In Edilizia in Cloud i DDT si fotografano in cantiere, si leggono da soli e finiscono sulla commessa giusta. Hai 31 giorni di prova gratuita con setup incluso: carica i DDT di un cantiere vero e guarda quanto cambia il margine.",
      },
    ],
    faqs: [
      {
        q: "Il DDT è obbligatorio se trasporto il materiale con il mio furgone dal magazzino al cantiere?",
        a: "Se la merce è tua e resta tua non c'è una vendita, ma il DDT con causale «trasferimento» è comunque la strada giusta: giustifica il trasporto in caso di controllo su strada e scarica il magazzino sul cantiere di destinazione. Senza, il costo dei materiali non arriva mai alla commessa che li ha consumati.",
      },
      {
        q: "Nel DDT devo indicare il prezzo?",
        a: "No. Il DDT identifica la merce (natura, qualità, quantità), le parti e la causale del trasporto; il prezzo sta nella fattura. Molte imprese preferiscono non mostrarlo in cantiere, dove il documento passa per molte mani.",
      },
      {
        q: "Per quanto tempo vanno conservati i DDT?",
        a: "Dieci anni, come le altre scritture contabili (articolo 2220 del codice civile). La conservazione digitale è valida se i file sono integri, ordinati e ritrovabili; una foto ben fatta del DDT firmato, archiviata con numero, data e fornitore, è meglio di un faldone che nessuno apre.",
      },
      {
        q: "Che differenza c'è tra DDT e fattura accompagnatoria?",
        a: "La fattura accompagnatoria è una fattura immediata che viaggia con la merce e contiene anche i dati del trasporto: in quel caso il DDT non serve. Il DDT si usa quando la fattura arriva dopo, in genere a fine mese con la fatturazione differita, oppure quando il trasporto non è una vendita.",
      },
      {
        q: "Posso emettere il DDT dal telefono in cantiere?",
        a: "Sì. Un gestionale con app di cantiere emette il DDT in uscita con numerazione progressiva, causale, destinazione e firma, e produce il PDF da inviare. Per i DDT in entrata basta la foto: la lettura automatica estrae i dati e li aggancia a ordine e commessa.",
      },
    ],
  },
  {
    id: "sept-2026-geometra",
    slug: "gestionale-edilizia-per-geometra",
    title: "Gestionale Edilizia per Geometra: Cosa Serve Davvero",
    excerpt:
      "Cosa deve fare un gestionale edilizia per geometra: dal computo al preventivo, cantiere, SAL e fatture senza ricopiare. Quando basta lo studio e quando no.",
    category: "Digitalizzazione",
    tags: ["gestionale edilizia per geometra", "software geometra", "direzione lavori", "computo metrico", "gestionale impresa edile"],
    publishedAt: "2026-09-07",
    readTime: 8,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage: "/blog/covers/gestionale-edilizia-per-geometra.jpg",
    content: [
      {
        type: "intro",
        body: "Il geometra è la figura più «a cavallo» dell'edilizia italiana: fa il computo e la pratica, dirige i lavori, e sempre più spesso ha anche l'impresa che li esegue. Due mestieri in una persona, e di solito tre programmi che non si parlano: il software tecnico per computi e pratiche, un foglio Excel per i cantieri, il programma del commercialista per le fatture.\n\nUn gestionale edilizia per geometra serve a una cosa sola: far scendere il computo in cantiere e far risalire il cantiere nella fattura senza ricopiare niente. Vediamo cosa deve fare davvero, quando basta il software di studio e quando no, e come si prova senza cambiare abitudini in un giorno.",
      },
      {
        type: "section",
        heading: "Studio tecnico e impresa: due lavori che si parlano poco",
        body: "Il software di studio è nato per produrre documenti: computo metrico estimativo, elenco prezzi, capitolato, contabilità lavori a norma, pratica edilizia. Fa bene quel lavoro e per gli appalti pubblici è insostituibile.\n\nMa il documento finisce dove inizia il cantiere. Il computo dice quanti metri quadri di intonaco ci sono; non dice quante ore ci ha messo la squadra, quanti sacchi sono arrivati con il DDT, quanto margine resta dopo il subappaltatore degli impianti. E la fattura all'impresa, con il suo reverse charge, non ha niente a che vedere con la parcella dello studio.\n\nIl geometra che vive in mezzo — dirige i lavori per un committente, oppure esegue con la sua impresa quello che ha computato — si trova a ricopiare gli stessi numeri tre volte. È lì che nasce l'errore, ed è lì che un gestionale edile ha senso.",
      },
      {
        type: "list",
        heading: "Cosa deve fare un gestionale edilizia per un geometra: 7 requisiti",
        items: [
          "Importare il computo, non rifarlo: le voci del computo (da Excel o dal software tecnico) diventano righe del preventivo al cliente con il tuo margine, senza ricopiare",
          "Trasformare il preventivo in commessa: budget per fase, cronoprogramma, squadre e subappaltatori assegnati, il tutto dallo stesso documento",
          "Direzione lavori dal telefono: giornale dei lavori, libretto delle misure, foto datate, ordini di servizio e SAL prodotti dalle misure registrate in cantiere",
          "Documenti e scadenze per cantiere: notifica preliminare, POS, DURC dei subappaltatori, polizze, con avviso prima della scadenza",
          "Fatturazione elettronica dell'impresa separata dalla parcella: SDI diretto, reverse charge e split payment gestiti, fattura collegata alla commessa",
          "Più cantieri insieme, con i costi al cantiere giusto: ore, materiali e subappalti imputati alla commessa il giorno stesso, margine per cantiere leggibile la sera",
          "Un'app che regge in cantiere: rapportino, presenze e foto anche senza rete, con sincronizzazione dopo",
        ],
      },
      {
        type: "section",
        heading: "Il computo nasce nello studio, il margine nasce in cantiere",
        body: "Questa è la frase da tenere a mente quando valuti un software. Il computo metrico è un documento tecnico: quantità e prezzi di riferimento, spesso da prezzario regionale. Il margine è un fatto economico: quanto hai speso davvero per fare quelle quantità.\n\nTra i due ci sono le ore della squadra, i prezzi reali dei tuoi fornitori, i subappalti, gli imprevisti. Un gestionale edile per geometra vale se collega i due mondi: parte dal computo, applica i tuoi costi reali, e mentre il cantiere è aperto ti dice se la voce «intonaco» sta costando più di quanto avevi previsto. A consuntivo lo sai già; il valore è saperlo alla seconda settimana.",
      },
      {
        type: "table",
        heading: "Quando basta il software di studio e quando serve il gestionale",
        headers: ["Attività", "Software tecnico di studio", "Gestionale d'impresa"],
        rows: [
          ["Computo metrico e capitolato a norma", "Sì, è il suo mestiere", "Importa e riusa, non sostituisce il tecnico"],
          ["Pratiche edilizie (CILA, SCIA, permessi)", "Sì", "Solo scadenze e archivio documenti"],
          ["Preventivo al cliente con margine", "Parziale: prezzi di riferimento, non i tuoi costi", "Sì, dal computo con costi reali e margine"],
          ["Cantiere: rapportini, presenze, DDT, foto", "No", "Sì, dal telefono"],
          ["Giornale dei lavori, libretto delle misure, SAL", "Contabilità lavori a norma", "Sì, dalle misure registrate in cantiere, con SAL e fattura collegati"],
          ["Subappaltatori: contratti, DURC, pagamenti", "No", "Sì, con avvisi sulle scadenze"],
          ["Fatturazione elettronica e regimi IVA edili", "No", "Sì, nativa"],
          ["Margine per cantiere in tempo reale", "No", "Sì"],
        ],
      },
      {
        type: "section",
        heading: "Direzione lavori con il gestionale: giornale, misure, SAL",
        body: "Per chi dirige i lavori la parte più utile del gestionale è la catena giornale dei lavori → libretto delle misure → SAL. Ogni giorno in cantiere si registra cosa è stato fatto, con quali persone e mezzi, e le misure delle lavorazioni eseguite. Lo stato di avanzamento nasce da quelle misure, non da una stima a fine mese, e la fattura dell'impresa nasce dal SAL.\n\nIl vantaggio non è solo il tempo risparmiato. È che quando il committente contesta una quantità, hai la misura del giorno con la foto; quando il subappaltatore chiede il pagamento, hai il suo avanzamento reale; quando la direzione lavori esterna chiede il giornale, è già scritto. Le guide sul giornale dei lavori e sul libretto delle misure spiegano cosa devono contenere.",
      },
      {
        type: "section",
        heading: "Fatturazione: parcella e fatture d'impresa non si confondono",
        body: "Il geometra con l'impresa emette due tipi di documento che non hanno niente in comune: la parcella dello studio, con cassa previdenziale e ritenuta, e la fattura elettronica dell'impresa, con il reverse charge quando lavora in subappalto e lo split payment quando lavora per la pubblica amministrazione.\n\nIl gestionale d'impresa serve al secondo tipo: fatture collegate alla commessa e al SAL, inviate a SDI senza passare da un altro programma, con la scadenza che entra nello scadenzario e l'incasso che aggiorna il margine. La parcella dello studio resta nel suo mondo; mescolare i due è il modo più rapido per confondere il commercialista e sbagliare l'IVA.",
      },
      {
        type: "section",
        heading: "Quanto costa e come si prova senza stravolgere lo studio",
        body: "Il modo giusto di provare un gestionale edile, per un geometra, è partire da un cantiere solo: importa il computo di una commessa reale, trasformalo in preventivo con i tuoi costi, apri il cantiere e fai registrare al capocantiere rapportini e presenze per due settimane. Alla fine confronti il margine che vedi con quello che immaginavi. Se la differenza ti sorprende, il software ha già fatto il suo lavoro.\n\nEdilizia in Cloud si prova per 31 giorni con setup e migrazione dati inclusi, senza carta di credito; il piano Scopri è gratuito per sempre fino a tre commesse attive, e i piani superiori si definiscono in una consulenza gratuita. Il confronto con gli altri software del mercato, prezzi pubblici compresi, è nell'articolo sui [migliori software gestionali per l'edilizia](/blog/migliori-software-gestionali-edilizia-confronto/).",
      },
      {
        type: "callout",
        variant: "info",
        heading: "Come funziona in Edilizia in Cloud",
        body: "Il computo si importa da Excel o dal software tecnico e diventa preventivo con i tuoi costi e il tuo margine; il preventivo firmato diventa commessa con fasi e budget; in cantiere si registrano rapportini, presenze, misure e DDT dal telefono; SAL e fatture elettroniche nascono da lì, con reverse charge e split payment gestiti. Il margine di ogni cantiere si legge la sera stessa.",
      },
      {
        type: "cta",
        heading: "Prova il gestionale con un cantiere vero",
        body: "Importa un computo, apri la commessa e fai registrare due settimane di cantiere alla squadra. 31 giorni gratis, setup incluso, nessun vincolo: se il margine che vedi non ti dice niente di nuovo, non paghi nulla.",
      },
    ],
    faqs: [
      {
        q: "Un geometra ha bisogno di un gestionale o basta il software di computo?",
        a: "Dipende da cosa fa dopo il computo. Se lo studio produce solo documenti tecnici e pratiche, il software di computo basta. Se il geometra dirige i lavori con SAL e misure da tenere, o ha un'impresa che esegue, serve un gestionale: il computo resta nel software tecnico, ma preventivo con margine, cantiere, subappalti e fatture elettroniche vivono nel gestionale, senza ricopiare.",
      },
      {
        q: "Posso importare il computo fatto con il software tecnico nel gestionale?",
        a: "Sì, da Excel o dai formati di esportazione del software tecnico: le voci diventano righe del preventivo con quantità e prezzi, a cui applichi i tuoi costi reali e il margine. Il computo a norma continua a vivere nel software tecnico; nel gestionale entra la copia che serve a fare il prezzo e a seguire il cantiere.",
      },
      {
        q: "Il gestionale fa anche la contabilità lavori per gli appalti pubblici?",
        a: "Produce SAL e stati di avanzamento dalle misure registrate in cantiere, con il libretto delle misure e il giornale dei lavori. Per gli appalti pubblici con contabilità regolamentata nei formati richiesti dalla stazione appaltante, il documento ufficiale resta di norma nel software tecnico; il gestionale serve a sapere in tempo reale dove sta il cantiere e a fatturare senza doppi inserimenti.",
      },
      {
        q: "La parcella dello studio si fa dal gestionale d'impresa?",
        a: "No, e non conviene: parcella con cassa previdenziale e ritenuta e fattura elettronica dell'impresa hanno regole diverse. Il gestionale d'impresa fattura i lavori (con reverse charge e split payment dove servono); la parcella resta nello strumento dello studio o del commercialista.",
      },
      {
        q: "Quanto tempo serve a un geometra per partire con Edilizia in Cloud?",
        a: "Il setup si fa insieme in 48 ore: listino, anagrafiche, un computo importato e un cantiere aperto. Le prime due settimane di rapportini e presenze bastano per leggere il primo margine reale; la prova dura 31 giorni proprio per arrivare a quel confronto con calma.",
      },
    ],
  },
  {
    id: "sept-2026-computo-software",
    slug: "software-computo-metrico",
    title: "Software Computo Metrico: Quale Scegliere nel 2026",
    excerpt:
      "Software tecnico, Excel o gestionale con computo integrato? Cosa deve fare un software per computo metrico, quanto costa e quando diventa preventivo.",
    category: "Digitalizzazione",
    tags: ["software computo metrico", "computo metrico estimativo", "prezzario", "preventivo edile", "gestionale edilizia"],
    publishedAt: "2026-09-07",
    readTime: 8,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage: "/blog/covers/software-computo-metrico.jpg",
    content: [
      {
        type: "intro",
        body: "«Software computo metrico» è una ricerca che fanno tre persone diverse: il tecnico che deve consegnare un computo a norma per un appalto, il titolare che vuole smettere di fare i preventivi su Excel, e il geometra che sta in mezzo. Le risposte giuste sono tre, e il primo errore è comprare il software di uno per fare il lavoro dell'altro.\n\nQui mettiamo in fila cosa deve fare davvero un software per computo metrico, le tre famiglie di prodotti che esistono sul mercato italiano — con quello che dichiarano e quanto costano quando il prezzo è pubblico — e le cinque domande per scegliere senza pentirsene.",
      },
      {
        type: "list",
        heading: "Cosa deve fare un software per computo metrico: 8 requisiti",
        items: [
          "Prezzari regionali importabili con il codice ufficiale, e voci tue con costo, margine e prezzo",
          "Misure con formule e disegno delle quantità (lunghezze, superfici, volumi), non numeri battuti a mano",
          "Struttura per capitoli e categorie di lavoro, così il computo si legge e si confronta",
          "Analisi prezzi: da cosa è composta ogni voce (manodopera, materiali, noli), altrimenti il margine è un'ipotesi",
          "Revisione prezzi e varianti senza rifare il documento da capo",
          "Esportazione in Excel e PDF e nei formati che il committente chiede",
          "Passaggio al preventivo per il cliente con i tuoi costi reali, e da lì alla commessa",
          "Contabilità lavori collegata: SAL e stati di avanzamento che partono dalle stesse voci del computo",
        ],
      },
      {
        type: "table",
        heading: "Le tre famiglie di software per il computo metrico (settembre 2026)",
        headers: ["Famiglia", "Per chi", "Cosa fa bene", "Dove si ferma", "Costo dichiarato"],
        rows: [
          ["Software tecnico di computo e contabilità lavori (PriMus di ACCA e simili)", "Studi tecnici, imprese di appalti pubblici", "Computo a norma, prezzari, analisi prezzi, contabilità lavori nei formati che le stazioni appaltanti conoscono", "Non amministra l'impresa: niente preventivo con margine reale, cantiere, DDT, fatture elettroniche", "PriMus: listino a richiesta, versione gratuita per 30 giorni"],
          ["Excel e strumenti gratuiti online", "Chi parte da zero, piccoli lavori", "Costa nulla, tutti lo sanno usare", "Nessun prezzario integrato, formule che si rompono, versioni del file che si moltiplicano, zero collegamento con cantiere e fatture", "Gratis"],
          ["Gestionale edile con computo e preventivo integrati", "Imprese edili da 1 a 50 dipendenti", "Computo o preventivo con costi reali → commessa → cantiere → SAL → fattura, un solo inserimento", "Non produce la contabilità lavori regolamentata degli appalti pubblici: per quella si affianca il software tecnico", "Edilizia in Cloud: piano Scopri gratis, piani superiori su preventivo, prova 31 giorni; altri su preventivo"],
        ],
      },
      {
        type: "section",
        heading: "Quando serve un software tecnico come PriMus (e quando no)",
        body: "Se partecipi ad appalti pubblici, il computo, l'elenco prezzi e la contabilità lavori devono arrivare alla stazione appaltante nel formato che si aspetta, con le regole del codice dei contratti: lì il software tecnico è lo standard di fatto, la direzione lavori lo usa e i file girano tra le parti senza conversioni. Lo stesso vale per chi lavora con studi di progettazione che consegnano computi da rispettare alla voce.\n\nSe invece fai lavori privati — ristrutturazioni, serramenti, impianti, coperture — il computo a norma non lo chiede nessuno. Il cliente vuole un preventivo chiaro e tu vuoi sapere quanto ci guadagni: un software di computo tecnico ti dà quantità e prezzi di riferimento, ma non i tuoi costi, non il cantiere, non la fattura. Il [confronto diretto con PriMus](/confronto/vs-primus) spiega dove finisce uno e dove comincia l'altro.",
      },
      {
        type: "section",
        heading: "Excel e strumenti gratuiti: fin dove arrivano",
        body: "Per i primi lavori Excel va benissimo: una colonna di voci, quantità, prezzo unitario, totale. Il problema non è il primo computo, è il ventesimo. Le formule si rompono quando qualcuno inserisce una riga, i prezzi restano quelli dell'anno scorso, il file «preventivo_definitivo_v3_finale» vive in tre versioni su tre computer, e nulla di quello che c'è dentro arriva in cantiere o in fattura.\n\nGli strumenti gratuiti online risolvono un pezzo — spesso il prezzario o il calcolo — e si fermano al PDF. Nella guida al [computo metrico gratis](/blog/computo-metrico-gratis/) trovi cosa funziona davvero e i punti in cui ogni strumento gratuito si rompe.",
      },
      {
        type: "section",
        heading: "Il computo dentro il gestionale: dal computo al margine",
        body: "La terza famiglia ragiona al contrario: parte dal cantiere. Il computo — importato dal software tecnico o costruito con il listino dell'impresa — diventa preventivo con i tuoi costi reali di manodopera, materiali e subappalti, quindi con il margine che ti aspetti. Il preventivo firmato diventa commessa con budget per fase; in cantiere si registrano ore, DDT e misure; il SAL e la fattura nascono dalle stesse voci.\n\nIl vantaggio non è «avere tutto in un posto», è che ogni numero viene inserito una volta sola, e che il margine per voce si legge mentre il cantiere è aperto: se l'intonaco sta costando più del computo lo sai alla seconda settimana. Come funziona la parte di computo e preventivo in Edilizia in Cloud è descritto nella pagina del [computo metrico](/funzionalita/computo-metrico/); la guida pratica su come si costruisce un computo, voce per voce, è nel [computo metrico estimativo](/blog/computo-metrico-estimativo-guida/).",
      },
      {
        type: "list",
        heading: "Come scegliere: le 5 domande da fare prima di comprare",
        items: [
          "Chi deve leggere il computo? Se è una stazione appaltante, serve il software tecnico; se è un cliente privato, serve un preventivo con margine",
          "Da dove arrivano i prezzi? Prezzario regionale importabile con codice, listino dell'impresa, o entrambi: e con che frequenza si aggiornano",
          "Cosa succede dopo il computo? Se resta un PDF, il software si ferma lì; se deve diventare commessa e fattura, vuoi un solo inserimento",
          "Chi lo usa? Un tecnico in ufficio o anche il capocantiere dal telefono: la seconda risposta cambia la scelta",
          "Quanto costa il primo anno, con tutte le persone dentro? Licenza per postazione, moduli separati o utenti illimitati fanno differenze grandi appena la squadra cresce",
        ],
      },
      {
        type: "callout",
        variant: "info",
        heading: "Come funziona in Edilizia in Cloud",
        body: "Il computo si importa da Excel o dal software tecnico oppure si costruisce dal listino con i prezzari regionali; ogni voce ha costo, margine e prezzo. Con una foto o una descrizione l'assistente AI propone le voci dal tuo catalogo. Il preventivo firmato diventa commessa, il cantiere registra ore e materiali, e il margine per voce si legge mentre i lavori sono aperti.",
      },
      {
        type: "cta",
        heading: "Prova il computo che arriva fino alla fattura",
        body: "Carica un computo vero, trasformalo in preventivo con i tuoi costi e aprilo come commessa. 31 giorni gratis, setup incluso, nessun vincolo: alla fine confronti il margine che vedi con quello che immaginavi.",
      },
    ],
    faqs: [
      {
        q: "Qual è il miglior software per computo metrico?",
        a: "Dipende da chi legge il computo. Per appalti pubblici e contabilità lavori a norma il riferimento in Italia è un software tecnico come PriMus di ACCA (listino a richiesta, 30 giorni gratis). Per un'impresa che fa lavori privati e vuole sapere quanto guadagna, serve un gestionale con computo e preventivo integrati, dove il computo diventa commessa e fattura senza ricopiare: Edilizia in Cloud parte da un piano gratuito. Excel resta la scelta per i primissimi lavori, finché il ventesimo file non si rompe.",
      },
      {
        q: "Un software di computo metrico include i prezzari regionali?",
        a: "I software tecnici li includono o li collegano con il codice ufficiale; i gestionali seri li importano da Excel o PDF con il codice e li affiancano al listino dell'impresa. Per i lavori privati il prezzario è un riferimento, non un prezzo: conta il costo reale di manodopera e fornitori, che solo il gestionale conosce.",
      },
      {
        q: "Posso fare il computo metrico con Excel?",
        a: "Sì per i primi lavori, con una tabella di voci, quantità e prezzi. Diventa un problema quando i computi si moltiplicano: formule che si rompono, prezzi vecchi, versioni del file su più computer e nessun collegamento con cantiere e fatture. Quando ricopi lo stesso computo in un preventivo e poi in una fattura, è il momento di cambiare.",
      },
      {
        q: "Il gestionale sostituisce PriMus per gli appalti pubblici?",
        a: "No. Per la contabilità lavori regolamentata nei formati che le stazioni appaltanti chiedono, il software tecnico resta lo standard. Il gestionale lo affianca: importa il computo, lo trasforma in preventivo e commessa, segue il cantiere e fattura. Le due cose convivono, ognuna nel suo mestiere.",
      },
      {
        q: "Quanto costa un software per computo metrico?",
        a: "A settembre 2026: Excel è gratis; PriMus di ACCA ha un listino a richiesta con 30 giorni di prova gratuita; Edilizia in Cloud ha un piano Scopri gratuito per sempre (fino a tre commesse attive) e piani superiori su preventivo dopo 31 giorni di prova. Il criterio giusto non è il prezzo del primo mese ma il costo del primo anno con tutte le persone dentro e il tempo che risparmi non ricopiando i numeri.",
      },
    ],
  },
];
