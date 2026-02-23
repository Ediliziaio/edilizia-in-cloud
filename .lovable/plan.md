

# Prenota Appuntamento dal Dialog Opportunita

## Panoramica

Abilitare il tab "Prenota/aggiorna appuntamento" nel dialog opportunita, con un form inline (non un sotto-dialog) che permette di prenotare un appuntamento per il contatto associato. Quando si seleziona un calendario e una data, il sistema verifica la disponibilita incrociando gli orari configurati in `marketing_calendar_availability` con gli appuntamenti gia esistenti.

---

## Struttura UI (stile GHL - come da screenshot)

```text
+----------------------------------------------------------+
| Prenota/aggiorna appuntamento                            |
|                                                           |
|  Calendario *                                             |
|  [Select calendario]                                      |
|  (messaggio errore se non selezionato)                    |
|                                                           |
|  Luogo dell'incontro          Titolo dell'appuntamento    |
|  [Input]                      [Input]                     |
|                                                           |
|  Data *                                                   |
|  [Date picker]                                            |
|                                                           |
|  Slot disponibili                                         |
|  [09:00] [09:30] [10:00] [10:30] ... (griglia slot)      |
|  (oppure: "Nessuno slot disponibile per questa data")     |
|                                                           |
|  Descrizione                                              |
|  [Textarea]                                               |
|                                                           |
|            [Prenota appuntamento]                          |
+----------------------------------------------------------+
```

---

## Logica disponibilita

1. **Seleziona calendario**: query `marketing_calendars` dell'azienda
2. **Seleziona data**: per la data scelta:
   - Recupera gli orari da `marketing_calendar_availability` per quel `calendar_id` e `day_of_week` (o `specific_date` se override)
   - Recupera gli appuntamenti esistenti da `appointments` per la stessa data e calendario
   - Calcola gli slot liberi: suddividi la finestra di disponibilita in blocchi da `duration_minutes` (dal calendario) e rimuovi quelli gia occupati
3. **Mostra slot**: griglia di bottoni cliccabili con gli orari liberi
4. **Prenota**: inserisce in `appointments` con `contact_id` dal contatto dell'opportunita, `calendar_id`, ora inizio/fine

---

## Modifiche ai file

### 1. `src/components/opportunities/OpportunityDetailDialog.tsx`
- Abilitare il tab `appointments` (riga 343: `enabled: true`)
- Aggiungere il rendering del contenuto tab `appointments` che mostra il nuovo componente `OpportunityAppointmentTab`

### 2. Nuovo: `src/components/opportunities/OpportunityAppointmentTab.tsx`
Componente inline (non dialog) con:
- **Props**: `contactId`, `companyId`, `opportunityId`
- **State**: `calendarId`, `date`, `selectedSlot`, `title`, `location`, `description`
- **Query calendari**: fetch `marketing_calendars` attivi per `company_id`
- **Query disponibilita**: quando `calendarId` + `date` sono selezionati:
  - Fetch `marketing_calendar_availability` filtrato per `calendar_id` e giorno della settimana (o specific_date)
  - Fetch `appointments` esistenti per la stessa data e calendario (esclusi annullati)
  - Calcola slot liberi in base a `duration_minutes` del calendario
- **Griglia slot**: bottoni con gli orari liberi, selezionabili
- **Salvataggio**: inserisce in `appointments` con tutti i campi necessari
- **Appuntamento esistente**: se il contatto ha gia un appuntamento futuro per quel calendario, mostrarlo con possibilita di modificare/cancellare

### 3. Nessuna modifica al database
Le tabelle `appointments`, `marketing_calendars` e `marketing_calendar_availability` hanno gia tutte le colonne necessarie.

---

## Dettagli tecnici

### Calcolo slot liberi (pseudo-codice)

```text
1. Prendi availability per day_of_week della data selezionata (is_enabled = true)
   - Se esiste specific_date override, usa quello
2. Per ogni finestra [start_time, end_time]:
   - Genera slot ogni N minuti (N = calendar.duration_minutes, default 30)
   - Per ogni slot [slot_start, slot_end]:
     - Controlla se esiste un appointment che si sovrappone
     - Se libero, aggiungilo alla lista
3. Mostra i slot liberi come bottoni cliccabili
```

### Appuntamento esistente per il contatto
- Query: `appointments` dove `contact_id = X` e `appointment_date >= oggi` e `calendar_id` nel set dei calendari aziendali
- Se trovato: mostra dettagli con pulsanti "Modifica" / "Elimina"

---

## Riepilogo

| File | Azione |
|------|--------|
| `src/components/opportunities/OpportunityDetailDialog.tsx` | Modifica: abilita tab, aggiungi render |
| `src/components/opportunities/OpportunityAppointmentTab.tsx` | Nuovo: form prenotazione con check disponibilita |
| Database | Nessuna modifica |
