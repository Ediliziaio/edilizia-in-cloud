import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import SubappaltatoriPage from "@/pages/azienda/SubappaltatoriPage";
import type { SubappaltatoreConDashboard } from "@/types/subappaltatori";
import type { ContrattoDitta } from "@/hooks/useContrattiDitte";

/**
 * La pagina Subappaltatori divisa in gruppi (06/10/2026): per lavoro, per
 * zona, per cantiere; i riquadri fanno da filtro; da telefono due viste.
 */

const stato = vi.hoisted(() => ({
  mobile: false,
  costi: true,
  ditte: [] as unknown[],
  contratti: [] as unknown[],
  documenti: {} as Record<string, { n: number; tipi: string[] }>,
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => stato.mobile }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewCosts: stato.costi }) }));
vi.mock("@/hooks/useSubscriptionLimits", () => ({ useSubscriptionLimits: () => ({ isScopriPlan: false }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    const k = String(queryKey[0]);
    if (k === "subappaltatori-page") return { data: stato.ditte, isLoading: false };
    if (k === "sub-fascicoli") return { data: stato.documenti, isLoading: false };
    if (k === "contratti-ditte") return { data: stato.contratti, isLoading: false };
    return { data: [] as unknown[], isLoading: false };
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

const ditta = (extra: Partial<SubappaltatoreConDashboard>): SubappaltatoreConDashboard => ({
  id: "d", company_id: "c1", order_id: null, ragione_sociale: "Ditta", tipo_lavori: null, responsabile: null, telefono: null,
  piva: null, email: null, pec: null, codice_fiscale: null, indirizzo: null, note: null, campo_subappaltatore_id: null,
  campo_user_id: null, campo_user_email: null, campo_is_active: false, durc_scadenza: "2099-01-01",
  contratto_id: null, importo_contrattuale: 0, ritenuta_garanzia_pct: null, stato_contratto: null, totale_sal_lordo: 0,
  totale_sal_netto: 0, ritenute_in_corso: 0, ritenute_svincolate: 0, residuo_contrattuale: 0,
  ...extra,
});
const contratto = (extra: Partial<ContrattoDitta>): ContrattoDitta => ({
  id: "k", schedaId: "d", orderId: "o1", codiceCommessa: "ORD-1", commessa: "Bagno via Roma", cliente: "Mario Rossi",
  importo: 10000, stato: "attivo", dataInizio: "2026-09-01", dataFinePrevista: "2026-11-30", salLordo: 2500, ...extra,
});

function Indirizzo() {
  const l = useLocation();
  return <p data-testid="indirizzo">{l.search}</p>;
}
const apri = (cerca = "?tab=subappaltatori") =>
  render(
    <MemoryRouter initialEntries={[`/azienda/manodopera${cerca}`]}>
      <Routes>
        <Route path="/azienda/manodopera" element={<><SubappaltatoriPage incorporata /><Indirizzo /></>} />
      </Routes>
    </MemoryRouter>,
  );
const sezione = (titolo: RegExp) => screen.getByText(titolo, { selector: "h3 span" }).closest("details")!;

beforeEach(() => {
  stato.mobile = false;
  stato.costi = true;
  stato.documenti = { a1: { n: 2, tipi: ["visura", "dvr"] } };
  stato.ditte = [
    ditta({ id: "s1", ragione_sociale: "Bianchi Impianti S.r.l.", tipo_lavori: "Impianto elettrico", campo_subappaltatore_id: "a1", indirizzo: "Via Roma 1, Padova (PD)" }),
    ditta({ id: "s2", ragione_sociale: "Elettrica Futura S.r.l.", tipo_lavori: "Impianti elettrici", durc_scadenza: "2020-01-01", indirizzo: "Via Po 2, Venezia (VE)" }),
    ditta({ id: "s3", ragione_sociale: "Rossi Idraulica S.r.l.", tipo_lavori: "Idraulica e riscaldamento", durc_scadenza: null, indirizzo: "Via Appia 3, Roma (RM)" }),
  ];
  stato.contratti = [
    contratto({ id: "k1", schedaId: "s2", orderId: "o1", codiceCommessa: "ORD-1" }),
    contratto({ id: "k2", schedaId: "s3", orderId: "o2", codiceCommessa: "ORD-2", commessa: "Tetto", stato: "bozza", importo: 5000, salLordo: 0 }),
    contratto({ id: "k3", schedaId: "s1", orderId: "o3", codiceCommessa: "ORD-3", stato: "completato" }),
  ];
});
afterEach(cleanup);

describe("Subappaltatori in gruppi", () => {
  it("si apre per lavoro: le varianti del tipo di lavoro stanno insieme, con l'avviso sui DURC", () => {
    apri();
    expect(screen.getByRole("button", { name: "Per lavoro" })).toHaveAttribute("aria-pressed", "true");
    const elettrici = sezione(/^Impianti elettrici$/);
    expect(within(elettrici).getByText("Bianchi Impianti S.r.l.")).toBeInTheDocument();
    expect(within(elettrici).getByText("Elettrica Futura S.r.l.")).toBeInTheDocument();
    expect(within(elettrici).getAllByText(/1 DURC da controllare/).length).toBeGreaterThan(0);
    // nella vista per lavoro la ditta dice dov'è, e se è su un cantiere
    expect(within(elettrici).getByText(/Padova \(PD\)/)).toBeInTheDocument();
    expect(within(elettrici).getByText("1 cantiere in corso")).toBeInTheDocument();
    // e cosa le manca per il subappalto, con chi è al lavoro nel titolo del gruppo
    expect(within(elettrici).getByText("Mancano: polizza RC, P.IVA")).toBeInTheDocument();
    expect(within(elettrici).getByText("Mancano: DURC, visura camerale, DVR, POS, polizza RC, P.IVA")).toBeInTheDocument();
    expect(within(elettrici).getByText(/1 al lavoro/)).toBeInTheDocument();
  });

  it("«Chiedi» prepara il messaggio con quello che manca: email se c'è, altrimenti WhatsApp a un cellulare", () => {
    stato.ditte = [
      ditta({ id: "s1", ragione_sociale: "Bianchi Impianti S.r.l.", tipo_lavori: "Elettrico", responsabile: "Mario Bianchi", email: "ufficio@bianchi.example", telefono: "+39 333 4455667" }),
      ditta({ id: "s2", ragione_sociale: "Futura S.r.l.", tipo_lavori: "Elettrico", telefono: "+39 347 1234567" }),
      ditta({ id: "s3", ragione_sociale: "Fissa S.r.l.", tipo_lavori: "Elettrico", telefono: "06 5551234" }),
    ];
    apri();
    const [email, whatsapp] = screen.getAllByRole("link", { name: /Chiedi/ });
    expect(email.getAttribute("href")).toMatch(/^mailto:ufficio@bianchi\.example\?subject=Documenti%20per%20il%20subappalto/);
    expect(decodeURIComponent(email.getAttribute("href")!)).toContain("Buongiorno Mario Bianchi,");
    expect(whatsapp.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/393471234567\?text=/);
    // un fisso: niente WhatsApp, e nessun «Chiedi»
    expect(screen.getAllByRole("link", { name: /Chiedi/ })).toHaveLength(2);
  });

  it("i riquadri contano e filtrano: al lavoro chi ha un contratto attivo, DURC scaduti o mancanti", () => {
    apri();
    // i riquadri sono «bottoni» (role=button), e «DURC da controllare» c'è anche nei riquadri da telefono
    const riquadro = (nome: string) => screen.getAllByText(nome).map((x) => x.closest('[role="button"]')).find(Boolean) as HTMLElement;
    expect(riquadro("Al lavoro")).toHaveTextContent("1");
    expect(riquadro("DURC da controllare")).toHaveTextContent("2");
    expect(riquadro("Fascicolo da completare")).toHaveTextContent("3");
    fireEvent.click(riquadro("Al lavoro"));
    expect(screen.getByText("Elettrica Futura S.r.l.")).toBeInTheDocument();
    expect(screen.queryByText("Bianchi Impianti S.r.l.")).not.toBeInTheDocument();
  });

  it("per zona: la regione, poi le province", () => {
    apri("?tab=subappaltatori&vista=zona");
    const veneto = sezione(/^Veneto$/);
    expect(within(veneto).getByText("Padova")).toBeInTheDocument();
    expect(within(veneto).getByText("Venezia")).toBeInTheDocument();
    expect(sezione(/^Lazio$/)).toHaveTextContent("Rossi Idraulica S.r.l.");
  });

  it("per cantiere: ogni commessa con le sue ditte; chi non è su nessun cantiere in fondo; gli importi solo col permesso", () => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Cantieri" }));
    expect(screen.getByTestId("indirizzo")).toHaveTextContent("vista=cantieri");
    const ord1 = sezione(/^ORD-1 · Bagno via Roma$/);
    expect(ord1).toHaveTextContent("Elettrica Futura S.r.l.");
    expect(ord1).toHaveTextContent("In corso");
    expect(ord1).toHaveTextContent("10.000,00 €");
    expect(sezione(/^ORD-2 · Tetto$/)).toHaveTextContent("Da firmare");
    // contratto completato: Bianchi non è su nessun cantiere
    expect(screen.getByLabelText("Ditte senza cantieri in corso")).toHaveTextContent("Bianchi Impianti S.r.l.");
    cleanup();
    stato.costi = false;
    apri("?tab=subappaltatori&vista=cantieri");
    expect(sezione(/^ORD-1 · Bagno via Roma$/)).not.toHaveTextContent("10.000,00 €");
  });

  it("dal telefono due viste sole; un indirizzo a una vista da computer apre quella di serie", () => {
    stato.mobile = true;
    apri("?tab=subappaltatori&vista=cantieri");
    const viste = within(screen.getByRole("group", { name: "Vista" })).getAllByRole("button").map((b) => b.textContent);
    expect(viste).toEqual(["Per lavoro", "Per zona"]);
    expect(screen.getByRole("button", { name: "Per lavoro" })).toHaveAttribute("aria-pressed", "true");
  });

  it("senza tipi di lavoro ma con le province, si apre per zona", () => {
    stato.ditte = (stato.ditte as SubappaltatoreConDashboard[]).map((d): SubappaltatoreConDashboard => ({ ...d, tipo_lavori: null }));
    apri();
    expect(screen.getByRole("button", { name: "Per zona" })).toHaveAttribute("aria-pressed", "true");
  });
});
