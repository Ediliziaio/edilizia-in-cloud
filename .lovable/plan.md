

# Piano Implementazione — Fix Automazioni Marketing

Documento analizzato. Procedo con i fix in ordine di priorità come indicato (P0 prima, poi P1, poi P2).

---

## Fase 1 — Fix P0 (Critici)

### A1: email_opened / email_clicked → handleTrigger
**File:** `supabase/functions/email-tracking/index.ts`

Dopo l'update su `email_logs` nei case `open` e `click`, inserire una riga in `automation_trigger_events` con:
- `open` → trigger_event `email_opened`, payload `{ campaign_id, contact_id, company_id }`
- `click` → trigger_event `email_clicked`, payload `{ campaign_id, contact_id, company_id, link_url }`

Serve fare una query per ottenere il `company_id` dall'email_log se non disponibile (attualmente arriva come param `co`).

### A2: whatsapp_received → handleTrigger
**File:** `supabase/functions/whatsapp-webhook/index.ts`

Dopo l'insert del messaggio in arrivo (riga ~208-221), inserire in `automation_trigger_events`:
- trigger_event: `whatsapp_received`
- entity_id: ID del contatto marketing (lookup per telefono su `marketing_contacts`)
- payload: `{ from: senderPhone, message: content, conversation_id }`

### A3: opportunity_won / opportunity_lost dalla UI Pipeline
**File:** `src/hooks/useOpportunitiesData.ts` — `useUpdateOpportunityStage`

Il DB trigger `fire_marketing_automation` già spara `opportunity_won`/`opportunity_lost` quando `status` cambia su `marketing_opportunities`. Attualmente la mutation `useUpdateOpportunityStage` passa `auto_status` che setta `status = 'won'` o `'lost'` nel DB → il trigger dovrebbe già scattare.

Verifico che il trigger `fire_marketing_automation` catturi correttamente il cambio status `won`/`lost`. Se confermato funzionante, nessun fix necessario. Se non scatta, aggiungo insert diretto in `automation_trigger_events` nella mutation `onSuccess`.

### B: Fix filtri trigger con dati contatto
**File:** `supabase/functions/process-automation/index.ts` — funzione `handleTrigger`

Attualmente `evaluateFilters(filters, payload)` valuta solo il payload dell'evento. Fix: prima di `evaluateFilters`, fare query su `marketing_contacts` per `entity_id` e fare merge `{ ...contactData, ...payload }` come dato per i filtri.

### C: check-scheduled-triggers + pg_cron
**Nuovo file:** `supabase/functions/check-scheduled-triggers/index.ts`

Edge function che:
1. Trova tutti i flussi pubblicati con trigger temporali (`birthday_reminder`, `custom_date`, `opportunity_stale`, `scheduler`)
2. Per `birthday_reminder`: query contatti con data di nascita = oggi, spara trigger
3. Per `custom_date`: query campi data contatto che matchano la condizione configurata
4. Per `opportunity_stale`: query opportunità open senza attività da X giorni
5. Per ogni match, inserisce in `automation_trigger_events`

**Migration SQL:** Creare pg_cron job che invoca la funzione ogni notte alle 02:00.

---

## Fase 2 — Fix P1

### D: Azione remove_from_automation
- **UI:** Aggiungere in `ACTION_CATEGORIES` (file `src/types/automationBuilder.ts`) la voce `remove_from_automation` nella categoria CRM
- **Config UI:** In `AutomationNodeConfig.tsx` aggiungere il pannello config con dropdown per selezionare il flusso target
- **Backend:** In `process-automation/index.ts`, case `remove_from_automation`: update `automation_enrollments` set `status = 'removed'` per l'entity nel flusso target

### E: Azione wait_for_event
- **UI:** Aggiungere `wait_for_event` nelle azioni logica con config: evento atteso, timeout in giorni, ramo timeout
- **Backend:** Nel case `wait_for_event`, creare un log entry con status `waiting` e `wait_until`. In `check-scheduled-triggers`, controllare i log in stato `waiting` scaduti e farli proseguire sul ramo timeout
- **Nel handleTrigger:** Quando arriva un evento, controllare se c'è un enrollment in stato `waiting` per quell'evento e farlo proseguire

### F: send_sms con Twilio
- Richiede credenziali Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`) — da richiedere all'utente
- Implementare il case `send_sms` in `process-automation/index.ts` con chiamata API Twilio
- Skippato se l'utente non ha Twilio configurato

---

## Fase 3 — Fix P2

### G: Enrollment bulk dalla lista contatti
- Aggiungere checkbox alla lista contatti CRM
- Toolbar batch con azione "Aggiungi a Workflow"
- Dialog per selezionare il workflow target
- Backend: inserimento batch in `automation_trigger_events` o chiamata diretta a handleTrigger per ogni contatto

---

## Riepilogo file modificati

| File | Fix |
|------|-----|
| `supabase/functions/email-tracking/index.ts` | A1 |
| `supabase/functions/whatsapp-webhook/index.ts` | A2 |
| `supabase/functions/process-automation/index.ts` | B, D, E, F |
| `supabase/functions/check-scheduled-triggers/index.ts` (nuovo) | C, E |
| `src/types/automationBuilder.ts` | D, E |
| `src/components/marketing/automations/AutomationNodeConfig.tsx` | D, E |
| `src/hooks/useOpportunitiesData.ts` | A3 (se necessario) |
| Migration SQL | C (pg_cron) |

Data la complessità, implementerò per blocchi: prima tutti i P0 (A1, A2, A3, B, C), poi P1 (D, E), infine P2 (G). SMS (F) richiede conferma credenziali Twilio.

