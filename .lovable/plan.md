

# Fase 2 — Implementazione (P1)

## Stato attuale
- **FIX 8 (DND check)**: Già implementato in `ai-outbound-call` (controlla `optout_call`). Completato in Fase 1.
- **SettingsCredits**: Ha già wallet AI con saldo, ma manca tab dedicata con acquisto crediti AI e auto-topup AI.
- **AgentToolsTab**: Ha 4 tool EdiliziaInCloud, manca `assign_to_user`.
- **AdminSettings**: Nessun link ad Agenti AI. `PlatformSettingsPage` esiste ma non è raggiungibile da sidebar admin.
- **elevenlabs-webhook**: Non gestisce tool `assign_to_user`.

---

## FIX 5: Strumento `assign_to_user`

### elevenlabs-webhook/index.ts
Aggiungere case `assign_to_user` nel switch `tool_calls` (dopo `update_lead_status`):
- Riceve `parameters.user_id` e `parameters.contact_id` (o usa `contactId` già risolto)
- Aggiorna `marketing_contacts.assigned_to = user_id` dove `id = contact_id` e `company_id = companyId`

### AgentToolsTab.tsx
Aggiungere tool `assign_to_user` alla lista `ediliziaTools`:
- Label: "Assegna a utente"
- Descrizione: "Assegna il contatto a un membro del team"
- Icona: `UserPlus`

---

## FIX 6: Sezione AI in SettingsCredits

### SettingsCredits.tsx
- Aggiungere tab "Agente AI" nelle `TabsList`
- Contenuto: saldo AI, acquisto pacchetti AI (€10/€25/€50/€100), auto-topup per wallet_type `ai`
- Fetch `ai_auto_topup` da `company_auto_topup` con `wallet_type = 'ai'`
- Acquisto crediti AI: invocare `create-checkout-session` con `type: 'ai_credits'`
- Mostrare stato abbonamento AI da `ai_subscriptions`

---

## FIX 7: Tab "Agenti AI" in AdminSettings

### Nuovo file: `src/pages/admin/settings/AdminSettingsAI.tsx`
- Importa `PlatformSettingsPage` dal modulo ai-agents
- Wrappa in layout con titolo "Agenti AI" e descrizione

### AdminLayout.tsx — AdminSettingsSidebar
- Aggiungere link nella sezione "Piattaforma": `/admin/impostazioni/agenti-ai` con icona `Bot`

### App.tsx
- Lazy import `AdminSettingsAI`
- Route: `impostazioni/agenti-ai`

### PlatformSettingsPage.tsx
- Aggiungere sezione "Abbonamento AI" con campi:
  - `ai_subscription_price_eur` (prezzo mensile)
  - `ai_subscription_trial_days` (giorni trial)
  - `ai_welcome_bonus_eur` (bonus benvenuto €)

---

## FIX 8: DND check su chiamate AI
Già completato in Fase 1 (`ai-outbound-call` lines 56-69). Aggiungere solo un log in `elevenlabs-webhook` se la chiamata inbound riguarda un contatto con `optout_call = true`.

---

## File da modificare

| File | Fix |
|------|-----|
| `supabase/functions/elevenlabs-webhook/index.ts` | 5, 8 |
| `src/modules/ai-agents/components/AgentToolsTab.tsx` | 5 |
| `src/pages/azienda/settings/SettingsCredits.tsx` | 6 |
| Nuovo `src/pages/admin/settings/AdminSettingsAI.tsx` | 7 |
| `src/components/layouts/AdminLayout.tsx` | 7 |
| `src/App.tsx` | 7 |
| `src/modules/ai-agents/pages/PlatformSettingsPage.tsx` | 7 |

