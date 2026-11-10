import { describe, expect, it } from "vitest";
import {
  improntaDdt,
  parteFileDdt,
} from "../../../supabase/functions/_shared/lettoreDdt";

describe("Documento inviato al lettore DDT", () => {
  it("manda il PDF come file nativo e conserva il nome", () => {
    expect(
      parteFileDdt({
        base64: "JVBERi0=",
        mime: "application/pdf",
        fileName: "Bolla 23.pdf",
      }),
    ).toEqual({
      type: "file",
      file: {
        filename: "Bolla 23.pdf",
        file_data: "data:application/pdf;base64,JVBERi0=",
      },
    });
  });
  it("riconosce un PDF dal nome anche senza MIME", () => {
    expect(
      parteFileDdt({ base64: "JVBERi0=", fileName: "BOLLA.PDF" }).type,
    ).toBe("file");
  });
  it("le fotografie rimangono immagini e vengono lette ad alta risoluzione", () => {
    expect(parteFileDdt({ base64: "foto", mime: "image/jpeg" })).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,foto", detail: "high" },
    });
  });
  it("conserva la compatibilità con un documento fornito tramite URL", () => {
    expect(
      parteFileDdt({
        url: "https://esempio.invalid/bolla.pdf",
        mime: "application/pdf",
      }),
    ).toEqual({
      type: "file",
      file: {
        filename: "documento.pdf",
        file_data: "https://esempio.invalid/bolla.pdf",
      },
    });
    expect(() => parteFileDdt({})).toThrow("Documento DDT mancante");
  });
  it("non confonde due documenti con i primi 4000 caratteri identici", async () => {
    const prefix = "A".repeat(4000);
    const first = await improntaDdt(prefix + "documento-1");
    expect(await improntaDdt(prefix + "documento-2")).not.toBe(first);
    expect(await improntaDdt(prefix + "documento-1")).toBe(first);
  });
});
