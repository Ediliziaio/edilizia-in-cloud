# Commessa: economia, documenti e pagamenti coerenti

Data: 28 ottobre 2026. Stato: audit iniziale e piano; primo ciclo implementato e collaudato nella sezione 11. Le sezioni precedenti conservano la fotografia iniziale, non attestano che tutte le fasi siano già concluse.

## 1. Esito del riesame

L'impianto contiene già le principali entità, ma non esiste ancora un flusso uniforme di registrazione e riconciliazione delle uscite. Non basta separare le schede nell'interfaccia: occorre prima rendere coerenti pagamento, residuo, scadenze, Prima Nota e abbinamento bancario.

Questo riesame ha letto codice locale, definizioni di funzioni/trigger/indici del database remoto e conteggi aggregati della sola azienda DEMO. Ha eseguito test esistenti senza registrare pagamenti. Non è una verifica completa dei dati di tutte le aziende, del frontend pubblicato o di tutte le sessioni contemporanee.

Obiettivo: un pagamento si registra una sola volta e si consulta da fattura, acquisti, noleggio, subappalto e commessa. La banca può confermare un pagamento già registrato senza crearne un secondo. Ogni importo deve avere un'origine verificabile.

## 2. Cosa è già presente e va preservato

| Area | Evidenza attuale | Limite del risultato |
| --- | --- | --- |
| Fornitori della commessa | `useSupplierPayments` legge OdA, fatture ricevute, costi collegati, Prima Nota e scadenze; paginazione e separazione aziendale | È un modello di lettura, non una registrazione unificata |
| Budget materiali | I flag degli articoli sono trattati come stime, non come prova di pagamento | Restano percorsi di scrittura storici sugli articoli da censire e instradare |
| Noleggi e mezzi | Preventivo distinto; `mezzi_piani_spese` classifica costi/OdA già esistenti | La classificazione non crea un pagamento né una nuova fattura |
| Marginalità | Il costo contabile collegato all'OdA sostituisce la base stimata dell'ordine nel relativo aggregato | Verificare separatamente resi, allocazioni e contabilità subappalti prima di estendere le formule |
| Scadenzario | `mark_scadenza_paid` registra Prima Nota e aggiornamento scadenza nella stessa chiamata database, con controllo azienda e permesso | Mancano lock sulla lettura iniziale e chiave esplicita di idempotenza |
| Incassi fatture interne | `riconcilia_bonifico_fattura` blocca movimento/fattura, usa la data bancaria, richiama l'incasso atomico e collega la Prima Nota | Percorso di entrata: non confonderlo con il pagamento delle fatture ricevute |
| Subappalti | Contratto, SAL, misure, fatture collegate, garanzie e avvisi di incoerenza esistono già | Il pagamento SAL resta rappresentato principalmente dal suo stato |
| Garanzie | Creazione SAL/garanzia già atomica; svincolo distinto da pagamento | Da collegare alla futura allocazione dei pagamenti, senza duplicare la cassa |

Riferimenti: `src/hooks/useSupplierPayments.ts`, `src/lib/orders/supplierPaymentSummary.ts`, `src/hooks/useMezziPianoEconomia.ts`, `src/lib/mezzi/economiaPiani.ts`, `src/lib/subappaltatori/riconciliazioneContratto.ts`, `docs/piano-mezzi-attrezzature.md` e gli ultimi cicli di `docs/plans/2026-10-27-sal-verbali-subappalti-avanzamento.md`. Le lacune iniziali di quel piano non vanno considerate tutte ancora aperte.

## 3. Lacune confermate e rischi da provare

### P0 — Integrità delle registrazioni

1. **Costi e contabilità OdA salvano in più passaggi.** `useCompanyCostsMutations` (singolo e bulk) e `OdaAccountingCard` aggiornano `company_costs.is_paid`, poi inseriscono la Prima Nota. Il codice gestisce esplicitamente il caso di pagamento salvato con scrittura contabile fallita. Lo stato può quindi divergere. L'annullamento del costo elimina inoltre le righe automatiche con una seconda richiesta.
2. **Il controllo “già esistente” non sostituisce un vincolo.** Per `auto_source=company_cost_payment` è usata una lettura prima dell'inserimento; negli indici univoci remoti esaminati non compare una protezione specifica contro la stessa operazione costo ripetuta. Serve idempotenza per operazione, consentendo però più acconti legittimi sul medesimo costo.
3. **Concorrenza nello scadenzario.** La funzione remota legge la scadenza senza `FOR UPDATE` e calcola il nuovo cumulato da quel valore. Due richieste contemporanee possono leggere lo stesso residuo. È un rischio strutturale riscontrato nella definizione, non una collisione già riprodotta su dati reali. Aggiungere lock, controllo stato valido, importi non nulli/finiti e idempotenza.
4. **Pagamento SAL separato dalla cassa.** `SubappaltatoreDetail.registraPagamentoMutation` aggiorna stato/data/metodo/riferimento del SAL senza registrare direttamente un movimento monetario condiviso. I trigger SAL remoti esaminati gestiscono coerenza di misure, commessa e garanzie, non la creazione della Prima Nota. Il riepilogo contratto calcola oggi il pagato dal netto dei SAL con stato `pagato`; non è uno storico di acconti parziali.
5. **Riconciliazione delle uscite a più richieste.** `CompanyCostsManager.paySingleCostFromBank` registra prima il pagamento per origine, poi marca la transazione bancaria. Se l'ultimo aggiornamento fallisce il codice avvisa ma il pagamento resta. Per alcune origini derivate non esiste un `linked_cost_id`: verificare che tutti i lettori escludano anche i movimenti già riconciliati tramite gli altri riferimenti.

### P1 — Coerenza delle viste e casi complessi

6. **Aggiornamenti delle cache incompleti.** I costi invalidano principalmente costi/cashflow; lo scadenzario invalida scadenze/Prima Nota/cashflow; la contabilità OdA invalida OdA e due prefissi storici della Prima Nota. Non è definito un aggiornamento comune di riepilogo fornitori, esposizione, contratto, noleggi e commessa. Il refresh a 60 secondi del riepilogo fornitori è una rete di recupero, non una garanzia immediata.
7. **Confronto tra due rappresentazioni senza riconciliazione esplicita.** `supplierPaymentSummary` usa il massimo fra pagato scadenze e cassa, evitando di sommarli due volte. Questo non dimostra che i due valori descrivano esattamente gli stessi movimenti; una differenza sotto il totale può non diventare un avviso. Servono collegamenti per singola operazione e controlli di scostamento, non un'altra somma.
8. **Banca e fatture del registro `invoices`: percorso storico distinto.** La riconciliazione non interna in `BankReconciliation` aggiorna transazione, riconciliazione e `invoice_payments` con richieste separate e compensazioni. Usa la data odierna per il pagamento, a differenza del percorso interno che usa la data bancaria. Due trigger remoti ricalcolano il pagato delle fatture native: riesaminare la responsabilità unica del ricalcolo e i casi storno parziale. Le fatture importate hanno invece una fonte esterna da rispettare.
9. **Ripartizioni bancarie limitate.** L'indice remoto `bank_reconciliations_active_tx_uidx` ammette una sola riconciliazione attiva per transazione. Non eliminare il vincolo per abilitare più fatture: mantenere una testata unica e progettare allocazioni figlie con cap sul totale. La differenza fra importo bancario e importo abbinato deve rimanere visibile e gestibile.
10. **Navigazione da separare.** `ECONOMIA_VIEWS` raggruppa ancora “Varianti, SAL e documenti”; alcuni collegamenti fornitori aprono altre pagine. Separare gli scopi conservando filtri, contesto e vecchi URL.

### Riscontro dati DEMO, senza correzioni automatiche

La query aggregata su `Demo Azienda 2 S.r.l.` ha trovato 1.001 costi con `is_paid=true`; 9 non hanno una Prima Nota collegata direttamente tramite `cost_id`. Non risultano gruppi duplicati per `cost_id` e `auto_source=company_cost_payment` nel perimetro interrogato.

Un secondo controllo sui 9 casi non ha trovato OdA collegati, scadenze con `paid_amount>0` collegate tramite `cost_id`, né Prima Nota raggiungibile tramite `fatture_ricevute.company_cost_id` e `prima_nota_id`. Questo restringe le possibili spiegazioni, ma non ricostruisce i giustificativi storici.

I 9 casi sono **segnalazioni da riconciliare**, non nove pagamenti mancanti dimostrati: potrebbero esserci riferimenti indiretti, dati storici o rappresentazioni alternative. Non creare uscite per “ripararli” senza ricostruire l'origine. Il conteggio non esclude duplicazioni con altri riferimenti o in altre aziende.

## 4. Regole del flusso definitivo

| Grandezza | Fonte e significato | Regola |
| --- | --- | --- |
| Previsto | Budget, articoli, piano noleggio, contratto | Non è denaro uscito né fattura |
| Impegnato | Ordini/contratti accettati secondo gli stati pertinenti | Non sommare all'effettivo come se fosse un altro costo |
| Eseguito/riconosciuto | Rapportini, misure e SAL approvati | Separato da fatturato ed esigibile |
| Costo di commessa | Fonti contabili e allocazioni canoniche già usate dalla marginalità | La stessa spesa compare una volta, anche se consultabile da più sezioni |
| Debito documentato | Fattura ricevuta e relative scadenze | Calcolato sul dovuto effettivo del documento |
| Maturato senza fattura | Importi contrattualmente maturati ma non ancora documentati | Visibile separatamente; non inventare fatture o movimenti |
| Pagato | Operazioni monetarie valide, al netto di storni, allocate al debito pertinente | Mai dedotto soltanto da uno stato manuale del SAL o dell'articolo |
| Riconciliato | Collegamento del pagamento al movimento bancario | Conferma l'operazione, non aggiunge un'altra uscita |
| Trattenuto/svincolato | Registro garanzie e sue condizioni | Lo svincolo rende disponibile la quota, non dimostra un pagamento |

Il conto economico e il margine mantengono la base dei costi canonici. Cassa e residui utilizzano il dovuto monetario del documento. Non applicare indistintamente il 22% o confondere il “netto SAL” dopo garanzia con l'imponibile fiscale: usare riepiloghi IVA, natura, acconti, arrotondamenti e regime del documento effettivo. Per una spesa senza fattura esplicitare la base stimata e riconciliarla quando il documento arriva.

Un materiale scaricato dal magazzino, un OdA e una fattura possono descrivere la stessa fornitura: verificare le regole di provenienza e valorizzazione prima di sommare i tre aggregati. Analogo controllo per costi di squadre esterne rispetto a contratti/SAL e fatture dei subappaltatori.

### Percorso operativo semplice

1. **Materiali:** articolo/fabbisogno → OdA → DDT → fattura collegata → scadenze → pagamento → eventuale banca. La consegna aggiorna quantità, non il pagato.
2. **Noleggi:** assegnazione e periodo → preventivo → costo/OdA/fattura esistente collegato → stessa scadenza e stesso pagamento. Il preventivo resta confrontabile con il consuntivo e non vi si aggiunge.
3. **Subappalti:** contratto e modalità → misure/avanzamento → SAL riconosciuto → quota maturata/garanzia → fattura collegata → pagamento allocato. Il pagamento può riferirsi a più SAL o a una quota; fattura e SAL devono mostrare la medesima operazione.
4. **Cliente:** variante approvata aggiorna il valore pertinente → SAL determina maturazione → documento/rata e incasso usano i flussi atomici esistenti. Generare il verbale non incassa una rata. Rispettare il percorso separato dei lavori pubblici e le fatture importate.

## 5. Modello tecnico da completare, senza un secondo libro di cassa

- Censire le operazioni già esistenti in Prima Nota, movimenti fiscali, `invoice_payments`, scadenze e riconciliazioni. Identificare la fonte canonica per ciascun dominio e i riferimenti mancanti prima della DDL. `invoice_payments` appartiene al relativo registro fatture: non inserirvi indiscriminatamente pagamenti di `fatture_ricevute`.
- Unificare i comandi server di registrazione, allocazione, riconciliazione e storno; riusare i registri esistenti. Aggiungere soltanto le relazioni di allocazione e i metadati necessari: riferimento operazione, fonte, azienda, autore, data, chiave idempotente e motivazione dello storno.
- Ogni comando esegue autorizzazione, lock in ordine stabile, verifica del residuo, scritture monetarie e aggiornamenti delle proiezioni nella stessa transazione. Le restrizioni client non sono protezioni sufficienti.
- Una richiesta ripetuta con la stessa chiave e lo stesso contenuto restituisce l'esito precedente. La stessa chiave con contenuto diverso è rifiutata. Due acconti differenti sullo stesso documento restano consentiti.
- Il pagamento può essere allocato a più documenti/scadenze; ciascun documento può ricevere più pagamenti. Somma delle allocazioni non superiore all'importo disponibile; eccedenze come anticipi o importi da attribuire espliciti.
- La ripartizione del costo fra commesse è distinta dall'allocazione del pagamento alle fatture. Un pagamento aziendale di una fattura condivisa non diventa un pagamento completo in ciascuna commessa.
- Storno tracciato e collegato all'originale; aggiornamento atomico di residui e abbinamenti. Evitare eliminazioni silenziose dello storico e riaperture automatiche di documenti senza verifica del loro stato.
- Sincronizzazioni esterne mediante eventi/richieste idempotenti con tentativi e stato visibile. Un errore di invio al gestionale esterno non deve ripetere il pagamento locale.
- Controllare autorizzazioni economiche, azienda e commessa anche sulle funzioni server; operaio e subappaltatore non ricevono importi o documenti riservati attraverso riepiloghi o eventi realtime.

### Pagamento manuale e arrivo successivo della banca

Il popup unico “Registra pagamento già eseguito” propone residuo, data, metodo, conto/cassa, importo anche parziale, riferimento e allegato facoltativo. Mostra ciò che verrà aggiornato e non dispone bonifici.

Quando arriva un movimento bancario, cercare prima operazioni compatibili già registrate. Presentare “Collega al pagamento esistente” oppure “Registra nuovo pagamento”; mai la seconda azione come automatismo se esiste un candidato ambiguo. Data registrata, data bancaria e data di riconciliazione restano distinguibili. La banca può mancare: il pagamento manuale resta valido e risulta “Non riconciliato”.

### Condizioni e casi da gestire espressamente

Scadenze strutturate: evento di riferimento (fattura, approvazione SAL, consegna, fine lavori), giorni, eventuale fine mese, quote, anticipo/saldo e condizioni specifiche. Non imporre una condizione di incasso del cliente a tutti i subappalti. Ritenute, condizioni documentali e deroghe devono provenire dal contratto/configurazione, con motivazione e permessi per le eccezioni.

Prevedere note di credito, rimborsi, anticipi poi assorbiti dalla fattura, fatture cumulative, fatture su più commesse, rate, pagamenti parziali, commissioni bancarie, resi, annullamenti e documenti importati due volte. Casi con valuta diversa richiedono importo/valuta origine e cambio: mantenerli da verificare finché il flusso non li supporta. Eventuali blocchi documentali non cancellano il debito o il pagamento effettivamente avvenuto.

## 6. Interfaccia della commessa

Economia e pagamenti: **Riepilogo · Incassi e pagamenti · Manodopera e subappalti · Varianti · SAL · Documenti**.

- Riepilogo: previsto, costo registrato, ricavi pertinenti, margine e scostamenti; incassato/pagato in un riepilogo monetario distinto. La stessa metrica conserva significato e base IVA in tutte le schede.
- Incassi e pagamenti: tabella unica filtrabile per entrata/uscita, controparte, tipo, stato, scadenza e commessa. Colonne documento, dovuto, pagato, residuo, scadenza, riconciliazione; mostrare la fonte e i casi da verificare.
- SAL: cliente e subappalti chiaramente distinti; eseguito, riconosciuto, fatturato, pagato e garanzia non confluiscono in un solo stato. Il verbale è uno snapshot numerato/versionato delle evidenze del SAL, non una sorgente ulteriore di importi.
- Documenti: fatture e allegati con collegamenti ai fatti economici; caricare un PDF non registra da solo un costo o un pagamento.
- Materiali e acquisti conserva articoli, OdA, DDT, fatture e magazzino. La fattura qui e in Economia apre lo stesso dettaglio con lo stesso residuo.
- Clic sulla riga apre il dettaglio in popup nella commessa. Nel dettaglio si aprono sotto-sezioni o un livello contestuale successivo con ritorno riconoscibile; evitare pile di popup sovrapposti e nuove pagine obbligatorie.
- Azioni e icone nello spazio già disponibile, senza una fascia vuota dedicata. Filtri compatti, nomi ricercabili, selettori coerenti con gli altri moduli, importi e date leggibili anche su schermi stretti.
- Stati monetari: Da pagare / Parziale / Pagata / Da verificare. Riconciliazione è un indicatore separato; SAL contestato e fattura scartata mantengono lo stato del proprio dominio.
- Compatibilità URL: adeguare `detailNavigation.ts`, resolver `section-sal`, `section-varianti`, `section-fatturazione`, vecchio `vista_economia=documenti`, pulsanti e test di composizione. Rispettare indietro/avanti, scheda attiva e filtri dopo la chiusura.

## 7. Matrice degli aggiornamenti

| Evento confermato | Proiezioni da aggiornare | Cosa non cambia per quell'evento |
| --- | --- | --- |
| Pagamento / acconto / storno | Residui, scadenze, Prima Nota, cashflow, esposizione, fornitori commessa, contabilità contratto e dettaglio noleggio collegato | Quantità eseguite e margine non cambiano soltanto perché esce denaro |
| Abbinamento bancario a pagamento esistente | Collegamenti, stato riconciliazione, disponibilità del movimento e controlli di coerenza | Nessun secondo pagamento/costo |
| Fattura contabilizzata / nota di credito | Fonte costo, dovuto, scadenze, aggregati commessa, allocazioni e residuo | Nessun pagamento inventato |
| SAL approvato / contestato | Eseguito riconosciuto, maturazione, garanzia e copertura fatture; eventuale costo secondo fonte canonica verificata | Nessun movimento di cassa automatico |
| Svincolo garanzia | Quota svincolata, esigibilità, scadenze collegate secondo contratto | Nessuna uscita finché non è registrata |
| Variazione costo o allocazione commessa | Marginalità, budget/consuntivo mezzi, fornitori e fonte della ripartizione | Nessuna nuova spesa per la sola classificazione |
| Variante approvata | Valore contrattuale, budget/ricavi previsti e basi SAL pertinenti | Nessuna fattura/incasso automatico |

Implementare invalidazioni condivise per azienda/commessa/contratto/documento dopo il commit. Uniformare i prefissi storici `prima-nota`/`primaNota` senza rompere i lettori. Per altre finestre/sessioni prevedere notifiche dei cambi autorizzate e refetch: verificare le subscription già esistenti prima di aggiungerne di nuove. Dopo una disconnessione riconciliare al rientro/focus; mostrare caricamento, ultimo aggiornamento ed errore senza presentare vecchi importi come appena confermati.

## 8. Sequenza di implementazione e criteri di chiusura

### A — Inventario e riconciliazione iniziale (prima delle scritture)

- Censire ogni pulsante/RPC/trigger/Edge/automazione che registra o annulla pagamenti, compresi articoli, squadre esterne, commissioni, rate e importazioni.
- Report read-only per azienda: stati senza operazione, operazioni senza documento, scadenze difformi, importi duplicati, pagamenti oltre residuo, SAL/fatture/garanzie non coperti, allocazioni eccedenti.
- Spiegare i 9 casi DEMO con evidenze e produrre un'anteprima della riconciliazione. Nessun backfill basato soltanto su `is_paid` o sullo stato SAL.
- Uscita: mappa delle fonti, schema di allocazione approvato tecnicamente e fixture riproducibili.

### B — Registrazione delle uscite atomica (priorità P0)

- Comando condiviso per singolo, bulk e pagamento parziale; lock/idempotenza/vincoli; collegamento costo-fattura-scadenza-cassa.
- Adeguare scadenzario, Costi, OdA e riconciliazione bancaria; ripetizione sicura dopo timeout e storno tracciato.
- Conservare il percorso atomico degli incassi interni e verificare regressioni sui registri fatture importati.
- Uscita: nessun percorso migrato conclude con stato pagato e cassa incompleta; test di concorrenza e rollback passati.

### C — Subappalti, garanzie e condizioni

- Derivare pagato/residuo dalle operazioni allocate, migrare gli stati SAL storici solo con evidenze sufficienti.
- Pagamenti parziali, una fattura per più SAL e una disposizione per più fatture; quote di garanzia e anticipi coerenti.
- Separare eseguito, riconosciuto, fatturato, esigibile, trattenuto, svincolato e pagato nei totali e nei verbali.
- Uscita: medesimo pagamento visibile da scheda subappaltatore, contratto, fattura, commessa e Prima Nota senza doppio costo.

### D — Navigazione e UX condivisa

- Separare Varianti/SAL/Documenti; tabella pagamenti e popup unico; dettaglio contestuale di fatture, costi, contratti, SAL, garanzie e noleggi.
- Invalidazioni/eventi condivisi e test di aggiornamento con due sessioni autorizzate.
- Uscita: dopo salvataggio non serve ricaricare manualmente la pagina; chiudendo il popup si ritrovano filtri, selezione e contesto.

### E — Migrazione controllata e rilascio

- DDL additive, vincoli e funzioni revisionati, prove in DEMO, backfill in anteprima e per lotti idempotenti con report prima/dopo.
- Per storici ambigui mantenere “Da verificare”, senza azzerare o trasformare importi sconosciuti in pagamenti.
- Attivazione graduale per azienda; nessuna doppia scrittura fra percorso vecchio e nuovo. Durante il passaggio, instradare tutte le entry point al comando condiviso.
- Rollback della UI/attivazione senza eliminare operazioni finanziarie o riprodurle. Audit degli storni e contatori di differenze; gestione esplicita dei retry delle integrazioni esterne.
- Pubblicazione frontend e migrazioni backend vanno verificate separatamente. Questo piano non certifica allineamento del sito in produzione al codice locale.

## 9. Collaudo obbligatorio prima di dichiarare chiuso il flusso

Fixture solo DEMO, riconoscibili e senza invio di bonifici, email o documenti fiscali reali.

| Caso | Risultato atteso |
| --- | --- |
| Fattura ordinaria 1.000 + IVA 220, acconto 400 poi 820 | Costo base canonica 1.000; cassa 1.220; residuo 820 poi zero; due sole operazioni |
| Banca importa i 400 già registrati | Collegamento al pagamento esistente, cassa ancora 400 |
| Doppio clic / timeout / retry stessa richiesta | Un solo pagamento; risposta ripetibile |
| Due sessioni pagano contemporaneamente l'ultimo residuo | Una operazione valida; seconda respinta o riesaminata senza sovrapagare |
| Errore fra pagamento e aggiornamento scadenza/Prima Nota | Rollback completo, nessuno stato parziale |
| Bonifico per due fatture e due bonifici per una fattura | Allocazioni corrette; somme entro disponibilità, residui coerenti |
| Bonifico superiore alla fattura | Eccedenza identificata e disponibile; non persa né incassata due volte |
| Pagamento senza banca, banca collegata mesi dopo | Unica operazione, date distinte e traccia dell'abbinamento |
| Noleggio previsto 570, fattura contabilizzata sul medesimo costo | Budget 570 distinto dal costo; pagamento registrato una volta |
| OdA, carico/scarico magazzino e fattura della stessa fornitura | Provenienza del costo dimostrabile; nessuna duplicazione dei consumi |
| Fattura ripartita fra due commesse | Pagamento aziendale unico; quote commessa motivate e non superiori al totale |
| SAL riconosciuto 1.000, garanzia 50, due acconti sulla quota disponibile | Garanzia 50 distinta; pagato da operazioni, quota disponibile residua corretta; IVA secondo documento |
| Svincolo della garanzia, poi pagamento della quota | Svincolo senza cassa; cassa cambia soltanto al pagamento |
| Anticipo, fattura successiva e assorbimento | Nessun nuovo esborso per il solo arrivo del documento |
| Nota di credito/rimborso/storno parziale | Debito/cassa/margine secondo evento; storico preservato; stato pagata ricalcolato correttamente |
| Fattura importata e write-back esterno fallito | Stato sincronizzazione visibile; nessun nuovo pagamento al retry |
| Costo pagato da altra schermata con commessa già aperta | Tutti i residui/totali autorizzati si aggiornano dopo commit |
| Operaio, subappaltatore, sola lettura, azienda diversa | Nessuna lettura economica o registrazione non autorizzata |
| Vecchio URL e indietro/avanti dopo un popup | Sezione corretta, contesto e filtri conservati |

Verificare anche documenti assenti, caricamento/errori, archivi lunghi con paginazione, allocazioni modificate successivamente, scadenze multiple per fattura e note di credito oltre il residuo. Un report di assenza duplicati deve confrontare identità e provenienza, non solo importi coincidenti.

## 10. Verifiche eseguite in questo riesame

- Lettura remota di `mark_scadenza_paid`, `riconcilia_bonifico_fattura`, `auto_reconcile_invoice_payment`, `fn_update_invoice_on_payment`, `trg_update_paid_amount`, `sal_sub_ritenuta_segue_stato`, relativi trigger e indici univoci dei registri esaminati.
- Lettura dei percorsi locali di Costi/OdA/Scadenzario/Banca/Subappalti e dei riepiloghi fornitori, contratto, mezzi e navigazione commessa.
- Sei file Vitest, **87 test passati**: `supplierPaymentSummary`, `supplierPaymentQueries`, `riconciliazioneSubappalto`, `banking`, UI `supplierPaymentsCard` e `contabilitaSubappalto`. Log: `/tmp/economia-pagamenti-audit-2810-tests.log`.
- Questi test non sono prove end-to-end di pagamento, concorrenza SQL, autorizzazione di tutte le RPC o aggiornamento realtime fra sessioni. Le prove della sezione 9 restano da implementare/eseguire.
- Nessun pagamento, storno, fattura, riconciliazione o migrazione eseguiti durante questo audit. Creato soltanto questo piano nel repository.

## 11. Primo ciclo implementato: pagamento unico e dettagli contestuali

Questo ciclo è successivo all'audit della sezione 10. Ha applicato modifiche di schema/funzioni ed eseguito registrazioni **simulate nella sola azienda DEMO**. Nessun bonifico è stato disposto.

### Registrazione e collegamenti

- Prima Nota resta il registro monetario. Chiave richiesta e contenuto impediscono di ripetere la medesima registrazione; riutilizzare una chiave con dati diversi è rifiutato. Lock aziendale e di riga serializzano le operazioni concorrenti.
- `registra_pagamento_costo` registra acconti/saldo, stato del costo e scadenze nella stessa transazione. Il dovuto usa le fatture effettivamente collegate, ove disponibili; il pagamento non modifica l'imponibile della spesa.
- Singolo e lotto dalla pagina Costi utilizzano le nuove funzioni; il lotto è una transazione e fallisce integralmente se un costo non può essere registrato. Gli storni producono una controscrittura collegata, conservando lo storico. Pagamenti già collegati a SAL o banca richiedono la riconciliazione dei collegamenti prima dello storno generico.
- `mark_scadenza_paid_con_richiesta` protegge scadenze, residuo e Prima Nota con lock e idempotenza, collegando anche il costo. La firma precedente resta compatibile per gli altri chiamanti.
- `sal_sub_pagamenti` contiene **quote attribuite a pagamenti esistenti**, non movimenti monetari aggiuntivi. Supporta più pagamenti per un SAL e attribuzioni successive dello stesso pagamento entro la disponibilità.
- `registra_pagamento_sal_sub` registra o collega il pagamento e aggiorna il cumulato SAL. Se la fattura è già pagata, il popup propone il pagamento esistente. Se la fattura arriva dopo il pagamento SAL, `collega_pagamento_sal_fattura` attribuisce la stessa Prima Nota al costo senza una seconda uscita.
- `pagato_registrato` permette ai riepiloghi di commessa, contratto e SAL di mostrare gli acconti. I vecchi SAL pagati senza evidenza non vengono trasformati automaticamente in nuove uscite: restano da riconciliare.
- Lo svincolo della garanzia rimane distinto da una registrazione di pagamento.

### Banca, compreso il percorso automatico

- Il popup collega un addebito libero dello stesso importo al pagamento selezionato. Il collegamento lascia invariati cassa e residuo.
- `riconcilia_uscita_scadenza` sostituisce le scritture separate della schermata Banca e del ramo uscite di `bank-auto-reconcile`: banca, riconciliazione, scadenza, costo ed eventuale Prima Nota vengono salvati insieme.
- I casi con pagamento preesistente ambiguo o addebito superiore al residuo si fermano senza nuove scritture. Non si registra automaticamente un secondo pagamento per risolverli.
- Scollegare una nuova riconciliazione bancaria conserva il pagamento già registrato; l'eventuale annullamento contabile è un'operazione distinta.
- La Edge `bank-auto-reconcile` è stata pubblicata come **versione 121** dopo il controllo Deno, riutilizzando i file condivisi della versione remota precedente. Non sono state pubblicate indiscriminatamente altre modifiche presenti nel checkout.
- È stato mantenuto il controllo JWT utente/cron già esistente. Prima del lavoro con privilegi server, le richieste dell'app verificano anche gestione scadenze e sola lettura con il JWT dell'utente. Le chiamate senza autenticazione restituiscono 401. Il ruolo di servizio è consentito soltanto come contesto server autenticato, non tramite metadati modificabili dall'utente.

### Interfaccia e aggiornamenti

- Varianti, SAL e Documenti sono viste distinte; le ancore e i resolver sono stati aggiornati conservando gli URL di Documenti.
- Il popup condiviso della spesa mostra dovuto, pagato, residuo, storico e riconciliazione. Si apre da fatture della commessa, riepilogo fornitori, contabilità OdA e spese del mezzo/noleggio.
- Gli OdA nel riepilogo fornitori e i collegamenti OdA del noleggio aprono un popup contabile, senza abbandonare la commessa.
- Il popup SAL distingue registrazione nuova da attribuzione esistente, propone quest'ultima quando disponibile e precompila la quota disponibile. I riepiloghi mostrano pagato e residuo parziali.
- Le invalidazioni delle letture finanziarie sono condivise. Fra finestre della stessa origine il commit viene notificato senza trasferire dati economici nel messaggio. Rientro/focus e controllo ogni 30 secondi recuperano aggiornamenti di altre sessioni/origini; non è una promessa di realtime istantaneo fra domini diversi.
- Anche la schermata Banca, che usa stato locale, ricarica i dati in risposta all'aggiornamento finanziario.

### Migrazioni applicate e allineate al registro remoto

1. `20281028060000_pagamenti_spese_atomici.sql`
2. `20281028060010_pagamenti_spese_collaudo_correzioni.sql`
3. `20281028060020_pagamenti_collegamenti_banca_sal.sql`
4. `20281028060030_pagamenti_quote_sal_incrementali.sql`
5. `20281028060040_riconciliazione_uscite_atomica.sql`

Le tabelle nuove hanno RLS; le quote SAL non sono scrivibili direttamente dal client. Le funzioni con privilegi elevati sono intenzionali e verificano azienda, utente e permessi prima dei dati. L'advisor segnala tali RPC autenticate come `SECURITY DEFINER`: è un'esposizione controllata e documentata, non un esito “zero avvisi” dell'intero progetto.

### Evidenza DEMO e collaudo

- **213 test UI/logica** sul perimetro verificato: suite di regressione da 212 test più il caso aggiunto del popup SAL che riutilizza il pagamento e precompila l'importo disponibile; nessun caso preesistente rimosso.
- **24 verifiche SQL con rollback** nei tre script `scripts/sql/pagamenti-spese-collaudo.sql`, `scripts/sql/pagamenti-collegamenti-collaudo.sql`, `scripts/sql/riconciliazione-uscite-atomica-collaudo.sql`. Coprono retry, chiave riutilizzata, acconti, saldo, storno, errore nel secondo elemento del lotto, collegamento fattura/SAL, disponibilità delle quote, banca e contesto cron service-role.
- Prova concorrente separata: due richieste da 10 € sul medesimo costo DEMO sono state avviate insieme; una accettata e una respinta, una sola uscita. Registrazione poi stornata con storico conservato. Fixture: `5c4a843d-bfe9-4de6-96b5-dcef41ba6d1d`.
- Controllo TypeScript mirato su **23 file**, zero errori; lint sul nuovo nucleo, zero errori. Nei file storici restano avvisi di tipizzazione `any`, non eliminati mascherandoli. Build frontend e controllo Deno dell'Edge superati.
- Browser: dalla fattura della commessa è stato registrato un acconto simulato da 100 €. La seconda finestra ha mostrato il cambiamento senza ricarica; lo stesso pagamento è stato collegato a banca e SAL, poi riaperto dal noleggio.
- Risultato persistente del collaudo: costo netto **570 €**, fattura **695,40 €**, **una sola uscita di 100 €**, residuo fattura **595,40 €**; quota pagata SAL **100 €**, residuo SAL **441,50 €**, garanzia **28,50 €** invariata. Il residuo SAL e quello della fattura hanno basi differenti e sono mostrati separatamente.
- Commessa: `ec5bff4e-c812-4c77-b94a-940eb3a213b1`; costo: `1bb12fb2-b7d7-4294-8b40-6cfc6f1ae627`; contratto DEMO: `b0d837d4-1e2c-4dfd-8659-82cbdab14aa4`; SAL: `ec31115a-44f5-4904-abd5-49f2c116edec`; fattura: `90478abe-987a-404c-923e-e8e3b39287b1`; movimento bancario simulato: `ef7d210b-eb5a-48ac-be22-7ad12ea50dae`.
- Screenshot e log sono raccolti in `/Users/agenteai/Documents/Codex/2026-10-13/rir/outputs/pagamenti-2810/`.

### Parti del piano ancora aperte

Il ciclo chiude la registrazione condivisa nei percorsi descritti; non conclude tutte le integrazioni storiche e tutti i casi fiscali:

- ripartizione di un unico movimento bancario fra più fatture, eccedenze e valute diverse richiedono il livello di allocazione bancaria previsto nel piano; oggi i casi non supportati sono rifiutati, non forzati;
- condizioni contrattuali, scadenze per evento, esigibilità, anticipi e trattenute con basi fiscali particolari richiedono una rappresentazione strutturata delle quote documento/SAL; il netto SAL non è trattato come se fosse sempre il totale della fattura;
- rimborsi, note di credito complesse e storno di pagamenti già distribuiti fra SAL/garanzie richiedono un flusso dedicato di annullamento delle attribuzioni, con audit;
- percorsi storici derivati da articoli, commissioni, squadre esterne e incassi di fatture esterne vanno migrati con lo stesso criterio, senza cambiare i registri fiscali per deduzione;
- i 9 casi storici segnalati nell'audit non sono stati “riparati” aggiungendo cassa;
- frontend modificato e verificato in locale, **non pubblicato su main in questo ciclo**. Schema e Edge sopra indicati sono aggiornati sul backend. Il checkout contiene molte altre modifiche pregresse: nessun push globale o staging indiscriminato.

### Riallineamento del rilascio, 28 ottobre 2026

Integrati i 30 commit upstream successivi al punto di partenza locale, preservando il nuovo collegamento Distyra e le fatture importate nel registro IVA. Migrazioni office rinominate secondo il registro reale, senza ripetere DDL; parità verificata su 5.277 versioni. Attivata e collaudata anche la migrazione dei bonifici parlanti, con rollback completo delle prove demo. Rimosse dal rilascio le cache di analisi; spostato in una fixture mantenuta l’helper dei collaudi serramenti. Verificati build di produzione e test critici; ulteriori regressioni dei nuovi flussi incluse nel controllo esteso del rilascio.
