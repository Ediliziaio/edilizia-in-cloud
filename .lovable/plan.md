
# Click su "Appuntamento gia fissato" apre il dettaglio

## Problema
Nella tab "Prenota/aggiorna appuntamento" del dettaglio opportunita, il box "Appuntamento gia fissato" mostra i dati dell'appuntamento ma non e cliccabile. L'utente vuole che cliccandoci si apra il dialog completo dell'appuntamento per visualizzarlo/modificarlo.

## Soluzione

### File: `src/components/opportunities/OpportunityAppointmentTab.tsx`

1. Aggiungere uno state `editingAppointment` e `dialogOpen` per gestire l'apertura del `MarketingAppointmentDialog`
2. Rendere il box "Appuntamento gia fissato" cliccabile con `cursor-pointer` e `hover:border-primary/40`
3. Al click, mappare i dati dell'appuntamento esistente nel formato `MarketingAppointmentData` e aprire il dialog
4. Aggiungere una query per caricare i calendari con i dati necessari al dialog (gia presente come `calendars`)
5. Aggiungere una query per caricare gli utenti del team (necessario per il dialog)
6. Importare e renderizzare il `MarketingAppointmentDialog` in fondo al componente

### Dettagli tecnici

- Import di `MarketingAppointmentDialog` e `MarketingAppointmentData`
- Query aggiuntiva per gli utenti staff (`profiles` con ruolo staff/admin della company)
- Il box esistente riceve `onClick` che setta `editingAppointment` con i dati dell'appuntamento e apre il dialog
- Al salvataggio (`onSaved`), si invalida la query `contact_future_appointment` per aggiornare i dati
