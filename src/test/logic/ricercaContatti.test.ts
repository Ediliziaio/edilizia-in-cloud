import { describe, expect, it } from "vitest";
import { cifreTelefono, filtriRicercaContatti, paroleRicerca } from "@/lib/ricerca/ricercaContatti";

describe("Ricerca contatti in alto a destra", () => {
  it("nome e cognome insieme diventano due condizioni, una per parola", () => {
    const filtri = filtriRicercaContatti("Lia Logar");
    expect(filtri).toHaveLength(2);
    expect(filtri[0]).toBe("first_name.ilike.%Lia%,last_name.ilike.%Lia%,email.ilike.%Lia%,phone.ilike.%Lia%");
    expect(filtri[1]).toContain("last_name.ilike.%Logar%");
  });

  it("un numero si cerca nel telefono, senza spazi né prefisso", () => {
    expect(cifreTelefono("+39 347 984 5700")).toBe("3479845700");
    expect(cifreTelefono("00393479845700")).toBe("3479845700");
    expect(cifreTelefono("347-9845700")).toBe("3479845700");
    expect(cifreTelefono("3479845700")).toBe("3479845700");
    expect(filtriRicercaContatti("+393479845700")).toEqual(["phone.ilike.%3479845700%"]);
  });

  it("un nome non è un numero di telefono", () => {
    expect(cifreTelefono("Rocco")).toBeNull();
    expect(cifreTelefono("12345")).toBeNull();
  });

  it("i caratteri che rompono la ricerca si tolgono, i jolly diventano lettere", () => {
    expect(paroleRicerca("Rossi, (Mario)")).toEqual(["Rossi", "Mario"]);
    expect(paroleRicerca("50%")).toEqual(["50\\%"]);
    expect(paroleRicerca("   ")).toEqual([]);
    expect(filtriRicercaContatti(",,,")).toEqual([]);
  });
});
