import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, it, expect, vi } from "vitest";
const t = vi.hoisted(() => ({
  rpc: vi.fn(),
  released: vi.fn(),
  close: vi.fn(),
}));
vi.mock("@/lib/fatturazione/fiscalCommands", () => ({ fiscalCommand: t.rpc }));
vi.mock("@/components/fatturazione/FiscalPeriodControl", () => ({
  FiscalHistory: () : null => null,
}));
import { FiscalReleaseDialog } from "@/components/fatturazione/FiscalReleaseDialog";
function mostra() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <FiscalReleaseDialog
        companyId="company"
        id="garanzia"
        onClose={t.close}
        onReleased={t.released}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  t.rpc.mockImplementation(async (name: string) =>
    name === "fiscalita_svincolo_anteprima"
      ? {
          versione: "versione1",
          registrazione: { stato: "trattenuta", importo: 200 },
        }
      : { registrazione: { stato: "svincolata" }, incasso_registrato: false },
  );
});
describe("svincolo dal subappaltatore", () => {
  it("richiede riferimento e usa la versione verificata senza registrare pagamenti", async () => {
    mostra();
    const b = await screen.findByRole("button", {
      name: "Conferma svincolo documentato",
    });
    expect(b).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Verbale \/ attestazione/), {
      target: { value: "VERBALE DEMO SVINCOLO 27" },
    });
    fireEvent.click(b);
    await waitFor(() => expect(t.released).toHaveBeenCalledTimes(1));
    expect(t.rpc).toHaveBeenCalledWith(
      "fiscalita_svincola",
      expect.objectContaining({
        p_company: "company",
        p_id: "garanzia",
        p_versione: "versione1",
        p_riferimento: "VERBALE DEMO SVINCOLO 27",
      }),
    );
    expect(t.close).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("non conferma un errore e permette di ricaricare la verifica", async () => {
    t.rpc.mockImplementation(async (name: string) => {
      if (name === "fiscalita_svincolo_anteprima")
        return {
          versione: "v",
          registrazione: { stato: "trattenuta", importo: 200 },
        };
      throw Error("Ritenuta cambiata: aggiorna prima di confermare");
    });
    mostra();
    await screen.findByRole("button", {
      name: "Conferma svincolo documentato",
    });
    fireEvent.change(screen.getByPlaceholderText(/Verbale \/ attestazione/), {
      target: { value: "VERBALE DEMO" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Conferma svincolo documentato" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ritenuta cambiata",
    );
    expect(t.released).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ricarica verifica" }));
    await waitFor(() =>
      expect(
        t.rpc.mock.calls.filter((c) => c[0] === "fiscalita_svincolo_anteprima"),
      ).toHaveLength(2),
    );
  });
  it("rifiuta una risposta che dichiari un movimento di denaro", async () => {
    t.rpc.mockImplementation(async (name: string) =>
      name === "fiscalita_svincolo_anteprima"
        ? {
            versione: "v",
            registrazione: { stato: "trattenuta", importo: 200 },
          }
        : { registrazione: { stato: "svincolata" }, incasso_registrato: true },
    );
    mostra();
    await screen.findByRole("button", {
      name: "Conferma svincolo documentato",
    });
    fireEvent.change(screen.getByPlaceholderText(/Verbale \/ attestazione/), {
      target: { value: "VERBALE DEMO" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Conferma svincolo documentato" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Conferma di svincolo non valida",
    );
    expect(t.released).not.toHaveBeenCalled();
  });
});
