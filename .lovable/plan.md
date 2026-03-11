

## Stima fatturato mensile: ultimi 12 mesi

### Problema
Righe 264-272: il fatturato mensile è calcolato come `totalRevenue / monthsActive` su tutto lo storico. Se l'azienda è cresciuta, questo sottostima il ritmo attuale.

### Correzione
Filtrare gli ordini agli ultimi 12 mesi per calcolare `currentMonthlyRevenue`:

```typescript
const twelveMonthsAgo = new Date();
twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

const recentOrders = orders.filter(o => {
  const raw = ordersRaw?.find(r => r.id === o.orderId);
  return raw?.created_at && new Date(raw.created_at) >= twelveMonthsAgo;
});

const recentRevenue = recentOrders.reduce((s, o) => s + o.totalAmount, 0);
const oldestRecent = ordersRaw?.filter(r => r.created_at && new Date(r.created_at) >= twelveMonthsAgo)
  .map(r => new Date(r.created_at!).getTime());
const monthsInWindow = oldestRecent && oldestRecent.length > 0
  ? Math.max(1, (now.getTime() - Math.min(...oldestRecent)) / (1000 * 60 * 60 * 24 * 30))
  : 1;
const currentMonthlyRevenue = recentRevenue / monthsInWindow;
```

Se non ci sono ordini negli ultimi 12 mesi, fallback al calcolo storico attuale.

### File modificato
- `src/hooks/useMarginData.ts` — righe 264-272

