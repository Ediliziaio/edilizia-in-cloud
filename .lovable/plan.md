
# Grafico Tesoreria + Pulizia e Stabilizzazione

## 1. Grafico Tesoreria (stile Agicap)

Aggiungere un grafico a barre + linea sopra la griglia nella tab Tesoreria, usando `recharts` (gia installato nel progetto):

- **Barre verdi**: Entrate mensili
- **Barre rosse**: Uscite mensili  
- **Linea blu con punti**: Tesoreria cumulativa (saldo a fine mese)
- Card riepilogativa in alto a sinistra che mostra il saldo tesoreria attuale con colore blu

Il grafico utilizza i dati gia calcolati nel `treeData` (`totalIncomeMonthly`, `totalExpensesMonthly`, `netMonthly`), quindi nessuna nuova query necessaria.

### File: `src/components/forecast/TreasuryTab.tsx`
- Aggiungere `ComposedChart` con `Bar` (entrate/uscite) + `Line` (tesoreria cumulativa)
- Card badge con saldo attuale
- Il grafico si aggiorna automaticamente in base al range date selezionato

## 2. Fix e pulizia codice

### Bug rilevati e fix:

**a) `useMemo` usato per side-effect (TreasuryTab.tsx, riga 141-145)**
- `useMemo` viene usato per chiamare `initializeDefaultCategories()` che e un side-effect (insert DB). Questo e un anti-pattern React. Va convertito in `useEffect`.

**b) Import `isSameMonth` non utilizzato (TreasuryTab.tsx)**
- Importato da date-fns ma mai usato nel componente. Va rimosso.

**c) Import `addMonths` non utilizzato (TreasuryTab.tsx)**
- Importato ma mai usato. Va rimosso.

**d) Warning console: Calendar ref**
- Warning "Function components cannot be given refs" dal componente Calendar/DayPicker. E un warning noto di react-day-picker v8 con Radix, non bloccante e non risolvibile senza upgrade della libreria. Non richiede intervento.

### Pulizia imports nelle tab forecast:

- Verificare e rimuovere import inutilizzati in tutti i file forecast
- Rimuovere il tipo `isSummaryRow` dall'interfaccia `TreeNode` se non usato nella logica

## 3. Miglioramenti UX

- Aggiungere tooltip sul grafico che mostra i valori esatti al passaggio del mouse
- Formattare gli importi nel tooltip con `formatCurrency`
- Etichette asse X in formato "Gen 24", "Feb 24" (italiano, come nell'immagine di riferimento)
- Legenda sotto il grafico: Entrate / Uscite / Tesoreria

## Dettagli tecnici

### Struttura del grafico (recharts):

```text
ComposedChart
  |-- Bar (dataKey="income", fill="#10b981", name="Entrate")
  |-- Bar (dataKey="expenses", fill="#ef4444", name="Uscite")  
  |-- Line (dataKey="treasury", stroke="#3b82f6", name="Tesoreria")
  |-- XAxis (formato "MMM yy" in italiano)
  |-- YAxis (formattato con suffisso k)
  |-- Tooltip (custom con formatCurrency)
  |-- Legend
```

I dati per il grafico vengono estratti dal `treeData` gia computato:
```typescript
const chartData = monthKeys.map((k, i) => ({
  month: format(months[i], "MMM yy", { locale: it }),
  income: treeData.entrateNode.monthlyAmounts[k] || 0,
  expenses: treeData.usciteNode.monthlyAmounts[k] || 0,
  treasury: treeData.netMonthly[k] || 0,
}));
```

### File da modificare:
- `src/components/forecast/TreasuryTab.tsx` - Aggiungere grafico + fix useMemo/useEffect + pulizia imports

Nessun file da creare o eliminare.

### Sequenza:
1. Fix `useMemo` -> `useEffect` per inizializzazione categorie
2. Rimuovere import inutilizzati (`isSameMonth`, `addMonths`)
3. Aggiungere grafico recharts con barre + linea
4. Aggiungere card saldo attuale sopra il grafico
