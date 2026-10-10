import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const update = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ update }) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RientroLeadCard } from "@/components/integrations/RientroLeadCard";
import { confermaNavigazioneImpostazioni } from "@/hooks/useSettingsDraftGuard";

const integrazione = { id: "i1", company_id: "c1", provider: "meta", status: "connected", rientro_lead_modo: "off", rientro_lead_giorni: 90 } as never;
const monta = (canManage = true, integration = integrazione) =>
  render(<QueryClientProvider client={new QueryClient()}><RientroLeadCard integration={integration} canManage={canManage} /></QueryClientProvider>);

afterEach(() => cleanup());

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

  // 09/10/2026: sta sotto l'elenco dei moduli, chiusa finché la regola è «Come prima».
  it("è chiusa se la regola è «Come prima» e aperta da sola se è già attiva", () => {
    monta();
    expect((screen.getByRole("heading", { level: 2, name: "Lead che rientrano" }).closest("details") as HTMLDetailsElement).open).toBe(false);
    cleanup();
    monta(true, { ...(integrazione as object), rientro_lead_modo: "blocca" } as never);
    expect((screen.getByRole("heading", { level: 2, name: "Lead che rientrano" }).closest("details") as HTMLDetailsElement).open).toBe(true);
    // A scheda chiusa dice quale regola c'è, con parole diverse dai titoli delle tre scelte.
    expect(screen.getByText("Non li fa rientrare")).toBeTruthy();
  });
  it("una modifica non salvata chiede conferma prima di uscire", () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    monta();
    expect(confermaNavigazioneImpostazioni()).toBe(true);
    expect(conferma).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/Non farlo rientrare/));
    expect(confermaNavigazioneImpostazioni()).toBe(false);
    expect(conferma).toHaveBeenCalledOnce();
    conferma.mockRestore();
  });
  it("chi non può modificare non ha bozze da proteggere", () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    monta(false);
    expect(confermaNavigazioneImpostazioni()).toBe(true);
    expect(conferma).not.toHaveBeenCalled();
    conferma.mockRestore();
  });
});
