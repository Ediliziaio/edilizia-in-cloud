
# Aggiungere "Data Prevista Acconto" negli Articoli

## Problema
Quando un articolo ha pagamento rateizzato (50/50 o 30/70) e l'acconto non e stato pagato, non c'e modo di inserire una data prevista per il pagamento dell'acconto. Il campo esiste gia per il saldo ("Data Prevista Saldo") ma manca per l'acconto.

## Interventi

### 1. Migrazione Database
Aggiungere la colonna `deposit_expected_date` alla tabella `order_items` (tipo `date`, nullable, default null).

### 2. Interface `OrderItem` (OrderItemsList.tsx)
Aggiungere il campo `deposit_expected_date?: string` all'interface, accanto ai campi deposit esistenti.

### 3. UI nel dialog articolo (OrderItemsList.tsx)
Nella sezione "Acconto" del form rateizzato (righe 492-516), aggiungere un date picker "Data Prevista Acconto" che appare quando `!itemDepositPaid` (speculare a come funziona gia "Data Prevista Saldo" per il saldo non pagato).

### 4. State e logica di salvataggio (OrderItemsList.tsx)
- Nuovo state: `itemDepositExpectedDate`
- Reset nel `resetForm()`
- Caricamento in `openEditDialog()`
- Salvataggio in `handleSaveItem()` dentro `commonFields`

### 5. Persistenza in CreateOrder.tsx e EditOrder.tsx
Includere `deposit_expected_date` nella mappatura degli order items quando vengono salvati su DB (insert e update).

### 6. Lettura in OrderDetail.tsx
Includere `deposit_expected_date` nel mapping degli item caricati, cosi il valore viene passato correttamente al componente `OrderItemsList`.

## Dettaglio Tecnico

### Migrazione SQL
```sql
ALTER TABLE order_items 
ADD COLUMN deposit_expected_date date DEFAULT null;
```

### File modificati

| File | Modifica |
|---|---|
| `src/components/orders/OrderItemsList.tsx` | Interface + state + UI date picker + save/load |
| `src/pages/azienda/CreateOrder.tsx` | Mappatura `deposit_expected_date` nell'insert items |
| `src/pages/azienda/EditOrder.tsx` | Mappatura nel load + update items |
| `src/pages/azienda/OrderDetail.tsx` | Mappatura nel load items |

### Comportamento UI
- Acconto NON pagato: mostra "Data Prevista Acconto" (date picker)
- Acconto pagato: mostra "Data Pagamento Acconto" (come gia funziona)
- Identico al pattern gia esistente per il Saldo
