import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, beforeAll, beforeEach, expect, it, vi} from "vitest";
import {SalAppalto} from "@/components/orders/SalAppalto";

const m = vi.hoisted(() => ({
  sal: [] as unknown[], componi: vi.fn(), stato: vi.fn(),
  stampa: vi.fn(), naviga: vi.fn(), billing: true, documenti: [] as unknown[],
}));
vi.mock("@/hooks/use-toast", () => ({useToast: () => ({toast: vi.fn()})}));
vi.mock("@/integrations/supabase/client", () => ({supabase: {}}));
vi.mock("@/hooks/usePermissions", () => ({usePermissions: () => ({canViewBilling: m.billing})}));
vi.mock("@/hooks/useRendicontoAppaltoPDF", () => ({
  useRendicontoAppaltoPDF: () => ({stampa: m.stampa, isGenerating: false}),
}));
vi.mock("react-router-dom", () => ({
  useNavigate: () => m.naviga,
  Link: ({to, children}: {to: string; children: unknown}) => <a href={to}>{children as never}</a>,
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({invalidateQueries: vi.fn()}),
  useMutation: ({mutationFn}: {mutationFn: unknown}) => ({isPending: false, mutate: (v: unknown) => { void mutationFn; m.componi(v); }}),
  // Due query distinte: i rendiconti e i documenti collegabili. Un mock unico
  // faceva disegnare i rendiconti come se fossero fatture.
  useQuery: ({queryKey}: {queryKey: unknown[]}) => ({
    data: queryKey[0] === "appalto-sal" ? m.sal : m.documenti,
    isLoading: false,
  }),
}));

const doc = (o: Record<string, unknown> = {}) => ({
  id: "s1", numero: 3, stato: "bozza", periodo_dal: "2026-09-01", periodo_al: "2026-09-30",
  totale: 1000, ritenuta: 5, netto: 995, righe_contate: 7, order_id: "o", note: null as string | null,
  contratto_id: "c1", documento_fiscale_id: null as string | null,
  documenti_fiscali: null as { id: string; numero: string; stato: string } | null, ...o,
});

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as {ResizeObserver: unknown}).ResizeObserver = class {
      observe() {} unobserve() {} disconnect() {}
    };
  }
});
beforeEach(() => {
  m.sal = [doc()]; m.componi = vi.fn(); m.stampa = vi.fn(); m.naviga = vi.fn();
  m.billing = true; m.documenti = [];
});
afterEach(cleanup);

const draw = (p: Partial<Parameters<typeof SalAppalto>[0]> = {}) => render(
  <SalAppalto committenteId="k" orderId="o" modoFatturazione="per_commessa" puoModificare vedeImporti {...p} />
);

it("una bozza si può mandare e annullare; un approvato no", () => {
  draw();
  expect(screen.getByRole("button", {name: /Mandato al committente/})).toBeVisible();
  expect(screen.getByRole("button", {name: /Annulla/})).toBeVisible();

  cleanup();
  m.sal = [doc({stato: "approvato"})];
  draw();
  expect(screen.queryByRole("button", {name: /Mandato al committente/})).not.toBeInTheDocument();
  expect(screen.queryByRole("button", {name: /Annulla/})).not.toBeInTheDocument();
  expect(screen.getByRole("button", {name: /Prepara la fattura/})).toBeVisible();
});

it("un rendiconto fatturato non si fattura di nuovo, ma si stampa sempre", () => {
  m.sal = [doc({stato: "fatturato"})];
  draw();
  expect(screen.queryByRole("button", {name: /Prepara la fattura/})).not.toBeInTheDocument();
  expect(screen.queryByRole("button", {name: /L'ha fatturato lui/})).not.toBeInTheDocument();
  expect(screen.getByText("Fatturato")).toBeVisible();
  expect(screen.getByRole("button", {name: /Stampa/})).toBeVisible();
  // Il documento si può ancora agganciare: è la prova che manca, non la fattura.
  expect(screen.getByRole("button", {name: /Collega una fattura già fatta/})).toBeVisible();
});

it("mostra il netto e, se c'è, la ritenuta trattenuta", () => {
  draw();
  expect(screen.getByText("€ 995,00")).toBeVisible();
  expect(screen.getByText(/di ritenuta/)).toBeVisible();
});

it("il documento cumulativo si riconosce da quello di una commessa sola", () => {
  m.sal = [doc({order_id: null})];
  draw();
  expect(screen.getByText("tutte le commesse")).toBeVisible();
});

it("senza il permesso sugli importi il blocco non compare affatto", () => {
  const {container} = draw({vedeImporti: false});
  expect(container).toBeEmptyDOMElement();
});

it("chi non può modificare non vede né Componi né le azioni, ma stampa sì", () => {
  draw({puoModificare: false});
  expect(screen.queryByRole("button", {name: "Componi"})).not.toBeInTheDocument();
  expect(screen.queryByRole("button", {name: /Mandato al committente/})).not.toBeInTheDocument();
  expect(screen.getByRole("button", {name: /Stampa/})).toBeVisible();
});

it("componendo propone il mese appena chiuso, non quello in corso", () => {
  draw();
  fireEvent.click(screen.getByRole("button", {name: "Componi"}));
  const oggi = new Date();
  const anno = oggi.getMonth() === 0 ? oggi.getFullYear() - 1 : oggi.getFullYear();
  const mese = String(oggi.getMonth() === 0 ? 12 : oggi.getMonth()).padStart(2, "0");
  expect(screen.getByLabelText("Dal")).toHaveValue(`${anno}-${mese}-01`);
});

it("dice che entrano solo le righe confermate: le bozze restano fuori", () => {
  m.sal = [];
  draw();
  expect(screen.getByText(/le righe in bozza restano fuori/i)).toBeVisible();
});

/* ─── La stampa e la fattura (28/10/2026) ─────────────────────────────── */

it("la stampa c'è su ogni rendiconto, anche su una bozza", () => {
  draw();
  fireEvent.click(screen.getByRole("button", {name: /Stampa/}));
  expect(m.stampa).toHaveBeenCalledWith("s1");
});

it("una bozza non si fattura: le sue righe non sono ancora congelate", () => {
  draw();
  expect(screen.queryByRole("button", {name: /Prepara la fattura/})).not.toBeInTheDocument();
  expect(screen.queryByRole("button", {name: /Collega una fattura/})).not.toBeInTheDocument();
});

it("chi non ha la fatturazione può comunque collegare una fattura già fatta", () => {
  m.billing = false;
  m.sal = [doc({stato: "approvato"})];
  draw();
  expect(screen.queryByRole("button", {name: /Prepara la fattura/})).not.toBeInTheDocument();
  expect(screen.getByRole("button", {name: /Collega una fattura già fatta/})).toBeVisible();
});

it("quando una fattura è agganciata si dice QUALE, con il link", () => {
  m.sal = [doc({
    stato: "fatturato", documento_fiscale_id: "d9",
    documenti_fiscali: {id: "d9", numero: "FT/2026/41", stato: "emessa"},
  })];
  draw();
  const link = screen.getByRole("link", {name: /FT\/2026\/41/});
  expect(link).toHaveAttribute("href", "/azienda/documenti/d9");
  expect(screen.queryByRole("button", {name: /Prepara la fattura/})).not.toBeInTheDocument();
});

it("una fattura ancora in bozza lo dice: il rendiconto non è fatturato finché non la emetti", () => {
  m.sal = [doc({
    stato: "approvato", documento_fiscale_id: "d9",
    documenti_fiscali: {id: "d9", numero: "Bozza 7", stato: "bozza"},
  })];
  draw();
  expect(screen.getByText(/passa a «fatturato» quando la emetti/)).toBeVisible();
});

it("l'autofattura del committente ha la sua strada, separata dalla fattura tua", () => {
  m.sal = [doc({stato: "approvato"})];
  draw();
  expect(screen.getByRole("button", {name: /L'ha fatturato lui/})).toBeVisible();

  cleanup();
  m.sal = [doc({stato: "inviato"})];
  draw();
  // Mandato ma non ancora approvato: la fattura si può preparare, ma non si
  // dichiara fatturato un documento che il committente non ha accettato.
  expect(screen.getByRole("button", {name: /Prepara la fattura/})).toBeVisible();
  expect(screen.queryByRole("button", {name: /L'ha fatturato lui/})).not.toBeInTheDocument();
});
