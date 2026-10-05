// Il margine dei computi edili, a schermo: con una voce venduta senza costo si
// legge «Costi incompleti» e «—», non un margine del 100% (05/10/2026).
//
// Dal preventivatore unico (05/10/2026) il margine non sta più nello step
// Economia né nel riepilogo a destra del computo: lo mostra una volta sola
// l'anteprima del preventivo, vista «Impresa», uguale per gli otto moduli. Qui si
// prova quella dei bagni e che gli altri due posti non ne facciano una seconda copia.
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { BgnComputoVoce, BgnProgetto } from "@/types/bagni";

vi.mock("@/hooks/useBagniProgetto", () => ({ useBgnTemplatePdf: () => ({ data: undefined as unknown }) }));
vi.mock("@/hooks/usePrezzoFinaleAMano", () => ({
  usePrezzoFinaleAMano: () => ({ data: false, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useDiscountRules", () => ({ useDiscountRules: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canApproveDiscounts: true }) }));
vi.mock("@/components/bagni/ComputoEditor/AddVocePicker", () => ({ default: (): null => null }));
vi.mock("@/components/bagni/ComputoEditor/CapitoloSection", () => ({ default: (): null => null }));

import StepEconomia from "@/pages/azienda/bagni/BagniWizard/StepEconomia";
import ComputoEditor from "@/components/bagni/ComputoEditor/ComputoEditor";
import { AnteprimaVeloce } from "@/components/preventivatore";
import { anteprimaComputo } from "@/lib/preventivatore/anteprimaComputo";
import * as calcoliBagni from "@/lib/bagni/calcoli";

const voce = (p: Partial<BgnComputoVoce>): BgnComputoVoce => ({
  id: "v1", progetto_id: "p1", company_id: "c1", capitolo_nome: "Sanitari", descrizione: "Voce",
  unita_misura: "cad", quantita: 1, prezzo_unitario: 0, costo_materiali: 0, costo_manodopera: 0,
  sconto_pct: 0, importo: 0, margine_eur: 0, margine_pct: 0, listino_voce_id: null, fonte: null, ordine: 0,
  ...p,
} as BgnComputoVoce);

const CON_COSTO = voce({ id: "a", descrizione: "Piatto doccia", quantita: 1, prezzo_unitario: 1000, costo_materiali: 400, costo_manodopera: 200 });
const SENZA_COSTO = voce({ id: "b", descrizione: "Box doccia", quantita: 1, prezzo_unitario: 800 });

const form = { company_id: "c1", sconto_pct: 0, iva_pct: 10, detrazione_pct: 0 } as Partial<BgnProgetto>;

const anteprimaImpresa = (voci: BgnComputoVoce[]) =>
  render(<AnteprimaVeloce vista="impresa" dati={anteprimaComputo(voci, form, calcoliBagni, { ivaDefault: 10 })} />);

describe("margine con costi incompleti — anteprima del preventivo, vista impresa", () => {
  it("una voce venduta senza costo: «—» e «Costi incompleti», non 100%", () => {
    anteprimaImpresa([CON_COSTO, SENZA_COSTO]);
    const riquadro = screen.getByText(/Vista impresa/).closest("div") as HTMLElement;
    expect(within(riquadro).getByText("—")).toBeInTheDocument();
    expect(within(riquadro).getByText(/Costi incompleti · 1 voce senza costo/)).toBeInTheDocument();
    expect(within(riquadro).queryByText(/%/)).toBeNull();
  });

  it("costi completi: margine in euro e in percentuale", () => {
    anteprimaImpresa([CON_COSTO]);
    const riquadro = screen.getByText(/Vista impresa/).closest("div") as HTMLElement;
    expect(within(riquadro).getByText("€ 400")).toBeInTheDocument();
    expect(within(riquadro).getByText(/\(40%\)/)).toBeInTheDocument();
    expect(within(riquadro).queryByText(/Costi incompleti/)).toBeNull();
  });
});

describe("il margine non ha una seconda copia", () => {
  it("lo step Economia non ha più riepilogo, totali né margine: restano i parametri", () => {
    render(<StepEconomia form={form} onChange={() => {}} computo={[CON_COSTO, SENZA_COSTO]} />);
    expect(screen.getByText("Parametri")).toBeInTheDocument();
    expect(screen.queryByText("Margine complessivo")).toBeNull();
    expect(screen.queryByText("Totali complessivi")).toBeNull();
    expect(screen.queryByText("Riepilogo per capitolo")).toBeNull();
    expect(screen.queryByText(/Costi incompleti/)).toBeNull();
  });

  it("l'editor del computo non ha più il riepilogo a destra: i totali sono nell'anteprima", () => {
    render(<ComputoEditor value={[CON_COSTO, SENZA_COSTO]} onChange={() => {}} progettoId="p1" companyId="c1" />);
    expect(screen.queryByText("Riepilogo computo")).toBeNull();
    expect(screen.queryByText("Totale preventivo")).toBeNull();
    expect(screen.queryByText(/Costi incompleti/)).toBeNull();
    // il resto dell'editor c'è: conteggio e pulsanti
    expect(screen.getByText("2 voci · 1 capitolo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cerca voce/ })).toBeInTheDocument();
  });
});
