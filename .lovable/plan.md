
# Fix Registrazione Pagamento nei Costi

## Problema

Il handler del dialog "Conferma Pagamento" (riga 1907-1915) gestisce solo 3 casi:
1. Articoli fornitore (con `realOrderItemId`) → aggiorna `order_items`
2. Squadre esterne (ID che inizia con `ext-team-`) → aggiorna `order_external_teams`
3. **Tutto il resto** → aggiorna `company_costs`

Ma le **provvigioni** (ID `commission-xxx`) e i **costi dipendente** (ID `emp-cost-xxx`) finiscono nel caso 3, che tenta di aggiornare la tabella `company_costs` con un ID inesistente. Il pagamento fallisce silenziosamente.

Lo stesso problema esiste nel pulsante "Riporta a non pagato" (riga 1355-1358): gestisce solo `realOrderItemId` e `ext-team-`, ignorando provvigioni e dipendenti.

## Soluzione

### 1. Aggiungere due nuove mutation

- **`markCommissionPaidMutation`**: aggiorna `order_salespeople` con `is_paid = true, paid_date = date`
- **`markCommissionUnpaidMutation`**: aggiorna `order_salespeople` con `is_paid = false, paid_date = null`
- **`markEmployeeCostPaidMutation`**: aggiorna `order_labor_costs` con `is_paid = true, paid_date = date`
- **`markEmployeeCostUnpaidMutation`**: aggiorna `order_labor_costs` con `is_paid = false, paid_date = null`

### 2. Aggiornare il handler "Conferma Pagamento" (riga 1907-1915)

Aggiungere i due nuovi casi prima del fallback:

```text
if (realOrderItemId)        → markOrderItemPaidMutation
else if (id = "ext-team-")  → markExtTeamPaidMutation
else if (id = "commission-")→ markCommissionPaidMutation  (NUOVO)
else if (id = "emp-cost-")  → markEmployeeCostPaidMutation (NUOVO)
else                        → markPaidMutation (company_costs)
```

### 3. Aggiornare il pulsante "Riporta a non pagato" (riga 1355-1358)

Stessa logica per i casi di unpaid:

```text
if (realOrderItemId)        → markOrderItemUnpaidMutation
else if (id = "ext-team-")  → markExtTeamUnpaidMutation
else if (id = "commission-")→ markCommissionUnpaidMutation (NUOVO)
else if (id = "emp-cost-")  → markEmployeeCostUnpaidMutation (NUOVO)
```

### 4. Aggiornare lo stato disabled del bottone

Aggiungere `markCommissionPaidMutation.isPending` e `markEmployeeCostPaidMutation.isPending` alla condizione `disabled` del bottone "Conferma Pagamento".

## Verifica tabella database

Prima di implementare, verificare che `order_salespeople` abbia le colonne `is_paid` e `paid_date` (dai dati di rete risulta che le ha). Verificare anche `order_labor_costs` per i costi dipendente.

## File modificato

| File | Azione |
|------|--------|
| `src/components/forecast/CompanyCostsManager.tsx` | Aggiungere 4 mutation + aggiornare handler pagamento/unpaid |
