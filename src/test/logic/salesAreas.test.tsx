import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { SALES_AREAS, findSalesArea, matchesSalesArea, salesAreaHref } from "@/lib/moduli-vendita/areas";
import { MODULI_VENDITA, deriveModuloStato } from "@/lib/moduli-vendita/config";
import type { ModuloVenditaView } from "@/lib/moduli-vendita/useModuliVendita";
import { SalesAreasTab } from "@/components/marketing/preventivi/moduli/SalesAreasTab";
import { ModuliVendutaTab } from "@/components/marketing/preventivi/moduli/ModuliVendutaTab";

const mocks = vi.hoisted(() => ({ moduli: [] as ModuloVenditaView[], hidden: new Set<string>(), save: vi.fn(), loading: false, loadingVisibility: false, error: false, saving: false, support: { supported: false, isLoading: false, isError: false }, permissions: { canViewSettingsPricing: true, canEditSettingsPricing: true, canEditPreventivi: true, canEditMarketingOpportunities: true, canViewMarketingOpportunities: true } }));
vi.mock("@/lib/moduli-vendita", () => ({ useModuliVendita: () => ({ moduli: mocks.moduli, isLoading: mocks.loading, isError: mocks.error }), useModuliVisibilita: () => ({ isModuloVisibile: (id: string) => !mocks.hidden.has(id), setModuloVisibile: mocks.save, isSaving: mocks.saving, isLoading: mocks.loadingVisibility }) }));
vi.mock("@/hooks/useSerramentiModelSupport", () => ({ useSerramentiModelSupport: () => mocks.support }));
vi.mock("@/hooks/useTettiModelSupport", () => ({ useTettiModelSupport: () => mocks.support }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => mocks.permissions }));
vi.mock("@/components/marketing/preventivi/moduli/ModuloLockedDialog", () => ({ ModuloLockedDialog: () : null => null }));
beforeEach(() => {
  mocks.moduli = MODULI_VENDITA.map(modulo => ({ modulo, stato: deriveModuloStato(modulo, true), isEnabled: true, isLoading: false, isError: false, errorMessage: null as null, source: "plan" }));
  mocks.hidden.clear(); mocks.save.mockReset(); mocks.loading = false; mocks.error = false; mocks.saving = false; mocks.loadingVisibility = false;
  mocks.support = { supported: false, isLoading: false, isError: false };
  mocks.permissions = { canViewSettingsPricing: true, canEditSettingsPricing: true, canEditPreventivi: true, canEditMarketingOpportunities: true, canViewMarketingOpportunities: true };
});
afterEach(cleanup);
function Location() { return <span data-testid="location">{useLocation().search}</span>; }
function mount(url = "/?tab=moduli&keep=yes") { return render(<MemoryRouter initialEntries={[url]}><ModuliVendutaTab /><Location /></MemoryRouter>); }

describe("tassonomia area → intervento", () => {
  it("mantiene un unico selettore anche per i chiamanti del vecchio catalogo", () => {
    expect(ModuliVendutaTab).toBe(SalesAreasTab);
  });
  it("definisce 11 aree e 68 interventi senza identificatori duplicati", () => {
    expect(SALES_AREAS).toHaveLength(11);
    expect(new Set(SALES_AREAS.map(area => area.id)).size).toBe(11);
    expect(SALES_AREAS.flatMap(area => area.interventions)).toHaveLength(68);
    for (const area of SALES_AREAS) {
      expect(MODULI_VENDITA.some(module => module.slug === area.sourceModule)).toBe(true);
      expect(new Set(area.interventions.map(item => item.id)).size).toBe(area.interventions.length);
      for (const item of area.interventions) { expect(item.fields).toHaveLength(4); expect(item.status).toBe("planned"); }
    }
  });
  it("raggruppa cappotto e pompe di calore senza cambiare gli entitlement", () => {
    expect(findSalesArea("cappotto")?.id).toBe("facciate");
    expect(findSalesArea("pompe_calore")?.id).toBe("termoidraulica");
    expect(findSalesArea("pompe_calore")?.sourceModule).toBe("termoidraulico");
    expect(findSalesArea("termoidraulica")?.interventions.some(item => item.id === "pompa-calore")).toBe(true);
    expect(findSalesArea("inventato")).toBeUndefined();
  });
  it("cerca nei moduli, non soltanto nel titolo dell'area", () => {
    expect(SALES_AREAS.filter(area => matchesSalesArea(area, "PERSIÀNE" )).map(area => area.id)).toEqual(["serramenti"]);
    expect(SALES_AREAS.filter(area => matchesSalesArea(area, "ripasso tetto")).map(area => area.id)).toEqual(["tetti"]);
  });
  it("preserva ricerca e parametri e rimuove interventi non appartenenti all'area", () => {
    const params = new URLSearchParams("tab=moduli&keep=yes&q_moduli=persiane&vista_moduli=preventivatori&intervento=errato");
    const area = SALES_AREAS[0];
    expect(salesAreaHref(params, area, area.interventions[1])).toBe("?tab=moduli&keep=yes&q_moduli=persiane&intervento=persiane&area=serramenti");
    expect(salesAreaHref(params, area, SALES_AREAS[1].interventions[0])).not.toContain("intervento=");
    expect(salesAreaHref(params)).not.toMatch(/area=|intervento=|vista_moduli=/);
  });
});

describe("selettore diretto dei modelli", () => {
  const search = (value: string) => fireEvent.change(screen.getByRole("textbox", { name: "Cerca intervento" }), { target: { value } });
  const manage = () => fireEvent.click(screen.getByText(/Gestisci visibilità aree/, { selector: "summary" }));
  const view = (slug: string) => mocks.moduli.find(item => item.modulo.slug === slug)!;

  it("mostra solo 11 aree compatte nella home e include le azioni generali una volta per area", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Cosa devi preventivare?" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(11);
    expect(screen.queryByRole("article", { name: /^Intervento / })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("11 aree trovate");
    expect(screen.queryByRole("region", { name: "Preventivatori generali" })).not.toBeInTheDocument();
    for (const area of SALES_AREAS) {
      const card = within(screen.getByRole("article", { name: `Area ${area.title}` }));
      expect(card.getByText(`${area.interventions.length} interventi`)).toBeInTheDocument();
      expect(card.getByRole("link", { name: `Scegli intervento ${area.title}` })).toBeInTheDocument();
      expect(card.queryByRole("link", { name: `Crea preventivo generale ${area.title}` })).not.toBeInTheDocument();
    }
    expect(screen.getByText(/Gestisci visibilità aree/).closest("details")).not.toHaveAttribute("open");
    manage();
    expect(screen.getAllByRole("switch")).toHaveLength(10);
    expect(screen.getByRole("combobox", { name: "Area" }).querySelectorAll("option")).toHaveLength(12);
  });

  it.each(SALES_AREAS)("Scegli intervento apre soltanto gli interventi di $title e conserva il contesto", area => {
    mount("/?tab=moduli&keep=yes&contact_id=c1&opportunity_id=o1");
    fireEvent.click(screen.getByRole("link", { name: `Scegli intervento ${area.title}` }));
    expect(screen.getByTestId("location")).toHaveTextContent(`keep=yes&contact_id=c1&opportunity_id=o1&area=${area.id}`);
    expect(screen.getAllByRole("article")).toHaveLength(area.interventions.length);
    expect(screen.queryByRole("article", { name: /^Area / })).not.toBeInTheDocument();
    for (const item of area.interventions) expect(screen.getByRole("article", { name: `Intervento ${item.title}` })).toBeInTheDocument();
    const general = screen.queryByRole("link", { name: `Crea preventivo generale ${area.title}` });
    if (view(area.sourceModule).stato === "attivo") {
      expect(general).toBeInTheDocument();
      expect(general).toHaveAttribute("href", `${view(area.sourceModule).modulo.href}/nuovo?contact_id=c1&opportunity_id=o1`);
      expect(general!.closest("details")).not.toHaveAttribute("open");
    }
  });

  it("torna alle aree quando la ricerca viene cancellata o contiene solo spazi", () => {
    mount();
    search("persiane");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.queryByRole("article", { name: /^Area / })).not.toBeInTheDocument();
    search("");
    expect(screen.getAllByRole("article", { name: /^Area / })).toHaveLength(11);
    search("   ");
    expect(screen.getAllByRole("article", { name: /^Area / })).toHaveLength(11);
  });

  it.each([
    ["contact_id=c%2B1&opportunity_id=o%26two", "?contact_id=c%2B1&opportunity_id=o%26two"],
    ["contact_id=c1", "?contact_id=c1"],
    ["opportunity_id=o1", "?opportunity_id=o1"],
    ["contact_id=&opportunity_id=", ""],
    ["", ""],
  ])("conserva solo il contesto CRM nelle azioni generali e classiche: %s", (context, suffix) => {
    mount(`/?tab=moduli&keep=no&modello=persiane&section=bad&${context}`);
    expect(screen.getByRole("link", { name: "Preventivo libero" })).toHaveAttribute("href", `/azienda/marketing/preventivi/nuovo${suffix}`);
    for (const area of SALES_AREAS.filter(item => view(item.sourceModule).stato === "attivo")) {
      const card = within(screen.getByRole("article", { name: `Area ${area.title}` }));
      expect(card.queryByRole("link", { name: `Crea preventivo generale ${area.title}` })).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("link", { name: "Scegli intervento Serramenti" }));
    search("persiane");
    expect(screen.getByRole("link", { name: "Crea preventivo generale Serramenti" })).toHaveAttribute("href", `/azienda/serramenti/nuovo${suffix}`);
    expect(screen.getByRole("link", { name: "Preventivo libero" })).toHaveAttribute("href", `/azienda/marketing/preventivi/nuovo${suffix}`);
  });

  it("la ricerca globale attraversa più aree senza aggiungere un secondo elenco di preventivatori", () => {
    mount();
    search("manutenzione");
    expect(screen.getAllByRole("article").length).toBeGreaterThan(1);
    expect(screen.queryByRole("article", { name: /^Area / })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Crea preventivo generale/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Elenco preventivatori esistenti" })).not.toBeInTheDocument();
  });

  it.each([["PERSIÀNE", "Persiane e scuri"], ["ripasso tetto", "Ripasso del tetto"]])("ricerca %s e restituisce soltanto il modello pertinente", (query, title) => {
    mount();
    search(query);
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("article", { name: `Intervento ${title}` })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 intervento trovato");
  });

  it("mantiene ricerca e contesto cambiando area, poi azzera solo i filtri", () => {
    mount("/?tab=moduli&keep=yes&contact_id=c1&opportunity_id=o1&q_moduli=persiane&intervento=finestre");
    fireEvent.change(screen.getByRole("combobox", { name: "Area" }), { target: { value: "tetti" } });
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("keep=yes&contact_id=c1&opportunity_id=o1&q_moduli=persiane&area=tetti");
    fireEvent.click(screen.getByRole("button", { name: "Azzera filtri" }));
    expect(screen.getAllByRole("article")).toHaveLength(11);
    expect(screen.getByTestId("location")).toHaveTextContent("?tab=moduli&keep=yes&contact_id=c1&opportunity_id=o1");
  });

  it("mantiene i deeplink intervento e gli alias area", () => {
    const first = mount("/?tab=moduli&area=serramenti&intervento=persiane");
    expect(screen.getByRole("article", { name: "Intervento Persiane e scuri" })).toHaveClass("ring-1");
    expect(screen.getByRole("link", { name: "Apri preventivatore Persiane e scuri" })).toHaveAttribute("href", "/azienda/serramenti/nuovo?modello=persiane");
    first.unmount();
    mount("/?tab=moduli&area=pompe_calore");
    expect(screen.getByRole("combobox", { name: "Area" })).toHaveValue("termoidraulica");
    expect(screen.getByRole("link", { name: "Crea preventivo generale Termoidraulica e riscaldamento" })).toHaveAttribute("href", "/azienda/termoidraulico/nuovo");
  });

  it("mostra i soli tre ingressi pilota con capability confermata e propaga solo il contesto CRM", () => {
    mocks.support.supported = true;
    mount("/?tab=moduli&area=serramenti&intervento=persiane&keep=no&modello=wrong&section=bad&contact_id=c%2B1&opportunity_id=o%26two");
    const links = screen.getAllByRole("link", { name: /^Apri preventivatore/ });
    expect(links).toHaveLength(3);
    for (const [title, id] of [["Finestre e portefinestre", "finestre"], ["Persiane e scuri", "persiane"], ["Intervento combinato", "combinato"]]) {
      expect(screen.getByRole("link", { name: `Apri preventivatore ${title}` })).toHaveAttribute("href", `/azienda/serramenti/nuovo?modello=${id}&contact_id=c%2B1&opportunity_id=o%26two`);
    }
    expect(screen.getByRole("link", { name: "Crea preventivo generale Serramenti" })).toHaveAttribute("href", "/azienda/serramenti/nuovo?contact_id=c%2B1&opportunity_id=o%26two");
  });

  it.each([
    { supported: false, isLoading: false, isError: false },
    { supported: true, isLoading: true, isError: false },
    { supported: true, isLoading: false, isError: true },
  ])("nega Apri preventivatore senza capability affidabile: %j", support => {
    mocks.support = support;
    mount("/?tab=moduli&area=serramenti");
    expect(screen.getAllByRole("link", { name: /^Apri preventivatore/ })).toHaveLength(3);
    expect(screen.getAllByText("Salvataggio da attivare")).toHaveLength(3);
    expect(screen.queryByRole("link", { name: "Personalizza PDF Persiane e scuri" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crea preventivo generale Serramenti" })).toBeInTheDocument();
  });

  it("non presenta altri modelli come operativi e separa il preventivatore generale", () => {
    mocks.support.supported = true;
    mount("/?tab=moduli&area=tetti&q_moduli=ripasso");
    const card = within(screen.getByRole("article", { name: "Intervento Ripasso del tetto" }));
    expect(card.queryByRole("link", { name: /Personalizza PDF|Crea preventivo generale/ })).not.toBeInTheDocument();
    expect(card.getByRole("link", { name: "Apri preventivatore Ripasso del tetto" })).toHaveAttribute("href", "/azienda/tetti/nuovo?modello=ripasso");
    expect(screen.getByRole("link", { name: "Crea preventivo generale Tetti" })).toHaveAttribute("href", "/azienda/tetti/nuovo");
  });

  it("nasconde le aree disattivate e permette al manager di recuperarle senza cambiare filtri", () => {
    mocks.hidden.add("tetti");
    mount();
    expect(screen.queryByRole("article", { name: "Area Tetti" })).not.toBeInTheDocument();
    manage();
    fireEvent.click(screen.getByRole("switch", { name: "Attiva o disattiva area Serramenti" }));
    expect(mocks.save).toHaveBeenCalledWith("serramenti", false);
    const toggle = screen.getByRole("switch", { name: "Attiva o disattiva area Tetti" });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(mocks.save).toHaveBeenCalledWith("tetti", true);
    fireEvent.change(screen.getByRole("combobox", { name: "Stato area" }), { target: { value: "disattivato" } });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("article", { name: "Area Tetti" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Crea preventivo generale/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Personalizza PDF/ })).not.toBeInTheDocument();
  });

  it.each([true, false])("non offre azioni nel deeplink nascosto, manager=%s", manager => {
    mocks.hidden.add("serramenti"); mocks.support.supported = true;
    mocks.permissions.canEditSettingsPricing = manager;
    mount("/?tab=moduli&area=serramenti&intervento=persiane");
    expect(screen.queryByRole("link", { name: /^(Apri preventivatore|Personalizza PDF|Crea preventivo generale|Preventivi salvati)/ })).not.toBeInTheDocument();
    expect(!!screen.queryByRole("button", { name: "Riattiva area Serramenti" })).toBe(manager);
  });

  it("non consente il filtro nascosti a un non manager neppure da URL", () => {
    mocks.hidden.add("serramenti");
    mocks.permissions.canEditSettingsPricing = false;
    mount("/?tab=moduli&stato_moduli=disattivato");
    expect(screen.queryByRole("article", { name: "Area Serramenti" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Disattivate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it.each(["canViewSettingsPricing", "canEditSettingsPricing"] as const)("richiede entrambi i permessi impostazioni: %s", permission => {
    mocks.permissions[permission] = false;
    mount("/?tab=moduli&area=serramenti");
    expect(screen.queryByRole("link", { name: /^Personalizza PDF/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Gestisci visibilità aree/)).not.toBeInTheDocument();
  });

  it("preserva sola lettura, creazione marketing e permesso distinto fotovoltaico", () => {
    mocks.support.supported = true;
    mocks.permissions.canEditSettingsPricing = false;
    mocks.permissions.canEditMarketingOpportunities = false;
    const first = mount("/?tab=moduli&area=serramenti");
    expect(screen.queryByRole("link", { name: /^(Apri preventivatore|Crea preventivo generale)/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Preventivi salvati Serramenti" })).toBeInTheDocument();
    first.unmount();
    mocks.permissions.canViewMarketingOpportunities = false;
    const second = mount("/?tab=moduli&area=serramenti");
    expect(screen.queryByRole("link", { name: /^Preventivi salvati/ })).not.toBeInTheDocument();
    second.unmount();
    const third = mount("/?tab=moduli&area=fotovoltaico");
    expect(screen.getByRole("link", { name: "Crea preventivo generale Fotovoltaico" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Preventivi salvati Fotovoltaico" })).toBeInTheDocument();
    third.unmount();
    mocks.permissions.canEditPreventivi = false;
    mount("/?tab=moduli&area=fotovoltaico");
    expect(screen.queryByRole("link", { name: /^(Crea preventivo generale|Preventivo libero)/ })).not.toBeInTheDocument();
  });

  it.each(["isError", "isLoading", "missing"] as const)("fail closed sul singolo modulo: %s", state => {
    mocks.support.supported = true;
    if (state === "missing") mocks.moduli = mocks.moduli.filter(item => item.modulo.slug !== "serramenti");
    else view("serramenti")[state] = true;
    mount("/?tab=moduli&q_moduli=persiane");
    expect(screen.getByText("Accesso da verificare")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^(Apri preventivatore|Personalizza PDF).*Persiane/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^(Crea preventivo generale|Preventivi salvati) Serramenti/ })).not.toBeInTheDocument();
    manage();
    expect(screen.queryByRole("switch", { name: "Attiva o disattiva area Serramenti" })).not.toBeInTheDocument();
  });

  it("distingue moduli bloccati e aree in sviluppo senza azioni operative", () => {
    view("serramenti").stato = "bloccato"; mocks.support.supported = true;
    const first = mount("/?tab=moduli&area=serramenti");
    expect(screen.queryByRole("link", { name: /^(Apri preventivatore|Personalizza PDF|Crea preventivo generale)/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Scopri il modulo" })).toHaveLength(7);
    first.unmount();
    mount("/?tab=moduli&area=facciate");
    expect(screen.getAllByText("In sviluppo", { selector: "div" })).toHaveLength(6);
    expect(screen.queryByRole("link", { name: /^(Apri preventivatore|Personalizza PDF|Crea preventivo generale)/ })).not.toBeInTheDocument();
  });

  it("gestisce area e intervento sconosciuti", () => {
    const result = mount("/?tab=moduli&area=inesistente");
    expect(screen.getByRole("alert")).toHaveTextContent("Area non riconosciuta"); result.unmount();
    mount("/?tab=moduli&area=tetti&intervento=persiane");
    expect(screen.getByRole("alert")).toHaveTextContent("Intervento non riconosciuto");
  });

  it("mantiene catalogo precedente e parametri legacy", () => {
    mount("/?tab=moduli&keep=yes&contact_id=c1&opportunity_id=o1&vista_moduli=preventivatori");
    expect(screen.queryByRole("link", { name: "Elenco preventivatori esistenti" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(11);
  });

  it.each(["loading", "loadingVisibility", "error"] as const)("blocca anche il catalogo legacy durante %s", state => {
    mocks[state] = true;
    mount("/?tab=moduli&vista_moduli=preventivatori");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    if (state === "error") expect(screen.getByRole("alert")).toHaveTextContent("Impossibile verificare");
    else expect(screen.getByRole("status")).toHaveTextContent("Caricamento");
  });

  it("disabilita i toggle e il recupero durante il salvataggio", () => {
    mocks.saving = true; mocks.hidden.add("serramenti");
    mount("/?tab=moduli&area=serramenti");
    manage();
    for (const toggle of screen.getAllByRole("switch")) expect(toggle).toBeDisabled();
    expect(screen.getByRole("button", { name: "Riattiva area Serramenti" })).toBeDisabled();
  });
});
