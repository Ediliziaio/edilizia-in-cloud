# Calendari lavori — Pezzo 2: le pose viaggiano (EiC ⇄ Google)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inizio/fine lavori con orari; ogni commessa con squadra diventa un evento nel calendario Google della squadra (e nel calendario aziendale Posa); se la squadra sposta l'evento su Google, le date in EiC si spostano.

**Architecture:** Tre tabelle nuove (`google_calendar_order_events` mappa commessa→evento per calendario, `google_calendar_sync_queue` coda, `google_calendar_watches` un canale per calendario). Trigger su `orders`/`order_external_teams` accodano e svegliano la edge `google-calendar-sync` via pg_net con `x-cron-secret`; la edge guadagna `process-order-queue` (push) e `pull-calendar` (ritorno), riusando token, PATCH/DELETE e cooldown già esistenti. Il webhook risolve prima i canali per-calendario. Le funzioni pure (payload evento, lettura date da Google) stanno in `_shared` e sono testate con vitest.

**Tech Stack:** Postgres (pg_net, vault), edge Deno, React + TanStack Query, vitest.

Spec: `docs/superpowers/specs/2026-09-08-calendari-lavori-squadre-design.md` (pezzo 2).

---

## Mappa dei file

| File | Ruolo |
|---|---|
| `supabase/migrations/20280912000001_pose_google_sync.sql` | orari, tabelle, trigger di accodamento, funzione di risveglio |
| `supabase/functions/_shared/posaEvento.ts` | funzioni pure: evento Google da commessa, date/ore da evento Google |
| `src/test/logic/posaEvento.test.ts` | test delle funzioni pure |
| `supabase/functions/google-calendar-sync/index.ts` | `process-order-queue`, `push-order`, `pull-calendar`, busy dai calendari squadra |
| `supabase/functions/google-calendar-webhook/index.ts` | canali per calendario: `register_calendar_watch`, risoluzione, rinnovo |
| `src/hooks/useCalendariLavori.ts` | dopo il collegamento registra il canale |
| `src/types/calendar.ts`, `src/components/calendar/EditOrderDatesDialog.tsx` | orari inizio/fine + preset mezza giornata + push immediato |
| `src/components/calendar/CalendarWeekView.tsx` | lavori con orario nella griglia |
| `src/pages/azienda/Calendar.tsx` | select con gli orari |

---

### Task 1: Migrazione — orari, mappa, coda, canali, trigger

**Files:**
- Create: `supabase/migrations/20280912000001_pose_google_sync.sql`

- [ ] **Step 1: Scrivere la migrazione**

```sql
-- Le pose viaggiano (08/09/2026): orari sui lavori, mappa commessa→evento
-- Google per calendario, coda di sync, un canale webhook per calendario.
-- Vedi docs/superpowers/specs/2026-09-08-calendari-lavori-squadre-design.md.
--
-- Il trigger degli appuntamenti (notify_google_calendar_sync) legge la service
-- key dal vault, dove NON esiste: salta in silenzio da sempre. Qui si usa il
-- pattern che funziona: x-cron-secret da vault.silvio_internal_cron_secret,
-- come cliente_notifica_invia.
-- Applicata sul live via Management API, poi migration repair 20280912000001.

-- ── Orari sui lavori ─────────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS work_start_time time,
  ADD COLUMN IF NOT EXISTS work_end_time time;
COMMENT ON COLUMN public.orders.work_start_time IS 'Ora di inizio dei lavori (null = tutto il giorno)';
COMMENT ON COLUMN public.orders.work_end_time IS 'Ora di fine dei lavori (null = tutto il giorno)';

-- ── Mappa commessa → evento Google, uno per calendario ───────────────────────
CREATE TABLE IF NOT EXISTS public.google_calendar_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  external_team_id uuid REFERENCES public.external_teams(id) ON DELETE CASCADE, -- null = calendario aziendale Posa
  google_connection_id uuid NOT NULL REFERENCES public.google_calendar_connections(id) ON DELETE CASCADE,
  google_calendar_id text NOT NULL,
  google_event_id text NOT NULL,
  etag text,
  last_updated_by text NOT NULL DEFAULT 'eic' CHECK (last_updated_by IN ('eic', 'google')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, google_calendar_id)
);
CREATE INDEX IF NOT EXISTS idx_gcal_order_events_event ON public.google_calendar_order_events (google_calendar_id, google_event_id);
ALTER TABLE public.google_calendar_order_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gcal_order_events_lettura_azienda ON public.google_calendar_order_events;
CREATE POLICY gcal_order_events_lettura_azienda ON public.google_calendar_order_events
  FOR SELECT USING (company_id = public.get_user_company_id((SELECT auth.uid())));
GRANT SELECT ON public.google_calendar_order_events TO authenticated;

-- ── Coda ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.google_calendar_sync_queue (
  id bigserial PRIMARY KEY,
  company_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('order')),
  entity_id uuid NOT NULL,
  reason text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gcal_sync_queue_pending ON public.google_calendar_sync_queue (created_at) WHERE processed_at IS NULL;
ALTER TABLE public.google_calendar_sync_queue ENABLE ROW LEVEL SECURITY; -- solo service role

-- ── Un canale per calendario ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.google_calendar_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.google_calendar_connections(id) ON DELETE CASCADE,
  calendar_id text NOT NULL,
  channel_id text NOT NULL,
  resource_id text,
  channel_token text NOT NULL,
  expiry_at timestamptz,
  last_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, calendar_id)
);
CREATE INDEX IF NOT EXISTS idx_gcal_watches_channel ON public.google_calendar_watches (channel_id);
ALTER TABLE public.google_calendar_watches ENABLE ROW LEVEL SECURITY; -- solo service role

-- ── Risveglio della edge ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.google_calendar_sveglia(p_action text, p_body jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets
   WHERE name = 'silvio_internal_cron_secret' LIMIT 1;
  IF v_secret IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/google-calendar-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('action', p_action) || coalesce(p_body, '{}'::jsonb),
    timeout_milliseconds := 8000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'google_calendar_sveglia: %', SQLERRM;
END
$$;
REVOKE ALL ON FUNCTION public.google_calendar_sveglia(text, jsonb) FROM PUBLIC, anon, authenticated;

-- ── Accodare una commessa ────────────────────────────────────────────────────
-- Salta le aziende senza niente di collegato: niente coda inutile.
CREATE OR REPLACE FUNCTION public.google_calendar_accoda_commessa(p_company_id uuid, p_order_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.external_teams t WHERE t.company_id = p_company_id AND t.google_sync_enabled AND t.google_calendar_id IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.company_calendar_links l WHERE l.company_id = p_company_id AND l.enabled AND l.google_calendar_id IS NOT NULL
  ) THEN RETURN; END IF;
  INSERT INTO public.google_calendar_sync_queue (company_id, entity_type, entity_id, reason)
  VALUES (p_company_id, 'order', p_order_id, p_reason);
  PERFORM public.google_calendar_sveglia('process-order-queue', jsonb_build_object('companyId', p_company_id));
END
$$;

CREATE OR REPLACE FUNCTION public.trg_fn_orders_google_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.work_start_date IS DISTINCT FROM NEW.work_start_date OR
    OLD.work_end_date   IS DISTINCT FROM NEW.work_end_date   OR
    OLD.work_start_time IS DISTINCT FROM NEW.work_start_time OR
    OLD.work_end_time   IS DISTINCT FROM NEW.work_end_time   OR
    OLD.description     IS DISTINCT FROM NEW.description     OR
    OLD.indirizzo_lavori IS DISTINCT FROM NEW.indirizzo_lavori
  ) THEN
    PERFORM public.google_calendar_accoda_commessa(NEW.company_id, NEW.id, 'date');
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_orders_google_sync ON public.orders;
CREATE TRIGGER trg_orders_google_sync
  AFTER UPDATE OF work_start_date, work_end_date, work_start_time, work_end_time, description, indirizzo_lavori
  ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_fn_orders_google_sync();

CREATE OR REPLACE FUNCTION public.trg_fn_order_teams_google_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_order_id uuid := coalesce(NEW.order_id, OLD.order_id); v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.orders WHERE id = v_order_id;
  IF v_company IS NOT NULL THEN
    PERFORM public.google_calendar_accoda_commessa(v_company, v_order_id, 'squadra');
  END IF;
  RETURN coalesce(NEW, OLD);
END
$$;
DROP TRIGGER IF EXISTS trg_order_teams_google_sync ON public.order_external_teams;
CREATE TRIGGER trg_order_teams_google_sync
  AFTER INSERT OR DELETE ON public.order_external_teams
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_order_teams_google_sync();
```

- [ ] **Step 2: Applicare sul live + repair** (stesso comando del pezzo 1, versione `20280912000001`).
- [ ] **Step 3: Verificare**: `select count(*) from google_calendar_order_events; select tgname from pg_trigger where tgname in ('trg_orders_google_sync','trg_order_teams_google_sync');`
- [ ] **Step 4: Commit** — `git commit -m "Orari sui lavori, mappa commessa→evento Google, coda e canali per calendario"`

---

### Task 2: Funzioni pure `posaEvento.ts` (con test)

**Files:**
- Create: `supabase/functions/_shared/posaEvento.ts`
- Test: `src/test/logic/posaEvento.test.ts`

- [ ] **Step 1: Test che fallisce**

```ts
import { describe, it, expect } from "vitest";
import { costruisciEventoPosa, leggiDateDaEventoGoogle, giornoDopo } from "../../../supabase/functions/_shared/posaEvento";

const base = { id: "o1", company_id: "c1", order_code: "DEMO-0042", client_name: "Rossi Mario", description: "Finestre", indirizzo_lavori: "Via Roma 1, Meda" };

describe("costruisciEventoPosa", () => {
  it("con orari fa un evento a orario, in Europe/Rome", () => {
    const e = costruisciEventoPosa({ ...base, work_start_date: "2026-09-10", work_end_date: "2026-09-10", work_start_time: "08:00:00", work_end_time: "12:00:00" });
    expect(e.summary).toBe("Posa · DEMO-0042 · Rossi Mario");
    expect(e.start).toEqual({ dateTime: "2026-09-10T08:00:00", timeZone: "Europe/Rome" });
    expect(e.end).toEqual({ dateTime: "2026-09-10T12:00:00", timeZone: "Europe/Rome" });
    expect(e.location).toBe("Via Roma 1, Meda");
    expect(e.extendedProperties.private.eic_order_id).toBe("o1");
  });
  it("senza orari fa un evento tutto-il-giorno con fine esclusiva", () => {
    const e = costruisciEventoPosa({ ...base, work_start_date: "2026-09-10", work_end_date: "2026-09-12", work_start_time: null, work_end_time: null });
    expect(e.start).toEqual({ date: "2026-09-10" });
    expect(e.end).toEqual({ date: "2026-09-13" });
  });
  it("senza fine usa l'inizio", () => {
    const e = costruisciEventoPosa({ ...base, work_start_date: "2026-09-10", work_end_date: null, work_start_time: null, work_end_time: null });
    expect(e.end).toEqual({ date: "2026-09-11" });
  });
});

describe("leggiDateDaEventoGoogle", () => {
  it("evento a orario → date e ore", () => {
    expect(leggiDateDaEventoGoogle({ start: { dateTime: "2026-09-11T09:30:00+02:00" }, end: { dateTime: "2026-09-11T13:00:00+02:00" } }))
      .toEqual({ work_start_date: "2026-09-11", work_end_date: "2026-09-11", work_start_time: "09:30:00", work_end_time: "13:00:00" });
  });
  it("tutto-il-giorno → fine inclusiva, ore nulle", () => {
    expect(leggiDateDaEventoGoogle({ start: { date: "2026-09-10" }, end: { date: "2026-09-13" } }))
      .toEqual({ work_start_date: "2026-09-10", work_end_date: "2026-09-12", work_start_time: null, work_end_time: null });
  });
  it("giornoDopo e giornoPrima non sbagliano il cambio mese", () => {
    expect(giornoDopo("2026-09-30")).toBe("2026-10-01");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/test/logic/posaEvento.test.ts` → FAIL (modulo mancante).

- [ ] **Step 3: Scrivere `supabase/functions/_shared/posaEvento.ts`**

```ts
/**
 * La posa come evento Google, e il ritorno. Funzioni pure, senza Deno né
 * Supabase: le testa vitest da src/test/logic/posaEvento.test.ts.
 *
 * Regole: con orari → evento a orario in Europe/Rome; senza → tutto-il-giorno,
 * dove Google vuole la fine ESCLUSIVA (il giorno dopo l'ultimo). Il legame con
 * la commessa sta in extendedProperties.private, non nella descrizione.
 */
export interface CommessaPerEvento {
  id: string;
  company_id: string;
  order_code: string | null;
  client_name: string | null;
  description: string | null;
  indirizzo_lavori: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
  work_start_time: string | null;
  work_end_time: string | null;
}

export interface EventoGoogle {
  summary: string;
  description: string;
  location?: string;
  start: { date: string } | { dateTime: string; timeZone: string };
  end: { date: string } | { dateTime: string; timeZone: string };
  extendedProperties: { private: { eic_order_id: string; eic_company_id: string; eic_kind: "posa" } };
}

const APP_URL = "https://app.ediliziaincloud.com";

function normalizzaOra(t: string): string {
  const [h = "00", m = "00", s = "00"] = t.split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:${(s || "00").padStart(2, "0")}`;
}

export function giornoDopo(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function giornoPrima(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function costruisciEventoPosa(o: CommessaPerEvento): EventoGoogle {
  if (!o.work_start_date) throw new Error("Commessa senza data di inizio lavori");
  const fine = o.work_end_date && o.work_end_date >= o.work_start_date ? o.work_end_date : o.work_start_date;
  const conOrari = !!o.work_start_time && !!o.work_end_time;
  const summary = ["Posa", o.order_code, o.client_name].filter(Boolean).join(" · ");
  const description = [o.description || "", "", `${APP_URL}/azienda/ordini/${o.id}`].join("\n");
  return {
    summary,
    description,
    ...(o.indirizzo_lavori ? { location: o.indirizzo_lavori } : {}),
    start: conOrari
      ? { dateTime: `${o.work_start_date}T${normalizzaOra(o.work_start_time!)}`, timeZone: "Europe/Rome" }
      : { date: o.work_start_date },
    end: conOrari
      ? { dateTime: `${fine}T${normalizzaOra(o.work_end_time!)}`, timeZone: "Europe/Rome" }
      : { date: giornoDopo(fine) },
    extendedProperties: { private: { eic_order_id: o.id, eic_company_id: o.company_id, eic_kind: "posa" } },
  };
}

export interface DateLavori {
  work_start_date: string;
  work_end_date: string;
  work_start_time: string | null;
  work_end_time: string | null;
}

/** Da un evento Google (a orario o tutto-il-giorno) alle date/ore della commessa. */
export function leggiDateDaEventoGoogle(ev: {
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}): DateLavori | null {
  if (ev.start?.date && ev.end?.date) {
    return { work_start_date: ev.start.date, work_end_date: giornoPrima(ev.end.date), work_start_time: null, work_end_time: null };
  }
  if (ev.start?.dateTime && ev.end?.dateTime) {
    // Google manda l'offset locale del calendario (es. +02:00): la parte
    // "YYYY-MM-DDTHH:MM:SS" è già l'ora di Roma se il calendario è italiano.
    const s = ev.start.dateTime, e = ev.end.dateTime;
    return {
      work_start_date: s.slice(0, 10),
      work_end_date: e.slice(0, 10),
      work_start_time: s.slice(11, 19),
      work_end_time: e.slice(11, 19),
    };
  }
  return null;
}

/** Vero se le date/ore della commessa e dell'evento coincidono: niente da scrivere. */
export function stesseDate(a: DateLavori, b: DateLavori): boolean {
  return a.work_start_date === b.work_start_date && a.work_end_date === b.work_end_date
    && (a.work_start_time ?? null) === (b.work_start_time ?? null) && (a.work_end_time ?? null) === (b.work_end_time ?? null);
}
```

- [ ] **Step 4: Run** → PASS (6 test).
- [ ] **Step 5: Commit** — `git commit -m "La posa come evento Google, andata e ritorno: funzioni pure testate"`

---

### Task 3: Edge `google-calendar-sync` — coda, push e ritorno

**Files:**
- Modify: `supabase/functions/google-calendar-sync/index.ts`

- [ ] **Step 1: Import e accesso interno.** In cima: `import { costruisciEventoPosa, leggiDateDaEventoGoogle, stesseDate } from "../_shared/posaEvento.ts";`. Nel dispatcher, PRIMA della lettura dell'`authHeader` (la chiamata interna non ha JWT):

```ts
    // Chiamate interne (trigger/cron via pg_net): x-cron-secret, come cliente-notifica.
    const internalSecret = Deno.env.get("INTERNAL_CRON_SECRET");
    const isInternal = !!internalSecret && req.headers.get("x-cron-secret") === internalSecret;
```
e subito dopo `const { action } = body;`:
```ts
    if (action === "process-order-queue") {
      if (!isInternal && token !== serviceRoleKey) return json({ error: "Unauthorized" }, 401);
      return json(await processOrderQueue(body.companyId ?? null));
    }
    if (action === "pull-calendar") {
      if (!isInternal && token !== serviceRoleKey) return json({ error: "Unauthorized" }, 401);
      return json(await pullCalendarOrders(body.connectionId, body.calendarId));
    }
```
(`token`/`serviceRoleKey` vanno calcolati prima di questi due `if`; oggi stanno dopo `cron-full-sync`: spostarli su.) L'azione utente `push-order` (dopo il controllo azienda): `case "push-order": if (!body.orderId) return json({ error: "orderId required" }, 400); return json(await syncOrderToGoogle(body.orderId));`

- [ ] **Step 2: `getConnectionById` + `processOrderQueue` + `syncOrderToGoogle`** (nuova sezione `// ---- POSE ----` prima di `// ---- HELPERS ----`):

```ts
async function getConnectionById(admin: ReturnType<typeof getSupabaseAdmin>, id: string) {
  const { data } = await admin.from("google_calendar_connections").select("*").eq("id", id).eq("status", "connected").maybeSingle();
  return data;
}

/** Svuota la coda (di un'azienda o di tutte): ogni commessa una volta sola, 3 tentativi. */
async function processOrderQueue(companyId: string | null): Promise<{ processed: number; failed: number }> {
  const admin = getSupabaseAdmin();
  let q = admin.from("google_calendar_sync_queue").select("id, company_id, entity_id, attempts").is("processed_at", null).lt("attempts", 3).order("created_at").limit(100);
  if (companyId) q = q.eq("company_id", companyId);
  const { data: righe } = await q;
  const perCommessa = new Map<string, number[]>();
  for (const r of righe ?? []) perCommessa.set(r.entity_id, [...(perCommessa.get(r.entity_id) ?? []), r.id]);
  let processed = 0, failed = 0;
  for (const [orderId, ids] of perCommessa) {
    try {
      await syncOrderToGoogle(orderId);
      await admin.from("google_calendar_sync_queue").update({ processed_at: new Date().toISOString() }).in("id", ids);
      processed++;
    } catch (e) {
      failed++;
      await admin.from("google_calendar_sync_queue").update({ attempts: (righe!.find(r => r.entity_id === orderId)?.attempts ?? 0) + 1, last_error: String((e as Error).message).slice(0, 300) }).in("id", ids);
    }
  }
  return { processed, failed };
}

interface Bersaglio { external_team_id: string | null; google_connection_id: string; google_calendar_id: string; }

/** La commessa raggiunge tutti i suoi calendari: squadre assegnate + Posa aziendale. */
async function syncOrderToGoogle(orderId: string): Promise<{ created: number; updated: number; removed: number }> {
  const admin = getSupabaseAdmin();
  const { data: order } = await admin.from("orders")
    .select("id, company_id, order_code, client_name, description, indirizzo_lavori, work_start_date, work_end_date, work_start_time, work_end_time")
    .eq("id", orderId).maybeSingle();
  if (!order) return { created: 0, updated: 0, removed: 0 };

  const { data: squadre } = await admin.from("order_external_teams")
    .select("external_team:external_teams(id, google_connection_id, google_calendar_id, google_sync_enabled)")
    .eq("order_id", orderId);
  const { data: link } = await admin.from("company_calendar_links")
    .select("google_connection_id, google_calendar_id, enabled").eq("company_id", order.company_id).eq("kind", "posa").maybeSingle();

  const bersagli: Bersaglio[] = [];
  for (const r of (squadre ?? []) as any[]) {
    const t = r.external_team;
    if (t?.google_sync_enabled && t.google_connection_id && t.google_calendar_id)
      bersagli.push({ external_team_id: t.id, google_connection_id: t.google_connection_id, google_calendar_id: t.google_calendar_id });
  }
  if (link?.enabled && link.google_connection_id && link.google_calendar_id)
    bersagli.push({ external_team_id: null, google_connection_id: link.google_connection_id, google_calendar_id: link.google_calendar_id });
  // Senza data di inizio non c'è evento: si toglie quello che c'era.
  const bersagliAttivi = order.work_start_date ? bersagli : [];

  const { data: mappe } = await admin.from("google_calendar_order_events").select("*").eq("order_id", orderId);
  let created = 0, updated = 0, removed = 0;

  // 1) via gli eventi dei calendari non più bersaglio
  for (const m of mappe ?? []) {
    if (bersagliAttivi.some(b => b.google_calendar_id === m.google_calendar_id)) continue;
    const conn = await getConnectionById(admin, m.google_connection_id);
    const token = conn ? await getValidAccessToken(admin, conn) : null;
    if (token) {
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(m.google_calendar_id)}/events/${encodeURIComponent(m.google_event_id)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) }).catch(() => {});
    }
    await admin.from("google_calendar_order_events").delete().eq("id", m.id);
    removed++;
  }

  // 2) crea o aggiorna sui bersagli
  if (bersagliAttivi.length === 0) return { created, updated, removed };
  const evento = costruisciEventoPosa(order as any);
  for (const b of bersagliAttivi) {
    const conn = await getConnectionById(admin, b.google_connection_id);
    const token = conn ? await getValidAccessToken(admin, conn) : null;
    if (!token) { await segnaErroreSquadra(admin, b, "Account Google non collegato o scaduto"); continue; }
    const esistente = (mappe ?? []).find(m => m.google_calendar_id === b.google_calendar_id);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(b.google_calendar_id)}/events` + (esistente ? `/${encodeURIComponent(esistente.google_event_id)}` : "");
    const res = await fetch(url, {
      method: esistente ? "PATCH" : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(evento),
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 404 && esistente) {
      // Evento sparito su Google (cancellato a mano): si ricrea.
      await admin.from("google_calendar_order_events").delete().eq("id", esistente.id);
      const res2 = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(b.google_calendar_id)}/events`,
        { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(evento), signal: AbortSignal.timeout(15000) });
      if (res2.ok) { await salvaMappa(admin, order, b, await res2.json(), null); created++; }
      else await segnaErroreSquadra(admin, b, `Google ${res2.status}`);
      continue;
    }
    if (!res.ok) { await segnaErroreSquadra(admin, b, `Google ${res.status}: ${(await res.text()).slice(0, 120)}`); continue; }
    await salvaMappa(admin, order, b, await res.json(), esistente?.id ?? null);
    esistente ? updated++ : created++;
    // Loop prevention: il webhook ignora l'eco di Google nei 15s successivi.
    await admin.from("google_calendar_connections").update({ last_sync_source: "crm", last_sync_at: new Date().toISOString() }).eq("id", conn!.id);
  }
  return { created, updated, removed };
}

async function salvaMappa(admin: ReturnType<typeof getSupabaseAdmin>, order: any, b: Bersaglio, g: any, mappaId: string | null) {
  const riga = {
    company_id: order.company_id, order_id: order.id, external_team_id: b.external_team_id,
    google_connection_id: b.google_connection_id, google_calendar_id: b.google_calendar_id,
    google_event_id: g.id, etag: g.etag ?? null, last_updated_by: "eic", last_synced_at: new Date().toISOString(),
    last_error: null, updated_at: new Date().toISOString(),
  };
  if (mappaId) await admin.from("google_calendar_order_events").update(riga).eq("id", mappaId);
  else await admin.from("google_calendar_order_events").insert(riga);
  if (b.external_team_id) await admin.from("external_teams").update({ google_last_sync_at: new Date().toISOString(), google_last_error: null }).eq("id", b.external_team_id);
  else await admin.from("company_calendar_links").update({ last_sync_at: new Date().toISOString(), last_error: null }).eq("company_id", order.company_id).eq("kind", "posa");
}

async function segnaErroreSquadra(admin: ReturnType<typeof getSupabaseAdmin>, b: Bersaglio, msg: string) {
  if (b.external_team_id) await admin.from("external_teams").update({ google_last_error: msg }).eq("id", b.external_team_id);
  else await admin.from("company_calendar_links").update({ last_error: msg }).eq("google_calendar_id", b.google_calendar_id).eq("google_connection_id", b.google_connection_id);
}
```

- [ ] **Step 3: `pullCalendarOrders` (Google → EiC)**

```ts
/** Legge un calendario di squadra (o Posa) e riporta in EiC gli eventi di commessa cambiati. */
async function pullCalendarOrders(connectionId: string, calendarId: string): Promise<{ changed: number; cancelled: number }> {
  const admin = getSupabaseAdmin();
  const conn = await getConnectionById(admin, connectionId);
  const token = conn ? await getValidAccessToken(admin, conn) : null;
  if (!token) return { changed: 0, cancelled: 0 };
  const params = new URLSearchParams({
    updatedMin: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
    singleEvents: "true", showDeleted: "true", maxResults: "250",
    privateExtendedProperty: "eic_kind=posa",
  });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return { changed: 0, cancelled: 0 };
  const eventi = ((await res.json()).items ?? []) as any[];
  let changed = 0, cancelled = 0;
  for (const ev of eventi) {
    const { data: m } = await admin.from("google_calendar_order_events").select("*").eq("google_calendar_id", calendarId).eq("google_event_id", ev.id).maybeSingle();
    if (!m) continue;
    if (ev.status === "cancelled") {
      // La squadra ha cancellato la posa dal suo calendario: si toglie la squadra
      // dalla commessa, le date restano. Sul calendario Posa aziendale si ricrea.
      await admin.from("google_calendar_order_events").delete().eq("id", m.id);
      if (m.external_team_id) {
        await admin.from("order_external_teams").delete().eq("order_id", m.order_id).eq("external_team_id", m.external_team_id);
        await avvisaCommessa(admin, m.order_id, m.external_team_id, "ha tolto la posa dal suo calendario", "");
      } else {
        await admin.from("google_calendar_sync_queue").insert({ company_id: m.company_id, entity_type: "order", entity_id: m.order_id, reason: "ricrea" });
      }
      cancelled++;
      continue;
    }
    if (m.etag === ev.etag) continue;
    const nuove = leggiDateDaEventoGoogle(ev);
    if (!nuove) continue;
    const { data: order } = await admin.from("orders").select("id, company_id, work_start_date, work_end_date, work_start_time, work_end_time").eq("id", m.order_id).maybeSingle();
    if (!order) continue;
    const attuali = { work_start_date: order.work_start_date ?? "", work_end_date: order.work_end_date ?? "", work_start_time: order.work_start_time, work_end_time: order.work_end_time };
    await admin.from("google_calendar_order_events").update({ etag: ev.etag ?? null, last_updated_by: "google", last_synced_at: new Date().toISOString() }).eq("id", m.id);
    if (stesseDate(attuali as any, nuove)) continue; // solo l'eco di un nostro push
    // Vince l'ultimo che ha toccato: qui è Google. Il trigger sulla commessa
    // riaccoda e riallinea gli altri calendari (Posa aziendale, altre squadre).
    await admin.from("orders").update({ ...nuove, updated_at: new Date().toISOString() }).eq("id", order.id);
    await avvisaCommessa(admin, order.id, m.external_team_id, "ha spostato la posa", `${nuove.work_start_date}${nuove.work_start_time ? " " + nuove.work_start_time.slice(0, 5) : ""} → ${nuove.work_end_date}${nuove.work_end_time ? " " + nuove.work_end_time.slice(0, 5) : ""}`);
    changed++;
  }
  return { changed, cancelled };
}

async function avvisaCommessa(admin: ReturnType<typeof getSupabaseAdmin>, orderId: string, teamId: string | null, cosa: string, dettaglio: string) {
  const { data: o } = await admin.from("orders").select("company_id, order_code, assigned_to, created_by").eq("id", orderId).maybeSingle();
  if (!o) return;
  const dest = o.assigned_to ?? o.created_by;
  if (!dest) return;
  let chi = "Il calendario Posa";
  if (teamId) { const { data: t } = await admin.from("external_teams").select("name").eq("id", teamId).maybeSingle(); chi = t?.name ? `Squadra ${t.name}` : "Una squadra"; }
  await admin.rpc("create_notification", {
    p_company_id: o.company_id, p_user_id: dest, p_type: "order",
    p_title: `${chi} ${cosa}: ${o.order_code ?? "commessa"}`, p_body: dettaglio,
    p_entity_type: "order", p_entity_id: orderId, p_action_url: `/azienda/ordini/${orderId}`,
  });
}
```

- [ ] **Step 4: Busy dai calendari squadra.** In `pullBusySlots`, dopo i `conflict_calendar_ids`, aggiungere i calendari collegati sulla stessa connessione, e saltare i nostri eventi:

```ts
  const { data: calSquadre } = await admin.from("external_teams").select("google_calendar_id").eq("google_connection_id", conn.id).eq("google_sync_enabled", true);
  (calSquadre ?? []).forEach((t: any) => t.google_calendar_id && calendarIdSet.add(t.google_calendar_id));
```
e nel ciclo eventi: `if (event.extendedProperties?.private?.eic_kind === "posa") continue;`

- [ ] **Step 5: Cron.** In `cronFullSync`, dopo il ciclo delle connessioni: `const coda = await processOrderQueue(null);` e per ogni riga di `google_calendar_watches` (`select connection_id, calendar_id`): `await pullCalendarOrders(w.connection_id, w.calendar_id)`. Aggiungere `coda` ai `results` del log.

- [ ] **Step 6: Deploy + commit** — `npx supabase functions deploy google-calendar-sync --project-ref rsbrguhkodgnqfomrevo --no-verify-jwt`; `git commit -m "Le pose escono sul calendario della squadra e tornano indietro se le spostano"`

---

### Task 4: Webhook — un canale per calendario

**Files:**
- Modify: `supabase/functions/google-calendar-webhook/index.ts`

- [ ] **Step 1: Risoluzione del canale.** All'inizio del ramo notifica (prima della ricerca su `google_calendar_connections`):

```ts
    const { data: watch } = await admin.from("google_calendar_watches")
      .select("id, connection_id, calendar_id, channel_token, last_notified_at").eq("channel_id", channelId).maybeSingle();
    if (watch) {
      if (watch.channel_token !== channelToken) return new Response("Invalid channel token", { status: 403 });
      if (watch.last_notified_at && Date.now() - new Date(watch.last_notified_at).getTime() < 10_000) return json({ ok: true, debounced: true });
      await admin.from("google_calendar_watches").update({ last_notified_at: new Date().toISOString() }).eq("id", watch.id);
      const secret = Deno.env.get("INTERNAL_CRON_SECRET") ?? "";
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-sync`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": secret },
        body: JSON.stringify({ action: "pull-calendar", connectionId: watch.connection_id, calendarId: watch.calendar_id }),
      }).catch((e) => console.error("[webhook] pull-calendar failed", e));
      return json({ ok: true, calendar: watch.calendar_id });
    }
```

- [ ] **Step 2: `register_calendar_watch`** (nuova azione, accetta JWT utente admin o x-cron-secret): body `{ connectionId, calendarId }` → carica la connessione, token valido (riusare la logica di refresh già presente in `register_watch`), `events/watch` su `calendarId`, poi `upsert` in `google_calendar_watches` su `(connection_id, calendar_id)` con `channel_id`, `resource_id` (dal `watchData.resourceId`), `channel_token`, `expiry_at`. Se esiste già un canale per quel calendario: prima `channels/stop` del vecchio.

- [ ] **Step 3: `renew_watches`** — dopo il ciclo sulle connessioni, lo stesso per `google_calendar_watches` con `expiry_at < cutoff`: stop + nuovo watch + update riga.

- [ ] **Step 4: Deploy + commit** — `git commit -m "Un canale webhook per ogni calendario di squadra"`

---

### Task 5: Frontend — registrare il canale, orari, push immediato, griglia

**Files:**
- Modify: `src/hooks/useCalendariLavori.ts` (`useCollegaCalendarioSquadra`, `useSalvaCalendarLink`: in `onSuccess`, se c'è un calendario, `supabase.functions.invoke("google-calendar-webhook?action=register_calendar_watch", { body: { connectionId, calendarId } })` — best effort, errore in console)
- Modify: `src/types/calendar.ts` — `work_start_time?: string | null; work_end_time?: string | null;`
- Modify: `src/pages/azienda/Calendar.tsx:245-247` — aggiungere `work_start_time, work_end_time` alla select
- Modify: `src/components/calendar/EditOrderDatesDialog.tsx` — stato `workStartTime`/`workEndTime` (stringhe `HH:mm` o ""), inizializzati da `order.work_start_time?.slice(0,5)`; sotto le due DateField dei lavori una riga:

```tsx
<div className="col-span-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
  <div className="grid gap-1.5">
    <Label className="text-xs font-medium text-muted-foreground">Dalle</Label>
    <Input type="time" className="h-9" value={workStartTime} onChange={(e) => setWorkStartTime(e.target.value)} />
  </div>
  <div className="grid gap-1.5">
    <Label className="text-xs font-medium text-muted-foreground">Alle</Label>
    <Input type="time" className="h-9" value={workEndTime} onChange={(e) => setWorkEndTime(e.target.value)} />
  </div>
  <div className="flex gap-1">
    <Button type="button" size="sm" variant="outline" onClick={() => { setWorkStartTime("08:00"); setWorkEndTime("12:00"); }}>Mattina</Button>
    <Button type="button" size="sm" variant="outline" onClick={() => { setWorkStartTime("13:00"); setWorkEndTime("17:00"); }}>Pomeriggio</Button>
  </div>
</div>
```
  e in `handleSave`: `work_start_time: workStartTime || null, work_end_time: workEndTime || null`; dopo il salvataggio riuscito: `void supabase.functions.invoke("google-calendar-sync", { body: { action: "push-order", companyId, orderId: order.id } })` (best effort: il trigger accoda comunque).
- Modify: `src/components/calendar/CalendarWeekView.tsx` — nel ciclo dei lavori: se `o.work_start_time` → NON in `allDayByDate` ma in una mappa `timedOrdersByDate` (stessa iterazione giorni); nella griglia, nel filtro dello slot: `const dayLavori = (timedOrdersByDate.get(dateStr) || []).filter(o => floorToSlot(o.work_start_time!.slice(0,5)) === slot.label)` e render con lo stesso stile di `renderAllDayEvent({ type: "lavoro", order: o })` (etichetta `HH:mm–HH:mm · codice`).

- [ ] **Step: lint, build, commit** — `git commit -m "Orari sui lavori nel dialog e nella settimana; il collegamento registra il canale"`

---

### Task 6: Verifica dal vivo (Demo Azienda S.r.l., account Google del founder)

- [ ] Collegare la squadra «Montaggi Tecnici Del Sud» a un calendario di prova dell'account (crearne uno «EiC test squadra» su Google se serve) e Posa a un altro; verificare in `google_calendar_watches` due righe.
- [ ] Su una commessa assegnata a quella squadra: dialog date → Inizio/Fine + Mattina → salva → entro pochi secondi l'evento «Posa · CODE · cliente» sul calendario Google (verifica via API `events?privateExtendedProperty=eic_order_id=…`) e riga in `google_calendar_order_events`.
- [ ] Spostare l'evento su Google (PATCH via API con il token della connessione, o a mano) → webhook → `orders.work_start_date/time` cambiati → notifica in `notifications` per `assigned_to`.
- [ ] Togliere la squadra dalla commessa → evento cancellato su Google, mappa rimossa.
- [ ] Pulizia: eventi di prova cancellati, mapping/watch/link rimossi, date della commessa ripristinate.
- [ ] `vitest`, build, ratchet verdi. **Nessun push.**

---

## Self-review

- Copertura spec pezzo 2: orari (T1, T5) · uscita con marcatore in extendedProperties (T2, T3) · mappa per calendario (T1, T3) · trigger+coda+risveglio (T1) · ritorno con canale per calendario (T3, T4) · regola conflitti «vince l'ultimo» via etag+confronto valori (T3 pull) · cancellazione su Google → squadra tolta, date restano (T3) · notifica (T3 `avvisaCommessa`) · busy dai calendari squadra senza i nostri eventi (T3 step 4) · cron di sicurezza (T3 step 5).
- Segnaposto: nessuno. Nomi coerenti: `costruisciEventoPosa`/`leggiDateDaEventoGoogle`/`stesseDate` (T2↔T3), `google_calendar_sveglia`/`google_calendar_accoda_commessa` (T1), azioni `process-order-queue`/`pull-calendar`/`push-order`/`register_calendar_watch` (T3↔T4↔T5).
