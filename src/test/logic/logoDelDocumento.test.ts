/**
 * Quale logo finisce sul PDF.
 *
 * Il 29/10/2026 Renova Solution vedeva le anteprime dei preventivi SENZA
 * logo, pur avendolo caricato in Impostazioni → Profilo aziendale: il modello
 * PDF non aveva un logo suo e nessuno ricadeva su quello dell'azienda. La
 * catena era scritta in tre posti con tre ordini diversi; adesso è una sola.
 */
import { describe, it, expect } from "vitest";
import { logoDelDocumento, logoDellaCopertina } from "@/lib/pdf/logoDelDocumento";

describe("logoDelDocumento", () => {
  it("il modello vince, perché è una scelta esplicita per quel documento", () => {
    expect(logoDelDocumento({ logoModello: "modello.png", logoAzienda: "azienda.png" }))
      .toBe("modello.png");
  });

  it("senza logo sul modello usa quello dell'azienda: è il caso di Renova", () => {
    expect(logoDelDocumento({ logoModello: null, logoAzienda: "azienda.png" }))
      .toBe("azienda.png");
  });

  it("una stringa vuota o di spazi non è un logo", () => {
    expect(logoDelDocumento({ logoModello: "", logoAzienda: "azienda.png" })).toBe("azienda.png");
    expect(logoDelDocumento({ logoModello: "   ", logoAzienda: "azienda.png" })).toBe("azienda.png");
  });

  it("se non c'è niente torna null, non una stringa vuota che diventa un'immagine rotta", () => {
    expect(logoDelDocumento({})).toBeNull();
    expect(logoDelDocumento({ logoModello: null, logoAzienda: undefined })).toBeNull();
  });
});

describe("logoDellaCopertina", () => {
  it("il logo scelto per la copertina viene prima di tutto", () => {
    expect(logoDellaCopertina({
      logoCopertinaModello: "cover.png",
      logoChiaroAzienda: "chiaro.png",
      logoModello: "modello.png",
      logoAzienda: "azienda.png",
    })).toBe("cover.png");
  });

  it("senza quello, la versione chiara: la copertina è su fondo scuro", () => {
    expect(logoDellaCopertina({
      logoChiaroAzienda: "chiaro.png",
      logoModello: "modello.png",
      logoAzienda: "azienda.png",
    })).toBe("chiaro.png");
  });

  it("poi la catena normale, fino al logo dell'azienda", () => {
    expect(logoDellaCopertina({ logoModello: "modello.png", logoAzienda: "azienda.png" }))
      .toBe("modello.png");
    expect(logoDellaCopertina({ logoAzienda: "azienda.png" })).toBe("azienda.png");
  });

  it("niente logo da nessuna parte: null", () => {
    expect(logoDellaCopertina({})).toBeNull();
  });
});
