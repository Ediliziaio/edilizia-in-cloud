import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

/** Impostazioni → Commesse generali: dire come si lavora e partire da lì (02/11/2026). */
const m = vi.hoisted(() => ({
  modelli: [] as string[], conti: {} as Record<string, number>, ultime: [] as { id: string; codice: string; nome: string; modello: string }[], mobile: false, canEditOrders: true,
  avvia: vi.fn(), navigate: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda" } }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: (): { data: { conti: Record<string, number>; ultime: { id: string; codice: string; nome: string; modello: string }[] } } => ({ data: { conti: m.conti, ultime: m.ultime } }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => m.mobile }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditOrders: m.canEditOrders, canViewMargins: true }) }));
vi.mock("@/hooks/useCommesseGenerali", () => ({
  messaggioGenerale: () => "errore",
  useImpostazioniCommesseGenerali: () => ({ modelli: m.modelli, disponibile: true, isLoading: false, salva: { mutate: vi.fn(), isPending: false }, commessaCliente: true, salvaCommessaCliente: { mutate: vi.fn(), isPending: false } }),
}));
vi.mock("@/hooks/useAvviaGenerale", () => ({ useAvviaGenerale: () => ({ mutate: m.avvia, isPending: false }) }));
vi.mock("@/components/orders/generali/ScegliCliente", () => ({ ScegliCliente: ({ onCambia }: { onCambia: (v: string) => void }): ReactElement => <button type="button" onClick={() => onCambia("cli")}>Cliente</button> }));
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => m.navigate,
}));
import CommesseGeneraliConfig from "@/components/settings/CommesseGeneraliConfig";

// Il mondo finto dei test non ha ResizeObserver: gli interruttori nel dialogo lo chiedono.
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  m.modelli = []; m.conti = {}; m.ultime = []; m.mobile = false; m.canEditOrders = true;
});

const disegna = () => render(<MemoryRouter><CommesseGeneraliConfig puoModificare /></MemoryRouter>);

describe("impostazione delle commesse generali", () => {
  it("spento: si legge cosa comprende, ma non si offre di creare", () => {
    disegna();
    expect(screen.getByText("Come lavori?")).toBeInTheDocument();
    expect(screen.getByText("Contratto e SAL")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Crea la prima/ })).not.toBeInTheDocument();
  });

  it("acceso e mai usato: «Crea la prima» apre la creazione col tipo giusto", () => {
    m.modelli = ["sviluppo"];
    disegna();
    fireEvent.click(screen.getByRole("button", { name: /Crea la prima/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Nuova commessa generale");
    expect(screen.getByLabelText(/Quante unità/)).toBeInTheDocument();
  });

  it("già usato: porta all'elenco e si può crearne un'altra", () => {
    m.modelli = ["appalto"];
    m.conti = { appalto: 2 };
    disegna();
    expect(screen.getByRole("link", { name: /Vedi le 2 che hai/ })).toHaveAttribute("href", "/azienda/ordini?generali=solo");
    expect(screen.getByRole("button", { name: /Creane un'altra/ })).toBeInTheDocument();
  });

  it("le generali che ci sono già si aprono da qui", () => {
    m.ultime = [{ id: "g1", codice: "O-1", nome: "Residenza", modello: "sviluppo" }];
    disegna();
    expect(screen.getByRole("link", { name: /Residenza/ })).toHaveAttribute("href", "/azienda/ordini/g1");
  });

  it("da telefono o senza permesso non si crea", () => {
    m.modelli = ["appalto"];
    m.mobile = true;
    disegna();
    expect(screen.queryByRole("button", { name: /Crea la prima/ })).not.toBeInTheDocument();
    cleanup();
    m.mobile = false;
    m.canEditOrders = false;
    disegna();
    expect(screen.queryByRole("button", { name: /Crea la prima/ })).not.toBeInTheDocument();
  });

  it("si parte con le unità e il piano; niente unità per l'appalto", () => {
    m.modelli = ["sviluppo", "appalto"];
    disegna();
    fireEvent.click(screen.getAllByRole("button", { name: /Crea la prima/ })[1]);
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Residenza" } });
    fireEvent.change(screen.getByLabelText(/Quante unità/), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Crea commessa generale" }));
    const [{ unita, voci, nuova }] = m.avvia.mock.calls[0];
    expect(nuova).toMatchObject({ modello: "sviluppo", nome: "Residenza" });
    expect(unita.map((u: { sigla: string }) => u.sigla)).toEqual(["A1", "A2", "A3", "A4"]);
    expect(voci.length).toBeGreaterThan(0);
  });

  it("un numero sbagliato di unità ferma la creazione e lo dice", () => {
    m.modelli = ["sviluppo"];
    disegna();
    fireEvent.click(screen.getByRole("button", { name: /Crea la prima/ }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Residenza" } });
    fireEvent.change(screen.getByLabelText(/Quante unità/), { target: { value: "tante" } });
    expect(screen.getByRole("button", { name: "Crea commessa generale" })).toBeDisabled();
    expect(screen.getByText(/numero da 1 a 100/)).toBeInTheDocument();
  });

  it("partendo da Excel non aggiunge voci tipiche e apre l'importazione del piano", () => {
    m.modelli = ["sviluppo"];
    disegna();
    fireEvent.click(screen.getByRole("button", { name: /Crea la prima/ }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Nuova operazione" } });
    fireEvent.click(screen.getByRole("radio", { name: /Ho già un business plan Excel/ }));
    fireEvent.click(screen.getByRole("button", { name: "Crea commessa generale" }));
    const [payload, callback] = m.avvia.mock.calls[0];
    expect(payload.voci).toBeNull();
    expect(payload.unita).toEqual([]);
    callback.onSuccess({ id: "nuova-operazione", rimasti: [] });
    expect(m.navigate).toHaveBeenCalledWith("/azienda/ordini/nuova-operazione?scheda=piano&importa=1");
  });

  it("appalto: senza committente non si crea; il tipo e la consegna lavori vanno nei dati", () => {
    m.modelli = ["appalto"];
    disegna();
    fireEvent.click(screen.getByRole("button", { name: /Crea la prima/ }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Scuole 2027" } });
    expect(screen.getByRole("button", { name: "Crea commessa generale" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cliente" }));
    fireEvent.click(screen.getByRole("radio", { name: "Pubblico" }));
    fireEvent.change(screen.getByLabelText(/Consegna lavori/), { target: { value: "2027-01-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Crea commessa generale" }));
    const [payload] = m.avvia.mock.calls[0];
    expect(payload.nuova).toMatchObject({ modello: "appalto", clienteId: "cli" });
    expect(payload.dati).toEqual({ inizio: "2027-01-10", appalto: { tipo: "Pubblico" } });
  });

  it("compravendita: immobile, prezzo e rogito nei dati, e il prezzo diventa la voce d'acquisto del piano", () => {
    m.modelli = ["compravendita"];
    disegna();
    fireEvent.click(screen.getByRole("button", { name: /Crea la prima/ }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Corso Italia" } });
    fireEvent.change(screen.getByLabelText(/Indirizzo dell'immobile/), { target: { value: "Corso Italia 10, Torino" } });
    fireEvent.change(screen.getByLabelText(/Prezzo d'acquisto/), { target: { value: "185.000" } });
    fireEvent.change(screen.getByLabelText("Rogito d'acquisto"), { target: { value: "2027-02-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Crea commessa generale" }));
    const [payload] = m.avvia.mock.calls[0];
    expect(payload.dati).toEqual({
      indirizzo: "Corso Italia 10, Torino",
      immobile: { indirizzo: "Corso Italia 10, Torino", prezzo: 185000, data_rogito: "2027-02-15" },
    });
    const acquisto = payload.voci.find((v: { categoria: string; tipo: string }) => v.tipo === "costo" && v.categoria === "terreno");
    expect(acquisto).toMatchObject({ importo: 185000, mese: "2027-02", nota: null });
  });

  // 15/11/2026: le date scritte nel popup spostano il calendario del piano (prima partiva sempre da oggi).
  const voce = (voci: { tipo: string; categoria: string; mese: string }[], categoria: string) => voci.find((v) => v.categoria === categoria)?.mese;

  it("appalto: il piano parte dalla consegna lavori", () => {
    m.modelli = ["appalto"];
    disegna();
    fireEvent.click(screen.getByRole("button", { name: /Crea la prima/ }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Scuole 2027" } });
    fireEvent.click(screen.getByRole("button", { name: "Cliente" }));
    fireEvent.change(screen.getByLabelText(/Consegna lavori/), { target: { value: "2027-01-10" } });
    expect(screen.getByText(/Il calendario parte da gen 2027, dalla consegna lavori/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Crea commessa generale" }));
    const [{ voci }] = m.avvia.mock.calls[0];
    expect(voce(voci, "materiali")).toBe("2027-01");
    expect(voce(voci, "lavori")).toBe("2027-02");
  });

  it("sviluppo: la costruzione cade sull'inizio lavori, il terreno prima", () => {
    m.modelli = ["sviluppo"];
    disegna();
    fireEvent.click(screen.getByRole("button", { name: /Crea la prima/ }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Residenza" } });
    fireEvent.change(screen.getByLabelText(/Inizio lavori/), { target: { value: "2027-03-01" } });
    expect(screen.getByText("La costruzione parte da mar 2027; terreno e progetto prima, da nov 2026.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Crea commessa generale" }));
    const [{ voci }] = m.avvia.mock.calls[0];
    expect(voce(voci, "costruzione")).toBe("2027-03");
    expect(voce(voci, "terreno")).toBe("2026-11");
  });

  it("compravendita: rogito e inizio ristrutturazione, ognuno sulla sua voce; si dice in quante parti si rivende", () => {
    m.modelli = ["compravendita"];
    disegna();
    fireEvent.click(screen.getByRole("button", { name: /Crea la prima/ }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Corso Italia" } });
    fireEvent.change(screen.getByLabelText(/Prezzo d'acquisto/), { target: { value: "185.000" } });
    fireEvent.change(screen.getByLabelText("Rogito d'acquisto"), { target: { value: "2027-02-15" } });
    fireEvent.change(screen.getByLabelText(/Inizio ristrutturazione/), { target: { value: "2027-05-01" } });
    fireEvent.change(screen.getByLabelText(/In quante parti lo rivendi/), { target: { value: "1" } });
    expect(screen.getByText(/Lo rivendi intero/)).toBeInTheDocument();
    expect(screen.getByText("Il calendario parte dal rogito, feb 2027; la ristrutturazione da mag 2027.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Crea commessa generale" }));
    const [{ voci, unita }] = m.avvia.mock.calls[0];
    expect(voce(voci, "terreno")).toBe("2027-02");
    expect(voce(voci, "costruzione")).toBe("2027-05");
    expect(voce(voci, "vendite")).toBe("2027-10");
    expect(unita).toHaveLength(1);
  });

  it("compravendita da Excel: non promette che il prezzo entri nel piano", () => {
    m.modelli = ["compravendita"];
    disegna();
    fireEvent.click(screen.getByRole("button", { name: /Crea la prima/ }));
    fireEvent.change(screen.getByLabelText(/Prezzo d'acquisto/), { target: { value: "185.000" } });
    expect(screen.getByText(/Il prezzo d'acquisto entra nel piano/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Ho già un business plan Excel/ }));
    expect(screen.queryByText(/Il prezzo d'acquisto entra nel piano/)).not.toBeInTheDocument();
  });

  it("appalto con contratto da importare e budget da Excel: dice che il file si carica dopo, e apre il contratto", () => {
    m.modelli = ["appalto"];
    disegna();
    fireEvent.click(screen.getByRole("button", { name: /Crea la prima/ }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Scuole 2027" } });
    fireEvent.click(screen.getByRole("button", { name: "Cliente" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /importalo con l’AI/ }));
    expect(screen.getByText(/Puoi lasciarlo vuoto: lo legge l’AI dal contratto/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Ho già il budget in Excel/ }));
    expect(screen.getByText(/il file lo carichi poi dalla scheda Piano/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Crea commessa generale" }));
    const [payload, callback] = m.avvia.mock.calls[0];
    expect(payload.voci).toBeNull();
    callback.onSuccess({ id: "scuole", rimasti: [] });
    expect(m.navigate).toHaveBeenCalledWith("/azienda/ordini/scuole?scheda=contratto&importa-contratto=1");
  });

  it("l'esempio del nome è un nome, senza l'importo dentro", () => {
    m.modelli = ["appalto"];
    disegna();
    fireEvent.click(screen.getByRole("button", { name: /Crea la prima/ }));
    expect(screen.getByLabelText("Nome")).toHaveAttribute("placeholder", "Appalto manutenzione scuole 2027");
    expect(screen.getByRole("dialog")).toHaveTextContent("Ordini di lavoro e commesse da collegare si aggiungono anche dopo");
  });
});
