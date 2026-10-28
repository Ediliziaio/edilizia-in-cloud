import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const s = vi.hoisted(() => ({
  rpc: vi.fn(),
  upload: vi.fn(),
  saved: vi.fn(),
  readonly: false,
  docs: [] as unknown[],
  error: false,
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewCosts: true,
    canViewSubappaltatoriAmministrazione: true,
    canEditOrders: true,
    solaLettura: s.readonly,
  }),
}));
vi.mock("@/lib/subappaltatori/contrattoCarta", () => ({
  BUCKET_CONTRATTI_CARTA: "contratti-sub-carta",
  validaScansioneContratto: async () => "application/pdf",
}));
vi.mock("@/components/shared/PdfBlobLivePreviewPanel", () => ({
  PdfBlobLivePreviewPanel: () => <div>Anteprima copia</div>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: s.rpc,
    storage: { from: () => ({ upload: s.upload, createSignedUrl: vi.fn() }) },
    from: () => {
      const q: Record<string, unknown> = {};
      for (const n of ["select", "eq", "order"]) q[n] = () => q;
      q.limit = () =>
        Promise.resolve({
          data: s.docs,
          error: s.error ? { message: "offline" } : null,
        });
      return q;
    },
  },
}));
import { ContrattoCarta } from "@/components/subappaltatori/ContrattoCarta";
const mostra = (elettronica = false) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ContrattoCarta
        companyId="azienda"
        contratto={{
          id: "contratto",
          numero_contratto: "DEMO",
          firmato_il: null,
          firmato_da: null,
        }}
        firmaElettronica={elettronica}
        onSaved={s.saved}
      />
    </QueryClientProvider>,
  );
async function compila() {
  fireEvent.click(
    await screen.findByRole("button", { name: "Carica firmato su carta" }),
  );
  fireEvent.change(screen.getByLabelText("Scansione del contratto firmato"), {
    target: {
      files: [
        new File(["%PDF-test"], "scansione.pdf", { type: "application/pdf" }),
      ],
    },
  });
  await screen.findByText(/scansione.pdf/);
  fireEvent.change(screen.getByLabelText("Firmatario per il subappaltatore"), {
    target: { value: "Firmatario DEMO" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
}
beforeEach(() => {
  vi.clearAllMocks();
  s.readonly = false;
  s.docs = [];
  s.error = false;
  s.upload.mockResolvedValue({ error: null });
  s.rpc.mockImplementation(
    async (name: string, p: Record<string, unknown>) => ({
      data:
        name === "subappalto_carta_prepara"
          ? {
              id: p.p_id,
              file_path: "azienda/doc/contratto.pdf",
              file_caricato: false,
            }
          : { id: p.p_id },
      error: null,
    }),
  );
});
afterEach(cleanup);
describe("Copia cartacea nel contratto", () => {
  it("richiede scansione, firmatario e verifica prima di archiviare", async () => {
    mostra();
    fireEvent.click(
      await screen.findByRole("button", { name: "Carica firmato su carta" }),
    );
    expect(
      screen.getByRole("button", { name: "Archivia copia firmata" }),
    ).toBeDisabled();
    expect(s.rpc).not.toHaveBeenCalled();
  });
  it("carica su un percorso del server e conferma solo dopo l’upload riuscito", async () => {
    mostra();
    await compila();
    fireEvent.click(
      screen.getByRole("button", { name: "Archivia copia firmata" }),
    );
    await waitFor(() => expect(s.saved).toHaveBeenCalledOnce());
    expect(s.upload).toHaveBeenCalledWith(
      "azienda/doc/contratto.pdf",
      expect.any(File),
      { contentType: "application/pdf", upsert: false },
    );
    expect(s.rpc.mock.calls.map((c) => c[0])).toEqual([
      "subappalto_carta_prepara",
      "subappalto_carta_conferma",
    ]);
  });
  it("un upload fallito non registra la firma o dichiara successo", async () => {
    s.upload.mockResolvedValue({ error: { message: "offline" } });
    mostra();
    await compila();
    fireEvent.click(
      screen.getByRole("button", { name: "Archivia copia firmata" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "File non caricato",
    );
    expect(s.saved).not.toHaveBeenCalled();
    expect(
      s.rpc.mock.calls.some((c) => c[0] === "subappalto_carta_conferma"),
    ).toBe(false);
  });
  it("ritenta una conferma fallita riusando l’upload e la richiesta esistente", async () => {
    let preparazioni = 0,
      conferme = 0;
    s.rpc.mockImplementation(
      async (name: string, p: Record<string, unknown>) => {
        if (name === "subappalto_carta_prepara")
          return {
            data: {
              id: p.p_id,
              file_path: "azienda/doc/contratto.pdf",
              file_caricato: ++preparazioni > 1,
            },
            error: null,
          };
        if (++conferme === 1)
          return { data: null, error: { message: "Conferma interrotta" } };
        return { data: { id: p.p_id }, error: null };
      },
    );
    mostra();
    await compila();
    fireEvent.click(
      screen.getByRole("button", { name: "Archivia copia firmata" }),
    );
    await screen.findByText("Conferma interrotta");
    fireEvent.click(
      screen.getByRole("button", { name: "Archivia copia firmata" }),
    );
    await waitFor(() => expect(s.saved).toHaveBeenCalledOnce());
    expect(s.upload).toHaveBeenCalledOnce();
    expect(s.rpc.mock.calls[0][1].p_id).toBe(s.rpc.mock.calls[2][1].p_id);
  });
  it("la sola lettura e una firma elettronica attiva impediscono un nuovo upload", async () => {
    s.readonly = true;
    mostra();
    fireEvent.click(
      await screen.findByRole("button", { name: "Carica firmato su carta" }),
    );
    expect(
      screen.getByLabelText("Scansione del contratto firmato"),
    ).toBeDisabled();
    cleanup();
    s.readonly = false;
    mostra(true);
    fireEvent.click(
      await screen.findByRole("button", { name: "Carica firmato su carta" }),
    );
    expect(
      screen.getByText(/richiesta di firma elettronica attiva/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Archivia copia firmata" }),
    ).not.toBeInTheDocument();
  });
});
