

# Bug residuo: Mismatch stats KPI "Previsti" vs tab "Previsti"

## Bug trovato

In `src/hooks/useCompanyCostsData.ts`, la tab "Previsti" (riga 314) e stata corretta correttamente:
```typescript
const previsti = all.filter(c => !c.is_paid && c.due_date && new Date(c.due_date) > now);
```

Ma il **KPI stats** (riga 350) ha ancora il filtro sbagliato:
```typescript
const previstiList = allFiltered.filter((c: any) => c.recurrence !== "once" && !c.is_paid && c.due_date && new Date(c.due_date) > now);
```

Risultato: la card "Previsti" mostra un totale diverso dal contenuto della tab "Previsti". Un costo one-shot futuro non pagato appare nella tab ma non viene contato nel KPI.

## Verifica altri file

Tutti gli altri 4 file sono stati implementati correttamente:

| File | Fix | Stato |
|------|-----|-------|
| `usePrimaNota.ts` | `.limit(10000)` + invalidazione `cashflow.summary` | OK |
| `useScadenzario.ts` | `.limit(10000)` + invalidazioni `cashflow.scadenze`, `cashflow.summary`, `prima-nota-saldo` | OK |
| `useCompanyCostsMutations.ts` | `cashflow.summary` in tutte le 4 invalidation helpers | OK |
| `CashFlowForecast.tsx` | `scadenzeForForecast` nell'export CSV | OK |
| `useCompanyCostsData.ts` | Tab previsti corretta, **stats KPI ancora sbagliato** | FIX NEEDED |

## Correzione

**File:** `src/hooks/useCompanyCostsData.ts`, riga 350

Rimuovere `c.recurrence !== "once" &&` dalla riga stats per allinearla alla tab:

```typescript
const previstiList = allFiltered.filter((c: any) => !c.is_paid && c.due_date && new Date(c.due_date) > now);
```

Una singola riga da modificare. Nessun rischio di regressione.

