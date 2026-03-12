

# Analisi Bug e Criticita — Stato Attuale

## BUG CRITICI

### 1. `accept-admin-invite` non in config.toml → 401 garantito
La edge function `accept-admin-invite` **non ha una entry** in `supabase/config.toml`. Di default `verify_jwt = true`, ma questa funzione viene chiamata da un utente **non autenticato** (sta accettando un invito). Ogni chiamata fallira con 401 JWT validation error.

**Fix**: Aggiungere `[functions.accept-admin-invite]` con `verify_jwt = false` in config.toml.

### 2. `upsert-admin-session` non in config.toml → 0 log, 0 sessioni
Anche `upsert-admin-session` **manca da config.toml**. La funzione fa la propria verifica auth internamente ma senza `verify_jwt = false` il gateway Supabase blocca la richiesta prima che arrivi al codice. Confermato: **0 log** per questa funzione, `admin_sessions` resta vuota.

**Fix**: Aggiungere `[functions.upsert-admin-session]` con `verify_jwt = false` in config.toml.

### 3. Password card: `currentPwd` raccolto ma mai usato
In `SecurityTab.tsx` linea 165, l'utente inserisce la password attuale (`currentPwd`) ma il campo **non viene mai inviato** a `updateUser()` (linea 191). Il campo e puramente cosmetico — non verifica nulla.

**Fix**: O rimuovere il campo "Password attuale" (dato che `updateUser` richiede gia una sessione valida), oppure usarlo con `supabase.auth.signInWithPassword()` come pre-verifica.

### 4. `invite-admin` URL generation fragile
Linea 101: `supabaseUrl.replace(".supabase.co", ".lovable.app")` — questo produce un URL errato. Il supabase URL e tipo `https://guqgszwelffntrgtsycm.supabase.co` e il replace produce `https://guqgszwelffntrgtsycm.lovable.app` che **non e** l'URL dell'app (dovrebbe essere `https://edilizia-in-cloud.lovable.app`).

**Fix**: Usare la variabile `SITE_URL` come sorgente primaria. Se mancante, fallback a un URL configurabile nei platform_settings o hardcoded.

## BUG MEDI

### 5. `email_delivery_log` mai popolata
Il helper `logEmailDelivery` esiste in `_shared/email-log.ts` ma **nessuna edge function lo importa**. Zero righe nella tabella.

**Fix**: Integrare `logEmailDelivery` in `invite-admin`, `send-email-campaign`, `ticket-notify`, `send-test-email`.

### 6. `accept-admin-invite` usa `listUsers()` — performance
Linea 34: `supabaseAdmin.auth.admin.listUsers()` carica **tutti** gli utenti per trovarne uno per email. Con migliaia di utenti diventa lento.

**Fix**: Usare `supabaseAdmin.auth.admin.listUsers({ filter: email })` o tentare direttamente `createUser` e gestire l'errore "already exists".

### 7. `invite-admin` siteUrl fallback non configurato
La variabile d'ambiente `SITE_URL` probabilmente non e impostata (non appare nei secrets configurati). Questo causa il problema del punto 4.

**Fix**: Aggiungere `SITE_URL` come secret con valore `https://edilizia-in-cloud.lovable.app`.

## RIEPILOGO FIX

| # | Problema | File | Effort |
|---|----------|------|--------|
| 1 | accept-admin-invite manca da config.toml | `supabase/config.toml` | 1 riga |
| 2 | upsert-admin-session manca da config.toml | `supabase/config.toml` | 1 riga |
| 3 | currentPwd inutilizzato | `SecurityTab.tsx` | Rimuovere campo o usarlo |
| 4 | URL invito errato | `invite-admin/index.ts` | Fix siteUrl logic |
| 5 | email_delivery_log vuota | Edge functions varie | Import helper |
| 6 | listUsers() lento | `accept-admin-invite/index.ts` | Ottimizzare query |
| 7 | SITE_URL non configurato | Secrets | Aggiungere secret |

