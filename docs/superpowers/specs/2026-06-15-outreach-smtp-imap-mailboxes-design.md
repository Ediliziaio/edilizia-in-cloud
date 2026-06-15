# Outreach — caselle reali via SMTP/IMAP (per-mailbox)

Data: 2026-06-15 · Stato: approvato (Approccio A, fasi)

## Obiettivo

Trasformare il pool cold dell'Outreach Engine da "un account Elastic Email condiviso
con tanti `from`" a **mailbox reali per-casella** (Google Workspace, Outlook/M365,
SMTP dedicato), come Instantly/Smartlead. Ogni casella:

- **invia** dalla propria mailbox via **SMTP** (reputazione della mailbox vera, non solo dell'header);
- ha le **risposte lette via IMAP** (le risposte arrivano nella mailbox reale, non a un webhook centrale);
- partecipa al **warm-up reale** (le caselle si scrivono/aprono/rispondono a vicenda).

Elastic Email resta per **automazioni + email marketing tenant** (per-azienda) e come
provider **legacy** del pool cold durante la migrazione.

## Vincoli e principi

- **Pool misto**: caselle `provider='smtp'` (reali) e `provider='elastic_email'` (legacy)
  convivono; il dispatcher instrada per `provider`. Migrazione graduale, niente big-bang.
- **Sicurezza credenziali**: le password mailbox vivono **solo in Supabase Vault**; sulla
  casella c'è solo `secret_ref`. La password si inserisce dalla UI → edge function → Vault;
  non torna mai al client, non è loggata, il campo è write-only. Lettura solo da `service_role`
  via RPC `SECURITY DEFINER`.
- **Verificabilità**: le parti pure (routing, parsing IMAP, match risposta→enrollment,
  build RFC822) sono testate con vitest. Le parti di rete (SMTP/IMAP veri) si collaudano con
  **una casella reale** prima di scalare. **Non si rilascia codice SMTP/Vault non verificabile
  come "funzionante" senza il collaudo dal vivo.**
- **Sicuro da rilasciare**: il `case 'smtp'` è dormiente finché non esiste una casella SMTP →
  aggiungerlo non tocca gli invii EE esistenti.

## Primitivi già esistenti (riuso)

- `supabase/functions/_shared/imapSmtpClient.ts`:
  - `SmtpConfig {host,port,secure,username,password}`, `SmtpMessage {...}`, `smtpSend(cfg,msg) → {messageId}`
  - `buildRFC822(opts) → string` (da estendere: header custom)
  - `ImapConfig {...}`, `imapTestConnection(cfg) → bool`, `imapFetchUnreadSince(cfg,since,max) → ImapMessage[]`
- `outreach_sender_accounts`: già `provider` (include `'smtp'`), `smtp_host/port/secure/username`, `secret_ref`,
  warm-up e reputazione.
- Vault: già usato nel progetto (`vault.decrypted_secrets`).

---

## Fase 1 — invio SMTP per-casella + lettura risposte IMAP (il loop reale)

### A. Dati (migrazione `2027xxxx_outreach_mailbox_imap.sql`)
Aggiunge a `outreach_sender_accounts`:
- `imap_host text`, `imap_port int`, `imap_secure bool default true` (username IMAP = `smtp_username`/email)
- `last_imap_uid text`, `last_imap_check_at timestamptz` (polling incrementale)
- `connection_status text default 'untested'` CHECK in (`untested`,`ok`,`error`)
- `connection_error text`, `connection_checked_at timestamptz`

### B. Routing invio (`emailProvider.ts` + dispatcher)
- Estendere `SmtpMessage`/`buildRFC822` per **header custom** (così `List-Unsubscribe`,
  firma e footer disiscrizione viaggiano anche via SMTP).
- `emailProvider.ts`: nuovo `case 'smtp'` in `sendViaProvider` — costruisce `SmtpMessage`
  dagli args + header, chiama `smtpSend`, ritorna `EmailSendResult`.
- Percorso credenziali: il dispatcher, per una casella `smtp`, risolve la password via RPC
  `outreach_mailbox_secret(secret_ref)` (`SECURITY DEFINER`, solo `service_role`) e passa la
  `SmtpConfig` all'invio.
- `sendEmailUnified`: nuovo `mailboxOverride?: {smtp_host,smtp_port,smtp_secure,smtp_username,password}`.
  Se presente → instrada al `case 'smtp'` bypassando `loadProviderSettings` (EE). Resta l'unico entry point.
- **Dispatcher**: per ogni invio, se la casella assegnata ha `provider='smtp'` → costruisce
  `mailboxOverride` (con password da Vault) e invia per-casella; altrimenti → percorso EE attuale.

### C. UI (`OutreachSenderPool`)
- Il form "+ Casella" si sdoppia: **SMTP reale** vs **EE condivisa (legacy)**.
- Campi SMTP: email, `smtp_host/port/secure`, username, **password**, `imap_host/port`.
  **Preset**: "Google Workspace" (`smtp.gmail.com:465` / `imap.gmail.com:993`),
  "Outlook/M365" (`smtp.office365.com:587` / `outlook.office365.com:993`), "Personalizzato".
- Bottone **"Testa connessione"** → edge `outreach-mailbox-test` (prova SMTP+IMAP) → aggiorna
  `connection_status`/`connection_error`. Una casella SMTP diventa `active` solo dopo test `ok`.
- Badge stato connessione per casella. Password write-only (aggiorni, non rileggi).

### D. Sicurezza credenziali (Vault)
- Edge `outreach-mailbox-connect` (super_admin): riceve la password via HTTPS → `vault.create_secret`
  → salva `secret_ref` sulla casella. Non logga, non ritorna la password.
- RPC `outreach_mailbox_secret(ref text) returns text` `SECURITY DEFINER`, `GRANT EXECUTE` solo a
  `service_role`: rilegge la password da `vault.decrypted_secrets` per invio/IMAP.

### E. Lettura risposte IMAP (cron)
- Edge `outreach-imap-poll` (cron ~ogni 15 min, `x-cron-secret`): per ogni casella SMTP `active`,
  `imapFetchUnreadSince(cfg, last_imap_check_at)` → per ogni risposta:
  match contatto/enrollment (via `In-Reply-To`/`References` o indirizzo mittente) →
  **gestisci risposta** (ferma sequenza, scrivi `outreach_replies`, intent AI, reputazione)
  → aggiorna `last_imap_uid`/`last_imap_check_at`.
- **Refactor**: estrarre da `outreach-inbound` la logica comune in `_shared/outreach-reply-handler.ts`
  (`handleInboundReply(...)`) così webhook **e** IMAP condividono lo stesso "gestisci risposta".

### F. Errori / convivenza / test
- Test-connessione fallito → casella `error` + messaggio; invio SMTP fallito → retry/skip come ora;
  IMAP irraggiungibile → log + ritenta al prossimo cron (mai crash).
- Vitest (puri): build RFC822 con header, parsing/normalizzazione `ImapMessage`, match risposta→enrollment,
  estensione `SmtpMessage`. Rete (SMTP/IMAP veri) → collaudo con **una casella reale** (Google Workspace
  su dominio dedicato) prima del volume.
- Config.toml: `outreach-imap-poll` e `outreach-mailbox-test`/`-connect` con `verify_jwt` corretto
  (poll = false + `x-cron-secret`; test/connect = true, super_admin).

### Criterio di "fatto" Fase 1
1. deno check + eslint + vitest + vite build puliti;
2. una casella reale: test connessione `ok`, **invio reale** ricevuto, **risposta** letta via IMAP che
   ferma la sequenza e appare nell'inbox con intent;
3. una casella EE legacy continua a funzionare identica (pool misto verificato).

---

## Fasi successive (outline)

- **Fase 2 — warm-up reale**: le caselle del pool si scrivono/aprono/rispondono a vicenda via SMTP+IMAP
  (sostituisce la simulazione di `outreach-warmup-engage`). Riusa send+poll della Fase 1.
- **Fase 3 — OAuth Gmail + Microsoft**: connessione senza password (necessaria per M365 dove basic-auth
  è dismesso). Nuovo `auth_type` su casella (`password`|`oauth`), token in Vault, refresh.
- **Fase 4 — inbox a 2 vie**: rispondere ai prospect dall'app via SMTP della casella (`In-Reply-To`).

## Note
- Spec sorella: `docs/superpowers/specs/2026-06-14-outreach-engine-design.md`.
- Riferimenti codice: `_shared/imapSmtpClient.ts`, `_shared/emailProvider.ts`, `_shared/sendEmailUnified.ts`,
  `outreach-dispatch`, `outreach-inbound`, `OutreachSenderPool.tsx`.
