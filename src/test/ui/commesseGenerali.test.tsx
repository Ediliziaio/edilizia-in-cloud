import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";

/**
 * Commesse generali (30/10/2026): la pagina della generale e l'interruttore in Impostazioni.
 * I numeri sono quelli di commesseGenerali.test.ts; qui si guarda cosa vede chi usa l'app.
 */
const m = vi.hoisted(() => ({
  riepilogo: null as RiepilogoGenerale | null,
  mobile: false,
  canEditOrders: true,
  modelli: [] as string[],
  salva: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => m.mobile }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditOrders: m.canEditOrders, isLoading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda" } }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: {} }) }));
vi.mock("@/components/orders/generali/CollegaCommesseDialog", () => ({ CollegaCommesseDialog: (): null => null }));
vi.mock("@/components/orders/generali/ModificaGeneraleDialog", () => ({ ModificaGeneraleDialog: (): null => null }));
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => m.navigate,
}));
// Un modulo pronto (il contratto) e uno no (il piano): solo il primo deve comparire, e solo per l'appalto.
vi.mock("@/components/orders/generali/moduli/ContrattoScheda", () => ({
  modulo: { pronto: true, titolo: "Contratto e SAL", telefono: false, Scheda: (): ReactElement => <p>Scheda del contratto</p>, Riquadro: (): ReactElement => <p>Riquadro del contratto</p> },
}));
// Il piano economico è pronto (30/10): qui resta «non pronto» per provare che un modulo spento non compare.
vi.mock("@/components/orders/generali/moduli/PianoScheda", () => ({
  modulo: { pronto: false, titolo: "Piano economico", telefono: false, Scheda: (): null => null },
}));
// Anche gli investitori sono pronti (30/10): qui restano «non pronti», per la stessa prova.
vi.mock("@/components/orders/generali/moduli/InvestitoriScheda", () => ({
  modulo: { pronto: false, titolo: "Investitori", telefono: false, Scheda: (): null => null },
}));
vi.mock("@/hooks/useCommesseGenerali", () => ({
  useRiepilogoGenerale: () => ({ data: m.riepilogo, isLoading: false, isError: false, refetch: vi.fn() }),
  useScollegaCommessa: () => ({ mutate: vi.fn(), isPending: false }),
  messaggioGenerale: (_e: unknown, cosa: string) => `errore ${cosa}`,
  useImpostazioniCommesseGenerali: () => ({ modelli: m.modelli, disponibile: true, isLoading: false, salva: { mutate: m.salva, isPending: false } }),
}));

import { CommessaGeneraleDettaglio } from "@/components/orders/generali/CommessaGeneraleDettaglio";
import CommesseGeneraliConfig from "@/components/settings/CommesseGeneraliConfig";

const permessiPieni = { importi: true, costi: true, margini: true };
const riepilogo = (permessi = permessiPieni): RiepilogoGenerale => ({
  generale: { id: "g", codice: "C-014", nome: "Appalto scuole 2027", cliente: "Comune di Prova", clienteId: "cli", modello: "appalto", creataIl: null, valore: permessi.importi ? 2_970_000 : null },
  figlie: [
    { id: "a", codice: "ODL-1", nome: "Scuola Rodari", stato: null, statoNome: "In corso", statoColore: "#f59e0b", indirizzo: null, inizio: null, fine: null, avanzamento: 60,
      importo: permessi.importi ? 1_500_000 : null, eseguito: permessi.importi ? 900_000 : null, fatturato: permessi.importi ? 800_000 : null, incassato: permessi.importi ? 600_000 : null,
      costo: permessi.costi ? 700_000 : null, margine: permessi.margini ? 100_000 : null },
    { id: "b", codice: "ODL-2", nome: "Scuola Collodi", stato: null, statoNome: null, statoColore: null, indirizzo: null, inizio: null, fine: null, avanzamento: 40,
      importo: permessi.importi ? 900_000 : null, eseguito: permessi.importi ? 360_000 : null, fatturato: permessi.importi ? 394_000 : null, incassato: permessi.importi ? 300_000 : null,
      costo: permessi.costi ? 420_000 : null, margine: permessi.margini ? -60_000 : null },
  ],
  permessi,
});

const disegna = () => render(<MemoryRouter><CommessaGeneraleDettaglio generaleId="g" /></MemoryRouter>);

beforeEach(() => {
  m.riepilogo = riepilogo();
  m.mobile = false;
  m.canEditOrders = true;
  m.modelli = [];
  m.salva.mockReset();
  m.navigate.mockReset();
});
afterEach(cleanup);

describe("la pagina della commessa generale", () => {
  it("dice cos'è, di chi è e quanti ordini di lavoro contiene", () => {
    disegna();
    expect(screen.getByRole("heading", { level: 1, name: "Appalto scuole 2027" })).toBeVisible();
    expect(screen.getByText("Commessa generale · Appalto a contratto")).toBeVisible();
    expect(screen.getByText(/Committente: Comune di Prova · 2 ordini di lavoro/)).toBeVisible();
  });

  it("il contratto scala: valore, da assegnare, eseguito, fatturato e incassato con le stesse basi", () => {
    disegna();
    const scala = screen.getByRole("region", { name: /Valore del contratto/ });
    expect(within(scala).getByText(/Da assegnare\s+570\.000\s+€/)).toBeVisible();
    expect(within(scala).getByText("Incassato")).toBeVisible();
    expect(within(scala).getByText(/900\.000\s+€/, { selector: "dd" })).toBeVisible();
  });

  it("una commessa in perdita compare tra le cose da guardare, e il margine è rosso nella tabella", () => {
    disegna();
    expect(screen.getByText("ODL-2 è in perdita.")).toBeVisible();
    const riga = screen.getByRole("link", { name: /Scuola Collodi/ }).closest("tr")!;
    expect(within(riga).getByText(/-60\.000\s+€/)).toHaveClass("text-destructive");
  });

  it("«Nuovo ordine di lavoro» apre la creazione con generale e committente già scelti", () => {
    disegna();
    fireEvent.click(screen.getAllByRole("button", { name: /Nuovo ordine di lavoro/ })[0]);
    expect(m.navigate).toHaveBeenCalledWith("/azienda/ordini/nuovo?generale=g&customer_id=cli");
  });

  it("chi non vede gli importi non vede euro né la scala, solo quante commesse e l'avanzamento", () => {
    m.riepilogo = riepilogo({ importi: false, costi: false, margini: false });
    disegna();
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Valore del contratto/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("Avanzamento").length).toBeGreaterThan(0);
  });

  it("da telefono si legge soltanto: niente bottoni per creare, collegare o modificare", () => {
    m.mobile = true;
    disegna();
    expect(screen.queryByRole("button", { name: /Nuovo ordine di lavoro|Collega|Modifica/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Scuola Rodari/ })).toHaveAttribute("href", "/azienda/ordini/a");
  });

  it("generale vuota: il prossimo passo, non una tabella di zeri", () => {
    m.riepilogo = { ...riepilogo(), figlie: [] };
    disegna();
    expect(screen.getByText("Qui dentro non c'è ancora niente.")).toBeVisible();
    expect(screen.getByRole("button", { name: /Collega commesse esistenti/ })).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("Impostazioni → Commesse generali", () => {
  it("un interruttore per tipo; accenderne uno salva l'elenco nell'ordine giusto", () => {
    m.modelli = ["compravendita"];
    render(<CommesseGeneraliConfig puoModificare />);
    const appalto = screen.getByRole("switch", { name: "Appalto a contratto" });
    expect(appalto).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Compra, ristruttura, vendi" })).toBeChecked();
    fireEvent.click(appalto);
    expect(m.salva).toHaveBeenCalledWith(["compravendita", "appalto"], expect.anything());
  });

  it("senza il permesso gli interruttori si vedono ma non si toccano", () => {
    render(<CommesseGeneraliConfig puoModificare={false} />);
    for (const s of screen.getAllByRole("switch")) expect(s).toBeDisabled();
  });
});

describe("le schede dei moduli", () => {
  it("un modulo pronto del modello aggiunge la sua scheda e il suo riquadro in Panoramica; quelli non pronti no", () => {
    disegna();
    expect(screen.getByRole("tab", { name: "Panoramica" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Contratto e SAL" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Piano economico" })).not.toBeInTheDocument();
    expect(screen.getByText("Riquadro del contratto")).toBeVisible();
  });

  it("la scheda si apre dall'indirizzo (?scheda=contratto)", () => {
    render(<MemoryRouter initialEntries={["/azienda/ordini/g?scheda=contratto"]}><CommessaGeneraleDettaglio generaleId="g" /></MemoryRouter>);
    expect(screen.getByRole("tab", { name: "Contratto e SAL" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Scheda del contratto")).toBeVisible();
  });

  it("un modello che non usa il modulo non ne mostra la scheda", () => {
    m.riepilogo = { ...riepilogo(), generale: { ...riepilogo().generale, modello: "sviluppo" } };
    disegna();
    expect(screen.queryByRole("tab", { name: "Contratto e SAL" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("da telefono una scheda che non lo dichiara non compare", () => {
    m.mobile = true;
    disegna();
    expect(screen.queryByRole("tab", { name: "Contratto e SAL" })).not.toBeInTheDocument();
  });
});
