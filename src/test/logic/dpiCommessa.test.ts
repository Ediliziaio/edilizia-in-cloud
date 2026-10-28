import { describe, it, expect } from "vitest";
import {
  statoConsegnaDpi,
  riepilogoDpi,
  type ConsegnaDpi,
  type QuadroDpi,
} from "@/lib/sicurezza/dpiCommessa";
const dpi = (p: Partial<ConsegnaDpi> = {}): ConsegnaDpi => ({
  id: "d",
  tipo: "casco",
  marca: null,
  matricola: null,
  consegnato_il: "2026-10-01",
  scade_il: null,
  stato: "in_use",
  restituito_il: null,
  modulo_registrato: false,
  ...p,
});
describe("DPI consegnati: stato registrato e data senza certificare l’adeguatezza", () => {
  it("una consegna futura non conta in uso, nemmeno con modulo registrato", () =>
    expect(
      statoConsegnaDpi(
        dpi({ consegnato_il: "2026-11-01", modulo_registrato: true }),
        "2026-10-27",
      ),
    ).toBe("futura"));
  it("la scadenza effettiva prevale sul vecchio flag in uso", () => {
    expect(
      statoConsegnaDpi(dpi({ scade_il: "2026-10-26" }), "2026-10-27"),
    ).toBe("scaduta");
    expect(
      statoConsegnaDpi(dpi({ scade_il: "2026-10-27" }), "2026-10-27"),
    ).toBe("in_uso");
  });
  it("restituzione, danno e smarrimento non tornano in uso retrodatando la vista", () => {
    expect(
      statoConsegnaDpi(
        dpi({ stato: "returned", restituito_il: "2026-10-20" }),
        "2026-10-10",
      ),
    ).toBe("restituita");
    expect(statoConsegnaDpi(dpi({ stato: "damaged" }), "2026-10-27")).toBe(
      "danneggiata",
    );
    expect(statoConsegnaDpi(dpi({ stato: "lost" }), "2026-10-27")).toBe(
      "smarrita",
    );
  });
  it("la data di reso registrata prevale anche su un flag in uso", () =>
    expect(
      statoConsegnaDpi(dpi({ restituito_il: "2026-10-20" }), "2026-10-27"),
    ).toBe("restituita"));
  it("date impossibili, periodi incoerenti e stato ignoto rimangono da controllare", () => {
    for (const p of [
      { scade_il: "2026-02-30" },
      { scade_il: "2026-09-01" },
      { restituito_il: "2026-09-01" },
      { stato: null },
      { stato: "nuovo_stato" },
    ])
      expect(statoConsegnaDpi(dpi(p), "2026-10-27")).toBe("da_controllare");
    expect(statoConsegnaDpi(dpi(), "non-data")).toBe("da_controllare");
  });
  it("nessuna scadenza dichiarata non viene inventata", () =>
    expect(statoConsegnaDpi(dpi(), "2026-10-27")).toBe("in_uso"));
  it("conta persone distinte senza copertura universale da un solo dispositivo", () => {
    const q: QuadroDpi = {
      data: "2026-10-27",
      fase_id: null,
      campo_senza_dipendente: 1,
      addetti: [
        {
          id: "a",
          nome: "Omonimo",
          cognome: "Uno",
          attivo: true,
          qualifica: null,
          assegnazioni: [],
          consegne: [dpi(), dpi({ id: "scaduto", scade_il: "2026-10-26" })],
        },
        {
          id: "b",
          nome: "Omonimo",
          cognome: "Uno",
          attivo: true,
          qualifica: null,
          assegnazioni: [],
          consegne: [dpi({ id: "futuro", consegnato_il: "2026-11-01" })],
        },
        {
          id: "c",
          nome: "Altro",
          cognome: "Due",
          attivo: false,
          qualifica: null,
          assegnazioni: [],
          consegne: [],
        },
      ],
    };
    expect(riepilogoDpi(q)).toEqual({
      addetti: 3,
      senzaConsegne: 2,
      criticita: 1,
      senzaModulo: 1,
    });
  });
});
