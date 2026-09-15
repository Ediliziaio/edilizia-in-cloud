import { describe, expect, it } from "vitest";
import { puoModificareNota, testoNotaDaSalvare } from "@/lib/marketing/modificaNota";

const venusia = { userId: "venusia", isAdmin: false, puoModificareContatti: true, soloAssegnati: true };

describe("Chi può modificare una nota", () => {
  it("chi vede solo i suoi clienti modifica le sue note e quelle importate", () => {
    expect(puoModificareNota({ created_by: "venusia" }, venusia)).toBe(true);
    expect(puoModificareNota({ created_by: null }, venusia)).toBe(true);
  });

  it("non modifica la nota di un collega", () => {
    expect(puoModificareNota({ created_by: "antonella" }, venusia)).toBe(false);
  });

  it("l'amministratore e chi vede tutti i clienti modificano tutto", () => {
    expect(puoModificareNota({ created_by: "antonella" }, { ...venusia, isAdmin: true })).toBe(true);
    expect(puoModificareNota({ created_by: "antonella" }, { ...venusia, soloAssegnati: false })).toBe(true);
  });

  it("senza il permesso di modificare i contatti non si modifica", () => {
    expect(puoModificareNota({ created_by: "venusia" }, { ...venusia, puoModificareContatti: false })).toBe(false);
  });
});

describe("Testo da salvare", () => {
  it("niente salvataggio se è vuoto o uguale", () => {
    expect(testoNotaDaSalvare("Richiamare", "  ")).toBeNull();
    expect(testoNotaDaSalvare("Richiamare", " Richiamare ")).toBeNull();
    expect(testoNotaDaSalvare("Richiamare", "Richiamare lunedì ")).toBe("Richiamare lunedì");
  });
});
