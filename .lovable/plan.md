

# Fix: Calcolo "Ultimo Ordine" inconsistente tra lista e dettaglio

## Problema
La lista aziende mostra "1gg fa" mentre il dettaglio mostra "2g fa" per lo stesso ordine. Questo perche usano due metodi di calcolo diversi:

- **Lista** (`CompaniesList.tsx`): usa `differenceInDays()` di date-fns che tronca (1.5 giorni = 1)
- **Dettaglio** (`useCompanyDetail.ts`): usa `Math.round()` manuale che arrotonda (1.5 giorni = 2)

## Soluzione
Allineare entrambi allo stesso metodo: `differenceInDays()` di date-fns, che e il piu standard e intuitivo ("quanti giorni interi sono passati").

## Modifiche

### File: `src/hooks/useCompanyDetail.ts` (riga 270-274)

Sostituire il calcolo manuale con `differenceInDays`:

```typescript
// PRIMA (Math.round - arrotonda)
const daysSinceLastOrder = useMemo(() => {
  if (!recentOrders || recentOrders.length === 0) return null;
  const lastDate = new Date(recentOrders[0].created_at);
  return Math.round((Date.now() - lastDate.getTime()) / (24 * 60 * 60 * 1000));
}, [recentOrders]);

// DOPO (differenceInDays - tronca, coerente con la lista)
const daysSinceLastOrder = useMemo(() => {
  if (!recentOrders || recentOrders.length === 0) return null;
  return differenceInDays(new Date(), new Date(recentOrders[0].created_at));
}, [recentOrders]);
```

Aggiungere l'import di `differenceInDays` da `date-fns` se non gia presente.

### Nessuna modifica a `CompaniesList.tsx`
Gia usa `differenceInDays` correttamente.

| File | Modifica |
|------|----------|
| `useCompanyDetail.ts` | Sostituire `Math.round` con `differenceInDays` + import |
