import { describe, expect, it, vi } from "vitest";
import { riconciliaBollettaFv } from "../../../supabase/functions/_shared/fvRiconciliazioneBolletta";
import { improntaMisureFv, statoMisureFv } from "../../../supabase/functions/_shared/fvVerificaMisure";
import { creaDisegnoTetto, disponiModuliAutomaticamente, leggiDisegnoCommerciale } from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { analisiConsumiIniziale, leggiAnalisiConsumi } from "../../../supabase/functions/_shared/fvBollette";
import { agganciaPuntoFv, impostaLunghezzaLatoFv } from "@/components/fotovoltaico/tetto/aggancioMappa";
import { erroreFaldeMappaFv } from "@/components/fotovoltaico/tetto/mappaGeometria";
import { proposteImpiantoFv } from "@/lib/fotovoltaico/proposteImpianto";
import { INITIAL } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";
import type { WizardData } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/types";
import { inserisciPagineSchede, rinumeraPagineFv } from "@/lib/fotovoltaico/schedeTecnichePreventivo";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const listino = { pannelli: [{ id: "p", potenza_w: 500, prezzo_vendita: 200 }], inverter: [{ id: "i", prezzo_vendita: 1200 }], accumuli: [{ id: "b", capacita_kwh: 5, prezzo_vendita: 5000 }] };
const dati = (): WizardData => ({ ...INITIAL, consumo_annuo_kwh: 6000, costo_kwh_attuale: .28, ore_sole_annue: 1600,
  fonte_dati_tetto: "pvgis", pannello_id: "p", inverter_id: "i", layout_overlay: { modalita: "senza_mappa" },
  analisi_consumi: analisiConsumiIniziale(), manodopera_righe: [{ descrizione: "Posa", tariffa_id: null, ore: 20, tariffa_oraria_netta: 30, tariffa_oraria_vendita: 50 }] });
const piano = () => ({ ...creaDisegnoTetto("singola", 12, 8), schema3d: { altezza: 5.5, pendenza: 20 } });

describe("Spesa letta e costo evitabile", () => {
  it("rende visibile lo scarto reale della bolletta Demo senza trasformarlo in risparmio", () => {
    expect(riconciliaBollettaFv({ consumo: 2787, costoKwh: .28, fissi: 274.1, spesaLetta: 1148.02 })).toEqual({ energia: 780.36, fissi: 274.1, spesaLetta: 1148.02, modellata: 1054.46, differenza: 93.56, stato: "residuo" });
  });
  it("segnala un modello più caro della spesa letta", () => {
    expect(riconciliaBollettaFv({ consumo: 3000, costoKwh: .4, fissi: 200, spesaLetta: 1000 })).toMatchObject({ differenza: -400, stato: "superiore" });
  });
  it.each([null, undefined, NaN, Infinity, -1])("non sostituisce quote fisse mancanti o invalide con zero: %s", fissi => {
    expect(riconciliaBollettaFv({ consumo: 3000, costoKwh: .3, fissi, spesaLetta: 1000 })).toMatchObject({ modellata: null, differenza: null, stato: "incompleta" });
  });
  it("distingue zero confermato e importo assente", () => {
    expect(riconciliaBollettaFv({ consumo: 0, costoKwh: 0, fissi: 0, spesaLetta: 0 }).stato).toBe("coerente");
  });
});

describe("Confronto del rilievo legato alle misure effettive", () => {
  it("conserva la conferma nella bozza riaperta ma la invalida se cambia una misura", () => {
    const p = piano(), confermato = { ...p, confermaMisure: { firma: improntaMisureFv(p), fonte: "sopralluogo" as const, data: "2026-11-20" } };
    const riaperto = leggiDisegnoCommerciale(JSON.parse(JSON.stringify(confermato)))!;
    expect(statoMisureFv(riaperto).confermata).toBe(true);
    riaperto.schema3d!.altezza = 8;
    expect(statoMisureFv(riaperto)).toMatchObject({ confermata: false, daRiconfermare: true });
    expect(statoMisureFv(p).confermata).toBe(false);
  });
  it("la disposizione dei pannelli non certifica né cambia le quote del tetto", () => {
    const p = piano(), conPannelli = disponiModuliAutomaticamente(p, 3);
    expect(improntaMisureFv(conPannelli)).toBe(improntaMisureFv(p));
    const cambiato = structuredClone(p); cambiato.falde[0].punti[0].x += .5;
    expect(improntaMisureFv(cambiato)).not.toBe(improntaMisureFv(p));
  });
});

describe("Disegno assistito", () => {
  it("aggancia il vertice più vicino entro la tolleranza senza muovere gli originali", () => {
    const punti = [{ x: 1, y: 2 }, { x: 1.2, y: 2.1 }];
    expect(agganciaPuntoFv({ x: 1.18, y: 2.1 }, punti, undefined, .1)).toEqual({ punto: punti[1], tipo: "vertice" });
    expect(agganciaPuntoFv({ x: 2, y: 2 }, punti, undefined, .1).tipo).toBeNull();
    expect(punti[1]).toEqual({ x: 1.2, y: 2.1 });
  });
  it("allinea anche una falda ruotata di 45 gradi", () => {
    const r = agganciaPuntoFv({ x: 4.03, y: 3.97 }, [], { x: 0, y: 0 }, .1, { x: 1, y: 1 });
    expect(r.tipo).toBe("allineamento"); expect(r.punto.x).toBeCloseTo(4); expect(r.punto.y).toBeCloseTo(4);
  });
  it("modifica un lato mantenendo gli altri vertici e rifiuta un contorno incrociato", () => {
    const p = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }];
    const nuovo = impostaLunghezzaLatoFv(p, 0, 8);
    expect(nuovo[1]).toEqual({ x: 8, y: 0 }); expect(nuovo[2]).toEqual(p[2]); expect(p[1].x).toBe(6);
    expect(() => impostaLunghezzaLatoFv(p, 0, -2)).toThrow();
    expect(() => impostaLunghezzaLatoFv(p, 0, Infinity)).toThrow();
  });
  it("accetta un bordo condiviso e segnala una sovrapposizione", () => {
    const f = { id: "a", nome: "A", punti: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }], inclinazione: 20, azimut: 180, inclinazioneStimata: true };
    const vicino = { ...f, id: "b", nome: "B", punti: f.punti.map(p => ({ x: p.x + 6, y: p.y })) };
    expect(erroreFaldeMappaFv([f, vicino])).toBe("");
    expect(erroreFaldeMappaFv([f, { ...vicino, punti: vicino.punti.map(p => ({ x: p.x - 1, y: p.y })) }])).toMatch(/sovrappongono/);
  });
});

describe("Taglie, prezzo e beneficio dell’accumulo", () => {
  it("propone taglie basate su consumi e prezzi anche prima del disegno", () => {
    const r = proposteImpiantoFv(dati(), listino, [])!;
    expect(r.senzaMappa).toBe(true); expect(r.prezziDisponibili).toBe(true);
    expect(r.proposte.map(s => s.id)).toEqual(["contenuta", "consigliata", "accumulo"]);
    const [piccola, consigliata, accumulo] = r.proposte;
    expect(piccola.configurazione.numero_pannelli_scelti).toBeLessThanOrEqual(consigliata.configurazione.numero_pannelli_scelti);
    expect(accumulo.incrementoAccumulo!.saldo10).toBeLessThan(0);
    expect(accumulo.incrementoAccumulo!.costo).toBeGreaterThan(0);
    expect(accumulo.flussi.autoconsumo).toBeGreaterThanOrEqual(consigliata.flussi.autoconsumo);
  });
  it("rispetta la capienza reale e conserva foto, falde e posa originale", () => {
    const p = disponiModuliAutomaticamente(piano(), 5), copia = JSON.stringify(p);
    const r = proposteImpiantoFv(dati(), listino, [], p)!;
    r.proposte.forEach(s => {
      expect(s.configurazione.numero_pannelli_scelti).toBeLessThanOrEqual(5);
      const q = leggiDisegnoCommerciale(s.configurazione.layout_overlay)!;
      expect(q.falde).toEqual(p.falde); expect(q.pannelli.length).toBe(s.configurazione.numero_pannelli_scelti);
    });
    expect(JSON.stringify(p)).toBe(copia);
  });
  it("senza prezzo non inventa un investimento o un rendimento", () => {
    const r = proposteImpiantoFv(dati(), { ...listino, inverter: [{ id: "i" }] }, [])!;
    expect(r.prezziDisponibili).toBe(false);
    r.proposte.forEach(s => { expect(s.prezzo).toBeNull(); expect(s.saldo10).toBeNull(); expect(s.rientro).toBeNull(); });
  });
  it("non riutilizza il prezzo a corpo di un impianto diverso", () => {
    const r = proposteImpiantoFv({ ...dati(), numero_pannelli_scelti: 100, prezzo_vendita_manuale: 10000 }, listino, [])!;
    r.proposte.forEach(s => { expect(s.prezzoCorpoDaRivedere).toBe(true); expect(s.configurazione.prezzo_vendita_manuale).toBeNull(); expect(s.prezzo).toBeNull(); });
  });
  it("non aggiunge un accumulo generico quando manca il prodotto e ignora capacità impossibili", () => {
    const r = proposteImpiantoFv(dati(), { ...listino, accumuli: [{ id: "err", capacita_kwh: Infinity }] }, [])!;
    expect(r.proposte).toHaveLength(2);
  });
  it("conserva lo scenario scelto al salvataggio e include i consumi futuri", () => {
    const d = dati(), r = proposteImpiantoFv(d, listino, [])!;
    d.analisi_consumi!.profilo.aumentoConsumiPct = 50;
    d.analisi_consumi!.scenario = "contenuta";
    const letta = leggiAnalisiConsumi(JSON.parse(JSON.stringify(d.analisi_consumi)))!;
    expect(letta.scenario).toBe("contenuta");
    expect(proposteImpiantoFv({ ...d, analisi_consumi: letta }, listino, [])!.massimo).toBeGreaterThan(r.massimo);
  });
  it.each([{ tetto_mock: true }, { consumo_annuo_kwh: null }, { ore_sole_annue: Infinity }, { pannello_id: null }, { kit_bundle_id: "kit" }])("richiede dati reali per il confronto: %o", patch => {
    expect(proposteImpiantoFv({ ...dati(), ...patch }, listino, [])).toBeNull();
  });
});

describe("Numerazione unica con allegati tecnici", () => {
  it("conta anche gli allegati mantenendo firma, grafici e riferimenti del preventivo", () => {
    const html = '<html><head><title>FV-2026-0025</title></head><body><div class="page"><svg viewBox="0 0 20 20"><text>A</text></svg><div class="page-footer"><span class="pnum">1 / 2</span></div></div><div class="page"><div data-fv-section="firma">Per accettazione</div><div class="page-footer"><span class="pnum">2 / 2</span></div></div></body></html>';
    const result = inserisciPagineSchede(html, '<div class="page"><img src="data:image/jpeg;base64,AA==" alt="Scheda inverter"></div>');
    const doc = new DOMParser().parseFromString(result, "text/html");
    expect([...doc.querySelectorAll(".pnum")].map(p => p.textContent)).toEqual(["1 / 3", "2 / 3", "3 / 3"]);
    expect(doc.querySelectorAll(".page")).toHaveLength(3);
    expect(doc.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 20 20");
    expect(result).toContain("FV-2026-0025"); expect(result).toContain("Per accettazione");
    expect(rinumeraPagineFv(result)).toBe(result);
  });
});
