

# Nascondere campi Marketing nel dialog appuntamenti del Calendario Lavori

## Problema
Il dialog `AppointmentDialog` è condiviso tra il Calendario Lavori e il Marketing. Quando viene aperto dal Calendario Lavori, mostra campi irrilevanti: **Calendario** (marketing calendars) e **Contatto CRM** — che appartengono esclusivamente al contesto marketing/vendite.

## Intervento

**File: `src/components/appointments/AppointmentDialog.tsx`**

Aggiungere una prop `hideMarketingFields?: boolean` (default `false`). Quando `true`:
- Nasconde il selettore **Calendario** (marketing_calendars)
- Nasconde il selettore **Contatto CRM**
- Forza `calendar_id = null` e `contact_id = null` nel payload di salvataggio
- Il campo **Stato** occupa l'intera larghezza quando il Calendario è nascosto

**File: `src/pages/azienda/Calendar.tsx`**

Passare `hideMarketingFields={true}` all'`AppointmentDialog` già presente.

Nessuna modifica al database. Un solo prop aggiuntivo risolve la separazione visiva.

