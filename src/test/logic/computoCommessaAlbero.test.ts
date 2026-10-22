import { describe, expect, it, vi } from "vitest";
import { alberoComputo, filtraVoci, type VoceComputo } from "@/lib/computo/alberoComputo";
import { esportaComputoPdf, esportaComputoXlsx, nomeFileComputo, riepilogoCapitoli, righeComputoClassico } from "@/lib/computo/esportaComputo";
import { quadroEconomico } from "@/lib/computo/quadroEconomico";
import { MATERIALI_VIEWS, resolveMaterialiView, resolveOrderDetailDestination } from "@/lib/orders/detailNavigation";

let ordine = 0;
const voce = (p: Partial<VoceComputo>): VoceComputo => ({
  id: `v${++ordine}`, ordine, numero_ordine: String(ordine), codice_voce: null, codice_tariffa: `T${ordine}`, codice_prezzario: null,
  descrizione_breve: `Voce ${ordine}`, descrizione_estesa: null, unita_misura: "mq", quantita: 1, prezzo_unitario_computo: 10, importo_computo: 10,
  super_categoria: "ECO", categoria: "OPERE", sotto_categoria: null, is_sicurezza: false, is_detrazione: false, a_corpo: false, warnings: [], misure: [], ...p,
});

describe("albero del computo di commessa", () => {
  const voci = [
    voce({ categoria: "ONERI DELLA SICUREZZA", sotto_categoria: "Opere provvisionali", importo_computo: 100, is_sicurezza: true }),
    voce({ categoria: "ISOLAMENTO", sotto_categoria: "Pareti", importo_computo: 300, misure: [{ ordine: 1, descrizione: "Facciata nord", parti_uguali: 2, lunghezza: 10, larghezza: null, altezza_peso: 3, quantita: 60, formula: null }] }),
    voce({ categoria: "ISOLAMENTO", sotto_categoria: "Pareti", importo_computo: -50, is_detrazione: true, unita_misura: "a corpo" }),
    voce({ categoria: "ONERI DELLA SICUREZZA", sotto_categoria: "Opere provvisionali", importo_computo: 150, is_sicurezza: true }),
  ];

  it("raggruppa per super-categoria › categoria › sotto-categoria con subtotali e percentuali", () => {
    const { nodi, totale } = alberoComputo(voci);
    expect(totale).toBe(500);
    expect(nodi).toHaveLength(1);
    expect(nodi[0]).toMatchObject({ nome: "ECO", importo: 500, percentuale: 100 });
    expect(nodi[0].figli.map(f => [f.nome, f.importo, f.percentuale])).toEqual([["ONERI DELLA SICUREZZA", 250, 50], ["ISOLAMENTO", 250, 50]]);
    expect(nodi[0].figli[0].figli[0].voci.map(v => v.numero_ordine)).toEqual(["1", "4"]);
  });

  it("la ricerca trova anche le righe di misura e lascia le percentuali sul totale intero", () => {
    const trovate = filtraVoci(voci, "facciata NORD");
    expect(trovate.map(v => v.numero_ordine)).toEqual(["2"]);
    expect(alberoComputo(trovate, 500).nodi[0].percentuale).toBe(60);
  });

  it("stampa classica: capitoli, voce, misure, SOMMANO / SI DETRAGGONO, subtotali, totale", () => {
    const righe = righeComputoClassico(voci);
    expect(righe[0]).toEqual({ tipo: "capitolo", livello: 0, testo: "ECO" });
    expect(righe).toContainEqual({ tipo: "misura", testo: "Facciata nord", pu: 2, lu: 10, la: null, h: 3, q: 60 });
    expect(righe).toContainEqual(expect.objectContaining({ tipo: "sommano", testo: "SI DETRAGGONO a corpo", importo: -50 }));
    expect(righe.at(-1)).toEqual({ tipo: "totale", testo: "TOTALE COMPUTO", importo: 500 });
    expect(riepilogoCapitoli(voci).map(r => r.livello)).toEqual([0, 1, 2, 1, 2]);
    expect(nomeFileComputo("Computo è «finale»", "xlsx")).toBe("Computo_e_finale.xlsx");
  });
});

describe("esportazione Excel e PDF", () => {
  const voci = Array.from({ length: 120 }, (_, i) => voce({
    categoria: i < 40 ? "ONERI DELLA SICUREZZA" : "ISOLAMENTO", sotto_categoria: i % 2 ? "Pareti" : "Solai",
    descrizione_estesa: `Descrizione lunga ${i} `.repeat(12),
    misure: [{ ordine: 1, descrizione: "Prospetto sud *(par.ug.=2*3)", parti_uguali: 6, lunghezza: 4, larghezza: null, altezza_peso: 3, quantita: 72, formula: "par.ug.=2*3" }],
  }));
  it("producono i file senza errori anche su più pagine", async () => {
    const creati: Blob[] = [];
    const origCreate = URL.createObjectURL; const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = ((b: Blob) => { creati.push(b); return "blob:x"; }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = () => {};
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      await esportaComputoXlsx(voci, { titolo: "Computo prova", quadro: quadroEconomico(1200, 400, 10) });
      await esportaComputoPdf(voci, { titolo: "Computo prova", cig: "A1", quadro: quadroEconomico(1200, 400, 10) });
    } finally {
      URL.createObjectURL = origCreate; URL.revokeObjectURL = origRevoke; click.mockRestore();
    }
    expect(creati.map(b => b.type)).toEqual(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/pdf"]);
    expect(creati.every(b => b.size > 1000)).toBe(true);
  }, 30_000);
});

describe("la scheda Computo nella commessa", () => {
  it("è una vista dei materiali raggiungibile anche da link", () => {
    expect(MATERIALI_VIEWS.map(v => v.value)).toContain("computo");
    expect(resolveMaterialiView("?vista_materiali=computo")).toBe("computo");
    expect(resolveMaterialiView("", "section-computo")).toBe("computo");
    expect(resolveOrderDetailDestination("?section=section-computo").tab).toBe("articoli");
  });
});
