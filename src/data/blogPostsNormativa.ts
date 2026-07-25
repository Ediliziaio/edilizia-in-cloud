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
      "Il reverse charge sposta il versamento dell'IVA sul committente: i casi dell'art. 17 c.6 DPR 633/72, le diciture esatte in fattura, errori e sanzioni.",
    category: "Fisco e Fatturazione",
    tags: ["reverse charge", "IVA edilizia", "subappalto", "fatturazione edilizia"],
    publishedAt: "2026-07-25",
    readTime: 10,
    author: { name: "Florin Andriciuc", role: "Founder & CEO", avatar: FLO_AVATAR },
    coverImage: "/blog/covers/sistema-fatturazione-aziende-edili.jpg",
    content: [
      {
        type: "intro",
        body: "Il reverse charge in edilizia è un meccanismo IVA per cui chi esegue la prestazione emette fattura senza imposta e l'IVA viene assolta dal committente, che integra il documento registrandola a debito e a credito. Lo prevede l'art. 17, comma 6, del DPR 633/72 per i subappalti edili (lettera a) e per pulizia, demolizione, installazione impianti e completamento di edifici (lettera a-ter). Sbagliare regime costa caro: le sanzioni partono da 250 € e arrivano al 90% dell'imposta nei casi peggiori.",
      },
      {
        type: "section",
        heading: "Perché esiste il reverse charge (e perché colpisce proprio l'edilizia)",
        body: "Il reverse charge nasce per combattere le frodi IVA nelle filiere lunghe: nelle catene di subappalto capitava che il subappaltatore incassasse l'IVA dal committente e sparisse senza versarla all'Erario. Con l'inversione contabile il problema si elimina alla radice, perché l'IVA non passa mai di mano: la assolve direttamente chi riceve la prestazione. In edilizia il meccanismo è attivo dal 1° gennaio 2007 per i subappalti (lettera a) ed è stato esteso dal 1° gennaio 2015, con la legge 190/2014, ai servizi della lettera a-ter. Conseguenza pratica per la tua impresa: se lavori in subappalto, emetti fatture senza IVA e quindi non incassi mai quel 10% o 22% in più. È un dettaglio che pesa sui flussi di cassa e va considerato quando pianifichi incassi e pagamenti.",
      },
      {
        type: "section",
        heading: "Lettera a): il subappalto edile",
        body: "La lettera a) dell'art. 17, comma 6, DPR 633/72 si applica alle prestazioni di servizi, compresa la fornitura di manodopera, rese nel settore edile da un subappaltatore nei confronti dell'appaltatore principale o di un altro subappaltatore. Servono tre condizioni insieme: deve trattarsi di un contratto di subappalto (o prestazione d'opera), la prestazione deve rientrare nelle attività edili della sezione F della classificazione ATECO, ed entrambe le imprese devono operare nel comparto costruzioni. Restano fuori per espressa previsione di legge le prestazioni rese verso un contraente generale a cui il committente ha affidato la totalità dei lavori. E soprattutto: l'appalto diretto con il committente finale NON è subappalto, quindi la lettera a) non si applica — lì vale l'IVA ordinaria, salvo che scatti la lettera a-ter.",
      },
      {
        type: "section",
        heading: "Lettera a-ter): pulizia, demolizione, impianti e completamento di edifici",
        body: "La lettera a-ter) è più ampia e più insidiosa: dal 2015 il reverse charge si applica alle prestazioni di pulizia, demolizione, installazione di impianti e completamento relative a edifici, anche in appalto diretto, senza bisogno di alcun subappalto. L'unica condizione è che il committente sia un soggetto passivo IVA (impresa o professionista): verso i privati consumatori resta sempre l'IVA ordinaria. Per «completamento» l'Agenzia delle Entrate intende lavorazioni come intonacatura, posa di infissi e serramenti, tinteggiatura, posa di pavimenti e rivestimenti. Attenzione al perimetro: la norma parla di «edifici», quindi strade, fognature, piazzali e opere di urbanizzazione ne restano fuori — su quelle il reverse scatta solo in subappalto, con la lettera a).",
      },
      {
        type: "list",
        heading: "Reverse charge sì o no: la tabella dei casi",
        items: [
          "Subappaltatore edile che fattura all'appaltatore principale o a un altro subappaltatore → SÌ, reverse charge lettera a)",
          "Impresa che fattura direttamente al committente privato (persona fisica) → NO, IVA ordinaria (4%, 10% o 22% a seconda del lavoro)",
          "Installazione o manutenzione di impianti su un edificio fatturata a un'impresa (B2B) → SÌ, reverse charge lettera a-ter), anche senza subappalto",
          "Posa di infissi, pavimenti o tinteggiatura in appalto diretto verso un soggetto IVA → SÌ, lettera a-ter) come completamento di edificio",
          "Fornitura di beni con posa in opera dove la posa è accessoria alla vendita → NO, è una cessione di beni con IVA ordinaria",
          "Prestazione resa a un contraente generale affidatario della totalità dei lavori → NO, esclusa per legge dalla lettera a)",
          "Lavori su strade, fognature e opere che non sono «edifici», in appalto diretto → NO a-ter); reverse solo se sei in subappalto",
          "Operazione verso una PA che sarebbe in split payment ma rientra nel reverse charge → prevale il reverse charge",
        ],
      },
      {
        type: "section",
        heading: "Come si fattura in reverse charge: diciture esatte e codici",
        body: "La fattura in reverse charge si emette senza addebito d'imposta, indicando l'imponibile e la dicitura obbligatoria: «inversione contabile ai sensi dell'art. 17, comma 6, lett. a), DPR 633/1972» per i subappalti, oppure «lett. a-ter)» per i servizi su edifici. Nella fatturazione elettronica la natura IVA da usare è N6.7 («inversione contabile — prestazioni comparto edile e settori connessi»). Il committente che riceve la fattura la integra con l'aliquota corretta e la registra sia nel registro vendite sia in quello acquisti: con la fattura elettronica l'integrazione passa dal documento TD16 inviato allo SDI. Nota bene: l'aliquota dell'integrazione segue le regole ordinarie dell'operazione, quindi può essere anche il 10% agevolato, non automaticamente il 22%.",
      },
      {
        type: "section",
        heading: "Esempio pratico: subappalto da 20.000 €",
        body: "La tua impresa esegue in subappalto la posa di un cappotto per l'appaltatore principale, corrispettivo 20.000 €. Emetti fattura di 20.000 € senza IVA, natura N6.7, con la dicitura dell'art. 17, comma 6, lett. a). L'appaltatore integra la fattura con IVA al 22% (4.400 €), che registra a debito e a credito: per lui l'operazione è di norma neutra, per te significa incassare 20.000 € e non 24.400 €. Se lo stesso lavoro lo facessi in appalto diretto per un condominio (committente non soggetto IVA), emetteresti invece fattura con IVA al 10% come manutenzione: 20.000 € + 2.000 €. Stesso cantiere, due regimi completamente diversi: è il contratto a comandare, non il tipo di lavorazione.",
      },
      {
        type: "section",
        heading: "Gli errori più comuni (visti in centinaia di fatture reali)",
        body: "Il primo errore è applicare il reverse charge ai privati: mai, in nessun caso. Il secondo è il contrario: esporre l'IVA in un subappalto edile perché «così siamo sicuri» — il regime non si sceglie, si applica quello giusto. Terzo errore: confondere l'appalto di servizi con la fornitura con posa; se prevale la cessione del bene (es. vendi i serramenti e la posa è accessoria), l'operazione è una cessione con IVA ordinaria. Quarto: dimenticare la dicitura o il codice natura N6.7, che fa scartare o contestare la fattura elettronica. Quinto: i forfettari — il subappaltatore in regime forfettario fattura secondo il suo regime, senza applicare il reverse; ma se è il forfettario a RICEVERE una fattura in inversione contabile, deve integrarla e versare l'IVA entro il 16 del mese successivo, senza poterla detrarre. Una corretta gestione dei subappaltatori passa anche da qui: verifica sempre il regime fiscale di chi lavora per te, insieme a DURC e documenti di cantiere.",
      },
      {
        type: "section",
        heading: "Sanzioni: quanto costa sbagliare regime",
        body: "Le sanzioni sono nell'art. 6 del D.Lgs 471/97. Se applichi l'IVA ordinaria dove serviva il reverse charge (o viceversa) ma l'imposta è stata comunque assolta, la violazione è formale: sanzione fissa da 250 a 10.000 €, di regola a carico del cessionario ma con responsabilità solidale del fornitore. Se invece il committente omette del tutto l'inversione contabile, la sanzione va da 500 a 20.000 €; e se l'operazione non risulta nemmeno dalla contabilità, sale dal 5% al 10% dell'imponibile con un minimo di 1.000 €. Nei casi di frode o quando l'errore è legato a intento di evasione, la sanzione arriva al 90% dell'imposta. Numeri che meritano dieci minuti di verifica in più su ogni contratto: nel dubbio, fatti confermare il regime dal tuo commercialista prima di emettere la fattura, non dopo.",
      },
      {
        type: "section",
        heading: "Reverse charge e appalti pubblici: attenzione all'incrocio con lo split payment",
        body: "Chi lavora negli appalti pubblici incontra anche lo split payment dell'art. 17-ter: la PA trattiene l'IVA e la versa direttamente all'Erario. La regola di precedenza è netta: se l'operazione rientra nel reverse charge, lo split payment non si applica. In pratica: il subappaltatore che fattura all'appaltatore di un'opera pubblica applica il reverse charge lettera a) come in qualsiasi cantiere privato, perché il suo cliente è l'impresa, non la PA; l'appaltatore che fattura alla stazione appaltante applica invece lo split payment, salvo che la prestazione ricada nella lettera a-ter) e la PA agisca nella propria sfera commerciale. Un buon software con fatturazione elettronica integrata ti propone in automatico natura, esigibilità e diciture giuste in base al cliente e al contratto: è il modo più semplice per non rimetterci in sanzioni.",
      },
      {
        type: "cta",
        heading: "Fatture in reverse charge senza errori",
        body: "Con Edilizia in Cloud imposti il regime IVA sul cliente o sulla commessa una volta sola: natura N6.7, diciture e integrazione TD16 escono giuste in automatico, e lo scadenzario ti mostra l'impatto reale sugli incassi. Provalo gratis per 31 giorni sulla tua prossima fattura di subappalto.",
      },
    ],
    faqs: [
      {
        q: "Quando si applica il reverse charge in edilizia?",
        a: "In due famiglie di casi previste dall'art. 17, comma 6, DPR 633/72: nei subappalti edili tra imprese del settore costruzioni (lettera a) e nei servizi di pulizia, demolizione, installazione di impianti e completamento relativi a edifici resi verso soggetti IVA, anche in appalto diretto (lettera a-ter). Verso i privati consumatori non si applica mai: lì vale l'IVA ordinaria al 4%, 10% o 22%.",
      },
      {
        q: "Che dicitura devo scrivere in fattura con il reverse charge?",
        a: "La fattura va emessa senza IVA con la dicitura «inversione contabile ai sensi dell'art. 17, comma 6, lett. a), DPR 633/1972» per i subappalti, o «lett. a-ter)» per pulizia, demolizione, impianti e completamento di edifici. Nella fattura elettronica il codice natura corretto è N6.7. Chi riceve la fattura la integra con l'aliquota dovuta tramite documento TD16 inviato allo SDI.",
      },
      {
        q: "Il reverse charge si applica ai clienti privati?",
        a: "No, mai. L'inversione contabile presuppone che il committente sia un soggetto passivo IVA in grado di integrare la fattura. Verso persone fisiche consumatori finali si emette sempre fattura con IVA ordinaria, applicando l'aliquota corretta per il tipo di lavoro: 22% standard, 10% per le manutenzioni su immobili abitativi, 4% nei casi di prima casa previsti dalla legge.",
      },
      {
        q: "Cosa rischio se espongo l'IVA quando serviva il reverse charge?",
        a: "Se l'imposta è stata comunque versata, la violazione è considerata formale e la sanzione è fissa: da 250 a 10.000 € (art. 6, comma 9-bis, D.Lgs 471/97). Se invece l'inversione viene omessa del tutto, la sanzione va da 500 a 20.000 €, e sale dal 5% al 10% dell'imponibile (minimo 1.000 €) se l'operazione non risulta dalla contabilità. In caso di frode si arriva al 90% dell'imposta.",
      },
      {
        q: "Il forfettario applica il reverse charge?",
        a: "Dipende dal lato in cui si trova. Come fornitore, il subappaltatore forfettario emette fattura secondo il proprio regime, senza IVA e senza inversione contabile. Come committente, invece, il forfettario che riceve una fattura in reverse charge deve integrarla con l'IVA e versarla entro il giorno 16 del mese successivo, senza poterla detrarre: per lui è un costo vivo da mettere in preventivo.",
      },
      {
        q: "Tra reverse charge e split payment quale prevale?",
        a: "Il reverse charge. L'art. 17-ter DPR 633/72 esclude espressamente dallo split payment le operazioni soggette a inversione contabile. Quindi il subappaltatore in un'opera pubblica fattura in reverse charge al proprio appaltatore, mentre l'appaltatore fattura alla PA in split payment, salvo i servizi della lettera a-ter) resi alla PA nella sua sfera commerciale, che restano in reverse.",
      },
    ],
  },
  {
    id: "n2",
    slug: "registro-presenze-cantiere-obbligatorio",
    title: "Registro presenze cantiere obbligatorio: cosa dice la legge",
    excerpt:
      "Tessera di riconoscimento, LUL e congruità della manodopera: quali obblighi di registrazione presenze valgono in cantiere e come tenerli in digitale.",
    category: "Normativa",
    tags: ["presenze cantiere", "tessera di riconoscimento", "congruità manodopera", "D.Lgs 81/08"],
    publishedAt: "2026-07-25",
    readTime: 7,
    author: { name: "Florin Andriciuc", role: "Founder & CEO", avatar: FLO_AVATAR },
    coverImage: "/blog/covers/gestione-operai-cantiere-presenze-ore.jpg",
    content: [
      {
        type: "intro",
        body: "Il registro presenze cantiere obbligatorio non esiste come documento unico previsto da una singola norma: l'obbligo di tracciare chi lavora in cantiere nasce dalla somma di tre regole — la tessera di riconoscimento del D.Lgs 81/08, il Libro Unico del Lavoro e la verifica di congruità della manodopera del DM 143/2021. Chi non registra le presenze per cantiere, in pratica, non riesce a rispettarne nessuna delle tre.",
      },
      {
        type: "section",
        heading: "Cosa dice davvero la norma (e cosa no)",
        body: "Nessun articolo di legge impone un «registro presenze di cantiere» con quel nome. Esistono però obblighi puntuali che rendono la registrazione delle presenze un passaggio di fatto obbligato: il datore di lavoro deve munire di tessera di riconoscimento ogni lavoratore impiegato in appalto o subappalto (art. 18, comma 1, lettera u, e art. 26, comma 8, D.Lgs 81/08); le presenze giornaliere vanno riportate nel Libro Unico del Lavoro entro la fine del mese successivo; e nei cantieri soggetti a verifica di congruità l'impresa deve dimostrare quanta manodopera ha effettivamente impiegato su quel singolo cantiere. Tre norme diverse, un'unica conseguenza operativa: devi sapere chi c'era, quando e su quale commessa, con dati difendibili in caso di ispezione.",
      },
      {
        type: "section",
        heading: "La tessera di riconoscimento: il badge di cantiere",
        body: "Negli appalti e subappalti la tessera di riconoscimento è obbligatoria per tutti: dipendenti (art. 18 e art. 20, comma 3, D.Lgs 81/08) e lavoratori autonomi, che devono provvedere in proprio (art. 21, comma 1, lettera c). Il contenuto minimo lo fissa l'art. 5 della legge 136/2010: fotografia, generalità del lavoratore, datore di lavoro e data di assunzione; in caso di subappalto va indicata anche la relativa autorizzazione. Le sanzioni sono per singolo lavoratore: da 100 a 500 € a carico del datore che non fornisce la tessera, da 50 a 300 € a carico del lavoratore che non la espone. Su un cantiere con 8 operai senza badge, il conto per l'impresa può superare i 4.000 € in una sola visita ispettiva.",
      },
      {
        type: "section",
        heading: "Il Libro Unico del Lavoro: le ore finiscono lì",
        body: "Il Libro Unico del Lavoro (art. 39 del D.L. 112/2008) è il registro dove ogni mese confluiscono presenze, ore ordinarie, straordinari, ferie e assenze di ciascun dipendente, con registrazione entro la fine del mese successivo. Il punto critico per le imprese edili è la qualità del dato a monte: se le ore arrivano al consulente del lavoro via WhatsApp o su fogli volanti, gli errori in busta paga sono questione di tempo. E in edilizia l'errore pesa doppio, perché le stesse ore alimentano anche la denuncia mensile alla Cassa Edile e il calcolo del costo manodopera per commessa. Una rilevazione presenze fatta bene una sola volta serve tre scopi: paghe corrette, versamenti giusti, margini di cantiere reali.",
      },
      {
        type: "section",
        heading: "La congruità della manodopera: il vero motivo per tracciare tutto",
        body: "Dal 1° novembre 2021 il DM 143/2021 impone la verifica di congruità dell'incidenza della manodopera: sempre nei lavori pubblici e nei lavori privati con valore complessivo pari o superiore a 70.000 €. Ogni categoria di lavori ha una percentuale minima di manodopera attesa sul valore dell'opera: ad esempio il 14,28% per le nuove costruzioni civili e il 5,36% per quelle industriali, secondo la tabella allegata al decreto. Se le ore denunciate alla Cassa Edile non raggiungono la soglia, il DURC di congruità non viene rilasciato: e senza quello si bloccano saldi e pagamenti. Ecco perché attribuire ogni ora al cantiere giusto non è pignoleria da ufficio: è la differenza tra incassare il saldo e restare fermi a spiegare le ore mancanti.",
      },
      {
        type: "list",
        heading: "Quando la registrazione presenze è di fatto obbligatoria",
        items: [
          "In ogni appalto o subappalto: tessera di riconoscimento per tutti i presenti, imprese e autonomi",
          "Nei lavori pubblici: verifica di congruità della manodopera sempre, a prescindere dall'importo",
          "Nei lavori privati da 70.000 € in su: congruità obbligatoria ex DM 143/2021",
          "Quando hai subappaltatori: il committente deve poter verificare chi accede al cantiere (art. 26 D.Lgs 81/08)",
          "Ogni mese, per tutti i dipendenti: presenze e ore nel Libro Unico del Lavoro",
          "In caso di infortunio o ispezione: devi dimostrare chi era presente e in quali orari",
        ],
      },
      {
        type: "section",
        heading: "Come tenere il registro presenze in digitale",
        body: "La timbratura digitale da smartphone è oggi il modo più semplice per coprire tutti gli obblighi con un gesto solo: l'operaio timbra entrata e uscita dal telefono, la posizione registrata al momento della timbratura certifica che era davvero in cantiere, e ogni ora finisce automaticamente sulla commessa giusta. Da lì escono l'export mensile per il consulente del lavoro, le ore per la denuncia alla Cassa Edile e il costo manodopera reale per cantiere. Due accortezze: la rilevazione della posizione va limitata al momento della timbratura (niente tracciamento continuo) e va accompagnata da un'informativa privacy chiara ai lavoratori. Con queste regole rispettate, un archivio presenze digitale, datato e non modificabile vale molto più di qualsiasi quaderno in baracca davanti a un ispettore.",
      },
      {
        type: "cta",
        heading: "Presenze a posto, congruità sotto controllo",
        body: "Con le timbrature GPS di Edilizia in Cloud ogni ora finisce sul cantiere giusto: export pronto per il consulente del lavoro, ore per la Cassa Edile e costo manodopera per commessa in tempo reale. Prova gratis per 31 giorni con la tua squadra.",
      },
    ],
    faqs: [
      {
        q: "Esiste l'obbligo di un registro presenze cartaceo in cantiere?",
        a: "No, nessuna norma impone un registro presenze cartaceo con quel nome. Gli obblighi reali sono la tessera di riconoscimento per chi opera in appalto e subappalto (D.Lgs 81/08), la registrazione mensile delle presenze nel Libro Unico del Lavoro e, nei cantieri soggetti a congruità, la dimostrazione della manodopera impiegata sul singolo cantiere. Un sistema digitale li copre tutti e tre.",
      },
      {
        q: "Quali sono le sanzioni per la mancata tessera di riconoscimento?",
        a: "Le sanzioni sono per singolo lavoratore: da 100 a 500 € a carico del datore di lavoro che non fornisce la tessera e da 50 a 300 € a carico del lavoratore che non la espone. Il lavoratore autonomo che opera in cantiere deve dotarsene in proprio. Su una squadra intera trovata senza badge, l'importo complessivo per l'impresa diventa rapidamente di migliaia di euro.",
      },
      {
        q: "Quando scatta la verifica di congruità della manodopera?",
        a: "Sempre nei lavori pubblici e nei lavori privati con valore complessivo pari o superiore a 70.000 €, per i cantieri con denuncia di nuovo lavoro dal 1° novembre 2021 (DM 143/2021). L'incidenza minima di manodopera dipende dalla categoria: ad esempio 14,28% per le nuove costruzioni civili. Sotto soglia, il DURC di congruità non viene rilasciato e i pagamenti si bloccano.",
      },
      {
        q: "Posso rilevare le presenze con la geolocalizzazione?",
        a: "Sì, se la rilevazione della posizione avviene solo al momento della timbratura e non come tracciamento continuo del lavoratore, e se i lavoratori ricevono un'informativa privacy chiara su dati raccolti e finalità. È la prassi consolidata per la timbratura da smartphone in cantiere. In caso di dubbi su accordi sindacali o casi particolari, confrontati con il tuo consulente del lavoro.",
      },
      {
        q: "Excel o WhatsApp bastano per registrare le presenze?",
        a: "Formalmente nessuna norma li vieta, ma nella pratica reggono male: i dati arrivano in ritardo, si perdono, non attribuiscono le ore alla commessa e non dimostrano nulla in ispezione. Con la congruità della manodopera che richiede ore precise per singolo cantiere, un foglio ricopiato a fine settimana è il modo migliore per trovarsi ore mancanti proprio quando serve il DURC di congruità per incassare.",
      },
    ],
  },
  {
    id: "n3",
    slug: "pos-piano-operativo-sicurezza-fac-simile",
    title: "POS piano operativo di sicurezza: guida e fac simile",
    excerpt:
      "Cos'è il POS, chi deve redigerlo, i contenuti minimi dell'Allegato XV e la struttura sezione per sezione. Più le differenze con PSC e PSS.",
    category: "Normativa",
    tags: ["POS", "sicurezza cantiere", "D.Lgs 81/08", "Allegato XV"],
    publishedAt: "2026-07-25",
    readTime: 9,
    author: { name: "Florin Andriciuc", role: "Founder & CEO", avatar: FLO_AVATAR },
    coverImage: "/blog/covers/sicurezza-cantieri-dlgs-81.jpg",
    content: [
      {
        type: "intro",
        body: "Il POS, piano operativo di sicurezza, è il documento che ogni impresa esecutrice deve redigere prima di entrare in cantiere, previsto dall'art. 89, comma 1, lettera h) del D.Lgs 81/08 con i contenuti minimi fissati dall'Allegato XV, punto 3.2. Descrive come quella specifica impresa lavora in quel specifico cantiere: uomini, mansioni, attrezzature, sostanze, DPI e misure di sicurezza. Qui trovi la struttura completa, sezione per sezione, da usare come fac simile.",
      },
      {
        type: "section",
        heading: "Chi deve redigere il POS (e chi no)",
        body: "Il POS lo redige il datore di lavoro di ogni impresa esecutrice, per ogni singolo cantiere, prima dell'inizio dei propri lavori. Vale anche per l'impresa affidataria quando esegue lavorazioni con proprio personale, e vale anche se in cantiere c'è una sola impresa: il POS non dipende dalla presenza del coordinatore. Chi invece NON deve redigerlo: i lavoratori autonomi senza dipendenti (art. 21 D.Lgs 81/08 assegna loro altri obblighi, come tessera e attrezzature conformi, ma non il POS). Il datore può farsi aiutare dall'RSPP o da un consulente, ma la responsabilità del documento resta sua: la firma in calce non è una formalità. Ricorda anche l'art. 102: il rappresentante dei lavoratori per la sicurezza deve poter consultare il piano, con copia consegnata almeno 10 giorni prima dell'inizio dei lavori.",
      },
      {
        type: "section",
        heading: "POS, PSC e PSS: chi fa cosa",
        body: "Il PSC (piano di sicurezza e coordinamento) lo redige il coordinatore per la sicurezza in progettazione, incaricato dal committente, quando in cantiere sono previste più imprese anche non contemporanee: fotografa i rischi dell'intero cantiere e le regole di coordinamento tra le imprese. Il PSS (piano sostitutivo di sicurezza) riguarda gli appalti pubblici nei casi in cui il PSC non è obbligatorio: lo redige l'appaltatore e sostituisce il PSC, senza però contenere la stima dei costi della sicurezza. Il POS è invece sempre dovuto da ogni impresa esecutrice e funziona come piano complementare e di dettaglio del PSC: dove il PSC dice «in questo cantiere si lavora così», il POS dice «la mia impresa, con questi uomini e questi mezzi, lavora così». L'impresa affidataria verifica la congruenza dei POS dei subappaltatori rispetto al proprio prima di trasmetterli al coordinatore per l'esecuzione, e i lavori di ciascuna impresa iniziano solo dopo l'esito positivo di quelle verifiche.",
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
        body: "Il difetto numero uno dei POS italiani è il copia-incolla: 60 pagine generiche scaricate da un modello, dove l'unica cosa che cambia è l'intestazione. Un ispettore (o un coordinatore sveglio) lo riconosce in trenta secondi: elenchi di attrezzature che l'impresa non possiede, valutazione rumore di un altro cantiere, DPI per lavorazioni che non farai mai. La regola pratica è: ogni sezione deve parlare di QUESTO cantiere. Nella descrizione attività scrivi le tue lavorazioni reali con le fasi in sequenza; nell'elenco attrezzature metti solo ciò che porterai davvero, con date di verifica; nelle misure integrative rispondi puntualmente ai rischi del PSC di quel cantiere. Un POS specifico di 15 pagine vale più di uno generico di 80: e in caso di infortunio, un POS fotocopia è la prima cosa che l'accusa userà contro di te.",
      },
      {
        type: "section",
        heading: "Sanzioni: cosa rischi senza POS (o con un POS inadeguato)",
        body: "La mancata redazione del POS è punita penalmente: per il datore di lavoro è previsto l'arresto da tre a sei mesi o l'ammenda, con importi rivalutati periodicamente che oggi si collocano nell'ordine di alcune migliaia di euro (verifica sempre gli importi aggiornati con il tuo consulente). Ma il danno vero è un altro: la mancata elaborazione del POS rientra tra le gravi violazioni dell'Allegato I del D.Lgs 81/08, quelle che fanno scattare il provvedimento di sospensione dell'attività imprenditoriale e, dal 1° ottobre 2024, la decurtazione di crediti sulla patente a crediti. Cantiere fermo, penali del committente che corrono, punti persi: il costo reale di un POS mancante non è l'ammenda, è tutto quello che si porta dietro.",
      },
      {
        type: "section",
        heading: "Quando aggiornare il POS",
        body: "Il POS non è un documento da redigere una volta e dimenticare in baracca: va aggiornato ogni volta che cambia qualcosa di rilevante — nuove lavorazioni non previste, nuove attrezzature o sostanze, variazioni della squadra o delle figure della sicurezza, modifiche del PSC che richiedono nuove procedure di dettaglio. In cantieri lunghi conviene una revisione programmata, ad esempio a ogni nuova fase (scavi, struttura, finiture). Tenere il POS insieme agli altri documenti nel gestionale di cantiere, con versioni datate e firmate, semplifica la vita a te e al coordinatore: chi cerca l'ultima revisione la trova, e il giornale dei lavori documenta quando le nuove procedure sono entrate in vigore.",
      },
      {
        type: "cta",
        heading: "Documenti di cantiere sempre in ordine",
        body: "Con Edilizia in Cloud tieni POS, verbali, attestati e scadenze di ogni cantiere in un unico posto, condivisi con squadra e coordinatore: niente più documenti introvabili durante un'ispezione. Prova gratis per 31 giorni.",
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
        a: "Il DVR è la valutazione dei rischi dell'azienda nel suo complesso, obbligatoria per ogni datore di lavoro a prescindere dai cantieri. Il POS è la declinazione operativa sulla singola commessa: quel cantiere, quelle lavorazioni, quella squadra. Il POS non sostituisce il DVR e viceversa: l'impresa edile con dipendenti deve avere entrambi, e i due documenti devono essere coerenti tra loro.",
      },
      {
        q: "Cosa succede se il POS manca o è inadeguato?",
        a: "La mancata redazione è un reato contravvenzionale: arresto da tre a sei mesi o ammenda per il datore di lavoro, con importi rivalutati nel tempo. È inoltre una grave violazione dell'Allegato I del D.Lgs 81/08: può far scattare la sospensione dell'attività nel cantiere e la decurtazione di crediti dalla patente a crediti. Un POS generico o fotocopia può essere contestato come inadeguato quasi quanto un POS assente.",
      },
      {
        q: "Ogni quanto va aggiornato il POS?",
        a: "Non c'è una scadenza fissa: va aggiornato quando cambiano le condizioni che descrive — nuove lavorazioni, nuove attrezzature o sostanze, variazioni della squadra o delle figure della sicurezza, modifiche del PSC. Nei cantieri lunghi è buona pratica una revisione a ogni cambio di fase. Ogni revisione va datata, firmata e trasmessa all'affidataria o al coordinatore per l'esecuzione.",
      },
    ],
  },
  {
    id: "n4",
    slug: "prezzario-regionale-edilizia",
    title: "Prezzario regionale edilizia: cos'è e come si usa davvero",
    excerpt:
      "Cos'è il prezzario regionale, come si usa in preventivi e computi, dove scaricare quelli aggiornati e quando ha senso scostarsi dai prezzi.",
    category: "Normativa",
    tags: ["prezzario regionale", "computo metrico", "preventivi", "appalti pubblici"],
    publishedAt: "2026-07-25",
    readTime: 7,
    author: { name: "Florin Andriciuc", role: "Founder & CEO", avatar: FLO_AVATAR },
    coverImage: "/blog/covers/computo-metrico-estimativo-guida.jpg",
    content: [
      {
        type: "intro",
        body: "Il prezzario regionale edilizia è il listino ufficiale dei prezzi delle lavorazioni edili pubblicato da ogni Regione e aggiornato ogni anno, come previsto dall'art. 41, comma 13, del Codice appalti (D.Lgs 36/2023). È la base di computi metrici e preventivi: obbligatorio come riferimento negli appalti pubblici, usato nei lavori privati come metro di paragone e nei bonus fiscali per la verifica di congruità delle spese.",
      },
      {
        type: "section",
        heading: "Cos'è il prezzario regionale e chi lo pubblica",
        body: "Ogni Regione pubblica il proprio prezzario delle opere edili: migliaia di voci con codice, descrizione della lavorazione, unità di misura e prezzo unitario, organizzate per capitoli (scavi, strutture, murature, impianti, finiture e così via). Il Codice appalti impone alle Regioni l'aggiornamento annuale, con possibilità di aggiornamenti infrannuali quando i prezzi dei materiali si muovono in modo significativo — come successo nel biennio 2022-2023, quando alcuni prezzari sono stati riemessi anche due volte l'anno. Accanto ai prezzari regionali esistono listini privati di riferimento, come quelli DEI, molto usati nel privato e nelle perizie: non sono ufficiali, ma sono spesso più aggiornati su lavorazioni particolari.",
      },
      {
        type: "section",
        heading: "Come è costruita una voce di prezzario",
        body: "Ogni prezzo del prezzario non è un numero buttato lì: nasce da un'analisi che somma materiali, noli, trasporti e manodopera, e vi aggiunge le spese generali (di norma tra il 13% e il 17%) e l'utile d'impresa (di norma il 10%). Questo significa due cose pratiche. Primo: il prezzo di prezzario è già un prezzo «finito» — se ci applichi sopra il tuo ricarico pieno stai contando due volte l'utile, se accetti un ribasso del 30% stai probabilmente lavorando sotto costo. Secondo: molte voci riportano l'incidenza percentuale della manodopera, dato prezioso per stimare le ore e per la verifica di congruità. Imparare a leggere l'analisi di una voce è il modo più rapido per capire se su quella lavorazione la tua impresa guadagna o perde.",
      },
      {
        type: "section",
        heading: "Come si usa nei preventivi e nei computi",
        body: "Negli appalti pubblici il prezzario regionale è il riferimento per progetto e stima dei costi: il computo metrico estimativo si costruisce con le voci regionali e il ribasso d'asta si applica su quelle. Nei lavori privati nessuno ti obbliga a usarlo, ma è un punto di partenza autorevole: partire dalla voce di prezzario e adattarla ai tuoi costi reali produce preventivi difendibili davanti al cliente («questo è il prezzo ufficiale della Regione, il mio è questo perché...»). Il salto di qualità è collegare listino e consuntivi: se il prezzario dice 28 €/mq per l'intonaco e i tuoi cantieri chiudono a 34 €/mq, o hai un problema di produttività o stai facendo preventivi in perdita. Chi produce preventivi professionali con un listino personale costruito sui prezzari e corretto con i propri dati reali chiude offerte più velocemente e con margini difendibili.",
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
        body: "Per detrazioni come bonus casa, ecobonus e bonus barriere, i tecnici asseverano la congruità delle spese confrontandole con i prezzari regionali, i listini DEI e, per gli interventi con massimali specifici, i valori dei decreti ministeriali sui costi massimi. In pratica: se il tuo preventivo per il cappotto sfora in modo ingiustificato i valori di riferimento, l'asseverazione si complica e la detrazione del cliente rischia. Conviene quindi impostare i preventivi dei lavori agevolati già sulle voci di prezzario, documentando gli eventuali scostamenti (accessi difficili, lavorazioni particolari, forniture premium) con un'analisi scritta. Su questi importi la precisione paga due volte: cliente più sereno, contestazioni quasi azzerate.",
      },
      {
        type: "section",
        heading: "I limiti del prezzario (e quando è giusto scostarsi)",
        body: "Il prezzario riporta prezzi medi regionali in condizioni standard: non conosce il tuo cantiere. Quantità minime antieconomiche, centri storici con accessi impossibili, lavorazioni in quota, urgenze, bonifiche impreviste: sono tutti casi in cui il prezzo medio non copre i costi reali. Lo strumento corretto per scostarsi è l'analisi del nuovo prezzo (NP): scomponi la lavorazione in materiali, noli e ore di manodopera ai costi correnti, aggiungi spese generali e utile, e documenti tutto. Negli appalti pubblici ricordati anche della revisione prezzi: il D.Lgs 36/2023 (art. 60) la rende obbligatoria nei contratti, con attivazione quando la variazione dei costi supera il 5% e riconoscimento dell'80% dell'eccedenza. Tradotto: il prezzario è il punto di partenza del discorso sui prezzi, quasi mai il punto di arrivo.",
      },
      {
        type: "cta",
        heading: "Dal prezzario al preventivo in pochi minuti",
        body: "Con Edilizia in Cloud costruisci il tuo listino partendo dalle voci che usi davvero, lo colleghi a computi e preventivi e confronti i prezzi offerti con i costi reali di cantiere. Prova gratis per 31 giorni e fai il prossimo preventivo con i numeri giusti.",
      },
    ],
    faqs: [
      {
        q: "Il prezzario regionale è obbligatorio nei lavori privati?",
        a: "No. Nei lavori privati il prezzo lo fanno le parti: il prezzario è solo un riferimento autorevole, utile per giustificare il preventivo verso il cliente e per le perizie. Diventa invece rilevante nei lavori con bonus fiscali, dove i tecnici verificano la congruità delle spese proprio sui prezzari regionali, sui listini DEI o sui massimali ministeriali.",
      },
      {
        q: "Ogni quanto viene aggiornato il prezzario regionale?",
        a: "Almeno una volta l'anno: l'art. 41, comma 13, del D.Lgs 36/2023 impone alle Regioni l'aggiornamento annuale dei prezzari, con possibilità di aggiornamenti infrannuali in caso di forti variazioni dei prezzi. Nel periodo del caro materiali 2022-2023 diverse Regioni hanno pubblicato edizioni straordinarie a metà anno. Controlla sempre di usare l'edizione in vigore alla data del progetto.",
      },
      {
        q: "Posso fare un preventivo con prezzi più alti del prezzario?",
        a: "Nei lavori privati sì, è pieno diritto tuo e del mercato: conta che il cliente accetti. La mossa intelligente è motivare lo scostamento con un'analisi (condizioni di cantiere, qualità delle forniture, garanzie) invece di presentare un numero secco. Nei lavori con bonus fiscali gli scostamenti vanno documentati bene, perché il tecnico deve asseverare la congruità della spesa.",
      },
      {
        q: "Come gestisco una lavorazione che nel prezzario non esiste?",
        a: "Con l'analisi del nuovo prezzo (NP): scomponi la lavorazione in materiali, noli, trasporti e ore di manodopera ai costi correnti, poi aggiungi spese generali (13-17%) e utile d'impresa (10%). Negli appalti pubblici i nuovi prezzi vanno concordati e approvati secondo le regole del contratto; nei privati l'analisi allegata al preventivo rende il prezzo trasparente e difficile da contestare.",
      },
      {
        q: "Che differenza c'è tra prezzario regionale e listino DEI?",
        a: "Il prezzario regionale è pubblicato dalla Regione, gratuito e ufficiale: fa fede negli appalti pubblici. I listini DEI sono pubblicazioni private a pagamento, molto usate nel mercato privato, nelle perizie e per la congruità dei bonus: spesso coprono più lavorazioni e vengono aggiornati più di frequente. Nella pratica molte imprese li usano insieme, prendendo da ciascuno le voci più realistiche.",
      },
      {
        q: "I prezzi del prezzario includono già l'utile dell'impresa?",
        a: "Sì. Le voci dei prezzari regionali comprendono di norma le spese generali (tra il 13% e il 17%) e l'utile d'impresa (10%). Per questo un ribasso d'asta molto forte erode prima l'utile e poi entra nei costi vivi: accettare il 30% di sconto su un prezzo che contiene il 10% di utile significa quasi certamente lavorare in perdita su quella voce.",
      },
    ],
  },
  {
    id: "n5",
    slug: "cartello-di-cantiere-obbligatorio",
    title: "Cartello di cantiere obbligatorio: contenuti e sanzioni",
    excerpt:
      "Il cartello di cantiere è obbligatorio: cosa deve contenere, chi risponde della mancata esposizione, le sanzioni e le dimensioni consigliate.",
    category: "Normativa",
    tags: ["cartello di cantiere", "DPR 380/2001", "permesso di costruire", "adempimenti cantiere"],
    publishedAt: "2026-07-25",
    readTime: 6,
    author: { name: "Florin Andriciuc", role: "Founder & CEO", avatar: FLO_AVATAR },
    coverImage: "/blog/covers/documentazione-obbligatoria-cantiere-2025.jpg",
    content: [
      {
        type: "intro",
        body: "Il cartello di cantiere è obbligatorio: l'art. 27, comma 4, del DPR 380/2001 (Testo Unico dell'Edilizia) impone di indicare gli estremi del permesso di costruire in un cartello esposto presso il cantiere, secondo le modalità stabilite dal regolamento edilizio comunale. In pratica, ogni cantiere con un titolo abilitativo deve avere un cartello ben visibile dalla strada, completo dei dati di lavori, impresa e figure tecniche.",
      },
      {
        type: "section",
        heading: "Da dove nasce l'obbligo",
        body: "L'obbligo del cartello poggia su due gambe. La prima è il Testo Unico dell'Edilizia: l'art. 27, comma 4, del DPR 380/2001 prevede che gli estremi del permesso di costruire siano indicati nel cartello di cantiere, rimandando al regolamento edilizio comunale per le modalità. La seconda gamba sono proprio i regolamenti edilizi: quasi tutti i Comuni italiani dettagliano contenuti, dimensioni e obbligo di esposizione del cartello, estendendolo di fatto anche ai lavori in SCIA e CILA. A queste si aggiunge, su un piano diverso, la segnaletica di sicurezza del D.Lgs 81/08: cartelli di divieto di accesso, obbligo DPI e pericolo, che sono un'altra cosa e vanno esposti comunque. Prima di stampare, leggi il regolamento edilizio del Comune dove apri il cantiere: è lì che trovi le regole puntuali.",
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
        body: "La responsabilità dell'esposizione ricade sui soggetti che rispondono della regolarità del cantiere: titolare del permesso (committente), costruttore e direttore dei lavori. In caso di controllo — vigili urbani, tecnici comunali, personale ispettivo — il cartello assente o incompleto è la prima irregolarità che viene verbalizzata, anche perché è visibile senza nemmeno entrare in cantiere. E c'è un effetto collaterale poco considerato: il cartello mancante è il classico innesco del controllo approfondito. L'ispettore che non trova il cartello inizia a chiedere titolo edilizio, notifica preliminare, DURC delle imprese, tessere di riconoscimento. Un pannello da poche decine di euro evita di trasformare un passaggio di routine in una giornata di verifiche.",
      },
      {
        type: "section",
        heading: "Le sanzioni",
        body: "La sanzione tipica per il cartello mancante o incompleto è amministrativa, stabilita dal regolamento edilizio o dalle norme comunali: gli importi variano da Comune a Comune, di norma da qualche centinaio di euro fino a circa 1.000 €. Attenzione però: una parte della giurisprudenza ha ritenuto in passato che la violazione dell'obbligo, quando prescritto dal regolamento edilizio, potesse integrare la contravvenzione dell'art. 44, lettera a), del DPR 380/2001, che prevede l'ammenda penale. Gli orientamenti non sono uniformi e molto dipende dal caso concreto — ma è esattamente il tipo di rischio che non ha senso correre per risparmiare un cartello. Regola pratica: cartello esposto dal primo giorno, aggiornato se cambiano imprese o direttore dei lavori, foto datata al momento dell'installazione conservata tra i documenti di commessa.",
      },
      {
        type: "section",
        heading: "Dimensioni, materiali e posizionamento consigliati",
        body: "Non esiste una dimensione obbligatoria a livello nazionale: la fissano, quando lo fanno, i regolamenti comunali. Nella pratica professionale il formato minimo consigliato è 70×100 cm, con 100×140 cm per i cantieri su strada dove il cartello deve essere leggibile a distanza. Materiali: PVC o forex per durare, banner in PVC teso per i ponteggi; evita la carta plastificata che dopo due piogge diventa illeggibile — un cartello illeggibile equivale a un cartello assente. Posizionamento: all'ingresso del cantiere o sulla recinzione, visibile dalla pubblica via, senza ostacolare la segnaletica di sicurezza. Un'abitudine che costa zero: quando aggiorni il cartello, registra la modifica anche nel giornale dei lavori — così la storia documentale del cantiere resta coerente.",
      },
      {
        type: "section",
        heading: "Modello di testo: cosa scrivere esattamente sul cartello",
        body: "Un cartello di cantiere completo riporta, nell'ordine: oggetto dei lavori (es. \"Ristrutturazione edilizia con ampliamento\"), estremi del titolo abilitativo (tipo, numero di protocollo e data della CILA, SCIA o permesso di costruire), nome del committente, impresa esecutrice con ragione sociale completa e i riferimenti del responsabile di cantiere, progettista e direttore dei lavori con relativi ordini professionali, coordinatore per la sicurezza in fase di esecuzione quando nominato, data di inizio lavori e durata presunta. Molti Comuni chiedono anche l'indicazione delle imprese subappaltatrici principali: verifica sempre il regolamento edilizio locale, perché il contenuto minimo del cartello di cantiere lo fissa il Comune, non una norma nazionale unica. Un formato che funziona in pratica: pannello da almeno 100×70 cm, testo nero su fondo bianco, caratteri leggibili da 10 metri, posizionato all'ingresso del cantiere in posizione visibile dalla strada pubblica.",
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
        body: "Titoli edilizi, notifica preliminare, DURC delle imprese, verbali e foto del cartello: con Edilizia in Cloud ogni commessa ha il suo fascicolo digitale sempre a portata di telefono, anche davanti a un ispettore. Prova gratis per 31 giorni.",
      },
    ],
    faqs: [
      {
        q: "Il cartello di cantiere è obbligatorio anche per SCIA e CILA?",
        a: "L'art. 27, comma 4, del DPR 380/2001 parla di estremi del permesso di costruire, ma quasi tutti i regolamenti edilizi comunali estendono l'obbligo ai lavori in SCIA e CILA. Nella pratica: se c'è un titolo abilitativo, esponi il cartello con i suoi estremi. Costa poco, evita contestazioni e dimostra a chiunque passi che il cantiere è regolare.",
      },
      {
        q: "Cosa rischio se il cartello manca?",
        a: "Di norma una sanzione amministrativa comunale, con importi variabili da qualche centinaio di euro fino a circa 1.000 € a seconda del regolamento. In alcuni casi la giurisprudenza ha ipotizzato anche la contravvenzione penale dell'art. 44, lettera a), DPR 380/2001. E c'è il danno indiretto: il cartello mancante attira controlli approfonditi su titoli, DURC e presenze.",
      },
      {
        q: "Quali dimensioni deve avere il cartello di cantiere?",
        a: "Nessuna norma nazionale fissa le dimensioni: decidono i regolamenti comunali, quando lo fanno. Il formato minimo consigliato nella pratica è 70×100 cm, meglio 100×140 cm per cantieri su strada. Il criterio guida è la leggibilità: caratteri grandi, materiale resistente alle intemperie e posizione visibile dalla pubblica via, all'ingresso o sulla recinzione.",
      },
      {
        q: "Chi deve pagare e installare il cartello?",
        a: "La legge non lo dice: nella prassi lo predispone l'impresa esecutrice e il costo (poche decine di euro per un pannello in forex, qualche centinaio per banner grandi) viene ricompreso nelle spese di impianto cantiere. L'importante è chiarirlo nel contratto d'appalto per evitare rimpalli: la responsabilità dell'esposizione coinvolge comunque committente, impresa e direttore dei lavori.",
      },
      {
        q: "Serve una dicitura particolare per i lavori con bonus fiscali?",
        a: "Per alcuni incentivi è stata richiesta l'indicazione in cartello dell'accesso alle detrazioni (è successo con il Superbonus, con dicitura specifica sui lavori agevolati). Le regole cambiano con le versioni dei bonus: prima di stampare, verifica con il tecnico o il commercialista la formula aggiornata per l'incentivo che stai usando e riportala esattamente nel cartello.",
      },
    ],
  },
  {
    id: "n6",
    slug: "notifica-preliminare-cantiere",
    title: "Notifica preliminare cantiere: quando serve e chi la invia",
    excerpt:
      "Quando scatta la notifica preliminare ex art. 99 D.Lgs 81/08, chi deve inviarla, cosa contiene, come si trasmette e le sanzioni per chi la dimentica.",
    category: "Normativa",
    tags: ["notifica preliminare", "art. 99 D.Lgs 81/08", "apertura cantiere", "adempimenti cantiere"],
    publishedAt: "2026-07-25",
    readTime: 6,
    author: { name: "Florin Andriciuc", role: "Founder & CEO", avatar: FLO_AVATAR },
    coverImage: "/blog/covers/burocrazia-impresa-edile-scadenze-documenti.jpg",
    content: [
      {
        type: "intro",
        body: "La notifica preliminare cantiere è la comunicazione che il committente o il responsabile dei lavori deve inviare all'ASL e all'Ispettorato territoriale del lavoro prima dell'inizio dei lavori, nei casi previsti dall'art. 99 del D.Lgs 81/08: cantieri in cui opera più di un'impresa, anche non contemporaneamente, e cantieri con una sola impresa ma entità di lavoro pari o superiore a 200 uomini-giorno.",
      },
      {
        type: "section",
        heading: "Quando è obbligatoria: i tre casi dell'art. 99",
        body: "L'art. 99, comma 1, del D.Lgs 81/08 elenca tre situazioni. Prima: cantieri in cui è prevista la presenza di più imprese esecutrici, anche non contemporanea — cioè gli stessi cantieri in cui scatta l'obbligo del coordinatore per la sicurezza. Seconda: cantieri partiti con un'unica impresa ma che ricadono nel primo caso per effetto di varianti in corso d'opera — la classica seconda impresa chiamata a cantiere aperto. Terza: cantieri con un'unica impresa la cui entità presunta è pari o superiore a 200 uomini-giorno. Gli uomini-giorno misurano l'entità presunta del lavoro: la somma delle giornate lavorative di tutte le persone previste. Esempio concreto: 4 operai per 60 giorni lavorativi fanno 240 uomini-giorno, quindi notifica obbligatoria anche con una sola impresa. Una ristrutturazione da 2 operai per 3 settimane (30 uomini-giorno), con una sola impresa, non la richiede.",
      },
      {
        type: "section",
        heading: "Chi la invia e a chi",
        body: "L'obbligo è del committente o, se nominato, del responsabile dei lavori: non dell'impresa. È un punto che ogni impresa edile dovrebbe però presidiare, perché un cantiere senza notifica quando era dovuta è un cantiere irregolare per tutti quelli che ci lavorano. I destinatari sono l'ASL competente per territorio e l'Ispettorato territoriale del lavoro, prima dell'inizio dei lavori. Copia della notifica deve essere affissa in maniera visibile presso il cantiere — di solito accanto al cartello lavori — e custodita a disposizione degli organi di vigilanza. Per gli appalti pubblici e i lavori con più imprese, la notifica viaggia insieme al resto del pacchetto documentale: PSC, POS delle imprese, DURC e idoneità tecnico-professionale.",
      },
      {
        type: "section",
        heading: "Come si invia: i portali regionali",
        body: "Oggi la trasmissione è telematica praticamente ovunque: quasi tutte le Regioni hanno un portale dedicato alle notifiche preliminari (in Lombardia il sistema GE.CA, altrove le piattaforme regionali per i cantieri), che smista in automatico la comunicazione ad ASL e Ispettorato. La compilazione online segue i campi dell'Allegato XII e rilascia una ricevuta con numero identificativo: conservala nel fascicolo di commessa, perché è la prova dell'adempimento e viene spesso richiesta per accedere ai portali bonus o nelle verifiche degli enti. Dove il portale non è ancora attivo, resta la trasmissione via PEC ai due enti. Il costo dell'invio è zero: la notifica è gratuita, servono solo dieci minuti e i dati giusti sotto mano.",
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
        body: "La notifica non è una foto scattata una volta sola: va aggiornata quando cambiano i dati rilevanti. I casi tipici sono l'ingresso di nuove imprese (compresi i subappaltatori non previsti all'inizio), la proroga significativa della durata, l'aumento dell'importo lavori. Il caso più delicato è il cantiere partito con una sola impresa e senza coordinatore che a metà lavori ne accoglie una seconda: lì scattano insieme la nomina del coordinatore per l'esecuzione, l'adeguamento documentale e la notifica (o il suo aggiornamento). Una buona gestione dei subappaltatori aiuta proprio qui: se sai in anticipo chi entrerà in cantiere e quando, l'aggiornamento della notifica diventa una pratica di dieci minuti invece di una corsa dell'ultimo momento.",
      },
      {
        type: "section",
        heading: "Sanzioni e conseguenze pratiche",
        body: "Per il committente o il responsabile dei lavori che omette la notifica quando dovuta, il D.Lgs 81/08 (art. 157) prevede una sanzione amministrativa pecuniaria da 500 a 1.800 €. Il numero da solo non racconta il danno vero: la notifica mancante emerge quasi sempre durante un'ispezione o dopo un infortunio, cioè nei momenti peggiori, e trascina verifiche su coordinatore, PSC, POS, DURC e congruità della manodopera. In più, la copia della notifica è richiesta in pratiche e piattaforme (bonus fiscali, portali degli enti): scoprire a consuntivo che manca significa bloccare pratiche e pagamenti. La regola d'oro per l'impresa: prima di aprire qualsiasi cantiere con più imprese o sopra i 200 uomini-giorno, chiedi al committente copia della notifica e mettila nel fascicolo di commessa.",
      },
      {
        type: "cta",
        heading: "Apri ogni cantiere con i documenti giusti",
        body: "Con Edilizia in Cloud ogni commessa parte con la sua checklist: notifica preliminare, POS, DURC delle imprese e scadenze documentali, tutto nel fascicolo digitale del cantiere con promemoria automatici. Prova gratis per 31 giorni.",
      },
    ],
    faqs: [
      {
        q: "Quando è obbligatoria la notifica preliminare?",
        a: "Nei casi dell'art. 99 del D.Lgs 81/08: cantieri con più imprese esecutrici anche non contemporanee, cantieri che finiscono in quella situazione per varianti in corso d'opera, e cantieri con un'unica impresa ma entità presunta pari o superiore a 200 uomini-giorno. Per una ristrutturazione con una sola impresa sotto quella soglia, la notifica non serve.",
      },
      {
        q: "Chi deve inviare la notifica preliminare?",
        a: "Il committente o, se nominato, il responsabile dei lavori: non l'impresa esecutrice. L'impresa fa però bene a pretenderne copia prima di iniziare, perché lavorare in un cantiere privo di notifica obbligatoria espone tutti a verifiche e contestazioni. La copia va anche affissa in cantiere in modo visibile e custodita a disposizione degli organi di vigilanza.",
      },
      {
        q: "Come si calcolano gli uomini-giorno?",
        a: "Si stima l'entità del lavoro sommando le giornate lavorative presunte di tutte le persone impiegate: numero medio di lavoratori moltiplicato per i giorni lavorativi previsti. Esempio: 4 operai per 60 giorni = 240 uomini-giorno, sopra la soglia di 200 e quindi con obbligo di notifica anche con una sola impresa. Nel dubbio conviene stimare in modo realistico, non ottimistico.",
      },
      {
        q: "Come si invia la notifica preliminare?",
        a: "Tramite i portali telematici regionali dedicati ai cantieri, che trasmettono in automatico ad ASL e Ispettorato territoriale del lavoro e rilasciano una ricevuta con numero identificativo; dove il portale non c'è, via PEC ai due enti. L'invio è gratuito. La ricevuta va conservata nel fascicolo di commessa: viene richiesta in molte pratiche, bonus fiscali compresi.",
      },
      {
        q: "Cosa succede se entra una seconda impresa a cantiere già aperto?",
        a: "Il cantiere ricade nel caso dell'art. 90: il committente deve nominare il coordinatore per la sicurezza in esecuzione (se non c'era), far predisporre il PSC e inviare o aggiornare la notifica preliminare. Succede spesso con i subappalti decisi in corsa: pianificare in anticipo chi entrerà in cantiere evita di trovarsi con lavori formalmente irregolari da un giorno all'altro.",
      },
      {
        q: "Quali sanzioni rischia chi non invia la notifica?",
        a: "Il committente o responsabile dei lavori rischia la sanzione amministrativa pecuniaria da 500 a 1.800 € prevista dall'art. 157 del D.Lgs 81/08. Il danno maggiore è indiretto: la mancanza emerge in ispezioni o dopo infortuni e innesca controlli a catena su coordinatore, piani di sicurezza, DURC e presenze, oltre a bloccare le pratiche che richiedono copia della notifica.",
      },
    ],
  },
  {
    id: "n7",
    slug: "libretto-delle-misure",
    title: "Libretto delle misure: cos'è e come si compila in cantiere",
    excerpt:
      "Il libretto delle misure registra le quantità eseguite in cantiere: come si compila, chi lo firma e come si collega a registro di contabilità e SAL.",
    category: "Normativa",
    tags: ["libretto delle misure", "contabilità lavori", "SAL", "direzione lavori"],
    publishedAt: "2026-07-25",
    readTime: 6,
    author: { name: "Florin Andriciuc", role: "Founder & CEO", avatar: FLO_AVATAR },
    coverImage: "/blog/covers/contabilita-di-cantiere-guida.jpg",
    content: [
      {
        type: "intro",
        body: "Il libretto delle misure è il documento contabile in cui il direttore dei lavori registra le quantità delle lavorazioni via via eseguite in cantiere. È il primo anello della contabilità lavori: dalle misure del libretto nascono il registro di contabilità, gli stati di avanzamento e i certificati di pagamento. Nei lavori pubblici è obbligatorio per legge; nei privati è la base concreta per farsi pagare il giusto.",
      },
      {
        type: "section",
        heading: "Cos'è e dove è previsto",
        body: "Nella contabilità dei lavori pubblici il libretto delle misure è uno dei documenti contabili ufficiali, storicamente disciplinato dal DM 49/2018 e oggi, per i contratti del nuovo Codice, dall'Allegato II.14 del D.Lgs 36/2023 sulla direzione dei lavori. Il pacchetto completo comprende: giornale dei lavori, libretto delle misure, registro di contabilità, sommario del registro, stati di avanzamento, certificati di pagamento e conto finale. Il libretto è il documento «di prima nota» della contabilità tecnica: fotografa cosa è stato fatto e in che quantità, senza prezzi. La logica è antica e solidissima: prima si accertano i fatti (le misure), poi si applicano i prezzi. Se le misure sono contestabili, tutto quello che viene dopo — SAL, certificati, fatture — è contestabile a cascata.",
      },
      {
        type: "section",
        heading: "Chi lo tiene e chi lo firma",
        body: "La tenuta del libretto spetta al direttore dei lavori, che può avvalersi di direttori operativi e ispettori di cantiere sotto la propria responsabilità. Le misurazioni si fanno in contraddittorio con l'impresa: il rappresentante dell'esecutore partecipa al rilievo e firma il libretto insieme al direttore dei lavori. Questo contraddittorio è la vera garanzia per l'impresa: una misura rilevata insieme e firmata da entrambi è un fatto acquisito, difficilissimo da rimettere in discussione a distanza di mesi. Se l'impresa non concorda con una misura, non deve semplicemente rifiutarsi di firmare: firma e formula le proprie riserve, che vanno poi iscritte e motivate nel registro di contabilità nei termini previsti, pena la decadenza. Le riserve non coltivate nei tempi giusti sono soldi persi: è una delle regole più dure e meno conosciute della contabilità lavori.",
      },
      {
        type: "section",
        heading: "Come si compila: la tecnica",
        body: "Ogni registrazione del libretto contiene: la data del rilievo, il riferimento alla voce di computo metrico o all'articolo dell'elenco prezzi, la descrizione della lavorazione misurata, le dimensioni rilevate (lunghezze, larghezze, altezze o profondità, pesi) e la quantità risultante, con schizzi e disegni quando servono a individuare il punto esatto. Tre regole pratiche. Prima: si registra man mano che le lavorazioni avanzano, non si ricostruisce a fine mese — le misure «a memoria» sono il modo migliore per litigare. Seconda: le lavorazioni destinate a sparire (scavi da rinterrare, ferri da annegare nel getto, impianti sotto traccia) vanno misurate PRIMA che diventino invisibili, con foto a supporto. Terza: niente cancellature; gli errori si correggono con annotazioni che lasciano leggibile il dato originario, perché il libretto è un documento con valore probatorio, non un blocco appunti.",
      },
      {
        type: "section",
        heading: "Dal libretto al SAL: come si collega tutto",
        body: "Il flusso della contabilità lavori è una catena a quattro anelli. Le quantità accertate nel libretto delle misure confluiscono nel registro di contabilità, dove vengono moltiplicate per i prezzi contrattuali; il sommario del registro riepiloga gli importi per voce. Alle scadenze previste dal contratto il direttore dei lavori emette lo stato avanzamento lavori (SAL), che riassume tutto quanto eseguito dall'inizio; sul SAL il RUP emette il certificato di pagamento, con la ritenuta dello 0,5% a garanzia degli obblighi verso i lavoratori, e da lì parte la fattura dell'impresa, da pagare nei termini di legge (di norma 30 giorni). Morale per l'impresa: la velocità con cui incassi dipende dalla qualità e dalla tempestività delle misure a monte. Un libretto aggiornato ogni settimana significa SAL emessi senza discussioni; un libretto arretrato di due mesi significa incassi fermi mentre i fornitori vanno pagati comunque.",
      },
      {
        type: "section",
        heading: "Libretto delle misure nei lavori privati",
        body: "Nei cantieri privati nessuna legge impone il libretto delle misure, ma la sostanza non cambia: se il contratto è a misura, qualcuno deve pur accertare le quantità da pagare. Tenere un libretto anche nel privato — pure in forma semplificata — protegge l'impresa su tre fronti: gli acconti si agganciano a quantità firmate invece che a percentuali «a sentimento», le varianti extra contratto vengono misurate e riconosciute subito invece di finire nel dimenticatoio, e in caso di contenzioso hai un documento tecnico firmato dalle parti, che davanti a un CTU vale più di qualsiasi ricostruzione a posteriori. Il collegamento con il computo metrico iniziale chiude il cerchio: confrontando misurato ed eseguito rispetto al preventivato scopri in tempo reale se la commessa sta reggendo il margine o lo sta perdendo.",
      },
      {
        type: "section",
        heading: "La contabilità di cantiere in digitale",
        body: "Il nuovo Codice appalti spinge esplicitamente verso la contabilità con strumenti digitali, e i vantaggi pratici sono immediati anche nel privato: misure inserite da smartphone direttamente in cantiere, foto e posizione allegate a ogni rilievo, quantità che si agganciano da sole alle voci di computo e confluiscono nello stato di avanzamento senza ricopiature. La ricopiatura è il punto debole storico della contabilità cartacea: ogni passaggio a mano dal blocchetto al foglio di calcolo è un'occasione di errore, e un errore di quantità su una voce da 40 €/mq ripetuto per 300 mq vale 12.000 €. Con la fatturazione elettronica collegata a valle, il ciclo misura-SAL-fattura-incasso diventa un flusso unico controllabile, invece di quattro mondi separati che qualcuno deve riconciliare a mano ogni fine mese.",
      },
      {
        type: "cta",
        heading: "Dalle misure al SAL senza ricopiature",
        body: "Con Edilizia in Cloud registri le quantità da smartphone, le colleghi al computo della commessa e generi stati di avanzamento e fatture senza doppi inserimenti. Prova gratis per 31 giorni sul tuo prossimo cantiere a misura.",
      },
    ],
    faqs: [
      {
        q: "Che differenza c'è tra libretto delle misure e registro di contabilità?",
        a: "Il libretto delle misure accerta le quantità eseguite, senza prezzi: è il documento tecnico dei fatti. Il registro di contabilità prende quelle quantità e le moltiplica per i prezzi contrattuali, trasformandole in importi. Prima si misura, poi si valorizza: se salti il primo passaggio o lo fai male, tutti gli importi a valle diventano contestabili.",
      },
      {
        q: "Chi firma il libretto delle misure?",
        a: "Il direttore dei lavori (o il direttore operativo/ispettore che ha eseguito il rilievo sotto la sua responsabilità) e il rappresentante dell'impresa esecutrice, perché le misurazioni si fanno in contraddittorio. La doppia firma è la garanzia di entrambe le parti: una quantità firmata insieme è un fatto acquisito, non un'opinione da ridiscutere al momento del pagamento.",
      },
      {
        q: "Cosa faccio se non concordo con una misura del direttore dei lavori?",
        a: "Non rifiutare la firma: firma e formula riserva, poi iscrivi e motiva la riserva nel registro di contabilità nei termini previsti dalla disciplina applicabile, altrimenti il diritto decade. Le riserve sono lo strumento con cui l'impresa tiene vive le proprie pretese economiche: gestirle nei tempi giusti è tanto importante quanto eseguire bene i lavori.",
      },
      {
        q: "Il libretto delle misure serve anche nei lavori privati?",
        a: "Non è obbligatorio, ma nei contratti a misura è fortemente consigliato: aggancia gli acconti a quantità firmate, fa riconoscere subito le varianti e costituisce prova tecnica in caso di contenzioso. Anche in forma semplificata — data, voce, dimensioni, quantità, firme — cambia completamente il rapporto di forza quando si discute di pagamenti.",
      },
      {
        q: "Come misuro le lavorazioni che poi non si vedono più?",
        a: "Prima che spariscano: scavi prima del rinterro, armature prima del getto, impianti prima della chiusura delle tracce. Il rilievo va fatto in contraddittorio e annotato subito nel libretto, con foto datate a supporto. Una lavorazione coperta senza misura condivisa è quasi impossibile da dimostrare dopo: si finisce a stime al ribasso, e a rimetterci è sempre chi ha eseguito.",
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
      "Con lo split payment la PA versa l'IVA all'Erario al posto tuo: quando si applica, quando prevale il reverse charge, come si fattura e l'impatto in cassa.",
    category: "Fisco e Fatturazione",
    tags: ["split payment", "IVA edilizia", "appalti pubblici", "liquidità"],
    publishedAt: "2026-07-25",
    readTime: 8,
    author: { name: "Florin Andriciuc", role: "Founder & CEO", avatar: FLO_AVATAR },
    coverImage: "/blog/covers/appalti-pubblici-edilizia-guida.jpg",
    content: [
      {
        type: "intro",
        body: "Lo split payment nei lavori pubblici è il regime IVA dell'art. 17-ter del DPR 633/72, detto scissione dei pagamenti: la Pubblica Amministrazione paga al fornitore solo l'imponibile e versa l'IVA direttamente all'Erario. Per un'impresa edile in appalto pubblico significa fatture con IVA esposta ma mai incassata — un meccanismo che azzera il rischio di frode per lo Stato e scarica sull'impresa un problema concreto di liquidità.",
      },
      {
        type: "section",
        heading: "Come funziona l'art. 17-ter",
        body: "Con la scissione dei pagamenti, introdotta dalla legge 190/2014 e in vigore dal 1° gennaio 2015, l'impresa emette fattura con IVA esposta normalmente, ma il cliente pubblico trattiene l'imposta e la versa direttamente all'Erario: al fornitore arriva solo l'imponibile. I soggetti obbligati ad applicarla sono le Pubbliche Amministrazioni destinatarie della fatturazione elettronica obbligatoria e le società da esse controllate individuate dagli elenchi ufficiali; le società quotate del FTSE MIB, storicamente incluse, sono uscite dal regime dal 1° luglio 2025. Un dettaglio da non dimenticare: lo split payment è una deroga alle regole IVA europee e vive di autorizzazioni UE a scadenza, l'ultima delle quali fissata al 30 giugno 2026 — verifica sempre con il tuo commercialista lo stato del regime al momento in cui fatturi, perché perimetro e proroghe cambiano nel tempo.",
      },
      {
        type: "section",
        heading: "Quando si applica e quando no",
        body: "Lo split payment si applica alle cessioni di beni e prestazioni di servizi effettuate verso i soggetti obbligati, quando l'operazione sconta IVA nei modi ordinari. Non si applica in tre famiglie di casi che interessano l'edilizia: le operazioni soggette a reverse charge (che prevale sempre sullo split), le operazioni di chi è fuori dal campo IVA ordinario come i forfettari, e i compensi assoggettati a ritenuta alla fonte a titolo d'imposta secondo le esclusioni introdotte nel tempo. Per capire se il tuo cliente è in split payment non ti serve indovinare: per le PA fa fede l'Indice delle Pubbliche Amministrazioni (IPA), mentre per le società controllate valgono gli elenchi pubblicati e aggiornati ogni anno dal Dipartimento delle Finanze. Controllare l'elenco prima di emettere la prima fattura di commessa è un minuto ben speso.",
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
        body: "La fattura in split payment espone regolarmente imponibile e IVA con l'aliquota dovuta (per i lavori pubblici spesso il 10%, altrimenti il 22%), più l'annotazione obbligatoria «scissione dei pagamenti — art. 17-ter DPR 633/72». Nella fatturazione elettronica il campo esigibilità IVA va valorizzato con «S» (scissione dei pagamenti): è quel codice a dire al sistema, e alla contabilità, che l'imposta non entrerà mai nella tua liquidazione. Esempio concreto: SAL da 100.000 € con IVA al 10% — fattura da 110.000 €, incasso di 100.000 €, e i 10.000 € di IVA li versa il Comune direttamente all'Erario. In contabilità l'IVA in split si neutralizza e non concorre al debito del periodo: se il gestionale non gestisce l'esigibilità «S» in automatico, gli errori di liquidazione sono dietro l'angolo.",
      },
      {
        type: "section",
        heading: "L'impatto sulla liquidità (il vero problema)",
        body: "Per un'impresa che compra con IVA e vende senza incassarla, lo split payment produce un effetto strutturale: il credito IVA cresce mese dopo mese. Compri materiali con IVA al 22% che paghi ai fornitori, fatturi SAL di cui incassi il solo imponibile: l'IVA sugli acquisti resta a tuo credito e la cassa la anticipa l'impresa. Su una commessa pubblica da 500.000 € con 200.000 € di acquisti, parliamo di oltre 40.000 € di IVA anticipata ai fornitori e recuperabile solo a valle. Le contromisure previste dal sistema: il rimborso IVA in via prioritaria per chi opera in split payment (art. 38-bis DPR 633/72), da chiedere in dichiarazione o con istanza trimestrale, e la compensazione in F24 nei limiti di legge. La contromisura che dipende da te: pianificare i flussi di cassa della commessa mettendo in conto l'IVA anticipata fin dal preventivo, non scoprirla a metà lavori quando i fornitori battono cassa.",
      },
      {
        type: "section",
        heading: "Errori e sanzioni",
        body: "L'errore più frequente è di inquadramento: applicare lo split dove andava il reverse charge o viceversa — la bussola è che il reverse charge prevale sempre, e il caso tipico è il subappaltatore che per riflesso condizionato fattura «come si fa con il Comune» quando il suo cliente è in realtà l'appaltatore privato. Il secondo errore è formale ma sanzionato: omettere l'annotazione «scissione dei pagamenti» in fattura, punito con sanzione amministrativa da 1.000 a 8.000 € (art. 9 del D.Lgs 471/97). Il terzo è contabile: registrare l'IVA in split come IVA a debito ordinaria, gonfiando la liquidazione e versando imposta non dovuta. Ultimo presidio, banale ma decisivo: il DURC regolare — nei pagamenti pubblici la verifica è sistematica e un DURC irregolare blocca il mandato di pagamento ben più a lungo di qualsiasi questione IVA.",
      },
      {
        type: "cta",
        heading: "Fattura alla PA senza sorprese di cassa",
        body: "Con Edilizia in Cloud imposti lo split payment sul cliente pubblico una volta sola: esigibilità «S», diciture e registrazioni corrette in automatico, e la tesoreria ti mostra quanto stai anticipando di IVA su ogni commessa. Prova gratis per 31 giorni.",
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
        a: "Per le Pubbliche Amministrazioni fa fede l'iscrizione all'Indice delle Pubbliche Amministrazioni (IPA); per le società controllate pubbliche valgono gli elenchi pubblicati e aggiornati annualmente dal Dipartimento delle Finanze. Il controllo va fatto prima di emettere la prima fattura della commessa e conviene rifarlo a ogni nuovo anno, perché gli elenchi cambiano.",
      },
      {
        q: "Come recupero l'IVA a credito generata dallo split payment?",
        a: "Con il rimborso IVA, che per chi opera in split payment è riconosciuto in via prioritaria (art. 38-bis DPR 633/72), richiedibile in dichiarazione annuale o con istanza trimestrale al ricorrere dei presupposti, oppure compensando il credito in F24 nei limiti di legge. La scelta tra rimborso e compensazione dipende dai tuoi debiti fiscali e contributivi: valutala con il commercialista.",
      },
      {
        q: "Cosa rischio se dimentico la dicitura «scissione dei pagamenti»?",
        a: "L'omessa annotazione sulla fattura è punita con una sanzione amministrativa da 1.000 a 8.000 € (art. 9 D.Lgs 471/97). L'errore è facile da evitare impostando il regime sul cliente nel gestionale, così dicitura ed esigibilità «S» escono in automatico su ogni fattura della commessa invece di dipendere dalla memoria di chi fattura quel giorno.",
      },
      {
        q: "Lo split payment è ancora in vigore?",
        a: "Lo split payment è una deroga alle regole IVA europee autorizzata a scadenza: l'ultima proroga nota fissava il termine al 30 giugno 2026, e dal 1° luglio 2025 sono uscite dal regime le società quotate del FTSE MIB. Prima di impostare le fatture di una nuova commessa pubblica, verifica con il commercialista lo stato aggiornato dell'autorizzazione e del perimetro soggettivo.",
      },
    ],
  },
];
