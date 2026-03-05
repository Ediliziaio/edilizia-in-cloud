

# Sopralluoghi tecnici nel Calendario — Filtro per utente assegnato

## Problema
Gli appuntamenti (inclusi i sopralluoghi tecnici) vengono mostrati nel calendario, ma:
1. **Non sono filtrabili per utente assegnato** — il filtro "operaio/dipendente" agisce solo sugli ordini
2. **Non mostrano chi è assegnato** — il tooltip non visualizza il nome dell'assegnatario
3. **La query non carica il profilo dell'assegnatario** — manca il join su `profiles` per `assigned_to`

## Interventi

### 1. Arricchire la query appuntamenti (`Calendar.tsx`)
Aggiungere il join per caricare il nome dell'utente assegnato:
```sql
assigned:profiles!appointments_assigned_to_fkey(first_name, last_name)
```

### 2. Filtrare gli appuntamenti per utente (`Calendar.tsx`)
Creare un `filteredAppointments` memo che, quando `employeeFilter !== "all"`, mostra solo gli appuntamenti con `assigned_to === employeeFilter`. Passare `filteredAppointments` alle viste Month/Week al posto di `appointments`.

Nota: il filtro "employee" usa IDs dalla tabella `employees`, ma `assigned_to` negli appuntamenti usa IDs dalla tabella `profiles`. Serve aggiungere un filtro separato per **utenti assegnabili** (profili staff) oppure collegare i due. La soluzione più pulita: aggiungere un nuovo filtro "Assegnato a" nel pannello filtri collassabile, che usa i profili staff (stessi dati già caricati da `assignableUsers` nell'AppointmentDialog). Questo filtro agisce sia sugli appuntamenti sia sugli ordini (se hanno un campo `assigned_to`).

**Approccio scelto**: aggiungere un filtro `assignedToFilter` che filtra gli appuntamenti per `assigned_to`. Gli ordini restano filtrati dal filtro dipendenti esistente.

### 3. Mostrare assegnatario nel tooltip (`CalendarMonthView.tsx` + `CalendarWeekView.tsx`)
Nel tooltip degli appuntamenti, aggiungere una riga con il nome dell'utente assegnato (se presente).

### 4. Aggiornare il tipo `CalendarAppointment` (`types/calendar.ts`)
Aggiungere il campo `assigned` opzionale al tipo.

## File da modificare

| File | Modifica |
|------|----------|
| `src/types/calendar.ts` | Aggiungere campo `assigned` a `CalendarAppointment` |
| `src/pages/azienda/Calendar.tsx` | Query con join profilo, nuovo filtro `assignedToFilter`, fetch utenti staff, passare appointments filtrati |
| `src/components/calendar/CalendarMonthView.tsx` | Mostrare nome assegnatario nel tooltip |
| `src/components/calendar/CalendarWeekView.tsx` | Mostrare nome assegnatario nel tooltip |

