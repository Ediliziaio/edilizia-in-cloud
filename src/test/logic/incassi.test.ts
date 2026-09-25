// «Segna pagata» registra un incasso vero (25/09/2026): la logica, senza rete.
import { describe, expect, it, vi } from "vitest";
import {
  descriviEsitoIncassi,
  metodoIncassoDaCodice,
  registraIncassi,
  residuoDaIncassare,
  type ChiamataRpc,
} from "@/lib/fatturazione/incassi";

describe("metodoIncassoDaCodice: dal codice di pagamento della fattura al registro incassi", () => {
  it("i codici più usati", () => {
    expect(metodoIncassoDaCodice("MP01")).toBe("contanti");
    expect(metodoIncassoDaCodice("MP02")).toBe("assegno");
    expect(metodoIncassoDaCodice("MP05")).toBe("bonifico");
    expect(metodoIncassoDaCodice("MP08")).toBe("carta");
    expect(metodoIncassoDaCodice("MP12")).toBe("riba");
    expect(metodoIncassoDaCodice("mp20")).toBe("sdd");
  });
  it("senza codice o con uno senza corrispondente: bonifico", () => {
    expect(metodoIncassoDaCodice(null)).toBe("bonifico");
    expect(metodoIncassoDaCodice("MP22")).toBe("bonifico");
  });
});

describe("residuoDaIncassare", () => {
  it("al centesimo, senza gli errori dei decimali", () => {
    expect(residuoDaIncassare({ totale_da_pagare: 1220, importo_pagato: 220 })).toBe(1000);
    expect(residuoDaIncassare({ totale_da_pagare: 0.3, importo_pagato: 0.1 })).toBe(0.2);
    expect(residuoDaIncassare({ totale_da_pagare: 100, importo_pagato: null })).toBe(100);
  });
});

describe("registraIncassi: un incasso per fattura, dalla funzione atomica", () => {
  const db = (esiti: Array<{ error: { message?: string } | null } | Error>) => {
    const rpc = vi.fn(async () => {
      const e = esiti.shift() ?? { error: null };
      if (e instanceof Error) throw e;
      return e;
    });
    return { rpc } as unknown as ChiamataRpc & { rpc: typeof rpc };
  };

  it("chiama registra_incasso_atomico con residuo, metodo e data", async () => {
    const d = db([]);
    const esito = await registraIncassi(d, "az-1", [{ id: "f1", numero: "FT-1", residuo: 500 }], { metodo: "bonifico", data: "2026-09-25" });
    expect(d.rpc).toHaveBeenCalledWith("registra_incasso_atomico", {
      p_company_id: "az-1",
      p_documento_id: "f1",
      p_importo: 500,
      p_metodo: "bonifico",
      p_data_movimento: "2026-09-25",
      p_riferimento: null,
      p_note: "Segnata pagata",
    });
    expect(esito).toEqual({ registrati: ["FT-1"], falliti: [] });
  });

  it("una che non riesce non ferma le altre, e il motivo è quello del database", async () => {
    const d = db([{ error: null }, { error: { message: "Incasso (10 EUR) superiore al residuo da pagare" } }, new Error("rete"), { error: null }]);
    const esito = await registraIncassi(d, "az-1", [
      { id: "a", numero: "1", residuo: 10 },
      { id: "b", numero: "2", residuo: 10 },
      { id: "c", numero: "3", residuo: 10 },
      { id: "d", numero: "4", residuo: 10 },
    ], { metodo: "contanti", data: "2026-09-25" });
    expect(d.rpc).toHaveBeenCalledTimes(4);
    expect(esito.registrati).toEqual(["1", "4"]);
    expect(esito.falliti).toEqual([
      { numero: "2", motivo: "Incasso (10 EUR) superiore al residuo da pagare" },
      { numero: "3", motivo: "rete" },
    ]);
  });

  it("niente residuo, niente chiamata", async () => {
    const d = db([]);
    const esito = await registraIncassi(d, "az-1", [{ id: "a", numero: "1", residuo: 0 }], { metodo: "bonifico", data: "2026-09-25" });
    expect(d.rpc).not.toHaveBeenCalled();
    expect(esito.falliti[0].numero).toBe("1");
  });
});

describe("descriviEsitoIncassi", () => {
  it("tutte riuscite", () => {
    expect(descriviEsitoIncassi({ registrati: ["1"], falliti: [] })).toEqual({ titolo: "Incasso registrato", tutteRiuscite: true });
    expect(descriviEsitoIncassi({ registrati: ["1", "2"], falliti: [] }).titolo).toBe("2 incassi registrati");
  });
  it("con quelle non riuscite, al massimo tre per nome", () => {
    const r = descriviEsitoIncassi({
      registrati: ["1"],
      falliti: ["2", "3", "4", "5"].map((numero) => ({ numero, motivo: "no" })),
    });
    expect(r.titolo).toBe("Incasso registrato, 4 non riusciti");
    expect(r.dettaglio).toBe("2: no · 3: no · 4: no · e altre 1");
    expect(r.tutteRiuscite).toBe(false);
  });
});
