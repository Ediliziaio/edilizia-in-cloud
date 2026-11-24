import { describe, expect, it } from "vitest";
import { gruppiTecnici, gruppoTecnico, ordinaPerTecnico } from "@/lib/sopralluoghi/sceltaTecnico";

const persone = [
  { id: "comm", roles: ["salesperson"] },
  { id: "op", roles: ["employee"] },
  { id: "tec-ufficio", roles: ["company_staff"] },
  { id: "sub", roles: ["subcontractor"] },
  { id: "tec-operaio", roles: ["employee"] },
];
const tecnici = new Set(["tec-ufficio", "tec-operaio"]);

describe("chi può fare il sopralluogo", () => {
  it("in cima l'area Tecnico (anche se è un operaio), poi operai e subappaltatori, poi il resto", () => {
    expect(gruppoTecnico(persone[4], tecnici)).toBe("tecnici");
    expect(ordinaPerTecnico(persone, tecnici).map((p) => p.id)).toEqual(["tec-ufficio", "tec-operaio", "op", "sub", "comm"]);
  });
  it("i gruppi vuoti non compaiono", () => {
    expect(gruppiTecnici(persone.slice(0, 2), new Set()).map((g) => g.gruppo)).toEqual(["operai", "altri"]);
  });
});
