import { describe, expect, it } from "vitest";
import { clausoleDaRegistro, conClausoleDelDocumento, segnaClausoleDelDocumento } from "@/lib/fea/clausoleDelDocumento";

describe("clausole del documento", () => {
  it("raccoglie quelle stampate dal PDF generato per la firma", async () => {
    const { risultato, clausole } = await conClausoleDelDocumento(async () => {
      segnaClausoleDelDocumento(["Penali", " Foro competente "]);
      return "pdf";
    });
    expect(risultato).toBe("pdf");
    expect(clausole).toEqual([{ id: "doc-1", testo: "Penali" }, { id: "doc-2", testo: "Foro competente" }]);
  });
  it("documento senza riquadro: elenco vuoto (niente da approvare)", async () => {
    const { clausole } = await conClausoleDelDocumento(async () => { segnaClausoleDelDocumento([]); });
    expect(clausole).toEqual([]);
  });
  it("niente registrato o due documenti diversi: null, vale la regola di prima", async () => {
    expect((await conClausoleDelDocumento(async () => 1)).clausole).toBeNull();
    expect(clausoleDaRegistro([["a"], ["b"]])).toBeNull();
    expect(clausoleDaRegistro([["a"], ["a"]])).toEqual([{ id: "doc-1", testo: "a" }]);
  });
  it("fuori dalla raccolta non registra", async () => {
    segnaClausoleDelDocumento(["fuori"]);
    expect((await conClausoleDelDocumento(async () => 1)).clausole).toBeNull();
  });
});
