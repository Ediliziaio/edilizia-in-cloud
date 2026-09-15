import { describe, expect, it } from "vitest";
import {
  codificaScelta,
  coloriDelListino,
  decodificaScelta,
  dividiVoci,
  gruppiColori,
  paroleVoci,
  problemaVoci,
  pulisciVoci,
  scelteDopo,
  suggerimentiVoci,
  testoScelta,
  vociDi,
} from "@/lib/listino/scelteVariante";

// Le voci dentro una variante: «Colore Standard +10%» è la fascia di prezzo,
// i colori veri stanno nel suo elenco e nel preventivo se ne sceglie uno.

describe("l'elenco di cosa comprende un valore", () => {
  it("un elenco incollato diventa voci pulite, senza doppioni scritti in un altro modo", () => {
    expect(dividiVoci("51 Golden Oak\n21 Nussbaum; Effetto legno (noce, rovere)\r\n\n")).toEqual([
      "51 Golden Oak",
      "21 Nussbaum",
      "Effetto legno (noce, rovere)",
    ]);
    expect(pulisciVoci(["  Bianco   RAL 9010 ", "bianco ral 9010", "", 7, "Noce"])).toEqual(["Bianco RAL 9010", "Noce"]);
    expect(vociDi({ opzioni: ["Nussbaum", "nussbaum"] })).toEqual(["Nussbaum"]);
    expect(vociDi({})).toEqual([]);
    expect(vociDi(null)).toEqual([]);
  });

  it("non accetta elenchi che il database rifiuterebbe", () => {
    expect(problemaVoci("Colore Standard", ["51 Golden Oak"])).toBeNull();
    expect(problemaVoci("Colore Standard", ["x".repeat(121)])).toContain("più lunga di 120");
    expect(problemaVoci("Colore Standard", Array.from({ length: 301 }, (_, i) => `RAL ${i}`))).toContain("al massimo 300");
  });
});

describe("la scelta nel preventivo", () => {
  const valori = [{ id: "v-std", opzioni: ["51 Golden Oak", "21 Nussbaum"] }];

  it("distingue la fascia da decidere dal colore scelto e da quello tolto dal listino", () => {
    expect(codificaScelta("v-std", null, valori[0].opzioni)).toBe("v:v-std");
    expect(codificaScelta("v-std", "21 Nussbaum", valori[0].opzioni)).toBe("o:v-std:1");
    expect(codificaScelta("v-std", "25 Mooreiche", valori[0].opzioni)).toBe("x:v-std");
    // Un valore rimasto senza elenco: la voce si legge solo a tendina chiusa.
    expect(codificaScelta("v-std", "25 Mooreiche", [])).toBe("v:v-std");

    expect(decodificaScelta("o:v-std:0", valori)).toEqual({ valoreId: "v-std", scelta: "51 Golden Oak" });
    expect(decodificaScelta("v:v-std", valori)).toEqual({ valoreId: "v-std", scelta: null });
    expect(decodificaScelta("x:v-std", valori)).toBeNull();
    expect(decodificaScelta("o:v-altro:0", valori)).toBeNull();
  });

  it("scrive la voce sulla riga o la toglie, senza toccare le altre varianti", () => {
    expect(scelteDopo({ colore: "21 Nussbaum", tipologia_vetro: "44.2" }, "colore", null)).toEqual({ tipologia_vetro: "44.2" });
    expect(scelteDopo(null, "colore", "51 Golden Oak")).toEqual({ colore: "51 Golden Oak" });
  });

  it("scrive la scelta come la legge il cliente", () => {
    expect(testoScelta("Colore Standard", "51 Golden Oak")).toBe("51 Golden Oak · Colore Standard");
    // Le voci hanno già il nome italiano tra parentesi: niente parentesi dentro parentesi.
    expect(testoScelta("Colore Standard", "21 - Nussbaum (noce)")).toBe("21 - Nussbaum (noce) · Colore Standard");
    expect(testoScelta("Bianco", "Bianco RAL 9010")).toBe("Bianco RAL 9010");
    expect(testoScelta("Colore Standard", null)).toBe("Colore Standard");
    expect(testoScelta("Colore Standard", "  ")).toBe("Colore Standard");
  });
});

describe("le parole e i suggerimenti del listino", () => {
  it("parla di colori, vetri o voci secondo la variante", () => {
    expect(paroleVoci({ codice: "colore", nome: "Colore" })).toEqual({ una: "un colore", singolare: "colore", tante: "colori" });
    expect(paroleVoci({ codice: "tipologia_vetro", nome: "Tipologia Vetro" }).tante).toBe("vetri");
    expect(paroleVoci({ codice: "rete", nome: "Rete" }).tante).toBe("voci");
  });

  it("suggerisce i colori e i vetri più comuni, e i colori già scritti nel listino", () => {
    expect(suggerimentiVoci({ codice: "colore_profilo", nome: "Colore profilo" })).toContain("Grigio antracite RAL 7016");
    expect(suggerimentiVoci({ codice: "tipologia_vetro", nome: "Tipologia Vetro" })).toContain("Stratificato acustico 44.2");
    expect(suggerimentiVoci({ codice: "avvolgimento", nome: "Avvolgimento" })).toEqual([]);
    expect(
      coloriDelListino([
        {
          codice: "colore",
          nome: "Colore",
          values: [
            // «Bianco» non ha un elenco: è già un colore.
            { attivo: true, label: "Bianco" },
            { attivo: true, label: "Colore Standard", opzioni: ["21 Nussbaum"] },
            { attivo: false, label: "Fuori listino", opzioni: ["Rosso"] },
          ],
        },
        { codice: "tipologia_vetro", nome: "Tipologia Vetro", values: [{ attivo: true, opzioni: ["44.2"] }] },
      ]),
    ).toEqual(["Bianco", "21 Nussbaum"]);
  });

  it("colore interno ed esterno: i colori del listino divisi per fascia, come nella tendina «Colore»", () => {
    expect(
      gruppiColori([
        {
          codice: "colore",
          nome: "Colore",
          values: [
            { attivo: true, label: "Bianco" },
            { attivo: true, label: "Colore Standard", opzioni: ["51 - Golden Oak", "21 - Nussbaum (noce)"] },
            // Lo stesso colore scritto in un altro modo non si ripete nella fascia dopo.
            { attivo: true, label: "Colore Fuori Standard", opzioni: ["97 - mattGrey", "51 - golden oak"] },
            { attivo: false, label: "Fuori listino", opzioni: ["Rosso"] },
          ],
        },
        { codice: "tipologia_vetro", nome: "Tipologia Vetro", values: [{ attivo: true, opzioni: ["44.2"] }] },
      ]),
    ).toEqual([
      { titolo: "Colore", voci: ["Bianco"] },
      { titolo: "Colore Standard", voci: ["51 - Golden Oak", "21 - Nussbaum (noce)"] },
      { titolo: "Colore Fuori Standard", voci: ["97 - mattGrey"] },
    ]);
  });
});
