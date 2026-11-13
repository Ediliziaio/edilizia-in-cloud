# Tesoreria: sviluppo e collaudo

Aggiornamento richieste del 12 novembre 2026. Le funzionalità sono comuni a tutte le aziende. La scelta dei conti, il limite commerciale e i permessi restano configurazioni di ciascuna azienda: il limite di tre conti di Vulcano non va applicato indistintamente agli altri clienti.

## Risultato operativo

Panoramica → Conti e banche → Transazioni → Riconciliazione → Previsioni → Note spese → Impostazioni. I vecchi collegamenti a Conti e Connessioni continuano ad aprire la sezione unica.

Un movimento può riguardare più fatture, scadenze e pagamenti, e più commesse o destinatari. Tutte le informazioni si leggono nello stesso popup centrale, apribile dalla destra della riga, dallo stato o dal nome del movimento. «Collega» nella colonna Fatture e pagamenti apre direttamente la ricerca e la ripartizione; nella colonna Commesse apre i riferimenti gestionali.

## 1. Un bonifico, più abbinamenti

Il pannello mostra dati comunicati dalla banca, conto, data contabile, data valuta, controparte e IBAN, riferimento, importo e valuta. Lo stato in banca resta distinto dallo stato di riconciliazione.

Gli abbinamenti finanziari mostrano ogni documento o pagamento, la quota, le commesse collegate, il totale abbinato e il residuo. Una conferma non può superare il residuo del bonifico o del documento. I controlli sono anche nel database, dentro una transazione, e valgono per ogni azienda.

Due azioni differenti:

- **Registra incasso / pagamento:** registra un nuovo pagamento attraverso le procedure contabili esistenti. Più quote vengono confermate insieme: se una non è valida, nessuna viene salvata.
- **Collega pagamenti già registrati:** usa i pagamenti presenti in Prima nota come prova bancaria, senza crearli una seconda volta. La somma dei pagamenti selezionati non può superare il bonifico. Scollegare questa prova conserva i pagamenti originali.

Gli abbinamenti storici rimangono leggibili, senza essere convertiti automaticamente in nuove quote. Gli annulli seguono le regole del documento: annullare un incasso creato dalla riconciliazione può stornarlo; scollegare una prova preesistente conserva il pagamento. Lo storico rimane consultabile.

## 2. Commesse, fornitori, personale e mezzi

I collegamenti gestionali contengono tipo, riferimento, quota e nota. Si possono indicare più commesse, fornitori, dipendenti, cedolini e mezzi. Si sommano le quote dello stesso tipo; non si sommano fra loro fatture, commesse e persone che descrivono lo stesso denaro.

Questi riferimenti non creano costi, incassi o nuove registrazioni del personale. Collegare un cedolino non equivale a registrare un secondo stipendio né a modificarne automaticamente lo stato amministrativo. Per attestare il pagamento si collega il pagamento esistente oppure si usa una scadenza effettiva. I movimenti senza fattura conservano la registrazione delle spese e l’allegato della ricevuta attraverso il percorso già esistente.

Nella commessa compare l’elenco dei movimenti bancari collegati, con apertura del dettaglio in Tesoreria. L’importo complessivo del bonifico è distinto dalla quota attribuita alla commessa; quando la quota non è stata indicata, non viene inventata.

I riferimenti del personale sono riservati agli amministratori abilitati. Saldi, documenti, mezzi e commesse rispettano i permessi esistenti. Non vengono restituiti saldi attraverso il nuovo registro quando il ruolo non può leggerli.

## 3. Tabella, ricerca e note

Una riga per movimento. Le prime cinque colonne restano sempre in quest’ordine: Data, Controparte, Importo, Causale, Conto. Seguono le colonne configurabili per persona e azienda: stato, abbinato, residuo, documenti, commesse, altri riferimenti e note interne. Data valuta, categoria e riferimento sono disponibili fra le colonne aggiuntive. Il comando per aprire il dettaglio resta raggiungibile a destra. Anche il CSV segue l’ordine delle cinque colonne principali.

La causale ricevuta da Distyra viene dalla remittance bancaria (con il descrittore come ripiego quando manca): il gestionale conserva il testo e il riferimento separato. La colonna e il CSV mostrano la causale originale, consultabile per intero nel dettaglio, senza riscriverla come semplice etichetta.

Ricerca su causale, controparte, riferimento, note interne, documenti e collegamenti visibili. Sono riconosciuti importi italiani e date. Filtri: conto, direzione, valuta, categoria, periodo, intervallo di importo, stato e tipo di collegamento. Totali, conteggio, paginazione ed esportazione riguardano l’intero risultato filtrato, con importi separati per valuta.

Le note sono interne al gestionale: non vanno alla banca né sul PDF/XML della fattura. Il salvataggio controlla la revisione del movimento; una finestra vecchia non può sovrascrivere una nota aggiornata. In caso di errore la bozza resta nel pannello. Chiudere con modifiche non salvate richiede di scegliere se continuare a modificarle o scartarle.

## 4. Riconciliazione come coda di lavoro

Transazioni e Riconciliazione usano lo stesso registro, gli stessi filtri e lo stesso pannello. Riconciliazione apre direttamente i movimenti da lavorare, evitando due liste di bonifici e fatture sempre aperte.

Ciclo: **Da collegare → Da verificare → Parziale / Riconciliata**. «Trova corrispondenze» e l’analisi periodica producono proposte, senza registrare pagamenti. Gli abbinamenti annullati e le proposte scartate non vengono ripresentati automaticamente. La conferma rimane un’azione esplicita.

Il sistema distingue movimenti contabilizzati e ancora in attesa. Le conferme finanziarie richiedono la contabilizzazione bancaria. Per valute diverse dall’euro non viene applicato un cambio inventato.

## 5. Disegno di Conti e banche e Panoramica

Conti e banche: conteggio utilizzati/massimo, ricerca per banca/nome/IBAN, conti scelti e disponibili distinguibili, conferma della selezione, dettagli bancari richiudibili, ultimo aggiornamento ed errori leggibili. I conti manuali restano separati e non consumano i posti Distyra. Il limite può essere aumentato soltanto dal superadmin.

Colori accompagnati dal testo: verde collegato; giallo da confermare/riconnettere; rosso errore/disconnessione; neutro conto disponibile non scelto. Un conto non selezionato non è segnalato come guasto. La selezione non è automatica.

Panoramica: liquidità e flussi effettivi in alto, grafici di entrate/uscite e andamento del saldo, poi scadenze complessive dell’azienda, categorie e ultime operazioni. Gli impegni dello scadenzario non si sommano al saldo dei movimenti. Le RiBa restano disponibili fra i dettagli operativi, senza occupare la posizione principale. Non vengono mescolate valute differenti o numeri di tutto il gruppo con quelli della singola azienda.

## 6. Aggiornamento fra le pagine

Il salvataggio finanziario deve aggiornare i lettori della stessa informazione, anche in un’altra scheda già aperta. La notifica avviene dopo il salvataggio, senza letture ripetute ogni pochi secondi.

| Operazione | Dati da rileggere |
| --- | --- |
| Incasso su fattura emessa nativa/importata | Residuo e storico fattura, Prima nota, scadenzario, rate/commessa, Tesoreria, statistiche fatturazione |
| Pagamento di fattura ricevuta / scadenza | Rate fornitore, costo, fattura ricevuta, Prima nota, scadenzario, situazione fornitore, commessa |
| Pagamento SAL/subappalto | Scadenza e costo effettivo, SAL, contratto, esposizione della commessa, Prima nota |
| Collegamento della sola prova bancaria | Stato e quota bancaria, riferimento sul pagamento esistente; nessun nuovo denaro |
| Annullamento | Fonte contabile e residui coerenti, storico conservato; eventuale aggiornamento del gestionale esterno |
| Nota o riferimento gestionale | Registro, pannello e riferimenti della commessa; nessuna variazione di cassa |

La contabilità generale mantiene le sue regole di contabilizzazione e verifica dei conti: aggiornare la schermata non deve inventare contropartite mancanti o rendere definitiva una scrittura ancora da verificare. Gli eventuali conti contabili non configurati vanno segnalati, non sostituiti con valori arbitrari.

L’aggiornamento di Fatture in Cloud segue la conferma/annullo locale. Se il servizio esterno non risponde, il pagamento locale rimane registrato e viene mostrato un avviso: non va richiesto di ripagare il documento.

## 7. Matrice di simulazione

| Caso | Esito atteso |
| --- | --- |
| Bonifico 1.000 €, due fatture 400 + 600 € | Due quote, due commesse visibili, residuo zero, un solo importo bancario |
| Pagamenti già registrati 400 + 600 € | Nessuna nuova riga di pagamento; solo prove bancarie |
| Quote 400 + 700 € su bonifico 1.000 € | Rifiuto e rollback di tutte le quote |
| Due commesse 400 + 600 € e destinatario 1.000 € | Attribuzioni distinte; nessun raddoppio del denaro |
| Incasso parziale | Residuo documento e bonifico coerenti |
| Scollegamento pagamento preesistente | Pagamento conservato, sua quota bancaria nuovamente libera |
| Proposta rifiutata / abbinamento annullato | Nessuna nuova proposta della stessa corrispondenza |
| Nota aggiornata da due finestre | Conflitto esplicito e bozza conservata |
| Ricerca con oltre 50 risultati | Totale e conteggio completi, esportazione di tutte le pagine |
| EUR e USD | Totali separati, nessuna conversione implicita |
| Azienda diversa, sola lettura, utente bloccato/esterno | Accesso negato dove richiesto, nessuna scrittura |
| Personale riservato | Nessuna esposizione di nomi o cedolini a ruoli senza permesso |
| Banca non disponibile / consenso scaduto | Stato e azione corretti, nessun pagamento artificiale |

Le scritture di collaudo si eseguono su PostgreSQL locale con dati sintetici. Nell’app reale si verificano navigazione, dati autorizzati, apertura e annullamento dei pannelli senza registrare pagamenti di prova sulle aziende clienti. Vanno verificati separatamente il rilascio del frontend e quello delle funzioni bancarie.

## 8. Analisi dell’esistente e lacune da distinguere dal rilascio attuale

Riferimento: requisiti aggiuntivi forniti il 13 novembre. Il documento allegato descrive il sistema completo da raggiungere; non equivale all’attivazione immediata di conferme automatiche dei pagamenti. Il flusso attuale resta assistito, con conferma esplicita.

| Area | Già presente / consolidata | Da completare nella fase successiva |
| --- | --- | --- |
| Importazione | Distyra, identificativi bancari, conti selezionati, aggiornamenti pianificati e conservazione dei collegamenti | Controlli operativi sugli errori persistenti, duplicati tra diverse sorgenti e pagamenti restituiti |
| Causale | Remittance originale, descrittore di ripiego e riferimento bancario separato | Estrazione strutturata di più riferimenti, senza modificare il testo originale |
| Riconciliazione | Ripartizioni atomiche, residui, prove di pagamenti esistenti, annulli e storico | Gestione guidata di differenze, anticipi senza fattura, compensazioni e casi articolati |
| Regole deterministiche | Proposte per importo esatto e riferimento/controparte; librerie già disponibili per IBAN, nomi normalizzati, riferimenti e combinazioni di importi | Riutilizzare e consolidare queste librerie nel motore unico; salvare motivi, versione della regola e ambiguità per ogni proposta |
| Categorie | Regole aziendali di categorizzazione bancaria già esistenti | Non confondere una categoria con una registrazione contabile corretta o con la riconciliazione di un documento |
| Controparti | Nomi e IBAN comunicati dalle banche e anagrafiche gestionali | Archivio verificato di alias/IBAN per controparte, casi condivisi e intermediari |
| Commesse | Collegamenti dei documenti e riferimenti bancari con quote esplicite | Consolidare le ripartizioni economiche dei documenti: un riferimento al cantiere non sostituisce una ripartizione dei costi |
| Contabilità | Prima nota, generazione/verifica delle scritture contabili, moduli F24 e cespiti | Collegamenti specifici e controlli di completezza per tributi, rate finanziarie, trattenute e capitalizzazione |
| Automazione | Analisi periodica senza registrare automaticamente nuovi pagamenti | Modalità automatica strettamente controllata, da progettare e abilitare per azienda dopo il collaudo |

Flusso da mantenere: **movimento bancario → proposta/riconciliazione → pagamento esistente o nuovo → Prima nota → classificazione contabile → attribuzione economica documentata**. Ogni passaggio deve indicare se è completato, da verificare o non pertinente. Riconciliato non deve significare automaticamente contabilizzato.

## 9. Modello dati da consolidare

Riutilizzare le fonti esistenti:

- `bank_transactions`: identità del movimento, conto, date, valuta, importo, causale originale, riferimento e stato della banca. I dati bancari non vengono riscritti dalla classificazione.
- `bank_reconciliations`: quote finanziarie confermate e storico degli annulli. Non diventa una seconda tabella di costi o ricavi.
- `movimenti_cassa_native`, `invoice_payments`, `scadenze` e `prima_nota_entries`: fatti di incasso/pagamento già usati dalla fatturazione e dalla contabilità. I nuovi collegamenti devono appoggiarsi a queste fonti.
- `bank_transaction_contexts`: riferimenti gestionali con quota e nota. Non alimenta autonomamente il conto economico.
- Relazioni fattura–commessa, ripartizioni dei costi, contratti e SAL: fonti prioritarie dell’attribuzione economica. Se un documento copre due commesse e mancano le quote, segnalare «ripartizione da completare» anziché assegnare l’intero pagamento al primo cantiere.

Estensioni proposte, senza duplicare i registri:

1. **Proposte strutturate:** movimento, candidati con tipo/ID, importi, indizi, regola/versione, origine deterministica o AI, anomalie, stato, chi ha confermato/scartato e quando. La lista di soli UUID oggi disponibile non basta per spiegare una proposta complessa.
2. **Identificativi delle controparti:** azienda, anagrafica e tipo, alias, IBAN normalizzato, origine, stato verificato, ambito, data di validità e autore della conferma. Consentire più IBAN e contrassegnare quelli condivisi o di intermediari; non imporre l’unicità globale dell’IBAN tra aziende.
3. **Regole riutilizzabili:** condizioni esplicite, priorità, destinatario, ambito aziendale/conto, livello operativo, versione, attivazione e storico. Una scelta manuale non crea automaticamente una regola.
4. **Componenti delle operazioni articolate:** collegamenti alle componenti F24, alle rate dei finanziamenti o ai documenti di rettifica esistenti, con importi la cui somma deve coincidere con il movimento. Le componenti contabili non vanno confuse con i riferimenti gestionali.

Ogni estensione richiede isolamento aziendale, permessi, idempotenza, annullamento tracciato e copertura dei backup. Conservare separati chi ha proposto, chi ha verificato e chi ha registrato in contabilità.

## 10. Gerarchia del motore di abbinamento

Prima applicare le esclusioni, poi valutare gli indizi. Le correzioni ortografiche e gli alias producono una chiave di confronto; la causale e la denominazione originali restano conservate.

| Priorità | Indizi | Comportamento |
| --- | --- | --- |
| 1 | Identificativo strutturato univoco del pagamento/documento, direzione e valuta compatibili, importo e residuo coerenti | Proposta forte; futura conferma automatica soltanto se la regola è abilitata e non esistono alternative o anomalie |
| 2 | IBAN verificato della controparte + riferimento fattura completo di anno + importo compatibile | Proposta forte; controllare conti condivisi, soggetti terzi e duplicati |
| 3 | Numero normalizzato + nome/alias verificato + importo/residuo + finestra temporale coerente | Proposta spiegata da verificare, soprattutto se manca un identificativo univoco |
| 4 | Nome simile, indirizzo del cantiere, testo abbreviato o combinazione di importi | Supporto alla ricerca; confronto con documenti e ripartizioni prima della conferma |
| 5 | Solo importo o sola data | Non sufficiente per confermare automaticamente |

Escludere dalla conferma automatica: movimento non contabilizzato, valuta/cambio non verificati, documento annullato/bozza, residuo insufficiente, quota già utilizzata, controparte condivisa, più candidati equivalenti, riferimento incompleto o conflittuale, proposta rifiutata e casi con differenze non giustificate.

Normalizzare spazi, punteggiatura, accenti e forme come “Srl”/“S.r.l.”. Confrontare separatamente numero, anno ed eventuale sezionale: “3/2026” non deve diventare una corrispondenza forte con qualunque documento contenente “3”. Un IBAN nella fattura può essere quello del beneficiario: verificarne il ruolo rispetto alla direzione del pagamento.

Se un pagamento proviene da un soggetto terzo, richiedere una conferma del rapporto con l’intestatario. Se un IBAN serve più anagrafiche, mostrare l’ambiguità. Non dedurre un’associazione permanente da un singolo pagamento.

Tre livelli progettati: manuale, assistito e automatico rigoroso. Nel rilascio corrente opera il livello assistito. Per la fase automatica partire dai collegamenti a pagamenti già esistenti e verificati, abilitati per azienda, prima di valutare la creazione automatica di nuovi pagamenti.

## 11. Eccezioni e gestione delle differenze

| Caso | Esempio | Trattamento previsto |
| --- | --- | --- |
| Parziale e saldo | Fattura 1.000 €, bonifici 400 + 600 € | Due pagamenti, residuo aggiornato dopo ciascuno, un solo valore economico della fattura |
| Un bonifico, più documenti | 1.000 € = fatture 400 + 600 € | Quote esplicite; il bonifico compare una volta e ogni fattura riceve la propria quota |
| Incasso eccedente | Fattura 1.000 €, accredito 1.050 € | 1.000 € attribuiti, 50 € non attribuiti/anticipo da qualificare; nessun ricavo aggiuntivo inventato |
| Anticipo senza fattura | Accredito 2.000 € prima del documento | Registrare l’anticipo con la sua natura; successivo collegamento alla fattura senza duplicare la cassa |
| Commissioni e arrotondamenti | Atteso 1.000 €, arrivano 998 € | Differenza di 2 € visibile e classificata solo con una giustificazione; non chiudere tacitamente il residuo |
| Bonifico parlante | Netto bancario diverso dal lordo del documento | Usare le funzioni esistenti di incasso/ritenuta e distinguere lordo, trattenuta e netto; non trattare la differenza come insoluto o sconto generico |
| Nota di credito/compensazione | Debito 1.000 €, nota di credito 200 €, pagamento 800 € | Collegare la compensazione documentale e il pagamento effettivo come fatti distinti |
| Rimborso o bonifico restituito | Incasso seguito da restituzione | Collegare lo storno al pagamento originario e riaprire i residui secondo il documento; mantenere lo storico |
| Giroconto | Uscita 5.000 € da un conto e entrata su un altro conto aziendale | Associare le due gambe, gestire differenze di data ed eventuali commissioni; nessun ricavo/costo per il capitale trasferito |
| Rata finanziaria | 600 € = 500 capitale + 80 interessi + 20 spese | Confrontare il piano contrattuale; classificare separatamente le componenti, senza imputare tutti i 600 € come costo |
| F24 | Più tributi e contributi nello stesso addebito | Collegare le componenti del modello e verificarne la somma; non assegnare tutto a una voce o commessa generica |
| Cespiti | Pagamento di un mezzo o macchinario | Collegare fornitura, bene e registrazione contabile/registro cespiti attraverso i dati del documento e le regole aziendali |

Prima della conferma mostrare sempre: importo bancario, quote scelte, differenze, residuo e conseguenze. Per i casi non ancora guidati mantenere l’operazione da verificare e il collegamento alla funzione specializzata, senza simulare un’automazione completa.

## 12. Ruolo dell’AI

Il percorso principale rimane deterministico. L’AI può suggerire riferimenti quando la causale è poco strutturata, proporre un alias o spiegare un caso ambiguo; non deve determinare da sola importi, saldi, scritture o attribuzioni economiche.

Ogni suggerimento AI deve avere origine riconoscibile e motivazione consultabile, distinta da una regola verificata. La conferma di un alias/regola è separata dalla conferma del pagamento e ne delimita l’ambito. Un’interruzione del servizio AI non deve fermare importazione, ricerca e riconciliazione manuale o deterministica.

## 13. Roadmap e criteri di passaggio

| Fase | Contenuto | Criterio per procedere |
| --- | --- | --- |
| Essenziale, rilascio corrente | Causale originale, registro unico, quote/residui, prove di pagamenti esistenti, note, permessi e collegamenti alla commessa | Test critici verdi, nessuna duplicazione nelle simulazioni, verifica dell’app pubblicata |
| Motore assistito consolidato | Riutilizzo dei criteri IBAN/nome/riferimento/data, motivi persistenti, archivio alias verificati e coda anomalie | Casi ambigui riconosciuti e spiegati, suggerimenti riproducibili e regole versionate |
| Casistiche contabili articolate | Anticipi, compensazioni, ritenute, commissioni, giroconti, F24, rate finanziarie e cespiti attraverso i moduli esistenti | Somme verificabili, contropartite configurate, annulli coerenti e nessuna seconda imputazione economica |
| Automazione controllata | Regole rigorose abilitate per azienda, inizialmente su pagamenti esistenti, con soglie e interruttore di disattivazione | Collaudo su casi reali revisionati, assenza di alternative plausibili nei casi automatici, tracciabilità e correzione completa |
| Evoluzione | Conferme multiple selettive, metriche operative e supporto AI per eccezioni | Beneficio misurato senza ridurre controllo o qualità dei dati |

Dati necessari alle fasi successive: IBAN/alias confermati delle controparti, piano dei conti e contropartite aziendali, ripartizioni dei documenti, dettagli F24, piani di ammortamento e regole per anticipi/compensazioni. Non occorrono per mostrare la causale o usare il nuovo registro; non vanno inventati quando mancano.

## 14. Indicatori e accettazione

Misurare distintamente:

- Percentuale di movimenti risolti automaticamente sui movimenti eleggibili, mostrando anche il totale importato e le esclusioni.
- Percentuale di proposte assistite accettate, corrette e scartate.
- Errori di abbinamento: annulli con motivo “abbinamento errato”, separati da storni o correzioni contabili legittime.
- Movimenti irrisolti per età, quota residua e causa, distinti per conto/azienda.
- Tempo attivo impiegato per risolvere un movimento e numero di passaggi necessari.
- Duplicazioni impedite, importi eccedenti rifiutati e conflitti fra modifiche contemporanee.
- Ultima sincronizzazione riuscita, consensi da rinnovare e aggiornamenti verso gestionali esterni non completati.
- Percentuale di movimenti riconciliati ma ancora da classificare, contabilizzare o attribuire economicamente.

Accettazione: ricerca sull’intero insieme autorizzato; testo originale mai perso; quote e componenti quadrano al centesimo nella propria valuta; nessuna chiusura ingiustificata del residuo; nessuna duplicazione dopo reimportazione o nuova conferma; annulli tracciati; isolamento aziendale e permessi verificati anche sul database. Il livello automatico richiede una verifica separata prima di essere attivato: un buon punteggio o un singolo test riuscito non ne giustificano l’attivazione generale.
