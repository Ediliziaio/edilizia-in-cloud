

# Rate di pagamento dinamiche (N pagamenti) — Approccio A

## Architettura

Nuova tabella `order_installments` che sostiene N rate per ordine. Le colonne legacy sulla tabella `orders` vengono mantenute come cache di compatibilità (populate automaticamente dalle prime 3 rate + finanziamento) per non rompere i 16+ file che le leggono. La migrazione completa dei lettori avverrà in una fase successiva.

```text
order_installments
├── id (uuid PK)
├── order_id (FK → orders)
├── position (int, ordine di visualizzazione)
├── label (text: "Acconto 1", "Saldo", "Finanziamento"...)
├── type (text: "deposit" | "balance" | "financing")
├── amount (numeric)
├── is_paid (boolean)
├── paid_date (date)
├── expected_date (date)
└── created_at (timestamptz)
```

## Modifiche

### 1. Database (migrazione SQL)
- Creare tabella `order_installments` con RLS (policy per company via join su orders)
- Creare trigger `sync_installments_to_order_columns` che, ad ogni INSERT/UPDATE/DELETE su `order_installments`, aggiorna le colonne legacy su `orders` (deposit_amount, deposit_2_amount, balance_amount, ecc.) mappando le prime rate per tipo
- Aggiornare `create_order_atomic` per accettare un parametro `p_installments JSONB[]` e inserire le righe nella nuova tabella (oltre a continuare a scrivere le colonne legacy)

### 2. FinancialSummary.tsx — Refactoring UI
- Aggiungere un selettore "Numero rate" (Select: 1-10) visibile in modalità Standard
- Sostituire i campi hardcoded Acconto 1 / Acconto 2 / Saldo con un array dinamico di `PaymentStatusRow` generati da un array di stato `installments[]`
- Ogni rata ha: label auto ("Rata 1", "Rata 2"... + ultima = "Saldo"), amount, paid, paidDate, expectedDate
- Per il tipo Finanziamento: mantenere la struttura attuale (Acconto opzionale + Finanziamento + Saldo)
- L'interfaccia `FinancialSummaryProps` cambia: da `depositAmount/deposit2Amount/balanceAmount` a `installments: Installment[]` + callbacks

### 3. CreateOrder.tsx
- Sostituire gli state separati (depositAmount, deposit2Amount, balancePaid, ecc.) con un singolo `useState<Installment[]>`
- Il selettore numero rate aggiunge/rimuove elementi dall'array
- Il saldo (ultima rata) viene calcolato automaticamente come `totale - somma altre rate`
- Nella mutation: inviare `installments` come parametro a `create_order_atomic`

### 4. EditOrder.tsx
- Stessa logica di CreateOrder ma carica le installments dalla tabella al mount
- Se l'ordine non ha righe in `order_installments` (ordini legacy), ricostruisce l'array dalle colonne legacy

### 5. OrderDetail.tsx + FinancialSummaryReadOnly
- Leggere da `order_installments` (con fallback colonne legacy)
- Rendere N righe pagamento con toggle pagato/non pagato

### 6. CustomerOrderDetail + CustomerFinancialSummary
- Leggere da installments, mostrare N rate

### 7. Hooks forecast/cruscotto (Fase 2 — non in questo intervento)
- `useCashFlowData`, `useCruscottoData`, `CollectedTab`, `TreasuryTab` continueranno a leggere dalle colonne legacy (aggiornate dal trigger di sync)
- Migrazione a query su `order_installments` in un intervento successivo

### 8. orderUtils.ts + useOrderDraft.ts
- Aggiornare tipi e funzioni helper per supportare array installments
- Draft salva/ripristina l'array installments

## File modificati
- **Migrazione SQL**: nuova tabella + trigger sync + aggiornamento `create_order_atomic`
- `src/components/orders/FinancialSummary.tsx` — refactoring completo sezione pagamenti
- `src/pages/azienda/CreateOrder.tsx` — state dinamico installments
- `src/pages/azienda/EditOrder.tsx` — caricamento + state dinamico
- `src/pages/azienda/OrderDetail.tsx` — lettura installments + read-only
- `src/components/orders/CustomerFinancialSummary.tsx` — N rate
- `src/pages/cliente/CustomerOrderDetail.tsx` — passaggio dati
- `src/lib/orderUtils.ts` — tipi aggiornati
- `src/hooks/useOrderDraft.ts` — draft con installments

## Cosa NON cambia (compatibilità garantita)
- Le colonne legacy su `orders` restano e vengono sincronizzate dal trigger
- `useCashFlowData`, `useCruscottoData`, `CollectedTab`, `TreasuryTab`, `MarginTab` continuano a funzionare senza modifiche
- Automazioni e trigger esistenti non vengono toccati

