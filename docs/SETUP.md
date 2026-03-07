# Setup — Modulo Agenti AI ElevenLabs

## Prerequisiti

1. Progetto Lovable Cloud attivo
2. Account ElevenLabs con API key

## Configurazione

### 1. API Key ElevenLabs

Vai su **Impostazioni Piattaforma** (`/azienda/marketing/agente-ai/impostazioni`) e inserisci la API key ElevenLabs. La chiave viene salvata in modo sicuro nella tabella `platform_settings` e utilizzata da tutte le Edge Function.

In alternativa, puoi configurarla come secret Supabase:
- Nome: `ELEVENLABS_API_KEY`
- Valore: la tua API key `xi-...`

### 2. Webhook ElevenLabs (opzionale, per crediti automatici)

1. Vai su [ElevenLabs Dashboard → Agents](https://elevenlabs.io/app/conversational-ai)
2. Per ogni agente, configura il webhook URL:
   ```
   https://guqgszwelffntrgtsycm.supabase.co/functions/v1/elevenlabs-webhook
   ```
3. (Opzionale) Configura il secret HMAC per la verifica delle firme:
   - Su ElevenLabs: copia il webhook secret
   - Su Lovable Cloud: aggiungi il secret `ELEVENLABS_WEBHOOK_SECRET`

### 3. Crediti

Il sistema crea automaticamente un portafoglio crediti per ogni azienda. Per iniziare:
1. Vai su **Crediti & Utilizzo**
2. Effettua una ricarica manuale
3. (Opzionale) Configura la ricarica automatica

## Architettura

```
Frontend (React)
  ↓ supabase.functions.invoke()
elevenlabs-proxy (Edge Function)
  ↓ xi-api-key from platform_settings
ElevenLabs API
  ↓ webhook callback
elevenlabs-webhook (Edge Function)
  ↓ HMAC verification + credit deduction
Database (ai_credits, ai_credit_usage, ai_agent_conversations)
```

## Tabelle Principali

| Tabella | Descrizione |
|---------|-------------|
| `ai_agents` | Configurazione agenti |
| `ai_credits` | Portafoglio crediti per azienda |
| `ai_credit_usage` | Log utilizzo per conversazione |
| `ai_credit_topups` | Storico ricariche |
| `ai_agent_conversations` | Conversazioni registrate |
| `ai_agent_knowledge_docs` | Documenti knowledge base |
| `ai_agent_tests` | Test degli agenti |
| `platform_settings` | Configurazione piattaforma (API key, ecc.) |
| `platform_pricing` | Tabella prezzi LLM+TTS |
