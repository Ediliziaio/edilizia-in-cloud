
# Fix: Separare appuntamenti Gestione Interna da Marketing

## Problema

La query degli appuntamenti in `MarketingCalendar.tsx` (riga 119-123) carica **tutti** gli appuntamenti dell'azienda senza filtrare per `calendar_id`. Gli appuntamenti creati dal "Calendario Lavori" (gestione interna) hanno `calendar_id = NULL` e vengono mostrati anche nel calendario Marketing.

## Soluzione

### File: `src/pages/azienda/marketing/MarketingCalendar.tsx`

Modificare la query degli appuntamenti (riga 119-124) aggiungendo un filtro `.not("calendar_id", "is", null)` per escludere gli appuntamenti senza calendario marketing associato:

```typescript
const { data } = await supabase
  .from("appointments")
  .select("*")
  .eq("company_id", companyId)
  .not("calendar_id", "is", null)  // Solo appuntamenti marketing
  .order("appointment_date", { ascending: true });
```

Inoltre, il filtro `filteredAppointments` (righe 143-151) attualmente fa passare gli appuntamenti con `calendar_id = null` perche la condizione `a.calendar_id && !selectedCalendarIds.includes(a.calendar_id)` risulta falsa quando `calendar_id` e null. Questo e un secondo punto dove gli appuntamenti interni "scivolano" nel calendario marketing. Dopo il fix alla query, questo non sara piu un problema, ma per sicurezza la logica di filtro verra resa piu esplicita.

## Impatto

- **Zero modifiche al database**
- **1 solo file modificato**: `src/pages/azienda/marketing/MarketingCalendar.tsx`
- Gli appuntamenti del "Calendario Lavori" continueranno a funzionare normalmente nella loro sezione dedicata (`/azienda/calendario`)
