

# Analisi Documento v2 — Stato e Piano Implementazione

Il documento è sostanzialmente identico al primo (`analisi_automazioni_fix.docx`). Confrontando con il codice attuale, **Fase 1 (P0) e Fase 2 parziale (P1) sono già implementate**:

## Già completato

| Fix | Descrizione | Stato |
|-----|-------------|-------|
| A1 | email_opened/clicked → automation_trigger_events | ✅ Fatto |
| A2 | whatsapp_received → automation_trigger_events | ✅ Fatto |
| A3 | opportunity_won/lost (DB trigger `fire_marketing_automation`) | ✅ Funzionante |
| B | Enrichment payload con dati contatto in handleTrigger | ✅ Fatto |
| C | check-scheduled-triggers + pg_cron | ✅ Fatto |
| D | remove_from_automation (UI + backend) | ✅ Fatto |
| E | wait_for_event (UI + backend + timeout) | ✅ Fatto |

## Da implementare

### 1. **F — send_sms con Twilio** (P1)
Attualmente stub (`console.log`). Richiede `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, e un numero mittente.
- Aggiungere i secrets Twilio
- Implementare il case `send_sms` in `process-automation/index.ts` con chiamata REST API Twilio
- Aggiungere config UI per SMS (numero mittente) in Platform Settings

### 2. **G — Enrollment bulk dalla lista contatti CRM** (P2)
- Aggiungere checkbox di selezione nella lista contatti marketing
- Toolbar batch con azione "Aggiungi a Workflow"
- Dialog per selezionare il workflow target
- Inserimento batch in `automation_trigger_events`

### 3. **Lead scoring (update_contact_score)** (da §3.7)
- Migration: colonna `score` (integer, default 0) su `marketing_contacts`
- Nuova azione `update_contact_score` in `automationBuilder.ts` e `process-automation`
- Config UI: campo punteggio (+/- o set assoluto)

### 4. **Trigger orfani ancora non collegati**
- `customer_replied` — collegare al webhook WhatsApp (messaggio in arrivo = reply)
- `call_registered` — collegare a `call_logs` insert trigger
- `form_submitted` / `survey_submitted` — richiedono un modulo form/survey (non ancora esistente nel progetto)

### 5. **Stub azioni**
- `send_notification` — implementare come notifica interna (insert in una tabella notifications o toast via realtime)
- `send_ai_message` — integrare con Lovable AI per generare e inviare messaggio

### 6. **Re-enrollment (§3.8)**
- Il check attuale blocca re-iscrizione se `status = 'active'`. Aggiungere opzione `allow_re_enrollment` nel flow settings e controllare anche `completed` status.

### 7. **Contatori per nodo real-time (§3.9)**
- Query aggregata su `automation_execution_log` per contare esecuzioni per nodo
- Mostrare badge con conteggio su ogni nodo nel builder

---

## Ordine di implementazione proposto

1. **Lead scoring** (migration + azione + UI) — impatto alto, nessuna dipendenza esterna
2. **Re-enrollment** — fix logico piccolo
3. **Contatori per nodo** — UI improvement
4. **customer_replied + call_registered** — collegare trigger esistenti
5. **send_notification** — notifica interna reale
6. **send_sms con Twilio** — richiede secrets dall'utente
7. **Enrollment bulk** — feature UI complessa
8. **send_ai_message** — integrazione AI

Posso procedere con i punti 1-5 immediatamente. Per il punto 6 (Twilio) serviranno le credenziali. I punti 7-8 sono P2.

