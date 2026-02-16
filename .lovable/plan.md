

# Fix Tesoreria: Logica Finanziaria Corretta + Tooltip Agicap-Style

## Concetto Chiave

La **Tesoreria** rappresenta il saldo del conto corrente bancario. E' un valore cumulativo: Entrate - Uscite mese per mese. Il grafico (la linea blu) non puo MAI scendere sotto zero perche rappresenta quanto c'e in banca. La griglia sottostante invece mostra i flussi netti mensili che POSSONO essere negativi (mese in cui si e speso piu di quanto incassato).

## Stato Attuale

Il codice gia implementa `Math.max(0, cumulative)` alla riga 388, quindi la linea tesoreria non scende sotto zero. Le barre sono gia positive (fix precedente). Il problema principale e:

1. **Tooltip troppo semplice** -- non mostra Inizio/Fine/Variazione come nell'immagine di riferimento (stile Agicap)
2. **Y-axis tickFormatter** non gestisce valori negativi (se la tesoreria e 0 e expenses > income, il net puo essere negativo nella griglia ma il formatter usa `v >= 1000` che ignora negativi)

## Correzioni

### File: `src/components/forecast/TreasuryTab.tsx`

**1. Tooltip stile Agicap (righe 518-533)**

Riscrivere il `CustomTooltip` per mostrare la struttura dell'immagine di riferimento:

```
Maggio 2024
---------------------
TESORERIA
  Inizio      27.659,75 euro
  Fine        55.113,19 euro
  Variazione  +27.453,44 euro

ENTRATE
  Realizzato  62.305 euro

USCITE
  Realizzato  34.851 euro
```

Per fare questo, il tooltip deve accedere ai dati `startMonthly[k]` (saldo inizio mese) e `netMonthly[k]` (saldo fine mese) che sono gia calcolati nel `treeData`. Bisogna aggiungerli al `chartData`:
- `treasuryStart`: saldo inizio mese (calcolato come saldo fine mese precedente)
- `treasuryEnd`: saldo fine mese (gia presente come `treasury`)
- `variation`: entrate - uscite del mese

**2. Fix tickFormatter Y-axis (riga 594)**

Gestire anche valori negativi:
```typescript
tickFormatter={(v: number) => {
  const abs = Math.abs(v);
  return abs >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v);
}}
```

**3. Aggiungere campi al chartData (righe 502-513)**

Aggiungere `treasuryStart` (saldo inizio mese) a chartData per il tooltip ricco:
```typescript
monthKeys.map((k, i) => ({
  month: format(months[i], "MMM yy", { locale: it }),
  monthFull: format(months[i], "MMMM yyyy", { locale: it }),
  income: treeData.entrateNode.monthlyAmounts[k] || 0,
  expenses: treeData.usciteNode.monthlyAmounts[k] || 0,
  treasury: treeData.netMonthly[k] || 0,
  treasuryStart: treeData.startMonthly[k] || 0,
  forecastIncome: forecastData.forecastIncomeMonthly[k] || 0,
  forecastExpenses: forecastData.forecastExpensesMonthly[k] || 0,
  forecastTreasury: forecastData.forecastNetMonthly[k] || 0,
}))
```

## Dettagli tecnici

### Tooltip Custom (nuovo)

Il tooltip NON usa piu il generico `payload.map()` ma costruisce una struttura dedicata leggendo direttamente i campi dal `payload[0].payload` (l'oggetto chartData del mese):

```typescript
const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  const variation = data.income - data.expenses;
  return (
    <div>
      <p>{data.monthFull}</p>
      <section>TESORERIA</section>
      <p>Inizio: {formatCurrency(data.treasuryStart)}</p>
      <p>Fine: {formatCurrency(data.treasury)}</p>
      <p>Variazione: {formatCurrency(variation)}</p>
      <section>ENTRATE</section>
      <p>Realizzato: {formatCurrency(data.income)}</p>
      <section>USCITE</section>
      <p>Realizzato: {formatCurrency(data.expenses)}</p>
    </div>
  );
};
```

### File da modificare:
- `src/components/forecast/TreasuryTab.tsx`

### Sequenza:
1. Aggiungere `monthFull` e `treasuryStart` al chartData
2. Riscrivere CustomTooltip con struttura Agicap
3. Fix tickFormatter per valori negativi
4. Pulizia finale

