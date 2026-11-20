import { describe, expect, it, vi } from "vitest";
import { ClientCassaInCloud } from "../../../supabase/functions/cassa-in-cloud/client";
import { giornoCassa, intervalliCassa } from "../../../shared/cassaInCloud";

function scontrino(id: string, idSalesPoint = 259) {
  return {
    id, number: 22, zNumber: 81, datetime: "2026-11-19T23:12:09Z",
    taxCode: "DA_NON_IMPORTARE",
    document: {
      idSalesPoint, amount: 34.2, change: 0, confirmed: true,
      documentConnectionDestinations: { invoices: [{ id: "f1" }] },
      payments: [
        { paymentType: "CASH", amount: 4.2, change: 0 },
        { paymentType: "CREDITCARD", amount: 20, bankAccountIBAN: "DA_NON_IMPORTARE" },
        { paymentType: "CUSTOM", amount: 10, customPayment: { description: "Da fatturare", collectableType: "UNCOLLECTED_GOODS" } },
      ],
      rows: [{ refund: true }],
    },
  };
}

function emulaCassa(risposta: (url: URL) => Response) {
  return vi.fn(async (url: string, init: RequestInit) => {
    const u = new URL(url);
    expect(u.origin).toBe("https://api.cassanova.com");
    expect(init.redirect).toBe("error");
    if (u.pathname === "/apikey/token") {
      expect(init.method).toBe("POST");
      expect(init.headers).toMatchObject({ "X-Requested-With": "*", "Content-Type": "application/json" });
      expect(JSON.parse(String(init.body))).toEqual({ apiKey: "chiave-di-prova" });
      return Response.json({ access_token: "token-di-prova", expires_in: 3600, token_type: "Bearer" });
    }
    expect(init.headers).toMatchObject({ Authorization: "Bearer token-di-prova", "X-Version": "1.0.0" });
    return risposta(u);
  });
}

describe("Cassa in Cloud", () => {
  it("usa lo stesso token per i punti vendita e gli scontrini e controlla la partita IVA", async () => {
    const fetch = emulaCassa((url) => {
      if (url.pathname === "/salespoint") {
        return Response.json({
          totalCount: 2,
          salesPoint: [
            { id: 259, name: "Negozio", city: "Roma", vatNumber: "IT12345678901", currency: { code: "EUR" } },
            { id: 260, name: "Altro negozio", vatNumber: "98765432101" },
          ],
        });
      }
      expect(url.pathname).toBe("/documents/receipts");
      expect(url.searchParams.get("idsSalesPoint")).toBe("[259]");
      expect(url.searchParams.get("datetimeFrom")).toBe('"2026-11-20"');
      expect(url.searchParams.get("datetimeTo")).toBe('"2026-11-21"');
      return Response.json({ totalCount: 1, receipts: [scontrino("s1")] });
    });
    const client = new ClientCassaInCloud("chiave-di-prova", fetch);
    expect(await client.puntiVendita(["12345678901"])).toMatchObject([
      { id: "259", compatibile: true, valuta: "EUR" }, { id: "260", compatibile: false },
    ]);
    const [r] = await client.scontrini("259", "2026-11-20", "2026-11-21");
    expect(r).toMatchObject({
      esterno_id: "s1", data: "2026-11-20", ora: "00:12:09", totale: 34.2,
      numero: "22", numero_z: "81", con_reso: true, con_fattura: true,
      pagamenti: [
        { tipo: "CASH", importo: 4.2, differito: false },
        { tipo: "CREDITCARD", importo: 20, differito: false },
        { tipo: "CUSTOM", importo: 10, differito: true, descrizione: "Da fatturare" },
      ],
    });
    expect(JSON.stringify(r)).not.toContain("DA_NON_IMPORTARE");
    expect(fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(["/apikey/token", "/salespoint", "/documents/receipts"]);
  });

  it("legge tutte le pagine e distingue scontrini con lo stesso numero", async () => {
    const fetch = emulaCassa((url) => {
      expect(url.searchParams.get("limit")).toBe("100");
      const start = Number(url.searchParams.get("start"));
      return Response.json({
        totalCount: 101, receipts: Array.from({ length: start ? 1 : 100 }, (_, i) => scontrino(String(start + i))),
      });
    });
    const client = new ClientCassaInCloud("chiave-di-prova", fetch);
    const dati = await client.scontrini("259", "2026-11-20", "2026-11-20");
    expect(dati).toHaveLength(101);
    expect(dati[100].esterno_id).toBe("100");
  });

  it("rifiuta una pagina duplicata anche se il conteggio sembra completo", async () => {
    const fetch = emulaCassa((url) => Response.json({
      totalCount: 101,
      receipts: Array.from({ length: url.searchParams.get("start") === "0" ? 100 : 1 }, (_, i) => scontrino(String(i))),
    }));
    await expect(new ClientCassaInCloud("chiave-di-prova", fetch)
      .scontrini("259", "2026-11-20", "2026-11-20")).rejects.toMatchObject({ status: 502 });
  });

  it("distingue un periodo vuoto da dati incoerenti o appartenenti a un altro punto vendita", async () => {
    const importa = (risposta: object) =>
      new ClientCassaInCloud("chiave-di-prova", emulaCassa(() => Response.json(risposta)))
        .scontrini("259", "2026-11-20", "2026-11-20");
    await expect(importa({ receipts: [], totalCount: 0 })).resolves.toEqual([]);
    await expect(importa({ receipts: [], totalCount: 1 })).rejects.toMatchObject({ status: 502 });
    await expect(importa({ receipts: [scontrino("s1", 260)], totalCount: 1 })).rejects.toMatchObject({ status: 502 });
  });

  it("segnala quota e permessi del fornitore senza esporne il corpo di risposta", async () => {
    const importa = (status: number) =>
      new ClientCassaInCloud("chiave-di-prova", emulaCassa(() => new Response("dettagli privati", { status })))
        .scontrini("259", "2026-11-20", "2026-11-20");
    await expect(importa(403)).rejects.toMatchObject({ status: 422, message: expect.stringContaining("leggere") });
    await expect(importa(429)).rejects.toMatchObject({ status: 429, message: expect.stringContaining("limite") });
  });

  it("divide il periodo in finestre inclusive senza sovrapposizioni a cavallo del cambio d’ora", () => {
    expect(giornoCassa(new Date("2026-10-24T22:15:00Z"))).toBe("2026-10-25");
    expect(intervalliCassa("2026-10-24", "2026-10-28")).toEqual([
      { dal: "2026-10-24", al: "2026-10-25" },
      { dal: "2026-10-26", al: "2026-10-27" },
      { dal: "2026-10-28", al: "2026-10-28" },
    ]);
    expect(intervalliCassa("2026-02-30", "2026-03-01")).toEqual([]);
    expect(intervalliCassa("2026-11-01", "2026-12-02")).toEqual([]);
  });
});
