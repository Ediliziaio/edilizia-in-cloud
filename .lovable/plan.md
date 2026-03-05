

# Verifica Calendario End-to-End — Risultati

## Stato attuale: quasi tutto OK

Tutti i fix principali sono già implementati:
- **Eventi "lavoro" nella vista Mese**: presente (righe 82-88 di CalendarMonthView)
- **Query invalidation dopo salvataggio appuntamenti**: presente in entrambe le viste (Month riga 310, Week riga 403)
- **hideMarketingFields={true}**: presente in entrambe le viste
- **Collegamento ordini-calendario**: funzionante (EditOrderDatesDialog invalida `["calendar-orders"]`)
- **Filtri Layer (posa/merce/lavoro/appuntamento/google_busy)**: funzionanti in entrambe le viste
- **Persistenza localStorage**: funzionante
- **Filtro risorse (dipendenti/squadre esterne)**: funzionante

## Bug residuo trovato

### `mapAppointmentToEditData` non mappa il campo `status`

**File: `src/lib/calendarUtils.ts`** riga 28-39

L'`AppointmentData` ha un campo opzionale `status`, ma `mapAppointmentToEditData` non lo include. Quando si clicca un appuntamento per modificarlo, lo stato viene resettato al default "confermato" invece di mantenere il valore reale.

**Fix**: Aggiungere `status: (apt as any).status || "confermato"` al return di `mapAppointmentToEditData`.

Inoltre, il tipo `CalendarAppointment` in `src/types/calendar.ts` non include `status`. Occorre aggiungerlo.

## File da modificare

| File | Modifica |
|------|----------|
| `src/types/calendar.ts` | Aggiungere `status?: string` a `CalendarAppointment` |
| `src/lib/calendarUtils.ts` | Mappare `status` in `mapAppointmentToEditData` |

## Note sul test browser

Non è possibile testare end-to-end in browser perche' la pagina richiede autenticazione. Il codice è stato verificato staticamente: tutti i data-flow (query → filtri → vista → dialog → invalidazione → refresh) sono corretti.

