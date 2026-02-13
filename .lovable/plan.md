

# Piano: Flag Pagato/Non Pagato per Articoli Ordine nei Costi Variabili

## Problema

Attualmente gli articoli degli ordini che compaiono nei Costi Variabili (quelli con stato "da_ordinare" o "ordinato") sono solo in lettura: l'unica azione possibile e "Vai all'ordine". Non c'e modo di segnare se il materiale e stato pagato o meno, ne di registrare la data del pagamento.

## Soluzione

### 1. Migrazione Database

Aggiungere due colonne alla tabella `order_items`:
- `is_paid` (boolean, default false)
- `paid_date` (date, nullable)

Questo permette di tracciare il pagamento di ogni singolo articolo direttamente nella tabella esistente.

### 2. Modifiche al Componente CompanyCostsManager

**File**: `src/components/forecast/CompanyCostsManager.tsx`

- Aggiornare la trasformazione degli order items (`orderItemsAsVariableCosts`) per leggere `is_paid` e `paid_date` dall'articolo
- Nella colonna Azioni delle righe "Da Ordine", aggiungere:
  - Se NON pagato: icona check verde che apre il dialog con data di pagamento (stesso dialog gia usato per i costi manuali)
  - Se pagato: icona undo arancione per riportare a "non pagato"
- Aggiornare il badge di stato: se l'articolo e pagato, mostrare "Pagato il DD/MM/YYYY"
- Creare due nuove mutation:
  - `markOrderItemPaidMutation`: aggiorna `order_items` con `is_paid = true, paid_date = data`
  - `markOrderItemUnpaidMutation`: aggiorna `order_items` con `is_paid = false, paid_date = null`
- Aggiornare i filtri di stato per gestire correttamente gli articoli pagati/non pagati
- Aggiornare i totali KPI per escludere gli articoli gia pagati dal "Da pagare"
- Mantenere il link "Vai all'ordine" accanto alle nuove azioni

### 3. Dettagli tecnici

| Modifica | Dettaglio |
|----------|-----------|
| Migrazione | `ALTER TABLE order_items ADD COLUMN is_paid boolean DEFAULT false, ADD COLUMN paid_date date` |
| Query order_items | Aggiungere `is_paid, paid_date` al select |
| `markOrderItemPaidMutation` | UPDATE order_items SET is_paid=true, paid_date=? WHERE id=? |
| `markOrderItemUnpaidMutation` | UPDATE order_items SET is_paid=false, paid_date=null WHERE id=? |
| Dialog pagamento | Riutilizzare lo stesso dialog gia presente, distinguendo se si sta pagando un costo manuale o un articolo ordine |
| Badge stato | Articolo pagato mostra "Pagato il DD/MM/YYYY" invece di "Da pagare"/"Ordinato" |
| Filtri | Articoli pagati visibili con filtro "Pagati", esclusi da "Da pagare" |

