

# Audit e Fix del Previsionale di Cassa

## Problemi Critici Trovati

### BUG 1 — TreasuryTab legge campi legacy inesistenti (CRITICO)
**File**: `src/components/forecast/TreasuryTab.tsx` (righe 166-179)

Il tab Tesoreria legge `deposit_paid`, `deposit_amount`, `balance_paid`, ecc. dagli oggetti `orders`, ma `orders` e' in realta' `installmentsData` (da `useCashFlowData.ts` riga 280), cioe' record della tabella `order_installments` con campi `is_paid`, `amount`, `paid_date`, `type`. Il risultato e' che **tutte le entrate nella Tesoreria sono a zero** perche' i campi legacy non esistono sugli installments.

**Fix**: Riscrivere la logica income della Treasury per leggere correttamente `is_paid`, `amount`, `paid_date`, `type` dai record installment.

### BUG 2 — Console warning: ExpectedGroupSection senza forwardRef
**File**: `src/components/forecast/CollectedTab.tsx` (riga 475)

`CollapsibleTrigger asChild` tenta di passare un ref a `ExpectedGroupSection` che non lo supporta. Non causa crash ma genera warning continui.

**Fix**: Il trigger e' gia' su un `<button>`, non su `ExpectedGroupSection` stesso — il warning viene dal fatto che `Collapsible` wrappa il componente. Verificare e risolvere.

### BUG 3 — Filtro "Ultimo trimestre" su tab previsionali mostra dati passati
I tab Costi e Cassa filtrano per "ultimo trimestre" (3 mesi fa → mese scorso), ma i dati sono **previsionali futuri** (non pagati). Questo preset non ha senso per costi non ancora pagati e mostra quasi sempre zero risultati.

**Fix**: Rinominare in "Prossimo trimestre" e impostare range al futuro, oppure adattare la logica per mostrare dati con date nel range passato che sono ancora non pagati.

### ISSUE 4 — Nessuna gestione items senza data nel filtro CostsForecastTab
Quando `inDateRange(null)` con un preset attivo diverso da "all", restituisce `false`. I costi senza data prevista scompaiono quando si seleziona qualsiasi filtro diverso da "Tutto".

**Fix**: Aggiungere logica per mostrare sempre i costi senza data (o con una nota visiva).

## Interventi di Hardening

### 5. Eliminare `as any` su query installments
`useCashFlowData.ts` riga 32: `(supabase as any)` — il tipo e' disponibile dopo la migration, rimuovere il cast.

### 6. Memoizzazione mancante in TreasuryTab
`flattenTree` (riga 419) e' una funzione ricreata ad ogni render ma usata dentro `useMemo`. Spostare dentro il `useMemo` o wrappare con `useCallback`.

### 7. Query N+1 in useMarginData
`useMarginData` esegue query cascading: prima carica ordini, poi 3 query separate filtrate per `order_id IN (...)`. Con 500 ordini, i filtri `IN` sono molto grandi. Accettabile per ora ma da monitorare.

## Piano di Implementazione

1. **Fix TreasuryTab income** — riscrivere il blocco entrate per leggere da installments (`is_paid`, `amount`, `paid_date`, `type/label`)
2. **Fix console warning** — verificare e risolvere il ref issue su ExpectedGroupSection
3. **Fix filtro "Ultimo trimestre"** nei tab Costi e Cassa — adattare il preset per i dati previsionali
4. **Fix items senza data** — gestire `null` dates nei filtri di CostsForecastTab e CashForecastTab
5. **Rimuovere `as any`** sulla query installments
6. **Cleanup memoizzazione** in TreasuryTab

