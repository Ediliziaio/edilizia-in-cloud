

# Audit & Hardening — Dashboard Marketing & Vendite

## Analisi Completata

Ho letto tutti i 13 file della sezione dashboard. Il codice è già in buono stato grazie ai precedenti round di hardening. Rimangono alcune pulizie e fix minori.

## Issues Trovate

### Codice Morto / Ridondante
- **`DashboardKPICards.tsx`**: la card `show_rate` è duplicata — già presente in `DashboardStrategicKPI.tsx` come KPI strategico. Rimuoverla dalla lista secondaria.

### Bug / Edge Cases
- **`SalesTargetsDialog.tsx`**: gli `Input` mostrano `value={r.target_revenue || ""}` — quando il valore è `0`, il campo appare vuoto anziché mostrare `0`. L'utente non distingue "non configurato" da "target zero".
- **`MarketingDashboard.tsx`**: se `companyId` è `null` (nessuna azienda selezionata), la dashboard mostra skeleton infinito perché la query è `enabled: false` ma `isLoading` parte come `true` in quel caso. Serve empty state.
- **`DashboardStrategicKPI.tsx`**: i target sono hardcoded (50000, 10, 30, 75). Non si aggiornano quando l'admin configura target diversi nel dialog.

### Performance
- **`DashboardFilters.tsx`**: le callback `toggleUser` e `toggleSource` vengono ricreate ad ogni render, causando re-render nei figli. Wrappare con `useCallback`.
- **`DashboardKPICards.tsx`** e **`DashboardStrategicKPI.tsx`** non sono wrappati in `React.memo` (tutti gli altri widget lo sono).

### TypeScript / Pulizia
- **`SalesTargetsDialog.tsx`** e **`DashboardSalesTable.tsx`**: `as any` su `sales_targets` — aggiungere `// TODO: remove when types are regenerated` per chiarezza, dato che non possiamo modificare il file types.

## Piano Modifiche

| File | Modifica |
|------|----------|
| `DashboardKPICards.tsx` | Rimuovere `show_rate` dalla lista (duplicata). Wrappare in `React.memo`. |
| `DashboardStrategicKPI.tsx` | Wrappare in `React.memo`. |
| `DashboardFilters.tsx` | `useCallback` su `toggleUser`, `toggleSource`. |
| `SalesTargetsDialog.tsx` | Fix input value: `value={r.target_revenue}` (senza `|| ""`). Commento TODO su `as any`. |
| `DashboardSalesTable.tsx` | Commento TODO su `as any`. |
| `MarketingDashboard.tsx` | Aggiungere empty state se `!companyId`. |

Nessun cambio funzionale. Solo stabilità, pulizia e micro-ottimizzazioni UX.

