# Allineamento grafico delle commesse generali

Stato: completato nel portale locale. Panoramica, Piano economico, Cantiere, Investitori, Documenti, Unità e Contratto/SAL condividono il disegno approvato. Filtri e collegamenti dai grafici implementati e verificati.

## Riferimenti e direzione della bozza

- [Composio / Awesome Claude Skills](https://github.com/ComposioHQ/awesome-claude-skills), in particolare [Artifacts Builder](https://github.com/ComposioHQ/awesome-claude-skills/blob/master/artifacts-builder/SKILL.md): composizione di interfacce con React e componenti coerenti. Nel gestionale viene conservato il marchio e il carattere tipografico esistente.
- [GitHub / Claude Design](https://github.com/topics/claude-design) e [Awesome Claude Design](https://github.com/VoltAgent/awesome-claude-design): riferimento a sistemi grafici espliciti e riutilizzabili, anziché intervenire su ogni riquadro in modo isolato.
- [Lemo-Opuscar](https://github.com/lemomo-ai/lemo-opuscar): repertorio orientato a filmati costruiti con codice. Per questa bozza è uno spunto per griglia e colore; la realizzazione usa componenti del portale e SVG leggeri. Nessun plugin esterno è stato installato.

Direzione scelta: fondo blu profondo nel riepilogo, accenti arancio per orientamento e titoli, pannelli chiari con bordi morbidi, grafici con legenda leggibile e stati commerciali coerenti con il tabellone.

La prima bozza mantiene i quattro indicatori esistenti per rendere il confronto immediato. Porta i grafici prima della tabella e aggiunge icone e selezione arancio alle schede. Il grafico dei costi permette di scegliere fra registrato e stima finale; la stima rimane disabilitata con budget incompleto. L'appalto mostra una ciambella del contratto a SAL e mantiene ritenute e anticipazione. Su telefono le unità mostrano lo stato di vendita al posto della percentuale operativa.

## Obiettivo

Rendere immediatamente leggibili risultato economico, liquidità e stato operativo, con la stessa identità visiva della commessa singola: blu del marchio, accenti arancio, testo ben contrastato, riquadri chiari per il lavoro di dettaglio. Il disegno copre sviluppo immobiliare, compravendita e appalto a contratto, compresi gli appalti con CIG/CUP.

Le operazioni restano gestibili interamente sulla generale. Unità abitative e ordini di lavoro collegati sono approfondimenti facoltativi.

## Evidenze verificate

- Panoramica immobiliare O-0031, Residenza Via Roma, e relativo piano economico, sul portale localhost.
- Panoramica appalto O-0045, Manutenzione strade: contratto, avanzamento, ultimo SAL, ritenute e documenti mancanti.
- Schermata della commessa singola fornita dall'utente: blocco blu «La commessa in numeri» e fascia operativa con accenti arancio.
- Sorgenti dei riepiloghi, delle schede, dei grafici di cassa e degli stati di vendita.

Il ridisegno distingue il riepilogo economico dai dettagli operativi, anticipa grafici e priorità rispetto alle tabelle e riduce le ripetizioni fra piano e investitori. I grafici mensili esistenti sono coordinati con il nuovo stile.

## 1. Stile condiviso

| Elemento | Scelta |
| --- | --- |
| Riepilogo principale | Fondo `eic-navy-deep`, celle interne leggermente schiarite, numeri bianchi, icona arancio come nella commessa singola |
| Sezioni di dettaglio | Fondo chiaro, bordo sottile, raggio coerente e ombra discreta; intestazione con icona e piccolo accento arancio |
| Colori funzionali | Blu per contesto e navigazione; verde per incassi/risultati positivi; ambra per dati da completare o scadenze vicine; rosso per anomalie e risultati negativi |
| Vendite | Stessi colori per stato in ciambella, legenda, badge, tabella e tabellone, riusando la mappa esistente |
| Tipografia | Importi con cifre allineate, titoli chiari, note leggibili senza troncamenti sistematici |
| Azioni e schede | Allineamento stabile, icone discrete, selezione evidente, raggruppamento delle azioni secondarie quando manca spazio |

Usare i token del marchio esistenti, inclusa la personalizzazione aziendale. Limitare lo sfondo scuro al riepilogo; tabelle, moduli e documenti richiedono superfici chiare e pulite.

## 2. Nuova gerarchia della panoramica

Ordine implementato:

1. Testata compatta: nome, codice, tipo, cliente/committente quando presente e azioni.
2. Schede con selezione più riconoscibile.
3. Blocco blu «La commessa in numeri».
4. Fascia «Da seguire»: fino a tre segnalazioni concrete con collegamento al punto da completare.
5. Due riquadri grafici affiancati: composizione costi e vendite oppure contratto/SAL.
6. Tabella delle unità o degli ordini di lavoro collegati, con stati colorati e totale più evidente.
7. Riepiloghi brevi di piano, fonti di capitale e documenti, orientati ad aprire il dettaglio.

Il riepilogo blu mantiene i quattro indicatori della bozza approvata: valore/ricavi, da incassare, capitale o residuo contrattuale, margine. La fascia sottostante confronta fatturato, incassato e gli avanzamenti pertinenti al modello. Costi registrati e stima finale si consultano nel grafico dedicato e nel piano. Etichette e composizione rispettano modello e permessi; senza unità non compaiono prezzi o differenze rispetto a unità inesistenti.

Il riquadro del piano evidenzia soprattutto scostamenti e qualità delle stime. Quello degli investitori mostra composizione delle fonti, capitale ancora dentro e copertura: evitare di ripetere integralmente gli stessi indicatori in tre punti.

## 3. Grafici e comportamento

| Vista | Grafico | Dati e interazione |
| --- | --- | --- |
| Tutte le generali, con permesso costi | Ciambella «Composizione dei costi» | Modalità esplicita «Registrati» / «Stima finale», categorie e totale sulla stessa base netta. Al massimo cinque categorie maggiori e «Altri», con dettaglio completo disponibile. Clic sulla legenda per aprire il dettaglio pertinente. |
| Sviluppo e compravendita con unità | Ciambella «Stato delle vendite» | Numero di unità libere, prenotate, a compromesso e rogitate; totale al centro, conteggi e percentuali nella legenda. Clic sullo stato apre la lista filtrata. |
| Appalto | Ciambella «Contratto a SAL» | Due parti esclusive: valore a SAL e residuo non ancora a SAL, sulla stessa base contrattuale netta. Valori fuori dal contratto diventano una segnalazione esplicita. |
| Appalto | Barre di confronto sotto il riepilogo | Assegnato, eseguito, a SAL, fatturato e incassato restano grandezze confrontate sulla base dichiarata. Non sono fette di una torta: si sovrappongono. |
| Piano economico | Grafico mensile esistente aggiornato nello stile | Entrate, uscite e cassa cumulata, confronto previsto/stima e indicazione del picco. Separazione leggibile fra movimenti effettivi e previsionali. |
| Investitori | Composizione delle fonti nella scheda dedicata | Mezzi propri, soci/investitori e banca, con scelta chiara fra impegni e capitale effettivamente presente. Eventuale scoperto rimane un indicatore distinto. |

Per l'immobiliare, «Da incassare» riguarda il venduto/fatturato secondo il calcolo esistente: il valore delle unità invendute non diventa un credito. Le percentuali di vendita contano unità; quelle economiche indicano sempre la base in euro.

Le ciambelle includono legenda testuale, valori accessibili e un comando equivalente da tastiera. Tooltip come approfondimento. Costi negativi e note di credito vanno riconciliati nel totale; se impediscono una composizione sensata, usare barre con segno e dettaglio anziché deformare la torta.

## 4. Adattamenti per appalto e appalti pubblici

Stessa cornice grafica, contenuti specifici:

- Valore contrattuale aggiornato e atti aggiuntivi.
- Ultimo SAL, residuo da mettere a SAL e incassi.
- Ritenute da svincolare e anticipazione da recuperare.
- Termine lavori, proroghe e garanzie in scadenza, quando presenti.
- CIG, CUP e scissione dei pagamenti come informazioni compatte del contratto, quando valorizzate.

I collegamenti aprono le sezioni Contratto e SAL, Piano economico, Cantiere e Documenti già presenti. La ciambella del contratto non viene presentata come percentuale fisica di costruzione.

## 5. Coerenza delle altre schede

- **Unità e vendite:** stessi badge e legenda, incassi leggibili, analisi dei costi per unità facoltativa.
- **Piano economico:** intestazioni di gruppo più riconoscibili, scostamenti con colore e segno, avviso del budget incompleto vicino agli indicatori interessati.
- **Cantiere:** sezioni ordinate, icone e accenti coerenti per rapportini, acquisti/DDT, fatture/pagamenti e subappalti. Percorso DDT → fattura → pagamento leggibile anche senza ordine.
- **Investitori:** separare visivamente impegni, capitale versato, rimborsi e rendimenti; stesso linguaggio per effettivo e previsto.
- **Documenti:** conteggi e stato evidenti, scadenze prioritarie, azione diretta sul documento interessato.

## 6. Stati particolari

- Senza unità: nessuna ciambella vendite vuota; riepilogo dell'operazione e accesso al cantiere generale sempre disponibili.
- Senza budget o con stime incomplete: invito mirato a completare i dati, margini definitivi e grafici previsionali sospesi come oggi.
- Senza calendario: niente picco di capitale o linea temporale inventata.
- Senza costi: stato vuoto esplicito, nessun margine verde pari all'intero ricavo.
- Permessi limitati: importi e margini protetti anche in tooltip, legende, totale centrale e tabelle accessibili.
- Smartphone: indicatori in due colonne o in pila, grafici verticali, note a capo e tabelle scorrevoli nel proprio contenitore. Le possibilità di modifica restano quelle già previste dal portale.
- Tema scuro e marchio aziendale: verificare fondi, bordi, testo e colori dei grafici con entrambi.

## 7. Sequenza di implementazione

| Priorità | Intervento | Risultato verificabile |
| --- | --- | --- |
| P1 | Estrarre gli elementi visivi riutilizzabili dal riepilogo singolo, senza spostarne i calcoli; nuova testata e riepilogo della generale | O-0031 coerente con la commessa singola, informazioni complete a larghezze intermedie |
| P1 | Riordinare la panoramica e aggiungere ciambelle costi/vendite | Totali riconciliati, stato vendita apribile, tabella più facile da leggere |
| P1 | Adattare O-0045 e gli altri appalti | Ciambella SAL/residuo e riquadri di ritenute/scadenze, nessun widget immobiliare |
| P2 | Coordinare Piano, Investitori, Documenti e Cantiere | Stessi titoli, bordi, stati, azioni e colori in tutte le schede |
| P2 | Verifica finale responsive, accessibilità e regressioni | Nessun taglio di importi, nessuna fuga di dati protetti, stessi risultati economici e flussi documentali |

## 8. File e vincoli tecnici

Punti principali: `CommessaGeneraleDettaglio.tsx`, `OrderFinancialOverview.tsx`, `generali/unita/RiquadroUnita.tsx`, `generali/contratto/RiquadroContratto.tsx`, `generali/piano/RiquadroPiano.tsx`, `generali/piano/CassaIndicatori.tsx`, `generali/investitori/RiquadroInvestitori.tsx` e i moduli del cantiere.

Componenti visivi condivisi per indicatore, intestazione di scheda, filtro attivo e ciambella con legenda. Le ciambelle sono SVG leggeri, i grafici temporali riusano Recharts già disponibile. Riutilizzare i calcoli consolidati esistenti; una rappresentazione nuova deve riconciliarsi con il relativo dettaglio e con la stessa versione del piano.

Il lavoro grafico non richiede migrazioni o nuovi documenti di prova. Sviluppo e verifiche avvengono nel portale esistente su `http://127.0.0.1:5173`, mantenendo il servizio locale attivo.

## Criteri completati

- [x] Panoramiche immobiliare e appalto allineate alla commessa singola; unità e ordini di lavoro facoltativi.
- [x] Stile esteso a Piano economico, Cantiere, Investitori, Documenti, Unità e Contratto/SAL.
- [x] Legende e spicchi dei grafici selezionabili anche da tastiera; filtri riconoscibili e rimovibili.
- [x] Costi filtrati sulla stessa versione e categoria del grafico, compreso il gruppo «Altri costi»; totale filtrato separato dal margine globale.
- [x] Vendite filtrate per stato, mantenendo le quote dei costi calcolate sull'intera operazione.
- [x] Fonti filtrate per gruppo, distinguendo impegni da capitale effettivo; i totali della tabella seguono il filtro.
- [x] Documenti filtrati dai contatori e ricercabili per nome o commessa, conservando le azioni native e i permessi.
- [x] Appalto: accesso ai SAL emessi e al valore/residuo del contratto; CIG/CUP e scissione dei pagamenti quando presenti.
- [x] Grafico di cassa filtrabile per periodo, mantenendo il saldo cumulato precedente; marcatori di questo mese e picco, dettaglio mensile accessibile.
- [x] Riepiloghi del piano e degli investitori con meno ripetizioni e priorità «Da seguire» prima dei grafici.
- [x] Verifiche su assenza di unità, budget assente/incompleto, operazione conclusa, permessi limitati e rettifiche negative.
- [x] Verifiche browser a 1440, 1280, 1024 e 390 px: nessuno sbordamento orizzontale della pagina; tabelle ampie scorrevoli nel proprio contenitore.
- [x] Token del marchio e regole per `.dark` coordinati; importi protetti anche nelle legende e nei totali centrali.
- [x] TypeScript, regressioni e schermate locali; servizio localhost mantenuto attivo.

## Verifiche finali

| Caso | Esito verificato |
| --- | --- |
| O-0031, immobiliare | Costo registrato 1.170.125 €, stima 2.728.000 €. Il filtro Costruzione apre 494.125 € registrati sulla versione corretta. Il filtro Libere mostra solo A6, una delle sei unità. |
| O-0031, investitori | Impegni 2.200.000 € e capitale dentro 400.000 € restano separati. Il filtro Banca e finanziamenti limita la tabella e il relativo totale. |
| O-0031, documenti | Obbligatori mancanti + ricerca APE restituisce le sei caselle delle unità corrette. Rimozione del filtro ripristina checklist e archivio. |
| O-0031, cassa | Picco 608.725 € a febbraio 2027. Il periodo «Mesi precedenti» mostra correttamente assenza di mesi, senza creare zeri o nuovi movimenti. |
| O-0045, appalto | Contratto a SAL al 22%; il collegamento al grafico apre un SAL emesso. Ritenute, anticipazione e valore residuo conservati. |
| O-0063, senza unità | Gestione diretta della generale, due flussi documentali coerenti; pagato 183 € IVA inclusa e residuo zero. Nessun nuovo documento o pagamento creato per le prove grafiche. |
| O-0057, budget assente | Invito a impostare/importare il budget, senza inventare margine o capitale. I blocchi per budget incompleto sono coperti anche dalle prove automatiche. |
| O-0048, operazione conclusa | Quattro unità rogitate, 100% nello stato corrispondente e zero da incassare. |
| Responsive | 1440 e 1024 px sull'appalto, 1280 px sulle nuove schede, 390 px sul telefono: pagina della stessa larghezza della viewport. |

Verifiche visive effettuate con il tema disponibile nella build corrente; il portale non espone qui un interruttore del tema. La compatibilità del tema scuro e del marchio è mantenuta tramite variabili e regole CSS, senza modificare le preferenze aziendali.

Regressione finale: **66 file, 761 test superati**. TypeScript del modulo e `git diff --check` superati. Le prove comprendono filtri, tastiera, gruppi di categorie, rettifiche, SAL oltre contratto, budget incompleto, permessi e flussi contabili/documentali.

Schermate: `outputs/design-commesse/` nella cartella di lavoro principale: piano-economico, cassa, investitori, documenti, cantiere, appalto-sal, appalto-mobile, senza-unita-controllo, budget-assente, operazione-conclusa e panoramica finale.

Localhost: `http://127.0.0.1:5173`, servizio `com.ediliziaincloud.local5173` con avvio e riavvio automatici. Nessuna migrazione remota o pubblicazione richiesta per questo intervento grafico.


## Estensione completata: ordini, DDT, fatture e pagamenti

- [x] Elenchi operativi della commessa generale: intestazioni con icona arancione, tabelle, stati, contatori filtrabili e ripristino «Mostra tutti».
- [x] Ordini: dettaglio, nuovo ordine, collegamento a un ordine esistente, bolle/fatture dell’ordine e arrivi con gli stessi componenti nativi.
- [x] DDT: dettaglio, nuovo DDT e caricamento di più bolle; percorso senza ordine conservato. Riferimenti lunghi leggibili su telefono.
- [x] Fatture: riepilogo con imponibile, IVA e totale distinti; collegamenti a ordini e DDT; ripartizione tra commesse.
- [x] Pagamenti: riepilogo con importi IVA inclusa, filtri, storico, dovuto/pagato/residuo e form nativo di registrazione.
- [x] Ordini e DDT si aprono dentro la commessa, con navigazione tra i documenti e ritorno. Le schede separate conservano il contesto visivo e il collegamento alla generale.
- [x] Il comando `arrivo=1` viene conservato anche nel popup e non confuso con i parametri della commessa.
- [x] Stile attivato tramite contesto solo nelle viste della generale, compresi i portali dei dialoghi. Interrogazioni, contabilità, permessi e salvataggi esistenti mantenuti.

Verifica browser su Demo Azienda, O-0063: apertura ordine, DDT diretto senza ordine, fattura diretta, collegamento fattura → DDT → ritorno alla fattura e apertura dello storico del pagamento. Pagamenti «Tutti (2)»: 122 € + 61 € pagati, residuo 0 €. Le finestre «Nuovo ordine» e «Carica bolla» sono state aperte e annullate: nessun nuovo salvataggio, documento, invio o movimento finanziario.

Verifica responsive dei dettagli a 1440, 1024 e 390 px: larghezza della pagina pari alla viewport, tabelle ampie scorrevoli. Contesto della commessa e riferimenti DDT leggibili anche su telefono. Verifica visiva con il tema disponibile nel portale.

Regressione dell’estensione: **73 file, 783 test superati**, TypeScript del modulo e `git diff --check` superati. I test di navigazione coprono l’id del documento, il comando di arrivo, il passaggio ordine → DDT, il ritorno alla commessa e il collegamento della scheda separata.

Schermate dell’estensione: `outputs/design-commesse/interni/` nella cartella di lavoro principale. Localhost continua a essere gestito dal servizio con riavvio automatico.


## Piano economico: lettura e audit del flusso

- [x] Confronto grafico Budget / Registrato / Stima finale, filtrabile tra Costi, Ricavi e Margine. Una sola scala con zero esplicito conserva il segno di rettifiche e margini negativi.
- [x] Formula Reale + A finire = Stima finale, con distinzione tra competenza economica e pagamenti. Il riepilogo usa la stessa versione e gli stessi conti della tabella, senza letture parallele di un'altra versione.
- [x] Elenco dei tre scostamenti sfavorevoli maggiori, filtro diretto delle voci e accesso alle registrazioni che compongono i costi.
- [x] Collegamenti dal piano a Ordini/DDT, Fatture, Pagamenti e Controllo forniture. Dialoghi del piano allineati al design operativo.
- [x] Budget incompleto: grafici e note non presentano come attendibile un margine parziale. I permessi si applicano anche ai nuovi confronti e agli scostamenti.
- [x] Corretta la rilettura della cassa in errore: Riprova ricarica sia scadenze sia movimenti delle fonti. Reso visibile anche l'avviso quando manca il solo permesso sugli importi.
- [x] Le voci a zero confermato, prive di reale e a finire, indicano «Non necessario» per il mese assente: nessun falso avviso su una scadenza senza importo.

Audit in sola lettura su Demo Azienda, commessa O-0063, tramite portale e controlli dei record collegati nel database:

| Flusso esistente | Costo netto unico | Fattura con IVA | Pagamenti registrati | Residuo |
| --- | ---: | ---: | ---: | ---: |
| ODA-2026-0039 → TEST-DDT-20261111 → TEST-LOC-20261111 | 100 € | 122 € | 61 € + 61 € | 0 € |
| TEST-DDT-DIR-20261111 senza ordine → TEST-DIR-20261111 | 50 € | 61 € | 61 € | 0 € |
| Totale | **150 €** | **183 €** | **183 €** | **0 €** |

Confermati due costi, due fatture collegate ai rispettivi costi, due DDT e tre pagamenti di prima nota. Il DDT descrive la consegna; il costo contabile è quello dell'ordine/fattura. Nessuna duplicazione nel piano. La riga della fattura sull'ordine è già abbinata alla riga dell'ODA. Il conto della cassa effettiva mostra 183 € pagati e fabbisogno residuo dalle scadenze aperte pari a zero.

Il budget approvato resta una sola versione, con ricavi 150 € e costi 100 €: margine previsto 50 €. I costi registrati sono 150 €, i costi a finire zero: margine stimato finale **0 €**, ridotto dai **50 € di maggiori costi dei materiali**. La simulazione di un mese di ritardo sposta gli incassi previsti fino a gennaio 2027; Azzera ripristina il piano di base. Nessun nuovo salvataggio di documento, pagamento o revisione effettuato durante l'audit.

Verifica browser a 1440 e 1024 px: pagina della stessa larghezza della viewport, confronto leggibile e tabelle scorrevoli nel proprio contenitore. Filtri, dettaglio delle due registrazioni, percorso al Controllo forniture, cassa, simulazione/azzera, costi generali senza unità e storico verificati.

Regressione finale dell'audit: **75 file, 789 test superati**; TypeScript del modulo e controllo diff superati. Localhost attivo con riavvio automatico. Anteprima: `outputs/design-commesse/piano-economico-migliorato.jpg` nella cartella di lavoro principale.


## Cassa, Andamento e collegamenti agli investitori

- [x] Cassa effettiva in primo piano: incassato e pagato di prima nota, flusso netto registrato e fabbisogno residuo delle scadenze aperte. Importi dei movimenti con IVA, distinti dalle previsioni nette del piano.
- [x] Grafico e tabella mensile con base Registrati / Ancora attesi, filtro di periodo e simulazione del ritardo degli incassi. Il cumulato conserva i mesi precedenti al filtro; i versamenti delle fonti non vengono aggiunti nuovamente al flusso.
- [x] Prospetto dedicato alle fonti: versamenti, rimborsi, oneri/utili e calendario dei movimenti anche attesi, con accesso diretto agli investitori e ritorno alla cassa della stessa commessa.
- [x] Previsione completa del piano, simulazioni e indicatori separati dalla cassa effettiva. L'asse dei grafici mostra correttamente anche valori sotto i mille euro.
- [x] Andamento con filtri per rilevazioni e stato della versione, riepilogo dell'ultima fotografia in vista, grafici di margine/costi/capitale, tabella e dettaglio della fotografia. I numeri correnti non vengono presentati come fotografie storiche; una sola fotografia viene dichiarata come un punto, senza inventare una tendenza.
- [x] Collegamento dalla fotografia al rendiconto investitori del mese selezionato, aperto direttamente sul periodo corretto. Mesi futuri o malformati non diventano periodi validi. I controlli esistenti su approvazione e completezza rimangono attivi.

Verifica browser: sulla O-0063, pagato di prima nota 183 €, flusso netto registrato −183 € e fabbisogno residuo delle scadenze aperte 0 €. Il prospetto fonti mostra 122 € versati e 22 € rimborsati, coerenti con i 100 € di capitale ancora dentro nella scheda Investitori. Navigazione Cassa → Investitori → Cassa sulla stessa commessa verificata.

Sulla O-0031 è stata usata la fotografia esistente di ottobre 2026, versione 1 approvata: margine stimato 472.000 €, scostamento −2.000 €, costi registrati 1.214.000 € e capitale investito 124.000 €. Filtri per bozze/approvate, metriche e dettaglio mensile verificati. Il collegamento apre il rendiconto investitori di ottobre 2026, con capitale riferito al 31 ottobre. Il download di quel report storico resta correttamente bloccato perché gli oneri finanziari ancora previsti richiedono verifica: nessun valore corrente è stato usato per colmare la fotografia.

Nessuna nuova fotografia o movimentazione finanziaria creata per queste prove. Verifica su tablet 1024 px e desktop 1440 px: nessuno sbordamento della pagina. Localhost attivo con riavvio automatico, HTTP 200.

Regressione: **78 file, 798 test superati**; successiva verifica mirata dei componenti aggiornati: **12 test superati**. TypeScript del modulo e controllo diff superati. Schermate in `outputs/design-commesse/cassa-e-indicatori.jpg` e `outputs/design-commesse/andamento.jpg` nella cartella di lavoro principale.


## Correzione della posizione della navigazione interna

- [x] Tab del Piano economico spostati immediatamente sotto il titolo, prima di versione, KPI, archivio e grafici. Intestazione condivisa costante fra Voci, Cassa, Costi di commessa e Andamento.
- [x] Stesso ordine nel Cantiere: titolo, tab interni, ambito e percorso documentale, contenuto.
- [x] Una sola barra di navigazione per ciascun livello, larga quanto il contenuto e con etichette accessibili distinte.

Verifica browser sui quattro tab del piano: barra sempre a 16 px dall'intestazione e prima dei contenuti variabili. Stesso riscontro nel Cantiere, prima dell'ambito e dei documenti. Superati 26 test pertinenti, TypeScript del modulo e controllo diff. Localhost resta attivo. Anteprima `outputs/design-commesse/navigazione-piano-corretta.jpg` nella cartella di lavoro principale.


## Simulazioni complete e correzione degli anticipi

- [x] Caso sintetico locale con ricavi 3.200.000 €, costi 2.600.000 €, costi registrati 1.100.000 €, fatturato 800.000 € e incassato 600.000 €. Nessun inserimento di questi dati nel database aziendale.
- [x] 448 combinazioni dei calcoli del portale: prezzi −0/5/10/15/20/30/50/90%, costi +0/5/10/20/30/50/100/200%, ritardi 0/1/3/6/12/24/60 mesi. Controllati somme mensili, margine, capitale, fonti, valori finiti e immutabilità del budget e del reale.
- [x] Budget mancante/incompleto, zero confermato, date mancanti, costi sulla sola generale e ripartizione su sei unità, fondi insufficienti o disponibili troppo tardi, interessi già nel piano, pagamenti parziali, duplicati, storni, accolli e note di credito.
- [x] Riprovati nel portale Demo entrambi i flussi esistenti O-0063, senza creare nuovi documenti: 100 € netti con ordine e 50 € netti senza ordine, 183 € con IVA pagati, residuo zero. La cassa effettiva continua a mostrare −183 € e le fonti 122 € versati / 22 € rimborsati separatamente.
- [x] Provati appalto O-0045 con SAL e ritenute; O-0057 senza budget; storico vuoto e storico con una fotografia; filtri senza risultati e collegamento al rendiconto del mese esatto.

La simulazione ha rilevato un errore reale: gli anticipi incassati oltre il fatturato non riducevano gli incassi ancora previsti. La previsione conteggiava una seconda volta quella quota e alterava capitale massimo e TIR. Corretto `flussoStima`: compensazione al centesimo sui primi incassi a finire, anche negli scenari, senza modificare fatture, ricavi economici, pagamenti o costi. Cinque prove riproducono il problema prima della correzione e passano dopo (anche incasso totale e inversione dell'ordine delle voci).

**I valori seguenti sostituiscono i precedenti picchi di cassa della O-0031 riportati nelle verifiche precedenti alla correzione:**

| O-0031, esempio Demo nel portale | Stima finale | Scenario: prezzi −10%, costi +20%, incassi +3 mesi |
| --- | ---: | ---: |
| Ricavi | 3.200.000 € | 2.974.500 € |
| Costi | 2.728.000 € | 3.039.575 € |
| Margine | 472.000 € | −65.075 € |
| Capitale massimo | 726.755 € · nov 2027 | 1.356.184 € · apr 2028 |
| TIR dello scenario | — | −4% |

Verificato che la scheda Investitori legge il nuovo picco di base 726.755 €. Lo scenario temporaneo del piano non salva modifiche al business plan: l'analisi combinata con le fonti è verificata nel caso sintetico tramite le stesse funzioni del portale. Provati e ripristinati anche i controlli di tasso +2 punti / banca −50% della scheda Investitori.

Restano dati da completare nell'esempio, già segnalati dal portale: 6 movimenti attesi senza data; verifica degli oneri finanziari previsti nella fotografia di ottobre 2026 prima di scaricare il relativo rendiconto. I pagamenti dimostrativi non sono riconciliati con movimenti bancari: la prova riguarda registrazioni gestionali, senza trasferimenti di denaro.

Verifica finale: **83 file / 1.315 test superati**, inclusi i 459 della nuova suite (448 scenari e 11 controlli). Le 5 prove SQL su database PGlite locale sono superate; nessuna migrazione remota applicata. TypeScript del modulo e delle nuove prove, controllo diff superati. Localhost attivo tramite servizio con riavvio automatico, HTTP 200.

Risultati ripetibili: `outputs/simulazioni-commesse/scenari.csv`, `scenari.json`, `verifiche-portale.json`; schermata nativa `scenario-demo-rincari-ritardi.jpg`, nella cartella di lavoro principale. Lo scenario temporaneo è lasciato aperto per la lettura; `Azzera` riporta alla stima. Nessun nuovo salvataggio sul database condiviso durante questo audit.


## Prova con dati salvati in Demo Azienda e rendiconto di ottobre

Su esplicita richiesta dell'utente sono stati modificati solo dati di **Demo Azienda S.r.l.**, id `778a2c76-1253-49f2-a5e8-283363ac3e29`. Copia preventiva dei record e SQL delle modifiche nella cartella di lavoro principale `outputs/simulazioni-commesse/`. Nessuna migrazione o distribuzione in produzione.

### O-0031: date e rettifica degli oneri

- [x] I sei movimenti senza data erano residui non pianificati delle sei commesse figlie. Inserite sei rate di saldo con IVA, etichettate come date previste della simulazione, da maggio ad agosto 2028. Conservati gli importi: nessuna rata segnata incassata. Verifica SQL e browser: **zero incassi senza data**.
- [x] Verificati 12.000 € di spese previste a marzo 2027 e 31.875 € di interessi previsti a dicembre 2027. Mantenuti futuri e marcati come previsti; non trasformati in pagamenti di ottobre.
- [x] Rettificata la fotografia Demo di ottobre, che li conteneva nel reale: costi reali da 1.214.000 € a **1.170.125 €**, capitale investito da 124.000 € a **80.125 €**. Budget, stima finale e margine 472.000 € invariati. Origine della rettifica manuale e data di modifica effettiva conservate; copia originale in `demo-ottobre-prima.json`.
- [x] Corretto il blocco troppo ampio del report: la presenza di oneri futuri non rende invalida una fotografia approvata. Il report distingue 43.875 € ancora previsti dai pagati. Rimangono i controlli su approvazione, disponibilità dei dati, valori numerici e completezza del piano corrente.
- [x] Il termine storico non supera la fine del mese, anche quando la fotografia è rettificata successivamente. Conservate le date delle rilevazioni inframensili. Provato anche febbraio bisestile.
- [x] Eseguito il download effettivo del CSV dal portale e controllato il contenuto: **Rendiconto-O-0031-2026-10.csv**, riferimento **31/10/2026**, oneri futuri 43.875 €, capitale investito 80.125 €. I versamenti di novembre non sono retrodatati a ottobre.

### O-0064: Residenza Aurora, simulazione salvata completa

L'ipotesi è stata compilata e salvata dal simulatore nativo, poi trasformata dal portale in commessa generale `13fed592-3287-465b-91b7-8aa2bccd4187`, con 6 unità e 3 fonti. Il budget è stato completato e approvato dal login del portale.

| Voce | Dato finale |
| --- | ---: |
| Ricavi previsti | 3.200.000 € |
| Costi di budget, inclusi oneri finanziari | 2.684.602 € |
| Margine previsto | 515.398 € |
| Costi registrati sulla generale | 756.000 € · 4 spese |
| Costi stimati finali | 2.734.602 € |
| Maggior costo a finire salvato | 50.000 € · Costruzione |
| Margine finale stimato | **465.398 €** |
| Incassi di prima nota, IVA inclusa | 143.000 € |
| Pagamenti di prima nota, IVA inclusa | 715.400 € |
| Flusso netto registrato | −572.400 € |
| Residuo fornitore | **55.000 €** |
| Impegni delle fonti | 2.700.000 € |
| Capitale versato dalle fonti | 1.300.000 € |
| Capitale massimo del piano | 2.091.561 € · luglio 2027 |

Dettagli verificati:

- [x] Quattro trilocali da 500.000 € e due attici da 600.000 €: 3 liberi, 1 prenotato, 2 a compromesso. Due caparre per 130.000 € netti, corrispondenti alle due registrazioni di prima nota da 143.000 € IVA inclusa. Rate pagate e saldi futuri collegati, tutti con data.
- [x] Costi di acquisto 600.000 €, imposte/notaio 36.000 €, materiali/opere 100.000 €, progettazione 20.000 €, tutti sulla generale. Abbinamento esplicito di terreno e notaio alle rispettive voci, evitando che il medesimo reale alimenti una voce e lasci l'altra interamente da spendere.
- [x] Due fatture fornitore fittizie, 110.000 € e 24.400 € lordi, collegate ai costi già presenti. Nessun nuovo costo creato dalle ricevute. La registrazione delle ricevute richiede il client autenticato: eseguita dal portale; ausilio locale temporaneo rimosso dopo l'inserimento.
- [x] Quattro pagamenti registrati dal modulo nativo: terreno 600.000 €, notaio/imposte 36.000 €, progettazione 24.400 €, prima quota fornitura 55.000 €. Residuo della fornitura 55.000 € su 110.000 €, provato prima e dopo il collegamento della fattura.
- [x] Mezzi propri 600.000 €, investitore a capitale 500.000 € con quota fissa 30%, mutuo 1.600.000 € al 5% con spese iniziali 10.000 €. Versamenti dimostrativi rispettivamente 600.000 / 500.000 / 200.000 €. Le fonti restano separate dai ricavi e dai costi; gli oneri già nel piano non sono sottratti nuovamente dall'utile.
- [x] Aggiornato dal portale l'a finire della costruzione a 1.600.000 € contro un residuo automatico di 1.550.000 €: scostamento 50.000 €, margine stimato 465.398 €, lasciando bloccato il budget approvato a 515.398 €.
- [x] Fotografia di novembre salvata dal portale: costi reali 756.000 €, capitale investito 626.000 €, margine 465.398 €, scostamento −50.000 €. Il rendiconto del periodo usa gli stessi numeri e le fonti versate; download effettivo del file **Rendiconto-Aurora-O-0064-2026-11.csv** verificato.

### Errore rilevato dalla prova con pagamento parziale

Il quadro pagamenti leggeva il residuo corretto di 55.000 €, mentre il Previsionale leggeva ancora il lordo intero della spesa aperta, 110.000 €. Corretto il caricamento dei pagamenti delle spese e il calcolo del residuo nella fonte condivisa della cassa: centesimi, IVA, doppioni, storni, rimborsi, pagamenti futuri e acconti più vecchi di un anno. Sulle rate fornitore si conserva la quota già assorbita dalle rate chiuse; il resto dell'acconto riduce le prime rate aperte. Il saldo bancario non viene ricalcolato con questa fonte aggiuntiva.

Prova browser dopo la correzione: Aurora mostra 143.000 € incassati, 715.400 € pagati, netto −572.400 € e **55.000 € di fabbisogno residuo da scadenze**. Questi importi non alterano i 756.000 € di costi economici.

Verifiche: **86 file / 1.335 test superati**, poi una nuova prova sul caricamento degli acconti storici, compresa in **26 test mirati superati**. TypeScript del modulo e controllo diff superati. Gli esiti ed i dati sono in `demo-reale-verifica-finale.json`; anteprime native `aurora-piano-salvato.jpg`, `aurora-cassa-effettiva.jpg`, `rendiconto-ottobre-scaricabile.jpg`, nella cartella di lavoro principale `outputs/simulazioni-commesse/`.

Per un'operazione effettiva restano dati esterni da inserire: anagrafiche acquirenti e accordi autentici, piante/capitolato/allegati richiesti dalla checklist in base allo stato del cantiere, riconciliazione con movimenti bancari effettivi. Le registrazioni effettuate sono chiaramente marcate Demo; nessun trasferimento di denaro, invio fiscale o comunicazione eseguito. Localhost resta attivo tramite LaunchAgent con riavvio automatico, HTTP 200.


## Restyling condiviso: testate, navigazione e indicatori — 11 novembre 2026

Completati i sei interventi estetici approvati. Le schermate riutilizzano header, navigazione, pulsanti, menu e dialog già presenti: nessun nuovo percorso operativo o calcolo economico.

- [x] Testate compatte, titolo intero e metadati vicini. Nelle generali Modifica e Collega sono nel menu Altre azioni; Rendiconto e azione principale restano in evidenza. Dialog originali verificati e chiusi senza salvare.
- [x] Stessa presentazione della navigazione nelle commesse cliente, per appaltatore e generali. Nel piano, sottoschede subito sotto la navigazione principale, prima del contenuto variabile. Rimossa la grande intestazione ripetuta; dettagli e note della versione rimangono espandibili.
- [x] Quattro indicatori nella vista Voci: ricavi stimati, costi finali stimati, margine finale, capitale massimo impegnato. Mantengono i controlli su permessi e budget incompleto. Cassa e Costi usano i propri riepiloghi, evitando duplicazioni. Storico Excel nella vista Voci.
- [x] Palette condivisa blu e arancio, azioni senza bagliori o gradienti, contrasto dei testi aumentato. Verde e rosso riservati agli esiti economici; note e legende più leggibili.
- [x] Tabella del piano con scorrimento contenuto nella pagina, intestazione e totale del margine fissi, focus da tastiera e celle modificabili riconoscibili. Verificati scorrimento verticale e orizzontale da tastiera.
- [x] Grafici esistenti mantenuti, confronto con budget grigio, registrato blu e stima arancio, legende e selettori più leggibili. Provati cambio Costi/Ricavi, Cassa Registrati/Ancora attesi e filtro Da questo mese.

A 1280 × 720 sulla Residenza Aurora, la testata passa da 169,4 a 79,6 px e il primo indicatore da quota 789,6 a 469,6 px: i quattro valori entrano nella prima schermata, circa 320 px prima. Nessuno sbordamento orizzontale della pagina. Verificati anche appalto generale, lavoro per appaltatore e commessa cliente; a 390 px testata e panoramica rimangono entro la larghezza del dispositivo. Ripristinata la dimensione desktop dopo la prova.

Regressione: **140 file / 1.837 test superati**. Dopo la rifinitura del totale fisso e delle icone: **4 file / 56 test superati**, TypeScript del modulo e controllo diff superati. Tre nuove prove controllano i totali degli indicatori, il budget incompleto e gli importi riservati. Nessuna modifica al database Demo durante questo intervento.

Anteprime e geometrie salvate nella cartella di lavoro `outputs/simulazioni-commesse/`: `design-compatto-piano.png`, `design-compatto-appalto.png`, `design-compatto-cliente.png`, `design-compatto-appaltatore.png`, `design-compatto-tabella.png`, `design-compatto-mobile.png`, `design-compatto-geometria.json`. Risultati ripetibili in `design-compatto-test-files.json` e `design-compatto-regressione.log`.

Localhost verificato HTTP 200; LaunchAgent `com.ediliziaincloud.local5173` in esecuzione con KeepAlive e RunAtLoad. Nessun commit, push o deploy.


## Verifica importazioni dopo il restyling

- [x] Audit degli ingressi per ogni tipologia, letture AI reali e salvataggio Cliente nella sola Demo.
- [x] Corretti rate/IVA e piani parziali, firma non verificata, ruolo RTI, prezzi del contratto e conservazione dell'originale.
- [x] Corretti lettura di XLSX con prefissi XML e riconoscimento della sezione RICAVI. Simulazione del componente sui tre modelli con dati noti e controllo del corpus originale di nove scenari.
- [x] Regressione ripetuta dopo le ultime correzioni: 149 file / 1.959 test, TypeScript e controllo diff.
- [x] Salvataggi nativi Excel completati: O-0088 Appalto, O-0089 Sviluppo, O-0090 Compravendita. Verificati database, calendario mancante e approvazione bloccata; secondo caricamento Appalto respinto senza righe o originali doppi.
- [x] Riscontro visivo del popup AI grande con footer visibile e del codice O-0091 riproposto dopo cancellazione della bozza di prova.

Gli ingressi AI mancanti non sono segnati come funzionanti: appaltatore corpo/misura, contratto della generale, PDF del business plan e ipotesi del simulatore. Dettaglio ed evidenze nel paragrafo «Audit delle importazioni durante la creazione» di `docs/audit/2026-11-11-sei-tipologie-commessa.md`. Nessun deploy o migrazione remota in questa fase; localhost attivo.

- [x] Allegati PDF e PNG multipli salvati e riaperti; download PDF, PNG e XLSX identici agli originali. File vuoti, non ammessi ed Excel danneggiato respinti nel portale.
- [x] Caricamento dalla checklist sincronizzato con archivio e conteggi. AI da immagine salvata nella cliente O-0091 con rate 330/770 non pagate, originale privato e nessuna firma registrata.
- [x] Ripresa della coda di caricamento dopo errori di preparazione e metadati verificata con due nuovi test; i file riusciti non vengono ricaricati.

## Import AI mancanti completati — 12 novembre 2026

Questa sezione aggiorna lo stato precedente degli ingressi mancanti, conservato sopra come resoconto dell'11 novembre.

- [x] Appaltatore a corpo e a misura: stesso popup AI e modulo nativo, conferma di committente/listino, IVA e stato iniziale. Stima a misura separata dai crediti, nessuna rata sulla stima. Salvataggi Demo O-0099 e O-0093 verificati.
- [x] Generale appalto: import dal percorso di creazione e dall'editor Contratto e SAL esistente, con base/ribasso/sicurezza, CIG/CUP, anticipazione, ritenute, date e penali. O-0094 verificata a 95.000 €; RTI richiede la verifica della quota senza precompilare il totale del gruppo.
- [x] Business plan PDF/immagini nella stessa anteprima Excel: scenari separati, conferma, importi/categorie/mesi modificabili, dati mancanti evidenti, originale privato e doppioni bloccati. O-0095: sei voci, 340.000 € di costi e 500.000 € di ricavi.
- [x] Simulatore: medesima anteprima, nuova ipotesi senza sovrascrivere quelle salvate, importazione di unità/fonti solo se presenti, verifica prima della trasformazione. O-0096: due unità, tre fonti, piano e originale trasferiti, nessun versamento inventato.
- [x] Conferme e valori visibili allineati: stato esplicito per l'appaltatore importato, campi numerici del contratto aggiornati anche dopo Apply RTI, parametri del simulatore coerenti con le voci confermate. Corretto il sottotitolo del margine per distinguere piano e oneri del debito.
- [x] Download degli originali PDF dal piano e dalla commessa trasformata verificati identici al file caricato. Persistenza e assenza di duplicazioni controllate in lettura dopo i salvataggi nativi.

Aggiornato l'estrattore AI connesso alla versione 97 con gli stessi controlli di accesso; frontend soltanto locale, nessuna migrazione. Dettagli, identificativi ed evidenze nella sezione «Completamento degli import AI — 12 novembre 2026» dell'audit. Localhost mantenuto tramite il LaunchAgent esistente.

- [x] Verifica conclusiva: 153 file / 1.976 test superati, TypeScript del perimetro e controllo diff superati. Localhost HTTP 200 e LaunchAgent running con riavvio automatico; scheda della O-0096 lasciata disponibile come risultato.
