import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CampoMerce from "@/pages/campo/CampoMerce";
import type { AcquistoMio } from "@/hooks/campo/useCampoAcquisti";
import type { FotoDocumento } from "@/lib/campo/leggiDocumentoAcquisto";
import type { LetturaDocumento } from "@/lib/campo/acquisti";

const state = vi.hoisted(() => ({
  registra: vi.fn(), annulla: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn(),
  assignedIds: ["A"] as string[], activeOrderId: null as string | null,
  foto: null as FotoDocumento | null,
  miei: [] as AcquistoMio[],
  registraErrore: null as unknown,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "worker" }, profile: { company_id: "company" } }) }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error, warning: state.warning } }));
vi.mock("@/hooks/campo/useCampoAssignments", () => ({ useCampoAssignments: () => ({
  data: state.assignedIds.map(id => ({ order_id: id, order: { order_code: `ORD-${id}`, description: `Cantiere ${id}`, indirizzo_lavori: null as string | null } })),
  isError: false, refetch: vi.fn(),
}) }));
vi.mock("@/hooks/campo/useCampoDayTime", () => ({ useCampoDayTime: () => ({ summary: { activeOrderId: state.activeOrderId, state: state.activeOrderId ? "working" : "out" } }) }));
vi.mock("@/lib/campo/leggiDocumentoAcquisto", () => ({ elaboraFotoDocumento: async () => state.foto }));
vi.mock("@/hooks/campo/useCampoAcquisti", () => ({
  useMieiAcquisti: () => ({ data: state.miei }),
  useRegistraAcquisto: () => ({
    isPending: false,
    mutateAsync: async (a: unknown) => { state.registra(a); if (state.registraErrore) throw state.registraErrore; return "nuovo"; },
  }),
  useAnnullaAcquisto: () => ({ isPending: false, mutate: (id: string) => state.annulla(id) }),
}));

const lettura = (over: Partial<LetturaDocumento> = {}): LetturaDocumento => ({
  fornitore: "Tecnomat S.p.A.", numero: "DDT-123", data: "2026-10-03", totale: 45.5, confidenza: 0.9, daControllare: false,
  righe: [{ descrizione: "Silicone neutro", quantita: 2, unita: "pz", prezzo_unitario: 8.5, importo: 17 }, { descrizione: "Viti inox", quantita: 1, unita: "conf", importo: 28.5 }],
  ...over,
});
const foto = (over: Partial<FotoDocumento> = {}): FotoDocumento => ({ path: "company/A/acquisti/f.jpg", anteprima: "blob:x", lettura: lettura(), ...over });
const scatta = async () => {
  fireEvent.change(screen.getByLabelText("Foto del documento"), { target: { files: [new File(["x"], "doc.jpg", { type: "image/jpeg" })] } });
  await waitFor(() => expect(screen.getByAltText("Documento fotografato")).toBeInTheDocument());
};
const invia = () => fireEvent.click(screen.getByRole("button", { name: "Invia all’ufficio" }));

beforeEach(() => {
  vi.clearAllMocks();
  state.assignedIds = ["A"]; state.activeOrderId = null; state.foto = foto(); state.miei = []; state.registraErrore = null;
});
afterEach(cleanup);

describe("Merce presa: dalla foto al modulo", () => {
  it("legge il documento e precompila fornitore, numero, totale e prodotti", async () => {
    render(<CampoMerce />);
    await scatta();
    expect(screen.getByText("Letto: controlla qui sotto")).toBeInTheDocument();
    expect(screen.getByLabelText("Dove l’hai presa?")).toHaveValue("Tecnomat S.p.A.");
    expect(screen.getByLabelText("N° documento")).toHaveValue("DDT-123");
    expect(screen.getByLabelText("Data")).toHaveValue("2026-10-03");
    expect(screen.getByLabelText(/^Totale/)).toHaveValue("45,5");
    expect(screen.getByLabelText("Prodotto 1")).toHaveValue("Silicone neutro");
    expect(screen.getByLabelText("Quantità Silicone neutro")).toHaveValue("2");
    expect(screen.getByLabelText("Prodotto 2")).toHaveValue("Viti inox");
  });

  it("una lettura incerta chiede di controllare, senza testo tecnico", async () => {
    state.foto = foto({ lettura: lettura({ daControllare: true, confidenza: 0.5 }) });
    render(<CampoMerce />);
    await scatta();
    expect(screen.getByText(/Letto in parte: controlla bene/)).toBeInTheDocument();
  });

  it("se non riesce a leggere, l'operaio scrive a mano e non resta bloccato", async () => {
    state.foto = foto({ lettura: null });
    render(<CampoMerce />);
    await scatta();
    expect(screen.getByText("Non sono riuscito a leggerlo: scrivi tu fornitore e totale.")).toBeInTheDocument();
    expect(screen.getByLabelText("Dove l’hai presa?")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: /Sul conto dell’azienda/ }));
    fireEvent.change(screen.getByLabelText("Dove l’hai presa?"), { target: { value: "Leroy Merlin" } });
    fireEvent.change(screen.getByLabelText(/^Totale/), { target: { value: "120" } });
    invia();
    await waitFor(() => expect(state.registra).toHaveBeenCalledWith(expect.objectContaining({ fornitore: "Leroy Merlin", totale: 120, modalita: "conto_azienda" })));
  });

  it("dice se la foto non è stata salvata", async () => {
    state.foto = foto({ path: null });
    render(<CampoMerce />);
    await scatta();
    expect(screen.getByText("La foto non è stata salvata.")).toBeInTheDocument();
    expect(state.warning).toHaveBeenCalled();
  });
});

describe("Merce presa: come l'ha presa e invio", () => {
  it("non invia finché non dice come ha preso la merce", async () => {
    render(<CampoMerce />);
    await scatta();
    invia();
    expect(state.error).toHaveBeenCalledWith("Dici come hai preso la merce.");
    expect(state.registra).not.toHaveBeenCalled();
  });

  it("l'ha pagata lui: invia scontrino, cantiere unico, foto e prodotti", async () => {
    render(<CampoMerce />);
    await scatta();
    fireEvent.click(screen.getByRole("button", { name: /L’ho pagata io/ }));
    invia();
    await waitFor(() => expect(state.registra).toHaveBeenCalledWith(expect.objectContaining({
      orderId: "A", modalita: "pagato_da_me", tipoDocumento: "scontrino", fornitore: "Tecnomat S.p.A.", numero: "DDT-123",
      data: "2026-10-03", totale: 45.5, fotoPath: "company/A/acquisti/f.jpg",
      righe: [expect.objectContaining({ descrizione: "Silicone neutro", quantita: 2 }), expect.objectContaining({ descrizione: "Viti inox" })],
      lettura: { confidenza: 0.9, da_controllare: false },
    })));
    expect(state.success).toHaveBeenCalledWith("Inviata all’ufficio");
    // dopo l'invio il modulo si svuota
    await waitFor(() => expect(screen.queryByAltText("Documento fotografato")).toBeNull());
    expect(screen.getByLabelText("Dove l’hai presa?")).toHaveValue("");
  });

  it("per il rimborso servono foto e importo", async () => {
    state.foto = foto({ path: null, lettura: null });
    render(<CampoMerce />);
    await scatta();
    fireEvent.click(screen.getByRole("button", { name: /L’ho pagata io/ }));
    invia();
    expect(state.error).toHaveBeenCalledWith("Per il rimborso serve la foto dello scontrino.");
    expect(state.registra).not.toHaveBeenCalled();
    state.foto = foto({ lettura: lettura({ totale: null, righe: [] }) });
    cleanup(); render(<CampoMerce />); await scatta();
    fireEvent.click(screen.getByRole("button", { name: /L’ho pagata io/ }));
    invia();
    expect(state.error).toHaveBeenCalledWith("Indica quanto hai speso.");
  });

  it("propone il cantiere in cui è in servizio; con più cantieri e nessuno attivo bisogna sceglierlo", async () => {
    state.assignedIds = ["A", "B"]; state.activeOrderId = "B";
    render(<CampoMerce />);
    expect(screen.getByLabelText("Per quale cantiere?")).toHaveValue("B");
    cleanup();
    state.activeOrderId = null;
    render(<CampoMerce />);
    expect(screen.getByLabelText("Per quale cantiere?")).toHaveValue("");
    await scatta();
    fireEvent.click(screen.getByRole("button", { name: /Ritiro di un ordine/ }));
    invia();
    expect(state.error).toHaveBeenCalledWith("Scegli il cantiere a cui va la merce.");
    fireEvent.change(screen.getByLabelText("Per quale cantiere?"), { target: { value: "A" } });
    invia();
    await waitFor(() => expect(state.registra).toHaveBeenCalledWith(expect.objectContaining({ orderId: "A", modalita: "ritiro_ordine", tipoDocumento: "bolla" })));
  });

  it("toglie un prodotto e ne aggiunge uno a mano", async () => {
    render(<CampoMerce />);
    await scatta();
    fireEvent.click(screen.getByRole("button", { name: "Togli Viti inox" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi un prodotto" }));
    fireEvent.change(screen.getByLabelText("Prodotto 2"), { target: { value: "Guanti" } });
    fireEvent.click(screen.getByRole("button", { name: /Sul conto dell’azienda/ }));
    invia();
    await waitFor(() => expect(state.registra).toHaveBeenCalledWith(expect.objectContaining({
      righe: [expect.objectContaining({ descrizione: "Silicone neutro" }), expect.objectContaining({ descrizione: "Guanti", quantita: 1 })],
    })));
  });

  it("mostra la frase del database quando l'invio non è possibile (es. documento già caricato)", async () => {
    state.registraErrore = { code: "P0001", message: "Questo documento è già stato caricato da Luca il 04/10: non serve rimandarlo." };
    render(<CampoMerce />);
    await scatta();
    fireEvent.click(screen.getByRole("button", { name: /Sul conto dell’azienda/ }));
    invia();
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("Questo documento è già stato caricato da Luca il 04/10: non serve rimandarlo."));
    // il modulo resta compilato per correggere
    expect(screen.getByAltText("Documento fotografato")).toBeInTheDocument();
  });
});

describe("Merce presa: le ultime inviate", () => {
  const mio = (over: Partial<AcquistoMio>): AcquistoMio => ({
    id: "1", created_at: "2026-10-04T08:00:00Z", order_id: "A", modalita: "pagato_da_me", fornitore: "Tecnomat", numero_documento: "1",
    totale: 45.5, righe: [], stato: "da_verificare", rimborso_stato: "da_rimborsare", motivo_rifiuto: null, order: { order_code: "ORD-A" }, ...over,
  });

  it("mostra a che punto è ognuna, col motivo se l'ufficio non l'ha accettata", () => {
    state.miei = [
      mio({ id: "1" }),
      mio({ id: "2", stato: "rifiutato", rimborso_stato: "non_dovuto", motivo_rifiuto: "Scontrino illeggibile" }),
      mio({ id: "3", stato: "registrato", rimborso_stato: "rimborsato" }),
    ];
    render(<CampoMerce />);
    expect(screen.getByText("In verifica dall’ufficio")).toBeInTheDocument();
    expect(screen.getByText("Non accettata: Scontrino illeggibile")).toBeInTheDocument();
    expect(screen.getByText("Registrata · rimborsata")).toBeInTheDocument();
  });

  it("una ancora in verifica si può ritirare; le altre no", () => {
    state.miei = [mio({ id: "1" }), mio({ id: "2", stato: "registrato", rimborso_stato: "non_dovuto" })];
    render(<CampoMerce />);
    const ritira = screen.getAllByRole("button", { name: /Ritira, ho sbagliato/ });
    expect(ritira).toHaveLength(1);
    fireEvent.click(ritira[0]);
    expect(state.annulla).toHaveBeenCalledWith("1");
  });
});
