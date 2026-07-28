import { FLO_AVATAR } from "./blogAuthor";
import type { BlogPost } from "./blogPosts";

/**
 * Cluster PILLAR "Gestione" — articoli per chi NON sta cercando un gestionale.
 * Il concorrente vero di 8 imprese edili su 10 non è un altro software:
 * è "commercialista + Excel + WhatsApp + memoria". Questi due pezzi
 * intercettano quel lettore prima che sappia di avere un problema.
 *
 * Regole editoriali: metodo dolore → agitazione → soluzione, "tu" singolare,
 * frasi corte, tono cantiere. Zero cifre di listino (il sito non pubblica i
 * prezzi): si cita solo piano gratuito, 31 giorni di prova e preventivo su
 * misura. Nei body "\n\n" separa i paragrafi, [testo](/percorso) è un link
 * interno. Le immagini puntano solo a file già presenti in public/blog/covers/.
 */
export const blogPostsPillarGestione: BlogPost[] = [
  {
    id: "p1",
    slug: "chi-gestisce-i-numeri-impresa-edile",
    title: "Chi controlla davvero i numeri della tua impresa edile?",
    excerpt:
      "Il commercialista chiude i bilanci, non controlla i margini a cantieri aperti. I 4 numeri che ti servono ogni settimana e come tenerli da solo.",
    category: "Finanza",
    tags: [
      "controllo di gestione impresa edile",
      "chi gestisce i conti impresa edile",
      "margine commessa",
      "cassa impresa edile",
    ],
    publishedAt: "2026-07-25",
    readTime: 13,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/chi-gestisce-i-numeri-impresa-edile.jpg",
    content: [
      {
        type: "intro",
        body: "Chiedi al commercialista come sta andando l'anno. Ti risponde a maggio, con il bilancio di quello prima. E intanto tu hai quattro cantieri aperti.\n\nIl controllo di gestione di un'impresa edile non lo fa il commercialista. Lui certifica il passato per il fisco. Il controllo di gestione guarda il presente. Margine di ogni commessa aperta, cassa dei prossimi 90 giorni, ore mai fatturate. Se non se ne occupa nessuno in azienda, non lo fa nessuno.",
      },
      {
        type: "section",
        heading: "Il commercialista fa un altro mestiere (e lo fa bene)",
        body: "Non è un attacco al tuo commercialista. Fa esattamente quello per cui lo paghi.\n\nIl suo lavoro è chiudere l'anno, calcolare le imposte, tenere l'azienda in regola davanti all'Agenzia delle Entrate. Lavora su fatture emesse, fatture ricevute e movimenti bancari. Cioè su documenti che nascono dopo, quando il lavoro è già finito e i soldi sono già usciti.\n\nIl problema è un altro. Tu pensi che, siccome «i conti li tiene il commercialista», qualcuno stia guardando i margini. Non è così. Nessuno sta guardando i margini mentre i cantieri sono aperti.\n\nÈ come avere un collaudatore bravissimo e nessun capocantiere. Il collaudo ti dice se il muro è storto. Non ti impedisce di tirarlo su storto.",
      },
      {
        type: "table",
        heading: "Chi fa cosa con i numeri della tua impresa",
        headers: ["Ruolo", "Cosa fa davvero", "Con che tempistica", "Su quali dati lavora"],
        rows: [
          [
            "Commercialista",
            "Bilancio, dichiarazioni, imposte. Certifica il passato per il fisco",
            "A consuntivo, spesso 4-6 mesi dopo la chiusura",
            "Fatture emesse e ricevute, movimenti bancari",
          ],
          [
            "Consulente del lavoro",
            "Buste paga, contributi, Cassa Edile, adempimenti CCNL",
            "Mensile, sul mese appena chiuso",
            "Le presenze che gli mandi tu, contratti, assunzioni",
          ],
          [
            "Controllo di gestione",
            "Margine per commessa, cassa prospettica, scostamenti, ore non fatturate",
            "Settimanale o quindicinale, a cantieri aperti",
            "Ore per commessa, materiali, noli, subappalti, SAL, preventivo firmato",
          ],
          [
            "Il titolare (di fatto, oggi)",
            "Tiene tutto a memoria e decide a naso",
            "Quando scoppia il problema",
            "Ricordi, chat, un foglio Excel aggiornato quando c'è tempo",
          ],
        ],
      },
      {
        type: "section",
        heading: "Tre ruoli, tre orologi diversi",
        body: "Guarda la colonna delle tempistiche. Il buco è tutto lì.\n\nIl commercialista lavora a mesi di distanza. Il consulente del lavoro lavora sul mese appena chiuso. Il controllo di gestione dovrebbe lavorare su questa settimana.\n\nUn cantiere da tre mesi comincia a perdere soldi nella seconda settimana. Se il primo segnale arriva a maggio dell'anno dopo, hai perso quattordici mesi. Il cantiere è chiuso, la squadra è altrove, il cliente ha già pagato il saldo.\n\nNon puoi recuperare margine su un lavoro finito. Puoi solo prenderne atto e scrivertelo da qualche parte.",
      },
      {
        type: "callout",
        variant: "warning",
        heading: "I 3 segnali che stai navigando a vista",
        body: "Se ti riconosci in almeno due, non hai un problema di conti. Hai un problema di orologio.",
        items: [
          "Non sai dire, senza aprire nessun file, quanto stai guadagnando sul cantiere più grosso che hai aperto adesso.",
          "Scopri se un lavoro è andato bene solo quando incassi l'ultima fattura.",
          "Per sapere quanto avrai in cassa fra due mesi ti devi mettere a fare i conti a mano.",
        ],
      },
      {
        type: "section",
        heading: "La scena del bilancio di maggio",
        body: "Va più o meno così, ogni anno.\n\nA maggio arrivi in studio. Il commercialista ti stampa il bilancio dell'anno prima. Utile: quarantaduemila euro su un milione e quattro di fatturato. Tu te ne aspettavi il doppio.\n\nGli chiedi dove sono finiti i soldi. Lui apre il conto economico e ti mostra i costi per categoria. Materiali, personale, servizi, noli. Tutto corretto, tutto certificato, tutto inutile per quello che ti serve.\n\nPerché tu non hai chiesto quanto hai speso in materiali. Tu volevi sapere quale cantiere te li ha mangiati.\n\nQuella risposta nel bilancio non c'è e non ci sarà mai. Il bilancio somma tutta l'azienda in un numero solo. I sei cantieri dell'anno prima diventano un impasto unico. Quello che ha reso il 22% e quello che ha chiuso sotto zero si annullano a vicenda, e tu non lo saprai mai.\n\nEsci dallo studio con un utile in mano e senza una spiegazione. Poi il ciclo ricomincia, uguale.",
      },
      {
        type: "section",
        heading: "I 4 numeri che nessuno ti dice",
        body: "Il controllo di gestione di un'impresa edile sta in quattro numeri. Non ne servono cinquanta, non serve un cruscotto pieno di grafici.\n\nSono quattro numeri che il commercialista non può darti, perché nascono in cantiere e non in fattura. Devono uscire dalla tua azienda, non dal suo studio.",
      },
      {
        type: "list",
        heading: "I quattro numeri, in ordine di importanza",
        items: [
          "Margine della commessa aperta: quanto stai guadagnando adesso su ogni cantiere in corso, non a lavori finiti",
          "Cassa a 90 giorni: quanto entra e quanto esce nelle prossime dodici settimane, con le date vere",
          "Ore lavorate e mai fatturate: il lavoro che hai regalato senza accorgertene",
          "Scostamento preventivo-consuntivo: di quanto hai sbagliato la stima, voce per voce",
        ],
      },
      {
        type: "image",
        src: "/blog/covers/analisi-margini-imprese-edili.jpg",
        alt: "Controllo di gestione in un'impresa edile: margine di commessa monitorato a cantieri aperti",
        caption: "Il margine si difende mentre il cantiere è aperto. Dopo il saldo si può solo raccontare.",
      },
      {
        type: "section",
        heading: "1. Margine della commessa aperta",
        body: "È il numero che conta di più e quasi nessuno ha.\n\nSi calcola così: quanto hai maturato su quel cantiere, meno le ore realmente lavorate, meno i materiali usciti dal magazzino, meno noli e subappalti. Poi lo confronti con il margine che avevi messo nel preventivo.\n\nSe lo guardi ogni lunedì, un cantiere che scivola te lo dice in tre settimane. Hai ancora spazio per rifare la squadra, fermare un ordine, chiedere la variante prima di eseguirla.\n\nSe lo guardi a fine lavori, hai solo un numero da rimpiangere. La differenza tra le due cose è tutta qui: nel primo caso decidi, nel secondo subisci.\n\nSu come si leggono davvero questi numeri abbiamo scritto un pezzo a parte: [analisi dei margini in un'impresa edile](/blog/analisi-margini-imprese-edili).",
      },
      {
        type: "section",
        heading: "2. Cassa a 90 giorni",
        body: "Un'impresa edile quasi mai chiude per mancanza di lavoro. Chiude perché in un mese storto non ha i soldi per pagare le buste paga.\n\nIl numero da avere è semplice. Quanto entra e quanto esce nelle prossime dodici settimane. Fatture da incassare con le date vere, non con quelle sperate. Fornitori, stipendi, F24, rate dei mezzi, ritenute.\n\nQuasi tutte le imprese scoprono il problema a due settimane di distanza. Troppo tardi per fare qualcosa di elegante, e allora si chiama la banca di corsa.\n\nCon 90 giorni davanti hai tempo. Puoi anticipare una fattura, spostare un ordine, sollecitare un cliente lento, parlare col direttore prima di averne bisogno.\n\nSe la cassa non ti torna mai e non capisci perché, il motivo di solito è sempre lo stesso: [perché la cassa di un'impresa edile non torna](/blog/cassa-impresa-edile-non-torna).",
      },
      {
        type: "section",
        heading: "3. Ore lavorate e mai fatturate",
        body: "Questo è il buco più silenzioso di tutti, perché non lascia tracce.\n\nUn operaio torna in cantiere il sabato per finire una cosa. Il capo squadra manda due uomini a sistemare un dettaglio chiesto dal cliente a voce. Nessuno apre una variante. Nessuno segna niente da nessuna parte.\n\nA fine anno quelle ore ci sono, eccome. Sono dentro il costo del personale. Nel fatturato invece non ci sono.\n\nIl calcolo è banale, se registri le ore per commessa. Ore totali meno ore coperte da preventivo o da variante firmata. Quello che resta è lavoro regalato.\n\nFai il conto sulla tua azienda. Dieci persone, due ore a settimana a testa, quarantotto settimane: sono quasi mille ore. Moltiplicale per il tuo costo orario pieno e guarda il numero che esce. È il tuo utile, uscito dalla porta di servizio.",
      },
      {
        type: "section",
        heading: "4. Scostamento preventivo-consuntivo",
        body: "È l'unico numero che ti insegna a fare preventivi migliori. Gli altri tre difendono i soldi di oggi, questo difende quelli dell'anno prossimo.\n\nA fine commessa metti il preventivo firmato accanto al consuntivo reale. Voce per voce, non solo il totale. Dove hai sbagliato la stima? Manodopera? Ponteggi? Smaltimento? Trasferte?\n\nFallo su dieci lavori di fila e vedrai uscire un ritmo. Quasi sempre sbagli la stessa voce, sempre nella stessa direzione, sempre della stessa percentuale.\n\nDa quel momento il tuo preventivo non è più fatto a naso. È fatto sui tuoi numeri, non su quelli del prezzario.\n\nE si sente in trattativa. Chi conosce il proprio consuntivo tratta con calma, perché sa esattamente dove può scendere e dove no.",
      },
      {
        type: "section",
        heading: "Come costruisci un controllo minimo senza assumere nessuno",
        body: "Non ti serve un controller. Ti servono un'ora fissa a settimana e tre regole rispettate sempre.\n\nPrima regola: le ore si registrano per commessa, non per mese. «Ottanta ore a marzo» non ti dice niente. «Ottanta ore sul cantiere Rossi» ti dice tutto. Se non hai il dato per cantiere non hai niente, perché tutti gli altri numeri poggiano su questo.\n\nSeconda regola: ogni costo ha sopra il nome di un cantiere. Fattura fornitore, nolo della piattaforma, DDT, trasferta, discarica. Se non sai a quale commessa attribuirlo, chiedilo il giorno stesso, non sei mesi dopo quando nessuno ricorda più niente. È il senso stesso della [gestione per commessa](/funzionalita/gestione-commesse/).\n\nTerza regola: il lunedì mattina si guardano i numeri. Un'ora, sempre quella, prima che cominci a squillare il telefono. Non «quando c'è tempo», perché tempo non ce n'è mai e lo sai.\n\nCon queste tre regole hai già la gran parte del controllo di gestione che serve a un'impresa edile da 5 a 30 persone. Tutto il resto è raffinatezza.",
      },
      {
        type: "table",
        heading: "Il controllo minimo: cosa guardi e ogni quanto",
        headers: ["Numero", "Ogni quanto", "Da dove lo prendi", "Quando accendere la spia"],
        rows: [
          [
            "Margine della commessa aperta",
            "Ogni lunedì",
            "Ore registrate + materiali + noli + subappalti, contro il preventivo",
            "Scende sotto due terzi del margine previsto",
          ],
          [
            "Cassa a 90 giorni",
            "Ogni quindici giorni",
            "Fatture da incassare, scadenze fornitori, stipendi, F24, rate",
            "Una sola settimana chiude sotto zero",
          ],
          [
            "Ore non fatturate",
            "A fine mese",
            "Ore registrate meno ore coperte da preventivo o variante firmata",
            "Superi il 5% delle ore totali del mese",
          ],
          [
            "Scostamento preventivo-consuntivo",
            "A ogni commessa chiusa",
            "Consuntivo reale contro preventivo firmato, voce per voce",
            "Oltre dieci punti di differenza sul margine",
          ],
        ],
      },
      {
        type: "callout",
        variant: "info",
        heading: "L'ora del lunedì: cosa guardare in 60 minuti",
        body: "Non serve un rito complicato. Serve che sia sempre lo stesso e che non salti mai.",
        items: [
          "Dieci minuti: margine di ogni cantiere aperto, in fila, dal più grosso al più piccolo",
          "Dieci minuti: le tre commesse che si sono mosse di più rispetto a lunedì scorso",
          "Quindici minuti: incassi attesi e uscite delle prossime quattro settimane",
          "Dieci minuti: ore della settimana precedente, e quali non sono coperte da niente",
          "Quindici minuti: decidi due cose e scrivile. Senza decisione, l'ora è persa",
          "Se questi numeri stanno già insieme in un [cruscotto aziendale](/funzionalita/cruscotto-aziendale/), l'ora diventa venti minuti",
        ],
      },
      {
        type: "section",
        heading: "Quando serve un software e quando basta un metodo",
        body: "Domanda onesta, risposta onesta.\n\nSe hai uno o due cantieri per volta e lavori con due persone, un foglio tenuto bene basta. Il metodo conta più dello strumento. Chi compra un gestionale senza avere il metodo si ritrova un archivio vuoto e la sensazione di aver buttato dei soldi.\n\nIl foglio smette di bastare quando succede una di queste cose. I cantieri aperti diventano più di tre. Le persone in cantiere diventano più di cinque. Le ore le registra qualcun altro al posto tuo. I costi arrivano da fornitori diversi in giorni diversi.\n\nA quel punto il problema non è più fare il conto. È tenere aggiornato il conto. E un dato che arriva con dieci giorni di ritardo non è un dato: è un ricordo.\n\nLì serve uno strumento che raccolga i numeri da solo mentre lavori. Ore timbrate dal cantiere, costi agganciati alla commessa nel momento in cui arrivano, [margine che si aggiorna da sé](/funzionalita/margini-cantiere/). Non per avere grafici belli da mostrare in banca. Per non dover ricostruire niente il lunedì mattina.",
      },
      {
        type: "section",
        heading: "Le quattro obiezioni che sento sempre",
        body: "«Io i miei numeri li so a memoria». Li sai finché i cantieri sono due. Al quarto la memoria smette di essere un archivio e diventa una scommessa. E soprattutto non la puoi delegare a nessuno.\n\n«Non ho tempo per queste cose». Il tempo lo stai già spendendo, solo in un altro momento e con meno gusto. Lo spendi a maggio in studio dal commercialista e le sere in cui provi a capire dove sono finiti i soldi di un lavoro chiuso. Un'ora prima costa sempre meno di una giornata dopo.\n\n«Tanto alla fine i conti tornano». Tornano sull'anno intero, perché i cantieri buoni coprono quelli storti. Il problema è che senza il dettaglio non sai quali sono i buoni. Così continui a inseguire il tipo di lavoro che ti fa perdere soldi, convinto che sia il tuo pane.\n\n«Ci penserà mio figlio quando entra in azienda». Entrerà in un'azienda dove nessuno sa quanto rende un cantiere. Gli stai lasciando il fatturato e non il metodo per difenderlo.",
      },
      {
        type: "section",
        heading: "Chi deve tenere in mano questo lavoro",
        body: "Nelle imprese da 5 a 30 persone la risposta è quasi sempre una sola: tu.\n\nNon perché sei il più bravo con i numeri. Perché sei l'unico che può decidere qualcosa dopo averli letti. Un impiegato può preparare i dati e tenerli in ordine. La decisione di fermare un cantiere che perde la prendi tu, e la prendi solo se hai guardato.\n\nQuando l'azienda cresce puoi passare la preparazione all'amministrazione. La lettura resta tua, sempre. Un titolare che non sa dire a memoria come sta andando la commessa più grossa non sta guidando l'azienda: la sta accompagnando dove vuole andare lei.\n\nE se ti sembra tempo tolto al cantiere, fai il conto al contrario. Quanto ti è costato l'ultimo lavoro andato male che hai scoperto troppo tardi? Quell'ora del lunedì costa molto meno.",
      },
      {
        type: "section",
        heading: "Se la risposta è nessuno",
        body: "Nella maggior parte delle imprese edili i numeri li tiene il titolare, la sera, quando ha finito tutto il resto. Non è un problema di volontà: controllare la gestione è un lavoro pieno, e chi guida i cantieri quelle ore non ce le ha.\n\nAssumere un controller interno costa, e sotto una certa dimensione non si giustifica. La via di mezzo esiste: [Numeri in Edilizia](https://www.numerinedilizia.com/) porta il controllo di gestione dentro l'impresa come servizio, senza scaricartelo sulle spalle.",
      },
      {
        type: "cta",
        heading: "Vuoi vedere i tuoi margini mentre i cantieri sono ancora aperti?",
        body: "Edilizia in Cloud tiene insieme ore, costi, commesse e cassa, e ti mostra il margine di ogni cantiere aggiornato giorno per giorno. Puoi partire dal piano gratuito, provare tutto per 31 giorni e farti fare un preventivo su misura in una consulenza gratuita, dopo aver visto i tuoi numeri veri.",
      },
    ],
    faqs: [
      {
        q: "Il commercialista può farmi il controllo di gestione?",
        a: "Di norma no, e non perché non sia capace. Il commercialista lavora su fatture e movimenti bancari, cioè su dati che arrivano dopo la fine del lavoro. Il controllo di gestione ha bisogno di ore per commessa, materiali usciti e stato di avanzamento: dati che nascono in cantiere e che solo tu puoi raccogliere. Alcuni studi offrono il servizio a parte, ma i dati glieli devi passare comunque tu.",
      },
      {
        q: "Ogni quanto devo guardare i numeri della mia impresa edile?",
        a: "Una volta a settimana per i margini delle commesse aperte, ogni quindici giorni per la cassa. Il mese è troppo lungo: un cantiere che perde brucia margine in due settimane e a fine mese la frittata è fatta. Meglio un'ora fissa ogni lunedì che una mezza giornata di analisi ogni tre mesi, quando non puoi più correggere niente.",
      },
      {
        q: "Qual è il numero più importante da controllare in edilizia?",
        a: "Il margine della commessa aperta. È l'unico che ti dice se stai guadagnando adesso, mentre puoi ancora intervenire su squadra, ordini e varianti. Fatturato e utile di bilancio arrivano troppo tardi e mescolano insieme cantieri buoni e cantieri disastrosi, quindi ti dicono come è andato l'anno ma non ti fanno cambiare niente.",
      },
      {
        q: "Serve per forza un software per il controllo di gestione?",
        a: "No, se hai uno o due cantieri per volta e poche persone: un foglio tenuto bene funziona. Serve quando i cantieri aperti superano i tre o le persone in cantiere superano le cinque. Il punto di rottura non è fare il conto, è tenerlo aggiornato: se il dato arriva con dieci giorni di ritardo hai un ricordo, non un numero su cui decidere.",
      },
      {
        q: "Quanto tempo serve ogni settimana per tenere i numeri sotto controllo?",
        a: "Circa un'ora, se i dati arrivano già in ordine. Dieci minuti sui margini dei cantieri aperti, quindici sulla cassa delle prossime settimane, dieci sulle ore non coperte, il resto per decidere due cose e scriverle. Se invece devi ricostruire tutto a mano da chat e fogli sparsi, la stessa ora ne diventa facilmente quattro.",
      },
      {
        q: "Devo assumere un controller o un responsabile amministrativo?",
        a: "Sotto le trenta persone quasi mai. Ti conviene tenere tu la lettura dei numeri e delegare al massimo la preparazione dei dati a chi già fa amministrazione. Assumere qualcuno per il controllo di gestione ha senso quando i cantieri contemporanei sono molti e le commesse durano più di un anno, non quando il problema è solo che nessuno registra le ore per cantiere.",
      },
    ],
  },
  {
    id: "p2",
    slug: "excel-whatsapp-carta-gestione-impresa-edile",
    title: "Excel, WhatsApp e carta: quanto costa all'impresa edile",
    excerpt:
      "Excel e WhatsApp non sono il problema: il problema è che non si parlano. Il conto in ore e margine perso, con ipotesi dichiarate e prudenti.",
    category: "Digitalizzazione",
    tags: [
      "gestire impresa edile con Excel",
      "WhatsApp cantiere organizzazione",
      "excel cantieri",
      "organizzazione impresa edile",
    ],
    publishedAt: "2026-07-25",
    readTime: 12,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/excel-whatsapp-carta-gestione-impresa-edile.jpg",
    content: [
      {
        type: "intro",
        body: "Sono le 19:40 e sei fermo in furgone col telefono in mano. Un capo squadra ti manda la foto di un muro. Tu la giri al cliente e poi non la ritrovi più.\n\nGestire un'impresa edile con Excel, WhatsApp e carta funziona finché i pezzi sono pochi. Il problema non è nessuno dei tre. È che non si parlano. Il dato nasce in chat, muore in un foglio, in fattura non arriva. Il conto lo paghi in ore di ricostruzione e in margine perso.",
      },
      {
        type: "section",
        heading: "Prima cosa: Excel non è il nemico",
        body: "Mettiamola subito in chiaro. Excel è uno strumento straordinario e chi lo sa usare bene fa cose che nessun software gli farebbe fare.\n\nWhatsApp è il canale più veloce del mondo per dire una cosa a chi è sul posto, con le mani sporche e i guanti addosso. Non richiede formazione, ce l'hanno tutti, funziona anche con due tacche di segnale.\n\nLa carta resiste alla polvere, alla pioggia e alla batteria scarica. Un foglio in tasca al capo squadra è il supporto più affidabile che esista in cantiere.\n\nTutti e tre sono gratis o quasi. Li usano tutti. Se ti hanno portato fin qui, hanno fatto il loro lavoro.\n\nQuesto pezzo non è contro di loro. È il conto di cosa succede quando sono tre pezzi separati che non si parlano mai.",
      },
      {
        type: "list",
        heading: "Una giornata tipo, dalle 7:00 alle 21:00",
        items: [
          "7:00 — Passi in cantiere. Il capo squadra ti dice a voce che serve altro materiale. Te lo segni sul palmo della mano.",
          "8:20 — Il cliente della villa chiama: vuole spostare una presa e aggiungere un punto luce. Dici di sì. Nessuno lo scrive da nessuna parte.",
          "10:15 — Arriva un DDT. Il fornitore lo lascia in mano all'operaio. Finisce sul cruscotto del furgone, sotto due giubbotti.",
          "12:30 — Foto del pilastro nel gruppo «Cantiere Rossi». Sotto arrivano quaranta messaggi su chi porta il caffè.",
          "15:00 — Il geometra chiede a che punto è il secondo piano. Fai tre telefonate per riuscire a rispondergli.",
          "18:45 — Apri il file «preventivo_Rossi_v4_DEF_ok_finale.xlsx». Non sei sicuro che sia quello che il cliente ha firmato.",
          "21:10 — A tavola provi a ricostruire le ore della settimana. Ti mancano due giorni e nessuno risponde più al telefono.",
        ],
      },
      {
        type: "section",
        heading: "Dove si rompe il sistema a tre pezzi",
        body: "Il guasto non è mai clamoroso. Non c'è il giorno in cui «Excel si è rotto».\n\nSi rompe in silenzio, ogni volta che un'informazione passa da un pezzo all'altro e per strada perde qualcosa. Il passaggio è sempre una persona stanca, di sera, che si ricorda a metà.\n\nQuattro punti di rottura tornano in ogni impresa, uguali, dal Piemonte alla Sicilia.",
      },
      {
        type: "table",
        heading: "Cosa fa bene ogni pezzo e dove si rompe",
        headers: ["Lo strumento", "Cosa fa bene davvero", "Dove si rompe"],
        rows: [
          [
            "Excel",
            "Preventivi, computi, conti complessi, tabelle su misura",
            "Non sa cosa è successo in cantiere ieri: qualcuno glielo deve raccontare",
          ],
          [
            "WhatsApp",
            "Dire una cosa in fretta a chi ha le mani nel cemento",
            "Nessuno riesce a risalire a chi ha deciso cosa, e quando",
          ],
          [
            "Carta",
            "Firme, misure prese al volo, resiste a polvere e batteria scarica",
            "Resta in furgone. In fattura non ci arriva quasi mai",
          ],
          [
            "Memoria del titolare",
            "Tiene insieme tutto il resto, gratis, ventiquattr'ore al giorno",
            "Si satura sopra i tre cantieri e non si può delegare a nessuno",
          ],
        ],
      },
      {
        type: "section",
        heading: "La variante che nessuno ha scritto",
        body: "Il cliente ti ferma in cantiere e chiede una modifica. Piccola, dice lui. Tu dici di sì, perché è ragionevole e perché sei lì.\n\nLa modifica costa mezza giornata di due uomini più il materiale. Nessuno apre una variante. Nessuno la mette in un preventivo.\n\nA fine lavori quel costo c'è. Lo hai pagato tu, in busta paga e in fattura fornitore. Nel prezzo concordato non c'è.\n\nQuando ci provi, il cliente ti guarda male: «ma era una cosa da niente». E ha ragione lui, perché non esiste un pezzo di carta che dica il contrario.\n\nNon è una variante persa. Sono cinque o sei varianti perse a cantiere, ogni cantiere, tutto l'anno.",
      },
      {
        type: "section",
        heading: "La foto sepolta sotto duecento messaggi",
        body: "Il capo squadra fotografa la posa dell'impermeabilizzazione. La manda nel gruppo. Fa la cosa giusta.\n\nOtto mesi dopo il cliente segnala un'infiltrazione e dice che è colpa tua. Tu sai di aver fatto le cose per bene e sai che esiste una foto.\n\nA quel punto cominci a scorrere la chat. Duecento messaggi, cinquanta foto, tre gruppi diversi perché a un certo punto ne avevate creato uno nuovo. Il telefono di chi l'ha scattata è stato cambiato a Natale.\n\nLa foto probabilmente esiste ancora, da qualche parte. Non la trovi. Che, in una discussione, equivale esattamente a non averla mai scattata.\n\nUn [rapportino di cantiere con le foto agganciate al giorno e alla commessa](/funzionalita/rapportini-cantiere/) serve a questo. Non a fare burocrazia: a poter dimostrare, otto mesi dopo, cosa avevi fatto e quando.",
      },
      {
        type: "section",
        heading: "Le ore ricostruite a memoria",
        body: "Questa è la più costosa delle quattro e nessuno la conta mai.\n\nA fine mese qualcuno deve mettere insieme le presenze. Guarda i messaggi, chiama i capi squadra, ricostruisce. «Martedì eravate al Rossi o al Bianchi?».\n\nEsce un numero, e quel numero va in busta paga. Sul totale delle ore di solito ci prendi. Su quale cantiere se le è mangiate, molto meno.\n\nÈ un problema doppio. Perdi le ore da recuperare, perché nessuno ricorda gli straordinari del 14. E perdi il costo per commessa, che è l'unico modo per sapere se un lavoro guadagna.\n\nSenza ore per cantiere non hai margine per cantiere. E senza margine per cantiere stai facendo preventivi a sentimento da anni, anche se ti sembra di avere il polso della situazione.",
      },
      {
        type: "section",
        heading: "Il DDT che finisce sul cruscotto",
        body: "Il fornitore consegna in cantiere. L'operaio firma. Il documento resta lì.\n\nCon un po' di fortuna arriva in ufficio dopo dieci giorni, piegato in quattro. Con meno fortuna sparisce del tutto.\n\nPoi arriva la fattura del fornitore e nessuno può controllare se quello che c'è scritto è quello che è arrivato davvero. Si paga e basta, perché è più veloce che discutere.\n\nCosì il materiale ordinato in eccesso non lo scopri mai. Il materiale addebitato due volte nemmeno. E la quota di materiale che è finita su un altro cantiere resta un mistero che non risolverai.\n\nOgni DDT perso è un pezzo di costo che non riesci più a mettere sotto la commessa giusta.",
      },
      {
        type: "image",
        src: "/blog/covers/alternativa-excel-cantieri.jpg",
        alt: "Gestire un'impresa edile con Excel, WhatsApp e carta: tre strumenti che non si parlano",
        caption: "Il problema non è nessuno dei tre pezzi. È lo spazio vuoto tra un pezzo e l'altro.",
      },
      {
        type: "section",
        heading: "Facciamo il conto, con ipotesi dichiarate",
        body: "Adesso mettiamo dei numeri. Prima però le regole, così puoi rifare il conto con i tuoi.\n\nQueste non sono statistiche di settore. Sono ipotesi, tenute basse di proposito, su un'impresa da cinque a dieci persone con due o tre cantieri aperti.\n\nIpotesi uno: chi fa questo lavoro amministrativo costa 25 euro l'ora, tra lordo e contributi. Se lo fai tu vale molto di più, ma teniamo basso.\n\nIpotesi due: si lavorano 48 settimane l'anno.\n\nIpotesi tre: contiamo solo il tempo speso a ricostruire e ricopiare. Non contiamo gli errori, che costano di più.\n\nSe nella tua azienda i numeri sono diversi, cambiali e rifai la moltiplicazione. Il metodo resta quello.\n\nFai la stessa cosa con le ore. Se il tempo che ci perdi sono sei ore a settimana e non quattro, il totale cresce della metà. Se lo fai tu di sera invece che un impiegato, il costo orario è ben più alto di venticinque euro.",
      },
      {
        type: "table",
        heading: "Quanto costa davvero il sistema a tre pezzi (stima)",
        headers: ["Cosa fai a mano", "Ore a settimana", "Costo orario", "Costo all'anno (48 settimane)"],
        rows: [
          ["Ricostruire ore e presenze per cantiere", "1,5 h", "25 €", "1.800 €"],
          ["Cercare foto, DDT e messaggi dentro le chat", "1 h", "25 €", "1.200 €"],
          ["Riallineare i file di preventivo, consuntivo e fatturato", "1 h", "25 €", "1.200 €"],
          ["Telefonate per capire a che punto è un cantiere", "0,5 h", "25 €", "600 €"],
          ["Totale del solo tempo amministrativo", "4 h", "25 €", "4.800 €"],
        ],
      },
      {
        type: "section",
        heading: "E questa è la parte piccola del conto",
        body: "Quattromilaottocento euro l'anno di puro tempo. Fastidioso, ma sopportabile.\n\nIl problema è che il tempo è la voce meno cara delle due. La voce cara è quello che non vedi.\n\nCinque varianti non fatturate a cantiere, su tre cantieri, a qualche centinaio di euro l'una. Le ore di sabato che nessuno ha segnato. Il materiale pagato due volte perché mancava il DDT. Il cantiere che è andato in perdita e te ne sei accorto al saldo.\n\nQui non ti do una cifra, perché sarebbe inventata. Te la dai tu.\n\nPrendi l'ultima commessa chiusa. Elenca tutto quello che hai fatto e non hai fatturato. Somma. Poi moltiplica per il numero di lavori che chiudi in un anno. Quel numero, quasi sempre, è più grande dell'intero costo amministrativo.",
      },
      {
        type: "section",
        heading: "Il cantiere che sembrava andato bene",
        body: "Prendi un lavoro qualsiasi degli ultimi due anni. Uno di quelli che ricordi come andati bene.\n\nPreventivo a corpo, cifra tonda, cliente contento, saldo incassato senza discussioni. Nella tua testa quel cantiere è in attivo e ci resterà per sempre.\n\nAdesso prova a ricostruirlo sul serio. Quante ore ci sono andate dentro, comprese le due domeniche di aprile. Quanto materiale è uscito davvero, compreso quello preso di corsa dal ferramenta sotto casa. Le tre modifiche chieste a voce dal cliente. I due giorni in cui la squadra è rimasta ferma ad aspettare l'elettricista.\n\nNon ci riesci. E non perché sei disordinato: perché quei dati non sono mai stati scritti in un posto solo.\n\nEcco il danno vero del sistema a tre pezzi. Non ti fa perdere soltanto tempo. Ti toglie la possibilità di sapere se stai lavorando bene o male.\n\nE quella cifra tonda la rifarai identica al prossimo cliente, perché è l'unica cosa che ti sei ricordato di quel cantiere.",
      },
      {
        type: "section",
        heading: "Quando i tre pezzi bastano ancora",
        body: "Adesso la parte onesta, quella che quasi nessuno scrive.\n\nSe sei da solo o siete in due, e fai un lavoro per volta, il sistema a tre pezzi va benissimo. La memoria di una persona regge un cantiere alla volta senza sforzo. Non ti serve altro e chi ti dice il contrario ti sta vendendo qualcosa.\n\nRegge ancora bene se lavori quasi sempre con lo stesso committente, con prezzi a corpo che conosci a memoria. E regge se le persone in cantiere sono le stesse da anni, perché il passaggio di informazioni funziona senza doverlo scrivere.\n\nCambiare strumento in queste condizioni è tempo tolto al lavoro. Non farlo perché lo fa il tuo concorrente.\n\nIl punto di rottura non è una data sul calendario. È quando smetti di riuscire a tenere tutto in testa.",
      },
      {
        type: "callout",
        variant: "warning",
        heading: "I 5 segnali che il sistema a tre pezzi non basta più",
        body: "Se ne riconosci tre o più, non è una sensazione. È il sistema che ha superato la portata.",
        items: [
          "Ti capita di scoprire un costo di cantiere quando arriva la fattura del fornitore, non quando l'hai speso.",
          "Cerchi il file giusto tra versioni con nomi tipo «v3_DEF_ok» e non sei più sicuro di quale sia quello firmato.",
          "Se stai fuori una settimana, in ufficio nessuno sa rispondere al posto tuo.",
          "Hai discusso con un cliente su una cosa che avevate detto a voce e non avevi niente in mano.",
          "Non riesci a dirmi il margine dell'ultimo lavoro chiuso senza metterti a fare i conti adesso.",
        ],
      },
      {
        type: "section",
        heading: "Come uscirne per gradi (non «compra un software»)",
        body: "La risposta sbagliata è comprare un gestionale lunedì e pretendere che martedì sia tutto a posto. Finisce che dopo due settimane sono tutti tornati su WhatsApp e tu hai un abbonamento in più.\n\nLa risposta giusta parte dal metodo. Prima decidi come devono girare le informazioni, poi scegli lo strumento che le fa girare da solo.\n\nPrimo: una regola sola, tenuta per trenta giorni. Le ore si scrivono ogni giorno con sopra il nome del cantiere. Puoi farlo anche su carta, all'inizio. Serve a creare l'abitudine, non a creare un archivio.\n\nSecondo: una fonte sola per ogni tipo di informazione. Le foto stanno in un posto e uno solo. I documenti pure. WhatsApp può restare per il «vieni qui che ti faccio vedere», ma smette di essere l'archivio aziendale.\n\nTerzo: solo a questo punto lo strumento. E lo strumento serve a fare una cosa precisa: far entrare il dato una volta sola, dove nasce, e ritrovarselo già attaccato alla commessa giusta. Se ti fa reinserire le cose a mano, hai comprato un altro Excel con l'abbonamento.\n\nSu cosa cambia in pratica tra un foglio e un gestionale di cantiere abbiamo scritto qui: [l'alternativa a Excel per i cantieri](/blog/alternativa-excel-cantieri) e il confronto diretto [Edilizia in Cloud contro Excel](/confronto/vs-excel/).",
      },
      {
        type: "callout",
        variant: "success",
        heading: "Il percorso in 3 passi, nell'ordine giusto",
        body: "Trenta giorni per passo. Non saltare il primo, è quello che regge tutto il resto.",
        items: [
          "Passo 1 — Le ore, tutti i giorni, con sopra il nome del cantiere. Nient'altro. È l'unica abitudine che devi far attecchire.",
          "Passo 2 — Una casa sola per foto e documenti, e il rapportino di fine giornata. WhatsApp resta per parlare, non per archiviare.",
          "Passo 3 — Costi agganciati alla commessa mentre arrivano, così il [margine di ogni cantiere](/funzionalita/margini-cantiere/) si aggiorna senza che tu faccia niente.",
          "Solo dopo il passo 3 ha senso guardare i numeri per decidere: prima non avresti dati puliti da leggere.",
        ],
      },
      {
        type: "section",
        heading: "Cosa cambia davvero il giorno dopo",
        body: "Non aspettarti la rivoluzione. Aspettati due cose concrete.\n\nLa prima: smetti di ricostruire. Il venerdì sera le ore ci sono già, con sopra il cantiere. Il lunedì non devi telefonare a nessuno per sapere a che punto sei.\n\nLa seconda: cominci a scoprire i problemi mentre puoi ancora risolverli. Un cantiere che va storto lo vedi alla terza settimana e non al saldo. È la differenza tra decidere e prendere atto.\n\nIl resto viene da sé. Quando i costi stanno tutti sotto la [commessa giusta](/funzionalita/gestione-commesse/), il preventivo successivo lo fai sui tuoi numeri veri e non su quelli che ti ricordi.\n\nC'è poi una terza cosa, e non è un numero. In ufficio smettono di chiamarti per ogni domanda. Se il dato sta scritto dove tutti lo vedono, la risposta non deve passare per forza da te.\n\nÈ il primo passo vero verso il delegare. Non puoi affidare un cantiere a qualcuno se le informazioni per governarlo stanno solo nella tua testa.\n\nNon è tecnologia. È solo smettere di far passare ogni informazione attraverso la tua memoria.",
      },
      {
        type: "section",
        heading: "Raccogliere i dati è metà del lavoro",
        body: "Uscire da Excel e dai messaggi sparsi risolve la raccolta: i dati smettono di perdersi per strada. Resta aperta l'altra metà, cioè leggerli — capire quali commesse rendono davvero, dove finisce il margine, se la struttura di costi regge la crescita.\n\nQuella seconda metà è il controllo di gestione, e [Numeri in Edilizia](https://www.numerinedilizia.com/) lo porta nelle imprese edili come servizio continuativo.",
      },
      {
        type: "cta",
        heading: "Prova a farli parlare tra loro",
        body: "Edilizia in Cloud raccoglie ore, foto, documenti e costi dove nascono — in cantiere, dal telefono — e li attacca da soli alla commessa giusta. Puoi partire dal piano gratuito, provare tutto per 31 giorni e chiedere un preventivo su misura in una consulenza gratuita, dopo aver visto come gira con i tuoi cantieri.",
      },
    ],
    faqs: [
      {
        q: "Posso gestire un'impresa edile solo con Excel?",
        a: "Sì, finché sei da solo o in due con un cantiere per volta. Excel regge benissimo preventivi e computi. Smette di bastare quando i cantieri aperti superano i tre o le persone in cantiere superano le cinque, perché il problema non è più fare il conto ma tenerlo aggiornato con dati che arrivano da persone e giorni diversi.",
      },
      {
        q: "WhatsApp va bene per organizzare il cantiere?",
        a: "Va benissimo per comunicare, malissimo per archiviare. È il canale più veloce per dire una cosa a chi è sul posto e non richiede formazione. Il guaio arriva dopo: foto e decisioni si perdono sotto centinaia di messaggi e nessuno riesce a risalire a chi ha deciso cosa. Tienilo per parlare, non come archivio aziendale.",
      },
      {
        q: "Quanto costa davvero gestire tutto con Excel, WhatsApp e carta?",
        a: "Una stima prudente per un'impresa da cinque a dieci persone è intorno a 4.800 euro l'anno di solo tempo amministrativo: quattro ore a settimana a 25 euro l'ora per 48 settimane. È il conto piccolo. Il conto grosso sono le varianti mai fatturate, le ore non recuperate e i cantieri in perdita scoperti al saldo.",
      },
      {
        q: "Quando conviene passare a un gestionale?",
        a: "Quando smetti di riuscire a tenere tutto in testa. In pratica: più di tre cantieri aperti, più di cinque persone in cantiere, oppure quando le ore le registra qualcun altro al posto tuo. Un altro segnale netto è quando resti fuori una settimana e in ufficio nessuno sa rispondere al posto tuo.",
      },
      {
        q: "Devo buttare via i miei file Excel?",
        a: "No. I fogli di calcolo restano utili per simulazioni, analisi una tantum e conti su misura che nessun software prevede. Quello che deve uscire da Excel è il dato che cambia ogni giorno: ore, costi, avanzamento. Quello va raccolto dove nasce, in cantiere, non ricopiato a mano la sera.",
      },
      {
        q: "Da cosa comincio se voglio cambiare?",
        a: "Da una sola abitudine: le ore scritte ogni giorno con sopra il nome del cantiere, per trenta giorni. Anche su carta, all'inizio. Se questa attecchisce, tutto il resto poggia su una base solida. Se compri uno strumento prima di aver creato l'abitudine, dopo due settimane la squadra è tornata su WhatsApp e tu hai un abbonamento inutile.",
      },
    ],
  },
];
