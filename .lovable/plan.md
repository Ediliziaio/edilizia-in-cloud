

# FIX: Azioni sync_google e sync_meta_lead nel motore automazioni

## Situazione attuale

- `google-calendar-sync` edge function **esiste già** con push/update/delete/reconcile completi via OAuth user tokens
- `meta-process-leads` edge function **esiste già** e processa lead da webhook Meta
- `process-automation` gestisce i nodi: nel `switch(actionType)` le azioni `sync_google` e `sync_meta_lead` cadono nel `default` → `"Not implemented yet"`
- Il config UI in `AutomationNodeConfig.tsx` mostra "Integrazione disponibile in futuro"

## Piano

### 1. Aggiungere i case nel `process-automation/index.ts`

Nella funzione `executeAction`, aggiungere due nuovi case:

**`sync_google`**: 
- Legge `sync_action` dal config (`sync_contact` o `sync_event`)
- Per `sync_event`: cerca l'appuntamento più recente del contatto (`entityId`), poi chiama internamente `google-calendar-sync` via `fetch()` con action `push-event`
- Per `sync_contact`: placeholder (Google Calendar non ha un concetto di "contatto sync" — log + success)
- Necessita di trovare un `user_id` con connessione Google attiva per la company (query `google_calendar_connections`)

**`sync_meta_lead`**:
- Legge `sync_action` dal config
- Per `sync_contact`: prende i dati del contatto e li invia come lead a Meta via Conversions API (se configurato), oppure log placeholder
- L'import lead da Meta → CRM è già gestito da `meta-process-leads` + `meta-webhook`, quindi non serve duplicarlo qui

### 2. Aggiornare il config UI in `AutomationNodeConfig.tsx`

- Rimuovere il testo "Integrazione disponibile in futuro"
- Per `sync_google`: mostrare opzioni più specifiche basate sulle connessioni Google Calendar attive
- Per `sync_meta_lead`: mostrare info che l'import è automatico via webhook, e l'azione qui può forzare un re-sync

### 3. Aggiornare le descrizioni in `automationBuilder.ts`

- Rimuovere "(placeholder per futura integrazione)" dalle descrizioni di `sync_google` e `sync_meta_lead`

### File da modificare

| File | Azione |
|------|--------|
| `supabase/functions/process-automation/index.ts` | Aggiungere case `sync_google` e `sync_meta_lead` in `executeAction` |
| `src/components/marketing/automations/AutomationNodeConfig.tsx` | Rimuovere messaggio placeholder, migliorare opzioni config |
| `src/types/automationBuilder.ts` | Aggiornare descrizioni (rimuovere "placeholder") |

### Nessuna nuova edge function necessaria
Le edge function `google-calendar-sync` e `meta-process-leads` esistono già. Il fix consiste nel collegarle al motore di esecuzione automazioni.

