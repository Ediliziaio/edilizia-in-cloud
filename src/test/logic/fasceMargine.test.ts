import { describe, expect, it } from "vitest";
import {
  fasciaMargine,
  margineAffidabile,
  margineRealeSedi,
  nomeClienteCommessa,
  notaAvanzamento,
  vociConsuntivo,
} from "@/lib/marginalita/fasceMargine";

const fascia = (nettoPct: number, targetPct = 10, affidabile = true) => fasciaMargine({ affidabile, nettoPct, targetPct });

describe("fasce di margine", () => {
  it("con il target di default dà le stesse fasce di sempre", () => {
    expect(fascia(-0.1)).toBe("perdita");
    expect(fascia(0)).toBe("sotto_target");
    expect(fascia(9.9)).toBe("sotto_target");
    expect(fascia(10)).toBe("da_monitorare");
    expect(fascia(24.9)).toBe("da_monitorare");
    expect(fascia(25)).toBe("sano");
  });

  it("segue il target dell'azienda: sotto target non è mai anche sana", () => {
    expect(fascia(15, 20)).toBe("sotto_target");
    expect(fascia(28, 30)).toBe("sotto_target");
    expect(fascia(30, 30)).toBe("sano");
    expect(fascia(5, 0)).toBe("da_monitorare");
  });

  it("una commessa senza dati non finisce tra quelle in perdita", () => {
    expect(fascia(-50, 10, false)).toBe("incompleto");
    expect(margineAffidabile({ preventivo_totale: 0, consuntivo: 100 })).toBe(false);
    expect(margineAffidabile({ preventivo_totale: 100, consuntivo: 0 })).toBe(false);
    expect(margineAffidabile({ preventivo_totale: 100, consuntivo: 1 })).toBe(true);
  });
});

describe("voci del consuntivo", () => {
  const base = { costo_acquisti: 100, costo_materiali_magazzino: 50, costo_errori: 10 };

  it("spiega tutto il consuntivo, manodopera compresa", () => {
    const voci = vociConsuntivo({
      ...base, costo_manodopera: 700, costo_provvigioni: 30, costo_diretto: 90, costo_rimborsi_km: 20, consuntivo: 1000,
    });
    expect(voci.map((v) => v.chiave)).toEqual(["acquisti", "magazzino", "manodopera", "diretti", "provvigioni", "rimborsi", "errori"]);
    expect(voci.reduce((t, v) => t + v.importo, 0)).toBe(1000);
  });

  it("se le voci non tornano mostra la differenza invece di nasconderla", () => {
    const voci = vociConsuntivo({ ...base, consuntivo: 200 });
    expect(voci.find((v) => v.chiave === "altro")?.importo).toBe(40);
  });

  it("non mostra le voci a zero né una differenza da arrotondamento", () => {
    const voci = vociConsuntivo({
      costo_acquisti: 0.1, costo_materiali_magazzino: 0.2, costo_errori: 0, consuntivo: 0.30000000000000004,
    });
    expect(voci.map((v) => v.chiave)).toEqual(["acquisti", "magazzino"]);
  });
});

describe("nome del cliente", () => {
  it("il profilo vince, poi la ragione sociale, poi il nome sulla commessa", () => {
    expect(nomeClienteCommessa("Mario Rossi", { client_company: "Rossi Srl" })).toBe("Mario Rossi");
    expect(nomeClienteCommessa("", { client_company: "Rossi Srl", client_name: "Mario" })).toBe("Rossi Srl");
    expect(nomeClienteCommessa(null, { client_company: "  ", client_name: "Mario" })).toBe("Mario");
    expect(nomeClienteCommessa(null, undefined)).toBe("");
  });
});

describe("nota di avanzamento", () => {
  const riga = (pct_avanzamento: number, margine_atteso_perc: number | null = null, work_state: "open" | "completed" = "open") =>
    ({ pct_avanzamento, margine_atteso_perc, work_state });

  it("sotto il 20% non c'è proiezione: il margine è solo provvisorio", () => {
    expect(notaAvanzamento(riga(0.1))).toBe("Avanzamento 10%: margine provvisorio");
  });

  it("con la proiezione mostra quella", () => {
    expect(notaAvanzamento(riga(0.4, 12.34))).toBe("Avanzamento 40% · proiezione a fine lavori 12.3%");
  });

  it("niente nota su lavori finiti, non iniziati o senza dato", () => {
    expect(notaAvanzamento(riga(0.36, null, "completed"))).toBeNull();
    expect(notaAvanzamento(riga(0))).toBeNull();
    expect(notaAvanzamento(riga(1, 20))).toBeNull();
    expect(notaAvanzamento(undefined)).toBeNull();
  });
});

describe("margine reale per sede", () => {
  const commessa = (id: string, ricavo: number, costi: number, created_at = "2026-05-10T10:00:00Z") =>
    ({ id, preventivo_totale: ricavo, consuntivo: costi, margine: ricavo - costi, created_at });
  const sedi = new Map<string, string | null>([["a", "S1"], ["b", "S2"], ["c", "S1"], ["d", null], ["e", "S1"]]);

  it("somma le commesse della sede, una volta sola", () => {
    const r = margineRealeSedi([commessa("a", 1000, 600), commessa("c", 1000, 800), commessa("b", 2000, 1000)], sedi);
    expect(r.get("S1")).toMatchObject({ ricavi: 2000, costi: 1400, margine: 600, margine_pct: 30, incidenza_ricavi: 50 });
    expect(r.get("S2")).toMatchObject({ ricavi: 2000, margine: 1000, margine_pct: 50 });
    expect(r.get("S1")!.delta_incidenza).toBeCloseTo(-12.5);
  });

  it("non conta commesse senza sede né senza costi", () => {
    const r = margineRealeSedi([commessa("d", 500, 100), commessa("e", 900, 0)], sedi);
    expect(r.size).toBe(0);
  });

  it("rispetta il periodo scelto", () => {
    const r = margineRealeSedi([commessa("a", 1000, 600, "2026-01-05T10:00:00Z"), commessa("c", 1000, 800, "2026-06-05T10:00:00Z")], sedi, { da: "2026-06-01", a: "2026-06-30" });
    expect(r.get("S1")?.ricavi).toBe(1000);
  });
});


it("i movimenti di magazzino non valorizzati rendono il margine incompleto anche con costi registrati",()=>{
 expect(margineAffidabile({preventivo_totale:1000,consuntivo:100,movimenti_magazzino_senza_costo:1})).toBe(false);
 expect(margineAffidabile({preventivo_totale:1000,consuntivo:100,movimenti_magazzino_senza_costo:0})).toBe(true);
});
