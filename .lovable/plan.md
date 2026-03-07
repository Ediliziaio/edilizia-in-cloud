

# Verifica Modulo AI Agents — Problemi Trovati e Fix

## Stato attuale

Il modulo è ben strutturato con: 10 tabelle DB corrette (`ai_agents`, `ai_credits`, `ai_credit_topups`, `ai_credit_usage`, `platform_pricing`, etc.), 8 pricing rows seeded, RLS policies su tutte le tabelle crediti, 3 edge functions (`elevenlabs-proxy`, `elevenlabs-webhook`, `check-credits-before-call`, `topup-credits`), e UI crediti pay-per-use funzionante.

## Problemi da correggere

### 1. config.toml — Mancano le nuove Edge Functions
Le funzioni `check-credits-before-call` e `topup-credits` **non sono registrate** in `supabase/config.toml`. Senza `verify_jwt = false`, le chiamate falliranno con errore JWT.

**Fix**: Aggiungere le entry nel config.toml.

### 2. Console Warning — CreditUsageBar ref
La console mostra un warning: "Function components cannot be given refs" per `CreditUsageBar`. Il componente `Progress` di shadcn passa un ref, ma `CreditUsageBar` non lo forwarda.

**Fix**: Non critico, ma si risolve aggiungendo `React.forwardRef` oppure semplicemente ignorabile.

### 3. Tabella `ai_agent_credits` legacy ancora presente
La vecchia tabella con `total_minutes_purchased` esiste ancora. Non causa problemi funzionali perché il codice usa `ai_credits`, ma genera confusione.

**Fix**: Nessuna azione richiesta — è backward compat. La nuova logica usa correttamente `ai_credits`.

### 4. `AgentAnalyticsPage.tsx` non esiste come file separato
Il prompt specifica `AgentAnalyticsPage.tsx` ma l'analytics è integrato come tab nell'`AgentEditorPage` tramite `AgentAnalyticsTab`. Questo è corretto — la analytics è per-agente, non globale.

**Fix**: Nessuna azione richiesta — l'architettura scelta è corretta.

### 5. `useEdiliziaIntegration.ts` — Verificare collegamento
Devo confermare che l'hook di integrazione CRM/calendario sia collegato.

---

## Piano Fix (3 modifiche)

### Fix 1: config.toml — Registrare le nuove edge functions
Aggiungere:
```toml
[functions.check-credits-before-call]
verify_jwt = false

[functions.topup-credits]
verify_jwt = false
```

### Fix 2: AgentCreditsPage — Gestire caso `credits` null nel topup
Attualmente `handleTopup` invia `credits?.company_id` che potrebbe essere `undefined` se `credits` è null. Bisogna recuperare `company_id` dal profilo utente come fallback.

### Fix 3: (opzionale) CreditUsageBar ref warning
Il warning è cosmetico. Se si vuole risolverlo, basta non passare ref al componente — nessun impatto funzionale.

---

## Verifiche positive (tutto OK)

- DB schema: tutte le tabelle e colonne corrette ✅
- `tts_model` aggiunto ad `ai_agents` ✅
- `platform_pricing` con 8 rows seed ✅
- `monthly_billing_summary` view creata ✅
- RLS policies su tutte e 4 le tabelle crediti ✅
- `init_company_credits()` trigger per auto-creare wallet ✅
- Edge functions `elevenlabs-proxy`, `elevenlabs-webhook` registrate ✅
- Webhook con logica crediti Euro completa ✅
- `topup-credits` con auto-sblocco se `balance_zero` ✅
- `check-credits-before-call` con verifica pricing per agent ✅
- UI crediti con saldo, barra, stima conversazioni, topup manuale ✅
- PlatformSettingsPage con pricing table inline editing ✅

