

# Piano: Grafico Andamento Mensile Incassi

## Panoramica

Aggiungere un grafico a barre sotto le stats cards nella pagina Ordini che mostra l'andamento mensile di incassi e importi da incassare, calcolato dagli ordini caricati.

---

## Implementazione

### Posizione

Il grafico viene inserito tra le stats cards e i filtri, dentro una Card con titolo "Andamento Mensile".

### Dati

Calcolo con `useMemo` sugli ordini (non filtrati per mese, ma rispettando gli altri filtri attivi) raggruppati per mese di `created_at`:

```text
Per ogni mese (Gen-Dic anno corrente):
  - Incassato: somma getAmountCollected() degli ordini di quel mese
  - Da Incassare: somma getAmountDue() degli ordini di quel mese
```

### Grafico

Utilizzo di `recharts` (gia installato) con `BarChart`:
- Asse X: mesi (Gen, Feb, Mar, ...)
- Due barre per mese: verde (Incassato) e arancione (Da Incassare)
- Tooltip con importi formattati in EUR
- Legenda in basso
- Responsive tramite `ResponsiveContainer`

### Layout

```text
[Stats Cards - 4 colonne]
[Grafico Andamento Mensile - Card full width, altezza ~300px]
[Filtri]
[Tabella / Pipeline]
```

---

## File da Modificare

| File | Descrizione |
|------|-------------|
| `src/pages/azienda/OrdersList.tsx` | Aggiungere grafico a barre con recharts tra stats cards e filtri |

Nessuna nuova dipendenza necessaria (recharts gia presente). Nessun nuovo file da creare.

---

## Dettagli Tecnici

### Calcolo dati mensili

```text
const monthlyData = useMemo(() => {
  const year = new Date().getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => ({
    name: MONTHS[i].substring(0, 3),
    incassato: 0,
    daIncassare: 0,
  }));
  
  orders.forEach(order => {
    const d = new Date(order.created_at);
    if (d.getFullYear() === year) {
      months[d.getMonth()].incassato += getAmountCollected(order);
      months[d.getMonth()].daIncassare += getAmountDue(order);
    }
  });
  
  return months;
}, [orders]);
```

Nota: il grafico usa `orders` (non `filteredOrders`) per mostrare sempre la panoramica annuale completa, indipendentemente dai filtri mese attivi.

### Componente grafico

Import da recharts: `BarChart`, `Bar`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `Legend`, `ResponsiveContainer`.

Il grafico viene wrappato in una `Card` con `CardHeader` ("Andamento Mensile") e `CardContent` con `ResponsiveContainer` a 300px di altezza.
