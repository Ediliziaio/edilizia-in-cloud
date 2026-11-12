# Audit dei sei percorsi commessa — 11 novembre 2026

## Risultato

Le sei scelte di creazione sono state percorse sul portale locale, con dati salvati esclusivamente in Demo Azienda S.r.l. Il percorso appaltatore è stato separato in a corpo e a misura. Le tre priorità P1 individuate nell'audit iniziale sono state corrette anche nel backend condiviso e verificate in Demo; l'aggiornamento conclusivo è riportato in fondo. Restano gli interventi P2 e i limiti delle integrazioni reali descritti sotto.

Il percorso verificato è: scelta del modello → creazione → piano/valorizzazione → documenti e lavoro → fatture/incassi/pagamenti → stato finale o punto di arresto. Le prove nel browser, le letture dei dati persistiti e i test automatici sono evidenze distinte. Una bozza fiscale, un rogito dimostrativo registrato o una riconciliazione manuale non dimostrano un invio SDI, un atto notarile, una firma o una connessione bancaria reale.

## Matrice dei percorsi e della copertura

| Percorso | Creazione verificata ora | Lavoro ed economia verificati | Fatture, incassi e limite finale |
|---|---|---|---|
| Commessa cliente | O-0075, form nativo, cliente sintetico, 1.000 € netti, IVA 10%, una rata da 1.100 € | Rata segnata incassata e registrazione esplicita in prima nota; riepilogo finale 1.100 € incassati e zero residuo | Una sola rata e una sola prima nota. Fatturazione disabilitata dalla modalità esterna. Il dialogo di cambio stato annuncia una notifica: annullato, nessun avviso inviato. Chiusura operativa non confermata |
| Lavoro per appaltatore | O-0076 a corpo: 1.000 € netti, IVA 22%, rata 1.220 €. O-0077 a misura: stima 1.000 €, tetto 1.200 €, zero rate sulla stima | Contratto e tariffa facsimile salvati dal portale. Dieci ore a 50 €, costo 300 €, margine 200 €; riga confermata e rendiconto n. 1 da 500 € composto in bozza | Non inviato né fatto firmare. L'editor fiscale richiede modalità nativa. Nell'elenco resta un errore aperto: la stima a misura appare come credito da incassare |
| Generale appalto a contratto | O-0078 creata dal selettore nativo senza ordini di lavoro e senza piano obbligatorio | Caso completo O-0071 già persistito: prezzi, quantità positive e rettifica negativa, due SAL, 110.000 € cumulati meno 80.000 € precedenti = 30.000 € nuovi, ritenute 550 €. Prova aggiuntiva senza nuovo eseguito blocca SAL a zero | Due bozze fiscali, split payment e ritenute distinti; nessun pagamento su O-0071. Materiali, DDT, fattura e SAL passivo provati separatamente sulla generale Aurora. Non verificati emissione fiscale effettiva, saldo finale e svincolo reale delle ritenute |
| Generale sviluppo immobiliare | O-0079 creata dal form nativo, 100.000 € di ricavi, zero unità: il cantiere generale resta utilizzabile | Piano tipico nato con otto costi sconosciuti. Individuato e corretto il falso budget completo. Caso operativo Aurora O-0064: sei unità, piano approvato, costi generali, investitori, forniture e SAL passivo | O-0064 conserva le prove precedenti di DDT diretto, ordine con due consegne, fatture, pagamenti parziali e banca manuale. Documenti dimostrativi 21/21 obbligatori e rendiconto CSV già scaricato. Nessun collaudo di banca o SDI reali |
| Generale compra, ristruttura, vendi | O-0080 creata dal portale con due unità; sei stime mancanti persistite; approvazione disabilitata | Sul caso operativo O-0072/R1: prenotazione → compromesso → rogito dimostrativo, acquirente sintetico, prezzo netto 240.000 €, caparra 20.000 €, saldo 220.000 €, residuo zero | Bozza fiscale dal saldo: netto 220.000 €, IVA 22.000 €, totale 242.000 €. Nessuna emissione. Prima nota dell'unità ancora assente: è il problema di integrazione principale. Un ulteriore euro di pagamento è ora bloccato nel form |
| Valuta un'operazione | Ipotesi sintetica salvata dal simulatore e convertita in O-0083 | Due unità da 80 m², listino 280.000 € ciascuna; ricavi del piano 560.000 €, otto voci e due fonti per 300.000 €. Nessun costo reale, nessun versamento fittizio generato dalla sola previsione | Unità, piano e fonti distinguono previsto e registrato; copertura insufficiente di 37.960 € segnalata. Dopo la conversione segue il percorso sviluppo, con i medesimi limiti contabili/fiscali |

Le prove pregresse sulle forniture restano documentate nel piano principale: O-0063 senza unità, sia ordine → DDT → fattura → pagamento, sia DDT → fattura → pagamento senza ordine; i costi netti rimangono 150 €, i pagamenti lordi 183 €, senza duplicazioni. Sono prove del motore comune, non sei nuove esecuzioni indipendenti di ogni variante di quel motore.

## Problemi corretti nel codice locale

1. **Budget tipico falsamente completo.** I costi precompilati a zero non erano marcati come mancanti: un nuovo sviluppo da 100.000 € mostrava margine 100.000 € e approvazione disponibile. Le voci non stimate ora conservano il marcatore persistito; margini e capitale sono sospesi, lo zero richiede conferma e l'approvazione locale è bloccata. Il backend esistente ignora le note nell'RPC iniziale: il client completa i marcatori sulle sole righe iniziali ancora a zero e senza note. Verificato con O-0080 dopo un salvataggio nativo. O-0079, appena creata prima della correzione, riparata soltanto nei suoi otto segnaposto, con backup.
2. **IVA nelle rate dell'appaltatore.** Il compenso richiesto netto veniva salvato come rata lorda dello stesso importo. Aliquota esplicita e saldo calcolato sul totale con IVA; arrotondamento ai centesimi. Nessuna modifica retroattiva alle commesse precedenti.
3. **Successo annunciato con rate non salvate.** Un errore delle rate era ignorato. Ora il salvataggio restituisce errore, mantiene gli UUID del tentativo e permette di completare lo stesso lavoro e le stesse rate. Campi bloccati e avviso di ripresa durante il tentativo. La ripresa vale nella pagina aperta; una transazione server unica resta da realizzare.
4. **Stato iniziale dell'appaltatore assente.** Viene scelto lo stato iniziale aziendale e viene salvato il relativo evento storico. O-0077 ha stato e storico corretti. O-0076, creata prima della correzione, rimane evidenza del problema precedente: non è stata riscritta per nasconderlo.
5. **Riepiloghi incassi non aggiornati.** Cambio rata e registrazione in prima nota aggiornano anche quadro pagamenti, cassa e viste consolidate. Gestita correttamente la risposta strutturata 23505 in caso di registrazione concorrente già presente.
6. **Scorporo IVA proposto su movimenti netti delle unità.** La bozza ora aggiunge inizialmente l'IVA, coerentemente con la base netta dichiarata in Unità. Lo scorporo resta una scelta esplicita. Provato sul saldo netto da 220.000 €.
7. **Pagamenti oltre il residuo e date future nel form unità.** Il form non permetteva di distinguere il residuo già azzerato; ora blocca importi eccedenti, data assente e incassi datati nel futuro. Il vincolo concorrente server resta una priorità distinta.
8. **Tetto a misura perso dopo la composizione del rendiconto.** Il pannello sommava solo righe ancora da rendicontare: quelle già in SAL sparivano dal totale usato per il tetto. Ora usa il totale dell'intera commessa, incluse le righe in SAL/fatturate e le bozze esplicitamente considerate nel controllo.
9. **Periodo del rendiconto non aggiornato dopo conferma righe.** L'invalidazione limitata alla sola query del lavoro lasciava vecchio l'elenco delle righe in attesa del committente. Aggiornato l'intero gruppo di query. Uniformati i testi: una bozza non viene descritta come già congelata.
10. **Collegamenti fiscali irraggiungibili con modalità esterna.** I link ai documenti dei rendiconti portano al dettaglio consultabile; Modifica e le azioni che aprirebbero l'editor richiedono la modalità nativa, con spiegazione e collegamento alle impostazioni. Nessuna modalità aziendale cambiata automaticamente.
11. **Previsionale con flag pagato nullo.** Rate fornitore e garanzie di fatture aperte includono anche costi con `is_paid` nullo, coerentemente con il caricamento dei costi aperti. Conservata la distinzione tra residuo corrente e ritenuta futura.

## Problemi rilevati nell'audit iniziale

Le tre P1 seguenti descrivono la situazione iniziale: sono risolte nell'aggiornamento conclusivo. Lo stato delle P2 è aggiornato nelle sezioni successive.

### P1 — Incassi delle unità e contabilità non sono ancora un flusso unico

Evidenza concreta: su R1/O-0073 ci sono 240.000 € netti di movimenti registrati, ma zero righe di prima nota. La bozza fiscale da 242.000 € risulta non incassata. Gli RPC `commessa_quadro_pagamenti`, `cruscotto_rate_da_incassare` e `cruscotto_rate_incassi` non leggono direttamente i movimenti delle unità. Le precedenti prove Aurora erano state allineate con dati dimostrativi espliciti: non dimostravano questa automazione nativa.

Serve un collegamento persistente tra movimento unità, incasso, rata/fattura ed eventuale transazione bancaria, con chiave idempotente. La base netta, l'IVA e l'eventuale permuta vanno conservate separatamente. Il collegamento a una fattura successiva deve riutilizzare l'incasso, non registrarne un secondo. Anche lo storno deve propagarsi. Non è affidabile deduplicare soltanto confrontando importo e data.

Accettazione: caparra/acconto/saldo con e senza fattura iniziale, IVA diversa, permuta senza cassa, pagamento parziale, seconda fattura, collegamento bancario, storno e due finestre concorrenti; una sola entrata effettiva per movimento. Verifica su unità, generale, prima nota, scadenzario, previsionale e rendiconto storico.

### P1 — La stima a misura entra ancora nell'elenco come credito

O-0077 nasce correttamente senza rate; l'elenco però presenta 1.220 € come da incassare ricavandoli dalla stima da 1.000 € più IVA. Non è un credito già maturato o fatturato. Correggere insieme `orderUtils`, i riepiloghi annuali, la pipeline e gli RPC delle scadenze: l'importo stimato rimane una previsione, mentre il credito deve derivare dai rendiconti/fatture effettivi. Non basta cambiare l'etichetta della singola riga.

### P1 — Portare i controlli concorrenti anche nel backend

L'RPC condiviso `generale_piano_approva` non contiene ancora il controllo del marcatore DA_STIMARE; il blocco locale è attivo ma un altro client può aggirarlo. La proposta di migrazione per la completezza del budget resta nel repository, non installata. Anche il massimo incassabile delle unità deve essere verificato sotto lock server, includendo varianti/permute e richieste concorrenti. Migrare inoltre le note delle voci iniziali dentro la stessa transazione di creazione.

### P2 — Salvataggio appaltatore realmente atomico e recuperabile dopo riapertura

Il nuovo retry evita duplicati nella pagina corrente, ma ordine, rate e storico sono tuttora richieste distinte. Un ricaricamento dopo un errore intermedio può perdere il contesto della ripresa. Serve RPC transazionale con identificativo richiesta, autorizzazioni aziendali e recupero dell'esito; l'RPC standard attuale non salva i campi specifici appaltatore.

### P2 — Chiusura e UX di completamento

- Distinguere chiusura operativa e chiusura economica della generale. Mostrare un riepilogo finale di costi, saldi, ritenute, documenti e movimenti ancora da riconciliare; una ritenuta futura non va presentata come insoluto corrente.
- Rendere esplicito quando un cambio stato invia una notifica. Separare l'aggiornamento interno dall'eventuale comunicazione evita invii involontari durante registrazioni amministrative e prove.
- Nel lavoro appaltatore, mostrare ragione sociale e referente separatamente: la scheda della commessa si presenta ancora come “Marco Rossi”, mentre il contratto è di Edil Costruzioni Rossi S.r.l.
- Le impostazioni di fatturazione devono essere un prerequisito visibile prima di arrivare all'editor. Con modalità esterna serve un percorso completo di importazione/abbinamento dei documenti, anche per i rendiconti appaltatore.
- I mesi proposti dai modelli e gli zeri esplicitamente confermati devono restare distinguibili dalle assunzioni non ancora verificate. Correzione degli importi mancanti completata; revisione guidata delle assunzioni temporali ancora migliorabile.
- La pagina cliente resta più estesa e ha una gerarchia diversa dalla generale: unificare soprattutto il significato di “incassato”, “in prima nota”, “previsto” e “fatturato”, conservando una navigazione stabile.

### Integrazioni non collaudate dal vivo

SDI, firma elettronica, banca collegata, contatti e notifiche reali non sono stati attivati. Demo usa modalità di fatturazione esterna e il portale mostra abbonamento sospeso per diversi servizi. Documenti e profili usati sono facsimile: il completamento fiscale richiede una configurazione e anagrafiche effettive. Nessuna emissione fiscale o trasferimento reale è stato eseguito.

## Validazione e limiti

- **107 file, 1.539 test automatici superati**, incluse le regressioni dei problemi nuovi. Log e lista dei test negli output dell'audit.
- TypeScript del perimetro commesse, creazione appaltatore, dettaglio ordine e documento fiscale superato: `tsconfig.audit-commesse.json`.
- `git diff --check` superato; nessun commit, push o deploy.
- Localhost risponde HTTP 200; servizio macOS persistente conservato attivo.
- Verifica visiva sul browser a larghezza effettiva circa 1.280 px. Il tentativo di override mobile non ha cambiato la larghezza effettiva: il mobile non è dichiarato collaudato in questa sessione. L'override è stato ripristinato.
- La verifica non copre ogni combinazione di permessi, note di credito, annullamenti, resi e concorrenza nel backend condiviso. Questi casi vanno inclusi nell'accettazione delle integrazioni P1, non dedotti dal numero dei test offline.

## Evidenze locali

Cartella `outputs/simulazioni-commesse` del lavoro Codex:

- `audit-tipologie-dati.json`: nuovi casi, unità, rate, prima nota, stati e stime mancanti persistite.
- `audit-tipologie-integrazioni.json`: bozza del saldo, rendiconto a misura e controllo server ancora assente.
- `audit-budget-tipico-prima.json`: backup dei segnaposto della sola O-0079 prima della riparazione.
- `audit-tipologie-test.log`, `audit-tipologie-test-files.json`, `audit-tipologie-typescript.log`.
- `audit-budget-incompleto.jpg`: approvazione bloccata, margini sospesi e sei stime mancanti.

Il piano principale conserva le evidenze precedenti di forniture, DDT, SAL passivi, banca manuale, documenti e rendiconti storici scaricati. Questo audit corregge esplicitamente la precedente interpretazione troppo ampia di quelle prove: i dati dimostrativi allineati non equivalgono a un'integrazione automatica completa.

## Aggiornamento conclusivo — tre priorità e popup

Applicate al progetto Supabase collegato a localhost, dopo backup delle definizioni e prove isolate, le migrazioni `commesse_incassi_crediti_budget`, `commesse_cassa_unita_coerenza` e `commesse_quadro_cassa_unita`. Le copie SQL sono in `supabase/proposals/20261111162503_*`, `20261111165729_*`, `20261111171123_*`: questa collocazione conserva l'ordinamento del repository, le cui migrazioni native hanno timestamp 2028. Le tre nuove definizioni sono effettivamente installate; non sono soltanto proposte grafiche. RLS e guardie fiscali preesistenti restano attive.

- **Incassi unità / prima nota:** quota netta del prezzo e cassa effettiva separate. Registrazione transazionale, riferimento richiesta univoco, replay idempotente, vincolo di un solo collegamento, residuo verificato sotto lock dell'unità. Caparra, acconto e saldo generano la prima nota; la permuta non genera cassa. Storno con originale e contropartita conservati, propagazione alla fattura e alle scadenze native. Anche lo storno inserito dalla prima nota aggiorna l'origine. Il collegamento della fattura successiva riusa il versamento; la bozza non crea una seconda entrata. Quadro unità e previsionale leggono la prima nota; le permute riducono la copertura ancora da ricevere senza diventare incassi.
- **Storico:** nessun abbinamento globale per somiglianza di importo/data. Il nuovo comando richiede cassa confermata e scelta esplicita tra prima nota esistente e nuova entrata. In Aurora riutilizzate le due righe già riconciliate da 33.000 e 110.000 euro, senza modificarne i riferimenti bancari. Su R1/O-0073 confermati importi esclusivamente dimostrativi da 22.000 e 242.000 euro. Il documento del saldo resta una bozza fiscale, senza nuovo movimento nativo di cassa.
- **A misura:** elenco, aggregati, quadro pagamenti e previsionale usano documenti emessi, pagamenti parziali e note di credito; la stima e i SAL in bozza non diventano crediti. Il dettaglio indirizza ai documenti e al rendiconto, senza proporre un piano rate ricavato dalla stima. Per O-0077 creati facsimili di storico importato, marcati `xml_import`: 610 euro fattura, 61 nota di credito, 100 incasso in prima nota, residuo 449 euro. Verificata l'esclusione delle automazioni di invio per questa origine prima della prova. Nessun invio a clienti.
- **Budget backend:** trigger di completezza anche sulle approvazioni dirette, blocco delle voci non stimate e dei calendari mancanti, valori finiti e non negativi, serializzazione con creazione/revisione/approvazione. Il marcatore di stima e la nota iniziale sono salvati nella transazione nativa. Conservato il controllo sulle versioni approvate. Vincolo sulla provenienza delle righe importate e controllo aziendale delle righe ordine nelle fatture ricevute installati.

Prova autenticata in Demo: prenotazione con caparra, acconto ripetuto, richiesta riutilizzata con dati differenti, sovrapagamento, data futura e ordine non accessibile. Due incassi simultanei da 200.000 euro sullo stesso residuo: uno solo accettato, poi stornato due volte senza doppia contropartita. Prova aggiuntiva dal modulo reale: 50 euro netti / 55 cassa, salvataggio e storno riusciti. Stato finale O-0084: tre movimenti attivi (100 caparra, 1.000 acconto, 10 permuta), due movimenti stornati conservati; cassa effettiva 1.210 euro. O-0075 standard conserva la sua sola prima nota originaria. O-0079 incompleto rimane in bozza: RPC respinta per budget incompleto, aggiornamento diretto negato dai permessi di tabella.

**Popup:** corretto il difetto della griglia che lasciava i figli più larghi della finestra e faceva scorrere il contenuto a sinistra al cambio scheda. Dialog dell'unità e spazi di lavoro fino a 1.280 px, moduli fino a 960 px, conferme 640 px, sempre limitati alla finestra. Impostazione applicata a 26 popup della generale e ai dialog operativi contestuali. Schede interne a capo, descrizioni non troncate, testi e campi più grandi. Verificati Dati, Scheda vendita, Margine, Pagamenti e il modulo delle fonti senza overflow orizzontale; controllo alla larghezza di 1.541 px dello screenshot utente. Il test mobile incontra il preesistente avviso di abbonamento sospeso: non è dichiarato un collaudo mobile completo. Override del viewport ripristinato.

Validazione: 112 file / 1.564 test di regressione frontend e logica, più 12 prove del database isolato (113 file / 1.576 test complessivi). TypeScript del perimetro commesse e `git diff --check` superati. Advisor Supabase: nessuna nuova segnalazione di sicurezza o performance rispetto alla base; health senza segnalazioni. Localhost risponde HTTP 200 e il servizio macOS persistente è attivo.

Evidenze: `priorita-demo-esito.txt`, `priorita-demo-audit-finale.json`, `priorita-regressione.log`, `priorita-database.log`, `priorita-typescript.log`, `popup-unita-1541.png` nella cartella di output delle simulazioni. Il pannello temporaneo Demo è stato rimosso dal sorgente; copia conservata fra gli artefatti.

La propagazione della fattura nativa emessa e dello storno è collaudata sul database isolato con i trigger reali di aggiornamento del documento. In Demo, configurata per fatturazione esterna, sono verificati bozze, storico importato e prima nota; non è stata forzata una diversa configurazione fiscale. Restano aperte le P2 già elencate e le integrazioni reali SDI/firma/banca: non sono incluse nelle tre priorità concluse.

## Popup operativi — verifica dei salvataggi in Demo

Ordini, DDT, fatture, pagamenti e relativi collegamenti usano ora finestre fino a 1.280 px, moduli fino a 960 px e contenuto scorrevole separato dalla barra delle azioni. I dettagli ordine si modificano in una finestra dedicata: il precedente modulo dentro la scheda poteva lasciare Salva fuori schermo. Descrizioni DDT e costi multilinea, intestazioni delle tabelle da 13 px, menu a capo senza abbreviazioni. Verificate viewport 2.103 × 1.210 e 1.541 × 1.000; nessun overflow orizzontale del contenitore. Scadenze XML etichettate come condizioni del documento, distinte dai versamenti effettivi.

Prova nativa con sessione reale su O-0083, Demo Azienda S.r.l.:

| Salvataggio | Risultato persistito |
| --- | --- |
| Nuovo ordine e modifica dettagli | ODA-2026-0040, tre descrizioni estese, 40 € netti e 8,80 € IVA. Condizioni, istruzioni e note interne rilette dopo salvataggio. |
| Arrivo parziale e nuovo DDT | DEMO-POPUP-PARZ-01: 4 pezzi. DEMO-POPUP-SALDO-02: 13 pezzi. Ricevuti 10/10, 5/5 e 2/2 sulle righe ordine. Note DDT modificate e rilette. |
| Importazione e note fattura | XML facsimile DEMO-POPUP-FT01 da 48,80 €, collegato automaticamente allo stesso ordine e ai due DDT. Nessuna emissione SDI. |
| Acconto e saldo | Due uscite in prima nota: 20 € e 28,80 €. Residuo intermedio 28,80 €, finale zero. Importo eccedente bloccato nel modulo. |
| Costo diretto senza ordine | Bollo dimostrativo da 2 €, descrizione e note estese; resta da pagare e distinto dal costo dell’ordine. |

L’ordine conserva **un solo costo imponibile da 40 €**, riutilizzato dalla fattura e dai due pagamenti. Il quadro generale mostra 48,80 € pagati e 2 € da pagare per il solo bollo. La scadenza XML 11/12/2026 è riportata nel `due_date` del costo; non è stata creata una seconda scadenza indipendente. Riferimenti e note dei dati nuovi sono marcati DEMO POPUP. Nessun invio o trasferimento reale.

Corretti durante la prova anche l’uscita involontaria dalla generale dopo la creazione di un DDT dentro il popup ordine e il riutilizzo del riferimento del pagamento precedente. Copertura funzionale per entrambi i casi. I controlli sulle tre priorità P1 precedenti restano verdi. Validazione: **122 file / 1.626 test**, più **12 test database isolati**, controllo TypeScript del perimetro popup e `git diff --check`; verifica mirata delle ultime modifiche: 31 test superati. La grafica è collaudata nel browser, senza test che replichino le classi CSS.

Evidenze in `outputs/simulazioni-commesse`: `popup-operativi-demo-audit.json`, `popup-operativi-regressione.log`, `popup-operativi-database.log`, `popup-operativi-typescript.log`, `popup-operativi-ultime-modifiche.log` e schermate `popup-*.png`. Le varianti fiscali native, le riconciliazioni bancarie reali e le P2 sopra restano distinte da questa verifica dei popup. Localhost risponde HTTP 200 ed è mantenuto dal LaunchAgent già attivo.

## Riuso delle schermate esistenti

Verifica richiesta dopo la segnalazione di possibili schermate ricreate. La mappa Graphify disponibile copre la logica delle generali e non comprende i popup operativi; le conclusioni seguenti sono verificate sugli import e sui componenti attuali.

| Area nella generale | Componente già condiviso con il portale |
| --- | --- |
| Ordini di acquisto | `LinkedPurchaseOrdersCard`, `NuovoOdaCommessaDialog`, pagina `PurchaseOrderDetail` aperta da `DocumentiInPopup` |
| DDT | `OrderBolleDdtCard`, `NewDDTDialog`, pagina `DDTRicezioneDetail` |
| Fatture ricevute | `OrderFattureFornitoriCard`, `RiepilogoFatturaRicevuta` |
| Costi diretti | `OrderCostiCommessaCard` |
| Pagamenti | `UsciteCommessa`, `PurchasePaymentsDialog` con `OdaAccountingCard`, `ExpensePaymentDialog` |
| Rapportini, lavorazioni, subappalti | `RapportiniUfficio`, `OrdineRapportiniCampo`, `OrderWorkPhases`, `SubappaltatoriCommessa` |

`CantiereScheda` compone questi moduli passando l’ID della generale o dell’unità scelta. Le schermate operative sopra e i loro salvataggi sono condivisi. Piano economico consolidato, unità/vendite, fonti di finanziamento e controlli tra più documenti restano viste specifiche dell’operazione.

La sovrapposizione eliminata riguarda il contenitore grafico: larghezza, suddivisione testata/corpo/azioni e corpo scorrevole risiedono ora in `components/ui/dialog.tsx` e `dialog-layout.css`, disponibili come opzioni del Dialog già usato dall’applicazione. `DialogContentGenerale` mantiene soltanto la larghezza predefinita per i chiamanti esistenti; `DialogContentOperativo` mantiene solo l’adattamento al contesto e la navigazione dei documenti. I tre moduli che usavano `CorpoDialogOperativo` importano ora il corpo dal Dialog condiviso. Nessuna nuova registrazione Demo necessaria per questo refactoring.

Regressione successiva alla semplificazione: **130 file, 1.687 test superati**, inclusi altri popup del portale e le commesse telefoniche. TypeScript del perimetro popup superato; modulo Dialog e localhost rispondono HTTP 200. Evidenze: `riuso-componenti-test-files.json`, `riuso-componenti-regressione.log`, `riuso-componenti-typescript.log` negli output delle simulazioni. Un primo tentativo dei test è stato interrotto; il conteggio si riferisce alla riesecuzione completata.

Verifica browser completata dopo il ripristino del collegamento: fattura, pagamenti e costo diretto usano tutti la base `dialog-readable` del Dialog condiviso. Sulla viewport disponibile (altezza 720 px), il riepilogo fattura contiene la propria larghezza senza overflow e mantiene le azioni a 666 px; pagamenti da 960 px con azioni a 584 px; modulo costi da 960 px con azioni a 666 px e pulsante submit dentro il form nativo. Consultati i due pagamenti Demo già esistenti; il modulo costo è stato annullato senza nuovi salvataggi.


## Simulazioni estese — creazione, interruzioni e rendicontazione

Prove eseguite nella sola Demo Azienda, con la sessione reale del portale. Questa fase chiude la P2 del salvataggio appaltatore atomico e la separazione fra ragione sociale e referente. Le prove precedenti delle altre tipologie restano quelle documentate sopra; gli ordini già presenti sono stati riletti, non ricreati tutti una seconda volta.

### Correzioni completate

- Il modulo appaltatore usa il motore nativo `create_order_atomic` tramite un ingresso sottile dedicato, non un secondo writer di ordini. Ordine, rate e storico sono una transazione. Il registro interno serializza la richiesta, verifica azienda e autore, recupera lo stesso ID senza riscrivere le modifiche successive. Importi delle rate confrontati con il totale lordo, contratto e committente coerenti, stato iniziale aziendale e date controllate sul server.
- Il tentativo viene conservato prima dell'invio, isolato per azienda, utente e richiesta. Dopo un errore di rete e un ricaricamento si usa «Verifica e completa». Due schede non si sovrascrivono i rispettivi tentativi. Un rifiuto SQL esplicito conferma il rollback e permette di correggere i campi; un esito incerto conserva il recupero. Doppio submit protetto anche prima del rendering dello stato di caricamento.
- In creazione si pianificano le scadenze. Non si può dichiarare una rata pagata senza prima nota; il flusso nativo di incasso resta nel dettaglio, con conferma esplicita della registrazione contabile. Le rate ordinarie mantengono questa conferma separata: non è stata trasformata in una registrazione automatica.
- Il parser di validazione condivide la normalizzazione esistente, ma distingue testo errato, assenza e zero. Importi, acconti, tetto, quantità, prezzi e costo interno non perdono l'errore al blur. Invio da tastiera usa l'acconto appena digitato. Uno zero esplicito del costo rimane zero; un costo sconosciuto rimane nullo. Passando a corpo, il tetto a misura nascosto non blocca il modulo e non viene salvato.
- Ragione sociale e referente separati nella testata e nel riquadro committente condivisi. La ricerca trova sia l'impresa sia il referente. I dialog nativi di riga, prezzo di cantiere, composizione e collegamento rendiconto usano le opzioni del Dialog comune: nessuna nuova schermata operativa duplicata.

Installate `commesse_creazione_appaltatore_atomica` e `commesse_creazione_riferimenti_indici`. SQL conservato in `supabase/proposals/20261111183829_*` e `20261111191824_*`; definizione nativa precedente salvata in `work/simulazioni-backend`. Nessun dato storico migrato automaticamente. Registro in schema `private`, RLS attiva e nessun accesso diretto per anon/authenticated; ingresso dedicato SECURITY INVOKER e invocazione anon negata.

### Prove effettive nel portale

| Caso | Esito persistito |
| --- | --- |
| A corpo dal modulo nativo | O-0086, `180947e5-e639-469a-8806-bfb6a4620c91`: 1.234,56 € netti, tre rate da 200,50 / 300,25 / 1.005,41 €, totale lordo 1.506,16 €. Uno storico, nessuna rata già pagata. |
| Due richieste simultanee reali | `68938a2f-3c8e-4c7d-a574-ca3de637c596`: entrambe le risposte indicano lo stesso ID; una commessa, due rate e uno storico. Richiesta ripetuta con importo diverso respinta. |
| Dati incoerenti | Rifiutati: rate nette anziché lorde, totale negativo, misura senza contratto, rata pagata senza prima nota. Zero commesse residue con il marcatore RIFIUTATO. |
| Risposta ignorata e ricaricamento | `7d2f3ebb-2193-43a2-85f0-7fb21ef68788`: prova controllata, il server completa ma il chiamante conserva il tentativo. Il modulo ricaricato recupera esattamente lo stesso ID. Non è dichiarata una caduta fisica della rete. |
| Incasso nativo dopo il recupero | Rata da 146,40 € dichiarata incassata, poi comando «Registra in Prima Nota»: una sola entrata da 146,40 €, nessun trasferimento bancario. |
| A misura dal modulo nativo | O-0087, `79a56491-91db-432b-99c9-c96cd364679a`: stima 2.500,75 €, tetto 3.000 €, date 11/11–20/12. Date invertite bloccate nel form. Zero rate, zero prima nota, quadro crediti zero prima dell'emissione. |
| Lavorazione, costo e margine | Riga `cf001949-3c91-4d63-b5b7-877496b13a82`: 2 giornate × 250 € = 500 €, costo totale 240 €, margine 260 € / 52%. Bozza distinta da riga confermata. Testo «abc» nel costo resta visibile e impedisce Salva. |
| Composizione, PDF e annullamento | Una sola riga nel rendiconto n. 2 in bozza, 500 €. PDF nativo scaricato e testo verificato (una pagina, BOZZA, importo 500 €). Annullata la sola bozza di prova: nessun SAL residuo, stessa riga confermata di nuovo disponibile, costo e margine conservati. Nessuna fattura o entrata generata. |

I due casi del pannello tecnico sono identificati dalla descrizione DEMO SIM e dagli UUID, senza codice commessa: il pannello non ha chiesto un codice al server. I due casi creati dal modulo nativo hanno O-0086 e O-0087. Il pannello temporaneo è stato rimosso dal sorgente; copia negli artefatti.

Riletti anche il costo della fornitura ODA-2026-0040 (sempre un solo costo da 40 €) e il budget incompleto (sempre bozza). Il controllo finale contiene dodici casi già persistiti e tredici verifiche mirate, tutte vere. Le somme di prima nota nel JSON sono per il singolo ID ordine, non il consolidato di una generale con tutte le unità.

### Copertura e limiti aggiornati

- Regressione: 135 file / 1.768 test superati. Database isolato: altri 2 file / 33 test. Dopo l'ultima correzione sul cambio a misura → a corpo, 74 test mirati del modulo e dei parser superati. Il database isolato esercita la definizione nativa effettiva; i servizi attorno al magazzino sono ridotti nella fixture e non equivalgono a un secondo collaudo dal vivo del magazzino. La concorrenza è verificata anche con due RPC contemporanee sul backend reale.
- TypeScript `tsconfig.audit-commesse.json` e `git diff --check` superati. Nessun commit, push o deploy del portale.
- Dialog riga: larghezza 958 px, nessun overflow orizzontale, barra azioni a 666 px nella finestra alta 720 px. Screenshot salvato.
- Advisor: guardie della nuova API verificate. Resta l'INFO intenzionale RLS senza policy sul registro privato che deve essere inaccessibile al client. Aggiunti gli indici dei due riferimenti; gli advisor li segnalano inizialmente come non utilizzati, non più come FK senza indice. Segnalazioni pregresse del progetto non dichiarate risolte. Health senza segnalazioni.
- Localhost HTTP 200; LaunchAgent persistente in esecuzione con riavvio automatico. Il pannello di test non è incluso nel sorgente finale.

Restano aperti: chiusura operativa/economica guidata con saldi e ritenute; scelta esplicita della comunicazione nel cambio stato; verifica guidata delle ipotesi temporali del business plan; completamento del collegamento fra rendiconto appaltatore e fattura emessa da gestionale esterno. Quest'ultimo è un limite applicativo verificato, distinto dai prerequisiti di un'integrazione reale: il collegamento attuale del SAL legge i documenti fiscali nativi, mentre l'importazione XML delle emesse usa il registro esterno. Non è stato finto un collegamento completo tramite duplicazione della fattura. SDI, firme e banca collegata restano non collaudati dal vivo.

Evidenze in `outputs/simulazioni-commesse`: `simulazioni-estese-demo-audit.json`, `simulazioni-estese-demo-esito.json`, `simulazioni-estese-advisor.json`, log `simulazioni-estese-*`, copia del pannello, `Rendiconto-DEMO-SIM-misura.pdf` e testo estratto, screenshot `simulazioni-estese-verifica.png` e `simulazioni-estese-rendiconto-popup.png`.


## Audit delle importazioni durante la creazione — 11 novembre 2026

Richiesta: verificare contratti, lettura AI e importazioni nelle diverse tipologie, lavorando sul portale localhost e sui componenti esistenti. Prove con dati sintetici nella sola Demo Azienda S.r.l.; nessun deploy o migrazione remota in questa fase.

### Copertura effettiva per tipo

| Tipo | Ingresso disponibile | Esito e limite verificato |
| --- | --- | --- |
| Commessa cliente | Preventivo e Carica contratto (AI) | Lettura AI reale, applicazione al form, blocco di rate incomplete, correzione esplicita e salvataggio Demo verificati. Originale allegato privato; nessuna firma o incasso creato. |
| Lavoro per appaltatore a corpo | Scelta committente e contratto/listino esistente | Il modulo nativo non offre l'importazione AI del documento in creazione. Il lettore condiviso legge il facsimile a corpo, ma manca l'adattatore verso questo modulo: non va salvato come commessa cliente per simulare il collegamento. |
| Lavoro per appaltatore a misura | Contratto/listino esistente, stima e tetto | Nessuna importazione AI nativa in creazione. Verificata la separazione della stima dalle rate nel form. Un documento letto dall'AI non deve generare scadenze sulla stima. |
| Generale appalto | Creazione → Piano economico → Excel o incolla | O-0088 creata dall'ingresso nativo Excel. Incompatibilità OOXML corretta; salvataggio dal portale verificato: quattro voci, costi 90.000 €, ricavi 150.000 €, originale conservato e doppione respinto. L'importazione AI del contratto verso Contratto e SAL non è collegata alla creazione. |
| Generale sviluppo | Creazione → business plan Excel | File → scenario → anteprima → conferma collaudati con il lettore reale e il componente condiviso. Costi 370.000 €, ricavi 500.000 €, imprevisti mancanti conservati come DA_STIMARE; nessun costo attribuito forzatamente alle unità e nessun mese inventato. Salvataggio nativo O-0089 verificato con sei voci e originale privato; approvazione bloccata finché mancano stima e calendario. Import PDF/AI del piano non presente. |
| Generale compra, ristruttura, vendi | Creazione → business plan Excel | Stessa simulazione: costi 230.000 €, ricavi 300.000 €, calendario da completare. Salvataggio nativo O-0090 verificato con quattro voci e originale privato. Import PDF/AI del piano non presente. |
| Valuta un'operazione | Simulatore manuale → trasformazione in generale | Non è presente un ingresso file/AI per l'ipotesi. La trasformazione nativa già collaudata non dimostra un'importazione automatica del business plan. |

Il collegamento di Importa documento intelligente per un contratto porta ancora alla creazione Cliente. Per supportare le altre destinazioni serve la scelta del modello con lo stesso selettore esistente, mantenendo file, analisi e provenienza; non un'altra pagina di creazione.

### Errori riprodotti e corretti in locale

1. **Rate percentuali al netto anziché con IVA.** Caso 1.000 € + IVA 10%, 30/70%: prima 300/700 €, ora 330/770 €. Scorporo e aliquota derivata dai due totali coerenti; con IVA sconosciuta nessuna rata percentuale inventata. Il solo totale lordo senza aliquota non diventa imponibile.
2. **Lettura parziale delle rate accettabile in salvataggio.** Il modello reale ha restituito una sola fase da 770 €, perdendo la fase da 330 € in un oggetto con chiavi ripetute. L'anteprima segnalava il problema ma non impediva la creazione. Ora il modulo e la mutation controllano gli importi effettivamente da salvare al centesimo, senza sostituire il saldo dichiarato con un residuo inventato. Provato il rifiuto reale prima del completamento manuale.
3. **Documento non firmato trasformato in contratto firmato.** L'RPC esistente valorizza la firma anche con data nulla; il client gli passava la data del documento. Ora è chiamato soltanto dopo una verifica esplicita dell'utente e una data di firma reale, valida e non futura. La conferma viaggia nella bozza; le vecchie bozze senza conferma restano non verificate. Il file non confermato rimane allegato. Dopo la lettura è richiesto anche uno stato iniziale esplicito se l'azienda non ha uno stato di verifica.
4. **RTI con ruolo “Mandante” maiuscolo.** La risposta reale riportava 500.000 € complessivi e 100.000 € di quota, ma il confronto esatto con “mandante” falliva. Ruolo normalizzato; con appalto pubblico e ruolo non univoco il totale RTI non precompila importo, rate, cliente di fatturazione o materiali. Il form RTI dopo la correzione rimane con importo, IVA, rate e stato da confermare. Le note testuali di conferma vengono conservate anche quando l'AI restituisce una stringa anziché una lista.
5. **Campi pubblici mancanti nel prompt.** Aggiunto il contesto aziendale e i nomi dei campi RTI alla richiesta del client. Nel sorgente locale dell'estrattore è preparato anche lo schema completo. La funzione remota letta era la versione 96: non è stata distribuita una nuova versione. Le letture reali RTI dimostrano il contesto inviato dal client, non un deploy del nuovo schema.
6. **Prezzi del contratto sostituiti dal listino.** I prezzi positivi letti nel contratto ora prevalgono sul listino corrente; aliquota delle righe coerente con quella del contratto. Il listino resta disponibile per completare le informazioni mancanti.
7. **Originale perso nel percorso Silvio.** Se il recupero fallisce, non si applicano dati privi dell'allegato. Un originale proveniente da un altro bucket viene conservato nel bucket dei contratti, in un percorso dell'azienda con impronta del contenuto, prima di passare il riferimento al modulo. File vuoti ed estrazioni prive di dati utili vengono rifiutati. Durante l'analisi non si può sostituire il file.
8. **Excel OOXML valido rifiutato.** Riprodotto con un file standard che usa prefissi XML: errore interno sui fogli. Il lettore condiviso normalizza soltanto la copia di lettura con le API XML, preservando testi, valori e risultati delle formule. Originale e impronta restano invariati; macro e formule non vengono eseguite. Errori di file danneggiati resi comprensibili.
9. **Sezione RICAVI letta come costi.** “RICAVI” senza importo è ora una sezione; la riga numerica omonima dei vecchi modelli resta esclusa come riepilogo. Il caso dimostrativo riconcilia correttamente Appalto 90.000/150.000 €, Sviluppo 370.000/500.000 €, Compravendita 230.000/300.000 € (costi/ricavi).
10. **UX del controllo e della bozza.** Il popup riusa il Dialog condiviso grande con corpo scorrevole e azioni separate. Il riepilogo delle rate mostra lo stesso saldo dichiarato del dettaglio. Corretto il ripristino del codice proposto dopo la cancellazione della bozza. La rifinitura del popup e il ripristino del codice sono stati poi verificati nel browser ripristinato, come riportato nella ripresa finale.

### Evidenze salvate

- `5e3bfe8c-9deb-46d4-a96d-520960aad7b7`: **[DEMO IMPORT 11/11] Cliente - contratto non firmato**. Imponibile 1.000 €, IVA 10%, due rate non pagate 330/770 €, un PDF privato, `quote_id` nullo. La prima creazione ha conservato lo stato aziendale predefinito; il record non è stato riscritto per nascondere il comportamento precedente alla successiva richiesta di conferma dello stato.
- `86469467-f8ee-4c1a-927a-1d043ead5be1`, **O-0088**: al primo passaggio, generale Appalto nata dall'opzione Excel con zero unità/ordini di lavoro e zero versioni del piano (piano poi importato nella ripresa documentata sotto). La lettura si era fermata prima dell'inserimento delle voci; nessun budget o costo fittizio scritto per aggirare il problema.
- Tre nuovi PDF dimostrativi leggibili e un XLSX con tre fogli appropriati ai modelli, prodotti e controllati visivamente. Nel repository è conservato soltanto il piccolo XLSX sintetico necessario al test ripetibile; i documenti aziendali originali restano fuori dal repository.
- Il corpus privato dei tre Excel forniti conserva nove scenari separati e supera nuovamente la riconciliazione dei dettagli, dei riepiloghi, dell'IVA e degli oneri finanziari.

Regressione finale: **148 file / 1.957 test superati**, più la prova del corpus privato sui tre file/nove scenari; TypeScript del perimetro commesse superato. Verificati anche archiviazione dell'originale prima delle voci, rifiuto dello scenario duplicato, stima mancante e calendario incompleto nelle prove del componente/hook. Questi controlli automatici non vengono descritti come nuovi salvataggi live.

Artefatti nella cartella di lavoro principale `outputs/simulazioni-commesse/import-audit/`: `esiti.json`, `regressione-finale.log`, `test-files.json`, `cliente-importato-salvato.png`, `rti-senza-ricavo-automatico.png`, PDF e workbook sintetici di prova.

### Interruzione del browser durante il primo passaggio (risolta)

Durante la prova Excel è venuto meno il collegamento al browser IAB. L'inventario non espone più browser e la riapertura dell'IAB non è disponibile. Richiesto il ripristino della scheda all'utente; nessun accesso alla sessione è stato simulato. Localhost continua a rispondere HTTP 200 con servizio automatico attivo.

Al momento dell’interruzione restavano da completare nel portale: rilettura del file corretto e salvataggio del piano O-0088; creazione/import/salvataggio nei due modelli immobiliari; caricamento ripetuto dello stesso scenario con verifica persistita senza doppioni; ultimo controllo visivo del popup e del codice dopo cancellazione della bozza. Sono stati successivamente completati nella ripresa descritta sotto.

Per completare le integrazioni mancanti, riusare il lettore e l'anteprima esistenti con un adattatore per destinazione: committente/listino e corpo/misura per appaltatore; dati contrattuali, quote RTI, CIG/CUP, anticipazioni, ritenute e SAL nella generale appalto; importazione del piano nella bozza e, separatamente, nell'ipotesi del simulatore. Non far passare automaticamente tutti i contratti per una commessa cliente.


### Ripresa nel portale completata — 11 novembre 2026

La scheda localhost è stata ripristinata dall’utente. Le prove sopra indicate come residue sono state completate dal portale autenticato in Demo; non attraverso scritture SQL. Le query seguenti hanno soltanto verificato la persistenza.

| Commessa | Voci | Costi valorizzati | Ricavi | Originali Excel | Completezza |
| --- | ---: | ---: | ---: | ---: | --- |
| O-0088 Appalto (`86469467-f8ee-4c1a-927a-1d043ead5be1`) | 4 | 90.000 € | 150.000 € | 1 | Quattro mesi mancanti, approvazione bloccata |
| O-0089 Sviluppo (`59c19dac-e1a9-4a12-88db-2a5863d7cbd9`) | 6 | 370.000 € | 500.000 € | 1 | Imprevisti DA_STIMARE e sei mesi mancanti; margine non presentato come completo |
| O-0090 Compravendita (`a8e7262d-23a4-4ab4-b40d-2d02f016b6ce`) | 4 | 230.000 € | 300.000 € | 1 | Quattro mesi mancanti, approvazione bloccata |

Ripetuto file/scenario Appalto: messaggio «già importati nella versione», conteggio invariato a quattro voci e un originale. Corretta un’ulteriore classificazione: il ricavo “Contratto appalto” ora conserva la categoria riconosciuta “Lavori a contratto”, anche nell’anteprima; allineata dal selettore nativo la voce Demo già salvata.

Prove documentali aggiuntive:

- PDF e immagine caricati insieme dall’archivio della O-0090, persistiti dopo ricaricamento pagina e rimasti interni. Download di PDF, PNG e originale XLSX completati; dimensioni e SHA-256 identici ai tre file di partenza.
- Facsimile non vincolante `DEMO-atto-acquisto.pdf` caricato dalla voce Atto di acquisto: un allegato privato e un collegamento `atto_acquisto`; checklist aggiornata da 0/3 a 1/3 presenti e da tre a due mancanti. Il file è visibile anche nell’archivio.
- PDF vuoto ed estensione `.exe` esclusi prima dell’upload; XLSX danneggiato rifiutato con messaggio leggibile e pulsante di aggiunta disabilitato. Selezionando poi il file valido l’anteprima si riprende correttamente.
- Popup AI controllato visivamente a 1280×720: corpo scorrevole e footer esterno leggibile; firma non selezionata. Applicata e poi cancellata soltanto la bozza di collaudo: il progressivo O-0091 viene nuovamente proposto.
- Lettura AI reale della PNG del contratto cliente: entrambe le fasi 30/70 riconosciute, precompilate correttamente a 330/770 €. Creata dal modulo O-0091 (`b12072b0-afd2-4433-a3fc-780b499319b3`), stato Rilievo Tecnico scelto esplicitamente, imponibile 1.000 €, IVA 10%, rate non pagate, originale PNG privato, `quote_id` nullo. Nessuna firma o movimentazione di cassa. La precedente estrazione PDF resta parziale: il controllo di completezza richiede la correzione, non si considera infallibile l’AI.

Ulteriori correzioni locali: l’indicatore “Pagamenti confermati” usa ora lo stesso controllo di copertura delle rate del salvataggio; il caricamento delle categorie non mostra falsamente “Cartella archiviata”; un errore di preparazione/riduzione di un file viene gestito nella coda, senza lasciarla bloccata. Due prove aggiunte verificano errore parziale, ripresa soltanto del file fallito e rimozione del file invisibile quando l’inserimento dei metadati fallisce.

Regressione dopo queste correzioni: **149 file / 1.959 test superati**, TypeScript del modulo e controllo diff superati. Evidenze aggiornate in `esiti.json`, `persistenza-ripresa.json`, `cliente-immagine-persistito.json`, `regressione-ripresa.log` e `test-files-final.json`. Immagini: `popup-ai-grande-footer-visibile.png`, `checklist-e-archivio-sincronizzati.png`, `sviluppo-importato-budget-incompleto.png`, `doppione-excel-bloccato.png`.

Gli ingressi AI mancanti nella tabella di copertura rimangono tali: appaltatore corpo/misura, contratto della generale appalto, business plan PDF e ipotesi del simulatore. Questa ripresa chiude le prove degli ingressi esistenti, senza descrivere come implementati gli adattatori mancanti. Localhost HTTP 200; LaunchAgent `com.ediliziaincloud.local5173` running, KeepAlive e RunAtLoad attivi. Nessun deploy, migrazione, commit o push.

## Completamento degli import AI — 12 novembre 2026

Gli ingressi indicati come mancanti nell'audit dell'11 novembre sono ora collegati. Si riusano `ContractImportDialog`, il modulo nativo del lavoro per appaltatore, l'editor di Contratto e SAL, `ImportaBusinessPlan` e il simulatore esistente. Nessuna nuova schermata parallela di gestione. File sintetici e salvataggi eseguiti dal portale localhost nella sola Demo Azienda S.r.l.; le query hanno verificato la persistenza senza creare i casi di prova.

| Percorso | Prova nativa finale | Riscontro persistito |
| --- | --- | --- |
| Appaltatore a corpo | O-0099, `419a281d-161a-4c10-b260-587493e7bf37` | 2.000 € netti, IVA 22%, due rate non pagate da 1.220 €, stato Rilievo Tecnico scelto esplicitamente, originale PDF privato e nessun preventivo creato. |
| Appaltatore a misura | O-0093, `651f8efe-7366-49e5-93e3-b8a3ae74c98b` | Stima 4.000 €, tetto 6.000 €, contratto/listino esistente confermato, zero rate. La stima non diventa un credito. |
| Contratto della generale appalto | O-0094, `67fec831-52a9-421e-9e66-e0bc3800e644` | Base 100.000 €, ribasso 10%, sicurezza 5.000 €, valore contrattuale 95.000 €. CIG/CUP, date, split payment, anticipazione 20%, ritenuta 0,5% e penali conservati. Firma e anticipazione incassata assenti. |
| Business plan PDF nella bozza | O-0095, `296c9a7b-f076-4745-8aae-3430e11accee` | Due scenari separati leggibili; selezionato Realistico, sei voci, costi 340.000 €, ricavi 500.000 €, nessun mese mancante, un originale PDF privato. Seconda importazione dello stesso scenario respinta senza doppioni. |
| PDF nel simulatore e trasformazione | Ipotesi `e49baf77-7b38-4a90-b865-2d40570b9ebc` → O-0096, `daaf8d54-9c16-48d3-8c6b-553f7450eca5` | Sei voci 340.000/500.000 €, due unità da 80 m² e 250.000 € ciascuna, tre fonti: mezzi propri 150.000 €, investitore 100.000 € al 30%, mutuo 200.000 € al 4,5% con spese iniziali 2.000 €. Nessun versamento effettivo creato; originale trasferito alla generale. |

### Controlli e problemi risolti durante le prove

- **Stato del lavoro importato.** La prima prova O-0092 usava lo stato predefinito Contratto Firmato. Ora l'import richiede una scelta esplicita dello stato, verificata anche prima della scrittura. Ripetuta la creazione finale O-0099 con Rilievo Tecnico. O-0092 rimane come evidenza storica; il cambio stato che proponeva una notifica al cliente è stato annullato, senza invii.
- **RTI e numeri visibili.** Il lettore riconosce totale del gruppo e quota dell'azienda senza attribuirli automaticamente. Il form generale conservava il vecchio valore visualizzato da `CampoNumero` anche quando la proposta aveva aggiornato lo stato: ora l'applicazione rimonta soltanto il form dei campi. Prova RTI reale: base visibilmente vuota, ribasso zero e salvataggio disabilitato fino alla verifica. Prova annullata senza alterare il contratto O-0094.
- **Nessun evento finanziario implicito.** Data documento, firma, percentuale di anticipazione e impegni delle fonti restano distinti da firma verificata, anticipazione ricevuta e versamenti. L'AI non crea anagrafiche, listini, fatture o incassi. Contratti/listini esistenti e IVA richiedono conferma.
- **PDF e scenari.** Il medesimo lettore condiviso ammette Excel locale e PDF/immagini tramite AI. Scenario, importi, categorie e mesi rimangono modificabili prima della conferma. Totali, margini e saldi di riepilogo non diventano altre righe di costo. Dati mancanti rimangono mancanti; nel simulatore importi e mesi devono essere completati prima di applicare.
- **Parametri del simulatore.** Imposte/notaio, progettazione e imprevisti derivano dalle voci confermate; i mesi delle voci prevalgono su un riepilogo AI incoerente. Verificati imposte 10%, tecnici 10%, imprevisti 5%, vendite da gennaio 2028 per due mesi, senza esempi precompilati aggiunti al documento.
- **Originali e recupero.** Archiviazione privata con impronta SHA-256, tipo MIME ed estensione reali. Il retry del collegamento dopo la creazione recupera lo stesso ordine e non ripete la creazione. Download dell'originale sia dal piano O-0095 sia dai Documenti della O-0096: SHA-256 identico al PDF caricato. La cancellazione di originali condivisi non è stata collaudata in questo intervento.
- **Investitori.** Confermati in pagina tre impegni per 450.000 €, capitale effettivamente versato zero. Margine di budget 160.000 € distinto dall'utile dopo gli oneri del debito stimati: 156.415 € dopo 3.585 €. La panoramica indica «stima dal piano economico», senza suggerire che il margine includa oneri non presenti nel budget.

L'importazione diretta nel Piano economico prepara le voci della bozza, come l'Excel esistente. Per preparare anche unità e fonti si usa lo stesso ingresso nel simulatore e si conferma la trasformazione: questa distinzione è esplicita nell'anteprima. Nessuna trasformazione automatica di qualsiasi contratto in una commessa cliente.

Per rendere disponibili i nuovi dati all'AI è stato aggiornato soltanto l'estrattore connesso `generic-doc-ai-extract`, versione **97**, conservando dipendenze e controlli di accesso della versione 96, incluso `verify_jwt=true`. Nessuna migrazione del database e nessun deploy del frontend, commit o push. Interfaccia sul localhost persistente.

Evidenze nella cartella di lavoro `outputs/simulazioni-commesse/import-ai-12nov/`: `persistenza-demo.json`, `esiti.json`, manifest dei test, log finali, facsimili sintetici e screenshot dei percorsi. Le verifiche fiscali, firme e trasferimenti bancari reali rimangono fuori da questo collaudo degli import.

Verifica finale: **153 file / 1.976 test superati**, TypeScript del perimetro commesse e controllo diff superati. La prima esecuzione ad alta concorrenza aveva prodotto cinque scadenze di test in due file UI: entrambi superano la ripetizione mirata e l'intera regressione con tre worker, senza modificare timeout o codice applicativo per ottenere l'esito. Log autorevole: `regressione-concorrenza-limitata.log`. Localhost HTTP 200; LaunchAgent `com.ediliziaincloud.local5173` running con KeepAlive e RunAtLoad.

## Preparazione del rilascio su main — 12 novembre 2026

Su richiesta esplicita dell'utente, l'intero aggiornamento locale è stato versionato e integrato con gli ultimi commit di main, fino a `6e184af38` incluso. Il merge conserva il nuovo flusso DDT con documento affiancato, la gestione delle consegne parziali, i residui fatturabili nei confronti e i SAL progressivi. I popup della generale mantengono contesto e navigazione senza ripristinare il vecchio wizard DDT.

Verifiche della versione integrata: **185 file / 2.202 test superati**, controllo TypeScript completo con soglia zero superato, build Vite di produzione con service worker superata. Ripetuti separatamente anche i controlli degli ultimi confronti/DDT arrivati da main. Le correzioni aggiuntive riguardano tipi espliciti nelle fixture, opzioni delle query Testing Library e la conversione dei byte Node nel buffer Excel usato dal test; nessuna soglia TypeScript aumentata. La CI include ora le regressioni dei nuovi import AI, della cassa e dei budget.

La prima build locale e una ripetizione dei test erano state interrotte da ENOSPC: eliminata soltanto la build temporanea incompleta del worktree di rilascio; i controlli successivi sono quelli validi. Nessun documento dell'utente rimosso e nessuna interruzione del servizio localhost. La pubblicazione segue l'integrazione Git esistente di Cloudflare Pages e il workflow delle edge function; gli esiti remoti vengono conservati fuori dal repository negli artefatti di rilascio.
