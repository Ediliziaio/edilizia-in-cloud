import { describe, expect, it } from "vitest";
import {
  fatturatoDaDocumenti,
  fuoriDalleFasi,
  modoSuggerito,
  quotaDaFatturare,
  quoteDentroIlContratto,
  righeSal,
  rigaFase,
  rigaVoce,
  salFatturabili,
  salInFattura,
  type SalPerFattura,
} from "@/lib/orders/fatturaDaLavori";

const doc = (righe: unknown[], extra: Record<string, unknown> = {}) => ({ tipo: "fattura", stato: "emessa", righe, ...extra });

describe("Già fatturato letto dalle righe delle fatture", () => {
  it("attribuisce le righe a fase, voce e SAL; il resto è senza dettaglio", () => {
    const f = fatturatoDaDocumenti([
      doc([
        { id: "fase:a", imponibile: 1000 },
        { id: "fase:a:voce:v1", imponibile: 200 },
        { id: "sal:s1:0", imponibile: 500 },
        { id: "importo-rata", imponibile: 300 },
        { id: "trattenuta-garanzia", imponibile: -100 },
      ]),
    ]);
    expect(f.perFase.get("a")).toBe(1200);
    expect(f.perVoce.get("v1")).toBe(200);
    expect(f.salFatturati.has("s1")).toBe(true);
    expect(f.senzaDettaglio).toBe(300);
    expect(f.totale).toBe(2000);
  });

  it("una fattura annullata, stornata o cancellata non conta; una bozza sì", () => {
    const riga = [{ id: "fase:a", imponibile: 1000 }];
    expect(fatturatoDaDocumenti([doc(riga, { stato: "annullata" })]).perFase.size).toBe(0);
    expect(fatturatoDaDocumenti([doc(riga, { stato: "stornata" })]).perFase.size).toBe(0);
    expect(fatturatoDaDocumenti([doc(riga, { deleted_at: "2026-11-02" })]).perFase.size).toBe(0);
    expect(fatturatoDaDocumenti([doc(riga, { stato: "bozza" })]).perFase.get("a")).toBe(1000);
  });

  it("note di credito, proforma e preventivi non sono fatturato", () => {
    for (const tipo of ["nota_credito", "proforma", "preventivo", "ddt"]) {
      expect(fatturatoDaDocumenti([doc([{ id: "fase:a", imponibile: 1000 }], { tipo })]).totale).toBe(0);
    }
  });

  it("una fattura su più commesse conta per la quota di questa", () => {
    const f = fatturatoDaDocumenti([doc([{ id: "x", imponibile: 1000 }], { totale_documento: 1220, importo_associato: 610 })]);
    expect(f.senzaDettaglio).toBe(500);
  });

  it("le righe vecchie senza id né imponibile valgono quantità per prezzo", () => {
    expect(fatturatoDaDocumenti([doc([{ quantita: 2, prezzo_unitario: 150 }])]).senzaDettaglio).toBe(300);
  });

  it("righe illeggibili non rompono il conto", () => {
    expect(fatturatoDaDocumenti([doc(null as unknown as unknown[])]).totale).toBe(0);
  });
});

describe("Quota da fatturare", () => {
  it("venduto per avanzamento meno il già fatturato", () => {
    expect(quotaDaFatturare(20000, 60, 6000)).toBe(6000);
  });
  it("mai negativa: già fatturato oltre il maturato vale zero", () => {
    expect(quotaDaFatturare(20000, 30, 10000)).toBe(0);
  });
  it("l'avanzamento resta tra 0 e 100", () => {
    expect(quotaDaFatturare(1000, 140, 0)).toBe(1000);
  });
});

describe("Contratto e fasi", () => {
  it("le quote proposte si fermano a quanto resta del contratto", () => {
    expect(quoteDentroIlContratto([1000, 1000, 1000], 1500)).toEqual([1000, 500, 0]);
    expect(quoteDentroIlContratto([1000, 1000], 5000)).toEqual([1000, 1000]);
    expect(quoteDentroIlContratto([1000], 0)).toEqual([0]);
    expect(quoteDentroIlContratto([1000], -200)).toEqual([0]);
  });
  it("segnala la parte di contratto fuori dalle fasi", () => {
    expect(fuoriDalleFasi(10000, [{ venduto: 8000 }])).toBe(2000);
  });
  it("le fasi oltre il contratto non creano righe, e un euro è arrotondamento", () => {
    expect(fuoriDalleFasi(54102.36, [{ venduto: 63371.52 }])).toBe(0);
    expect(fuoriDalleFasi(1000, [{ venduto: 999.5 }])).toBe(0);
  });
});

describe("Righe in fattura", () => {
  it("la fase è una riga a corpo con l'importo esatto e l'aliquota della commessa", () => {
    const r = rigaFase({ id: "a", nome: "Opere murarie", avanzamento: 60 }, 6000, 10);
    expect(r).toMatchObject({ id: "fase:a", descrizione: "Opere murarie — avanzamento lavori 60%", quantita: 1, prezzo_unitario: 6000, aliquota_iva: "10" });
  });
  it("la voce porta misura e quota quando è parziale", () => {
    const voce = { id: "v", descrizione: "Massetto", quantita: 12.5, unita: "mq", importo: 1000 };
    expect(rigaVoce("a", "Opere", voce, 1000, 22).descrizione).toBe("Opere: Massetto (12,5 mq)");
    expect(rigaVoce("a", "Opere", voce, 600, 22).descrizione).toBe("Opere: Massetto (12,5 mq) — quota del 60%");
    expect(rigaVoce("a", "Opere", voce, 600, 22).id).toBe("fase:a:voce:v");
  });
});

describe("SAL in fattura", () => {
  const sal1: SalPerFattura = { id: "s1", numero_sal: 1, stato: "approvato", importo_totale: 3000, sal_voci: [{ descrizione: "Murature", importo_sal: 1000 }, { descrizione: "Impianti", importo_sal: 2000 }] };
  const sal2: SalPerFattura = { id: "s2", numero_sal: 2, stato: "emesso", importo_totale: 7000, installment_id: "r2", sal_voci: [{ descrizione: "Murature", importo_sal: 3000 }, { descrizione: "Impianti", importo_sal: 4000 }] };
  const bozza: SalPerFattura = { id: "s3", numero_sal: 3, stato: "bozza", importo_totale: 9000 };

  it("fattura la differenza di ogni voce col SAL precedente", () => {
    const righe = righeSal(sal2, [sal1, sal2], 22);
    expect(righe.map((r) => [r.descrizione, r.prezzo_unitario])).toEqual([["SAL n. 2 — Murature", 2000], ["SAL n. 2 — Impianti", 2000]]);
    expect(righe.every((r) => r.id.startsWith("sal:s2:"))).toBe(true);
  });

  it("se le voci non tornano col totale resta una riga sola con l'importo giusto", () => {
    const rinominato = { ...sal2, sal_voci: [{ descrizione: "Tutto", importo_sal: 7000 }] };
    const righe = righeSal(rinominato, [sal1, rinominato], 22);
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({ prezzo_unitario: 4000, descrizione: "SAL n. 2 — lavori eseguiti" });
  });

  it("una rettifica al ribasso non diventa una fattura", () => {
    const giu = { ...sal2, importo_totale: 2000 };
    expect(righeSal(giu, [sal1, giu], 22)).toEqual([]);
    expect(salInFattura(giu, [sal1, giu], { salFatturati: new Set() }, []).stato).toBe("senza_quota");
  });

  it("già fatturato se una fattura ne porta le righe o se la sua rata ha la fattura", () => {
    expect(salInFattura(sal2, [sal1, sal2], { salFatturati: new Set(["s2"]) }, []).stato).toBe("gia_fatturato");
    expect(salInFattura(sal2, [sal1, sal2], { salFatturati: new Set() }, [{ id: "r2", documento_fiscale_id: "d" }]).stato).toBe("gia_fatturato");
    expect(salInFattura(sal2, [sal1, sal2], { salFatturati: new Set() }, [{ id: "r2" }])).toEqual({ stato: "da_fatturare", quota: 4000 });
  });

  it("le bozze di SAL non si fatturano", () => {
    expect(salFatturabili([sal1, sal2, bozza]).map((s) => s.id)).toEqual(["s2", "s1"]);
  });
});

describe("Da dove parte il popup", () => {
  const nessuno = { salDaFatturare: false, fasiConQuota: false, rataDaFatturare: false };
  it("SAL, poi la rata, poi le fasi; gli articoli mai da soli", () => {
    expect(modoSuggerito({ salDaFatturare: true, fasiConQuota: true, rataDaFatturare: true })).toBe("sal");
    expect(modoSuggerito({ ...nessuno, fasiConQuota: true, rataDaFatturare: true })).toBe("importo");
    expect(modoSuggerito({ ...nessuno, fasiConQuota: true })).toBe("fasi");
    expect(modoSuggerito(nessuno)).toBe("importo");
  });
});
