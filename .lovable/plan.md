

# Piano: Timeline Unificata, A/B Testing Email, Import/Export CSV Avanzato

## 1. Timeline Unificata Contatto

**Stato attuale**: La timeline in `MarketingContactDetail.tsx` mostra solo le `marketing_contact_activities` (creazione, note, assegnazioni, stage changes, documenti). Mancano: email inviate, WhatsApp, SMS, chiamate AI, ordini.

**Implementazione**:
- Creare componente `UnifiedContactTimeline.tsx` che aggrega dati da:
  - `marketing_contact_activities` (gia presente)
  - `contact_messages` (email, WhatsApp, SMS gia presenti ma mostrati separatamente in basso)
  - `email_logs` (campagne email ricevute dal contatto)
  - `call_logs` (chiamate manuali e AI)
  - `appointments` (appuntamenti)
  - `marketing_contact_notes` (note)
- Normalizzare tutti gli eventi in un formato comune `{id, type, icon, color, title, description, timestamp, metadata}`
- Filtro per tipo di evento (tutti, messaggi, email, chiamate, note, opportunita)
- Raggruppamento per data (Oggi, Ieri, date)
- Sostituire l'attuale timeline nel pannello centrale di `MarketingContactDetail.tsx`
- Spostare la sezione "Messaggi recenti" dentro la timeline unificata

**File coinvolti**:
- **Nuovo**: `src/components/marketing/UnifiedContactTimeline.tsx`
- **Modificato**: `src/pages/azienda/marketing/MarketingContactDetail.tsx` (sostituire timeline centrale con il nuovo componente)

---

## 2. A/B Testing Email

**Stato attuale**: Il DB ha gia i campi `ab_test_enabled` e `ab_subject_b` in `email_campaigns`. L'UI in `CampaignSendSettings.tsx` non li usa. La Edge Function `send-email-campaign` non gestisce lo split A/B.

**Implementazione**:

### UI in CampaignSendSettings.tsx
- Aggiungere toggle "Abilita A/B Test" sotto il campo Oggetto
- Se attivo, mostrare campo "Oggetto variante B" e slider per split percentage (es. 50/50, 70/30)
- Sezione "Criterio vincitore": open rate o click rate, dopo quante ore decidere (es. 4h)
- Salvare `ab_test_enabled`, `ab_subject_b` nel DB

### Migrazione DB
- Aggiungere colonne: `ab_split_percent` (integer, default 50), `ab_winner_criteria` (text, default 'open_rate'), `ab_test_duration_hours` (integer, default 4), `ab_winner` (text, nullable: 'A' o 'B'), `ab_html_content_b` (text, nullable)

### Edge Function send-email-campaign
- Se `ab_test_enabled`:
  1. Dividere i destinatari in gruppo A e B secondo `ab_split_percent`
  2. Inviare con oggetto A al gruppo A, oggetto B al gruppo B
  3. Loggare in `email_logs` una colonna `ab_variant` ('A' o 'B')

### Migrazione email_logs
- Aggiungere colonna `ab_variant` (text, nullable) alla tabella `email_logs`

### Statistiche A/B (future, non in questa fase)
- Per ora il confronto sara visibile dai dati in `email_logs` filtrati per variante

**File coinvolti**:
- **Modificato**: `src/pages/azienda/marketing/CampaignSendSettings.tsx` (UI A/B)
- **Modificato**: `supabase/functions/send-email-campaign/index.ts` (logica split)
- **Migrazione DB**: nuove colonne su `email_campaigns` e `email_logs`

---

## 3. Import/Export CSV Avanzato

**Stato attuale**: Esiste gia `ImportWizard` (multi-step con upload, mapping, review) e `exportToCSV` basilare. L'import supporta contatti e opportunita. L'export scarica tutti i contatti senza filtri.

**Miglioramenti**:

### Export Avanzato
- Esportare solo i contatti filtrati/selezionati (non tutti)
- Scelta formato: CSV o XLSX
- Inclusione campi custom nell'export
- Export con filtri attivi applicati

### Import Avanzato
- Modalita "Aggiorna esistenti" (match per email/telefono): gia presente come opzione `ImportMode` nel wizard, verificare che funzioni con upsert
- Validazione avanzata: controllo duplicati pre-import, email format check
- Report dettagliato post-import: righe create, aggiornate, saltate, errori per riga

### Implementazione
- Modificare `handleExport` in `MarketingContacts.tsx`: se ci sono `selectedIds`, esportare solo quelli; altrimenti applicare i filtri attivi; aggiungere campi custom
- Aggiungere dropdown sul pulsante Export: "Esporta CSV" / "Esporta XLSX"
- Aggiungere export XLSX tramite la libreria `xlsx` gia installata
- Migliorare `handleImport` per supportare upsert (match email/phone) con report dettagliato

**File coinvolti**:
- **Modificato**: `src/pages/azienda/marketing/MarketingContacts.tsx` (export filtrato, XLSX, campi custom)
- **Modificato**: `src/lib/csvExport.ts` (aggiungere `exportToXLSX`)
- **Modificato**: `src/components/shared/ImportWizard.tsx` o `StepReview.tsx` (report dettagliato)

---

## Riepilogo migrazioni DB necessarie

```sql
-- A/B Testing fields
ALTER TABLE email_campaigns ADD COLUMN ab_split_percent integer DEFAULT 50;
ALTER TABLE email_campaigns ADD COLUMN ab_winner_criteria text DEFAULT 'open_rate';
ALTER TABLE email_campaigns ADD COLUMN ab_test_duration_hours integer DEFAULT 4;
ALTER TABLE email_campaigns ADD COLUMN ab_winner text;
ALTER TABLE email_campaigns ADD COLUMN ab_html_content_b text;

ALTER TABLE email_logs ADD COLUMN ab_variant text;
```

## Ordine di implementazione
1. Migrazioni DB (A/B testing)
2. Timeline Unificata Contatto
3. A/B Testing Email (UI + Edge Function)
4. Import/Export CSV Avanzato

