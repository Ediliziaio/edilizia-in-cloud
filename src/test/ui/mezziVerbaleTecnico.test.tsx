import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  edit: true,
  error: false,
  busy: false,
  loading: false,
  hash: "a".repeat(64),
  storico: [] as unknown[],
  registra: vi.fn(),
  rileggi: vi.fn(),
  close: vi.fn(),
  documenti: vi.fn(),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canEditMezzi: m.edit, canViewMezzi: true }),
}));
vi.mock("@/hooks/useVerbaliTecniciMezzo", () => ({
  usePreparaVerbaleTecnico: () => ({
    data: {
      fonte: {
        company_id: "azienda",
        mezzo_id: "mezzo",
        manutenzione_id: "intervento",
        file_name: "TEST Verbale.pdf",
        data: "2026-11-01",
        impronta: m.hash,
      },
      url: "https://esempio.supabase.co/TEST",
    },
    isLoading: m.loading,
    isError: m.error,
    isFetching: false,
    error: Error("Fonte cambiata"),
    refetch: m.rileggi,
  }),
  useVerbaliTecniciMezzo: () => ({
    data: { registrazioni: m.storico },
    isError: false,
    isLoading: false,
    refetch: m.rileggi,
  }),
  useRegistraVerbaleTecnico: () => ({
    isPending: m.busy,
    mutateAsync: m.registra,
  }),
  urlVerbaleTecnico: (url: string) => url,
}));
import { VerbaleTecnicoDialog } from "@/components/mezzi/VerbaleTecnicoDialog";
const ui = () => (
  <VerbaleTecnicoDialog
    companyId="azienda"
    mezzoId="mezzo"
    manutenzioneId="intervento"
    onClose={m.close}
    onVaiDocumenti={m.documenti}
  />
);
const bottone = () =>
  screen.getByRole("button", {
    name: "Registra copia tecnica",
  }) as HTMLButtonElement;
const conferma = () =>
  screen.getByRole("checkbox", {
    name: /Ho letto l’allegato/,
  }) as HTMLInputElement;
function compila() {
  fireEvent.change(screen.getByLabelText("Titolo del documento tecnico"), {
    target: { value: "TEST Verbale verifica" },
  });
  fireEvent.change(screen.getByLabelText("Classificazione tecnica"), {
    target: { value: "verifica_periodica" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Apri allegato da verificare" }),
  );
  fireEvent.click(conferma());
}
beforeEach(() => {
  m.edit = true;
  m.error = false;
  m.loading = false;
  m.busy = false;
  m.hash = "a".repeat(64);
  m.storico = [];
  m.registra.mockReset().mockResolvedValue({ disponibile: true });
  m.rileggi.mockReset();
  m.close.mockReset();
  m.documenti.mockReset();
  vi.spyOn(window, "open").mockReturnValue({
    opener: undefined,
    location: { href: "" },
  } as unknown as Window);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Registrazione esplicita del verbale tecnico", () => {
  it("parte senza classificazione o conferma e richiede la lettura dell’originale", () => {
    render(ui());
    expect(conferma().checked).toBe(false);
    expect(conferma().disabled).toBe(true);
    expect(bottone().disabled).toBe(true);
    expect(screen.getByLabelText("Classificazione tecnica")).toHaveProperty(
      "value",
      "",
    );
    expect(m.registra).not.toHaveBeenCalled();
  });
  it("registra solo dati tecnici scelti e apre la scheda Documenti dopo conferma", async () => {
    render(ui());
    compila();
    expect(bottone().disabled).toBe(false);
    fireEvent.click(bottone());
    await waitFor(() => expect(m.close).toHaveBeenCalledOnce());
    expect(m.documenti).toHaveBeenCalledOnce();
    expect(m.registra).toHaveBeenCalledWith(
      expect.objectContaining({
        manutenzioneId: "intervento",
        impronta: "a".repeat(64),
        richiestaId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        parametri: {
          titolo: "TEST Verbale verifica",
          categoria: "verifica_periodica",
          data_inizio: null,
          data_scadenza: null,
          conferma_tecnica: true,
        },
      }),
    );
  });
  it("modificare la classificazione dichiarata richiede una nuova conferma", () => {
    render(ui());
    compila();
    fireEvent.change(screen.getByLabelText("Titolo del documento tecnico"), {
      target: { value: "TEST Nuovo titolo" },
    });
    expect(conferma().checked).toBe(false);
    expect(bottone().disabled).toBe(true);
  });
  it("una fonte aggiornata non eredita lettura e conferma della versione precedente", () => {
    const r = render(ui());
    compila();
    m.hash = "b".repeat(64);
    r.rerender(ui());
    expect(conferma().checked).toBe(false);
    expect(conferma().disabled).toBe(true);
    expect(bottone().disabled).toBe(true);
  });
  it("dopo un errore ritenta con la stessa richiesta, senza generare un duplicato", async () => {
    m.registra.mockRejectedValueOnce(Error("Risposta non ricevuta"));
    render(ui());
    compila();
    fireEvent.click(bottone());
    await screen.findByRole("alert");
    const id = m.registra.mock.calls[0][0].richiestaId;
    fireEvent.click(bottone());
    await waitFor(() => expect(m.close).toHaveBeenCalledOnce());
    expect(m.registra.mock.calls[1][0].richiestaId).toBe(id);
  });
  it("se l’allegato corrente è già registrato conduce ai documenti senza una nuova copia", () => {
    m.storico = [
      {
        manutenzione_id: "intervento",
        fonte_impronta: m.hash,
        disponibile: true,
      },
    ];
    render(ui());
    expect(screen.getByText(/già registrato/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Registra copia tecnica" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Vai ai documenti tecnici" }),
    );
    expect(m.documenti).toHaveBeenCalledOnce();
    expect(m.registra).not.toHaveBeenCalled();
  });
  it("la rilettura annulla la dichiarazione precedente", () => {
    render(ui());
    compila();
    fireEvent.click(
      screen.getByRole("button", { name: "Rileggi allegato e registrazioni" }),
    );
    expect(conferma().checked).toBe(false);
    expect(conferma().disabled).toBe(true);
    expect(m.rileggi).toHaveBeenCalled();
  });
  it("senza modifica Mezzi nasconde anche la fonte in cache", () => {
    m.edit = false;
    render(ui());
    expect(screen.getByRole("alert").textContent).toContain("permesso");
    expect(screen.queryByText("TEST Verbale.pdf")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Registra copia tecnica" }),
    ).toBeNull();
  });
  it("un errore di caricamento impedisce la registrazione", () => {
    m.error = true;
    render(ui());
    expect(screen.getByRole("alert").textContent).toContain("Fonte cambiata");
    expect(bottone().disabled).toBe(true);
  });
  it("il popup bloccato non equivale alla lettura dell’originale", () => {
    vi.mocked(window.open).mockReturnValue(null);
    render(ui());
    fireEvent.click(
      screen.getByRole("button", { name: "Apri allegato da verificare" }),
    );
    expect(screen.getByRole("alert").textContent).toContain("nuova scheda");
    expect(conferma().disabled).toBe(true);
  });
  it("le date incoerenti impediscono la registrazione", () => {
    render(ui());
    compila();
    fireEvent.change(screen.getByLabelText("Valido dal, se indicato"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.change(screen.getByLabelText("Scadenza, se indicata"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.click(conferma());
    expect(bottone().disabled).toBe(true);
  });
});
