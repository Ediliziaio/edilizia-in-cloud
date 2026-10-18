import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ValoriCostoPersonale } from "@/components/employees/ValoriCostoPersonale";
import { costoMensileVero, profiloCostoDipendente } from "@/lib/costoPersonale";

const state = vi.hoisted(() => ({ role: "company_admin", righe: [] as Record<string, unknown>[], rpc: vi.fn(), success: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: state.role, effectiveCompany: { id: "company" } }) }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    const q: Record<string, unknown> = {};
    q.select = () => q; q.eq = () => q;
    q.then = (yes: (r: unknown) => unknown) => Promise.resolve({ data: state.righe, error: null }).then(yes);
    return q;
  },
  rpc: async (fn: string, args: unknown): Promise<{ data: unknown; error: unknown }> => { state.rpc(fn, args); return { data: null, error: null }; },
} }));

const apri = () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ValoriCostoPersonale /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Valori del costo" }));
};

beforeEach(() => { vi.clearAllMocks(); state.role = "company_admin"; state.righe = []; });
afterEach(cleanup);

describe("Valori del costo del personale", () => {
  it("parte dai valori edili e mostra quanto costa un'ora d'esempio", async () => {
    apri();
    expect(await screen.findByLabelText(/Cassa Edile/)).toHaveValue("22");
    // 2.000 € × 12 × 167,01 % ÷ (173 × 12 × 90 %) = 21,45
    expect(screen.getByText(/21,45/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salva" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Torna ai valori edili" })).toBeDisabled();
  });

  it("l'impiegato ha 14 mensilità e niente Cassa Edile", async () => {
    apri();
    fireEvent.click(screen.getByRole("tab", { name: "Impiegato" }));
    expect(await screen.findByLabelText(/Mensilità/)).toHaveValue("14");
    expect(screen.getByLabelText(/Cassa Edile/)).toHaveValue("0");
  });

  it("il titolare cambia un valore e lo salva per quel tipo", async () => {
    apri();
    fireEvent.change(await screen.findByLabelText(/INAIL/), { target: { value: "5,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("costo_personale_parametri_salva", {
      p_profilo: "operaio",
      p_valori: { mensilita: 12, inps: 29.6, inail: 5.5, cassa_edile: 22, tfr: 7.41, altri: 0, ore_produttive: 90 },
    }));
    expect(state.success).toHaveBeenCalledWith("Operaio: valori salvati");
  });

  it("un valore fuori misura non si salva", async () => {
    apri();
    fireEvent.change(await screen.findByLabelText(/Ore produttive/), { target: { value: "120" } });
    expect(screen.getByRole("button", { name: "Salva" })).toBeDisabled();
    expect(screen.getByText("Controlla i valori segnati in rosso.")).toBeInTheDocument();
  });

  it("chi non è titolare li vede ma non li cambia", async () => {
    state.role = "company_staff";
    apri();
    expect(await screen.findByLabelText(/INAIL/)).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Salva" })).toBeNull();
    expect(screen.getByText("Solo il titolare può cambiare questi valori.")).toBeInTheDocument();
  });
});

describe("tipo di dipendente e costo del mese", () => {
  it("ricava il tipo da ruolo e qualifica, la scelta sulla scheda vince", () => {
    expect(profiloCostoDipendente({ role_type: "Muratore" })).toBe("operaio");
    expect(profiloCostoDipendente({ role_type: "staff_interno" })).toBe("impiegato");
    expect(profiloCostoDipendente({ role_type: "operaio", area: "amministrazione" })).toBe("impiegato");
    expect(profiloCostoDipendente({ role_type: "operaio", qualifica: "Apprendista tecnico impianti" })).toBe("apprendista");
    expect(profiloCostoDipendente({ role_type: "staff_interno", profilo_costo: "operaio" })).toBe("operaio");
  });
  it("il mese medio dell'impiegato conta 13ª e 14ª", () => {
    // 1.500 × 14 / 12 × 137,51 % = 2.406,43
    expect(costoMensileVero({ role_type: "staff_interno", gross_salary: 1500, inps_rate: null })).toBe(2406.43);
    expect(costoMensileVero({ gross_salary: 0 })).toBe(0);
  });
});
