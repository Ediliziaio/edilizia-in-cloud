import { describe, expect, it } from "vitest";
import { generaDistinta, type Scomposizione, type VoceComputo } from "@/lib/distinta/generaDistinta";
import { catalogoComeScomposizioni } from "@/lib/distinta/scomposizioniStandard";
import { applicaSovrapprezziSpessore } from "@/lib/distinta/sovrapprezziSpessore";
import { serviziDelComputo } from "@/lib/distinta/serviziComputo";
import { vociGenzano } from "../support/vociGenzano";

const voci: VoceComputo[] = vociGenzano();
const genera = (scomposizioni: Scomposizione[] = []) => generaDistinta({ voci, scomposizioni, riserva: catalogoComeScomposizioni() });
const perNumero = (r: ReturnType<typeof genera>, n: string) => r.righe.filter(m => m.origini.some(o => o.tipo === "computo" && o.voce_id === n));

describe("regressioni emerse dal confronto dei piani di Genzano", () => {
  it("conserva sei lotti VMC con otto macchine e sessantacinque bobine già incluse nella fornitura", () => {
    const r = generaDistinta({ voci, scomposizioni: [], riserva: catalogoComeScomposizioni() });
    const macchine = r.righe.filter(m => m.descrizione === "Deumidificatore con rinnovo aria e recupero del calore");
    expect(macchine).toHaveLength(6);
    expect(macchine.reduce((n, m) => n + m.quantita_calcolata, 0)).toBe(8);
    expect(r.righe.filter(m => m.descrizione === "Tubo di distribuzione VMC").reduce((n, m) => n + m.quantita_calcolata, 0)).toBe(65);
    expect(macchine.every(m => m.verifica_acquisto?.stato === "da_verificare")).toBe(true);
    expect(macchine.map(m => m.specifiche).join(" ")).toMatch(/Piano primo/);
  });
  it("non scarta il sottotetto non praticabile come pratica tecnica", () => {
    const r = genera();
    expect(r.escluse.some(e => e.voce_id === "57")).toBe(false);
    expect(perNumero(r, "57")[0]).toMatchObject({ quantita_netta: 667.85, unita_misura: "mq" });
    expect(perNumero(r, "57")[0].descrizione).toContain("XPS");
  });
  it("separa verticali e aggetti senza cambiare la superficie netta", () => {
    const parti = applicaSovrapprezziSpessore(voci).filter(v => v.id === "32");
    expect(parti.map(v => v.quantita).sort((a, b) => Number(a) - Number(b))).toEqual([50.15, 3054.24]);
    expect(parti.find(v => v.quantita === 3054.24)?.descrizione_breve).toMatch(/spessore 12 cm/);
    expect(parti.find(v => v.quantita === 50.15)?.descrizione_breve).toMatch(/spessore 30 mm/);
  });
  it("legge gli incrementi delle falde e quelli lontani dal sottotetto, segnalando il limite incoerente", () => {
    const parti = applicaSovrapprezziSpessore(voci);
    expect(parti.find(v => v.id === "49")?.descrizione_breve).toMatch(/spessore 10 cm/);
    expect(parti.find(v => v.id === "57")?.descrizione_breve).toMatch(/spessore 10 cm/);
    expect(parti.find(v => v.id === "57")?.avvisi_acquisto?.join(" ")).toMatch(/limite tariffario 6/);
    expect(parti.find(v => v.id === "55")?.avvisi_acquisto?.join(" ")).toMatch(/limite tariffario 10/);
  });
  it("interpreta 135 barre di tre metri, sospendendo l'unità tariffaria ambigua", () => {
    const originale = voci.find(v => v.id === "84")!;
    const ricetta: Scomposizione = { id: "profili", nome: "Profili FV", codice_prezzario: originale.codice_prezzario, unita_misura: "cad", attiva: true,
      componenti: [{ descrizione: "Profilo alluminio 47 x 37", specifiche: "Lunghezza 3000 mm", unita_misura: "pz", quantita_per_unita: 1 }] };
    const r = perNumero(genera([ricetta]), "84")[0];
    expect(r.quantita_calcolata).toBe(135);
    expect(r.verifica_acquisto?.stato).toBe("da_verificare");
    expect(originale.quantita).toBe(405);
  });
  it("mantiene le cinque taglie/installazioni dei ventilconvettori", () => {
    const r = genera();
    const macchine = r.righe.filter(m => m.descrizione.startsWith("Ventilconvettore"));
    expect(macchine).toHaveLength(5);
    expect(macchine.map(m => m.quantita_calcolata).sort((a, b) => a - b)).toEqual([1, 2, 4, 7, 26]);
    expect(macchine.some(m => m.descrizione.includes("a cassetta"))).toBe(true);
  });
  it("mantiene un inverter ibrido 30 kW e una macchina di progetto 70 kW", () => {
    const r = genera().righe.filter(m => m.descrizione.startsWith("Inverter fotovoltaico"));
    expect(r).toHaveLength(2);
    expect(r.every(m => m.quantita_calcolata === 1)).toBe(true);
    expect(r.some(m => /30 kW.*ibrido/.test(m.descrizione))).toBe(true);
    expect(r.some(m => /70 kW/.test(m.descrizione))).toBe(true);
  });
  it("non aggiunge una seconda struttura e altri morsetti ai fissaggi FV già computati", () => {
    const r = genera();
    expect(perNumero(r, "88").some(m => /morsetto|struttura di fissaggio/i.test(m.descrizione))).toBe(false);
    expect(perNumero(r, "88").find(m => /modulo fotovoltaico/i.test(m.descrizione))?.quantita_calcolata).toBe(160);
  });
  it("non trasforma il massetto a ritiro controllato in sabbia/cemento generici né nasconde i lotti incompleti", () => {
    const r = genera();
    expect(perNumero(r, "226").some(m => /cemento|sabbia/i.test(m.descrizione))).toBe(false);
    expect(r.senzaScomposizione.some(v => v.id === "226")).toBe(true);
    expect(perNumero(r, "95")[0]).toMatchObject({ unita_misura: "lotto", verifica_acquisto: { stato: "da_verificare" } });
    expect(r.senzaScomposizione.some(v => v.id === "113")).toBe(true);
  });
  it("i cartelli da un euro sono un noleggio; conserva tutti i periodi dei quattro trabattelli", () => {
    const r = serviziDelComputo(voci);
    expect(r.find(s => s.numero === "10")).toMatchObject({ tipo: "nolo", pezzi: 20, mesi: 13 });
    expect(r.find(s => s.numero === "15")).toMatchObject({ tipo: "nolo", pezzi: 2407.8, mesi: 8 });
    expect(r.find(s => s.numero === "22")).toMatchObject({ pezzi: 4, mesi: null });
    expect(r.find(s => s.numero === "22")?.periodi?.map(p => [p.quantita, p.mesi])).toEqual([[3, 9], [1, 8]]);
  });
  it("non collega incrementi con capitoli diversi anche se le descrizioni sono simili", () => {
    const v: VoceComputo[] = [{ id: "a", categoria: "A", descrizione_breve: "Pannelli isolanti spessore 30 mm", quantita: 100, unita_misura: "mq" },
      { id: "b", categoria: "B", descrizione_breve: "Pannelli isolanti sovrapprezzo per ogni cm", quantita: 200, unita_misura: "mq" }];
    expect(applicaSovrapprezziSpessore(v)).toEqual(v);
  });
});
