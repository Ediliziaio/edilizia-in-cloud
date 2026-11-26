/** Piano campo completo 3.1 (26/11/2026): cosa manca alla ditta per entrare in cantiere. */
import { describe, expect, it } from "vitest";
import { statoDocumentiDitta } from "@/lib/campo/documentiDitta";

describe("documenti della ditta per entrare in cantiere", () => {
  it("dice cosa manca, cosa è scaduto e cosa scade entro 30 giorni", () => {
    const stati = statoDocumentiDitta([
      { tipo: "durc", data_scadenza: "2026-12-10" },
      { tipo: "visura", data_scadenza: null },
      { tipo: "polizza_rc", data_scadenza: "2026-11-01" },
    ], "2026-11-26");
    expect(Object.fromEntries(stati.map(s => [s.tipo, s.stato]))).toEqual({
      durc: "in_scadenza", visura: "ok", patente_crediti: "manca", polizza_rc: "scaduto",
    });
  });
  it("di due documenti dello stesso tipo conta quello che scade più tardi", () => {
    const [durc] = statoDocumentiDitta([
      { tipo: "durc", data_scadenza: "2026-10-01" }, { tipo: "durc", data_scadenza: "2027-03-01" },
    ], "2026-11-26");
    expect(durc.stato).toBe("ok");
  });
});
