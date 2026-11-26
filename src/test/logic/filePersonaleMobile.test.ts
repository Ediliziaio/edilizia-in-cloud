import { describe, expect, it } from "vitest";
import { DOCUMENTO_MAX_BYTES, preparaFilePersonale } from "@/lib/documenti/filePersonale";

describe("file selezionati sul telefono", () => {
  it.each([['attestato.PDF', 'application/pdf'], ['foto.png', 'image/png'], ['foto.HEIC', 'image/heic'], ['foto.heif', 'image/heif']])(
    "riconosce %s anche quando Android non comunica il MIME", (nome, mime) => {
      const file = preparaFilePersonale(new File(["contenuto"], nome));
      expect(file.type).toBe(mime);
      expect(file.name).toBe(nome);
    },
  );
  it("normalizza il MIME generico restituito dal selettore dei file", () => {
    expect(preparaFilePersonale(new File(["pdf"], "attestato.pdf", { type: "application/octet-stream" })).type).toBe("application/pdf");
  });
  it("mantiene utilizzabili le foto iPhone e assegna un'estensione quando manca", () => {
    expect(preparaFilePersonale(new File(["foto"], "fotocamera", { type: "image/heic" })).name).toBe("fotocamera.heic");
  });
  it("non invia file vuoti, eseguibili o file troppo grandi", () => {
    expect(() => preparaFilePersonale(new File([], "vuoto.pdf"))).toThrow("vuoto");
    expect(() => preparaFilePersonale(new File(["exe"], "eseguibile.exe"))).toThrow("Formato");
    const grande = new File(["pdf"], "troppo-grande.pdf", { type: "application/pdf" });
    Object.defineProperty(grande, "size", { value: DOCUMENTO_MAX_BYTES + 1 });
    expect(() => preparaFilePersonale(grande)).toThrow("15 MB");
  });
  it("ammette i documenti Office solo nel fascicolo che li prevede", () => {
    const docx = new File(["docx"], "durc.docx");
    expect(() => preparaFilePersonale(docx)).toThrow("Formato");
    expect(preparaFilePersonale(docx, true).type).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  });
});
