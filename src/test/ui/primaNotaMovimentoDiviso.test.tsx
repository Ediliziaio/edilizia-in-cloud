import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NewEntryDialog from "@/components/prima-nota/NewEntryDialog";

const documenti = [
  { tipo: "documento", id: "d1", numero: "12", data: "2026-09-01", controparte: "Rossi Costruzioni", totale: 1000, residuo: 1000, order_id: "o1", order_code: "C-01" },
  { tipo: "invoice", id: "i1", numero: "FT/40", data: "2026-10-01", controparte: "Rossi Costruzioni", totale: 2500.5, residuo: 2500.5, order_id: null, order_code: null },
  { tipo: "documento", id: "d2", numero: "13", data: "2026-10-05", controparte: "Bianchi", totale: 700, residuo: 700, order_id: null, order_code: null },
];
const rpc = vi.fn(async (fn: string, _args?: unknown): Promise<{ data: unknown; error: null }> => {
  if (fn === "prima_nota_documenti_aperti") return { data: documenti, error: null };
  if (fn === "prima_nota_dipendenti") return { data: [
    { id: "e1", nome: "Rossi Mario", netto_proposto: 1500, origine: "cedolino", cedolino_id: "c1", pagato_il: null },
    { id: "e2", nome: "Verdi Luca", netto_proposto: 1320.5, origine: "scheda", cedolino_id: null, pagato_il: null },
    { id: "e3", nome: "Neri Anna", netto_proposto: 1400, origine: "scheda", cedolino_id: null, pagato_il: "2026-11-10" },
  ], error: null };
  if (fn === "banca_registra_divisa") return { data: { gruppo_id: "g2", righe: [] as unknown[] }, error: null };
  if (fn === "prima_nota_registra_divisa") return { data: { gruppo_id: "g1", righe: [] }, error: null };
  return { data: [], error: null };
});
vi.mock("@/hooks/useContiPrimaNota", () => ({ useContiPrimaNota: () => ({ data: [] as unknown[], isError: false, isPending: false }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" } }) }));
vi.mock("@/hooks/usePrimaNota", () => ({ allineaFattureInCloud: vi.fn(async () => "ok") }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (fn: string, a: unknown) => rpc(fn, a), from: () => {
  const q = { select: () => q, eq: () => q, order: () => q, not: () => q, is: () => q, limit: () => q, then: (r: unknown) => Promise.resolve({ data: [], error: null }).then(r as never) };
  return q;
} } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
Element.prototype.scrollIntoView ??= () => {};

it("un bonifico in entrata diviso su due fatture dello stesso cliente: proposta esatta, barra e salvataggio unico", async () => {
  const onOpenChange = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><NewEntryDialog open onOpenChange={onOpenChange} onConfirm={vi.fn()} isPending={false} /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "↓ Entrata" }));
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("Importo"), { target: { value: "3500.50" } });
  // Le due fatture di Rossi fanno esattamente l'importo: il popup lo propone.
  const proposta = await screen.findByRole("button", { name: /Queste 2 fatture fanno esattamente/ });
  fireEvent.click(proposta);
  expect(screen.getByText(/tutto assegnato/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Registra 2 quote" }));
  await waitFor(() => expect(rpc).toHaveBeenCalledWith("prima_nota_registra_divisa", expect.objectContaining({
    p_company: "demo",
    p_testata: expect.objectContaining({ direction: "entrata", importo: 3500.5 }),
    p_quote: [{ tipo: "documento", id: "d1", importo: 1000 }, { tipo: "invoice", id: "i1", importo: 2500.5 }],
  })));
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
});

it("cercando il cliente la quota propone quello che manca (acconto) e la voce senza fattura chiude il resto", async () => {
  render(<QueryClientProvider client={new QueryClient()}><NewEntryDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} isPending={false} /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "↓ Entrata" }));
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("Importo"), { target: { value: "500" } });
  fireEvent.change(screen.getByLabelText("Cerca cliente o fattura"), { target: { value: "bianchi" } });
  fireEvent.click(await screen.findByRole("option", { name: /Bianchi/ }));
  expect((screen.getByLabelText("Importo della quota") as HTMLInputElement).value).toBe("500.00");
  expect(screen.getByText("acconto")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Importo della quota"), { target: { value: "450" } });
  expect(screen.getByText(/mancano 50,00/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Registra" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /Voce senza fattura/ }));
  expect((screen.getAllByLabelText("Importo della quota")[1] as HTMLInputElement).value).toBe("50.00");
  expect(screen.getByText("Scegli la categoria per una voce senza fattura.")).toBeTruthy();
});

it("gli stipendi del mese: si spuntano quelli da pagare, il netto si propone e si registra in un colpo", async () => {
  render(<QueryClientProvider client={new QueryClient()}><NewEntryDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} isPending={false} /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("Importo"), { target: { value: "2820.50" } });
  fireEvent.click(screen.getByRole("button", { name: "Stipendi" }));
  fireEvent.click(await screen.findByRole("button", { name: "Spunta tutti quelli ancora da pagare (2)" }));
  expect(screen.getByText(/pagato il 10\/11\/2026/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Aggiungi 2 stipendi" }));
  expect(screen.getByText(/tutto assegnato/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Registra 2 quote" }));
  await waitFor(() => expect(rpc).toHaveBeenCalledWith("prima_nota_registra_divisa", expect.objectContaining({
    p_testata: expect.objectContaining({ direction: "uscita", importo: 2820.5 }),
    p_quote: [
      expect.objectContaining({ tipo: "dipendente", id: "e1", importo: 1500 }),
      expect.objectContaining({ tipo: "dipendente", id: "e2", importo: 1320.5 }),
    ],
  })));
});

it("dal movimento di banca: verso, importo e data sono della banca e le quote si collegano al movimento", async () => {
  const onOpenChange = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}>
    <NewEntryDialog open onOpenChange={onOpenChange} onConfirm={vi.fn()} isPending={false}
      movimentoBanca={{ id: "tx1", direction: "entrata", importo: 1700, data: "2026-11-20", descrizione: "Bonifico Bianchi" }} />
  </QueryClientProvider>);
  expect(screen.getByText("Dividi il movimento di banca")).toBeTruthy();
  expect(screen.queryByRole("checkbox", { name: /Divido/ })).toBeNull();
  expect((screen.getByLabelText("Importo") as HTMLInputElement).readOnly).toBe(true);
  expect(screen.getByRole("button", { name: "↑ Uscita" })).toBeDisabled();
  expect(screen.queryByLabelText("Conto", { exact: true })).toBeNull();
  fireEvent.change(screen.getByLabelText("Cerca cliente o fattura"), { target: { value: "bianchi" } });
  fireEvent.click(await screen.findByRole("option", { name: /Bianchi/ }));
  fireEvent.click(screen.getByRole("button", { name: /Voce senza fattura/ }));
  fireEvent.keyDown(screen.getByLabelText("Categoria della voce"), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "Altro" }));
  fireEvent.click(screen.getByRole("button", { name: "Registra 2 quote" }));
  await waitFor(() => expect(rpc).toHaveBeenCalledWith("banca_registra_divisa", expect.objectContaining({
    p_tx: "tx1",
    p_testata: expect.objectContaining({ importo: 1700, descrizione: "Bonifico Bianchi" }),
    p_quote: [expect.objectContaining({ tipo: "documento", id: "d2", importo: 700 }), expect.objectContaining({ tipo: "libera", categoria: "altro", importo: 1000 })],
  })));
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
});

it("pochi euro di differenza in uscita si propongono come commissioni bancarie", async () => {
  render(<QueryClientProvider client={new QueryClient()}><NewEntryDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} isPending={false} /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "↓ Entrata" }));
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("Importo"), { target: { value: "703.50" } });
  fireEvent.change(screen.getByLabelText("Cerca cliente o fattura"), { target: { value: "bianchi" } });
  fireEvent.click(await screen.findByRole("option", { name: /Bianchi/ }));
  fireEvent.click(screen.getByRole("button", { name: /Metti i 3,50/ }));
  expect(screen.getByText(/tutto assegnato/)).toBeTruthy();
  expect((screen.getByLabelText("Descrizione della voce") as HTMLInputElement).value).toBe("Arrotondamento");
});

it("se le fatture superano l'accredito, la differenza resta da incassare sull'ultima", async () => {
  render(<QueryClientProvider client={new QueryClient()}><NewEntryDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} isPending={false} /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "↓ Entrata" }));
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("Importo"), { target: { value: "1500" } });
  fireEvent.change(screen.getByLabelText("Cerca cliente o fattura"), { target: { value: "rossi" } });
  fireEvent.click(await screen.findByRole("option", { name: /FT\/40/ }));
  fireEvent.change(screen.getByLabelText("Cerca cliente o fattura"), { target: { value: "bianchi" } });
  fireEvent.click(await screen.findByRole("option", { name: /Bianchi/ }));
  fireEvent.change(screen.getAllByLabelText("Importo della quota")[0], { target: { value: "1000" } });
  fireEvent.change(screen.getAllByLabelText("Importo della quota")[1], { target: { value: "700" } });
  fireEvent.click(screen.getByRole("button", { name: /Lascia 200,00/ }));
  expect((screen.getAllByLabelText("Importo della quota")[1] as HTMLInputElement).value).toBe("500.00");
  expect(screen.getByText(/tutto assegnato/)).toBeTruthy();
});
