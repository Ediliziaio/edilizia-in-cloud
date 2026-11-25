import { describe, expect, it } from "vitest";
import { ipotesiDaPiano } from "@/lib/orders/generali/simulatoreImport";
import { calcolaIpotesi, mqTotali } from "@/lib/orders/generali/simulatore";
import type { Ipotesi } from "@/lib/orders/generali/simulatore";
import type { VoceNuova } from "@/lib/orders/generali/pianoCategorie";

const voce = (tipo: "costo" | "ricavo", descrizione: string, importo: number, mese: string, durataMesi = 1): VoceNuova =>
  ({ tipo, categoria: tipo === "ricavo" ? "vendite" : "costruzione", descrizione, importo, mese, durataMesi, nota: "" }) as VoceNuova;
const origine = { originale: { path: "x", name: "bp.xlsx", size: 1 } as never, hash: "h", scenario: "Scenario realistico" };
const pianta: Pick<Ipotesi, "tipologie" | "planimetria"> = {
  tipologie: [
    { id: "unita-1", sigla: "Int. 01", nome: "Unità Int. 01", quante: 1, mq: 53.66, prezzoMq: 0, costoMq: null },
    { id: "unita-2", sigla: "Int. 02", nome: "Unità Int. 02", quante: 1, mq: 21.3, prezzoMq: 0, costoMq: null },
  ],
  planimetria: { planimetriaId: "4277561e-81a8-40be-9c9b-242d81767167", versione: 2, varianteId: "A", confermata: true, computoImportato: true },
};
const voci = [voce("costo", "Opere edili", 900_000, "2026-12", 9), voce("ricavo", "Unità 1", 365_000, "2027-08"), voce("ricavo", "Unità 2", 300_000, "2027-08")];

describe("business plan importato sopra l'ipotesi della planimetria", () => {
  it("tiene unità e m² della pianta e non conta due volte le vendite", () => {
    const senza = ipotesiDaPiano(voci, {}, "sviluppo", origine);
    const con = ipotesiDaPiano(voci, {}, "sviluppo", origine, pianta);
    expect(senza.tipologie).toHaveLength(0);
    expect(con.tipologie.map((t) => [t.nome, t.mq, t.prezzoMq])).toEqual([["Unità Int. 01", 53.66, 0], ["Unità Int. 02", 21.3, 0]]);
    expect(mqTotali(con)).toBeCloseTo(74.96, 2);
    expect(con.planimetria).toMatchObject({ planimetriaId: pianta.planimetria!.planimetriaId, confermata: false, computoImportato: false });
    expect(calcolaIpotesi(con).numeri.ricavi).toBe(calcolaIpotesi(senza).numeri.ricavi);
    expect(calcolaIpotesi(con).numeri.ricavi).toBe(665_000);
  });
});
