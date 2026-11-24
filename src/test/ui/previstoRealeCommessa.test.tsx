import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Previsione } from "@/lib/planimetrie/previsioneLavori";
import { confrontoPrevistoReale } from "@/lib/planimetrie/previstoReale";

const previsione: Previsione = {
  fasi: [
    { fase: "Demolizioni", importo: 3266, manodopera: 1415, materiali: 1851, giorni: 5, giorniBase: 5, attesa: 0, voci: 2 },
    { fase: "Tinteggiature", importo: 3201, manodopera: 2401, materiali: 800, giorni: 6, giorniBase: 6, attesa: 14, voci: 6 },
  ],
  lavori: 6467, manodopera: 3816, materiali: 2651, extra: [], totaleExtra: 0, totale: 6467,
  intervallo: { minimo: 6000, probabile: 6467, massimo: 7000, incertezzaPct: 8 },
  giorniLavoro: 11, giorniAttesa: 14, giorniCalendario: 30,
  fuori: { senzaPrezzo: 0, senzaQuantita: 0, nonStimate: 0 }, indicativi: 0,
};
const confronto = confrontoPrevistoReale({
  previsione,
  fasiCommessa: [{ id: "f1", name: "Allestimento e demolizioni" }, { id: "f2", name: "Finiture" }],
  costoPerFase: new Map([["f1", 4000], ["f2", 2500]]),
  totaleReale: { consuntivo: 7100, manodopera: 4100 },
  rapportini: [{ data_lavoro: "2025-10-07", fasi_lavorate: [{ phase_id: "f1" }] }, { data_lavoro: "2025-10-08", fasi_lavorate: [{ phase_id: "f1" }] }],
  inizioLavori: "2025-10-07", fineLavori: "2025-11-05", oggi: "2026-11-24",
});

vi.mock("@/hooks/usePrevisioneLavoriCommessa", () => ({
  usePrevistoReale: () => ({
    salvata: { created_at: "2026-11-24T07:38:31Z", variante_nome: "Proposta A", versione: 8 },
    confronto, isLoading: false, isError: false,
  }),
}));

describe("PrevistoRealeCommessa", () => {
  it("mostra previsto e reale, e dice «manca» dove la fase non si abbina", async () => {
    const { PrevistoRealeCommessa } = await import("@/components/orders/PrevistoRealeCommessa");
    render(<PrevistoRealeCommessa orderId="o" workStartDate="2025-10-07" workEndDate="2025-11-05" />);
    const sezione = screen.getByRole("region", { name: "Previsto e reale" });
    expect(sezione.textContent).toContain("Proposta A");
    expect(sezione.textContent).toContain("sulla commessa: Allestimento e demolizioni");
    expect(sezione.textContent).toContain("nessuna fase della commessa con questo nome");
    expect(sezione.textContent).toContain("Fasi della commessa fuori dalla previsione: Finiture");
    expect(sezione.textContent).toContain("dalle date di inizio e fine lavori");
    expect(screen.getAllByText("manca").length).toBeGreaterThan(0);
    expect(sezione.textContent).not.toContain("I lavori non risultano finiti");
  });
});
