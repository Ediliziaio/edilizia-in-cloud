import { describe, expect, it } from "vitest";
import { formeTelefono, telefonoInternazionale } from "@/lib/contactUtils";
import { campiObbligatoriMancanti, nomeCampoObbligatorio, type ImportField } from "@/components/shared/CSVImportDialog";

describe("telefono importato con il prefisso internazionale", () => {
  it.each([
    ["333 123 4567", "+393331234567"],
    ["333-123.4567", "+393331234567"],
    ["0039 333 1234567", "+393331234567"],
    ["393331234567", "+393331234567"],
    ["+39 333 1234567", "+393331234567"],
    ["02 1234567", "+39021234567"],
    ["+41 79 123 45 67", "+41791234567"],
  ])("«%s» diventa %s", (grezzo, atteso) => {
    expect(telefonoInternazionale(grezzo)).toBe(atteso);
  });

  it("un numero che non si riconosce resta com'è, solo ripulito", () => {
    expect(telefonoInternazionale("12 34")).toBe("1234");
    expect(telefonoInternazionale("int. 21")).toBe("int21");
  });

  it("ritrova lo stesso numero salvato con o senza prefisso", () => {
    expect(formeTelefono("333 123 4567")).toEqual(expect.arrayContaining(["+393331234567", "393331234567", "3331234567", "00393331234567"]));
  });
});

describe("campi obbligatori con alternativa", () => {
  const campi: ImportField[] = [
    { key: "first_name", label: "Nome", required: true, oppure: ["fullname"] },
    { key: "fullname", label: "Nome Completo", required: false },
    { key: "phone", label: "Telefono", required: false },
  ];
  it("«Nome completo» basta al posto di «Nome»", () => {
    expect(campiObbligatoriMancanti(campi, { nome_e_cognome: "fullname" })).toEqual([]);
    expect(campiObbligatoriMancanti(campi, { nome: "first_name" })).toEqual([]);
  });
  it("senza nessuno dei due lo dice, con l'alternativa", () => {
    const mancanti = campiObbligatoriMancanti(campi, { tel: "phone" });
    expect(mancanti.map((f) => f.key)).toEqual(["first_name"]);
    expect(nomeCampoObbligatorio(mancanti[0], campi)).toBe("Nome (oppure Nome Completo)");
  });
});
