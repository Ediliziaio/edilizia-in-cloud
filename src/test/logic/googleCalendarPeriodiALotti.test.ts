/**
 * google-calendar-sync: i periodi occupati si scrivono a lotti e solo quando cambiano (12/10/2026).
 *
 * Si prova il gestore vero, chiamato come lo chiama il cron, con un database finto
 * (src/test/helpers/dbFinto.ts) e un Google finto. Un giro:
 * - legge impostazioni e preferenze una volta sola, per tutte le connessioni;
 * - scrive i periodi con una richiesta per connessione, e solo quelli nuovi o cambiati;
 * - toglie con una richiesta i periodi che Google non riporta più;
 * - lascia alla fine gli stessi periodi di sempre: stesso evento in due calendari, calendari
 *   non più letti, Google senza eventi, un periodo che il database rifiuta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DbFinto,
  denoFinto,
  type OperazioneFinta,
  type Riga,
} from "../helpers/dbFinto";

const condiviso = vi.hoisted(() => ({
  client: null as unknown,
  busy: vi.fn(),
  mappings: vi.fn(),
}));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({
  createClient: () => condiviso.client,
}));
vi.mock("../../../supabase/functions/_shared/googleBusySlots.ts", () => ({
  syncGoogleBusySlots: condiviso.busy,
}));
vi.mock(
  "../../../supabase/functions/_shared/googleAppointmentPersistence.ts",
  () => ({
    loadGoogleAppointmentMappings: condiviso.mappings,
    applyGoogleAppointmentChange: vi.fn(),
    deleteGoogleAppointmentEvent: vi.fn(),
    importGoogleAppointment: vi.fn(),
    insertGoogleAppointmentEvent: vi.fn(),
    saveGoogleAppointmentMapping: vi.fn(),
  }),
);
vi.mock(
  "../../../supabase/functions/_shared/googleAppointmentReconcile.ts",
  () => ({
    listGoogleAppointmentEvents: async (): Promise<unknown[]> => [],
    reconcileMissingGoogleAppointments: async (): Promise<number> => 0,
  }),
);

const FUNZIONE = "../../../supabase/functions/google-calendar-sync/index";
const CIFRATURA = "../../../supabase/functions/_shared/encryption";
const CHIAVE_TOKEN = "chiave-di-prova-per-i-token-0001";
const SEGRETO_CRON = "segreto-del-cron-di-prova";
const PERIODI = "google_calendar_busy_slots";

const AZ1 = "az-1";
const AZ2 = "az-2";
const U1 = "utente-1";
const U2 = "utente-2";
const U3 = "utente-3";
const SQUADRA = "squadra@group.calendar.google.com";

interface EventoGoogle {
  id: string;
  status: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

interface EsitoGiro {
  synced: number;
  failed: number;
  results: Array<{
    userId?: string;
    pull?: { pulled: number; scritti: number; tolti: number };
  }>;
}

const evento = (
  id: string,
  inizio: string,
  fine: string,
  titolo = "Impegno",
): EventoGoogle => ({
  id,
  status: "confirmed",
  summary: titolo,
  start: { dateTime: inizio },
  end: { dateTime: fine },
});
const giornata = (id: string, giorno: string, dopo: string): EventoGoogle => ({
  id,
  status: "confirmed",
  summary: "Ferie",
  start: { date: giorno },
  end: { date: dopo },
});

/** Google finto: gli eventi per «token|calendario». */
let google: Record<string, EventoGoogle[]>;
let db: DbFinto;
let gestore: (req: Request) => Promise<Response>;

/** Gli eventi di partenza: 5 per il primo utente (principale + squadra), 1 per il secondo, 2 per il terzo. */
function googleIniziale(): Record<string, EventoGoogle[]> {
  return {
    "tok-1|primary": [
      evento(
        "e1",
        "2026-10-14T10:00:00+02:00",
        "2026-10-14T11:00:00+02:00",
        "Sopralluogo",
      ),
      evento(
        "e2",
        "2026-10-15T09:00:00+02:00",
        "2026-10-15T10:30:00+02:00",
        "Riunione",
      ),
      evento(
        "e3",
        "2026-10-16T14:00:00+02:00",
        "2026-10-16T15:00:00+02:00",
        "Cliente Rossi",
      ),
    ],
    [`tok-1|${SQUADRA}`]: [
      evento(
        "s1",
        "2026-10-20T08:00:00+02:00",
        "2026-10-20T17:00:00+02:00",
        "Cantiere",
      ),
      giornata("s2", "2026-10-21", "2026-10-22"),
    ],
    "tok-2|u2@example.com": [
      evento("f1", "2026-10-14T15:00:00+02:00", "2026-10-14T16:00:00+02:00"),
    ],
    "tok-3|primary": [
      evento("g1", "2026-11-03T09:00:00+01:00", "2026-11-03T10:00:00+01:00"),
      giornata("g2", "2026-11-05", "2026-11-06"),
    ],
  };
}

async function seme(periodi: Riga[] = []): Promise<Record<string, Riga[]>> {
  const { encrypt } = await import(/* @vite-ignore */ CIFRATURA);
  const tra = new Date(Date.now() + 3_600_000).toISOString();
  const connessione = async (
    id: string,
    utente: string,
    azienda: string,
    token: string,
    email: string,
  ): Promise<Riga> => ({
    id,
    user_id: utente,
    company_id: azienda,
    status: "connected",
    google_account_email: email,
    access_token_encrypted: await encrypt(token, CHIAVE_TOKEN),
    refresh_token_encrypted: null,
    token_expires_at: tra,
  });
  return {
    google_calendar_connections: [
      await connessione("c1", U1, AZ1, "tok-1", "u1@example.com"),
      await connessione("c2", U2, AZ1, "tok-2", "u2@example.com"),
      await connessione("c3", U3, AZ2, "tok-3", "u3@example.com"),
    ],
    google_calendar_settings: [
      {
        id: "s-1",
        company_id: AZ1,
        user_id: U1,
        primary_calendar_id: "primary",
        conflict_calendar_ids: [SQUADRA],
        sync_mode: "two_way",
      },
      {
        id: "s-2",
        company_id: AZ1,
        user_id: U2,
        primary_calendar_id: "u2@example.com",
        conflict_calendar_ids: [],
        sync_mode: "one_way",
      },
      {
        id: "s-3",
        company_id: AZ2,
        user_id: U3,
        primary_calendar_id: "primary",
        conflict_calendar_ids: [],
        sync_mode: "two_way",
      },
    ],
    user_calendar_preferences: [
      { id: "p-1", user_id: U1, sync_enabled: true, sync_direction: "both" },
      {
        id: "p-3",
        user_id: U3,
        sync_enabled: true,
        sync_direction: "from_google",
      },
    ],
    external_teams: [],
    marketing_calendars: [],
    appointments: [],
    google_calendar_event_map: [],
    google_calendar_sync_queue: [],
    google_calendar_watches: [],
    google_calendar_sync_log: [],
    system_health_metrics: [],
    [PERIODI]: periodi,
  };
}

async function avvia(periodi: Riga[] = []): Promise<void> {
  const { deno, gestore: consegnato } = denoFinto({
    SUPABASE_URL: "https://finto.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "chiave-servizio",
    CRON_SECRET: SEGRETO_CRON,
    GOOGLE_TOKEN_ENCRYPTION_KEY: CHIAVE_TOKEN,
  });
  vi.stubGlobal("Deno", deno);
  db = new DbFinto(await seme(periodi));
  // Ritorno da Google acceso, import nel CRM solo su richiesta dell'utente (nessuno qui).
  db.rispostaRpc.impostazione_piattaforma = "true";
  condiviso.client = db.client;
  vi.resetModules();
  await import(/* @vite-ignore */ FUNZIONE);
  gestore = consegnato();
}

/** Un giro del cron; restituisce l'esito e le richieste arrivate al database durante il giro. */
async function giro(
  expectedStatus = 200,
): Promise<{ esito: EsitoGiro; richieste: OperazioneFinta[] }> {
  const da = db.operazioni.length;
  const res = await gestore(
    new Request("https://finto.supabase.co/functions/v1/google-calendar-sync", {
      method: "POST",
      headers: {
        "x-cron-secret": SEGRETO_CRON,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "cron-full-sync" }),
    }),
  );
  expect(res.status).toBe(expectedStatus);
  const esito = (await res.json()) as EsitoGiro;
  return { esito, richieste: db.operazioni.slice(da) };
}

const su = (
  richieste: OperazioneFinta[],
  tabella: string,
  modo: OperazioneFinta["modo"],
): OperazioneFinta[] =>
  richieste.filter((o) => o.tabella === tabella && o.modo === modo);

/** Una riga come la restituisce il database: orari in UTC. */
function salvato(
  id: string,
  utente: string,
  azienda: string,
  calendario: string,
  eventoId: string,
  inizio: string,
  fine: string,
  titolo: string | null,
  tuttoIlGiorno = false,
): Riga {
  return {
    id,
    company_id: azienda,
    user_id: utente,
    google_event_id: eventoId,
    google_calendar_id: calendario,
    summary: titolo,
    start_at: inizio,
    end_at: fine,
    is_all_day: tuttoIlGiorno,
    created_at: "2026-10-01T00:00:00+00:00",
  };
}

beforeEach(() => {
  condiviso.busy
    .mockReset()
    .mockResolvedValue({
      pulled: 5,
      written: 5,
      removed: 0,
      failedCalendars: [],
    });
  condiviso.mappings.mockReset().mockResolvedValue([]);
  google = googleIniziale();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (
        indirizzo: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        const url = new URL(
          typeof indirizzo === "string"
            ? indirizzo
            : indirizzo instanceof URL
              ? indirizzo.href
              : indirizzo.url,
        );
        const m = url.pathname.match(
          /^\/calendar\/v3\/calendars\/([^/]+)\/events$/,
        );
        if (url.hostname !== "www.googleapis.com" || !m)
          return new Response("non previsto", { status: 404 });
        const token =
          new Headers(init?.headers)
            .get("Authorization")
            ?.replace("Bearer ", "") ?? "";
        return new Response(
          JSON.stringify({
            items: google[`${token}|${decodeURIComponent(m[1])}`] ?? [],
          }),
          { status: 200 },
        );
      },
    ),
  );
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Il cron delega il confronto e le scritture al modello protetto condiviso.
// Paginazione, lotti, fencing e pulizia per calendario sono verificati in
// googleBusySlots.test.ts e scripts/test-calendar-lease.mjs.
describe("google-calendar-sync: giro condiviso e risultati affidabili", () => {
  it("impostazioni e preferenze si leggono una sola volta per tutte le connessioni", async () => {
    await avvia();
    const { esito, richieste } = await giro();
    expect(esito.synced).toBe(3);
    expect(su(richieste, "google_calendar_settings", "select")).toHaveLength(1);
    expect(su(richieste, "user_calendar_preferences", "select")).toHaveLength(
      1,
    );
    expect(condiviso.busy).toHaveBeenCalledTimes(3);
  });
  it("ogni sincronizzazione conserva azienda, utente, connessione e calendari propri", async () => {
    await avvia();
    await giro();
    const scopes = condiviso.busy.mock.calls.map((call) => call[1]);
    expect(scopes).toEqual([
      expect.objectContaining({
        companyId: AZ1,
        userId: U1,
        connectionId: "c1",
        calendarIds: ["primary", SQUADRA],
      }),
      expect.objectContaining({
        companyId: AZ1,
        userId: U2,
        connectionId: "c2",
        calendarIds: ["u2@example.com"],
      }),
      expect.objectContaining({
        companyId: AZ2,
        userId: U3,
        connectionId: "c3",
        calendarIds: ["primary"],
      }),
    ]);
  });
  it("un calendario non verificato produce un esito di errore, conserva gli altri risultati e non aggiorna last_sync", async () => {
    await avvia();
    condiviso.busy.mockResolvedValueOnce({
      pulled: 0,
      written: 0,
      removed: 0,
      failedCalendars: ["primary"],
    });
    const { esito } = await giro(502);
    expect(esito.failed).toBe(1);
    expect(esito.synced).toBe(2);
    expect(
      db.righe("google_calendar_connections").find((r) => r.id === "c1")
        ?.last_sync_at,
    ).toBeUndefined();
    expect(db.righe("google_calendar_sync_log")[0].status).toBe("failed");
  });
  it("una presa in carico già attiva non viene conteggiata come sincronizzazione riuscita", async () => {
    await avvia();
    condiviso.busy.mockResolvedValueOnce({
      pulled: 0,
      written: 0,
      removed: 0,
      failedCalendars: [],
      deferredCalendars: ["primary"],
    });
    const { esito } = await giro();
    expect(esito.failed).toBe(0);
    expect(esito.synced).toBe(2);
    expect(esito).toMatchObject({ inCorso: 1 });
    expect(
      db.righe("google_calendar_connections").find((r) => r.id === "c1")
        ?.last_sync_at,
    ).toBeUndefined();
  });
  it("la pausa personale interrompe la sincronizzazione prima di leggere Google", async () => {
    await avvia();
    db.righe("user_calendar_preferences")[0].sync_enabled = false;
    const { esito } = await giro();
    expect(esito.synced).toBe(2);
    expect(esito).toMatchObject({ inPausa: 1 });
    expect(
      condiviso.busy.mock.calls.some((call) => call[1].userId === U1),
    ).toBe(false);
  });
  it("gli impegni di una connessione non vengono cancellati da un errore di un'altra", async () => {
    await avvia([
      salvato(
        "busy",
        U2,
        AZ1,
        "u2@example.com",
        "keep",
        "2026-10-14T15:00Z",
        "2026-10-14T16:00Z",
        "Altro utente",
      ),
    ]);
    condiviso.busy.mockResolvedValueOnce({
      pulled: 0,
      written: 0,
      removed: 0,
      failedCalendars: ["primary"],
    });
    await giro(502);
    expect(db.righe(PERIODI)).toHaveLength(1);
    expect(db.righe(PERIODI)[0].google_event_id).toBe("keep");
  });
});
