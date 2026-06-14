# Outreach Engine — Design Spec

**Data:** 2026-06-14
**Area:** Superadmin `/admin/marketing` (email marketing, lead-scraper, CRM pipeline opportunità)
**Obiettivo:** trasformare l'area marketing superadmin nel motore quotidiano di cold outreach multi-canale (email-first, poi WhatsApp/SMS) ad alto volume — il più potente e il più semplice possibile, con il minimo attrito e il minimo rischio.

---

## 1. Obiettivi e vincoli

### Obiettivi
- Console operativa unica per fare **cold outreach a volume** (target a regime **1000+ email/giorno**) come attività quotidiana di marketing/vendita.
- **Email-first** come spina dorsale; WhatsApp e SMS come step successivi nelle stesse sequenze.
- Lavorare a **sequenze/cadenze multi-step**, non a "blast".
- Tutte le sorgenti lead confluiscono nello stesso motore: **Lead Scraper, liste importate (CSV/Excel), inbound (lead form), clienti/relazioni esistenti**.
- Massimizzare la deliverability e ridurre al minimo il rischio legale/reputazionale del freddo.

### Vincoli (scelte confermate dall'utente)
- **Invio in-house** su **Amazon SES / SMTP cold-friendly**, dentro la coda `email_outbox` esistente (no servizi esterni tipo Smartlead/Instantly).
- **Freddo pieno**: legittimo interesse B2B su P.IVA, con opt-out impeccabile.
- Riuso massimo dell'infrastruttura esistente; minimo codice nuovo e minima manutenzione.

### Non-obiettivi (YAGNI per ora)
- Niente IP dedicati gestiti a mano nella Fase 0-1 (SES shared/dedicated IP pool decisi in Fase 2 in base al volume reale).
- Niente A/B testing finché le sequenze base non sono solide (Fase 3).
- Niente reply auto-AI all'inizio: le risposte calde le lavora l'operatore (umano) nell'inbox unificata.

---

## 2. Stato attuale (cosa esiste già — da riusare)

| Pezzo | Stato | Riuso |
|---|---|---|
| Lead Scraper (6 sorgenti + AI scoring/icebreaker) | ✅ completo (`AdminLeadScraper.tsx`) | Sorgente lead primaria |
| Coda email `email_outbox` + cron `process-email-outbox` (retry, idempotency, lease) | ✅ completo | **Cuore del motore d'invio** |
| Tracking aperture/click (`email-tracking`, pixel+link, firma HMAC) | ✅ completo | Tracking sequenze |
| Webhook provider (`email-provider-webhook`) bounce/complaint/delivered | ✅ completo | Categorizzazione bounce |
| Deliverability AI (`email-ai-deliverability`) | ✅ esiste | Base per dashboard |
| Sequenze email (`email_sequenze`, `email-sequenze-tick`) + flow-builder | ✅ esiste | Modello a cadenze |
| CRM: contatti/liste/pipeline/stage/opportunità/attività | ✅ modello dati c'è | Brain CRM |
| Campagne cross-company admin (`crm_campaigns`, `send-crm-campaign`) | ✅ completo | Invio admin multi-azienda |
| SMS (Telnyx: `telnyx-send-sms`, campagne, log, webhook) | ✅ completo | Step SMS in sequenza |
| WhatsApp (Meta: `whatsapp-send`, broadcast, template, webhook) | ✅ completo | Step WA in sequenza |
| UI admin `/admin/marketing/*` | ❌ ~98% stub | **Da costruire: la console** |

**Tesi di design:** il motore è "già costruito ma smontato e senza cinture di sicurezza". Non si costruisce da zero: si **assembla in una console** e si aggiunge lo **strato sicurezza-volume**.

---

## 3. Principi architetturali

### 3.1 Corsia cold isolata dal transazionale
Il cold **non tocca mai** il dominio principale `ediliziaincloud.com` né Resend (che vieta il cold → ban account).
- Si aggiunge una colonna `lane` (`'transactional' | 'cold'`) a `email_outbox`.
- La corsia `cold` usa **domini dedicati separati**, **credenziali SES/SMTP dedicate**, **pool di mittenti** e **rate-limit aggressivi**, completamente isolati dal flusso prodotto/transazionale.
- Il cron `process-email-outbox` seleziona il mittente e applica i limiti in base alla `lane`.
- *Alternativa scartata:* coda `cold_outbox` totalmente separata → più pulita ma raddoppia il codice e la manutenzione.

### 3.2 Modello a sequenze, non a blast
L'unità di lavoro è la **cadenza multi-step**. Un contatto entra in una sequenza; il motore manda lo step giusto ogni giorno dentro i limiti del pool; **la sequenza si ferma da sola** su risposta / opt-out / bounce. Costruito sul motore sequenze/flow-builder esistente.

### 3.3 Isolamento e confini chiari
Ogni unità ha uno scopo singolo e un'interfaccia definita:
- **Sender Pool** → fornisce "il prossimo mittente valido" (rotazione + cap + warm-up).
- **Suppression** → risponde "posso contattare questo indirizzo/numero su questo canale?".
- **Sequence Engine** → decide "quale step va mandato a chi, oggi".
- **Dispatcher** (`process-email-outbox` esteso) → manda fisicamente, rispettando lane/cap.
- **Reply Inbox** → raccoglie le risposte e le lega a contatto/sequenza.
- **Operator Console** → l'unica UI quotidiana.

---

## 4. Data model (nuove tabelle + estensioni)

### Nuove tabelle
- **`outreach_sender_accounts`**: `id, lane, domain, mailbox_email, provider ('ses'|'smtp'), smtp_host, smtp_port, credential_ref (vault), daily_cap, warmup_stage, warmup_started_at, sent_today, sent_today_reset_at, health ('healthy'|'paused'|'cooldown'), bounce_rate_7d, complaint_rate_7d, last_used_at, active`.
- **`outreach_sending_domains`**: `id, domain, spf_verified, dkim_verified, dmarc_policy, status ('pending'|'warming'|'ready'|'blocked'), reputation_notes`.
- **`outreach_suppression`**: `id, channel ('email'|'sms'|'whatsapp'), value (email o telefono E.164 normalizzato), reason ('bounced_hard'|'complaint'|'unsubscribed'|'existing_customer'|'manual'), source_outbox_id, created_at`. **Indice unico (channel, value).**
- **`outreach_sequences`**: `id, name, channel_primary, steps (JSONB: [{day_offset, channel, template_ref, conditions}]), stop_on_reply (default true), stop_on_optout (default true), active`.
- **`outreach_enrollments`**: `id, sequence_id, contact_id, status ('active'|'replied'|'completed'|'stopped'|'bounced'), current_step, next_action_at, enrolled_at, stopped_reason`.
- **`outreach_replies`**: `id, contact_id, enrollment_id, sender_account_id, from_email, subject, body_plain, message_id, in_reply_to, received_at, is_handled, opportunity_id`.

### Estensioni a tabelle esistenti
- `email_outbox`: + `lane`, + `sender_account_id`, + `enrollment_id`, + `bounce_type ('hard'|'soft'|null)`, + `bounce_reason`.
- `marketing_contacts`: + `optout_email bool`, + `optout_sms bool`, + `optout_whatsapp bool`, + `is_existing_customer bool`, + `cold_status ('new'|'enrolled'|'replied'|'suppressed')`. (Manteniamo `unsubscribed` globale per retro-compatibilità ma la verità per-canale vive sui nuovi flag + `outreach_suppression`.)

*Tutte le migration in locale (no `db push` senza richiesta esplicita).*

---

## 5. I 5 mattoni di sicurezza-volume

1. **Sender Pool + rotazione**: il dispatcher, per ogni email cold, sceglie il mittente meno usato e sano dentro `daily_cap` e `warmup_stage`. Round-robin pesato sulla salute.
2. **Warm-up automatico**: ogni casella nuova ha un cap che cresce (es. 10→20→40→…/giorno su 3-4 settimane). Un job giornaliero avanza lo `warmup_stage` se i tassi sono buoni; **auto-pausa** la casella se `bounce_rate_7d` o `complaint_rate_7d` superano soglie.
3. **Suppression + opt-out per canale**: controllo **bloccante prima di ogni invio** contro `outreach_suppression` + flag `optout_*` + `is_existing_customer`. **List-Unsubscribe header + link firmato** in ogni email cold (riusa la firma HMAC esistente). Un click → riga in `outreach_suppression` + `optout_email=true`.
4. **Bounce/complaint handling**: il webhook esistente popola `bounce_type`. Hard bounce → soppressione permanente immediata. Spike → pausa casella.
5. **Inbox risposte unificata**: poll IMAP / SES inbound delle caselle cold → `outreach_replies`, legate a contatto+enrollment; la risposta **ferma la sequenza** e accende l'opportunità in pipeline.

---

## 6. Flusso end-to-end

```
Scraper / Import CSV / Inbound / Clienti
        │  (dedup → contatti unificati)
        ▼
   Segmento / Lista
        │  (arruolamento)
        ▼
   outreach_enrollments (active, next_action_at)
        │
        ▼  MOTORE GIORNALIERO (cron)
   per ogni enrollment dovuto oggi:
     1. suppression/opt-out check  ──(bloccato)──▶ stop enrollment
     2. pick sender (rotazione, dentro cap+warmup)
     3. personalizza (icebreaker AI esistente)
     4. enqueue in email_outbox (lane='cold', sender_account_id)
        │
        ▼  process-email-outbox (dispatcher)
   invio via SES/SMTP cold ──▶ tracking aperture/click
        │
        ▼  webhook provider
   delivered / bounce(hard|soft) / complaint
        │
        ▼  risposta del prospect
   outreach_replies (inbox unificata) ──▶ stop sequenza ──▶ opportunità in PIPELINE
        │
        ▼
   Dashboard Deliverability (reputazione, bounce, opt-out, volume)
```

---

## 7. Console operativa: 1 hub, 5 tab

Consolidare le ~20 pagine stub `/admin/marketing/*` in un'unica console mappata sul lavoro quotidiano:

- **🔥 Oggi (cockpit)** — cosa parte oggi, **risposte da lavorare** (priorità #1), alert deliverability/warm-up, numeri del giorno (inviate/aperte/risposte/opt-out).
- **👥 Lead & Liste** — Lead Scraper (riuso pagina esistente) + import CSV/Excel con dedup e mapping + contatti + suppression list.
- **📨 Sequenze** — crea/gestisci cadenze, arruola contatti/liste, performance per step.
- **💼 Pipeline** — kanban opportunità (le risposte calde diventano deal); riuso del componente pipeline esistente con la pipeline admin dedicata.
- **📊 Deliverability** — pool mittenti, stato warm-up per casella, reputazione domini, bounce/opt-out, volume vs capacità.

*La navigazione `/admin/marketing` diventa l'hub; le rotte stub esistenti vengono assorbite o reindirizzate ai tab.*

---

## 8. Fasi di implementazione

- **Fase 0 — pochi giorni (partire subito, piccolo volume):**
  separazione cold↔transazionale (`lane`) · suppression + opt-out per canale · 1-2 domini cold con SPF/DKIM/DMARC + warm-up avviato · console "Oggi" minima + import CSV. → si manda piccolo volume mentre i domini scaldano.
- **Fase 1 — 1-2 settimane:**
  sender pool + rotazione + rate-limit/cap · sequenze email multi-step · inbox risposte unificata · stop-on-reply/opt-out/bounce.
- **Fase 2:**
  dashboard bounce/reputazione · scaling multi-dominio/multi-casella verso 1000+/giorno · gestione IP pool SES.
- **Fase 3:**
  step WhatsApp/SMS dentro le sequenze (gated sul consenso per il misto prudente sui canali invasivi) · A/B test su subject/mittente.

---

## 9. Gestione errori e deliverability

- **Retry**: riuso del meccanismo `email_outbox` (attempts/max_attempts/lease). Soft bounce → retry con backoff; hard bounce → no retry + suppression.
- **Circuit breaker per casella**: se una casella supera la soglia bounce/complaint, `health='paused'` e il pool la salta automaticamente.
- **Quota safety**: il dispatcher non supera mai `daily_cap` per casella né il `warmup_stage`. Se il pool è esaurito per oggi, gli enrollment slittano a domani (no over-send).
- **Idempotency**: ogni step di sequenza genera un `idempotency_key` (enrollment_id + step) → mai doppio invio.
- **Osservabilità**: log per invio + metriche aggregate (per dominio/casella/sequenza) nel tab Deliverability.

---

## 10. Compliance (freddo pieno, rischio minimizzato)

- Base giuridica: legittimo interesse B2B su contatti con P.IVA.
- **Reso difendibile da:** opt-out a un click + List-Unsubscribe in **ogni** email · soppressione istantanea e permanente · **zero invii** a chi ha rifiutato/risposto negativamente/è già cliente · log completo di ogni invio (chi, quando, da quale casella).
- WhatsApp/SMS (Fase 3): step inviati **solo** a chi ha consenso o ha già risposto (i canali invasivi restano prudenti anche in postura "freddo pieno", per non incorrere in sanzioni Garante / ban Meta).
- *Nota legale:* il cold B2B email su liste scraped resta un'area contestata in Italia; questo design minimizza il rischio ma non è una consulenza legale.

---

## 11. Strategia di test

- **Unit**: sender-pool selection (rotazione/cap/warmup), suppression check, sequence-step scheduler, bounce categorization.
- **Idempotency**: doppio tick dello stesso enrollment non genera doppio invio.
- **Integrazione (staging)**: invio reale su caselle di test SES sandbox · webhook bounce/complaint simulati · verifica stop-on-reply.
- **Compliance**: ogni email cold contiene List-Unsubscribe + link firmato valido; il click sopprime davvero; nessun invio a indirizzi in suppression.
- **Carico**: il dispatcher rispetta i cap anche con migliaia di enrollment dovuti lo stesso giorno (slittamento, non over-send).

---

## 12. Rischi e domande aperte

- **Costi SES**: ~0,10 USD / 1000 email + costo domini/caselle. Da quantificare in Fase 0 col volume reale.
- **Gestione caselle**: 1000+/giorno richiede ~20-40 caselle scaldate su più domini → serve un processo (anche manuale all'inizio) per creare/verificare domini e caselle.
- **Reputazione iniziale**: i primi 30-45 giorni il volume è limitato dal warm-up; il target 1000+/giorno è un punto d'arrivo, non di partenza.
- **Rischio legale** del freddo: mitigato ma presente; valutazione finale dell'utente.

---

## 13. Correzioni post-verifica codice (2026-06-14)

Verifica sul codice reale (non sull'esplorazione iniziale, che aveva alcune imprecisioni). **L'architettura è più costruita del previsto** → meno da costruire, gap più stretti e chirurgici.

### Cosa esiste DAVVERO (e che NON va riscritto)
- **`email_outbox` NON è la coda campagne**: è l'outbox del client email personale (`user_id NOT NULL`, `oauth_connection_id`, `thread_id`, status `draft/queued/sending/sent/failed/cancelled`). → **La "corsia cold" NON va su `email_outbox`.**
- **Invio campagne admin** = `send-crm-campaign` → filtra `marketing_contacts` → loop a batch su **`sendEmailUnified`** (`_shared/`), **sincrono, senza coda con throttle nel tempo**.
- **`sendEmailUnified` ha già**: `stream: 'marketing' | 'transactional'` con **provider diversi per stream** (la separazione cold↔transazionale esiste già a livello di stream); **multi-provider con failover**; **`senderOverride`** (from + dominio espliciti) = punto d'aggancio naturale del sender pool; log per destinatario in `email_delivery_log`.
- **Suppression ESISTE**: tabella `email_suppressions` (email, email_normalized, reason: hard_bounce/spam_complaint/unsubscribe…, company_id, RLS, unique). `emailSuppression.ts` la consulta già nel percorso d'invio. → **Non si ricostruisce; si estende ai canali SMS/WhatsApp.**
- **`resolveSender`** risolve il mittente per stream: `company_email_preferences.{stream}_domain_id` → `company_email_domains` (verified+active) → fallback subdomain da `platform_settings`. → **Un dominio per stream, NON un pool rotante.**

### I gap REALI (ridefiniti)
1. **Sender POOL + rotazione** — `resolveSender` fa un solo dominio per stream; serve un pool di caselle su più domini con rotazione (via `senderOverride`). **GAP PRINCIPALE.**
2. **Warm-up per casella** (ramp cap + auto-pausa) — assente.
3. **Coda + dispatcher con throttle nel tempo** — `send-crm-campaign` è un blast sincrono a batch; per rispettare cap-per-casella e ritmo di warm-up serve coda + cron dispatcher. **GAP ARCHITETTURALE PRINCIPALE.**
4. **Opt-out per canale** — `email_suppressions` è solo email; servono flag `optout_sms/whatsapp` su `marketing_contacts` + suppression cross-canale.
5. **Inbox risposte unificata** per le caselle cold — assente.
6. **Console operativa a tab** dentro `/admin/marketing` (no nuove rotte sidebar). 

### Conseguenze sul design (sostituiscono le sezioni 3.1 / 4 / 5 dove in conflitto)
- La "corsia cold" = **stream `'marketing'`** con **provider cold-friendly** (SES) configurato per quello stream + **sender pool** iniettato via `senderOverride`. Niente colonna `lane` su `email_outbox`.
- Nuove tabelle effettive: `outreach_sender_accounts`, `outreach_sending_domains`, `outreach_sequences`, `outreach_enrollments`, `outreach_replies` + nuova **coda cold** `outreach_send_queue` (la parte che davvero manca per il throttle) + estensione `email_suppressions` (canale) e `marketing_contacts` (optout per canale).
- Vincolo UI confermato: **tab dentro le pagine esistenti**, nessuna nuova voce sidebar.
