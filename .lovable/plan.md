

# Piano: Fix Drag & Drop che altera la durata dell'appuntamento

## Problema

Quando trascini un appuntamento per spostarlo (es. da 10:00 a 11:00), il sistema aggiorna solo `appointment_time` ma **non ricalcola `appointment_end_time`**. Risultato: la durata originale viene persa.

Esempio concreto:
- Appuntamento: 10:00–11:00 (1 ora)
- Lo trascini allo slot 11:00
- `appointment_time` → 11:00, ma `appointment_end_time` resta 11:00 (o peggio, un valore incoerente)
- Il rendering mostra un appuntamento enorme o sballato

## Fix

Nel `handleDropAppointment` in `MarketingCalendar.tsx`:

1. Calcolare la durata originale: `originalDuration = end_time - start_time`
2. Quando si sposta con un nuovo orario, ricalcolare: `newEndTime = newTime + originalDuration`
3. Includere `appointment_end_time` nell'update al database
4. Includere il vecchio `appointment_end_time` nel rollback "Annulla"

```typescript
// Pseudocodice del fix
const oldStartMin = timeToMin(current.appointment_time);
const oldEndMin = timeToMin(current.appointment_end_time);
const durationMin = oldEndMin - oldStartMin;
const newStartMin = timeToMin(newTime);
const newEndTime = minutesToTimeStr(newStartMin + durationMin);

updateData.appointment_end_time = newEndTime;
```

## File coinvolto

| File | Modifica |
|------|----------|
| `src/pages/azienda/marketing/MarketingCalendar.tsx` | Ricalcolo `appointment_end_time` nel drop handler + rollback completo |

Nessun altro file da toccare. Il rendering e il resize sono già corretti.

