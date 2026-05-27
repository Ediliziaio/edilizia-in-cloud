# WhatsApp Business — Setup Meta Panel

> **Status**: 🟡 PREPARAZIONE
> **Owner**: Florin (decision + click nel Meta Developer Dashboard)
> **Modello scelto**: **Tech Provider** (il cliente collega il SUO WhatsApp a EiC)
> **App Meta**: `Edilizia in Cloud` (ID `795702233553170`)
> **Generato**: 2026-05-27

---

## 1. Architettura (cosa stai facendo)

```
Cliente azienda
  │
  ├─ ha il SUO numero WhatsApp Business
  ├─ ha il SUO Business Manager Meta
  └─ clicca "Connetti WhatsApp" su EdiliziaInCloud
       │
       │  Embedded Signup popup (FB.login con config_id)
       ↓
       Meta restituisce un access_token + waba_id + phone_number_id
       │
       ↓
       EdiliziaInCloud (edge fn whatsapp-connect)
       ├─ scambia code → token (Graph API)
       ├─ subscribe webhook su phone_number_id
       └─ salva in ai_whatsapp_numbers (token encrypted)

Da qui in poi:
  - Meta → /whatsapp-webhook → router → handler (bot_operativo/lead/marketing/...)
  - EiC → /whatsapp-send → Graph API → numero del cliente
```

**Chi paga Meta?** Il cliente direttamente (è il suo numero, il suo Business
Manager). EdiliziaInCloud è solo lo strumento di gestione.

---

## 2. Cosa serve fatto UNA volta dal team EiC

Tutto nel Meta Developer Dashboard:
👉 https://developers.facebook.com/apps/795702233553170/

### 2.1 — Verificare il tipo di App

- **Settings → Basic**
- Verifica che `App type = Business` (non Consumer)
- Se diverso → bisognerebbe ricreare l'app (ma dalla tua schermata sembra
  già "Business")

### 2.2 — Aggiungere il prodotto "WhatsApp"

1. **Add Products → WhatsApp** → click "Set up"
2. Meta crea automaticamente un numero WABA "test" per development
3. Setting → vedi `App ID`, `App Secret`, `Phone Number ID`, `WABA ID` di test

### 2.3 — Configurare il Webhook

Va fatto SOLO per il **callback verso EiC** (lato Meta non lato cliente).

In **WhatsApp → Configuration → Webhooks**:

| Campo | Valore |
|---|---|
| Callback URL | `https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/whatsapp-webhook` |
| Verify Token | (un valore random — salvalo in `platform_settings.meta_webhook_verify_token`) |

Subscribe ai field necessari:

- [x] **messages** ← messaggi in entrata (obbligatorio)
- [x] **message_template_status_update** ← cambio stato template (approved/rejected) — gestito v8.6.74
- [x] **account_update** ← cambi a livello WABA
- [x] **phone_number_quality_update** ← quality rating tier
- [ ] (opzionali) `account_alerts`, `account_review_update`, `business_capability_update`

### 2.4 — Salvare le credenziali in `platform_settings`

SQL su Supabase:

```sql
insert into platform_settings (key, value, description)
values
  ('meta_app_id',                  '795702233553170',          'Meta App ID'),
  ('meta_app_secret',              'YYYYYYYY',                 'Meta App Secret (encrypted)'),
  ('meta_webhook_verify_token',    'random-token-32-chars',    'Webhook verify token'),
  ('whatsapp_embedded_config_id',  'XXXXX',                    'Config ID Embedded Signup'),
  ('whatsapp_price_per_msg_eur',   '0.0265',                   'Pricing default')
on conflict (key) do update set value = excluded.value;
```

`whatsapp_embedded_config_id` lo ottieni dal **WhatsApp → Configuration →
Embedded Signup → Add Configuration** (creale UNA configurazione e copia l'ID
generato).

### 2.5 — URL legali

In **Settings → Basic** assicurati siano configurati:

| Campo | Valore |
|---|---|
| Privacy Policy URL | `https://ediliziaincloud.it/privacy` |
| Terms of Service URL | `https://ediliziaincloud.it/termini` |
| **Data Deletion Instructions URL** | `https://ediliziaincloud.it/privacy/cancellazione-dati` |
| App Domain | `ediliziaincloud.it` |
| Category | `Business and Pages` |

### 2.6 — Business Verification (1–3 giorni)

Va fatta UNA volta sul tuo Business Manager (non dell'app):

👉 https://business.facebook.com/settings/security

- Carica visura camerale
- Carica P.IVA
- Indirizzo legale che combaci con la visura
- Sito ufficiale verificabile (`ediliziaincloud.it`)

Senza Business Verification non puoi attivare WhatsApp in produzione.

---

## 3. Cosa serve fatto DAL CLIENTE quando si collega

Niente — è tutto automatizzato via Embedded Signup. Il cliente:

1. Clicca "Connetti WhatsApp" in EdiliziaInCloud → `/azienda/impostazioni/whatsapp`
2. Si apre popup Facebook con il flow Meta
3. Sceglie il SUO Business Manager
4. Conferma il SUO numero (riceve OTP via SMS)
5. Autorizza l'app "Edilizia in Cloud" a leggere/inviare messaggi
6. ✅ Finito — EiC ha il token e può iniziare a inviare/ricevere

Tempo medio: **5 minuti**.

---

## 4. App Review checklist (per andare LIVE)

L'app è oggi `In sviluppo` → funziona solo per admin/tester/developer registrati
nell'app Meta. Per usarla con clienti reali serve passare l'App Review.

### Permessi richiesti

| Permission | Categoria | Use case dichiarato |
|---|---|---|
| `whatsapp_business_messaging` | Standard | Inviare messaggi all'azienda cliente |
| `whatsapp_business_management` | Standard | Gestire template + numeri WABA cliente |
| `business_management` | Advanced | Leggere asset business del cliente |

### Submit pre-checklist

- [x] **Webhook configurato e verificato** (Meta deve vedere che il GET verify ritorna `hub.challenge`)
- [ ] **Privacy Policy URL accessibile** e parla esplicitamente di WhatsApp message handling
- [ ] **Terms of Service URL accessibile**
- [ ] **Data Deletion URL funzionante** — deve esserci una pagina che spiega come l'utente richiede cancellazione (form o email)
- [ ] **Business Verification completata** (Settings → Business Verification = Approved)
- [ ] **App Icon 1024x1024 PNG** caricata in Basic Settings
- [ ] **Long Description app** (~500 caratteri) caricata
- [ ] **Screencast** di 3–5 minuti che mostra:
      - utente apre EiC → vista "Impostazioni → WhatsApp"
      - clicca "Connetti WhatsApp" → popup Meta
      - completa Embedded Signup
      - torna in EiC, vede numero connesso
      - apre conversazione, riceve un messaggio test, risponde

### Submission steps

1. **App Review → Permissions and Features**
2. Cerca `whatsapp_business_messaging` → "Request"
3. Compila:
   - Use case description (in italiano va bene)
   - Step-by-step di come la feature funziona nel tuo prodotto
   - Upload screencast
4. Submit → tempo medio review: **5–15 giorni lavorativi**

### Use case description (template pronto)

> **EdiliziaInCloud** è un software gestionale italiano per imprese edili.
> Tra le sue funzionalità c'è un modulo CRM che consente all'imprenditore edile
> di centralizzare la comunicazione con i propri clienti, fornitori e operai.
> Una delle integrazioni più richieste è la possibilità di leggere e rispondere
> ai messaggi WhatsApp direttamente dal gestionale, sincronizzando i contatti
> con la rubrica CRM.
>
> **Use case**: il cliente di EdiliziaInCloud (impresa edile) collega il suo
> numero WhatsApp Business al proprio account EdiliziaInCloud tramite Embedded
> Signup. Da quel momento EdiliziaInCloud riceve i messaggi via webhook e li
> mostra nell'interfaccia "Hub WhatsApp" insieme alle altre comunicazioni
> aziendali (email, chat interna). L'imprenditore può rispondere direttamente
> dall'interfaccia EdiliziaInCloud, e i messaggi inviati arrivano al destinatario
> via il suo numero WhatsApp Business.
>
> Tutta la comunicazione resta sotto il controllo del cliente impresa edile:
> EdiliziaInCloud è solo lo strumento tecnico di gestione.

---

## 5. Variabili d'ambiente necessarie

Su Supabase **Edge Functions → Manage Secrets**:

| Variable | Esempio | Note |
|---|---|---|
| `META_APP_ID` | `795702233553170` | Fallback se non in platform_settings |
| `META_APP_SECRET` | `xxxxxxxxxxxxxxx` | Fallback se non in platform_settings |
| `META_WEBHOOK_VERIFY_TOKEN` | `random-32-chars` | Usato per GET verify del webhook |
| `WHATSAPP_TOKEN_ENCRYPTION_KEY` | `base64-32-bytes` | AES-256 key per encrypt access_token |
| `INTERNAL_WORKER_KEY` | `secret-string` | **OBBLIGATORIO da v8.6.74** per whatsapp-ai-processor |
| `OPENAI_API_KEY` | `sk-...` | Per AI agent (bot operativo) |

Per generare `WHATSAPP_TOKEN_ENCRYPTION_KEY`:
```bash
openssl rand -base64 32
```

Per `INTERNAL_WORKER_KEY`:
```bash
openssl rand -hex 32
```

Per `META_WEBHOOK_VERIFY_TOKEN`:
```bash
openssl rand -hex 16
```

---

## 6. Edge functions deployate (già esistenti)

| Function | Trigger | Scopo |
|---|---|---|
| `whatsapp-embedded-config` | GET frontend | Restituisce app_id + config_id |
| `whatsapp-connect` | POST callback | Exchange code → token, subscribe webhook |
| `whatsapp-webhook` | GET verify / POST events | Riceve messaggi + status + template_status_update |
| `whatsapp-send` | POST frontend/agent | Invia text/template/media |
| `whatsapp-templates` | GET/POST/DEL | CRUD template via Graph API |
| `whatsapp-broadcast` | POST | Broadcast campaign (rispetta opt-out) |
| `whatsapp-status` | POST | Sync quality rating + tier su DB |
| `whatsapp-ai-processor` | POST interno | AI agent (tool calling 3 iter) |
| `whatsapp-ai-recovery` | Cron 5min | Retry messaggi stuck |
| `whatsapp-identity-router` | POST | Match phone → operaio/titolare/contatto |
| `whatsapp-operational-reminders` | Cron giornaliero | Reminder rapportino operai |

---

## 7. Testing pre-go-live

### Test 1 — Verifica webhook GET
```bash
curl -X GET 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=12345'
# Atteso: 200 con body "12345"
```

### Test 2 — Embedded Signup (con il tuo Demo Azienda + tuo numero test)
1. In EiC, login come admin Demo Azienda
2. `/azienda/impostazioni/whatsapp` → "Connetti"
3. Completa flow → verifica che riga compaia in `ai_whatsapp_numbers`

### Test 3 — Invio messaggio test
1. Aggiungi il tuo numero come tester nell'app Meta
2. Invia un messaggio da WhatsApp al numero collegato
3. Verifica:
   - Riga in `whatsapp_messages` (inbound)
   - Riga in `messaging_messages` (UI admin)
   - Risposta automatica AI se `bot_enabled=true` + `ai_auto_process=true`

### Test 4 — Template status webhook
1. Crea un template dall'app Meta (es. nome "test_template")
2. Verifica log in `wa_routing_errors` con `error_kind = "template_status_update"`
3. Una volta approvato da Meta, deve arrivare un secondo log con `event=APPROVED`

---

## 8. Gap noti (da chiudere prima del go-live commerciale)

| Gap | Severity | Tracked |
|---|---|---|
| Token long-lived (60d) + refresh cron mancante | 🟡 Medio | Non urgente, OAuth user token dura 60d |
| Encryption key rotation | 🟡 Medio | `decryptMaybeEncrypted` accetta plain (debito tecnico) |
| Rate limit per tier (1K/10K/100K/Unlimited) | 🟡 Medio | Broadcast usa rate fisso 50/s |
| Segment `pipeline` in broadcast | 🟢 Basso | Esplicitamente disabilitato, va collegato a marketing_pipelines |
| Pre-approved templates pack | 🟢 Basso | Onboarding più smooth se EiC crea 3-4 template base automaticamente |
| `whatsapp_sessions` cleanup orfane | 🟢 Basso | State machine con vecchie session bloccate |
| Broadcast credit deduction atomic | 🟡 Medio | Se function timeout a metà, divergenza sent/crediti |
| HMAC log payload sensibile | 🟢 Basso | `payload_excerpt` 500 char nei log rejection |

---

## 9. Risorse Meta

- **WhatsApp Cloud API**: https://developers.facebook.com/docs/whatsapp/cloud-api
- **Embedded Signup**: https://developers.facebook.com/docs/whatsapp/embedded-signup
- **Pricing 2026**: https://developers.facebook.com/docs/whatsapp/pricing
- **App Review**: https://developers.facebook.com/docs/development/release/app-review
- **Postman Collection**: https://github.com/fbsamples/WhatsApp-Business-Platform-Postman-Collection
