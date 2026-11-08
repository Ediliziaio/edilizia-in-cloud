import { describe, expect, it } from "vitest";
import { voceSenzaFatturaProposta, vociSenzaFattura } from "@/lib/finance/movimentoSenzaFattura";

describe("movimenti senza fattura", () => {
  it("le spese vere creano un costo, stipendi e F24 no", () => {
    const voce = (e: string) => vociSenzaFattura(true).find((v) => v.etichetta === e)!;
    expect(voce("Multa o sanzione").tipo).toBe("spesa");
    expect(voce("Ricevuta o scontrino").tipo).toBe("spesa");
    expect(voce("Stipendi").tipo).toBe("nessun_costo");
    expect(voce("F24 e tasse").tipo).toBe("nessun_costo");
    expect(voce("Giroconto").tipo).toBe("nessun_costo");
  });
  it("un'entrata senza fattura non crea mai un costo", () => {
    expect(vociSenzaFattura(false).every((v) => v.tipo === "nessun_costo")).toBe(true);
  });
  it("propone la voce dalla categoria del movimento", () => {
    expect(voceSenzaFatturaProposta("Personale", true)?.etichetta).toBe("Stipendi");
    expect(voceSenzaFatturaProposta("Imposte e contributi", true)?.etichetta).toBe("F24 e tasse");
    expect(voceSenzaFatturaProposta("Giroconto", false)?.etichetta).toBe("Giroconto");
    expect(voceSenzaFatturaProposta("Materiali e forniture", true)).toBeNull();
    expect(voceSenzaFatturaProposta(null, true)).toBeNull();
  });
});
