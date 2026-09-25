import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { NewQuoteDialog } from "@/components/marketing/preventivi/moduli/NewQuoteDialog";
import { MODULI_VENDITA, deriveModuloStato } from "@/lib/moduli-vendita/config";
import type { ModuloVenditaView } from "@/lib/moduli-vendita/useModuliVendita";
import Preventivi from "@/pages/azienda/marketing/Preventivi";

const state = vi.hoisted(() => ({ views: [] as ModuloVenditaView[], hidden: new Set<string>(), loading: false, error: false, visibleLoading: false,
  support: { supported: true, isLoading: false, isError: false }, permissions: { canEditPreventivi: true, canEditMarketingOpportunities: true } }));
vi.mock("@/lib/moduli-vendita", () => ({ useModuliVendita: () => ({ moduli: state.views, isLoading: state.loading, isError: state.error }), useModuliVisibilita: () => ({ isModuloVisibile: (slug: string) => !state.hidden.has(slug), isLoading: state.visibleLoading }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.permissions }));
vi.mock("@/hooks/useSerramentiModelSupport", () => ({ useSerramentiModelSupport: () => state.support }));
vi.mock("@/hooks/useTettiModelSupport", () => ({ useTettiModelSupport: () => state.support }));
vi.mock("@/hooks/useSupportoModelliPreventivo", () => ({ useSupportoModelliPreventivo: () => ({ supportato: () => state.support.supported, isLoading: state.support.isLoading, isError: state.support.isError }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "A" } }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: 0 }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/marketing/preventivi/UnifiedPreventiviList", () => ({ UnifiedPreventiviList: () => <p data-testid="unified-list">Offerte di tutti i moduli</p> }));
vi.mock("@/components/computo/ComputoUploadModal", () => ({ ComputoUploadModal: () : null => null }));
vi.mock("@/components/quotes/QuoteFromCaptureDialog", () => ({ QuoteFromCaptureDialog: () : null => null }));
vi.mock("@/components/documenti/SmartDocumentInboxDialog", () => ({ SmartDocumentInboxDialog: () : null => null }));
vi.mock("@/components/documenti/SmartDocumentImportModal", () => ({ SmartDocumentImportModal: () : null => null }));
vi.mock("@/pages/azienda/marketing/AnalisiPreventivi", () => ({ default: () : null => null }));
vi.mock("@/pages/azienda/marketing/QuoteApprovals", () => ({ default: () : null => null }));

function Harness({ initial = "" }: { initial?: string }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  return <><p>Lista Preventivi</p><NewQuoteDialog open={open} onOpenChange={setOpen} params={new URLSearchParams(initial)} trigger={<button>Nuovo preventivo</button>} /><output data-testid="route">{location.pathname}{location.search}</output></>;
}
const mount = (initial = "") => { render(<MemoryRouter initialEntries={["/azienda/marketing/preventivi"]}><Harness initial={initial} /></MemoryRouter>); fireEvent.click(screen.getByRole("button", { name: "Nuovo preventivo" })); };
beforeEach(() => {
  state.views = MODULI_VENDITA.map(modulo => ({ modulo, stato: deriveModuloStato(modulo, true), isEnabled: true, isLoading: false, isError: false, errorMessage: null as null, source: "plan" }));
  state.hidden.clear(); state.loading = false; state.visibleLoading = false; state.error = false;
  state.permissions = { canEditPreventivi: true, canEditMarketingOpportunities: true };
  state.support = { supported: true, isLoading: false, isError: false };
});
afterEach(cleanup);

describe("popup unico di creazione preventivi", () => {
  it("l'hub conserva la lista e rimuove la scheda parallela di creazione", () => {
    render(<MemoryRouter><Preventivi /></MemoryRouter>);
    expect(screen.queryByRole("tab", { name: "Nuovo preventivo" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nuovo preventivo" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("unified-list")).toBeInTheDocument();
  });
  it("i vecchi link all'area aprono il popup e chiudendolo ritornano alla lista", () => {
    render(<MemoryRouter initialEntries={["/azienda/marketing/preventivi?tab=moduli&area=tetti"]}><Preventivi /></MemoryRouter>);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Preventivo Tetti");
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("unified-list")).toBeVisible();
  });
  it("apre sopra la lista, senza cambiare URL né mostrare le impostazioni", () => {
    mount();
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Che preventivo vuoi creare?");
    expect(screen.getByTestId("route")).toHaveTextContent("/azienda/marketing/preventivi");
    expect(screen.getAllByRole("button", { name: /^Scegli area/ })).toHaveLength(10);
    expect(screen.getByRole("link", { name: /^Preventivo classico/ })).toHaveAttribute("href", "/azienda/marketing/preventivi/nuovo");
    expect(screen.queryByRole("link", { name: /PDF|Impostazioni/ })).not.toBeInTheDocument();
  });
  it("mostra soltanto aree abilitate, visibili e consentite dal ruolo", () => {
    state.hidden.add("tetti");
    state.views.find(view => view.modulo.slug === "bagni")!.stato = "bloccato";
    state.views.find(view => view.modulo.slug === "serramenti")!.isError = true;
    mount();
    for (const title of ["Tetti", "Bagni", "Serramenti", "Facciate e isolamento"]) expect(screen.queryByRole("button", { name: `Scegli area ${title}` })).not.toBeInTheDocument();
  });
  it("non espone moduli marketing a chi può creare soltanto classico e fotovoltaico", () => {
    state.permissions.canEditMarketingOpportunities = false;
    mount();
    expect(screen.getAllByRole("button", { name: /^Scegli area/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Scegli area Fotovoltaico" })).toBeInTheDocument();
  });
  it("non mostra il classico senza il suo permesso", () => {
    state.permissions.canEditPreventivi = false; mount();
    expect(screen.queryByRole("link", { name: /^Preventivo classico/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scegli area Fotovoltaico" })).not.toBeInTheDocument();
  });
  it("porta Ripasso al suo wizard e conserva soltanto il contesto CRM", () => {
    mount("contact_id=c1&opportunity_id=o1&section=page_cover&modello=sbagliato");
    fireEvent.click(screen.getByRole("button", { name: "Scegli area Tetti" }));
    expect(screen.getAllByRole("link", { name: /^Apri preventivatore/ })).toHaveLength(6);
    fireEvent.click(screen.getByRole("link", { name: "Apri preventivatore Ripasso del tetto" }));
    expect(screen.getByTestId("route")).toHaveTextContent("/azienda/tetti/nuovo?modello=ripasso&contact_id=c1&opportunity_id=o1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("cerca direttamente un intervento senza passare dall'area", () => {
    mount(); fireEvent.change(screen.getByRole("searchbox"), { target: { value: "PERSIÀNE" } });
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Apri preventivatore Persiane e scuri" })).toHaveAttribute("href", "/azienda/serramenti/nuovo?modello=persiane");
  });
  it("non sostituisce un modello non collegato con il generale", () => {
    // Serramenti: finestre, persiane e combinato sono collegati, gli altri quattro no.
    mount("area=serramenti");
    expect(screen.getAllByRole("link", { name: /^Apri preventivatore/ })).toHaveLength(3);
    expect(screen.getAllByLabelText(/^Intervento non disponibile/)).toHaveLength(4);
    expect(screen.getByRole("link", { name: /^Preventivo Serramenti generale/ })).toHaveAttribute("href", "/azienda/serramenti/nuovo");
  });
  it("porta ogni intervento Bagni al suo preventivatore col modello scelto", () => {
    mount("area=bagni&contact_id=c1");
    expect(screen.getAllByRole("link", { name: /^Apri preventivatore/ })).toHaveLength(6);
    expect(screen.queryByLabelText(/^Intervento non disponibile/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Apri preventivatore Da vasca a doccia" }));
    expect(screen.getByTestId("route")).toHaveTextContent("/azienda/bagni/nuovo?modello=vasca-doccia&contact_id=c1");
  });
  it.each([["termoidraulica", 8], ["elettrico", 7], ["ristrutturazioni", 5], ["fotovoltaico", 5]] as const)("apre i preventivatori %s coi loro %i interventi", (area, quanti) => {
    mount(`area=${area}`);
    expect(screen.getAllByRole("link", { name: /^Apri preventivatore/ })).toHaveLength(quanti);
  });
  it("distingue accesso all'area da disponibilità del salvataggio", () => {
    state.support.supported = false; mount("area=tetti");
    expect(screen.getAllByText("Salvataggio da attivare")).toHaveLength(6);
    expect(screen.queryByText("Apri preventivatore", { exact: true })).not.toBeInTheDocument();
  });
  it.each(["loading", "visibleLoading", "error"] as const)("non presenta accessi confermati durante %s", key => {
    state[key] = true; mount();
    expect(screen.queryByRole("button", { name: /^Scegli area/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Apri preventivatore/ })).not.toBeInTheDocument();
  });
  it("chiude e riapre azzerando la ricerca e la selezione", () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: "Scegli area Tetti" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Chiudi" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nuovo preventivo" }));
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Che preventivo vuoi creare?");
  });
  it("prevede scorrimento interno e miniature lazy senza immagini remote", () => {
    mount("area=tetti");
    expect(screen.getByTestId("quote-chooser-scroll")).toHaveClass("overflow-y-auto");
    for (const img of screen.getByRole("dialog").querySelectorAll("img")) {
      expect(img).toHaveAttribute("loading", "lazy");
      expect(img.getAttribute("src")).toMatch(/^\/quote-picker\/tetti-/);
    }
  });
});
