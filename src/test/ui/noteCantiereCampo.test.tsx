/**
 * App di cantiere: le istruzioni dell'ufficio (26/09/2026). L'operaio vede le
 * note per sé, per la sua squadra e per tutti (le filtra il database), quelle
 * importanti evidenziate; entrando, le nuove si segnano come lette una volta.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

import { NoteCantiereCampo } from "@/components/campo/NoteCantiereCampo";

afterEach(() => { cleanup(); rpc.mockReset(); });

const disegna = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <NoteCantiereCampo orderId="o1" />
  </QueryClientProvider>,
);

describe("Istruzioni dall'ufficio nell'app", () => {
  it("mostra le note e segna come lette solo le nuove", async () => {
    rpc.mockImplementation((nome: string) => {
      if (nome === "campo_note_cantiere") {
        return Promise.resolve({ data: [
          { id: "n1", testo: "Chiudere l'acqua generale prima di tagliare i tubi.", importante: true, per: "squadra", per_chi: "Per la Squadra Finiture", fase: "Impianto idraulico", autore: "Florin", creata_il: "2026-09-26T10:00:00Z", letta: false },
          { id: "n2", testo: "Parcheggio solo nel cortile interno.", importante: false, per: "tutti", per_chi: "Per tutti", fase: null, autore: "Florin", creata_il: "2026-09-25T10:00:00Z", letta: true },
        ], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    disegna();
    expect(await screen.findByText("Istruzioni dall'ufficio")).toBeInTheDocument();
    expect(screen.getByText("Importante")).toBeInTheDocument();
    expect(screen.getByText("Per la Squadra Finiture")).toBeInTheDocument();
    expect(screen.getByText("· Impianto idraulico")).toBeInTheDocument();
    expect(screen.getAllByText("Nuova")).toHaveLength(1);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("campo_nota_letta", { p_nota_id: "n1" }));
    expect(rpc).not.toHaveBeenCalledWith("campo_nota_letta", { p_nota_id: "n2" });
  });

  it("senza note non occupa spazio", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { container } = disegna();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
