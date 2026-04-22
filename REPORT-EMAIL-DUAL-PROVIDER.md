# Report — Email Dual-Provider (branch `feature/email-dual-provider`)

**Data**: 2026-04-22
**Masterprompt**: `MASTERPROMPT-EMAIL-DUAL-PROVIDER.docx`
**Scope**: 11 fasi completate. tsc 0 errori. vitest 420/420 verdi.

---

## Sintesi architetturale

| Stream | Provider default | Sottodominio fallback EiC | Custom domain supportato |
|---|---|---|---|
| Transactional | **Resend** | `notifiche.ediliziaincloud.it` | Resend + SendGrid (dual-verify) |
| Marketing | **Elastic Email** | `mail.ediliziaincloud.it` | Elastic Email whitelabel |
| Legacy fallback | SendGrid | — | — |

Ogni azienda ha un record in `company_email_preferences` con branding +
identità mittente + scelta dominio per stream. Il mittente effettivo è
risolto run-time da `_shared/resolveSender.ts`.

```
 Caller (28 Edge Functions)
   │
   ├── Legacy path:      sendEmailUnified(args) → lookup dominio legacy
   └── New path:         send-transactional-v2 → renderTemplate + resolveSender
                                               → sendEmailUnified(senderOverride)
   │
   ▼
 Provider dispatch (Resend / Elastic / SendGrid / Brevo / Mailgun)
   │
   ▼
 email_delivery_log (per-recipient row)  +  email_logs (legacy per-campaign)
   │
   ▼
 email-provider-webhook (tutti i provider) → events → suppressions + refund
```

---

## Tabella FASE vs stato

| Fase | Descrizione | Stato | File chiave |
|---|---|---|---|
| 1 | Migrazioni estensioni `email_logs` + `email_delivery_log` | ✅ | `20260422000001_email_logs_dual_provider_extensions.sql` |
| 2 | Tabella `company_email_preferences` | ✅ | `20260422000002_company_email_preferences.sql` |
| 3 | `email_suppressions` per-company + `is_suppressed()` RPC | ✅ | `20260422000003_email_suppressions_company_scope.sql` |
| 4 | `company_email_domains` estesa con Resend | ✅ | `20260422000004_company_email_domains_resend.sql` |
| 5 | `platform_settings` default Resend + subdomain fallback | ✅ | `20260422000005_platform_email_defaults_resend.sql` |
| 6 | 7 template React Email + layout + types | ✅ | `supabase/functions/_shared/email-templates/` |
| 7 | `_shared/resolveSender.ts` + `_shared/renderTemplate.ts` | ✅ | idem |
| 8 | `manage-email-domain` estesa Resend + rate limiting | ✅ | `supabase/functions/manage-email-domain/index.ts` |
| 9 | `send-transactional-v2` + `sendEmailUnified` senderOverride | ✅ | `supabase/functions/send-transactional-v2/` |
| 10 | `email-provider-webhook` stream + scope suppression + hard/soft + refund | ✅ | `supabase/functions/email-provider-webhook/index.ts` |
| 11 | Client UI (SettingsEmailDomain, EmailPreferences, ProviderGuide, 3 admin panels) | ✅ | `src/pages/*/settings/*`, `src/components/admin/settings/*`, `src/components/email/*` |

---

## Migrazioni SQL (5, additive)

Tutte le migrazioni usano `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
`DROP CONSTRAINT IF EXISTS` → idempotenti, zero rischio downtime.

1. **`20260422000001_email_logs_dual_provider_extensions.sql`**
   - Aggiunge a `email_delivery_log`: `stream`, `provider`, `custom_domain_id`,
     `using_custom_domain`, `sender_source`.
   - Estende `email_logs` per stream-awareness.

2. **`20260422000002_company_email_preferences.sql`**
   - Nuova tabella 1:1 con `companies`. Branding colori HEX, logo URL,
     sender_name/prefix, reply-to, transactional/marketing_domain_id FK
     a `company_email_domains`, footer unsubscribe HTML custom.
   - RLS: company member legge le proprie, company_admin modifica.

3. **`20260422000003_email_suppressions_company_scope.sql`**
   - Aggiunge `company_id` (NULL = globale), `source_provider`,
     `source_event_id`, `metadata`, `email_normalized` (generated).
   - Estende CHECK reason a: `hard_bounce / spam_complaint / unsubscribe / manual / invalid / legal`.
   - UNIQUE `NULLS NOT DISTINCT (company_id, email_normalized, reason)`.
   - **Bug fix applicato**: vecchia CHECK reason consentiva `bounce|spam` ma
     `email-provider-webhook` inseriva già con quei nomi. Migrazione normalizza
     dati esistenti prima di applicare nuovo constraint.
   - Nuova RPC `is_suppressed(email, company_id)` STABLE SECURITY DEFINER
     per check rapido pre-invio.

4. **`20260422000004_company_email_domains_resend.sql`**
   - Aggiunge `resend_domain_id`, `resend_status`, `resend_region`, `resend_dns_records`.
   - Estende `is_verified` (GENERATED) a "EE marketing OK AND (SG OR Resend) transactional OK".

5. **`20260422000005_platform_email_defaults_resend.sql`**
   - Inserisce in `platform_settings`: `email.transactional.provider=resend`,
     `email.transactional.subdomain=notifiche.ediliziaincloud.it`,
     `email.marketing.subdomain=mail.ediliziaincloud.it`, default sender_name.

---

## Edge Functions

### Nuove

- **`send-transactional-v2`** — pipeline template-based
  - auth + rate limit (120/min/user, bulk-friendly)
  - `resolveSender()` → custom domain o fallback
  - `renderTemplate()` → React Email pure string templates
  - `is_suppressed()` check pre-invio (fail-open su RPC error)
  - dispatch via `sendEmailUnified` con `senderOverride`

### Estese

- **`sendEmailUnified`** — aggiunti campi metadata:
  `sender_source`, `custom_domain_id`, `using_custom_domain`
  (sia nel ramo success che provider_exception). Backward-compat intatta
  per i 28 caller esistenti (tutti i campi sono opzionali).

- **`manage-email-domain`** — aggiunta Resend `add_domain` + `verify_domain`
  + rate limit via RPC `check_email_domain_rate_limit`
  (3 add/ora/azienda, 10 verify/ora/dominio).

- **`email-provider-webhook`** — aggiunto Resend normalizer, stream detection
  da query param, scope-aware suppression (globale per hard_bounce/spam,
  per-azienda per unsubscribe), refund credito su hard bounce via
  `refund_email_credit_on_bounce` (idempotente).
  **Refactor**: logica normalizzatori estratta in `_shared/webhookNormalizers.ts`
  (pure TS zero-deps) per poter essere unit-testata.

### Condivise

- **`_shared/resolveSender.ts`** — decisione mittente per (companyId, stream).
  Tre livelli: custom_domain_verified → fallback_subdomain → platform_default.
- **`_shared/renderTemplate.ts`** — entry point che carica branding da
  `company_email_preferences` e chiama il template giusto.
- **`_shared/email-templates/`** — 7 template:
  `welcome`, `invoice-sent`, `ddt-sent`, `quote-sent`,
  `password-reset`, `invoice-due-soon`, `user-invited` + `layout.ts` + `types.ts`.
- **`_shared/webhookNormalizers.ts`** — normalizzatori cross-provider +
  `decideSuppression()` per scope.

---

## Client UI

### Company-side (`src/pages/azienda/settings/`)

- **`SettingsEmailDomain.tsx`** — refactor dual-provider (Resend + SendGrid + EE).
  Mostra badge per ciascun provider, tabella DNS con fallback TXT/CNAME/MX +
  ProviderGuideAccordion sotto quando dominio non verificato.
- **`SettingsEmailPreferences.tsx`** — form branding + identità mittente +
  scelta dominio per stream (dropdown filtrato per readiness del provider).
  Validators condivisi via `@/lib/email/preferencesValidators`.

### Company-side (`src/components/email/`)

- **`ProviderGuideAccordion.tsx`** — guida step-by-step per 5 registrar italiani
  (Aruba, Register.it, OVH, GoDaddy, Cloudflare) con adminPath, avgPropagation,
  gotchas specifici, steps, link docs ufficiali.

### SuperAdmin (`src/components/admin/settings/`)

Tutti e 3 montati come nuovi tab di `AdminSettingsEmail`:

- **`EmailDeliverabilityDashboard`** — KPI aggregati: delivery rate / bounce /
  spam complaint rate. Breakdown per stream, per provider, top 10 companies.
  Range selector 7d/30d/90d. Safety cap 50K righe.
- **`EmailSuppressionsTable`** — tabella paginata delle soppressioni con
  filtro reason (6 valori), filtro scope (globale/per-azienda/tutti),
  search email. Delete con conferma AlertDialog.
- **`EmailRateLimitsPanel`** — read-only summary dei 3 rate limit email
  (send-transactional-v2, manage-email-domain:add, :verify) +
  conteggio chiamate ultima ora da `edge_function_rate_limits`.

---

## Test (vitest — 83 nuovi, 420 totali)

| File | Tests | Copertura |
|---|---|---|
| `src/test/logic/emailDeliverability.test.ts` | 20 | `aggregateDeliveryRows`, rate%, rangeToCutoff, bucket emptyness |
| `src/test/logic/emailPreferencesValidators.test.ts` | 25 | HEX_REGEX, PREFIX_REGEX, EMAIL_REGEX, isValidLogoUrl, validatePreferences composito |
| `src/test/logic/webhookNormalizers.test.ts` | 38 | 5 provider mappers + normalizeEvents (array SG, Resend guard, Brevo, EE case-insens, MG permanent/temp) + `decideSuppression` scope logic |

**Moduli unit-testati (pure, estratti da implementazione legata a framework)**:
- `src/lib/email/deliverabilityAggregation.ts`
- `src/lib/email/preferencesValidators.ts`
- `supabase/functions/_shared/webhookNormalizers.ts`

---

## Env vars aggiornate (`.env.example`)

Nuove chiavi:
- `RESEND_API_KEY` + `RESEND_REGION=eu-west-1` (default)
- `ELASTIC_EMAIL_API_KEY` + `ELASTIC_EMAIL_ACCOUNT_EMAIL`
- `SENDGRID_SUBUSER` (per whitelabel multi-tenant)
- `BREVO_API_KEY`
- `WEBHOOK_SECRET` (validazione richieste in arrivo su email-provider-webhook)

---

## Backward compatibility — 28 caller legacy

Il dispatcher `sendEmailUnified` è retrocompatibile al 100%:
- `senderOverride` è opzionale. Senza override, segue il vecchio path
  (`custom_domain_legacy` sender_source).
- `text` è opzionale (nuovo campo per fallback plaintext).
- I 3 campi metadata aggiunti (`sender_source`, `custom_domain_id`,
  `using_custom_domain`) sono sempre presenti nel log, ma con valori
  neutri se il caller è legacy.

Tutti i 28 caller attuali continuano a funzionare senza modifiche:
`send-invoice-email`, `send-ddt-email`, `send-quote-email`,
`send-welcome-email`, `send-password-reset-email`, …

---

## Verifiche finali

### Build pulita

```bash
npx tsc --noEmit           # 0 errori
npm run test               # 420/420 verdi (23 file)
```

### Cose non coperte (fuori scope o in backlog)

- Test e2e per la pipeline `send-transactional-v2` → `email_delivery_log` →
  webhook → suppressions. Servirebbe un setup con provider mock.
  **Raccomandato**: Playwright + MSW per mock di Resend/EE API.
- Test Deno native per `resolveSender` e `renderTemplate` (hanno deps
  supabase-js). Scheletro: `deno test supabase/functions/_shared/` quando
  si aggiunge infrastruttura.
- Rigenerazione `src/integrations/supabase/types.ts` dalla CLI Supabase dopo
  aver applicato le 5 migrazioni al DB remoto. Fino ad allora i nuovi campi
  richiedono cast `as unknown as` nei componenti admin (documentato nei file).

---

## Commit note

Branch: `feature/email-dual-provider` (no upstream tracking, da pushare).

Prima del push, il branch contiene:
- 5 migrazioni
- 7 template email + 3 shared Deno modules
- 2 Edge Functions nuove + 3 estese
- 3 componenti admin nuovi + 2 componenti company nuovi
- 2 lib pure riusabili (`src/lib/email/`)
- 3 test file vitest (83 test)
- `.env.example` aggiornato

Raccomandazione commit: 1 commit atomico per l'intera FASE 11 (solo UI admin +
test + docs) sopra la base già committata delle fasi 1-10, oppure squash
su un singolo "feat(email): dual-provider architecture (Resend + EE + SG)".
