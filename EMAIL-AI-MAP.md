# EMAIL-AI-MAP — Mappa reale del sistema email
> Generato da MP-EMAIL-AI-00 il 2026-05-29. Fonte: ispezione del repo + DB prod (project rsbrguhkodgnqfomrevo).
> MP-EMAIL-AI-01 GIÀ IMPLEMENTATO + applicato in prod (migration `20270528160000_email_ai_cascade_l1`).

---

## ⚠️ ISTRUZIONE VINCOLANTE PER GLI SPRINT SUCCESSIVI (MP-02..05)

> Prima di scrivere qualsiasi codice, **LEGGI questo file**.
> Sostituisci ogni nome ipotizzato nell'MP con il nome reale qui mappato.
> Se una struttura risulta **GIÀ ESISTENTE**, NON ricrearla: estendila (ALTER ... IF NOT EXISTS).
> Se una voce è **NON TROVATO**, allora quella struttura va creata ex novo, seguendo le convenzioni del §5.
> In caso di ambiguità segnalata al §6, fermati e chiedi a Florin.

---

## 1. Dizionario di traduzione (nome ipotizzato negli MP → nome reale)

| Negli MP | Nel repo reale | Evidenza |
|---|---|---|
| `emails` | **`public.email_inbox`** | `supabase/migrations/20260510030000_email_triage_inbox.sql` |
| `mittenti_noti` | **`public.mittenti_noti`** ✅ (creato MP-01) | `supabase/migrations/20270528160000_email_ai_cascade_l1.sql` |
| `caselle_email` | **`public.email_oauth_connections`** | `email_inbox.oauth_connection_id` FK → questa |
| `azienda_id` | **`company_id`** | ovunque (`email_inbox.company_id`, RLS via `get_effective_company_id()`) |
| `utenti` | **`public.profiles`** (+ `auth.users`) | `email_inbox.user_id` → `auth.users`, `matched_contact_id` → `profiles` |
| `categoria` | **`email_inbox.categoria`** (enum `email_categoria_v2`) ✅ | MP-01 migration. Legacy parallelo: `ai_category` (text) |
| `entita_id` | **`email_inbox.entita_id`** (uuid, FK soft) ✅ | MP-01 migration |
| `entita_tipo` | **`email_inbox.entita_tipo`** (`cliente`\|`fornitore`\|`operaio`\|`opportunita`\|`ordine`) ✅ | MP-01 migration |
| `classificato_da` | **`email_inbox.classificato_da`** (`regola`\|`embedding`\|`haiku`\|`manuale`) ✅ | MP-01 migration |
| `da_rivedere` | **`email_inbox.da_rivedere`** (bool) ✅ | MP-01 migration |
| `confidenza` | **`email_inbox.confidenza`** (numeric 0..1) ✅ | MP-01 migration |
| `headers` (SMTP) | **`email_inbox.headers`** (JSONB) ✅ | MP-01 migration + patch `email-poll-inbox` |
| `(funzione classif.)` | **`email-ai-l1-classify`** (L1) + `email-ai-l3-batch` (L3) + `email-triage-ai` (legacy) | `supabase/functions/` |
| `(motore bozze L4)` | **`email-ai-l4-draft`** (esiste, DA UPGRADARE per MP-02) | `supabase/functions/email-ai-l4-draft/` |
| CRM `clienti` | **NON TROVATO come tabella** — gestione via RPC `get_customers_paginated`. La tabella `customers` NON esiste in prod (verificato 2026-05-28). | — |
| CRM `fornitori` | **`public.suppliers`** (col `name`, `email`, `phone`) | confermato via `information_schema` |
| CRM `operai` | **`public.employees`** (col `first_name`+`last_name`, NO `name`; `email`, `phone`, `area`) | confermato via `information_schema` |
| `email_categoria` (enum) | **`public.email_categoria_v2`** (13 valori) ✅ | MP-01 migration |

### Enum `email_categoria_v2` (valori reali)
`cliente, fornitore, operaio, preventivo, fattura, opportunita, supporto, pratica, newsletter, social, notifica, spam, altro`

### Colonne email_inbox complete (verificate da `information_schema`)
`id, company_id, user_id, oauth_connection_id, message_id, provider_message_id, provider_thread_id, from_email, from_name, to_email, cc_emails, bcc_emails, subject, received_at, raw_text, raw_html, attachments(jsonb), in_reply_to, references_ids(text[]), thread_id, folder_id, mailbox_folder, is_read, is_starred, is_archived, is_trashed, status, matched_contact_id(→profiles), matched_order_id(→orders), ai_category, ai_priority, ai_summary, ai_extracted, ai_suggested_action, ai_action_proposal_id, ai_processed_at, ai_error, created_at, updated_at` + **MP-01 add**: `categoria, entita_tipo, entita_id, confidenza, classificato_da, da_rivedere, headers, classificato_at`

---

## 2. Stato della cascata MP-01 (cosa è implementato davvero)

| Livello | Stato | Dove | Note |
|---|---|---|---|
| **L0 sync** | ✅ Implementato | `email-poll-inbox` (Gmail + Outlook) | Patch MP-01: salva `headers` JSONB (16 header L1-rilevanti). Wire `queueL1Cascade` dopo poll. **DA RIDEPLOYARE** (codice in main, edge function live = vecchia) |
| **L1 regole** | ✅ Implementato | `email-ai-l1-classify` + `src/lib/email-ai/classifier.ts` + `_shared/email-ai-cascade.ts` | cache mittenti_noti → match CRM (suppliers/employees) → header (PEC/social/noreply/List-Unsub) → 14 regex. Hit rate fixture 93.8% |
| **L2 embedding** | ❌ NON implementato (SKIP v1 per MP-01) | — | **MP-04 lo introduce** (pgvector) |
| **L3 Haiku batch** | ✅ Codice scritto | `email-ai-l3-batch` (Haiku 4.5, batch 18, prompt cache) | **NON ancora deployato** in Supabase (solo in repo) |
| **L4 bozze** | ⚠️ Versione base | `email-ai-l4-draft` (Sonnet 4.5, ritorna `{subject, body}`) | **MP-02 UPGRADE**: deve ritornare `{oggetto, varianti[Secca,Diplomatica], dati_mancanti[]}`. NON ancora deployato |
| **Feedback loop** | ⚠️ Parziale | RPC `reclassify_email_manuale` + `upsert_mittente_noto` | **MP-03 completa**: audit table, metriche giorno, blacklist, dashboard, 5 eventi |

### Deploy status edge functions (prod)
- `email-ai-l1-classify`: ✅ deployed v1 ACTIVE
- `send-error-ticket`: ✅ deployed v1 ACTIVE
- `email-ai-l3-batch`: ⏳ in repo, NON deployato
- `email-ai-l4-draft`: ⏳ in repo, NON deployato
- `email-poll-inbox`: ⏳ patch in repo (headers + L1 wire), live = versione pre-patch

---

## 3. Header SMTP e thread

- **Message-ID**: `email_inbox.message_id` (text) ✅
- **In-Reply-To**: `email_inbox.in_reply_to` (text) ✅
- **References**: `email_inbox.references_ids` (text[]) ✅
- **provider_thread_id**: `email_inbox.provider_thread_id` (Gmail threadId nativo) ✅
- **Header grezzi L1**: `email_inbox.headers` (JSONB) — popolato dal poller patchato (list-unsubscribe, precedence, auto-submitted, ecc.)
- **Concetto di thread ESISTENTE**: ✅ `email_inbox.thread_id` (uuid) + tabella `email_threads` (creata in `20260510100000_email_client_foundations.sql`) + RPC `email-thread-resolver`. **MP-04 deve verificare se riusare `email_threads` esistente o creare `email_thread` aziendale nuovo** → vedi §6 ambiguità.

---

## 4. Frontend email

- **Percorso modulo**: `src/pages/azienda/email/`
  - `EmailLayout.tsx` (container, gestisce compose dialog)
  - `EmailClientPage.tsx`
  - `components/EmailList.tsx` (lista thread, usa `ai_category` per badge)
  - `components/EmailViewer.tsx` (dettaglio thread, ha bottone "Rispondi con AI" → L4)
  - `components/EmailComposeDialog.tsx` (ha `ComposeContext.initialBody` per bozze AI)
  - `components/EmailSidebar.tsx`, `EmailAiCommandCenter.tsx`, `EmailSearchBar.tsx`
- **Categoria mostrata oggi**: badge in `EmailList` riga (`thread.ai_category` + predictive fallback). Componente nuovo MP-01: `src/components/email-ai/CategoriaBadge.tsx` (gestisce categoria + ai_category legacy)
- **Dove mostrare Regole di smistamento (MP-05)**: settings email. Path candidato: nuova tab in `src/pages/azienda/email/` o `src/pages/azienda/settings/`. Da decidere — vedi §6.
- **Azioni utente email oggi**: `EmailViewer` action bar (reply/replyAll/forward/archive/star/trash). Nuovo MP-01: `CategoriaSelector.tsx` (sposta categoria → RPC `reclassify_email_manuale`).
- **Hook AI**: `src/lib/email-ai/hooks.ts` (useGenerateAiDraft, useReclassifyEmail, useL1Backfill, useL3BatchClassify)

---

## 5. Convenzioni di progetto

- **Lingua naming**: MISTO. DB tabelle/colonne core in **inglese** (`email_inbox`, `company_id`, `from_email`) MA le strutture MP-01 nuove in **italiano** (`mittenti_noti`, `categoria`, `entita_tipo`, `classificato_da`). **Per MP 02-05: continua in italiano per le NUOVE strutture email-AI** (coerenza con MP-01), inglese se estendi tabelle esistenti.
- **Case**: `snake_case` per DB/SQL, `camelCase` per TS.
- **Edge Functions**: Deno, pattern `supabase/functions/<nome>/index.ts` + import da `../_shared/`. CORS via `getCorsHeaders(req)` da `_shared/headers.ts`. Auth: Bearer JWT o `x-cron-secret` (env `PROACTIVE_CRON_SECRET`).
- **AI**: Anthropic diretto via `fetch("https://api.anthropic.com/v1/messages")` con `ANTHROPIC_API_KEY`. Prompt caching via `cache_control: {type:"ephemeral"}` sul blocco system. Modelli: `claude-haiku-4-5` (classif/parsing), `claude-sonnet-4-5` (bozze/sintesi). Esiste anche `_shared/aiRouter.ts` (OpenRouter) per altri usi.
- **Embedding** (per MP-04): esiste già infra `_shared/brainEmbed.ts` + `brainEmbedMultilang.ts` + pgvector (usato dal "Cervello AI"). RIUSARE questa, non reinventare.
- **Secrets**: Supabase Edge Function secrets. Presenti: `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `RESEND_API_KEY`, `PROACTIVE_CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.
- **UI lib**: shadcn/ui (Radix) + Tailwind. Componenti in `src/components/ui/`. Toast: `sonner`. Icone: `lucide-react`.
- **RLS pattern**: `company_id = public.get_effective_company_id()` + service_role bypass + super_admin bypass via `has_role(auth.uid(), 'super_admin')`.
- **Migrazioni**: `supabase/migrations/<timestamp>_<nome>.sql`. Naming timestamp `YYYYMMDDHHMMSS`. Idempotenti (IF NOT EXISTS).

---

## 6. Rischi e ambiguità (da confermare con Florin)

1. **Tabella clienti CRM non esiste**: la "Lista Clienti" usa RPC `get_customers_paginated`, NON una tabella `customers` diretta. Conseguenza: L1 match CRM clienti è DISABILITATO (solo suppliers + employees funzionano). I clienti vengono classificati via L3 Haiku + feedback manuale. **Decisione**: serve una tabella clienti unificata? O la fonte clienti è `profiles` con role `customer`? Da chiarire per MP-03/04/05 (collega_entita cliente).

2. **Doppio sistema thread**: esiste `email_threads` (MP foundations 2026-05) + `email_inbox.thread_id` + RPC `email-thread-resolver` (raggruppa per Message-ID). MP-04 propone `email_thread` (aziendale, multi-casella). **Decisione**: estendere `email_threads` esistente o creare nuovo livello "thread aziendale" sopra? Raccomando ESTENDERE l'esistente con colonne MP-04 (thread_key, partecipanti_emails, oggetto_canonico) per non duplicare.

3. **Doppio sistema categoria**: `ai_category` (legacy text, popolato da `email-triage-ai`) gira ANCORA in parallelo a `categoria` (enum nuovo MP-01). Doppio costo AI sulle email processate da entrambi. **Decisione**: quando deprecare `email-triage-ai`? Raccomando: dopo 30gg di L1+L3 stabili, migrate `ai_category`→`categoria` + spegnere triage-ai.

4. **Ruoli aziendali (MP-04)**: l'enum `ruolo_aziendale` proposto (ceo/admin/reparto/operaio/readonly) NON esiste. Esiste `app_role` (super_admin, company_admin, ecc.) + `profiles.role`. **Decisione**: mappare i ruoli MP-04 sui ruoli esistenti o aggiungere campo `reparto` + visibilità? Da chiarire prima di MP-04.

---

## 7. Raccomandazioni di adattamento per gli MP successivi

- **MP-02** (reply L4): UPGRADARE `email-ai-l4-draft` esistente (non crearne uno nuovo). Cambiare output da `{subject, body}` a `{oggetto, varianti[], dati_mancanti[]}`. Aggiornare `useGenerateAiDraft` + `AiDraftButton` + `EmailComposeDialog` (selettore variante). Categoria cliente: niente contesto CRM (tabella assente) → bozza generica + dati_mancanti.

- **MP-03** (learning): `mittenti_noti` ESISTE già con `categoria/entita_tipo/entita_id/fonte/hit_count`. AGGIUNGERE `confidenza, conferme_count, ultima_conferma_at, is_blacklist`. RPC `reclassify_email_manuale` ESISTE → estenderla con audit. CREARE `email_correzioni` + `email_metriche_giorno`. Dashboard usa `email_ai_cascade_stats()` già esistente come base.

- **MP-04** (grafo): RIUSARE `email_threads` esistente (estendere, non duplicare). RIUSARE infra embedding `_shared/brainEmbed*`. Mappare ruoli su `profiles.role` esistente + nuovo campo `reparto`. Sprint più grosso, ultimo.

- **MP-05** (regole): `email_regole` è NON TROVATO → crearla ex-novo. Valutatore regole va inserito in `_shared/email-ai-cascade.ts` PRIMA di `lookupMittenteNoto` (e nel gemello client `src/lib/email-ai/classifier.ts`). UI nuova tab settings email.

---

## STATO SVILUPPO SAGA (aggiornato live)
- [x] MP-00 — questa mappa
- [ ] MP-02 — reply engine upgrade
- [ ] MP-03 — learning loop + dashboard
- [ ] MP-05 — rules engine
- [ ] MP-04 — graph + semantic search
