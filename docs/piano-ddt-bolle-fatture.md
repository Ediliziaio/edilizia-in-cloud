# Piano: bolle/DDT ricevuti, lettura AI, fattura ripartita per cantiere

Scritto il 29/10/2026 dopo aver misurato il sistema esistente in produzione.
Non è una riscrittura: è il piano per far funzionare davvero quello che c'è.

> **29/10/2026 — leggere prima `docs/flussi-merce-bolle.md`.** Lì c'è il censimento
> di tutte le sei porte d'ingresso della merce, chi le usa davvero (le aziende
> vere hanno solo fatture: zero ODA, zero bolle, zero giacenze) e una correzione
> importante ai numeri qui sotto: **tutte le 232 bolle sono dati di prova della
> Demo**. Le conclusioni di questo piano restano, ma stanno sul codice, non su
> quei conteggi. C'è anche una proposta di riordino delle fasi.

## Cosa c'è oggi, misurato

| Fatto | Numero |
|---|---|
| DDT ricevuti (`ddt_ricezione`) | 232 |
| DDT **senza nessuna riga di dettaglio** | 92 (40%) |
| Righe di ricezione (`goods_receipts`) | 840, tutte legate a un DDT |
| Fatture ricevute (`fatture_ricevute`) | 14.307 |
| Fatture ricevute **senza commessa né ODA** | 13.875 (**97%**) |
| Confidenza media del match commessa | 0,25 |
| Uscite (`scadenze`) con commessa | 82 su 1.161 (**7,1%**) |
| Importo uscite da pagare | 1.507.519 € |

## I sette nodi, in ordine di gravità

### 1. Il DDT non può esistere senza un ordine d'acquisto
`ddt_ricezione.purchase_order_id` è **NOT NULL**, e la maschera dice
«Nessun ODA disponibile. Crea prima un Ordine d'Acquisto».
In cantiere la merce arriva anche senza ODA: così la bolla non si carica proprio.
È questo che blocca sia la foto dal campo sia il caricamento dall'ufficio.

### 2. Quello che l'AI legge viene buttato via
`ddt-ai-extract` estrae già uno schema ricco: per ogni riga **codice articolo,
descrizione, unità di misura, quantità, prezzo unitario**, più il mittente con
**partita IVA e codice fiscale**. Ma `NewDDTDialog` lo chiama con
`legacy_format: true`, cioè chiede apposta il formato piatto: **le righe merce
non vengono salvate da nessuna parte.** La risposta alla domanda «l'AI prende
tutti i prodotti?» è: sì, li prende, e poi li perdiamo noi.

### 3. Non c'è un posto dove mettere le righe del DDT
Le uniche righe sono `goods_receipts`, che però:
- sono legate a `order_item_id`, cioè a una **riga di commessa già esistente**:
  un prodotto che sul DDT c'è ma in commessa no non ha dove andare;
- **non hanno prezzo**: il DDT non è valorizzabile, e senza valore non si può
  ripartire una fattura sui cantieri.

### 4. La stessa bolla viene letta in due modi diversi
Due estrattori attivi con schemi diversi: `ddt-ai-extract` (ufficio, campo,
import documenti) e `ai-ddt-analyzer` (magazzino, arrivo merce ODA).
`ddt-ocr-extract` non è chiamato da nessuna parte nel frontend.

### 5. Fattura ricevuta e DDT non si parlano
`fatture_ricevute` **non ha nessuna colonna che punti a un DDT**. Le colonne
`ddt_*` che esistono stanno in `documenti_fiscali` e riguardano i DDT *emessi*
ai clienti: tutt'altro. Il collegamento richiesto non esiste.

### 6. Una fattura può appartenere a una sola commessa
`order_id_suggerito` è **un solo uuid**. La fattura di fine mese con 10 bolle di
cantieri diversi non è rappresentabile: o la si attribuisce tutta a un cantiere
(falsando i margini) o la si lascia senza, ed è ciò che accade nel 97% dei casi.
NB: `cantiere_allocations` esiste ma è per **persone e mezzi** (ore/giorno,
dipendenti, subappaltatori) e ha 0 righe: non è riutilizzabile.

### 7. I pagamenti per commessa sono un impianto non alimentato
`scadenze` ha già `order_id`, `supplier_id`, `amount`, `paid_amount`, `status`.
Manca il dato, non la struttura: 7,1% di copertura. «Cosa ho pagato e cosa devo
ancora pagare su questo cantiere» oggi non è una domanda a cui si può rispondere.

## Dove va la merce, e perché non si conta due volte

Aggiunto il 29/10/2026, dopo aver misurato le strade che oggi portano la stessa
merce in due posti. Sulla bolla ci sono prodotti comprati, e possono andare in
due posti diversi:

| | Giacenza | Costo in commessa | Come ci arriva oggi |
|---|---|---|---|
| **In magazzino** | entra | dall'ODA (`company_costs.purchase_order_id`) | `goods_receipts` → trigger `auto_carico_stock_on_receipt` scrive `warehouse_stock` + movimento di «carico» |
| **In cantiere** | non entra mai | — (manca) | niente: non c'era una strada |
| Dal magazzino al cantiere | esce | il consumo | movimento di «scarico» con `order_id` (14.505 in archivio) |

**La regola anti-doppione esiste già in produzione**, dentro
`campo_acquisto_verifica`, e dice:

> «Collegata all'ordine d'acquisto: il costo è già lì.»

Cioè: se c'è un ODA il costo del materiale è il `company_costs` dell'ODA (ed è
il motivo per cui esiste la vista `v_articoli_gia_a_costo`); se l'ODA non c'è,
il costo nasce dal documento, **una volta sola**. Dal 29/10/2026 quella regola
non è più un commento dentro una funzione: sono tre vincoli sulla tabella.

1. `destinazione = 'cantiere'` esige una commessa — «in cantiere» senza dire
   quale non vuol dire niente.
2. Una bolla con ODA non porta mai un costo suo (`company_cost_id` nullo).
3. Una bolla destinata al cantiere non si carica mai a magazzino
   (`caricata_a_magazzino_at` nullo).

`company_cost_id` e `caricata_a_magazzino_at` sono anche le due **prove** che
l'operazione è già stata fatta: è così che «registra il costo» e «carica a
magazzino» restano pulsanti che si possono premere due volte senza raddoppiare
niente.

Le tre tabelle restano separate di proposito, e non è un doppione:
`ddt_righe` è **quello che c'è scritto sulla carta** (col prezzo),
`goods_receipts` è **quanto è entrato in magazzino** contro una riga d'ordine,
`warehouse_movements` è **dove si è spostato**. Confonderle è esattamente il
modo di contare la stessa merce due volte.

## Il ritiro, e i due percorsi che non si parlano

Aggiunto il 29/10/2026 dopo aver provato il flusso dal lato dell'operaio.

**Il ritiro non era previsto.** La scheda chiedeva corriere, targa, autista e
telefono dell'autista: campi che hanno senso solo se la merce l'ha portata
qualcun altro. Ma spesso non la porta nessuno — si va a ritirarla col furgone, e
il magazzino la carica. Misurato: **su 232 bolle, 231 non hanno nessun
corriere**. Quel riquadro era vuoto nel 99,6% dei casi, in un posto di pregio
della pagina.

L'AI lo legge già: `vettore.tipo` ("mittente|destinatario|terzi") e
`trasporto.porto` ("franco|assegnato"). «destinatario» vuol dire che il
trasporto è a nostro carico, cioè un ritiro. Lo buttavamo via come le righe.
Ora c'è `ddt_ricezione.trasporto_a_cura_di` ('fornitore'|'noi'|'terzi') e
`porto`, letti dall'AI e correggibili; con «noi» la pagina non chiede più
corriere e telefono, e chiama le cose col loro nome: «chi è andato a ritirarla»,
«il nostro mezzo». Nessuna colonna nuova per il ritiro: `autista_nome` e
`targa_mezzo` dicono già la stessa cosa in un altro contesto.

**La stessa bolla non si carica più due volte.** Su `ddt_ricezione` non c'era
nessun vincolo di unicità: con la foto dal cantiere e il caricamento
dall'ufficio era questione di tempo. Il numero di un DDT è unico per fornitore,
quindi è una chiave: indice unico su (azienda, fornitore, numero). Verificato
prima: zero collisioni sulle 232 bolle esistenti. E l'errore del database è
tradotto in italiano, insieme agli altri tre vincoli.

**Quello che resta aperto: due percorsi che non si vedono.** Provato dal vivo,
in una transazione annullata:

| Percorso | Dove scrive | Controllo doppioni |
|---|---|---|
| Operaio, `/campo/merce` | `campo_acquisti` | sì, **solo** dentro `campo_acquisti` (fornitore + numero + data) |
| Ufficio, scheda bolla | `ddt_ricezione` | sì, **solo** dentro `ddt_ricezione` (fornitore + numero) |

Risultato della prova: l'operaio segna il documento 9001 → bloccato al secondo
tentativo («già caricato da … il 29/10»); poi **l'ufficio carica la bolla con lo
stesso numero e passa**. Oggi non si raddoppia nessun costo, perché una bolla
senza ODA non genera ancora un costo — ma si raddoppierà il giorno in cui
esisterà il pulsante «registra il costo dalla bolla».

Tappabuchi messo subito: salvando una bolla, se un operaio ha già segnato lo
stesso numero, la pagina lo dice (non blocca: la bolla dell'ufficio è il
documento vero). **Da decidere**: se le due registrazioni si devono fondere
(`campo_acquisti.ddt_ricezione_id`) e quale delle due vince.

## Il piano, in cinque fasi

Ogni fase si regge da sola e lascia il sistema funzionante.

### Fase 1 — Sbloccare la bolla (fondamenta) — ✅ FATTA il 29/10/2026
- `ddt_ricezione.purchase_order_id` è **nullable**; aggiunte `order_id`
  (commessa) e `supplier_id` in chiaro sul DDT, dedotte dall'ODA da un trigger
  quando l'ODA c'è. Migrazione `20281029170000_bolla_senza_oda`.
- La bolla nasce in tre modi, e la maschera chiede quale **prima** di tutto il
  resto: da ODA, da commessa (ufficio), solo la bolla (campo).
- Bonifica: 232 bolle su 232 hanno ora commessa e fornitore.
- Corretto anche il `purchase_orders!inner` nella lista: con l'inner join una
  bolla senza ODA sarebbe sparita dall'elenco senza che nessuno lo dicesse.

### Fase 2 — Smettere di buttare la lettura AI — ✅ FATTA il 29/10/2026
- Tabella `ddt_righe`: codice, descrizione, unità di misura, quantità,
  **prezzo unitario**, importo, IVA, testo grezzo, `origine` ('ai'|'manuale') e
  `ai_originale` (com'era la riga appena letta: una correzione a mano si vede).
  Sulla bolla: `ai_lettura`, `ai_confidenza`, `ai_avvisi`.
  Migrazione `20281029180000_ddt_righe_lettura_ai`.
- Via `legacy_format: true`. La traduzione sta in `src/lib/ddt/letturaAI.ts`,
  provata: tre righe sulla carta, tre righe salvate, prezzi compresi.
- L'abbinamento riga DDT → riga di commessa (`ddt_righe.order_item_id`) è un
  passo **separato e facoltativo**, mai automatico.
- L'importo di riga è quello della carta; il database lo calcola solo quando il
  documento non lo dice (sconti e arrotondamenti del fornitore hanno ragione loro).
- Il fornitore si riconosce da partita IVA, codice fiscale o nome — ma solo
  quando è l'unico che corrisponde (`src/lib/ddt/abbinaFornitore.ts`).
- **Resta da fare:** un solo estrattore. Oggi sono tre, con tre schemi:
  `ddt-ai-extract` (app), `ai-ddt-analyzer` (magazzino), `_shared/ddtLetto.ts`
  (foto su WhatsApp); `ddt-ocr-extract` non è chiamato da nessuno.

### Fase 2-bis — La destinazione — ✅ FATTA il 29/10/2026
`ddt_ricezione.destinazione` ('magazzino' | 'cantiere'), più i tre vincoli e le
due prove descritti sopra. Migrazione
`20281029190000_bolla_destinazione_e_niente_doppioni`.
Delle 232 bolle esistenti, 140 risultano caricate a magazzino (quelle con
ricezioni) e 92 no: sono esattamente le 92 senza righe di dettaglio.

**Resta da fare** (è il lavoro vero della destinazione, non ancora scritto):
- `destinazione = 'magazzino'` su una bolla **senza ODA**: un carico in
  giacenza dalle righe della bolla, una volta sola, con
  `caricata_a_magazzino_at` come prova. Oggi il carico passa solo da
  `goods_receipts`, che pretende una riga d'ordine.
- `destinazione = 'cantiere'`: il costo sulla commessa dalle righe della bolla,
  una volta sola, con `company_cost_id` come prova — la stessa strada di
  `campo_acquisto_verifica`, riusata, non riscritta.

### Fase 3 — La pagina del DDT — ✅ FATTA il 29/10/2026

**Com'era composta.** Header, poi una testata con numero, data, quantità e
magazzino, poi: il file, gli allegati, il corriere, la targa, l'autista, il
ricevente, il controllo qualità — e la merce al **sesto posto**. Il corriere
veniva prima di quello che era arrivato. Le righe erano in sola lettura: l'AI
scriveva e nessuno poteva correggere. La sidebar aveva cinque schede, tre delle
quali contenevano solo un link.

**Com'è composta adesso.** Una bolla risponde a quattro domande, in quest'ordine:

1. **Che cosa è arrivato** — le righe, col prezzo, **correggibili riga per
   riga** (codice, descrizione, quantità, UM, prezzo), con aggiungi e togli.
   Ogni riga dice da dove viene: ✨ letta dall'AI e non ancora controllata,
   ✏️ corretta a mano — e in quel caso mostra *che cosa aveva letto l'AI*, che
   resta in `ai_originale` e non si perde.
2. **Com'era il documento** — la foto o il PDF, e gli allegati. Sta subito sotto
   le righe perché le righe si correggono guardandolo, non scorrendo su e giù.
3. **Torna con l'ordine?** — ricezioni per articolo e articoli dell'ODA, con in
   testa, in una riga, quello che non torna: quante unità mancano su quanti
   articoli, e quante righe della bolla non sono abbinate (detto solo quando un
   ordine c'è: senza ODA non c'è niente a cui abbinarle).
4. **Chi l'ha portata** (corriere, mezzo, autista, orari) e **chi l'ha presa**
   (ricevente, firma, non conformità, danni).

In testata: numero, data, **righe**, **valore della merce** e **destinazione**.
Il valore non c'era, ed è il numero che serve per la fattura di fine mese.

Due numeri che dicevano la stessa cosa senza coincidere ora si confrontano: se
`quantita_ricevuta` in testata non torna con la somma delle righe, la pagina lo
dice e dichiara quale vale (le righe; la testata è un totale digitato).
Si segnalano anche le righe senza prezzo, perché su quella parte la fattura non
si potrà ripartire.

La sidebar è una scheda sola, «Dove si incastra»: ordine d'acquisto, fornitore,
commessa, destinazione — una riga ciascuno, cliccabili solo dove c'è davvero
qualcosa da aprire.

**Resta da fare:** l'abbinamento esplicito di una riga di bolla a una riga di
commessa dall'interfaccia. Il campo c'è (`ddt_righe.order_item_id`) e la pagina
dice quante righe non sono abbinate, ma il selettore non è ancora scritto.

### Fase 4 — Fattura ↔ DDT ↔ cantiere (il pezzo che manca del tutto)
- `fattura_ricevuta_ddt`: relazione **molti-a-molti**, una fattura copre N DDT.
- `fattura_ricevuta_ripartizione`: (fattura, commessa, importo), con vincolo che
  **la somma delle quote sia uguale al totale della fattura** — altrimenti la
  ripartizione non si salva.
- Proposta automatica: dai DDT collegati si ricava la ripartizione per commessa
  usando gli importi di riga.
- **Se il DDT non si trova, ripartizione manuale**, a importo o a percentuale.
- Aiuto alla ricerca: candidati per fornitore, periodo e importo.

*Risultato: la fattura di fine mese si spacca sui cantieri giusti.*

### Fase 5 — Pagamenti per commessa
- Dalle ripartizioni nascono le scadenze con `order_id` valorizzato.
- Nella commessa: **speso, fatturato, pagato, da pagare**, per fornitore,
  con il dettaglio delle bolle dietro ogni numero.

## Come verificare che funzioni
- La somma delle quote di ripartizione è sempre uguale al totale della fattura.
- Nessun DDT perde righe: righe lette = righe salvate.
- Copertura: % fatture ricevute con almeno una commessa (oggi 3%).
- Copertura: % uscite con commessa (oggi 7,1%).
- Il margine di commessa non cambia per effetto di una ripartizione che si
  limita a spostare lo stesso importo.

## Da decidere prima di partire
1. Una riga di DDT senza corrispondente in commessa: la si tiene come costo del
   cantiere comunque, o la si lascia in sospeso?
2. La ripartizione si fa sull'imponibile o sul totale con IVA?
3. Chi può modificare una ripartizione dopo che la fattura è stata pagata?
