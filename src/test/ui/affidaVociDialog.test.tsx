/**
 * «Affida le voci alle ditte» (10/11/2026, lotto 4): si scelgono voci o una fase intera, la ditta,
 * e si chiama affida_voci; una quota si cambia o si toglie; una quota a contratto non si tocca;
 * le voci già piene non si scelgono.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AffidaVociDialog } from "@/components/orders/AffidaVociDialog";

const finto = vi.hoisted(() => {
  const affidamenti: Array<Record<string, unknown>> = [
    { id: "q1", voce_id: "v2", subappaltatore_id: "bianchi", quantita: 420, prezzo_unitario: 8, origine_prezzo: "listino_ditta", comprende: "posa", stato: "a_contratto" },
  ];
  const ditte: Array<Record<string, unknown>> = [
    { id: "rossi", ragione_sociale: "Rossi srl", is_active: true },
    { id: "bianchi", ragione_sociale: "Bianchi srl", is_active: true },
  ];
  const catena = (tabella: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {};
    for (const m of ["select", "eq", "order", "limit"]) c[m] = () => c;
    const righe = tabella === "subappalto_affidamenti" ? affidamenti : tabella === "subappaltatori" ? ditte : [];
    c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve({ data: righe, error: null as null }).then(ok, ko);
    return c;
  };
  const rpc = vi.fn(async () => ({ data: { affidate: 2, gia_piene: 0 }, error: null as null }));
  return { catena, rpc };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => finto.catena(t), rpc: finto.rpc } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Il menu della commessa (Radix) aperto dentro la finestra in jsdom va in ciclo: qui una tendina semplice,
// con la stessa etichetta e gli stessi valori.
vi.mock("@/components/orders/OfficeSelect", () => ({
  OfficeSelect: ({ label, value, onValueChange, options }: { label: string; value: string; onValueChange: (v: string) => void; options: Array<{ value: string; label: string }> }) => (
    <select aria-label={label} value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="">—</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}));

afterEach(() => { cleanup(); finto.rpc.mockClear(); });

const voci = [
  { id: "v1", phase_id: "f1", descrizione: "Intonaco civile", unita: "mq", quantita: 420, importo: 11970, costo_materiali: 3 },
  { id: "v2", phase_id: "f1", descrizione: "Rasatura", unita: "mq", quantita: 420, importo: 6030, costo_materiali: 0 },
  { id: "v3", phase_id: "f2", descrizione: "Massetto", unita: "mq", quantita: 100, importo: 2500, costo_materiali: 5 },
];
const fasi = [{ id: "f1", name: "Intonaci", position: 1 }, { id: "f2", name: "Sottofondi", position: 2 }];

function apri() {
  const cambio = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AffidaVociDialog orderId="o1" companyId="az" voci={voci} fasi={fasi} onChiudi={vi.fn()} onCambio={cambio} />
    </QueryClientProvider>,
  );
  return cambio;
}

describe("Affida le voci alle ditte", () => {
  it("riepilogo e stato delle voci: la quota a contratto non si cambia, la voce piena non si sceglie", async () => {
    apri();
    expect(await screen.findByText("Intonaco civile")).toBeInTheDocument();
    expect(screen.getByText("2 voci su 3")).toBeInTheDocument();
    const quota = screen.getByRole("button", { name: "Quota di Bianchi srl su Rasatura" });
    expect(quota).toBeDisabled();
    expect(quota.textContent).toMatch(/a contratto/);
    expect(screen.getByRole("checkbox", { name: "Scegli Rasatura" })).toBeDisabled();
  });

  it("scegliere una fase intera prende solo le voci libere, e «Affida» chiama affida_voci", async () => {
    const cambio = apri();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Scegli tutte le voci libere di Intonaci" }));
    expect(screen.getByText("1 voce scelta")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Scegli Massetto" }));
    expect(screen.getByText("2 voci scelte")).toBeInTheDocument();
    // La ditta si sceglie dal menu; senza, «Affida» resta spento.
    expect(screen.getByRole("button", { name: "Affida" })).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox", { name: "Ditta" }), { target: { value: "rossi" } });
    fireEvent.click(screen.getByRole("button", { name: "Affida" }));
    await waitFor(() => expect(finto.rpc).toHaveBeenCalledWith("affida_voci", {
      p_order: "o1", p_subappaltatore: "rossi", p_voci: [{ voce_id: "v1" }, { voce_id: "v3" }], p_comprende: "posa",
    }));
    await waitFor(() => expect(cambio).toHaveBeenCalled());
  });

  it("una voce sola si può affidare in parte, scrivendo la quantità", async () => {
    apri();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Scegli Intonaco civile" }));
    fireEvent.change(screen.getByLabelText("Quantità da affidare (vuoto = tutto il resto)"), { target: { value: "300" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Ditta" }), { target: { value: "rossi" } });
    fireEvent.click(screen.getByRole("button", { name: "Affida" }));
    await waitFor(() => expect(finto.rpc).toHaveBeenCalledWith("affida_voci", expect.objectContaining({ p_voci: [{ voce_id: "v1", quantita: 300 }] })));
  });

  it("solo senza ditta nasconde le voci già piene", async () => {
    apri();
    await screen.findByText("Rasatura");
    fireEvent.click(screen.getByRole("switch", { name: "Solo le voci senza ditta" }));
    expect(screen.queryByText("Rasatura")).not.toBeInTheDocument();
    const intonaci = screen.getByRole("region", { name: "Intonaci" });
    expect(within(intonaci).getByText("Intonaco civile")).toBeInTheDocument();
  });
});
