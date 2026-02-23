
# Fix Dialog Appuntamento Marketing

## Problema
1. Nel dialog aperto da Marketing, il campo "Ordine collegato" non dovrebbe apparire
2. L'ora deve essere obbligatoria (non "opzionale")

## Modifiche

### File: `src/pages/azienda/marketing/MarketingCalendar.tsx`
- Riga 364: rimuovere `showOrderSelect` dalla chiamata ad `AppointmentDialog` (oppure impostarlo a `false`)
- Aggiungere prop `requireTime` al dialog

### File: `src/components/appointments/AppointmentDialog.tsx`
- Aggiungere prop opzionale `requireTime?: boolean` all'interfaccia `AppointmentDialogProps`
- Quando `requireTime` e true:
  - La label "Ora (opzionale)" diventa "Ora *"
  - La validazione in `handleSave` controlla che `appointmentTime` non sia vuoto, altrimenti mostra toast di errore
- Il campo "Ordine collegato" e gia condizionato da `showOrderSelect`, quindi basta non passarlo dal Marketing

## Impatto
- 2 file modificati
- Zero modifiche al database
- Il dialog usato dalla Gestione Interna resta invariato
