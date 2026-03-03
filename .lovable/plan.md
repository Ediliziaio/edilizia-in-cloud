

# Rimuovere filtro Cliente dalla Dashboard

Rimuovere completamente la sezione "Cliente" dal componente `CompanyDashboardFilters.tsx`:

1. **`CompanyDashboardFilters.tsx`**:
   - Rimuovere `customerIds` da `CompanyDashboardFiltersState`
   - Rimuovere imports non più necessari (`Users`, `Checkbox`, `ScrollArea`, `Badge`, `useCallback`)
   - Rimuovere la query `customers` (righe 59-78)
   - Rimuovere `toggleCustomer` callback (righe 80-86)
   - Rimuovere il blocco UI "Customer filter" (righe 160-193)
   - Aggiornare `activeFilterCount` per non contare più `customerIds`

2. **`CompanyDashboard.tsx`**:
   - Rimuovere `customerIds: []` dallo stato iniziale dei filtri
   - Rimuovere il filtro `.in("customer_id", ...)` dalle query che lo usano

