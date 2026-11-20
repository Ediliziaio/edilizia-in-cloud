import { describe, expect, it } from "vitest";
import { bozzaRevisioneVoce, modificaDaBozza } from "@/lib/computo/revisioneVoce";
import type { VoceComputo } from "@/lib/computo/alberoComputo";
import { preparaModificaMultipla, originiDopoCambioSpecifiche, type ModificheArticoli } from "@/lib/distinta/modificaMultiplaArticoli";
import { gruppiNavigazioneArticoli } from "@/lib/distinta/navigazioneArticoli";
import type { FaseMateriali, MaterialeFase } from "@/hooks/useMaterialiPerFase";
import { generaDistinta } from "@/lib/distinta/generaDistinta";
import { catalogoComeScomposizioni } from "@/lib/distinta/scomposizioniStandard";

const voce = { id: "v", ordine: 1, descrizione_breve: "Pannello", quantita: 10, unita_misura: "mq", prezzo_unitario_computo: null,
  codice_tariffa: "OLD", codice_voce: "OLD", codice_prezzario: "OLD", misure: [], warnings: [] } as unknown as VoceComputo;
const vuoto: ModificheArticoli = { fornitore: false, supplierId: "", fase: false, phaseId: "", data: false, serveEntro: "", specifiche: false, testoSpecifiche: "" };

describe("correzioni manuali e modifiche multiple", () => {
  it("cambiare le specifiche revoca la verifica precedente senza perdere la fonte", () => {
    const prima = [{ tipo: "contratto", documento_ref: "doc", quantita: 12, verifica_acquisto: { stato: "confermata", confermata_il: "2026-11-20" } }];
    expect(originiDopoCambioSpecifiche(prima)).toEqual([expect.objectContaining({ documento_ref: "doc", quantita: 12,
      verifica_acquisto: expect.objectContaining({ stato: "da_verificare" }) })]);
    expect(prima[0].verifica_acquisto.stato).toBe("confermata");
  });
  it("conserva prezzo assente, origine e misure e accetta quantità italiana", () => {
    const prima = { ...voce, misure: [{ quantita: 10 }] } as VoceComputo;
    const patch = modificaDaBozza({ ...bozzaRevisioneVoce(prima), quantita: "12,5", nota: "Rilievo" }, prima);
    expect(patch).toMatchObject({ quantita: 12.5, prezzo_unitario_computo: null, importo_computo: null, is_modified: true });
    expect(patch.warnings.join(" ")).toMatch(/misura.*conservate/);
    expect(prima.misure).toEqual([{ quantita: 10 }]);
  });
  it("un codice corretto non continua a usare il vecchio prezzario per la ricetta", () => {
    expect(modificaDaBozza({ ...bozzaRevisioneVoce(voce), codice: "NEW" }, voce))
      .toMatchObject({ codice_tariffa: "NEW", codice_voce: "NEW", codice_prezzario: null });
  });
  it("rifiuta quantità ambigue e distingue prezzo zero da mancante", () => {
    expect(() => modificaDaBozza({ ...bozzaRevisioneVoce(voce), quantita: "1.234,5" }, voce)).toThrow();
    expect(modificaDaBozza({ ...bozzaRevisioneVoce(voce), prezzo: "0" }, voce).prezzo_unitario_computo).toBe(0);
  });
  it("modifica solo i campi spuntati senza quantità, prezzi o stato di verifica", () => {
    expect(preparaModificaMultipla({ ...vuoto, fornitore: true, supplierId: "f1", serveEntro: "2026-12-01", testoSpecifiche: "ignorato" })).toEqual({ supplier_id: "f1" });
    expect(preparaModificaMultipla({ ...vuoto, data: true })).toEqual({ data_fabbisogno: null });
    expect(() => preparaModificaMultipla(vuoto)).toThrow();
    expect(() => preparaModificaMultipla({ ...vuoto, data: true, serveEntro: "2026-02-30" })).toThrow();
  });
});

describe("navigazione degli articoli", () => {
  const articolo = (id: string, phase: string, extra = {}) => ({ id, name: "Pannello XPS", phase_id: phase, origine_materiale: "computo", quantity: 10, unita_misura: "mq", supplier_id: "f1", ...extra }) as unknown as MaterialeFase;
  const fasi = [
    { id: "a", nome: "Facciata", materiali: [articolo("m1", "a")] },
    { id: "b", nome: "Copertura", materiali: [articolo("m2", "b"), articolo("m3", "b", { supplier_id: null })] },
  ] as FaseMateriali[];
  it("raggruppa uno stesso fornitore attraverso fasi diverse, senza duplicare articoli", () => {
    const g = gruppiNavigazioneArticoli(fasi, "fornitori", [{ id: "f1", name: "Isolanti Srl" }]);
    expect(g.find(g => g.id === "f1")?.articoli).toEqual(["m1", "m2"]);
    expect(g.find(g => g.id === "_senza_fornitore")?.articoli).toEqual(["m3"]);
  });
  it("dati di magazzino non caricati restano da verificare", () => {
    expect(gruppiNavigazioneArticoli(fasi, "magazzino", [])[0].id).toBe("verificare");
  });
  it("non usa una disponibilità con unità incompatibile", () => {
    const stock = [{ id: "s", name: "Pannello XPS", quantity_available: 100, unita_misura: "pz" }];
    expect(gruppiNavigazioneArticoli(fasi, "magazzino", [], stock)[0].id).toBe("verificare");
    expect(gruppiNavigazioneArticoli(fasi, "magazzino", [], [{ ...stock[0], unita_misura: "mq" }])[0].id).toBe("disponibili");
  });
});

describe("riconoscimento senza altre letture AI", () => {
  it("espande F.P.O. per il riconoscimento ma conserva la fonte originale", () => {
    const r = generaDistinta({ voci: [{ id: "v1", descrizione_breve: "F.P.O. di bocchettone sifonato", quantita: 3, unita_misura: "cad" }],
      scomposizioni: [], riserva: catalogoComeScomposizioni() });
    expect(r.senzaScomposizione).toHaveLength(0);
    expect(r.righe).toHaveLength(1);
    expect(r.righe[0].quantita_calcolata).toBe(3);
    expect(r.righe[0].origini[0].descrizione).toBe("F.P.O. di bocchettone sifonato");
    expect(r.righe[0].verifica_acquisto?.stato).toBe("da_verificare");
  });
});
