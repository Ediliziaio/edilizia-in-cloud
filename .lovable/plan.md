

# Redesign Dialog Appuntamento Marketing (stile GHL)

## Panoramica

Ricostruire completamente il dialog degli appuntamenti nel contesto Marketing per replicare il layout e le funzionalita di GoHighLevel, con due tab (Appuntamento / Tempo bloccato), layout a due colonne, e datetime inizio/fine.

---

## Modifiche al Database

### Nuova colonna: `appointment_end_time`

La tabella `appointments` ha solo `appointment_time` (ora inizio). Serve aggiungere `appointment_end_time` (tipo `time`, nullable) per l'ora di fine. Default: 30 minuti dopo l'ora di inizio (gestito lato frontend).

```sql
ALTER TABLE public.appointments
  ADD COLUMN appointment_end_time time WITHOUT TIME ZONE;
```

### Nuova colonna: `is_blocked_slot`

Per distinguere "tempo bloccato" da appuntamenti normali:

```sql
ALTER TABLE public.appointments
  ADD COLUMN is_blocked_slot boolean NOT NULL DEFAULT false;
```

### Nuova colonna: `internal_notes`

Note interne separate dalla descrizione (visibili solo al team, non sincronizzate con calendari terzi):

```sql
ALTER TABLE public.appointments
  ADD COLUMN internal_notes text;
```

---

## Nuovo componente: `MarketingAppointmentDialog.tsx`

Dialog dedicato al contesto Marketing, separato dall'`AppointmentDialog` esistente (che resta invariato per la Gestione Interna).

### Struttura

```text
+------------------------------------------------------+
| Prenota appuntamento                              [X] |
| [Appuntamento]  [Tempo bloccato]                      |
|------------------------------------------------------|
|  LEFT COLUMN (60%)        |  RIGHT COLUMN (40%)       |
|                           |                           |
|  Calendario *             |  Seleziona Contatto *     |
|  [Select calendario]      |  [Search contatto]        |
|                           |                           |
|  Titolo dell'appuntamento |  Note Interno             |
|  [Input]                  |  [+ Aggiungi Nota]        |
|                           |  [Textarea]               |
|  Descrizione              |                           |
|  [Textarea]               |                           |
|                           |                           |
|  Membro del team          |                           |
|  [Select utente]          |                           |
|                           |                           |
|  Data e ora               |                           |
|  [bg card]                |                           |
|  Fuso orario: CET         |                           |
|  Ora inizio    Ora fine   |                           |
|  [datetime]    [datetime] |                           |
|------------------------------------------------------|
| Stato: [Confermato v]   [Annulla] [Prenota appunt.]  |
+------------------------------------------------------+
```

### Tab "Tempo bloccato"

```text
+------------------------------------------------------+
| Aggiungi tempo bloccato                           [X] |
| [Appuntamento]  [Tempo bloccato]                      |
|------------------------------------------------------|
|  Testo descrittivo: "Vai in vacanza? ..."            |
|                                                       |
|  Utente/Calendario                                    |
|  [Select calendario]                                  |
|                                                       |
|  Titolo dell'appuntamento                             |
|  [Input]                                              |
|                                                       |
|  Data e ora                                           |
|  [bg card] Fuso orario: CET                           |
|  Ora inizio        Ora fine                           |
|  [datetime]        [datetime]                         |
|------------------------------------------------------|
|               [Annulla]  [Blocca tempo]               |
+------------------------------------------------------+
```

### Logica principale

- **Calendario**: obbligatorio, pre-selezionato se solo 1 calendario attivo
- **Ora inizio/fine**: due date-time picker. Ora fine default = inizio + 30 min. Validazione: fine > inizio
- **Contatto**: select con ricerca tra `marketing_contacts`
- **Note Interno**: textarea collassabile (toggle con "+ Aggiungi Nota Interno")
- **Stato**: nel footer, select inline (Confermato, Annullato, Riprogrammato, Completato)
- **Tempo bloccato**: salva con `is_blocked_slot = true`, `appointment_type = "blocked"`
- **CTA**: "Prenota appuntamento" (tab 1) / "Blocca tempo" (tab 2)

---

## Modifiche a `MarketingCalendar.tsx`

- Sostituire `AppointmentDialog` con `MarketingAppointmentDialog`
- Passare `calendars` come prop per pre-selezionare il calendario
- Rimuovere le prop `requireTime` e `showOrderSelect` (non servono piu)

---

## Modifiche alle viste calendario

Aggiornare `MarketingCalendarWeekView`, `MarketingCalendarDayView` e `MarketingCalendarMonthView` per:
- Mostrare i blocked slots con stile diverso (sfondo tratteggiato/grigio)
- Calcolare la durata blocco usando `appointment_time` + `appointment_end_time`

---

## Riepilogo file

| File | Azione |
|------|--------|
| Migrazione SQL | Crea: 3 nuove colonne |
| `src/components/marketing/MarketingAppointmentDialog.tsx` | Nuovo |
| `src/pages/azienda/marketing/MarketingCalendar.tsx` | Modifica: usa nuovo dialog |
| `src/components/marketing/MarketingCalendarWeekView.tsx` | Modifica: stile blocked slots |
| `src/components/marketing/MarketingCalendarDayView.tsx` | Modifica: stile blocked slots |
| `src/components/marketing/MarketingCalendarMonthView.tsx` | Modifica: stile blocked slots |

Il componente `AppointmentDialog.tsx` esistente resta invariato per l'uso nella Gestione Interna.

