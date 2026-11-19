import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentoFiscale } from "@/types/fatturazione";

const mock = vi.hoisted(() => ({
  doc: undefined as DocumentoFiscale | undefined,
  salva: vi.fn(),
  emetti: vi.fn(),
  rilascia: vi.fn(),
  successo: vi.fn(),
}));

vi.mock("@/hooks/useDocumentiFiscali", () => ({
  useDocumentoFiscale: () => ({ data: mock.doc, isLoading: false }),
  useCreateDocumento: () => ({ mutate: vi.fn() }),
  useUpdateDocumento: () => ({ mutateAsync: mock.salva, isPending: false }),
  useEmittiDocumento: () => ({ mutate: mock.emetti, isPending: false }),
  useDeleteDocumento: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: null }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mock.rilascia } }));
vi.mock("@/hooks/useAnagraficaAzienda", () => ({ useAnagraficaAzienda: () => ({ data: null }) }));
vi.mock("@/hooks/useContestoControlliPa", () => ({ useContestoControlliPa: () => undefined }));
vi.mock("@/hooks/useInvioSdi", () => ({
  useInvioSdi: () => ({ isPending: false, mutate: vi.fn() }),
  useAggiornaStatoSdi: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: mock.successo, error: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/fatturazione/AllegatiFattura", () => ({ AllegatiFattura: () => null }));
vi.mock("@/pages/azienda/fatturazione/editor/EditorClienteSection", () => ({ EditorClienteSection: () => null }));
vi.mock("@/pages/azienda/fatturazione/editor/EditorRigheSection", () => ({ EditorRigheSection: () => null }));
vi.mock("@/pages/azienda/fatturazione/editor/EditorDatiDocumento", () => ({ EditorDatiDocumento: () => null }));
vi.mock("@/pages/azienda/fatturazione/editor/EditorPagamentoSection", () => ({ EditorPagamentoSection: () => null }));
vi.mock("@/pages/azienda/fatturazione/editor/EditorOrdineSection", () => ({ EditorOrdineSection: () => null }));
vi.mock("@/pages/azienda/fatturazione/editor/EditorFatturazioneElettronicaSection", () => ({
  EditorFatturazioneElettronicaSection: () => null, APRI_FATTURAZIONE_ELETTRONICA: "apri-fe",
}));
vi.mock("@/pages/azienda/fatturazione/editor/EditorCommessaRiferimentiSection", () => ({
  EditorCommessaRiferimentiSection: () => null, APRI_RIFERIMENTI_PA: "apri-riferimenti",
}));
vi.mock("@/pages/azienda/fatturazione/editor/EditorPreviewDialog", () => ({ EditorPreviewDialog: () => null }));
vi.mock("@/pages/azienda/fatturazione/editor/EditorSendEmailDialog", () => ({ EditorSendEmailDialog: () => null }));

import EditorDocumento from "@/pages/azienda/fatturazione/EditorDocumento";
import { useEditorState } from "@/pages/azienda/fatturazione/editor/useEditorState";

const data = "2026-11-19T11:00:00.000Z";
const bozza = {
  id: "bozza-1", tipo: "fattura", numero: "Bozza FATT0001", stato: "bozza", anno: 2026, numero_progressivo: 0,
  data_emissione: "2026-11-19", created_at: data, updated_at: data, righe: [], riepilogo_iva: [],
} as DocumentoFiscale;

function Destinazione() {
  const posizione = useLocation();
  return <output>{posizione.pathname + posizione.search}</output>;
}

function montaEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>
    <MemoryRouter initialEntries={["/azienda/documenti/bozza-1"]}>
      <Routes>
        <Route path="/azienda/documenti/:id" element={<EditorDocumento />} />
        <Route path="/azienda/documenti" element={<Destinazione />} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>);
}

beforeEach(() => {
  mock.doc = bozza;
  mock.salva.mockReset().mockResolvedValue(bozza);
  mock.emetti.mockReset();
  mock.successo.mockReset();
  mock.rilascia.mockReset().mockResolvedValue({ error: null });
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Salvataggio dall'editor della fattura", () => {
  it("salva anche una bozza da completare e al ritorno apre le fatture in bozza", async () => {
    montaEditor();
    const salva = await screen.findByRole("button", { name: "Salva bozza" });
    expect(screen.queryByText("Bozza salvata")).toBeNull();
    fireEvent.click(salva);
    await waitFor(() => expect(mock.successo).toHaveBeenCalledWith("Bozza salvata", expect.anything()));
    expect(mock.salva).toHaveBeenCalledWith(expect.objectContaining({ id: bozza.id }));
    expect(mock.emetti).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Torna ai documenti" }));
    expect(screen.getByText("/azienda/documenti?stato=bozza")).toBeInTheDocument();
    expect(mock.rilascia).not.toHaveBeenCalled();
  });

  it("conserva anche dopo la riapertura una bozza vuota che era stata salvata", async () => {
    mock.doc = { ...bozza, updated_at: "2026-11-19T11:01:00.000Z" };
    montaEditor();
    fireEvent.click(await screen.findByRole("button", { name: "Torna ai documenti" }));
    expect(screen.getByText("/azienda/documenti?stato=bozza")).toBeInTheDocument();
    expect(mock.rilascia).not.toHaveBeenCalled();
  });

  it("permette di salvare le correzioni di una fattura emessa e ancora modificabile", async () => {
    mock.doc = { ...bozza, stato: "emessa", numero: "FT-2026-0025", numero_progressivo: 25, note_interne: "Testo originale" };
    montaEditor();
    fireEvent.change(await screen.findByLabelText(/Note interne/), { target: { value: "Nota corretta" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(mock.successo).toHaveBeenCalledWith("Modifiche salvate", expect.anything()));
    expect(mock.salva).toHaveBeenCalledWith(expect.objectContaining({ id: bozza.id, note_interne: "Nota corretta" }));
    expect(mock.salva.mock.calls[0][0]).not.toHaveProperty("stato");
    expect(mock.salva.mock.calls[0][0]).not.toHaveProperty("numero");
    expect(mock.emetti).not.toHaveBeenCalled();
  });

  it("presenta le fatture già trasmesse in sola lettura", async () => {
    mock.doc = { ...bozza, stato: "consegnata", numero: "FT-2026-0025", sdi_stato: "RC", note_interne: "Confermata" };
    montaEditor();
    expect(await screen.findByLabelText(/Note interne/)).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Salva modifiche" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Salva bozza" })).toBeNull();
  });

  it("resta nell'editor se il salvataggio prima di uscire fallisce e consente di riprovare", async () => {
    mock.doc = { ...bozza, note_interne: "Testo originale" };
    mock.salva.mockRejectedValueOnce(new Error("Connessione interrotta"));
    montaEditor();
    fireEvent.change(await screen.findByLabelText(/Note interne/), { target: { value: "Da conservare" } });
    fireEvent.click(screen.getByRole("button", { name: "Torna ai documenti" }));
    const dialogo = screen.getByRole("alertdialog");
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Salva bozza" }));
    });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(mock.successo).not.toHaveBeenCalled();
    expect(screen.queryByText("/azienda/documenti?stato=bozza")).toBeNull();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salva bozza" }));
    expect(await screen.findByText("/azienda/documenti?stato=bozza")).toBeInTheDocument();
    expect(mock.salva).toHaveBeenLastCalledWith(expect.objectContaining({ note_interne: "Da conservare" }));
  });
});

describe("Salvataggio automatico e manuale", () => {
  it("conferma solo le scritture riuscite e salva l'ultima modifica dopo l'autosave in corso", async () => {
    vi.useFakeTimers();
    let finisciAutosave!: () => void;
    mock.salva.mockImplementationOnce(() => new Promise<void>((resolve) => { finisciAutosave = resolve; }));
    const { result } = renderHook(() => useEditorState(bozza));
    act(() => result.current.dispatch({ type: "SET_FIELD", field: "note_interne", value: "Prima nota" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(mock.salva).toHaveBeenCalledTimes(1);
    expect(result.current.isDirty).toBe(true);
    expect(result.current.lastSaved).toBeNull();
    act(() => result.current.dispatch({ type: "SET_FIELD", field: "note_interne", value: "Ultima nota" }));
    let esito!: Promise<void>;
    act(() => { esito = result.current.saveNow(); });
    expect(mock.salva).toHaveBeenCalledTimes(1);
    await act(async () => {
      finisciAutosave();
      await esito;
    });
    expect(mock.salva).toHaveBeenCalledTimes(2);
    expect(mock.salva).toHaveBeenLastCalledWith(expect.objectContaining({ note_interne: "Ultima nota" }));
    expect(result.current.isDirty).toBe(false);
    expect(result.current.lastSaved).toBeInstanceOf(Date);
  });
});
