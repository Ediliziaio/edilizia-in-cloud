import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
  Link,
} from "react-router-dom";
import { useState } from "react";
import { useModificheSchedaCommessa } from "@/components/sicurezza/ContestoSchedaCommessa";
const permessi = vi.hoisted(() => ({
  canViewSubappaltatori: true,
  canViewMezzi: true,
  canViewSicurezzaCantiere: true,
  canViewOrders: true,
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => permessi }));
vi.mock("@/components/auth/FeatureRoute", () => ({
  FeatureRoute: ({ children }: any) => children,
}));
vi.mock("@/components/error/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: any) => children,
}));
function Impresa() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [q, setQ] = useSearchParams();
  return (
    <>
      <h2>Impresa {id}</h2>
      <output>{q.get("tab")}</output>
      <button onClick={() => setQ({ tab: "documenti" })}>
        Documenti impresa
      </button>
      <Link to="/azienda/mezzi/mezzo1">Mezzo collegato</Link>
      <button
        onClick={() =>
          navigate("/azienda/sicurezza-cantiere/pos/pos1", {
            state: { avvisi: ["Da completare"] },
          })
        }
      >
        POS collegato
      </button>
      <a href="/azienda/sicurezza-cantiere?tab=sds">SDS</a>
    </>
  );
}
function Pos() {
  const location = useLocation();
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  useModificheSchedaCommessa(dirty, pending);
  return (
    <>
      <h2>Editor POS {useParams().id}</h2>
      <output>{JSON.stringify(location.state)}</output>
      <input aria-label="Titolo POS" onChange={() => setDirty(true)} />
      <button onClick={() => setDirty(false)}>Salva POS</button>
      <button onClick={() => setPending(true)}>Inizia salvataggio</button>
      <button
        onClick={() => {
          setPending(false);
          setDirty(false);
        }}
      >
        Termina salvataggio
      </button>
    </>
  );
}
vi.mock("@/pages/azienda/SubappaltatoreDetail", () => ({ default: Impresa }));
vi.mock("@/pages/azienda/MezzoDetail", () => ({
  default: () => <h2>Mezzo {useParams().id}</h2>,
}));
vi.mock("@/pages/azienda/sicurezza/PosEditor", () => ({ default: Pos }));
vi.mock("@/components/sicurezza/SdsAziendali", () => ({
  SdsAziendali: () => <h2>Libreria sds</h2>,
}));
vi.mock("@/pages/azienda/SicurezzaCantiere", () => ({
  default: () => <h2>Libreria {useSearchParams()[0].get("tab")}</h2>,
}));
vi.mock("@/pages/azienda/OrderDetail", () => ({
  default: () => <h2>Commessa collegata</h2>,
}));
import { SchedaCommessaDialog } from "@/components/sicurezza/SchedaCommessaDialog";
function Pagina() {
  const [aperta, setAperta] = useState(true);
  const location = useLocation();
  return (
    <>
      <output aria-label="Indirizzo commessa">
        {location.pathname + location.search}
      </output>
      <input aria-label="Filtro originale" defaultValue="visura" />
      {aperta && (
        <SchedaCommessaDialog
          destinazione={{ to: "/azienda/subappaltatori/sub1" }}
          companyId="azienda"
          orderId="ordine1"
          onClose={() => setAperta(false)}
        />
      )}
    </>
  );
}
const mostra = () =>
  render(
    <MemoryRouter initialEntries={["/azienda/ordini/ordine1?tab=cantiere"]}>
      <Routes>
        <Route path="/azienda/ordini/:id" element={<Pagina />} />
      </Routes>
    </MemoryRouter>,
  );
afterEach(cleanup);
beforeEach(() => {
  Object.keys(permessi).forEach((k) => {
    (permessi as any)[k] = true;
  });
});
describe("Schede interne alla commessa", () => {
  it("risolve id e query della scheda e mantiene URL e filtri della commessa", async () => {
    mostra();
    expect(await screen.findByText("Impresa sub1")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Documenti impresa"));
    expect(await screen.findByText("documenti")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Mezzo collegato"));
    expect(await screen.findByText("Mezzo mezzo1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Scheda precedente" }));
    expect(await screen.findByText("Impresa sub1")).toBeInTheDocument();
    expect(screen.getByText("documenti")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Torna alla commessa" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Indirizzo commessa")).toHaveTextContent(
      "/azienda/ordini/ordine1?tab=cantiere",
    );
    expect(screen.getByLabelText("Filtro originale")).toHaveValue("visura");
  });
  it("intercetta anche anchor HTML senza cambiare la pagina", async () => {
    mostra();
    await screen.findByText("Impresa sub1");
    fireEvent.click(screen.getByText("SDS"));
    expect(await screen.findByText("Libreria sds")).toBeInTheDocument();
  });
  it("conserva lo stato del POS e protegge chiusura e ritorno con modifiche pendenti", async () => {
    mostra();
    await screen.findByText("Impresa sub1");
    fireEvent.click(screen.getByText("POS collegato"));
    expect(await screen.findByText("Editor POS pos1")).toBeInTheDocument();
    expect(
      screen.getByText(JSON.stringify({ avvisi: ["Da completare"] })),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Titolo POS"), {
      target: { value: "Modifica" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Chiudi" }),
    );
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "Uscire senza salvare?",
    );
    fireEvent.click(screen.getByText("Continua modifica"));
    expect(screen.getByLabelText("Titolo POS")).toHaveValue("Modifica");
    fireEvent.click(screen.getByText("Salva POS"));
    fireEvent.click(screen.getByRole("button", { name: "Scheda precedente" }));
    expect(await screen.findByText("Impresa sub1")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
  it("non monta schede senza permessi", async () => {
    permessi.canViewSubappaltatori = false;
    mostra();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Non hai il permesso",
    );
    expect(screen.queryByText("Impresa sub1")).not.toBeInTheDocument();
  });
  it("non interrompe un salvataggio in corso chiudendo il popup", async () => {
    mostra();
    await screen.findByText("Impresa sub1");
    fireEvent.click(screen.getByText("POS collegato"));
    await screen.findByText("Editor POS pos1");
    fireEvent.click(screen.getByText("Inizia salvataggio"));
    expect(
      screen.getByText(/Operazione in corso: attendi/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Scheda precedente" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Chiudi" }),
    );
    expect(screen.getByText("Editor POS pos1")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Termina salvataggio"));
    fireEvent.click(
      screen.getByRole("button", { name: "Chiudi" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("mantiene i permessi anche su un mezzo aperto da una scheda autorizzata", async () => {
    permessi.canViewMezzi = false;
    mostra();
    await screen.findByText("Impresa sub1");
    fireEvent.click(screen.getByText("Mezzo collegato"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Non hai il permesso",
    );
    expect(screen.queryByText("Mezzo mezzo1")).not.toBeInTheDocument();
  });
});

it("dalla scheda impresa apre la commessa nel popup e mantiene il ritorno all’impresa", async () => {
 const chiudi=vi.fn();
 render(<MemoryRouter initialEntries={['/azienda/subappaltatori/impresa1']}><SchedaCommessaDialog companyId="c" orderId="o1" contestoOrigine="impresa" destinazione={{to:'/azienda/ordini/o1'}} onClose={chiudi}/></MemoryRouter>);
 expect(await screen.findByRole('heading',{name:'Commessa collegata'})).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'Scheda commessa'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Torna all’impresa'}));
 expect(chiudi).toHaveBeenCalledOnce();
});
