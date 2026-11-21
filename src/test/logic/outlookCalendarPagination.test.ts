import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("supabase/functions/outlook-calendar-sync/index.ts", "utf8");
const inizio = source.indexOf("async function syncConnection(");
const fine = source.indexOf("/** Cron:", inizio);
const javascript = ts.transpileModule(source.slice(inizio, fine), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup(opzioni: { paginaFallita?: number; circolare?: boolean; salvataggioFallito?: boolean } = {}) {
  let pagina = 0;
  const fetch = vi.fn(async () => {
    pagina += 1;
    if (pagina === opzioni.paginaFallita) return new Response("Timeout fixture", { status: 503 });
    return Response.json({
      value: [{
        id: `evento-${pagina}`,
        subject: "Evento sintetico",
        start: { dateTime: "2026-11-21T11:00:00.0000000" },
        end: { dateTime: "2026-11-21T12:00:00.0000000Z" },
      }],
      ...(pagina < 21 ? { "@odata.nextLink": `https://graph.microsoft.com/v1.0/me/calendarView?pagina=${opzioni.circolare ? 2 : pagina + 1}` } : {}),
    });
  });
  const snapshot = vi.fn(async (_fn: string, _args: unknown) => ({ data: true, error: opzioni.salvataggioFallito ? new Error("Salvataggio riepilogo fallito") : null }));
  const lastSync = vi.fn((update: Record<string, unknown>) => ({
    eq: vi.fn(async () => ({ error: update.last_sync_at && opzioni.salvataggioFallito ? new Error("Salvataggio riepilogo fallito") : null })),
  }));
  const db = { from: () => ({ update: lastSync }), rpc: snapshot };
  const sync = runInNewContext(javascript + "\nsyncConnection", {
    fetch, AbortSignal, URL, console, getFreshAccessToken: async () => "token-locale",
  });
  return { esegui: () => sync(db, { id: "c", company_id: "az", user_id: "u" }, "cal", {}), fetch, snapshot, lastSync };
}

describe("Sincronizzazione Outlook Calendar", () => {
  it("salva anche la pagina 21 e aggiorna l'ultimo successo con il totale", async () => {
    const p = setup();
    await expect(p.esegui()).resolves.toBe(21);
    expect(p.fetch).toHaveBeenCalledTimes(21);
    expect(p.snapshot).toHaveBeenCalledOnce();
    expect(p.snapshot).toHaveBeenCalledWith("outlook_applica_snapshot", expect.objectContaining({
      p_calendario: "cal", p_eventi: expect.arrayContaining([expect.objectContaining({
        outlook_event_id: "evento-21",
        start_time: "2026-11-21T11:00:00.000Z",
        end_time: "2026-11-21T12:00:00.000Z",
      })]),
    }));
  });

  it("conserva l'ultimo successo se la pagina 21 fallisce", async () => {
    const p = setup({ paginaFallita: 21 });
    await expect(p.esegui()).rejects.toThrow(/Graph.*503/);
    expect(p.snapshot).not.toHaveBeenCalled();
    expect(p.lastSync.mock.calls.map(([values]) => values)).toEqual([expect.objectContaining({ last_error: expect.stringContaining("503") })]);
  });

  it("termina se Graph rimanda a una pagina già letta", async () => {
    const p = setup({ circolare: true });
    await expect(p.esegui()).rejects.toThrow(/già visitata/);
    expect(p.fetch).toHaveBeenCalledTimes(2);
    expect(p.snapshot).not.toHaveBeenCalled();
  });

  it("espone il fallimento dell'ultimo salvataggio", async () => {
    const p = setup({ salvataggioFallito: true });
    await expect(p.esegui()).rejects.toThrow("Salvataggio riepilogo fallito");
  });
});
