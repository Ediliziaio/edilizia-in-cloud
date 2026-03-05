

# Clic su data per creare appuntamento

## Situazione attuale

Nella vista Mese (`CalendarMonthView`), le celle dei giorni non hanno un handler di clic. L'unico modo per creare un appuntamento è il pulsante "+ Appuntamento" nell'header, che non pre-compila la data.

## Modifiche

### `src/components/calendar/CalendarMonthView.tsx`

1. **Aggiungere stato per la data selezionata**: `newAppointmentDate` per passare al dialog la data cliccata
2. **Aggiungere onClick sulla cella del giorno**: Quando l'utente clicca su un'area vuota della cella (non su un evento esistente), aprire il dialog di creazione appuntamento con la data pre-compilata
3. **Passare `defaultDate` al `AppointmentDialog`**: Il dialog già supporta la prop `defaultDate` — basta passare la data cliccata formattata come `yyyy-MM-dd`
4. **Aggiungere `cursor-pointer`** alla cella per indicare che è cliccabile

Concretamente:
- Nuovo stato: `const [newAppointmentDate, setNewAppointmentDate] = useState<string | undefined>()`
- onClick sulla `div` della cella: setta `newAppointmentDate` e apre il dialog (distinguendo dal clic su evento esistente che già ha `e.stopPropagation`)
- Quando si apre per "nuovo" (non editing), passare `defaultDate={newAppointmentDate}` e `appointment={null}`
- Quando si apre per editing (clic su appuntamento esistente), continuare a passare l'appuntamento come ora

Il dialog `AppointmentDialog` gestisce già `defaultDate` e `defaultTime` nelle props — nessuna modifica necessaria al dialog.

