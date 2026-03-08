

## Piano: Completamento Fase 2 — Correzione send-test-email per supporto test diretto

### Stato attuale

I componenti frontend di Fase 2 sono **già implementati** e correttamente collegati:
- `EmailSettingsTab.tsx` con 3 tab (Provider, Prezzi, Dashboard) ✅
- `EmailProviderConfig.tsx` — dual stream (marketing/transactional) ✅
- `EmailPricingConfig.tsx` — markup globale + tabella tariffe ✅
- `EmailDashboard.tsx` — KPI + top 10 aziende ✅
- Route `/admin/impostazioni/email` + sidebar link ✅

### Problema trovato

La `EmailProviderConfig` invia un test email con `testMode: true` e `campaignId: null`, ma la edge function `send-test-email` **richiede obbligatoriamente `campaignId`** e non gestisce il flusso testMode. Il test email dal pannello Super Admin fallirà con errore 400.

### Modifiche necessarie

#### 1. Aggiornare `supabase/functions/send-test-email/index.ts`

- Importare `sendViaProvider` e `loadProviderSettings` dalla shared lib `_shared/emailProvider.ts` (eliminando la copia locale)
- Aggiungere supporto per `testMode: true`: quando presente, usare `subject`, `html`, `stream` e `provider` dal body della richiesta (senza fetch della campagna)
- Quando `stream` è specificato, caricare le credenziali del provider corretto (marketing vs transactional)
- Non detrarre crediti in modalità test dal pannello super admin

#### 2. Nessuna modifica frontend necessaria

I componenti sono già completi e funzionanti. Solo il backend va allineato.

### Dettagli tecnici

Il flusso sarà:
```
testMode=true → usa subject/html/stream/provider dal body → loadProviderSettings(stream) → sendViaProvider() → risposta
testMode=false → flusso esistente (campaignId obbligatorio, fetch campagna, deduct credits)
```

