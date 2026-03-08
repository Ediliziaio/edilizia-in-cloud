

# Analisi Documento CRM vs GHL v2 — Stato Implementazione

Il documento v2 è identico al v1 già analizzato e implementato nelle sessioni precedenti. Ecco lo stato aggiornato di ogni fix elencato nella tabella riepilogativa (pag. 21):

---

## Fix già implementati e funzionanti

| # | Fix | Stato | Verifica |
|---|-----|-------|----------|
| 1 | **DND (Do Not Disturb)** | ✅ | Tab DND funzionante con 4 toggle (WhatsApp, Email, SMS, Chiamate). Check DND in `send-contact-message`, `process-automation`, `send-email-campaign`. Mostra stato "Disiscritto" con data. |
| 2 | **Link prenotazione pubblica** | ✅ | `/prenota/:slug` — pagina pubblica con selezione data/slot, form prenotazione, conferma visiva. Colonna `booking_slug` su `marketing_calendars`. |
| 3 | **Tab Email in AdminSettings** | ✅ | Già esistente e funzionante. |
| 4 | **Acquisto crediti Stripe** | ✅ | Già implementato. |
| 5 | **Trigger orfani** | ✅ | `email_opened`, `whatsapp_received`, `customer_replied`, `call_registered` — tutti collegati. |
| 6 | **Filtri trigger con dati contatto** | ✅ | Enrichment payload in `handleTrigger`. |
| 7 | **Probabilità + Close Date + Motivo perdita** | ✅ | Slider probabilità, date picker, dialog motivo perdita con `opportunity_loss_reasons` — tutto in `OpportunityDetailDialog.tsx`. Pipeline pesato calcolato. |
| 8 | **Conferma + Promemoria appuntamenti** | ✅ | Reminder 24h/1h in `check-scheduled-triggers` con tabella `appointment_reminders_sent`. |
| 9 | **Google Calendar push notifications** | ✅ | `google-calendar-webhook` Edge Function creata, registrazione watch, rinnovo automatico. |
| 10 | **SMS opt-out toggle** | ✅ | Colonna `optout_sms` su `marketing_contacts`, toggle nel tab DND e Settings. |
| 11 | **Email unsubscribed visibile in UI** | ✅ | Mostrato nel tab DND quando `unsubscribed = true` con data. |
| 12 | **WhatsApp e Stripe in SettingsIntegrations** | ✅ | Card WhatsApp (numero, WABA ID, stato) e Card Stripe (modalità test/live) nella sezione "Stato servizi". |
| 13 | **Merge contatti duplicati** | ✅ | `ContactMergeDialog.tsx` — merge opportunità, note, attività, appuntamenti, messaggi. Pulsante nell'header del contatto. |
| 14 | **Lead scoring** | ✅ | Colonna `score` su `marketing_contacts`, azione `update_contact_score` nel builder automazioni (add/subtract/set). |
| 15 | **Tab Azioni nel dettaglio contatto** | ✅ | `ContactActionsTab.tsx` — azioni rapide: WhatsApp, Email, SMS, Chiama, Aggiungi ad automazione. |

---

## Bug attivo riscontrato

**Console error**: `ContactDndTab` riceve un `ref` da `TabsContent` di Radix ma non lo gestisce (`Function components cannot be given refs`). Non è bloccante (il componente funziona) ma genera un warning. Va risolto wrappando `ContactDndTab` con `React.forwardRef`.

---

## Gap ancora aperti (non nel piano originale ma menzionati nel documento)

Questi sono gap citati nel documento v2 ma **non inclusi nei 15 fix prioritari**:

| Gap | Sezione Doc | Note |
|-----|-------------|------|
| Storico tag (audit trail) | §1.2 pag.3 | Nessun log di quando un tag viene aggiunto/rimosso |
| Valutazione contatto (stelle 1-5) | §1.2 pag.3 | Nessun sistema rating |
| Commissioni su opportunità | §3.2 pag.6 | Campo commission % mancante |
| Competitor tracking | §3.2 pag.6 | Campo concorrente mancante |
| Pipeline stage automation rules | §3.2 pag.6 | Regole automatiche per stage |
| Integrazione video (Zoom/Meet) | §4.2 pag.7 | Nessun link video automatico |
| Timezone configurabile | §4.2/6.3 | Hardcoded Europe/Rome |
| Disponibilità staff ricorrente | §4.2 pag.7 | Solo slot bloccati, non orari ricorrenti |
| Conferma RSVP dal cliente | §4.2 pag.7 | Nessun link conferma/rifiuto |
| Activity feed real-time dashboard | §5.2 pag.8 | Manca feed live |
| Durata media per stage | §5.2 pag.8 | Analisi colli di bottiglia |
| Analisi coorti | §5.2 pag.8 | Lead per mese e conversione |
| Report schedulati via email | §5.2 pag.8 | Report PDF settimanali |
| Attribuzione multi-touch | §5.2 pag.8 | Solo fonte primaria |
| Attendees Google Calendar | §6.3 pag.9 | Partecipanti non sincronizzati |
| Zapier / Webhook uscente | §7.1 pag.12 | Nessun webhook builder |
| Invio bulk email dalla lista | §1.2 pag.2 | Solo WhatsApp broadcast esiste |
| Gestione cancellazione appuntamento | §4.2 pag.7 | Nessun flusso con notifica |

---

## Riepilogo

**Tutti i 15 fix prioritari del documento sono stati implementati correttamente.** L'unico problema tecnico è il warning React `forwardRef` su `ContactDndTab` (fix rapido). I gap rimanenti sono feature aggiuntive non incluse nel piano originale.

Vuoi che proceda con il fix del warning `forwardRef` e/o con l'implementazione di alcuni dei gap aggiuntivi?

