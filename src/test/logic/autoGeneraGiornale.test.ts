/**
 * Il giro serale del giornale, col gestore vero e un database finto: scrive bozze
 * composte dai dati del giorno, non chiama l'AI, non tocca le pagine esistenti.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbFinto, denoFinto, type Riga } from "../helpers/dbFinto";

const condiviso = vi.hoisted(() => ({ client: null as unknown, ai: vi.fn() }));
vi.mock("https://esm.sh/@supabase/supabase-js@2.43.4", () => ({ createClient: () => condiviso.client }));
vi.mock("https://deno.land/x/xhr@0.1.0/mod.ts", () => ({}));
vi.mock("../../../supabase/functions/_shared/aiRouter.ts", () => ({ aiRouterComplete: condiviso.ai }));
vi.mock("../../../supabase/functions/_shared/withMetricsRapida.ts", () => ({
  serveConMetricheRapida: (_nome: string, gestore: (req: Request) => Promise<Response>) => (globalThis as unknown as { Deno: { serve: (g: unknown) => void } }).Deno.serve(gestore),
}));

const FUNZIONE = "../../../supabase/functions/auto-genera-giornale-cantiere/index";
const CHIAVE = "chiave-service-role";
const OGGI = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());

function database(parte: Partial<Record<string, Riga[]>> = {}): DbFinto {
  const db = new DbFinto();
  Object.assign(db.tabelle, {
    companies: [{ id: "az", name: "Az", status: "active", giornale_auto_enabled: true }, { id: "spenta", name: "Sp", status: "active", giornale_auto_enabled: false }],
    user_roles: [{ user_id: "tit", role: "company_admin" }, { user_id: "tit2", role: "company_admin" }],
    profiles: [{ id: "tit", company_id: "az", first_name: "Tito", last_name: "Lare" }, { id: "tit2", company_id: "spenta" }, { id: "u1", company_id: "az", first_name: "Mario", last_name: "Rossi" }],
    orders: [
      { id: "o1", company_id: "az", status: "in_corso", giornale_auto_enabled: true, deleted_at: null },
      { id: "o-no", company_id: "az", status: "in_corso", giornale_auto_enabled: false, deleted_at: null },
      { id: "o-s", company_id: "spenta", status: "in_corso", giornale_auto_enabled: true, deleted_at: null },
    ],
    campo_rapportini: [
      { id: "r1", company_id: "az", order_id: "o1", user_id: "u1", stato: "approvato", data_lavoro: OGGI, descrizione_lavori: "Posa guaina", materiali_usati: [{ nome: "Colla", quantita: 2, unita: "kg" }], meteo: "pioggia", percentuale_avanzamento: 30, presenze: null, ore_lavorate: 8 },
      { id: "r-rif", company_id: "az", order_id: "o1", user_id: "u1", stato: "rifiutato", data_lavoro: OGGI, descrizione_lavori: "Da rifare" },
      { id: "r-no", company_id: "az", order_id: "o-no", user_id: "u1", stato: "inviato", data_lavoro: OGGI, descrizione_lavori: "Commessa spenta" },
      { id: "r-s", company_id: "spenta", order_id: "o-s", user_id: "tit2", stato: "inviato", data_lavoro: OGGI, descrizione_lavori: "Azienda spenta" },
    ],
    foto_cantiere: [{ id: "f1", company_id: "az", order_id: "o1", taken_at: new Date().toISOString() }],
    tickets: [{ id: "t1", company_id: "az", order_id: "o1", fonte: "campo", titolo: "Perdita", created_at: new Date().toISOString() }],
    ddt_ricezione: [
      { id: "d1", company_id: "az", order_id: null, oda: { order_id: "o1" }, numero_ddt: "77", stato: "ricevuto", destinazione: "cantiere", data_ricezione: OGGI, fornitore: { name: "Edilmat" } },
      { id: "d-att", company_id: "az", order_id: "o1", numero_ddt: "78", stato: "atteso", data_ricezione: OGGI },
    ],
    giornale_lavori: [],
    ...parte,
  });
  return db;
}

async function giraCoda(db: DbFinto, coda: Riga[]): Promise<Record<string, unknown>> {
  condiviso.client = new Proxy(db.client as object, { get: (o, k) => (k === "rpc" ? async () => ({ data: coda, error: null as unknown }) : Reflect.get(o, k)) });
  const { deno, gestore } = denoFinto({ SUPABASE_URL: "https://x", SUPABASE_SERVICE_ROLE_KEY: CHIAVE });
  vi.stubGlobal("Deno", deno);
  vi.resetModules();
  await import(/* @vite-ignore */ FUNZIONE);
  const r = await gestore()(new Request("https://x/f", { method: "POST", headers: { authorization: `Bearer ${CHIAVE}` }, body: JSON.stringify({ modo: "coda" }) }));
  return await r.json() as Record<string, unknown>;
}

async function gira(db: DbFinto): Promise<{ status: number; corpo: Record<string, unknown> }> {
  condiviso.client = db.client;
  const { deno, gestore } = denoFinto({ SUPABASE_URL: "https://x", SUPABASE_SERVICE_ROLE_KEY: CHIAVE });
  vi.stubGlobal("Deno", deno);
  vi.resetModules();
  await import(/* @vite-ignore */ FUNZIONE);
  const r = await gestore()(new Request("https://x/f", { method: "POST", headers: { authorization: `Bearer ${CHIAVE}` } }));
  return { status: r.status, corpo: await r.json() as Record<string, unknown> };
}

beforeEach(() => { condiviso.ai.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("auto-genera-giornale-cantiere", () => {
  it("scrive una bozza dai dati del giorno, con tutte le fonti e non visibile al cliente", async () => {
    const db = database();
    const { status, corpo } = await gira(db);
    expect(status).toBe(200);
    expect(corpo).toMatchObject({ giornali_generated: 1, errors: 0 });
    expect(db.tabelle.giornale_lavori).toHaveLength(1);
    expect(db.tabelle.giornale_lavori[0]).toMatchObject({
      company_id: "az", order_id: "o1", data_lavori: OGGI, stato: "bozza", generation_method: "imported", visibile_cliente: false, created_by: "tit",
      lavorazioni_eseguite: "Posa guaina",
      materiali_utilizzati: "Colla: 2 kg",
      note: "",
      condizioni_meteo: "pioggia", personale_presente: 1, avanzamento_percentuale: 30,
      source_rapportini_ids: ["r1"], source_ddt_ids: ["d1"], source_segnalazioni_ids: ["t1"], source_foto_ids: ["f1"],
    });
    expect(db.tabelle.giornale_eventi).toEqual(expect.arrayContaining([
      expect.objectContaining({ company_id: "az", giornale_id: db.tabelle.giornale_lavori[0].id, tipo: "consegna", ddt_id: "d1", testo: "DDT 77 di Edilmat" }),
      expect.objectContaining({ company_id: "az", giornale_id: db.tabelle.giornale_lavori[0].id, tipo: "problema", ticket_id: "t1", testo: "Perdita" }),
    ]));
    expect(db.tabelle.giornale_eventi).toHaveLength(2);
  });

  it("su una pagina che c'era già non scrive eventi", async () => {
    const db = database({ giornale_lavori: [{ id: "g1", company_id: "az", order_id: "o1", data_lavori: OGGI, stato: "bozza", lavorazioni_eseguite: "Scritto a mano" }] });
    await gira(db);
    expect(db.tabelle.giornale_eventi ?? []).toHaveLength(0);
  });

  it("non chiama l'AI, e il sorgente non la importa più", async () => {
    await gira(database());
    expect(condiviso.ai).not.toHaveBeenCalled();
    const sorgente = readFileSync(resolve(process.cwd(), "supabase/functions/auto-genera-giornale-cantiere/index.ts"), "utf8");
    expect(sorgente).not.toMatch(/aiRouter|aiRouterComplete|silvio_tool_genera_giornale/);
  });

  it("salta se la pagina esiste, bozza o firmata, e non la tocca", async () => {
    for (const stato of ["bozza", "firmata"]) {
      const pagina = { id: "g1", company_id: "az", order_id: "o1", data_lavori: OGGI, stato, lavorazioni_eseguite: "Scritto da una persona" };
      const db = database({ giornale_lavori: [{ ...pagina }] });
      const { corpo } = await gira(db);
      expect(corpo).toMatchObject({ giornali_generated: 0, errors: 0 });
      expect(db.tabelle.giornale_lavori).toEqual([pagina]);
    }
  });

  it("rispetta gli interruttori di azienda e commessa", async () => {
    const db = database();
    await gira(db);
    expect(db.tabelle.giornale_lavori.map((g) => g.order_id)).toEqual(["o1"]);
  });

  it("nessuna azienda accesa: non scrive niente", async () => {
    const db = database({ companies: [{ id: "az", status: "active", giornale_auto_enabled: false }] });
    const { corpo } = await gira(db);
    expect(corpo.giornali_generated).toBe(0);
    expect(db.tabelle.giornale_lavori).toEqual([]);
  });

  it("solo foto: niente da scrivere, niente pagina vuota", async () => {
    const db = database({ campo_rapportini: [], tickets: [], ddt_ricezione: [] });
    const { corpo } = await gira(db);
    expect(corpo).toMatchObject({ giornali_generated: 0, errors: 0 });
    expect(db.tabelle.giornale_lavori).toEqual([]);
  });

  it("azienda sospesa: salta", async () => {
    const db = database({ companies: [{ id: "az", status: "suspended", giornale_auto_enabled: true }] });
    await gira(db);
    expect(db.tabelle.giornale_lavori).toEqual([]);
  });

  it("senza segreto del cron né chiave: 401", async () => {
    condiviso.client = database().client;
    const { deno, gestore } = denoFinto({ SUPABASE_URL: "https://x", SUPABASE_SERVICE_ROLE_KEY: CHIAVE, CRON_SECRET: "s" });
    vi.stubGlobal("Deno", deno);
    vi.resetModules();
    await import(/* @vite-ignore */ FUNZIONE);
    expect((await gestore()(new Request("https://x/f", { method: "POST" }))).status).toBe(401);
  });

  describe("quando cambiano i rapportini", () => {
    const coda = [{ order_id: "o1", data_lavori: OGGI, company_id: "az" }];
    const auto = { lavorazioni_eseguite: "Vecchio", materiali_utilizzati: "", note: "", condizioni_meteo: null as unknown, personale_presente: null as unknown, avanzamento_percentuale: null as unknown };

    it("riscrive la pagina nata in automatico e mai toccata", async () => {
      const db = database({ giornale_lavori: [{ id: "g", company_id: "az", order_id: "o1", data_lavori: OGGI, stato: "bozza", ...auto, bozza_auto_campi: auto }] });
      expect(await giraCoda(db, coda)).toMatchObject({ aggiornate: 1, errori: 0 });
      expect(String(db.tabelle.giornale_lavori[0].lavorazioni_eseguite)).toContain("Posa guaina");
    });

    it("una pagina modificata a mano non cambia: si segnala", async () => {
      const db = database({ giornale_lavori: [{ id: "g", company_id: "az", order_id: "o1", data_lavori: OGGI, stato: "bozza", ...auto, lavorazioni_eseguite: "Scritto da me", bozza_auto_campi: auto }] });
      expect(await giraCoda(db, coda)).toMatchObject({ segnalate: 1, aggiornate: 0 });
      expect(db.tabelle.giornale_lavori[0].lavorazioni_eseguite).toBe("Scritto da me");
      expect(db.tabelle.giornale_lavori[0].aggiornamento_disponibile_il).toBeTruthy();
    });

    it("una pagina firmata non si tocca", async () => {
      const db = database({ giornale_lavori: [{ id: "g", company_id: "az", order_id: "o1", data_lavori: OGGI, stato: "firmata", ...auto, bozza_auto_campi: auto }] });
      expect(await giraCoda(db, coda)).toMatchObject({ saltate: 1, aggiornate: 0, segnalate: 0 });
      expect(db.tabelle.giornale_lavori[0].lavorazioni_eseguite).toBe("Vecchio");
    });

    it("una pagina che non c'è ancora nasce, con la traccia di cosa ha scritto", async () => {
      const db = database();
      expect(await giraCoda(db, coda)).toMatchObject({ create: 1 });
      expect(db.tabelle.giornale_lavori[0].bozza_auto_campi).toBeTruthy();
    });
  });
});
