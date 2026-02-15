
# Nuove colonne nella tabella Ordini

## Cosa cambia

### Stat cards (in alto)
- "Importo Totale" diventa **"Totale Ivato"** -- calcolato come `total_amount * (1 + vat_rate/100)`

### Colonne della tabella
Le colonne attuali vengono sostituite con queste (nell'ordine richiesto):

| Colonna attuale | Nuova colonna |
|---|---|
| Codice | Codice (invariato) |
| Descrizione | Descrizione (invariato) |
| Cliente | Cliente (invariato) |
| Totale | **Totale Ivato** = `total_amount * (1 + vat_rate/100)` |
| -- | **Imponibile** = `total_amount` (gia presente nel DB come netto) |
| -- | **Incassato** = somma tranche pagate |
| Da Ricevere | **Da Ricevere** (invariato nel calcolo) |
| -- | **Costi Variabili** = costi articoli (purchase_price * qty) + manodopera (employees + external teams) + provvigioni |
| -- | **Margine Lordo** = imponibile - costi variabili netti |
| Data Contratto | rimossa dalla vista (troppo affollata, si vede nel dettaglio) |
| Arrivo Merce | rimossa |
| Data Posa | rimossa |
| Pagamenti | Pagamenti (invariato) |
| Stato | Stato (invariato) |
| Azioni | Azioni (invariato) |

### Dati aggiuntivi necessari

Per calcolare "Costi Variabili" e "Margine Lordo" servono dati da tabelle correlate. Si aggiungono 3 query batch nella pagina `OrdersList.tsx`:

1. **order_items** per tutti gli ordini della company: `SUM(purchase_price * quantity)` raggruppato per `order_id`
2. **order_employees**: `SUM(total_cost)` per `order_id`
3. **order_external_teams**: `SUM(total_cost)` per `order_id`
4. **order_salespeople**: provvigioni per `order_id` (calcolate client-side come gia fatto in OrderEconomics)

Questi dati vengono aggregati in una mappa `orderId -> { variableCosts, grossMargin }` e passati alla tabella.

## Dettaglio tecnico

### File: `src/pages/azienda/OrdersList.tsx`
- Aggiungere `vat_rate` alla interface `OrderWithDetails`
- Aggiungere funzione `getAmountCollected` (gia presente) per la colonna "Incassato"
- Aggiungere query per `order_items`, `order_employees`, `order_external_teams`, `order_salespeople` raggruppate per order_id
- Calcolare `totalIvato` nelle stat cards
- Passare i costi calcolati a `OrdersTable`
- Aggiornare le stat cards con "Totale Ivato" al posto di "Importo Totale"

### File: `src/components/orders/OrdersStatsCards.tsx`
- Rinominare "Importo Totale" in "Totale Ivato"
- Aggiungere campo `totalGross` (ivato) nelle stats

### File: `src/components/orders/OrdersTable.tsx`
- Aggiungere `vat_rate` alla interface
- Ricevere nuova prop `orderCosts: Map<string, { variableCosts: number; grossMargin: number }>`
- Sostituire colonne come descritto sopra
- Rimuovere colonne date (Data Contratto, Arrivo Merce, Data Posa) per fare spazio
- Aggiungere colonne: Totale Ivato, Imponibile, Incassato, Costi Variabili, Margine Lordo

### Calcolo Costi Variabili (per ordine)
Utilizzo la stessa logica di `OrderEconomics.tsx`:
- Costi articoli: `SUM(purchase_price * quantity)` da `order_items` -- questi sono lordi, vanno scorporati con `calculateNetFromGross`
- Costi dipendenti: `SUM(total_cost)` da `order_employees` -- gia netti
- Costi squadre esterne: `SUM(total_cost)` da `order_external_teams` -- lordi, vanno scorporati
- Provvigioni: calcolate sulla base di `order_salespeople` con `commission_type` e `commission_value`

### Calcolo Margine Lordo
`margine = total_amount (imponibile) - costi_variabili_netti`
