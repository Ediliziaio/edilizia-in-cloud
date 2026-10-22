import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BulkPriceAdjustDialog } from "@/components/settings/BulkPriceAdjustDialog";
import type { Tariffa } from "@/pages/azienda/settings/SettingsTariffe/types";

const api = vi.hoisted(() => ({
  applica: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: api.success, error: api.error },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      let payload: unknown;
      const filtri: Record<string, string> = {};
      const builder = {
        update: (p: unknown) => {
          payload = p;
          return builder;
        },
        eq: (key: string, value: string) => {
          filtri[key] = value;
          return builder;
        },
        select: () => builder,
        single: () => api.applica(payload, filtri),
      };
      return builder;
    },
  },
}));
const voce = (id: string, prezzo = 100): Tariffa => ({
  id,
  company_id: "company-demo",
  nome: id,
  tipo: "posa",
  unita_fatturazione: "pz",
  prezzo_vendita: prezzo,
  costo_interno: 60,
  attivo: true,
});
const props = {
  open: true,
  onClose: vi.fn(),
  onApplied: vi.fn(),
  isAdmin: true,
  companyId: "company-demo",
};
function apri(items: Tariffa[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalida = vi.spyOn(client, "invalidateQueries");
  const vista = (voci: Tariffa[]) => (
    <QueryClientProvider client={client}>
      <BulkPriceAdjustDialog {...props} items={voci} />
    </QueryClientProvider>
  );
  const r = render(vista(items));
  return { invalida, cambia: (voci: Tariffa[]) => r.rerender(vista(voci)) };
}
beforeEach(() => {
  vi.clearAllMocks();
  api.applica
    .mockReset()
    .mockImplementation(async (_p: unknown, f: { id: string }) => ({
      data: { id: f.id },
      error: null,
    }));
});
afterEach(cleanup);

describe("Adeguamento tariffe: scritture confermate e ripresa parziale", () => {
  it("verifica la riga scritta e il filtro aziendale, conservando quattro decimali", async () => {
    apri([voce("t1", 0.0044)]);
    expect(screen.getByText("0,0046", { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Applica a 1 voce" }));
    await waitFor(() => expect(api.success).toHaveBeenCalledOnce());
    expect(api.applica).toHaveBeenCalledWith(
      { prezzo_vendita: 0.0046 },
      { id: "t1", company_id: "company-demo" },
    );
  });
  it("non dichiara successo quando una riga non è stata aggiornata", async () => {
    api.applica.mockResolvedValue({ data: null, error: null });
    const { invalida } = apri([voce("t1")]);
    fireEvent.click(screen.getByRole("button", { name: "Applica a 1 voce" }));
    await waitFor(() =>
      expect(api.error).toHaveBeenCalledWith(
        expect.stringContaining("Voce non aggiornata"),
      ),
    );
    expect(api.success).not.toHaveBeenCalled();
    expect(props.onApplied).not.toHaveBeenCalled();
    expect(invalida).toHaveBeenCalled();
  });
  it("dopo un salvataggio parziale rinfresca il listino e riprova solo i prezzi originali rimasti", async () => {
    api.applica
      .mockResolvedValueOnce({ data: { id: "t1" }, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: new Error("Connessione interrotta"),
      });
    const { invalida, cambia } = apri([voce("t1"), voce("t2", 200)]);
    fireEvent.click(screen.getByRole("button", { name: "Applica a 2 voci" }));
    await waitFor(() =>
      expect(screen.getByText(/1 di 2 voci aggiornate/)).toBeInTheDocument(),
    );
    expect(invalida).toHaveBeenCalled();
    expect(screen.getByLabelText("Valore")).toBeDisabled();
    // La pagina riceve i nuovi prezzi dal refetch: non bisogna applicare di nuovo il +5%.
    cambia([voce("t1", 105), voce("t2", 200)]);
    // Il refetch della tabella azzera anche la selezione del parent.
    cambia([]);
    expect(screen.getByText(/Applica un adeguamento a 2 voci selezionate/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Riprova sulla 1 voce" }),
    );
    await waitFor(() => expect(api.success).toHaveBeenCalledOnce());
    expect(api.applica.mock.calls.map((c) => c[1].id)).toEqual([
      "t1",
      "t2",
      "t2",
    ]);
    expect(api.applica.mock.calls[2][0]).toEqual({ prezzo_vendita: 210 });
    expect(props.onApplied).toHaveBeenCalledOnce();
  });
  it("non trasforma un costo sconosciuto in un costo fittizio durante l'adeguamento", async () => {
    apri([{ ...voce("t1"), costo_interno: 0, prezzo_costo: 0 }]);
    fireEvent.click(screen.getByText("Entrambi", { exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Applica a 1 voce" }));
    await waitFor(() => expect(api.success).toHaveBeenCalledOnce());
    expect(api.applica.mock.calls[0][0]).toEqual({ prezzo_vendita: 105 });
  });
});

describe("Adeguamento tariffe: le voci con prezzo dal costo (22/10/2026)", () => {
  const dalCosto = (id: string): Tariffa => ({ ...voce(id, 75), costo_interno: 60, prezzo_modo: "dal_costo", ricarico_pct: 25 });

  it("se cambia solo il costo, il prezzo lo segue col suo ricarico, e l'anteprima mostra quello che si scrive", async () => {
    apri([dalCosto("t1")]);
    fireEvent.click(screen.getByText("Costo interno", { exact: true }));
    // costo 60 → 63 (+5%), ricarico 25% → prezzo 78,75
    expect(screen.getByText("78,75", { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Applica a 1 voce" }));
    await waitFor(() => expect(api.success).toHaveBeenCalledOnce());
    expect(api.applica.mock.calls[0][0]).toEqual({ prezzo_vendita: 78.75, costo_interno: 63, costo_default: 63, prezzo_costo: 63 });
  });

  it("se cambia il prezzo, la voce diventa a prezzo libero, e lo dice prima", async () => {
    apri([dalCosto("t1")]);
    expect(screen.getByText(/diventa a\s+prezzo libero/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Applica a 1 voce" }));
    await waitFor(() => expect(api.success).toHaveBeenCalledOnce());
    expect(api.applica.mock.calls[0][0]).toEqual({ prezzo_vendita: 78.75, prezzo_modo: "libero", ricarico_pct: null });
  });
});
