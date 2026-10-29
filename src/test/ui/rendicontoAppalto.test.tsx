import {cleanup, render, screen} from "@testing-library/react";
import {afterEach, beforeAll, beforeEach, expect, it, vi} from "vitest";
import {RendicontoAppalto} from "@/components/orders/RendicontoAppalto";

const m = vi.hoisted(() => ({
  righe: [] as unknown[], daFare: [] as unknown[],
  costi: true, margini: true,
}));
vi.mock("@/hooks/use-toast", () => ({useToast: () => ({toast: vi.fn()})}));
vi.mock("@/integrations/supabase/client", () => ({supabase: {}}));
// Il blocco dei rendiconti è montato qui dentro: porta con sé router,
// permessi e stampa del PDF.
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({canViewBilling: true, canViewCosts: m.costi, canViewMargins: m.margini}),
}));
vi.mock("@/hooks/useRendicontoAppaltoPDF", () => ({
  useRendicontoAppaltoPDF: () => ({stampa: vi.fn(), isGenerating: false}),
}));
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  Link: ({to, children}: {to: string; children: unknown}) => <a href={to}>{children as never}</a>,
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({invalidateQueries: vi.fn()}),
  useMutation: () => ({isPending: false, mutate: vi.fn()}),
  useQuery: ({queryKey}: {queryKey: unknown[]}) => {
    const k = String(queryKey[0]);
    if (k === "appalto-rendiconto") return {data: m.righe, isLoading: false};
    if (k === "appalto-listino-commessa") return {
      data: [{id: "t1", tipo: "trasporto", codice: null, descrizione: "Viaggio", unita_misura: "viaggio", prezzo_unitario: 60, valido_dal: null, valido_al: null, attivo: true, maggiorazione_straordinario_pct: null, maggiorazione_festivo_pct: null}],
      isLoading: false,
    };
    if (k === "appalto-rapportini-da-rendicontare") return {data: m.daFare, isLoading: false};
    if (k === "appalto-eccezioni") return {data: [{id: "o1", tariffa_id: "t1", prezzo_unitario: 80, nota: "qui 80"}], isLoading: false};
    return {data: [] as unknown[], isLoading: false};
  },
}));

const riga = (o: Record<string, unknown> = {}) => ({
  id: "r1", data: "2026-10-20", tariffa_id: "t1", descrizione: "Viaggio", unita_misura: "viaggio",
  prezzo_unitario: 80, quantita: 4, maggiorazione_pct: 0, importo: 320,
  costo_interno: null as number | null, margine: null as number | null,
  employee_id: null as string | null, fase_id: null as string | null,
  origine: "manuale", extra_contratto: false, stato: "confermata", note: null as string | null, ...o,
});

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as {ResizeObserver: unknown}).ResizeObserver = class {
      observe() {} unobserve() {} disconnect() {}
    };
  }
});
beforeEach(() => {m.righe = [riga()]; m.daFare = []; m.costi = true; m.margini = true;});
afterEach(cleanup);

const draw = (p: Partial<Parameters<typeof RendicontoAppalto>[0]> = {}) => render(
  <RendicontoAppalto orderId="o" contrattoId="c" valorizzazione="a_misura"
    tettoImporto={null} importoCommessa={1400} puoModificare vedeImporti {...p} />
);

it("senza il permesso sugli importi non mostra niente del rendiconto", () => {
  draw({vedeImporti: false});
  expect(screen.getByText(/Importi delle commesse/)).toBeVisible();
  expect(screen.queryByText("€ 320,00")).not.toBeInTheDocument();
});

it("mostra il confermato e tiene il margine vuoto quando il costo non si sa", () => {
  draw();
  // Il riquadro «Confermato», non una delle altre comparse dello stesso numero.
  expect(screen.getByText("Confermato").parentElement).toHaveTextContent("€ 320,00");
  // «Margine» c'è come etichetta, ma col trattino: nessun numero inventato.
  expect(screen.getByText("Margine", {selector: "p"}).parentElement).toHaveTextContent("—");
  expect(screen.getByText("nessun costo noto")).toBeVisible();
});

it("il margine compare solo sulle righe che hanno un costo, e dice quante restano fuori", () => {
  m.righe = [riga({costo_interno: 200, margine: 120}), riga({id: "r2", importo: 100, descrizione: "Posa"})];
  draw();
  expect(screen.getByText(/1 riga confermata non lo ha/)).toBeVisible();
});

it("avvisa quando il rendicontato supera il tetto concordato", () => {
  m.righe = [riga({importo: 1800})];
  draw({tettoImporto: 1500});
  expect(screen.getByText(/su un tetto concordato di/)).toBeVisible();
});

it("non avvisa se il rendicontato sta dentro il tetto", () => {
  m.righe = [riga({importo: 900})];
  draw({tettoImporto: 1500});
  expect(screen.queryByText(/su un tetto concordato di/)).not.toBeInTheDocument();
});

it("le righe fuori contratto si vedono come tali", () => {
  m.righe = [riga({extra_contratto: true, importo: 150, descrizione: "Smaltimento"})];
  draw();
  expect(screen.getByText("fuori contratto")).toBeVisible();
  expect(screen.getByText(/si discutono a fine lavori/)).toBeVisible();
});

it("una commessa senza contratto lo dice, invece di mostrare un listino vuoto", () => {
  m.righe = [];
  draw({contrattoId: null});
  expect(screen.getByText(/non ha un contratto agganciato/)).toBeVisible();
});

it("chi non può modificare non vede i pulsanti di scrittura", () => {
  draw({puoModificare: false});
  expect(screen.queryByRole("button", {name: "Riga"})).not.toBeInTheDocument();
  expect(screen.queryByRole("button", {name: "Elimina la riga"})).not.toBeInTheDocument();
});

it("un rapportino approvato che non è diventato una riga si vede, col motivo", () => {
  m.daFare = [{rapportino_id: "p1", data_lavoro: "2026-10-22", ore_lavorate: 8, motivo: "Nessuna tariffa di manodopera per Operaio specializzato in vigore il 22/10/2026"}];
  draw();
  expect(screen.getByText("Giornate di campo non rendicontate")).toBeVisible();
  expect(screen.getByText(/22\/10\/26 · 8 ore/)).toBeVisible();
  expect(screen.getByText(/Nessuna tariffa di manodopera/)).toBeVisible();
});

it("senza rapportini rimasti fuori la sezione non c'è: niente riquadri vuoti", () => {
  draw();
  expect(screen.queryByText("Giornate di campo non rendicontate")).not.toBeInTheDocument();
});

it("le righe nate da un rapportino si distinguono da quelle scritte a mano", () => {
  m.righe = [riga({origine: "rapportino"})];
  draw();
  expect(screen.getByText(/rapportino/)).toBeVisible();
});

it("costi e margini hanno due permessi loro: senza «Margini» il margine è riservato", () => {
  m.righe = [riga({costo_interno: 200, margine: 120})];
  m.margini = false;
  draw();
  expect(screen.getByText("Margine", {selector: "p"}).parentElement).toHaveTextContent("riservato");
  expect(screen.getByText(/serve il permesso «Margini»/)).toBeVisible();
  // Il costo invece si vede: il permesso sui costi c'è.
  expect(screen.getByText("Costo", {selector: "p"}).parentElement).toHaveTextContent("€ 200,00");
});

it("senza «Costi» il costo è riservato", () => {
  m.righe = [riga({costo_interno: 200, margine: 120})];
  m.costi = false;
  draw();
  expect(screen.getByText("Costo", {selector: "p"}).parentElement).toHaveTextContent("riservato");
});
