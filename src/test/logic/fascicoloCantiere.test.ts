import { describe, expect, it } from "vitest";
import {
  errorePeriodo,
  nelPeriodo,
  statoIncarico,
  evidenzaPertinente,
  esitoEvidenza,
} from "@/lib/sicurezza/fascicolo";
describe("Fascicolo cantiere: periodi e pertinenza", () => {
  it("include il giorno iniziale e finale, esclude futuro e cessato", () => {
    expect(nelPeriodo("2026-10-01", "2026-10-26", "2026-10-26")).toBe(true);
    expect(nelPeriodo("2026-10-26", null, "2026-10-26")).toBe(true);
    expect(nelPeriodo("2026-10-27", null, "2026-10-26")).toBe(false);
    expect(nelPeriodo("2026-10-01", "2026-10-25", "2026-10-26")).toBe(false);
  });
  it.each(["", "2026-02-30", "2026-13-01", "2026-2-01"])(
    "rifiuta una data iniziale impossibile: %s",
    (dal) => expect(errorePeriodo(dal)).not.toBeNull(),
  );
  it("valida anche il termine e gli anni bisestili", () => {
    expect(errorePeriodo("2024-02-29", "2024-02-29")).toBeNull();
    expect(errorePeriodo("2026-10-26", "2026-02-30")).not.toBeNull();
    expect(errorePeriodo("2026-10-26", "2026-10-25")).not.toBeNull();
  });
  it("non scambia una proposta per incarico documentato", () => {
    expect(
      statoIncarico(
        { dal: "2026-01-01", al: null, stato: "proposto" },
        "2026-10-26",
      ),
    ).toBe("Nomina da verificare");
    expect(
      statoIncarico(
        { dal: "2026-01-01", al: null, stato: "documentato" },
        "2026-10-26",
      ),
    ).toBe("Incarico documentato");
    expect(
      statoIncarico(
        { dal: "2026-11-01", al: null, stato: "documentato" },
        "2026-10-26",
      ),
    ).toBe("Futuro");
    expect(
      statoIncarico(
        { dal: "2026-01-01", al: "2026-10-25", stato: "documentato" },
        "2026-10-26",
      ),
    ).toBe("Cessato");
  });
  it("non ricicla un POS aziendale o di un altro cantiere", () => {
    expect(
      evidenzaPertinente(
        { tipo: "pos", order_id: null, operaio_id: null },
        "c1",
      ),
    ).toBe(false);
    expect(
      evidenzaPertinente(
        { tipo: "pos", order_id: "c2", operaio_id: null },
        "c1",
      ),
    ).toBe(false);
    expect(
      evidenzaPertinente(
        { tipo: "pos", order_id: "c1", operaio_id: null },
        "c1",
      ),
    ).toBe(true);
    expect(
      evidenzaPertinente(
        { tipo: "durc", order_id: null, operaio_id: null },
        "c1",
      ),
    ).toBe(true);
  });
  it("include documenti personali solo per gli ID degli addetti assegnati", () => {
    const e = { tipo: "formazione", order_id: null, operaio_id: "o1" };
    expect(evidenzaPertinente(e, "c1", [])).toBe(false);
    expect(evidenzaPertinente(e, "c1", ["omonimo"])).toBe(false);
    expect(evidenzaPertinente(e, "c1", ["o1"])).toBe(true);
  });
  it("una verifica non nasconde una scadenza superata", () => {
    expect(
      esitoEvidenza(
        { stato: "verificato", data_scadenza: "2026-10-25" },
        "2026-10-26",
      ),
    ).toBe("Scaduto");
    expect(
      esitoEvidenza(
        { stato: "verificato", data_scadenza: "2026-10-26" },
        "2026-10-26",
      ),
    ).toBe("Verificato");
    expect(
      esitoEvidenza(
        { stato: "superato", data_scadenza: "2026-10-25" },
        "2026-10-26",
      ),
    ).toBe("Superato");
  });
});
