import { describe, expect, it } from "vitest";
import { unitaDalNome } from "@/components/warehouse/AssegnaUnitaDialog";

describe("unità proposta dal nome dell'articolo", () => {
  it("legge l'unità dopo l'ultimo trattino", () => {
    expect(unitaDalNome("Cassonetto coibentato 165mm - ml")).toBe("ml");
    expect(unitaDalNome("Cerniera euro finestra PVC - set")).toBe("set");
    expect(unitaDalNome("Zanzariera plissé verticale - kit")).toBe("kit");
    expect(unitaDalNome("Profilo PVC bianco 70mm - barra 6mt")).toBe("barra");
    expect(unitaDalNome("Massetto - mq")).toBe("m²");
  });
  it("non propone niente se il nome non finisce con un'unità nota", () => {
    expect(unitaDalNome("Vetro camera 4/16/4 basso emissivo")).toBeNull();
    expect(unitaDalNome("Silicone neutro sigillante - cartuccia 310ml")).toBeNull();
    expect(unitaDalNome("Pannelli")).toBeNull();
  });
});
