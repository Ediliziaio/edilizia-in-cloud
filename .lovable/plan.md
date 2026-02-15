
# Verifica e Pulizia: Cast `(item as any)` Inutili

## Stato Attuale
Tutte le funzionalita implementate (Data Prevista Acconto, deduplicazione interface, forwardRef) funzionano correttamente. Console pulita, nessun errore. La colonna `deposit_expected_date` e presente nei tipi generati e nel database.

## Problema Trovato

### Cast `(item as any)` non necessari
I tipi Supabase generati per `order_items` includono gia tutti i campi (`deposit_amount`, `deposit_paid`, `deposit_paid_date`, `balance_amount`, `balance_paid`, `balance_paid_date`, `balance_expected_date`, `deposit_expected_date`, `unit_price`, `discount_percent`, `standard_cost`). I cast `(item as any)` sono residui di quando i campi non erano ancora nei tipi e ora sono codice morto da pulire.

### File coinvolti

| File | Righe | N. cast da rimuovere |
|---|---|---|
| `src/pages/azienda/EditOrder.tsx` | 297-304, 376-383 | 16 cast (2 blocchi identici) |
| `src/pages/azienda/OrderDetail.tsx` | 549-551, 562 | 4 cast |

## Interventi

### File: `src/pages/azienda/EditOrder.tsx`
Sostituire tutti i `(item as any).campo` con `item.campo` direttamente, in entrambi i blocchi di mappatura items (righe ~297-304 e ~376-383):
- `(item as any).deposit_amount` -> `item.deposit_amount`
- `(item as any).deposit_paid` -> `item.deposit_paid`
- `(item as any).deposit_paid_date` -> `item.deposit_paid_date`
- `(item as any).balance_amount` -> `item.balance_amount`
- `(item as any).balance_paid` -> `item.balance_paid`
- `(item as any).balance_paid_date` -> `item.balance_paid_date`
- `(item as any).balance_expected_date` -> `item.balance_expected_date`
- `(item as any).deposit_expected_date` -> `item.deposit_expected_date`

### File: `src/pages/azienda/OrderDetail.tsx`
Stessa operazione per le righe ~549-551 e 562:
- `(item as any).unit_price` -> `item.unit_price`
- `(item as any).discount_percent` -> `item.discount_percent`
- `(item as any).standard_cost` -> `item.standard_cost`
- `(item as any).deposit_expected_date` -> `item.deposit_expected_date`

## Cosa e gia OK (verificato)

- `OrderItemsList.tsx`: interface completa, state e UI per Data Prevista Acconto funzionanti
- `CreateOrder.tsx`: mappatura corretta senza cast
- `orderUtils.ts`: centralizzato, nessuna duplicazione
- `FinancialSummary.tsx`: forwardRef OK
- `OrdersPipelineView/Column`: importano da orderUtils
- Console: nessun errore o warning
- Database: colonna `deposit_expected_date` presente nella tabella `order_items`

## Vincolo
Nessun cambiamento funzionale. Solo rimozione di cast `as any` non necessari per migliorare type-safety.
