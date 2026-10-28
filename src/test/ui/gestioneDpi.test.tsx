import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventoDpi } from "@/lib/sicurezza/gestioneDpi";
import type { AddettoDpi, ConsegnaDpi } from "@/lib/sicurezza/dpiCommessa";
const s = vi.hoisted(() => ({
  readonly: false,
  pending: false,
  save: vi.fn(),
  events: [] as EventoDpi[],
  error: false,
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewSicurezzaCantiere: true,
    solaLettura: s.readonly,
  }),
}));
vi.mock("@/hooks/useGestioneDpi", () => ({
  useSalvaDpi: () => ({ isPending: s.pending, mutateAsync: s.save }),
  useStoricoDpi: () => ({
    data: s.events,
    isLoading: false,
    isError: s.error,
    refetch: vi.fn(),
  }),
}));
import {
  GestioneDpiDialog,
  StoricoDpiDialog,
  type ContestoGestioneDpi,
} from "@/components/sicurezza/GestioneDpiDialog";
const addetto: AddettoDpi = {
  id: "a1",
  nome: "Mario",
  cognome: "Rossi",
  attivo: true,
  qualifica: "Posatore",
  assegnazioni: [],
  consegne: [],
};
const ctx: ContestoGestioneDpi = {
  companyId: "azienda",
  orderId: "ordine",
  data: "2026-10-27",
  faseId: "fase",
  addetti: [addetto, { ...addetto, id: "cessato", attivo: false }],
};
const record: ConsegnaDpi = {
  id: "c1",
  tipo: "casco",
  marca: "Marca",
  matricola: "123",
  consegnato_il: "2026-10-01",
  scade_il: null,
  stato: "in_use",
  restituito_il: null,
  modulo_registrato: true,
  versione: 2,
};
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
afterEach(cleanup);
beforeEach(() => {
  s.readonly = false;
  s.pending = false;
  s.save.mockReset().mockResolvedValue({});
  s.events = [];
  s.error = false;
});
describe("Registro DPI modificabile con base esplicita", () => {
  it("legge gli snapshot prima/dopo senza ricalcolare oggi uno stato storico", () => {
    s.events = [
      {
        id: "ev",
        company_id: "azienda",
        employee_id: "a1",
        consegna_id: "c1",
        versione: 2,
        operazione: "rettificata",
        prima: { ...record, marca: "Marca precedente", scade_il: "2026-10-20" },
        dopo: { ...record, marca: "Marca corretta", scade_il: "2026-10-20" },
        motivo: "Correzione identificativo",
        registrato_da: "account1",
        registrato_il: "2026-10-01T08:00:00Z",
      },
    ];
    render(
      <StoricoDpiDialog
        companyId="azienda"
        addetto={addetto}
        consegna={record}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText(/Versione 2 · rettificata/));
    expect(screen.getByText("Correzione identificativo")).toBeTruthy();
    expect(screen.getByText(/Marca corretta/)).toBeTruthy();
    fireEvent.click(screen.getByText("Dati prima della modifica"));
    expect(screen.getByText(/Marca precedente/)).toBeTruthy();
    expect(screen.getByText(/senza ricalcolare lo stato di oggi/)).toBeTruthy();
    expect(screen.queryByText("Scaduto")).toBeNull();
  });
  it("richiede destinatario e motivo e non propone un addetto cessato per una nuova consegna", () => {
    render(<GestioneDpiDialog contesto={ctx} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Salva nel registro" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Scegli l’addetto titolare",
    );
    expect(s.save).not.toHaveBeenCalled();
    expect(
      screen
        .getAllByRole("option")
        .some((e) => e.getAttribute("value") === "cessato"),
    ).toBe(false);
  });
  it("mantiene dati, ID e nonce quando il salvataggio non è confermato", async () => {
    const close = vi.fn();
    s.save.mockRejectedValueOnce(new Error("Rete interrotta"));
    render(<GestioneDpiDialog contesto={ctx} onClose={close} />);
    change("Addetto titolare", "a1");
    change("Dispositivo", "guanti");
    change("Data di consegna", "2026-10-27");
    change("Motivo della registrazione o rettifica", "Consegna da registrare");
    fireEvent.click(screen.getByRole("button", { name: "Salva nel registro" }));
    await screen.findByText("Rete interrotta");
    const primo = s.save.mock.calls[0][0];
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salva nel registro" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(s.save.mock.calls[1][0]).toEqual(primo);
    expect(primo.versione).toBeNull();
  });
  it("una cache aggiornata non sostituisce versione, data o dati della rettifica aperta", async () => {
    const close = vi.fn();
    const r = render(
      <GestioneDpiDialog
        contesto={ctx}
        addettoId="a1"
        consegna={record}
        onClose={close}
      />,
    );
    change("Motivo della registrazione o rettifica", "Rettifica verificata");
    r.rerender(
      <GestioneDpiDialog
        contesto={{ ...ctx, data: "2026-11-01" }}
        addettoId="a1"
        consegna={{ ...record, versione: 9, marca: "Aggiornata altrove" }}
        onClose={close}
      />,
    );
    expect(screen.getByLabelText("Marca")).toHaveValue("Marca");
    expect(screen.getByLabelText("Addetto titolare")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Salva nel registro" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(s.save.mock.calls[0][0]).toMatchObject({
      versione: 2,
      dataRiferimento: "2026-10-27",
      faseId: "fase",
      titolareId: "a1",
    });
  });
  it("un conflitto mantiene il modulo e la sola lettura sopraggiunta blocca un altro tentativo", async () => {
    s.save.mockRejectedValue(new Error("La consegna è cambiata"));
    const r = render(
      <GestioneDpiDialog
        contesto={ctx}
        addettoId="a1"
        consegna={record}
        onClose={vi.fn()}
      />,
    );
    change("Motivo della registrazione o rettifica", "Motivo specifico");
    fireEvent.click(screen.getByRole("button", { name: "Salva nel registro" }));
    await screen.findByText("La consegna è cambiata");
    s.readonly = true;
    r.rerender(
      <GestioneDpiDialog
        contesto={ctx}
        addettoId="a1"
        consegna={record}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Salva nel registro" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Marca")).toBeDisabled();
    expect(
      screen.getByLabelText("Motivo della registrazione o rettifica"),
    ).toHaveValue("Motivo specifico");
  });
  it("l’annullamento è una rettifica motivata, non una cancellazione", async () => {
    render(
      <GestioneDpiDialog
        contesto={ctx}
        addettoId="a1"
        consegna={record}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByLabelText(
        "Annulla questa registrazione, conservando lo storico",
      ),
    );
    change(
      "Motivo della registrazione o rettifica",
      "Registrazione duplicata, da annullare",
    );
    fireEvent.click(screen.getByRole("button", { name: "Salva nel registro" }));
    await waitFor(() => expect(s.save).toHaveBeenCalledOnce());
    expect(s.save.mock.calls[0][0].dati).toMatchObject({
      annullata: true,
      motivo: "Registrazione duplicata, da annullare",
    });
    expect(s.save.mock.calls[0][0].dati).not.toHaveProperty(
      "modulo_registrato",
    );
  });
  it("il modulo storico distingue l’errore da uno storico vuoto", () => {
    const r = render(
      <StoricoDpiDialog
        companyId="azienda"
        addetto={addetto}
        consegna={record}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/non hanno una cronologia ricostruita/),
    ).toBeTruthy();
    s.error = true;
    r.rerender(
      <StoricoDpiDialog
        companyId="azienda"
        addetto={addetto}
        consegna={record}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Storico non disponibile",
    );
  });
});
