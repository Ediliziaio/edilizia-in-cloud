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
  useImpostazioniCommesseGenerali: () => ({ modelli: m.modelli, disponibile: true, isLoading: false, salva: { mutate: vi.fn(), isPending: false } }),
}));
vi.mock("@/hooks/useAvviaGenerale", () => ({ useAvviaGenerale: () => ({ mutate: m.avvia, isPending: false }) }));
vi.mock("@/components/orders/generali/ScegliCliente", () => ({ ScegliCliente: (): ReactElement => <p>Cliente</p> }));
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
});
