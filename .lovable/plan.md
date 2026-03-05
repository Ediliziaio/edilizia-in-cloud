

# Aggiungere Modifica Stato Pagamenti nel Dettaglio Ordine

## Problema
Nel Dettaglio Ordine, il `FinancialSummaryReadOnly` mostra lo stato dei pagamenti (Acconto 1, Acconto 2, Saldo, Finanziamento) come testo statico. L'utente deve andare in "Modifica Ordine" per cambiare lo stato pagato/non pagato.

## Soluzione
Rendere lo stato di pagamento modificabile direttamente dal Dettaglio Ordine, mantenendo gli importi in sola lettura.

### Modifiche

**1. `src/components/orders/FinancialSummary.tsx` — Aggiungere interattività a `FinancialSummaryReadOnly`**

Aggiungere props opzionali di callback (`onDepositPaidToggle`, `onDeposit2PaidToggle`, `onBalancePaidToggle`, `onFinancingPaidToggle`) al componente `FinancialSummaryReadOnly`. Quando presenti, ogni riga di pagamento mostra un bottone/switch cliccabile per cambiare lo stato pagato/non pagato (con data automatica = oggi). Quando assenti, il comportamento resta identico a oggi (testo statico).

Ogni riga di pagamento con importo > 0 diventa cliccabile: un click su "In attesa" lo cambia in "Pagato" (con data = oggi), e viceversa.

**2. `src/pages/azienda/OrderDetail.tsx` — Aggiungere mutation e passare callbacks**

Creare una mutation `updatePaymentStatusMutation` che aggiorna i campi di pagamento sulla tabella `orders` (es. `deposit_paid`, `deposit_paid_date`, `deposit_2_paid`, `balance_paid`, `financing_paid`, ecc.) e invalida le query correlate (`["order", id]`, `["orders"]`).

Passare le callbacks a `FinancialSummaryReadOnly`:
- `onDepositPaidToggle(paid: boolean)` → aggiorna `deposit_paid` + `deposit_paid_date`
- `onDeposit2PaidToggle(paid: boolean)` → aggiorna `deposit_2_paid` + `deposit_2_paid_date`
- `onBalancePaidToggle(paid: boolean)` → aggiorna `balance_paid` + `balance_paid_date`
- `onFinancingPaidToggle(paid: boolean)` → aggiorna `financing_paid` + `financing_paid_date`

Ogni toggle imposta la data di pagamento a oggi se `paid=true`, o a `null` se `paid=false`.

### UI
Ogni riga di pagamento mostrerà un piccolo switch o bottone accanto allo stato, con feedback toast immediato ("Acconto 1 segnato come pagato", "Saldo segnato come da pagare").

### Propagazione
L'invalidazione delle query `["order", id]` e `["orders"]` garantisce che tutti i componenti che leggono quei dati (OrderEconomics, SupplierPaymentsCard, lista ordini, ecc.) si aggiornino automaticamente.

