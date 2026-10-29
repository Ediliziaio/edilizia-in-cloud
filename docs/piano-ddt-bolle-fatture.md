# Piano: bolle/DDT ricevuti, lettura AI, fattura ripartita per cantiere

Scritto il 29/10/2026 dopo aver misurato il sistema esistente in produzione.
Non è una riscrittura: è il piano per far funzionare davvero quello che c'è.

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

## Il piano, in cinque fasi

Ogni fase si regge da sola e lascia il sistema funzionante.

### Fase 1 — Sbloccare la bolla (fondamenta)
- `ddt_ricezione.purchase_order_id` diventa **nullable**; si aggiungono
  `order_id` (commessa) e `supplier_id` in chiaro sul DDT.
- Un DDT può nascere in tre modi: da ODA (come oggi), **da commessa** (ufficio),
  **da foto** (campo) senza nulla a monte.
- La maschera non pretende più l'ODA: lo propone se c'è.

*Risultato: la bolla si carica sempre, da cantiere e da ufficio.*

### Fase 2 — Smettere di buttare la lettura AI
- Nuova tabella `ddt_righe`: codice, descrizione, unità di misura, quantità,
  **prezzo unitario**, importo, più il testo grezzo letto.
- Via `legacy_format: true`: si salvano le righe vere.
- L'abbinamento riga DDT → riga di commessa/articolo diventa un passo
  **separato e facoltativo**: oggi è obbligatorio ed è il motivo per cui il 40%
  dei DDT resta senza dettaglio.
- Un solo estrattore: `ai-ddt-analyzer` e `ddt-ocr-extract` confluiscono in
  `ddt-ai-extract`, con un contratto unico.

*Risultato: il DDT è valorizzato e confrontabile con la fattura.*

### Fase 3 — La pagina del DDT
- Dettaglio con righe lette, file/foto, fornitore, commessa, stato.
- Ogni campo scritto dall'AI è **correggibile a mano**, con l'indicazione di
  cosa ha messo l'AI e cosa ha corretto una persona.
- Segnalazione delle righe non abbinate e delle quantità che non tornano
  rispetto all'ODA.

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
