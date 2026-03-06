

# Fix calcolo IVA nei Costi — Imponibile vs Lordo

## Problema
L'imponibile e il lordo risultano uguali perche il `vat_rate` non viene mai propagato correttamente:

1. **Costi da ordine**: la query `order_items` fetcha solo `supplier:suppliers(name)` — manca `vat_rate`. Gli oggetti `UnifiedCost` generati non impostano mai `vat_rate`, quindi il calcolo usa `0` e lordo = imponibile.

2. **Costi manuali**: il codice legge `c.vat_rate` (colonna del costo), ma se e `null` non fa fallback a `c.supplier?.vat_rate`. Molti costi hanno `vat_rate` nullo anche se il fornitore ha l'aliquota configurata.

## Soluzione

### File: `src/hooks/useCompanyCostsData.ts`

1. **Query `order_items`** (riga ~96): aggiungere `vat_rate` al join supplier:
   ```
   supplier:suppliers(name, vat_rate)
   ```

2. **Trasformazione order items** (~170-235): propagare `vat_rate` dal supplier nell'oggetto `UnifiedCost`:
   ```typescript
   vat_rate: item.supplier?.vat_rate ?? null,
   ```
   Per tutti e 3 i push (deposit, balance, full).

3. **Trasformazione external teams, employees, commissions**: impostare `vat_rate: 0` esplicitamente (stipendi e provvigioni sono esenti IVA).

### File: `src/components/forecast/CostsTable.tsx`

4. **Lettura `vat_rate`** (~127, ~235, ~89, ~105): aggiungere fallback al supplier:
   ```typescript
   const vr = Number(c.vat_rate) || Number((c as any).supplier?.vat_rate) || 0;
   ```
   Questo copre i costi manuali che hanno `vat_rate` nullo ma un fornitore con aliquota.

### Impatto
- Tutte le righe mostreranno il lordo corretto (imponibile + IVA del fornitore)
- Il footer somma totali coerenti
- Nessuna modifica al DB

