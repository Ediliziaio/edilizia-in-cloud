# OAuth Setup Guide — Edilizia in Cloud

Guida passo-passo per configurare le 6 integrazioni OAuth della piattaforma.

**Cosa NON serve:** non devi creare account separati per ogni azienda cliente. Configuri tutto UNA volta, poi ogni cliente collega il proprio Google/Microsoft con un click dall'app.

**Tempo totale stimato:** 90-120 minuti per configurare tutto + attendere approvazioni Google (1-7 giorni per Developer Token Ads).

**Ordine consigliato (dal più veloce al più lento):**

1. [Login Google + Microsoft](#1-login-google--microsoft) (10 min — funziona subito)
2. [Outlook Calendar + Email](#2-outlook-calendar--email-microsoft) (20 min — funziona subito)
3. [Google Calendar + Gmail](#3-google-calendar--gmail) (15 min — già configurato)
4. [Google My Business](#4-google-my-business) (30 min — primi 100 utenti subito)
5. [Google Ads](#5-google-ads) (30 min setup + 1-7 giorni Developer Token)
6. [Applicazione migrations al DB](#6-applicazione-migrations-al-db) (5 min)

**Project ID Supabase:** `rsbrguhkodgnqfomrevo`
**URL base Supabase:** `https://rsbrguhkodgnqfomrevo.supabase.co`

---

## 0. Prerequisiti

Prima di iniziare devi avere:

- [ ] Account Google (qualsiasi, anche personale) — per accedere a Google Cloud Console
- [ ] Account Microsoft personale o lavoro — per Azure Portal
- [ ] Accesso admin a Supabase Dashboard del progetto `rsbrguhkodgnqfomrevo`
- [ ] (Opzionale) Account Google Ads Manager (MCC) — solo se vuoi attivare Google Ads (gratis su `ads.google.com/home/tools/manager-accounts/`)

---

## 1. Login Google + Microsoft

Già nel codice, serve solo abilitare i provider in Supabase.

### 1.1 — Crea OAuth Client su Google Cloud (per Login Google)

1. Vai su https://console.cloud.google.com/
2. Crea nuovo progetto: nome **"Edilizia in Cloud Auth"** (o riusane uno esistente)
3. Pannello sinistro → **APIs & Services** → **OAuth consent screen**
4. User Type → **External** → Crea
5. Compila:
   - App name: `Edilizia in Cloud`
   - User support email: la tua
   - App logo: (opzionale, carica un PNG 120×120)
   - Application home page: `https://www.ediliziaincloud.com`
   - Privacy policy: `https://www.ediliziaincloud.com/privacy-policy/`
   - Terms of service: `https://www.ediliziaincloud.com/termini-e-condizioni/`
   - Authorized domains: `ediliziaincloud.com` e `supabase.co`
   - Developer contact: la tua email
6. Scopes → **Add or Remove Scopes** → seleziona solo `.../auth/userinfo.email` e `.../auth/userinfo.profile` per ora (gli altri li aggiungiamo dopo)
7. Test users → aggiungi la tua email per testare
8. Save and Continue → Back to Dashboard

Ora crea il client:

9. **APIs & Services** → **Credentials** → **+ Create Credentials** → **OAuth client ID**
10. Application type: **Web application**
11. Name: `EiC Login`
12. **Authorized redirect URIs** → Add URI:
    ```
    https://rsbrguhkodgnqfomrevo.supabase.co/auth/v1/callback
    ```
13. Create → si apre popup con **Client ID** e **Client Secret** → **copia entrambi** (li perdi se chiudi senza salvare)

### 1.2 — Abilita Google in Supabase

1. Vai su https://supabase.com/dashboard/project/rsbrguhkodgnqfomrevo
2. **Authentication** → **Providers** → **Google** → Toggle ON
3. Incolla:
   - **Client ID (for OAuth)**: quello che hai copiato sopra
   - **Client Secret (for OAuth)**: quello che hai copiato sopra
4. **Save**

### 1.3 — Registra App su Azure (per Login Microsoft)

1. Vai su https://portal.azure.com/
2. Cerca **"App registrations"** in alto → Apri
3. **+ New registration**
4. Compila:
   - Name: `Edilizia in Cloud`
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts** (per supportare sia 365 aziendale che outlook.com personali)
   - Redirect URI → Platform: **Web** → URL:
     ```
     https://rsbrguhkodgnqfomrevo.supabase.co/auth/v1/callback
     ```
5. **Register**
6. Nella pagina dell'app, in alto trovi:
   - **Application (client) ID** → copialo
   - **Directory (tenant) ID** → non serve per multi-tenant

Crea il secret:

7. Menu sinistro → **Certificates & secrets** → **Client secrets** → **+ New client secret**
8. Description: `EiC Production`, Expires: **24 months**
9. **Add** → **copia subito la colonna "Value"** (NON l'ID — Value è il valore vero, lo perdi se chiudi)

Aggiungi i permessi:

10. **API permissions** → **+ Add a permission** → **Microsoft Graph** → **Delegated permissions**
11. Cerca e seleziona:
    - `openid`
    - `profile`
    - `email`
    - `offline_access`
    - `User.Read`
12. **Add permissions**

### 1.4 — Abilita Azure (Microsoft) in Supabase

1. Supabase Dashboard → **Authentication** → **Providers** → **Azure** → Toggle ON
2. Incolla:
   - **Application (client) ID**: quello copiato in 1.3.6
   - **Secret Value**: il VALUE copiato in 1.3.9 (NON l'ID)
   - **Azure Tenant URL**: `https://login.microsoftonline.com/common`
3. **Save**

### 1.5 — Test

Vai su `https://www.ediliziaincloud.com/login` → dovresti vedere i bottoni Google + Microsoft. Click su Google → completi il flow → vieni rediretto nell'app loggato. Stessa cosa con Microsoft.

---

## 2. Outlook Calendar + Email Microsoft

Riuso la stessa App registration creata in [1.3](#13--registra-app-su-azure-per-login-microsoft) — aggiungiamo solo permessi e URL.

### 2.1 — Aggiungi redirect URI extra alla stessa app Azure

1. Portal Azure → App registrations → apri **Edilizia in Cloud**
2. Menu sinistro → **Authentication** → **+ Add a platform** → Web (se non c'è già) → poi sotto **Redirect URIs** → **Add URI**:
   ```
   https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/outlook-calendar-auth?action=callback
   ```
3. Aggiungi anche questo (per email OAuth che già esiste):
   ```
   https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/email-oauth-callback
   ```
4. **Save**

### 2.2 — Aggiungi permessi Calendar + Mail

1. **API permissions** → **+ Add a permission** → **Microsoft Graph** → **Delegated**
2. Cerca e seleziona:
   - `Calendars.ReadWrite`
   - `Mail.Read`
   - `Mail.ReadWrite`
   - `Mail.Send`
3. **Add permissions**
4. (Opzionale ma raccomandato) Click **Grant admin consent for [tenant]** — riduce i prompt agli utenti

### 2.3 — Aggiungi secrets a Supabase Edge Functions

1. Supabase Dashboard → **Edge Functions** → **Manage secrets** (in alto destra)
2. Aggiungi 2 secrets:
   ```
   OUTLOOK_CLIENT_ID       = <Application (client) ID dell'app Azure>
   OUTLOOK_CLIENT_SECRET   = <Secret Value dell'app Azure>
   ```
3. **Save**

> **Nota:** `OUTLOOK_CLIENT_ID` e `OUTLOOK_CLIENT_SECRET` sono usati sia per Outlook Calendar che potenzialmente per email (se l'edge function `email-oauth-start` non ha già secrets dedicati — verifica con `cat supabase/functions/email-oauth-start/index.ts` quali env vars cerca).

### 2.4 — Test

Da app aziendale:
- `/azienda/impostazioni/calendari` → tab **Collegamenti** → card "Outlook Calendar (Microsoft 365)" → Collega
- Login con account Microsoft → autorizza → popup si chiude da solo → card diventa verde
- Click "Sincronizza ora" → eventi appaiono nel DB

---

## 3. Google Calendar + Gmail

Questi erano già configurati prima del nostro lavoro. Verifica solo che i secrets siano impostati:

### 3.1 — Verifica secrets Google Calendar

Supabase Dashboard → **Edge Functions** → **Manage secrets** → cerca:

```
GOOGLE_CALENDAR_CLIENT_ID
GOOGLE_CALENDAR_CLIENT_SECRET
```

Se NON ci sono, copiali dallo stesso OAuth Client creato in [1.1](#11--crea-oauth-client-su-google-cloud-per-login-google) — OPPURE crea un OAuth client dedicato (consigliato per separazione scope):

1. Google Cloud Console → APIs & Services → **Library** → cerca "Google Calendar API" → **Enable**
2. **OAuth consent screen** → aggiungi scope:
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/calendar.events`
3. **Credentials** → **+ Create Credentials** → **OAuth client ID** → Web application
4. Name: `EiC Calendar`
5. Authorized redirect URI:
   ```
   https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/google-calendar-auth?action=callback
   ```
6. Copia Client ID + Secret → incolla in Supabase secrets sopra

### 3.2 — Gmail (collegamento email personale)

Già implementato in `email-oauth-start/callback`. Verifica nei secrets Supabase:

```
GOOGLE_OAUTH_CLIENT_ID       (o GMAIL_CLIENT_ID)
GOOGLE_OAUTH_CLIENT_SECRET   (o GMAIL_CLIENT_SECRET)
```

Se mancano, abilita su Google Cloud:
- Library → **Gmail API** → Enable
- Aggiungi scope su consent screen:
  - `https://www.googleapis.com/auth/gmail.readonly`
  - `https://www.googleapis.com/auth/gmail.modify`
  - `https://www.googleapis.com/auth/gmail.send`
- Crea OAuth client con redirect:
  ```
  https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/email-oauth-callback
  ```

---

## 4. Google My Business

### 4.1 — Abilita le APIs Google My Business

1. Google Cloud Console → **APIs & Services** → **Library**
2. Cerca e abilita (Enable) UNA PER VOLTA:
   - **My Business Account Management API**
   - **My Business Business Information API**
   - **My Business Notifications API** (opzionale)
3. **Google My Business API** (quella vecchia v4) → DA RICHIEDERE separatamente:
   - Vai su https://developers.google.com/my-business/content/prereqs
   - Compila il form "Access Request" — chiedono di descrivere uso e mostrare app/demo
   - Approvazione: 1-4 settimane di review Google
   - Senza questa, puoi listare le location ma NON leggere/rispondere alle recensioni

### 4.2 — Aggiungi scope su OAuth consent screen

1. **APIs & Services** → **OAuth consent screen** → **Edit App** → vai allo step **Scopes**
2. **Add or Remove Scopes** → cerca e aggiungi:
   - `https://www.googleapis.com/auth/business.manage`
3. **Update** → **Save and Continue**

> Questo scope è **sensitive**. Google ti chiederà di completare la "Verification" se prevedi di sforare i 100 utenti. Fino a 100 utenti l'app mostra un warning "questa app non è verificata" ma funziona.

### 4.3 — Crea OAuth client dedicato per GBP

1. **Credentials** → **+ Create Credentials** → **OAuth client ID** → Web application
2. Name: `EiC Google Business Profile`
3. Authorized redirect URIs:
   ```
   https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/gbp-oauth?action=callback
   ```
4. Create → copia Client ID + Secret

### 4.4 — Aggiungi secrets a Supabase

```
GOOGLE_BUSINESS_CLIENT_ID       = <Client ID di 4.3>
GOOGLE_BUSINESS_CLIENT_SECRET   = <Client Secret di 4.3>
```

### 4.5 — Test

Da app aziendale (deve essere un'azienda con una scheda Google Business reale):
- `/azienda/marketing/reputazione` → tab **Integrazioni** → card "Google Business Profile" → Collega
- Login Google → autorizza accesso a "Gestire la tua scheda Google Business"
- Popup si chiude → se hai più di una location, appare picker → scegli
- Click "Sincronizza ora"
- Se l'API v4 reviews non è approvata → vedrai un errore 403 (è normale, attendi approvazione)

---

## 5. Google Ads

### 5.1 — Crea Manager Account Google Ads (se non l'hai)

1. Vai su https://ads.google.com/intl/it_it/home/tools/manager-accounts/
2. Crea account Manager (MCC) — gratuito, ti serve solo come "tetto" gestionale
3. Conferma email

### 5.2 — Richiedi Developer Token (1-7 giorni di attesa)

1. Login su https://ads.google.com con il tuo Manager Account
2. In alto destra → **Tools & Settings** → **Setup** → **API Center**
3. Compila il form:
   - **Company name:** AEDIX S.r.l.
   - **Company URL:** https://www.ediliziaincloud.com
   - **Contact email:** la tua
   - **Country:** Italy
   - **Job role:** Founder / CTO
   - **Tools used:** Custom application
   - **Manage accounts:** Other (5+ accounts)
   - **API access purpose:** Sync Google Ads campaigns and insights for our SaaS clients (construction industry)
4. Submit
5. Riceverai email Google entro 1-7 giorni con il **Developer Token** approvato (livello "Basic" inizialmente, 15.000 ops/giorno)

> Mentre aspetti, puoi procedere con il resto del setup — l'OAuth funziona anche senza Developer Token, ma la sync campagne fallisce finché non ce l'hai.

### 5.3 — Abilita Google Ads API su Cloud Console

1. Google Cloud Console → **APIs & Services** → **Library**
2. Cerca **"Google Ads API"** → **Enable**

### 5.4 — Aggiungi scope su OAuth consent screen

1. **OAuth consent screen** → **Edit App** → **Scopes** → **Add or Remove Scopes**
2. Aggiungi:
   - `https://www.googleapis.com/auth/adwords`
3. Save

### 5.5 — Crea OAuth client dedicato per Google Ads

1. **Credentials** → **+ Create Credentials** → **OAuth client ID** → Web application
2. Name: `EiC Google Ads`
3. Authorized redirect URIs:
   ```
   https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/google-ads-oauth?action=callback
   ```
4. Create → copia Client ID + Secret

### 5.6 — Aggiungi secrets a Supabase

```
GOOGLE_ADS_CLIENT_ID         = <Client ID di 5.5>
GOOGLE_ADS_CLIENT_SECRET     = <Client Secret di 5.5>
GOOGLE_ADS_DEVELOPER_TOKEN   = <Developer Token email di 5.2 — quando arriva>
```

### 5.7 — Test

Da app aziendale:
- `/azienda/marketing/pubblicita` → tab **Impostazioni** → in cima card "Google Ads"
- Click "Collega Google Ads" → login con Google che ha accesso a Ads → autorizza
- Vedi picker customer → scegli quello aziendale (non manager, non test)
- Eventualmente seleziona MCC se applicabile
- Click "Sincronizza campagne" → se Developer Token è ok, vedi conteggio campagne

---

## 6. Applicazione migrations al DB

Le 3 migrations nuove sono nel repo ma vanno applicate manualmente in produzione:

### 6.1 — Apri Supabase SQL Editor

1. Supabase Dashboard → **SQL Editor** → **+ New query**

### 6.2 — Esegui in ordine queste 3 migrations

Apri uno per volta i file in `supabase/migrations/` e copia/incolla l'intero contenuto nel SQL Editor:

1. `20270527020000_google_business_profile.sql` → **Run**
2. `20270527030000_outlook_calendar.sql` → **Run**
3. `20270527040000_google_ads_oauth.sql` → **Run**

Dopo ogni Run dovresti vedere "Success. No rows returned" senza errori.

### 6.3 — Verifica tabelle create

Esegui nel SQL Editor:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE ANY(ARRAY['gbp_%', 'outlook_%', 'google_ads_%'])
ORDER BY table_name;
```

Dovresti vedere:
- `gbp_connections`
- `gbp_locations_cache`
- `gbp_reviews`
- `google_ads_campaigns`
- `google_ads_connections`
- `google_ads_customers_cache`
- `outlook_calendar_connections`
- `outlook_calendar_events`
- `outlook_calendars_cache`

---

## Checklist riassuntiva

Stampa o tieni aperta questa lista mentre configuri:

### Google Cloud Console (https://console.cloud.google.com/)

- [ ] Progetto "Edilizia in Cloud" creato
- [ ] OAuth consent screen compilata con privacy/termini/dominio
- [ ] APIs abilitate: Calendar, Gmail, My Business Account Mgmt, My Business Business Info, Google Ads
- [ ] Scope aggiunti: userinfo.email, userinfo.profile, calendar.*, gmail.*, business.manage, adwords
- [ ] OAuth Client "EiC Login" → redirect Supabase auth/v1/callback
- [ ] OAuth Client "EiC Calendar" → redirect google-calendar-auth?action=callback
- [ ] OAuth Client "EiC Google Business Profile" → redirect gbp-oauth?action=callback
- [ ] OAuth Client "EiC Google Ads" → redirect google-ads-oauth?action=callback

### Azure Portal (https://portal.azure.com/)

- [ ] App registration "Edilizia in Cloud" creata
- [ ] Multi-tenant + personal accounts abilitato
- [ ] Redirect URIs aggiunti: auth/v1/callback + outlook-calendar-auth + email-oauth-callback
- [ ] Permessi Microsoft Graph: openid, profile, email, offline_access, User.Read, Calendars.ReadWrite, Mail.Read, Mail.ReadWrite, Mail.Send
- [ ] Client secret creato (Value copiato)

### Google Ads (https://ads.google.com/)

- [ ] Manager Account creato
- [ ] Developer Token richiesto su API Center
- [ ] Email approvazione ricevuta (1-7 giorni)

### Supabase Dashboard (https://supabase.com/dashboard/project/rsbrguhkodgnqfomrevo)

**Authentication → Providers:**
- [ ] Google: enabled + Client ID/Secret incollati
- [ ] Azure: enabled + Application ID + Secret Value + Tenant URL

**Edge Functions → Manage secrets:**
- [ ] `OUTLOOK_CLIENT_ID` + `OUTLOOK_CLIENT_SECRET`
- [ ] `GOOGLE_CALENDAR_CLIENT_ID` + `GOOGLE_CALENDAR_CLIENT_SECRET`
- [ ] `GOOGLE_BUSINESS_CLIENT_ID` + `GOOGLE_BUSINESS_CLIENT_SECRET`
- [ ] `GOOGLE_ADS_CLIENT_ID` + `GOOGLE_ADS_CLIENT_SECRET` + `GOOGLE_ADS_DEVELOPER_TOKEN` (quando arriva)

**SQL Editor:**
- [ ] Migration `20270527020000_google_business_profile.sql` applicata
- [ ] Migration `20270527030000_outlook_calendar.sql` applicata
- [ ] Migration `20270527040000_google_ads_oauth.sql` applicata

### Test funzionali

- [ ] Login Google funziona su `/login`
- [ ] Login Microsoft funziona su `/login`
- [ ] Google Calendar connect funziona su `/azienda/impostazioni/calendari`
- [ ] Outlook Calendar connect funziona su `/azienda/impostazioni/calendari`
- [ ] Google Business Profile connect funziona su `/azienda/marketing/reputazione?tab=integrazioni`
- [ ] Google Ads connect funziona su `/azienda/marketing/pubblicita?tab=impostazioni`

---

## Troubleshooting comune

### "redirect_uri_mismatch" su OAuth

Il redirect URI in Google Cloud / Azure deve essere **esattamente identico** a quello che l'edge function manda. Trailing slash, http vs https, action=callback — tutto conta. Apri network tab del browser, leggi il redirect_uri nella URL OAuth, copialo letteralmente in Google Cloud Credentials.

### "Access blocked: this app's request is invalid"

Mancano scope sull'OAuth consent screen. Apri Google Cloud → OAuth consent screen → Scopes → aggiungi quello che ti chiede.

### "AADSTS90004: User not authorized to consent for application"

Su Azure, l'admin tenant non ha dato consent agli scope ma l'utente che prova non può fare consent da solo. Vai in App registrations → API permissions → **Grant admin consent for [tenant]**.

### Google Ads "PERMISSION_DENIED: Developer Token is not approved"

Sei ancora in attesa di approvazione Developer Token. Senza non puoi fare query. Aspetta email Google.

### Google Business Profile "Quota exceeded"

L'API v4 reviews ha quota ~1000/giorno/account. Le sync sono cap-pate a 500 review/sync nel codice. Se hai più recensioni di così, riduci il pageSize o aggiungi pagination.

### Vedo le mie credenziali in chiaro nel browser dev tools

Solo il **Client ID** è pubblico (è nell'URL OAuth). Il **Client Secret** non viene mai esposto al browser — sta solo nelle Edge Functions di Supabase server-side. Verifica nel network tab che il secret non compaia mai. Se compare, è un bug grave.

---

## Cosa fanno automaticamente le aziende dopo

Una volta che hai configurato tutto sopra UNA VOLTA, ogni azienda cliente:

1. Si registra/logga in EiC
2. Va nelle sezioni Settings / Marketing / Reputazione
3. Clicca "Collega [servizio]"
4. Autorizza con il SUO account Google/Microsoft
5. Tutto sincronizzato

**Tu non devi fare nulla per ogni nuova azienda.** Il sistema è multi-tenant by design.

---

## Promemoria sicurezza

- **Mai committare** i client secret nel repo
- **Mai esporre** i client secret nel frontend (`VITE_*` env vars finiscono nel bundle pubblico — usa `import.meta.env.VITE_SUPABASE_URL` solo per dati pubblici)
- **Sempre HTTPS** per tutti i redirect URI
- **Ruota** i client secret se sospetti un leak (Azure → Certificates & secrets → New, Google → Credentials → Reset secret)
- **Token utente** nel DB sono cifrati AES-GCM con `ENCRYPTION_KEY` Supabase env var — non leggibili senza la chiave
- **Audit trail**: ogni connect/disconnect lascia traccia in `last_sync_at` + `last_error` per debugging post-mortem

---

*Documento creato 2026-05-27. Aggiorna quando aggiungi nuove integrazioni.*
