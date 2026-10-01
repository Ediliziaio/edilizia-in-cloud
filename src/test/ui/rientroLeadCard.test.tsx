import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const update = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ update }) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RientroLeadCard } from "@/components/integrations/RientroLeadCard";

const integrazione = { id: "i1", company_id: "c1", provider: "meta", status: "connected", rientro_lead_modo: "off", rientro_lead_giorni: 90 } as never;
const monta = (canManage = true) =>
  render(<QueryClientProvider client={new QueryClient()}><RientroLeadCard integration={integrazione} canManage={canManage} /></QueryClientProvider>);

describe("Lead che rientrano (impostazioni Meta)", () => {
  it("mostra le tre scelte, spenta di serie e Salva disabilitato finché non cambia", () => {
    monta();
    expect(screen.getByText("Come prima")).toBeTruthy();
    expect(screen.getByText("Fai entrare, ma segnala")).toBeTruthy();
    expect(screen.getByText("Non farlo rientrare")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Salva" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("scegliendo «Non farlo rientrare» compaiono i giorni e si può salvare", () => {
    monta();
    fireEvent.click(screen.getByLabelText(/Non farlo rientrare/));
    expect(screen.getByLabelText(/Vale se l'ultima chiusura/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Salva" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("Modifiche non salvate.")).toBeTruthy();
  });
  it("giorni fuori scala bloccano il salvataggio", () => {
    monta();
    fireEvent.click(screen.getByLabelText(/Non farlo rientrare/));
    fireEvent.change(screen.getByLabelText(/Vale se l'ultima chiusura/), { target: { value: "0" } });
    expect((screen.getByRole("button", { name: "Salva" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("senza permesso non si può salvare", () => {
    monta(false);
    expect(screen.queryByRole("button", { name: "Salva" })).toBeNull();
    expect(screen.getByText(/Solo un amministratore/)).toBeTruthy();
  });
});
