

## Calendario Punto di Pareggio — Numeri al posto delle icone

### Cosa cambia

Nel componente `CalendarioAnno` dentro `PuntoDiPareggio.tsx`, rimuovere le emoji (💸, 💰, 🎯) e mostrare al loro posto il **contributo cumulato al margine** per ogni mese, cioè quanto il fatturato ha coperto dei costi fissi fino a quel punto.

Per ogni mese (1-12):
- **Contributo cumulato** = `currentMonthlyRevenue × (avgMarginPercent / 100) × monthNum`
- Mostrare il valore in formato compatto (es. "€12k", "€45k")
- Il mese di break-even mostra il valore con il target "🎯" → sostituito dal numero stesso, evidenziato dal ring già presente

### Modifiche al componente

1. **`CalendarioAnno`** — aggiungere props `monthlyContribution` e `totalFixedCostsAnnual` (o direttamente `currentMonthlyRevenue`, `avgMarginPercent`, `totalFixedCostsMonthly`)

2. **Dentro ogni cella del mese**: sostituire la riga emoji con il contributo cumulato in formato compatto (es. `€8k`). Sotto, mostrare la % di copertura dei costi fissi annuali raggiunta a quel mese.

3. **Passaggio props**: dove `CalendarioAnno` viene usato (~riga 400), passare `currentMonthlyRevenue`, `avgMarginPercent`, `totalFixedCostsMonthly` dal hook.

### Layout cella (per ogni mese)

```text
┌──────────┐
│   Gen    │  ← nome mese (già presente)
│   €8k   │  ← contributo cumulato (NUOVO, sostituisce emoji)
│   8%    │  ← % copertura costi fissi annuali (NUOVO)
└──────────┘
```

### File modificato
- `src/components/cruscotto/PuntoDiPareggio.tsx` — solo il componente `CalendarioAnno` e il punto dove viene chiamato

