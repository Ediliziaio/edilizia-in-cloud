# Gestione complessiva delle operazioni immobiliari

## Obiettivo e scelta del modello

Per un'impresa che costruisce e vende con capitale proprio, investitori e banca, la commessa generale deve rappresentare l'intera operazione. Terreno, progettazione, costruzione, manodopera, ordini, bolle e fatture possono essere riferiti direttamente alla generale. Le unità seguono disponibilità, acquirenti, contratti e incassi. L'analisi dei costi per appartamento è facoltativa.

Il modello **Sviluppo immobiliare** copre già questo caso. Non occorre aggiungere un settimo tipo alla finestra di creazione. La distinzione utile è tra gestione complessiva e analisi delle unità, dentro il modello esistente. Lo stesso cantiere generale è disponibile anche per appalto e compravendita.

## Materiale analizzato

- Tre business plan Excel, ciascuno con tre scenari: nove fogli complessivi.
- Trentotto XML di fatture: 27 TD01, 4 TD24 e 7 TD06. Sette XML contengono riferimenti `DatiDDT`; questo conteggio non certifica la presenza dei documenti di trasporto originali. Un XML contiene riferimenti a ordini di acquisto.
- Schermate fornite e verifica del portale completo su localhost, nella commessa dimostrativa Residenza Via Roma.
- Sorgente aggiornato a `origin/main`, base `2b8b2dcdb22f41d8dac0abc43818107b3f596434`, in una copia di lavoro separata. Le modifiche preesistenti nel checkout originale sono state conservate.

### Problemi dei file da gestire nell'importazione

| Evidenza | Conseguenza | Trattamento implementato |
|---|---|---|
| Il file Cherubini riporta Via Lotti nel titolo; altri scenari riportano Via Callimaco | Rischio di usare assunzioni di un'altra operazione | Il titolo originale e lo scenario restano visibili in anteprima |
| Cherubini, realistico: C145 omette il subtotale finanziario C96 di 90.000 € | Il totale del file sottostima i costi dettagliati | Importazione delle righe di dettaglio, con controllo rispetto al totale dichiarato |
| Callimaco, realistico: C148 omette C99 di 95.000 €; C145 somma due volte la riserva di 15.000 € | Differenza netta di 80.000 € rispetto al dettaglio corretto | Subtotali e totali esclusi, ogni costo elementare acquisito una volta |
| Lotti, realistico: C149 omette C99 di 95.000 € | Totale del file non riconciliato con il dettaglio | Controllo di quadratura e inclusione degli oneri finanziari |
| Righe di riepilogo usano ricavi comprensivi di IVA per calcolare risultati etichettati come ricavi o utile | Confronti economici con basi diverse | Righe delle vendite IVA esclusa; IVA totale e formule del risultato non importate |
| Voci senza importo e zeri espliciti | Un costo ancora da stimare può sembrare gratuito | Valori mancanti distinti dagli zeri e compilabili nell'anteprima |
| Non c'è un calendario mensile delle singole voci | Fabbisogno e rendimento temporale incompleti | Nessuna data inventata; indicatori finanziari sospesi fino al completamento del calendario |

Gli importi dei file sono assunzioni fornite dall'impresa. Questa verifica riguarda la coerenza dei dati e del software, non la fattibilità economica delle operazioni.

## Interventi completati nel codice locale

### 1. Creazione e importazione del business plan

- La creazione della generale permette di scegliere fra voci tipiche e business plan Excel. Scegliendo Excel non vengono aggiunte voci di budget precompilate che potrebbero duplicare ricavi e costi importati.
- È possibile partire senza unità abitative e aggiungerle successivamente.
- File `.xlsx` letti nel browser con scelta di un solo scenario. Limiti: 15 MB, 5.000 righe e 100 colonne per foglio, 300 voci per importazione.
- Anteprima senza creazione di bozze o altre scritture. La bozza nasce soltanto alla conferma dell'importazione.
- Lettura dei risultati già memorizzati nelle celle. Formule, macro e collegamenti non vengono eseguiti.
- Totali, subtotali, IVA riepilogativa e formule del risultato esclusi per evitare duplicazioni.
- Importi e categorie correggibili nell'anteprima. Gli zeri espliciti restano zeri; le righe senza stima entrano nella bozza con un indicatore persistente «Da stimare», senza essere presentate come costi gratuiti.
- Ogni voce acquisita conserva file, foglio e riga di provenienza, con indicazione di eventuali modifiche nell'anteprima.
- I costi reali e i saldi dell'Excel non vengono trasformati in consuntivi: questi continuano a derivare dai documenti registrati.
- L'originale viene archiviato privatamente nella commessa prima delle voci, con percorso legato alla versione e impronta SHA-256. Lo stesso file/scenario è riconosciuto e rifiutato se già importato nella versione. L'archivio permette di scaricare gli originali. Un piano approvato resta protetto.

### 2. Costi sull'intera operazione

- Il piano mostra il costo consolidato della generale e delle commesse collegate, distinguendo quanto è registrato direttamente sulla generale e quanto sulle unità.
- Le registrazioni sono raggruppate per voce del piano e apribili per risalire alle fonti.
- I costi sono visibili anche se non esiste ancora alcuna unità abitativa.
- La ripartizione per millesimi, superficie o valore resta disponibile su richiesta. Le quote sono analitiche e non generano costi aggiuntivi.
- Nella panoramica immobiliare la tabella parte dagli stati di vendita. Avanzamento delle lavorazioni e margini ripartiti si aprono con «Analisi per unità».
- La differenza tra ricavi del piano e prezzi delle unità è descritta come differenza tra le due basi, senza presentarla come costo ancora da assegnare.

### 3. Cantiere completo sulla generale

- Rapportini e bolle, ordini ai fornitori, DDT ricevuti, squadre e accessi, lavorazioni e contratti, fatture e altri costi, pagamenti e subappaltatori: riuso dei moduli nativi con l'identificativo della generale.
- La generale è l'ambito predefinito. Un selettore permette di consultare e registrare anche su un'unità, senza cambiare pagina; creare unità non è obbligatorio.
- I moduli mantengono i permessi nativi. I dati economici aggiuntivi sono montati solo per chi può vedere i costi.
- Società titolare esplicita; letture e scritture restano nell'azienda attiva. La società dell'operazione non viene confusa con un cliente anagrafico.
- Aggiornamento dei dati consolidati dopo modifiche di materiali e pagamenti e al ritorno dalla scheda Cantiere.

### 4. Ordine → DDT → fattura → pagamento

- Controllo forniture consolidato per generale e unità, con righe d'ordine, consegne, fatture e accesso ai pagamenti del documento.
- Quantità ricevuta già registrata e quantità dei medesimi DDT non sono sommate due volte. Le fatture raggiunte da più collegamenti vengono identificate una sola volta.
- Impegnato, ricevuto valorizzato e fatturato sulle righe abbinate sono fasi separate, IVA esclusa; pagato e residuo vengono dalle funzioni native e sono IVA inclusa. Le fasi non si sommano come costi aggiuntivi.
- Prezzi non definiti e importi mancanti restano sconosciuti. Sono segnalati quantità oltre l'ordinato/ricevuto, prezzi diversi e righe da abbinare.
- Le righe delle fatture si abbinano esplicitamente a quelle degli ordini. Si verificano società, ordine e fornitore; aggiornamenti concorrenti della fattura sono rilevati prima di sovrascriverne le righe.
- Il pagamento è riferito alla fattura/costo: non viene inventata una ripartizione del pagamento per materiale.
- Gli ordini in bozza non sono presentati come impegni già assunti. Le note di credito riducono il fatturato.
- Quando l'XML riconosce già un ordine della stessa operazione, il caricamento contabilizza sul costo nativo dell'OdA. Conserva l'eventuale unità già collegata e rifiuta ordini di altre operazioni. Non crea un costo diretto aggiuntivo.
- Corretto l'avviso del DDT che considerava non abbinata una riga già collegata all'OdA solo perché non aveva l'articolo di una commessa cliente. Le righe libere sulla generale sono riconosciute correttamente.
- Il controllo forniture include una tabella dedicata **DDT senza ordine d'acquisto**, con merce, valore della bolla, fatture collegate e controllo degli importi. I DDT diretti non sono segnalati come righe prive di ordine da correggere. L'abbinamento delle righe agli ordini resta limitato alle fatture che hanno effettivamente un ordine.
- Le fatture cumulative su più DDT conservano i collegamenti documentali, senza attribuire il loro intero importo a ciascuna bolla. Si leggono anche gli altri riferimenti della fattura, compresi quelli fuori dall'operazione, per evitare confronti parziali ingannevoli.
- Una bolla già attribuita alla commessa richiede il controllo merce, senza chiedere di inventare un ordine. Restano da confermare gli eventuali dubbi della lettura AI.

### 5. Completezza del budget

- Le stime mancanti non vengono eliminate dall'importazione: restano da completare, con importo visualizzato come «Da stimare».
- Un importo compilato o uno zero confermato esplicitamente risolve il relativo blocco. Un budget interamente a zero non è approvabile.
- L'approvazione è bloccata anche per descrizioni/importi non validi, scadenze mancanti e precedenti importazioni con stime omesse non verificate.
- Il controllo è ripetuto sui dati persistiti al momento della conferma, con lettura paginata, oltre al controllo del pulsante.
- Margine e fabbisogno non vengono presentati come definitivi con stime o calendario incompleti.

### 6. Cassa e fonti di finanziamento

- Cassa economica del piano e scenari esistenti conservati. Aggiunta una vista delle scadenze effettive IVA inclusa, da prima nota e dal Previsionale nativo.
- Costi ripartiti consolidati nella quota della generale e delle sue unità, senza aggiungere il costo diretto alle medesime quote.
- Storni esclusi; dati senza data, possibili duplicati e fonti non lette sono dichiarati. Il fabbisogno delle scadenze non appare come zero quando le date sono incomplete.
- Simulazione del ritardo dei soli incassi attesi, senza modificare documenti o piano.
- Versamenti, rimborsi, interessi/spese/utili e relative previsioni sono distinti. Un accollo trasferisce debito e non genera denaro in cassa.
- Le tranche future non sono considerate già versate. Le loro date sono rispettate nella proiezione e non vengono duplicate dai prelievi automatici.
- I nuovi movimenti futuri conservano lo stato previsto finché sono confermati con la data effettiva. Il trascorrere della scadenza non li rende automaticamente effettuati.
- La copertura considera anche quando il capitale è disponibile. Sono segnalati mesi scoperti e tranche oltre gli impegni.
- Gli oneri finanziari futuri o ancora previsti sono esclusi dal consuntivo letto dal frontend locale. Gli oneri già compresi nel piano non vengono sottratti nuovamente dal margine.

### 7. Rendiconto mensile

- Nella scheda Investitori: scelta del periodo ed esportazione CSV del budget approvato, stima finale, scostamento, fabbisogno previsto e capitale versato/rimborsato.
- Il mese corrente usa il piano approvato aggiornato alla data del report; i movimenti sono filtrati alla medesima data ed escludono quelli ancora previsti.
- I mesi chiusi usano fotografie economiche con data esplicita. Non vengono ricostruiti usando una stima corrente retrodatata.
- Senza una fotografia valida o quando gli oneri previsti rendono dubbia la fotografia storica, l'esportazione storica completa resta bloccata.
- Restano disponibili i rendiconti nativi PDF/Excel e per singolo investitore. Nessun invio automatico di email o messaggi è stato eseguito.

## Ambito e protezioni del backend

Le funzioni sopra sono integrate nel portale locale completo. È stato verificato anche il download del rendiconto CSV dal browser, confrontando data, budget e capitale effettivo con i valori della scheda. L'azienda attiva è l'intestataria dei documenti: per una società dedicata/SPV diversa va selezionata la sua azienda nel portale. Non è stato aggiunto un consolidamento contabile fra società giuridiche differenti, né creata una nuova società senza la relativa anagrafica.

Il frontend locale usa il backend configurato dell'account. Le nuove protezioni SQL sono state preparate **solo come proposte locali**, senza applicarle al database condiviso:

- `supabase/proposals/20261111061847_generale_budget_completezza.sql`: blocco server dell'approvazione incompleta, unicità delle righe Excel sorgenti e divieto di collegamenti fra società diverse.
- `supabase/proposals/20261111070518_generale_oneri_effettivi.sql`: allinea anche fotografie e consuntivi del backend all'esclusione degli oneri futuri/previsti. Conserva il helper interno esistente e ne revoca l'esecuzione pubblica.

I file sono stati generati con la CLI e tenuti fuori dalla sequenza automatica delle migrazioni: le migrazioni native del repository riportano date fino al 2028, successive alla data di questo intervento. Vanno integrati dopo quei moduli quando si prepara il rilascio del backend. I controlli nel frontend locale sono già attivi; i vincoli server aggiuntivi non sono presentati come già installati nell'account condiviso.

Per compatibilità con lo schema disponibile, provenienza Excel e stato previsto usano prefissi riservati nelle note (`EIC-BP`, `EIC:DA_STIMARE`, `EIC:MOVIMENTO_PREVISTO`). I prefissi sono gestiti dal codice e nascosti nelle note dei movimenti mostrate all'utente.

## Verifica e uso locale

- Portale completo avviato su `http://127.0.0.1:5173`, con l'accesso effettuato dall'utente.
- Verifica visiva nel portale: panoramica immobiliare, cantiere generale e costi di commessa.
- Regressioni automatiche sulle commesse generali, piano, investitori, vendite, documenti, DDT, propagazione dei pagamenti e rendiconti: **740 test superati in 62 file**.
- Prove PostgreSQL locali: RPC nativo di approvazione, rollback della versione precedente, duplicazioni Excel, isolamento societario e filtro degli oneri previsti.
- Verifica dedicata sui tre file originali e sui nove scenari, letti senza modificarli: **1 test di integrazione superato**.
- Controllo TypeScript del modulo e delle dipendenze importate con `tsc -p tsconfig.immobiliare.json`: **superato**. Il controllo globale iniziale ha evidenziato anche due errori già presenti su main in `src/test/logic/agenteLeadAppuntamentoVero.test.ts`, estranei a queste modifiche. Quel file non è stato modificato.
- Il frontend locale usa la connessione al backend già configurata nel progetto. L'utente ha autorizzato espressamente le scritture di prova in **Demo Azienda S.r.l.**; il flusso completo è stato eseguito in quella società, con dati sintetici marcati `[Test locale]`.
- Nessun deploy o push. Le modifiche restano nella copia di lavoro locale.

### Prima prova completa nel portale con ordine: O-0063

Commessa `[Test locale] Verifica documenti — 11/11/2026`, identificativo `a9d5ac5a-57b7-4bb4-8539-4d9c683e0d5a`, con **zero unità abitative**.

| Passaggio verificato | Esito persistito |
|---|---|
| Importazione Excel sintetico | Tre voci, un solo originale archiviato; secondo caricamento del medesimo scenario rifiutato senza nuove righe o allegati |
| Budget incompleto | Stima mancante e mesi assenti bloccano l'approvazione; zero confermato e calendario completato consentono l'approvazione della versione 1 |
| Piano approvato | Costi 100 € a novembre, ricavi 150 € a dicembre, margine 50 €, capitale massimo previsto 100 € |
| Ordine `ODA-2026-0039` | Dieci pezzi da 10 €, IVA 22%, direttamente sulla generale; fornitore sintetico dedicato |
| DDT `TEST-DDT-20261111` | Dieci pezzi ricevuti, riga collegata alla stessa riga d'ordine, destinazione cantiere |
| Fattura `TEST-LOC-20261111` | XML sintetico ricevuto, ordine e DDT riconosciuti, riga abbinata esplicitamente, contabilizzata sul costo dell'OdA |
| Due pagamenti registrati | 61 € + 61 €; residuo intermedio 61 €, finale 0 €; due movimenti di prima nota, nessuno storno |
| Controllo duplicazioni | Un solo costo di 100 € netti dopo ordine, DDT, fattura e secondo caricamento dello stesso XML; nessuna riga di fornitura da controllare |
| Cassa e consuntivo | Pagato effettivo 122 € IVA inclusa; costo del piano 100 € netto, stima finale 100 €, scostamento zero |
| Fonti | Versamento sintetico 122 €; rimborso 22 € dapprima previsto ed escluso dagli effettivi, poi confermato con la data del test; capitale netto 100 € |
| Rendiconto di novembre | CSV scaricato dal portale e verificato: data 11/11/2026, budget e stima 100 €, ricavi 150 €, versato 122 €, rimborsato 22 €, capitale dentro 100 € |
| Originale Excel | Scaricato dall'archivio privato, identico byte per byte al file importato; SHA-256 `c8c498884249e9a9d274ef033f684c8fce200742348c057d15bf538bd15d9479` |

I pagamenti e i movimenti delle fonti sono **sole registrazioni dimostrative nel gestionale**. Non sono stati disposti bonifici, inviati ordini ai fornitori, trasmessi documenti allo SDI o inviati rendiconti. Nessuna modifica DDL è stata applicata al backend condiviso.

Le prove visive, il CSV verificato e il registro dei dati di test sono conservati negli output locali dell'attività. Il portale rimane aperto sulla commessa di prova.

### Seconda prova sulla stessa generale: DDT → fattura → pagamento senza ordine

Su richiesta dell'utente è stata aggiunta una seconda fornitura sintetica alla stessa O-0063, sempre con zero unità abitative e senza creare alcun nuovo OdA.

| Passaggio | Esito verificato nel portale e nei dati persistiti |
|---|---|
| Prima della prova | Un costo da 100 € della prima fornitura, già pagato per 122 € lordi |
| DDT `TEST-DDT-DIR-20261111` | Cinque pezzi da 10 €, valore merce 50 €, direttamente sulla generale; `purchase_order_id` nullo. Il solo DDT non crea un costo contabile: il totale resta 100 € |
| Fattura `TEST-DIR-20261111` | XML sintetico da 50 € + 11 € IVA, privo di riferimenti a ordini. Il riferimento al DDT è riconosciuto automaticamente; fattura contabilizzata sulla generale con `purchase_order_id` nullo |
| Costo della fornitura diretta | Un solo costo da 50 €, identificativo `7722f7b6-48e0-4866-b692-827d17861912`; totale dell'operazione 150 € |
| Pagamento | Un movimento dimostrativo da 61 €, identificativo `3caf084a-61c8-408d-9f04-9fbace03c125`; residuo della fattura zero |
| Secondo caricamento dello stesso XML | Una sola fattura diretta, un solo costo diretto e un solo pagamento; totale ancora 150 €, nessun nuovo ordine |
| Riconciliazione | Sezione dedicata senza ordine: DDT 50 €, fatturato netto 50 €, «Importi coerenti», zero righe da controllare. Pagato complessivo 183 €, residuo complessivo zero |
| Rendiconto aggiornato | Budget approvato conservato a 100 €, consuntivo/stima finale 150 €, scostamento +50 € dovuto alla nuova fornitura. CSV scaricato e controllato |

DDT: `d6ff257e-b9fb-47d9-a3e7-d172f01cf200`; fattura: `ae7a9485-299e-40c4-968a-b60fa2f52995`. L'ordine della prima prova resta presente; il suo conteggio non cresce. Tutti i pagamenti sono sole registrazioni dimostrative, senza transazioni bancarie o invii di documenti.

Prove locali dell'attività: `outputs/test-ddt-senza-ordine.jpg`, `outputs/Rendiconto-O-0063-2026-11-senza-ordine.csv` e `work/test-flusso-completo/verifica-ddt-senza-ordine.json`. Nessuna modifica al database condiviso oltre ai dati di test autorizzati; nessun DDL remoto.

### Avvio permanente del localhost

Su richiesta dell'utente è stato configurato il servizio macOS `com.ediliziaincloud.local5173`: parte all'accesso dell'utente, resta indipendente dalla chat e viene riavviato se il processo termina. Il riavvio automatico è stato provato e il portale ha risposto nuovamente con HTTP 200.

Le dipendenze sono nella cartella `node_modules` del progetto. I log si trovano in `/Users/agenteai/Library/Logs/EdiliziaInCloud/localhost5173`. Il servizio ascolta su `127.0.0.1:5173`.

L'avvio normale è affidato a questo servizio. Per un avvio manuale, dopo averlo fermato esplicitamente, il comando effettivamente verificato è `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort`. Il manifest nativo presenta un conflitto `EOVERRIDE` su zod per alcuni comandi npm: non è stato modificato nell'ambito di questa attività.

Per fermarlo esplicitamente: `launchctl bootout gui/$(id -u)/com.ediliziaincloud.local5173`. Non avviare contemporaneamente un secondo Vite sulla stessa porta.

Per ripetere il controllo dei file privati, impostare `BUSINESS_PLAN_SOURCE_DIR` al percorso della cartella ricevuta e usare `vitest run --config vitest.business-plan-corpus.config.ts`. I file originali non sono copiati nel repository.

### Simulazioni Aurora: acquirenti, archivio, banca e altre tipologie

Completate nell'azienda Demo le integrazioni autorizzate su O-0064, Residenza Aurora (`13fed592-3287-465b-91b7-8aa2bccd4187`).

- Tre anagrafiche fittizie collegate sia all'unità sia alla commessa: T1 Marta Aurora, T2 Paolo Riva, A1 Aurora Acquisti S.r.l. Portali cliente disabilitati, nessun invito o account Auth creato.
- Archiviati 37 PDF facsimile privati, tutti marcati DEMO / NON VALIDO. La checklist nativa mostra 21 obbligatori su 21, zero mancanti e zero scaduti. Verificati anche gli oggetti Storage: nessun file mancante. Business plan scaricato dall'archivio nativo.
- DDT diretto da 100.000 euro collegato alla fattura e al costo già presenti, senza ordine e senza un secondo costo.
- ODA da 20.000 euro con due consegne di 50 mq: prima parziale, poi ricevuto per 100 mq. Fattura da 22.000 euro, costo ODA aggiornato una sola volta; pagamento 13.420 euro su 26.840 lordi. Lo scostamento prezzo di 2.000 euro resta segnalato nel controllo forniture.
- Subappalto da 200.000 euro; SAL verificato da 40.000, ritenuta 2.000, netto 38.000. Registrato pagamento da 20.000 prima della fattura; fattura e pagamento collegati successivamente con le RPC native, senza una seconda uscita. Residuo SAL 18.000, garanzia separata al 30/06/2028.
- Conto interno manuale “[DEMO] Aurora — conto simulato”, senza connessione bancaria o IBAN reale: 11 movimenti abbinati a 11 registrazioni esistenti, saldo 694.180 euro. I tre versamenti delle fonti sono riportati nella prima nota aziendale con riferimento ai movimenti delle fonti, separati dai ricavi operativi della commessa.
- Corrette categoria e scadenze del SAL e della fornitura; aggiornato a finire costruzione a 1.540.000 euro per trasferire a consuntivo 60.000 euro di lavori già previsti. Il maggior prezzo di 2.000 resta nella stima: ricavi 3.200.000, costi finali 2.736.602, margine 463.398, costi registrati 818.000, capitale investito economico 688.000 euro.
- Salvata di nuovo la fotografia di novembre e scaricato il relativo rendiconto CSV dal portale. Lo storico di ottobre di O-0031 resta distinto e disponibile nel CSV già verificato.

Creati anche O-0071, “[Demo 11/11] Aurora — appalto e SAL” (`15b83799-8ace-46f7-b0ce-42615525c2ef`), con due ODL, contratto da 200.000, budget costi 150.000, SAL 80.000, ritenuta 400, netto 79.600 e bozza di fattura collegata in scissione dei pagamenti; e O-0072, “[Demo 11/11] Aurora — acquisto, ristrutturo e vendo” (`4bd79964-5e90-4f1a-a31b-efb32bbb4846`), con due unità, ricavi 500.000, budget 385.000, costi registrati 295.000 e investitore da 200.000 con quota utile 25%.

Eseguiti cinque scenari per ciascun modello (15 totali), preservando budget e consuntivi: base, prezzi -5% / costi futuri +10% / ritardo 3 mesi, prezzi -10% / costi +20% / ritardo 6 mesi, solo ritardo 6 mesi, soli costi +20%. Per Aurora il caso più severo porta il margine a -240.322,40 euro. Verificati inoltre replay idempotenti di pagamenti e bozza SAL, blocchi ai sovrapagamenti e al movimento bancario incompatibile.

La simulazione ha individuato un difetto nel previsionale di cassa: la garanzia passiva era compresa sia nel residuo lordo della spesa sia nello svincolo futuro. Il caricamento ora legge le trattenute delle fatture contabilizzate anche più vecchie; il calcolo limita il residuo della spesa al dovuto netto e lascia lo svincolo nel registro. Non sottrae due volte dalle rate già nette. Verifica nativa dopo la correzione: 55.000 euro a novembre, 31.420 a dicembre (13.420 fornitura + 18.000 SAL), poi soltanto 2.000 a giugno 2028. Fabbisogno prima degli incassi futuri 86.420 euro, coerente col quadro pagamenti.

Validazione finale: 85 file di test, 1.326 test superati; TypeScript immobiliare e controllo whitespace superati. Nessun DDL remoto, bonifico, firma o invio SDI/email. Il pannello temporaneo di preparazione Demo è stato rimosso dal sorgente dopo l'uso. Esiti, CSV, facsimili e schermate sono in `outputs/simulazioni-commesse/` della cartella di lavoro. Localhost affidato al servizio macOS già configurato e verificato attivo anche dopo il riavvio.

### Continuazione: elenco prezzi, detrazioni e SAL successivo nell'appalto Aurora

Completata una seconda prova operativa su O-0071 tramite le schermate native, senza pannelli temporanei o modifiche alla modalità di fatturazione dell'azienda.

- Importate da testo Excel due voci: DEMO-IMP-ELE (600 euro/punto) e DEMO-IMP-IDR (400 euro/punto). Associate 100 unità di ciascuna al computo dell'ordine impianti: totale 100.000 euro, coerente con il suo importo precedente.
- Registrate tre misure: +65 e -5 punti elettrici, +60 punti idraulici. Quantità nette 60 per voce, valore misurato 60.000 euro. L'ordine strutture resta ad avanzamento del 50%, pari a 50.000 euro.
- Creato ed emesso internamente SAL n. 2: cumulativo 110.000, precedente 80.000, quota nuova 30.000, ritenuta 150, netto 29.850 euro. Il primo SAL conserva le sue due voci originarie e gli 80.000 euro; le tre misure ora indicano SAL n. 2 e non presentano comandi di cancellazione.
- Preparata la bozza fiscale collegata `9b26ee7e-f147-4df8-92c3-58bcc38ec227`: imponibile 29.850, IVA 6.567, totale documento 36.417, dovuto in scissione pagamenti 29.850 euro. Nessuna emissione o trasmissione fiscale; nessun incasso registrato. Restano da completare i dati fiscali del destinatario prima di un'eventuale emissione reale.
- Provata anche l'anteprima di un terzo SAL senza nuove misure o avanzamenti: 110.000 meno 110.000 = zero, comando di creazione disabilitato. La prova è stata chiusa senza salvare un terzo SAL.
- Verificati i dati persistiti: due SAL, due bozze collegate, un solo costo da 12.000 euro già esistente e zero registrazioni di cassa sull'appalto. Audit in `outputs/simulazioni-commesse/aurora-appalto-misure-sal2-audit.json`.

Correzioni locali emerse dalla prova: i collegamenti `?sezione=elenco`, `sal`, `misure` e `subappalti` ora aprono la scheda del contratto anche senza `scheda=contratto`; cambiare sezione mantiene un indirizzo completo e tornare in Panoramica elimina la sezione residua. Un secondo SAL nello stesso giorno parte da un periodo valido. Dopo la preparazione, la fattura si apre nel suo dettaglio consultabile anche con fatturazione esterna: prima il collegamento all'editor nativo veniva rimandato alla lista dalla guardia della modalità aziendale. Le guardie e le impostazioni dell'azienda restano invariate.

Validazione aggiornata: 85 file, 1.337 test superati, TypeScript immobiliare e controllo whitespace superati. I controlli includono anche varianti, subappalti, flussi DDT/fatture/pagamenti e previsionale. Il servizio localhost resta attivo.

Allineato inoltre al 50% l'avanzamento operativo dell'ordine strutture, già certificato nei due SAL: 50.000 euro di strutture più 60.000 misurati sugli impianti corrispondono a 110.000 euro eseguiti e a SAL. Conservato il valore precedente nel file locale `aurora-appalto-avanzamento-prima.json`. Importi contrattuali, costi e cassa restano quelli della prova.


### Audit delle sei tipologie, dalla creazione ai punti di arresto

Rapporto aggiornato: [Audit dei sei percorsi](../../audit/2026-11-11-sei-tipologie-commessa.md). Sono stati aggiunti casi nativi dal form cliente, nei due rami appaltatore, nelle tre generali e dal simulatore. Regressioni finali: **107 file, 1.539 test superati**; TypeScript del perimetro ampliato superato.

Correzioni nuove: costi tipici da stimare anziché zeri già confermati; IVA delle rate appaltatore; ripresa del salvataggio senza duplicati nella pagina corrente; stato iniziale e storico; propagazione degli incassi; IVA aggiunta inizialmente ai movimenti netti delle unità; controllo del residuo e delle date nel form; tetto a misura che comprende righe già in SAL; aggiornamento del periodo di rendiconto; collegamenti fiscali compatibili con la modalità esterna; costi aperti con flag pagato nullo.

L'audit ha anche evidenziato limiti da non confondere con prove già concluse: **movimenti delle unità non ancora collegati automaticamente alla prima nota**, **stima a misura ancora presentata come credito nell'elenco**, controlli server del budget ancora da integrare, salvataggio appaltatore ancora in più richieste, chiusura economica e integrazioni fiscali/bancarie reali non collaudate. Il rapporto contiene evidenze, casi persistiti e criteri di accettazione per proseguire. Nessun DDL applicato al backend condiviso.

### Chiusura delle tre priorità P1 e leggibilità dei popup

Le tre priorità indicate nell'ultimo audit sono implementate e installate anche nel backend: incassi unità collegati alla prima nota con idempotenza e storno, separazione della stima a misura dai crediti emessi, controlli concorrenti e completezza del budget sul server. Il quadro dell'unità e il previsionale leggono la cassa registrata, senza trasformare le permute in entrate. Le registrazioni storiche richiedono un collegamento esplicito; su Aurora riutilizzate le prime note già riconciliate, su R1 completata la contabilizzazione dimostrativa.

Verifica in Demo con sessione reale: cassa finale O-0084 1.210 euro, permuta 10 euro separata, due storni conservati; fattura a misura 610 meno nota di credito 61 meno incasso 100 = residuo 449, coerente nel quadro e nel previsionale. Budget incompleto non approvabile. Pannello temporaneo rimosso dopo la prova. Dettagli e limiti nel rapporto di audit aggiornato.

Corretto anche il taglio orizzontale del popup unità segnalato dall'utente: spazi di lavoro fino a 1.280 px, moduli fino a 960 px, griglia contenuta nella finestra, descrizioni a capo e campi più leggibili. Allineati 26 popup della generale e i dialog operativi contestuali. Validazione aggiornata: 112 file / 1.564 test frontend e logica più 12 test database isolati; TypeScript e controllo whitespace superati. Localhost resta affidato al LaunchAgent persistente, HTTP 200. Le P2 dell'audit non sono dichiarate concluse.

### Popup operativi e salvataggi effettivi

Completata l’estensione a ordini, arrivi, DDT, fatture, costi e pagamenti: barre delle azioni ferme, corpo scorrevole, descrizioni e menu a capo. Modifica dettagli ordine in finestra dedicata. Su O-0083 provati ordine da 40 € netti, due DDT per 17 pezzi, fattura da 48,80 €, acconto da 20 € e saldo da 28,80 €, senza duplicare il costo; aggiunto un bollo diretto dimostrativo da 2 € lasciato da pagare. Sistemati il salto fuori dalla generale dopo un DDT e il riferimento residuo del pagamento precedente. Audit aggiornato con UUID, evidenze e limiti. Regressione: 122 file / 1.626 test più 12 test database isolati, TypeScript e whitespace superati; localhost persistente attivo.

### Verifica del riuso dei moduli

Confermati gli stessi componenti operativi del portale per ordini, DDT, fatture, costi, pagamenti, rapportini e subappalti. Eliminata la gestione separata del layout nei contenitori della generale: larghezza e scorrimento appartengono ora al Dialog condiviso in `components/ui`. Gli adattatori mantengono soltanto impostazioni predefinite, aspetto e contesto di navigazione. Verificati fattura, pagamenti e modulo costi in browser a 720 px di altezza, con azioni visibili; nessun nuovo dato Demo. Regressione ampliata: 130 file / 1.687 test, TypeScript e whitespace superati. Mappa dei componenti nell’audit; le viste consolidate specifiche della generale restano distinte dai moduli operativi riutilizzati.


### Simulazioni estese: interruzioni, recupero e lavorazioni a misura

Chiusa la P2 della creazione appaltatore: stesso motore nativo transazionale per ordine, rate e storico, richieste ripetute e recupero dopo ricaricamento; controlli server di azienda, committente, contratto, stato, importi lordi e date. Migrazioni applicate e registro interno inaccessibile al client. Distinte ragione sociale e referente nei componenti condivisi. Corrette validazione numerica, acconti digitati senza blur, zero esplicito del costo e tetto nascosto dopo il cambio a corpo. La creazione pianifica scadenze; gli incassi si confermano nel dettaglio con il comando di prima nota.

In Demo creati dal modulo nativo O-0086 (1.234,56 € netti, tre rate per 1.506,16 €) e O-0087 (stima 2.500,75 €, tetto 3.000 €, nessuna rata). Due RPC simultanee recuperano un solo ordine; quattro richieste incoerenti respinte senza residui. Recuperato lo stesso lavoro dopo una risposta volutamente ignorata, poi contabilizzato un solo incasso da 146,40 €. Su O-0087 salvate e confermate 2 giornate per 500 €, costo totale 240 €, margine 260 € / 52%; composto, scaricato in PDF e annullato il solo SAL in bozza, con la lavorazione nuovamente libera e nessun credito o incasso creato. Popup di rendiconto allineati alle opzioni del Dialog comune.

Regressione 135 file / 1.768 test, più 33 test database; ultima verifica del modulo 74 test superati. TypeScript e whitespace superati; tredici verifiche mirate sui dati Demo tutte vere. Pannello temporaneo rimosso; localhost persistente attivo, HTTP 200. Dettaglio, UUID, limiti e artefatti nel rapporto di audit.

Le altre P2 restano da implementare: verifica finale e distinzione della chiusura operativa/economica, scelta della comunicazione nel cambio stato, revisione delle assunzioni temporali, abbinamento completo delle fatture esterne ai rendiconti appaltatore. SDI, banca collegata e firma reali non sono dichiarati collaudati. Le verifiche su dati importati e Demo non sostituiscono queste integrazioni.
