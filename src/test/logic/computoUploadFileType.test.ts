import { describe, expect, it } from "vitest";
import { computoFileType } from "@/lib/computo/uploadFileType";

describe("computo file format", () => {
  it.each([
    ["COMPUTO.XLSX", "", "xlsx"], ["computo.xls", "application/octet-stream", "xls"],
    ["computo.dcf", "", "xpwe"], ["computo.xml", "", "xpwe"],
    ["foto.JPG", "", "image"], ["computo.pdf", "", "pdf"],
    ["download", "application/pdf", "pdf"],
  ])("recognizes %s", (name, type, expected) => {
    expect(computoFileType({ name, type })).toBe(expected);
  });
  it("rejects unsupported files instead of treating them as PDF", () => {
    expect(() => computoFileType({ name: "archivio.zip", type: "" })).toThrow("Formato non supportato");
  });
});
