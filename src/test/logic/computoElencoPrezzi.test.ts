import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generaComputoPdf } from "@/lib/computo/esportaComputo";
import { bozzaVuota, voceVuota, vociDaBozza } from "@/lib/computo/editorNativo";
import { interoInLettere, prezzoInLettere } from "@/lib/computo/stampaElencoPrezzi";

/** L'Elenco prezzi unitari (29/10/2026): il prezzo in cifre e in lettere, come nei capitolati. */
describe("prezzi in lettere", () => {
  it("le eccezioni dell'italiano", () => {
    expect(interoInLettere(21)).toBe("ventuno");
    expect(interoInLettere(38)).toBe("trentotto");
    expect(interoInLettere(180)).toBe("centottanta");
    expect(interoInLettere(101)).toBe("centouno");
    expect(interoInLettere(1000)).toBe("mille");
    expect(interoInLettere(2400)).toBe("duemilaquattrocento");
    expect(interoInLettere(1_250_000)).toBe("unmilioneduecentocinquantamila");
  });
  it("euro e centesimi", () => {
    expect(prezzoInLettere(12.5)).toBe("euro dodici/50");
    expect(prezzoInLettere(1100)).toBe("euro millecento/00");
    expect(prezzoInLettere(0.8)).toBe("euro zero/80");
  });
});

describe("il PDF dell'elenco prezzi", () => {
  it("una riga per voce, col prezzo in cifre e in lettere, senza importi", async () => {
    const bozza = { ...bozzaVuota(), titolo: "Campo da tennis", voci: [
      { ...voceVuota(), capitolo: "Scavi", tariffa: "NP.01", descrizione: "Scavo di sbancamento", unita: "mc", quantita: "259,2", prezzo: "12" },
      { ...voceVuota(), capitolo: "Manto", tariffa: "NP.02", descrizione: "Manto in resina acrilica", unita: "mq", quantita: "648", prezzo: "32,5" },
    ] };
    const doc = await generaComputoPdf(vociDaBozza(bozza), { ...bozza, impaginazione: "elenco-prezzi", azienda: "Impresa Esempio", stato: "" });
    const pdf = doc.output();
    expect(pdf).toContain("E L E N C O   P R E Z Z I   U N I T A R I");
    expect(pdf).toContain("euro dodici/00"); expect(pdf).toContain("euro trentadue/50");
    expect(pdf).toContain("NP.01");
    expect(pdf).not.toContain("3.110,40"); // 259,2 × 12: l'importo non c'è
    if (process.env.COMPUTO_PDF_QA_DIR) {
      const dest = path.resolve(process.env.COMPUTO_PDF_QA_DIR, "elenco-prezzi.pdf");
      await mkdir(path.dirname(dest), { recursive: true }); await writeFile(dest, Buffer.from(doc.output("arraybuffer")));
    }
  }, 30_000);
});
