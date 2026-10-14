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
import { DbFinto, denoFinto, type OperazioneFinta, type Riga } from "../helpers/dbFinto";

const condiviso = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => condiviso.client }));

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

interface Periodo {
  evento: unknown;
  calendario: unknown;
  inizio: number;
  fine: number;
  titolo: unknown;
  giornata: unknown;
}

interface EsitoGiro {
  synced: number;
  failed: number;
  results: Array<{ userId?: string; pull?: { pulled: number; scritti: number; tolti: number } }>;
}

const evento = (id: string, inizio: string, fine: string, titolo = "Impegno"): EventoGoogle => ({
  id, status: "confirmed", summary: titolo, start: { dateTime: inizio }, end: { dateTime: fine },
});
const giornata = (id: string, giorno: string, dopo: string): EventoGoogle => ({
  id, status: "confirmed", summary: "Ferie", start: { date: giorno }, end: { date: dopo },
});

/** Google finto: gli eventi per «token|calendario». */
let google: Record<string, EventoGoogle[]>;
let db: DbFinto;
let gestore: (req: Request) => Promise<Response>;

/** Gli eventi di partenza: 5 per il primo utente (principale + squadra), 1 per il secondo, 2 per il terzo. */
function googleIniziale(): Record<string, EventoGoogle[]> {
  return {
    "tok-1|primary": [
      evento("e1", "2026-10-14T10:00:00+02:00", "2026-10-14T11:00:00+02:00", "Sopralluogo"),
      evento("e2", "2026-10-15T09:00:00+02:00", "2026-10-15T10:30:00+02:00", "Riunione"),
      evento("e3", "2026-10-16T14:00:00+02:00", "2026-10-16T15:00:00+02:00", "Cliente Rossi"),
    ],
    [`tok-1|${SQUADRA}`]: [
      evento("s1", "2026-10-20T08:00:00+02:00", "2026-10-20T17:00:00+02:00", "Cantiere"),
      giornata("s2", "2026-10-21", "2026-10-22"),
    ],
    "tok-2|u2@example.com": [evento("f1", "2026-10-14T15:00:00+02:00", "2026-10-14T16:00:00+02:00")],
    "tok-3|primary": [
      evento("g1", "2026-11-03T09:00:00+01:00", "2026-11-03T10:00:00+01:00"),
      giornata("g2", "2026-11-05", "2026-11-06"),
    ],
  };
}

async function seme(periodi: Riga[] = []): Promise<Record<string, Riga[]>> {
  const { encrypt } = await import(/* @vite-ignore */ CIFRATURA);
  const tra = new Date(Date.now() + 3_600_000).toISOString();
  const connessione = async (id: string, utente: string, azienda: string, token: string, email: string): Promise<Riga> => ({
    id, user_id: utente, company_id: azienda, status: "connected", google_account_email: email,
    access_token_encrypted: await encrypt(token, CHIAVE_TOKEN), refresh_token_encrypted: null, token_expires_at: tra,
  });
  return {
    google_calendar_connections: [
      await connessione("c1", U1, AZ1, "tok-1", "u1@example.com"),
      await connessione("c2", U2, AZ1, "tok-2", "u2@example.com"),
      await connessione("c3", U3, AZ2, "tok-3", "u3@example.com"),
    ],
    google_calendar_settings: [
      { id: "s-1", company_id: AZ1, user_id: U1, primary_calendar_id: "primary", conflict_calendar_ids: [SQUADRA], sync_mode: "two_way" },
      { id: "s-2", company_id: AZ1, user_id: U2, primary_calendar_id: "u2@example.com", conflict_calendar_ids: [], sync_mode: "one_way" },
      { id: "s-3", company_id: AZ2, user_id: U3, primary_calendar_id: "primary", conflict_calendar_ids: [], sync_mode: "two_way" },
    ],
    user_calendar_preferences: [
      { id: "p-1", user_id: U1, sync_enabled: true, sync_direction: "both" },
      { id: "p-3", user_id: U3, sync_enabled: true, sync_direction: "from_google" },
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
async function giro(): Promise<{ esito: EsitoGiro; richieste: OperazioneFinta[] }> {
  const da = db.operazioni.length;
  const res = await gestore(new Request("https://finto.supabase.co/functions/v1/google-calendar-sync", {
    method: "POST",
    headers: { "x-cron-secret": SEGRETO_CRON, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "cron-full-sync" }),
  }));
  expect(res.status).toBe(200);
  const esito = (await res.json()) as EsitoGiro;
  return { esito, richieste: db.operazioni.slice(da) };
}

const su = (richieste: OperazioneFinta[], tabella: string, modo: OperazioneFinta["modo"]): OperazioneFinta[] =>
  richieste.filter((o) => o.tabella === tabella && o.modo === modo);

function periodi(utente: string): Periodo[] {
  return db.righe(PERIODI)
    .filter((r) => r.user_id === utente)
    .map((r) => ({
      evento: r.google_event_id,
      calendario: r.google_calendar_id,
      inizio: Date.parse(String(r.start_at)),
      fine: Date.parse(String(r.end_at)),
      titolo: r.summary,
      giornata: r.is_all_day,
    }))
    .sort((a, b) => String(a.evento).localeCompare(String(b.evento)));
}

/** Cosa ci si aspetta dagli eventi di Google, calendario per calendario (l'ultimo che riporta un evento vince). */
function attesi(calendari: Array<[string, string]>): Periodo[] {
  const perEvento = new Map<string, Periodo>();
  for (const [chiave, calendario] of calendari) {
    for (const e of google[chiave] ?? []) {
      const tutto = !!e.start.date;
      perEvento.set(e.id, {
        evento: e.id,
        calendario,
        inizio: Date.parse(tutto ? `${e.start.date}T00:00:00Z` : String(e.start.dateTime)),
        fine: Date.parse(tutto ? `${e.end.date}T00:00:00Z` : String(e.end.dateTime)),
        titolo: e.summary || null,
        giornata: tutto,
      });
    }
  }
  return [...perEvento.values()].sort((a, b) => String(a.evento).localeCompare(String(b.evento)));
}

const CALENDARI_U1: Array<[string, string]> = [["tok-1|primary", "primary"], [`tok-1|${SQUADRA}`, SQUADRA]];

/** Una riga come la restituisce il database: orari in UTC. */
function salvato(id: string, utente: string, azienda: string, calendario: string, eventoId: string, inizio: string, fine: string, titolo: string | null, tuttoIlGiorno = false): Riga {
  return {
    id, company_id: azienda, user_id: utente, google_event_id: eventoId, google_calendar_id: calendario,
    summary: titolo, start_at: inizio, end_at: fine, is_all_day: tuttoIlGiorno, created_at: "2026-10-01T00:00:00+00:00",
  };
}

beforeEach(() => {
  google = googleIniziale();
  vi.stubGlobal("fetch", vi.fn(async (indirizzo: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof indirizzo === "string" ? indirizzo : indirizzo instanceof URL ? indirizzo.href : indirizzo.url);
    const m = url.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events$/);
    if (url.hostname !== "www.googleapis.com" || !m) return new Response("non previsto", { status: 404 });
    const token = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "") ?? "";
    return new Response(JSON.stringify({ items: google[`${token}|${decodeURIComponent(m[1])}`] ?? [] }), { status: 200 });
  }));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("google-calendar-sync: un giro del cron e i periodi occupati", () => {
  it("impostazioni e preferenze si leggono una volta sola per tutto il giro, non a ogni passo di ogni connessione", async () => {
    await avvia();
    const { esito, richieste } = await giro();
    expect(esito.synced).toBe(3);
    expect(su(richieste, "google_calendar_settings", "select")).toHaveLength(1);
    expect(su(richieste, "user_calendar_preferences", "select")).toHaveLength(1);
  });

  it("il primo giro scrive i periodi di ogni connessione con una richiesta sola", async () => {
    await avvia();
    const { esito, richieste } = await giro();
    expect(su(richieste, PERIODI, "upsert").map((o) => o.righe)).toEqual([5, 1, 2]);
    expect(su(richieste, PERIODI, "delete")).toHaveLength(0);
    expect(periodi(U1)).toEqual(attesi(CALENDARI_U1));
    expect(periodi(U2)).toEqual(attesi([["tok-2|u2@example.com", "u2@example.com"]]));
    expect(periodi(U3)).toEqual(attesi([["tok-3|primary", "primary"]]));
    expect(esito.results.find((r) => r.userId === U1)?.pull).toEqual({ pulled: 5, scritti: 5, tolti: 0 });
  });

  it("un giro con Google invariato non scrive niente: legge i periodi salvati e basta", async () => {
    await avvia();
    await giro();
    const prima = JSON.stringify(db.righe(PERIODI));
    const { esito, richieste } = await giro();
    expect(su(richieste, PERIODI, "upsert")).toHaveLength(0);
    expect(su(richieste, PERIODI, "delete")).toHaveLength(0);
    expect(su(richieste, PERIODI, "select")).toHaveLength(3);
    expect(JSON.stringify(db.righe(PERIODI))).toBe(prima);
    expect(esito.results.find((r) => r.userId === U1)?.pull).toEqual({ pulled: 5, scritti: 0, tolti: 0 });
  });

  it("gli stessi orari scritti in un altro fuso non sono un cambiamento (il database li restituisce in UTC)", async () => {
    await avvia([
      salvato("r1", U1, AZ1, "primary", "e1", "2026-10-14T08:00:00+00:00", "2026-10-14T09:00:00+00:00", "Sopralluogo"),
      salvato("r2", U1, AZ1, "primary", "e2", "2026-10-15T07:00:00+00:00", "2026-10-15T08:30:00+00:00", "Riunione"),
      salvato("r3", U1, AZ1, "primary", "e3", "2026-10-16T12:00:00+00:00", "2026-10-16T13:00:00+00:00", "Cliente Rossi"),
      salvato("r4", U1, AZ1, SQUADRA, "s1", "2026-10-20T06:00:00+00:00", "2026-10-20T15:00:00+00:00", "Cantiere"),
      salvato("r5", U1, AZ1, SQUADRA, "s2", "2026-10-21T00:00:00+00:00", "2026-10-22T00:00:00+00:00", "Ferie", true),
    ]);
    const { richieste } = await giro();
    // Scrivono solo le due connessioni senza periodi salvati.
    expect(su(richieste, PERIODI, "upsert").map((o) => o.righe)).toEqual([1, 2]);
    expect(db.righe(PERIODI).filter((r) => r.user_id === U1).map((r) => r.id).sort()).toEqual(["r1", "r2", "r3", "r4", "r5"]);
  });

  it("quando Google cambia si scrivono solo i periodi nuovi o cambiati, e si tolgono con una richiesta quelli spariti", async () => {
    await avvia();
    await giro();
    google["tok-1|primary"] = [
      evento("e1", "2026-10-14T11:00:00+02:00", "2026-10-14T12:00:00+02:00", "Sopralluogo"), // spostato di un'ora
      evento("e3", "2026-10-16T14:00:00+02:00", "2026-10-16T15:00:00+02:00", "Cliente Rossi e figli"), // titolo nuovo
      evento("e6", "2026-10-17T09:00:00+02:00", "2026-10-17T10:00:00+02:00", "Nuovo"), // nuovo; e2 sparito
    ];
    const { esito, richieste } = await giro();
    const scritture = su(richieste, PERIODI, "upsert");
    expect(scritture.map((o) => o.righe)).toEqual([3]);
    expect(su(richieste, PERIODI, "delete").map((o) => o.righe)).toEqual([1]);
    expect(periodi(U1)).toEqual(attesi(CALENDARI_U1));
    expect(periodi(U1).map((p) => p.evento)).not.toContain("e2");
    expect(esito.results.find((r) => r.userId === U1)?.pull).toEqual({ pulled: 5, scritti: 3, tolti: 1 });
  });

  it("lo stesso evento in due calendari resta una riga sola e vale l'ultimo calendario letto, come prima", async () => {
    await avvia();
    const invito = evento("comune", "2026-10-22T09:00:00+02:00", "2026-10-22T10:00:00+02:00", "Invito");
    google["tok-1|primary"].push(invito);
    google[`tok-1|${SQUADRA}`].push(invito);
    const { esito } = await giro();
    expect(esito.failed).toBe(0);
    const righe = db.righe(PERIODI).filter((r) => r.google_event_id === "comune");
    expect(righe).toHaveLength(1);
    expect(righe[0].google_calendar_id).toBe(SQUADRA);
    expect(periodi(U1)).toEqual(attesi(CALENDARI_U1));
    expect(esito.results.find((r) => r.userId === U1)?.pull).toEqual({ pulled: 7, scritti: 6, tolti: 0 });
  });

  it("i periodi di un calendario che non si legge più restano, come prima", async () => {
    const vecchio = salvato("v1", U1, AZ1, "vecchio@group.calendar.google.com", "v-1", "2026-10-30T08:00:00+00:00", "2026-10-30T09:00:00+00:00", "Vecchio");
    await avvia([vecchio]);
    const { richieste } = await giro();
    expect(su(richieste, PERIODI, "delete")).toHaveLength(0);
    expect(db.righe(PERIODI).some((r) => r.id === "v1")).toBe(true);
  });

  it("se Google non riporta nessun evento l'utente resta senza periodi, anche quelli dei calendari non più letti, come prima", async () => {
    await avvia([
      salvato("w1", U2, AZ1, "u2@example.com", "f1", "2026-10-14T13:00:00+00:00", "2026-10-14T14:00:00+00:00", null),
      salvato("w2", U2, AZ1, "altro@group.calendar.google.com", "f9", "2026-10-18T13:00:00+00:00", "2026-10-18T14:00:00+00:00", null),
    ]);
    google["tok-2|u2@example.com"] = [];
    const { esito, richieste } = await giro();
    expect(periodi(U2)).toEqual([]);
    expect(su(richieste, PERIODI, "delete").map((o) => o.righe)).toEqual([2]);
    expect(esito.results.find((r) => r.userId === U2)?.pull).toEqual({ pulled: 0, scritti: 0, tolti: 2 });
  });

  it("un periodo che il database rifiuta non ferma gli altri: il lotto si riscrive una riga alla volta", async () => {
    await avvia();
    db.rifiuta = (tabella, riga) =>
      tabella === PERIODI && riga.google_event_id === "e2" ? { message: "unsupported Unicode escape sequence", code: "22P05" } : null;
    const { esito } = await giro();
    expect(periodi(U1).map((p) => p.evento)).toEqual(["e1", "e3", "s1", "s2"]);
    expect(esito.results.find((r) => r.userId === U1)?.pull).toEqual({ pulled: 5, scritti: 4, tolti: 0 });
    expect(periodi(U2)).toHaveLength(1);
    expect(periodi(U3)).toHaveLength(2);
  });

  it("se il database non risponde alla scrittura non si insiste: i periodi arrivano al giro dopo", async () => {
    await avvia();
    db.erroriProssimi[`${PERIODI}:upsert`] = { message: "canceling statement due to statement timeout", code: "57014" };
    const primo = await giro();
    expect(su(primo.richieste, PERIODI, "upsert").map((o) => o.righe)).toEqual([5, 1, 2]);
    expect(periodi(U1)).toEqual([]);
    await giro();
    expect(periodi(U1)).toEqual(attesi(CALENDARI_U1));
  });

  it("se la lettura dei periodi salvati non riesce si scrivono tutti i letti e per quel giro non si toglie niente", async () => {
    const sparito = salvato("x1", U1, AZ1, "primary", "e-vecchio", "2026-10-13T08:00:00+00:00", "2026-10-13T09:00:00+00:00", "Sparito");
    await avvia([sparito]);
    db.erroriProssimi[`${PERIODI}:select`] = "connessione interrotta";
    const { richieste } = await giro();
    expect(su(richieste, PERIODI, "upsert")[0].righe).toBe(5);
    expect(su(richieste, PERIODI, "delete")).toHaveLength(0);
    expect(db.righe(PERIODI).some((r) => r.id === "x1")).toBe(true);
    // Al giro dopo la lettura riesce e il periodo sparito se ne va.
    await giro();
    expect(db.righe(PERIODI).some((r) => r.id === "x1")).toBe(false);
  });
});
