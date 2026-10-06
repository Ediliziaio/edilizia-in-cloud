/**
 * «Telaio a Z» scelto dal listino: il disegno cambia davvero.
 *
 * Nei listini veri il valore «Telaio a Z» ha le sue voci («Aletta 35 mm Salamander»,
 * «Aletta 60 mm Salamander»): scelta una voce, il disegno leggeva solo quella, che non
 * dice «Z», e restava il telaio a L. Scelto il solo valore («Da decidere») il telaio era
 * «a Z» ma senza misura, e l'aletta non veniva disegnata. In tutti e due i casi
 * l'utente vedeva il disegno uguale a prima.
 */
import { describe, expect, it } from "vitest";
import { configDaFamiglia, disegnoDaConfig, disegnoDaFamiglia } from "@/lib/serramenti/disegnoDaFamiglia";
import { disegnaSerramento } from "@/lib/serramenti/disegnoSerramento";
import { ALETTA_DI_SERIE_MM, telaioDaEtichetta } from "@/lib/serramenti/telaioSerramento";
import type { FamilyWithAxes } from "@/types/articleFamily";

/** L'asse «Telaio» come lo scrivono i listini di Salamander: L di serie, Z con le due alette. */
const finestra = {
  id: "f",
  disegno_tipologia: "finestra_2_ante",
  axes: [
    {
      codice: "telaio",
      values: [
        { id: "l", valore: "telaio_a_l", label: "Telaio a L", is_default: true, attivo: true },
        { id: "z", valore: "telaio_a_z", label: "Telaio a Z", is_default: false, attivo: true, opzioni: ["Aletta 35 mm Salamander", "Aletta 60 mm Salamander"] },
      ],
    },
  ],
} as unknown as FamilyWithAxes;

/** Da quanto esce l'aletta dal riquadro, in mm, guardando dall'interno o dall'esterno. */
function aletta(selezione: Record<string, string>, voci: Record<string, string> | null, vista: "interna" | "esterna" = "interna"): number {
  const d = disegnoDaFamiglia(finestra, selezione, 1200, 1400, voci);
  if (!d || d.tipo !== "serramento") throw new Error("serramento atteso");
  const disegno = d.viste.find((v) => v.vista === vista)?.disegno;
  if (!disegno) throw new Error("vista attesa");
  return disegnaSerramento(disegno).sporgenza ?? 0;
}

describe("telaio a Z nel disegno", () => {
  it("la voce «Aletta 35 mm Salamander» è un telaio a Z da 35 mm, anche se non dice «Z»", () => {
    expect(telaioDaEtichetta("Aletta 35 mm Salamander")).toEqual({ tipo: "Z", alettaMm: 35 });
    expect(telaioDaEtichetta("Aletta 60 mm Salamander")).toEqual({ tipo: "Z", alettaMm: 60 });
    expect(telaioDaEtichetta("Aletta 40 mm Aluplast")).toEqual({ tipo: "Z", alettaMm: 40 });
    // La misura è quella con l'unità, non il primo numero che capita (la serie del profilo).
    expect(telaioDaEtichetta("Salamander 76, aletta 35 mm")).toEqual({ tipo: "Z", alettaMm: 35 });
    // Quello che c'era prima resta com'era.
    expect(telaioDaEtichetta("Telaio a Z 35")).toEqual({ tipo: "Z", alettaMm: 35 });
    expect(telaioDaEtichetta("Telaio a Z da 4 cm")).toEqual({ tipo: "Z", alettaMm: 40 });
    expect(telaioDaEtichetta("Telaio a Z")).toEqual({ tipo: "Z" });
    expect(telaioDaEtichetta("Z40 (+5%)")).toEqual({ tipo: "Z", alettaMm: 40 });
    expect(telaioDaEtichetta("Telaio a L")).toEqual({ tipo: "L" });
  });

  it("scelta una voce del telaio a Z, la riga congela valore e voce insieme e il disegno la legge", () => {
    const config = configDaFamiglia(finestra, { telaio: "z" }, { voci: { telaio: "Aletta 60 mm Salamander" } });
    expect(telaioDaEtichetta(config?.telaio)).toEqual({ tipo: "Z", alettaMm: 60 });
    expect(config?.telaio).toContain("Telaio a Z");
  });

  it("il disegno da dentro ha l'aletta della misura scelta, da fuori no; a L nemmeno da dentro", () => {
    expect(aletta({ telaio: "z" }, { telaio: "Aletta 35 mm Salamander" })).toBe(35);
    expect(aletta({ telaio: "z" }, { telaio: "Aletta 60 mm Salamander" })).toBe(60);
    expect(aletta({ telaio: "z" }, { telaio: "Aletta 60 mm Salamander" }, "esterna")).toBe(0);
    expect(aletta({ telaio: "l" }, null)).toBe(0);
  });

  it("«Telaio a Z» senza voce («Da decidere») mostra comunque un'aletta di serie, così il disegno cambia", () => {
    expect(aletta({ telaio: "z" }, null)).toBe(ALETTA_DI_SERIE_MM);
    expect(ALETTA_DI_SERIE_MM).toBeGreaterThan(0);
  });

  it("una riga già congelata con la sola voce («Aletta 35 mm Salamander») si disegna a Z anche nel PDF", () => {
    const congelata = { v: 1 as const, tipologia: "finestra_2_ante", telaio: "Aletta 35 mm Salamander" };
    const d = disegnoDaConfig(congelata, 1200, 1400);
    if (!d || d.tipo !== "serramento") throw new Error("serramento atteso");
    expect(disegnaSerramento(d.viste[0].disegno).sporgenza).toBe(35);
  });
});
