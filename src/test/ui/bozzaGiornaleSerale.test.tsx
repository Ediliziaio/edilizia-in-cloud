// L'interruttore della bozza serale: legge e scrive companies.giornale_auto_enabled, e chi non ha il permesso lo vede spento.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({
  valore: false,
  aggiornamenti: [] as Array<Record<string, unknown>>,
  righe: [{ id: "az" }] as Array<{ id: string }>,
  ok: vi.fn(), ko: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: stato.ok, error: stato.ko } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { giornale_auto_enabled: stato.valore }, error: null as unknown }) }) }),
      update: (patch: Record<string, unknown>) => {
        stato.aggiornamenti.push(patch);
        return { eq: () => ({ select: async () => ({ data: stato.righe, error: null as unknown }) }) };
      },
    }),
  },
}));

import { BozzaGiornaleSerale } from "@/components/settings/BozzaGiornaleSerale";

const apri = (canEdit: boolean) => render(
  <QueryClientProvider client={new QueryClient()}><BozzaGiornaleSerale companyId="az" canEdit={canEdit} /></QueryClientProvider>,
);
const interruttore = () => screen.getByRole("switch", { name: /Prepara ogni sera la bozza del giornale/ });

beforeEach(() => { stato.valore = false; stato.aggiornamenti = []; stato.righe = [{ id: "az" }]; stato.ok.mockReset(); stato.ko.mockReset(); });
afterEach(cleanup);

describe("BozzaGiornaleSerale", () => {
  it("dice cosa fa, parte spento e si accende scrivendo la colonna dell'azienda", async () => {
    apri(true);
    expect(screen.getByText("Ogni sera prepara una bozza per i cantieri con lavoro registrato. Nessuna pagina viene firmata da sola.")).toBeInTheDocument();
    await waitFor(() => expect(interruttore()).toBeEnabled());
    expect(interruttore()).toHaveAttribute("data-state", "unchecked");
    fireEvent.click(interruttore());
    await waitFor(() => expect(stato.aggiornamenti).toEqual([{ giornale_auto_enabled: true }]));
    await waitFor(() => expect(stato.ok).toHaveBeenCalledWith("Bozza serale accesa"));
  });

  it("senza permesso resta fermo e dice chi lo cambia", async () => {
    stato.valore = true;
    apri(false);
    await waitFor(() => expect(interruttore()).toHaveAttribute("data-state", "checked"));
    expect(interruttore()).toBeDisabled();
    expect(screen.getByText(/La cambia chi può modificare il profilo/)).toBeInTheDocument();
  });

  it("se il database non tocca righe lo dice, non finge", async () => {
    stato.righe = [];
    apri(true);
    await waitFor(() => expect(interruttore()).toBeEnabled());
    fireEvent.click(interruttore());
    await waitFor(() => expect(stato.ko).toHaveBeenCalled());
    expect(stato.ok).not.toHaveBeenCalled();
  });
});
