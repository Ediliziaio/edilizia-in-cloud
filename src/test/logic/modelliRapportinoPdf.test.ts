import { describe, it, expect, vi, afterEach } from "vitest";
import { PDFPage } from "pdf-lib";
import { modelloPdfStandard } from "@/lib/modelliPdf/catalogo";
const { renderRapportino } =
  await import("../../../supabase/functions/genera-pdf-rapportino/render");
afterEach(() => vi.restoreAllMocks());
describe("Modelli del rapportino e di fine lavori", () => {
  it.each([false, true])(
    "titolo e testi personalizzati, dati aziendali solo in basso (fine lavori: %s)",
    async (fine) => {
      const spy = vi.spyOn(PDFPage.prototype, "drawText");
      const m = {
        ...modelloPdfStandard(fine ? "fine_lavori" : "rapportino"),
        titolo: "RAPPORTO PERSONALIZZATO",
        introduzione: "INTRODUZIONE AZIENDALE",
        conclusione: "CONCLUSIONE AZIENDALE",
        carattere: "times" as const,
        margine: 18,
        dimensioneTesto: 10,
        righeAlternate: true,
        coloreRiquadri: "#eef3f8",
        notaPagina: "NOTA AZIENDALE IN OGNI PAGINA",
        numerazione: false,
      };
      const r = await renderRapportino(
        {
          report: {
            id: "00000000-0000-4000-8000-000000000001",
            stato: "bozza",
            data_lavoro: "2026-11-06",
            lavoro_completato: fine,
            ore_lavorate: 8,
            descrizione_lavori: "Lavorazioni di esempio",
          },
          company: {
            name: "Impresa Alfa",
            legal_address: "Via Test 42",
            legal_city: "Milano",
            email: "alfa@esempio.invalid",
          },
          branding: { primaryColor: "#123456" },
          phases: [],
          punches: [],
          warnings: [],
          revision: "QA",
          generatedAt: "2026-11-06T12:00:00Z",
          modelloPdf: m,
        },
        async () => null,
      );
      const texts = spy.mock.calls.map(([t]) => t);
      for (const v of [m.titolo, m.introduzione, m.conclusione])
        expect(texts).toContain(v);
      expect(texts.filter((t) => t === m.notaPagina)).toHaveLength(r.pageCount);
      expect(texts).not.toContain(`1 / ${r.pageCount}`);
      const addresses = spy.mock.calls.filter(([t]) =>
        t.includes("Via Test 42"),
      );
      expect(addresses).toHaveLength(r.pageCount);
      for (const [, opts] of addresses) expect(opts.y).toBeLessThan(60);
    },
  );
});
