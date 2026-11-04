# Fatture, costi, mezzi e F24: note, allegati e collegamenti

Piano scritto il 04/11/2026 partendo dalla richiesta di un cliente, che vale per
tutte le aziende. Stato del codice letto su `origin/main`, numeri letti dal
database di produzione. Non è ancora implementato niente di quanto segue.

Dove è scritto **«da verificare»** il punto non è stato controllato.

## 1. La richiesta, e cosa c'è già

| Richiesta | Cosa c'è oggi | Cosa manca |
|---|---|---|
| Differenza fra verificata, contabilizzata, da rettificare | Verificata e contabilizzata esistono. «Da rettificare» no | Stato nuovo e spiegazione a video (fase 2) |
| Note ricercabili su ricevute ed emesse | Le colonne ci sono, la ricerca le ignora | Campo chiaro e ricerca (fase 3) |
| Allegati e DDT sulle fatture | `fattura_allegati` e `AllegatiFattura`, anche col tipo «ddt». **Zero righe in tutta la piattaforma**: stanno solo nel dettaglio e nessuno li trova | Farli vedere dalla lista (fase 4) e il legame vero col DDT (fase 5) |
| Note e allegati sui mezzi | `mezzi.note`, `mezzi_documenti`, manutenzioni con file | Ricerca e fatture sul mezzo (fase 6) |
| «Collegato» nei costi senza fattura | `senza_fattura` e un solo allegato, ma solo dalla commessa | Più allegati e collegamenti (fase 7) |
| Fattura fittizia per le uscite senza fattura | Niente | Documento di spesa interno (fase 7) |
| Fatture collegate ai mezzi | Niente: né tabella né colonna | Tabella e pagina del mezzo (fase 6) |
| F24 con filtri e allegati | `f24_entries`, `useF24`, `F24Generator`, `pdf_url`. **Zero righe in tutta la piattaforma** | Filtri, file, collegamenti (fase 8) |
| Modalità di pagamento e colonne modificabili | Il dato c'è (`piano_pagamento`), la lista non lo legge. `OrdersTable` ha già le colonne scegliibili | Fase 1 |
| «Poter importare insieme» | La frase è incompleta | Domanda 1 in fondo |

Il punto di fondo: **molto esiste già e non viene usato perché non si vede**. Prima
si rende visibile quello che c'è, poi si costruisce il nuovo.

## 2. Verificata, contabilizzata, da rettificare

Oggi sulla stessa fattura stanno tre domande diverse, e la pagina le confonde.

| Domanda | Valori | Effetto |
|---|---|---|
| **Controllo**: l'ho guardata, è giusta? | da verificare, verificata, **da rettificare** (nuovo) | Nessun effetto sui conti. Si può cambiare |
| **Contabilità**: è entrata nei conti? | da contabilizzare, contabilizzata | Crea il costo e le rate: entra in margine e previsionale |
| **Pagamento**: l'ho pagata? | da pagare, pagate N rate su M, pagata | Allinea rate, costo e scadenze |

Risposta per l'utente, da mettere a video:

- **Verificata**: qualcuno l'ha controllata e va bene. Non muove un euro.
- **Contabilizzata**: è diventata un costo, con le sue rate.
- **Da rettificare**: la fattura è sbagliata e serve un intervento del fornitore,
  di solito una nota di credito. Oggi non c'è modo di dirlo.

Una trappola da togliere: `fatturaVerificata` considera verificata ogni fattura
contabilizzata, se nessuno ha scelto. Una fattura contabilizzata in blocco risulta
così controllata anche se non l'ha guardata nessuno. Si cambia solo per le fatture
nuove, per non spostare lo storico.

## 3. Le fasi

Ogni fase si può pubblicare da sola. L'ordine va dal più utile e meno rischioso al
più delicato.

### Fase 0: prima di tutto
- Pubblicare la correzione dell'elenco delle ricevute, oggi tagliato a 1.000 righe
  (commit locale `960847a7b`). I filtri e i totali delle fasi 1-3 dipendono da lì.
- Chiudere il lavoro sulle note di credito (branch `claude/sweet-noyce-8929c0`):
  tocca gli stessi file delle fasi 1 e 2.

### Fase 1: lista delle ricevute (piccola, senza migrazioni)
- Colonne nuove: metodo di pagamento, prossima scadenza, netto a pagare.
- Filtro per metodo, con un codice solo per metodo (`etichettaModalitaPagamento`).
- Colonne scegliibili, con lo stesso schema di `OrdersTable`. La scelta resta salvata
  per utente su quel browser.
- Da controllare il peso: aggiungere `piano_pagamento` alla select di ogni riga.

### Fase 2: lo stato «da rettificare» (piccola)
- `verifica_manuale` ammette `da_rettificare`, con motivo obbligatorio, chi e quando.
- Filtro rapido accanto a «Da verificare».
- Se la fattura ha RiBa aperte, proporre di segnarle «da bloccare» (lo stato esiste
  già): la contestazione va fatta prima dell'addebito. Lo propone, non lo fa da solo.
- Quando arriva la nota di credito collegata, proporre di chiudere la rettifica.

### Fase 3: note ricercabili (piccola)
- Ricevute: `note` oggi mescola messaggi di sistema e testo umano. Serve un campo
  `note_interne` separato.
- Emesse: `documenti_fiscali.note_interne` esiste. Per `invoices` c'è solo `notes`,
  scritto anche dall'import. **Da verificare** se conviene una colonna nuova.
- Regola da tenere: una nota interna non finisce mai nell'XML né sul PDF.
- Ricerca: le ricevute filtrano nel browser, basta aggiungere il campo. Le emesse
  **da verificare**. `pg_trgm` è già installata se servirà un indice.
- Le note non sono dati fiscali: vanno verificate contro `fiscalita_guard` a periodo
  chiuso.

### Fase 4: allegati visibili (piccola)
- Icona con il numero di allegati in ogni riga di ricevute ed emesse.
- Caricamento senza dover aprire il dettaglio, trascinando il file.
- Filtro «con allegati» e «senza contabile di pagamento».

### Fase 5: fattura e DDT (media)
- Tabella `fattura_ddt`: fattura, numero e data del DDT, `ddt_ricezione_id` facoltativo,
  origine (XML o manuale).
- **Il riferimento deve poter esistere senza la bolla.** Nell'archivio provato, 480
  fatture ricevute su 1.226 citano DDT nell'XML, ma le aziende vere non hanno bolle
  caricate. Un legame che pretende la bolla resterebbe vuoto.
- Riempimento dall'XML (`DatiDDT`) all'import e per lo storico. Aggancio alla bolla
  per fornitore e numero, solo se il risultato è unico.
- `ddt_ricezione.purchase_order_id` risultava obbligatorio il 29/10: **da verificare**
  se lo è ancora, perché impedisce di caricare una bolla senza ordine.
- Lato emesse: `riferimenti_ddt` esiste su `documenti_fiscali`. Le emesse importate
  **da verificare**.

### Fase 6: fatture sui mezzi (media)
- Tabella `fattura_ricevuta_mezzi`: fattura, mezzo, importo, righe, origine, confermata.
- **L'importo sta sul legame**, non sulla fattura. Nell'archivio provato 74 fatture
  citano una targa, ma 28 citano più mezzi: sono carburante e leasing con molti
  veicoli. Attribuire il totale a ciascuno gonfierebbe i costi.
- Proposte automatiche da targa e matricola, riga per riga. Diventano costo del mezzo
  solo dopo la conferma. Serve una schermata per confermarle in blocco.
- Pagina del mezzo: sezione «Costi» con fatture, documenti e manutenzioni insieme.
- **Rischio di doppio conteggio:** `useCostiParco` somma già `mezzi_documenti.importo`
  e `mezzi_manutenzioni.costo`. Un bollo o una revisione possono esistere sia come
  documento sia come fattura: il legame deve poter indicare quale riga sostituisce.
- Ricerca anche in `mezzi.note`.

### Fase 7: uscite senza fattura (media, con una scelta da fare)
La richiesta è una «fattura fittizia del fornitore» per bollo e simili. L'esigenza è
giusta: avere in un posto solo importo, mese, fornitore, commessa e documenti.
**Il nome e la forma no.**

**Proposta: un documento di spesa interno, non una riga in `fatture_ricevute`.**

| | Riga finta in `fatture_ricevute` | Documento interno (proposto) |
|---|---|---|
| Registro IVA ed export | Da escludere in ogni lettore, uno per uno | Fuori per costruzione |
| Rischio se se ne dimentica uno | IVA detratta su un documento inesistente | Nessuno |
| Doppioni con la fattura vera | Il fornitore manda poi quella vera | Si aggancia e sostituisce |
| Nome a video | «Fattura» che non lo è | «Senza fattura» |

Come si fa:
- Si estende `company_costs` con `senza_fattura`, che esiste già: riferimento del
  documento, data, mese di competenza, fornitore.
- Più allegati: si estende `fattura_allegati` con `company_cost_id`, invece di una
  tabella per ogni madre. Oggi il costo ha un solo file e solo dalla commessa.
- Stessa gestione anche dalla pagina Costi, non solo dalla commessa.
- Collegamenti: commessa con ripartizione, fornitore, mezzo (fase 6).
- La lista delle ricevute mostra anche queste righe, con l'etichetta «Senza fattura» e
  un filtro, ma fuori dai totali fiscali.
- Se poi arriva la fattura vera, «sostituisci» trasferisce allegati e commessa senza
  contare il costo due volte.

Prima di scriverlo va sentito un commercialista su cosa deve vedere e su come trattare
l'IVA di queste uscite: qui si assume che **non** generino IVA detraibile.

### Fase 8: F24 (piccola, ma prima va capito se serve)
- **Da verificare** dove si vede oggi: `F24Generator` esiste, ma con zero righe in
  tutta la piattaforma è possibile che nessuno lo trovi.
- Filtri per anno, mese, stato e tributo.
- File: `pdf_url` c'è, si aggiunge il caricamento, e la quietanza con `fattura_allegati`
  esteso o una tabella dedicata.
- Collegamento facoltativo a commessa o costo, senza contare due volte quello che è
  già un costo senza fattura. Esiste già il caso «F24 legato al cantiere» fra i costi:
  va deciso quale dei due comanda.
- `f24_entries` non si cancella e passa da `fiscalita_guard`: si lavora per rettifica.

## 4. Regole per tutte le fasi

- Le migrazioni seguono `CLAUDE.md`: SQL idempotente, `apply_migration`, riallineamento
  del registro, e `lock_timeout` prima di ogni modifica ai dati.
- Tabelle nuove con RLS provata da `guardiano-accessi`: i costi hanno permessi diversi
  dalla fatturazione, e gli allegati oggi seguono solo la seconda. Va deciso per la
  fase 7.
- Letture sempre a pagine: il limite di 1.000 righe ha già nascosto delle fatture.
- Le proposte automatiche si confermano: nessun legame incerto diventa un costo da solo.
- Ogni fase si prova su dati veri, in una transazione annullata, prima di pubblicare.
- I dati dei clienti non vanno nel repository, che è pubblico.

## 5. Ordine e dimensione

| # | Fase | Dimensione | Migrazione | Dipende da |
|---|---|---|---|---|
| 0 | Elenco oltre 1.000 righe e note di credito | Fatto, da pubblicare | Sì, la seconda | |
| 1 | Colonne e metodo di pagamento | Piccola | No | 0 |
| 2 | Da rettificare | Piccola | Sì | 0 |
| 3 | Note ricercabili | Piccola | Sì | 1 |
| 4 | Allegati visibili | Piccola | Forse | 1 |
| 5 | Fattura e DDT | Media | Sì | 4 |
| 6 | Fatture sui mezzi | Media | Sì | 4 |
| 7 | Uscite senza fattura | Media | Sì | 4, 6, commercialista |
| 8 | F24 | Piccola | Forse | 7 |

## 6. Domande aperte

1. **«Poter importare insieme»: insieme a cosa?** Il testo si interrompe. Fatture emesse
   e ricevute insieme si può già fare. Può voler dire XML più PDF e allegati nello
   stesso zip, oppure anche F24 e costi. Va chiesto al cliente.
2. **«Nei costi senza fatture mettere il collegato»:** si intende il collegamento a
   commessa e mezzo, o l'allegato? Il piano prevede entrambi.
3. **Il documento interno al posto della fattura fittizia va bene?** Va spiegato al
   cliente, e confermato dal commercialista.
4. **Chi può vedere gli allegati dei costi:** chi vede i costi o chi vede la fatturazione?
5. **F24:** serve davvero un archivio in piattaforma, o basta come documento sul costo?
