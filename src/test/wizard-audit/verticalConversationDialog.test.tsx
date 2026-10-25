import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VerticalWizardAiDialog from "@/components/quotes/VerticalWizardAiDialog";
import type {
  QuoteChatRequest,
  QuoteChatResult,
} from "../../../supabase/functions/_shared/quoteConversation";
import type { NativeTurn } from "../../../supabase/functions/_shared/quoteNative";
const state = vi.hoisted(() => ({
  company: "d2000000-0000-4000-a000-000000000002",
  owner: "user",
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: state.company }, user: { id: state.owner } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
  },
}));
vi.mock("@/lib/preventivi/quoteVision", () => ({
  prepareQuoteVision: vi.fn(async () => ({
    attachmentId: "a".repeat(64),
    page: 1,
    dataUrl: "data:image/png;base64,fixture",
  })),
}));
vi.mock('@/lib/preventivi/quoteCad', async original => ({ ...await original<typeof import('@/lib/preventivi/quoteCad')>(), readCadLocally: vi.fn() }));
import { readCadLocally, type QuoteCadReading } from '@/lib/preventivi/quoteCad';
vi.mock("@/components/quotes/dev/QuoteChatComposer", () => ({
  QuoteChatComposer: ({
    value,
    onValueChange,
    onSubmit,
    onStop,
    onAction,
    hasPlan,
    busy,
    disabled,
  }: {
    value: string;
    onValueChange: (s: string) => void;
    onSubmit: () => void;
    onStop: () => void;
    onAction: (action: "vision") => void;
    hasPlan: boolean;
    busy: boolean;
    disabled: boolean;
  }) => (
    <>
      <textarea
        aria-label="Messaggio"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      />
      <button disabled={busy || disabled} onClick={onSubmit}>
        Invia
      </button>
      <button onClick={onStop}>Interrompi</button>
      <button
        disabled={!hasPlan || busy || disabled}
        onClick={() => onAction("vision")}
      >
        Analizza allegato
      </button>
    </>
  ),
}));
const proposal: NativeTurn = {
  module: "fotovoltaico",
  operations: [
    {
      id: "configurazione",
      kind: "configurazione",
      action: "upsert",
      fields: [{ key: "panelCount", value: 16 }],
      axes: [],
    },
  ],
};
const response = (
  req: QuoteChatRequest,
  nativeTurn: NativeTurn | null | undefined = proposal,
): QuoteChatResult => ({
  version: 1,
  turnId: req.turnId,
  revision: req.revision,
  model: "fixture",
  simulated: true,
  references: [],
  turn: {
    version: 1,
    nativeTurn,
    message: "Conferma i pannelli proposti.",
    title: "Impianto",
    questions: [],
    proposals: [],
    warnings: [],
    searches: [],
    brief: "Escludere wallbox",
    excludeIds: [],
    choices: [
      { id: "yes", label: "Senza accumulo", reply: "Mantieni senza accumulo" },
    ],
  },
});
const props = () => ({
  title: "FV",
  companyId: state.company,
  current: { count: 12 },
  fingerprint: "original",
  onClose: vi.fn(),
  context: (draft: { count: number }) => ({
    module: "fotovoltaico" as const,
    modelTitle: "Scelto",
    catalogue: [] as never[],
    current: [
      {
        id: "configurazione",
        kind: "configurazione",
        fields: [{ key: "panelCount", value: draft.count }],
      },
    ],
  }),
  applyProposal: vi.fn(
    async (
      _draft: { count: number },
      _turn: NativeTurn,
      _manual: Record<string, number>,
    ) => ({ count: 16 }),
  ),
  preview: (d: { count: number }) => <p>Anteprima: {d.count}</p>,
  summary: (d: { count: number }) => <p>Riepilogo: {d.count}</p>,
  onCommit: vi.fn(async () => {}),
  transport: vi.fn(async (req: QuoteChatRequest) => response(req)),
});
const cadReading = (): QuoteCadReading => ({ version: 1, id: 'a'.repeat(64), name: 'test.dwg', size: 6, engine: 'LibreDWG', units: null,
  entities: 600, inserts: 0, dimensions: 0, layers: ['PDF_Text'], texts: [{ text: 'Sostituzione infissi', handle: '42', layer: 'PDF_Text', xy: null }], totalTexts: 2, omittedTexts: 1,
  partial: false, mixedStates: true, pdfImported: true, externalReferences: 0 });
describe('DWG nei configuratori tecnici', () => {
  it.each(['serramenti', 'fotovoltaico'] as const)('usa lo stesso contratto CAD nel modulo %s senza alterare configurazione e prezzi', async module => {
    vi.mocked(readCadLocally).mockResolvedValue(cadReading());
    const p = { ...props(), context: () => ({ module, modelTitle: 'Modello originale', current: [] as never[], catalogue: [] as never[] }), transport: vi.fn(async (req: QuoteChatRequest) => response(req, null)) };
    render(<VerticalWizardAiDialog {...p} />);
    fireEvent.change(screen.getByLabelText('Allega rilievo tecnico'), { target: { files: [new File(['AC1032'], 'test.dwg')] } });
    await screen.findByRole('region', { name: 'Disegno DWG del progetto' });
    expect(p.transport).not.toHaveBeenCalled(); expect(p.applyProposal).not.toHaveBeenCalled(); expect(p.onCommit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Progetto' })); expect(p.transport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Guidami negli interventi' })); await waitFor(() => expect(p.transport).toHaveBeenCalledOnce());
    const request = p.transport.mock.calls[0][0];
    expect(request.companyId).toBe(state.company); expect(request.nativeContext?.module).toBe(module);
    expect(request.messages.find(m => m.text.startsWith('FONTE CAD'))?.text).toContain('H42');
    expect(request.messages.find(m => m.text.startsWith('FONTE CAD'))?.text).toContain('desiderato dall’utente=project');
    expect(screen.getByText('Anteprima: 12')).toBeInTheDocument(); expect(p.onCommit).not.toHaveBeenCalled();
  });
  it('non accetta un risultato DWG dopo l’interruzione', async () => {
    let resolve!: (r: QuoteCadReading) => void;
    vi.mocked(readCadLocally).mockImplementation(() => new Promise(r => { resolve = r; })); const p = props();
    render(<VerticalWizardAiDialog {...p} />);
    fireEvent.change(screen.getByLabelText('Allega rilievo tecnico'), { target: { files: [new File(['AC1032'], 'test.dwg')] } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Leggo il DWG'));
    fireEvent.click(screen.getByRole('button', { name: 'Interrompi' })); await act(async () => resolve(cadReading()));
    expect(screen.queryByRole('region', { name: 'Disegno DWG del progetto' })).not.toBeInTheDocument(); expect(p.transport).not.toHaveBeenCalled(); expect(p.onCommit).not.toHaveBeenCalled();
  });
});
const send = (text = "Configura sedici pannelli") => {
  fireEvent.change(screen.getByLabelText("Messaggio"), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: "Invia" }));
};
beforeEach(() => {
  state.company = "d2000000-0000-4000-a000-000000000002";
  state.owner = "user";
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("isolated native conversation modal", () => {
  it('discards a late answer after an account change in the same company', async () => {
    const p = props();
    let finish: (result: QuoteChatResult) => void = () => {};
    let request: QuoteChatRequest | null = null;
    p.transport.mockImplementation(req => { request = req; return new Promise(resolve => { finish = resolve; }); });
    const view = render(<VerticalWizardAiDialog {...p} />); send();
    await waitFor(() => expect(p.transport).toHaveBeenCalledOnce());
    state.owner = 'other-user'; view.rerender(<VerticalWizardAiDialog {...p} />);
    await act(async () => { if (request) finish(response(request)); });
    expect(screen.getByRole('alert')).toHaveTextContent('Account');
    expect(p.applyProposal).not.toHaveBeenCalled(); expect(p.onCommit).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('configurazione panelCount')).not.toBeInTheDocument();
  });
  it("distinguishes a local attachment from a requested and completed image analysis", async () => {
    const p = props();
    let finish: (r: QuoteChatResult) => void = () => {};
    let request: QuoteChatRequest;
    p.transport.mockImplementation((req) => {
      request = req;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    render(<VerticalWizardAiDialog {...p} />);
    fireEvent.change(screen.getByLabelText("Allega rilievo tecnico"), {
      target: {
        files: [new File(["fixture"], "pianta.png", { type: "image/png" })],
      },
    });
    await screen.findByText(/pianta.png.*non ancora inviata/);
    expect(p.transport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Analizza allegato" }));
    await screen.findByText(/pianta.png.*analisi richiesta/);
    await waitFor(() => expect(p.transport).toHaveBeenCalledOnce());
    expect(request!.advanced?.vision?.attachmentId).toBe("a".repeat(64));
    await act(async () => finish(response(request!, null)));
    expect(
      screen.getByText(/pianta.png.*inviata per l’analisi/),
    ).toBeInTheDocument();
    expect(p.onCommit).not.toHaveBeenCalled();
  });
  it("locks pending edits and discard while an AI follow-up is in flight", async () => {
    const p = props();
    let finish: (r: QuoteChatResult) => void = () => {};
    let request: QuoteChatRequest;
    render(<VerticalWizardAiDialog {...p} />);
    send();
    fireEvent.change(
      await screen.findByLabelText("configurazione panelCount"),
      { target: { value: "19" } },
    );
    p.transport.mockImplementation((req) => {
      request = req;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    send("Mantieni senza accumulo");
    await waitFor(() => expect(p.transport).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("configurazione panelCount")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Scarta proposta" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("configurazione panelCount"), {
      target: { value: "23" },
    });
    await act(async () => finish(response(request!, null)));
    expect(screen.getByLabelText("configurazione panelCount")).toHaveValue(
      "19",
    );
    expect(
      screen.getByLabelText("configurazione panelCount"),
    ).not.toBeDisabled();
    expect(p.onCommit).not.toHaveBeenCalled();
  });
  it("ignores an asynchronous local application after the original project changes", async () => {
    const p = props();
    let finish: (r: { count: number }) => void = () => {};
    p.applyProposal.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const ui = render(<VerticalWizardAiDialog {...p} />);
    send();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Conferma proposta nella bozza",
      }),
    );
    await waitFor(() => expect(p.applyProposal).toHaveBeenCalledOnce());
    ui.rerender(
      <VerticalWizardAiDialog {...p} fingerprint="another-project" />,
    );
    await act(async () => finish({ count: 99 }));
    ui.rerender(<VerticalWizardAiDialog {...p} />);
    expect(screen.getByText("Anteprima: 12")).toBeInTheDocument();
    expect(p.onCommit).not.toHaveBeenCalled();
  });
  it("undoes the last accepted draft change and sends the restored context and exclusion receipt", async () => {
    const p = props();
    render(<VerticalWizardAiDialog {...p} />);
    send();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Conferma proposta nella bozza",
      }),
    );
    await screen.findByText("Anteprima: 16");
    fireEvent.click(
      screen.getByRole("button", { name: "Annulla ultima modifica" }),
    );
    expect(screen.getByText("Anteprima: 12")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Rivedi e applica" }),
    ).toBeDisabled();
    p.transport.mockImplementation(async (req) => response(req, null));
    send("Spiegami senza modificare il preventivo");
    await waitFor(() => expect(p.transport).toHaveBeenCalledTimes(2));
    const request = p.transport.mock.calls[1][0];
    expect(request.nativeContext?.current[0].fields).toContainEqual({
      key: "panelCount",
      value: 12,
    });
    expect(request.context?.brief).toBe("");
    expect(request.revision).toBe(2);
    expect(JSON.stringify(request.messages)).toContain("annullato");
    expect(p.current.count).toBe(12);
    expect(p.onCommit).not.toHaveBeenCalled();
  });
  it("remembers a discarded technical proposal without applying it", async () => {
    const p = props();
    render(<VerticalWizardAiDialog {...p} />);
    send();
    fireEvent.click(
      await screen.findByRole("button", { name: "Scarta proposta" }),
    );
    p.transport.mockImplementation(async (req) => response(req, null));
    send("Spiegami senza modificare il preventivo");
    await waitFor(() => expect(p.transport).toHaveBeenCalledTimes(2));
    expect(JSON.stringify(p.transport.mock.calls[1][0].messages)).toContain(
      "scartata",
    );
    expect(p.applyProposal).not.toHaveBeenCalled();
    expect(p.onCommit).not.toHaveBeenCalled();
  });
  it("restores a failed message without overwriting a newer unsent draft", async () => {
    const p = props();
    p.transport.mockRejectedValueOnce(new Error("Timeout locale"));
    render(<VerticalWizardAiDialog {...p} />);
    send("Primo messaggio");
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Messaggio")).toHaveValue("Primo messaggio");
    let reject: (e: Error) => void = () => {};
    p.transport.mockImplementation(
      () =>
        new Promise((_resolve, r) => {
          reject = r;
        }),
    );
    send("Secondo messaggio");
    await waitFor(() => expect(p.transport).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText("Messaggio"), {
      target: { value: "Nuova idea non inviata" },
    });
    await act(async () => reject(new Error("Servizio non disponibile")));
    expect(screen.getByLabelText("Messaggio")).toHaveValue(
      "Nuova idea non inviata",
    );
    expect(p.onCommit).not.toHaveBeenCalled();
  });
  it("lets users complete real variants and their subchoices directly inside the chat proposal", async () => {
    const p = props();
    const technical: NativeTurn = {
      module: "serramenti",
      operations: [
        {
          id: "new",
          kind: "serramento",
          action: "upsert",
          fields: [{ key: "title", value: "Finestra" }],
          axes: [],
        },
      ],
    };
    p.transport.mockImplementation(async (req) => response(req, technical));
    const context = () => ({
      module: "serramenti" as const,
      modelTitle: "Serramenti",
      current: [] as never[],
      catalogue: [] as never[],
    });
    const variants = (
      _draft: unknown,
      op: NativeTurn["operations"][number],
    ) => [
      {
        axis: "vetro",
        label: "Vetro",
        required: true,
        value: op.axes.find((a) => a.axis === "vetro")?.value ?? null,
        choice: op.axes.find((a) => a.axis === "vetro")?.choice ?? null,
        values: [
          {
            id: "triple",
            label: "Triplo vetro",
            choices: ["Trasparente", "Satinato"],
          },
        ],
      },
    ];
    render(
      <VerticalWizardAiDialog {...p} context={context} variants={variants} />,
    );
    send();
    fireEvent.change(await screen.findByLabelText("new variante Vetro"), {
      target: { value: "triple" },
    });
    fireEvent.change(screen.getByLabelText("new scelta Vetro"), {
      target: { value: "Satinato" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Conferma proposta nella bozza" }),
    );
    await waitFor(() => expect(p.applyProposal).toHaveBeenCalled());
    expect(p.applyProposal.mock.calls[0][1]).toMatchObject({
      operations: [
        { axes: [{ axis: "vetro", value: "triple", choice: "Satinato" }] },
      ],
    });
    expect(p.onCommit).not.toHaveBeenCalled();
  });
  it("does not write on proposal, reviews locally, then requires a separate final confirmation", async () => {
    const p = props();
    render(<VerticalWizardAiDialog {...p} />);
    send();
    await screen.findByRole("region", {
      name: "Proposta tecnica da confermare",
    });
    expect(p.onCommit).not.toHaveBeenCalled();
    expect(screen.getByText("Anteprima: 12")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Conferma proposta nella bozza" }),
    );
    await screen.findByText("Anteprima: 16");
    expect(p.current.count).toBe(12);
    expect(p.onCommit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Rivedi e applica" }));
    expect(screen.getByText("Riepilogo: 16")).toBeInTheDocument();
    expect(p.onCommit).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Conferma e applica al wizard" }),
    );
    await waitFor(() => expect(p.onCommit).toHaveBeenCalledTimes(1));
    expect(p.onClose).toHaveBeenCalledOnce();
  });
  it("retains pending fields and durable brief through follow-up questions", async () => {
    const p = props();
    p.transport.mockImplementation(async (req) =>
      response(req, p.transport.mock.calls.length === 1 ? proposal : null),
    );
    render(<VerticalWizardAiDialog {...p} />);
    send();
    await screen.findByLabelText("configurazione panelCount");
    send("Mantieni senza accumulo");
    await waitFor(() => expect(p.transport).toHaveBeenCalledTimes(2));
    expect(p.transport.mock.calls[1][0].context?.brief).toBe(
      "Escludere wallbox",
    );
    expect(
      await screen.findByLabelText("configurazione panelCount"),
    ).toHaveValue("16");
    expect(p.onCommit).not.toHaveBeenCalled();
  });
  it("fails closed for an old endpoint, readonly actions, or a mismatched response identity", async () => {
    const p = props();
    p.transport.mockImplementationOnce(async (req) => ({
      ...response(req),
      turn: { ...response(req).turn, nativeTurn: undefined },
    }));
    render(<VerticalWizardAiDialog {...p} />);
    send();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Endpoint locale non aggiornato",
    );
    p.transport.mockImplementationOnce(async (req) => response(req));
    send("Spiegami senza modificare il preventivo");
    expect(await screen.findByRole("alert")).toHaveTextContent("incoerente");
    expect(p.applyProposal).not.toHaveBeenCalled();
    p.transport.mockImplementationOnce(async (req) => ({
      ...response(req),
      turnId: "stale",
    }));
    send();
    expect(await screen.findByRole("alert")).toHaveTextContent("non coerente");
  });
  it("ignores late replies after stop and blocks changed company/project", async () => {
    const p = props();
    let finish: (r: QuoteChatResult) => void = () => {};
    let request: QuoteChatRequest;
    p.transport.mockImplementation((req) => {
      request = req;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const ui = render(<VerticalWizardAiDialog {...p} />);
    send();
    await waitFor(() => expect(p.transport).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Interrompi" }));
    await act(async () => finish(response(request!)));
    expect(
      screen.queryByLabelText("configurazione panelCount"),
    ).not.toBeInTheDocument();
    ui.rerender(<VerticalWizardAiDialog {...p} fingerprint="changed" />);
    expect(screen.getByRole("alert")).toHaveTextContent("preventivo cambiati");
    expect(p.onCommit).not.toHaveBeenCalled();
  });
  it("does not double-commit and keeps the dialog open on a failed atomic save", async () => {
    const p = props();
    let reject: (e: Error) => void = () => {};
    p.onCommit.mockImplementation(
      () =>
        new Promise((_resolve, r) => {
          reject = r;
        }),
    );
    render(<VerticalWizardAiDialog {...p} />);
    send();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Conferma proposta nella bozza",
      }),
    );
    await screen.findByText("Anteprima: 16");
    fireEvent.click(screen.getByRole("button", { name: "Rivedi e applica" }));
    const button = screen.getByRole("button", {
      name: "Conferma e applica al wizard",
    });
    act(() => {
      button.click();
      button.click();
    });
    expect(p.onCommit).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error("Rollback eseguito")));
    expect(screen.getByRole("alert")).toHaveTextContent("Rollback");
    expect(p.onClose).not.toHaveBeenCalled();
  });
  it("cancels without applying any proposal", async () => {
    const p = props();
    render(<VerticalWizardAiDialog {...p} />);
    send();
    await screen.findByRole("button", {
      name: "Conferma proposta nella bozza",
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Chiudi" })[0],
    );
    fireEvent.click(screen.getByRole("button", { name: "Scarta e chiudi" }));
    expect(p.onClose).toHaveBeenCalledOnce();
    expect(p.onCommit).not.toHaveBeenCalled();
    expect(p.applyProposal).not.toHaveBeenCalled();
  });
});
