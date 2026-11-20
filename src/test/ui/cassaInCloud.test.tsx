import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import SettingsCassaInCloud from "@/pages/azienda/settings/SettingsCassaInCloud";
import ScontriniCassa from "@/pages/azienda/fatturazione/ScontriniCassa";
import type { CollegamentoCassa } from "../../../shared/cassaInCloud";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  from: vi.fn(),
  permessi: { isLoading: false, canEditSettingsIntegrations: true, solaLettura: false },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke }, from: mocks.from } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-di-prova" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => mocks.permessi }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const negozio: CollegamentoCassa = { punto_vendita_id: "259", nome: "Negozio Roma", ultimo_import: null };

function vista(ui: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.from.mockReset();
  mocks.permessi.solaLettura = false;
});
afterEach(cleanup);

describe("Integrazione scontrini", () => {
  it("verifica la chiave, impedisce la scelta di un punto con partita IVA diversa e salva quello confermato", async () => {
    let collegato = false;
    mocks.invoke.mockImplementation(async (_funzione, { body }) => {
      if (body.action === "verifica") return { data: { punti: [
        { id: "259", nome: negozio.nome, citta: "Roma", partita_iva: "11111111111", compatibile: true },
        { id: "260", nome: "Altra società", citta: "Roma", partita_iva: "22222222222", compatibile: false },
      ] } };
      if (body.action === "collega") { collegato = true; return { data: { ok: true } }; }
      return { data: { collegamenti: collegato ? [negozio] : [] } };
    });
    vista(<SettingsCassaInCloud />);
    const password = screen.getByLabelText("Chiave API di Cassa in Cloud");
    expect(password).toHaveAttribute("type", "password");
    fireEvent.change(password, { target: { value: "chiave-di-prova" } });
    fireEvent.click(screen.getByRole("button", { name: "Verifica chiave" }));
    expect(await screen.findByRole("option", { name: /Altra società/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Collega punto vendita" }));
    expect(await screen.findByRole("list", { name: "Punti vendita collegati" })).toHaveTextContent("Negozio Roma");
    expect(password).toHaveValue("");
    expect(mocks.invoke).toHaveBeenCalledWith("cassa-in-cloud", expect.objectContaining({ body: {
      action: "collega", company_id: "azienda-di-prova", api_key: "chiave-di-prova", punto_vendita_id: "259",
    } }));
  });

  it("permette la consultazione in sola lettura senza mostrare la configurazione della chiave", async () => {
    mocks.permessi.solaLettura = true;
    mocks.invoke.mockResolvedValue({ data: { collegamenti: [negozio] } });
    vista(<SettingsCassaInCloud />);
    expect(await screen.findByRole("list", { name: "Punti vendita collegati" })).toHaveTextContent("Negozio Roma");
    expect(screen.queryByLabelText("Chiave API di Cassa in Cloud")).toBeNull();
    expect(screen.queryByRole("button", { name: "Scollega" })).toBeNull();
  });

  it("importa le finestre nell’ordine corretto e mostra i pagamenti misti dall’archivio", async () => {
    let importato = false;
    mocks.invoke.mockImplementation(async (_funzione, { body }) => {
      if (body.action === "stato") return { data: { collegamenti: [negozio, { ...negozio, punto_vendita_id: "260", nome: "Negozio Milano" }] } };
      importato = true;
      return { data: { importati: 1, assenti: 0 } };
    });
    const rows = [{
      ...negozio, punto_vendita_nome: negozio.nome, esterno_id: "s1", numero: "100", numero_z: "7",
      data: "2025-10-01", ora: "12:30:00", totale: 28, valuta: "EUR", presente_in_cassa: true,
      pagamenti: [
        { tipo: "CASH", importo: 10, differito: false },
        { tipo: "CREDITCARD", importo: 12, differito: false },
        { tipo: "DEFERRED", importo: 6, differito: true },
      ],
    }];
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockReturnThis(),
      abortSignal: async () => ({ data: importato ? rows : [], count: importato ? rows.length : 0 }),
    };
    mocks.from.mockReturnValue(query);
    vista(<ScontriniCassa />);
    const importa = await screen.findByRole("button", { name: "Importa scontrini" });
    expect(importa).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Dal"), { target: { value: "2025-10-01" } });
    fireEvent.change(screen.getByLabelText("Al"), { target: { value: "2025-10-03" } });
    fireEvent.change(screen.getByLabelText("Punto vendita"), { target: { value: "259" } });
    fireEvent.click(importa);
    expect(await screen.findByText(/Contanti · 10,00/)).toBeInTheDocument();
    expect(screen.getByText(/Carta · 12,00/)).toBeInTheDocument();
    expect(screen.getByText("(differito)")).toBeInTheDocument();
    await waitFor(() => expect(importa).toBeEnabled());
    const richieste = mocks.invoke.mock.calls.map(([, { body }]) => body).filter((body) => body.action === "importa");
    expect(richieste).toEqual([
      { action: "importa", company_id: "azienda-di-prova", punto_vendita_id: "259", dal: "2025-10-01", al: "2025-10-02" },
      { action: "importa", company_id: "azienda-di-prova", punto_vendita_id: "259", dal: "2025-10-03", al: "2025-10-03" },
    ]);
    expect(query.eq).toHaveBeenCalledWith("company_id", "azienda-di-prova");
  });
});
