

# Aggiornamento cache opportunità e contatti dopo drag & resize

## Problema

Quando sposti o ridimensioni un appuntamento nel calendario tramite drag & drop o resize, vengono aggiornati solo i dati del calendario (`refetchAppointments`). Le query delle **opportunità** (`marketing_opportunities`) e degli **appuntamenti contatto** (`contact_future_appointment`, `appointments_for_slot`) non vengono invalidate.

Questo significa che se l'utente va nella scheda opportunità o nel dettaglio di un contatto, vede ancora i vecchi dati dell'appuntamento (data/ora precedenti).

## Fix

### File: `src/pages/azienda/marketing/MarketingCalendar.tsx`

1. Importare `useQueryClient` da `@tanstack/react-query`
2. Creare `const queryClient = useQueryClient()`
3. Dopo ogni `refetchAppointments()` in `handleDropAppointment` e `handleResizeAppointment`, aggiungere:
   ```typescript
   queryClient.invalidateQueries({ queryKey: ["marketing_opportunities"] });
   queryClient.invalidateQueries({ queryKey: ["contact_future_appointment"] });
   queryClient.invalidateQueries({ queryKey: ["appointments_for_slot"] });
   ```
4. Fare lo stesso anche nel rollback (Annulla) del drag & drop.

### Query invalidate

| Query Key | Dove viene usata |
|-----------|------------------|
| `marketing_opportunities` | `useOpportunitiesData` — campo `next_appointment` nelle card opportunità |
| `contact_future_appointment` | `OpportunityAppointmentTab` — box "Appuntamento già fissato" |
| `appointments_for_slot` | `OpportunityAppointmentTab` — calcolo slot liberi |

### Riepilogo modifiche

Un solo file modificato: `MarketingCalendar.tsx`. Si aggiungono 3 righe di invalidazione in 3 punti (drop success, drop undo, resize success).

