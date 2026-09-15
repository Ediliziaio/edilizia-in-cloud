import { describe, expect, it } from "vitest";
import {
  etichettaRichiestaRipetuta,
  richiestaRipetutaPresente,
  testoRichiestaRipetuta,
  type RichiestaRipetuta,
} from "@/lib/opportunita/richiestaRipetuta";

describe("Contatto che ha già fatto richiesta", () => {
  it("nessun segno per un contatto nuovo", () => {
    expect(richiestaRipetutaPresente(null)).toBe(false);
    expect(richiestaRipetutaPresente({ richieste: 0, altre_opportunita: 0 })).toBe(false);
    expect(etichettaRichiestaRipetuta(undefined)).toBeNull();
    expect(testoRichiestaRipetuta({})).toBeNull();
  });

  it("ha compilato di nuovo il modulo una volta", () => {
    const r: RichiestaRipetuta = { richieste: 1, ultima: "2026-09-15T14:15:49Z", altre_opportunita: 0 };
    expect(etichettaRichiestaRipetuta(r)).toBe("Di nuovo");
    expect(testoRichiestaRipetuta(r)).toBe(
      "Ha già fatto richiesta: ha compilato di nuovo il modulo 1 volta, l'ultima il 15/09/2026, 16:15.",
    );
  });

  it("più volte e con altre opportunità", () => {
    const r: RichiestaRipetuta = { richieste: 3, ultima: null, altre_opportunita: 2 };
    expect(etichettaRichiestaRipetuta(r)).toBe("3× di nuovo");
    expect(testoRichiestaRipetuta(r)).toBe(
      "Ha già fatto richiesta: ha compilato di nuovo il modulo 3 volte. Ha altre 2 opportunità.",
    );
  });

  it("nessun modulo ripetuto ma un'altra opportunità: già passato", () => {
    const r: RichiestaRipetuta = { richieste: 0, altre_opportunita: 1 };
    expect(etichettaRichiestaRipetuta(r)).toBe("Già passato");
    expect(testoRichiestaRipetuta(r)).toBe("Contatto già passato: ha un'altra opportunità.");
  });
});
