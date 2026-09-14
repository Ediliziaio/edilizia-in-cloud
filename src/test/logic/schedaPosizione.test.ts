import { describe, expect, it } from "vitest";
import { schedaPosizione, scelteDaAssi, titoloConLinea, type VarianteScelta } from "@/lib/serramenti/schedaPosizione";

// Cosa si legge di una finestra nel preventivo. Il titolare l'ha chiesto così:
// «F2A - Salamander 76, colore interno bianco, colore esterno noce, doppio vetro
// stratificato, profilo a L, indice di trasmittanza < 1,3».

describe("la scheda di una posizione nel preventivo", () => {
  it("mette la linea nel titolo e scrive colori, vetro, telaio e trasmittanza", () => {
    expect(
      schedaPosizione([
        { codice: "linea", nomeAsse: "Linea", valore: "PVC Salamander 76" },
        { codice: "colore", nomeAsse: "Colore", valore: "Colore Standard", voce: "21 - Nussbaum (noce)", diSerie: "Bianco" },
        { codice: "tipologia_vetro", nomeAsse: "Tipologia Vetro", valore: "Vetro Antisfondamento" },
        {
          codice: "vetrocamera",
          nomeAsse: "Vetrocamera",
          valore: "Doppio vetro",
          descrizione: "Trasmittanza termica Uw ≤ 1,3 W/m²K",
        },
        { codice: "telaio", nomeAsse: "Telaio", valore: "Telaio a L" },
      ]),
    ).toEqual({
      linea: "PVC Salamander 76",
      coloreInterno: "21 - Nussbaum (noce)",
      coloreEsterno: "21 - Nussbaum (noce)",
      vetro: "Doppio vetro, antisfondamento",
      telaio: "Telaio a L",
      datiTecnici: ["Trasmittanza termica Uw ≤ 1,3 W/m²K"],
      altre: [],
    });
  });

  it("con la pellicola su un lato l'interno resta di serie, e i colori scritti a mano vincono", () => {
    const pellicola: VarianteScelta = {
      codice: "colore",
      nomeAsse: "Colore",
      valore: "pellicola solo un lato",
      voce: "51 - Golden Oak (rovere dorato)",
      diSerie: "Bianco",
    };
    expect(schedaPosizione([pellicola])).toMatchObject({ coloreInterno: "Bianco", coloreEsterno: "51 - Golden Oak (rovere dorato)" });
    expect(schedaPosizione([pellicola], { coloreInterno: "Crema RAL 9001" })).toMatchObject({
      coloreInterno: "Crema RAL 9001",
      coloreEsterno: "51 - Golden Oak (rovere dorato)",
    });
    // Un decoro fatto per un lato solo, anche dentro la fascia standard.
    const unLato: VarianteScelta = {
      codice: "colore",
      nomeAsse: "Colore",
      valore: "Colore Standard",
      voce: "88 - Anthrazitgrau / Satin (grigio antracite satinato, solo un lato)",
      diSerie: "Bianco",
    };
    expect(schedaPosizione([unLato]).coloreInterno).toBe("Bianco");
    expect(schedaPosizione([{ codice: "colore", nomeAsse: "Colore", valore: "Bianco", diSerie: "Bianco" }])).toMatchObject({
      coloreInterno: "Bianco",
      coloreEsterno: "Bianco",
    });
    expect(schedaPosizione([])).toMatchObject({ coloreInterno: null, coloreEsterno: null, vetro: null, linea: null });
    // La fascia senza il colore scelto dall'elenco: si legge che è da scegliere.
    expect(schedaPosizione([{ codice: "colore", nomeAsse: "Colore", valore: "Colore Standard", conElenco: true }])).toMatchObject({
      coloreInterno: "Colore Standard (da scegliere)",
      coloreEsterno: "Colore Standard (da scegliere)",
    });
  });

  it("mette la linea accanto al nome del prodotto, senza ripeterla", () => {
    expect(titoloConLinea("Finestra 2 Ante", "PVC Salamander 76")).toBe("Finestra 2 Ante — PVC Salamander 76");
    expect(titoloConLinea("Finestra PVC Salamander 76", "PVC Salamander 76")).toBe("Finestra PVC Salamander 76");
    expect(titoloConLinea("Finestra 2 Ante", null)).toBe("Finestra 2 Ante");
  });

  it("il vetro standard non si ripete, il telaio porta l'aletta, il resto resta variante e valore", () => {
    expect(
      schedaPosizione([
        { codice: "vetrocamera", nomeAsse: "Vetrocamera", valore: "Triplo vetro" },
        { codice: "tipologia_vetro", nomeAsse: "Tipologia Vetro", valore: "Vetro Standard" },
      ]).vetro,
    ).toBe("Triplo vetro");
    expect(schedaPosizione([{ codice: "tipologia_vetro", nomeAsse: "Tipologia Vetro", valore: "Vetro Standard" }]).vetro).toBe(
      "Vetro Standard",
    );
    expect(schedaPosizione([], { vetro: "Basso emissivo 4/16/4" }).vetro).toBe("Basso emissivo 4/16/4");
    // La composizione scritta a mano si aggiunge alla variante; se la dice già, basta lei.
    const doppio: VarianteScelta = { codice: "vetrocamera", nomeAsse: "Vetrocamera", valore: "Doppio vetro" };
    expect(schedaPosizione([doppio], { vetro: "33.1/16/4 basso emissivo" }).vetro).toBe("Doppio vetro · 33.1/16/4 basso emissivo");
    expect(schedaPosizione([doppio], { vetro: "Doppio vetro 4/16/4" }).vetro).toBe("Doppio vetro 4/16/4");

    const scheda = schedaPosizione([
      { codice: "telaio", nomeAsse: "Telaio", valore: "Telaio a Z", voce: "Aletta 60 mm Salamander" },
      { codice: "maniglia", nomeAsse: "Maniglia", valore: "Con chiave" },
      { codice: "avvolgimento", nomeAsse: "Avvolgimento", valore: "Motorizzato", voce: "Radiocomando" },
    ]);
    expect(scheda.telaio).toBe("Telaio a Z, aletta 60 mm Salamander");
    expect(scheda.altre).toEqual([
      { label: "Maniglia", value: "Con chiave" },
      { label: "Avvolgimento", value: "Radiocomando · Motorizzato" },
    ]);
  });

  it("legge le scelte della riga dagli assi del prodotto", () => {
    const assi: Parameters<typeof scelteDaAssi>[0] = [
      {
        codice: "colore",
        nome: "Colore",
        values: [
          { id: "b", label: "Bianco", valore: "bianco", is_default: true },
          { id: "s", label: "Colore Standard", valore: "colore_standard", descrizione: null, opzioni: ["21 - Nussbaum (noce)"] },
        ],
      },
      { codice: "telaio", nome: "Telaio", values: [{ id: "l", label: "Telaio a L", valore: "telaio_a_l" }] },
    ];
    expect(scelteDaAssi(assi, { colore: "s", telaio: "tolto-dal-listino" }, { colore: "21 - Nussbaum (noce)" })).toEqual([
      {
        codice: "colore",
        nomeAsse: "Colore",
        valore: "Colore Standard",
        voce: "21 - Nussbaum (noce)",
        descrizione: null,
        diSerie: "Bianco",
        conElenco: true,
      },
    ]);
  });
});
