

# Piano: Ottimizzazione Calendario - Prospettiva Gestione & Logistica

## Analisi dell'attuale implementazione

Il Calendario ha 4 viste funzionanti (Mese, Settimana, Carico/Heatmap, Gantt) con drag-and-drop, filtri per stato/cliente e Lead Time. Tuttavia, mancano elementi chiave per un uso professionale nella gestione operativa e logistica.

## Problemi identificati

| Area | Problema | Impatto |
|------|----------|---------|
| Visibilita risorse | Non si vede chi e assegnato a ciascun lavoro | Impossibile pianificare le squadre |
| Conflitti temporali | Nessun alert per sovrapposizioni di lavori sullo stesso giorno | Rischio di sotto/sovra-allocazione |
| Sequenza logistica | Non e chiaro se la merce arriva PRIMA della posa | Rischio di andare in cantiere senza materiale |
| Vista settimanale mobile | La griglia 7 colonne e illeggibile su mobile | Inutilizzabile per i responsabili in cantiere |
| Date mancanti su Mese/Settimana | Click sull'ordine porta solo alla pagina dettaglio, non si possono modificare le date come nel Gantt | Workflow interrotto |

---

## Modifiche proposte

### 1. Alert Logistico "Merce non arrivata" nella vista Mese e Settimana

Nella vista Mese e Settimana, se un ordine ha `expected_date` (posa) ma `warehouse_arrival_date` e assente o successiva alla posa, mostrare un indicatore di warning visivo sull'evento.

**File**: `CalendarMonthView.tsx`, `CalendarWeekView.tsx`

- Aggiungere logica: se `expected_date` esiste e (`warehouse_arrival_date` e null o `warehouse_arrival_date > expected_date`), mostrare un'icona `AlertTriangle` arancione accanto all'evento posa.
- Nel tooltip, aggiungere la riga "Merce non confermata" o "Merce arriva dopo la posa".

### 2. Squadre assegnate visibili nel Gantt e nel Tooltip

Modificare la query in `Calendar.tsx` per includere i dipendenti assegnati all'ordine tramite la tabella `order_employees`. Mostrare i nomi nel tooltip del Gantt e nelle viste Mese/Settimana.

**File**: `Calendar.tsx` (query), `CalendarGanttView.tsx` (colonna laterale), `DraggableOrderBar.tsx` (tooltip), `CalendarMonthView.tsx` (tooltip), `CalendarWeekView.tsx` (tooltip)

- Nella query, aggiungere: `order_employees(employee:employees(first_name, last_name))`
- Aggiornare il tipo `CalendarOrder` in `types/calendar.ts` con il campo opzionale `assigned_employees`
- Mostrare nel tooltip del Gantt e Mese le iniziali dei dipendenti assegnati (es. "MR, LB")
- Nel pannello laterale del Gantt, mostrare un indicatore se la squadra non e assegnata (badge "No squadra")

### 3. Vista Settimanale responsiva per mobile

La vista Settimana attuale usa una griglia 7 colonne che su mobile e troppo stretta. Su mobile, passare a un layout verticale (lista giornaliera scorrevole).

**File**: `CalendarWeekView.tsx`

- Su `isMobile`, sostituire la griglia `grid-cols-7` con un layout a colonna singola dove ogni giorno e un blocco collassabile con l'elenco degli eventi.
- Mantenere il badge di capacita in testa a ogni giorno.

### 4. Modifica date rapida anche da Mese e Settimana

Attualmente solo il Gantt permette di modificare le date (tramite click che apre `EditOrderDatesDialog`). Aggiungere lo stesso comportamento nelle viste Mese e Settimana.

**File**: `CalendarMonthView.tsx`, `CalendarWeekView.tsx`

- Importare `EditOrderDatesDialog`
- Al click sull'evento, aprire il dialog di modifica date invece di navigare alla pagina ordine.
- Aggiungere un pulsante secondario "Vai all'ordine" nel dialog (o un link nel tooltip).

### 5. Indicatore conflitti nella Heatmap

Nella vista Carico, distinguere tra giorni "pieni ma gestibili" e giorni con conflitti reali (es. stessa squadra su 2 cantieri). Per ora, senza dati sulle squadre specifiche per giorno, rafforzare la segnaletica visiva.

**File**: `CalendarHeatmapView.tsx`

- Se un giorno ha 5+ lavori, aggiungere l'icona `AlertTriangle` nella cella della heatmap.
- Nella card "Giorni critici", colorare il numero in rosso se > 0.

---

## Dettagli tecnici

### types/calendar.ts - Nuovo campo

```text
export interface CalendarOrder {
  // ... campi esistenti ...
  assigned_employees?: Array<{
    employee: {
      first_name: string;
      last_name: string;
    };
  }>;
}
```

### Calendar.tsx - Query aggiornata

Aggiungere alla select della query ordini:
```text
order_employees(employee:employees(first_name, last_name))
```

### CalendarMonthView.tsx - Alert logistico

Nel rendering dell'evento "posa", verificare:
```text
const hasLogisticRisk = event.type === "posa" && (
  !event.order.warehouse_arrival_date ||
  event.order.warehouse_arrival_date > event.order.expected_date
);
```
Se vero, aggiungere `AlertTriangle` con classe `text-amber-500` e tooltip "Attenzione: merce non confermata prima della posa".

### CalendarWeekView.tsx - Layout mobile

```text
// Su mobile: lista verticale
{isMobile ? (
  <div className="space-y-3">
    {weekDays.map(day => (
      <Collapsible key={...}>
        <CollapsibleTrigger>Header giorno con badge</CollapsibleTrigger>
        <CollapsibleContent>Lista eventi</CollapsibleContent>
      </Collapsible>
    ))}
  </div>
) : (
  // Griglia 7 colonne esistente
)}
```

### CalendarMonthView / WeekView - Dialog date

```text
const [editingOrder, setEditingOrder] = useState<CalendarOrder | null>(null);

// Al click sull'evento:
onClick={() => setEditingOrder(event.order)}

// Nel JSX:
{editingOrder && (
  <EditOrderDatesDialog
    order={editingOrder}
    open={!!editingOrder}
    onOpenChange={(open) => !open && setEditingOrder(null)}
  />
)}
```

---

## Riepilogo file da modificare

| File | Modifica |
|------|----------|
| `src/types/calendar.ts` | Aggiungere campo `assigned_employees` |
| `src/pages/azienda/Calendar.tsx` | Estendere query con join `order_employees` |
| `src/components/calendar/CalendarMonthView.tsx` | Alert logistico + dialog date + squadre nel tooltip |
| `src/components/calendar/CalendarWeekView.tsx` | Layout mobile responsivo + alert logistico + dialog date + squadre nel tooltip |
| `src/components/calendar/CalendarHeatmapView.tsx` | Icona alert su giorni critici |
| `src/components/calendar/CalendarGanttView.tsx` | Badge "No squadra" nel pannello laterale |
| `src/components/calendar/DraggableOrderBar.tsx` | Squadre assegnate nel tooltip |

Nessuna migrazione DB necessaria: i dati sono gia presenti nella tabella `order_employees` con join su `employees`.

