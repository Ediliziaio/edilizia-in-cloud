import { describe, expect, it } from "vitest";
import { articoliDalContratto, parseContractExtract } from "@/lib/orders/contractExtract";

/** Il preventivo firmato di serramenti: una riga a corpo, posa e trasporti compresi, allegato con 11 posizioni. */
const firmato = parseContractExtract({
  importo_totale_eur: 23950, importo_totale_ivato_eur: 27500,
  voci: [
    { descrizione: "Fornitura infissi in PVC, doppio vetro con canalina calda, come da disegno e scheda tecnica allegati; compreso portoncino in alluminio e zanzariere n. 13", quantita: 1, prezzo_unitario_eur: 23950 },
    { descrizione: "Pose e materiali di consumo", quantita: 1, prezzo_unitario_eur: 0 },
    { descrizione: "Trasporti", quantita: 1, prezzo_unitario_eur: 0 },
  ],
  posizioni_allegato: [
    { codice: "Finestra 001", quantita: 1, dimensioni: "2100x2200", descrizione: "Salamander GreenEvo 76 3D" },
    { codice: "Porta 003", quantita: 2, dimensioni: "1000x2200", descrizione: "porta battente-ribalta" },
    { codice: "ZANZARIERE", quantita: 13, dimensioni: null, descrizione: "Zanzariere" },
  ],
});

describe("articoli da un contratto di serramenti a posizioni", () => {
  it("gli articoli sono le posizioni con quantità e misure; la riga a corpo, la posa e i trasporti no", () => {
    const a = articoliDalContratto(firmato);
    expect(a.posizioni.map((p) => [p.riferimento, p.quantita, p.larghezza_mm, p.altezza_mm])).toEqual([
      ["Finestra 001", 1, 2100, 2200], ["Porta 003", 2, 1000, 2200], ["ZANZARIERE", 13, null, null],
    ]);
    expect(a.voci).toEqual([]);
  });

  it("senza allegato restano le voci che si comprano", () => {
    const a = articoliDalContratto({ ...firmato, posizioni_allegato: [] });
    expect(a.posizioni).toEqual([]);
    expect(a.voci.map((v) => v.natura)).toEqual(["fornitura"]);
  });
});
