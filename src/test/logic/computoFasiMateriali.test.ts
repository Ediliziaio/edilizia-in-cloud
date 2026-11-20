import { describe, expect, it } from "vitest";
import { completaFasiComputo, macrofaseOperativa } from "../../../supabase/functions/_shared/computoFasiOperative";
import type { ComputoStrutturato, ComputoVoceStrutturata } from "@/lib/computo/computoStrutturato";
import { generaDistinta } from "@/lib/distinta/generaDistinta";
import { catalogoComeScomposizioni } from "@/lib/distinta/scomposizioniStandard";
import { contrattoDaComputo } from "@/lib/orders/contrattoDaComputo";

const voce = (descrizione: string, importo: number, n = 1): ComputoVoceStrutturata => ({ numero_ordine: String(n), codici: [], codice_tariffa: `V${n}`, descrizione, importo, descrizione_troncata: false, unita_misura: "mq", quantita: 10, prezzo_unitario: importo / 10, sezione: "LAVORI A MISURA", super_categoria: null, categoria: null, sotto_categoria: null, is_sicurezza: false, is_detrazione: importo < 0, a_corpo: false, misure: [], pagina: 2, avvisi: [] });
const computo = (voci: ComputoVoceStrutturata[], extra: Partial<ComputoStrutturato> = {}): ComputoStrutturato => ({ formato: "primus_pdf", metadata: {}, voci, riepiloghi: [], totale_dichiarato: voci.reduce((s, v) => s + (v.importo ?? 0), 0), prezzari: [], avvisi: [], ...extra });

describe("fasi del computo senza capitoli sulle voci", () => {
  it("riconosce una quadratura unica anche con la detrazione della sicurezza, senza alterare importi e misure", () => {
    const c = computo([voce("Ponteggio", 80), voce("Piano di lavoro", 60, 2), voce("Ripartizione sicurezza", -40, 3), voce("Sbruffatura di murature", 50, 4)], { riepiloghi: [{ livello: "categoria", codice: "001", nome: "ONERI DELLA SICUREZZA", importo: 100 }] });
    const r = completaFasiComputo(c);
    expect(r.voci.slice(0, 3).every(v => v.categoria?.nome === "ONERI DELLA SICUREZZA" && v.origine_fase === "riepilogo" && v.is_sicurezza)).toBe(true);
    expect(r.voci[3].categoria?.nome).toBe("Preparazione supporti, intonaci e finiture");
    expect(r.voci.map(v => [v.importo, v.quantita, v.prezzo_unitario, v.misure])).toEqual(c.voci.map(v => [v.importo, v.quantita, v.prezzo_unitario, v.misure]));
    expect(c.voci[0].categoria).toBeNull();
    expect(r.avvisi.join(" ")).toContain("Conferma le fasi");
  });
  it("una quadratura ambigua non viene presentata come attribuzione da riepilogo", () => {
    const r = completaFasiComputo(computo([voce("Opere speciali", 50), voce("Opere speciali diverse", 50, 2)], { riepiloghi: [{ livello: "categoria", codice: "001", nome: "Fondazione", importo: 50 }] }));
    expect(r.voci.every(v => v.origine_fase !== "riepilogo")).toBe(true);
  });
  it("non sovrascrive le categorie stampate e non trasforma gli onorari in lavori", () => {
    const originale = computo([{ ...voce("Isolamento", 50), categoria: { nome: "Cappotto", numero: 1 } }]);
    expect(completaFasiComputo(originale)).toBe(originale);
    const r = completaFasiComputo(computo([voce("Progettazione Categoria S03", 50), voce("IVA Lavori Sisma", 10, 2), voce("Consolidamento di solaio esistente", 70, 3)]));
    expect(contrattoDaComputo(r).voci).toHaveLength(1);
    expect(contrattoDaComputo(r).importo_totale_eur).toBe(70);
  });
  it("il computo conserva più di 15 fasi e le raggruppa per macrofase", () => {
    const c = computo(Array.from({ length: 22 }, (_, n) => ({ ...voce(`Lavorazione ${n}`, 10, n + 1), categoria: { nome: `Impianto elettrico settore ${n}`, numero: n + 1 } })));
    expect(contrattoDaComputo(c).fasi_lavoro).toHaveLength(22);
    expect(macrofaseOperativa("Isolamento termico di strutture opache verticali")).toBe("Involucro e serramenti");
    expect(macrofaseOperativa("Presidi antisismici")).toBe("Strutture e consolidamenti");
  });
});

describe("i materiali dipendono dall'intervento, non dal supporto", () => {
  const genera = (descrizione_breve: string, unita_misura = "mq") => generaDistinta({ voci: [{ id: "v1", descrizione_breve, unita_misura, quantita: 100 }], scomposizioni: [], riserva: catalogoComeScomposizioni() });
  it("sbruffatura di murature non compra blocchi e malta da muratura", () => {
    const r = genera("Sbruffatura di murature spicconate o nuove, con malta fluida cementizia per migliorare l'aderenza dell'intonaco");
    expect(r.righe.some(m => /blocco|malta per muratura/i.test(m.descrizione))).toBe(false);
    expect(r.senzaScomposizione).toHaveLength(1);
  });
  it("consolidamento antisfondellamento non compra travetti, pignatte o getti di un solaio nuovo", () => {
    const r = genera("Consolidamento di solaio in laterocemento esistente con problemi di sfondellamento");
    expect(r.righe.some(m => /travetto|blocco interposto|calcestruzzo strutturale/i.test(m.descrizione))).toBe(false);
    expect(r.senzaScomposizione).toHaveLength(1);
  });
  it("gli accessori compresi in una fornitura a kg non ereditano i kg della rete", () => {
    const r = genera("Rete elettrosaldata a maglia quadra B450C, compresi distanziatori, legature ed ecc.", "kg");
    expect(r.righe.some(m => /distanziat|legatur|^ecc$/i.test(m.descrizione))).toBe(false);
    expect(r.righe.some(m => /Rete elettrosaldata/i.test(m.descrizione))).toBe(true);
  });
});
