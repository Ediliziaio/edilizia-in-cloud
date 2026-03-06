

# Fix filtro periodo per costi derivati da ordini

## Problema
Nella sezione Costi, il filtro periodo (es. "Prossimo mese") funziona solo per i costi manuali. I costi derivati da ordini (articoli fornitori, squadre esterne, provvigioni, stipendi) non vengono filtrati per periodo -- vengono sempre mostrati tutti.

## Causa tecnica
In `src/hooks/useCompanyCostsData.ts`:
- `filteredCosts` (riga 296-336): applica correttamente `periodFilter` ai costi manuali
- `filteredOrderItemCosts` (riga 339-352): **NON applica `periodFilter`** -- filtra solo per `searchQuery`, `statusFilter`, `categoryFilter` e `originFilter`

## Fix
Aggiungere la stessa logica di filtro per periodo a `filteredOrderItemCosts`, usando il campo `due_date` dei costi derivati:

```typescript
// In filteredOrderItemCosts, aggiungere filtro periodo:
if (periodFilter !== "all") {
  let start: Date, end: Date;
  if (periodFilter === "this_month") { start = startOfMonth(now); end = endOfMonth(now); }
  else if (periodFilter === "next_month") { start = startOfMonth(addMonths(now, 1)); end = endOfMonth(addMonths(now, 1)); }
  else if (periodFilter === "last_3_months") { start = startOfMonth(subMonths(now, 2)); end = endOfMonth(now); }
  else { start = startOfYear(now); end = endOfYear(now); }
  filtered = filtered.filter(c => {
    if (!c.due_date) return false;
    return isWithinInterval(new Date(c.due_date), { start, end });
  });
}
```

## File coinvolto
- `src/hooks/useCompanyCostsData.ts` -- aggiungere filtro periodo in `filteredOrderItemCosts` (riga ~339-352)

