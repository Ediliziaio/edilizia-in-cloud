import { describe, expect, it } from "vitest";
import { riferimentiSistema } from "@/components/serramenti/InfograficaSistemaPdf";

describe("Richiami dell'infografica del serramento", () => {
  it("segue l'ordine effettivo dei contenuti senza scambiare i componenti", () => {
    expect(riferimentiSistema([{ titolo: "Vetro" }, { titolo: "Posa" }, { titolo: "Profilo" }, { titolo: "Ferramenta" }])).toEqual([3, 1, 4, 2]);
  });
  it("non aggiunge uno schema a contenuti estranei o incompleti", () => {
    expect(riferimentiSistema([{ titolo: "Prodotto" }, { titolo: "Vetro" }])).toBeNull();
    expect(riferimentiSistema([{ titolo: "Profilo e vetro" }, { titolo: "Ferramenta" }, { titolo: "Posa" }])).toBeNull();
  });
});
