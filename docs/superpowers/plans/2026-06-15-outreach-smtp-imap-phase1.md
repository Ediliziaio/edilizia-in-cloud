# Outreach — caselle reali SMTP/IMAP (Fase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Far sì che ogni casella del pool cold invii dalla propria mailbox reale via SMTP e ne legga le risposte via IMAP, convivendo con le caselle Elastic Email legacy.

**Architecture:** Routing per `provider` sulla casella: `smtp` → invio per-casella con `smtpSend` (password da Vault) + risposte lette da `outreach-imap-poll` (cron IMAP); `elastic_email` → percorso EE attuale. Logica "gestisci risposta" condivisa tra webhook e IMAP. Credenziali solo in Vault, mai al client.

**Tech Stack:** Deno edge functions, Supabase (Postgres + Vault), `_shared/imapSmtpClient.ts` (SMTP/IMAP raw), React + react-query (UI), vitest (parti pure).

**Verifica:** deno check + eslint + vitest + vite build per le parti costruibili; il loop dal vivo (invio reale + risposta IMAP) si collauda con UNA casella reale dell'utente (step finale).

**Sicuro da rilasciare:** il `case 'smtp'` è dormiente finché non esiste una casella `provider='smtp'` → non tocca gli invii EE esistenti.

---

## File structure

| File | Responsabilità | Azione |
|---|---|---|
| `supabase/migrations/20270818000000_outreach_mailbox_imap.sql` | colonne IMAP/connection + RPC Vault | Create |
| `supabase/functions/_shared/imapSmtpClient.ts` | `SmtpMessage.headers` + `buildRFC822` header custom | Modify |
| `supabase/functions/_shared/emailProvider.ts` | `case 'smtp'` in `sendViaProvider` | Modify |
| `supabase/functions/_shared/sendEmailUnified.ts` | `mailboxOverride` → instrada a smtp | Modify |
| `supabase/functions/_shared/outreach-reply-handler.ts` | `handleInboundReply()` condiviso | Create |
| `supabase/functions/_shared/outreach-reply-match.ts` | match risposta→enrollment (puro) | Create |
| `supabase/functions/outreach-inbound/index.ts` | usa `handleInboundReply` | Modify |
| `supabase/functions/outreach-mailbox-connect/index.ts` | scrive password in Vault → `secret_ref` | Create |
| `supabase/functions/outreach-mailbox-test/index.ts` | test SMTP+IMAP | Create |
| `supabase/functions/outreach-imap-poll/index.ts` | cron: legge risposte IMAP per casella | Create |
| `supabase/functions/outreach-dispatch/index.ts` | routing per-provider (smtp vs EE) | Modify |
| `src/components/admin/outreach/OutreachSenderPool.tsx` | form casella SMTP + preset + test | Modify |
| `src/test/logic/outreach-reply-match.test.ts` | test match puro | Create |
| `src/test/logic/outreach-rfc822-headers.test.ts` | test header custom | Create |
| `supabase/config.toml` | entry nuove function | Modify |

---

## Task 1: Migrazione colonne IMAP/connection + RPC Vault

**Files:**
- Create: `supabase/migrations/20270818000000_outreach_mailbox_imap.sql`

- [ ] **Step 1: Scrivere la migrazione (idempotente)**

```sql
-- Caselle outreach: config IMAP + esito test connessione + lettura segreto Vault.
ALTER TABLE public.outreach_sender_accounts
  ADD COLUMN IF NOT EXISTS imap_host text,
  ADD COLUMN IF NOT EXISTS imap_port integer,
  ADD COLUMN IF NOT EXISTS imap_secure boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_imap_uid text,
  ADD COLUMN IF NOT EXISTS last_imap_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS connection_status text NOT NULL DEFAULT 'untested',
  ADD COLUMN IF NOT EXISTS connection_error text,
  ADD COLUMN IF NOT EXISTS connection_checked_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.outreach_sender_accounts
    ADD CONSTRAINT outreach_sender_conn_status_chk
    CHECK (connection_status IN ('untested','ok','error'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Legge la password della casella da Vault. Solo service_role (edge function).
CREATE OR REPLACE FUNCTION public.outreach_mailbox_secret(p_ref text)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = vault, public AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = p_ref LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.outreach_mailbox_secret(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_mailbox_secret(text) TO service_role;
```

- [ ] **Step 2: Applicare via MCP `apply_migration`** (NON `supabase db push`). Verifica colonne con `\d outreach_sender_accounts` o una select.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20270818000000_outreach_mailbox_imap.sql
git commit -m "feat(outreach): colonne IMAP/connection + RPC Vault per caselle SMTP"
```

---

## Task 2: `SmtpMessage.headers` + `buildRFC822` header custom (TDD)

**Files:**
- Modify: `supabase/functions/_shared/imapSmtpClient.ts`
- Test: `src/test/logic/outreach-rfc822-headers.test.ts`

> Nota: `buildRFC822`/`SmtpMessage` sono Deno ma importabili in vitest (come gli altri `_shared` puri). Serve solo che non importino API Deno-only a top-level (verificare: `buildRFC822` è pura).

- [ ] **Step 1: Test che fallisce**

```ts
import { describe, it, expect } from "vitest";
import { buildRFC822 } from "../../../supabase/functions/_shared/imapSmtpClient";

describe("buildRFC822 header custom", () => {
  it("include gli header passati (List-Unsubscribe)", () => {
    const raw = buildRFC822({
      from: "a@x.com", to: ["b@y.com"], subject: "ciao",
      bodyHtml: "<p>hi</p>", messageId: "<1@x.com>",
      headers: { "List-Unsubscribe": "<https://u/x>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    expect(raw).toContain("List-Unsubscribe: <https://u/x>");
    expect(raw).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
  });
});
```

- [ ] **Step 2: Run → FAIL** (`headers` non esiste su opts). `npx vitest run src/test/logic/outreach-rfc822-headers.test.ts`

- [ ] **Step 3: Implementazione minima** — aggiungere `headers?: Record<string,string>` a `SmtpMessage` e all'oggetto `opts` di `buildRFC822`; nel corpo di `buildRFC822`, dopo `Message-ID`, prima della riga vuota che separa header e body, iniettare:

```ts
  if (opts.headers) {
    for (const [k, v] of Object.entries(opts.headers)) {
      if (v != null && String(v).length) lines.push(`${escapeHeader(k)}: ${escapeHeader(String(v))}`);
    }
  }
```
E in `smtpSend`, passare `headers: msg.headers` alla chiamata interna a `buildRFC822` (verificare dove costruisce l'RFC822).

- [ ] **Step 4: Run → PASS**

- [ ] **Step 5: deno check + commit**

```bash
deno check supabase/functions/_shared/imapSmtpClient.ts
git add supabase/functions/_shared/imapSmtpClient.ts src/test/logic/outreach-rfc822-headers.test.ts
git commit -m "feat(outreach): header custom in buildRFC822/SmtpMessage (List-Unsubscribe via SMTP)"
```

---

## Task 3: `case 'smtp'` in `emailProvider.ts`

**Files:**
- Modify: `supabase/functions/_shared/emailProvider.ts`

`sendViaProvider` riceve già `provider, apiKey, req, opts`. Per `smtp` la "apiKey" non serve; servono host/port/secure/username/password. Estendere `opts` con un campo `smtp?: SmtpConfig`.

- [ ] **Step 1: aggiungere il case**

In cima: `import { smtpSend, type SmtpConfig } from "./imapSmtpClient.ts";`
In `sendViaProvider`, estendere `opts?: { ...; smtp?: SmtpConfig }`. Aggiungere:

```ts
    case "smtp": {
      if (!opts?.smtp) {
        return { ok: false, status: 500, body: { error: "Config SMTP mancante per la casella" } };
      }
      try {
        const { messageId } = await smtpSend(opts.smtp, {
          from: extractEmail(req.from),
          fromName: extractName(req.from),
          to: req.to,
          subject: req.subject,
          bodyHtml: req.html,
          bodyText: req.text ?? null,
          headers: req.headers,
        });
        return { ok: true, status: 200, body: { messageId }, providerMessageId: messageId, providerUsed: "smtp" };
      } catch (e) {
        return { ok: false, status: 502, body: { error: e instanceof Error ? e.message : String(e) }, providerUsed: "smtp" };
      }
    }
```

- [ ] **Step 2: deno check** `deno check supabase/functions/_shared/emailProvider.ts`
- [ ] **Step 3: Commit** `git commit -am "feat(outreach): case 'smtp' in sendViaProvider (invio per-casella)"`

---

## Task 4: `mailboxOverride` in `sendEmailUnified`

**Files:**
- Modify: `supabase/functions/_shared/sendEmailUnified.ts`

- [ ] **Step 1:** aggiungere a `UnifiedEmailArgs`: `mailboxOverride?: { host: string; port: number; secure: boolean; username: string; password: string }`.
- [ ] **Step 2:** in `sendEmailUnified`, quando `args.mailboxOverride` è presente: saltare `loadProviderSettings` EE; impostare `from = args.senderOverride?.from ?? settings.fromDefault`; chiamare un percorso che invia via provider `smtp` passando `opts.smtp = mailboxOverride`. Il modo più semplice e DRY: dopo aver costruito `providerHeaders`, se `mailboxOverride` presente, chiamare direttamente `sendViaProvider("smtp", "", {from, to, subject, html, text, replyTo, headers: providerHeaders}, { smtp: mailboxOverride, stream: args.stream })` invece di `sendViaProviderWithFailover`. Mantenere logging/suppression invariati (non saltarli).
- [ ] **Step 3:** deno check.
- [ ] **Step 4:** Commit `feat(outreach): mailboxOverride in sendEmailUnified → invio SMTP per-casella`.

---

## Task 5: `outreach-reply-match.ts` (puro) + test

**Files:**
- Create: `supabase/functions/_shared/outreach-reply-match.ts`
- Test: `src/test/logic/outreach-reply-match.test.ts`

Scopo: dati gli header di una risposta (`from`, `inReplyTo`, `references`) + i contatti/enrollment noti, decidere a quale enrollment/contatto appartiene.

- [ ] **Step 1: Test che fallisce**

```ts
import { describe, it, expect } from "vitest";
import { matchReplyToContact } from "../../../supabase/functions/_shared/outreach-reply-match";

describe("matchReplyToContact", () => {
  const contacts = [{ id: "c1", email: "mario@rossi.it" }, { id: "c2", email: "lucia@bianchi.it" }];
  it("match per indirizzo mittente (case-insensitive)", () => {
    expect(matchReplyToContact({ from: "Mario <MARIO@rossi.it>" }, contacts)?.id).toBe("c1");
  });
  it("nessun match → null", () => {
    expect(matchReplyToContact({ from: "x@y.com" }, contacts)).toBeNull();
  });
});
```

- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implementazione**

```ts
export interface ReplyHeaders { from: string; inReplyTo?: string | null; references?: string[] }
export interface KnownContact { id: string; email: string | null }

function emailOf(s: string): string {
  const m = s.match(/<([^>]+)>/); return (m ? m[1] : s).trim().toLowerCase();
}
export function matchReplyToContact(h: ReplyHeaders, contacts: KnownContact[]): KnownContact | null {
  const addr = emailOf(h.from || "");
  if (!addr) return null;
  return contacts.find((c) => (c.email ?? "").trim().toLowerCase() === addr) ?? null;
}
```

- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** `feat(outreach): matchReplyToContact puro + test`

---

## Task 6: `outreach-reply-handler.ts` condiviso + refactor `outreach-inbound`

**Files:**
- Create: `supabase/functions/_shared/outreach-reply-handler.ts`
- Modify: `supabase/functions/outreach-inbound/index.ts`

- [ ] **Step 1:** leggere `outreach-inbound/index.ts` ed estrarre la logica che, data una risposta (contatto, testo, subject), fa: ferma sequenza (`outreach_enrollments` → `replied`), inserisce `outreach_replies`, `classifyAndStoreIntent`, `handleDeliveryEvent`/reputazione. Spostarla in `handleInboundReply(admin, { contactId, enrollmentId, from, subject, text, messageId })`.
- [ ] **Step 2:** `outreach-inbound` chiama `handleInboundReply` (stesso comportamento). deno check.
- [ ] **Step 3:** Commit `refactor(outreach): handleInboundReply condiviso (webhook + futuro IMAP)`.

> Niente test rete; la correttezza si verifica perché `outreach-inbound` mantiene lo stesso output. Le parti pure (match, intent) sono già testate.

---

## Task 7: edge `outreach-mailbox-connect` (password → Vault)

**Files:**
- Create: `supabase/functions/outreach-mailbox-connect/index.ts`

super_admin. Body: `{ sender_account_id, password }`. Scrive il secret in Vault e salva `secret_ref` sulla casella.

- [ ] **Step 1:** implementare:
  - `requireAuth` + `requireRole(['super_admin'])`.
  - `ref = "outreach_mbx_" + sender_account_id`.
  - scrivere il secret: `await admin.rpc('vault_create_or_update_secret', { p_name: ref, p_secret: password })` — **se la RPC non esiste**, crearla nella migrazione Task 1 (wrapper `SECURITY DEFINER` su `vault.create_secret`/update). Aggiornare la casella: `update outreach_sender_accounts set secret_ref = ref where id = sender_account_id`.
  - rispondere `{ ok: true }`. **Mai** loggare/ritornare la password.
- [ ] **Step 2:** estendere la migrazione Task 1 con la RPC di scrittura:

```sql
CREATE OR REPLACE FUNCTION public.outreach_mailbox_set_secret(p_name text, p_secret text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = vault, public AS $$
DECLARE existing uuid;
BEGIN
  SELECT id INTO existing FROM vault.secrets WHERE name = p_name LIMIT 1;
  IF existing IS NULL THEN PERFORM vault.create_secret(p_secret, p_name);
  ELSE PERFORM vault.update_secret(existing, p_secret); END IF;
END $$;
REVOKE ALL ON FUNCTION public.outreach_mailbox_set_secret(text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_mailbox_set_secret(text,text) TO service_role;
```
(la edge chiama `admin.rpc('outreach_mailbox_set_secret', {p_name: ref, p_secret: password})`.)

- [ ] **Step 3:** deno check + `config.toml` `[functions.outreach-mailbox-connect] verify_jwt = true`.
- [ ] **Step 4:** Commit.

---

## Task 8: edge `outreach-mailbox-test` (test SMTP+IMAP)

**Files:**
- Create: `supabase/functions/outreach-mailbox-test/index.ts`

super_admin. Body: `{ sender_account_id }`. Legge config casella + password (RPC `outreach_mailbox_secret`), prova `imapTestConnection` e un handshake SMTP (connessione + EHLO + AUTH, senza inviare). Aggiorna `connection_status/error/checked_at`.

- [ ] **Step 1:** implementare; per SMTP usare una funzione di test in `imapSmtpClient.ts` (`smtpTestConnection(cfg)` — aggiungerla: connette, EHLO, STARTTLS se 587, AUTH LOGIN, QUIT; ritorna bool/err). Per IMAP `imapTestConnection`.
- [ ] **Step 2:** deno check + config.toml `verify_jwt = true`.
- [ ] **Step 3:** Commit.

---

## Task 9: edge cron `outreach-imap-poll`

**Files:**
- Create: `supabase/functions/outreach-imap-poll/index.ts`

cron, `x-cron-secret`. Per ogni casella `provider='smtp'` + `status active` + `connection_status='ok'`: `imapFetchUnreadSince(cfg, last_imap_check_at ?? now-1d, 20)`; per ogni messaggio, carica i contatti candidati (per indirizzo mittente) → `matchReplyToContact` → trova enrollment attivo del contatto → `handleInboundReply`. Aggiorna `last_imap_check_at` (e `last_imap_uid`).

- [ ] **Step 1:** implementare (riusa `outreach-dispatch` per il pattern auth `x-cron-secret`/service-role e il client admin).
- [ ] **Step 2:** deno check + `config.toml` `[functions.outreach-imap-poll] verify_jwt = false`.
- [ ] **Step 3:** Commit.
- [ ] **Step 4:** (a deploy) schedulare il cron `*/15 * * * *` con `x-cron-secret = PROACTIVE_CRON_SECRET` (come `outreach-dispatch`).

---

## Task 10: routing per-provider nel dispatcher

**Files:**
- Modify: `supabase/functions/outreach-dispatch/index.ts`

- [ ] **Step 1:** la query caselle già seleziona `provider, smtp_host, smtp_port, smtp_secure, smtp_username, secret_ref` (aggiungere questi campi alla select). Nel blocco invio, se `sender.provider === 'smtp'`: risolvere la password via `admin.rpc('outreach_mailbox_secret',{p_ref: sender.secret_ref})` e passare `mailboxOverride: { host: sender.smtp_host, port: sender.smtp_port, secure: sender.smtp_secure, username: sender.smtp_username, password }` a `sendEmailUnified`; altrimenti percorso attuale (EE + senderOverride). Tenere `senderOverride.from` (brand/display) in entrambi i casi.
- [ ] **Step 2:** deno check.
- [ ] **Step 3:** Commit `feat(outreach): dispatcher instrada per provider (smtp reale vs EE legacy)`.

---

## Task 11: UI `OutreachSenderPool` — form casella SMTP + preset + test

**Files:**
- Modify: `src/components/admin/outreach/OutreachSenderPool.tsx`

- [ ] **Step 1:** nel form "+ Casella" del `DomainCard`, aggiungere un toggle tipo: "SMTP reale" | "Condivisa (EE)". Per SMTP, campi: email, host/porta/TLS SMTP, username, password, host/porta IMAP, con preset (`Google Workspace`, `Outlook/M365`, `Personalizzato`) che precompilano host/porte. Salvataggio: insert casella con `provider='smtp'` + campi SMTP/IMAP → poi `supabase.functions.invoke('outreach-mailbox-connect',{ sender_account_id, password })` per la password.
- [ ] **Step 2:** bottone "Testa connessione" sulla `CasellaRow` (solo per provider smtp) → `invoke('outreach-mailbox-test',{sender_account_id})` → toast + badge `connection_status`. Una casella SMTP parte `paused` e diventa attivabile solo dopo test `ok`.
- [ ] **Step 3:** eslint + (preview) verifica visiva del form.
- [ ] **Step 4:** Commit.

---

## Task 12: verifica statica completa

- [ ] deno check su tutte le function modificate/nuove.
- [ ] `npx eslint` sui file `.tsx`/`.ts` toccati.
- [ ] `npx vitest run src/test/logic/outreach` (tutti verdi).
- [ ] `npx vite build` (con dev server fermo).
- [ ] Commit eventuali fix.

---

## Task 13: collaudo dal vivo (richiede UNA casella reale dell'utente)

- [ ] deploy via CLI delle function nuove/modificate (`supabase functions deploy <nome>`), applicare la migrazione, schedulare il cron IMAP.
- [ ] l'utente aggiunge una casella reale (es. Google Workspace su dominio dedicato, app-password) dalla UI → "Testa connessione" → `ok`.
- [ ] arruolare un contatto di prova (un indirizzo controllato) in una sequenza assegnata al brand della casella → il dispatcher invia **dalla mailbox reale** → verificare ricezione + header List-Unsubscribe.
- [ ] rispondere dall'indirizzo di prova → entro 15 min `outreach-imap-poll` legge la risposta → la sequenza si ferma e la risposta appare nell'inbox con intent.
- [ ] verificare che una casella EE legacy continui a inviare identica (pool misto).

---

## Self-review (coverage spec → task)

- A (dati): Task 1 ✓ · B (routing): Task 2,3,4,10 ✓ · C (UI): Task 11 ✓ · D (Vault): Task 1,7 ✓ ·
  E (IMAP cron + reply-handler): Task 5,6,9 ✓ · F (errori/test): Task 2,5,12,13 ✓.
- Nessun placeholder "TODO/poi". Tipi coerenti: `SmtpConfig`/`mailboxOverride` allineati tra Task 3,4,10.
- Gap noto e dichiarato: la verifica di rete (SMTP/IMAP veri) è il Task 13, dipende da una casella reale.
