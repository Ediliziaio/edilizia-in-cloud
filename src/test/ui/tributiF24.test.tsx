import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("sonner", () => ({ toast: mock.toast }));
vi.mock("@/lib/finance/bankWorkspace", async (o) => ({ ...(await o<object>()), bankRpc: mock.rpc }));
import { TributiF24 } from "@/components/tesoreria/TributiF24";
import { mostraTributiF24 } from "@/lib/finance/tributiF24";

const movimento = { id: "tx", amount: -4200, currency: "EUR", booking_date: "2026-10-16", chiuso_senza_documento: null, links: { remaining: 4200 } } as never;

function conClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
function rispondi(proposta: unknown) {
  mock.rpc.mockImplementation(async (fn: string) => (fn === "tesoreria_f24_proposte" ? proposta : {}));
}

beforeEach(() => { vi.clearAllMocks(); });

describe("F24 da gestire nel popup del movimento", () => {
  it("compare solo per un'uscita F24 da gestire, non chiusa e con qualcosa da collegare", () => {
    const m = { amount: -100, chiuso_senza_documento: null, links: { remaining: 100 } } as never;
    expect(mostraTributiF24("f24", "da_gestire", m)).toBe(true);
    expect(mostraTributiF24("f24", "proposta", m)).toBe(false);
    expect(mostraTributiF24("documento", "da_gestire", m)).toBe(false);
    expect(mostraTributiF24("f24", "da_gestire", { amount: -100, chiuso_senza_documento: "nessun_costo", links: { remaining: 100 } } as never)).toBe(false);
    expect(mostraTributiF24("f24", "da_gestire", { amount: -100, chiuso_senza_documento: null, links: { remaining: 0 } } as never)).toBe(false);
    expect(mostraTributiF24("f24", "da_gestire", { amount: 100, chiuso_senza_documento: null, links: { remaining: 100 } } as never)).toBe(false);
  });

  it("le righe del modulo F24 che sommano l'importo si chiudono con tesoreria_f24_registra", async () => {
    rispondi({ residuo: 4200, tipo_suggerito: "ritenute", candidati: [{ chiave: "f24m:x", forza: "media", motivi: ["Somma esatta di 2 righe del modulo F24"],
      righe: [{ tipo: "f24", id: "a", titolo: "F24 09/2026 · 1001", quota: 2280 }, { tipo: "f24", id: "b", titolo: "F24 09/2026 · 1040", quota: 1920 }] }] });
    const fatto = vi.fn();
    conClient(<TributiF24 company="c" movement={movimento} onFatto={fatto} />);
    fireEvent.click(await screen.findByRole("button", { name: "Conferma F24 09/2026 · 1001 + F24 09/2026 · 1040" }));
    await waitFor(() => expect(fatto).toHaveBeenCalled());
    expect(mock.rpc).toHaveBeenCalledWith("tesoreria_f24_registra", { p_company: "c", p_tx: "tx", p_f24: ["a", "b"], p_tipo: null, p_note: null });
  });

  it("le scadenze fiscali passano dalla conferma di sempre", async () => {
    rispondi({ residuo: 4200, tipo_suggerito: null, candidati: [{ chiave: "f24s:s", forza: "media", motivi: ["Stesso importo di una scadenza fiscale"],
      righe: [{ tipo: "scadenza", id: "s", titolo: "F24 IVA ottobre", quota: 4200 }] }] });
    const fatto = vi.fn();
    conClient(<TributiF24 company="c" movement={movimento} onFatto={fatto} />);
    fireEvent.click(await screen.findByRole("button", { name: "Conferma F24 IVA ottobre" }));
    await waitFor(() => expect(fatto).toHaveBeenCalled());
    expect(mock.rpc).toHaveBeenCalledWith("tesoreria_conferma_alternativa", { p_company: "c", p_tx: "tx", p_note: null, p_rows: [{ tipo: "scadenza", id: "s", importo: 4200 }] });
  });

  it("senza niente da abbinare si registra come «Tributi pagati», col tipo suggerito e una conferma", async () => {
    rispondi({ residuo: 4200, tipo_suggerito: "contributi", candidati: [] });
    const fatto = vi.fn();
    conClient(<TributiF24 company="c" movement={movimento} onFatto={fatto} />);
    expect(await screen.findByText(/Nessuna scadenza fiscale/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contributi" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "IVA" }));
    fireEvent.click(screen.getByRole("button", { name: "Registra" }));
    // Niente parte prima della conferma.
    expect(mock.rpc).not.toHaveBeenCalledWith("tesoreria_f24_registra", expect.anything());
    expect(screen.getByText(/Tributi pagati · IVA/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sì, registra" }));
    await waitFor(() => expect(fatto).toHaveBeenCalled());
    expect(mock.rpc).toHaveBeenCalledWith("tesoreria_f24_registra", { p_company: "c", p_tx: "tx", p_f24: null, p_tipo: "iva", p_note: null });
  });

  it("senza tipo suggerito il pulsante resta spento finché non si sceglie", async () => {
    rispondi({ residuo: 4200, tipo_suggerito: null, candidati: [] });
    conClient(<TributiF24 company="c" movement={movimento} onFatto={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Registra" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Altro" }));
    expect(screen.getByRole("button", { name: "Registra" })).toBeEnabled();
  });

  it("l'errore del database arriva com'è", async () => {
    mock.rpc.mockImplementation(async (fn: string) => {
      if (fn === "tesoreria_f24_proposte") return { residuo: 4200, tipo_suggerito: "iva", candidati: [] };
      throw { message: "Il movimento è già interamente collegato", code: "22023" };
    });
    conClient(<TributiF24 company="c" movement={movimento} onFatto={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Registra" }));
    fireEvent.click(screen.getByRole("button", { name: "Sì, registra" }));
    await waitFor(() => expect(mock.toast.error).toHaveBeenCalled());
    expect(mock.toast.error.mock.calls[0][0]).toContain("già interamente collegato");
  });

  it("chi non vede la prima nota non vede il pannello", async () => {
    mock.rpc.mockRejectedValue(new Error("Non hai accesso alla prima nota"));
    const { container } = conClient(<TributiF24 company="c" movement={movimento} onFatto={vi.fn()} />);
    await waitFor(() => expect(mock.rpc).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
