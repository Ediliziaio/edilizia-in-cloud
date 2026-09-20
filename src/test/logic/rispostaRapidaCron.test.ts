import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chiamataDaPgNet,
  conRispostaRapida,
} from "../../../supabase/functions/_shared/rispostaRapidaCron";

/**
 * Perché la coda dei cron si fermava due minuti più volte all'ora (20/09/2026).
 *
 * pg_net elabora un lotto di richieste dentro una sola transazione: la funzione
 * più lenta del lotto tiene ferme tutte le altre. Il cron non legge la risposta,
 * quindi farlo aspettare non serve: gli si risponde entro pochi secondi e il
 * lavoro finisce sotto EdgeRuntime.waitUntil. Chi chiama dall'interfaccia,
 * invece, deve continuare a ricevere l'esito vero.
 */
describe("Al cron si risponde subito, il lavoro finisce dopo", () => {
  const URL_FUNZIONE = "https://esempio.supabase.co/functions/v1/funzione-di-prova";

  const richiesta = (headers: Record<string, string> = {}, corpo: unknown = {}) =>
    new Request(URL_FUNZIONE, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(corpo),
    });

  const PG_NET = { "User-Agent": "pg_net/0.20.0", "x-cron-secret": "s" };
  const tra = (ms: number) => new Promise((r) => setTimeout(r, ms));

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).EdgeRuntime;
    vi.restoreAllMocks();
  });

  it("riconosce pg_net dallo User-Agent, non dall'header del segreto", () => {
    expect(chiamataDaPgNet(richiesta({ "User-Agent": "pg_net/0.20.0" }))).toBe(true);
    expect(chiamataDaPgNet(richiesta({ "User-Agent": "pg_net/0.19.5" }))).toBe(true);
    // Una funzione che ne chiama un'altra manda il segreto del cron, ma ne aspetta l'esito.
    expect(chiamataDaPgNet(richiesta({ "x-cron-secret": "qualcosa", "User-Agent": "Deno/2.1.4" }))).toBe(false);
    expect(chiamataDaPgNet(richiesta({ Authorization: "Bearer abc" }))).toBe(false);
  });

  it("chi chiama dall'interfaccia o da un'altra funzione aspetta e riceve l'esito vero, anche se lento", async () => {
    const risposta = await conRispostaRapida(
      richiesta({ "x-cron-secret": "s", "User-Agent": "Deno/2.1.4" }),
      async () => {
        await tra(60);
        return new Response(JSON.stringify({ elaborati: 3 }), { status: 200 });
      },
      { attesaMs: 20 },
    );
    expect(risposta.status).toBe(200);
    expect(await risposta.json()).toEqual({ elaborati: 3 });
  });

  it("a pg_net, se il lavoro è breve, arriva l'esito vero: il monitoraggio vede ancora 200 e 401", async () => {
    const ok = await conRispostaRapida(
      richiesta(PG_NET),
      async () => new Response(JSON.stringify({ elaborati: 0 }), { status: 200 }),
      { attesaMs: 50 },
    );
    expect(ok.status).toBe(200);

    const rifiutato = await conRispostaRapida(
      richiesta(PG_NET),
      async () => new Response("Unauthorized", { status: 401 }),
      { attesaMs: 50 },
    );
    expect(rifiutato.status).toBe(401);
  });

  it("a pg_net, se il lavoro è lungo, arriva 202 e il lavoro finisce sotto waitUntil", async () => {
    const affidate: Promise<unknown>[] = [];
    (globalThis as Record<string, unknown>).EdgeRuntime = {
      waitUntil: (p: Promise<unknown>) => { affidate.push(p); },
    };
    vi.spyOn(console, "log").mockImplementation(() => {});

    let finito = false;
    const inizio = Date.now();
    const risposta = await conRispostaRapida(
      richiesta(PG_NET),
      async () => {
        await tra(120);
        finito = true;
        return new Response("{}", { status: 200 });
      },
      { attesaMs: 30, nome: "funzione-di-prova" },
    );

    expect(risposta.status).toBe(202);
    expect(Date.now() - inizio).toBeLessThan(110);
    expect(finito).toBe(false);
    expect(await risposta.json()).toMatchObject({ accettato: true, in_background: true, funzione: "funzione-di-prova" });

    // Il lavoro è stato affidato al runtime, e arriva in fondo.
    expect(affidate).toHaveLength(1);
    await affidate[0];
    expect(finito).toBe(true);
  });

  it("il corpo della richiesta resta leggibile anche dopo il 202", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    let letto: unknown = null;
    let fine: () => void = () => {};
    const completato = new Promise<void>((r) => { fine = r; });

    const risposta = await conRispostaRapida(
      richiesta(PG_NET, { limite: 25 }),
      async (req) => {
        await tra(60);
        letto = await req.json();
        fine();
        return new Response("{}", { status: 200 });
      },
      { attesaMs: 15 },
    );

    expect(risposta.status).toBe(202);
    await completato;
    expect(letto).toEqual({ limite: 25 });
  });

  it("un errore non gestito diventa un 500, non una promessa rifiutata nel vuoto", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const risposta = await conRispostaRapida(
      richiesta(PG_NET),
      async () => { throw new Error("tabella inesistente"); },
      { attesaMs: 50 },
    );
    expect(risposta.status).toBe(500);
    expect(await risposta.json()).toEqual({ error: "tabella inesistente" });
  });

  it("una Response lanciata dal controllo di accesso è un esito, non un guasto", async () => {
    const risposta = await conRispostaRapida(
      richiesta(PG_NET),
      async () => { throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }); },
      { attesaMs: 50 },
    );
    expect(risposta.status).toBe(401);
    expect(await risposta.json()).toEqual({ error: "Unauthorized" });
  });

  it("l'esito tardivo finisce nei log: un fallimento dopo il 202 non sparisce", async () => {
    const errori = vi.spyOn(console, "error").mockImplementation(() => {});
    const affidate: Promise<unknown>[] = [];
    (globalThis as Record<string, unknown>).EdgeRuntime = {
      waitUntil: (p: Promise<unknown>) => { affidate.push(p); },
    };

    const risposta = await conRispostaRapida(
      richiesta(PG_NET),
      async () => {
        await tra(50);
        return new Response("{}", { status: 500 });
      },
      { attesaMs: 10, nome: "funzione-di-prova" },
    );
    expect(risposta.status).toBe(202);

    await affidate[0];
    await tra(5);
    expect(errori).toHaveBeenCalledWith(
      expect.stringMatching(/\[funzione-di-prova\] finito in background con status 500 dopo \d+ ms/),
    );
  });
});
