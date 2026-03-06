

# Fix: Incassi mancanti nel Previsionale — Ordini senza installments

## Problema identificato

Ho verificato il database e trovato la causa precisa: **2 ordini con incassi a febbraio esistono solo nelle colonne legacy della tabella `orders`** (`deposit_paid`, `deposit_paid_date`, ecc.) ma **non hanno righe corrispondenti nella tabella `order_installments`**.

Il tab "Già incassato" legge esclusivamente da `order_installments`, quindi questi pagamenti sono invisibili.

Dati concreti:
- Ordine `Cliente 1` — acconto €3.000 pagato il 12/02/2026 → nessun record in `order_installments`
- Ordine `Cliente 2` — acconto €2.000 pagato il 14/02/2026 → nessun record in `order_installments`

## Soluzione: doppia strategia

### 1. Migration DB — Backfill degli installments mancanti
Creare una migration SQL che, per ogni ordine senza righe in `order_installments`, generi automaticamente le righe dalle colonne legacy (`deposit_amount/paid/paid_date`, `deposit_2_*`, `balance_*`, `financing_*`). Questo è idempotente: inserisce solo dove non esistono già.

### 2. Fallback nel frontend — `CollectedTab` legge anche da colonne legacy
Modificare `useCashFlowData.ts` per aggiungere una query separata sugli ordini che **non** hanno installments ma hanno pagamenti registrati nelle colonne legacy. Unire questi risultati con quelli da `order_installments` per garantire completezza.

In alternativa (più pulito): dopo il backfill DB, il frontend non necessita modifiche. Ma il fallback frontend protegge da eventuali ordini futuri creati senza installments.

### Approccio raccomandato
**Solo migration DB** (opzione più pulita): il trigger `sync_installments_to_order_columns` già sincronizza installments → orders. Con il backfill inverso una tantum, tutti gli ordini avranno i loro installments e il sistema sarà coerente. Nessuna modifica frontend necessaria.

## Dettaglio tecnico

**Migration SQL:**
```sql
INSERT INTO order_installments (order_id, position, label, type, amount, is_paid, paid_date, expected_date)
SELECT o.id, 0, 'Acconto', 'deposit', o.deposit_amount, o.deposit_paid, o.deposit_paid_date, o.deposit_expected_date
FROM orders o
WHERE o.deposit_amount > 0
  AND NOT EXISTS (SELECT 1 FROM order_installments oi WHERE oi.order_id = o.id AND oi.type = 'deposit' AND oi.position = 0)
UNION ALL
-- deposit_2, balance, financing con stessa logica...
```

Questo coprirà tutti i 4 tipi di pagamento (deposit, deposit_2, balance, financing) e risolverà immediatamente il problema dei dati mancanti a febbraio e in qualsiasi altro periodo.

