
# Fix Grafico Tesoreria: Barre Sempre Sopra Zero

## Problema
Le uscite vengono negate (riga 507: `-(treeData.usciteNode.monthlyAmounts[k] || 0)`) facendo andare le barre rosse sotto lo zero. In una tesoreria, entrate e uscite devono essere entrambe rappresentate come barre positive (sopra lo zero): verde per le entrate, rosso per le uscite.

## Correzione

### File: `src/components/forecast/TreasuryTab.tsx`

**1. Rimuovere la negazione nei dati del grafico (righe 507, 510)**

Da:
```typescript
expenses: -(treeData.usciteNode.monthlyAmounts[k] || 0),
forecastExpenses: -(forecastData.forecastExpensesMonthly[k] || 0),
```

A:
```typescript
expenses: treeData.usciteNode.monthlyAmounts[k] || 0,
forecastExpenses: forecastData.forecastExpensesMonthly[k] || 0,
```

**2. Aggiornare il tooltip (riga 527)**

Rimuovere il `Math.abs()` nel tooltip dato che i valori saranno gia positivi:
```typescript
{formatCurrency(entry.value)}
```

**3. Aggiornare il tickFormatter dell'asse Y (righe 594-597)**

Rimuovere il `Math.abs()` che non serve piu:
```typescript
tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
```

Nessun altro file da modificare. Il grafico mostrera entrate (verde) e uscite (rosso) entrambe sopra lo zero, con la linea della tesoreria che rappresenta il saldo cumulativo.
