import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RiferimentoPscPos } from "@/components/sicurezza/pos/RiferimentoPscPos";
const mocks = vi.hoisted(() => ({
  query: {
    data: [] as unknown[],
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  identifica: vi.fn(),
  ro: false,
}));
vi.mock(
  "@/hooks/usePscCommessa",
  () => ({
    usePscCommessa: () => mocks.query,
    identificaPsc: (...a: unknown[]) => mocks.identifica(...a),
  }),
);
vi.mock(
  "@/hooks/usePermissions",
  () => ({
    usePermissions: () => ({
      canViewSicurezzaCantiere: true,
      solaLettura: mocks.ro,
    }),
  }),
);
vi.mock(
  "@/components/sicurezza/DocumentiSicurezza",
  () => ({ CaricaDocumentoSicurezzaDialog: () : null => null }),
);
vi.mock("@/lib/storagePrivato", () => ({ apriFileRiservato: vi.fn() }));
const fonte = {
  archivio: "sicurezza_documenti" as const,
  id: "a",
  company_id: "c",
  order_id: "o",
  titolo: "PSC A",
  file_path: "c/a",
  file_name: "a.pdf",
  data_documento: "2026-10-27",
  revisione: "",
  created_at: "oggi",
};
const valore = { ...fonte, revisione: "01", sha256: "a".repeat(64) };
const draw = (props: Partial<Parameters<typeof RiferimentoPscPos>[0]> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RiferimentoPscPos
        companyId="c"
        orderId="o"
        ro={false}
        onChange={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
beforeEach(() => {
  mocks.query.data = [];
  mocks.query.isError = false;
  mocks.ro = false;
  vi.clearAllMocks();
});
describe("Collegamento originale PSC", () => {
  it("non confonde errore di lettura con assenza documenti", () => {
    mocks.query.isError = true;
    draw();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Elenco non disponibile",
    );
    expect(screen.queryByLabelText("Originale da collegare")).not
      .toBeInTheDocument();
  });
  it("richiede revisione e legge l’originale prima di modificare il POS", async () => {
    mocks.query.data = [fonte];
    mocks.identifica.mockResolvedValue(valore);
    const change = vi.fn();
    draw({ onChange: change });
    fireEvent.change(screen.getByLabelText("Originale da collegare"), {
      target: { value: "sicurezza_documenti:a" },
    });
    expect(screen.getByRole("button", { name: "Usa questo riferimento" }))
      .toBeDisabled();
    fireEvent.change(
      screen.getByLabelText("Revisione riportata sul documento"),
      { target: { value: "01" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Usa questo riferimento" }),
    );
    await waitFor(() => expect(change).toHaveBeenCalledWith(valore));
  });
  it("mantiene il riferimento salvato quando l’originale non è più disponibile", () => {
    draw({ valore });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "non è più disponibile",
    );
    expect(screen.getByText("PSC A")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confronta impronta" }))
      .toBeDisabled();
  });
  it("in sola lettura non consente collegamenti o rimozioni", () => {
    mocks.query.data = [fonte];
    draw({ valore, ro: true });
    expect(screen.queryByRole("button", { name: "Scollega riferimento" })).not
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Carica PSC" })).not
      .toBeInTheDocument();
  });
  it("se i byte differiscono segnala riesame senza sostituire il riferimento", async () => {
    mocks.query.data = [fonte];
    mocks.identifica.mockResolvedValue({ ...valore, sha256: "b".repeat(64) });
    const change = vi.fn();
    draw({ valore, onChange: change });
    fireEvent.click(screen.getByRole("button", { name: "Confronta impronta" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "contenuto del file è cambiato",
      )
    );
    expect(change).not.toHaveBeenCalled();
  });
});
