import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MarkPaidDialog from "@/components/scadenzario/MarkPaidDialog";
import ChiudiEffettoDialog from "@/components/scadenzario/ChiudiEffettoDialog";
import { residuoLibero } from "@/hooks/useEffetti";
import type { Scadenza } from "@/hooks/useScadenzario";

const fake = vi.hoisted(() => ({ rpc: vi.fn(), effetti: [] as Record<string, unknown>[], chiudiErrori: 0 }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: fake.rpc } }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ solaLettura: false, canManagePayments: true, isAdmin: true }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
Element.prototype.scrollIntoView ??= () => {};

const scad = { id: "s1", company_id: "c1", tipo: "incasso_cliente", direction: "entrata", description: "Rata 1", amount: 1000, paid_amount: 0,
  due_date: "2027-01-10", status: "da_pagare" } as Scadenza;
const futura = "2099-01-10";
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>;

beforeEach(() => {
  fake.effetti = []; fake.chiudiErrori = 0; fake.rpc.mockReset();
  fake.rpc.mockImplementation(async (name: string) => {
    if (name === "effetti_elenco") return { data: fake.effetti, error: null };
    if (name === "registra_effetto") return { data: { id: "e1", coperto: 100, residuo_libero: 900 }, error: null };
    if (name === "chiudi_effetto") {
      if (fake.chiudiErrori-- > 0) return { data: null, error: { message: "Connessione interrotta" } };
      return { data: { stato: "pagato", prima_nota_entry_id: "p1", gia_chiuso: false }, error: null };
    }
    return { data: null, error: null };
  });
});
afterEach(cleanup);

const apri = (onConfirm = vi.fn()) => { render(<MarkPaidDialog scadenza={scad} open onOpenChange={vi.fn()} onConfirm={onConfirm} isPending={false} />, { wrapper: wrap }); return onConfirm; };
const scegliMetodo = (nome: RegExp) => { fireEvent.click(screen.getAllByRole("combobox")[0]); fireEvent.click(screen.getByRole("option", { name: nome })); };

it("residuoLibero sottrae il coperto e non va sotto zero", () => {
  expect(residuoLibero(1000, 100)).toBe(900);
  expect(residuoLibero(50, 80)).toBe(0);
});

it("numero e banca compaiono solo con assegno, RiBa o RID", () => {
  apri();
  expect(screen.queryByLabelText("Numero assegno")).toBeNull();
  scegliMetodo(/Assegno/);
  expect(screen.getByLabelText("Numero assegno")).toBeInTheDocument();
  expect(screen.getByLabelText("Data dell'assegno")).toBeInTheDocument();
});

it("data futura: registra_effetto e NON il pagamento", async () => {
  const onConfirm = apri();
  scegliMetodo(/Assegno/);
  fireEvent.change(screen.getByLabelText("Numero assegno"), { target: { value: "123" } });
  fireEvent.change(screen.getByLabelText("Data dell'assegno"), { target: { value: futura } });
  fireEvent.click(screen.getByRole("button", { name: "Registra assegno" }));
  await waitFor(() => expect(fake.rpc).toHaveBeenCalledWith("registra_effetto", expect.objectContaining({ p_fonte_tipo: "scadenza", p_fonte_id: "s1", p_tipo: "assegno", p_direzione: "ricevuto", p_numero: "123", p_data_scadenza: futura, p_importo: 1000 })));
  expect(onConfirm).not.toHaveBeenCalled();
});

it("data di oggi: flusso di sempre, nessun effetto", () => {
  const onConfirm = apri();
  scegliMetodo(/Assegno/);
  fireEvent.click(screen.getByRole("button", { name: "Registra" }));
  expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: "assegno", amount: 1000 }));
  expect(fake.rpc).not.toHaveBeenCalledWith("registra_effetto", expect.anything());
});

it("l'importo massimo è il residuo libero e il coperto è scritto sotto il campo", async () => {
  fake.effetti = [{ id: "e0", importo: 300, scadenza_id: "s1", company_cost_id: null }];
  apri();
  expect(await screen.findByText(/Già coperti .*300.* Residuo libero/)).toBeInTheDocument();
  expect(screen.getByLabelText("Importo incassato")).toHaveAttribute("max", "700");
  fireEvent.change(screen.getByLabelText("Importo incassato"), { target: { value: "800" } });
  expect(screen.getByRole("button", { name: "Registra" })).toBeDisabled();
});

it("chiudi_effetto: stessa p_richiesta su due tentativi", async () => {
  fake.chiudiErrori = 1;
  const effetto = { id: "e1", tipo: "assegno", direzione: "ricevuto", numero: "9", banca: "X", importo: 100, data_scadenza: "2020-01-01", descrizione_fonte: "Rata 1" } as never;
  render(<ChiudiEffettoDialog effetto={effetto} open onOpenChange={vi.fn()} />, { wrapper: wrap });
  const clic = () => fireEvent.click(screen.getByRole("button", { name: "Incassato" }));
  clic();
  await waitFor(() => expect(fake.rpc.mock.calls.filter(c => c[0] === "chiudi_effetto")).toHaveLength(1));
  await waitFor(() => expect(screen.getByRole("button", { name: "Incassato" })).not.toBeDisabled());
  clic();
  await waitFor(() => expect(fake.rpc.mock.calls.filter(c => c[0] === "chiudi_effetto")).toHaveLength(2));
  const [a, b] = fake.rpc.mock.calls.filter(c => c[0] === "chiudi_effetto").map(c => c[1].p_richiesta);
  expect(a).toBeTruthy();
  expect(a).toBe(b);
});

it("effetto legato a una rata fornitore: niente «Pagato», solo insoluto/annulla e il rimando alla fattura", () => {
  const effetto = { id: "e2", tipo: "assegno", direzione: "emesso", importo: 100, data_scadenza: "2020-01-01", rata_fornitore_id: "r1" } as never;
  render(<ChiudiEffettoDialog effetto={effetto} open onOpenChange={vi.fn()} />, { wrapper: wrap });
  expect(screen.queryByRole("button", { name: "Pagato" })).toBeNull();
  expect(screen.getByRole("button", { name: "Insoluto" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Annulla assegno" })).toBeInTheDocument();
  expect(screen.getByText(/si paga dalla fattura fornitore/)).toBeInTheDocument();
});
