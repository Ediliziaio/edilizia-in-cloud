# Piano operativo: Tesoreria, conti e riconciliazione

Richieste del 12 novembre 2026. Questo documento descrive lo sviluppo successivo alle correzioni di collegamento Distyra, selezione conti e fatture emesse della PR 139. La scelta conti e l’unificazione della navigazione sono incluse nella PR 139; il rifacimento esteso di Transazioni e Riconciliazione qui descritto resta lo sviluppo successivo.

## 1. Navigazione e conti bancari

Ordine delle sezioni: **Panoramica → Conti e banche → Transazioni → Riconciliazione → Previsioni → Note spese → Impostazioni**.

Conti e Connessioni diventano una sola schermata. I vecchi indirizzi `tab=conti` e `tab=connessioni` continuano a funzionare e aprono la nuova sezione. Anche da telefono devono essere raggiungibili scelta conti, errori e rinnovo del consenso.

In alto: **Conti collegati 0/3**, poi 1/3, 2/3, 3/3; «Collega banca» e «Gestisci conti». Il limite è aziendale ed è modificabile soltanto dal superadmin. L'aumento cambia il denominatore (esempio 3/5), senza scegliere automaticamente altri conti.

Distinguere chiaramente due numeri: conti resi disponibili dal consenso della banca e conti scelti per l'utilizzo in Tesoreria. Un consenso che espone otto conti non significa otto conti attivati dall'app. Non dedurre dal contatore il costo del contratto del fornitore bancario.

Ogni banca contiene i suoi conti, con nome modificabile, IBAN abbreviato, valuta, stato, ultimo aggiornamento riuscito ed eventuale errore più recente. **Verde: collegato e selezionato; giallo: da riconnettere o consenso in scadenza; rosso: collegamento assente/revocato.** Per un conto disponibile ma non scelto usare uno stato neutro «Disponibile»; non segnalarlo falsamente come guasto. Icona e testo accompagnano sempre il colore. «Riconnetti banca» non deve essere confuso con «Seleziona conto».

Dati operativi e saldi seguono i permessi già presenti: chi non ha diritto ai saldi non li riceve né nel dettaglio né nelle somme. I conti manuali restano riconoscibili e non consumano i posti dei collegamenti Distyra.

## 2. Transazioni: tabella operativa leggibile

Una riga per movimento, con colonne selezionabili e preferenze per persona/azienda. Intestazioni e prime colonne fisse; lettura su telefono con schede compatte e apertura del dettaglio.

Colonne iniziali: data contabile, controparte, descrizione, banca/conto, entrata, uscita, valuta, stato della riconciliazione, documento collegato, commessa/lavoro, categoria e note interne. Facoltative: data valuta, riferimento bancario, fornitore/cliente, mezzo/cespite collegato, importo già abbinato e quota ancora libera. Evitare di duplicare l'importo intero su ogni collegamento quando un movimento è ripartito.

I collegamenti sono cliccabili: fattura, commessa e mezzo aprono l'oggetto reale. Note e categoria si modificano senza perdere il punto nella tabella. Il dettaglio si apre lateralmente, mostrando causale integrale e collegamenti, con conferma esplicita delle azioni finanziarie.

Il collegamento diretto a commessa o mezzo deve rappresentare il fatto economico corretto: associare un bonifico alla fattura che già appartiene a una commessa non crea un secondo costo o un secondo incasso. Le spese senza fattura hanno un percorso distinto e un'unica registrazione contabile.

## 3. Ricerca, filtri e totali

Ricerca per descrizione, controparte, riferimento, importo, note e numero del documento collegato. Filtri combinabili: periodo, banca/conto, entrata/uscita, intervallo importi, valuta, categoria, cliente/fornitore, commessa, mezzo, presenza di allegati e stato della riconciliazione.

Scelte rapide: «Da verificare», «Da collegare», «Riconciliate», «Senza fattura», «Questa settimana», «Questo mese». Pillole dei filtri attivi con rimozione singola, azzera tutto e conteggio risultati.

Totali sul risultato filtrato completo, distinti per valuta: entrate, uscite, saldo dei movimenti, importi da verificare. Non chiamare questo saldo «saldo del conto», che è un altro dato. Aggregazione e paginazione sul server: il componente attuale scarica fino a 50.000 movimenti per calcolare i totali; con molti dati va sostituito con un riepilogo autorizzato lato database. Esportazione coerente con gli stessi filtri.

## 4. Abbinamenti proposti e confermati

Il sistema attuale non si limita sempre a suggerire: `bank-auto-reconcile` può già registrare abbinamenti e pagamenti quando il punteggio supera la soglia, mentre altre proposte finiscono in chat. Prima di introdurre il nuovo badge bisogna allineare **pulsante Auto-match, attività periodica e conferme manuali** allo stesso processo.

Nuovo ciclo: **Da collegare → Da verificare → Riconciliata**. L'analisi automatica crea una proposta con candidati, motivazione e importi; non registra ancora un nuovo pagamento. Il badge «Da verificare» apre il confronto movimento/documento: numero, cliente o fornitore, importo, residuo, data, commessa e motivi dell'abbinamento. La persona può confermare, cambiare documento, ripartire, scartare o indicare «Senza fattura».

La conferma salva in un'unica transazione abbinamento e, solo quando necessario, pagamento. Se il pagamento è già registrato, il movimento bancario ne diventa la prova, senza raddoppiare l'incasso. Un movimento parzialmente abbinato conserva la quota libera. Le proposte rifiutate o gli abbinamenti annullati non vanno riproposti automaticamente.

Mantenere distinti: stato della banca, stato di riconciliazione e stato del pagamento della fattura. Una proposta non rende la fattura incassata. I badge devono coincidere fra Transazioni, Riconciliazione, fatture e commessa.

## 5. Riconciliazione come coda di lavoro

Sostituire le due liste molto lunghe sempre aperte con una coda filtrabile. In alto tre indicatori utili: «Da verificare», «Da collegare», «Riconciliate». Selezionando una riga, il pannello laterale mostra i candidati e il confronto; i filtri e la posizione della lista rimangono conservati.

Anomalie raggruppate e richiudibili: importi diversi, possibili duplicati, fatture già incassate, date incoerenti, movimenti senza documento. Le azioni «Conferma», «Scegli altro» e «Senza fattura» devono essere visibili nel contesto della singola riga. Conferma multipla solo per proposte omogenee già verificabili; mai per somiglianze generiche.

Gestire esplicitamente fattura unica con più incassi, bonifico unico per più fatture, acconti, rimborsi, note di credito, commissioni, giroconti, stipendi, tributi e leasing/mezzi. L'assenza della fattura non è di per sé un errore.

## 6. Sequenza di realizzazione e verifica

1. Completare selezione conti, blocco massimo e giri Distyra delle 07/18; nessuna selezione per conto del cliente.
2. Unire Conti e Connessioni, preservando i vecchi collegamenti; ordinare Transazioni e Riconciliazione vicine.
3. Definire proposte persistenti e conferma atomica; migrare con criterio gli abbinamenti esistenti, senza trasformare conferme storiche in proposte.
4. Ampliare tabella Transazioni e filtri usando una proiezione autorizzata e aggregati sul server.
5. Realizzare la coda di verifica e propagare i badge a fatture, commesse e mezzi.
6. Collaudo con movimenti reali in sola lettura e scenari sintetici per le scritture: duplicati, parziali, ripartizioni, annullamenti, permessi, aziende diverse, più schede aperte, errori banca e grandi volumi. Confrontare saldi/registri prima e dopo: nessun nuovo denaro per effetto di un semplice collegamento.

## Dettaglio fattura: intervento successivo

Nella pagina reale FPR 78/26 di Renova Solution, il PDF occupa lo spazio iniziale e le schede operative sono sotto. La scheda Commessa compare soltanto quando esiste una rata collegata, quindi manca in casi legittimi senza piano rate.

Proposta: riepilogo immediato di totale, incassato, residuo e scadenza; collegamento Commessa sempre raggiungibile, anche senza rata; note interne e allegati accessibili vicino alle azioni; un'azione principale «Registra incasso», con le altre raccolte in un menu coerente. Anteprima PDF in una scheda dedicata o richiudibile. Stato SDI separato dall'incasso e note interne sempre escluse da PDF/XML. Nessuna modifica al contenuto fiscale già trasmesso.
