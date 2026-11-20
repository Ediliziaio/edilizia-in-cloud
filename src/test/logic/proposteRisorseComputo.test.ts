import { describe, expect, it, vi } from "vitest";
import { vociGenzano } from "../support/vociGenzano";
import { leggiPianoRisorse, proponiRisorseComputo, unisciProposteRisorse, type PropostaRisorsa } from "@/lib/distinta/proposteRisorseComputo";
import { salvaPianoRisorse, type ArchivioRisorse } from "@/lib/distinta/salvaPianoRisorse";
import { generaDistinta } from "@/lib/distinta/generaDistinta";
import { catalogoComeScomposizioni } from "@/lib/distinta/scomposizioniStandard";

const ambito = { companyId: "azienda", orderId: "commessa", computoId: "computo", userId: "tecnico" };
const voci = vociGenzano();
const r = proponiRisorseComputo(voci, { faseDi: () => "fase-sicurezza", sottofasi: [{ id: "sottofase-13", computo_voce_id: "13" }] });
const daVoce = (n: string) => r.find(p => p.fonti.some(f => f.numero === n))!;

describe("piano risorse del computo reale", () => {
  it("riunisce il ciclo del ponteggio, senza sommare superfici o moltiplicarle per le fasi", () => {
    const p = daVoce("13");
    expect(p.fonti.map(f => f.numero)).toEqual(["13", "15", "16"]);
    expect(p.quantita).toBe(2407.8);
    expect(p.periodi.map(x => x.mesi)).toEqual([1, 8]);
    expect(p.fase_ids).toEqual(["fase-sicurezza"]);
    expect(p.sottofase_ids).toEqual(["sottofase-13"]);
  });
  it("tubo-giunto e impalcati mantengono il proprio ciclo e le quantità del computo", () => {
    expect(daVoce("19").fonti.map(f => f.numero)).toEqual(["19", "20", "21"]);
    expect(daVoce("19").quantita).toBe(780);
    expect(daVoce("17").fonti.map(f => f.numero)).toEqual(["17", "18"]);
    expect(daVoce("17").quantita).toBe(3172.44);
    expect(daVoce("17").periodi.filter(x => x.mesi === 8).map(x => x.quantita)).toEqual([2407.8, 764.64]);
  });
  it("monoblocchi: due per dodici mesi; montaggio e trasporto non aggiungono un mese", () => {
    expect(daVoce("7").fonti.map(f => f.numero)).toEqual(["7", "8"]);
    expect(daVoce("7").quantita).toBe(2);
    expect(daVoce("7").periodi.map(x => [x.quantita, x.mesi])).toEqual([[1, 12], [1, 12]]);
  });
  it("quattro trabattelli con durate diverse; cartelli da un euro conservati; trasferimenti esclusi", () => {
    expect(daVoce("22").quantita).toBe(4);
    expect(daVoce("22").periodi.map(x => [x.quantita, x.mesi])).toEqual([[3, 9], [1, 8]]);
    expect(daVoce("10").quantita).toBe(20);
    expect(r.some(p => p.fonti.some(f => f.numero === "30"))).toBe(false);
  });
  it("una lavorazione senza ricetta resta un lotto da risolvere, con la propria origine", () => {
    const distinta = generaDistinta({ voci, scomposizioni: [], riserva: catalogoComeScomposizioni() });
    const p = proponiRisorseComputo(voci, { senzaRicetta: distinta.senzaScomposizione });
    expect(p.find(x => x.fonti.some(f => f.numero === "226"))).toMatchObject({ tipo: "lotto", scelta: { stato: "da_completare" } });
  });
  it("rigenerare conserva fornitore, quantità e stato manuali; variazioni della fonte richiedono revisione", () => {
    const p = daVoce("22");
    const salvata: PropostaRisorsa = { ...p, scelta: { ...p.scelta, fornitore: "Noleggiatore scelto", quantita: 5, stato: "da_quotare" } };
    expect(unisciProposteRisorse([p], [salvata])[0].scelta).toEqual(salvata.scelta);
    const cambiata = unisciProposteRisorse([{ ...p, impronta: "nuova-fonte" }], [salvata])[0];
    expect(cambiata).toMatchObject({ da_rivedere: true, scelta: salvata.scelta });
    expect(unisciProposteRisorse([], [salvata])[0].da_rivedere).toBe(true);
  });
});

describe("salvataggio con controllo di concorrenza e isolamento", () => {
  it("salva e rilegge senza cambiare la lettura e gli altri metadati del PDF", async () => {
    let raw: Record<string, unknown> = { impronta: "PDF-originale", progress: "Letto", altro: [1, 2] };
    const archivio: ArchivioRisorse = { leggi: async () => ({ raw, updated_at: "t1" }), scrivi: async x => { raw = x; return true; } };
    const p = await salvaPianoRisorse(archivio, ambito, 0, r);
    expect(p.revisione).toBe(1);
    expect(raw).toMatchObject({ impronta: "PDF-originale", progress: "Letto", altro: [1, 2] });
    expect(leggiPianoRisorse(raw, ambito)?.proposte).toEqual(r);
    expect(() => leggiPianoRisorse(raw, { ...ambito, orderId: "altra" })).toThrow(/non appartiene/);
    expect(() => leggiPianoRisorse(raw, { ...ambito, companyId: "altra" })).toThrow(/non appartiene/);
    expect(() => leggiPianoRisorse(raw, { ...ambito, computoId: "altro" })).toThrow(/non appartiene/);
  });
  it("non sovrascrive una revisione salvata nel frattempo", async () => {
    const scrivi = vi.fn(async () => true);
    const p = await salvaPianoRisorse({ leggi: async () => ({ raw: {}, updated_at: "t1" }), scrivi }, ambito, 0, r);
    scrivi.mockClear();
    await expect(salvaPianoRisorse({ leggi: async () => ({ raw: { _piano_risorse_v1: p }, updated_at: "t2" }), scrivi }, ambito, 0, r)).rejects.toThrow(/altra sessione/);
    expect(scrivi).not.toHaveBeenCalled();
  });
  it("ritenta soltanto una modifica concorrente ad altri metadati, conservandola", async () => {
    let raw: Record<string, unknown> = { impronta: "PDF" }; let tentativi = 0;
    const p = await salvaPianoRisorse({ leggi: async () => ({ raw, updated_at: String(tentativi) }), scrivi: async x => {
      tentativi++; if (tentativi === 1) { raw = { ...raw, altro: "modificato nel frattempo" }; return false; }
      raw = x; return true;
    } }, ambito, 0, r);
    expect(p.revisione).toBe(1); expect(tentativi).toBe(2);
    expect(raw.altro).toBe("modificato nel frattempo");
  });
  it("rifiuta quantità e periodi non validi e non sostituisce archivi non riconosciuti", async () => {
    const scrivi = vi.fn(async () => true);
    const archivio = { leggi: async () => ({ raw: {}, updated_at: "t1" }), scrivi };
    await expect(salvaPianoRisorse(archivio, ambito, 0, [{ ...r[0], scelta: { ...r[0].scelta, quantita: -1 } }])).rejects.toThrow(/positive/);
    await expect(salvaPianoRisorse(archivio, ambito, 0, [{ ...r[0], scelta: { ...r[0].scelta, periodi: [{ quantita: 1, mesi: 0, unita: "pz", nota: "" }] } }])).rejects.toThrow(/periodi/);
    await expect(salvaPianoRisorse({ ...archivio, leggi: async () => ({ raw: [1, 2], updated_at: "t1" }) }, ambito, 0, r)).rejects.toThrow(/formato/);
    expect(scrivi).not.toHaveBeenCalled();
  });
});
