

# Piano: Slot da 30 minuti + Annulla spostamento

## Situazione attuale

- Le viste Giorno e Settimana hanno slot da 1 ora (h-16, droppable id = `slot-YYYY-MM-DD-HH`)
- Il drop genera sempre orari `:00` (es. `09:00`, `10:00`)
- Il toast di conferma non ha pulsante "Annulla"

## Interventi

### 1. Slot da 30 minuti — `HOURS` e griglia

**File: `src/lib/marketingCalendarConstants.ts`**
- Aggiungere un array `HALF_HOURS` che genera slot ogni 30 min: `["08:00", "08:30", "09:00", "09:30", ..., "21:30"]`
- Mantenere `HOURS` per compatibilità (label laterali)

### 2. Vista Giorno — `MarketingCalendarDayView.tsx`

- Ogni ora diventa 2 righe da `h-8` ciascuna (`:00` e `:30`)
- Droppable id cambia in `slot-YYYY-MM-DD-HH:MM` (es. `slot-2025-02-24-09:30`)
- Label orario mostrata solo sulla riga `:00`, riga `:30` ha bordo più leggero
- `getAppointmentsForSlot` matcha sia ora che mezz'ora
- `handleDragEnd` parsa `HH:MM` dal droppable id
- `onClickSlot` passa anche i minuti (30 o 0)

### 3. Vista Settimana — `MarketingCalendarWeekView.tsx`

- Stessa logica: 2 righe per ora, droppable id `slot-YYYY-MM-DD-HH:MM`
- Label laterale solo su `:00`
- Regex di parsing aggiornata per estrarre `HH:MM`

### 4. Vista Mese — invariata

La vista mese sposta solo la data, non l'orario. Nessun cambiamento.

### 5. Toast con Annulla — `MarketingCalendar.tsx`

In `handleDropAppointment`:
- Salvare i valori precedenti (`oldDate`, `oldTime`) prima dell'update
- Nel toast di successo, aggiungere un'action "Annulla" che esegue il rollback:

```text
toast.success("Appuntamento spostato al ...", {
  action: {
    label: "Annulla",
    onClick: async () => {
      await supabase.from("appointments").update({ old values }).eq("id", id);
      refetchAppointments();
      toast.info("Spostamento annullato");
    }
  }
});
```

### 6. Callback `onClickSlot` aggiornamento

In `MarketingCalendar.tsx`, `openNewDialog` già accetta `hour` come numero. Aggiornare per accettare anche i minuti:
- Cambiare la firma di `onClickSlot` da `(date, hour)` a `(date, hour, minute?)`
- Generare `defaultTime` come `HH:MM` corretto

## Dettaglio tecnico — struttura griglia

```text
Prima (1 ora = 1 riga):
  08:00  ▏ ██████████████████ h-16
  09:00  ▏ ██████████████████ h-16

Dopo (1 ora = 2 righe da 30 min):
  08:00  ▏ ██████████████████ h-8  (droppable slot-...-08:00)
         ▏ ·················· h-8  (droppable slot-...-08:30, bordo leggero)
  09:00  ▏ ██████████████████ h-8  (droppable slot-...-09:00)
         ▏ ·················· h-8  (droppable slot-...-09:30, bordo leggero)
```

## File coinvolti

| File | Azione |
|------|--------|
| `src/lib/marketingCalendarConstants.ts` | Aggiunta array `HALF_HOURS` |
| `src/components/marketing/MarketingCalendarDayView.tsx` | Slot 30 min + parsing HH:MM |
| `src/components/marketing/MarketingCalendarWeekView.tsx` | Slot 30 min + parsing HH:MM |
| `src/pages/azienda/marketing/MarketingCalendar.tsx` | Toast con Annulla + onClickSlot con minuti |

Nessuna modifica DB. Nessuna modifica backend.

