import { FLO_AVATAR } from "./blogAuthor";
import type { BlogPost } from "./blogPosts";

/**
 * Cluster "Normativa cantiere e fisco edile" — 8 guide SEO/AEO.
 * I link interni nel corpo NON vanno scritti a mano: il renderer del blog
 * (linkifyInternal) trasforma automaticamente le frasi note ("fatturazione
 * elettronica", "DURC", "computo metrico", "timbratura digitale"...) in link
 * verso le landing /funzionalita/* e le altre guide.
 */
export const blogPostsNormativa: BlogPost[] = [
  {
    id: "n1",
    slug: "reverse-charge-edilizia",
    title: "Reverse charge edilizia: quando si applica e come fatturare",
    excerpt:
      "Fattura di subappalto con IVA esposta? Sanzioni da 250 € al 90% dell'imposta. Quando scatta il reverse charge, le diciture esatte, gli errori da evitare.",
    category: "Finanza",
    tags: ["reverse charge", "IVA edilizia", "subappalto", "fatturazione edilizia"],
    publishedAt: "2026-07-25",
    readTime: 10,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/reverse-charge-edilizia.jpg",
    content: [
      {
        type: "intro",
        body: "La fattura del subappalto è pronta. IVA al 22%, come sempre. Tre mesi dopo arriva la contestazione: quell'IVA non andava esposta. Il reverse charge in edilizia è il meccanismo IVA per cui chi esegue la prestazione emette fattura senza imposta e l'IVA la assolve il committente, che integra il documento registrandola a debito e a credito. Lo prevede l'art. 17, comma 6, del DPR 633/72: lettera a) per i subappalti edili, lettera a-ter) per pulizia, demolizione, installazione impianti e completamento di edifici. Sbagliare regime costa caro: si parte da 250 € e si arriva al 90% dell'imposta. Qui trovi quando si applica, come si fattura e come non pagare quel conto.",
      },
      {
        type: "section",
        heading: "Perché esiste il reverse charge (e perché colpisce proprio l'edilizia)",
        body: "Il subappaltatore incassava l'IVA dall'appaltatore e spariva senza versarla all'Erario. Frode semplice, filiere lunghe: succedeva di continuo. Il reverse charge taglia il problema alla radice. L'IVA non passa mai di mano: la assolve direttamente chi riceve la prestazione. In edilizia funziona così dal 1° gennaio 2007 per i subappalti (lettera a). Dal 1° gennaio 2015, con la legge 190/2014, copre anche i servizi della lettera a-ter. Per te la conseguenza è concreta: se lavori in subappalto, fatturi senza IVA. Quel 10% o 22% in più non entra mai in cassa. Su 100.000 € di subappalti l'anno sono oltre 20.000 € che non transitano dai tuoi conti: mettilo nei flussi di cassa quando pianifichi incassi e pagamenti, o te ne accorgi quando i fornitori battono cassa.",
      },
      {
        type: "section",
        heading: "Lettera a): il subappalto edile",
        body: "Sei subappaltatore? Allora questa lettera decide ogni tua fattura. La lettera a) dell'art. 17, comma 6, DPR 633/72 copre le prestazioni di servizi, fornitura di manodopera compresa, rese nel settore edile da un subappaltatore all'appaltatore principale o a un altro subappaltatore. Le condizioni sono tre, e servono tutte insieme: contratto di subappalto (o prestazione d'opera), attività edile della sezione F della classificazione ATECO, entrambe le imprese nel comparto costruzioni. Restano fuori per espressa previsione di legge le prestazioni verso un contraente generale a cui il committente ha affidato la totalità dei lavori. E il punto dove cadono in tanti: l'appalto diretto con il committente finale NON è subappalto. Lì la lettera a) non si applica — vale l'IVA ordinaria, salvo che scatti la lettera a-ter. Sbagli l'inquadramento del contratto? Sbagli ogni fattura della commessa, dalla prima all'ultima.",
      },
      {
        type: "section",
        heading: "Lettera a-ter): pulizia, demolizione, impianti e completamento di edifici",
        body: "Qui il perimetro si allarga. E con lui gli errori. Dal 2015 il reverse charge copre pulizia, demolizione, installazione di impianti e completamento relativi a edifici: anche in appalto diretto, senza bisogno di alcun subappalto. Unica condizione: il committente deve essere un soggetto passivo IVA, impresa o professionista. Verso i privati consumatori resta sempre l'IVA ordinaria, senza eccezioni. Per «completamento» l'Agenzia delle Entrate intende intonacatura, posa di infissi e serramenti, tinteggiatura, posa di pavimenti e rivestimenti. Occhio al confine: la norma parla di «edifici». Strade, fognature, piazzali e opere di urbanizzazione ne restano fuori — su quelle il reverse scatta solo in subappalto, con la lettera a). Posi infissi per un'impresa e fatturi con IVA esposta? Hai già sbagliato: verifica il cliente prima di emettere, non dopo.",
      },
      {
        type: "list",
        heading: "Reverse charge sì o no: la tabella dei casi",
        items: [
          "Fatturi da subappaltatore all'appaltatore principale o a un altro subappaltatore → SÌ, reverse charge lettera a)",
          "Fatturi direttamente al committente privato (persona fisica) → NO, IVA ordinaria (4%, 10% o 22% a seconda del lavoro)",
          "Installi o manutieni impianti su un edificio per un'impresa (B2B) → SÌ, reverse charge lettera a-ter), anche senza subappalto",
          "Posi infissi, pavimenti o tinteggi in appalto diretto verso un soggetto IVA → SÌ, lettera a-ter) come completamento di edificio",
          "Vendi beni con posa in opera accessoria alla vendita → NO, è una cessione di beni con IVA ordinaria",
          "Fatturi a un contraente generale affidatario della totalità dei lavori → NO, escluso per legge dalla lettera a)",
          "Lavori su strade, fognature e opere che non sono «edifici», in appalto diretto → NO a-ter); reverse solo se sei in subappalto",
          "Fatturi a una PA in split payment ma l'operazione rientra nel reverse charge → prevale il reverse charge",
        ],
      },
      {
        type: "section",
        heading: "Come si fattura in reverse charge: diciture esatte e codici",
        body: "Una dicitura sbagliata e la fattura torna indietro. La fattura in reverse charge si emette senza addebito d'imposta: indichi l'imponibile e la dicitura obbligatoria «inversione contabile ai sensi dell'art. 17, comma 6, lett. a), DPR 633/1972» per i subappalti, oppure «lett. a-ter)» per i servizi su edifici. Nella fatturazione elettronica la natura IVA da usare è N6.7 («inversione contabile — prestazioni comparto edile e settori connessi»). Chi riceve la fattura la integra con l'aliquota corretta e la registra due volte: registro vendite e registro acquisti. Con la fattura elettronica l'integrazione passa dal documento TD16 inviato allo SDI. Nota che vale soldi: l'aliquota dell'integrazione segue le regole ordinarie dell'operazione. Può essere il 10% agevolato, non automaticamente il 22%. Se emetti fatture miste — privati, imprese, subappalti — costruisci una checklist di tre domande: chi è il cliente? Che contratto ho firmato? La lavorazione riguarda un edificio? Le risposte decidono il regime prima ancora di aprire il gestionale. Dicitura, N6.7 e TD16 giusti al primo colpo: un minuto di attenzione che ti risparmia scarti SDI e contestazioni.",
      },
      {
        type: "section",
        heading: "Esempio pratico: subappalto da 20.000 €",
        body: "Posi un cappotto in subappalto per l'appaltatore principale. Corrispettivo: 20.000 €. Emetti fattura di 20.000 € senza IVA, natura N6.7, dicitura dell'art. 17, comma 6, lett. a). L'appaltatore integra con IVA al 22% (4.400 €), a debito e a credito: per lui di norma è neutra. Per te no: incassi 20.000 €, non 24.400 €. Ora sposta lo stesso lavoro in appalto diretto per un condominio, committente non soggetto IVA. Lì emetti fattura con IVA al 10% come manutenzione: 20.000 € + 2.000 €. Stesso cappotto, stesso ponteggio, due regimi completamente diversi. Terza variante: stesso lavoro in subappalto, ma il tuo cliente è un contraente generale affidatario della totalità dei lavori. Lì il reverse non si applica: IVA ordinaria. Tre contratti, tre fatture diverse, zero spazio per gli automatismi. È il contratto a comandare, non il tipo di lavorazione: leggilo prima di fatturare.",
      },
      {
        type: "section",
        heading: "Gli errori più comuni (visti in centinaia di fatture reali)",
        body: "Primo errore: reverse charge ai privati. Mai, in nessun caso. Secondo, il contrario: esporre l'IVA in un subappalto edile perché «così siamo sicuri». Il regime non si sceglie: si applica quello giusto, punto. Terzo: confondere l'appalto di servizi con la fornitura con posa. Se prevale la cessione del bene — vendi i serramenti, la posa è accessoria — è una cessione con IVA ordinaria. Quarto: dimenticare la dicitura o il codice natura N6.7. Risultato: fattura elettronica scartata o contestata. Quinto, i forfettari: il subappaltatore in regime forfettario fattura secondo il suo regime, senza applicare il reverse. Ma se è il forfettario a RICEVERE una fattura in inversione contabile, deve integrarla e versare l'IVA entro il 16 del mese successivo. Senza poterla detrarre: costo vivo. Una corretta gestione dei subappaltatori passa anche da qui: verifica sempre il regime fiscale di chi lavora per te, insieme a DURC e documenti di cantiere. Ogni verifica saltata oggi è una sanzione che matura in silenzio.",
      },
      {
        type: "section",
        heading: "Sanzioni: quanto costa sbagliare regime",
        body: "Mettiamo i numeri in fila: sono loro a dirti quanta attenzione merita questa pagina. Le sanzioni stanno nell'art. 6 del D.Lgs 471/97. Applichi l'IVA ordinaria dove serviva il reverse charge (o viceversa), ma l'imposta è stata comunque assolta? Violazione formale: sanzione fissa da 250 a 10.000 €, di regola a carico del cessionario, con responsabilità solidale del fornitore. Il committente omette del tutto l'inversione contabile? Da 500 a 20.000 €. L'operazione non risulta nemmeno dalla contabilità? Dal 5% al 10% dell'imponibile, minimo 1.000 €. C'è di mezzo frode o intento di evasione? Fino al 90% dell'imposta. Per dare una scala: su un subappalto da 50.000 € con IVA al 22%, il 90% dell'imposta vale 9.900 €. Più del margine di molti cantieri interi. Dieci minuti di verifica in più su ogni contratto costano zero. Nel dubbio, fatti confermare il regime dal tuo commercialista prima di emettere la fattura, non dopo: dopo, il conto lo fa l'Agenzia.",
      },
      {
        type: "section",
        heading: "Reverse charge e appalti pubblici: attenzione all'incrocio con lo split payment",
        body: "Lavori negli appalti pubblici? Allora incontri anche lo split payment dell'art. 17-ter: la PA trattiene l'IVA e la versa direttamente all'Erario. La regola di precedenza è netta: se l'operazione rientra nel reverse charge, lo split payment non si applica. In pratica: fatturi da subappaltatore all'appaltatore di un'opera pubblica? Reverse charge lettera a), come in qualsiasi cantiere privato — il tuo cliente è l'impresa, non la PA. Fatturi da appaltatore alla stazione appaltante? Split payment, salvo che la prestazione ricada nella lettera a-ter) e la PA agisca nella propria sfera commerciale. Un buon software con fatturazione elettronica integrata ti propone in automatico natura, esigibilità e diciture giuste in base a cliente e contratto: il regime corretto esce da solo, e le sanzioni restano sulla carta.",
      },
      {
        type: "cta",
        heading: "Fatture in reverse charge senza errori",
        body: "Il regime IVA giusto non si decide al momento di fatturare: si imposta prima. Con Edilizia in Cloud lo fissi una volta sola sul cliente o sulla commessa: natura N6.7, diciture e integrazione TD16 escono giuste in automatico, e lo scadenzario ti mostra l'impatto reale sugli incassi. Prova gratis 31 giorni sulla tua prossima fattura di subappalto.",
      },
    ],
    faqs: [
      {
        q: "Quando si applica il reverse charge in edilizia?",
        a: "Si applica in due casi previsti dall'art. 17, comma 6, DPR 633/72: nei subappalti edili tra imprese del settore costruzioni (lettera a) e nei servizi di pulizia, demolizione, installazione di impianti e completamento relativi a edifici resi verso soggetti IVA, anche in appalto diretto (lettera a-ter). Verso i privati consumatori non si applica mai: lì vale l'IVA ordinaria al 4%, 10% o 22%.",
      },
      {
        q: "Che dicitura devo scrivere in fattura con il reverse charge?",
        a: "La dicitura obbligatoria è «inversione contabile ai sensi dell'art. 17, comma 6, lett. a), DPR 633/1972» per i subappalti, o «lett. a-ter)» per pulizia, demolizione, impianti e completamento di edifici. La fattura esce senza IVA e nella fattura elettronica il codice natura corretto è N6.7. Chi la riceve la integra con l'aliquota dovuta tramite documento TD16 inviato allo SDI.",
      },
      {
        q: "Il reverse charge si applica ai clienti privati?",
        a: "No, mai. L'inversione contabile presuppone un committente soggetto passivo IVA in grado di integrare la fattura. Alle persone fisiche consumatori finali fatturi sempre con IVA ordinaria, con l'aliquota corretta per il tipo di lavoro: 22% standard, 10% per le manutenzioni su immobili abitativi, 4% nei casi di prima casa previsti dalla legge.",
      },
      {
        q: "Cosa rischio se espongo l'IVA quando serviva il reverse charge?",
        a: "Rischi una sanzione fissa da 250 a 10.000 € se l'imposta è stata comunque versata: violazione formale (art. 6, comma 9-bis, D.Lgs 471/97). Se invece l'inversione viene omessa del tutto, la sanzione va da 500 a 20.000 €, e sale dal 5% al 10% dell'imponibile (minimo 1.000 €) se l'operazione non risulta dalla contabilità. In caso di frode si arriva al 90% dell'imposta.",
      },
      {
        q: "Il forfettario applica il reverse charge?",
        a: "Come fornitore no: il subappaltatore forfettario emette fattura secondo il proprio regime, senza IVA e senza inversione contabile. Come committente sì, e gli costa: se riceve una fattura in reverse charge deve integrarla con l'IVA e versarla entro il giorno 16 del mese successivo, senza poterla detrarre. Per lui è un costo vivo da mettere in preventivo.",
      },
      {
        q: "Tra reverse charge e split payment quale prevale?",
        a: "Prevale il reverse charge, sempre. L'art. 17-ter DPR 633/72 esclude espressamente dallo split payment le operazioni soggette a inversione contabile. Quindi il subappaltatore in un'opera pubblica fattura in reverse charge al proprio appaltatore, mentre l'appaltatore fattura alla PA in split payment, salvo i servizi della lettera a-ter) resi alla PA nella sua sfera commerciale, che restano in reverse.",
      },
    ],
  },
  {
    id: "n2",
    slug: "registro-presenze-cantiere-obbligatorio",
    title: "Registro presenze cantiere obbligatorio: cosa dice la legge",
    excerpt:
      "Badge, LUL e congruità: tre norme ti obbligano a registrare le presenze in cantiere. Cosa chiede l'ispettore, le sanzioni e come tenere tutto in digitale.",
    category: "Normativa",
    tags: ["presenze cantiere", "tessera di riconoscimento", "congruità manodopera", "D.Lgs 81/08"],
    publishedAt: "2026-07-25",
    readTime: 7,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/registro-presenze-cantiere-obbligatorio.jpg",
    content: [
      {
        type: "intro",
        body: "L'ispettore chiede chi lavorava in cantiere martedì scorso, e a che ora. Tu hai un quaderno in baracca e tre vocali del capocantiere. Non basta. Il registro presenze cantiere obbligatorio non esiste come documento unico previsto da una singola norma: l'obbligo di tracciare chi lavora in cantiere nasce dalla somma di tre regole — la tessera di riconoscimento del D.Lgs 81/08, il Libro Unico del Lavoro e la verifica di congruità della manodopera del DM 143/2021. Chi non registra le presenze per cantiere non riesce a rispettarne nessuna delle tre. E ognuna, quando manca, presenta il conto: sanzioni, DURC bloccati, saldi che non arrivano.",
      },
      {
        type: "section",
        heading: "Cosa dice davvero la norma (e cosa no)",
        body: "«Fammi vedere il registro presenze.» La frase è comune. Il documento con quel nome, in nessuna legge. Esistono però obblighi puntuali che rendono la registrazione delle presenze un passaggio di fatto obbligato. Uno: il datore di lavoro deve munire di tessera di riconoscimento ogni lavoratore impiegato in appalto o subappalto (art. 18, comma 1, lettera u, e art. 26, comma 8, D.Lgs 81/08). Due: le presenze giornaliere vanno riportate nel Libro Unico del Lavoro entro la fine del mese successivo. Tre: nei cantieri soggetti a verifica di congruità devi dimostrare quanta manodopera hai impiegato su quel singolo cantiere. Tre norme diverse, una sola conseguenza operativa: devi sapere chi c'era, quando e su quale commessa. Con dati difendibili davanti a un ispettore, non con ricostruzioni a memoria.",
      },
      {
        type: "section",
        heading: "La tessera di riconoscimento: il badge di cantiere",
        body: "Otto operai al lavoro, nessun badge esposto. L'ispettore non deve nemmeno entrare in baracca: verbalizza dal piazzale. Negli appalti e subappalti la tessera di riconoscimento è obbligatoria per tutti: dipendenti (art. 18 e art. 20, comma 3, D.Lgs 81/08) e lavoratori autonomi, che devono provvedere in proprio (art. 21, comma 1, lettera c). Il contenuto minimo lo fissa l'art. 5 della legge 136/2010: fotografia, generalità del lavoratore, datore di lavoro e data di assunzione; in caso di subappalto va indicata anche la relativa autorizzazione. Le sanzioni sono per singolo lavoratore: da 100 a 500 € a carico del datore che non fornisce la tessera, da 50 a 300 € a carico del lavoratore che non la espone. Rifai il conto su quegli otto operai: oltre 4.000 € per l'impresa, in una sola visita ispettiva.",
      },
      {
        type: "section",
        heading: "Il Libro Unico del Lavoro: le ore finiscono lì",
        body: "Fine mese. Il consulente del lavoro aspetta le ore, il capocantiere manda le foto del quaderno. Il Libro Unico del Lavoro (art. 39 del D.L. 112/2008) è il registro dove ogni mese confluiscono presenze, ore ordinarie, straordinari, ferie e assenze di ciascun dipendente, con registrazione entro la fine del mese successivo. Il punto critico per te è la qualità del dato a monte: se le ore viaggiano su WhatsApp o fogli volanti, gli errori in busta paga sono questione di tempo. E in edilizia l'errore pesa doppio: le stesse ore alimentano la denuncia mensile alla Cassa Edile e il calcolo del costo manodopera per commessa. Una rilevazione presenze fatta bene una sola volta serve tre scopi: paghe corrette, versamenti giusti, margini di cantiere reali. Una fatta male li sbaglia tutti e tre insieme.",
      },
      {
        type: "section",
        heading: "La congruità della manodopera: il vero motivo per tracciare tutto",
        body: "Fine lavori, chiedi il saldo. Il committente chiede il DURC di congruità. E lì scopri che le ore denunciate non tornano. Dal 1° novembre 2021 il DM 143/2021 impone la verifica di congruità dell'incidenza della manodopera: sempre nei lavori pubblici, e nei lavori privati con valore complessivo pari o superiore a 70.000 €. Ogni categoria di lavori ha una percentuale minima di manodopera attesa sul valore dell'opera: il 14,28% per le nuove costruzioni civili, il 5,36% per quelle industriali, secondo la tabella allegata al decreto. Se le ore denunciate alla Cassa Edile non raggiungono la soglia, il DURC di congruità non viene rilasciato. E senza quello si bloccano saldi e pagamenti. Attribuire ogni ora al cantiere giusto non è pignoleria da ufficio: è la differenza tra incassare il saldo e restare fermi a spiegare le ore mancanti.",
      },
      {
        type: "list",
        heading: "Quando la registrazione presenze è di fatto obbligatoria",
        items: [
          "Lavori in appalto o subappalto → tessera di riconoscimento per tutti i presenti, imprese e autonomi",
          "Lavori pubblici → verifica di congruità della manodopera sempre, a prescindere dall'importo",
          "Lavori privati da 70.000 € in su → congruità obbligatoria ex DM 143/2021",
          "Hai subappaltatori in cantiere → il committente deve poter verificare chi accede (art. 26 D.Lgs 81/08)",
          "Ogni mese, per tutti i dipendenti → presenze e ore nel Libro Unico del Lavoro",
          "Infortunio o ispezione → devi dimostrare chi era presente e in quali orari, con dati certi",
        ],
      },
      {
        type: "section",
        heading: "Come tenere il registro presenze in digitale",
        body: "Il quaderno in baracca si bagna, si perde, si riscrive. La timbratura digitale no. L'operaio timbra entrata e uscita dal telefono, la posizione registrata al momento della timbratura certifica che era davvero in cantiere, e ogni ora finisce da sola sulla commessa giusta. Da lì escono l'export mensile per il consulente del lavoro, le ore per la denuncia alla Cassa Edile e il costo manodopera reale per cantiere. Due accortezze obbligatorie: la rilevazione della posizione va limitata al momento della timbratura (niente tracciamento continuo) e serve un'informativa privacy chiara ai lavoratori. Rispettate queste regole, un archivio presenze digitale, datato e non modificabile vale più di qualsiasi quaderno davanti a un ispettore. E si costruisce da solo, un giorno alla volta, senza corse la sera prima.",
      },
      {
        type: "cta",
        heading: "Presenze a posto, congruità sotto controllo",
        body: "Il registro presenze in regola non si costruisce la sera prima dell'ispezione. Con le timbrature GPS di Edilizia in Cloud è già pronto, ogni giorno: ogni ora sul cantiere giusto, export per il consulente del lavoro, ore per la Cassa Edile e costo manodopera per commessa in tempo reale. Prova gratis 31 giorni con la tua squadra.",
      },
    ],
    faqs: [
      {
        q: "Esiste l'obbligo di un registro presenze cartaceo in cantiere?",
        a: "No, nessuna norma impone un registro presenze cartaceo con quel nome. Gli obblighi reali sono tre: tessera di riconoscimento per chi opera in appalto e subappalto (D.Lgs 81/08), registrazione mensile delle presenze nel Libro Unico del Lavoro e, nei cantieri soggetti a congruità, dimostrazione della manodopera impiegata sul singolo cantiere. Un sistema digitale li copre tutti e tre con un gesto solo.",
      },
      {
        q: "Quali sono le sanzioni per la mancata tessera di riconoscimento?",
        a: "Da 100 a 500 € per ogni lavoratore a carico del datore che non fornisce la tessera, e da 50 a 300 € a carico del lavoratore che non la espone. Il lavoratore autonomo che opera in cantiere deve dotarsene in proprio. Su una squadra intera trovata senza badge l'importo complessivo diventa rapidamente di migliaia di euro: è la sanzione più facile da prendere e la più facile da evitare.",
      },
      {
        q: "Quando scatta la verifica di congruità della manodopera?",
        a: "Scatta sempre nei lavori pubblici e nei lavori privati con valore complessivo pari o superiore a 70.000 €, per i cantieri con denuncia di nuovo lavoro dal 1° novembre 2021 (DM 143/2021). L'incidenza minima di manodopera dipende dalla categoria: ad esempio 14,28% per le nuove costruzioni civili. Sotto soglia, il DURC di congruità non viene rilasciato e i pagamenti si bloccano.",
      },
      {
        q: "Posso rilevare le presenze con la geolocalizzazione?",
        a: "Sì, a due condizioni: la posizione viene rilevata solo al momento della timbratura, non come tracciamento continuo del lavoratore, e i lavoratori ricevono un'informativa privacy chiara su dati raccolti e finalità. È la prassi consolidata per la timbratura da smartphone in cantiere. In caso di dubbi su accordi sindacali o casi particolari, confrontati con il tuo consulente del lavoro.",
      },
      {
        q: "Excel o WhatsApp bastano per registrare le presenze?",
        a: "Formalmente sì, nessuna norma li vieta. Nella pratica reggono male: i dati arrivano in ritardo, si perdono, non attribuiscono le ore alla commessa e non dimostrano nulla in ispezione. Con la congruità della manodopera che richiede ore precise per singolo cantiere, un foglio ricopiato a fine settimana è il modo migliore per trovarsi ore mancanti proprio quando serve il DURC di congruità per incassare.",
      },
    ],
  },
  {
    id: "n3",
    slug: "pos-piano-operativo-sicurezza-fac-simile",
    video: { youtubeId: "7ERyfY8sPKY", duration: "PT5M3S", uploadedAt: "2026-11-04T08:21:09+01:00" },
    title: "POS piano operativo di sicurezza: guida e fac simile",
    excerpt:
      "Il POS è il primo documento che l'ispettore chiede: chi deve redigerlo, i 10 capitoli dell'Allegato XV, le sanzioni e come evitare il piano fotocopia.",
    category: "Normativa",
    tags: ["POS", "sicurezza cantiere", "D.Lgs 81/08", "Allegato XV"],
    updatedAt: "2026-11-04",
    publishedAt: "2026-07-25",
    readTime: 9,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/pos-piano-operativo-sicurezza-fac-simile.jpg",
    content: [
      {
        type: "intro",
        body: "L'ispettore ASL entra in cantiere alle 9:40. Chiede il POS. Quello in baracca è del cantiere di sei mesi fa. Il POS, piano operativo di sicurezza, è il documento che ogni impresa esecutrice deve redigere prima di entrare in cantiere: lo prevede l'art. 89, comma 1, lettera h) del D.Lgs 81/08, con i contenuti minimi fissati dall'Allegato XV, punto 3.2. Descrive come la tua impresa lavora in quel specifico cantiere: uomini, mansioni, attrezzature, sostanze, DPI e misure di sicurezza. Qui trovi la struttura completa, sezione per sezione, da usare come fac simile — e gli errori che trasformano il POS in un boomerang.",
      },
      {
        type: "section",
        heading: "Chi deve redigere il POS (e chi no)",
        body: "Il POS è redatto dal datore di lavoro dell’impresa esecutrice per il singolo cantiere, prima dei propri lavori, nel campo di applicazione del Titolo IV del D.Lgs. 81/2008. L’assistenza di RSPP o consulenti non trasferisce automaticamente le responsabilità. Il ruolo del lavoratore autonomo va distinto da quello dell’impresa in base all’organizzazione effettiva, non soltanto all’etichetta contrattuale. Per i rappresentanti per la sicurezza, l’art. 100, comma 4, prevede la disponibilità di copia di PSC e POS almeno dieci giorni prima dell’inizio dei lavori; l’art. 102 disciplina la consultazione sul PSC e sulle sue modifiche significative. Verifica contenuti, consegna e consultazione con le figure della sicurezza del cantiere.",
      },
      {
        type: "section",
        heading: "POS, PSC e PSS: chi fa cosa",
        body: "PSC e POS hanno perimetri diversi. Il PSC riguarda sicurezza e coordinamento del cantiere quando previsto; il POS descrive l’attività della singola impresa ed è complementare e di dettaglio rispetto al PSC. Il PSS compare in modelli e riferimenti di precedenti discipline: non va presentato come un obbligo sostitutivo universale per ogni appalto pubblico senza PSC. Occorre verificare la disciplina applicabile al rapporto. L’art. 101 prevede che ciascuna esecutrice trasmetta il POS all’affidataria prima dei propri lavori; l’affidataria ne verifica la congruenza rispetto al proprio e lo trasmette al coordinatore per l’esecuzione secondo il percorso applicabile. I lavori iniziano dopo l’esito positivo delle verifiche, da svolgere tempestivamente e comunque non oltre quindici giorni dalla ricezione.",
      },
      {
        type: "list",
        heading: "Il fac simile: i 10 capitoli del POS secondo l'Allegato XV, punto 3.2.1",
        items: [
          "1. Dati identificativi dell'impresa: nominativo del datore di lavoro, indirizzi e riferimenti telefonici di sede e cantiere; attività svolte in cantiere ed eventuali turnazioni; nominativi di addetti al primo soccorso, antincendio ed evacuazione, RLS (aziendale o territoriale), medico competente ove previsto, RSPP; nominativo del direttore tecnico di cantiere e del capocantiere; numero e qualifiche dei lavoratori dipendenti e autonomi che operano per conto dell'impresa",
          "2. Mansioni inerenti la sicurezza: chi fa cosa, in cantiere, per ciascuna figura nominata",
          "3. Descrizione dell'attività di cantiere, delle modalità organizzative e dei turni di lavoro dell'impresa",
          "4. Elenco di ponteggi, ponti su ruote e altre opere provvisionali rilevanti, macchine e impianti utilizzati (con verifiche e manutenzioni in regola)",
          "5. Elenco delle sostanze e miscele pericolose utilizzate, con le relative schede di sicurezza",
          "6. Esito del rapporto di valutazione del rumore (e delle vibrazioni, quando pertinente)",
          "7. Misure preventive e protettive integrative rispetto a quelle del PSC, per le lavorazioni proprie dell'impresa",
          "8. Procedure complementari e di dettaglio richieste dal PSC, quando previste",
          "9. Elenco dei DPI forniti ai lavoratori: quali, per quali lavorazioni, con consegna documentata",
          "10. Documentazione su informazione e formazione: attestati, formazione specifica per mansione, addestramento all'uso di attrezzature e DPI di terza categoria",
        ],
      },
      {
        type: "section",
        heading: "Come compilare ogni sezione senza fare un POS fotocopia",
        body: "Sessanta pagine scaricate da un modello, cambia solo l'intestazione. Un ispettore (o un coordinatore sveglio) lo riconosce in trenta secondi. Le firme del copia-incolla sono sempre le stesse: elenchi di attrezzature che l'impresa non possiede, valutazione rumore di un altro cantiere, DPI per lavorazioni che non farai mai. La regola pratica è una: ogni sezione deve parlare di QUESTO cantiere. Nella descrizione attività scrivi le tue lavorazioni reali, con le fasi in sequenza. Nell'elenco attrezzature metti solo ciò che porterai davvero, con date di verifica. Nelle misure integrative rispondi puntualmente ai rischi del PSC di quel cantiere. Un POS specifico di 15 pagine vale più di uno generico di 80. E in caso di infortunio, un POS fotocopia è la prima cosa che l'accusa userà contro di te.",
      },
      {
        type: "section",
        heading: "Sanzioni: cosa rischi senza POS (o con un POS inadeguato)",
        body: "POS mancante non significa multa: significa reato. Per il datore di lavoro è previsto l'arresto da tre a sei mesi o l'ammenda, con importi rivalutati periodicamente che oggi si collocano nell'ordine di alcune migliaia di euro (verifica sempre gli importi aggiornati con il tuo consulente). Ma il danno vero è un altro. La mancata elaborazione del POS rientra tra le gravi violazioni dell'Allegato I del D.Lgs 81/08: quelle che fanno scattare la sospensione dell'attività imprenditoriale e, dal 1° ottobre 2024, la decurtazione di crediti sulla patente a crediti. Cantiere fermo quel giorno stesso, penali del committente che corrono, punti persi. Il costo reale di un POS mancante non è l'ammenda: è tutto quello che si porta dietro.",
      },
      {
        type: "section",
        heading: "Quando aggiornare il POS",
        body: "Il POS del primo giorno non copre il cantiere del sesto mese. Va aggiornato ogni volta che cambia qualcosa di rilevante: nuove lavorazioni non previste, nuove attrezzature o sostanze, variazioni della squadra o delle figure della sicurezza, modifiche del PSC che richiedono nuove procedure di dettaglio. In cantieri lunghi conviene una revisione programmata, a ogni nuova fase: scavi, struttura, finiture. Tieni il POS insieme agli altri documenti nel gestionale di cantiere, con versioni datate e firmate: chi cerca l'ultima revisione la trova, e il giornale dei lavori documenta quando le nuove procedure sono entrate in vigore. Aggiornare il POS è dieci minuti di lavoro. Un POS vecchio davanti a un ispettore è, come minimo, una giornata di cantiere persa.",
      },
      {
        type: "cta",
        heading: "Documenti di cantiere sempre in ordine",
        body: "Il POS che ti salva non è quello scritto la notte prima: è quello che trovi in tre secondi quando l'ispettore lo chiede. Con Edilizia in Cloud tieni POS, verbali, attestati e scadenze di ogni cantiere in un unico posto, condivisi con squadra e coordinatore. Prova gratis 31 giorni.",
      },
    ],
    faqs: [
      {
        q: "Chi deve redigere il POS?",
        a: "Il datore di lavoro di ogni impresa esecutrice, per ogni singolo cantiere, prima dell'inizio dei propri lavori (art. 89 e Allegato XV D.Lgs 81/08). Vale anche con una sola impresa in cantiere e anche per l'impresa affidataria quando esegue lavori con proprio personale. Può farsi assistere da RSPP o consulenti, ma la responsabilità e la firma restano del datore di lavoro.",
      },
      {
        q: "Il lavoratore autonomo deve fare il POS?",
        a: "No. Il lavoratore autonomo senza dipendenti non è impresa esecutrice e non redige il POS. Ha però gli obblighi dell'art. 21 del D.Lgs 81/08: attrezzature conformi, DPI adeguati e tessera di riconoscimento in appalti e subappalti. Attenzione: se l'autonomo di fatto coordina altri lavoratori, il quadro cambia e gli obblighi diventano quelli di un'impresa.",
      },
      {
        q: "Serve il POS anche per un piccolo lavoro in casa privata?",
        a: "Sì, se a eseguirlo è un'impresa con lavoratori: l'obbligo del POS non dipende dalla dimensione del cantiere né dalla presenza del coordinatore. Anche il rifacimento di un bagno con due operai richiede un POS, proporzionato al lavoro: bastano poche pagine, purché descrivano davvero quel cantiere, le lavorazioni, le attrezzature e i DPI usati.",
      },
      {
        q: "Che differenza c'è tra POS e DVR?",
        a: "Il DVR valuta i rischi dell'azienda nel suo complesso; il POS li declina sulla singola commessa. Il DVR è obbligatorio per ogni datore di lavoro a prescindere dai cantieri; il POS descrive quel cantiere, quelle lavorazioni, quella squadra. Nessuno dei due sostituisce l'altro: l'impresa edile con dipendenti deve avere entrambi, e i due documenti devono essere coerenti tra loro.",
      },
      {
        q: "Cosa succede se il POS manca o è inadeguato?",
        a: "Rischi un reato contravvenzionale: arresto da tre a sei mesi o ammenda per il datore di lavoro, con importi rivalutati nel tempo. In più è una grave violazione dell'Allegato I del D.Lgs 81/08: può far scattare la sospensione dell'attività nel cantiere e la decurtazione di crediti dalla patente a crediti. E un POS generico o fotocopia viene contestato come inadeguato quasi quanto un POS assente.",
      },
      {
        q: "Ogni quanto va aggiornato il POS?",
        a: "Ogni volta che cambiano le condizioni che descrive: nuove lavorazioni, nuove attrezzature o sostanze, variazioni della squadra o delle figure della sicurezza, modifiche del PSC. Non esiste una scadenza fissa. Nei cantieri lunghi è buona pratica una revisione a ogni cambio di fase. Ogni revisione va datata, firmata e trasmessa all'affidataria o al coordinatore per l'esecuzione.",
      },
    ],
  },
  {
    id: "n4",
    slug: "prezzario-regionale-edilizia",
    video: { youtubeId: "QttCZYmALfk", duration: "PT4M50S", uploadedAt: "2026-11-04T08:21:09+01:00" },
    title: "Prezzario regionale edilizia: cos'è e come si usa davvero",
    excerpt:
      "Prezzario regionale edilizia: leggi voci e inclusioni, verifica l’edizione e confronta i prezzi di riferimento con i costi reali del cantiere.",
    category: "Normativa",
    tags: ["prezzario regionale", "computo metrico", "preventivi", "appalti pubblici"],
    updatedAt: "2026-11-04",
    publishedAt: "2026-07-25",
    readTime: 7,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/prezzario-regionale-edilizia.jpg",
    content: [
      {
        type: "intro",
        body: "Il prezzario regionale edilizia è un riferimento da leggere prima di usarlo nel preventivo: descrizione della voce, unità di misura, inclusioni e regole di applicazione contano quanto il prezzo. Un ribasso non dimostra da solo che lavorerai in perdita, così come il prezzo di listino non garantisce il margine. Devi confrontare il ricavo contrattuale con i costi previsti della tua lavorazione. Nei lavori pubblici, negli interventi privati e nelle verifiche per agevolazioni possono valere criteri diversi: individua il quadro applicabile, poi usa edizione e voce pertinenti.",
      },
      {
        type: "section",
        heading: "Cos'è il prezzario regionale e chi lo pubblica",
        body: "Il prezzario organizza voci con codice, descrizione, unità di misura e prezzo unitario, raggruppate per lavorazioni. Il Codice dei contratti pubblici prevede l’aggiornamento dei prezzari regionali; per il tuo elaborato controlla anche validità, disposizioni transitorie e avvertenze della versione scelta. I listini DEI sono pubblicazioni private: non considerarli automaticamente più aggiornati o sufficienti in ogni situazione. Consulta le fonti richieste dalla disciplina applicabile e conserva il riferimento all’edizione effettivamente utilizzata.",
      },
      {
        type: "section",
        heading: "Come è costruita una voce di prezzario",
        body: "Un prezzo al metro quadrato senza codice, edizione e descrizione della voce è soltanto un esempio, non un riferimento ufficiale. Prima di usare il prezzario, leggi analisi, inclusioni, esclusioni e norme di misurazione: materiali, manodopera, mezzi, spese generali e utile possono essere già compresi secondo la composizione prevista. Evita di aggiungere due volte la stessa componente. Non si può dedurre una perdita dalla sola percentuale di utile del listino o da un ribasso isolato: confronta ricavo contrattuale e costo previsto della lavorazione. Anche l’incidenza della manodopera richiede interpretazione e dati coerenti per stimare ore e verificare la congruità.",
      },
      {
        type: "section",
        heading: "Come si usa nei preventivi e nei computi",
        body: "Nei lavori pubblici fonti, criteri e voci seguono il Codice, gli allegati pertinenti e gli atti della procedura. Nel privato verifica contratto, intervento e finalità del documento: il prezzario non va dichiarato sempre facoltativo in assoluto. Nel [computo metrico estimativo](/blog/computo-metrico-estimativo-guida/) controlla descrizioni, quantità e misurazioni prima del riepilogo. Confronta poi il ricavo offerto con la previsione dei costi reali, distinguendo produttività, materiali, condizioni operative e dati mancanti. Collegare il listino ai [preventivi professionali](/funzionalita/preventivi-edilizia/) e ai consuntivi aiuta il controllo: non sostituisce la verifica economica della singola commessa.",
      },
      {
        type: "list",
        heading: "Dove scaricare i prezzari regionali (gratuiti, sui portali ufficiali)",
        items: [
          "Lombardia: prezzario delle opere pubbliche, aggiornato annualmente, su sito e piattaforma della Regione",
          "Piemonte: prezzario regionale dei lavori pubblici, scaricabile in PDF e formati aperti",
          "Veneto: prezzario regionale online con consultazione per capitoli",
          "Emilia-Romagna: elenco regionale dei prezzi delle opere pubbliche",
          "Toscana: prezzario dei lavori pubblici della Toscana, per provincia",
          "Lazio: tariffa dei prezzi per opere edili e impiantistiche",
          "Campania, Puglia, Sicilia e le altre Regioni: prezzario sul portale regionale, di norma in PDF ed Excel",
          "In alternativa o in aggiunta: listini DEI (a pagamento), riferimento diffuso per lavori privati e bonus fiscali",
        ],
      },
      {
        type: "section",
        heading: "Prezzario e bonus fiscali: la congruità delle spese",
        body: "Per gli interventi agevolati, verifica con il professionista quale beneficio, periodo e disciplina si applicano. Prezzari regionali, listini DEI e massimali specifici possono avere ruoli diversi nelle verifiche richieste. Il superamento di un limite pertinente non diventa automaticamente agevolabile perché accompagnato da una relazione: occorre distinguere costo contrattuale, congruità e spesa ammessa. Prima di promettere una detrazione al cliente, controlla documentazione, condizioni e importi con il tecnico e il consulente fiscale.",
      },
      {
        type: "section",
        heading: "I limiti del prezzario (e quando è giusto scostarsi)",
        body: "Il prezzario è un riferimento da confrontare con le condizioni dell’intervento. Se manca una voce adeguata, valuta l’analisi del nuovo prezzo secondo le regole applicabili, documentando materiali, mezzi, manodopera e maggiorazioni pertinenti. La revisione prezzi è un tema distinto: l’art. 60 del D.Lgs. 36/2023 e l’Allegato II.2-bis prevedono meccanismi da verificare rispetto a procedura, periodo e contratto. Nel quadro risultante dal correttivo, per i lavori la soglia è del 3% e il riconoscimento riguarda il 90% dell’eccedenza, mentre servizi e forniture seguono regole diverse. Non estendere automaticamente il precedente schema 5%/80% a tutti i lavori. Verifica regime transitorio, clausola, indici e prestazioni da eseguire con il professionista che segue il contratto.",
      },
      {
        type: "cta",
        heading: "Dal prezzario al preventivo, con dati verificati",
        body: "Il preventivo in perdita non si vede quando lo firmi: si vede a fine cantiere, quando mancano i soldi. Con Edilizia in Cloud costruisci il tuo listino dalle voci che usi davvero, lo colleghi a computi e preventivi e confronti i prezzi offerti con i costi reali di cantiere. Prova gratis 31 giorni e fai il prossimo preventivo con i numeri giusti.",
      },
    ],
    faqs: [
      {
        q: "Il prezzario regionale è obbligatorio nei lavori privati?",
        a: "Nei lavori privati bisogna verificare contratto, intervento e finalità dell’elaborato. Il prezzario può essere un riferimento utile, ma non va dichiarato sempre facoltativo in assoluto: pratiche, agevolazioni e verifiche specifiche possono richiedere criteri dedicati. Confronta la voce con i costi reali e verifica le regole del tuo caso.",
      },
      {
        q: "Ogni quanto viene aggiornato il prezzario regionale?",
        a: "Almeno una volta l'anno: l'art. 41, comma 13, del D.Lgs 36/2023 impone alle Regioni l'aggiornamento annuale dei prezzari, con possibilità di aggiornamenti infrannuali in caso di forti variazioni dei prezzi. Nel periodo del caro materiali 2022-2023 diverse Regioni hanno pubblicato edizioni straordinarie a metà anno. Controlla sempre di usare l'edizione in vigore alla data del progetto.",
      },
      {
        q: "Posso fare un preventivo con prezzi più alti del prezzario?",
        a: "Il prezzo contrattuale va distinto dai criteri eventualmente richiesti per asseverazioni, agevolazioni e altre verifiche. Nel privato si valutano accordi e regole applicabili; un’analisi può rendere trasparente il calcolo, ma non rende automaticamente agevolabile un importo che supera un limite pertinente. Verifica il caso con il professionista prima di promettere al cliente una detrazione.",
      },
      {
        q: "Come gestisco una lavorazione che nel prezzario non esiste?",
        a: "Valuta un’analisi del nuovo prezzo secondo le regole applicabili, documentando quantità di materiali, impiego dei mezzi, tempi e costi della manodopera e le altre componenti pertinenti. Spese generali e utile devono seguire un criterio esplicito: evita percentuali universali presunte. Negli appalti pubblici verifica anche il percorso di determinazione e approvazione previsto per il contratto.",
      },
      {
        q: "Che differenza c'è tra prezzario regionale e listino DEI?",
        a: "Il prezzario regionale è predisposto dall’amministrazione competente; i listini DEI sono pubblicazioni private con proprie edizioni e condizioni di accesso. Hanno origine e perimetro differenti. Per scegliere quale riferimento utilizzare, verifica la finalità dell’elaborato e le fonti ammesse o richieste nel caso concreto, senza presumere che una sia sempre più aggiornata o prevalga sull’altra.",
      },
      {
        q: "I prezzi del prezzario includono già l'utile dell'impresa?",
        a: "Le componenti comprese vanno verificate nella singola voce e nelle avvertenze del prezzario utilizzato. Spese generali e utile non sono percentuali universali da sommare automaticamente. Prima di applicare ricarichi o ribassi, confronta la composizione della voce con il costo previsto della tua lavorazione: la perdita non si deduce da una percentuale isolata.",
      },
    ],
  },
  {
    id: "n5",
    slug: "cartello-di-cantiere-obbligatorio",
    updatedAt: "2026-11-04",
    video: { youtubeId: "tHdqM_ncn50", duration: "PT3M32S", uploadedAt: "2026-11-04T07:59:52+01:00" },
    title: "Cartello di cantiere: cosa scrivere, quando serve, sanzioni",
    excerpt:
      "Cartello di cantiere obbligatorio anche con CILA e SCIA? Cosa deve contenere, modello di testo pronto, dimensioni, chi risponde e sanzioni.",
    category: "Normativa",
    tags: ["cartello di cantiere", "DPR 380/2001", "permesso di costruire", "adempimenti cantiere"],
    publishedAt: "2026-07-25",
    readTime: 6,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/cartello-di-cantiere-obbligatorio.jpg",
    content: [
      {
        type: "intro",
        body: "Il vigile si ferma davanti alla recinzione. Non deve nemmeno entrare: il cartello non c'è, e da lì partono le domande. Il cartello di cantiere è obbligatorio: l'art. 27, comma 4, del DPR 380/2001 (Testo Unico dell'Edilizia) impone di indicare gli estremi del permesso di costruire in un cartello esposto presso il cantiere, secondo le modalità stabilite dal regolamento edilizio comunale. In pratica: ogni cantiere con un titolo abilitativo deve avere un cartello ben visibile dalla strada, completo dei dati di lavori, impresa e figure tecniche. Ecco cosa scriverci, chi risponde se manca e quanto costa dimenticarlo.",
      },
      {
        type: "section",
        heading: "Da dove nasce l'obbligo",
        body: "L'obbligo poggia su due gambe, e ti servono entrambe. La prima è il Testo Unico dell'Edilizia: l'art. 27, comma 4, del DPR 380/2001 prevede che gli estremi del permesso di costruire siano indicati nel cartello di cantiere, rimandando al regolamento edilizio comunale per le modalità. La seconda gamba sono proprio i regolamenti edilizi: quasi tutti i Comuni italiani dettagliano contenuti, dimensioni e obbligo di esposizione del cartello, estendendolo di fatto anche ai lavori in SCIA e CILA. A queste si aggiunge, su un piano diverso, la segnaletica di sicurezza del D.Lgs 81/08: divieto di accesso, obbligo DPI, pericolo — un'altra cosa, da esporre comunque. Prima di stampare, leggi il regolamento edilizio del Comune dove apri il cantiere: le regole puntuali stanno lì. E da un Comune all'altro cambiano.",
      },
      {
        type: "list",
        heading: "Cosa deve contenere il cartello di cantiere",
        items: [
          "Oggetto dei lavori: descrizione sintetica dell'intervento (es. «ristrutturazione edilizia con ampliamento»)",
          "Estremi del titolo abilitativo: numero e data del permesso di costruire, oppure riferimenti di SCIA o CILA",
          "Committente: nome o ragione sociale del titolare del titolo edilizio",
          "Impresa esecutrice: ragione sociale, sede e recapiti; eventuali imprese subappaltatrici con relativi dati",
          "Progettista e direttore dei lavori: nominativi e recapiti professionali",
          "Responsabile di cantiere o direttore tecnico dell'impresa",
          "Coordinatore per la sicurezza in progettazione e in esecuzione, quando nominati",
          "Date: inizio lavori e durata o fine presunta",
          "Se pertinente: estremi della notifica preliminare e diciture richieste per i lavori con detrazioni fiscali",
        ],
      },
      {
        type: "section",
        heading: "Chi risponde se il cartello manca",
        body: "Tre nomi finiscono sul verbale: titolare del permesso (committente), costruttore e direttore dei lavori. Sono i soggetti che rispondono della regolarità del cantiere, cartello compreso. In caso di controllo — vigili urbani, tecnici comunali, personale ispettivo — il cartello assente o incompleto è la prima irregolarità verbalizzata: si vede senza nemmeno entrare in cantiere. E c'è l'effetto collaterale che pochi calcolano: il cartello mancante è il classico innesco del controllo approfondito. L'ispettore che non lo trova inizia a chiedere titolo edilizio, notifica preliminare, DURC delle imprese, tessere di riconoscimento. Un pannello da poche decine di euro ti evita di trasformare un passaggio di routine in una giornata di verifiche.",
      },
      {
        type: "section",
        heading: "Le sanzioni",
        body: "La sanzione tipica è amministrativa, stabilita dal regolamento edilizio o dalle norme comunali: gli importi variano da Comune a Comune, di norma da qualche centinaio di euro fino a circa 1.000 €. Ma non finisce lì. Una parte della giurisprudenza ha ritenuto in passato che la violazione dell'obbligo, quando prescritto dal regolamento edilizio, potesse integrare la contravvenzione dell'art. 44, lettera a), del DPR 380/2001: ammenda penale. Gli orientamenti non sono uniformi e molto dipende dal caso concreto. Ma è esattamente il tipo di rischio che non ha senso correre per risparmiare un cartello. Regola pratica: cartello esposto dal primo giorno, aggiornato se cambiano imprese o direttore dei lavori, foto datata al momento dell'installazione conservata tra i documenti di commessa. Costo dell'operazione: mezz'ora. Alternativa: un verbale.",
      },
      {
        type: "section",
        heading: "Dimensioni, materiali e posizionamento consigliati",
        body: "Nessuna dimensione obbligatoria a livello nazionale: la fissano, quando lo fanno, i regolamenti comunali. Nella pratica professionale il formato minimo consigliato è 70×100 cm, con 100×140 cm per i cantieri su strada dove il cartello deve leggersi a distanza. Materiali: PVC o forex per durare, banner in PVC teso per i ponteggi. Evita la carta plastificata: dopo due piogge è illeggibile, e un cartello illeggibile equivale a un cartello assente. Posizionamento: all'ingresso del cantiere o sulla recinzione, visibile dalla pubblica via, senza ostacolare la segnaletica di sicurezza. Un'abitudine che costa zero: quando aggiorni il cartello, registra la modifica anche nel giornale dei lavori. La storia documentale del cantiere resta coerente — e in una contestazione è quella a salvarti.",
      },
      {
        type: "section",
        heading: "Modello di testo: cosa scrivere esattamente sul cartello",
        body: "Un protocollo ricopiato male trasforma il cartello in una prova contro di te. Un cartello completo riporta, nell'ordine: oggetto dei lavori (es. \"Ristrutturazione edilizia con ampliamento\"), estremi del titolo abilitativo (tipo, numero di protocollo e data della CILA, SCIA o permesso di costruire), nome del committente, impresa esecutrice con ragione sociale completa e i riferimenti del responsabile di cantiere, progettista e direttore dei lavori con i relativi ordini professionali, coordinatore per la sicurezza in fase di esecuzione quando nominato, data di inizio lavori e durata presunta. Molti Comuni chiedono anche l'indicazione delle imprese subappaltatrici principali: verifica sempre il regolamento edilizio locale, perché il contenuto minimo del cartello di cantiere lo fissa il Comune, non una norma nazionale unica. Un formato che funziona in pratica: pannello da almeno 100×70 cm, testo nero su fondo bianco, caratteri leggibili da 10 metri, all'ingresso del cantiere, visibile dalla strada pubblica.",
      },
      {
        type: "list",
        heading: "Checklist rapida prima di appendere il cartello",
        items: [
          "Estremi del titolo abilitativo ricopiati ESATTAMENTE dal documento (protocollo e data: è il primo controllo che fa il vigile)",
          "Nominativi e recapiti di progettista, DL e coordinatore sicurezza aggiornati — se cambia il DL a metà lavori, il cartello va aggiornato",
          "Ragione sociale completa dell'impresa, non il nome commerciale",
          "Data inizio lavori coerente con la comunicazione di inizio lavori depositata",
          "Materiale resistente alle intemperie: un cartello illeggibile equivale a un cartello assente",
          "Foto del cartello installato salvata nel fascicolo di cantiere: in caso di contestazione hai la prova della data di posa",
        ],
      },
      {
        type: "cta",
        heading: "Tutti i documenti del cantiere in un posto solo",
        body: "L'ispettore non avvisa prima di passare. Titoli edilizi, notifica preliminare, DURC delle imprese, verbali e foto del cartello: con Edilizia in Cloud ogni commessa ha il suo fascicolo digitale sempre a portata di telefono, anche con il verbale in mano. Prova gratis 31 giorni.",
      },
    ],
    faqs: [
      {
        q: "Il cartello di cantiere è obbligatorio anche per SCIA e CILA?",
        a: "Sì, nella pratica: quasi tutti i regolamenti edilizi comunali estendono l'obbligo ai lavori in SCIA e CILA, anche se l'art. 27, comma 4, del DPR 380/2001 parla di estremi del permesso di costruire. La regola operativa è semplice: se c'è un titolo abilitativo, esponi il cartello con i suoi estremi. Costa poco, evita contestazioni e dimostra a chiunque passi che il cantiere è regolare.",
      },
      {
        q: "Cosa rischio se il cartello manca?",
        a: "Rischi una sanzione amministrativa comunale, di norma da qualche centinaio di euro fino a circa 1.000 € a seconda del regolamento. In alcuni casi la giurisprudenza ha ipotizzato anche la contravvenzione penale dell'art. 44, lettera a), DPR 380/2001. E c'è il danno indiretto, spesso peggiore: il cartello mancante attira controlli approfonditi su titoli, DURC e presenze.",
      },
      {
        q: "Quali dimensioni deve avere il cartello di cantiere?",
        a: "Almeno 70×100 cm nella pratica professionale, meglio 100×140 cm per i cantieri su strada: nessuna norma nazionale fissa le dimensioni, decidono i regolamenti comunali quando lo fanno. Il criterio guida è la leggibilità: caratteri grandi, materiale resistente alle intemperie e posizione visibile dalla pubblica via, all'ingresso o sulla recinzione.",
      },
      {
        q: "Chi deve pagare e installare il cartello?",
        a: "Nella prassi lo predispone l'impresa esecutrice, e il costo (poche decine di euro per un pannello in forex, qualche centinaio per i banner grandi) rientra nelle spese di impianto cantiere. La legge non lo dice: chiariscilo nel contratto d'appalto per evitare rimpalli. La responsabilità dell'esposizione coinvolge comunque committente, impresa e direttore dei lavori.",
      },
      {
        q: "Serve una dicitura particolare per i lavori con bonus fiscali?",
        a: "Sì, per alcuni incentivi è stata richiesta: con il Superbonus serviva una dicitura specifica sui lavori agevolati esposta in cartello. Le regole cambiano con le versioni dei bonus: prima di stampare, verifica con il tecnico o il commercialista la formula aggiornata per l'incentivo che stai usando e riportala esattamente nel cartello.",
      },
    ],
  },
  {
    id: "n6",
    slug: "notifica-preliminare-cantiere",
    video: { youtubeId: "MjlWZJTEZRA", duration: "PT4M11S", uploadedAt: "2026-11-04T08:21:09+01:00" },
    title: "Notifica preliminare: quando serve e come inviarla",
    excerpt:
      "Notifica preliminare: quando è dovuta, chi la trasmette, destinatari, ricevuta e aggiornamenti da verificare prima di iniziare il cantiere.",
    category: "Normativa",
    tags: ["notifica preliminare", "art. 99 D.Lgs 81/08", "apertura cantiere", "adempimenti cantiere"],
    publishedAt: "2026-07-25",
    updatedAt: "2026-11-04",
    readTime: 7,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/notifica-preliminare-cantiere.jpg",
    content: [
      {
        type: "intro",
        body: "La notifica preliminare cantiere è la comunicazione che il committente o il responsabile dei lavori deve trasmettere prima dell’inizio nei casi dell’art. 99 del D.Lgs. 81/2008. I destinatari sono ASL e ufficio del lavoro territorialmente competenti e, limitatamente ai lavori pubblici, anche il prefetto. I presupposti comprendono più imprese esecutrici anche non contemporanee, le varianti che fanno ricadere in tale situazione e l’unica impresa con entità presunta non inferiore a 200 uomini-giorno. Non sostituisce titolo edilizio, PSC o POS: prima dell’ingresso verifica se è dovuta e acquisisci copia e ricevuta dal soggetto competente.",
      },
      {
        type: "callout",
        variant: "info",
        heading: "Quando la notifica preliminare NON serve",
        body: "Non serve quando in cantiere lavora una sola impresa per tutta la durata dei lavori e l'entità presunta resta sotto i 200 uomini-giorno. Esempio: il rifacimento di un bagno fatto da un'unica impresa con due operai per tre settimane (30 uomini-giorno).\n\nAttenzione al caso che fa scattare l'obbligo a lavori in corso: se entra una seconda impresa, per esempio l'elettricista con la sua ditta o un subappaltatore non previsto, la notifica va inviata prima che inizi a lavorare, insieme alla nomina del coordinatore per l'esecuzione.",
      },
      {
        type: "section",
        heading: "Quando è obbligatoria: i tre casi dell'art. 99",
        body: "Due operai per tre settimane, o quattro operai per tre mesi: la differenza decide se la notifica serve. L'art. 99, comma 1, del D.Lgs 81/08 elenca tre situazioni. Prima: cantieri in cui è prevista la presenza di più imprese esecutrici, anche non contemporanea — gli stessi in cui scatta l'obbligo del coordinatore per la sicurezza. Seconda: cantieri partiti con un'unica impresa che ricadono nel primo caso per effetto di varianti in corso d'opera — la classica seconda impresa chiamata a cantiere aperto. Terza: cantieri con un'unica impresa la cui entità presunta è pari o superiore a 200 uomini-giorno. Gli uomini-giorno sono la somma delle giornate lavorative di tutte le persone previste. Fai i conti: 4 operai per 60 giorni lavorativi fanno 240 uomini-giorno — notifica obbligatoria anche con una sola impresa. 2 operai per 3 settimane fanno 30 uomini-giorno: con una sola impresa, la notifica non serve. Cinque minuti di calcolo prima di aprire il cantiere ti dicono da che parte stai.",
      },
      {
        type: "section",
        heading: "Chi la invia e a chi",
        body: "L'obbligo non è tuo: è del committente o, se nominato, del responsabile dei lavori. Ma il cantiere irregolare è anche tuo. Un cantiere senza notifica, quando era dovuta, espone tutte le imprese che ci lavorano: per questo devi presidiare l'adempimento anche se non ti spetta. I destinatari sono l'ASL competente per territorio e l'Ispettorato territoriale del lavoro, prima dell'inizio dei lavori. Copia della notifica va affissa in maniera visibile presso il cantiere — di solito accanto al cartello lavori — e custodita a disposizione degli organi di vigilanza. Per gli appalti pubblici e i lavori con più imprese, la notifica viaggia insieme al resto del pacchetto documentale: PSC, POS delle imprese, DURC e idoneità tecnico-professionale. Regola d'ingaggio semplice: niente copia della notifica, niente inizio lavori.",
      },
      {
        type: "section",
        heading: "Come si invia: i portali regionali",
        body: "La trasmissione segue le modalità previste dagli enti del territorio: non esiste una procedura unica né un tempo garantito per ogni pratica. In Lombardia la Regione indica il servizio telematico cantieri per l’invio. Negli altri territori consulta le istruzioni ufficiali prima di scegliere portale, destinatari o PEC. Compila i contenuti dell’Allegato XII con dati coerenti e conserva la ricevuta e gli eventuali aggiornamenti nel fascicolo della commessa. Per incentivi e altre pratiche, verifica separatamente quali documenti e requisiti sono richiesti.",
      },
      {
        type: "list",
        heading: "Cosa contiene la notifica preliminare (Allegato XII D.Lgs 81/08)",
        items: [
          "Data della comunicazione e indirizzo esatto del cantiere",
          "Committente (nome e indirizzo) ed eventuale responsabile dei lavori",
          "Natura dell'opera: descrizione sintetica dell'intervento",
          "Coordinatore per la sicurezza in progettazione e in esecuzione, se nominati",
          "Data presunta di inizio dei lavori e durata presunta",
          "Numero massimo presunto di lavoratori contemporaneamente presenti in cantiere",
          "Numero previsto di imprese e lavoratori autonomi",
          "Identificazione delle imprese già selezionate (ragione sociale, sede, codice fiscale)",
          "Ammontare complessivo presunto dei lavori in euro",
        ],
      },
      {
        type: "section",
        heading: "Aggiornamenti in corso d'opera",
        body: "La notifica non è una foto scattata una volta sola. Va aggiornata quando cambiano i dati rilevanti: ingresso di nuove imprese (compresi i subappaltatori non previsti all'inizio), proroga significativa della durata, aumento dell'importo lavori. Il caso più delicato: cantiere partito con una sola impresa, senza coordinatore, che a metà lavori ne accoglie una seconda. Lì scattano insieme la nomina del coordinatore per l'esecuzione, l'adeguamento documentale e la notifica (o il suo aggiornamento). Una buona gestione dei subappaltatori aiuta proprio qui: se sai in anticipo chi entrerà in cantiere e quando, l'aggiornamento è una pratica di dieci minuti. Se lo scopri il giorno prima è una corsa — e i lavori, intanto, sono formalmente irregolari.",
      },
      {
        type: "section",
        heading: "Sanzioni e conseguenze pratiche",
        body: "Non è corretto attribuire una multa unica di 500–1.800 euro a ogni omissione della notifica richiamando genericamente l’art. 157. Devono essere individuate le violazioni effettive e i soggetti responsabili. L’art. 90, comma 10, prevede conseguenze sull’efficacia del titolo abilitativo anche in assenza della notifica quando dovuta. Coordinamento, piani, regolarità e requisiti di eventuali agevolazioni vanno verificati nel caso concreto con i professionisti competenti. Per l’impresa il controllo pratico resta questo: prima di iniziare chiedi se la notifica è dovuta, acquisisci la versione corretta e conserva invio, ricevuta e aggiornamenti.",
      },
      {
        type: "cta",
        heading: "Apri ogni cantiere con i documenti giusti",
        body: "La notifica preliminare non si rincorre a cantiere aperto: si archivia prima di aprirlo. Con Edilizia in Cloud ogni commessa parte con la sua checklist — notifica, POS, DURC delle imprese e scadenze documentali — tutto nel fascicolo digitale del cantiere con promemoria automatici. Prova gratis 31 giorni.",
      },
    ],
    faqs: [
      {
        q: "La notifica preliminare è sempre obbligatoria?",
        a: "No. Serve solo nei casi dell'art. 99 del D.Lgs 81/08: più imprese esecutrici, anche non contemporanee; una seconda impresa entrata con una variante; oppure una sola impresa con almeno 200 uomini-giorno. Un cantiere con un'unica impresa che resta sotto i 200 uomini-giorno non la richiede.",
      },
      {
        q: "Come si fa la notifica preliminare in Lombardia?",
        a: "In Lombardia la Regione indica la trasmissione telematica attraverso il servizio cantieri. In altri territori vanno consultate le istruzioni ufficiali degli enti competenti: portale, destinatari e modalità non devono essere presunti. Conserva sempre ricevuta e aggiornamenti nel fascicolo di commessa.",
      },
      {
        q: "Quando è obbligatoria la notifica preliminare?",
        a: "È obbligatoria in tre casi (art. 99 D.Lgs 81/08): cantieri con più imprese esecutrici anche non contemporanee, cantieri che finiscono in quella situazione per varianti in corso d'opera, e cantieri con un'unica impresa ma entità presunta pari o superiore a 200 uomini-giorno. Per una ristrutturazione con una sola impresa sotto quella soglia, la notifica non serve.",
      },
      {
        q: "Chi deve inviare la notifica preliminare?",
        a: "Il soggetto obbligato è il committente o il responsabile dei lavori. L’eventuale assistenza tecnica nella trasmissione non va confusa con la titolarità dell’obbligo. L’impresa verifica prima dell’ingresso se la notifica è dovuta e ne acquisisce copia e ricevuta. La copia deve essere affissa in modo visibile in cantiere e custodita per gli organi di vigilanza.",
      },
      {
        q: "Come si calcolano gli uomini-giorno?",
        a: "Moltiplica il numero medio di lavoratori per i giorni lavorativi previsti: la somma delle giornate presunte di tutte le persone impiegate è l'entità del lavoro. Esempio: 4 operai per 60 giorni = 240 uomini-giorno, sopra la soglia di 200 e quindi con obbligo di notifica anche con una sola impresa. Nel dubbio stima in modo realistico, non ottimistico.",
      },
      {
        q: "Come si invia la notifica preliminare?",
        a: "Segui le istruzioni ufficiali degli enti territorialmente competenti. In Lombardia la Regione indica il servizio telematico cantieri. In altri territori non presumere portale o PEC: verifica canale e destinatari, compreso il prefetto per i lavori pubblici, e conserva ricevuta e aggiornamenti.",
      },
      {
        q: "Cosa succede se entra una seconda impresa a cantiere già aperto?",
        a: "Scattano tre adempimenti insieme (art. 90 D.Lgs 81/08): il committente deve nominare il coordinatore per la sicurezza in esecuzione (se non c'era), far predisporre il PSC e inviare o aggiornare la notifica preliminare. Succede spesso con i subappalti decisi in corsa: pianificare in anticipo chi entrerà in cantiere evita di trovarsi con lavori formalmente irregolari da un giorno all'altro.",
      },
      {
        q: "Quali sanzioni rischia chi non invia la notifica?",
        a: "Non esiste una multa unica da attribuire automaticamente a ogni omissione richiamando l’art. 157. Occorre individuare violazione, obblighi e soggetti responsabili. L’art. 90, comma 10, prevede conseguenze sull’efficacia del titolo abilitativo quando manca la notifica dovuta. Verifica tempestivamente il caso con i professionisti competenti.",
      },
    ],
  },
  {
    id: "n7",
    slug: "libretto-delle-misure",
    title: "Libretto delle misure: cos'è e come si compila in cantiere",
    excerpt:
      "Una misura non firmata è una quantità che non ti pagano: come si compila il libretto delle misure, chi lo firma, le riserve e il collegamento con i SAL.",
    category: "Normativa",
    tags: ["libretto delle misure", "contabilità lavori", "SAL", "direzione lavori"],
    publishedAt: "2026-07-25",
    readTime: 6,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/libretto-delle-misure.jpg",
    content: [
      {
        type: "intro",
        body: "Lo scavo è rinterrato da tre settimane. Il committente contesta le quantità. Tu non hai una misura firmata: hai un ricordo. Il libretto delle misure è il documento contabile in cui il direttore dei lavori registra le quantità delle lavorazioni via via eseguite in cantiere. È il primo anello della contabilità lavori: dalle misure del libretto nascono il registro di contabilità, gli stati di avanzamento e i certificati di pagamento. Nei lavori pubblici è obbligatorio per legge; nei privati è la base concreta per farsi pagare il giusto. Chi lo tiene aggiornato incassa. Chi lo trascura discute.",
      },
      {
        type: "section",
        heading: "Cos'è e dove è previsto",
        body: "Prima i fatti, poi i prezzi: la contabilità lavori funziona così da sempre. Nella contabilità dei lavori pubblici il libretto delle misure è uno dei documenti contabili ufficiali, storicamente disciplinato dal DM 49/2018 e oggi, per i contratti del nuovo Codice, dall'Allegato II.14 del D.Lgs 36/2023 sulla direzione dei lavori. Il pacchetto completo comprende: giornale dei lavori, libretto delle misure, registro di contabilità, sommario del registro, stati di avanzamento, certificati di pagamento e conto finale. Il libretto è il documento «di prima nota» della contabilità tecnica: fotografa cosa è stato fatto e in che quantità, senza prezzi. Se le misure sono contestabili, tutto quello che viene dopo — SAL, certificati, fatture — è contestabile a cascata. Un libretto debole indebolisce ogni euro che devi ancora incassare.",
      },
      {
        type: "section",
        heading: "Chi lo tiene e chi lo firma",
        body: "Due firme sotto ogni misura: quella del direttore dei lavori e quella tua. La tenuta del libretto spetta al direttore dei lavori, che può avvalersi di direttori operativi e ispettori di cantiere sotto la propria responsabilità. Le misurazioni si fanno in contraddittorio con l'impresa: il tuo rappresentante partecipa al rilievo e firma il libretto insieme al DL. Quel contraddittorio è la tua vera garanzia: una misura rilevata insieme e firmata da entrambi è un fatto acquisito, difficilissimo da rimettere in discussione a distanza di mesi. Non concordi con una misura? Non rifiutare la firma. Firma e formula le tue riserve, che vanno poi iscritte e motivate nel registro di contabilità nei termini previsti, pena la decadenza. Le riserve non coltivate nei tempi giusti sono soldi persi: è una delle regole più dure e meno conosciute della contabilità lavori.",
      },
      {
        type: "section",
        heading: "Come si compila: la tecnica",
        body: "Data, voce, dimensioni, quantità, firme: ogni registrazione vive di questi cinque elementi. Ogni riga del libretto contiene la data del rilievo, il riferimento alla voce di computo metrico o all'articolo dell'elenco prezzi, la descrizione della lavorazione misurata, le dimensioni rilevate (lunghezze, larghezze, altezze o profondità, pesi) e la quantità risultante, con schizzi e disegni quando servono a individuare il punto esatto. Tre regole pratiche. Prima: registra man mano che le lavorazioni avanzano, non ricostruire a fine mese — le misure «a memoria» sono il modo migliore per litigare. Seconda: le lavorazioni destinate a sparire (scavi da rinterrare, ferri da annegare nel getto, impianti sotto traccia) vanno misurate PRIMA che diventino invisibili, con foto a supporto. Terza: niente cancellature. Gli errori si correggono con annotazioni che lasciano leggibile il dato originario: il libretto è un documento con valore probatorio, non un blocco appunti.",
      },
      {
        type: "section",
        heading: "Dal libretto al SAL: come si collega tutto",
        body: "La velocità con cui incassi si decide qui, non in banca. Il flusso della contabilità lavori è una catena a quattro anelli. Le quantità accertate nel libretto delle misure confluiscono nel registro di contabilità, dove vengono moltiplicate per i prezzi contrattuali; il sommario del registro riepiloga gli importi per voce. Alle scadenze previste dal contratto il direttore dei lavori emette lo stato avanzamento lavori (SAL), che riassume tutto quanto eseguito dall'inizio. Sul SAL il RUP emette il certificato di pagamento, con la ritenuta dello 0,5% a garanzia degli obblighi verso i lavoratori. Da lì parte la tua fattura, da pagare nei termini di legge (di norma 30 giorni). Un libretto aggiornato ogni settimana significa SAL emessi senza discussioni. Un libretto arretrato di due mesi significa incassi fermi — mentre i fornitori, loro, vanno pagati comunque.",
      },
      {
        type: "section",
        heading: "Libretto delle misure nei lavori privati",
        body: "Nel privato nessuna legge lo impone. Il tuo interesse sì. Se il contratto è a misura, qualcuno deve pur accertare le quantità da pagare. Tenere un libretto anche nel privato — pure in forma semplificata — ti protegge su tre fronti: gli acconti si agganciano a quantità firmate invece che a percentuali «a sentimento», le varianti extra contratto vengono misurate e riconosciute subito invece di finire nel dimenticatoio, e in caso di contenzioso hai un documento tecnico firmato dalle parti, che davanti a un CTU vale più di qualsiasi ricostruzione a posteriori. Il collegamento con il computo metrico iniziale chiude il cerchio: confrontando eseguito e preventivato scopri in tempo reale se la commessa sta reggendo il margine o lo sta perdendo. Meglio scoprirlo al 30% dei lavori che al saldo.",
      },
      {
        type: "section",
        heading: "La contabilità di cantiere in digitale",
        body: "Ogni ricopiatura è un'occasione di errore. E un errore di quantità su una voce da 40 €/mq ripetuto per 300 mq vale 12.000 €. Il nuovo Codice appalti spinge esplicitamente verso la contabilità con strumenti digitali, e i vantaggi sono immediati anche nel privato: misure inserite da smartphone direttamente in cantiere, foto e posizione allegate a ogni rilievo, quantità che si agganciano da sole alle voci di computo e confluiscono nello stato di avanzamento senza ricopiature. La ricopiatura è il punto debole storico della contabilità cartacea: ogni passaggio a mano dal blocchetto al foglio di calcolo è un rischio che paghi tu. Con la fatturazione elettronica collegata a valle, il ciclo misura-SAL-fattura-incasso diventa un flusso unico controllabile, invece di quattro mondi separati che qualcuno deve riconciliare a mano ogni fine mese.",
      },
      {
        type: "cta",
        heading: "Dalle misure al SAL senza ricopiature",
        body: "La misura non firmata oggi è la contestazione di domani. Con Edilizia in Cloud registri le quantità da smartphone, le colleghi al computo della commessa e generi stati di avanzamento e fatture senza doppi inserimenti. Prova gratis 31 giorni sul tuo prossimo cantiere a misura.",
      },
    ],
    faqs: [
      {
        q: "Che differenza c'è tra libretto delle misure e registro di contabilità?",
        a: "Il libretto delle misure accerta le quantità eseguite, senza prezzi: è il documento tecnico dei fatti. Il registro di contabilità prende quelle quantità e le moltiplica per i prezzi contrattuali, trasformandole in importi. Prima si misura, poi si valorizza: se salti il primo passaggio o lo fai male, tutti gli importi a valle diventano contestabili.",
      },
      {
        q: "Chi firma il libretto delle misure?",
        a: "Lo firmano in due: il direttore dei lavori (o il direttore operativo/ispettore che ha eseguito il rilievo sotto la sua responsabilità) e il rappresentante dell'impresa esecutrice, perché le misurazioni si fanno in contraddittorio. La doppia firma è la garanzia di entrambe le parti: una quantità firmata insieme è un fatto acquisito, non un'opinione da ridiscutere al momento del pagamento.",
      },
      {
        q: "Cosa faccio se non concordo con una misura del direttore dei lavori?",
        a: "Firma e formula riserva: mai rifiutare la firma. Poi iscrivi e motiva la riserva nel registro di contabilità nei termini previsti dalla disciplina applicabile, altrimenti il diritto decade. Le riserve sono lo strumento con cui tieni vive le tue pretese economiche: gestirle nei tempi giusti è tanto importante quanto eseguire bene i lavori.",
      },
      {
        q: "Il libretto delle misure serve anche nei lavori privati?",
        a: "Obbligatorio no, ma nei contratti a misura è fortemente consigliato: aggancia gli acconti a quantità firmate, fa riconoscere subito le varianti e costituisce prova tecnica in caso di contenzioso. Anche in forma semplificata — data, voce, dimensioni, quantità, firme — cambia completamente il rapporto di forza quando si discute di pagamenti.",
      },
      {
        q: "Come misuro le lavorazioni che poi non si vedono più?",
        a: "Misurale prima che spariscano: scavi prima del rinterro, armature prima del getto, impianti prima della chiusura delle tracce. Il rilievo va fatto in contraddittorio e annotato subito nel libretto, con foto datate a supporto. Una lavorazione coperta senza misura condivisa è quasi impossibile da dimostrare dopo: si finisce a stime al ribasso, e a rimetterci è sempre chi ha eseguito.",
      },
      {
        q: "Posso tenere il libretto delle misure in digitale?",
        a: "Sì: per i contratti pubblici il D.Lgs 36/2023 spinge proprio verso la contabilità digitale, e nel privato sei libero di scegliere gli strumenti. I requisiti di sostanza restano gli stessi: registrazioni tempestive, riferite alle voci di computo, con data certa e tracciabilità delle correzioni. Il vantaggio è eliminare le ricopiature, che sono la prima fonte di errori e contestazioni.",
      },
    ],
  },
  {
    id: "n8",
    slug: "split-payment-lavori-pubblici",
    title: "Split payment lavori pubblici: guida per imprese edili",
    excerpt:
      "Con lo split payment incassi solo l'imponibile: la PA versa l'IVA all'Erario. Quando si applica, quando prevale il reverse charge, come difendere la cassa.",
    category: "Finanza",
    tags: ["split payment", "IVA edilizia", "appalti pubblici", "liquidità"],
    publishedAt: "2026-07-25",
    readTime: 8,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/split-payment-lavori-pubblici.jpg",
    content: [
      {
        type: "intro",
        body: "Fattura da 110.000 € al Comune. Bonifico in arrivo: 100.000 €. I 10.000 € di IVA non li vedrai mai — e intanto l'IVA sui materiali l'hai già pagata tu. Lo split payment nei lavori pubblici è il regime IVA dell'art. 17-ter del DPR 633/72, detto scissione dei pagamenti: la Pubblica Amministrazione paga al fornitore solo l'imponibile e versa l'IVA direttamente all'Erario. Per lo Stato azzera il rischio di frode. Per te crea un problema concreto di liquidità: si gestisce, ma solo se lo conosci prima di firmare la commessa.",
      },
      {
        type: "section",
        heading: "Come funziona l'art. 17-ter",
        body: "Emetti la fattura con l'IVA esposta, come sempre. La differenza sta in chi la versa. Con la scissione dei pagamenti, introdotta dalla legge 190/2014 e in vigore dal 1° gennaio 2015, il cliente pubblico trattiene l'imposta e la versa direttamente all'Erario: a te arriva solo l'imponibile. I soggetti obbligati ad applicarla sono le Pubbliche Amministrazioni destinatarie della fatturazione elettronica obbligatoria e le società da esse controllate individuate dagli elenchi ufficiali; le società quotate del FTSE MIB, storicamente incluse, sono uscite dal regime dal 1° luglio 2025. Un dettaglio da non dimenticare: lo split payment è una deroga alle regole IVA europee e vive di autorizzazioni UE a scadenza, l'ultima delle quali fissata al 30 giugno 2026. Verifica sempre con il tuo commercialista lo stato del regime al momento in cui fatturi: perimetro e proroghe cambiano nel tempo, e fatturare col regime sbagliato costa.",
      },
      {
        type: "section",
        heading: "Quando si applica e quando no",
        body: "Non tutte le fatture verso il pubblico finiscono in split. E non tutte le fatture di un'opera pubblica riguardano la PA. Lo split payment si applica alle cessioni di beni e prestazioni di servizi effettuate verso i soggetti obbligati, quando l'operazione sconta IVA nei modi ordinari. Non si applica in tre famiglie di casi che interessano l'edilizia: le operazioni soggette a reverse charge (che prevale sempre sullo split), le operazioni di chi è fuori dal campo IVA ordinario come i forfettari, e i compensi assoggettati a ritenuta alla fonte a titolo d'imposta secondo le esclusioni introdotte nel tempo. Per capire se il tuo cliente è in split payment non devi indovinare: per le PA fa fede l'Indice delle Pubbliche Amministrazioni (IPA), per le società controllate valgono gli elenchi pubblicati e aggiornati ogni anno dal Dipartimento delle Finanze. Un minuto di controllo prima della prima fattura di commessa. Molto meno di quanto costa correggere dopo.",
      },
      {
        type: "list",
        heading: "Reverse charge o split payment: la tabella decisionale",
        items: [
          "Sei subappaltatore e fatturi all'appaltatore (impresa privata) in un'opera pubblica → reverse charge lettera a): il tuo cliente è l'impresa, non la PA",
          "Sei appaltatore principale e fatturi alla stazione appaltante per lavori di costruzione → split payment: IVA esposta, incassi solo l'imponibile",
          "Fatturi alla PA servizi di pulizia, demolizione, impianti o completamento su edifici e la PA agisce nella propria sfera commerciale (come soggetto passivo) → reverse charge lettera a-ter): lo split non si applica",
          "Stessi servizi, ma la PA li acquista nella sfera istituzionale → split payment con IVA esposta",
          "Fatturi a un'impresa privata in appalto diretto fuori dai casi a-ter) → IVA ordinaria, né split né reverse",
          "Sei in regime forfettario → né split né reverse: fatturi secondo il tuo regime",
          "Nel dubbio sulla natura del cliente → verifica IPA ed elenchi del Dipartimento delle Finanze, poi conferma con il commercialista",
        ],
      },
      {
        type: "section",
        heading: "Come si fattura in split payment",
        body: "SAL da 100.000 € con IVA al 10%: fattura da 110.000 €, incasso di 100.000 €. I 10.000 € li versa il Comune direttamente all'Erario. La fattura in split payment espone regolarmente imponibile e IVA con l'aliquota dovuta (per i lavori pubblici spesso il 10%, altrimenti il 22%), più l'annotazione obbligatoria «scissione dei pagamenti — art. 17-ter DPR 633/72». Nella fatturazione elettronica il campo esigibilità IVA va valorizzato con «S» (scissione dei pagamenti): è quel codice a dire al sistema, e alla contabilità, che l'imposta non entrerà mai nella tua liquidazione. In contabilità l'IVA in split si neutralizza e non concorre al debito del periodo. Se il gestionale non gestisce l'esigibilità «S» in automatico, gli errori di liquidazione sono dietro l'angolo: e versare imposta non dovuta è liquidità regalata.",
      },
      {
        type: "section",
        heading: "L'impatto sulla liquidità (il vero problema)",
        body: "Compri con IVA, vendi senza incassarla: il credito IVA cresce mese dopo mese. È l'effetto strutturale dello split payment. Paghi ai fornitori i materiali con IVA al 22%, fatturi SAL di cui incassi il solo imponibile: l'IVA sugli acquisti resta a tuo credito e la cassa la anticipa la tua impresa. Su una commessa pubblica da 500.000 € con 200.000 € di acquisti, parliamo di oltre 40.000 € di IVA anticipata ai fornitori e recuperabile solo a valle. Le contromisure previste dal sistema: il rimborso IVA in via prioritaria per chi opera in split payment (art. 38-bis DPR 633/72), da chiedere in dichiarazione o con istanza trimestrale, e la compensazione in F24 nei limiti di legge. La contromisura che dipende da te: pianifica i flussi di cassa della commessa mettendo in conto l'IVA anticipata fin dal preventivo. Scoprirla a metà lavori, con i fornitori che battono cassa, è il modo più caro di impararlo.",
      },
      {
        type: "section",
        heading: "Errori e sanzioni",
        body: "L'errore più frequente è di inquadramento: split dove andava il reverse charge, o viceversa. La bussola è una: il reverse charge prevale sempre. Il caso tipico è il subappaltatore che per riflesso condizionato fattura «come si fa con il Comune» quando il suo cliente è in realtà l'appaltatore privato. Il secondo errore è formale ma sanzionato: omettere l'annotazione «scissione dei pagamenti» in fattura. Costo: sanzione amministrativa da 1.000 a 8.000 € (art. 9 del D.Lgs 471/97). Il terzo è contabile: registrare l'IVA in split come IVA a debito ordinaria, gonfiando la liquidazione e versando imposta non dovuta. Ultimo presidio, banale ma decisivo: il DURC regolare. Nei pagamenti pubblici la verifica è sistematica, e un DURC irregolare blocca il mandato di pagamento ben più a lungo di qualsiasi questione IVA.",
      },
      {
        type: "cta",
        heading: "Fattura alla PA senza sorprese di cassa",
        body: "L'IVA che anticipi su una commessa pubblica non deve essere una sorpresa di metà cantiere. Con Edilizia in Cloud imposti lo split payment sul cliente pubblico una volta sola: esigibilità «S», diciture e registrazioni corrette in automatico, e la tesoreria ti mostra quanto stai anticipando di IVA su ogni commessa. Prova gratis 31 giorni.",
      },
    ],
    faqs: [
      {
        q: "Cos'è lo split payment in due parole?",
        a: "È la scissione dei pagamenti dell'art. 17-ter DPR 633/72: la PA e le società individuate dagli elenchi ufficiali pagano al fornitore solo l'imponibile della fattura e versano l'IVA direttamente all'Erario. L'impresa espone l'IVA in fattura ma non la incassa mai: l'imposta non transita dalla sua liquidazione e la fattura elettronica lo segnala con l'esigibilità «S».",
      },
      {
        q: "Lo split payment si applica anche ai subappaltatori?",
        a: "No, di regola. Il subappaltatore fattura all'appaltatore, che è un'impresa privata: su quelle prestazioni edili si applica il reverse charge della lettera a) dell'art. 17, comma 6, DPR 633/72, non lo split payment. Lo split riguarda chi fattura direttamente al soggetto pubblico, tipicamente l'appaltatore principale verso la stazione appaltante.",
      },
      {
        q: "Come faccio a sapere se un cliente è soggetto a split payment?",
        a: "Controlla due elenchi ufficiali: per le Pubbliche Amministrazioni fa fede l'iscrizione all'Indice delle Pubbliche Amministrazioni (IPA), per le società controllate pubbliche valgono gli elenchi pubblicati e aggiornati annualmente dal Dipartimento delle Finanze. Il controllo va fatto prima di emettere la prima fattura della commessa e conviene rifarlo a ogni nuovo anno, perché gli elenchi cambiano.",
      },
      {
        q: "Come recupero l'IVA a credito generata dallo split payment?",
        a: "In due modi: con il rimborso IVA, che per chi opera in split payment è riconosciuto in via prioritaria (art. 38-bis DPR 633/72), richiedibile in dichiarazione annuale o con istanza trimestrale al ricorrere dei presupposti, oppure compensando il credito in F24 nei limiti di legge. La scelta tra rimborso e compensazione dipende dai tuoi debiti fiscali e contributivi: valutala con il commercialista.",
      },
      {
        q: "Cosa rischio se dimentico la dicitura «scissione dei pagamenti»?",
        a: "Rischi una sanzione amministrativa da 1.000 a 8.000 € (art. 9 D.Lgs 471/97) per l'omessa annotazione sulla fattura. L'errore è facile da evitare impostando il regime sul cliente nel gestionale: dicitura ed esigibilità «S» escono in automatico su ogni fattura della commessa, invece di dipendere dalla memoria di chi fattura quel giorno.",
      },
      {
        q: "Lo split payment è ancora in vigore?",
        a: "Sì, ma a scadenza: lo split payment è una deroga alle regole IVA europee autorizzata dall'UE, con l'ultima proroga nota fissata al 30 giugno 2026, e dal 1° luglio 2025 sono uscite dal regime le società quotate del FTSE MIB. Prima di impostare le fatture di una nuova commessa pubblica, verifica con il commercialista lo stato aggiornato dell'autorizzazione e del perimetro soggettivo.",
      },
    ],
  },
];
