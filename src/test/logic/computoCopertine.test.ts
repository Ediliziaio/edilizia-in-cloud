import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { attivaCopertina, COPERTINE_COMPUTO, haPaginaCopertina } from "@/lib/computo/copertineComputo";
import { leggiModelloComputo, modelloComputoDiSerie, vesteDalModello } from "@/lib/computo/modelloComputo";
import { bozzaVuota, voceVuota, vociDaBozza } from "@/lib/computo/editorNativo";
import { generaComputoPdf } from "@/lib/computo/esportaComputo";

describe("otto copertine del preventivo / computo", () => {
  it("preserva i vecchi modelli compatti finché non viene scelta una copertina", () => {
    for (const copertina of ["fascia", "sobria"] as const) {
      const vecchio = leggiModelloComputo({ copertina, sezioni: { copertina: false, firme: false }, fontFamiglia: "times" });
      expect(haPaginaCopertina(vecchio)).toBe(false);
      const scelto = attivaCopertina(vecchio, copertina);
      expect(haPaginaCopertina(scelto, scelto.sezioni.copertina)).toBe(true);
      expect(scelto).toMatchObject({ copertina, copertinaSeparata: true, fontFamiglia: "times", sezioni: { copertina: true, firme: false } });
      expect(vecchio.sezioni.copertina).toBe(false);
    }
    expect(haPaginaCopertina(modelloComputoDiSerie())).toBe(true);
    expect(haPaginaCopertina(modelloComputoDiSerie(), false)).toBe(false);
  });
  it("stampa otto copertine diverse, conservando voci, misure e totale nelle pagine successive", async () => {
    expect(COPERTINE_COMPUTO).toHaveLength(8);
    const voci = vociDaBozza({ ...bozzaVuota(), voci: [{ ...voceVuota(), descrizione: "LAVORAZIONE_CAMPIONE", quantita: "2", prezzo: "25" }] });
    const prima = JSON.stringify(voci), pagine = new Set<string>();
    for (const c of COPERTINE_COMPUTO) {
      const m = attivaCopertina(modelloComputoDiSerie(), c.id);
      expect(leggiModelloComputo(JSON.parse(JSON.stringify(m))).copertina).toBe(c.id);
      const pdf = await generaComputoPdf(voci, { titolo: "Riqualificazione di una villa", azienda: "IMPRESA DEMO", committente: "Mario Rossi", numero: "P-2026-008", dataDocumento: "20/11/2026", indirizzoIntervento: "Via dei Giardini 12 - Milano", oggetto: "Serramenti, nuovi ambienti e finiture interne", colore: "#244C3A", impaginazione: "editoriale", stato: "", veste: vesteDalModello(m), sezioni: { indice: false, firme: false } });
      const fogli = (pdf.internal as unknown as { pages: string[][] }).pages;
      const copertina = fogli[1].join("\n");
      expect(copertina).toContain("Riqualificazione");
      expect(copertina).not.toContain("LAVORAZIONE_CAMPIONE");
      expect(copertina).not.toMatch(/NaN|Infinity/);
      expect(pdf.output()).toContain("(computo.copertina)");
      expect(fogli.slice(2).some(p => p.join("\n").includes("LAVORAZIONE_CAMPIONE"))).toBe(true);
      expect(pdf.output()).toContain("50,00");
      pagine.add(copertina);
      if (process.env.COMPUTO_COPERTINE_QA) {
        await mkdir("output/pdf/copertine-demo", { recursive: true });
        await writeFile(`output/pdf/copertine-demo/${c.id}.pdf`, new Uint8Array(pdf.output("arraybuffer")));
      }
    }
    expect(pagine.size).toBe(8);
    expect(JSON.stringify(voci)).toBe(prima);
  });
});
