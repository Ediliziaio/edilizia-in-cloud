

# Migrazione Previsionale e Cruscotto a `order_installments`

## Stato attuale
- `useOrderDraft.ts`: già pulito, nessun campo legacy rimasto.
- `useCashFlowData.ts`: query `orders` (righe 34-56) legge 16 colonne legacy → `expectedPayments` (righe 294-353) le mappa a 4 tipi hardcoded (Acconto 1, Acconto 2, Saldo, Finanziamento). Supporta max 4 pagamenti per ordine.
- `useCruscottoData.ts`: query `paymentsData` (righe 99-111) legge colonne legacy da `orders`. Usata da operations (scaduti), finance (pendingRevenue), weekly (incoming).

## Piano

### 1. `useCashFlowData.ts` — Query `order_installments`
- **Sostituire** la query `forecast-orders` (righe 34-56) che legge colonne legacy da `orders` con una query su `order_installments` che fa join su `orders` per `order_code` e `customer`
- **Riscrivere** il memo `expectedPayments` (righe 294-353): iterare le righe di `order_installments` (N rate), usando `label` come tipo e `is_paid`/`amount`/`expected_date` direttamente
- Risultato: supporto illimitato di rate nel previsionale

### 2. `useCruscottoData.ts` — Query `order_installments`
- **Sostituire** la query `cruscotto-payments` (righe 99-111) che legge da `orders` con una query su `order_installments` filtrata per `is_paid = false`, con join su `orders` per `company_id`
- **Aggiornare** i 3 consumatori:
  - Operations (righe 136-147): iterare installments invece dei 4 campi hardcoded
  - Finance (righe 206-217): iterare installments per `pendingRevenue`/`thisMonthIncome`
  - Weekly (righe 270-281): iterare installments per `incomingPayments`

### 3. Nessuna modifica a `useOrderDraft.ts`
Già pulito nell'intervento precedente.

## File modificati
- `src/hooks/useCashFlowData.ts`
- `src/hooks/useCruscottoData.ts`

## Compatibilità
- Le colonne legacy su `orders` restano sincronizzate dal trigger `sync_installments_to_order_columns`
- Nessun altro file dipende da queste query interne ai hook
- I componenti UI che consumano `expectedPayments`, `stats`, ecc. non cambiano interfaccia

