import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OrderAcceptanceReports } from "@/components/orders/OrderAcceptanceReports";
import { emptyAcceptance } from "../../../supabase/functions/collaudo-commessa/model";
const mocks = vi.hoisted(() => ({
  data: [] as unknown[],
  invoke: vi.fn(),
  permission: true,
  invalidate: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.data, isLoading: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canEditOrders: mocks.permission }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const moduli = vi.hoisted(() => ({ lista: [] as unknown[] }));
vi.mock("@/hooks/useModuliCantiere", () => ({ useModuliAzienda: () => ({ data: moduli.lista }) }));
beforeEach(() => {
  moduli.lista = [];
  mocks.data = [];
  mocks.permission = true;
  mocks.invoke.mockReset();
});
afterEach(cleanup);
const show = () =>
  render(
    <OrderAcceptanceReports
      orderId="order-demo"
      companyId="company-demo"
      customer="Cliente DEMO"
    />,
  );
describe("Collaudo: percorso essenziale", () => {
  it("richiede salvataggio e revisione PDF prima di congelare", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Nuovo verbale" }));
    expect(
      screen.getByRole("button", { name: "Congela edizione" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Genera anteprima" }),
    ).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Cliente" })).toHaveValue(
      "Cliente DEMO",
    );
    expect(
      screen.queryByRole("button", { name: /Richiedi firma/ }),
    ).not.toBeInTheDocument();
  });
  it("non offre scrittura a utenti senza permesso", () => {
    mocks.permission = false;
    show();
    expect(
      screen.queryByRole("button", { name: "Nuovo verbale" }),
    ).not.toBeInTheDocument();
  });
  it("salva solo il verbale, senza inviare firme", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Nuovo verbale" }));
    mocks.invoke.mockResolvedValue({
      data: {
        report: {
          id: "report",
          version: 1,
          status: "draft",
          content: emptyAcceptance("2026-09-30"),
        },
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva bozza" }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    expect(mocks.invoke.mock.calls[0][0]).toBe("collaudo-commessa");
    expect(mocks.invoke.mock.calls[0][1].body.action).toBe("save");
  });
  it("edizione congelata resta consultabile, senza pulsanti di modifica", () => {
    mocks.data = [
      {
        id: "report",
        version: 3,
        status: "finalized",
        pdf_path: "private.pdf",
        content: {
          ...emptyAcceptance("2026-09-30"),
          title: "Verbale congelato",
        },
      },
    ];
    show();
    fireEvent.click(screen.getByRole("button", { name: /Verbale congelato/ }));
    expect(screen.getByRole("textbox", { name: "Titolo" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Salva bozza" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apri PDF" })).toBeEnabled();
  });
});

describe("Verbale da modello", () => {
  const modello = (id: string, nome: string, attivo = true) => ({
    id, tipo: "verbale", nome, attivo,
    schema: { formato: 1, blocchi: {}, voci: [`Voce di ${nome}`], titolo: `Collaudo ${nome}`,
      campi: [{ chiave: "pz", etichetta: "Pezzi controllati", tipo: "number", obbligatorio: false, chi: "tutti", ditte: "tutti", quando: "sempre", livello: "rapportino", stampa: "cliente" }] },
  });
  const nuovo = () => fireEvent.click(screen.getByRole("button", { name: "Nuovo verbale" }));

  it("senza modelli attivi parte dalle 4 voci di oggi senza chiedere nulla", () => {
    moduli.lista = [modello("a", "Spento", false)];
    show(); nuovo();
    expect(screen.getByDisplayValue("Lavorazioni previste e finiture")).toBeInTheDocument();
    expect(screen.queryByText(/Quale modello/)).toBeNull();
  });
  it("con un solo modello lo usa senza chiedere", () => {
    moduli.lista = [modello("a", "Serramenti")];
    show(); nuovo();
    expect(screen.getByDisplayValue("Voce di Serramenti")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Cliente" })).toHaveValue("Cliente DEMO");
  });
  it("con più modelli chiede quale usare", () => {
    moduli.lista = [modello("a", "Serramenti"), modello("b", "Fotovoltaico")];
    show(); nuovo();
    expect(screen.getByText("Quale modello?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fotovoltaico" }));
    expect(screen.getByDisplayValue("Voce di Fotovoltaico")).toBeInTheDocument();
  });
  it("i dati del collaudo si compilano e si salvano con etichetta e tipo, senza toccare il modello", async () => {
    moduli.lista = [modello("a", "Serramenti")];
    mocks.invoke.mockResolvedValue({ data: { report: { id: "r1", status: "draft", version: 1, content: emptyAcceptance("2026-11-02") } }, error: null });
    show(); nuovo();
    fireEvent.change(screen.getByLabelText("Pezzi controllati"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi verifica" }));
    fireEvent.click(screen.getByRole("button", { name: /Salva/ }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalled());
    const { body } = mocks.invoke.mock.calls[0][1] as { body: { content: { valori: unknown[]; checks: unknown[] } } };
    expect(body.content.valori).toEqual([{ chiave: "pz", etichetta: "Pezzi controllati", tipo: "number", valore: 9, stampa: "cliente" }]);
    expect(body.content.checks).toHaveLength(2);
    expect((moduli.lista[0] as { schema: { voci: string[] } }).schema.voci).toHaveLength(1);
  });
});
