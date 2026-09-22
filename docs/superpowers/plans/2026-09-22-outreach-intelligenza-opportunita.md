# Outreach → Opportunità: intelligenza condivisa email + WhatsApp Locale — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una risposta interessata (email o WhatsApp Locale) diventa automaticamente un'opportunità tracciata nel CRM, la tab "Oggi" mostra una coda unica delle risposte calde di entrambi i canali, lo storico già accumulato viene recuperato con la stessa logica, e le Statistiche mostrano il funnel completo fino all'opportunità.

**Architecture:** Un'unica funzione condivisa (`_shared/outreach-opportunity-trigger.ts`) decide "questo segnale crea un'opportunità?" e la crea, riusata da entrambi i canali. L'email la chiama dal punto in cui già classifica l'intento (nessuna riscrittura); WhatsApp Locale passa da classificazione manuale-a-bottone a automatica-all'arrivo, riusando la stessa logica di classificazione AI del bottone esistente (estratta in un modulo condiviso). Il frontend aggiunge una coda calda unificata in "Oggi" e piccoli indicatori "Opportunità creata" dove già si guardano le risposte.

**Tech Stack:** Supabase edge functions (Deno) + Postgres (migrazioni SQL) + React/TypeScript (Vite) + @tanstack/react-query.

**Spec:** [docs/superpowers/specs/2026-09-22-outreach-intelligenza-opportunita-design.md](../specs/2026-09-22-outreach-intelligenza-opportunita-design.md)

**Vincoli di questo repo (validi per OGNI task):**
- Lavoro diretto su `main` locale, mai un branch/worktree separato — altri terminali committano in parallelo sullo stesso `main`.
- Mai `git add -A`: `git add` solo i file toccati dal task.
- Mai `git push` / `supabase deploy` / `db push` — tutto locale finché l'utente non lo chiede esplicitamente.
- Migrazioni: SQL idempotente, applicato con il tool MCP `apply_migration` (project id `rsbrguhkodgnqfomrevo`), poi riallineare SUBITO `schema_migrations.version` al nome del file (vedi CLAUDE.md — saltare questo passo è la causa nota di disallineamenti).
- Ogni task che tocca `supabase/functions/`: `deno check <file>` prima di committare. `deno check` modifica `deno.lock` → `git checkout -- deno.lock` subito dopo, non va committato.
- Ogni task che tocca `src/`: eslint sul file toccato + `NODE_OPTIONS=--max-old-space-size=6144 node_modules/.bin/vite build` (EXIT 0) + `npx tsc --noEmit`.

---

### Task 1: Migrazione — colonne di tracciabilità fonte su `marketing_opportunities`

**Files:**
- Create: `supabase/migrations/20280922200000_outreach_opportunita_source_ref.sql`

- [ ] **Step 1: Verificare che la versione sia libera**

Run: `ls supabase/migrations/20280922200000_*.sql`
Expected: `no matches found` (verificato libera il 22/09/2026 — riverificare comunque, altri terminali possono averla presa nel frattempo; se occupata usare `20280922201000` e ripetere).

- [ ] **Step 2: Scrivere il file di migrazione**

```sql
-- Traccia da quale risposta (email o WhatsApp) nasce un'opportunità creata
-- in automatico, per il link "vai al messaggio originale" e per il funnel
-- nelle Statistiche campagna. Nessuna FK reale: source_ref_table indica
-- QUALE tabella guardare (sono due tabelle diverse, una FK non può puntare
-- a entrambe).
alter table public.marketing_opportunities
  add column if not exists source_ref_table text,
  add column if not exists source_ref_id uuid;

alter table public.marketing_opportunities
  drop constraint if exists marketing_opportunities_source_ref_table_check;
alter table public.marketing_opportunities
  add constraint marketing_opportunities_source_ref_table_check
  check (source_ref_table is null or source_ref_table in ('outreach_replies', 'openwa_campagna_destinatari'));

create index if not exists idx_marketing_opportunities_source_ref
  on public.marketing_opportunities (source_ref_table, source_ref_id)
  where source_ref_id is not null;
```

- [ ] **Step 3: Applicare via MCP**

Chiamare il tool MCP `apply_migration` (project id `rsbrguhkodgnqfomrevo`) con:
- `name`: `outreach_opportunita_source_ref`
- `query`: il contenuto SQL dello Step 2

- [ ] **Step 4: Riallineare la versione**

Chiamare il tool MCP `execute_sql` (stesso project id) con:

```sql
update supabase_migrations.schema_migrations
   set version = '20280922200000'
 where name = 'outreach_opportunita_source_ref' and left(version, 4) = '2026';
```

- [ ] **Step 5: Verificare**

Chiamare `execute_sql`:

```sql
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='marketing_opportunities'
  and column_name in ('source_ref_table', 'source_ref_id');
```

Expected: 2 righe.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20280922200000_outreach_opportunita_source_ref.sql
git commit -m "feat(db): colonne source_ref su marketing_opportunities per tracciare la fonte outreach/whatsapp"
```

---

### Task 2: Modulo condiviso — politica e creazione dell'opportunità

**Files:**
- Create: `supabase/functions/_shared/outreach-opportunity-trigger.ts`
- Test: `supabase/functions/_shared/outreach-opportunity-trigger.test.ts`

Nota: questo repo usa `deno test` per i moduli puri sotto `supabase/functions/_shared/` (vedi `supabase/functions/suggest-calendars/scoring.test.ts` come precedente) — **non** vitest, il cui `vitest.config.ts` include solo `src/**`. Un test qui messo sotto vitest non verrebbe mai eseguito.

- [ ] **Step 1: Scrivere il test della funzione pura (fallirà: il modulo non esiste ancora)**

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { shouldCreateOpportunity } from "./outreach-opportunity-trigger.ts";

Deno.test("shouldCreateOpportunity: email interested → true", () => {
  assertEquals(shouldCreateOpportunity("email", "interested"), true);
});

Deno.test("shouldCreateOpportunity: email question → false (segnale troppo debole da solo)", () => {
  assertEquals(shouldCreateOpportunity("email", "question"), false);
});

Deno.test("shouldCreateOpportunity: email not_interested/unsubscribe/auto_reply/other → false", () => {
  assertEquals(shouldCreateOpportunity("email", "not_interested"), false);
  assertEquals(shouldCreateOpportunity("email", "unsubscribe"), false);
  assertEquals(shouldCreateOpportunity("email", "auto_reply"), false);
  assertEquals(shouldCreateOpportunity("email", "other"), false);
});

Deno.test("shouldCreateOpportunity: whatsapp appuntamento → true", () => {
  assertEquals(shouldCreateOpportunity("whatsapp", "appuntamento"), true);
});

Deno.test("shouldCreateOpportunity: whatsapp da_ricontattare/non_interessato/incerto → false", () => {
  assertEquals(shouldCreateOpportunity("whatsapp", "da_ricontattare"), false);
  assertEquals(shouldCreateOpportunity("whatsapp", "non_interessato"), false);
  assertEquals(shouldCreateOpportunity("whatsapp", "incerto"), false);
});

Deno.test("shouldCreateOpportunity: whatsapp 'cliente' → false (l'AI non lo assegna mai, ma la funzione non deve trattarlo come segnale di creazione)", () => {
  assertEquals(shouldCreateOpportunity("whatsapp", "cliente"), false);
});

Deno.test("shouldCreateOpportunity: label nullo o vuoto → false", () => {
  assertEquals(shouldCreateOpportunity("email", null), false);
  assertEquals(shouldCreateOpportunity("email", undefined), false);
  assertEquals(shouldCreateOpportunity("email", ""), false);
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `deno test supabase/functions/_shared/outreach-opportunity-trigger.test.ts`
Expected: FAIL — `Module not found "./outreach-opportunity-trigger.ts"`

- [ ] **Step 3: Scrivere il modulo**

```typescript
/**
 * outreach-opportunity-trigger — decide se una risposta "calda" (email o
 * WhatsApp Locale) deve generare un'opportunità, e la crea.
 *
 * Un solo posto per la politica (shouldCreateOpportunity), così i due canali
 * non divergono nel tempo; un solo posto per l'inserimento vero
 * (triggerOpportunityFromSignal), che riusa lo stesso principio anti-doppioni
 * già visto nel motore automazioni: un contatto con un'opportunità aperta
 * non ne riceve una seconda.
 *
 * pipeline_id/stage_id non hanno un "default" configurato da nessuna parte
 * (marketing_pipelines non ha un flag del genere — solo `position` per
 * l'ordinamento): la regola qui è esplicita, la pipeline con `position` più
 * basso della piattaforma, e al suo interno lo stage con `position` più
 * basso (lo stage "di ingresso").
 */

// deno-lint-ignore-file no-explicit-any

const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";

export type CanaleSegnale = "email" | "whatsapp";

/** appuntamento vale come "interested": ha chiesto di parlare, è il segnale più forte che abbiamo su quel canale. */
const CREA_OPPORTUNITA: Record<CanaleSegnale, ReadonlySet<string>> = {
  email: new Set(["interested"]),
  whatsapp: new Set(["appuntamento"]),
};

/** Un segnale (intent email o esito WhatsApp) merita la creazione automatica di un'opportunità? */
export function shouldCreateOpportunity(channel: CanaleSegnale, label: string | null | undefined): boolean {
  if (!label) return false;
  return CREA_OPPORTUNITA[channel].has(label);
}

export interface SegnaleOpportunita {
  channel: CanaleSegnale;
  contactId: string;
  sourceRefTable: "outreach_replies" | "openwa_campagna_destinatari";
  sourceRefId: string;
  /** frammento del messaggio, per la nota dell'opportunità. */
  snippet?: string | null;
}

/**
 * Crea l'opportunità per un segnale caldo, se il contatto non ne ha già una
 * aperta (qualunque fonte — coerente col dedup del motore automazioni).
 * Best-effort: ogni errore viene loggato e la funzione torna null, non
 * lancia mai — chi chiama (gestione risposta email/WhatsApp) non deve
 * fallire per un problema qui. Torna l'id dell'opportunità creata, o null
 * se non ne ha creata una (già presente, o un passaggio è mancante).
 */
export async function triggerOpportunityFromSignal(admin: any, segnale: SegnaleOpportunita): Promise<string | null> {
  try {
    const { data: apertaGia } = await admin
      .from("marketing_opportunities")
      .select("id")
      .eq("company_id", PLATFORM_COMPANY)
      .eq("contact_id", segnale.contactId)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();
    if (apertaGia?.id) return null;

    const { data: pipeline } = await admin
      .from("marketing_pipelines")
      .select("id")
      .eq("company_id", PLATFORM_COMPANY)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!pipeline?.id) {
      console.warn("[outreach-opportunity-trigger] nessuna pipeline configurata per la piattaforma");
      return null;
    }

    const { data: stage } = await admin
      .from("marketing_pipeline_stages")
      .select("id")
      .eq("pipeline_id", pipeline.id)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!stage?.id) {
      console.warn("[outreach-opportunity-trigger] la pipeline non ha stage");
      return null;
    }

    const { data: contatto } = await admin
      .from("marketing_contacts")
      .select("first_name,last_name,company_name")
      .eq("id", segnale.contactId)
      .maybeSingle();
    const nome = [contatto?.first_name, contatto?.last_name].filter(Boolean).join(" ") || contatto?.company_name || "Contatto";
    const fonte = segnale.channel === "email" ? "outreach_email" : "outreach_whatsapp";

    const { data: inserita, error } = await admin
      .from("marketing_opportunities")
      .insert({
        company_id: PLATFORM_COMPANY,
        contact_id: segnale.contactId,
        pipeline_id: pipeline.id,
        stage_id: stage.id,
        name: `${nome} · risposta calda`,
        source: fonte,
        source_ref_table: segnale.sourceRefTable,
        source_ref_id: segnale.sourceRefId,
        notes: segnale.snippet
          ? `Nato da una risposta ${segnale.channel === "email" ? "email" : "WhatsApp"}: "${segnale.snippet.slice(0, 240)}"`
          : null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return inserita?.id ?? null;
  } catch (e) {
    console.warn("[outreach-opportunity-trigger] creazione non riuscita:", e instanceof Error ? e.message : e);
    return null;
  }
}
```

- [ ] **Step 4: Eseguire il test e verificare che passi**

Run: `deno test supabase/functions/_shared/outreach-opportunity-trigger.test.ts`
Expected: PASS — 8 test ok

- [ ] **Step 5: Type-check**

Run: `deno check supabase/functions/_shared/outreach-opportunity-trigger.ts`
Expected: nessun errore. Poi: `git checkout -- deno.lock` (deno check lo modifica, non va committato).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/outreach-opportunity-trigger.ts supabase/functions/_shared/outreach-opportunity-trigger.test.ts
git commit -m "feat(outreach): modulo condiviso che decide e crea l'opportunità da un segnale caldo"
```

---

### Task 3: Email — collegare l'intent "interested" al trigger

**Files:**
- Modify: `supabase/functions/_shared/outreach-reply-handler.ts:19-31` (import), `:236-264` (blocco da estendere)

- [ ] **Step 1: Aggiungere l'import**

In `supabase/functions/_shared/outreach-reply-handler.ts`, dopo la riga `import { iscrizioniDaFermare } from "./outreachRispostaBrand.ts";` (riga 31), aggiungere:

```typescript
import { shouldCreateOpportunity, triggerOpportunityFromSignal } from "./outreach-opportunity-trigger.ts";
```

- [ ] **Step 2: Aggiungere la chiamata subito dopo il blocco esistente del task di chiamata**

Il blocco esistente (righe 236-264) crea un `outreach_call_task` per `interested`/`question`. Subito dopo la sua chiusura (dopo la riga 264, `}`, prima del commento `// 4-ter.` a riga 266), inserire un nuovo passo:

```typescript
  // 4-bis-2. TRIGGER OPPORTUNITÀ: solo "interessato" crea l'opportunità in
  // automatico — "domanda" resta un segnale troppo debole da solo (ha comunque
  // il task di chiamata sopra). Best-effort: un errore qui non deve mai far
  // fallire la gestione della risposta.
  if (r.contactId && shouldCreateOpportunity("email", intent)) {
    await triggerOpportunityFromSignal(admin, {
      channel: "email",
      contactId: r.contactId,
      sourceRefTable: "outreach_replies",
      sourceRefId: inserted!.id,
      snippet,
    });
  }

```

- [ ] **Step 3: Type-check**

Run: `deno check supabase/functions/_shared/outreach-reply-handler.ts`
Expected: nessun errore. Poi: `git checkout -- deno.lock`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/outreach-reply-handler.ts
git commit -m "feat(outreach): una risposta email interessata crea l'opportunità in automatico"
```

---

### Task 4: WhatsApp — estrarre la classificazione di un singolo destinatario

**Files:**
- Create: `supabase/functions/_shared/openwa-classifica-una-risposta.ts`
- Modify: `supabase/functions/openwa-classifica-risposte/index.ts` (righe 43-96)

Estrae la logica di classificazione AI di UN destinatario dal bottone manuale
esistente, così sia il bottone sia il nuovo percorso automatico (Task 5)
usano esattamente la stessa funzione — nessuna copia, nessuna divergenza
futura tra le due.

- [ ] **Step 1: Creare il modulo condiviso**

```typescript
/**
 * openwa-classifica-una-risposta — classifica con l'AI la risposta di UN
 * destinatario campagna WhatsApp Locale, negli stessi esiti della pipeline
 * (appuntamento / da_ricontattare / non_interessato / incerto). Estratta da
 * openwa-classifica-risposte (il bottone manuale nel report risposte) perché
 * il percorso automatico all'arrivo del messaggio (openwa-webhook) la deve
 * chiamare identica — una sola definizione della politica di classificazione.
 *
 * "cliente" NON è tra gli esiti che questa funzione può assegnare:
 * dichiarare vinto un contratto resta una decisione umana.
 */

// deno-lint-ignore-file no-explicit-any

import { aiRouterPrompt } from "./aiRouter.ts";

const ESITI_AI = new Set(["appuntamento", "da_ricontattare", "non_interessato"]);
const PLATFORM_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

export interface DestinatarioDaClassificare {
  id: string;
  contact_id: string;
  primo_inviato_at: string | null;
}

export type EsitoClassificazione = "appuntamento" | "da_ricontattare" | "non_interessato" | "incerto" | "senza_testo";

/**
 * Classifica un destinatario e scrive `esito`/`esito_at` se l'AI decide un
 * esito valido (senza sovrascrivere una scelta umana nel frattempo). Torna
 * l'esito assegnato, o "incerto"/"senza_testo" se non ha scritto nulla.
 */
export async function classificaUnaRisposta(admin: any, d: DestinatarioDaClassificare): Promise<EsitoClassificazione> {
  // Fino a 3 messaggi della persona: il primo "Ciao?" da solo dice poco.
  const { data: msgs } = await admin
    .from("openwa_messages")
    .select("body")
    .eq("contact_id", d.contact_id)
    .eq("direction", "inbound")
    .gte("created_at", d.primo_inviato_at ?? "1970-01-01")
    .order("created_at", { ascending: true })
    .limit(3);
  const testi = (msgs ?? []).map((m: { body: string | null }) => m.body).filter(Boolean);
  if (!testi.length) return "senza_testo";

  try {
    const r = await aiRouterPrompt({
      supabase: admin,
      taskKey: "openwa_classifica_risposta",
      companyId: PLATFORM_COMPANY_ID,
      systemPrompt: [
        "Classifichi la risposta di un'azienda a un primo contatto WhatsApp B2B.",
        "Rispondi SOLO con una di queste parole:",
        "- appuntamento: vuole parlare, chiede una chiamata/incontro, chiede quando",
        "- da_ricontattare: interessato ma non ora, chiede materiale, risposta interlocutoria",
        "- non_interessato: rifiuta, dice di no, chiede di non essere contattato",
        "- incerto: non si capisce (un solo 'Ciao?', emoji, fuori tema)",
        "Nessun'altra parola, nessuna spiegazione.",
      ].join("\n"),
      userPrompt: `Risposta del contatto:\n${testi.join("\n---\n")}`,
    });
    const parola = (r.content ?? "").trim().toLowerCase().replace(/[^a-z_]/g, "");
    if (ESITI_AI.has(parola)) {
      await admin.from("openwa_campagna_destinatari")
        .update({ esito: parola, esito_at: new Date().toISOString() })
        .eq("id", d.id)
        .is("esito", null); // non sovrascrive una scelta umana nel frattempo
      return parola as EsitoClassificazione;
    }
    return "incerto";
  } catch (e) {
    console.warn("[openwa-classifica-una-risposta] AI:", (e as Error)?.message);
    return "incerto";
  }
}
```

- [ ] **Step 2: Refactoring del bottone manuale per usare il modulo condiviso**

In `supabase/functions/openwa-classifica-risposte/index.ts`, sostituire l'import e il corpo del ciclo:

Sostituire (riga 17):
```typescript
import { aiRouterPrompt } from "../_shared/aiRouter.ts";
```
con:
```typescript
import { classificaUnaRisposta } from "../_shared/openwa-classifica-una-risposta.ts";
```

Sostituire il blocco righe 22 e 53-96 (dalla costante `ESITI_AI` fin dentro il ciclo `for`) — cioè rimuovere `const ESITI_AI = new Set(...)` (riga 22, ora inutile qui, vive nel modulo condiviso) e sostituire l'intero corpo del `for (const d of daFare ?? [])` con:

```typescript
    for (const d of daFare ?? []) {
      const esito = await classificaUnaRisposta(admin, d);
      if (esito === "senza_testo") { risultato.senza_testo++; continue; }
      if (esito === "incerto") { risultato.incerti++; continue; }
      risultato.classificati++;
    }
```

(rinominare la variabile locale `esito` dell'oggetto contatore — riga 51, `const esito = { classificati: 0, ... }` — in `risultato` per non confliggere col nome `esito` della variabile nel ciclo; aggiornare anche il suo uso a riga 104, `esito.restanti = count ?? 0;` → `risultato.restanti = count ?? 0;`, e nella response finale `...esito` → `...risultato`).

- [ ] **Step 3: Type-check di entrambi i file**

Run: `deno check supabase/functions/_shared/openwa-classifica-una-risposta.ts supabase/functions/openwa-classifica-risposte/index.ts`
Expected: nessun errore. Poi: `git checkout -- deno.lock`.

- [ ] **Step 4: Verifica manuale del comportamento invariato**

Non c'è un test automatico per questa funzione (chiama l'AI, come il resto del progetto non la mocka). Verifica testuale: rileggere il diff e confermare che `classificaUnaRisposta` fa ESATTAMENTE le stesse chiamate (stesso `taskKey`, stesso prompt, stesso `.is("esito", null)`) di prima — solo estratta, comportamento identico.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/openwa-classifica-una-risposta.ts supabase/functions/openwa-classifica-risposte/index.ts
git commit -m "refactor(whatsapp): estrae la classificazione di un destinatario in un modulo condiviso"
```

---

### Task 5: WhatsApp — classificazione automatica all'arrivo + trigger opportunità

**Files:**
- Modify: `supabase/functions/openwa-webhook/index.ts:14` (import), `:445-452` (punto d'aggancio)

Stesso stile del resto del file: un passo sincrono in più, alla fine, con lo
stesso try/catch best-effort di ogni altro passo qui dentro (vedi spec: il
webhook fa già molto lavoro sincrono, introdurre un pattern `waitUntil` qui
sarebbe incoerente).

- [ ] **Step 1: Aggiungere gli import**

Dopo la riga 16 (`import { mappaStatoOpenWa, statoGrezzoDaPayload, riassuntoPayload } from "../_shared/openwaStato.ts";`), aggiungere:

```typescript
import { classificaUnaRisposta } from "../_shared/openwa-classifica-una-risposta.ts";
import { shouldCreateOpportunity, triggerOpportunityFromSignal } from "../_shared/outreach-opportunity-trigger.ts";
```

- [ ] **Step 2: Aggiungere il passo dopo `openwa_campagna_segna_risposta`**

Il blocco esistente (righe 445-452) marca `stato='risposto'` sui destinatari delle campagne attive per quel contatto/telefono. Subito dopo la sua chiusura (dopo la riga 452, `}`, prima del commento `// Avviso a chi presidia:` a riga 454), inserire:

```typescript
    // ── Classificazione automatica + trigger opportunità ──────────────────
    // Appena un contatto risponde a una campagna, classifica con l'AI (stessa
    // funzione del bottone manuale) e, su "appuntamento", crea l'opportunità.
    // Un contatto può essere iscritto a più campagne insieme: si classificano
    // tutti i destinatari appena diventati "risposto" senza esito.
    if (contactId) {
      try {
        const { data: daClassificare } = await admin
          .from("openwa_campagna_destinatari")
          .select("id, contact_id, primo_inviato_at")
          .eq("contact_id", contactId)
          .eq("stato", "risposto")
          .is("esito", null);
        for (const d of (daClassificare ?? []) as Array<{ id: string; contact_id: string; primo_inviato_at: string | null }>) {
          const esito = await classificaUnaRisposta(admin, d);
          if (shouldCreateOpportunity("whatsapp", esito)) {
            await triggerOpportunityFromSignal(admin, {
              channel: "whatsapp",
              contactId,
              sourceRefTable: "openwa_campagna_destinatari",
              sourceRefId: d.id,
              snippet: text || null,
            });
          }
        }
      } catch (e) {
        console.error("[openwa-webhook] classificazione automatica:", (e as Error)?.message);
      }
    }

```

- [ ] **Step 3: Type-check**

Run: `deno check supabase/functions/openwa-webhook/index.ts`
Expected: nessun errore. Poi: `git checkout -- deno.lock`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/openwa-webhook/index.ts
git commit -m "feat(whatsapp): classificazione automatica all'arrivo del messaggio + trigger opportunità su appuntamento"
```

---

### Task 6: Backfill storico (email + WhatsApp)

**Files:**
- Create: `supabase/functions/outreach-opportunita-backfill/index.ts`

Operazione una tantum, super_admin, NON in nav — si invoca una volta durante
il rollout (documentato nel Task 12 come ultimo passo), non una funzionalità
permanente. Copre sia le risposte già classificate senza opportunità sia
quelle mai classificate (le fa passare prima dalla classificazione).

- [ ] **Step 1: Scrivere la funzione**

```typescript
/**
 * outreach-opportunita-backfill — operazione UNA TANTUM: applica la stessa
 * logica del flusso live (classifica se manca, poi crea l'opportunità se il
 * segnale vale) allo storico già accumulato, sui due canali. Si invoca una
 * volta sola durante il rollout, non a cron, non da un bottone permanente.
 *
 * A lotti (non un'unica transazione gigante): il volume atteso è modesto
 * (decine, non decine di migliaia — i numeri reali delle campagne sono a una
 * o due cifre di risposte "interessate"), ma il lotto resta comunque buona
 * pratica per poter verificare il risultato invece di doverlo dedurre.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { classifyIntentBatch } from "./classifyIntentBatch.ts";
import { classificaUnaRisposta } from "../_shared/openwa-classifica-una-risposta.ts";
import { shouldCreateOpportunity, triggerOpportunityFromSignal } from "../_shared/outreach-opportunity-trigger.ts";

const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";
const LOTTO = 50;

Deno.serve(async (req) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsH });
  const jsonH = { ...corsH, "Content-Type": "application/json" };

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    await requireRole(supabaseAdmin, userId, ["super_admin"], corsH);
    const admin = supabaseAdmin ?? createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const riepilogo = {
      email_classificate: 0, email_opportunita_create: 0, email_gia_avevano: 0,
      whatsapp_classificati: 0, whatsapp_opportunita_create: 0, whatsapp_gia_avevano: 0,
    };

    // ── Email: risposte senza intent, poi tutte quelle con intent "interested" ──
    const nonClassificate = await classifyIntentBatch(admin, PLATFORM_COMPANY, LOTTO);
    riepilogo.email_classificate = nonClassificate;

    const { data: interessate } = await admin
      .from("outreach_replies")
      .select("id, contact_id, snippet")
      .eq("company_id", PLATFORM_COMPANY)
      .eq("intent", "interested")
      .not("contact_id", "is", null);
    for (const r of (interessate ?? []) as Array<{ id: string; contact_id: string; snippet: string | null }>) {
      const id = await triggerOpportunityFromSignal(admin, {
        channel: "email", contactId: r.contact_id, sourceRefTable: "outreach_replies", sourceRefId: r.id, snippet: r.snippet,
      });
      if (id) riepilogo.email_opportunita_create++; else riepilogo.email_gia_avevano++;
    }

    // ── WhatsApp: destinatari "risposto" senza esito, poi tutti gli "appuntamento" ──
    const { data: daClassificare } = await admin
      .from("openwa_campagna_destinatari")
      .select("id, contact_id, primo_inviato_at")
      .eq("stato", "risposto")
      .is("esito", null)
      .limit(LOTTO);
    for (const d of (daClassificare ?? []) as Array<{ id: string; contact_id: string; primo_inviato_at: string | null }>) {
      const esito = await classificaUnaRisposta(admin, d);
      if (esito !== "senza_testo" && esito !== "incerto") riepilogo.whatsapp_classificati++;
    }

    const { data: appuntamenti } = await admin
      .from("openwa_campagna_destinatari")
      .select("id, contact_id")
      .eq("esito", "appuntamento")
      .not("contact_id", "is", null);
    for (const d of (appuntamenti ?? []) as Array<{ id: string; contact_id: string }>) {
      const id = await triggerOpportunityFromSignal(admin, {
        channel: "whatsapp", contactId: d.contact_id, sourceRefTable: "openwa_campagna_destinatari", sourceRefId: d.id,
      });
      if (id) riepilogo.whatsapp_opportunita_create++; else riepilogo.whatsapp_gia_avevano++;
    }

    return new Response(JSON.stringify({ ok: true, ...riepilogo }), { headers: jsonH });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[outreach-opportunita-backfill]", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: jsonH });
  }
});
```

- [ ] **Step 2: Scrivere l'helper di classificazione email a lotti**

`classifyIntentBatch` non esiste ancora nel progetto (il flusso live classifica UNA risposta alla volta, dentro `outreach-reply-handler.ts`, mai riusabile a lotti). Crearlo come helper minimo del backfill soltanto:

**Files:**
- Create: `supabase/functions/outreach-opportunita-backfill/classifyIntentBatch.ts`

```typescript
/**
 * classifyIntentBatch — classifica con l'AI fino a `lotto` risposte email
 * ancora senza `intent`, per il backfill storico. Stessa logica AI del
 * flusso live (outreach-reply-handler.ts), qui applicata a un lotto invece
 * che a una risposta appena arrivata.
 */

// deno-lint-ignore-file no-explicit-any

import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { normalizeIntent, normalizeConfidence, INTENT_SYSTEM_PROMPT, buildIntentUserPrompt } from "../_shared/outreach-intent.ts";

export async function classifyIntentBatch(admin: any, companyId: string, lotto: number): Promise<number> {
  const { data: righe } = await admin
    .from("outreach_replies")
    .select("id, subject, snippet")
    .eq("company_id", companyId)
    .is("intent", null)
    .limit(lotto);

  let classificate = 0;
  for (const r of (righe ?? []) as Array<{ id: string; subject: string | null; snippet: string | null }>) {
    try {
      const result = await aiRouterComplete({
        supabase: admin,
        taskKey: "outreach_reply_intent",
        messages: [
          { role: "system", content: INTENT_SYSTEM_PROMPT },
          { role: "user", content: buildIntentUserPrompt(r.subject ?? "", r.snippet ?? "") },
        ],
        params: { temperature: 0, max_tokens: 60 },
        responseFormat: { type: "json_object" },
        companyId,
        userId: null,
        skipCharge: true,
      });
      let intent = "other";
      let confidence = 0;
      try {
        const o = JSON.parse(result.content || "{}");
        intent = normalizeIntent(o.intent);
        confidence = normalizeConfidence(o.confidence);
      } catch { /* default other */ }
      await admin.from("outreach_replies").update({ intent, intent_confidence: confidence }).eq("id", r.id);
      classificate++;
    } catch (e) {
      console.warn("[classifyIntentBatch] skip:", e instanceof Error ? e.message : e);
    }
  }
  return classificate;
}
```

- [ ] **Step 3: Verificare che `normalizeIntent`/`normalizeConfidence`/`INTENT_SYSTEM_PROMPT`/`buildIntentUserPrompt` siano davvero esportati da `outreach-intent.ts`**

Run: `grep -n "^export" supabase/functions/_shared/outreach-intent.ts`
Expected: le 4 righe con questi nomi (già usati identici in `outreach-reply-handler.ts:20-25`, quindi devono esistere).

- [ ] **Step 4: Type-check**

Run: `deno check supabase/functions/outreach-opportunita-backfill/index.ts supabase/functions/outreach-opportunita-backfill/classifyIntentBatch.ts`
Expected: nessun errore. Poi: `git checkout -- deno.lock`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/outreach-opportunita-backfill/
git commit -m "feat(outreach): backfill una tantum — classifica e collega ad opportunità lo storico email+whatsapp"
```

---

### Task 7: Funnel — estendere l'RPC statistiche con i conteggi opportunità

**Files:**
- Create: `supabase/migrations/20280922210000_outreach_statistiche_opportunita.sql`

**Nota per l'implementer:** il corpo SQL sotto è la funzione `outreach_campagna_statistiche` COMPLETA e AGGIORNATA (letta dal database live il 22/09/2026 via `pg_get_functiondef`), con 2 soli inserimenti: la CTE `opp` e i 2 campi in `totali`. Prima di applicare, verificare che nessun altro terminale l'abbia modificata nel frattempo:

Run: `execute_sql` (project id `rsbrguhkodgnqfomrevo`) con `select pg_get_functiondef(oid) from pg_proc where proname = 'outreach_campagna_statistiche';`
Se il risultato è diverso da quello sotto (prima degli inserimenti), fermarsi e integrare le differenze invece di sovrascriverle.

- [ ] **Step 1: Verificare che la versione sia libera**

Run: `ls supabase/migrations/20280922210000_*.sql`
Expected: `no matches found` (verificato libera il 22/09/2026 — riverificare).

- [ ] **Step 2: Scrivere la migrazione**

```sql
-- Aggiunge alla statistica di campagna i conteggi delle opportunità nate
-- dalle risposte di questa sequenza (create/vinte), possibile ora che
-- marketing_opportunities porta source_ref_id/source_ref_table (migrazione
-- 20280922200000). CREATE OR REPLACE: stesso corpo di prima + 1 CTE + 2 campi.
CREATE OR REPLACE FUNCTION public.outreach_campagna_statistiche(p_company uuid, p_sequence uuid DEFAULT NULL::uuid, p_tz text DEFAULT 'Europe/Rome'::text, p_giorni integer DEFAULT 14)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH i AS (
    SELECT * FROM public.outreach_campagna_iscrizioni(p_company, p_sequence)
  ),
  opp AS (
    SELECT o.id, o.won_at
      FROM public.marketing_opportunities o
      JOIN public.outreach_replies r ON r.id = o.source_ref_id AND o.source_ref_table = 'outreach_replies'
     WHERE r.enrollment_id IN (SELECT i.enrollment_id FROM i)
       AND o.deleted_at IS NULL
  ),
  inv AS (
    SELECT q.enrollment_id, q.sent_at, q.opened_at, q.sender_account_id,
           row_number() OVER (PARTITION BY q.enrollment_id ORDER BY q.sent_at, q.id)::int AS passo
      FROM public.outreach_send_queue q
     WHERE q.enrollment_id IN (SELECT i.enrollment_id FROM i)
       AND q.status = 'sent' AND coalesce(q.kind, 'send') = 'send'
  ),
  prog AS (
    SELECT q.scheduled_for, q.sender_account_id
      FROM public.outreach_send_queue q
     WHERE q.enrollment_id IN (SELECT i.enrollment_id FROM i)
       AND q.status IN ('queued', 'sending') AND coalesce(q.kind, 'send') = 'send'
  ),
  risp AS (
    SELECT i.enrollment_id, i.risposta_at, i.fase,
           (SELECT count(*) FROM inv WHERE inv.enrollment_id = i.enrollment_id AND inv.sent_at <= i.risposta_at)::int AS dopo_passo,
           (SELECT inv.sender_account_id FROM inv
             WHERE inv.enrollment_id = i.enrollment_id AND inv.sent_at <= i.risposta_at
             ORDER BY inv.sent_at DESC LIMIT 1) AS casella,
           (SELECT min(inv.sent_at) FROM inv WHERE inv.enrollment_id = i.enrollment_id) AS primo_at
      FROM i
     WHERE starts_with(i.fase, 'risposta_') AND i.risposta_at IS NOT NULL
  ),
  passi_def AS (
    SELECT row_number() OVER (ORDER BY st.step_order)::int AS passo, st.channel, st.subject, st.delay_days
      FROM public.outreach_sequence_steps st
     WHERE p_sequence IS NOT NULL AND st.sequence_id = p_sequence
       AND coalesce(st.node_type, st.channel) IN ('email', 'whatsapp', 'sms', 'call')
  ),
  passi_n AS (
    SELECT generate_series(1, greatest(
             coalesce((SELECT max(passo) FROM passi_def), 0),
             coalesce((SELECT max(passo) FROM inv), 0))) AS passo
  ),
  inv_passo AS (
    SELECT passo, count(*) AS inviati, count(*) FILTER (WHERE opened_at IS NOT NULL) AS aperti
      FROM inv GROUP BY passo
  ),
  risp_passo AS (
    SELECT dopo_passo AS passo, count(*) AS risposte,
           count(*) FILTER (WHERE fase IN ('risposta_interessato', 'risposta_domanda')) AS interessati
      FROM risp GROUP BY dopo_passo
  ),
  usciti_passo AS (
    SELECT inviati AS passo,
           count(*) FILTER (WHERE fase = 'rimbalzato') AS rimbalzi,
           count(*) FILTER (WHERE fase = 'disiscritto') AS disiscritti,
           count(*) FILTER (WHERE fase = 'passo_' || inviati) AS in_attesa
      FROM i GROUP BY inviati
  ),
  giorni AS (
    SELECT d::date AS giorno
      FROM generate_series(
             (now() AT TIME ZONE p_tz)::date - (greatest(p_giorni, 1) - 1),
             (now() AT TIME ZONE p_tz)::date + greatest(p_giorni, 1),
             interval '1 day') d
  ),
  inv_g AS (SELECT (sent_at AT TIME ZONE p_tz)::date AS giorno, count(*) AS n FROM inv GROUP BY 1),
  prog_g AS (SELECT (scheduled_for AT TIME ZONE p_tz)::date AS giorno, count(*) AS n FROM prog GROUP BY 1),
  risp_g AS (SELECT (risposta_at AT TIME ZONE p_tz)::date AS giorno, count(*) AS n FROM risp GROUP BY 1),
  cas_inv AS (SELECT sender_account_id AS id, count(*) AS n FROM inv WHERE sender_account_id IS NOT NULL GROUP BY 1),
  cas_prog AS (SELECT sender_account_id AS id, count(*) AS n FROM prog WHERE sender_account_id IS NOT NULL GROUP BY 1),
  cas_risp AS (SELECT casella AS id, count(*) AS n FROM risp WHERE casella IS NOT NULL GROUP BY 1),
  cas_rimb AS (SELECT ultima_casella AS id, count(*) AS n FROM i WHERE fase = 'rimbalzato' AND ultima_casella IS NOT NULL GROUP BY 1)
  SELECT jsonb_build_object(
    'aperture_tracciate', coalesce((
        SELECT bool_or(s.track_opens) FROM public.outreach_sequences s
         WHERE s.company_id = p_company AND (p_sequence IS NULL OR s.id = p_sequence)), false),
    'totali', (SELECT jsonb_build_object(
        'iscritti', count(*),
        'contattati', count(*) FILTER (WHERE i.inviati > 0),
        'da_contattare', count(*) FILTER (WHERE i.fase = 'da_contattare'),
        'in_corso', count(*) FILTER (WHERE starts_with(i.fase, 'passo_')),
        'completati', count(*) FILTER (WHERE i.fase = 'completato'),
        'risposte', count(*) FILTER (WHERE starts_with(i.fase, 'risposta_')),
        'interessati', count(*) FILTER (WHERE i.fase IN ('risposta_interessato', 'risposta_domanda')),
        'non_interessati', count(*) FILTER (WHERE i.fase = 'risposta_non_interessato'),
        'rimbalzati', count(*) FILTER (WHERE i.fase = 'rimbalzato'),
        'disiscritti', count(*) FILTER (WHERE i.fase = 'disiscritto'),
        'fermati', count(*) FILTER (WHERE i.fase = 'fermato'),
        'in_pausa', count(*) FILTER (WHERE i.stato = 'paused'),
        'opportunita_create', (SELECT count(*) FROM opp),
        'opportunita_vinte', (SELECT count(*) FROM opp WHERE won_at IS NOT NULL)) FROM i),
    'messaggi', jsonb_build_object(
        'inviati', (SELECT count(*) FROM inv),
        'aperti', (SELECT count(*) FROM inv WHERE inv.opened_at IS NOT NULL),
        'programmati', (SELECT count(*) FROM prog),
        'primo_invio', (SELECT min(inv.sent_at) FROM inv),
        'ultimo_invio', (SELECT max(inv.sent_at) FROM inv),
        'prossimo_invio', (SELECT min(prog.scheduled_for) FROM prog),
        'ultimo_programmato', (SELECT max(prog.scheduled_for) FROM prog),
        'ore_mediane_risposta', (
          SELECT round((percentile_cont(0.5) WITHIN GROUP (
                   ORDER BY extract(epoch FROM (risp.risposta_at - risp.primo_at)) / 3600.0))::numeric, 1)
            FROM risp WHERE risp.primo_at IS NOT NULL AND risp.risposta_at >= risp.primo_at)),
    'passi', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'passo', n.passo,
        'canale', coalesce(d.channel, 'email'),
        'oggetto', d.subject,
        'giorno', d.delay_days,
        'inviati', coalesce(ip.inviati, 0),
        'aperti', coalesce(ip.aperti, 0),
        'risposte', coalesce(rp.risposte, 0),
        'interessati', coalesce(rp.interessati, 0),
        'rimbalzi', coalesce(up.rimbalzi, 0),
        'disiscritti', coalesce(up.disiscritti, 0),
        'in_attesa', coalesce(up.in_attesa, 0)
      ) ORDER BY n.passo), '[]'::jsonb)
      FROM passi_n n
      LEFT JOIN passi_def d ON d.passo = n.passo
      LEFT JOIN inv_passo ip ON ip.passo = n.passo
      LEFT JOIN risp_passo rp ON rp.passo = n.passo
      LEFT JOIN usciti_passo up ON up.passo = n.passo),
    'giorni', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'giorno', to_char(g.giorno, 'YYYY-MM-DD'),
        'inviati', coalesce(a.n, 0),
        'programmati', coalesce(b.n, 0),
        'risposte', coalesce(c.n, 0)
      ) ORDER BY g.giorno), '[]'::jsonb)
      FROM giorni g
      LEFT JOIN inv_g a ON a.giorno = g.giorno
      LEFT JOIN prog_g b ON b.giorno = g.giorno
      LEFT JOIN risp_g c ON c.giorno = g.giorno),
    'caselle', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', sa.id, 'email', sa.email, 'stato', sa.status,
        'inviati', coalesce(ci.n, 0), 'programmati', coalesce(cp.n, 0),
        'risposte', coalesce(cr.n, 0), 'rimbalzi', coalesce(cb.n, 0)
      ) ORDER BY coalesce(ci.n, 0) DESC, coalesce(cp.n, 0) DESC, sa.email), '[]'::jsonb)
      FROM public.outreach_sender_accounts sa
      LEFT JOIN cas_inv ci ON ci.id = sa.id
      LEFT JOIN cas_prog cp ON cp.id = sa.id
      LEFT JOIN cas_risp cr ON cr.id = sa.id
      LEFT JOIN cas_rimb cb ON cb.id = sa.id
     WHERE sa.company_id = p_company AND (ci.n IS NOT NULL OR cp.n IS NOT NULL)),
    'esiti', (SELECT coalesce(jsonb_agg(jsonb_build_object('esito', x.esito, 'contatti', x.n) ORDER BY x.n DESC), '[]'::jsonb)
      FROM (
        SELECT CASE WHEN i.risposta_intent = 'interested' THEN 'interessato'
                    WHEN i.risposta_intent = 'question' THEN 'domanda'
                    WHEN i.risposta_intent = 'not_interested' THEN 'non_interessato'
                    WHEN i.risposta_intent = 'unsubscribe' THEN 'disiscrizione'
                    WHEN i.risposta_intent IS NULL THEN 'da_classificare'
                    ELSE 'altro' END AS esito,
               count(*) AS n
          FROM i WHERE starts_with(i.fase, 'risposta_')
         GROUP BY 1) x)
  )
  WHERE (SELECT public.is_super_admin());
$function$;
```

- [ ] **Step 3: Applicare via MCP**

Chiamare `apply_migration` (project id `rsbrguhkodgnqfomrevo`), `name`: `outreach_statistiche_opportunita`, `query`: il contenuto dello Step 2.

- [ ] **Step 4: Riallineare la versione**

```sql
update supabase_migrations.schema_migrations
   set version = '20280922210000'
 where name = 'outreach_statistiche_opportunita' and left(version, 4) = '2026';
```

- [ ] **Step 5: Verificare**

Run: `execute_sql` con `select outreach_campagna_statistiche('00000000-0000-0000-0000-000000000001'::uuid, null, 'Europe/Rome', 14) -> 'totali' -> 'opportunita_create';`
Expected: un numero (anche 0), non un errore.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20280922210000_outreach_statistiche_opportunita.sql
git commit -m "feat(db): opportunita_create/opportunita_vinte nell'RPC statistiche campagna outreach"
```

---

### Task 8: Frontend — estendere i tipi statistiche

**Files:**
- Modify: `src/components/admin/outreach/campagne/useCampagneOutreach.ts:184-190`

- [ ] **Step 1: Estendere l'interfaccia**

Sostituire:

```typescript
export interface StatisticheCampagna {
  aperture_tracciate: boolean;
  totali: {
    iscritti: number; contattati: number; da_contattare: number; in_corso: number; completati: number;
    risposte: number; interessati: number; non_interessati: number; rimbalzati: number; disiscritti: number;
    fermati: number; in_pausa: number;
  };
```

con:

```typescript
export interface StatisticheCampagna {
  aperture_tracciate: boolean;
  totali: {
    iscritti: number; contattati: number; da_contattare: number; in_corso: number; completati: number;
    risposte: number; interessati: number; non_interessati: number; rimbalzati: number; disiscritti: number;
    fermati: number; in_pausa: number; opportunita_create: number; opportunita_vinte: number;
  };
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: nessun nuovo errore introdotto da questo file (confrontare con `git stash` + rerun se il progetto ha già errori preesistenti, come annotato nella memoria del progetto — 1520 errori noti su main: verificare che il conteggio non SALGA per questo file).

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/outreach/campagne/useCampagneOutreach.ts
git commit -m "feat(outreach): tipi statistiche estesi con opportunita_create/opportunita_vinte"
```

---

### Task 9: Frontend — funnel visibile nelle Statistiche

**Files:**
- Modify: `src/components/admin/outreach/campagne/CampagnaStatistiche.tsx:56-63` (mappa etichette), `:413-443` (componente `Esiti`)

- [ ] **Step 1: Estendere la mappa etichette**

Sostituire (righe 56-63):

```typescript
const ESITO: Record<string, { etichetta: string; nota: string }> = {
  interessato: { etichetta: "Interessati", nota: "vogliono saperne di più" },
  domanda: { etichetta: "Domande", nota: "chiedono prezzi o dettagli" },
  non_interessato: { etichetta: "Non interessati", nota: "hanno detto di no" },
  disiscrizione: { etichetta: "Disiscrizioni", nota: "chiedono di non ricevere più" },
  altro: { etichetta: "Altro", nota: "da leggere" },
  da_classificare: { etichetta: "Da classificare", nota: "l'AI non le ha ancora lette" },
};
```

con:

```typescript
const ESITO: Record<string, { etichetta: string; nota: string }> = {
  interessato: { etichetta: "Interessati", nota: "vogliono saperne di più" },
  domanda: { etichetta: "Domande", nota: "chiedono prezzi o dettagli" },
  non_interessato: { etichetta: "Non interessati", nota: "hanno detto di no" },
  disiscrizione: { etichetta: "Disiscrizioni", nota: "chiedono di non ricevere più" },
  altro: { etichetta: "Altro", nota: "da leggere" },
  da_classificare: { etichetta: "Da classificare", nota: "l'AI non le ha ancora lette" },
  opportunita_creata: { etichetta: "Diventate opportunità", nota: "collegate al CRM in automatico" },
  vinta: { etichetta: "Vinte", nota: "contratto chiuso" },
};
```

- [ ] **Step 2: Aggiungere le 2 righe sintetiche al funnel**

`totale`/`max`/lo stato vuoto NON cambiano: restano "quante persone hanno
risposto" (serve alla nota del riquadro e allo stato vuoto) e "il più alto
tra gli esiti" (serve alla larghezza delle barre). Le opportunità sono un
SOTTO-insieme delle risposte, quindi "opportunità create: 5 · 25%" letto
come "25% delle risposte totali" resta un numero corretto — cambia solo
l'elenco che si itera, aggiungendo in coda le 2 righe sintetiche.

`function Esiti({ s }: { s: StatisticheCampagna })` (riga 413) è, per
intero, oggi:

```tsx
function Esiti({ s }: { s: StatisticheCampagna }) {
  const totale = s.esiti.reduce((a, e) => a + e.contatti, 0);
  const max = Math.max(1, ...s.esiti.map((e) => e.contatti));
  return (
    <Riquadro icona={MessageSquareReply} titolo="Com'è andata con chi ha risposto"
      nota={totale ? `${it(totale)} ${totale === 1 ? "persona ha" : "persone hanno"} risposto; l'AI legge ogni risposta e la classifica.` : undefined}>
      {totale === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          Ancora nessuna risposta. Le autorisposte (fuori ufficio, no-reply) non contano.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {s.esiti.map((e) => {
            const info = ESITO[e.esito] ?? { etichetta: e.esito, nota: "" };
            return (
              <li key={e.esito}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-foreground">{info.etichetta} <span className="text-xs font-normal text-muted-foreground">{info.nota}</span></span>
                  <span className="tabular-nums text-foreground">{it(e.contatti)} <span className="text-xs text-muted-foreground">· {percentuale(e.contatti, totale)}</span></span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-[#059669]" style={{ width: `${(e.contatti / max) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Riquadro>
  );
}
```

Sostituirla per intero con:

```tsx
function Esiti({ s }: { s: StatisticheCampagna }) {
  const totale = s.esiti.reduce((a, e) => a + e.contatti, 0);
  const max = Math.max(1, ...s.esiti.map((e) => e.contatti));
  // Le opportunità non sono un "esito" della risposta (un interessato può
  // ancora non essere diventato opportunità): righe sintetiche in coda alla
  // stessa lista, stesso rendering, percentuale calcolata sullo stesso
  // `totale` (risposte) — "opportunità create: 5 · 25%" si legge "25% delle
  // risposte totali", un numero corretto perché sono un sotto-insieme.
  const righe = [
    ...s.esiti,
    ...(s.totali.opportunita_create > 0 ? [{ esito: "opportunita_creata", contatti: s.totali.opportunita_create }] : []),
    ...(s.totali.opportunita_vinte > 0 ? [{ esito: "vinta", contatti: s.totali.opportunita_vinte }] : []),
  ];
  return (
    <Riquadro icona={MessageSquareReply} titolo="Com'è andata con chi ha risposto"
      nota={totale ? `${it(totale)} ${totale === 1 ? "persona ha" : "persone hanno"} risposto; l'AI legge ogni risposta e la classifica.` : undefined}>
      {totale === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          Ancora nessuna risposta. Le autorisposte (fuori ufficio, no-reply) non contano.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {righe.map((e) => {
            const info = ESITO[e.esito] ?? { etichetta: e.esito, nota: "" };
            return (
              <li key={e.esito}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-foreground">{info.etichetta} <span className="text-xs font-normal text-muted-foreground">{info.nota}</span></span>
                  <span className="tabular-nums text-foreground">{it(e.contatti)} <span className="text-xs text-muted-foreground">· {percentuale(e.contatti, totale)}</span></span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-[#059669]" style={{ width: `${(e.contatti / max) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Riquadro>
  );
}
```

(unica differenza reale: `const righe = [...]` in più, e `{righe.map(...)}` al posto di `{s.esiti.map(...)}` — tutto il resto, incluso lo stato vuoto, è testuale-identico all'originale.)

- [ ] **Step 3: Gate frontend**

Run: `npx eslint src/components/admin/outreach/campagne/CampagnaStatistiche.tsx`
Expected: nessun nuovo errore.

Run: `NODE_OPTIONS=--max-old-space-size=6144 node_modules/.bin/vite build`
Expected: EXIT 0.

Run: `npx tsc --noEmit`
Expected: nessun nuovo errore introdotto da questo file.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/outreach/campagne/CampagnaStatistiche.tsx
git commit -m "feat(outreach): funnel completo nelle Statistiche — opportunità create e vinte"
```

---

### Task 10: Frontend — chip "Opportunità creata" nella Pipeline email

**Files:**
- Modify: `src/components/admin/outreach/campagne/CampagnaPipeline.tsx`

- [ ] **Step 1: Aggiungere gli import mancanti**

In cima al file, dopo `import { useEffect, useMemo, useState } from "react";` (riga 12), verificare se `useQuery` e `supabase` sono già importati (non lo sono, in base alla lettura del file). Aggiungere dopo la riga 12:

```typescript
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
```

- [ ] **Step 2: Aggiungere la query delle opportunità aperte in `ElencoContatti`**

Dopo la riga `const righe = q.data?.righe ?? [];` (riga 510), aggiungere:

```typescript
  const contactIds = useMemo(
    () => (fase.gruppo === "risposta" ? righe.map((r) => r.contact_id).filter((id): id is string => !!id) : []),
    [righe, fase.gruppo],
  );
  const oppQ = useQuery({
    queryKey: ["outreach-campagne", "opportunita-aperte", companyId, contactIds],
    enabled: contactIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_opportunities")
        .select("id, contact_id")
        .eq("company_id", companyId)
        .eq("status", "open")
        .in("contact_id", contactIds);
      if (error) throw error;
      const m = new Map<string, string>();
      for (const o of (data ?? []) as Array<{ id: string; contact_id: string }>) m.set(o.contact_id, o.id);
      return m;
    },
  });
  const opportunitaPerContatto = oppQ.data ?? new Map<string, string>();
```

(`useMemo` è già importato dalla riga 12 esistente.)

- [ ] **Step 3: Passare la mappa a `Riga`**

Sostituire (riga 557-559):

```tsx
              {righe.map((r) => (
                <Riga key={r.enrollment_id} r={r} gruppo={fase.gruppo} nPassi={Math.max(nPassi, passo ?? 0)} companyId={companyId} adesso={adesso} />
              ))}
```

con:

```tsx
              {righe.map((r) => (
                <Riga
                  key={r.enrollment_id} r={r} gruppo={fase.gruppo} nPassi={Math.max(nPassi, passo ?? 0)}
                  companyId={companyId} adesso={adesso}
                  opportunitaId={r.contact_id ? opportunitaPerContatto.get(r.contact_id) ?? null : null}
                />
              ))}
```

- [ ] **Step 4: Usare l'id nel componente `Riga`**

Sostituire la firma (riga 582):

```typescript
function Riga({ r, gruppo, nPassi, companyId, adesso }: { r: ContattoCampagna; gruppo: FaseVista["gruppo"]; nPassi: number; companyId: string; adesso: number }) {
```

con:

```typescript
function Riga({ r, gruppo, nPassi, companyId, adesso, opportunitaId }: {
  r: ContattoCampagna; gruppo: FaseVista["gruppo"]; nPassi: number; companyId: string; adesso: number;
  opportunitaId: string | null;
}) {
```

Sostituire il blocco del pulsante (righe 613-620):

```tsx
          <td className="whitespace-nowrap px-4 py-2.5 text-right">
            {interessante && r.contact_id && (
              <OutreachConvertContactDialog
                companyId={companyId}
                initialContactId={r.contact_id}
                trigger={<Button size="sm" variant="outline" className="h-7 px-2 text-xs">Crea opportunità</Button>}
              />
            )}
          </td>
```

con:

```tsx
          <td className="whitespace-nowrap px-4 py-2.5 text-right">
            {interessante && r.contact_id && (
              opportunitaId ? (
                <Link
                  to={`/admin/marketing/opportunita?apri=${opportunitaId}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  <Sparkles className="h-3 w-3" /> Opportunità creata
                </Link>
              ) : (
                <OutreachConvertContactDialog
                  companyId={companyId}
                  initialContactId={r.contact_id}
                  trigger={<Button size="sm" variant="outline" className="h-7 px-2 text-xs">Crea opportunità</Button>}
                />
              )
            )}
          </td>
```

(`Link` è già importato in cima al file — riga 13 — e `Sparkles` è già nella lista import di lucide-react — riga 16.)

- [ ] **Step 5: Gate frontend**

Run: `npx eslint src/components/admin/outreach/campagne/CampagnaPipeline.tsx`
Expected: nessun nuovo errore.

Run: `NODE_OPTIONS=--max-old-space-size=6144 node_modules/.bin/vite build`
Expected: EXIT 0.

Run: `npx tsc --noEmit`
Expected: nessun nuovo errore introdotto da questo file.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/outreach/campagne/CampagnaPipeline.tsx
git commit -m "feat(outreach): chip Opportunità creata nella Pipeline email, link diretto alla scheda"
```

---

### Task 11: Frontend — chip "Opportunità creata" nelle Risposte WhatsApp

**Files:**
- Modify: `src/components/admin/whatsapp-locale/RisposteCampagna.tsx`

- [ ] **Step 1: Aggiungere l'import**

Dopo `import { supabase } from "@/integrations/supabase/client";` (riga 18), aggiungere:

```typescript
import { Link } from "react-router-dom";
```

(Nota: `useNavigate` da `react-router-dom` è già importato alla riga 17 — `Link` va aggiunto separatamente sulla stessa riga o su una nuova, es. `import { Link, useNavigate } from "react-router-dom";` sostituendo la riga 17 esistente, per evitare due import dallo stesso modulo.)

- [ ] **Step 2: Aggiungere la query delle opportunità aperte**

Dopo il blocco `const { data: ab = [] } = useQuery({...});` (chiude a riga 79), aggiungere:

```typescript
  const contactIds = [...new Set(risposte.map((r) => r.contact_id).filter(Boolean))];
  const { data: opportunitaPerContatto = new Map<string, string>() } = useQuery({
    queryKey: ["openwa-opportunita-aperte", campagnaId, contactIds],
    enabled: aperta && contactIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_opportunities")
        .select("id, contact_id")
        .eq("status", "open")
        .in("contact_id", contactIds);
      if (error) throw error;
      const m = new Map<string, string>();
      for (const o of (data ?? []) as Array<{ id: string; contact_id: string }>) m.set(o.contact_id, o.id);
      return m;
    },
  });
```

- [ ] **Step 3: Mostrare il chip accanto al badge esito**

Sostituire (righe 156-158):

```tsx
                    {eb
                      ? <Badge variant="secondary" className={`text-[10px] ${eb.cls}`}>{eb.label}</Badge>
                      : <Badge variant="outline" className="text-[10px]">da qualificare</Badge>}
```

con:

```tsx
                    {eb
                      ? <Badge variant="secondary" className={`text-[10px] ${eb.cls}`}>{eb.label}</Badge>
                      : <Badge variant="outline" className="text-[10px]">da qualificare</Badge>}
                    {opportunitaPerContatto.get(r.contact_id) && (
                      <Link
                        to={`/admin/marketing/opportunita?apri=${opportunitaPerContatto.get(r.contact_id)}`}
                        className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        <Sparkles className="h-3 w-3" /> Opportunità
                      </Link>
                    )}
```

- [ ] **Step 4: Aggiungere `Sparkles` all'import delle icone**

Sostituire (riga 26):

```typescript
import { MessageCircle, Sparkles, Loader2 } from "lucide-react";
```

Verificare che `Sparkles` sia già presente (lo è — riga 26 originale) — nessuna modifica necessaria qui, solo conferma.

- [ ] **Step 5: Gate frontend**

Run: `npx eslint src/components/admin/whatsapp-locale/RisposteCampagna.tsx`
Expected: nessun nuovo errore.

Run: `NODE_OPTIONS=--max-old-space-size=6144 node_modules/.bin/vite build`
Expected: EXIT 0.

Run: `npx tsc --noEmit`
Expected: nessun nuovo errore introdotto da questo file.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/whatsapp-locale/RisposteCampagna.tsx
git commit -m "feat(whatsapp): chip Opportunità creata nel report risposte campagna"
```

---

### Task 12: Frontend — coda calda unificata in "Oggi"

**Files:**
- Create: `src/components/admin/outreach/OutreachHotQueue.tsx`
- Modify: `src/pages/admin/marketing/AdminMarketingDashboard.tsx`
- Delete: `src/components/admin/outreach/OutreachInboxPreview.tsx`, `src/components/admin/outreach/OutreachActivityFeed.tsx`

- [ ] **Step 1: Confermare che i 2 file da eliminare non sono usati altrove**

Run: `grep -rln "OutreachInboxPreview\|OutreachActivityFeed" src/`
Expected: solo `OutreachInboxPreview.tsx`, `OutreachActivityFeed.tsx` (le loro stesse definizioni) e `AdminMarketingDashboard.tsx` (verificato il 22/09/2026 — riverificare, un altro terminale potrebbe averli riusati nel frattempo; se compare un altro file, NON eliminare, solo sostituire l'uso in Oggi).

- [ ] **Step 2: Creare il componente**

```tsx
/**
 * OutreachHotQueue — coda calda unificata per "Oggi": risposte interessate
 * di ENTRAMBI i canali (email outreach + WhatsApp Locale), in un'unica
 * lista ordinata per calore, con lo stato "già un'opportunità" visibile a
 * colpo d'occhio. Sostituisce OutreachInboxPreview (solo email, ordinata
 * per non-letto invece che per interesse) + OutreachActivityFeed (log
 * piatto, cieco su WhatsApp): "non letto" non è il criterio giusto — una
 * risposta interessata già letta da qualcuno resta prioritaria finché non
 * è stata gestita.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Flame, ArrowRight, AlertTriangle, MailOpen, Mail, MessageCircle, Sparkles } from "lucide-react";
import { OutreachConvertContactDialog } from "./OutreachConvertContactDialog";

interface VoceCalda {
  id: string;
  canale: "email" | "whatsapp";
  contactId: string;
  nome: string;
  frammento: string | null;
  intento: "interessato" | "domanda";
  quando: string;
  opportunitaId: string | null;
}

async function contattiEOpportunita(companyId: string, contactIds: string[]) {
  if (contactIds.length === 0) {
    return { contattoById: new Map<string, { first_name: string; last_name: string | null; company_name: string | null }>(), oppByContatto: new Map<string, string>() };
  }
  const [{ data: contatti }, { data: opp }] = await Promise.all([
    supabase.from("marketing_contacts").select("id, first_name, last_name, company_name").in("id", contactIds),
    supabase.from("marketing_opportunities").select("id, contact_id").eq("company_id", companyId).eq("status", "open").in("contact_id", contactIds),
  ]);
  const contattoById = new Map((contatti ?? []).map((c) => [c.id, c] as const));
  const oppByContatto = new Map((opp ?? []).map((o) => [o.contact_id, o.id] as const));
  return { contattoById, oppByContatto };
}

function nomeContatto(c: { first_name?: string | null; last_name?: string | null; company_name?: string | null } | undefined): string {
  if (!c) return "Contatto";
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company_name || "Contatto";
}

function useVociEmail(companyId: string) {
  return useQuery({
    queryKey: ["outreach-hot-queue", "email", companyId],
    staleTime: 30_000,
    queryFn: async (): Promise<VoceCalda[]> => {
      // outreach_replies non è ancora nei tipi generati.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data, error } = await db
        .from("outreach_replies")
        .select("id, contact_id, snippet, intent, received_at")
        .eq("company_id", companyId)
        .in("intent", ["interested", "question"])
        .order("received_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      const righe = (data ?? []) as Array<{ id: string; contact_id: string | null; snippet: string | null; intent: string; received_at: string }>;
      const contactIds = [...new Set(righe.map((r) => r.contact_id).filter((id): id is string => !!id))];
      const { contattoById, oppByContatto } = await contattiEOpportunita(companyId, contactIds);
      return righe
        .filter((r): r is typeof r & { contact_id: string } => !!r.contact_id)
        .map((r) => ({
          id: `email-${r.id}`,
          canale: "email" as const,
          contactId: r.contact_id,
          nome: nomeContatto(contattoById.get(r.contact_id)),
          frammento: r.snippet,
          intento: r.intent === "interested" ? ("interessato" as const) : ("domanda" as const),
          quando: r.received_at,
          opportunitaId: oppByContatto.get(r.contact_id) ?? null,
        }));
    },
  });
}

function useVociWhatsapp(companyId: string) {
  return useQuery({
    queryKey: ["outreach-hot-queue", "whatsapp", companyId],
    staleTime: 30_000,
    queryFn: async (): Promise<VoceCalda[]> => {
      // openwa_* non è ancora nei tipi generati.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data, error } = await db
        .from("openwa_campagna_destinatari")
        .select("id, contact_id, esito, esito_at")
        .in("esito", ["appuntamento", "da_ricontattare"])
        .order("esito_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      const righe = (data ?? []) as Array<{ id: string; contact_id: string | null; esito: string; esito_at: string | null }>;
      const contactIds = [...new Set(righe.map((r) => r.contact_id).filter((id): id is string => !!id))];
      if (contactIds.length === 0) return [];
      const [{ contattoById, oppByContatto }, { data: msgs }] = await Promise.all([
        contattiEOpportunita(companyId, contactIds),
        db.from("openwa_messages").select("contact_id, body, created_at")
          .in("contact_id", contactIds).eq("direction", "inbound").order("created_at", { ascending: false }),
      ]);
      const ultimoMsgPerContatto = new Map<string, string>();
      for (const m of (msgs ?? []) as Array<{ contact_id: string | null; body: string | null }>) {
        if (m.contact_id && m.body && !ultimoMsgPerContatto.has(m.contact_id)) ultimoMsgPerContatto.set(m.contact_id, m.body);
      }
      return righe
        .filter((r): r is typeof r & { contact_id: string } => !!r.contact_id)
        .map((r) => ({
          id: `whatsapp-${r.id}`,
          canale: "whatsapp" as const,
          contactId: r.contact_id,
          nome: nomeContatto(contattoById.get(r.contact_id)),
          frammento: ultimoMsgPerContatto.get(r.contact_id) ?? null,
          intento: r.esito === "appuntamento" ? ("interessato" as const) : ("domanda" as const),
          quando: r.esito_at ?? new Date(0).toISOString(),
          opportunitaId: oppByContatto.get(r.contact_id) ?? null,
        }));
    },
  });
}

export function OutreachHotQueue({ companyId, onOpenMailbox }: { companyId: string; onOpenMailbox: () => void }) {
  const email = useVociEmail(companyId);
  const whatsapp = useVociWhatsapp(companyId);
  const isLoading = email.isLoading || whatsapp.isLoading;
  const errored = !!email.error || !!whatsapp.error;

  const voci = useMemo(() => {
    const tutte = [...(email.data ?? []), ...(whatsapp.data ?? [])];
    return tutte.sort((a, b) => {
      if (a.intento !== b.intento) return a.intento === "interessato" ? -1 : 1;
      return new Date(b.quando).getTime() - new Date(a.quando).getTime();
    });
  }, [email.data, whatsapp.data]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <Flame className="h-4 w-4 text-primary" />
          </span>
          Risposte calde
          {voci.length > 0 && <Badge className="h-5 min-w-5 justify-center bg-primary px-1.5 tabular-nums">{voci.length}</Badge>}
        </CardTitle>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={onOpenMailbox}>
          Apri la Posta <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-1 p-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-1/3" /><Skeleton className="h-3 w-2/3" /></div>
              </div>
            ))}
          </div>
        ) : errored ? (
          <div className="flex items-center gap-2 px-5 py-4 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Errore nel caricamento delle risposte calde.
          </div>
        ) : voci.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-5 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <MailOpen className="h-6 w-6 text-muted-foreground/60" />
            </span>
            <p className="text-sm font-medium">Tutto sotto controllo</p>
            <p className="text-xs text-muted-foreground">Nessuna risposta calda al momento, su nessuno dei due canali.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {voci.slice(0, 8).map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className={cn("text-xs", v.canale === "email" ? "bg-primary/10 text-primary" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300")}>
                    {v.canale === "email" ? <Mail className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{v.nome}</span>
                    <Badge
                      variant="outline"
                      className={cn("shrink-0 text-[10px]", v.intento === "interessato" && "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400")}
                    >
                      {v.intento === "interessato" ? "Interessato" : "Domanda"}
                    </Badge>
                  </div>
                  {v.frammento && <p className="truncate text-xs text-muted-foreground">«{v.frammento}»</p>}
                </div>
                <div className="shrink-0 text-right">
                  {v.opportunitaId ? (
                    <Link
                      to={`/admin/marketing/opportunita?apri=${v.opportunitaId}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      <Sparkles className="h-3 w-3" /> Opportunità
                    </Link>
                  ) : (
                    <OutreachConvertContactDialog
                      companyId={companyId}
                      initialContactId={v.contactId}
                      trigger={<Button size="sm" variant="outline" className="h-7 px-2 text-xs">Crea opportunità</Button>}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Sostituire i 2 widget in `AdminMarketingDashboard.tsx`**

Sostituire l'import (righe 19-20):

```typescript
import { OutreachInboxPreview } from "@/components/admin/outreach/OutreachInboxPreview";
import { OutreachActivityFeed } from "@/components/admin/outreach/OutreachActivityFeed";
```

con:

```typescript
import { OutreachHotQueue } from "@/components/admin/outreach/OutreachHotQueue";
```

Sostituire la sezione (dentro il tab "oggi"):

```tsx
            <Reveal className="space-y-3" delay={0.06}>
              <SectionLabel>Da leggere &amp; attività</SectionLabel>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <OutreachInboxPreview companyId={companyId} onOpenMailbox={() => setTab("posta")} />
                <OutreachActivityFeed companyId={companyId} />
              </div>
            </Reveal>
```

con:

```tsx
            <Reveal className="space-y-3" delay={0.06}>
              <SectionLabel>Risposte calde</SectionLabel>
              <OutreachHotQueue companyId={companyId} onOpenMailbox={() => setTab("posta")} />
            </Reveal>
```

- [ ] **Step 4: Eliminare i 2 file orfani**

```bash
git rm src/components/admin/outreach/OutreachInboxPreview.tsx src/components/admin/outreach/OutreachActivityFeed.tsx
```

- [ ] **Step 5: Gate frontend**

Run: `npx eslint src/components/admin/outreach/OutreachHotQueue.tsx src/pages/admin/marketing/AdminMarketingDashboard.tsx`
Expected: nessun errore.

Run: `NODE_OPTIONS=--max-old-space-size=6144 node_modules/.bin/vite build`
Expected: EXIT 0.

Run: `npx tsc --noEmit`
Expected: nessun nuovo errore introdotto da questi file.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/outreach/OutreachHotQueue.tsx src/pages/admin/marketing/AdminMarketingDashboard.tsx
git commit -m "feat(outreach): coda calda unificata email+whatsapp in Oggi, sostituisce i 2 widget separati"
```

---

## Dopo tutti i task

- [ ] **Verifica end-to-end locale**: aprire `/admin/marketing` (Demo o super_admin), tab "Oggi" → la sezione "Risposte calde" carica senza errori console; tab "Pipeline" su una campagna con risposte → il chip appare per chi ha già un'opportunità aperta; tab "Statistiche" → il funnel mostra "Diventate opportunità" quando ce ne sono.
- [ ] **Il backfill (Task 6) NON si invoca da questo piano** — è pronto ma resta da eseguire come passo separato quando l'utente conferma di voler applicare la logica anche allo storico (chiamata autenticata come super_admin a `outreach-opportunita-backfill`, da ripetere finché il riepilogo non segna più classificazioni da fare — il `LOTTO` di 50 per chiamata è voluto, per poter verificare tra un giro e l'altro).
- [ ] Non pushare — resta tutto locale finché l'utente non lo chiede esplicitamente.
