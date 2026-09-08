# Calendari lavori — Pezzo 1: squadre uniche e collegamento ai calendari Google

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una sola entità «Squadra» (interna o esterna, con o senza login) e la pagina Impostazioni → Calendari lavori dove ogni squadra e il calendario aziendale Posa si collegano a un calendario Google dell'azienda.

**Architecture:** `external_teams` evolve in «Squadre» con i campi di accesso e di collegamento Google; una tabella `company_calendar_links` tiene i calendari standard (solo `posa` per ora). La funzione edge `google-calendar-auth` impara a elencare i calendari di una connessione scelta dall'admin (non solo la propria). La pagina replica la struttura di `MarketingCalendarsConfig` (tre tab) e assorbe il CRUD squadre di `SubappaltatoriTab`. Nessun invio di eventi in questo pezzo.

**Tech Stack:** Postgres/Supabase (migrazione via Management API + `migration repair`), edge function Deno, React 18 + TanStack Query + shadcn, vitest.

Spec: `docs/superpowers/specs/2026-09-08-calendari-lavori-squadre-design.md`.

---

## Mappa dei file

| File | Ruolo |
|---|---|
| `supabase/migrations/20280912000000_squadre_calendari_lavori.sql` | colonne su `external_teams`, tabella `company_calendar_links`, RLS |
| `supabase/functions/google-calendar-auth/index.ts` | `list-calendars` con `connectionId` (admin) |
| `src/types/squadre.ts` | tipi e etichette: tipo squadra, stato sync, calendari standard |
| `src/test/logic/squadreCalendari.test.ts` | test della funzione pura `statoSyncSquadra` |
| `src/hooks/useCalendariLavori.ts` | query e mutazioni della pagina |
| `src/components/settings/calendari-lavori/GoogleCalendarPicker.tsx` | scelta connessione → calendario |
| `src/components/settings/calendari-lavori/SquadreTab.tsx` | tabella squadre + dialog |
| `src/components/settings/calendari-lavori/CalendariStandardTab.tsx` | riga Posa |
| `src/components/settings/calendari-lavori/CalendariLavoriConfig.tsx` | i tre tab |
| `src/pages/azienda/settings/SettingsCalendariLavori.tsx` | pagina |
| `src/components/employees/ExternalTeamDialog.tsx` | campi tipo / accesso / capocantiere |
| `src/types/employees.ts` | `ExternalTeam` con i campi nuovi |
| `src/routes/companyRoutes.tsx`, `src/components/layouts/CompanyLayout.tsx`, `src/pages/azienda/settings/SettingsMobileHub.tsx`, `src/components/layouts/SettingsSearch.tsx` | rotta e voci di menu |
| `src/components/settings/SubappaltatoriTab.tsx` | il CRUD squadre diventa un rimando |
| `src/pages/campo/CampoCalendario.tsx` | la squadra con login vede le sue pose |

---

### Task 1: Migrazione — squadre e calendari standard

**Files:**
- Create: `supabase/migrations/20280912000000_squadre_calendari_lavori.sql`

- [ ] **Step 1: Scrivere la migrazione**

```sql
-- Squadre uniche e calendari lavori (08/09/2026). Vedi
-- docs/superpowers/specs/2026-09-08-calendari-lavori-squadre-design.md
--
-- `external_teams` era «la squadra come etichetta colorata sulla commessa»;
-- `subappaltatori` era «la ditta che entra in /campo». Da qui in poi la squadra
-- è una cosa sola: ha un tipo, può avere un login e un calendario Google.
-- Applicata sul live via Management API (lock_timeout breve), poi
-- `supabase migration repair --status applied 20280912000000 --linked`.

ALTER TABLE public.external_teams
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'esterna',
  ADD COLUMN IF NOT EXISTS subappaltatore_id uuid REFERENCES public.subappaltatori(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS leader_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS google_connection_id uuid REFERENCES public.google_calendar_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS google_calendar_id text,
  ADD COLUMN IF NOT EXISTS google_sync_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS google_last_error text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'external_teams_kind_valido') THEN
    ALTER TABLE public.external_teams
      ADD CONSTRAINT external_teams_kind_valido CHECK (kind IN ('interna', 'esterna'));
  END IF;
END $$;

-- Un calendario Google appartiene a una sola squadra.
CREATE UNIQUE INDEX IF NOT EXISTS ux_external_teams_google_calendar
  ON public.external_teams (google_connection_id, google_calendar_id)
  WHERE google_connection_id IS NOT NULL AND google_calendar_id IS NOT NULL;

COMMENT ON COLUMN public.external_teams.kind IS 'interna (dipendenti) | esterna (ditta)';
COMMENT ON COLUMN public.external_teams.subappaltatore_id IS 'Il login della squadra in /campo, se ce l''ha';
COMMENT ON COLUMN public.external_teams.google_calendar_id IS 'Calendario Google (dell''account google_connection_id) dove finiscono le pose della squadra';

-- ── Calendari standard dell'azienda ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_calendar_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('posa')),
  google_connection_id uuid REFERENCES public.google_calendar_connections(id) ON DELETE SET NULL,
  google_calendar_id text,
  enabled boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, kind)
);

COMMENT ON TABLE public.company_calendar_links IS
  'Calendari standard del calendario lavori collegati a un calendario Google: per ora solo «posa» (tutte le pose dell''azienda).';

ALTER TABLE public.company_calendar_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_calendar_links_lettura_azienda ON public.company_calendar_links;
CREATE POLICY company_calendar_links_lettura_azienda ON public.company_calendar_links
  FOR SELECT USING (company_id = public.get_user_company_id((SELECT auth.uid())));

DROP POLICY IF EXISTS company_calendar_links_admin ON public.company_calendar_links;
CREATE POLICY company_calendar_links_admin ON public.company_calendar_links
  FOR ALL USING (
    public.has_role((SELECT auth.uid()), 'company_admin'::app_role)
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
  ) WITH CHECK (
    public.has_role((SELECT auth.uid()), 'company_admin'::app_role)
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS company_calendar_links_super_admin ON public.company_calendar_links;
CREATE POLICY company_calendar_links_super_admin ON public.company_calendar_links
  FOR ALL USING (public.has_role((SELECT auth.uid()), 'super_admin'::app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_calendar_links TO authenticated;
```

- [ ] **Step 2: Applicare sul live**

```bash
cd /Users/florinandriciuc/edilizia-in-cloud
TOKEN=$(security find-generic-password -s "Supabase CLI" -w)
SQL=$(cat supabase/migrations/20280912000000_squadre_calendari_lavori.sql)
curl -s -X POST "https://api.supabase.com/v1/projects/rsbrguhkodgnqfomrevo/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -A "curl/8.4.0" \
  -d "$(jq -cn --arg q "set local lock_timeout='4s'; set local statement_timeout='30s'; $SQL" '{query:$q}')"
npx --yes supabase migration repair --status applied 20280912000000 --linked
```
Expected: `[]` dalla prima chiamata, `Repaired migration history: [20280912000000] => applied` dalla seconda.

- [ ] **Step 3: Verificare**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/rsbrguhkodgnqfomrevo/database/query" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -A "curl/8.4.0" \
  -d '{"query":"select column_name from information_schema.columns where table_name='external_teams' and column_name in ('kind','google_calendar_id','subappaltatore_id') union all select 'LINKS:'||count(*)::text from company_calendar_links"}'
```
Expected: tre colonne + `LINKS:0`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20280912000000_squadre_calendari_lavori.sql
git commit -m "Le squadre diventano una cosa sola e possono avere un calendario Google"
```

---

### Task 2: Tipi ed etichette (con test della funzione pura)

**Files:**
- Create: `src/types/squadre.ts`
- Modify: `src/types/employees.ts:19-28`
- Test: `src/test/logic/squadreCalendari.test.ts`

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
import { describe, it, expect } from "vitest";
import { statoSyncSquadra } from "@/types/squadre";

describe("statoSyncSquadra", () => {
  it("senza calendario è «non collegata»", () => {
    expect(statoSyncSquadra({ google_calendar_id: null, google_sync_enabled: false, google_last_error: null })).toBe("non_collegata");
  });
  it("con calendario ma interruttore spento è «disattivata»", () => {
    expect(statoSyncSquadra({ google_calendar_id: "abc@group.calendar.google.com", google_sync_enabled: false, google_last_error: null })).toBe("disattivata");
  });
  it("con errore recente è «errore», anche se attiva", () => {
    expect(statoSyncSquadra({ google_calendar_id: "abc", google_sync_enabled: true, google_last_error: "Calendario non trovato" })).toBe("errore");
  });
  it("attiva e senza errori è «attiva»", () => {
    expect(statoSyncSquadra({ google_calendar_id: "abc", google_sync_enabled: true, google_last_error: null })).toBe("attiva");
  });
});
```

- [ ] **Step 2: Eseguire il test**

Run: `npx vitest run src/test/logic/squadreCalendari.test.ts`
Expected: FAIL — `Cannot find module '@/types/squadre'`.

- [ ] **Step 3: Scrivere `src/types/squadre.ts`**

```ts
/**
 * Squadre di posa e calendari lavori.
 *
 * La squadra è UNA cosa (interna o esterna, con o senza login, con o senza
 * calendario Google): vive in `external_teams`, che si chiama così per storia.
 */
export type SquadraKind = "interna" | "esterna";

export const SQUADRA_KIND_LABEL: Record<SquadraKind, string> = {
  interna: "Interna",
  esterna: "Esterna",
};

export type StatoSyncSquadra = "non_collegata" | "disattivata" | "errore" | "attiva";

export const STATO_SYNC_LABEL: Record<StatoSyncSquadra, string> = {
  non_collegata: "Nessun calendario",
  disattivata: "Collegato, spento",
  errore: "Errore",
  attiva: "Attivo",
};

/** Lo stato letto a colpo d'occhio nella tabella: l'errore batte tutto. */
export function statoSyncSquadra(s: {
  google_calendar_id: string | null;
  google_sync_enabled: boolean;
  google_last_error: string | null;
}): StatoSyncSquadra {
  if (!s.google_calendar_id) return "non_collegata";
  if (s.google_last_error) return "errore";
  return s.google_sync_enabled ? "attiva" : "disattivata";
}

/** I calendari standard del calendario lavori. Per ora uno: si aggiungono quando hanno un invio. */
export type CalendarioStandardKind = "posa";

export const CALENDARIO_STANDARD: Array<{ kind: CalendarioStandardKind; label: string; descrizione: string }> = [
  { kind: "posa", label: "Posa", descrizione: "Tutte le pose dell'azienda, di qualunque squadra." },
];

export interface CompanyCalendarLink {
  id: string;
  company_id: string;
  kind: CalendarioStandardKind;
  google_connection_id: string | null;
  google_calendar_id: string | null;
  enabled: boolean;
  last_sync_at: string | null;
  last_error: string | null;
}

/** Una connessione Google dell'azienda, come la vede l'admin. */
export interface ConnessioneGoogleAzienda {
  id: string;
  user_id: string;
  google_account_email: string | null;
  status: string;
}

export interface CalendarioGoogle {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
  accessRole?: string;
}
```

- [ ] **Step 4: Estendere `ExternalTeam` in `src/types/employees.ts`**

Sostituire l'interfaccia (righe 19-28) con:

```ts
export interface ExternalTeam {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
  vat_rate: number;
  color?: string | null;
  kind?: "interna" | "esterna";
  subappaltatore_id?: string | null;
  leader_user_id?: string | null;
  google_connection_id?: string | null;
  google_calendar_id?: string | null;
  google_sync_enabled?: boolean;
  google_last_sync_at?: string | null;
  google_last_error?: string | null;
}
```

- [ ] **Step 5: Eseguire il test**

Run: `npx vitest run src/test/logic/squadreCalendari.test.ts`
Expected: PASS, 4 test.

- [ ] **Step 6: Commit**

```bash
git add src/types/squadre.ts src/types/employees.ts src/test/logic/squadreCalendari.test.ts
git commit -m "Tipi delle squadre e dei calendari lavori, con lo stato sync testato"
```

---

### Task 3: Edge `google-calendar-auth` — elencare i calendari di una connessione scelta

**Files:**
- Modify: `supabase/functions/google-calendar-auth/index.ts` (funzioni `handleRefresh` ~336, `handleListCalendars` ~400, dispatcher ~558)

- [ ] **Step 1: Estrarre il rinnovo del token in una funzione riusabile**

Sopra `handleRefresh` aggiungere:

```ts
/**
 * Rinnova l'access token di UNA connessione e lo restituisce in chiaro.
 * Usata sia dal refresh esplicito sia da list-calendars quando l'admin chiede
 * i calendari di una connessione che non è la sua.
 */
async function refreshConnectionTokens(
  conn: { id: string; refresh_token_encrypted: string | null; token_expires_at: string | null },
): Promise<{ ok: true; accessToken: string } | { ok: false; status: number; error: string }> {
  const admin = getSupabaseAdmin();
  const encKey = getEncryptionKey();
  if (!conn.refresh_token_encrypted) return { ok: false, status: 400, error: "No refresh token" };

  const clientId = await getPlatformSetting("google_calendar_client_id", "GOOGLE_CALENDAR_CLIENT_ID");
  const clientSecret = await getPlatformSetting("google_calendar_client_secret", "GOOGLE_CALENDAR_CLIENT_SECRET");
  const refreshToken = await decrypt(conn.refresh_token_encrypted, encKey);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!tokenRes.ok) {
    await admin
      .from("google_calendar_connections")
      .update({ status: "token_expired", last_error: "Refresh token failed" })
      .eq("id", conn.id);
    return { ok: false, status: 401, error: "Refresh failed" };
  }

  const tokens = await tokenRes.json();
  await admin
    .from("google_calendar_connections")
    .update({
      access_token_encrypted: await encrypt(tokens.access_token, encKey),
      token_expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : conn.token_expires_at,
      status: "connected",
      last_error: null,
    })
    .eq("id", conn.id);
  return { ok: true, accessToken: tokens.access_token };
}
```

E il corpo di `handleRefresh` diventa:

```ts
async function handleRefresh(req: Request, userId: string, companyId: string): Promise<Response> {
  const admin = getSupabaseAdmin();
  const { data: conn } = await admin
    .from("google_calendar_connections")
    .select("id, refresh_token_encrypted, token_expires_at")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .single();
  if (!conn) {
    return new Response(JSON.stringify({ error: "No refresh token" }), {
      status: 400,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
  const r = await refreshConnectionTokens(conn);
  if (!r.ok) {
    return new Response(JSON.stringify({ error: r.error }), {
      status: r.status,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ success: true }), {
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 2: `handleListCalendars` con `connectionId` facoltativo**

Sostituire la firma e la parte iniziale (fino al `fetch` di `calendarList`):

```ts
async function handleListCalendars(
  req: Request,
  userId: string,
  companyId: string,
  connectionId?: string | null,
): Promise<Response> {
  const admin = getSupabaseAdmin();
  const encKey = getEncryptionKey();
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  // Di norma: la connessione di chi chiede. Con connectionId: una connessione
  // dell'azienda scelta dall'admin (pagina Calendari lavori). Il controllo di
  // ruolo sta QUI e non nella RLS, perché la funzione usa la service key.
  let query = admin.from("google_calendar_connections").select("*").eq("company_id", companyId);
  query = connectionId ? query.eq("id", connectionId) : query.eq("user_id", userId);
  const { data: conn } = await query.maybeSingle();
  if (!conn) return respond({ error: "Not connected" }, 404);

  if (connectionId && conn.user_id !== userId) {
    const { data: ruoli } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["company_admin", "super_admin"]);
    if (!ruoli || ruoli.length === 0) return respond({ error: "Solo un amministratore può leggere i calendari di un altro account" }, 403);
  }

  let accessToken = await decrypt(conn.access_token_encrypted, encKey);
  if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) {
    const r = await refreshConnectionTokens(conn);
    if (!r.ok) return respond({ error: r.error }, r.status);
    accessToken = r.accessToken;
  }
```

Il resto della funzione (fetch di `calendarList`, mappatura `calendars`, risposta) resta com'è.

- [ ] **Step 3: Dispatcher**

```ts
      case "list-calendars":
        return handleListCalendars(req, userId, companyId, body.connectionId ?? null);
```

- [ ] **Step 4: Controllo sintassi Deno e deploy**

Run: `deno check supabase/functions/google-calendar-auth/index.ts` (se Deno manca in locale: `npx supabase functions deploy google-calendar-auth --project-ref rsbrguhkodgnqfomrevo --no-verify-jwt`, che compila).
Expected: nessun errore; `Deployed Functions on project rsbrguhkodgnqfomrevo: google-calendar-auth`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/google-calendar-auth/index.ts
git commit -m "L'admin può elencare i calendari di una connessione Google dell'azienda"
```

---

### Task 4: Hook `useCalendariLavori`

**Files:**
- Create: `src/hooks/useCalendariLavori.ts`

- [ ] **Step 1: Scrivere l'hook**

```ts
/**
 * Dati della pagina Impostazioni → Calendari lavori.
 *
 * Le squadre stanno in `external_teams` (vedi src/types/squadre.ts), i
 * calendari standard in `company_calendar_links`, le connessioni Google sono
 * quelle di tutti gli utenti dell'azienda (l'admin le legge per RLS).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { userErrorMessage } from "@/lib/userErrorMessage";
import type { ExternalTeam } from "@/types/employees";
import type {
  CalendarioGoogle,
  CalendarioStandardKind,
  CompanyCalendarLink,
  ConnessioneGoogleAzienda,
} from "@/types/squadre";

const SQUADRA_COLS =
  "id, name, contact_name, phone, email, notes, is_active, vat_rate, color, kind, subappaltatore_id, " +
  "leader_user_id, google_connection_id, google_calendar_id, google_sync_enabled, google_last_sync_at, google_last_error";

/** Chiavi locali: shape diversa da `queryKeys.externalTeams.list`, quindi chiave diversa. */
export const calendariLavoriKeys = {
  squadre: (companyId: string | undefined) => ["calendari-lavori", "squadre", companyId] as const,
  connessioni: (companyId: string | undefined) => ["calendari-lavori", "connessioni", companyId] as const,
  calendari: (companyId: string | undefined, connectionId: string | null) =>
    ["calendari-lavori", "calendari", companyId, connectionId] as const,
  links: (companyId: string | undefined) => ["calendari-lavori", "links", companyId] as const,
  subappaltatori: (companyId: string | undefined) => ["calendari-lavori", "subappaltatori", companyId] as const,
};

/** Tutto ciò che altrove mostra le squadre: la pagina calendario e la commessa usano chiavi proprie. */
function invalidaSquadreOvunque(qc: ReturnType<typeof useQueryClient>, companyId: string | undefined) {
  qc.invalidateQueries({ queryKey: calendariLavoriKeys.squadre(companyId) });
  qc.invalidateQueries({ queryKey: queryKeys.externalTeams.all });
  qc.invalidateQueries({ queryKey: ["external-teams-filter"] });
  qc.invalidateQueries({ queryKey: ["external-teams-list"] });
}

export function useSquadre() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: calendariLavoriKeys.squadre(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<ExternalTeam[]> => {
      const { data, error } = await supabase
        .from("external_teams")
        .select(SQUADRA_COLS)
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as ExternalTeam[];
    },
  });
}

export function useConnessioniGoogleAzienda() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: calendariLavoriKeys.connessioni(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<ConnessioneGoogleAzienda[]> => {
      const { data, error } = await supabase
        .from("google_calendar_connections")
        .select("id, user_id, google_account_email, status")
        .eq("company_id", companyId!)
        .order("google_account_email");
      if (error) throw error;
      return (data ?? []) as ConnessioneGoogleAzienda[];
    },
  });
}

/** I calendari Google di UNA connessione, letti dalla funzione edge (serve il token). */
export function useCalendariDiConnessione(connectionId: string | null) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: calendariLavoriKeys.calendari(companyId, connectionId),
    enabled: !!companyId && !!connectionId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CalendarioGoogle[]> => {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await supabase.functions.invoke("google-calendar-auth", {
        body: { action: "list-calendars", companyId, connectionId },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.error) throw new Error(res.error.message);
      const payload = res.data as { calendars?: CalendarioGoogle[]; error?: string };
      if (payload?.error) throw new Error(payload.error);
      return payload?.calendars ?? [];
    },
  });
}

export function useCalendarLinks() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: calendariLavoriKeys.links(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<CompanyCalendarLink[]> => {
      const { data, error } = await supabase
        .from("company_calendar_links" as never)
        .select("*")
        .eq("company_id", companyId!);
      if (error) throw error;
      return (data ?? []) as unknown as CompanyCalendarLink[];
    },
  });
}

/** Le ditte con login: servono per dare un accesso alla squadra. */
export function useSubappaltatoriAzienda() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: calendariLavoriKeys.subappaltatori(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subappaltatori")
        .select("id, ragione_sociale, user_id, user_email")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("ragione_sociale");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; ragione_sociale: string; user_id: string | null; user_email: string | null }>;
    },
  });
}

export interface SquadraInput {
  id?: string;
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  is_active: boolean;
  vat_rate: number;
  kind: "interna" | "esterna";
  subappaltatore_id?: string | null;
  leader_user_id?: string | null;
  color?: string | null;
}

export function useSalvaSquadra() {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useMutation({
    mutationFn: async (input: SquadraInput) => {
      const riga = {
        name: input.name,
        contact_name: input.contact_name || null,
        phone: input.phone || null,
        email: input.email || null,
        notes: input.notes || null,
        is_active: input.is_active,
        vat_rate: input.vat_rate,
        kind: input.kind,
        subappaltatore_id: input.subappaltatore_id || null,
        leader_user_id: input.leader_user_id || null,
        color: input.color || null,
      };
      if (input.id) {
        const { error } = await supabase.from("external_teams").update(riga as never).eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase
        .from("external_teams")
        .insert({ ...riga, company_id: companyId! } as never)
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: (_id, input) => {
      invalidaSquadreOvunque(qc, companyId);
      toast.success(input.id ? "Squadra aggiornata" : "Squadra creata");
    },
    onError: (e) => toast.error("Squadra non salvata", { description: userErrorMessage(e) }),
  });
}

export function useEliminaSquadra() {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("external_teams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidaSquadreOvunque(qc, companyId);
      toast.success("Squadra eliminata");
    },
    onError: () => toast.error("Impossibile eliminare", { description: "La squadra è assegnata a delle commesse: disattivala invece." }),
  });
}

/** Collega (o scollega, con null) il calendario Google della squadra. */
export function useCollegaCalendarioSquadra() {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useMutation({
    mutationFn: async (p: { id: string; google_connection_id: string | null; google_calendar_id: string | null; google_sync_enabled?: boolean }) => {
      const scollega = !p.google_connection_id || !p.google_calendar_id;
      const { error } = await supabase
        .from("external_teams")
        .update({
          google_connection_id: scollega ? null : p.google_connection_id,
          google_calendar_id: scollega ? null : p.google_calendar_id,
          google_sync_enabled: scollega ? false : (p.google_sync_enabled ?? true),
          google_last_error: null,
        } as never)
        .eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: (_r, p) => {
      invalidaSquadreOvunque(qc, companyId);
      toast.success(p.google_calendar_id ? "Calendario collegato" : "Calendario scollegato");
    },
    onError: (e) => {
      const msg = userErrorMessage(e);
      toast.error("Collegamento non salvato", {
        description: /ux_external_teams_google_calendar|duplicate/i.test(String((e as Error)?.message))
          ? "Questo calendario Google è già collegato a un'altra squadra."
          : msg,
      });
    },
  });
}

export function useSalvaCalendarLink() {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useMutation({
    mutationFn: async (p: { kind: CalendarioStandardKind; google_connection_id: string | null; google_calendar_id: string | null; enabled?: boolean }) => {
      const scollega = !p.google_connection_id || !p.google_calendar_id;
      const { error } = await supabase
        .from("company_calendar_links" as never)
        .upsert(
          {
            company_id: companyId!,
            kind: p.kind,
            google_connection_id: scollega ? null : p.google_connection_id,
            google_calendar_id: scollega ? null : p.google_calendar_id,
            enabled: scollega ? false : (p.enabled ?? true),
            last_error: null,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: "company_id,kind" },
        );
      if (error) throw error;
    },
    onSuccess: (_r, p) => {
      qc.invalidateQueries({ queryKey: calendariLavoriKeys.links(companyId) });
      toast.success(p.google_calendar_id ? "Calendario collegato" : "Calendario scollegato");
    },
    onError: (e) => toast.error("Collegamento non salvato", { description: userErrorMessage(e) }),
  });
}
```

- [ ] **Step 2: Controllo tipi del file**

Run: `npx eslint src/hooks/useCalendariLavori.ts`
Expected: 0 errori.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCalendariLavori.ts
git commit -m "Hook della pagina Calendari lavori: squadre, connessioni, calendari, link"
```

---

### Task 5: `GoogleCalendarPicker` — dalla connessione al calendario

**Files:**
- Create: `src/components/settings/calendari-lavori/GoogleCalendarPicker.tsx`

- [ ] **Step 1: Scrivere il componente**

```tsx
/**
 * Due menu in fila: quale account Google dell'azienda, e quale dei suoi
 * calendari. È lo stesso gesto per una squadra e per un calendario standard.
 *
 * L'elenco dei calendari passa dalla funzione edge (serve il token
 * dell'account): finché non c'è una connessione scelta non chiede niente.
 */
import { useState } from "react";
import { Loader2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCalendariDiConnessione, useConnessioniGoogleAzienda } from "@/hooks/useCalendariLavori";

export interface SceltaCalendario {
  google_connection_id: string | null;
  google_calendar_id: string | null;
}

export function GoogleCalendarPicker({
  value,
  onChange,
  disabled,
}: {
  value: SceltaCalendario;
  onChange: (next: SceltaCalendario) => void;
  disabled?: boolean;
}) {
  const [connectionId, setConnectionId] = useState<string | null>(value.google_connection_id);
  const { data: connessioni = [], isLoading: caricoConnessioni } = useConnessioniGoogleAzienda();
  const { data: calendari = [], isLoading: caricoCalendari, error } = useCalendariDiConnessione(connectionId);

  const attive = connessioni.filter((c) => c.status === "connected");

  if (!caricoConnessioni && attive.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nessun account Google collegato: fallo nel tab <strong>Collegamenti</strong>.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select
        value={connectionId ?? ""}
        disabled={disabled || caricoConnessioni}
        onValueChange={(v) => {
          setConnectionId(v);
          onChange({ google_connection_id: v, google_calendar_id: null });
        }}
      >
        <SelectTrigger className="sm:w-56">
          <SelectValue placeholder="Account Google" />
        </SelectTrigger>
        <SelectContent>
          {attive.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.google_account_email ?? "Account senza email"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.google_calendar_id ?? ""}
        disabled={disabled || !connectionId || caricoCalendari}
        onValueChange={(v) => onChange({ google_connection_id: connectionId, google_calendar_id: v })}
      >
        <SelectTrigger className="sm:w-64">
          {caricoCalendari ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Leggo i calendari…
            </span>
          ) : (
            <SelectValue placeholder={connectionId ? "Calendario" : "Prima l'account"} />
          )}
        </SelectTrigger>
        <SelectContent>
          {calendari.map((cal) => (
            <SelectItem key={cal.id} value={cal.id}>
              <span className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cal.backgroundColor ?? "#94a3b8" }} />
                {cal.summary}
                {cal.primary ? " (principale)" : ""}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value.google_calendar_id && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => onChange({ google_connection_id: null, google_calendar_id: null })}
        >
          <Link2Off className="mr-1 h-3.5 w-3.5" /> Scollega
        </Button>
      )}

      {error && <p className="text-xs text-destructive">{(error as Error).message}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint src/components/settings/calendari-lavori/GoogleCalendarPicker.tsx`
Expected: 0 errori.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/calendari-lavori/GoogleCalendarPicker.tsx
git commit -m "Selettore account Google → calendario, riusato da squadre e calendari standard"
```

---

### Task 6: `ExternalTeamDialog` — tipo, accesso, capocantiere, colore

**Files:**
- Modify: `src/components/employees/ExternalTeamDialog.tsx` (schema zod ~riga 30-46, props 48-63, form)

- [ ] **Step 1: Leggere il file e aggiungere allo schema zod**

```ts
  kind: z.enum(["interna", "esterna"]).default("esterna"),
  subappaltatore_id: z.string().nullable().optional(),
  leader_user_id: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
```

- [ ] **Step 2: Aggiungere le props**

```ts
  /** Ditte con login (per «Accesso all'app cantiere»). Se assente, il campo non compare. */
  subappaltatori?: Array<{ id: string; ragione_sociale: string; user_email: string | null }>;
  /** Utenti dell'azienda (per il capocantiere delle squadre interne). */
  utenti?: Array<{ id: string; nome: string }>;
```

e nel `team` prop (e nel reset del form) i campi `kind`, `subappaltatore_id`, `leader_user_id`, `color` con i default `"esterna"`, `null`, `null`, `null`.

- [ ] **Step 3: Aggiungere i campi nel form, subito dopo «Nome»**

```tsx
<div className="grid grid-cols-2 gap-3">
  <div className="space-y-1">
    <Label>Tipo</Label>
    <Select value={form.watch("kind")} onValueChange={(v) => form.setValue("kind", v as "interna" | "esterna")}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="esterna">Esterna (ditta)</SelectItem>
        <SelectItem value="interna">Interna (dipendenti)</SelectItem>
      </SelectContent>
    </Select>
  </div>
  <div className="space-y-1">
    <Label>Colore nel calendario</Label>
    <Input type="color" value={form.watch("color") ?? "#3b82f6"} onChange={(e) => form.setValue("color", e.target.value)} className="h-9 w-full p-1" />
  </div>
</div>

{form.watch("kind") === "esterna" && subappaltatori && (
  <div className="space-y-1">
    <Label>Accesso all'app cantiere</Label>
    <Select
      value={form.watch("subappaltatore_id") ?? "__nessuno__"}
      onValueChange={(v) => form.setValue("subappaltatore_id", v === "__nessuno__" ? null : v)}
    >
      <SelectTrigger><SelectValue placeholder="Nessun accesso" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__nessuno__">Nessun accesso</SelectItem>
        {subappaltatori.map((s) => (
          <SelectItem key={s.id} value={s.id}>{s.ragione_sociale}{s.user_email ? ` · ${s.user_email}` : ""}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    <p className="text-xs text-muted-foreground">Con un accesso, la squadra vede le sue pose in /campo.</p>
  </div>
)}

{form.watch("kind") === "interna" && utenti && (
  <div className="space-y-1">
    <Label>Capocantiere</Label>
    <Select
      value={form.watch("leader_user_id") ?? "__nessuno__"}
      onValueChange={(v) => form.setValue("leader_user_id", v === "__nessuno__" ? null : v)}
    >
      <SelectTrigger><SelectValue placeholder="Nessuno" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__nessuno__">Nessuno</SelectItem>
        {utenti.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
)}
```

- [ ] **Step 4: Lint**

Run: `npx eslint src/components/employees/ExternalTeamDialog.tsx`
Expected: 0 errori.

- [ ] **Step 5: Commit**

```bash
git add src/components/employees/ExternalTeamDialog.tsx
git commit -m "Il dialog della squadra chiede tipo, colore, accesso e capocantiere"
```

---

### Task 7: `SquadreTab`, `CalendariStandardTab`, `CalendariLavoriConfig`, pagina

**Files:**
- Create: `src/components/settings/calendari-lavori/SquadreTab.tsx`
- Create: `src/components/settings/calendari-lavori/CalendariStandardTab.tsx`
- Create: `src/components/settings/calendari-lavori/CalendariLavoriConfig.tsx`
- Create: `src/pages/azienda/settings/SettingsCalendariLavori.tsx`

- [ ] **Step 1: `SquadreTab.tsx`**

```tsx
/**
 * Tab Squadre della pagina Calendari lavori: la tabella, il dialog, e per ogni
 * squadra il collegamento al suo calendario Google.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, HardHat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExternalTeamDialog, type ExternalTeamFormData } from "@/components/employees/ExternalTeamDialog";
import type { ExternalTeam } from "@/types/employees";
import { SQUADRA_KIND_LABEL, STATO_SYNC_LABEL, statoSyncSquadra, type StatoSyncSquadra } from "@/types/squadre";
import {
  useCollegaCalendarioSquadra, useEliminaSquadra, useSalvaSquadra, useSquadre, useSubappaltatoriAzienda,
} from "@/hooks/useCalendariLavori";
import { GoogleCalendarPicker } from "./GoogleCalendarPicker";

const STATO_CLASSE: Record<StatoSyncSquadra, string> = {
  non_collegata: "bg-muted text-muted-foreground",
  disattivata: "bg-amber-100 text-amber-800",
  errore: "bg-red-100 text-red-800",
  attiva: "bg-emerald-100 text-emerald-800",
};

export function SquadreTab({ canManage }: { canManage: boolean }) {
  const { effectiveCompany } = useAuth();
  const { data: squadre = [], isLoading } = useSquadre();
  const { data: subappaltatori = [] } = useSubappaltatoriAzienda();
  const salva = useSalvaSquadra();
  const elimina = useEliminaSquadra();
  const collega = useCollegaCalendarioSquadra();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [inModifica, setInModifica] = useState<ExternalTeam | null>(null);
  const [daEliminare, setDaEliminare] = useState<ExternalTeam | null>(null);

  // Utenti dell'azienda per il capocantiere delle squadre interne.
  const { data: utenti = [] } = useQuery({
    queryKey: ["calendari-lavori", "utenti", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("company_id", effectiveCompany!.id)
        .order("full_name");
      if (error) throw error;
      return (data ?? []).map((p) => ({ id: p.id as string, nome: (p.full_name as string | null) || (p.email as string) }));
    },
  });

  const ordinate = useMemo(
    () => [...squadre].sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name)),
    [squadre],
  );

  const onSubmit = (data: ExternalTeamFormData) => {
    salva.mutate(
      { id: inModifica?.id, ...data, kind: data.kind ?? "esterna" },
      { onSuccess: () => { setDialogOpen(false); setInModifica(null); } },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Ogni squadra ha un colore nel calendario e può avere il suo calendario Google.
        </p>
        <Button disabled={!canManage} onClick={() => { setInModifica(null); setDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Nuova squadra
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : ordinate.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <HardHat className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">Nessuna squadra</p>
            <p className="mb-4 text-sm text-muted-foreground">Crea la prima squadra di posa: poi la assegni sulle commesse.</p>
            <Button disabled={!canManage} onClick={() => setDialogOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Nuova squadra</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Squadra</TableHead>
                <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                <TableHead className="hidden md:table-cell">Accesso</TableHead>
                <TableHead>Calendario Google</TableHead>
                <TableHead>Sync</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordinate.map((s) => {
                const stato = statoSyncSquadra({
                  google_calendar_id: s.google_calendar_id ?? null,
                  google_sync_enabled: !!s.google_sync_enabled,
                  google_last_error: s.google_last_error ?? null,
                });
                const accesso = subappaltatori.find((x) => x.id === s.subappaltatore_id);
                return (
                  <TableRow key={s.id} className={s.is_active ? undefined : "opacity-60"}>
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium">
                        <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: s.color ?? "#94a3b8" }} />
                        {s.name}
                        {!s.is_active && <Badge variant="outline" className="text-xs">inattiva</Badge>}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{SQUADRA_KIND_LABEL[s.kind ?? "esterna"]}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {accesso ? (accesso.user_email ?? accesso.ragione_sociale) : "—"}
                    </TableCell>
                    <TableCell>
                      <GoogleCalendarPicker
                        disabled={!canManage}
                        value={{ google_connection_id: s.google_connection_id ?? null, google_calendar_id: s.google_calendar_id ?? null }}
                        onChange={(next) => collega.mutate({ id: s.id, ...next })}
                      />
                      {s.google_last_error && <p className="mt-1 text-xs text-red-700">{s.google_last_error}</p>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge className={STATO_CLASSE[stato]}>{STATO_SYNC_LABEL[stato]}</Badge>
                        {s.google_calendar_id && (
                          <Switch
                            checked={!!s.google_sync_enabled}
                            disabled={!canManage}
                            aria-label="Sincronizzazione attiva"
                            onCheckedChange={(on) =>
                              collega.mutate({
                                id: s.id,
                                google_connection_id: s.google_connection_id ?? null,
                                google_calendar_id: s.google_calendar_id ?? null,
                                google_sync_enabled: on,
                              })
                            }
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" disabled={!canManage} aria-label="Modifica" onClick={() => { setInModifica(s); setDialogOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" disabled={!canManage} aria-label="Elimina" onClick={() => setDaEliminare(s)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ExternalTeamDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setInModifica(null); }}
        team={inModifica ? {
          id: inModifica.id, name: inModifica.name, contact_name: inModifica.contact_name, phone: inModifica.phone,
          email: inModifica.email, notes: inModifica.notes, is_active: inModifica.is_active, vat_rate: inModifica.vat_rate,
          kind: inModifica.kind ?? "esterna", subappaltatore_id: inModifica.subappaltatore_id ?? null,
          leader_user_id: inModifica.leader_user_id ?? null, color: inModifica.color ?? null,
        } : null}
        subappaltatori={subappaltatori}
        utenti={utenti}
        onSave={onSubmit}
        isSaving={salva.isPending}
      />

      <AlertDialog open={!!daEliminare} onOpenChange={(v) => !v && setDaEliminare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare «{daEliminare?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Se la squadra è assegnata a delle commesse non si può eliminare: disattivala e sparisce dai menu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => { if (daEliminare) elimina.mutate(daEliminare.id); setDaEliminare(null); }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 2: `CalendariStandardTab.tsx`**

```tsx
/**
 * I calendari standard del calendario lavori. Per ora uno solo, Posa: il
 * calendario Google aziendale dove finiscono tutte le pose. Le altre righe
 * (Merce, Interventi) arrivano quando avranno il loro invio.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { CALENDARIO_STANDARD } from "@/types/squadre";
import { useCalendarLinks, useSalvaCalendarLink } from "@/hooks/useCalendariLavori";
import { GoogleCalendarPicker } from "./GoogleCalendarPicker";

export function CalendariStandardTab({ canManage }: { canManage: boolean }) {
  const { data: links = [], isLoading } = useCalendarLinks();
  const salva = useSalvaCalendarLink();

  if (isLoading) return <Skeleton className="h-24 w-full" />;

  return (
    <div className="space-y-3">
      {CALENDARIO_STANDARD.map((std) => {
        const link = links.find((l) => l.kind === std.kind);
        const collegato = !!link?.google_calendar_id;
        return (
          <Card key={std.kind}>
            <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium">
                  {std.label}
                  {collegato ? (
                    <Badge className={link?.enabled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
                      {link?.enabled ? "Attivo" : "Collegato, spento"}
                    </Badge>
                  ) : (
                    <Badge className="bg-muted text-muted-foreground">Nessun calendario</Badge>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">{std.descrizione}</p>
                {link?.last_error && <p className="mt-1 text-xs text-red-700">{link.last_error}</p>}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <GoogleCalendarPicker
                  disabled={!canManage}
                  value={{ google_connection_id: link?.google_connection_id ?? null, google_calendar_id: link?.google_calendar_id ?? null }}
                  onChange={(next) => salva.mutate({ kind: std.kind, ...next })}
                />
                {collegato && (
                  <Switch
                    checked={!!link?.enabled}
                    disabled={!canManage}
                    aria-label="Invio attivo"
                    onCheckedChange={(on) =>
                      salva.mutate({
                        kind: std.kind,
                        google_connection_id: link?.google_connection_id ?? null,
                        google_calendar_id: link?.google_calendar_id ?? null,
                        enabled: on,
                      })
                    }
                  />
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: `CalendariLavoriConfig.tsx`**

```tsx
/**
 * Impostazioni → Calendari lavori. Stessa struttura della pagina dei calendari
 * marketing, ma qui i calendari sono le squadre di posa e i calendari standard
 * del calendario operativo, ognuno collegato a un calendario Google.
 *
 * Perché un'altra pagina e non un tab in più là: là un calendario è UNA persona
 * con il SUO Google; qui è una squadra con un calendario dell'account
 * aziendale. Modelli diversi, pagine diverse.
 */
import { useSearchParams } from "react-router-dom";
import { CalendarDays, HardHat, Link2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import GoogleCalendarConnectionTab from "@/components/settings/GoogleCalendarConnectionTab";
import CompanyCalendarsOverview from "@/components/integrations/CompanyCalendarsOverview";
import { SquadreTab } from "./SquadreTab";
import { CalendariStandardTab } from "./CalendariStandardTab";

const TABS = ["squadre", "standard", "collegamenti"] as const;
type Tab = (typeof TABS)[number];

export default function CalendariLavoriConfig() {
  const { role } = useAuth();
  const canManage = role === "company_admin" || role === "super_admin";
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "squadre";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Calendari lavori</h1>
        <p className="text-sm text-muted-foreground">
          Le squadre di posa e i calendari del lavoro operativo, collegati ai calendari Google dell'azienda.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
        <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto">
          <TabsTrigger value="squadre" className="gap-2 shrink-0"><HardHat className="h-4 w-4" />Squadre</TabsTrigger>
          <TabsTrigger value="standard" className="gap-2 shrink-0"><CalendarDays className="h-4 w-4" />Calendari standard</TabsTrigger>
          <TabsTrigger value="collegamenti" className="gap-2 shrink-0"><Link2 className="h-4 w-4" />Collegamenti</TabsTrigger>
        </TabsList>

        <TabsContent value="squadre" className="mt-4">
          <SquadreTab canManage={canManage} />
        </TabsContent>

        <TabsContent value="standard" className="mt-4">
          <CalendariStandardTab canManage={canManage} />
        </TabsContent>

        <TabsContent value="collegamenti" className="mt-4 space-y-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              L'account Google con i calendari delle squadre va collegato con l'utente <strong>titolare</strong>, non con
              chi domani potrebbe non esserci: se quella persona esce o cambia password, la sincronizzazione si ferma.
            </AlertDescription>
          </Alert>
          <GoogleCalendarConnectionTab />
          <CompanyCalendarsOverview />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 4: Pagina `SettingsCalendariLavori.tsx`**

```tsx
import CalendariLavoriConfig from "@/components/settings/calendari-lavori/CalendariLavoriConfig";

export default function SettingsCalendariLavori() {
  return <CalendariLavoriConfig />;
}
```

- [ ] **Step 5: Lint**

Run: `npx eslint src/components/settings/calendari-lavori src/pages/azienda/settings/SettingsCalendariLavori.tsx`
Expected: 0 errori.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/calendari-lavori src/pages/azienda/settings/SettingsCalendariLavori.tsx
git commit -m "Pagina Calendari lavori: squadre, calendari standard, collegamenti"
```

---

### Task 8: Rotta e voci di menu

**Files:**
- Modify: `src/routes/companyRoutes.tsx:142` e `:1187`
- Modify: `src/components/layouts/CompanyLayout.tsx:840`
- Modify: `src/pages/azienda/settings/SettingsMobileHub.tsx:84`
- Modify: `src/components/layouts/SettingsSearch.tsx:76`

- [ ] **Step 1: Rotta**

Dopo la riga 142:
```ts
const SettingsCalendariLavori = lazy(() => import("@/pages/azienda/settings/SettingsCalendariLavori"));
```
Dopo la riga 1187:
```tsx
          <Route path="calendari-lavori" element={withCompanyPermission("canViewSettingsCustomization", <SettingsCalendariLavori />)} />
```

- [ ] **Step 2: Menu desktop** — dopo la voce «Calendari marketing» (riga 840):
```tsx
        { to: "/azienda/impostazioni/calendari-lavori", label: "Calendari lavori", icon: <HardHat className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsCustomization },
```
(aggiungere `HardHat` all'import da `lucide-react` se manca.)

- [ ] **Step 3: Hub mobile** — dopo la riga 84:
```tsx
      { to: "/azienda/impostazioni/calendari-lavori", label: "Calendari lavori", icon: HardHat, iconColor: "text-orange-600" },
```

- [ ] **Step 4: Ricerca impostazioni** — dopo la riga 76:
```ts
  { group: "Marketing", title: "Calendari lavori", url: "/azienda/impostazioni/calendari-lavori", keywords: ["squadre", "posa", "google calendar", "calendario lavori"] },
```

- [ ] **Step 5: Lint dei quattro file, poi commit**

```bash
npx eslint src/routes/companyRoutes.tsx src/components/layouts/CompanyLayout.tsx src/pages/azienda/settings/SettingsMobileHub.tsx src/components/layouts/SettingsSearch.tsx
git add src/routes/companyRoutes.tsx src/components/layouts/CompanyLayout.tsx src/pages/azienda/settings/SettingsMobileHub.tsx src/components/layouts/SettingsSearch.tsx
git commit -m "Calendari lavori raggiungibile da menu, hub mobile e ricerca impostazioni"
```

---

### Task 9: `SubappaltatoriTab` — le squadre vivono in un posto solo

**Files:**
- Modify: `src/components/settings/SubappaltatoriTab.tsx` (card «Squadre Esterne», righe ~165-275)

- [ ] **Step 1: Sostituire la card delle squadre con un rimando**

Al posto della `<Card>` «Squadre Esterne» (query, mutazioni e dialog delle squadre si rimuovono dal file):

```tsx
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HardHat className="h-4 w-4" /> Squadre di posa
          </CardTitle>
          <CardDescription>
            Le squadre — interne o esterne, con il loro colore e il loro calendario Google — si gestiscono in
            un posto solo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="gap-2">
            <Link to="/azienda/impostazioni/calendari-lavori?tab=squadre">
              Vai a Calendari lavori → Squadre <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
```
(import `Link` da `react-router-dom` e `ArrowRight` da lucide; rimuovere import e stato ormai inutilizzati: `ExternalTeamDialog`, `ExternalTeamAttachments`, `queryKeys`, `teamDialogOpen`, `editingTeam`, `attachmentsTeam`, `saveTeamMutation`, `deleteTeamMutation`.)

- [ ] **Step 2: Lint + commit**

```bash
npx eslint src/components/settings/SubappaltatoriTab.tsx
git add src/components/settings/SubappaltatoriTab.tsx
git commit -m "Subappaltatori rimanda a Calendari lavori per le squadre"
```

---

### Task 10: `/campo` — la squadra con login vede le sue pose

**Files:**
- Modify: `src/pages/campo/CampoCalendario.tsx:244-262` (ramo subappaltatore)

- [ ] **Step 1: Aggiungere le commesse assegnate alla squadra**

Dopo la lettura di `contracts` e prima del `return assignmentsToCantieri(contracts …)`:

```ts
        // La squadra con un accesso vede anche le pose assegnate alla SUA
        // squadra sulla commessa (order_external_teams), non solo quelle con
        // un contratto di subappalto: è la strada di chi non usa Google.
        const { data: squadre } = await supabase
          .from("external_teams")
          .select("id")
          .eq("subappaltatore_id", subcontractor.id);
        const squadraIds = (squadre ?? []).map((s) => s.id as string);
        let daSquadra: AssignmentRow[] = [];
        if (squadraIds.length > 0) {
          const { data: assegnate, error: assegnateError } = await supabase
            .from("order_external_teams")
            .select(`
              id, order_id,
              order:orders(id, order_code, description, status, indirizzo_lavori, percentuale_avanzamento, work_start_date, work_end_date)
            `)
            .in("external_team_id", squadraIds);
          if (assegnateError) throw assegnateError;
          daSquadra = (assegnate ?? []) as unknown as AssignmentRow[];
        }
        return assignmentsToCantieri([...(contracts as AssignmentRow[] | null ?? []), ...daSquadra]);
```

- [ ] **Step 2: Lint + commit**

```bash
npx eslint src/pages/campo/CampoCalendario.tsx
git add src/pages/campo/CampoCalendario.tsx
git commit -m "In /campo la squadra con accesso vede le pose assegnate alla sua squadra"
```

---

### Task 11: Verifica dal vivo e controlli

- [ ] **Step 1: Dev server e sessione Demo Azienda 2** (`demo2@azienda.srl`, company `d2000000-0000-4000-a000-000000000002`) come nelle sessioni precedenti: `generate_link` → `verify` → `public/__d2-session.json` → localStorage → **rm del file**.
- [ ] **Step 2: Percorso**: `/azienda/impostazioni/calendari-lavori` → «Nuova squadra» «Squadra Rossi», esterna, colore, accesso = un subappaltatore → salvata in tabella → tab Calendari standard → riga Posa → tab Collegamenti (avviso titolare + connessione). Se Demo 2 ha una connessione Google `connected`, collegare un calendario alla squadra e verificare `external_teams.google_calendar_id` sul DB; altrimenti verificare che il selettore dica «Nessun account Google collegato».
- [ ] **Step 3: Menu**: la voce compare in menu desktop, hub mobile (375px) e ricerca impostazioni.
- [ ] **Step 4: Subappaltatori**: Impostazioni → Persone → Subappaltatori mostra il rimando.
- [ ] **Step 5: Pulizia**: eliminare la squadra di prova, rm file di sessione.
- [ ] **Step 6: Controlli**: `npx vitest run src/test/logic/squadreCalendari.test.ts`, `NODE_OPTIONS=--max-old-space-size=8192 npx vite build`, `node scripts/typecheck-ratchet.mjs` (~30 min). Tutti verdi. **Nessun push**: si mostra al founder prima.

---

## Self-review

- **Copertura spec (pezzo 1)**: dati → Task 1-2; list-calendars per admin → Task 3; pagina e tre tab → Task 5-7; menu → Task 8; CRUD in un posto solo → Task 9; squadra senza Google in /campo → Task 10; verifica → Task 11. Vincolo «un calendario, una squadra» → indice unico in Task 1 + messaggio in `useCollegaCalendarioSquadra`.
- **Segnaposto**: nessuno.
- **Coerenza nomi**: `statoSyncSquadra`, `calendariLavoriKeys`, `GoogleCalendarPicker`/`SceltaCalendario`, `useCollegaCalendarioSquadra`, `useSalvaCalendarLink`, `SquadraInput.kind` coerenti tra Task 2, 4, 5, 7. `ExternalTeamDialog` riceve `subappaltatori` e `utenti` (Task 6) e li passa `SquadreTab` (Task 7).
