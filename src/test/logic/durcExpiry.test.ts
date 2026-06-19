import { describe, it, expect } from "vitest";
import { parseDurcExpiry } from "@/lib/sicurezza/durcExpiry";

// Testo realistico estratto da un DURC On Line INAIL/INPS (cfr. Ba.i.ter SAS).
describe("parseDurcExpiry — DURC On Line", () => {
  it("estrae la 'Scadenza validità'", () => {
    const text =
      "Durc On Line Numero Protocollo INAIL_53175207 Data richiesta 06/03/2026 " +
      "Scadenza validità 04/07/2026 Denominazione/ragione sociale BA.I.TER SAS";
    expect(parseDurcExpiry(text)).toBe("2026-07-04");
  });

  it("fallback: 'Data richiesta' + 120 giorni di validità", () => {
    const text = "Data richiesta 06/03/2026 Il Documento ha validità di 120 giorni dalla data della richiesta";
    expect(parseDurcExpiry(text)).toBe("2026-07-04"); // 06/03 + 120gg = 04/07
  });

  it("ritorna null se non è un DURC (nessuna data riconoscibile)", () => {
    expect(parseDurcExpiry("Visura Ordinaria Società di Capitale - Camera di Commercio")).toBeNull();
    expect(parseDurcExpiry("")).toBeNull();
  });

  it("accetta separatori . o - nella data", () => {
    expect(parseDurcExpiry("Scadenza validità 04-07-2026")).toBe("2026-07-04");
    expect(parseDurcExpiry("Scadenza validità 4.7.2026")).toBe("2026-07-04");
  });
});
