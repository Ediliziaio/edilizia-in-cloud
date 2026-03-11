

# Piano: Aggiungere Fatturato, Incassato, Costi Pagati sotto i filtri data di TodayFocus

## Dati disponibili

Tutti e tre i valori sono ricavabili con `paid_date` (presente sia in `order_installments` che `company_costs`) e `created_at` degli ordini:

- **Fatturato**: somma `total_amount` degli ordini creati nel range (`orders.created_at`)
- **Incassato**: somma `amount` delle rate pagate nel range (`order_installments.paid_date`)
- **Costi Pagati**: somma `amount` dei costi pagati nel range (`company_costs.paid_date`)

## Modifiche

### 1. `src/hooks/useCruscottoData.ts`

Aggiungere 3 campi a `TodayData`: `revenueInRange`, `collectedInRange`, `costsPaidInRange`.

Nella query `cruscotto-today`, aggiungere 3 query parallele:
- `orders` con `created_at` nel range → somma `total_amount`
- `order_installments` con `is_paid = true` e `paid_date` nel range → somma `amount`
- `company_costs` con `is_paid = true` e `paid_date` nel range → somma `amount`

### 2. `src/components/cruscotto/TodayFocus.tsx`

Sotto la riga dei preset (Oggi/Ieri/7gg/30gg), aggiungere una riga di 3 mini-badge compatti:

```
Fatturato: €X | Incassato: €X | Costi Pagati: €X
```

Stile: `text-[11px]` con separatori, colori contestuali (verde per incassato, rosso per costi).

## File coinvolti

| File | Modifica |
|------|----------|
| `src/hooks/useCruscottoData.ts` | 3 nuovi campi TodayData + 3 query parallele |
| `src/components/cruscotto/TodayFocus.tsx` | Riga mini-stats sotto i filtri |

