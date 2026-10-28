import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  within,
} from "@testing-library/react";
import { DocumentiMensiliSub } from "@/components/subappaltatori/DocumentiMensiliSub";
const state = vi.hoisted(() => ({
  allowed: true,
  readonly: false,
  error: false,
  rows: [] as unknown[],
  salva: vi.fn(),
  prepara: vi.fn(),
  upload: vi.fn(),
  errore: vi.fn(),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewSubappaltatoriAmministrazione: state.allowed,
    canViewSicurezzaCantiere: true,
    solaLettura: state.readonly,
  }),
}));
vi.mock("@/hooks/useDocumentiMensiliSub", () => ({
  BUCKET_MENSILI: "subappaltatori-amministrazione",
  useMensiliSub: () => ({
    data: state.rows,
    isLoading: false,
    isError: state.error,
    refetch: vi.fn(),
  }),
  useSalvaMensileSub: () => ({ mutateAsync: state.salva, isPending: false }),
  usePreparaMensiliSub: () => ({
    mutateAsync: state.prepara,
    isPending: false,
  }),
  caricaMensileSub: state.upload,
}));
vi.mock("@/lib/storagePrivato", () => ({ apriFileRiservato: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: state.errore, success: vi.fn() } }));
const contratti = [
  { id: "c1", numero_contratto: "SUB-01", commessa: { order_code: "ORD-01" } },
  { id: "c2", numero_contratto: "SUB-02", commessa: { order_code: "ORD-02" } },
];
beforeEach(() => {
  state.allowed = true;
  state.readonly = false;
  state.error = false;
  state.rows = [];
  state.salva.mockReset().mockResolvedValue({ id: "m1" });
  state.prepara.mockReset().mockResolvedValue(undefined);
  state.upload.mockReset().mockResolvedValue("az/m1/prova.pdf");
  state.errore.mockReset();
});
afterEach(cleanup);
function open(tutti = contratti) {
  render(<DocumentiMensiliSub companyId="az" subId="sub" contratti={tutti} />);
}
function scegli() {
  fireEvent.change(screen.getByLabelText("Contratto del subappaltatore"), {
    target: { value: "c2" },
  });
  fireEvent.change(screen.getByLabelText("Mese di competenza"), {
    target: { value: "2026-10" },
  });
}
function configuraLul() {
  fireEvent.click(
    within(
      screen.getByRole("heading", { name: "LUL" }).closest("section")!,
    ).getByRole("button", { name: "Configura" }),
  );
}
describe("Documenti amministrativi mensili", () => {
  it("il permesso sicurezza non apre il fascicolo amministrativo", () => {
    state.allowed = false;
    open();
    expect(
      screen.getByText(/Serve il permesso Documenti mensili/),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Contratto del subappaltatore"),
    ).not.toBeInTheDocument();
  });
  it("con più contratti richiede una scelta esplicita e prepara le sei voci nel mese scelto", async () => {
    open();
    expect(screen.getByLabelText("Contratto del subappaltatore")).toHaveValue(
      "",
    );
    expect(
      screen.queryByRole("button", { name: "Prepara le voci dell’Excel" }),
    ).not.toBeInTheDocument();
    scegli();
    fireEvent.click(
      screen.getByRole("button", { name: "Prepara le voci dell’Excel" }),
    );
    await waitFor(() =>
      expect(state.prepara).toHaveBeenCalledWith({
        contrattoId: "c2",
        mese: "2026-10",
        tipi: [
          "lul",
          "bonifico_lul",
          "quietanza_f24",
          "denuncia_cassa_edile",
          "bonifico_cassa_edile",
          "uniemens",
        ],
      }),
    );
  });
  it("sola lettura mostra i controlli ma non propone modifica o preparazione", () => {
    state.readonly = true;
    open();
    scegli();
    expect(screen.getByRole("heading", { name: "LUL" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Configura" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Prepara le voci dell’Excel" }),
    ).not.toBeInTheDocument();
  });
  it("un errore dati non diventa sei voci mancanti da ricreare", () => {
    state.error = true;
    open();
    scegli();
    expect(screen.getByRole("alert")).toHaveTextContent("non disponibile");
    expect(
      screen.queryByRole("button", { name: "Prepara le voci dell’Excel" }),
    ).not.toBeInTheDocument();
  });
  it("senza contratto non propone documenti slegati dal cantiere", () => {
    open([]);
    expect(screen.getByText(/Collega prima un contratto/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Configura" }),
    ).not.toBeInTheDocument();
  });
  it("richiede la motivazione della non applicabilità e il file per un ricevuto", () => {
    open();
    scegli();
    configuraLul();
    fireEvent.change(screen.getByLabelText("Stato"), {
      target: { value: "non_applicabile" },
    });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(state.salva).not.toHaveBeenCalled();
    expect(state.errore).toHaveBeenCalledWith(
      expect.stringContaining("Motiva"),
    );
    fireEvent.change(screen.getByLabelText("Stato"), {
      target: { value: "ricevuto" },
    });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(state.salva).not.toHaveBeenCalled();
    expect(state.errore).toHaveBeenCalledWith(
      expect.stringContaining("Allega"),
    );
  });
  it("salva una richiesta nel contratto e mese, senza allegare automaticamente o verificare", async () => {
    open();
    scegli();
    configuraLul();
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await waitFor(() =>
      expect(state.salva).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: "lul",
          contratto_id: "c2",
          competenza: "2026-10",
          stato: "da_richiedere",
          origine_requisito: "da_verificare",
        }),
      ),
    );
    expect(state.upload).not.toHaveBeenCalled();
  });
  it("un caricamento riprende dopo un errore metadati senza ricopiare il file", async () => {
    state.salva
      .mockReset()
      .mockResolvedValueOnce({ id: "m1" })
      .mockRejectedValueOnce(new Error("Rete interrotta"))
      .mockResolvedValue({ id: "m1" });
    open();
    scegli();
    configuraLul();
    fireEvent.change(screen.getByLabelText(/File PDF o immagine/), {
      target: {
        files: [
          new File(["sintetico"], "prova.pdf", { type: "application/pdf" }),
        ],
      },
    });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await waitFor(() =>
      expect(state.errore).toHaveBeenCalledWith("Rete interrotta"),
    );
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(state.upload).toHaveBeenCalledTimes(1);
    expect(state.salva.mock.calls[2][0]).toMatchObject({
      id: "m1",
      file_path: "az/m1/prova.pdf",
      competenza: "2026-10",
      contratto_id: "c2",
    });
  });
});
