import { FLO_AVATAR } from "./blogAuthor";
import type { BlogPost } from "./blogPosts";

/**
 * Cluster "Template e Gratis" — 7 articoli SEO/AEO su keyword transazionali
 * a basso volume ma alta intenzione (modelli, fac simile, strumenti gratuiti,
 * opinioni, incentivi). I link interni nel corpo NON vanno scritti a mano:
 * vengono generati automaticamente da linkifyInternal (src/lib/blog/internalLinks.tsx)
 * sulle frasi chiave (preventivo edile, gestionale di cantiere, DURC, DDT,
 * computo metrico, gestione dei subappaltatori, timbratura digitale, ecc.).
 */
export const blogPostsTemplateGratis: BlogPost[] = [
  {
    id: "t1",
    slug: "modello-preventivo-edile",
    title: "Modello Preventivo Edile: Fac Simile Completo da Copiare",
    excerpt:
      "Fac simile di preventivo edile sezione per sezione: intestazione, voci con prezzi, esclusioni, tempi, pagamenti e firma. Più gli errori da evitare.",
    category: "Commerciale",
    tags: ["modello preventivo edile", "fac simile preventivo", "preventivi edilizia", "documenti impresa edile"],
    publishedAt: "2026-07-25",
    readTime: 8,
    author: { name: "Florin Andriciuc", role: "Founder & CEO", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/modello-preventivo-edile.jpg",
    faqs: [
      { q: "Cosa deve contenere un preventivo edile per essere completo?", a: "Otto sezioni: intestazione con dati di impresa e cliente, descrizione dei lavori, elenco voci con quantità e prezzi unitari, esclusioni esplicite, tempi di esecuzione, condizioni di pagamento, validità dell'offerta e spazio per la firma di accettazione. Se manca una di queste otto, il documento è esposto a contestazioni." },
      { q: "Il preventivo firmato vale come contratto?", a: "Sì: un preventivo accettato per iscritto dal cliente è a tutti gli effetti un accordo vincolante tra le parti. Per questo le esclusioni e le condizioni di pagamento vanno scritte prima della firma, non discusse a lavori iniziati. Per lavori sopra i 30.000 euro conviene comunque affiancare un contratto di appalto vero e proprio." },
      { q: "Quanto deve essere dettagliato l'elenco delle voci?", a: "Ogni voce deve avere descrizione, unità di misura, quantità e prezzo unitario. Un preventivo a corpo con una riga unica tipo ristrutturazione completa 45.000 euro è la prima causa di litigi sulle varianti: il cliente non sa cosa è incluso e tu non hai una base per farti pagare gli extra." },
      { q: "Quanto tempo deve valere un preventivo edile?", a: "Tra 15 e 30 giorni. Con i prezzi dei materiali che possono muoversi del 5-10% in un trimestre, una validità più lunga ti espone a lavorare in perdita. Scrivi la data di scadenza in chiaro: crea anche una spinta gentile a decidere." },
      { q: "Meglio Word, Excel o un software per fare i preventivi?", a: "Word ed Excel vanno bene per partire, ma ogni preventivo riparte da zero e gli errori di formula o di copia-incolla sono frequenti. Un software con listino integrato riduce il tempo per preventivo da ore a minuti e tiene lo storico di prezzi e conversioni. Sotto i 10 preventivi al mese puoi arrangiarti; sopra, il tempo perso costa più dell'abbonamento." },
      { q: "Devo indicare l'IVA nel preventivo?", a: "Sempre, e con l'aliquota giusta: 10% per manutenzioni e ristrutturazioni su abitazioni private, 22% nei casi ordinari, 4% in casi particolari come la prima casa in costruzione. Scrivi prezzi imponibili più IVA separata: un totale ambiguo è tra le contestazioni più frequenti alla fattura." },
    ],
    content: [
      {
        type: "intro",
        body: "Un modello di preventivo edile completo ha otto sezioni: intestazione, descrizione dei lavori, voci con quantità e prezzi, esclusioni, tempi, pagamenti, validità e firma. In questa guida trovi il fac simile testuale sezione per sezione, gli errori che fanno perdere i lavori e perché il preventivo curato chiude più cantieri.",
      },
      {
        type: "section",
        heading: "Sezione 1: Intestazione e Dati",
        body: "In alto a sinistra i dati della tua impresa: ragione sociale, partita IVA, indirizzo, telefono, email e — se ce l'hai — il logo. A destra i dati del cliente: nome o ragione sociale, indirizzo del cantiere se diverso dalla residenza. Poi tre righe che quasi tutti dimenticano: numero del preventivo (es. PRV-2026-041), data di emissione e oggetto in una riga secca, tipo Rifacimento bagno completo — appartamento via Roma 12, Monza. Il numero progressivo serve a te per ritrovarlo e al cliente per citarlo: un preventivo senza numero è un foglio volante.",
      },
      {
        type: "section",
        heading: "Sezione 2: Descrizione dei Lavori",
        body: "Sotto l'intestazione, 5-10 righe in italiano semplice che raccontano cosa farai: lo stato attuale, l'intervento, il risultato finale. Esempio: Demolizione dei rivestimenti esistenti, rifacimento completo dell'impianto idrico ed elettrico del bagno, nuova impermeabilizzazione, posa di pavimento e rivestimento in gres, installazione dei sanitari sospesi forniti dal cliente. Questa sezione non ha prezzi: serve a far capire al cliente che hai capito il suo problema. Chi legge 40 preventivi l'anno riconosce al volo chi ha fatto il sopralluogo sul serio e chi ha copiato un documento precedente cambiando solo il nome.",
      },
      {
        type: "list",
        heading: "Sezione 3: le Voci con Quantità e Prezzi",
        items: [
          "Ogni voce su una riga: descrizione, unità di misura (mq, ml, cad, a corpo), quantità, prezzo unitario, totale voce",
          "Esempio: Demolizione pavimento e rivestimento esistente — mq 22 x 18 euro = 396 euro",
          "Esempio: Fornitura e posa gres porcellanato 60x60 — mq 22 x 48 euro = 1.056 euro",
          "Raggruppa le voci per fase (demolizioni, impianti, posa, finiture): il cliente segue il lavoro come un racconto",
          "Le quantità le prendi dal computo metrico fatto al sopralluogo, non a occhio: sbagliare i mq del 15% significa regalare il 15%",
          "Chiudi con: totale imponibile, IVA con aliquota indicata (10% o 22%), totale complessivo",
        ],
      },
      {
        type: "section",
        heading: "Sezione 4: le Esclusioni (la Parte che Ti Salva)",
        body: "Subito dopo i totali, un elenco intitolato Esclusioni: tutto quello che NON è compreso nel prezzo. Esempi tipici: opere murarie non indicate, pratiche edilizie e oneri comunali, smaltimenti speciali oltre i quantitativi indicati, spostamento mobili, fornitura sanitari e rubinetteria, ponteggi oltre i 15 giorni. Questa sezione vale più di quanto costa scriverla: quando a metà lavoro il cliente chiede e questo non era compreso?, la risposta è nel documento che ha firmato. Le imprese che scrivono esclusioni chiare recuperano in media il 70-80% delle varianti come extra pagati; quelle che non le scrivono se le assorbono a margine.",
      },
      {
        type: "section",
        heading: "Sezioni 5-6: Tempi e Pagamenti",
        body: "Tempi: indica durata stimata in giorni lavorativi e condizioni di partenza (es. Inizio lavori entro 15 giorni dall'accettazione, durata stimata 20 giorni lavorativi salvo imprevisti strutturali documentati). Pagamenti: mai il saldo unico a fine lavori. Lo standard che funziona è 30% all'accettazione, 40% a stato avanzamento lavori concordato, 30% a fine lavori entro 7 giorni dalla consegna. Su commesse lunghe puoi legare gli acconti a fasi verificabili. Indica anche il metodo (bonifico) e, per i lavori con committenti aziendali, cosa succede in caso di ritardo: interessi di mora e sospensione dei lavori dopo 15 giorni di mancato pagamento.",
      },
      {
        type: "section",
        heading: "Sezioni 7-8: Validità e Firma",
        body: "Validità: La presente offerta è valida 30 giorni dalla data di emissione. Con i listini materiali che si muovono, oltre i 30 giorni stai promettendo prezzi che potresti non riuscire a mantenere. La scadenza è anche una leva commerciale: un preventivo senza data di scadenza autorizza il cliente a decidere tra sei mesi. Chiudi con il blocco firma: Per accettazione, data e firma del cliente, più la tua firma e timbro. Un preventivo firmato è un accordo: senza firma resta una proposta. Se lavori in digitale, la firma elettronica dal telefono elimina il giro di stampe e scansioni e ti fa chiudere mentre il cliente è ancora caldo.",
      },
      {
        type: "list",
        heading: "I 5 Errori che Fanno Perdere il Lavoro",
        items: [
          "Prezzo unico a corpo senza voci: il cliente non capisce il valore e confronta solo il totale con gli altri preventivi",
          "Niente esclusioni: ogni variante diventa una discussione e un costo tuo",
          "Consegna lenta: dopo 7 giorni di attesa il 50% dei clienti ha già scelto un altro; il preventivo va consegnato entro 48-72 ore",
          "Zero presentazione: nessun logo, righe storte, refusi — il cliente giudica il cantiere dal documento",
          "Nessun seguito: la maggior parte delle decisioni arriva dopo il secondo o terzo contatto, ma quasi nessuno richiama dopo l'invio",
        ],
      },
      {
        type: "section",
        heading: "Perché il Preventivo Curato Vince Anche a Prezzo Più Alto",
        body: "Il cliente privato non sa valutare la qualità della tua posa: valuta quello che vede. E prima del cantiere vede una sola cosa: il documento che gli hai mandato. Tra un foglio Excel con tre righe e un preventivo edile ordinato, con voci chiare, esclusioni oneste e un piano pagamenti ragionevole, il secondo vince anche con un prezzo del 10-15% più alto — perché trasmette l'idea che il cantiere sarà gestito con la stessa cura. Non è estetica: è la prova concreta di come lavori. Per approfondire il metodo completo di costruzione dell'offerta, leggi anche la guida su come fare un preventivo in edilizia che trovi sul blog.",
      },
      {
        type: "cta",
        heading: "Fai Preventivi Così in 10 Minuti, Non in 2 Ore",
        body: "Con Edilizia in Cloud il modello è già pronto: listino integrato, voci riutilizzabili, esclusioni salvate, firma digitale dal telefono del cliente. Provalo gratis per 31 giorni, senza carta di credito.",
      },
    ],
  },
  {
    id: "t2",
    slug: "contratto-subappalto-edile-fac-simile",
    title: "Contratto Subappalto Edile Fac Simile: le Clausole Chiave",
    excerpt:
      "Le clausole obbligatorie di un contratto di subappalto edile: oggetto, corrispettivo, DURC, sicurezza, penali, risoluzione. Fac simile commentato.",
    category: "Normativa",
    tags: ["contratto subappalto edile", "fac simile subappalto", "subappalto edilizia", "clausole contratto appalto"],
    publishedAt: "2026-07-25",
    readTime: 9,
    author: { name: "Florin Andriciuc", role: "Founder & CEO", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/contratto-subappalto-edile-fac-simile.jpg",
    faqs: [
      { q: "Il subappalto va sempre autorizzato dal committente?", a: "Nei lavori privati sì: l'art. 1656 del Codice Civile vieta all'appaltatore di subappaltare senza autorizzazione del committente. Negli appalti pubblici il subappalto va dichiarato in offerta e autorizzato dalla stazione appaltante secondo l'art. 119 del D.Lgs 36/2023. Un subappalto non autorizzato è causa di risoluzione del contratto principale." },
      { q: "Cosa rischio se il subappaltatore non paga i suoi operai?", a: "La responsabilità solidale: in base all'art. 29 del D.Lgs 276/2003 il committente e l'appaltatore rispondono in solido, entro due anni dalla fine dell'appalto, di retribuzioni e contributi non versati dal subappaltatore. Per questo nel contratto vanno previsti DURC a ogni pagamento e facoltà di pagamento diretto dei lavoratori con rivalsa." },
      { q: "Quanto trattenere come ritenuta di garanzia al subappaltatore?", a: "La prassi è tra il 5% e il 10% di ogni stato avanzamento, da svincolare a collaudo o dopo un periodo concordato (di solito 6-12 mesi) a copertura di vizi e difetti. Va scritta nel contratto con percentuale, momento di svincolo e condizioni: una ritenuta applicata a voce, senza clausola, è una lite quasi garantita." },
      { q: "Quali documenti devo farmi dare prima di far entrare il subappaltatore in cantiere?", a: "Visura camerale, DURC in corso di validità, autocertificazione dei requisiti tecnico-professionali con i documenti dell'allegato XVII del D.Lgs 81/2008, POS specifico per il cantiere, elenco nominativo dei lavoratori con relative idoneità sanitarie e formazione, e dal 1° ottobre 2024 la patente a crediti. Senza questi documenti il cantiere è irregolare anche per te." },
      { q: "Le penali per ritardo sono obbligatorie nel subappalto?", a: "Nei lavori privati non sono obbligatorie, ma senza penale scritta il ritardo del subappaltatore lo paghi tu verso il committente. La prassi, mutuata dagli appalti pubblici, è una penale giornaliera tra lo 0,3 e l'1 per mille dell'importo contrattuale, con un tetto complessivo (di solito il 10%) oltre il quale scatta la risoluzione." },
      { q: "Serve il contratto scritto anche per un piccolo subappalto da 10.000 euro?", a: "Sì. La cifra è piccola ma i rischi sono gli stessi: responsabilità solidale su paghe e contributi, sicurezza, danni a terzi. Un contratto sintetico di 3-4 pagine con oggetto, prezzo, tempi, DURC, sicurezza e risoluzione copre il 90% dei problemi e si prepara una volta sola come modello riutilizzabile." },
    ],
    content: [
      {
        type: "intro",
        body: "Un contratto di subappalto edile completo — il fac simile che vedi qui sotto clausola per clausola — deve contenere: oggetto e ambito dei lavori, corrispettivo e pagamenti, obblighi DURC e regolarità contributiva, sicurezza, ritenuta di garanzia, penali e risoluzione. Mancarne una significa pagare di tasca tua gli errori del subappaltatore.",
      },
      {
        type: "section",
        heading: "Prima del Contratto: Cosa Dice la Legge",
        body: "Due binari. Nei lavori privati vale l'art. 1656 del Codice Civile: non puoi subappaltare senza autorizzazione del committente — mettila per iscritto nel contratto principale o fattela dare via PEC. Negli appalti pubblici comanda l'art. 119 del D.Lgs 36/2023: il subappalto va dichiarato in offerta, autorizzato dalla stazione appaltante, e il tetto generale del 30% non esiste più, ma il bando può fissare limiti sulle lavorazioni prevalenti — verifica sempre il disciplinare. Su tutto pesa la responsabilità solidale dell'art. 29 del D.Lgs 276/2003: per due anni rispondi di paghe e contributi non versati dal tuo subappaltatore. Il contratto serve prima di tutto a gestire questo rischio.",
      },
      {
        type: "section",
        heading: "Clausola 1: Oggetto e Ambito dei Lavori",
        body: "La clausola d'apertura definisce cosa fa il subappaltatore e dove finisce il suo lavoro. Non scrivere opere di cartongesso: scrivi Fornitura e posa di contropareti e controsoffitti in cartongesso come da elaborati allegati, piani 1 e 2, esclusa rasatura finale e tinteggiatura. Allega computo, disegni e capitolato, e richiamali come parte integrante del contratto. Qui dentro metti anche il divieto di ulteriore subappalto senza tuo consenso scritto: nei cantieri pubblici il subappalto a cascata ha regole strette, e in quelli privati un terzo soggetto che non hai mai verificato è un rischio che non ti serve.",
      },
      {
        type: "section",
        heading: "Clausola 2: Corrispettivo e Pagamenti",
        body: "Indica se il prezzo è a corpo o a misura, l'importo, e il meccanismo di pagamento: di norma stati avanzamento mensili contabilizzati insieme, fattura a seguire, bonifico a 30 o 60 giorni. Tre protezioni da scrivere sempre: il pagamento è subordinato alla consegna del DURC in corso di validità; in caso di irregolarità contributiva puoi sospendere i pagamenti e pagare direttamente enti o lavoratori con rivalsa sul dovuto; il prezzo è comprensivo di ogni onere per mezzi, attrezzature e sfridi salvo quanto escluso per iscritto. Ricorda anche l'IVA: nei subappalti edili tra imprese si applica in genere il reverse charge (art. 17, comma 6, DPR 633/72) — la fattura arriva senza IVA e la integri tu.",
      },
      {
        type: "list",
        heading: "Clausola 3: Documenti e Regolarità — la Checklist",
        items: [
          "DURC in corso di validità alla firma e a ogni singolo pagamento (validità 120 giorni)",
          "Visura camerale con oggetto sociale coerente con le lavorazioni affidate",
          "Idoneità tecnico-professionale: documenti dell'allegato XVII del D.Lgs 81/2008",
          "POS consegnato prima dell'ingresso in cantiere, coordinato con il PSC se presente",
          "Elenco nominativo dei lavoratori, con obbligo di comunicare ogni variazione prima dell'ingresso",
          "Patente a crediti (obbligatoria dal 1° ottobre 2024 per chi opera nei cantieri)",
          "Nei lavori soggetti: verifica di congruità della manodopera prima del saldo finale",
        ],
      },
      {
        type: "section",
        heading: "Clausola 4: Sicurezza in Cantiere",
        body: "La clausola sicurezza deve prevedere: rispetto del PSC e del POS, obbligo di tesserino di riconoscimento per ogni lavoratore, uso dei DPI, partecipazione alle riunioni di coordinamento, e la tua facoltà di allontanare dal cantiere personale non in regola senza che questo costituisca inadempimento tuo. Aggiungi che gli oneri della sicurezza sono quantificati a parte e non ribassabili. Non è burocrazia: in caso di infortunio di un operaio del subappaltatore, la prima cosa che verificano gli ispettori è la catena documentale — chi ha verificato cosa, quando, con quali documenti. La gestione dei subappaltatori ordinata, con scadenze documenti tracciate, è la differenza tra una verifica chiusa in un'ora e un'indagine.",
      },
      {
        type: "section",
        heading: "Clausole 5-6: Ritenuta di Garanzia e Penali",
        body: "Ritenuta di garanzia: trattieni il 5-10% da ogni stato avanzamento a garanzia di vizi e difetti, con svincolo a collaudo o dopo 6-12 mesi dalla fine dei lavori. Scrivi percentuale, momento di svincolo e cosa succede se emergono difetti: senza clausola scritta, trattenere soldi è inadempimento tuo. Penali: una penale giornaliera per ritardo tra lo 0,3 e l'1 per mille dell'importo, con tetto al 10%, oltre il quale puoi risolvere il contratto. Aggiungi il diritto di sostituire il subappaltatore in caso di abbandono del cantiere, addebitandogli il maggior costo: è la clausola che ti salva quando una squadra sparisce a metà lavoro — e succede.",
      },
      {
        type: "section",
        heading: "Clausola 7: Risoluzione ed Elenco Finale",
        body: "La clausola risolutiva espressa (art. 1456 c.c.) elenca i casi in cui il contratto si scioglie con semplice comunicazione: DURC irregolare non sanato entro 15 giorni, violazioni gravi in materia di sicurezza, abbandono del cantiere per più di 5 giorni senza giustificazione, superamento del tetto penali, subappalto non autorizzato a terzi. Chiudi il contratto con: durata e cronoprogramma, assicurazione RCT del subappaltatore con massimale adeguato (per lavori medi almeno 1-2 milioni di euro), foro competente e firma di entrambe le parti su ogni pagina. Con un modello così impostato, adattarlo a ogni nuovo subappalto richiede 20 minuti, non due ore dal legale ogni volta.",
      },
      {
        type: "section",
        heading: "Cosa Non Dimenticare Mai: i 3 Punti che Valgono Soldi",
        body: "Primo: nessun pagamento senza DURC — mai, nemmeno un acconto piccolo, perché la responsabilità solidale dura due anni e non guarda gli importi. Secondo: tutto ciò che è promesso a voce non esiste — varianti, extra e proroghe valgono solo per iscritto, anche una mail basta se il contratto lo prevede. Terzo: le scadenze documenti vanno tracciate — un DURC scade dopo 120 giorni, un'idoneità sanitaria dopo un anno, e un documento scaduto in cantiere è una sanzione tua, non del subappaltatore. Un gestionale di cantiere con lo scadenzario documenti dei subappaltatori ti avvisa prima, non dopo. Per il quadro completo della normativa, leggi anche la guida al subappalto in edilizia.",
      },
      {
        type: "list",
        heading: "Gli Errori Più Frequenti nei Contratti di Subappalto",
        items: [
          "Contratto firmato dopo l'ingresso in cantiere: se succede qualcosa nei primi giorni, sei scoperto proprio quando il rischio è massimo",
          "Computo e disegni non allegati: l'oggetto resta generico e ogni contestazione sulle quantità diventa parola contro parola",
          "DURC chiesto solo alla firma e mai più: la validità è di 120 giorni, su un cantiere di 8 mesi servono almeno 2-3 verifiche",
          "Ritenuta di garanzia applicata senza clausola scritta: il subappaltatore può pretendere il pagamento integrale",
          "Varianti concordate a voce al telefono: a fine cantiere valgono zero, da entrambe le parti",
          "Nessuna assicurazione RCT verificata: un danno a terzi causato dal subappaltatore senza copertura ricade sulla filiera, cioè su di te",
        ],
      },
      {
        type: "cta",
        heading: "Subappaltatori Sotto Controllo, Documenti Inclusi",
        body: "Con Edilizia in Cloud gestisci contratti, DURC, scadenze documenti e pagamenti dei subappaltatori in un unico posto, con avvisi automatici prima delle scadenze. Provalo gratis per 31 giorni.",
      },
    ],
  },
  {
    id: "t3",
    slug: "software-gestione-cantieri-gratis",
    title: "Software Gestione Cantieri Gratis: Cosa Esiste Davvero",
    excerpt:
      "Cosa esiste davvero gratis per gestire i cantieri: Excel, Trello, app generiche. I limiti reali per un'impresa edile e quando il gratis costa caro.",
    category: "Digitalizzazione",
    tags: ["software gestione cantieri gratis", "gestionale edilizia gratuito", "excel cantieri", "strumenti gratuiti edilizia"],
    publishedAt: "2026-07-25",
    readTime: 7,
    author: { name: "Florin Andriciuc", role: "Founder & CEO", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/software-gestione-cantieri-gratis.jpg",
    faqs: [
      { q: "Esiste un software di gestione cantieri completamente gratis?", a: "Un gestionale completo per l'edilizia gratis per sempre non esiste: esistono strumenti generici gratuiti (Excel, Google Sheets, Trello, Drive) adattabili al cantiere, e versioni di prova dei gestionali verticali. Gli strumenti generici coprono singoli pezzi — un elenco, una tabella, un archivio — ma non collegano ore, costi, preventivi e fatture tra loro." },
      { q: "Fino a che punto posso gestire i cantieri con Excel?", a: "Con 1-2 cantieri e una squadra piccola, Excel regge: un foglio per il preventivo, uno per le ore, uno per i costi. I problemi iniziano con più cantieri in parallelo: file duplicati, versioni diverse tra ufficio e cantiere, formule rotte, nessun dato in tempo reale. Il limite non è il numero di righe, è il numero di persone e cantieri che devono aggiornare gli stessi dati." },
      { q: "Quanto mi costa davvero gestire tutto gratis?", a: "Il costo è in ore: raccogliere le ore della settimana per telefono, ricopiare dati tra fogli, cercare documenti nelle chat. Per un'impresa da 5-10 persone parliamo tipicamente di 4-6 ore a settimana di lavoro amministrativo evitabile: a 25 euro l'ora sono 5.000-7.800 euro l'anno, più gli errori che non vedi, come ore non fatturate e materiali non addebitati." },
      { q: "Le versioni free dei software di project management vanno bene per l'edilizia?", a: "Trello, Asana o Notion in versione gratuita organizzano bene attività e liste, ma non sanno nulla di edilizia: niente ore per commessa, niente stato avanzamento lavori, niente DDT, niente margine per cantiere. Funzionano come lavagna attività per una squadra piccola, non come sistema di gestione dei costi di commessa." },
      { q: "Quando ha senso passare da gratis a un gestionale a pagamento?", a: "Tre segnali: hai più di 2-3 cantieri in parallelo, hai perso soldi per un errore amministrativo (ore non fatturate, variante non addebitata, documento scaduto), o passi più di mezza giornata a settimana a rincorrere dati. Da lì in poi l'abbonamento — nell'ordine di 50-150 euro al mese per una piccola impresa — costa meno del tempo che stai bruciando." },
    ],
    content: [
      {
        type: "intro",
        body: "Un software di gestione cantieri gratis, completo e per sempre, non esiste: esistono strumenti generici gratuiti — Excel, Google Sheets, Trello, WhatsApp, Drive — che coprono pezzi del lavoro, e prove gratuite dei gestionali verticali. Questa guida onesta spiega cosa ottieni gratis, dove sono i limiti reali e quando il gratis inizia a costarti caro.",
      },
      {
        type: "section",
        heading: "Cosa Esiste Gratis: la Mappa Onesta",
        body: "Gratis oggi hai: fogli di calcolo (Excel con licenza Office che probabilmente già paghi, o Google Sheets davvero gratuito) per preventivi, ore e costi; Trello o Asana in versione free per le liste attività; WhatsApp per le comunicazioni con le squadre; Google Drive o Dropbox base per i documenti; Google Calendar per la pianificazione. Messi insieme, questi strumenti coprono le funzioni di base di un ufficio tecnico. E diciamolo chiaramente: per chi parte — un artigiano solo, una squadra di 2-3 persone, un cantiere alla volta — questa combinazione basta davvero. Il problema non è partire: è quello che succede quando i cantieri diventano tre e le persone otto.",
      },
      {
        type: "section",
        heading: "I Limiti Reali per un'Impresa Edile",
        body: "Il limite non è la qualità dei singoli strumenti: è che non si parlano. Le ore segnate su WhatsApp non finiscono nel costo della commessa. Il preventivo in Excel non si confronta da solo con i costi reali. Il DDT fotografato in chat non aggiorna nessun magazzino. Ogni passaggio tra uno strumento e l'altro lo fai tu, a mano, la sera o il sabato. E con più cantieri in parallelo compaiono i classici: tre versioni dello stesso file, la formula rotta che nessuno nota per un mese, il documento del subappaltatore scaduto che salta fuori durante l'ispezione. Nessuno di questi strumenti ti dice la sola cosa che conta: su questo cantiere sto guadagnando o perdendo?",
      },
      {
        type: "list",
        heading: "Quando il Gratis Costa Caro: i Conti",
        items: [
          "Raccolta ore a voce o su carta: 2-3 ore a settimana di telefonate e trascrizioni per una squadra di 8-10 persone",
          "Ore dimenticate o non fatturate: anche solo 2 ore a settimana non addebitate = oltre 3.000 euro l'anno a prezzi medi",
          "Ricopiatura dati tra fogli: 1-2 ore a settimana, con errori di battitura che finiscono nei conti",
          "Varianti fatte e mai addebitate perché non tracciate: da 500 a 5.000 euro a cantiere",
          "Totale tipico per un'impresa da 5-10 persone: 5.000-10.000 euro l'anno tra tempo perso e ricavi persi — più di dieci anni di abbonamento a un gestionale",
        ],
      },
      {
        type: "section",
        heading: "Il Vero Confronto: Non Gratis vs a Pagamento, ma Ore vs Euro",
        body: "La domanda giusta non è quanto costa il software, ma quanto costa il tempo che il gratis mi mangia. Un titolare che passa 5 ore a settimana su fogli e chat sta spendendo, al proprio costo orario reale, molto più di qualsiasi abbonamento — e sono ore tolte a preventivi, sopralluoghi e clienti, cioè alle attività che portano fatturato. C'è poi il costo invisibile: senza dati collegati non vedi il margine reale di ogni cantiere fino a lavori finiti, quando è troppo tardi per correggere. Le imprese che monitorano i costi in tempo reale intervengono sulle commesse in perdita prima della fine: è lì che un gestionale ripaga l'abbonamento, non nella grafica dei report.",
      },
      {
        type: "section",
        heading: "La Via di Mezzo: Prova Gratuita di un Verticale",
        body: "Tra il gratis per sempre con i suoi costi nascosti e l'acquisto al buio c'è una terza via: la prova gratuita di un gestionale verticale per l'edilizia. Con 31 giorni di prova completa fai un test reale: carichi un cantiere vero, fai timbrare le ore alla squadra per due settimane, emetti un paio di preventivi edili dal listino, e a fine mese confronti i numeri con il tuo metodo attuale. Se il tempo risparmiato e gli errori evitati non valgono l'abbonamento, torni ai fogli senza aver speso un euro. Se invece scopri — come capita a molti — ore mai fatturate e margini diversi da quelli immaginati, hai la risposta. Nel frattempo, se vuoi capire i costi reali di un gestionale, sul blog trovi la guida su quanto costa un gestionale per un'impresa edile.",
      },
      {
        type: "section",
        heading: "Verdetto Onesto",
        body: "Se sei da solo o in due, con un cantiere alla volta: parti gratis, con un foglio ore fatto bene e un modello di preventivo curato — funziona, e nessuno deve venderti niente. Se hai una squadra e più cantieri: il gratis ti sta già costando più di un abbonamento, solo che il costo è spalmato in ore serali e ricavi mancati, quindi non lo vedi in fattura. In quel caso l'unica scelta razionale è misurare: un mese di prova gratuita con dati veri, e decidi sui numeri tuoi, non sulle promesse di un venditore.",
      },
      {
        type: "cta",
        heading: "Fai il Test con i Tuoi Cantieri Veri",
        body: "Prova Edilizia in Cloud gratis per 31 giorni: cantieri, ore, preventivi e costi collegati tra loro. Nessuna carta di credito, e se non fa per te torni ai fogli senza aver perso nulla.",
      },
    ],
  },
  {
    id: "t4",
    slug: "app-gestione-cantieri-gratis",
    title: "App Gestione Cantieri Gratis: Cosa Fanno e Cosa Manca",
    excerpt:
      "Le app gratuite per il cantiere: cosa fanno davvero, cosa manca (ore per commessa, SAL, DDT) e il confronto onesto con un'app verticale per l'edilizia.",
    category: "Digitalizzazione",
    tags: ["app gestione cantieri gratis", "app cantiere", "app edilizia gratuita", "gestione cantiere da smartphone"],
    publishedAt: "2026-07-25",
    readTime: 6,
    author: { name: "Florin Andriciuc", role: "Founder & CEO", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/app-gestione-cantieri-gratis.jpg",
    faqs: [
      { q: "Quali app gratuite si usano di più in cantiere?", a: "WhatsApp per comunicazioni e foto, Google Foto o Drive per l'archivio immagini, Google Keep o Notes per gli appunti, Trello per le liste attività, Google Calendar per la pianificazione e fogli Google per le ore. Coprono comunicazione e memoria, ma nessuna collega quello che registri ai costi o alla fatturazione della commessa." },
      { q: "Posso rilevare le presenze della squadra con un'app gratuita?", a: "Puoi farti mandare un messaggio a inizio e fine turno, o usare un foglio condiviso. Funziona con 2-3 persone; con squadre più grandi diventa un lavoro di trascrizione: qualcuno deve trasformare i messaggi in ore per cantiere ogni settimana. Le app di timbratura vere con GPS e ore già assegnate alla commessa sono quasi sempre a pagamento, nell'ordine di pochi euro a dipendente al mese." },
      { q: "Cosa significa che le app gratuite non collegano i dati?", a: "La foto del DDT resta in chat: nessuno scarica la merce dal magazzino né la addebita al cantiere. Le ore scritte su Keep non finiscono nel costo della manodopera. Il report di avanzamento non genera lo stato avanzamento lavori da fatturare. Ogni informazione va ricopiata a mano in ufficio: è lì che si perdono ore e si infilano gli errori." },
      { q: "Un'app verticale per l'edilizia quanto costa rispetto al gratis?", a: "Per una piccola impresa si parla in genere di 50-150 euro al mese tutto compreso, spesso con utenti operai illimitati o a costo ridotto. Il confronto va fatto con le 4-6 ore a settimana di trascrizioni e telefonate che il gratis richiede: a costi orari reali, l'abbonamento si ripaga se ti fa risparmiare anche solo un'ora a settimana." },
      { q: "La mia squadra non è pratica di tecnologia: ce la fa con un'app di cantiere?", a: "Se l'app è pensata per il cantiere, sì: timbrare richiede un tocco, il rapportino è foto più due righe, meno passaggi di una telefonata più un foglio. La regola pratica: se un operaio usa WhatsApp, può usare un'app di cantiere fatta bene. Parti dai capisquadra per le prime due settimane, poi estendi al resto della squadra." },
      { q: "Come faccio una prova seria di un'app di cantiere?", a: "Scegli un cantiere attivo e fai un mese di prova gratuita con dati veri: timbrature al posto dei messaggi, rapportini con foto a fine giornata, DDT fotografati nell'app. A fine mese confronta: ore di trascrizione risparmiate, errori trovati, e se il costo manodopera per commessa che vedi corrisponde a quello che credevi. Decidi sui tuoi numeri." },
    ],
    content: [
      {
        type: "intro",
        body: "Le app di gestione cantieri gratis sono quasi sempre app generiche adattate: WhatsApp per foto e comunicazioni, Google Keep per le note, Trello per le attività, fogli condivisi per le ore. In cantiere funzionano per registrare; il limite è che niente di ciò che registri si collega a ore, SAL, DDT e costi della commessa.",
      },
      {
        type: "section",
        heading: "Cosa Fanno Bene le App Gratuite",
        body: "Diamo al gratis quello che merita. WhatsApp ha risolto la comunicazione di cantiere: foto in tempo reale, gruppi per squadra, note vocali. Google Foto archivia migliaia di immagini georeferenziate senza costi. Keep e le note del telefono battono il taccuino di carta. Trello in versione free tiene una lavagna attività decorosa per una squadra piccola. Un foglio Google condiviso raccoglie le ore se la squadra è disciplinata. Per un artigiano con 1-2 collaboratori e un cantiere alla volta, questo pacchetto copre la giornata operativa — e infatti è quello che usa la maggioranza delle micro imprese italiane. Fin qui, nessun motivo di spendere.",
      },
      {
        type: "section",
        heading: "Cosa Manca: il Collegamento con i Soldi",
        body: "Il problema emerge quando dal registrare devi passare al gestire. Le ore in chat non diventano costo manodopera della commessa: qualcuno le ricopia, tipicamente il titolare la sera. La foto del DDT non scarica il magazzino né addebita il materiale al cantiere giusto. Le foto di avanzamento non producono lo stato avanzamento lavori da mandare in fattura: il SAL lo ricostruisci a memoria a fine mese. E nessuna app generica ti dice quante ore sono andate su ogni cantiere questa settimana — che è il numero da cui dipende il tuo margine. Il gratis registra tutto e non collega niente: il collegamento sei tu, a mano, fuori orario.",
      },
      {
        type: "list",
        heading: "Confronto Onesto: App Gratuite vs App Verticale",
        items: [
          "Presenze — Gratis: messaggio in chat, poi trascrizione a mano. Verticale: timbratura digitale con GPS, ore già sulla commessa giusta",
          "Rapportino — Gratis: foto sparse in chat, ricostruzione a memoria. Verticale: rapportino con foto, note e fasi, archiviato per cantiere",
          "DDT e materiali — Gratis: foto in galleria, nessun addebito. Verticale: DDT registrato e collegato a magazzino e commessa",
          "SAL — Gratis: ricostruito a fine mese da foto e memoria. Verticale: avanzamento registrato in cantiere, SAL pronto da fatturare",
          "Costo commessa — Gratis: lo scopri a lavori finiti, se lo calcoli. Verticale: ore e materiali sommati in tempo reale",
          "Costo — Gratis: 0 euro al mese, più 4-6 ore a settimana di ufficio. Verticale: 50-150 euro al mese, trascrizioni azzerate",
        ],
      },
      {
        type: "section",
        heading: "Il Punto di Rottura: Quando le Chat Non Bastano Più",
        body: "Il punto di rottura arriva quasi sempre allo stesso modo: terzo cantiere in parallelo, squadra sopra le 5-6 persone, e il titolare che si accorge di passare il sabato mattina a ricostruire la settimana da tre gruppi WhatsApp. I segnali classici: ore che non tornano tra quanto dicono gli operai e quanto ricordi tu, materiali comprati due volte perché la foto del DDT era sepolta in chat, un SAL fatturato in ritardo di tre settimane perché andava ricostruito. Ognuno di questi episodi vale da decine a centinaia di euro; sommati su un anno, superano ampiamente il costo di qualsiasi app verticale. A quel punto il gratis non è più gratis: è solo non fatturato.",
      },
      {
        type: "section",
        heading: "Come Decidere Senza Farsi Vendere Niente",
        body: "Regola semplice. Se le chat e le note ti bastano e la sera non ricopi dati: resta sul gratis, davvero. Se invece riconosci i segnali del punto di rottura, fai un test misurabile: prendi un'app pensata per il cantiere — con timbrature, rapportini, DDT e avanzamento collegati alla commessa — e usala su un cantiere vero per un mese di prova gratuita. Il gestionale di cantiere giusto per te è quello che la squadra usa senza che tu debba rincorrerla: se dopo due settimane i capisquadra timbrano e mandano rapportini da soli, il test è riuscito. Se vuoi approfondire il metodo di passaggio dalla carta al digitale, leggi la guida alla gestione digitale del cantiere sul blog.",
      },
      {
        type: "cta",
        heading: "Un'App di Cantiere Vera, Gratis per 31 Giorni",
        body: "Prova l'app mobile di Edilizia in Cloud: timbrature GPS, rapportini con foto, DDT e avanzamento lavori collegati alla commessa. 31 giorni gratis, senza carta di credito — e la squadra la impara in un giorno.",
      },
    ],
  },
  {
    id: "t5",
    slug: "computo-metrico-gratis",
    title: "Computo Metrico Gratis: Strumenti, Template e Limiti Veri",
    excerpt:
      "Computo metrico gratis: fogli di calcolo, prezzari regionali e template. Come impostarlo in modo corretto e dove gli strumenti gratuiti si rompono.",
    category: "Digitalizzazione",
    tags: ["computo metrico gratis", "prezzari regionali", "template computo metrico", "computo metrico excel"],
    publishedAt: "2026-07-25",
    readTime: 7,
    author: { name: "Florin Andriciuc", role: "Founder & CEO", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/computo-metrico-gratis.jpg",
    faqs: [
      { q: "Posso fare un computo metrico serio con Excel o Google Sheets?", a: "Sì, per lavori semplici: imposti colonne per codice voce, descrizione, unità di misura, parti uguali, dimensioni, quantità, prezzo unitario e totale, con le somme per categoria. Per una ristrutturazione da 50-100 voci funziona. I limiti arrivano con le revisioni: ogni modifica di quantità o prezzo va propagata a mano e una formula rotta falsa il totale senza avvisarti." },
      { q: "Dove trovo prezzari gratuiti per il computo metrico?", a: "Quasi tutte le Regioni pubblicano gratuitamente il proprio prezzario delle opere pubbliche, aggiornato di norma ogni anno: lo scarichi in PDF o Excel dal sito regionale. È la base di prezzo più difendibile davanti a un committente o un direttore lavori. Ricorda però che sono prezzi medi: vanno confrontati con i tuoi costi reali di manodopera e fornitura." },
      { q: "Che differenza c'è tra computo metrico e computo metrico estimativo?", a: "Il computo metrico elenca le lavorazioni con le sole quantità (mq, mc, ml, cadauno). Il computo metrico estimativo aggiunge i prezzi unitari e i totali: quantità per prezzo, voce per voce, fino all'importo complessivo dei lavori. Nella pratica di impresa si usa quasi sempre l'estimativo, perché è la base del preventivo e del contratto." },
      { q: "I prezzi del prezzario regionale sono quelli a cui devo vendere?", a: "No: sono prezzi di riferimento, costruiti su medie regionali, e includono già spese generali e utile d'impresa in percentuali standard (tipicamente 15% e 10%). I tuoi costi veri di squadra, mezzi e fornitori possono scostarsi anche del 10-20%. Usa il prezzario come base e correggi con i tuoi numeri: vendere ai prezzi di listino senza verifica è il modo classico di lavorare in pari." },
      { q: "Quando gli strumenti gratuiti non bastano più per il computo?", a: "Tre situazioni: quando le revisioni diventano frequenti (ogni variante richiede di rifare somme e controlli a mano), quando dal computo devi generare il preventivo e poi confrontarlo con i costi reali a consuntivo, e quando i computi da fare sono decine l'anno e ogni volta riparti da zero invece di riusare voci e prezzi già lavorati." },
    ],
    content: [
      {
        type: "intro",
        body: "Fare un computo metrico gratis si può: servono un foglio di calcolo impostato bene, un prezzario regionale scaricabile senza costi e un metodo di misurazione ordinato. In questa guida trovi come strutturare il computo, dove scaricare i prezzi ufficiali e i tre punti esatti in cui gli strumenti gratuiti si rompono.",
      },
      {
        type: "section",
        heading: "Gli Strumenti Gratuiti che Funzionano Davvero",
        body: "Tre pezzi, tutti a costo zero. Primo: un foglio di calcolo — Google Sheets è gratuito, Excel probabilmente lo hai già. Secondo: il prezzario della tua Regione, scaricabile gratis dal sito istituzionale in PDF o Excel, aggiornato di norma ogni anno: è la fonte di prezzo più difendibile che esista davanti a committenti e direttori lavori. Terzo: un template ben impostato, che puoi costruirti una volta e riusare per sempre. Con questi tre strumenti un'impresa fa computi corretti per ristrutturazioni e lavori medi senza spendere un euro. Il punto non è lo strumento: è il metodo con cui lo usi — ed è lì che si vede la differenza tra un computo e una lista della spesa.",
      },
      {
        type: "list",
        heading: "Come Impostare il Foglio: le Colonne Giuste",
        items: [
          "N. voce e codice prezzario (es. 1C.01.050): il codice ti collega al prezzario e rende il computo verificabile",
          "Descrizione della lavorazione: completa, non abbreviata — è quella che finisce nel contratto",
          "Unità di misura: mq, mc, ml, cad, kg, a corpo — mai lasciarla implicita",
          "Parti uguali e dimensioni (lunghezza, larghezza, altezza): la quantità deve essere ricostruibile, non un numero secco",
          "Quantità totale, prezzo unitario, importo voce (quantità x prezzo, con formula)",
          "Subtotali per categoria (demolizioni, murature, impianti, finiture) e riepilogo finale con incidenza percentuale di ogni categoria",
        ],
      },
      {
        type: "section",
        heading: "Le Regole del Computo Corretto",
        body: "Prima regola: misura dal disegno o dal rilievo, mai a occhio — e scrivi le misure parziali, così chiunque (incluso te tra sei mesi) può verificare come è nata la quantità. Seconda: segui l'ordine cronologico del cantiere, dalle demolizioni alle finiture; un computo in ordine di lavorazione si controlla in metà tempo. Terza: aggiungi sempre gli sfridi secondo la lavorazione — tipicamente 5-10% su pavimenti e rivestimenti, 10-15% su alcune lavorazioni di taglio — e le voci che tutti dimenticano: ponteggi, smaltimenti, pulizie finali, oneri della sicurezza. Quarta: chiudi con il riepilogo per categorie e controlla le incidenze; se gli impianti pesano il 60% su una ristrutturazione ordinaria, hai sbagliato qualcosa e te ne accorgi prima del cliente.",
      },
      {
        type: "section",
        heading: "Prezzario Gratuito Sì, ma con Testa",
        body: "Il prezzario regionale è gratis e autorevole, ma è costruito su medie: dentro ogni prezzo ci sono già spese generali e utile in percentuali standard (di norma 15% e 10%), calcolati su un'impresa tipo che non è la tua. I tuoi costi reali — la paga oraria effettiva della tua squadra, i prezzi dei tuoi fornitori, la distanza del cantiere — possono scostarsi del 10-20% in entrambe le direzioni. Il metodo giusto: usa il prezzario come scheletro e verifica le 10-15 voci che pesano di più sul totale con i tuoi numeri veri. L'80% dell'importo di un computo sta tipicamente nel 20% delle voci: è lì che si decide se il lavoro rende, non sulle minuterie.",
      },
      {
        type: "section",
        heading: "Dove il Gratis Si Rompe: Revisioni, Varianti, Consuntivo",
        body: "Il foglio di calcolo regge finché il computo è statico. Si rompe in tre punti precisi. Le revisioni: il cliente cambia idea, il progettista aggiorna i disegni, e ogni giro di modifiche va propagato a mano su quantità, totali e riepiloghi — alla terza revisione gli errori sono statisticamente certi. Le varianti in corso d'opera: andrebbero computate come voci nuove e trasformate in preventivo integrativo, ma nel foglio finiscono come righe aggiunte in fondo, e a fine cantiere non sai più cosa era contratto e cosa variante. Il consuntivo: il computo dice cosa dovevi fare, ma non si confronta da solo con ore e materiali reali — così il margine vero lo scopri, se va bene, mesi dopo la chiusura. Sono esattamente i tre punti in cui un preventivo edile generato dal computo dentro un gestionale ripaga il suo costo.",
      },
      {
        type: "section",
        heading: "Il Percorso Sensato",
        body: "Se fai pochi computi l'anno, su lavori lineari: foglio più prezzario regionale, fatti bene, bastano — e questa guida più il template a colonne ti mette in condizione di partire oggi. Se i computi sono decine, con revisioni e varianti frequenti, la domanda da farti è: quante ore passo a rifare somme e a ricostruire varianti, e quante voci riscrivo da zero ogni volta? Sopra le 3-4 ore a settimana, uno strumento con listino personale, voci riusabili e collegamento computo, preventivo e consuntivo costa meno del tempo che ti mangia il foglio. Per la parte di metodo, leggi anche la guida completa al computo metrico estimativo sul blog: computo e preventivo sono due facce dello stesso documento, e chi li tratta insieme lavora una volta sola.",
      },
      {
        type: "cta",
        heading: "Dal Computo al Preventivo in un Passaggio",
        body: "Con Edilizia in Cloud il computo diventa preventivo con un clic: listino tuo, voci riusabili, varianti tracciate e confronto con i costi reali a consuntivo. Provalo gratis per 31 giorni, senza carta di credito.",
      },
    ],
  },
  {
    id: "t6",
    slug: "gestionale-edilizia-opinioni",
    title: "Gestionale Edilizia Opinioni: Cosa Dicono le Imprese",
    excerpt:
      "Cosa dicono davvero le imprese edili dei gestionali: pro e contro ricorrenti, come leggere le recensioni e le domande giuste da fare in demo.",
    category: "Digitalizzazione",
    tags: ["gestionale edilizia opinioni", "recensioni gestionale edile", "scegliere gestionale edilizia", "software edilizia recensioni"],
    publishedAt: "2026-07-25",
    readTime: 8,
    author: { name: "Florin Andriciuc", role: "Founder & CEO", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/gestionale-edilizia-opinioni.jpg",
    faqs: [
      { q: "Cosa apprezzano di più le imprese edili nei gestionali?", a: "Tre cose tornano in quasi tutte le opinioni positive: il tempo amministrativo recuperato (tipicamente 4-8 ore a settimana tra ore, documenti e fatturazione), la visibilità sui margini di commessa mentre il cantiere è aperto e non a lavori finiti, e la fine dei dati sparsi tra chat, fogli e carta. Quando un titolare è contento, quasi sempre cita almeno una di queste tre." },
      { q: "Qual è la lamentela più frequente sui gestionali edilizia?", a: "La curva di apprendimento: le prime 2-4 settimane richiedono disciplina, perché la squadra deve cambiare abitudini e i dati vanno caricati. La seconda è l'assistenza lenta o solo via ticket. La terza riguarda i gestionali generici adattati all'edilizia: mancano SAL, subappalti, Cassa Edile, e l'impresa si ritrova a pagare per qualcosa che copre metà del lavoro." },
      { q: "Le recensioni online dei gestionali sono affidabili?", a: "In parte. Guarda tre cose: la data (una recensione di 3-4 anni fa descrive un software che non esiste più), la dimensione dell'azienda recensente (l'opinione di uno studio di progettazione vale poco per un'impresa da 10 operai) e la specificità (una recensione utile cita funzioni e numeri, non giudizi generici a 5 o 1 stelle). Dieci recensioni recenti e specifiche valgono più di cento generiche." },
      { q: "Meglio un gestionale verticale per l'edilizia o uno generico più economico?", a: "Le opinioni delle imprese su questo sono nette: il generico costa meno all'inizio e delude dopo, perché non parla la lingua del cantiere — niente SAL, commesse, subappalti, DURC. Il verticale costa qualcosa in più e copre il flusso vero: preventivo, cantiere, ore, costi, fattura. Il risparmio del generico si consuma in adattamenti e doppi inserimenti nel giro di pochi mesi." },
      { q: "Quanto dura davvero l'avviamento di un gestionale in un'impresa edile?", a: "Dalle esperienze ricorrenti: 1-2 settimane per configurare azienda, listini e cantieri attivi, 2-4 settimane perché la squadra prenda il ritmo su timbrature e rapportini, e 2-3 mesi per avere dati storici sufficienti a leggere i margini con fiducia. Le imprese che partono con un solo cantiere pilota e poi estendono arrivano a regime prima di quelle che migrano tutto insieme." },
      { q: "Che domande devo fare in demo per non farmi incantare?", a: "Cinque: posso vedere il flusso completo preventivo-cantiere-SAL-fattura con dati miei? Quanto costa davvero a regime, utenti operai inclusi? L'assistenza risponde al telefono in italiano e in quanto tempo? Se me ne vado, i miei dati come li riporto fuori? Posso parlare con un cliente simile a me per dimensione e mestiere? Le risposte vaghe a queste cinque valgono più di qualsiasi recensione." },
    ],
    content: [
      {
        type: "intro",
        body: "Le opinioni delle imprese edili sui gestionali si somigliano tutte: chi li usa bene cita tempo amministrativo dimezzato e margini finalmente visibili; chi li abbandona cita avviamento faticoso, assistenza lenta o software generici travestiti da edilizia. Questa guida raccoglie i pro e i contro ricorrenti per categoria e le domande da fare in demo.",
      },
      {
        type: "section",
        heading: "Cosa Dicono le Imprese: i Pro Ricorrenti",
        body: "Mettendo in fila le esperienze di titolari di imprese da 3 a 50 persone, tre benefici tornano con una regolarità impressionante. Il primo è il tempo: 4-8 ore a settimana recuperate su raccolta ore, ricerca documenti e preparazione fatture — quasi sempre ore serali o del sabato, cioè le più odiate. Il secondo sono i margini: sapere quanto sta costando ogni cantiere mentre è aperto, non sei mesi dopo; più di un titolare racconta di aver scoperto commesse in perdita che credeva in utile — e viceversa. Il terzo è l'ordine: un posto solo dove stanno ore, DDT, foto, contratti e scadenze, invece di tre chat e due archivi. Chi cita questi tre benefici, in genere, non torna indietro.",
      },
      {
        type: "section",
        heading: "I Contro Ricorrenti (Che Nessun Venditore Ti Dice)",
        body: "Le opinioni negative sono altrettanto istruttive, e girano intorno a tre temi. La curva di apprendimento: le prime 2-4 settimane sono in salita — la squadra deve cambiare abitudini, i listini vanno caricati, e se il titolare non ci crede per primo, il progetto muore lì; è la causa numero uno degli abbandoni. I costi che crescono: moduli extra, utenti aggiuntivi, formazione a pagamento — il prezzo di partenza e il prezzo a regime possono essere molto diversi, e scoprirlo dopo la firma brucia. L'assistenza: quando il cantiere è fermo e il programma non va, un ticket con risposta in 48 ore è un danno economico, non un disservizio. Nessuno di questi tre contro dipende dal concetto di gestionale: dipendono da quale scegli e da come lo avvii.",
      },
      {
        type: "list",
        heading: "Come Leggere le Recensioni Senza Farsi Ingannare",
        items: [
          "Guarda la data: una recensione di oltre 2 anni descrive un prodotto che nel software cloud non esiste più, nel bene e nel male",
          "Guarda chi scrive: l'opinione di un geometra libero professionista non vale per un'impresa con 15 operai, e viceversa",
          "Cerca i numeri: quanto tempo risparmiato, quanti utenti, quanti cantieri — le recensioni specifiche sono le uniche utili",
          "Diffida degli estremi: i 5 stelle entusiasti senza dettagli e gli 1 stella furiosi per un singolo episodio dicono poco; il succo sta nelle recensioni a 3-4 stelle argomentate",
          "Pesa i contro ricorrenti: un difetto citato una volta è un episodio, citato da 10 recensioni è una caratteristica del prodotto",
        ],
      },
      {
        type: "section",
        heading: "Verticale o Generico: il Punto su Cui le Opinioni Convergono",
        body: "Se c'è un tema su cui le esperienze delle imprese edili convergono, è questo: i gestionali generici adattati all'edilizia deludono. Un CRM nato per i servizi o un gestionale nato per il commercio non conoscono SAL, commesse, subappalti, ritenute, Cassa Edile: l'impresa si ritrova a piegare il proprio lavoro allo strumento, con campi riadattati e fogli Excel di contorno che dovevano sparire. Il gestionale edile verticale costa in genere qualcosa in più, ma il flusso preventivo, cantiere, ore, SAL e fatturazione elettronica è quello vero del mestiere. La domanda da farsi non è quanto costa al mese, ma quanto del mio flusso copre davvero: un software che ne copre metà lo paghi due volte — in abbonamento e in lavoro manuale residuo.",
      },
      {
        type: "quote",
        quote:
          "Ho provato due gestionali generici prima di arrivare a uno fatto per l'edilizia. La differenza l'ho capita alla prima commessa: non ho dovuto spiegare io al software cosa è un SAL.",
        author: "Titolare di impresa edile, 12 dipendenti, provincia di Brescia",
      },
      {
        type: "section",
        heading: "Le Domande da Fare in Demo (e le Risposte che Devi Pretendere)",
        body: "La demo è il momento in cui le opinioni degli altri lasciano il posto ai fatti tuoi. Cinque domande. Uno: fammi vedere il flusso completo — dal preventivo alla fattura passando per ore e SAL — con un caso simile ai miei cantieri, non con la demo preconfezionata. Due: il prezzo a regime, tutto incluso: utenti, operai, moduli, assistenza, formazione — per iscritto. Tre: assistenza in italiano, al telefono, con che tempi di risposta. Quattro: se tra due anni me ne vado, come esporto i miei dati? Cinque: fammi parlare con un cliente come me per dimensione e mestiere. Un fornitore serio risponde a tutte e cinque senza girarci intorno; le risposte evasive in demo diventano problemi tuoi dopo la firma. E prima di firmare, pretendi una prova gratuita con i tuoi dati veri: è l'unica recensione di cui puoi fidarti al 100%. Per il metodo completo di valutazione, leggi anche la guida alla scelta del gestionale per l'edilizia.",
      },
      {
        type: "cta",
        heading: "Fatti la Tua Opinione: 31 Giorni Gratis",
        body: "Le recensioni ti portano fino alla porta; il giudizio vero lo dai tu con i tuoi cantieri. Prova Edilizia in Cloud gratis per 31 giorni, con assistenza in italiano inclusa e senza carta di credito.",
      },
    ],
  },
  {
    id: "t7",
    slug: "incentivi-digitalizzazione-edilizia-2026",
    title: "Digitalizzazione Edilizia: Incentivi 2026 per le Imprese",
    excerpt:
      "Il quadro degli incentivi 2026 per digitalizzare un'impresa edile: Transizione 5.0, bandi camerali, voucher regionali, formazione. Cosa verificare e dove.",
    category: "Normativa",
    tags: ["incentivi digitalizzazione edilizia", "transizione 5.0 edilizia", "voucher digitalizzazione", "bandi imprese edili 2026"],
    publishedAt: "2026-07-25",
    readTime: 8,
    author: { name: "Florin Andriciuc", role: "Founder & CEO", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/incentivi-digitalizzazione-edilizia-2026.jpg",
    faqs: [
      { q: "Quali incentivi può usare un'impresa edile per digitalizzarsi nel 2026?", a: "Le famiglie principali sono cinque: i crediti d'imposta nazionali per beni strumentali e digitali (Transizione 5.0 e le misure che la Legge di Bilancio conferma anno per anno), la Nuova Sabatini per l'acquisto di beni anche digitali, i voucher digitali delle Camere di Commercio, i bandi regionali per la digitalizzazione delle PMI e i fondi per la formazione del personale. Percentuali e scadenze cambiano: vanno verificate sul bando specifico." },
      { q: "Il software gestionale rientra negli incentivi per la digitalizzazione?", a: "In molti casi sì: i voucher camerali e diversi bandi regionali includono espressamente software gestionali cloud, consulenza e formazione collegata tra le spese ammissibili. Nelle misure nazionali sui beni immateriali l'ammissibilità dipende dai requisiti tecnici richiesti dalla singola misura. Prima di acquistare, verifica sul testo del bando che la voce di spesa sia inclusa e che l'acquisto sia successivo alla domanda, se richiesto." },
      { q: "Cosa sono i voucher digitali delle Camere di Commercio?", a: "Sono contributi a fondo perduto che molte Camere di Commercio pubblicano periodicamente attraverso i PID (Punti Impresa Digitale) per spese di digitalizzazione delle micro e piccole imprese: tecnologie, software, consulenza e formazione. Importi, percentuali di copertura e finestre di domanda variano da camera a camera e da anno a anno: il riferimento è il sito della tua Camera di Commercio, sezione bandi." },
      { q: "Come funziona Transizione 5.0 per un'impresa edile?", a: "È un credito d'imposta legato a investimenti in beni strumentali e digitali che producono una riduzione certificata dei consumi energetici dell'impresa. La logica: investimento più efficienza energetica uguale credito. Aliquote, scaglioni e finestre temporali sono stati modificati più volte: prima di contare su questa misura, verifica sul sito del GSE e del MIMIT lo stato 2026 e fatti seguire da chi certifica i requisiti energetici." },
      { q: "Gli incentivi coprono anche la formazione della squadra sull'uso del software?", a: "Spesso sì, ed è la parte che le imprese dimenticano di più: i voucher camerali includono di frequente la formazione tra le spese ammissibili, i fondi interprofessionali (come Fondimpresa) finanziano piani formativi aziendali, e alcune misure regionali coprono ore di affiancamento. Dato che l'avviamento è il punto dove i progetti di digitalizzazione falliscono, usare fondi per la formazione è il modo più intelligente di spendere un incentivo." },
      { q: "Da dove comincio concretamente per non perdere i bandi?", a: "Tre mosse: iscriviti alla newsletter della tua Camera di Commercio e controlla la sezione bandi della tua Regione una volta al mese; chiedi al commercialista un check annuale sulle misure nazionali in Legge di Bilancio; e prepara i documenti ricorrenti (visura, DURC, dimensione d'impresa, preventivi di spesa) in una cartella pronta. La maggior parte dei bandi camerali si esaurisce in poche settimane: chi ha i documenti pronti arriva in tempo." },
    ],
    content: [
      {
        type: "intro",
        body: "Gli incentivi per la digitalizzazione di un'impresa edile nel 2026 si dividono in cinque famiglie: crediti d'imposta nazionali per beni digitali, Nuova Sabatini, voucher delle Camere di Commercio, bandi regionali e fondi per la formazione. Questa guida ti dà il quadro e il metodo — con una regola fissa: percentuali e scadenze si verificano sempre sul bando.",
      },
      {
        type: "section",
        heading: "Perché Questa Guida Non Ti Dà Percentuali Precise",
        body: "Partiamo dal patto di onestà: gli incentivi cambiano di continuo. Le aliquote vengono ritoccate dalle Leggi di Bilancio, i fondi si esauriscono prima della scadenza formale, i bandi camerali durano poche settimane. Qualsiasi articolo che oggi ti promette il 50% garantito su questo e quello rischia di farti fare i conti su numeri già vecchi. Quello che invece resta stabile è la struttura: quali famiglie di incentivi esistono, che tipo di spese coprono e dove si controllano. Questa guida ti dà la mappa; i numeri esatti li verifichi sulle fonti ufficiali — GSE e MIMIT per le misure nazionali, la tua Camera di Commercio e la tua Regione per quelle locali — o li fai verificare a commercialista e consulente bandi.",
      },
      {
        type: "section",
        heading: "Famiglia 1: i Crediti d'Imposta Nazionali",
        body: "Il filone principale è Transizione 5.0: un credito d'imposta per investimenti in beni strumentali e digitali collegati a una riduzione certificata dei consumi energetici dell'impresa. La logica è: investi, certifichi il risparmio energetico, maturi un credito da usare in compensazione. Per un'impresa edile può riguardare macchinari, ma anche la componente digitale collegata. Attenzione doppia: la misura è stata rimodulata più volte e richiede certificazioni tecniche ex ante ed ex post — non è un fai da te, serve un professionista. Accanto, la storica linea dei crediti per beni strumentali 4.0 (inclusi i beni immateriali come i software con determinati requisiti) è in esaurimento e viene confermata o meno anno per anno: lo stato 2026 va verificato in Legge di Bilancio con il commercialista prima di firmare qualsiasi ordine.",
      },
      {
        type: "section",
        heading: "Famiglie 2 e 3: Nuova Sabatini e Voucher Camerali",
        body: "La Nuova Sabatini è la misura più longeva: un contributo statale sugli interessi per finanziamenti destinati all'acquisto di beni strumentali, con una corsia per gli investimenti digitali e green. Funziona a plafond: quando i fondi dell'anno finiscono, si aspetta il rifinanziamento — quindi il momento della domanda conta. I voucher digitali delle Camere di Commercio, tramite i Punti Impresa Digitale (PID), sono invece la porta più accessibile per una piccola impresa edile: contributi a fondo perduto per software, tecnologie, consulenza e formazione, con domande semplici rispetto ai bandi nazionali. Ogni camera pubblica il suo bando con importi e finestre proprie, e i fondi si esauriscono in fretta: la sezione bandi del sito camerale va controllata ogni mese, o ti iscrivi alla newsletter e lasci che sia il bando a trovare te.",
      },
      {
        type: "list",
        heading: "Famiglie 4 e 5: Regioni e Formazione",
        items: [
          "Bandi regionali digitalizzazione PMI: quasi ogni Regione pubblica periodicamente misure per software, consulenza e attrezzature digitali — canali: sito della Regione, finanziaria regionale, portali bandi",
          "Fondi europei gestiti dalle Regioni (FESR): finanziano spesso la transizione digitale delle piccole imprese, edilizia inclusa",
          "Fondi interprofessionali (es. Fondimpresa): se versi già il contributo con le buste paga, puoi finanziare piani di formazione della squadra — anche sull'uso del nuovo software",
          "Misure di formazione continua regionali e nazionali: coprono ore di aula e affiancamento, la parte che decide se la digitalizzazione attecchisce",
          "Regola sempre valida: spese ammissibili, percentuali e scadenze si leggono sul testo del bando, non sui riassunti — e la domanda spesso va fatta prima dell'acquisto",
        ],
      },
      {
        type: "section",
        heading: "Cosa Ci Copri: le Spese Tipiche di una Digitalizzazione Edile",
        body: "Tradotto nel concreto di un'impresa edile, le spese che i bandi coprono più spesso sono: il gestionale di cantiere in cloud e i canoni collegati (dove il bando ammette i canoni), i dispositivi per il cantiere — smartphone e tablet per timbratura digitale, rapportini e foto —, la fatturazione elettronica e gli strumenti amministrativi, la consulenza per l'avviamento e la formazione della squadra. Un progetto tipo da piccola impresa — software, 4-5 dispositivi, avviamento e formazione — si colloca spesso tra i 5.000 e i 15.000 euro: esattamente la taglia dei voucher camerali e dei bandi regionali minori. Il che significa che una parte rilevante del progetto può rientrare, se ti muovi quando la finestra è aperta.",
      },
      {
        type: "section",
        heading: "Il Metodo: 4 Mosse per Non Perdere il Treno",
        body: "Prima mossa: monitoraggio — newsletter della Camera di Commercio, controllo mensile dei bandi regionali, check annuale con il commercialista sulla Legge di Bilancio; costo: un'ora al mese. Seconda: cartella documenti pronta — visura, DURC, dichiarazione dimensione d'impresa, preventivi dei fornitori; i bandi camerali si esauriscono in settimane e vince chi è pronto. Terza: progetto scritto prima del bando — cosa digitalizzi, con che strumenti, con che spese; un preventivo dettagliato del fornitore ti fa fare domanda in giorni invece che in settimane. Quarta: mai comprare contando sull'incentivo non ancora concesso — l'investimento deve reggersi da solo, con l'incentivo come acceleratore; e occhio alla regola frequente per cui la spesa è ammissibile solo se successiva alla domanda. Un ultimo numero, l'unico garantito di questo articolo: provare un gestionale per 31 giorni costa zero, bando o non bando — ed è il modo giusto di preparare il progetto da presentare.",
      },
      {
        type: "cta",
        heading: "Intanto che Aspetti il Bando, il Test è Gratis",
        body: "Prepara il progetto di digitalizzazione con dati veri: prova Edilizia in Cloud gratis per 31 giorni, senza carta di credito. Se poi arriva il voucher, hai già il preventivo e la squadra formata.",
      },
    ],
  },
];
