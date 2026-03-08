

# Analisi CRM vs GHL — Piano Implementazione

Il documento analizza 15 gap tra il CRM attuale e GoHighLevel. Ecco lo stato e il piano, organizzato per priorità.

---

## Già completato (da implementazioni precedenti)

| # | Feature | Stato |
|---|---------|-------|
| 5 | Trigger orfani collegati a eventi reali | ✅ Fatto (email_opened, whatsapp_received, customer_replied, call_registered) |
| 6 | Filtri trigger con dati contatto | ✅ Fatto (enrichment payload in handleTrigger) |
| 14 | Lead scoring | ✅ Fatto (colonna `score` su marketing_contacts + azione update_contact_score) |

---

## Da implementare — 12 fix rimanenti

### Fase 1 — P0 (Critici)

**1. DND (Do Not Disturb) completo**
- Migration: tabella `contact_dnd` (contact_id, channel, enabled, source, note) con UNIQUE(contact_id, channel)
- UI: sostituire placeholder "Prossimamente" nel tab DND di `MarketingContactDetail.tsx` con toggle per Email/SMS/WhatsApp/Chiamate
- Backend: aggiungere check DND in `send-contact-message`, `process-automation` (send_email, send_whatsapp, send_sms), `send-email-campaign`, whatsapp-broadcast
- Auto-attivazione: email-tracking unsubscribe → DND email; WhatsApp "STOP" → DND whatsapp
- Badge nella lista contatti quando almeno un canale è in DND

**2. Link prenotazione pubblica**
- Migration: colonna `booking_slug` (unique) su `marketing_calendars`
- Nuova pagina pubblica `/prenota/:slug` (no login richiesto, route pubblica)
- Mostra calendario, selettore data, slot disponibili (usa `marketing_calendar_availability` già esistente)
- Esclude appuntamenti esistenti, blocked slots, busy Google Calendar
- Form prenotazione (nome, email, telefono, note)
- Dopo booking: crea appointment, spara trigger `appointment_booked`
- RLS: policy SELECT pubblica su `marketing_calendars` filtrata per slug + `marketing_calendar_availability`

**3. Tab Email in AdminSettings** (rapido)
- Verifico se esiste già — il documento dice mancante ma potrebbe essere stato aggiunto

**4. Acquisto crediti Stripe in SettingsCredits**
- Già implementato con Stripe nella sessione precedente — verifico stato attuale

### Fase 2 — P1

**7. Probabilità + Close Date + Motivo perdita opportunità**
- Migration: colonne `probability` (integer 0-100, default 50), `expected_close_date` (date), `loss_reason` (text), `loss_notes` (text) su `marketing_opportunities`
- Migration: tabella `opportunity_loss_reasons` (id, company_id, label, position)
- UI in `OpportunityDetailDialog`: slider probabilità, date picker close date
- Dialog motivo perdita quando status → "lost"
- Dashboard: pipeline pesato = SUM(value × probability / 100)

**8. Conferma + Promemoria appuntamenti**
- Email conferma al contatto alla creazione appuntamento (via edge function esistente o nuova)
- Promemoria in `check-scheduled-triggers`: controlla appuntamenti prossime 24h/1h, invia notifica

**9. Google Calendar push notifications**
- Nuova edge function `google-calendar-webhook` per ricevere push da Google
- Migration: colonne `webhook_channel_id`, `webhook_expiry_at` su `google_calendar_connections`
- Registra watch dopo OAuth in `google-calendar-auth`
- Cron rinnovamento watch ogni 6 giorni

**10. SMS opt-out toggle**
- Aggiungere `optout_sms` su `marketing_contacts` (o gestito via `contact_dnd` channel='sms')
- Toggle nella UI settings contatto

**11. Email unsubscribed visibile in UI**
- Mostrare stato `email_unsubscribed` nel dettaglio contatto (il DB già lo traccia)
- Toggle manuale per attivare/disattivare

### Fase 3 — P2

**12. WhatsApp e Stripe in SettingsIntegrations**
- Card WhatsApp: legge `whatsapp_configs`, mostra numero/WABA ID/stato
- Card Stripe: legge `platform_settings`, mostra ambiente test/live
- Card Email Provider e Card Twilio (placeholder)

**13. Merge contatti duplicati**
- UI per selezionare 2 contatti e unirli
- Backend: merge opportunità, note, attività, documenti verso il contatto "master"

**15. Tab Azioni nel dettaglio contatto**
- Sostituire placeholder con azioni rapide: invia email, SMS, WhatsApp, aggiungi ad automation

---

## Riepilogo file principali

| File | Fix |
|------|-----|
| Migration SQL | 1, 2, 7, 9 |
| `MarketingContactDetail.tsx` | 1, 10, 11, 15 |
| Nuovo componente `ContactDndTab.tsx` | 1 |
| Nuova pagina `/prenota/:slug` | 2 |
| `OpportunityDetailDialog.tsx` | 7 |
| `process-automation/index.ts` | 1 (check DND) |
| `send-contact-message/index.ts` | 1 |
| `send-email-campaign/index.ts` | 1 |
| `check-scheduled-triggers/index.ts` | 8 |
| Nuovo `google-calendar-webhook/index.ts` | 9 |
| `SettingsIntegrations.tsx` | 12 |

---

## Ordine proposto

Implemento per blocchi: prima **Fase 1** (DND + Link prenotazione + verifiche), poi **Fase 2** (opportunità + appuntamenti + Google push), infine **Fase 3** (UX polish). Totale stimato: ~8-10 sessioni di lavoro.

