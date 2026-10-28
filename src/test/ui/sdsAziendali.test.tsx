import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SdsAziendale } from "@/hooks/useSdsAziendali";
const s = vi.hoisted(() => ({
  allowed: true,
  readonly: false,
  error: false,
  rows: [] as unknown[],
  save: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewSicurezzaCantiere: s.allowed,
    solaLettura: s.readonly,
  }),
}));
vi.mock("@/hooks/useSdsAziendali", () => ({
  useSdsAziendali: () => ({ data: s.rows, isError: s.error, isPending: false }),
  useCollegaRevisioneSds: () => ({ mutateAsync: s.save, isPending: false }),
  leggiSdsAziendali: (...a: unknown[]) => s.read(...a),
}));
vi.mock("@/components/sicurezza/FascicoloDocumenti", () => ({
  FascicoloDocumenti: () => <p>Archivio SDS</p>,
}));
import {
  SdsAziendali,
  CollegaRevisioni,
} from "@/components/sicurezza/SdsAziendali";
const row = (id: string, more = {}): SdsAziendale =>
  ({
    id,
    company_id: "az",
    titolo: id,
    tipo: "sds",
    revisione: id,
    data_rilascio: "2026-10-01",
    file_name: `${id}.pdf`,
    file_path: `az/${id}/file.pdf`,
    stato: "ricevuto",
    impronta: `${id}-hash`,
    precedente_id: null,
    successive: [],
    impieghi: [],
    ...more,
  }) as SdsAziendale;
const frame = () => [
  row("vecchia", {
    impieghi: [
      {
        id: "uso",
        order_id: "ordine",
        order_code: "ORD-1",
        nome: "Sigillante",
        dal: "2026-10-01",
        al: null,
        annullato: false,
      },
    ],
  }),
  row("nuova"),
];
const openDialog = (onClose = vi.fn()) =>
  render(
    <CollegaRevisioni companyId="az" iniziali={frame()} onClose={onClose} />,
  );
const select = () => {
  fireEvent.change(screen.getByLabelText("Nuova revisione caricata"), {
    target: { value: "nuova" },
  });
  fireEvent.change(screen.getByLabelText("Documento precedente"), {
    target: { value: "vecchia" },
  });
};
beforeEach(() => {
  s.allowed = true;
  s.readonly = false;
  s.error = false;
  s.rows = frame();
  s.save.mockReset().mockResolvedValue({});
  s.read.mockReset().mockResolvedValue(frame());
});
afterEach(cleanup);
describe("Libreria SDS condivisa", () => {
  it("mostra commesse e avverte che i POS storici non sono un elenco di impieghi live", () => {
    render(
      <MemoryRouter>
        <SdsAziendali companyId="az" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "ORD-1" })).toHaveAttribute(
      "href",
      "/azienda/ordini/ordine?tab=cantiere&vista_cantiere=sicurezza",
    );
    expect(
      screen.getByText(/riferimenti congelati nei POS storici/),
    ).toBeInTheDocument();
  });
  it("non rivela dati da cache senza permesso e in sola lettura non propone collegamenti", () => {
    s.allowed = false;
    const r = render(
      <MemoryRouter>
        <SdsAziendali companyId="az" />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Archivio SDS")).not.toBeInTheDocument();
    s.allowed = true;
    s.readonly = true;
    r.rerender(
      <MemoryRouter>
        <SdsAziendali companyId="az" />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("button", { name: "Collega revisioni" }),
    ).not.toBeInTheDocument();
  });
  it("non mostra impieghi obsoleti quando la lettura è fallita", () => {
    s.error = true;
    render(
      <MemoryRouter>
        <SdsAziendali companyId="az" />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("link", { name: "ORD-1" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Collega revisioni" }),
    ).toBeDisabled();
  });
  it("invia entrambe le impronte con scelta esplicita e non sostituisce i prodotti", async () => {
    const close = vi.fn();
    openDialog(close);
    expect(
      screen.getByRole("button", { name: "Conferma collegamento" }),
    ).toBeDisabled();
    select();
    expect(screen.getByText(/1 impieghi non annullati/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Conferma collegamento" }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(s.save).toHaveBeenCalledExactlyOnceWith({
      documentoId: "nuova",
      precedenteId: "vecchia",
      improntaDocumento: "nuova-hash",
      improntaPrecedente: "vecchia-hash",
    });
  });
  it("rilettura di una nuova fonte richiede accettazione esplicita delle due versioni", async () => {
    s.read.mockResolvedValue([
      row("vecchia", { impronta: "vecchia-2" }),
      row("nuova", { impronta: "nuova-2" }),
    ]);
    openDialog();
    select();
    fireEvent.click(screen.getByRole("button", { name: "Rileggi SDS" }));
    await screen.findByRole("button", { name: "Usa versioni rilette" });
    expect(
      screen.getByRole("button", { name: "Conferma collegamento" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Nuova revisione caricata")).toHaveValue(
      "nuova",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Usa versioni rilette" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Conferma collegamento" }),
    );
    await waitFor(() =>
      expect(s.save).toHaveBeenCalledWith(
        expect.objectContaining({
          improntaDocumento: "nuova-2",
          improntaPrecedente: "vecchia-2",
        }),
      ),
    );
  });
  it("sorgente scomparsa non diventa confermabile accettando la rilettura", async () => {
    s.read.mockResolvedValue([row("vecchia")]);
    openDialog();
    select();
    fireEvent.click(screen.getByRole("button", { name: "Rileggi SDS" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Usa versioni rilette" }),
    );
    expect(
      screen.getByRole("button", { name: "Conferma collegamento" }),
    ).toBeDisabled();
    expect(s.save).not.toHaveBeenCalled();
  });
  it("conflitto server conserva le scelte e fallimento rilettura blocca il salvataggio", async () => {
    s.save.mockRejectedValue(new Error("Documento cambiato"));
    openDialog();
    select();
    fireEvent.click(
      screen.getByRole("button", { name: "Conferma collegamento" }),
    );
    await screen.findByText("Documento cambiato");
    expect(screen.getByLabelText("Documento precedente")).toHaveValue(
      "vecchia",
    );
    s.read.mockRejectedValue(new Error("Connessione non disponibile"));
    fireEvent.click(screen.getByRole("button", { name: "Rileggi SDS" }));
    await screen.findByText("Connessione non disponibile");
    expect(
      screen.getByRole("button", { name: "Conferma collegamento" }),
    ).toBeDisabled();
  });
  it("revoca scrittura durante il dialogo impedisce invio", () => {
    const r = openDialog();
    select();
    s.readonly = true;
    r.rerender(
      <CollegaRevisioni companyId="az" iniziali={frame()} onClose={vi.fn()} />,
    );
    expect(
      screen.getByRole("button", { name: "Conferma collegamento" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Conferma collegamento" }),
    );
    expect(s.save).not.toHaveBeenCalled();
  });
  it("cambio azienda chiude il dialogo e scarta le fonti catturate", () => {
    const r = render(
      <MemoryRouter>
        <SdsAziendali companyId="az" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Collega revisioni" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    r.rerender(
      <MemoryRouter>
        <SdsAziendali companyId="altra" />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
