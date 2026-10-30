import { describe, expect, it } from "vitest";
import { righeTabellaCronoprogramma, type RigaTabella } from "@/lib/orders/tabellaCronoprogramma";
import { vociDelleSottofasi } from "@/lib/orders/sottofasi";
import type { FaseCrono, SottofaseCrono } from "@/lib/orders/cronoprogramma";

/** Il cronoprogramma come l'Excel del cliente (31/10/2026): fasi numerate, sottofasi 1.1, 1.2… con i numeri della voce. */
describe("tabella del cronoprogramma", () => {
  const fase = { id: "f1", nome: "Tetto", stato: "in_corso", avanzamento: 50, previstoInizio: "2026-10-02", previstoFine: "2026-11-10", ritardoFine: 0 } as unknown as FaseCrono;
  const date = new Map([["f1", [{ id: "s1", previstoInizio: "2026-10-02", previstoFine: "2026-10-02", stimata: false, ritardo: 0 } as SottofaseCrono]]]);
  const voci = vociDelleSottofasi([
    { phase_id: "f1", subphase_id: "s1", quantita: 53.36, unita: "m", costo_manodopera: 0.5, costo_materiali: 0.25, importo: 560 },
    { phase_id: "f1", subphase_id: null, quantita: 1, unita: "corpo", costo_manodopera: 10, costo_materiali: 0, importo: 10 },
  ]);

  it("una riga per fase e una per sottofase, anche quella senza date, con quantità, unità e costo della voce", () => {
    const righe = righeTabellaCronoprogramma([fase], new Map([["f1", [
      { id: "s1", name: "Smontaggio canali", fatta: true, giorni: 1, risorse: 2 },
      { id: "s2", name: "Rifacimento pianellati", fatta: false, giorni: null },
    ]]]), date, { economia: new Map([["f1", { venduto: 22120, costoPrevisto: 5135.32, costoConsuntivo: 0 }]]), voci: voci.perSottofase });
    expect(righe.map(r => [r.numero, r.nome, r.giorni, r.risorse, r.quantita, r.unita, r.costoPrevisto, r.venduto, r.avanzamento])).toEqual([
      ["1", "Tetto", 40, null, null, null, 5135.32, 22120, 50],
      ["1.1", "Smontaggio canali", 1, 2, 53.36, "m", 40.02, 560, 100],
      ["1.2", "Rifacimento pianellati", null, null, null, null, null, null, 0],
    ]);
    expect(righe[2].inizio).toBeNull();
  });

  it("le voci senza sottofase si contano per fase", () => {
    expect(voci.senzaSottofase.get("f1")).toBe(1);
  });
});

describe("esportazione in Excel", () => {
  it("il file si riapre: intestazioni, fasi in grassetto, date vere, costi solo se si vedono", async () => {
    const { esportaCronoprogrammaExcel } = await import("@/lib/orders/esportaCronoprogramma");
    const ExcelJS = (await import("exceljs")).default;
    const riga: RigaTabella = { id: "f1", numero: "1", livello: 0, nome: "Tetto", inizio: "2026-10-02", fine: "2026-11-10", giorni: 40, risorse: null, quantita: null, unita: null, costoPrevisto: 542.75, costoConsuntivo: 0, venduto: 22120, avanzamento: 10, stimata: false, ritardo: 0 };
    const sotto: RigaTabella = { ...riga, id: "s1", numero: "1.1", livello: 1, nome: "Smontaggio manto", giorni: 4, risorse: 3, quantita: 109.45, unita: "m²", costoPrevisto: 436.71, venduto: 3360 };
    const leggi = async (costi: boolean) => {
      const blob = await esportaCronoprogrammaExcel([riga, sotto], "Prova", { costi, venduto: costi });
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await blob.arrayBuffer());
      return wb.getWorksheet("Cronoprogramma")!;
    };
    const ws = await leggi(true);
    expect((ws.getRow(1).values as unknown[]).filter(Boolean)).toEqual(["N.", "Attività", "Inizio", "Fine", "GG previsti", "Persone", "Quantità", "U.M.", "Costo previsto", "Costo consuntivo", "Venduto", "Avanzamento %"]);
    expect(ws.getRow(2).font?.bold).toBe(true);
    expect(ws.getRow(3).getCell(2).value).toBe("   Smontaggio manto");
    expect(ws.getRow(3).getCell(3).value).toBeInstanceOf(Date);
    expect(ws.getRow(3).getCell(9).value).toBe(436.71);
    expect((await leggi(false)).getRow(1).values).not.toContain("Costo previsto");
  });
});
