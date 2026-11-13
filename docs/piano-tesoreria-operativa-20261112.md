# Tesoreria: sviluppo e collaudo

Aggiornamento richieste del 12 novembre 2026. Le funzionalità sono comuni a tutte le aziende. La scelta dei conti, il limite commerciale e i permessi restano configurazioni di ciascuna azienda: il limite di tre conti di Vulcano non va applicato indistintamente agli altri clienti.

## Risultato operativo

Panoramica → Conti e banche → Transazioni → Riconciliazione → Previsioni → Note spese → Impostazioni. I vecchi collegamenti a Conti e Connessioni continuano ad aprire la sezione unica.

Un movimento può riguardare più fatture, scadenze e pagamenti, e più commesse o destinatari. Tutte le informazioni si leggono nello stesso pannello laterale, apribile dalla destra della riga, dallo stato o dal nome del movimento.

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

Una riga per movimento. Colonne configurabili per persona e azienda: data, descrizione, controparte, conto, valuta/importo, stato, abbinato, residuo, documenti, commesse, altri riferimenti, note interne. Data valuta, categoria e riferimento sono disponibili fra le colonne aggiuntive. Il comando per aprire il dettaglio resta raggiungibile a destra.

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
