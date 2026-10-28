import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
vi.mock('@/hooks/useProfiliRequisiti',()=>({useProfiliRequisiti:()=>({data:[] as never[],isLoading:false,isError:false})}));
vi.mock('@/components/sicurezza/ProfiliPerVerifica',()=>({ProfiliPerVerifica:(): null =>null}));
const s = vi.hoisted(() => ({
  readonly: false,
  error: false,
  pending: false,
  salva: vi.fn(),
  contextError: false,
  historyError: false,
  context: {
    impresa: {
      id: "sub",
      ragione_sociale: "Impresa",
      campo_subappaltatore_id: null as null,
    },
    commessa: { id: "ordine", order_code: "ORD", description: null as null },
    fase: null as null,
  },
  history: [] as unknown[],
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewSicurezzaCantiere: true,
    solaLettura: s.readonly,
  }),
}));
vi.mock("@/hooks/useVerificheItp", () => ({
  useSoggettiItp:()=>({data: undefined as undefined,isError:false,isLoading:false}),
  leggiSoggettiItp:async()=>({operai:[] as never[],incarichi:[] as never[]}),
  useVerificheItp: () => ({
    data: s.history,
    isLoading: false,
    isError: s.historyError,
    refetch: async () => ({
      data: s.history,
      error: s.historyError ? new Error("Storico non disponibile") : null,
    }),
  }),
  useContestoItp: () => ({
    data: s.context,
    isLoading: false,
    isError: s.contextError,
    refetch: async () => ({
      data: s.context,
      error: s.contextError ? new Error("Contesto non disponibile") : null,
    }),
  }),
  useRegistraItp: () => ({ mutateAsync: s.salva, isPending: s.pending }),
}));
vi.mock("@/hooks/useFascicoloCantiere", () => ({ apriFileFascicolo: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { VerificaItpImpresa } from "@/components/sicurezza/VerificaItpImpresa";
import type { EvidenzaFascicolo } from "@/lib/sicurezza/fascicolo";
const fonte = {
  id: "e",
  company_id: "azienda",
  subappaltatore_id: "sub",
  order_id: null,
  titolo: "Fonte verificata",
  stato: "verificato",
  updated_at: "2026-10-27T00:00:00.123456Z",
  file_path: "file",
  file_name: "fonte.pdf",
} as EvidenzaFascicolo;
const mostra = (e = fonte) =>
  render(
    <VerificaItpImpresa
      companyId="azienda"
      orderId="ordine"
      subId="sub"
      evidenze={[e]}
      giorno="2026-11-01"
    />,
  );
afterEach(cleanup);
beforeEach(() => {
  s.readonly = false;
  s.pending = false;
  s.contextError = false;
  s.historyError = false;
  s.context.commessa.order_code = "ORD";
  s.history = [];
  s.salva
    .mockReset()
    .mockRejectedValue(new Error("Una fonte è cambiata: rileggila"));
});
async function apri() {
  fireEvent.click(
    screen.getByRole("button", { name: "Registra verifica ITP" }),
  );
  await screen.findByRole("dialog");
}
function compila() {
  fireEvent.change(screen.getByLabelText("Lavori e ambito esaminati"), {
    target: { value: "Lavori selezionati" },
  });
  fireEvent.change(screen.getByLabelText("Responsabile della valutazione"), {
    target: { value: "Mario" },
  });
  fireEvent.change(screen.getByLabelText("Ruolo del responsabile"), {
    target: { value: "Responsabile tecnico" },
  });
  fireEvent.change(
    screen.getByLabelText("Motivazione dell’esito e azioni richieste"),
    { target: { value: "Richiesta integrazioni" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Criterio personalizzato" }),
  );
  fireEvent.change(screen.getByLabelText("Criterio 1"), {
    target: { value: "Criterio specifico" },
  });
}
describe("Verifica ITP nella scheda impresa della commessa", () => {
  it("il ruolo di sola lettura consulta senza registrare", () => {
    s.readonly = true;
    mostra();
    expect(
      screen.queryByRole("button", { name: "Registra verifica ITP" }),
    ).toBeNull();
    expect(screen.getByText(/Nessuna valutazione registrata/)).toBeTruthy();
  });
  it("non apre una registrazione se il contesto non è disponibile", async () => {
    s.contextError = true;
    mostra();
    fireEvent.click(
      screen.getByRole("button", { name: "Registra verifica ITP" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Contesto non disponibile",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("richiede criteri e responsabile, senza esiti preselezionati positivi", async () => {
    mostra();
    await apri();
    expect(screen.getByLabelText("Esito complessivo")).toHaveValue(
      "da_integrare",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Registra nello storico" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("responsabile");
    expect(s.salva).not.toHaveBeenCalled();
  });
  it("mantiene il contesto e i token esaminati anche se la cache cambia; conserva form e id dopo errore", async () => {
    const ui = mostra();
    await apri();
    compila();
    s.context = {
      ...s.context,
      commessa: { ...s.context.commessa, order_code: "ORD CAMBIATO" },
    };
    ui.rerender(
      <VerificaItpImpresa
        companyId="azienda"
        orderId="ordine"
        subId="sub"
        evidenze={[{ ...fonte, updated_at: "nuova" }]}
        giorno="2026-11-01"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Registra nello storico" }),
    );
    await waitFor(() => expect(s.salva).toHaveBeenCalledTimes(1));
    const prima = s.salva.mock.calls[0][0];
    expect(prima.dati.contesto_atteso.commessa.order_code).toBe("ORD");
    expect(prima.dati.evidenze_attese.e).toBe(fonte.updated_at);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Una fonte è cambiata",
    );
    expect(screen.getByLabelText("Responsabile della valutazione")).toHaveValue(
      "Mario",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Registra nello storico" }),
    );
    await waitFor(() => expect(s.salva).toHaveBeenCalledTimes(2));
    expect(s.salva.mock.calls[1][0].id).toBe(prima.id);
  });
  it("mostra esplicitamente quando lo storico non è disponibile", () => {
    s.historyError = true;
    mostra();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Storico delle verifiche non disponibile",
    );
    expect(
      screen.getByRole("button", { name: "Registra verifica ITP" }),
    ).toBeDisabled();
  });
});
