

# Migrazione Previsionale e Cruscotto a `order_installments`

## ✅ COMPLETATA

### Modifiche effettuate

#### 1. `src/hooks/useCashFlowData.ts`
- Query `forecast-orders` → `forecast-installments`: legge da `order_installments` con join su `orders` per `order_code` e `customer`
- Memo `expectedPayments`: itera installments dinamiche (N rate) usando `label` come tipo e `is_paid`/`amount`/`expected_date`
- Aggiunto alias `orders = installmentsData` per compatibilità con CollectedTab

#### 2. `src/hooks/useCruscottoData.ts`
- Query `cruscotto-payments` → `cruscotto-installments`: legge da `order_installments` filtrata per `is_paid = false`
- Operations: itera installments per calcolo scaduti
- Finance: itera installments per `pendingRevenue`/`thisMonthIncome`
- Weekly: itera installments per `incomingPayments`

#### 3. `src/components/forecast/CollectedTab.tsx`
- Aggiornato per leggere installments invece dei 4 campi legacy

#### 4. `src/lib/forecastTypes.ts`
- `ExpectedPayment.type`: da union `"Acconto 1" | ...` a `string` per supportare label dinamiche

### Risultato
- Supporto illimitato di rate nel previsionale e nel cruscotto
- Le colonne legacy su `orders` restano sincronizzate dal trigger `sync_installments_to_order_columns`
