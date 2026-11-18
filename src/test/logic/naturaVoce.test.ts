import { describe, expect, it } from "vitest";
import { naturaVoce, siCompra } from "@/lib/orders/naturaVoce";

/** Voci vere del computo ECO e dei preventivi del banco (17/11/2026). */
describe("cos'è una voce: solo i materiali si comprano", () => {
  it.each([
    ["Oneri per la cantierizzazione di opere edili Costo per ricerca sottoservizi", "servizio"],
    ["Riunioni di formazione ed informazione tra i preposti della sicurezza", "servizio"],
    ["Estintore a polvere, omologato, costo di utilizzo mensile: da 6 kg", "servizio"],
    ["Piattaforma semovente con braccio telescopico: altezza 18 m", "servizio"],
    ["Trasporto a discarica controllata dei materiali di risulta", "servizio"],
    ["Tiro in alto o calo in basso di materiali a mezzo di elevatore", "servizio"],
    ["Smontaggio di infissi esterni in legno come finestre", "lavorazione"],
    ["Rimozione di caldaia murale, compreso ogni onere", "lavorazione"],
    ["Posa rivestimenti", "lavorazione"],
    ["Installatore 4a categoria: prezzo comprensivo di spese generali", "lavorazione"],
    ["Sconto sulla seguente categoria", "sconto"],
    ["Isolamento termico a cappotto di pareti esterne già preparate", "fornitura_e_posa"],
    ["Serramento realizzato con profili estrusi di alluminio verniciato", "fornitura_e_posa"],
    ["FORNITURA E POSA IN OPERA DI MODULI FOTOVOLTAICI", "fornitura_e_posa"],
    ["Sola fornitura infissi in PVC, doppio vetro", "fornitura"],
    ["Fornitura in opera di battiscopa in legno", "fornitura_e_posa"],
  ])("%s → %s", (descrizione, attesa) => {
    expect(naturaVoce(descrizione)).toBe(attesa);
  });

  it("negli oneri della sicurezza è un costo del cantiere, anche un cartello o un bagno chimico", () => {
    expect(naturaVoce("Bagno chimico realizzato in polietilene", { sicurezza: true })).toBe("servizio");
    expect(naturaVoce("Cartelli di pericolo", { capitolo: "ONERI DELLA SICUREZZA" })).toBe("servizio");
  });

  it("si compra solo il materiale", () => {
    expect(siCompra("fornitura")).toBe(true);
    expect(siCompra("fornitura_e_posa")).toBe(true);
    for (const n of ["lavorazione", "servizio", "sconto"] as const) expect(siCompra(n)).toBe(false);
  });
});

describe("contratto di serramenti con posa compresa (preventivo firmato del banco, 17/11/2026)", () => {
  it("la fornitura è materiale, la posa compresa è lavoro, i trasporti sono un servizio", () => {
    expect(naturaVoce("Sola fornitura infissi in PVC, doppio vetro con canalina calda")).toBe("fornitura");
    expect(naturaVoce("Pose e materiali di consumo")).toBe("lavorazione");
    expect(naturaVoce("Trasporti")).toBe("servizio");
  });
});
