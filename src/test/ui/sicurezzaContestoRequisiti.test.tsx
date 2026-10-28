import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/sicurezza/SchedaCommessaDialog", () => ({
  SchedaCommessaDialog: ({ destinazione, onClose }: any) => <div role="dialog" aria-label="Scheda interna"><output>{destinazione.to}</output><output>{JSON.stringify(destinazione.state)}</output><button onClick={onClose}>Torna alla commessa</button></div>,
}));
vi.mock("@/components/sicurezza/AttrezzatureCommessa", () => ({
  AttrezzatureCommessa: ({
    dataRiferimento,
    faseRiferimento,
  }: {
    dataRiferimento: string;
    faseRiferimento: string;
  }) => (
    <output aria-label="Contesto attrezzature">
      {dataRiferimento} / {faseRiferimento}
    </output>
  ),
}));
vi.mock("@/components/sicurezza/ProfiliRequisitiDialog", () => ({
  PulsanteProfiliRequisiti: () : null => null,
}));
vi.mock("@/components/sicurezza/DpiCommessa", () => ({
  DpiCommessa: ({
    dataRiferimento,
    faseRiferimento,
  }: {
    dataRiferimento: string;
    faseRiferimento: string;
  }) => (
    <output aria-label="Contesto DPI">
      {dataRiferimento} / {faseRiferimento}
    </output>
  ),
}));
vi.mock("@/components/sicurezza/ProdottiSdsCommessa", () => ({
  ProdottiSdsCommessa: ({
    dataRiferimento,
    faseRiferimento,
    contestoNonDisponibile,
  }: {
    dataRiferimento: string;
    faseRiferimento: string;
    contestoNonDisponibile: boolean;
  }) => (
    <output aria-label="Contesto prodotti SDS">
      {dataRiferimento} / {faseRiferimento} / {String(contestoNonDisponibile)}
    </output>
  ),
}));
vi.mock("@/components/sicurezza/RequisitiAddettiCommessa", () => ({
  RequisitiAddettiCommessa: ({
    companyId,
    orderId,
    dataRiferimento,
    faseRiferimento,
    contestoNonDisponibile,
  }: {
    companyId: string;
    orderId: string;
    dataRiferimento: string;
    faseRiferimento: string;
    contestoNonDisponibile: boolean;
  }) => (
    <output aria-label="Contesto requisiti addetti">
      {companyId} / {orderId} / {dataRiferimento} / {faseRiferimento} /{" "}
      {String(contestoNonDisponibile)}
    </output>
  ),
}));
const s = vi.hoisted(() => ({
  erroreFasi: false,
  erroreVerbali: false,
  readonly: false,
  pos: [] as unknown[],
  crea: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewSicurezzaCantiere: true,
    solaLettura: s.readonly,
  }),
}));
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => s.navigate,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === "sicurezza-commessa-ponteggi" ? false : [] as never[],
    isLoading: false,
    isError: queryKey[0] === "sicurezza-commessa-verbali" && s.erroreVerbali,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/usePos", () => ({
  usePosElenco: () => ({ data: s.pos, isLoading: false, isError: false }),
  useCreaPos: () => ({ isPending: false, mutateAsync: s.crea }),
}));
vi.mock("@/hooks/useDocumentiSicurezza", () => ({
  useDocumentiSicurezza: () => ({ data: [] as never[], isLoading: false, isError: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/sicurezza/IncarichiCantiere", () => ({
  IncarichiCantiere: ({ dataRiferimento }: { dataRiferimento: string }) => (
    <output aria-label="Data degli incarichi">{dataRiferimento}</output>
  ),
}));
vi.mock("@/components/sicurezza/ImpreseCommessa", () => ({
  ImpreseCommessa: ({ dataRiferimento }: { dataRiferimento: string }) => (
    <output aria-label="Data delle assegnazioni">{dataRiferimento}</output>
  ),
}));
vi.mock("@/components/sicurezza/DocumentiSicurezza", () => ({
  DocumentiSicurezza: () : null => null,
  CaricaDocumentoSicurezzaDialog: () : null => null,
}));
vi.mock("@/components/sicurezza/FascicoloDocumenti", () => ({
  FascicoloDocumenti: ({
    dataRiferimento,
    faseRiferimento,
  }: {
    dataRiferimento: string;
    faseRiferimento: string;
  }) => (
    <output aria-label="Contesto trasmesso al fascicolo">
      {dataRiferimento} / {faseRiferimento}
    </output>
  ),
}));
vi.mock("@/hooks/useFascicoloCantiere", () => ({
  useImpreseCommessa: () => ({
    data: { imprese: [] as never[], assegnazioni: [] as never[], evidenze: [] as never[] },
    isLoading: false,
    isError: false,
  }),
  useFasiFascicolo: () => ({
    data: [
      { id: "fase1", name: "Fase iniziale" },
      { id: "fase2", name: "Fase successiva" },
    ],
    isLoading: false,
    isError: s.erroreFasi,
  }),
  useEvidenzeFascicolo: () => ({
    data: [
      {
        id: "e1",
        order_id: "ordine",
        subappaltatore_id: null as null,
        operaio_id: null as null,
        tipo: "durc",
        titolo: "DURC fase iniziale",
        fase_id: "fase1",
        applicabile_dal: "2026-10-01",
        applicabile_al: "2026-10-31",
        file_path: "file1",
        file_name: "fase1.pdf",
        stato: "verificato",
        updated_at: "2026-10-01",
      },
      {
        id: "e2",
        order_id: "ordine",
        subappaltatore_id: null as null,
        operaio_id: null as null,
        tipo: "durc",
        titolo: "DURC fase successiva",
        fase_id: "fase2",
        applicabile_dal: "2026-11-01",
        applicabile_al: "2026-11-30",
        file_path: "file2",
        file_name: "fase2.pdf",
        stato: "verificato",
        updated_at: "2026-10-01",
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));
import { SicurezzaCommessa } from "@/components/sicurezza/SicurezzaCommessa";
afterEach(cleanup);
beforeEach(() => {
  s.erroreFasi = false;
  s.erroreVerbali = false;
  s.readonly = false;
  s.pos = [];
  s.navigate.mockReset();
  s.crea.mockReset().mockResolvedValue({
    pos_id: "nuovo-pos",
    avvisi: ["Completa le lavorazioni"],
  });
});
const mostra = () =>
  render(
    <MemoryRouter>
      <SicurezzaCommessa companyId="azienda" orderId="ordine" />
    </MemoryRouter>,
  );
const area = (nome: RegExp) =>
  fireEvent.click(screen.getByRole("button", { name: nome }));
const torna = () =>
  fireEvent.click(screen.getByRole("button", { name: "Torna al riepilogo" }));
describe("Riepilogo sicurezza e dettagli nei popup", () => {
  it("mostra quattro aree senza montare tutti i moduli nella pagina", () => {
    mostra();
    expect(
      screen.getByRole("heading", { name: "Sicurezza della commessa" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Contesto DPI")).not.toBeInTheDocument();
    area(/^Apri Persone e imprese$/);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Data degli incarichi")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Imprese e operai esterni" }),
    );
    expect(
      screen.getByLabelText("Data delle assegnazioni"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Data degli incarichi"),
    ).not.toBeInTheDocument();
    torna();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("data e fase arrivano ai dettagli aperti successivamente", () => {
    mostra();
    fireEvent.change(screen.getByLabelText("Data di applicabilità"), {
      target: { value: "2026-11-05" },
    });
    fireEvent.change(screen.getByLabelText("Fase", { exact: true }), {
      target: { value: "fase2" },
    });
    area(/^Apri Documenti$/);
    fireEvent.click(
      screen.getByRole("button", { name: "Documenti e richieste" }),
    );
    expect(
      screen.getByLabelText("Contesto trasmesso al fascicolo"),
    ).toHaveTextContent("2026-11-05 / fase2");
    torna();
    area(/^Apri Mezzi e prodotti$/);
    expect(screen.getByLabelText("Contesto attrezzature")).toHaveTextContent(
      "2026-11-05 / fase2",
    );
    fireEvent.click(screen.getByRole("button", { name: "Prodotti e SDS" }));
    expect(screen.getByLabelText("Contesto prodotti SDS")).toHaveTextContent(
      "2026-11-05 / fase2 / false",
    );
    torna();
    area(/^Apri Persone e imprese$/);
    expect(screen.getByLabelText("Data degli incarichi")).toHaveTextContent(
      "2026-11-05",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Qualifiche degli addetti" }),
    );
    expect(
      screen.getByLabelText("Contesto requisiti addetti"),
    ).toHaveTextContent("azienda / ordine / 2026-11-05 / fase2 / false");
  });
  it("un errore di fase rimane visibile nel riepilogo e nei moduli pertinenti", () => {
    s.erroreFasi = true;
    mostra();
    expect(
      screen
        .getAllByRole("alert")
        .some((a) => a.textContent?.includes("Fasi non disponibili")),
    ).toBe(true);
    area(/^Apri Mezzi e prodotti$/);
    fireEvent.click(screen.getByRole("button", { name: "Prodotti e SDS" }));
    expect(screen.getByLabelText("Contesto prodotti SDS")).toHaveTextContent(
      "true",
    );
  });
  it("la creazione apre il POS nel popup senza navigare fuori dalla commessa", async () => {
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Prepara il POS" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Bozza POS creata" }),
      ).toBeInTheDocument(),
    );
    expect(s.navigate).not.toHaveBeenCalled();
    expect(screen.getByText("Completa le lavorazioni")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apri scheda POS" }));
    expect(s.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Scheda interna" })).toHaveTextContent("/azienda/sicurezza-cantiere/pos/nuovo-pos");
    expect(screen.getByText(JSON.stringify({ avvisi: ["Completa le lavorazioni"] }))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Torna alla commessa" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("si può restare nella commessa dopo la creazione", async () => {
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Prepara il POS" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Bozza POS creata" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Resta nella commessa" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(s.navigate).not.toHaveBeenCalled();
  });
  it("non crea due bozze con un doppio clic", async () => {
    let completa!: (r: unknown) => void;
    s.crea.mockImplementation(
      () =>
        new Promise((resolve) => {
          completa = resolve;
        }),
    );
    mostra();
    const b = screen.getByRole("button", { name: "Prepara il POS" });
    fireEvent.click(b);
    fireEvent.click(b);
    expect(s.crea).toHaveBeenCalledTimes(1);
    completa({ pos_id: "unico", avvisi: [] });
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Bozza POS creata" }),
      ).toBeInTheDocument(),
    );
  });
  it("mantiene la commessa aperta e mostra l’errore quando la creazione fallisce", async () => {
    s.crea.mockRejectedValue(new Error("Servizio non disponibile"));
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Prepara il POS" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Servizio non disponibile",
      ),
    );
    expect(screen.queryByText("Bozza POS creata")).not.toBeInTheDocument();
    expect(s.navigate).not.toHaveBeenCalled();
  });
  it("in sola lettura non propone di creare POS e conserva la consultazione", () => {
    s.readonly = true;
    s.pos = [
      {
        id: "p1",
        company_id: "azienda",
        order_id: "ordine",
        status: "bozza",
        revisione: 0,
        created_at: "2026-10-27",
      },
    ];
    mostra();
    area(/^Gestisci POS/);
    expect(
      screen.getByRole("button", { name: "Apri scheda POS" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Nuova bozza POS" }),
    ).not.toBeInTheDocument();
  });
});

it("un errore del registro verbali non viene presentato come nessun verbale", () => {
  s.erroreVerbali = true;
  mostra();
  area(/^Apri Controlli e verbali$/);
  fireEvent.click(screen.getByRole("button", { name: "Verbali" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Verbali non disponibili",
  );
  expect(
    screen.queryByText("Nessun verbale per questa commessa."),
  ).not.toBeInTheDocument();
});

it("il popup POS breve non mostra una navigazione con una sola scelta", () => {
  s.pos = [
    {
      id: "abc12345-def",
      company_id: "azienda",
      order_id: "ordine",
      status: "bozza",
      revisione: 0,
      created_at: "2026-10-27T09:12:00Z",
    },
  ];
  mostra();
  area(/^Gestisci POS/);
  expect(
    screen.queryByRole("navigation", { name: "Sezioni del popup sicurezza" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("Più recente")).toBeInTheDocument();
  expect(screen.getByText("Bozza da completare")).toBeInTheDocument();
  expect(screen.getByText(/Rif. ABC12345/)).toBeInTheDocument();
});
