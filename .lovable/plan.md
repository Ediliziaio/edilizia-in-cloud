

## Correzione: Margine medio ponderato sul fatturato

### Problema
Riga 220-221 di `useMarginData.ts` calcola la media semplice: `Σ(marginPercent) / N`. Un ordine da €500 con margine 80% pesa quanto uno da €50.000 con margine 10% — distorce il break-even.

### Correzione
Sostituire con media ponderata: `Σ(grossMargin) / Σ(totalAmount) × 100`

### File: `src/hooks/useMarginData.ts`

**Righe 220-222** — da:
```typescript
const avgMarginPercent = ordersWithRevenue.length > 0
  ? ordersWithRevenue.reduce((s, o) => s + o.marginPercent, 0) / ordersWithRevenue.length
  : 0;
```

a:
```typescript
const totalRevenueAll = ordersWithRevenue.reduce((s, o) => s + o.totalAmount, 0);
const totalMarginAll = ordersWithRevenue.reduce((s, o) => s + o.grossMargin, 0);
const avgMarginPercent = totalRevenueAll > 0
  ? (totalMarginAll / totalRevenueAll) * 100
  : 0;
```

Stessa correzione va applicata in `src/hooks/useBreakEvenHistorical.ts` dove `avgMarginPercent` è già calcolato correttamente come ponderato (`grossMargin / revenue * 100`), quindi nessuna modifica necessaria lì.

Un solo file modificato, 3 righe sostituite con 4.

