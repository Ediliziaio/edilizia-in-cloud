import { describe, expect, it } from "vitest";
import {
  MOTIVI_PERDITA_DEFAULT,
  etichettaMotivo,
  nomeMotivoValido,
  unisciMotivi,
} from "@/lib/opportunita/motiviPerdita";

describe("motivi di perdita", () => {
  it("mette gli standard prima e scarta i doppioni aziendali", () => {
    const motivi = unisciMotivi([
      { id: "a", label: "Misure sbagliate" },
      { id: "b", label: "prezzo troppo alto" },
      { id: "c", label: "misure  sbagliate" },
      { id: "d", label: "altro" },
    ]);
    expect(motivi.slice(0, 7)).toEqual(MOTIVI_PERDITA_DEFAULT);
    expect(motivi.slice(7).map((m) => m.label)).toEqual(["Misure sbagliate"]);
    expect(motivi[7]).toMatchObject({ id: "a", value: "Misure sbagliate", predefinito: false });
  });

  it("valida il nome: vuoto, doppione, standard", () => {
    const motivi = unisciMotivi([{ id: "a", label: "Misure sbagliate" }]);
    expect(() => nomeMotivoValido("   ", motivi)).toThrow(/Scrivi/);
    expect(() => nomeMotivoValido("MISURE sbagliate", motivi)).toThrow(/Misure sbagliate/);
    expect(() => nomeMotivoValido("Timing non giusto", motivi)).toThrow(/già/);
    expect(nomeMotivoValido("  Condominio   non delibera ", motivi)).toBe("Condominio non delibera");
  });

  it("rinominare lo stesso motivo non è un doppione", () => {
    const motivi = unisciMotivi([{ id: "a", label: "Misure sbagliate" }]);
    expect(nomeMotivoValido("misure Sbagliate", motivi, "a")).toBe("misure Sbagliate");
    expect(() => nomeMotivoValido("Altro", motivi, "a")).toThrow(/già/);
  });

  it("mostra il testo salvato anche se il motivo è stato tolto", () => {
    expect(etichettaMotivo("prezzo", MOTIVI_PERDITA_DEFAULT)).toBe("Prezzo troppo alto");
    expect(etichettaMotivo("Vecchio motivo", MOTIVI_PERDITA_DEFAULT)).toBe("Vecchio motivo");
    expect(etichettaMotivo(null, MOTIVI_PERDITA_DEFAULT)).toBe("");
  });
});
