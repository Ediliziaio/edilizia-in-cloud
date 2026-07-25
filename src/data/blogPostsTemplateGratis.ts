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
    title: "Modello Preventivo Edile: il Fac Simile che Chiude i Lavori",
    excerpt:
      "Il preventivo scritto bene chiude il lavoro. Quello scritto male lo chiude al concorrente. Fac simile di preventivo edile sezione per sezione, con esempi.",
    category: "Commerciale",
    tags: ["modello preventivo edile", "fac simile preventivo", "preventivi edilizia", "documenti impresa edile"],
    publishedAt: "2026-07-25",
    readTime: 8,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/modello-preventivo-edile.jpg",
    faqs: [
      { q: "Cosa deve contenere un preventivo edile per essere completo?", a: "Otto sezioni: intestazione con dati di impresa e cliente, descrizione dei lavori, voci con quantità e prezzi unitari, esclusioni esplicite, tempi di esecuzione, condizioni di pagamento, validità dell'offerta e firma di accettazione. Se ne manca una, il documento è esposto a contestazioni. E ogni contestazione ha un costo: tempo, sconti forzati, lavori fermi." },
      { q: "Il preventivo firmato vale come contratto?", a: "Sì. Un preventivo accettato per iscritto dal cliente è un accordo vincolante tra le parti. Per questo esclusioni e condizioni di pagamento si scrivono prima della firma, non si discutono a lavori iniziati. Per lavori sopra i 30.000 euro conviene comunque affiancare un contratto di appalto vero e proprio." },
      { q: "Quanto deve essere dettagliato l'elenco delle voci?", a: "Ogni voce vuole descrizione, unità di misura, quantità e prezzo unitario. La riga unica — ristrutturazione completa, 45.000 euro — è la prima causa di litigi sulle varianti. Il cliente non sa cosa è incluso. E tu non hai una base per farti pagare gli extra." },
      { q: "Quanto tempo deve valere un preventivo edile?", a: "Tra 15 e 30 giorni. I prezzi dei materiali possono muoversi del 5-10% in un trimestre: una validità più lunga ti espone a lavorare in perdita. Scrivi la data di scadenza in chiaro. Una data che si avvicina, tra l'altro, spinge il cliente a decidere." },
      { q: "Meglio Word, Excel o un software per fare i preventivi?", a: "Word ed Excel vanno bene per partire. Ma ogni preventivo riparte da zero, e gli errori di formula o di copia-incolla sono frequenti. Un software con listino integrato porta il tempo per preventivo da ore a minuti e tiene lo storico di prezzi e conversioni. Sotto i 10 preventivi al mese ti arrangi; sopra, il tempo perso costa più dell'abbonamento." },
      { q: "Devo indicare l'IVA nel preventivo?", a: "Sempre, con l'aliquota giusta: 10% per manutenzioni e ristrutturazioni su abitazioni private, 22% nei casi ordinari, 4% in casi particolari come la prima casa in costruzione. Scrivi prezzi imponibili più IVA separata. Il totale ambiguo è tra le contestazioni più frequenti alla fattura." },
    ],
    content: [
      {
        type: "intro",
        body: "Venerdì sera, 21:30. Il cliente aspetta il preventivo da tre giorni. Tu sei ancora al tavolo con la calcolatrice e i fogli del fornitore. Un modello di preventivo edile completo ha otto sezioni: intestazione, descrizione dei lavori, voci con quantità e prezzi, esclusioni, tempi, pagamenti, validità e firma. Qui trovi il fac simile sezione per sezione, con gli esempi da copiare. E una verità semplice da tenere davanti mentre scrivi: il preventivo scritto bene chiude il lavoro. Quello scritto male lo chiude al tuo concorrente.",
      },
      {
        type: "section",
        heading: "Sezione 1: Intestazione e Dati",
        body: "Il cliente riceve tre preventivi e li mette in fila sul tavolo. Il tuo deve sembrare un documento, non un foglio volante. In alto a sinistra la tua impresa: ragione sociale, partita IVA, indirizzo, telefono, email, logo se ce l'hai. A destra il cliente: nome o ragione sociale, indirizzo del cantiere se diverso dalla residenza. Poi le tre righe che quasi tutti dimenticano. Numero del preventivo, tipo PRV-2026-041. Data di emissione. Oggetto in una riga secca: Rifacimento bagno completo — appartamento via Roma 12, Monza. Il numero serve a te per ritrovarlo e al cliente per citarlo. Un preventivo senza numero e senza data finisce in fondo a un cassetto. E dai cassetti non firma nessuno.",
      },
      {
        type: "section",
        heading: "Sezione 2: la Descrizione che Vende il Sopralluogo",
        body: "Qui il cliente capisce se hai guardato casa sua o un documento vecchio. Sotto l'intestazione, 5-10 righe in italiano semplice: stato attuale, intervento, risultato finale. Esempio: demolizione dei rivestimenti esistenti, rifacimento completo dell'impianto idrico ed elettrico del bagno, nuova impermeabilizzazione, posa di pavimento e rivestimento in gres, installazione dei sanitari sospesi forniti dal cliente. Niente prezzi, in questa sezione. Solo la prova che hai capito il suo problema. Chi legge 40 preventivi l'anno riconosce al volo il copia-incolla con il nome cambiato. E il copia-incolla perde. Anche quando costa meno.",
      },
      {
        type: "list",
        heading: "Sezione 3: le Voci — Dove si Vince il Confronto",
        items: [
          "Ogni voce su una riga: descrizione, unità di misura (mq, ml, cad, a corpo), quantità, prezzo unitario, totale voce",
          "Esempio: demolizione pavimento e rivestimento esistente — mq 22 x 18 euro = 396 euro",
          "Esempio: fornitura e posa gres porcellanato 60x60 — mq 22 x 48 euro = 1.056 euro",
          "Raggruppa per fase: demolizioni, impianti, posa, finiture. Il cliente segue il lavoro come un racconto",
          "Le quantità arrivano dal computo metrico fatto al sopralluogo, non a occhio: sbagliare i mq del 15% è regalare il 15%",
          "Chiudi con totale imponibile, IVA con aliquota indicata (10% o 22%), totale complessivo",
        ],
      },
      {
        type: "section",
        heading: "Sezione 4: le Esclusioni — i Soldi che Non Regali",
        body: "Metà cantiere. Il cliente indica il muro e chiede: ma questo non era compreso? Se le esclusioni non sono scritte, quella domanda te la paghi tu. Subito dopo i totali, un elenco intitolato Esclusioni: tutto quello che NON è nel prezzo. Opere murarie non indicate. Pratiche edilizie e oneri comunali. Smaltimenti speciali oltre i quantitativi indicati. Spostamento mobili. Fornitura sanitari e rubinetteria. Ponteggi oltre i 15 giorni. Sono dieci minuti di scrittura, una volta sola. Le imprese che scrivono esclusioni chiare recuperano il 70-80% delle varianti come extra pagati. Le altre se le mangiano a margine. Cantiere dopo cantiere.",
      },
      {
        type: "section",
        heading: "Sezioni 5-6: Tempi e Pagamenti",
        body: "Il saldo unico a fine lavori è il modo più rapido di finanziare il cliente con i tuoi soldi. Lo standard che funziona: 30% all'accettazione, 40% a stato avanzamento lavori concordato, 30% a fine lavori entro 7 giorni dalla consegna. Su commesse lunghe, lega gli acconti a fasi verificabili. Indica il metodo di pagamento (bonifico) e, con committenti aziendali, cosa succede al ritardo: interessi di mora e sospensione dei lavori dopo 15 giorni di mancato pagamento. Per i tempi: durata stimata in giorni lavorativi e condizioni di partenza. Esempio: inizio lavori entro 15 giorni dall'accettazione, durata stimata 20 giorni lavorativi salvo imprevisti strutturali documentati. Chi scrive i tempi comanda il cantiere. Chi non li scrive, li subisce.",
      },
      {
        type: "section",
        heading: "Sezioni 7-8: Validità e Firma",
        body: "Un preventivo senza scadenza autorizza il cliente a decidere tra sei mesi. Ai prezzi di oggi. Scrivi: la presente offerta è valida 30 giorni dalla data di emissione. Con i listini materiali che si muovono, oltre i 30 giorni prometti prezzi che potresti non riuscire a mantenere. E la scadenza è anche una leva commerciale: una data che si avvicina fa decidere. Chiudi con il blocco firma: per accettazione, data e firma del cliente, più la tua firma e timbro. Firmato è un accordo. Non firmato è una proposta. Se lavori in digitale, la firma elettronica dal telefono chiude mentre il cliente è ancora caldo. Senza il giro di stampe, scansioni e giorni persi — che spesso sono i giorni in cui cambia idea.",
      },
      {
        type: "list",
        heading: "I 5 Errori che Regalano il Lavoro al Concorrente",
        items: [
          "Prezzo unico a corpo senza voci: il cliente non capisce il valore e confronta solo il totale con gli altri preventivi",
          "Niente esclusioni: ogni variante diventa una discussione, e ogni discussione un costo tuo",
          "Consegna lenta: dopo 7 giorni di attesa il 50% dei clienti ha già scelto un altro. Consegna entro 48-72 ore",
          "Zero presentazione: righe storte, refusi, nessun logo. Il cliente giudica il cantiere dal documento",
          "Nessun seguito: la decisione arriva al secondo o terzo contatto, ma quasi nessuno richiama dopo l'invio",
        ],
      },
      {
        type: "section",
        heading: "Perché il Preventivo Curato Vince Anche a Prezzo Più Alto",
        body: "Il cliente privato non sa valutare la qualità della tua posa. Valuta quello che vede. E prima del cantiere vede una cosa sola: il documento che gli hai mandato. Tra un foglio Excel con tre righe e un preventivo edile ordinato — voci chiare, esclusioni oneste, piano pagamenti ragionevole — il secondo vince anche con un prezzo del 10-15% più alto. Perché racconta come gestirai il cantiere. Non è estetica: è la prova concreta di come lavori. Per il metodo completo di costruzione dell'offerta, leggi anche la guida su come fare un preventivo in edilizia che trovi sul blog. Il conto finale è semplice: due ore in più sul documento oggi, un lavoro in più chiuso questo mese.",
      },
      {
        type: "cta",
        heading: "Il Prossimo Venerdì Sera, il Preventivo È Già Partito",
        body: "Con Edilizia in Cloud il modello è già pronto: listino integrato, voci riutilizzabili, esclusioni salvate, firma digitale dal telefono del cliente. Dieci minuti, non due ore. Provalo gratis per 31 giorni, senza carta di credito.",
      },
    ],
  },
  {
    id: "t2",
    slug: "contratto-subappalto-edile-fac-simile",
    title: "Contratto Subappalto Edile: Fac Simile e Clausole Chiave",
    excerpt:
      "Ogni clausola del contratto di subappalto sono soldi che non perdi in contenzioso: oggetto, DURC, penali, risoluzione. Fac simile commentato voce per voce.",
    category: "Normativa",
    tags: ["contratto subappalto edile", "fac simile subappalto", "subappalto edilizia", "clausole contratto appalto"],
    publishedAt: "2026-07-25",
    readTime: 9,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/contratto-subappalto-edile-fac-simile.jpg",
    faqs: [
      { q: "Il subappalto va sempre autorizzato dal committente?", a: "Nei lavori privati sì: l'art. 1656 del Codice Civile vieta all'appaltatore di subappaltare senza autorizzazione del committente. Negli appalti pubblici va dichiarato in offerta e autorizzato dalla stazione appaltante secondo l'art. 119 del D.Lgs 36/2023. Un subappalto non autorizzato è causa di risoluzione del contratto principale. Tradotto: perdi la commessa." },
      { q: "Cosa rischio se il subappaltatore non paga i suoi operai?", a: "Rischi di pagare tu. In base all'art. 29 del D.Lgs 276/2003, committente e appaltatore rispondono in solido, entro due anni dalla fine dell'appalto, di retribuzioni e contributi non versati dal subappaltatore. Per questo nel contratto servono DURC a ogni pagamento e la facoltà di pagare direttamente i lavoratori, con rivalsa." },
      { q: "Quanto trattenere come ritenuta di garanzia al subappaltatore?", a: "Tra il 5% e il 10% di ogni stato avanzamento. Si svincola a collaudo o dopo un periodo concordato — di solito 6-12 mesi — a copertura di vizi e difetti. Va scritta nel contratto: percentuale, momento di svincolo, condizioni. Una ritenuta applicata a voce, senza clausola, è una lite quasi garantita." },
      { q: "Quali documenti devo farmi dare prima di far entrare il subappaltatore in cantiere?", a: "Sei documenti prima dell'ingresso: visura camerale, DURC in corso di validità, idoneità tecnico-professionale con i documenti dell'allegato XVII del D.Lgs 81/2008, POS specifico per il cantiere, elenco nominativo dei lavoratori con idoneità sanitarie e formazione, e dal 1° ottobre 2024 la patente a crediti. Senza questi documenti il cantiere è irregolare anche per te." },
      { q: "Le penali per ritardo sono obbligatorie nel subappalto?", a: "Nei lavori privati no, non sono obbligatorie. Ma senza penale scritta, il ritardo del subappaltatore lo paghi tu verso il committente. La prassi, mutuata dagli appalti pubblici: penale giornaliera tra lo 0,3 e l'1 per mille dell'importo contrattuale, con tetto complessivo di solito al 10%, oltre il quale scatta la risoluzione." },
      { q: "Serve il contratto scritto anche per un piccolo subappalto da 10.000 euro?", a: "Sì, sempre. La cifra è piccola, i rischi sono gli stessi: responsabilità solidale su paghe e contributi, sicurezza, danni a terzi. Un contratto sintetico di 3-4 pagine con oggetto, prezzo, tempi, DURC, sicurezza e risoluzione copre il 90% dei problemi. E lo prepari una volta sola, come modello riutilizzabile." },
    ],
    content: [
      {
        type: "intro",
        body: "Lunedì, ore 7. La squadra del subappaltatore non c'è. Il telefono squilla a vuoto, e il vostro accordo è una stretta di mano. Un contratto di subappalto edile completo — il fac simile che trovi qui clausola per clausola — contiene: oggetto e ambito dei lavori, corrispettivo e pagamenti, obblighi DURC e regolarità contributiva, sicurezza, ritenuta di garanzia, penali e risoluzione. Ogni clausola sono soldi che non perderai in contenzioso. Ogni clausola mancante, soldi che escono dalla tua tasca per errori di qualcun altro.",
      },
      {
        type: "section",
        heading: "Prima del Contratto: Cosa Dice la Legge",
        body: "Due binari, e conviene conoscerli entrambi. Nei lavori privati vale l'art. 1656 del Codice Civile: non subappalti senza autorizzazione del committente. Mettila per iscritto nel contratto principale, o fattela dare via PEC. Negli appalti pubblici comanda l'art. 119 del D.Lgs 36/2023: subappalto dichiarato in offerta e autorizzato dalla stazione appaltante. Il vecchio tetto generale del 30% non esiste più, ma il bando può fissare limiti sulle lavorazioni prevalenti: leggi sempre il disciplinare. Su tutto pesa l'art. 29 del D.Lgs 276/2003, la responsabilità solidale: per due anni rispondi di paghe e contributi non versati dal tuo subappaltatore. Il contratto serve prima di tutto a gestire questo rischio. Perché due anni sono lunghi. E le vertenze arrivano quando il cantiere è già chiuso e i margini già spesi.",
      },
      {
        type: "section",
        heading: "Clausola 1: Oggetto e Ambito dei Lavori",
        body: "Le liti sulle quantità nascono quasi tutte qui, nella prima clausola scritta male. Non scrivere opere di cartongesso. Scrivi: fornitura e posa di contropareti e controsoffitti in cartongesso come da elaborati allegati, piani 1 e 2, esclusa rasatura finale e tinteggiatura. Allega computo, disegni e capitolato, e richiamali come parte integrante del contratto. Qui dentro metti anche il divieto di ulteriore subappalto senza tuo consenso scritto. Nei cantieri pubblici il subappalto a cascata ha regole strette. In quelli privati, un terzo soggetto che non hai mai verificato è un rischio che non ti serve. Ogni parola generica in questa clausola è una discussione futura. E le discussioni a fine cantiere si misurano in migliaia di euro.",
      },
      {
        type: "section",
        heading: "Clausola 2: Corrispettivo e Pagamenti",
        body: "Il pagamento è la tua leva più forte. Usala per iscritto. Indica se il prezzo è a corpo o a misura, l'importo, il meccanismo: stati avanzamento mensili contabilizzati insieme, fattura a seguire, bonifico a 30 o 60 giorni. Tre protezioni da scrivere sempre. Primo: nessun pagamento senza DURC in corso di validità. Secondo: in caso di irregolarità contributiva sospendi i pagamenti e puoi pagare direttamente enti o lavoratori, con rivalsa sul dovuto. Terzo: il prezzo comprende ogni onere per mezzi, attrezzature e sfridi, salvo esclusioni scritte. Occhio all'IVA: nei subappalti edili tra imprese si applica in genere il reverse charge (art. 17, comma 6, DPR 633/72). La fattura arriva senza IVA e la integri tu. Sbagliare qui non è un dettaglio contabile: sono sanzioni.",
      },
      {
        type: "list",
        heading: "Clausola 3: Documenti e Regolarità — la Checklist",
        items: [
          "DURC in corso di validità alla firma e a ogni singolo pagamento (vale 120 giorni)",
          "Visura camerale con oggetto sociale coerente con le lavorazioni affidate",
          "Idoneità tecnico-professionale: documenti dell'allegato XVII del D.Lgs 81/2008",
          "POS consegnato prima dell'ingresso in cantiere, coordinato con il PSC se presente",
          "Elenco nominativo dei lavoratori, con ogni variazione comunicata prima dell'ingresso",
          "Patente a crediti, obbligatoria dal 1° ottobre 2024 per chi opera nei cantieri",
          "Nei lavori soggetti: verifica di congruità della manodopera prima del saldo finale",
        ],
      },
      {
        type: "section",
        heading: "Clausola 4: Sicurezza in Cantiere",
        body: "Un infortunio di un operaio del subappaltatore apre una sola domanda: chi ha verificato cosa, e quando. La clausola sicurezza deve prevedere: rispetto di PSC e POS, tesserino di riconoscimento per ogni lavoratore, uso dei DPI, partecipazione alle riunioni di coordinamento. E la tua facoltà di allontanare dal cantiere personale non in regola, senza che questo sia inadempimento tuo. Aggiungi che gli oneri della sicurezza sono quantificati a parte e non ribassabili. Non è burocrazia: gli ispettori partono dalla catena documentale. La gestione dei subappaltatori ordinata, con scadenze documenti tracciate, è la differenza tra una verifica chiusa in un'ora e un'indagine. E un'indagine ferma il cantiere: ogni giorno fermo è un giorno che paghi tu.",
      },
      {
        type: "section",
        heading: "Clausole 5-6: Ritenuta di Garanzia e Penali",
        body: "La squadra che sparisce a metà lavoro non è un'ipotesi da manuale. Succede. E va scritta prima. Ritenuta di garanzia: trattieni il 5-10% da ogni stato avanzamento, svincolo a collaudo o dopo 6-12 mesi dalla fine dei lavori. Scrivi percentuale, momento di svincolo e cosa succede se emergono difetti. Senza clausola scritta, trattenere soldi è inadempimento tuo. Penali: giornaliera per ritardo tra lo 0,3 e l'1 per mille dell'importo, tetto al 10%, oltre il quale puoi risolvere il contratto. Aggiungi il diritto di sostituire il subappaltatore in caso di abbandono del cantiere, addebitandogli il maggior costo. È la clausola che trasforma la squadra sparita da disastro a danno recuperabile. La differenza, su una commessa media, vale decine di migliaia di euro.",
      },
      {
        type: "section",
        heading: "Clausola 7: Risoluzione ed Elenco Finale",
        body: "La clausola risolutiva espressa (art. 1456 c.c.) elenca i casi in cui il contratto si scioglie con una semplice comunicazione: DURC irregolare non sanato entro 15 giorni, violazioni gravi in materia di sicurezza, abbandono del cantiere per più di 5 giorni senza giustificazione, superamento del tetto penali, subappalto non autorizzato a terzi. Chiudi con durata e cronoprogramma, assicurazione RCT del subappaltatore con massimale adeguato — per lavori medi almeno 1-2 milioni di euro — foro competente e firma di entrambe le parti su ogni pagina. Il modello lo prepari una volta, con il tuo legale. Poi adattarlo a ogni nuovo subappalto richiede 20 minuti. Non due ore di studio legale a cantiere: quelle, moltiplicate per un anno, sono una parcella che non serviva.",
      },
      {
        type: "section",
        heading: "I 3 Punti che Valgono Più Soldi di Tutti",
        body: "Primo: nessun pagamento senza DURC. Mai, nemmeno un acconto piccolo. La responsabilità solidale dura due anni e non guarda gli importi. Secondo: ciò che è promesso a voce non esiste. Varianti, extra e proroghe valgono solo per iscritto — basta anche una mail, se il contratto lo prevede. Terzo: le scadenze documenti vanno tracciate. Un DURC scade dopo 120 giorni. Un'idoneità sanitaria dopo un anno. Un documento scaduto in cantiere è una sanzione tua, non del subappaltatore. Un gestionale di cantiere con lo scadenzario documenti dei subappaltatori ti avvisa prima, non dopo. Per il quadro completo della normativa, leggi anche la guida al subappalto in edilizia sul blog. Ognuno di questi tre punti, ignorato, presenta un conto a quattro zeri.",
      },
      {
        type: "list",
        heading: "Gli Errori che si Pagano Cari",
        items: [
          "Contratto firmato dopo l'ingresso in cantiere: sei scoperto proprio nei giorni di rischio massimo",
          "Computo e disegni non allegati: ogni contestazione sulle quantità diventa parola contro parola",
          "DURC chiesto solo alla firma e mai più: vale 120 giorni, su un cantiere di 8 mesi servono 2-3 verifiche",
          "Ritenuta di garanzia applicata senza clausola scritta: il subappaltatore può pretendere il pagamento integrale",
          "Varianti concordate a voce al telefono: a fine cantiere valgono zero, da entrambe le parti",
          "Assicurazione RCT mai verificata: un danno a terzi senza copertura risale la filiera e arriva a te",
        ],
      },
      {
        type: "cta",
        heading: "Contratti, DURC e Scadenze dei Subappaltatori in un Posto Solo",
        body: "Con Edilizia in Cloud gestisci contratti, DURC, scadenze documenti e pagamenti dei subappaltatori in un unico posto, con avvisi automatici prima che un documento scada. Provalo gratis per 31 giorni: il prossimo contratto lo prepari in 20 minuti.",
      },
    ],
  },
  {
    id: "t3",
    slug: "software-gestione-cantieri-gratis",
    title: "Software Gestione Cantieri Gratis: Dove Regge, Dove Cede",
    excerpt:
      "Il gratis va benissimo, finché regge. Cosa fai davvero con Excel, Trello e chat, dove si rompe con più cantieri e quanto ti costa in ore ogni settimana.",
    category: "Digitalizzazione",
    tags: ["software gestione cantieri gratis", "gestionale edilizia gratuito", "excel cantieri", "strumenti gratuiti edilizia"],
    publishedAt: "2026-07-25",
    readTime: 7,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/software-gestione-cantieri-gratis.jpg",
    faqs: [
      { q: "Esiste un software di gestione cantieri completamente gratis?", a: "No: un gestionale completo per l'edilizia, gratis per sempre, non esiste. Esistono strumenti generici gratuiti — Excel, Google Sheets, Trello, Drive — adattabili al cantiere, e versioni di prova dei gestionali verticali. I generici coprono pezzi singoli: un elenco, una tabella, un archivio. Non collegano ore, costi, preventivi e fatture tra loro." },
      { q: "Fino a che punto posso gestire i cantieri con Excel?", a: "Con 1-2 cantieri e una squadra piccola, Excel regge: un foglio per il preventivo, uno per le ore, uno per i costi. I problemi iniziano con più cantieri in parallelo: file duplicati, versioni diverse tra ufficio e cantiere, formule rotte, nessun dato in tempo reale. Il limite non è il numero di righe. È quante persone devono aggiornare gli stessi dati." },
      { q: "Quanto mi costa davvero gestire tutto gratis?", a: "Il costo è in ore. Raccogliere le ore per telefono, ricopiare dati tra fogli, cercare documenti nelle chat: per un'impresa da 5-10 persone sono tipicamente 4-6 ore a settimana. A 25 euro l'ora fanno 5.000-7.800 euro l'anno. Più gli errori che non vedi: ore non fatturate, materiali non addebitati." },
      { q: "Le versioni free dei software di project management vanno bene per l'edilizia?", a: "Organizzano liste, non cantieri. Trello, Asana o Notion in versione gratuita non sanno nulla di edilizia: niente ore per commessa, niente stato avanzamento lavori, niente DDT, niente margine per cantiere. Funzionano come lavagna attività per una squadra piccola. Non come controllo dei costi di commessa." },
      { q: "Quando ha senso passare da gratis a un gestionale a pagamento?", a: "A tre segnali: più di 2-3 cantieri in parallelo, un errore amministrativo che ti è già costato soldi (ore non fatturate, variante non addebitata, documento scaduto), o più di mezza giornata a settimana persa a rincorrere dati. Da lì, un abbonamento da 50-150 euro al mese costa meno del tempo che stai bruciando." },
    ],
    content: [
      {
        type: "intro",
        body: "Sabato mattina, di nuovo in ufficio. Sul desktop tre versioni dello stesso Excel, e non sai qual è quella buona. Il cliente intanto ha chiesto la variante. Un software di gestione cantieri gratis, completo e per sempre, non esiste: esistono strumenti generici gratuiti — Excel, Google Sheets, Trello, WhatsApp, Drive — che coprono pezzi del lavoro, e prove gratuite dei gestionali verticali. Qui trovi cosa ottieni gratis davvero, la scena esatta in cui il gratis si rompe, e il conto — in ore e in euro — di quanto ti sta già costando.",
      },
      {
        type: "section",
        heading: "Cosa Hai Gratis Oggi: la Mappa Onesta",
        body: "Diciamolo subito: il gratis va benissimo, finché va bene. Gratis oggi hai: fogli di calcolo — Excel con la licenza Office che probabilmente già paghi, o Google Sheets davvero gratuito — per preventivi, ore e costi. Trello o Asana in versione free per le liste attività. WhatsApp per le comunicazioni con le squadre. Google Drive o Dropbox base per i documenti. Google Calendar per la pianificazione. Messi insieme coprono le funzioni di base di un ufficio tecnico. E per chi parte — un artigiano solo, 2-3 persone, un cantiere alla volta — questa combinazione basta davvero. Nessuno deve venderti niente. Il problema non è partire. È il giorno in cui i cantieri diventano tre e le persone otto: da lì il gratis inizia a presentarti il conto.",
      },
      {
        type: "section",
        heading: "La Scena Esatta in Cui si Rompe",
        body: "Il cliente chiede la variante. Tu apri il preventivo: tre versioni, in tre cartelle diverse. Quale gli avevi mandato? Il limite del gratis non è la qualità dei singoli strumenti: è che non si parlano. Le ore segnate su WhatsApp non finiscono nel costo della commessa. Il preventivo in Excel non si confronta da solo con i costi reali. Il DDT fotografato in chat non aggiorna nessun magazzino. Ogni passaggio lo fai tu, a mano, la sera o il sabato. E con più cantieri arrivano i classici: la formula rotta che nessuno nota per un mese, il documento del subappaltatore scaduto che salta fuori durante l'ispezione. Soprattutto: nessun foglio ti dice la sola cosa che conta. Su questo cantiere sto guadagnando o perdendo?",
      },
      {
        type: "list",
        heading: "Facciamo il Conto Insieme: Ore per Euro",
        items: [
          "Raccolta ore a voce o su carta: 2-3 ore a settimana di telefonate e trascrizioni per una squadra di 8-10 persone",
          "Ricopiatura dati tra fogli: 1-2 ore a settimana, con gli errori di battitura che finiscono nei conti",
          "Totale: 4-6 ore a settimana. Prendi la cifra bassa: 4 ore x 25 euro l'ora = 100 euro. A settimana",
          "100 euro x 52 settimane = 5.200 euro l'anno. Solo di tempo. Con 6 ore arrivi a 7.800",
          "Aggiungi le ore dimenticate: anche solo 2 ore a settimana non fatturate = oltre 3.000 euro l'anno a prezzi medi",
          "E le varianti fatte e mai addebitate perché non tracciate: da 500 a 5.000 euro a cantiere",
          "Totale tipico per un'impresa da 5-10 persone: 5.000-10.000 euro l'anno. Il gratis più caro che ci sia",
        ],
      },
      {
        type: "section",
        heading: "La Domanda Giusta: Non Quanto Costa, ma Quanto Ti Mangia",
        body: "Il confronto vero non è gratis contro abbonamento. È ore contro euro. Cinque ore a settimana su fogli e chat, al tuo costo orario reale, valgono più di qualsiasi canone. E sono ore tolte a preventivi, sopralluoghi e clienti: le uniche attività che portano fatturato. Poi c'è il costo che non vedi. Senza dati collegati, il margine reale di un cantiere lo scopri a lavori finiti. Quando è troppo tardi per correggere. Chi monitora i costi in tempo reale interviene sulle commesse in perdita prima della fine. È lì che un gestionale ripaga l'abbonamento: non nella grafica dei report, ma nel cantiere in perdita fermato in tempo.",
      },
      {
        type: "section",
        heading: "La Via di Mezzo: il Test con i Tuoi Numeri",
        body: "Tra il gratis per sempre con i suoi costi nascosti e l'acquisto al buio c'è una terza via: la prova gratuita di un gestionale verticale per l'edilizia. Con 31 giorni di prova completa fai un test vero. Carichi un cantiere reale. Fai timbrare le ore alla squadra per due settimane. Emetti un paio di preventivi edili dal listino. A fine mese confronti i numeri con il tuo metodo attuale. Se il tempo risparmiato e gli errori evitati non valgono l'abbonamento, torni ai fogli senza aver speso un euro. Se invece trovi ore mai fatturate e margini diversi da come li immaginavi — capita a molti — hai la risposta. Per capire le cifre in gioco, sul blog trovi la guida su quanto costa un gestionale per un'impresa edile.",
      },
      {
        type: "section",
        heading: "Verdetto da Imprenditore a Imprenditore",
        body: "Da solo o in due, con un cantiere alla volta? Resta sul gratis: un foglio ore fatto bene e un modello di preventivo curato bastano, davvero. Con una squadra e più cantieri? Il gratis ti sta già costando più di un abbonamento. Solo che il costo è spalmato in ore serali e ricavi mancati, quindi in fattura non lo vedi. In quel caso l'unica scelta razionale è misurare: un mese di prova gratuita con dati veri, e decidi sui numeri tuoi. Non sulle promesse di un venditore — nemmeno sulle mie. I sabati in ufficio, intanto, hanno un prezzo. E lo conosci già.",
      },
      {
        type: "cta",
        heading: "Riprenditi il Sabato: Fai il Test con un Cantiere Vero",
        body: "Prova Edilizia in Cloud gratis per 31 giorni: cantieri, ore, preventivi e costi collegati tra loro. Nessuna carta di credito. Se non fa per te, torni ai fogli senza aver perso nulla — ma almeno l'avrai misurato.",
      },
    ],
  },
  {
    id: "t4",
    slug: "app-gestione-cantieri-gratis",
    title: "App Gestione Cantieri Gratis: Dove Arrivano Davvero",
    excerpt:
      "Le app gratuite registrano tutto e non collegano niente: ore, SAL e DDT restano in chat. Il confronto onesto con un'app di cantiere vera, numeri alla mano.",
    category: "Digitalizzazione",
    tags: ["app gestione cantieri gratis", "app cantiere", "app edilizia gratuita", "gestione cantiere da smartphone"],
    publishedAt: "2026-07-25",
    readTime: 6,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/app-gestione-cantieri-gratis.jpg",
    faqs: [
      { q: "Quali app gratuite si usano di più in cantiere?", a: "WhatsApp per comunicazioni e foto, Google Foto o Drive per l'archivio immagini, Google Keep o Notes per gli appunti, Trello per le liste attività, Google Calendar per la pianificazione e fogli Google per le ore. Coprono comunicazione e memoria. Nessuna collega quello che registri ai costi o alla fatturazione della commessa." },
      { q: "Posso rilevare le presenze della squadra con un'app gratuita?", a: "Puoi farti mandare un messaggio a inizio e fine turno, o usare un foglio condiviso. Con 2-3 persone funziona. Con squadre più grandi diventa trascrizione: qualcuno trasforma i messaggi in ore per cantiere, ogni settimana. Le app di timbratura vere, con GPS e ore già assegnate alla commessa, sono quasi sempre a pagamento: pochi euro a dipendente al mese." },
      { q: "Cosa significa che le app gratuite non collegano i dati?", a: "Significa che il lavoro lo finisci tu, in ufficio. La foto del DDT resta in chat: nessuno scarica la merce dal magazzino né la addebita al cantiere. Le ore scritte su Keep non diventano costo manodopera. Le foto di avanzamento non generano lo stato avanzamento lavori da fatturare. Ogni informazione va ricopiata a mano: è lì che si perdono ore e si infilano gli errori." },
      { q: "Un'app verticale per l'edilizia quanto costa rispetto al gratis?", a: "Per una piccola impresa, in genere 50-150 euro al mese tutto compreso, spesso con utenti operai illimitati o a costo ridotto. Il confronto va fatto con le 4-6 ore a settimana di trascrizioni e telefonate che il gratis richiede: a costi orari reali, se ti fa risparmiare anche solo un'ora a settimana, si ripaga." },
      { q: "La mia squadra non è pratica di tecnologia: ce la fa con un'app di cantiere?", a: "Se usa WhatsApp, ce la fa. Un'app pensata per il cantiere chiede un tocco per timbrare e una foto più due righe per il rapportino: meno passaggi di una telefonata più un foglio. Parti dai capisquadra per le prime due settimane, poi estendi al resto della squadra." },
      { q: "Come faccio una prova seria di un'app di cantiere?", a: "Un cantiere attivo, un mese di prova gratuita, dati veri. Timbrature al posto dei messaggi, rapportini con foto a fine giornata, DDT fotografati nell'app. A fine mese confronti: ore di trascrizione risparmiate, errori trovati, e se il costo manodopera per commessa corrisponde a quello che credevi. Decidi sui tuoi numeri." },
    ],
    content: [
      {
        type: "intro",
        body: "Ore 19:40. Il gruppo WhatsApp del cantiere segna 118 messaggi. Da qualche parte, lì in mezzo, c'è il DDT di stamattina. Le app di gestione cantieri gratis sono quasi sempre app generiche adattate: WhatsApp per foto e comunicazioni, Google Keep per le note, Trello per le attività, fogli condivisi per le ore. Registrano tutto, e in cantiere funzionano. Ma niente di ciò che registri si collega a ore, SAL, DDT e costi della commessa. Il collegamento sei tu. A mano, fuori orario.",
      },
      {
        type: "section",
        heading: "Cosa Fanno Bene le App Gratuite (Sul Serio)",
        body: "Diamo al gratis quello che merita. WhatsApp ha risolto la comunicazione di cantiere: foto in tempo reale, gruppi per squadra, note vocali. Google Foto archivia migliaia di immagini georeferenziate senza costi. Keep e le note del telefono battono il taccuino di carta. Trello in versione free tiene una lavagna attività decorosa per una squadra piccola. Un foglio Google condiviso raccoglie le ore, se la squadra è disciplinata. Per un artigiano con 1-2 collaboratori e un cantiere alla volta, questo pacchetto copre la giornata operativa. È quello che usa la maggioranza delle micro imprese italiane, e fin qui fa bene così. Nessun motivo di spendere un euro.",
      },
      {
        type: "section",
        heading: "Il Punto Cieco: i Soldi",
        body: "Il gratis registra. Non collega. E i soldi, in un'impresa edile, stanno tutti nel collegamento: tra quello che succede in cantiere e quello che finisce in fattura. Le ore in chat non diventano costo manodopera della commessa: le ricopia qualcuno, tipicamente tu, la sera. La foto del DDT non scarica il magazzino né addebita il materiale al cantiere giusto. Le foto di avanzamento non producono lo stato avanzamento lavori da mandare in fattura: il SAL lo ricostruisci a memoria, a fine mese. E nessuna app generica sa dirti quante ore sono andate su ogni cantiere questa settimana. Che è il numero da cui dipende il tuo margine. Prova a chiedertelo adesso: quante ore ha preso il cantiere di via Verdi, questa settimana? Se la risposta è un giro di telefonate, il punto cieco è lì. Tutto il resto è contorno. Questo numero, quando manca, costa caro.",
      },
      {
        type: "list",
        heading: "Confronto Onesto: App Gratuite vs App Verticale",
        items: [
          "Presenze — Gratis: messaggio in chat, poi trascrizione a mano. Verticale: timbratura digitale con GPS, ore già sulla commessa giusta",
          "Rapportino — Gratis: foto sparse in chat, ricostruzione a memoria. Verticale: foto, note e fasi archiviate per cantiere",
          "DDT e materiali — Gratis: foto in galleria, nessun addebito. Verticale: DDT registrato, collegato a magazzino e commessa",
          "SAL — Gratis: ricostruito a fine mese da foto e memoria. Verticale: avanzamento registrato in cantiere, SAL pronto da fatturare",
          "Costo commessa — Gratis: lo scopri a lavori finiti, se lo calcoli. Verticale: ore e materiali sommati in tempo reale",
          "Prezzo — Gratis: 0 euro al mese, più 4-6 ore a settimana di ufficio. Verticale: 50-150 euro al mese, trascrizioni azzerate",
        ],
      },
      {
        type: "section",
        heading: "Il Punto di Rottura: Quando le Chat Non Bastano Più",
        body: "Arriva quasi sempre allo stesso modo. Terzo cantiere in parallelo. Squadra sopra le 5-6 persone. E il sabato mattina passato a ricostruire la settimana da tre gruppi WhatsApp. I segnali classici: ore che non tornano tra quanto dicono gli operai e quanto ricordi tu. Materiali comprati due volte, perché la foto del DDT era sepolta in chat. Un SAL fatturato con tre settimane di ritardo, perché andava ricostruito. E tre settimane di ritardo sulla fattura sono tre settimane senza cassa: i fornitori, intanto, non aspettano. Ogni episodio vale da decine a centinaia di euro. Sommali su un anno: superano ampiamente il costo di qualsiasi app verticale. A quel punto il gratis non è più gratis. È solo non fatturato.",
      },
      {
        type: "section",
        heading: "Come Decidere Senza Farti Vendere Niente",
        body: "Regola semplice. Se le chat e le note ti bastano e la sera non ricopi dati: resta sul gratis, davvero. Nessuna app ti serve solo perché ce l'hanno gli altri. Se invece riconosci i segnali del punto di rottura, fai un test misurabile. Non una demo guardata di fretta: un test, con la tua squadra e i tuoi numeri. Prendi un'app pensata per il cantiere — timbrature, rapportini, DDT e avanzamento collegati alla commessa — e usala su un cantiere vero, per un mese di prova gratuita. Il gestionale di cantiere giusto per te è quello che la squadra usa senza che tu debba rincorrerla. Se dopo due settimane i capisquadra timbrano e mandano rapportini da soli, il test è riuscito. Per il metodo completo di passaggio dalla carta al digitale, leggi la guida alla gestione digitale del cantiere sul blog. Un mese di test: o ti libera il sabato, o ti conferma che il gratis ti basta ancora.",
      },
      {
        type: "cta",
        heading: "Svuota la Chat: un'App di Cantiere Vera, 31 Giorni Gratis",
        body: "Prova l'app mobile di Edilizia in Cloud: timbrature GPS, rapportini con foto, DDT e avanzamento lavori collegati alla commessa. 31 giorni gratis, senza carta di credito. La squadra la impara in un giorno — e il DDT non lo cerchi più tra 118 messaggi.",
      },
    ],
  },
  {
    id: "t5",
    slug: "computo-metrico-gratis",
    title: "Computo Metrico Gratis: Strumenti Veri e Punti di Rottura",
    excerpt:
      "Computo metrico gratis con foglio di calcolo e prezzario regionale: come impostarlo bene e i tre punti esatti dove il gratis si rompe e ti costa margine.",
    category: "Digitalizzazione",
    tags: ["computo metrico gratis", "prezzari regionali", "template computo metrico", "computo metrico excel"],
    publishedAt: "2026-07-25",
    readTime: 7,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/computo-metrico-gratis.jpg",
    faqs: [
      { q: "Posso fare un computo metrico serio con Excel o Google Sheets?", a: "Sì, per lavori semplici. Imposti colonne per codice voce, descrizione, unità di misura, parti uguali, dimensioni, quantità, prezzo unitario e totale, con le somme per categoria. Per una ristrutturazione da 50-100 voci funziona. I guai iniziano con le revisioni: ogni modifica va propagata a mano, e una formula rotta falsa il totale senza avvisarti." },
      { q: "Dove trovo prezzari gratuiti per il computo metrico?", a: "Sul sito della tua Regione. Quasi tutte pubblicano gratuitamente il prezzario delle opere pubbliche, aggiornato di norma ogni anno, scaricabile in PDF o Excel. È la base di prezzo più difendibile davanti a committente e direttore lavori. Ma sono prezzi medi: vanno confrontati con i tuoi costi reali di manodopera e fornitura." },
      { q: "Che differenza c'è tra computo metrico e computo metrico estimativo?", a: "Il computo metrico elenca le lavorazioni con le sole quantità: mq, mc, ml, cadauno. L'estimativo aggiunge i prezzi unitari e i totali — quantità per prezzo, voce per voce — fino all'importo complessivo dei lavori. Nella pratica di impresa si usa quasi sempre l'estimativo: è la base del preventivo e del contratto." },
      { q: "I prezzi del prezzario regionale sono quelli a cui devo vendere?", a: "No: sono prezzi di riferimento, costruiti su medie regionali. Includono già spese generali e utile d'impresa in percentuali standard — tipicamente 15% e 10% — calcolati su un'impresa tipo che non è la tua. I tuoi costi veri di squadra, mezzi e fornitori possono scostarsi del 10-20%. Usa il prezzario come base e correggi con i tuoi numeri: vendere a listino senza verifica è il modo classico di lavorare in pari." },
      { q: "Quando gli strumenti gratuiti non bastano più per il computo?", a: "In tre situazioni: quando le revisioni diventano frequenti (ogni variante rifà somme e controlli a mano), quando dal computo devi generare il preventivo e poi confrontarlo con i costi reali a consuntivo, e quando i computi sono decine l'anno e ogni volta riparti da zero invece di riusare voci e prezzi già lavorati." },
    ],
    content: [
      {
        type: "intro",
        body: "Il progettista cambia i disegni. Il cliente cambia i sanitari. Tu riapri il foglio: terza revisione, e il totale in fondo è rimasto alla prima. Fare un computo metrico gratis si può: bastano un foglio di calcolo impostato bene, il prezzario regionale scaricabile senza costi e un metodo di misurazione ordinato. Qui trovi come strutturare il computo, dove scaricare i prezzi ufficiali e i tre punti esatti in cui gli strumenti gratuiti si rompono. Perché è in quei tre punti che il margine se ne va.",
      },
      {
        type: "section",
        heading: "I Tre Strumenti Gratuiti che Funzionano Davvero",
        body: "Tre pezzi, tutti a costo zero. Primo: un foglio di calcolo — Google Sheets è gratuito, Excel probabilmente lo hai già. Secondo: il prezzario della tua Regione, scaricabile gratis dal sito istituzionale in PDF o Excel, aggiornato di norma ogni anno. È la fonte di prezzo più difendibile che esista davanti a committenti e direttori lavori. Terzo: un template impostato bene, che costruisci una volta e riusi per sempre. Con questi tre strumenti fai computi corretti per ristrutturazioni e lavori medi senza spendere un euro. Il punto non è lo strumento: è il metodo. Ed è il metodo che separa un computo da una lista della spesa. E un lavoro in utile da uno in pari.",
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
        heading: "Le Quattro Regole del Computo Corretto",
        body: "Prima regola: misura dal disegno o dal rilievo, mai a occhio. E scrivi le misure parziali: chiunque — incluso te fra sei mesi — deve poter ricostruire come è nata la quantità. Seconda: segui l'ordine cronologico del cantiere, dalle demolizioni alle finiture. Un computo in ordine di lavorazione si controlla in metà tempo. Terza: aggiungi sempre gli sfridi secondo la lavorazione — tipicamente 5-10% su pavimenti e rivestimenti, 10-15% su alcune lavorazioni di taglio — e le voci che tutti dimenticano: ponteggi, smaltimenti, pulizie finali, oneri della sicurezza. Quarta: chiudi con il riepilogo per categorie e guarda le incidenze. Se gli impianti pesano il 60% su una ristrutturazione ordinaria, c'è un errore. Meglio accorgertene tu adesso che il cliente dopo. A preventivo firmato, quell'errore ha il tuo nome sopra.",
      },
      {
        type: "section",
        heading: "Prezzario Gratuito Sì, ma con la Testa",
        body: "Il prezzario regionale è gratis e autorevole. Ma è una media, non la tua impresa. Dentro ogni prezzo ci sono già spese generali e utile in percentuali standard — di norma 15% e 10% — calcolati su un'impresa tipo. La tua paga oraria effettiva, i prezzi dei tuoi fornitori, la distanza del cantiere possono scostarsi del 10-20%, in entrambe le direzioni. Il metodo giusto: usa il prezzario come scheletro e verifica con i tuoi numeri veri le 10-15 voci che pesano di più sul totale. L'80% dell'importo di un computo sta tipicamente nel 20% delle voci. È lì che si decide se il lavoro rende, non sulle minuterie. Copiare il listino senza verificarlo è firmare margini che non conosci.",
      },
      {
        type: "section",
        heading: "I Tre Punti Esatti Dove il Gratis si Rompe",
        body: "Il foglio di calcolo regge finché il computo sta fermo. Poi si rompe, sempre negli stessi tre punti. Le revisioni: il cliente cambia idea, il progettista aggiorna i disegni, e ogni giro va propagato a mano su quantità, totali e riepiloghi. Alla terza revisione gli errori sono statisticamente certi. Le varianti in corso d'opera: andrebbero computate come voci nuove e trasformate in preventivo integrativo. Nel foglio finiscono come righe aggiunte in fondo, e a fine cantiere non distingui più cosa era contratto e cosa variante. Cioè non sai cosa farti pagare. Il consuntivo: il computo dice cosa dovevi fare, ma non si confronta da solo con ore e materiali reali. Il margine vero lo scopri, se va bene, mesi dopo la chiusura. Tre punti diversi, stesso prezzo: margine che se ne va senza che tu lo veda passare.",
      },
      {
        type: "section",
        heading: "Il Percorso Sensato",
        body: "Pochi computi l'anno, su lavori lineari? Foglio più prezzario regionale, fatti bene, bastano: questa guida e il template a colonne ti mettono in condizione di partire oggi. Computi a decine, con revisioni e varianti frequenti? Fatti la domanda giusta: quante ore passi a rifare somme e a ricostruire varianti, e quante voci riscrivi da zero ogni volta? Sopra le 3-4 ore a settimana, uno strumento con listino personale, voci riusabili e collegamento tra computo, preventivo e consuntivo costa meno del tempo che il foglio ti mangia. Per la parte di metodo, leggi anche la guida completa al computo metrico estimativo sul blog. Computo e preventivo edile sono due facce dello stesso documento: chi li tratta insieme lavora una volta sola. Chi li tratta separati paga il lavoro due volte.",
      },
      {
        type: "cta",
        heading: "Dal Computo al Preventivo in un Passaggio, Varianti Comprese",
        body: "Con Edilizia in Cloud il computo diventa preventivo con un clic: listino tuo, voci riusabili, varianti tracciate e confronto con i costi reali a consuntivo. Provalo gratis per 31 giorni, senza carta di credito: la prossima revisione non la rifai a mano.",
      },
    ],
  },
  {
    id: "t6",
    slug: "gestionale-edilizia-opinioni",
    title: "Gestionale Edilizia Opinioni: Cosa Raccontano i Titolari",
    excerpt:
      "Chi lo usa non fa più la bolletta di ore il venerdì. Chi lo molla cita avviamento e assistenza. Le opinioni vere delle imprese sui gestionali edilizia.",
    category: "Digitalizzazione",
    tags: ["gestionale edilizia opinioni", "recensioni gestionale edile", "scegliere gestionale edilizia", "software edilizia recensioni"],
    publishedAt: "2026-07-25",
    readTime: 8,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/gestionale-edilizia-opinioni.jpg",
    faqs: [
      { q: "Cosa apprezzano di più le imprese edili nei gestionali?", a: "Tre cose tornano in quasi tutte le opinioni positive: il tempo amministrativo recuperato (tipicamente 4-8 ore a settimana tra ore, documenti e fatturazione), i margini di commessa visibili mentre il cantiere è aperto e non a lavori finiti, e la fine dei dati sparsi tra chat, fogli e carta. Un titolare contento cita quasi sempre almeno una di queste tre." },
      { q: "Qual è la lamentela più frequente sui gestionali edilizia?", a: "La curva di apprendimento: le prime 2-4 settimane richiedono disciplina, la squadra cambia abitudini, i dati vanno caricati. La seconda è l'assistenza lenta o solo via ticket. La terza riguarda i gestionali generici adattati all'edilizia: mancano SAL, subappalti, Cassa Edile, e l'impresa paga per qualcosa che copre metà del lavoro." },
      { q: "Le recensioni online dei gestionali sono affidabili?", a: "In parte. Guarda tre cose: la data (una recensione di 3-4 anni fa descrive un software che non esiste più), chi scrive (l'opinione di uno studio di progettazione vale poco per un'impresa da 10 operai) e la specificità (una recensione utile cita funzioni e numeri, non giudizi a 5 o 1 stelle). Dieci recensioni recenti e specifiche valgono più di cento generiche." },
      { q: "Meglio un gestionale verticale per l'edilizia o uno generico più economico?", a: "Le opinioni delle imprese su questo sono nette: il generico costa meno all'inizio e delude dopo. Non parla la lingua del cantiere: niente SAL, commesse, subappalti, DURC. Il verticale costa qualcosa in più e copre il flusso vero: preventivo, cantiere, ore, costi, fattura. Il risparmio del generico si consuma in adattamenti e doppi inserimenti nel giro di pochi mesi." },
      { q: "Quanto dura davvero l'avviamento di un gestionale in un'impresa edile?", a: "Dalle esperienze ricorrenti: 1-2 settimane per configurare azienda, listini e cantieri attivi; 2-4 settimane perché la squadra prenda il ritmo su timbrature e rapportini; 2-3 mesi per avere dati storici sufficienti a leggere i margini con fiducia. Chi parte con un solo cantiere pilota e poi estende arriva a regime prima di chi migra tutto insieme." },
      { q: "Che domande devo fare in demo per non farmi incantare?", a: "Cinque: posso vedere il flusso completo preventivo-cantiere-SAL-fattura con dati miei? Quanto costa davvero a regime, utenti operai inclusi? L'assistenza risponde al telefono in italiano, e in quanto tempo? Se me ne vado, come riporto fuori i miei dati? Posso parlare con un cliente simile a me per dimensione e mestiere? Le risposte vaghe a queste cinque valgono più di qualsiasi recensione." },
    ],
    content: [
      {
        type: "intro",
        body: "Il venerdì sera facevi la bolletta delle ore: telefonate ai capisquadra, foglietti, memoria. Chi usa un gestionale racconta che il venerdì, adesso, torna a casa. Le opinioni delle imprese edili sui gestionali si somigliano tutte: chi li usa bene cita tempo amministrativo dimezzato e margini finalmente visibili; chi li abbandona cita avviamento faticoso, assistenza lenta o software generici travestiti da edilizia. Qui trovi i pro e i contro ricorrenti raccontati per situazioni, come leggere le recensioni e le domande da fare in demo.",
      },
      {
        type: "section",
        heading: "I Pro: le Scene che Raccontano i Titolari",
        body: "Mettendo in fila le esperienze di titolari di imprese da 3 a 50 persone, tornano sempre le stesse scene. Il venerdì senza bolletta di ore: 4-8 ore a settimana recuperate su raccolta ore, ricerca documenti e preparazione fatture. Quasi sempre ore serali o del sabato, cioè le più odiate. Poi il cantiere che si scopre in perdita mentre è ancora aperto: più di un titolare racconta di commesse che credeva in utile e non lo erano — e viceversa. Scoprirlo a cantiere aperto significa poter correggere. Scoprirlo dopo significa solo pagare. Terza scena: la fine della caccia al documento. Ore, DDT, foto, contratti e scadenze in un posto solo, invece di tre chat e due archivi. Chi vive queste tre scene, in genere, non torna indietro.",
      },
      {
        type: "section",
        heading: "I Contro: Quello che il Venditore Non Ti Dice",
        body: "Le opinioni negative sono altrettanto istruttive, e girano su tre temi. La salita iniziale: le prime 2-4 settimane chiedono disciplina — la squadra cambia abitudini, i listini vanno caricati. Se il titolare non ci crede per primo, il progetto muore lì: è la causa numero uno degli abbandoni. I costi che crescono: moduli extra, utenti aggiuntivi, formazione a pagamento. Il prezzo di partenza e il prezzo a regime possono essere molto diversi, e scoprirlo dopo la firma brucia. L'assistenza: quando il cantiere è fermo e il programma non risponde, un ticket evaso in 48 ore non è un disservizio. È un danno economico. Nessuno di questi tre contro riguarda il concetto di gestionale: riguardano quale scegli e come lo avvii. E si evitano prima della firma. Non dopo.",
      },
      {
        type: "list",
        heading: "Come Leggere le Recensioni Senza Farti Ingannare",
        items: [
          "Guarda la data: una recensione di oltre 2 anni descrive un prodotto che nel software cloud non esiste più, nel bene e nel male",
          "Guarda chi scrive: l'opinione di un geometra libero professionista non vale per un'impresa con 15 operai, e viceversa",
          "Cerca i numeri: quanto tempo risparmiato, quanti utenti, quanti cantieri — le recensioni specifiche sono le uniche utili",
          "Diffida degli estremi: i 5 stelle entusiasti senza dettagli e gli 1 stella furiosi per un episodio dicono poco; il succo sta nelle 3-4 stelle argomentate",
          "Pesa i contro ricorrenti: un difetto citato una volta è un episodio, citato da 10 recensioni è una caratteristica del prodotto",
        ],
      },
      {
        type: "section",
        heading: "Verticale o Generico: Dove le Opinioni Convergono",
        body: "Se c'è un punto su cui le esperienze delle imprese edili convergono, è questo: i gestionali generici adattati all'edilizia deludono. Un CRM nato per i servizi non sa cosa sia un SAL. Non conosce commesse, subappalti, ritenute, Cassa Edile. Risultato: pieghi il tuo lavoro allo strumento, con campi riadattati e fogli Excel di contorno che dovevano sparire. Il gestionale edile verticale costa in genere qualcosa in più, ma il flusso — preventivo, cantiere, ore, SAL e fatturazione elettronica — è quello vero del mestiere. La domanda da farsi non è quanto costa al mese. È quanto del mio flusso copre davvero. Un software che ne copre metà lo paghi due volte: in abbonamento e in lavoro manuale residuo.",
      },
      {
        type: "quote",
        quote:
          "Ho provato due gestionali generici prima di arrivare a uno fatto per l'edilizia. La differenza l'ho capita alla prima commessa: non ho dovuto spiegare io al software cosa è un SAL.",
        author: "Titolare di impresa edile, 12 dipendenti, provincia di Brescia",
      },
      {
        type: "section",
        heading: "Le Domande da Fare in Demo (e le Risposte da Pretendere)",
        body: "La demo è il momento in cui le opinioni degli altri lasciano il posto ai fatti tuoi. Cinque domande. Uno: fammi vedere il flusso completo — dal preventivo alla fattura, passando per ore e SAL — con un caso simile ai miei cantieri, non con la demo preconfezionata. Due: il prezzo a regime, tutto incluso — utenti, operai, moduli, assistenza, formazione — per iscritto. Tre: assistenza in italiano, al telefono, con che tempi di risposta. Quattro: se tra due anni me ne vado, come esporto i miei dati? Cinque: fammi parlare con un cliente come me per dimensione e mestiere. Un fornitore serio risponde a tutte e cinque senza girarci intorno. Le risposte evasive in demo diventano problemi tuoi dopo la firma. E prima di firmare, pretendi una prova gratuita con i tuoi dati veri: è l'unica recensione di cui puoi fidarti al 100%. Per il metodo completo di valutazione, leggi anche la guida alla scelta del gestionale per l'edilizia.",
      },
      {
        type: "cta",
        heading: "La Recensione che Conta È la Tua: 31 Giorni Gratis",
        body: "Le opinioni degli altri ti portano fino alla porta. Il giudizio vero lo dai tu, con i tuoi cantieri. Prova Edilizia in Cloud gratis per 31 giorni, con assistenza in italiano inclusa e senza carta di credito.",
      },
    ],
  },
  {
    id: "t7",
    slug: "incentivi-digitalizzazione-edilizia-2026",
    title: "Incentivi Digitalizzazione Edilizia 2026: Cosa C'è Davvero",
    excerpt:
      "Il tuo concorrente si digitalizza col credito d'imposta, tu paghi tutto di tasca. La mappa degli incentivi 2026: voucher, bandi, Sabatini, formazione.",
    category: "Normativa",
    tags: ["incentivi digitalizzazione edilizia", "transizione 5.0 edilizia", "voucher digitalizzazione", "bandi imprese edili 2026"],
    publishedAt: "2026-07-25",
    readTime: 8,
    author: { name: "Florin Andriciuc", role: "Founder", avatar: FLO_AVATAR },
    coverImage:
      "/blog/covers/incentivi-digitalizzazione-edilizia-2026.jpg",
    faqs: [
      { q: "Quali incentivi può usare un'impresa edile per digitalizzarsi nel 2026?", a: "Cinque famiglie: i crediti d'imposta nazionali per beni strumentali e digitali (Transizione 5.0 e le misure che la Legge di Bilancio conferma anno per anno), la Nuova Sabatini per l'acquisto di beni anche digitali, i voucher digitali delle Camere di Commercio, i bandi regionali per la digitalizzazione delle PMI e i fondi per la formazione del personale. Percentuali e scadenze cambiano: si verificano sul bando specifico, sempre." },
      { q: "Il software gestionale rientra negli incentivi per la digitalizzazione?", a: "In molti casi sì. I voucher camerali e diversi bandi regionali includono espressamente software gestionali cloud, consulenza e formazione collegata tra le spese ammissibili. Nelle misure nazionali sui beni immateriali l'ammissibilità dipende dai requisiti tecnici della singola misura. Prima di acquistare, verifica sul testo del bando che la voce di spesa sia inclusa — e che l'acquisto sia successivo alla domanda, se richiesto." },
      { q: "Cosa sono i voucher digitali delle Camere di Commercio?", a: "Contributi a fondo perduto che molte Camere di Commercio pubblicano periodicamente attraverso i PID (Punti Impresa Digitale) per le spese di digitalizzazione di micro e piccole imprese: tecnologie, software, consulenza e formazione. Importi, percentuali di copertura e finestre di domanda variano da camera a camera e da anno a anno: il riferimento è il sito della tua Camera di Commercio, sezione bandi." },
      { q: "Come funziona Transizione 5.0 per un'impresa edile?", a: "È un credito d'imposta legato a investimenti in beni strumentali e digitali che producono una riduzione certificata dei consumi energetici dell'impresa. La logica: investimento più efficienza energetica uguale credito. Aliquote, scaglioni e finestre temporali sono stati modificati più volte: prima di contare su questa misura, verifica lo stato 2026 sul sito del GSE e del MIMIT e fatti seguire da chi certifica i requisiti energetici." },
      { q: "Gli incentivi coprono anche la formazione della squadra sull'uso del software?", a: "Spesso sì, ed è la parte che le imprese dimenticano di più. I voucher camerali includono di frequente la formazione tra le spese ammissibili, i fondi interprofessionali (come Fondimpresa) finanziano piani formativi aziendali, e alcune misure regionali coprono ore di affiancamento. L'avviamento è il punto dove i progetti di digitalizzazione falliscono: usare fondi per la formazione è il modo più intelligente di spendere un incentivo." },
      { q: "Da dove comincio concretamente per non perdere i bandi?", a: "Tre mosse: iscriviti alla newsletter della tua Camera di Commercio e controlla la sezione bandi della tua Regione una volta al mese; chiedi al commercialista un check annuale sulle misure nazionali in Legge di Bilancio; prepara una cartella con i documenti ricorrenti — visura, DURC, dimensione d'impresa, preventivi di spesa. La maggior parte dei bandi camerali si esaurisce in poche settimane: arriva in tempo chi ha i documenti pronti." },
    ],
    content: [
      {
        type: "intro",
        body: "Il tuo concorrente ha appena rifatto tutto: gestionale, tablet in cantiere, squadra formata. E una parte non l'ha pagata lui — gliel'ha coperta un bando. Gli incentivi per la digitalizzazione di un'impresa edile nel 2026 si dividono in cinque famiglie: crediti d'imposta nazionali per beni digitali, Nuova Sabatini, voucher delle Camere di Commercio, bandi regionali e fondi per la formazione. Qui trovi la mappa e il metodo, con una regola fissa: percentuali e scadenze si verificano sempre sul bando. Chi si digitalizza pagando tutto di tasca sua, spesso, non ha guardato in tempo.",
      },
      {
        type: "section",
        heading: "Perché Qui Non Trovi Percentuali Precise",
        body: "Patto di onestà, prima di tutto. Gli incentivi cambiano di continuo: le aliquote vengono ritoccate dalle Leggi di Bilancio, i fondi si esauriscono prima della scadenza formale, i bandi camerali durano poche settimane. L'articolo che oggi ti promette il 50% garantito su questo e quello ti fa fare i conti su numeri già vecchi. Quello che resta stabile è la struttura: quali famiglie di incentivi esistono, che tipo di spese coprono e dove si controllano. Questa guida ti dà la mappa. I numeri esatti li verifichi sulle fonti ufficiali — GSE e MIMIT per le misure nazionali, la tua Camera di Commercio e la tua Regione per quelle locali — o li fai verificare a commercialista e consulente bandi. Fidarsi dei riassunti, in questo campo, costa domande respinte.",
      },
      {
        type: "section",
        heading: "Famiglia 1: i Crediti d'Imposta Nazionali",
        body: "Il filone principale è Transizione 5.0: un credito d'imposta per investimenti in beni strumentali e digitali collegati a una riduzione certificata dei consumi energetici dell'impresa. La logica: investi, certifichi il risparmio energetico, maturi un credito da usare in compensazione. Per un'impresa edile può riguardare macchinari, ma anche la componente digitale collegata. Doppia attenzione: la misura è stata rimodulata più volte e richiede certificazioni tecniche ex ante ed ex post. Non è un fai da te: serve un professionista. Accanto, la storica linea dei crediti per beni strumentali 4.0 — inclusi i beni immateriali come i software con determinati requisiti — è in esaurimento e viene confermata o meno anno per anno. Lo stato 2026 va verificato in Legge di Bilancio con il commercialista, prima di firmare qualsiasi ordine. Firmare prima di verificare ha un prezzo preciso: paghi tutto tu.",
      },
      {
        type: "section",
        heading: "Famiglie 2 e 3: Nuova Sabatini e Voucher Camerali",
        body: "La Nuova Sabatini è la misura più longeva: un contributo statale sugli interessi per finanziamenti destinati all'acquisto di beni strumentali, con una corsia per gli investimenti digitali e green. Funziona a plafond: quando i fondi dell'anno finiscono, si aspetta il rifinanziamento. Il momento della domanda conta quanto la domanda. I voucher digitali delle Camere di Commercio, tramite i Punti Impresa Digitale (PID), sono la porta più accessibile per una piccola impresa edile: contributi a fondo perduto per software, tecnologie, consulenza e formazione, con domande semplici rispetto ai bandi nazionali. Ogni camera pubblica il suo bando, con importi e finestre proprie. E i fondi si esauriscono in fretta: controlla la sezione bandi del sito camerale ogni mese, o iscriviti alla newsletter e lascia che sia il bando a trovare te. Chi lo scopre a fondi esauriti aspetta un anno. Il suo concorrente no.",
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
        heading: "Cosa Ci Copri: le Spese Tipiche di un'Impresa Edile",
        body: "Tradotto nel concreto, le spese che i bandi coprono più spesso sono: il gestionale di cantiere in cloud e i canoni collegati, dove il bando ammette i canoni; i dispositivi per il cantiere — smartphone e tablet per timbratura digitale, rapportini e foto; la fatturazione elettronica e gli strumenti amministrativi; la consulenza per l'avviamento e la formazione della squadra. Un progetto tipo da piccola impresa — software, 4-5 dispositivi, avviamento e formazione — si colloca spesso tra i 5.000 e i 15.000 euro. Esattamente la taglia dei voucher camerali e dei bandi regionali minori. Significa che una parte rilevante del progetto può rientrare, se ti muovi quando la finestra è aperta. E mentre leggi, qualcuno nella tua provincia quella domanda la sta già scrivendo.",
      },
      {
        type: "section",
        heading: "Il Metodo: 4 Mosse per Non Perdere il Treno",
        body: "Prima mossa: monitoraggio. Newsletter della Camera di Commercio, controllo mensile dei bandi regionali, check annuale con il commercialista sulla Legge di Bilancio. Costo: un'ora al mese. Seconda: cartella documenti pronta — visura, DURC, dichiarazione dimensione d'impresa, preventivi dei fornitori. I bandi camerali si esauriscono in settimane: vince chi è pronto. Terza: progetto scritto prima del bando — cosa digitalizzi, con che strumenti, con che spese. Un preventivo dettagliato del fornitore ti fa presentare domanda in giorni, non in settimane. Quarta: mai comprare contando su un incentivo non ancora concesso. L'investimento deve reggersi da solo; l'incentivo è l'acceleratore. E occhio alla regola frequente per cui la spesa è ammissibile solo se successiva alla domanda. Un ultimo numero, l'unico garantito di questa guida: provare un gestionale per 31 giorni costa zero, bando o non bando. Ed è il modo giusto di preparare il progetto da presentare — mentre il tuo concorrente il suo lo ha già pronto.",
      },
      {
        type: "cta",
        heading: "Il Bando Arriva: Fatti Trovare con il Progetto Pronto",
        body: "Prepara il progetto di digitalizzazione con dati veri: prova Edilizia in Cloud gratis per 31 giorni, senza carta di credito. Quando esce il voucher, tu hai già il preventivo del fornitore e la squadra formata. Il tuo concorrente non ti aspetta.",
      },
    ],
  },
];
