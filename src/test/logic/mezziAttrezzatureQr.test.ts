/**
 * Mezzi e attrezzature divisi, attrezzature a quantità e QR (05/10/2026).
 *
 * Le stesse regole stanno nel database (migrazioni 20281005130000…160000):
 * il codice si normalizza come in mezzi_codice_prepara («att 12» → ATT-0012),
 * le quantità si scrivono all'italiana come in _mezzi_fmt_quantita.
 */
import { describe, expect, it } from "vitest";
import {
  CATEGORIE_DOCUMENTO, TIPI_MANUTENZIONE, TIPI_VEICOLO, classeDi, formatQuantita, leggiCodiceScansionato, unitaBreve,
  vociPerClasse,
} from "@/types/mezzi";

describe("leggiCodiceScansionato", () => {
  it("dal QR stampato: codice e azienda dall'indirizzo", () => {
    expect(leggiCodiceScansionato("https://lavori.ediliziaincloud.com/q/ATT-0012?c=d2000000-0000-4000-a000-000000000002"))
      .toEqual({ codice: "ATT-0012", companyId: "d2000000-0000-4000-a000-000000000002" });
  });

  it("anche in locale e con il codice in minuscolo", () => {
    expect(leggiCodiceScansionato("http://localhost:51538/q/mz-0003?c=abc")).toEqual({ codice: "MZ-0003", companyId: "abc" });
  });

  it("il solo codice, scritto a mano o da un'etichetta di altri", () => {
    expect(leggiCodiceScansionato("  att 12 ")).toEqual({ codice: "ATT12", companyId: null });
    expect(leggiCodiceScansionato("PONT-01")).toEqual({ codice: "PONT-01", companyId: null });
  });

  it("niente testo o un testo lunghissimo non sono codici", () => {
    expect(leggiCodiceScansionato("")).toBeNull();
    expect(leggiCodiceScansionato("   ")).toBeNull();
    expect(leggiCodiceScansionato("x".repeat(80))).toBeNull();
  });

  it("un indirizzo qualunque (non /q/…) non diventa un codice di 40 caratteri", () => {
    expect(leggiCodiceScansionato("https://www.example.com/prodotto/12345")).toBeNull();
  });
});

describe("formatQuantita", () => {
  it("metri quadri, pezzi e metri all'italiana", () => {
    expect(formatQuantita(250, "mq")).toBe("250 m²");
    expect(formatQuantita(1200, "pz")).toBe("1.200 pz");
    expect(formatQuantita(12.5, "ml")).toBe("12,5 m");
    expect(formatQuantita(0.25, "mc")).toBe("0,25 m³");
  });

  it("vuoto se manca il numero", () => {
    expect(formatQuantita(null, "mq")).toBe("—");
  });

  it("le unità brevi", () => {
    expect(unitaBreve("mq")).toBe("m²");
    expect(unitaBreve("kg")).toBe("kg");
    expect(unitaBreve(null)).toBe("");
  });
});

describe("mezzi e attrezzature", () => {
  it("la classe la decide il tipo, come la colonna generata", () => {
    expect(classeDi("attrezzatura")).toBe("attrezzatura");
    expect(classeDi("furgone")).toBe("mezzo");
    expect(classeDi("sollevamento")).toBe("mezzo");
  });

  it("fra i tipi dei mezzi non c'è l'attrezzatura", () => {
    expect(TIPI_VEICOLO.map((t) => t.value)).not.toContain("attrezzatura");
    expect(TIPI_VEICOLO.map((t) => t.value)).toContain("furgone");
  });

  it("documenti: a un attrezzo niente bollo e revisione, ma garanzia, taratura e PiMUS", () => {
    const attrezzo = vociPerClasse(CATEGORIE_DOCUMENTO, "attrezzatura").map((c) => c.value);
    expect(attrezzo).toEqual(expect.arrayContaining(["garanzia", "taratura", "pimus", "autorizzazione_ministeriale", "altro"]));
    expect(attrezzo).not.toContain("bollo");
    expect(attrezzo).not.toContain("revisione");
    const mezzo = vociPerClasse(CATEGORIE_DOCUMENTO, "mezzo").map((c) => c.value);
    expect(mezzo).toEqual(expect.arrayContaining(["assicurazione", "bollo", "revisione", "libretto"]));
    expect(mezzo).not.toContain("pimus");
  });

  it("un documento già scelto resta nel menu anche se non è della classe (un dato vecchio non sparisce)", () => {
    expect(vociPerClasse(CATEGORIE_DOCUMENTO, "attrezzatura", "bollo").map((c) => c.value)).toContain("bollo");
  });

  it("interventi: tagliandi e gomme ai mezzi, manutenzioni e tarature agli attrezzi", () => {
    const attrezzo = vociPerClasse(TIPI_MANUTENZIONE, "attrezzatura").map((t) => t.value);
    expect(attrezzo).toEqual(expect.arrayContaining(["manutenzione_ordinaria", "sostituzione_parti", "taratura", "verifica", "riparazione"]));
    expect(attrezzo).not.toContain("gomme");
    expect(attrezzo).not.toContain("tagliando");
    expect(vociPerClasse(TIPI_MANUTENZIONE, "mezzo").map((t) => t.value)).toContain("tagliando");
  });
});
