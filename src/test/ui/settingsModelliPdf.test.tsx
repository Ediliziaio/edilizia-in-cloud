import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
const m = vi.hoisted(() => ({
  save: vi.fn(),
  edit: true,
  refetch: vi.fn(),
  data: [] as unknown[],
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "azienda-a", name: "Azienda A" } }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isAdmin: false, canEditSettingsOrders: m.edit }),
}));
vi.mock("@/hooks/useDocumentPdfTemplates", () => ({
  useDocumentPdfTemplates: () => ({
    data: m.data,
    isLoading: false,
    error: null as Error | null,
    save: m.save,
    refetch: m.refetch,
  }),
}));
vi.mock("@/components/shared/PdfBlobLivePreviewPanel", () => ({
  PdfBlobLivePreviewPanel: ({ depsKey }: { depsKey: string }) => (
    <div data-testid="anteprima">{depsKey}</div>
  ),
}));
vi.mock("@/lib/modelliPdf/anteprima", () => ({ anteprimaModello: vi.fn() }));
import SettingsModelliPdf from "@/pages/azienda/settings/SettingsModelliPdf";
beforeEach(() => {
  m.edit = true;
  m.data = [];
  m.save.mockReset().mockImplementation(async (tipo, config) => ({
    document_type: tipo,
    config,
    updated_at: "2026-11-06T12:00:00Z",
  }));
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function open() {
  render(
    <MemoryRouter>
      <SettingsModelliPdf />
    </MemoryRouter>,
  );
}
describe("Pagina modelli PDF", () => {
  it("mostra la libreria e cambia davvero modello e anteprima", () => {
    open();
    expect(
      screen.getByRole("region", { name: "Libreria modelli PDF" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Nome del modello")).toHaveValue(
      "Ordini d’acquisto",
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Standard Rapportino giornaliero/ }),
    );
    expect(screen.getByLabelText("Nome del modello")).toHaveValue(
      "Rapportino giornaliero",
    );
    expect(screen.getByTestId("anteprima")).toHaveTextContent("rapportino");
    expect(screen.queryByLabelText("Spazio per l’accettazione")).toBeNull();
  });
  it("salva solo il modello scelto, e il ripristino è una bozza prima del salvataggio", async () => {
    open();
    fireEvent.change(screen.getByLabelText("Titolo nel PDF"), {
      target: { value: "ORDINE PERSONALIZZATO" },
    });
    expect(screen.getByTestId("anteprima")).toHaveTextContent(
      "ORDINE PERSONALIZZATO",
    );
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() =>
      expect(m.save).toHaveBeenCalledWith(
        "materiali",
        expect.objectContaining({ titolo: "ORDINE PERSONALIZZATO" }),
        null,
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Salva modello" }),
      ).toBeDisabled(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Ripristina standard" }),
    );
    expect(screen.getByLabelText("Titolo nel PDF")).toHaveValue("");
    expect(m.save).toHaveBeenCalledTimes(1);
  });
  it("un errore conserva le modifiche e consente di riprovare", async () => {
    m.save.mockRejectedValueOnce(
      new Error("Modello aggiornato da un altro terminale"),
    );
    open();
    fireEvent.change(screen.getByLabelText("Titolo nel PDF"), {
      target: { value: "Da conservare" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "altro terminale",
    );
    expect(screen.getByLabelText("Titolo nel PDF")).toHaveValue(
      "Da conservare",
    );
    expect(screen.getByRole("button", { name: "Salva modello" })).toBeEnabled();
  });
  it("cambiare modello con una bozza richiede una scelta e non scarta il testo se si annulla", () => {
    open();
    vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.change(screen.getByLabelText("Titolo nel PDF"), {
      target: { value: "Bozza" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Standard Richieste d’offerta/ }),
    );
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Titolo nel PDF")).toHaveValue("Bozza");
  });
  it("chi può consultare non può salvare né cambiare i campi", () => {
    m.edit = false;
    open();
    expect(screen.getByLabelText("Titolo nel PDF")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Salva modello" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Ripristina standard" }),
    ).toBeDisabled();
  });
});

it("non invia due salvataggi mentre il primo è in corso", async () => {
  let done!: (v: unknown) => void;
  m.save.mockImplementation(
    () =>
      new Promise((r) => {
        done = r;
      }),
  );
  open();
  fireEvent.change(screen.getByLabelText("Titolo nel PDF"), {
    target: { value: "Prova" },
  });
  const button = screen.getByRole("button", { name: "Salva modello" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(m.save).toHaveBeenCalledTimes(1);
  done({ config: { titolo: "Prova" }, updated_at: "nuova" });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Salva modello" }),
    ).toBeDisabled(),
  );
});

it("applica uno stile senza cancellare i testi e salva le nuove opzioni", async () => {
  open();
  fireEvent.change(screen.getByLabelText("Testo introduttivo"), {
    target: { value: "Messaggio aziendale da conservare" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Classico" }),
  );
  expect(screen.getByLabelText("Testo introduttivo")).toHaveValue(
    "Messaggio aziendale da conservare",
  );
  expect(screen.getByLabelText("Margini laterali")).toHaveValue("18");
  fireEvent.change(screen.getByLabelText("Nota su ogni pagina"), {
    target: { value: "Ufficio acquisti" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
  await waitFor(() =>
    expect(m.save).toHaveBeenCalledWith(
      "materiali",
      expect.objectContaining({
        margine: 18,
        dimensioneTesto: 10,
        carattere: "times",
        notaPagina: "Ufficio acquisti",
        introduzione: "Messaggio aziendale da conservare",
      }),
      null,
    ),
  );
});
