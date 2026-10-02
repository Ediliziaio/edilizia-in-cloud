import { describe, expect, it } from "vitest";
import { testoNotaPerRegistro } from "@/lib/appuntamenti/notaInternaNelRegistro";

const base = { titolo: "Sopralluogo", data: "2026-10-05", ora: "10:30:00" };

describe("nota interna dell'appuntamento → Appunti", () => {
  it("una nota nuova va riportata, con titolo, data e ora", () => {
    const t = testoNotaPerRegistro({ ...base, nota: "  Cliente vuole il bagno entro Natale " });
    expect(t).toBe("Nota dall'appuntamento «Sopralluogo» del 05/10/2026 alle 10:30:\nCliente vuole il bagno entro Natale");
  });
  it("vuota o solo spazi: niente da riportare", () => {
    expect(testoNotaPerRegistro({ ...base, nota: "" })).toBeNull();
    expect(testoNotaPerRegistro({ ...base, nota: "   " })).toBeNull();
    expect(testoNotaPerRegistro({ ...base, nota: null })).toBeNull();
  });
  it("non cambiata: non si duplica", () => {
    expect(testoNotaPerRegistro({ ...base, nota: "Portare campioni", notaPrecedente: " Portare campioni " })).toBeNull();
  });
  it("cambiata: si riporta il testo nuovo", () => {
    expect(testoNotaPerRegistro({ ...base, nota: "Portare campioni e listino", notaPrecedente: "Portare campioni" })).toContain("Portare campioni e listino");
  });
  it("senza titolo usa «Appuntamento»", () => {
    expect(testoNotaPerRegistro({ ...base, titolo: "  ", nota: "x" })).toContain("«Appuntamento»");
  });
});
