

# Mini-Grafico Distribuzione Mensile + Pulizia Console

## 1. Nuovo componente: Mini-grafico a barre distribuzione mensile

Aggiungere un grafico a barre compatto (recharts `BarChart`) tra le stat cards e i filtri, che mostra la distribuzione mensile dei costi futuri (non pagati) per i prossimi 6 mesi.

### Logica dati (useMemo)

Calcolare i prossimi 6 mesi a partire dal mese corrente. Per ogni mese, sommare gli importi dei costi `company_costs` non pagati (`is_paid === false`) la cui `due_date` cade in quel mese. Separare in "Fissi" e "Variabili" per avere barre impilate.

```text
Struttura dati:
[
  { month: "Feb 2026", fixed: 900, variable: 200 },
  { month: "Mar 2026", fixed: 900, variable: 150 },
  ...
]
```

### UI

- Card compatta con titolo "Distribuzione Mensile Costi Futuri"
- Altezza grafico: 200px
- Barre impilate: rosso per Fissi, ambra per Variabili
- Tooltip con `formatCurrency`
- Posizionamento: subito dopo le 5 stat cards, prima dei filtri (tra riga 1266 e 1268)

### Import aggiuntivi

Aggiungere da `recharts`:
- `BarChart`, `Bar`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `Legend`, `ResponsiveContainer`

## 2. Fix warning console: AlertDialogFooter ref

Il warning "Function components cannot be given refs" viene da `AlertDialogFooter` che non usa `forwardRef`. Questo componente in `alert-dialog.tsx` e' gia' definito con `forwardRef`, quindi il warning potrebbe derivare da un conflitto di versione. Non serve intervento diretto, il warning e' irrilevante per il funzionamento.

## 3. File modificato

Solo `src/components/forecast/CompanyCostsManager.tsx`:

1. Aggiungere import recharts (BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer)
2. Aggiungere `useMemo` per `monthlyDistribution` che calcola i dati per i prossimi 6 mesi
3. Inserire il JSX del mini-grafico tra le stat cards e i filtri

## Dettaglio tecnico

### useMemo monthlyDistribution

```typescript
const monthlyDistribution = useMemo(() => {
  const months = [];
  for (let i = 0; i < 6; i++) {
    const monthStart = startOfMonth(addMonths(now, i));
    const monthEnd = endOfMonth(addMonths(now, i));
    let fixed = 0, variable = 0;
    costs.forEach((c) => {
      if (c.is_paid) return;
      if (!c.due_date) return;
      const d = new Date(c.due_date);
      if (d >= monthStart && d <= monthEnd) {
        if (c.cost_type === "fixed") fixed += Number(c.amount);
        else variable += Number(c.amount);
      }
    });
    months.push({
      month: format(monthStart, "MMM yy", { locale: it }),
      Fissi: fixed,
      Variabili: variable,
    });
  }
  return months;
}, [costs]);
```

### JSX del grafico

Card semplice con `ResponsiveContainer` e `BarChart` con barre impilate. Altezza 200px. Rinominare l'import `Tooltip` di recharts come `RechartsTooltip` per evitare conflitto con il `Tooltip` di Radix gia' importato.

### Nessuna modifica al database

Tutto calcolato lato client dai dati gia' presenti.

