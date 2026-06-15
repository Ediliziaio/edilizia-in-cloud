# Attivazione Outreach Engine — runbook

Stato al 2026-06-14: motore **costruito e schema live in produzione** (7 tabelle
`outreach_*` applicate). Manca solo l'**attivazione operativa** qui sotto perché
l'invio cold funzioni end-to-end. Ordine consigliato.

> Convenzione: l'outreach vive sulla **platform admin company**
> `00000000-0000-0000-0000-000000000001`. Tutte le tabelle hanno RLS
> super_admin + service_role.

---

## 0. Flusso end-to-end (come gira)

```
Import CSV → marketing_contacts
   └─ "Arruola in sequenza" (UI Sequenze) → outreach-enroll
        ├─ crea outreach_enrollments (status=active, current_step=primo step email)
        └─ accoda il 1° step → outreach_send_queue (status=queued)
   cron outreach-dispatch (ogni ~10 min, dentro finestra Lun-Ven)
        ├─ drena la coda rispettando warm-up + cap per casella
        ├─ invia via sendEmailUnified (stream marketing + sender pool)
        └─ AVANZA la cadenza: accoda lo step successivo a sent_at + delay
   risposta del lead → webhook → outreach-inbound
        ├─ scrive outreach_replies (inbox)
        └─ ferma l'iscrizione + annulla i messaggi ancora in coda (stop-on-reply)
   cron outreach-warmup (1×/giorno): le caselle si scaldano a vicenda
```

---

## 1. Provider email cold-friendly (`platform_settings`)

Il dispatcher invia via `sendEmailUnified(stream:'marketing')`, che legge il
provider da `platform_settings`. Oggi è impostato `email_marketing_provider =
elastic_email` ma **manca la API key marketing dedicata**.

Imposta (UI super-admin → Impostazioni email, oppure SQL):

| key | valore |
|-----|--------|
| `email_marketing_provider` | `elastic_email` \| `sendgrid` \| `brevo` \| `mailgun` \| `resend` |
| `email_marketing_api_key` | API key del provider scelto |
| `email_marketing_from_address` | mittente su **dominio cold dedicato** (NON ediliziaincloud.it) |
| `email_marketing_domain` | il dominio cold |

> **SES/SMTP**: `outreach_sender_accounts.provider` ammette `ses`/`smtp` ma
> `_shared/emailProvider.ts` **non li implementa ancora** (`sendViaProvider` non
> ha il `case`). Per usarli serve estendere quella funzione — vedi §8.

---

## 2. Dominio cold + DNS

Per ogni dominio in `outreach_sending_domains`:
- **SPF**: `v=spf1 include:<provider> ~all`
- **DKIM**: record fornito dal provider
- **DMARC**: `v=DMARC1; p=quarantine; rua=mailto:dmarc@<dominio>`
- **MX/inbound** (per ricevere le risposte): instrada verso SES/provider inbound
- Dopo verifica, metti `spf_verified/dkim_verified/dmarc_verified = true`.

Regola d'oro cold: dominio **separato** dal brand, 1-2 caselle per dominio,
volumi bassi all'inizio (il warm-up sale da solo).

---

## 3. Secrets edge (Supabase → Edge Functions → Secrets)

| secret | usato da | nota |
|--------|----------|------|
| `PROACTIVE_CRON_SECRET` | outreach-dispatch, outreach-warmup | stringa random lunga; deve combaciare con l'header `x-cron-secret` del cron (§4) |
| `OUTREACH_INBOUND_SECRET` | outreach-inbound | secondo random; usato come auth del webhook |
| `OPENROUTER_API_KEY` | outreach-ai-email | già presente (lo usano le altre funzioni AI) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | tutte | standard, sempre presenti |

---

## 4. Cron (pg_cron) — **oggi assenti**

Verificato: in `cron.job` non c'è nessun job outreach → la coda non verrebbe
mai drenata. Schedula due job (stesso pattern dei cron `meta-*` del progetto,
header `x-cron-secret`). **Non committare il secret in un file migration**:
eseguilo via MCP/SQL al momento dell'attivazione, sostituendo il placeholder.

```sql
-- Dispatcher: ogni 10 minuti (la finestra Lun-Ven 8-19 la applica la funzione)
select cron.schedule(
  'outreach-dispatch', '*/10 * * * *',
  $$ select net.http_post(
       url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/outreach-dispatch',
       headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','__PROACTIVE_CRON_SECRET__'),
       body := '{}'::jsonb) $$
);

-- Warm-up: una volta al giorno alle 08:10 (UTC; aggiusta per Roma)
select cron.schedule(
  'outreach-warmup', '10 8 * * 1-5',
  $$ select net.http_post(
       url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/outreach-warmup',
       headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','__PROACTIVE_CRON_SECRET__'),
       body := '{}'::jsonb) $$
);
```

Disattivare: `select cron.unschedule('outreach-dispatch');`

---

## 5. Pool caselle mittenti

Dalla UI **Deliverability** (o SQL su `outreach_sender_accounts`): aggiungi
almeno **2 caselle** `status='warming'` su un dominio verificato (il warm-up tra
caselle ha bisogno di ≥2). Il cap effettivo parte basso e cresce:
`min(daily_cap_target, warmup_base + warmup_day*warmup_step)`.

---

## 6. Webhook risposte (outreach-inbound)

Per il reply-tracking + stop-on-reply: instrada le inbound (SES receipt rule →
SNS → HTTP, oppure Mailgun routing) verso:
```
https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/outreach-inbound?secret=__OUTREACH_INBOUND_SECRET__
```
La funzione conferma da sola la subscription SNS al primo colpo.

---

## 7. Prima campagna (smoke test)

1. **Lead & Liste** → importa un CSV (o usa i contatti esistenti).
2. **Sequenze** → "Nuova sequenza" → aggiungi 1-3 step email (usa `{{first_name}}`,
   spintax `{ciao|salve}`, e per A/Z varianti separate da `===`).
3. Sul card della sequenza → **"Arruola"** → scegli target (tutti / per lista /
   per sorgente) → **Iscrivi**. (richiede `outreach-enroll` deployato)
4. Aspetta il tick del dispatcher (o invocalo a mano con l'header cron) dentro la
   finestra d'invio → controlla `outreach_send_queue.status` e l'inbox.

---

## 8. (Opzionale) Provider SES/SMTP nativo

Se vuoi spedire via Amazon SES o SMTP diretto dal pool, estendi
`supabase/functions/_shared/emailProvider.ts` → `sendViaProvider()` con un
`case 'ses':` (SigV4 verso l'endpoint SES) e/o `case 'smtp':` (riusa
`smtpSend()` di `imapSmtpClient.ts`, leggendo `smtp_host/port/secure/username` +
la password da `secret_ref`/Vault della casella). Finché non c'è, usa i provider
HTTP del §1.

---

## Deploy & migrazioni (al "vai")

- **Migrazioni da applicare** (via MCP apply_migration, SQL idempotente):
  - `20270816000000_outreach_reply_intent.sql` — colonne intent sulle risposte
- **Edge function da (ri)deployare**:
  - `outreach-enroll` (nuova) · `outreach-dispatch` (avanzamento step + finestra + gating)
  - `outreach-inbound` (bounce auto-pause + intent AI)
- L'invio cold via provider HTTP (elastic_email/sendgrid/brevo/mailgun/resend) funziona
  da subito. **SES per-casella + SMTP per-casella + IMAP warm-up** sono avanzati e
  richiedono le credenziali reali: vedi §8 e note nel report.

## Checklist rapida

- [ ] `email_marketing_api_key` impostata su un provider cold
- [ ] Dominio cold + SPF/DKIM/DMARC verificati
- [ ] `PROACTIVE_CRON_SECRET` + `OUTREACH_INBOUND_SECRET` nei secrets
- [ ] Migrazione intent applicata + function (ri)deployate
- [ ] 2 cron schedulati (dispatch + warmup)
- [ ] ≥2 caselle nel pool (`warming`)
- [ ] Webhook inbound instradato (risposte + bounce/complaint)
- [ ] Finestra d'invio configurata (tab Deliverability)
- [ ] Smoke test: 1 sequenza → arruola → invio nella finestra
