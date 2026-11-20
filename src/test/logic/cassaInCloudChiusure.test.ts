import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ClientCassaInCloud } from "../../../supabase/functions/cassa-in-cloud/client";
import { firmaValidaCassa, riceviWebhookCassa } from "../../../supabase/functions/cassa-in-cloud/webhook";
import { confrontoChiusura } from "@/lib/fatturazione/confrontoCassa";
import type { ChiusuraCassa, ConfrontoCassa } from "../../../shared/cassaInCloud";

const fonte = {
  id: "chiusura-1", idSalesPoint: 259, idDevice: 42, number: 13,
  date: "2026-11-21T00:15:00", referenceDate: "2026-11-20",
  receiptsCount: 3, receiptsAmount: 122, cashAmount: 22, electronicAmount: 100,
  canceledCount: 0, canceledAmount: 0, deferredReceiptsAmount: 0,
  taxes: [{ idTax: "22", tax: { rate: 22, description: "IVA 22%" }, receiptsAmount: 122,
    payments: [{ paymentType: "CASH", receiptsAmount: 22 }, { paymentType: "CREDITCARD", receiptsAmount: 100 }],
  }],
};

function rete(risposta: (u: URL) => Response) {
  return vi.fn(async (url: string, init: RequestInit) => {
    const u = new URL(url);
    if (u.pathname === "/apikey/token") return Response.json({ access_token: "token-di-prova" });
    expect(init.headers).toMatchObject({ Authorization: "Bearer token-di-prova", "X-Version": "1.0.0" });
    return risposta(u);
  });
}

describe("Chiusure giornaliere Cassa in Cloud", () => {
  it("legge il punto vendita e la cassa e conserva il giorno di riferimento oltre la mezzanotte", async () => {
    const chiamata = rete((url) => {
      expect(url.pathname).toBe("/reconciliations");
      expect(url.searchParams.get("idsSalesPoint")).toBe("[259]");
      expect(url.searchParams.get("datetimeFrom")).toBe('"2026-11-20"');
      expect(url.searchParams.get("datetimeTo")).toBe('"2026-11-21"');
      return Response.json({ totalCount: 1, reconciliations: [fonte] });
    });
    const [c] = await new ClientCassaInCloud("chiave", chiamata).chiusure("259", "2026-11-20", "2026-11-21");
    expect(c).toMatchObject({
      numero: "13", cassa_id: "42", giorno: "2026-11-20", data_chiusura: "2026-11-21", ora: "00:15:00",
      numero_scontrini: 3, totale_scontrini: 122, contanti: 22, elettronici: 100,
      iva: [{ aliquota: 22, scontrini: 122, pagamenti: [{ tipo: "CASH", importo: 22 }, { tipo: "CREDITCARD", importo: 100 }] }],
    });
  });

  it("blocca una chiusura di un altro punto vendita e distingue il permesso di lettura mancante", async () => {
    const diversa = rete(() => Response.json({ totalCount: 1, reconciliations: [{ ...fonte, idSalesPoint: 362 }] }));
    await expect(new ClientCassaInCloud("chiave", diversa).chiusure("259", "2026-11-20", "2026-11-21")).rejects.toMatchObject({ status: 502 });
    const vietata = rete(() => new Response("testo del fornitore", { status: 403 }));
    await expect(new ClientCassaInCloud("chiave", vietata).chiusure("259", "2026-11-20", "2026-11-21"))
      .rejects.toMatchObject({ status: 422, message: expect.stringContaining("lettura delle chiusure") });
  });

  it("conserva il legame documentato tra scontrino sospeso e fattura differita", async () => {
    const chiamata = rete(() => Response.json({ totalCount: 1, receipts: [{
      id: "s1", date: "2026-11-20", document: {
        idSalesPoint: 259, idDevice: 42, amount: 122,
        payments: [{ paymentType: "DEFERRED", amount: 122 }],
        documentConnectionDestinations: { invoices: [{ id: "ft1", number: 347, date: "2026-11-30", deferred: true, customerName: "dato estraneo" }] },
      },
    }] }));
    const [r] = await new ClientCassaInCloud("chiave", chiamata).scontrini("259", "2026-11-20", "2026-11-20");
    expect(r.con_fattura).toBe(true);
    expect(r.cassa_id).toBe("42");
    expect(r.fatture).toEqual([{ id: "ft1", numero: "347", data: "2026-11-30", differita: true }]);
    expect(r.pagamenti[0].differito).toBe(true);
  });

  it("confronta chiusure cumulate e mette in evidenza assenze, differiti e scostamenti", () => {
    const c = { totale_scontrini: 50, numero_scontrini: 1 } as ChiusuraCassa;
    const g: ConfrontoCassa = {
      punto_vendita_id: "259", punto_vendita_nome: "Negozio", giorno: "2026-11-20", cassa_id: "42",
      numero_scontrini: 2, totale_scontrini: 100, scontrini_assenti: 0, con_resi: false, con_fatture: false, con_differiti: false,
      chiusure: [{ id: "1", presente: true, valuta: "EUR", dati: c }, { id: "2", presente: true, valuta: "EUR", dati: c }],
    };
    expect(confrontoChiusura(g)).toMatchObject({ stato: "Scontrini allineati", numero: 2, importo: 100, scostamento: 0 });
    expect(confrontoChiusura({ ...g, con_differiti: true }).stato).toBe("Da verificare");
    expect(confrontoChiusura({ ...g, totale_scontrini: 50 })).toMatchObject({ stato: "Scostamento", scostamento: -50 });
    expect(confrontoChiusura({ ...g, chiusure: [] }).stato).toBe("Chiusura mancante");
    expect(confrontoChiusura({ ...g, scontrini_assenti: 1 }).stato).toBe("Da verificare");
  });

  it("verifica la firma sul corpo esatto e rifiuta payload alterati", async () => {
    const testo = '{ "id": "chiusura-1" }';
    const firme = createHmac("sha1", "segreto-fittizio").update(testo).digest("hex");
    const bytes = new TextEncoder();
    expect(await firmaValidaCassa("segreto-fittizio", firme, bytes.encode(testo).buffer)).toBe(true);
    expect(await firmaValidaCassa("segreto-fittizio", firme, bytes.encode(testo.trim() + " ").buffer)).toBe(false);
    expect(await firmaValidaCassa("segreto-diverso", firme, bytes.encode(testo).buffer)).toBe(false);
  });

  it("accoda i giorni di scontrini precedenti quando arriva la fattura differita", async () => {
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), contains: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [{ data: "2025-02-03" }] }),
    };
    const rpc = vi.fn((nome: string) => nome === "cassa_in_cloud_leggi_webhook"
      ? { maybeSingle: async () => ({ data: { company_id: "azienda-a", punto_vendita_id: "259", sync_attivo: true, segreto: "segreto-finto" } }) }
      : Promise.resolve({ error: null }));
    const admin = { rpc, from: vi.fn(() => query) } as never;
    const u = new URL("https://example.invalid/cassa-in-cloud?webhook=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const corpo = JSON.stringify({ id: "f1", document: { idSalesPoint: 259, documentConnectionSources: {
      receipts: [{ date: "2025-02-02", document: { idSalesPoint: 259 } }, { date: "2025-02-01", document: { idSalesPoint: 900 } }],
    } } });
    const signature = createHmac("sha1", "segreto-finto").update(corpo).digest("hex");
    const invia = (firma: string) => riceviWebhookCassa(admin, new Request(u, {
      method: "POST", body: corpo, headers: { "x-cn-operation": "INVOICE/CREATE", "x-cn-signature": firma },
    }), u);
    expect((await invia("0".repeat(40))).status).toBe(401);
    expect(rpc.mock.calls.some(([nome]) => nome === "cassa_in_cloud_accoda_giorni")).toBe(false);
    expect((await invia(signature)).status).toBe(202);
    expect(rpc).toHaveBeenCalledWith("cassa_in_cloud_accoda_giorni", {
      p_company_id: "azienda-a", p_punto_vendita_id: "259", p_giorni: ["2025-02-03", "2025-02-02"],
    });
  });
});
