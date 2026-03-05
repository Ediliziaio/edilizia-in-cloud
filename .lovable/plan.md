

# Fix: Vista predefinita Calendario Lavori → Mese

## Problema
Attualmente la vista predefinita è "Gantt" su desktop e "month" solo su mobile (riga 31 di `Calendar.tsx`). L'utente vuole aprire sempre sulla vista Mese.

## Intervento

**File: `src/pages/azienda/Calendar.tsx`** (riga 31)

Cambiare l'inizializzazione dello stato `view` da:
```tsx
const [view, setView] = useState<CalendarViewType>(isMobile ? "month" : "gantt");
```
a:
```tsx
const [view, setView] = useState<CalendarViewType>("month");
```

Questo è l'unico cambiamento necessario. La vista Mese sarà quella mostrata all'apertura, sia su desktop che su mobile. Le altre viste (Settimana, Carico, Gantt) restano accessibili dal toggle.

