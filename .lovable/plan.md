

# Piano: Fix Discrepanza "Da Incassare" tra Dashboard, Ordini e Previsionale

## Problema Identificato

La Dashboard mostra un valore "Saldi da Incassare" diverso rispetto alla pagina Ordini e al Previsionale perche calcola solo i **saldi non pagati**, ignorando gli **acconti non pagati**.

| Vista | Cosa calcola | Corretto? |
|-------|-------------|-----------|
| Ordini (OrdersList) | Acconto 1 + Acconto 2 + Saldo non pagati | Si |
| Previsionale (CashFlowForecast) | Acconto 1 + Acconto 2 + Saldo non pagati | Si |
| Dashboard (CompanyDashboard) | Solo Saldo non pagato | **NO** |

## Fix

### File: `src/pages/azienda/CompanyDashboard.tsx`

**1. Modificare la query `pendingRevenueRes`** (riga 69-73)

Attualmente:
```text
supabase
  .from("orders")
  .select("balance_amount, balance_paid")
  .eq("company_id", companyId!)
  .or("balance_paid.is.null,balance_paid.eq.false")
```

Deve diventare:
```text
supabase
  .from("orders")
  .select("deposit_amount, deposit_paid, deposit_2_amount, deposit_2_paid, balance_amount, balance_paid")
  .eq("company_id", companyId!)
```

**2. Modificare il calcolo `pendingRevenue`** (righe 110-112)

Attualmente somma solo `balance_amount`. Deve sommare tutte le rate non pagate:

```text
let pendingRevenue = 0;
let pendingOrdersCount = 0;

pendingRevenueRes.data?.forEach(order => {
  let orderPending = 0;
  if (!order.deposit_paid && Number(order.deposit_amount) > 0)
    orderPending += Number(order.deposit_amount);
  if (!order.deposit_2_paid && Number(order.deposit_2_amount) > 0)
    orderPending += Number(order.deposit_2_amount);
  if (!order.balance_paid && Number(order.balance_amount) > 0)
    orderPending += Number(order.balance_amount);
  if (orderPending > 0) {
    pendingRevenue += orderPending;
    pendingOrdersCount++;
  }
});
```

**3. Rinominare la label** della stat card da "Saldi da Incassare" a "Da Incassare" per coerenza con la pagina Ordini.

---

## Riepilogo

| File | Modifica |
|------|----------|
| `src/pages/azienda/CompanyDashboard.tsx` | Fix query e calcolo pendingRevenue per includere tutti i pagamenti non incassati |

Nessun altro file da modificare. Nessuna migrazione DB necessaria.

