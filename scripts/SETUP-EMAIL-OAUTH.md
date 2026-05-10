# Setup Email OAuth (Gmail + Outlook) — GAP 7b

Guida step-by-step per attivare il triage email native via OAuth (come fa GHL).

---

## Step 1 — Database

1. Apri Supabase Studio → SQL Editor
2. Setta la chiave di encryption (PRIMA di runnare la migration):

```sql
-- Genera con: openssl rand -hex 32
ALTER DATABASE postgres SET app.email_oauth_encryption_key = '<random_64_hex_chars>';
```

3. Incolla `scripts/apply-email-oauth.sql` nel SQL Editor → Run
4. La query di verifica in fondo deve restituire tutti `true` + `cron_job_count = 1`

---

## Step 2 — Google Cloud Console (per Gmail)

1. Vai su https://console.cloud.google.com → crea/seleziona progetto
2. Menu → APIs & Services → Library → cerca "Gmail API" → Enable
3. Menu → APIs & Services → OAuth consent screen
   - User type: **External** (a meno che tu non abbia Google Workspace)
   - App name: "EdiliziaInCloud"
   - User support email: la tua email
   - Authorized domains: `ediliziaincloud.it`
   - Scopes: aggiungi
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/gmail.modify`
     - `https://www.googleapis.com/auth/userinfo.email`
   - Test users: aggiungi le email degli admin che testeranno (in modalità "Testing"
     bastano 100 utenti)

4. Menu → APIs & Services → Credentials → Create Credentials → OAuth Client ID
   - Application type: **Web application**
   - Name: "EiC Email Triage"
   - Authorized redirect URIs:
     - `https://app.ediliziaincloud.it/azienda/impostazioni/integrazioni/email-callback`
     - `https://www.ediliziaincloud.it/azienda/impostazioni/integrazioni/email-callback`
     - `http://localhost:8080/azienda/impostazioni/integrazioni/email-callback` (dev)
   - Salva → copia **Client ID** + **Client Secret**

5. Setta env in Supabase Dashboard → Edge Functions → Secrets:
   - `GOOGLE_OAUTH_CLIENT_ID` = il client_id appena creato
   - `GOOGLE_OAUTH_CLIENT_SECRET` = il client_secret

---

## Step 3 — Microsoft Entra ID (per Outlook)

1. Vai su https://portal.azure.com → Azure Active Directory (Microsoft Entra ID)
2. Menu → App registrations → New registration
   - Name: "EdiliziaInCloud Email Triage"
   - Supported account types: **Accounts in any org dir + personal Microsoft accounts**
   - Redirect URI: **Web** →
     `https://app.ediliziaincloud.it/azienda/impostazioni/integrazioni/email-callback`
   - Register

3. Nella nuova app:
   - **Authentication** → Add platform → Web → aggiungi anche le altre redirect URI
     (www + localhost dev)
   - **Certificates & secrets** → New client secret → genera + copia il **Value**
     (NON l'ID, il VALUE — è visibile solo una volta!)
   - **API permissions** → Add a permission → Microsoft Graph → Delegated:
     - `Mail.Read`
     - `Mail.ReadWrite`
     - `User.Read`
     - `offline_access` (per refresh tokens)
   - Grant admin consent (se vuoi multi-tenant)

4. Setta env in Supabase Dashboard → Edge Functions → Secrets:
   - `MS_OAUTH_CLIENT_ID` = Application (client) ID dalla Overview dell'app
   - `MS_OAUTH_CLIENT_SECRET` = il client secret value (NON l'ID)

---

## Step 4 — Deploy edge functions

```bash
supabase functions deploy email-oauth-start --project-ref rsbrguhkodgnqfomrevo --no-verify-jwt
supabase functions deploy email-oauth-callback --project-ref rsbrguhkodgnqfomrevo --no-verify-jwt
supabase functions deploy email-poll-inbox --project-ref rsbrguhkodgnqfomrevo --no-verify-jwt
```

---

## Step 5 — Test end-to-end

1. Loggati come `company_admin` su qualsiasi azienda
2. Vai su `/azienda/impostazioni/integrazioni`
3. Vedi nuova card "Email Triage AI — Account connessi"
4. Click "Connetti Gmail" → redirect a Google → autorizza → ritorni alla callback page
5. La callback chiama edge `email-oauth-callback` che salva tokens cifrati
6. Torni alla pagina integrazioni → vedi `info@tuaazienda.it [Attivo]`
7. Aspetta 10 minuti (cron poll) o clicca "Sync ora"
8. Vai su `/azienda/email-triage` → vedi le email triagiate da AI

---

## Architettura riassunto

```
[Browser User]
   │ click "Connetti Gmail"
   ▼
[email-oauth-start] → genera URL OAuth → redirect a Google
   │
   ▼ (utente autorizza)
[Google] → redirect a /azienda/impostazioni/integrazioni/email-callback?code=...
   │
   ▼
[EmailOAuthCallbackPage] → POST a edge email-oauth-callback
   │
   ▼
[email-oauth-callback]
   1. Verifica state CSRF (user_id + iat < 10min)
   2. POST a Google /oauth2/token con code → access_token + refresh_token
   3. GET /oauth2/v2/userinfo → email_address
   4. RPC email_oauth_upsert_connection (encrypt + insert)
   ▼
[ai_oauth_connections] (tokens cifrati AES-256 via pgcrypto)

────────────────────────────────────────────────────

[pg_cron ogni 10min]
   │
   ▼
[email-poll-inbox]
   1. RPC email_oauth_list_due_for_poll → connessioni con last_synced_at > 10min
   2. Per ogni connection:
      a. RPC email_oauth_get_decrypted_tokens → access + refresh tokens
      b. Se access scaduto: refresh via /oauth2/token
      c. GET Gmail/Outlook API → email nuove (ultimi 30min)
      d. Per ogni email: POST a email-triage-ai con x-inbound-secret
   3. RPC email_oauth_mark_sync (success/error)

────────────────────────────────────────────────────

[email-triage-ai] (esistente da GAP 7)
   1. Resolve company_id via to_email
   2. Insert in email_inbox (dedup message_id)
   3. AI classify category + priority + suggest action
   4. Visibile in /azienda/email-triage
```

---

## Troubleshooting

- **Errore "GOOGLE_OAUTH_CLIENT_ID not configured"** → setta secret in Supabase Dashboard
- **Errore "app.email_oauth_encryption_key non configurata"** → step 1 mancato
- **Connessione "expired" subito dopo OAuth** → controlla che gli scopes includano
  `access_type=offline` (Google) o `offline_access` (MS) per ricevere refresh_token
- **Polling non parte** → check `SELECT * FROM cron.job WHERE jobname='email-poll-inbox'`
- **Email non arrivano in /azienda/email-triage** → check `INBOUND_EMAIL_SECRET`
  settato + matcha tra email-poll-inbox e email-triage-ai
