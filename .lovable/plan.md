

# Stabilizzazione Installments Dinamiche — Audit & Fix

## Bug identificati

### BUG-1: Warning React "Function components cannot be given refs"
- `PaymentStatusRow` e `DatePickerField` in `FinancialSummary.tsx` usano `React.forwardRef`, ma il `ref` non viene mai passato dai componenti parent e i componenti Radix interni (Select, Popover) non lo supportano.
- **Fix**: Rimuovere `forwardRef` da entrambi, convertirli in normali function components.

### BUG-2: Calcolo morto in CustomerFinancialSummary
- Riga 91: `clientBalance + (clientBalance * vatRate / 100 / (1 + vatRate / 100) * 0)` — la moltiplicazione per `0` rende tutta l'espressione inutile, equivale a `clientBalance`.
- **Fix**: Sostituire con `formatCurrency(clientBalance)`.

### BUG-3: useEffect rawAmountInputs si resetta ad ogni cambio installments
- L'effetto alla riga 201-209 di `FinancialSummary.tsx` resetta i valori raw degli input ogni volta che `installments` cambia. Quando l'utente fa blur su un campo importo, `onInstallmentsChange` aggiorna l'array, il che triggera il useEffect e riscrive `rawAmountInputs`. Questo funziona ma causa un flash inutile e potenziali race condition con input rapidi.
- **Fix**: Usare una comparazione più selettiva — aggiornare `rawAmountInputs` solo quando la struttura (numero/posizioni) cambia, non quando cambia un importo.

## Verifiche integrazione

### Previsionale di Cassa (useCashFlowData)
- Legge dalle colonne legacy (`deposit_amount`, `balance_amount`, ecc.) — il trigger `sync_installments_to_order_columns` le tiene sincronizzate. **Nessun intervento necessario.**

### Cruscotto Aziendale (useCruscottoData)
- Usa la query `paymentsData` che legge le stesse colonne legacy. **Compatibilità confermata.**

### OrderDetail (read-only view)
- Carica da `order_installments` con fallback legacy via `buildInstallmentsFromLegacy`. **Funziona correttamente.**

### EditOrder
- Carica installments da DB, fallback legacy. Salva correttamente nell'array `order_installments` e nelle colonne legacy. **Funziona correttamente.**

## Modifiche pianificate

### File: `src/components/orders/FinancialSummary.tsx`
1. Rimuovere `React.forwardRef` da `DatePickerField` (riga 32-66) → function component standard
2. Rimuovere `React.forwardRef` da `PaymentStatusRow` (riga 72-149) → function component standard
3. Fix useEffect `rawAmountInputs` (riga 201-209): aggiungere comparazione strutturale (numero installments + posizioni) per evitare reset inutili degli input

### File: `src/components/orders/CustomerFinancialSummary.tsx`
1. Riga 91: rimuovere calcolo morto `+ (clientBalance * vatRate / 100 / (1 + vatRate / 100) * 0)`, lasciare solo `formatCurrency(clientBalance)`

## Cosa NON cambia
- Nessuna modifica al database
- Nessuna modifica ai hook finanziari (useCashFlowData, useCruscottoData)
- Nessuna modifica alla logica di business
- Compatibilità con ordini legacy preservata

