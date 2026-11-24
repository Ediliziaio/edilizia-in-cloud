import { describe, expect, it } from "vitest";
import { presenzeDaVoce } from "@/lib/campo/presenzeDaVoce";

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
