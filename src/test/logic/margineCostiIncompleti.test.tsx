// Il margine dei computi edili, a schermo: con una voce venduta senza costo si
// legge «Costi incompleti» e «—», non un margine del 100% (05/10/2026).
// Le otto copie di StepEconomia e ComputoEditor hanno lo stesso blocco: qui si
// prova quella dei bagni.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

const voce = (p: Partial<BgnComputoVoce>): BgnComputoVoce => ({
  id: "v1", progetto_id: "p1", company_id: "c1", capitolo_nome: "Sanitari", descrizione: "Voce",
  unita_misura: "cad", quantita: 1, prezzo_unitario: 0, costo_materiali: 0, costo_manodopera: 0,
  sconto_pct: 0, importo: 0, margine_eur: 0, margine_pct: 0, listino_voce_id: null, fonte: null, ordine: 0,
  ...p,
} as BgnComputoVoce);

const CON_COSTO = voce({ id: "a", descrizione: "Piatto doccia", quantita: 1, prezzo_unitario: 1000, costo_materiali: 400, costo_manodopera: 200 });
const SENZA_COSTO = voce({ id: "b", descrizione: "Box doccia", quantita: 1, prezzo_unitario: 800 });

const form = { company_id: "c1", sconto_pct: 0, iva_pct: 10, detrazione_pct: 0 } as Partial<BgnProgetto>;

describe("margine con costi incompleti — step Economia", () => {
  it("una voce venduta senza costo: «—» e «Costi incompleti», non 100%", () => {
    render(<StepEconomia form={form} onChange={() => {}} computo={[CON_COSTO, SENZA_COSTO]} />);
    const scheda = screen.getByText("Margine complessivo").closest("div.flex.items-center.justify-between") as HTMLElement;
    expect(within(scheda).getByText("Costi incompleti")).toBeInTheDocument();
    expect(within(scheda).getByText("—")).toBeInTheDocument();
    expect(within(scheda).getByText("1 voce venduta senza costo")).toBeInTheDocument();
    expect(within(scheda).queryByText(/%$/)).toBeNull();
  });

  it("costi completi: il margine resta quello di sempre", () => {
    render(<StepEconomia form={form} onChange={() => {}} computo={[CON_COSTO]} />);
    const scheda = screen.getByText("Margine complessivo").closest("div.flex.items-center.justify-between") as HTMLElement;
    expect(within(scheda).getByText("40%")).toBeInTheDocument();
    expect(within(scheda).queryByText("Costi incompleti")).toBeNull();
  });
});

describe("margine con costi incompleti — riepilogo del computo", () => {
  const apriMargini = () => fireEvent.click(screen.getByRole("button", { name: /Margini/ }));

  it("una voce venduta senza costo: «—» e «Costi incompleti · 1 senza costo»", () => {
    render(<ComputoEditor value={[CON_COSTO, SENZA_COSTO]} onChange={() => {}} progettoId="p1" companyId="c1" ivaPct={10} />);
    apriMargini();
    expect(screen.getByText("Costi incompleti · 1 senza costo")).toBeInTheDocument();
    expect(screen.queryByText(/100(,0|\.0)?%/)).toBeNull();
  });

  it("costi completi: margine in euro e in percentuale", () => {
    render(<ComputoEditor value={[CON_COSTO]} onChange={() => {}} progettoId="p1" companyId="c1" ivaPct={10} />);
    apriMargini();
    expect(screen.getByText(/^40\.0% · costo/)).toBeInTheDocument();
  });
});
