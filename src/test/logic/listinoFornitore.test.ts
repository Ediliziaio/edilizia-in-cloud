import { describe, it, expect } from "vitest";
import {
  normalizza, prezzoNetto, trovaVoce, parseImporto, parseVociIncollate,
  type VoceListinoFornitore,
} from "@/lib/listino/listinoFornitore";

const V = (id: string, codice: string | null, descrizione: string, prezzo = 10, sconto = 0): VoceListinoFornitore =>
  ({ id, codice, descrizione, unita: null, prezzo, sconto_pct: sconto });

describe("prezzoNetto", () => {
  it("applica lo sconto della voce e arrotonda", () => {
    expect(prezzoNetto(100, 12.5)).toBe(87.5);
    expect(prezzoNetto(9.99, 33)).toBe(6.69);
  });
  it("sconto zero = prezzo pieno", () => {
    expect(prezzoNetto(42, 0)).toBe(42);
  });
});

describe("trovaVoce — solo match esatti, mai somiglianze", () => {
  const voci = [
    V("a", "TU-100", "Tubo rame 22mm"),
    V("b", "TU-200", "Tubo rame 28mm"),
    V("c", null, "Curva 90 gradi"),
  ];

  it("preferisce il codice quando c'e'", () => {
    expect(trovaVoce(voci, { codice: "tu-100", descrizione: "qualsiasi" })?.id).toBe("a");
  });

  it("senza codice abbina per descrizione esatta, ignorando maiuscole e spazi doppi", () => {
    expect(trovaVoce(voci, { descrizione: "  curva  90 GRADI " })?.id).toBe("c");
  });

  it("una descrizione simile ma non identica NON suggerisce niente", () => {
    expect(trovaVoce(voci, { descrizione: "Tubo rame" })).toBeNull();
  });

  it("descrizioni duplicate nel listino = ambiguita' = nessun suggerimento", () => {
    const doppie = [...voci, V("d", null, "Curva 90 gradi", 99)];
    expect(trovaVoce(doppie, { descrizione: "Curva 90 gradi" })).toBeNull();
  });

  it("codice duplicato = ambiguita', anche se le descrizioni differiscono", () => {
    const doppie = [...voci, V("e", "TU-100", "Altro tubo")];
    expect(trovaVoce(doppie, { codice: "TU-100", descrizione: "x" })).toBeNull();
  });
});

describe("parseImporto — i decimali all'italiana", () => {
  it("legge i formati veri", () => {
    expect(parseImporto("1.234,56")).toBe(1234.56);
    expect(parseImporto("12,5")).toBe(12.5);
    expect(parseImporto("12.5")).toBe(12.5);
    expect(parseImporto("€ 1.200,00")).toBe(1200);
    expect(parseImporto("1,234.56")).toBe(1234.56);
  });
  it("la robaccia diventa NaN, non zero", () => {
    expect(Number.isNaN(parseImporto("n.d."))).toBe(true);
    expect(Number.isNaN(parseImporto(""))).toBe(true);
  });
});

describe("parseVociIncollate — l'incolla da Excel", () => {
  it("legge il tab di Excel con tutte e cinque le colonne", () => {
    const { voci, scartate } = parseVociIncollate(
      "TU-100\tTubo rame 22mm\tm\t8,40\t10\nTU-200\tTubo rame 28mm\tm\t11,20\t10",
    );
    expect(scartate).toHaveLength(0);
    expect(voci).toHaveLength(2);
    expect(voci[0]).toMatchObject({ codice: "TU-100", unita: "m", prezzo: 8.4, sconto_pct: 10 });
  });

  it("legge due sole colonne: descrizione e prezzo", () => {
    const { voci } = parseVociIncollate("Curva 90 gradi;3,20");
    expect(voci[0]).toMatchObject({ codice: null, descrizione: "Curva 90 gradi", prezzo: 3.2 });
  });

  it("salta l'intestazione senza segnalarla come errore", () => {
    const { voci, scartate } = parseVociIncollate("Codice\tDescrizione\tPrezzo\nA1\tSabbia\t5,00");
    expect(voci).toHaveLength(1);
    expect(scartate).toHaveLength(0);
  });

  it("la virgola non spezza mai le colonne: e' il decimale", () => {
    const { voci } = parseVociIncollate("Sabbia fine, lavata\t7,50".replace("\\t", "\t"));
    expect(voci[0].descrizione).toBe("Sabbia fine, lavata");
    expect(voci[0].prezzo).toBe(7.5);
  });

  it("le righe illeggibili finiscono tra le scartate col motivo, mai perse in silenzio", () => {
    const { voci, scartate } = parseVociIncollate("Voce buona\t10\nVoce senza prezzo\tboh\nsolo-una-cella");
    expect(voci).toHaveLength(1);
    expect(scartate).toHaveLength(2);
    expect(scartate[0].motivo).toMatch(/prezzo/i);
    expect(scartate[1].motivo).toMatch(/colonne/i);
  });

  it("normalizza regge il nulla", () => {
    expect(normalizza(null)).toBe("");
    expect(normalizza("  A  B ")).toBe("a b");
  });
});
