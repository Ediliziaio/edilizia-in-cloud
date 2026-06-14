# Setup motore Outreach cold — domini, caselle, invio e risposte

Guida pratica per attivare il motore di cold outreach (console `/admin/marketing`).
Obiettivo: più **domini cold dedicati**, più **caselle per dominio**, invio a volume
con **warm-up**, e **risposte** che rientrano nell'inbox unificata.

> ⚠️ **Regola d'oro:** non usare MAI il dominio principale (`ediliziaincloud.it`) per il
> cold. Usa domini *separati* dedicati: se la reputazione si rovina, non danneggi il brand.

---

## 0. Prerequisiti (una volta)

1. **Applica la migrazione** del motore:
   ```bash
   supabase db push
   ```
   Crea le tabelle `outreach_*` (pool, sequenze, coda, risposte). Finché non è applicata,
   le schede Sender pool / Sequenze / Inbox mostrano un gate "applica migrazione".

2. **Secret su Supabase** (Dashboard → Edge Functions → Secrets):
   - `PROACTIVE_CRON_SECRET` — protegge il cron `outreach-dispatch` (probabilmente già impostato).
   - `OUTREACH_INBOUND_SECRET` — protegge il webhook risposte `outreach-inbound` (scegli una stringa lunga casuale).
   - Le **chiavi del provider email per lo stream `marketing`** (SES) — vedi punto 2.

---

## 1. Domini cold (1–3 per iniziare)

- Registra domini *lookalike* del brand, es. `mail-ediliziaincloud.com`, `get-edilizia.com`,
  `edilizia-cloud.email`. Meglio `.com`/`.email`, evita di riusare il dominio del sito.
- In console: **Deliverability → Domini cold → + Dominio** (aggiungi il dominio, imposta il cap giornaliero).

---

## 2. Verifica dominio su Amazon SES

1. SES Console → **Verified identities → Create identity → Domain**.
2. SES genera i record DNS: aggiungili dal pannello del registrar/Cloudflare:
   - **DKIM** — 3 record `CNAME` (Easy DKIM).
   - **SPF** — record `TXT` su un sottodominio MAIL FROM custom (es. `mail.tuo-dominio.com`)
     con `v=spf1 include:amazonses.com -all`, più un `MX` per il MAIL FROM.
   - **DMARC** — `TXT` su `_dmarc.tuo-dominio.com`, es. `v=DMARC1; p=none; rua=mailto:dmarc@tuo-dominio.com`
     (parti con `p=none` in monitoraggio, poi `quarantine`).
3. **Esci dalla sandbox SES**: richiedi *production access* (altrimenti invii solo a indirizzi verificati).
4. Quando i badge SPF/DKIM/DMARC in **Deliverability → Domini** diventano verdi, il dominio è pronto.

> Con SES, **verificato il dominio puoi inviare da qualsiasi indirizzo** `@quel-dominio`:
> non serve creare ogni casella su SES. Le "caselle" del pool sono identità mittenti logiche.

---

## 3. Caselle mittenti + warm-up

1. In console: **Deliverability → Caselle mittenti → + Casella**.
   - Email (es. `marco@mail-ediliziaincloud.com`), provider **SES**, collega il dominio, cap target (es. 40/giorno).
2. **Warm-up** (fondamentale per non finire in spam):
   - Parti **basso**: 5 invii/giorno per casella, +5 ogni giorno, fino al target 30–40.
   - Il dispatcher rispetta automaticamente il cap effettivo: `min(target, base + giorno·step)`.
   - Più caselle = più volume distribuito. Per 1.000/giorno servono ~25–30 caselle a regime (40/casella).
3. Lo stato `warming` → `active` lo gestisci tu quando la casella è "scaldata".

---

## 4. Ricezione risposte (il pezzo "ricevi")

Le risposte devono *arrivare* al webhook `outreach-inbound`. Due strade:

**A) SES Inbound (consigliata se i domini sono su SES)**
1. Aggiungi un record **MX** del dominio → endpoint SES inbound della tua region (`inbound-smtp.<region>.amazonaws.com`).
2. SES → **Email receiving → Rule set → Create rule**: azione **SNS** (o Lambda) sul topic.
3. Il topic SNS chiama via HTTPS:
   ```
   https://<project>.supabase.co/functions/v1/outreach-inbound?secret=<OUTREACH_INBOUND_SECRET>
   ```
   - Alla prima sottoscrizione SNS, il webhook conferma automaticamente (gestisce `SubscriptionConfirmation`).

**B) Reply-to + inoltro**
- Imposta un `reply-to` che inoltra a un servizio di parsing (es. Mailgun routes / Cloudflare Email Workers)
  che fa `POST` JSON `{ from, to, subject, text }` allo stesso endpoint con l'header `x-inbound-secret`.

In entrambi i casi: alla risposta, il sistema scrive in **Inbox risposte**, lega il contatto e **ferma la sequenza**.

---

## 5. Schedula il dispatcher

Il cron `outreach-dispatch` svuota la coda rispettando warm-up e cap. Schedulalo ogni 5–10 minuti.

Con **pg_cron** (in una migrazione o SQL editor):
```sql
select cron.schedule(
  'outreach-dispatch', '*/10 * * * *',
  $$ select net.http_post(
       url := 'https://<project>.supabase.co/functions/v1/outreach-dispatch',
       headers := jsonb_build_object('x-cron-secret', '<PROACTIVE_CRON_SECRET>')
     ) $$
);
```
(oppure usa lo scheduler di Supabase / un cron esterno che chiama l'endpoint con l'header `x-cron-secret`.)

---

## 6. Checklist di attivazione

- [ ] `supabase db push` (tabelle `outreach_*`)
- [ ] Secret: `OUTREACH_INBOUND_SECRET`, `PROACTIVE_CRON_SECRET`, chiavi SES stream marketing
- [ ] 1–3 domini cold verificati su SES (SPF/DKIM/DMARC verdi), fuori dalla sandbox
- [ ] Caselle aggiunte nel pool, in warm-up
- [ ] Webhook risposte collegato (SES inbound / reply-to) → `outreach-inbound`
- [ ] Cron `outreach-dispatch` schedulato
- [ ] Suppression/blocklist popolata (clienti, concorrenti, già contattati)

---

## Buone pratiche deliverability

- **Domini separati** dal brand, warm-up lento, volumi bassi all'inizio.
- **SPF + DKIM + DMARC allineati** su ogni dominio.
- **List-Unsubscribe** e opt-out facile (già gestiti da `sendEmailUnified` per lo stream marketing).
- Monitora **bounce e lamentele**: il dispatcher mette in **auto-pausa** la casella oltre soglia.
- Rispetta sempre la **suppression** (`email_suppressions`): hard bounce, spam, disiscritti, manuali.
- B2B su P.IVA con legittimo interesse + opt-out immediato (impostazione "freddo pieno" concordata).

---

### Riferimenti tecnici

| Pezzo | Dove |
|-------|------|
| Console (5 tab) | `src/pages/admin/marketing/AdminMarketingDashboard.tsx` |
| Pool / sequenze / inbox | `src/components/admin/outreach/` |
| Dispatcher (cron) | `supabase/functions/outreach-dispatch/` (+ logica testata `_shared/outreach-dispatch-logic.ts`) |
| Ingestione risposte | `supabase/functions/outreach-inbound/` (+ `_shared/outreach-inbound-logic.ts`) |
| Email singola | `supabase/functions/outreach-send-single/` |
| Schema | `supabase/migrations/20270815000000_outreach_engine_core.sql` |
