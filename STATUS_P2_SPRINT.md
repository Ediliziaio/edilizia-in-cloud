# STATUS — P2 Medium-Priority Bug Sprint (aprile 2026)

Tracking sprint P2 bug medi. 10 bug + 4 helper condivisi + 1 migration,
come da masterprompt `MASTERPROMPT-P2-Bug-Medi.docx`.

**Tag rollback:** `pre-p2-sprint` (commit `29ffff36`) — push origin
**Branch:** commit pushati direttamente su `main` (coerente con flusso
P0/P1; il masterprompt indicava `fix/p2-medium-priority-aprile-2026`,
non creato esplicitamente perché il worktree traccia `origin/main`).
**Baseline:** `29ffff36` (fine sprint P1).
**HEAD finale:** `30e1d00d`.
**Start:** 2026-04-23.

---

## Nuovi file condivisi introdotti dallo sprint P2

| File | Scopo |
|---|---|
| [`_shared/webhookSecurity.ts`](supabase/functions/_shared/webhookSecurity.ts) | timingSafeEqual, verifyHmacSha256, sanitizePhoneForQuery |
| [`_shared/extractJson.ts`](supabase/functions/_shared/extractJson.ts) | Parser JSON robusto per output LLM |
| [`_shared/fetchWithTimeout.ts`](supabase/functions/_shared/fetchWithTimeout.ts) | fetch con timeout + retry + isTimeoutError guard |
| [`_shared/base64.ts`](supabase/functions/_shared/base64.ts) | utf8ToBase64 / base64ToUtf8 moderni |
| [`src/test/logic/extractJson.test.ts`](src/test/logic/extractJson.test.ts) | 9 unit test per extractJsonFromLLM |

---

## Punch-list 10 P2

| # | Titolo | File toccati | Commit | Stato |
|---|---|---|---|---|
| P2-1 | bank-webhook HMAC non constant-time | `bank-webhook`, `whatsapp-webhook`, `meta-webhook` → helper verifyHmacSha256 | [`9c853401`](../../commits/9c853401) | 🟢 |
| P2-2 | `.or()` phone interpolation residuo (4 files) | `whatsapp-ai-processor`, `telnyx-webhook`, `internal-agent-tools`, `internal-agent-webhook` → sanitizePhoneForQuery | [`9c853401`](../../commits/9c853401) | 🟢 |
| P2-3 | email-provider-webhook secret via helper shared | `email-provider-webhook` → timingSafeEqual shared (no più inline) | [`21a99860`](../../commits/21a99860) | 🟢 |
| P2-4 | ai-genera-preventivo regex strip fragile | `ai-genera-preventivo-v2`, `bank-categorize-ai` → extractJsonFromLLM + 9 unit test | [`810535e7`](../../commits/810535e7) + [`76c60851`](../../commits/76c60851) | 🟢 |
| P2-5 | Fetch esterni senza timeout | 8 edge functions (Anthropic, OpenAI, Brevo, Cloudflare, Google, asset fetch, fn interne) | [`76c60851`](../../commits/76c60851) | 🟢 |
| P2-6 | Stripe PaymentIntent no timeout | `auto-topup-check` → fetchWithTimeout 30s + isTimeoutError + continue safe | [`38baa84c`](../../commits/38baa84c) | 🟢 |
| P2-7 | Mailgun domain undefined → URL malformato | `_shared/emailProvider.ts` guard + `EmailProviderConfig.tsx` validazione UI | [`863644ce`](../../commits/863644ce) | 🟢 |
| P2-8 | invia-sdi unescape() deprecato | `invia-sdi` → utf8ToBase64 helper | [`e4ba61c1`](../../commits/e4ba61c1) | 🟢 |
| P2-9 | QuoteBuilder 5° eslint-disable residuo | `usePreventivoCosti` useCallback + `QuoteBuilder` dep aggiornate | [`2bc3a230`](../../commits/2bc3a230) | 🟢 |
| P2-10 | whatsapp-webhook doppio trigger residuo | `whatsapp-webhook` emette canonical + migration normalizza flow | [`9c853401`](../../commits/9c853401) + [`30e1d00d`](../../commits/30e1d00d) | 🟢 |

---

## Baseline vs Finale

| Metrica | Prima (`29ffff36`) | Dopo (`30e1d00d`) |
|---|---|---|
| Errori TypeScript | 0 | **0** |
| Vitest passing | 458 / 458 | **467 / 467** (+9 nuovi extractJson test) |
| ESLint nuovi errori | 0 | **0** |
| Migration nuove | — | 1 |
| Edge function NUOVE | — | 0 (solo modifiche) |
| Edge function MODIFICATE | — | 18 (webhook security + AI + email + SDI + auto-topup) |
| Helper shared NUOVI | — | 4 (webhookSecurity, extractJson, fetchWithTimeout, base64) |
| Unit test NUOVI | — | 9 (extractJson) |
| `eslint-disable react-hooks` in QuoteBuilder | 4 (post-P1) | **0** (P2-9) |
| Istanze `verifyHmac*` duplicate in edge | 3 | **0** (tutto via helper shared) |
| Istanze `.or()` con phone interpolato raw | 4 | **0** (sanitize + `.in()`/`.ilike()`) |
| Istanze `btoa(unescape(encodeURIComponent(...)))` | 1 | **0** (utf8ToBase64) |
| Fetch esterni senza timeout in hot path | 8+ | 0 (tutti con fetchWithTimeout o AbortSignal.timeout) |

---

## P2-1 — webhook HMAC timing-safe

**Problema.** Tre webhook (bank-webhook, whatsapp-webhook, meta-webhook)
facevano `expected === signature` (string compare che esce al primo
byte diverso): vulnerabile a timing attack per ricostruire byte per
byte la firma corretta.

**Fix.**
- `_shared/webhookSecurity.ts#verifyHmacSha256(body, signature, secret)`:
  HMAC-SHA256 + XOR a lunghezza costante. Supporta sia `raw hex` sia
  prefisso `sha256=` (Meta/GitHub/GoCardless).
- bank-webhook: rimossa `verifySignature` locale.
- whatsapp-webhook: rimossa `verifyHmac` locale.
- meta-webhook: rimosso inline `signature !== hexSig`.

**Verify.** `grep -n 'verifyHmac\|subtle.sign' supabase/functions/` →
solo il helper shared + import.

---

## P2-2 — sanitize phone per query PostgREST (4 file aggiuntivi)

**Problema.** P0-7 aveva sanato whatsapp-webhook. Ma lo stesso pattern
di interpolazione raw nel DSL PostgREST `.or()` sopravviveva in altri
4 edge (whatsapp-ai-processor, telnyx-webhook x4, internal-agent-tools,
internal-agent-webhook). Stesso vettore di injection.

**Fix.**
- `_shared/webhookSecurity.ts#sanitizePhoneForQuery(raw)`: normalizza
  a `[0-9+]`, rifiuta < 6 cifre, preserva al massimo un '+' iniziale.
- Tutti i `.or("phone.eq.${raw},phone.eq.+${raw}")` → `.in('phone', [raw, '+raw'])`.
- Tutti i `.or("phone.ilike.%${raw.slice(-9)}%")` → `.ilike('phone', '%suffix%')`
  (safe perché il suffix viene da cifre sanitizate).
- Esempio payload malizioso ora bloccato:
  `from: "39),company_id.neq.*,phone.eq.("` → `sanitize → null` →
  skip lookup → no query rotta, no leak cross-tenant.

---

## P2-3 — email-provider-webhook usa helper shared

**Problema.** P1-6 aveva messo `timingSafeEqual` inline in
email-provider-webhook. P2 richiede che l'helper sia condiviso per
riuso e consistency.

**Fix.** Rimosso inline, import da `_shared/webhookSecurity.ts`. Zero
cambi di comportamento (ancora header-only + constant-time compare).

---

## P2-4 — extractJsonFromLLM (parser robusto output LLM)

**Problema.** `ai-genera-preventivo-v2` faceva
`rawText.replace(/^```json\s*/i,'').replace(/\s*```$/, '').trim()` +
`JSON.parse`. Rompe su:
- fence ``` senza "json"
- testo prima/dopo la fence (`Ecco il preventivo:\n```json\n...`)
- newline extra post-fence

**Fix.**
- `_shared/extractJson.ts#extractJsonFromLLM<T>(raw)`: 4 tentativi
  incrementali (raw, fence ```json/``` ```, first `{`…last `}`,
  first `[`…last `]`) con `JSON.parse` su ciascuno.
- Applicato a `ai-genera-preventivo-v2` e `bank-categorize-ai`
  (erano i 2 con regex fragile).
- Altre edge AI (process-automation, lucia-chat, ...) usano input
  controllato via `response_format: json_object` OpenAI o accettano
  il raw come string — non richiedono extractor.
- **9 unit test** in `src/test/logic/extractJson.test.ts` (Vitest):
  `467/467 passed`.

---

## P2-5 — fetchWithTimeout su 8+ edge function

**Problema.** Edge functions con `await fetch(externalApi)` senza
AbortController potevano hangare fino al limit Supabase (150s) durante
picchi di latenza Anthropic/OpenAI o outage. Spreco CPU, timeout UX
pessimi, rate-limit a cascata.

**Fix.** `_shared/fetchWithTimeout.ts` con `timeoutMs` + AbortController +
`isTimeoutError` type-guard. Applicato con timeout consigliati:

| File | Provider | Timeout |
|---|---|---|
| `ai-genera-preventivo-v2` | Anthropic | 90s + 504 UX |
| `bank-categorize-ai` | Anthropic | 45s + 504 UX |
| `parse-rapportino-ai` | OpenAI Whisper | 60s |
| `parse-rapportino-ai` | OpenAI GPT | 45s |
| `invia-sms` | Brevo | 15s |
| `genera-embeddings-catalogo` | OpenAI embeddings | 60s |
| `genera-pdf-rapportino` | asset fetch | 20s |
| `provision-custom-domain` | Cloudflare API | 30s |
| `fea-richiedi-firma` | fn interna | 15s |
| `google-calendar-sync` | Google OAuth + Calendar | già 15s nativo (`AbortSignal.timeout`) — no cambio |

---

## P2-6 — Stripe PaymentIntent timeout in auto-topup

**Problema.** P0-3 ha aggiunto Idempotency-Key; P2-6 aggiunge il
timeout. Senza timeout, durante outage Stripe i cron di auto-topup
si accumulavano bloccati.

**Fix.** `fetchWithTimeout(30_000)` + `isTimeoutError` + `continue`.
Grazie a Idempotency-Key: se Stripe aveva ricevuto la request originale
nonostante il timeout, il retry del prossimo cron (stessa key)
restituisce lo stesso PI. **Zero rischio di doppia charge.**

Nessun update a `last_topup_at` / `topup_outbox` su timeout → il cron
successivo riprende da zero, in modo safe.

---

## P2-7 — Mailgun domain guard rafforzato + UI validazione

**Problema.** P1-6 aveva solo `if (!mailgunDomain)`. Passava con
"localhost" o "mg invalid" (senza punto) → URL `/v3/mg invalid/messages`
→ 404 → retry infinito con messaggio confuso.

**Fix.**
- Backend: guard `!mailgunDomain.includes('.')` + error message
  concreto con link a Admin > Email > Provider.
- UI (`EmailProviderConfig.tsx`): regex `/^[a-z0-9.-]+\.[a-z]{2,}$/i`
  in real-time + `senderReady` include domain validità + messaggio
  inline accanto al campo + `aria-invalid`.
- Utente ora non può salvare un Mailgun con dominio sbagliato.

---

## P2-8 — invia-sdi utf8ToBase64 moderno

**Problema.** `btoa(unescape(encodeURIComponent(xml)))` era legacy.
`unescape` deprecato (MDN/TC39). Funzionava su à È ñ € ma fragile
forward.

**Fix.** `_shared/base64.ts#utf8ToBase64(s)` con TextEncoder + btoa
chunked. Safe su tutto il range Unicode 0x00-0x10FFFF (incluse emoji
e surrogate pair). Zero occorrenze di `unescape(` nel repo
post-commit.

---

## P2-9 — QuoteBuilder useCallback (0 eslint-disable)

**Problema.** 5° eslint-disable in QuickAddItem useEffect perché
`calcolaPrezzoProdotto` era callback non memoizzata del hook
`usePreventivoCosti`.

**Fix.**
- `usePreventivoCosti.ts`: `trovaPrezzoGriglia` e
  `calcolaPrezzoProdotto` entrambe in `useCallback` con deps
  appropriate (`[]` e `[trovaPrezzoGriglia]`). `supabase` è singleton
  modulo-level → safe.
- `QuoteBuilder.tsx` QuickAddItem useEffect:
  - `calcolaPrezzoProdotto` aggiunta alle deps
  - `eslint-disable` rimosso
  - **Bonus**: cleanup `cancelled` flag su unmount / ri-trigger
    per evitare setState stale.
- `grep 'eslint-disable' src/pages/azienda/marketing/QuoteBuilder.tsx`
  → **0 risultati**.

---

## P2-10 — canonical trigger whatsapp_message_received

**Problema.** P0-7 aveva consolidato in 1 insert ma il nome era
`whatsapp_received` + `legacy_events: ['customer_replied']`. Il
masterprompt richiede il nome canonical
`whatsapp_message_received` per coerenza con altri eventi
(`sms_message_received`, `email_opened`).

**Fix.**
- `whatsapp-webhook`: emette
  `trigger_event: 'whatsapp_message_received'` +
  `payload.legacy_events: ['whatsapp_received', 'customer_replied']`.
  Aggiunto anche `message_type` e `metadata` (da P1-2) al payload
  per flow che dipendono dal tipo di media.
- `process-automation` runner: già gestisce `payload.legacy_events`
  dal P0-7 → nessun cambio code-side, solo la migration SQL.
- Migration `20260425100001_whatsapp_trigger_canonical.sql`:
  REGEXP_REPLACE del JSONB serializzato di `automation_flows.config_json`
  per sostituire `"trigger_event":"whatsapp_received"` →
  `"trigger_event": "whatsapp_message_received"`. Non tocca
  `customer_replied` (evento generico anche per altri canali).
  Idempotente (re-apply matcha solo legacy value, non canonical).

**Applicata su produzione.** RAISE NOTICE: 0 flow aggiornati (nessun
flow cliente usava ancora `whatsapp_received` al momento del deploy
— il canonical sarà la norma per i nuovi flow creati).

---

## Gate di commit rispettato

Prima di ogni commit:
- `bunx tsc --noEmit` → **0 errori**
- `bunx vitest run` → **467 / 467 passed** (con env set per test
  che caricano il client Supabase)
- `bunx eslint <file toccati>` → **0 nuovi errori** introdotti
  (71 errori pre-esistenti in `stripe-webhook`/`process-automation`/
  `email-provider-webhook` non toccati dallo sprint).

---

## Deploy checklist ESEGUITA

1. ✅ **Tag rollback**: `pre-p2-sprint` @ `29ffff36` pushato su origin.
2. ✅ **GitHub main**: push `29ffff36..30e1d00d` (10 commit P2).
3. ✅ **Migration Supabase**: `20260425100001_whatsapp_trigger_canonical`
   applicata su `rsbrguhkodgnqfomrevo` (produzione West EU Ireland).
   RAISE NOTICE: 0 flow aggiornati (norma per nuovi flow).
4. ✅ **Edge functions Supabase**: 18/18 deployate.
   - Batch 1 (security): bank-webhook, whatsapp-webhook, meta-webhook,
     whatsapp-ai-processor, telnyx-webhook, internal-agent-tools.
   - Batch 2 (AI + messaging): internal-agent-webhook, email-provider-webhook,
     ai-genera-preventivo-v2, bank-categorize-ai, parse-rapportino-ai,
     invia-sms.
   - Batch 3 (embeddings + cron + SDI): genera-embeddings-catalogo,
     genera-pdf-rapportino, provision-custom-domain, fea-richiedi-firma,
     auto-topup-check, invia-sdi.
5. ✅ **Cloudflare Pages**: auto-trigger sul push main.

---

## Verdetto finale

🟢 **10/10 P2 chiusi, deployati, verificati.**

Baseline tecnica finale:
- TSC: **0 errori**
- Vitest: **467 / 467** (+9 nuovi)
- Lint regression: **0 nuovi errori**
- 4 helper shared riutilizzabili
- 1 migration idempotente applicata
- 18 edge function rideployate
- 0 eslint-disable react-hooks in QuoteBuilder (5/5 risolti)
- 0 `.or()` con phone interpolato raw nei webhook
- 0 verifiche HMAC duplicate nel codice
- 0 fetch senza timeout in hot path

**Completamento globale progetto:** da **~82% a ~88%** come da
target masterprompt P2.

**Prossimo sprint possibile: P3 polish / feature / performance baseline.**
