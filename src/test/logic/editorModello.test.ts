import { describe, expect, it } from "vitest";
import { leggiMostraSe, limitiNumero, operatorePer, rigaDiPartenza, scriviMostraSe, segnapostoSconosciuti } from "@/lib/surveys/editorModello";
import type { ElementTypeDefinition, FieldDefinition } from "@/types/surveys";

const tipo = {
  key: "infisso", label: "Infisso", label_plural: "Infissi", required_photos: [],
  sections: [{ key: "s", label: "S", fields: [
    { key: "tipologia", label: "T", type: "select", options: [] },
    { key: "larghezza_foro", label: "L", type: "dimension", unit: "cm" },
    { key: "altezza_foro", label: "H", type: "dimension", unit: "cm" },
  ] }],
} as unknown as ElementTypeDefinition;

describe("editor dei modelli", () => {
  it("la condizione semplice si legge e si riscrive uguale; quelle complesse si lasciano stare", () => {
    const f = { key: "lati", label: "L", type: "multiselect", show_if: { field: "complementi", operator: "contains", value: "tapparella" } } as FieldDefinition;
    const m = leggiMostraSe(f);
    expect(m).toEqual({ campo: "complementi", operatore: "contains", valore: "tapparella" });
    expect(scriviMostraSe(m as never)).toEqual(f.show_if);
    expect(leggiMostraSe({ ...f, show_if: { field: "x", operator: "in", value: ["a", "b"] } })).toBe("complessa");
    expect(leggiMostraSe({ ...f, show_if: [{ field: "x", operator: "truthy" }] })).toBe("complessa");
    expect(scriviMostraSe({ campo: "x", operatore: "eq", valore: "" })).toBeUndefined();
    expect(scriviMostraSe({ campo: "bagno", operatore: "truthy", valore: "" })).toEqual({ field: "bagno", operator: "truthy" });
  });
  it("l'operatore segue il campo che comanda", () => {
    expect(operatorePer({ key: "a", label: "a", type: "boolean" })).toBe("truthy");
    expect(operatorePer({ key: "a", label: "a", type: "multiselect" })).toBe("contains");
    expect(operatorePer({ key: "a", label: "a", type: "select" })).toBe("eq");
  });
  it("minimo e massimo: vuoti, virgola italiana, massimo sotto il minimo", () => {
    expect(limitiNumero("", "")).toEqual({ min: undefined, max: undefined });
    expect(limitiNumero("10", "2,5")).toEqual({ errore: "Il massimo è sotto il minimo" });
    expect(limitiNumero("0,5", "300")).toEqual({ min: 0.5, max: 300 });
    expect(limitiNumero("abc", "")).toEqual({ errore: "Scrivi un numero" });
  });
  it("riga del preventivo: proposta di partenza e segnaposto che non esistono", () => {
    expect(rigaDiPartenza(tipo).description_template).toBe("Infisso {tipologia} {larghezza_foro}x{altezza_foro} cm");
    expect(segnapostoSconosciuti("Infisso {tipologia} {colore} {larghezza_foro}", tipo)).toEqual(["colore"]);
  });
});
