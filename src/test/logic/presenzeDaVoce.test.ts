import { describe, expect, it } from "vitest";
import { chiParlaCera, presenzeDaVoce } from "@/lib/campo/presenzeDaVoce";

const squadra = [
  { key: "a", nome: "Davide DEMO Villa" },
  { key: "b", nome: "Matteo DEMO Rossi" },
  { key: "c", nome: "Marco Verdi" },
  { key: "d", nome: "Marco Operaio" },
  { key: "e", nome: "Nicolò Fonti" },
];

describe("Presenze dette a voce", () => {
  it("segna chi è nominato col nome o il cognome", () => {
    expect(presenzeDaVoce(["Davide", "Rossi"], squadra).sort()).toEqual(["a", "b"]);
    expect(presenzeDaVoce(["nicolo"], squadra)).toEqual(["e"]);
  });

  it("un nome che hanno in due non segna nessuno, nome e cognome sì", () => {
    expect(presenzeDaVoce(["Marco"], squadra)).toEqual([]);
    expect(presenzeDaVoce(["Marco Verdi"], squadra)).toEqual(["c"]);
  });

  it("chi non è nella squadra di oggi non viene inventato", () => {
    expect(presenzeDaVoce(["Giuseppe", "il geometra", ""], squadra)).toEqual([]);
  });
});

describe("Chi parla c'era?", () => {
  it("«eravamo io, Davide e Matteo», «anche io», «io» nella lista: sì", () => {
    expect(chiParlaCera(["Davide", "Matteo"], "Oggi eravamo io, Davide e Matteo, otto ore a testa.")).toBe(true);
    expect(chiParlaCera(["io", "Luca"])).toBe(true);
    expect(chiParlaCera([], "C'era anche io col geometra")).toBe(true);
  });
  it("se racconta solo il lavoro degli altri: no", () => {
    expect(chiParlaCera(["Davide"], "Davide ha posato il pavimento")).toBe(false);
  });
});
