import { describe, expect, it, vi } from "vitest";
import { gestisci, type Dipendenze } from "../../../supabase/functions/planimetria-motore/gestore";
import { firma, leggiBiglietto, testoEsito } from "../../../shared/planimetrie/bigliettoMotore";

const SEGRETO = "k".repeat(48);
const AZIENDA = "d2000000-0000-4000-a000-000000000002";
const UTENTE = "11111111-2222-4333-8444-555555555555";
const ID = "0b6f2f3e-8c1a-4d55-9a0e-1f2a3b4c5d6e";

function dipendenze(over: Partial<Dipendenze> = {}): Dipendenze {
  return {
    segreto: SEGRETO,
    urlMotore: "https://motore.example/",
    adesso: () => 1_800_000_000_000,
    nuovoId: () => ID,
    autentica: async () => UTENTE,
    verificaPermesso: async () => undefined,
    scalaCredito: vi.fn(async () => "ok" as const),
    rimborsaCredito: vi.fn(async () => "refunded"),
    ...over,
  };
}

describe("planimetria-motore", () => {
  it("senza segreto o indirizzo il motore risulta spento, non rotto", async () => {
    expect((await gestisci({ azione: "biglietto" }, dipendenze({ segreto: undefined }))).stato).toBe(503);
    expect((await gestisci({ azione: "biglietto" }, dipendenze({ urlMotore: "" }))).stato).toBe(503);
  });

  it("il render scala un credito con il biglietto come sessione e rilascia un biglietto per il render", async () => {
    const d = dipendenze();
    const r = await gestisci({ azione: "biglietto", company_id: AZIENDA, operazione: "render" }, d);
    expect(r.stato).toBe(200);
    expect(r.corpo.url).toBe("https://motore.example");
    expect(d.scalaCredito).toHaveBeenCalledWith({ azienda: AZIENDA, sessione: ID, utente: UTENTE });
    const letto = await leggiBiglietto(SEGRETO, String(r.corpo.biglietto), { adesso: 1_800_000_000_000, operazione: "render" });
    expect(letto).toMatchObject({ ok: true, biglietto: { id: ID, azienda: AZIENDA, utente: UTENTE, addebitato: true } });
  });

  it("il DWG non scala crediti", async () => {
    const d = dipendenze();
    const r = await gestisci({ azione: "biglietto", company_id: AZIENDA, operazione: "dwg" }, d);
    expect(r.stato).toBe(200);
    expect(r.corpo.addebitato).toBe(false);
    expect(d.scalaCredito).not.toHaveBeenCalled();
  });

  it("crediti finiti: 402 e nessun biglietto", async () => {
    const r = await gestisci({ azione: "biglietto", company_id: AZIENDA, operazione: "render" }, dipendenze({ scalaCredito: async () => "insufficient" }));
    expect(r.stato).toBe(402);
    expect(r.corpo.biglietto).toBeUndefined();
  });

  it("senza permesso: 403 e nessun credito scalato", async () => {
    const d = dipendenze({ verificaPermesso: async () => { throw new Error("Non autorizzato: permesso mancante"); } });
    const r = await gestisci({ azione: "biglietto", company_id: AZIENDA, operazione: "render" }, d);
    expect(r.stato).toBe(403);
    expect(d.scalaCredito).not.toHaveBeenCalled();
  });

  it("rifiuta azienda e operazione non valide prima di autenticare", async () => {
    const autentica = vi.fn(async () => UTENTE);
    expect((await gestisci({ azione: "biglietto", company_id: "x", operazione: "render" }, dipendenze({ autentica }))).stato).toBe(400);
    expect((await gestisci({ azione: "biglietto", company_id: AZIENDA, operazione: "rm -rf" }, dipendenze({ autentica }))).stato).toBe(400);
    expect(autentica).not.toHaveBeenCalled();
  });

  it("un render fallito, firmato dal container, restituisce il credito; senza firma giusta no", async () => {
    const d = dipendenze();
    const { corpo } = await gestisci({ azione: "biglietto", company_id: AZIENDA, operazione: "render" }, d);
    const token = String(corpo.biglietto);
    const falso = await gestisci({ azione: "esito", biglietto: token, esito: "fallito", firma: await firma("z".repeat(48), testoEsito(token, "fallito")) }, d);
    expect(falso.stato).toBe(403);
    expect(d.rimborsaCredito).not.toHaveBeenCalled();
    const vero = await gestisci({ azione: "esito", biglietto: token, esito: "fallito", firma: await firma(SEGRETO, testoEsito(token, "fallito")) }, d);
    expect(vero).toEqual({ stato: 200, corpo: { rimborso: "refunded" } });
    expect(d.rimborsaCredito).toHaveBeenCalledWith({ azienda: AZIENDA, sessione: ID, utente: UTENTE });
  });

  it("l'esito di un DWG non rimborsa niente", async () => {
    const d = dipendenze();
    const { corpo } = await gestisci({ azione: "biglietto", company_id: AZIENDA, operazione: "dwg" }, d);
    const token = String(corpo.biglietto);
    const r = await gestisci({ azione: "esito", biglietto: token, esito: "fallito", firma: await firma(SEGRETO, testoEsito(token, "fallito")) }, d);
    expect(r.corpo.rimborso).toBe("nessun_addebito");
    expect(d.rimborsaCredito).not.toHaveBeenCalled();
  });
});
