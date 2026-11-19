import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsPDF } from "jspdf";
import { dimensioniLogo, normalizzaScalaLogo } from "../../../supabase/functions/_shared/dimensioniLogo";
import { modelloPdfStandard, normalizzaModelloPdf } from "@/lib/modelliPdf/catalogo";
import { creaPdfOperativo } from "@/lib/documentiOperativi/pdf";
import { documentoEsempio } from "@/lib/modelliPdf/anteprima";
import { leggiModelloComputo, vesteDalModello } from "@/lib/computo/modelloComputo";
import { generaComputoPdf } from "@/lib/computo/esportaComputo";

const bytesLogo = readFileSync(path.resolve("public/loghi/impresa-vulcano.png"));
const logo = `data:image/png;base64,${bytesLogo.toString("base64")}`;
const proporzione = bytesLogo.readUInt32BE(16) / bytesLogo.readUInt32BE(20);
const VULCANO = "7c87c209-7868-42d0-ad98-6c95ac6de196";
afterEach(() => vi.restoreAllMocks());

describe("misure del logo condivise", () => {
  it("conserva le percentuali salvate, accetta misure intermedie e normalizza dati non validi", () => {
    for (const n of [25, 70, 85, 100, 137, 175, 250]) {
      expect(normalizzaModelloPdf("materiali", { scalaLogo: n }).scalaLogo).toBe(n);
      expect(vesteDalModello(leggiModelloComputo({ scalaLogo: n })).scalaLogo).toBe(n);
    }
    for (const n of [undefined, null, "175", NaN, Infinity]) expect(normalizzaScalaLogo(n)).toBe(100);
    expect(normalizzaScalaLogo(-10)).toBe(25);
    expect(normalizzaScalaLogo(900)).toBe(250);
  });
  it("contiene loghi molto larghi o alti senza deformarli", () => {
    for (const originale of [{ larghezza: 10000, altezza: 10 }, { larghezza: 10, altezza: 10000 }]) {
      const m = dimensioniLogo(originale, { larghezza: 200, altezza: 50 }, 250, { larghezza: 480, altezza: 120 });
      expect(m.larghezza).toBeLessThanOrEqual(480);
      expect(m.altezza).toBeLessThanOrEqual(120);
      expect(m.larghezza / m.altezza).toBeCloseTo(originale.larghezza / originale.altezza, 5);
    }
  });
});

describe.each([VULCANO, "altra-azienda"])("PDF operativi dell'azienda %s", id => {
  it.each(["materiali", "richiesta", "servizi", "trasporti", "economia"] as const)("%s riduce e ingrandisce il logo rispettando le proporzioni", tipo => {
    const add = vi.spyOn(jsPDF.API, "addImage");
    const misure = [85, 100, 175, 250].map(scalaLogo => {
      add.mockClear();
      const pdf = creaPdfOperativo(documentoEsempio(tipo), { id, name: "Impresa di prova" }, logo, { ...modelloPdfStandard(tipo), scalaLogo });
      expect(pdf.getNumberOfPages()).toBeGreaterThan(0);
      const args = add.mock.calls[0] as unknown as [string, string, number, number, number, number];
      const [, , x, y, w, h] = args;
      expect(w / h).toBeCloseTo(proporzione, 4);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(210);
      expect(y + h).toBeLessThan(100);
      return w;
    });
    expect(misure[0]).toBeCloseTo(misure[1] * .85, 4);
    expect(misure[2]).toBeGreaterThan(misure[1]);
    expect(misure[3]).toBeGreaterThanOrEqual(misure[2]);
  });
});

describe("copertine del computo", () => {
  it.each(["piena", "fascia", "sobria"] as const)("%s usa la misura salvata senza schiacciare il logo largo", async copertina => {
    const add = vi.spyOn(jsPDF.API, "addImage");
    const larghezze: number[] = [];
    for (const scalaLogo of [50, 100, 200]) {
      add.mockClear();
      const veste = { ...vesteDalModello(leggiModelloComputo({ copertina, scalaLogo })), logo: { dati: logo, formato: "PNG" as const, larghezza: bytesLogo.readUInt32BE(16), altezza: bytesLogo.readUInt32BE(20) } };
      await generaComputoPdf([], { titolo: "Computo di prova", presentazione: "preventivo", azienda: "Impresa", stato: "", veste });
      const [, , x, , w, h] = add.mock.calls[0] as unknown as [string, string, number, number, number, number];
      expect(w / h).toBeCloseTo(proporzione, 4);
      expect(x + w).toBeLessThan(596);
      larghezze.push(w);
    }
    expect(larghezze[0]).toBeCloseTo(larghezze[1] / 2, 4);
    expect(larghezze[2]).toBeGreaterThan(larghezze[1]);
  });
});
