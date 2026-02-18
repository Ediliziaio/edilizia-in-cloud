

# Fix integrazione WhatsApp - 3 Correzioni necessarie

## Panoramica

L'integrazione e' quasi completa. Servono 3 correzioni per renderla funzionante.

---

## 1. META_APP_ID — Configurazione richiesta dall'utente

**File:** `src/components/messaging/MessagingSettingsTab.tsx` (riga 14)

Il valore `"YOUR_META_APP_ID"` deve essere sostituito con l'ID reale della Meta App.

**Dove trovarlo:** Meta Developer Console > La tua App > Settings > Basic > App ID (es. `"123456789012345"`)

L'utente dovra' fornire questo valore. Una volta ottenuto, verra' inserito come costante nel codice (e' un valore pubblico, non un secret).

---

## 2. config_id per Embedded Signup

**File:** `src/components/messaging/MessagingSettingsTab.tsx` (riga 193)

Attualmente `config_id: ""` e' vuoto. Meta richiede un config_id valido per il flusso di WhatsApp Embedded Signup.

**Dove crearlo:**
1. Meta Developer Console > La tua App > WhatsApp > Getting Started
2. Creare una "Login Configuration" per l'Embedded Signup
3. Copiare il config_id generato

Anche questo valore e' pubblico e verra' inserito come costante nel codice accanto al META_APP_ID.

---

## 3. CORS Headers completi

**File da modificare:**
- `supabase/functions/whatsapp-connect/index.ts`
- `supabase/functions/whatsapp-status/index.ts`
- `supabase/functions/whatsapp-webhook/index.ts`

Aggiornare `corsHeaders` in tutte e 3 le funzioni per includere gli header completi:

```
"authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version"
```

---

## Dettaglio tecnico

### File modificati

| File | Modifica |
|------|----------|
| `src/components/messaging/MessagingSettingsTab.tsx` | Inserire `META_APP_ID` e `config_id` reali (forniti dall'utente) |
| `supabase/functions/whatsapp-connect/index.ts` | CORS headers completi |
| `supabase/functions/whatsapp-status/index.ts` | CORS headers completi |
| `supabase/functions/whatsapp-webhook/index.ts` | CORS headers completi |

### Azione richiesta all'utente

Prima di procedere con le modifiche, servono 2 valori dall'utente:
1. **Meta App ID** (dalla Meta Developer Console)
2. **Config ID** per l'Embedded Signup (dalla configurazione WhatsApp nella Meta Developer Console)

