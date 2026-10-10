/**
 * Impostazioni → Modelli di preventivo → scheda «Moduli» (10/10/2026).
 *
 * Sotto il titolo del layout c'erano altri due titoli di pagina (h1), la parola «template» e «verticale»,
 * «Libreria moduli» al posto del nome della scheda, e chi non può modificare vedeva «Personalizza PDF» e gli
 * interruttori spenti senza sapere perché. L'interruttore «Area nel menu Nuovo preventivo» decide quali
 * preventivi compaiono ai colleghi, ma stava in fondo a ogni scheda senza una riga che lo dicesse.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import ModuleTemplateLibrary from "@/components/preventivi/modules/ModuleTemplateLibrary";
import { ModuliVenditaPanel } from "@/pages/azienda/settings/SettingsQuoteTemplates/ModuliVenditaPanel";
import { ID_AVVISO_SOLA_LETTURA_MODULI, TESTO_SOLA_LETTURA } from "@/pages/azienda/settings/SettingsQuoteTemplates/constants";
import { SALES_AREAS } from "@/lib/moduli-vendita/areas";

const state = vi.hoisted(() => ({
  canEdit: true,
  permessiInCaricamento: false,
  scrittura: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "company-a" }));
vi.mock("@/hooks/useCompanyAnagraficaForTemplate", () => ({ useCompanyAnagraficaForTemplate: () => ({ ragione_sociale: "Impresa esempio" }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canEditSettingsPricing: state.canEdit, isLoading: state.permessiInCaricamento }),
}));
vi.mock("@/lib/moduli-vendita", () => ({
  useModuliVisibilita: () => ({ isModuloVisibile: () => true, setModuloVisibile: state.scrittura, isSaving: false, isLoading: false }),
}));
// I modelli dell'azienda stanno anche online; qui il database non c'è e non serve.
vi.mock("@/lib/moduli-vendita/archivioModelli", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/moduli-vendita/archivioModelli")>()),
  sincronizzaModelliAzienda: async (): Promise<void> => undefined,
  modelliDaMandareOnline: () => [] as unknown[],
}));
// Gli editor dei moduli sono altri file (già rivisti): qui basta sapere quale si apre.
vi.mock("@/components/serramenti/SerramentiModuleTemplatesPanel", () => ({ SerramentiModuleTemplatesPanel: () => <p>Editor Serramenti</p> }));
vi.mock("@/components/fotovoltaico/FotovoltaicoTemplateEditor", () => ({ FotovoltaicoTemplateEditor: () => <p>Editor Fotovoltaico</p> }));
vi.mock("@/components/ristrutturazione/RistrutturazioneTemplateEditor", () => ({ RistrutturazioneTemplateEditor: () => <p>Editor Ristrutturazione</p> }));
vi.mock("@/components/ristrutturazione/RstModuleTemplatePanel", () => ({ RstModuleTemplatePanel: ({ moduleId }: { moduleId: string }) => <p>Editor Rst/{moduleId}</p> }));
vi.mock("@/components/bagni/BagniTemplateEditor", () => ({ BagniTemplateEditor: () => <p>Editor Bagni</p> }));
vi.mock("@/components/tetti/TettiModuleTemplatesPanel", () => ({ TettiModuleTemplatesPanel: () => <p>Editor Tetti</p> }));
vi.mock("@/components/climatizzazione/ClimatizzazioneTemplateEditor", () => ({ ClimatizzazioneTemplateEditor: () => <p>Editor Climatizzazione</p> }));
vi.mock("@/components/elettrico/ElettricoTemplateEditor", () => ({ ElettricoTemplateEditor: () => <p>Editor Elettrico</p> }));
vi.mock("@/components/termoidraulico/TermoidraulicoTemplateEditor", () => ({ TermoidraulicoTemplateEditor: () => <p>Editor Termoidraulico</p> }));
vi.mock("@/components/pavimenti/PavimentiTemplateEditor", () => ({ PavimentiTemplateEditor: () => <p>Editor Pavimenti</p> }));
vi.mock("@/components/piscine/PiscineTemplateEditor", () => ({ PiscineTemplateEditor: () => <p>Editor Piscine</p> }));

function Indirizzo() {
  const l = useLocation();
  return <span data-testid="indirizzo">{`${l.pathname}${l.search}${l.hash}`}</span>;
}
function apri(ricerca = "") {
  return render(
    <MemoryRouter initialEntries={[`/azienda/impostazioni/template-preventivi?tab=moduli-vendita${ricerca}`]}>
      <ModuleTemplateLibrary renderLegacy={() => <p>Editor online</p>} />
      <Indirizzo />
    </MemoryRouter>,
  );
}
/** Il testo che si legge, più segnaposto, suggerimenti e nomi per il lettore di schermo (senza l'indirizzo che il test mostra a se stesso). */
function testoVisibile(): string {
  const corpo = document.body.cloneNode(true) as HTMLElement;
  corpo.querySelectorAll("[data-testid=indirizzo]").forEach((el) => el.remove());
  const pezzi: string[] = [corpo.textContent ?? ""];
  corpo.querySelectorAll("[placeholder],[title],[aria-label],[alt]").forEach((el) => {
    for (const attributo of ["placeholder", "title", "aria-label", "alt"]) {
      const valore = el.getAttribute(attributo);
      if (valore) pezzi.push(valore);
    }
  });
  return pezzi.join("\n");
}

const FRASE_INTERRUTTORI = "Gli interruttori «Area nel menu Nuovo preventivo» decidono quali preventivi compaiono ai tuoi colleghi.";

beforeEach(() => {
  state.canEdit = true;
  state.permessiInCaricamento = false;
  state.scrittura.mockReset();
  localStorage.clear();
});
afterEach(() => cleanup());

describe("Moduli: un solo titolo di pagina", () => {
  it("l'elenco delle aree: il titolo è un h2, i nomi delle aree sono h3, nessun h1", () => {
    apri();
    expect(document.querySelectorAll("h1")).toHaveLength(0);
    const secondi = screen.getAllByRole("heading", { level: 2 });
    expect(secondi.map((h) => h.textContent)).toEqual(["Un modello per ogni intervento"]);
    const terzi = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(terzi).toEqual(SALES_AREAS.map((a) => a.title));
  });

  it("dentro un'area: il titolo è un h2, la presentazione e gli interventi sono h3", () => {
    apri("&modulo=serramenti");
    expect(document.querySelectorAll("h1")).toHaveLength(0);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Moduli Serramenti"]);
    const serramenti = SALES_AREAS.find((a) => a.id === "serramenti")!;
    const terzi = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(terzi).toHaveLength(1 + serramenti.interventions.length);
    for (const intervento of serramenti.interventions) expect(terzi).toContain(intervento.title);
  });
});

describe("Moduli: in cima dice a cosa servono gli interruttori", () => {
  it("la riga sta nell'intestazione, prima di tutte le schede delle aree", () => {
    apri();
    const frase = screen.getByText(FRASE_INTERRUTTORI);
    expect(frase.closest("header")).not.toBeNull();
    const titolo = screen.getByRole("heading", { level: 2, name: "Un modello per ogni intervento" });
    const primaArea = screen.getAllByRole("switch")[0];
    expect(titolo.compareDocumentPosition(frase) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(frase.compareDocumentPosition(primaArea) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("dentro un'area (dove gli interruttori non ci sono) la riga non compare", () => {
    apri("&modulo=bagni");
    expect(screen.queryByText(FRASE_INTERRUTTORI)).toBeNull();
  });

  it("ogni area (tranne Facciate) ha il suo interruttore, con lo stesso nome, e si accende subito", () => {
    apri();
    const interruttori = screen.getAllByRole("switch", { name: "Area nel menu Nuovo preventivo" });
    expect(interruttori).toHaveLength(SALES_AREAS.length - 1);
    fireEvent.click(interruttori[0]);
    expect(state.scrittura).toHaveBeenCalledWith("serramenti", false);
  });

  it("il percorso per tornare indietro si chiama «Moduli», come la scheda (non «Libreria moduli»)", () => {
    apri("&modulo=bagni");
    expect(screen.getByRole("button", { name: "Moduli" })).toBeInTheDocument();
    expect(testoVisibile()).not.toMatch(/Libreria moduli/);
    fireEvent.click(screen.getByRole("button", { name: "Moduli" }));
    expect(screen.getByTestId("indirizzo").textContent).toBe("/azienda/impostazioni/template-preventivi?tab=moduli-vendita");
  });
});

describe("Moduli: le aree che hanno lo stesso preventivatore aprono la loro area", () => {
  const PROPRIO = [
    ["Pareti e soffitti", "pareti-soffitti", "ristrutturazione"],
    ["Pergole e tende", "pergole", "ristrutturazione"],
    ["Facciate e isolamento", "facciate", "ristrutturazione"],
    ["Giardini e verde", "giardini", "pavimenti"],
  ] as const;

  it.each(PROPRIO)("«%s» apre «%s», non l'area con cui condivide il preventivatore", (nome, id, slug) => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: `Apri area ${nome}` }));
    expect(screen.getByRole("heading", { level: 2, name: `Moduli ${nome}` })).toBeInTheDocument();
    expect(screen.getByTestId("indirizzo").textContent).toBe(`/azienda/impostazioni/template-preventivi?tab=moduli-vendita&modulo=${slug}&area=${id}`);
    const area = SALES_AREAS.find((a) => a.id === id)!;
    expect(screen.getAllByRole("button", { name: "Personalizza PDF" })).toHaveLength(area.interventions.length);
  });

  it.each([
    ["Ristrutturazioni", "ristrutturazione"], ["Pavimenti e rivestimenti", "pavimenti"], ["Serramenti", "serramenti"], ["Bagni", "bagni"],
  ])("«%s» ha l'indirizzo di sempre, senza area=", (nome, slug) => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: `Apri area ${nome}` }));
    expect(screen.getByRole("heading", { level: 2, name: `Moduli ${nome}` })).toBeInTheDocument();
    expect(screen.getByTestId("indirizzo").textContent).toBe(`/azienda/impostazioni/template-preventivi?tab=moduli-vendita&modulo=${slug}`);
  });

  it("da «Pareti e soffitti» si apre l'editor di un suo intervento, non di Ristrutturazioni, e l'indirizzo tiene area=", async () => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Apri area Pareti e soffitti" }));
    const primo = SALES_AREAS.find((a) => a.id === "pareti-soffitti")!.interventions[0];
    fireEvent.click(screen.getAllByRole("button", { name: "Personalizza PDF" })[0]);
    expect(await screen.findByText(`Editor Rst/${primo.id}`)).toBeInTheDocument();
    const indirizzo = screen.getByTestId("indirizzo").textContent ?? "";
    expect(indirizzo).toContain("area=pareti-soffitti");
    expect(indirizzo).toContain(`modello=${primo.id}`);
  });

  it("gli indirizzi di prima (senza area=) aprono quelli che aprivano: ristrutturazione → Ristrutturazioni, cappotto → Facciate", () => {
    apri("&modulo=ristrutturazione");
    expect(screen.getByRole("heading", { level: 2, name: "Moduli Ristrutturazioni" })).toBeInTheDocument();
    cleanup();
    apri("&modulo=cappotto");
    expect(screen.getByRole("heading", { level: 2, name: "Moduli Facciate e isolamento" })).toBeInTheDocument();
  });

  it("un area= rimasto da prima, che non c'entra con il preventivatore dell'indirizzo, si ignora", () => {
    apri("&modulo=bagni&area=pareti-soffitti");
    expect(screen.getByRole("heading", { level: 2, name: "Moduli Bagni" })).toBeInTheDocument();
    cleanup();
    apri("&area=pareti-soffitti");
    expect(screen.getByRole("heading", { level: 2, name: "Un modello per ogni intervento" })).toBeInTheDocument();
  });

  it("tornando all'elenco l'area sparisce dall'indirizzo, e passando da un'area all'altra non resta quella di prima", () => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Apri area Pareti e soffitti" }));
    fireEvent.click(screen.getByRole("button", { name: "Tutte le aree" }));
    expect(screen.getByTestId("indirizzo").textContent).toBe("/azienda/impostazioni/template-preventivi?tab=moduli-vendita");
    fireEvent.click(screen.getByRole("button", { name: "Apri area Ristrutturazioni" }));
    expect(screen.getByRole("heading", { level: 2, name: "Moduli Ristrutturazioni" })).toBeInTheDocument();
    expect(screen.getByTestId("indirizzo").textContent).not.toContain("area=");
  });
});

describe("Moduli: le parole", () => {
  it("nell'elenco e dentro un'area non ci sono più «template», «verticale», «moduli vendita»", () => {
    apri();
    expect(testoVisibile()).not.toMatch(/template|verticale|moduli vendita/i);
    cleanup();
    apri("&modulo=pavimenti");
    expect(testoVisibile()).not.toMatch(/template|verticale|moduli vendita/i);
    expect(screen.getByText("Modello dell'area e visibilità")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apri il modello dell'area" })).toBeInTheDocument();
    expect(screen.getByText(/Il modello dell'area è quello usato dal preventivatore attuale/)).toBeInTheDocument();
    expect(screen.getByText(/Non viene sostituito dai modelli degli interventi qui sopra/, { exact: false })).toBeInTheDocument();
  });

  it("il riquadro azzurro non parla più del «template aziendale»", () => {
    apri();
    expect(screen.getByText(/Il modello dell'area resta invariato/)).toBeInTheDocument();
  });
});

describe("Moduli: chi può solo consultare", () => {
  beforeEach(() => {
    state.canEdit = false;
  });

  it("la frase che spiega perché è la prima cosa della scheda", () => {
    const { container } = apri();
    const avviso = screen.getByRole("alert");
    expect(avviso).toHaveTextContent("Stai consultando i modelli: li modifica chi ha il permesso «Listino & Prezzi» in modifica.");
    expect(TESTO_SOLA_LETTURA).toBe("Stai consultando i modelli: li modifica chi ha il permesso «Listino & Prezzi» in modifica.");
    expect(avviso).toHaveAttribute("id", ID_AVVISO_SOLA_LETTURA_MODULI);
    expect(container.firstElementChild?.firstElementChild).toBe(avviso);
  });

  it("gli interruttori delle aree sono spenti e rimandano alla frase", () => {
    apri();
    const interruttori = screen.getAllByRole("switch", { name: "Area nel menu Nuovo preventivo" });
    expect(interruttori).toHaveLength(SALES_AREAS.length - 1);
    for (const interruttore of interruttori) {
      expect(interruttore).toBeDisabled();
      expect(interruttore).toHaveAccessibleDescription(/Stai consultando i modelli/);
    }
  });

  it("«Personalizza PDF» è spento per ogni intervento e rimanda alla frase", () => {
    apri("&modulo=serramenti");
    const pulsanti = screen.getAllByRole("button", { name: "Personalizza PDF" });
    expect(pulsanti.length).toBe(SALES_AREAS.find((a) => a.id === "serramenti")!.interventions.length);
    for (const pulsante of pulsanti) {
      expect(pulsante).toBeDisabled();
      expect(pulsante).toHaveAccessibleDescription(/Stai consultando i modelli/);
    }
  });

  it("nel dettaglio dell'area, interruttore e «Apri il modello dell'area» sono spenti e rimandano alla frase", () => {
    apri("&modulo=bagni");
    const dettaglio = screen.getByText("Modello dell'area e visibilità").closest("details")!;
    const interruttore = within(dettaglio).getByRole("switch");
    const apriModello = within(dettaglio).getByRole("button", { name: "Apri il modello dell'area" });
    for (const comando of [interruttore, apriModello]) {
      expect(comando).toBeDisabled();
      expect(comando).toHaveAccessibleDescription(/Stai consultando i modelli/);
    }
  });

  it("mentre i permessi si caricano la frase non compare (poi scomparirebbe)", () => {
    state.permessiInCaricamento = true;
    apri();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("chi può modificare non vede la frase e ha i comandi accesi, senza rimandi inutili", () => {
    state.canEdit = true;
    apri("&modulo=serramenti");
    expect(screen.queryByRole("alert")).toBeNull();
    const pulsante = screen.getAllByRole("button", { name: "Personalizza PDF" })[0];
    expect(pulsante).toBeEnabled();
    expect(pulsante).not.toHaveAttribute("aria-describedby");
  });
});

describe("Pannello «Modello dell'area» (si apre da «Apri il modello dell'area» dentro un'area, con modello=generale)", () => {
  const SLUG = ["serramenti", "fotovoltaico", "ristrutturazione", "bagni", "tetti", "climatizzazione", "elettrico", "termoidraulico", "pavimenti", "piscine"];

  function apriPannello(slug: string) {
    return render(
      <MemoryRouter initialEntries={[`/azienda/impostazioni/template-preventivi?tab=moduli-vendita&modulo=${slug}&modello=generale`]}>
        <ModuliVenditaPanel initialModulo={slug} />
        <Indirizzo />
      </MemoryRouter>,
    );
  }

  it("mentre si carica dice «Caricamento dei modelli…»", () => {
    apriPannello("bagni");
    expect(screen.getByRole("status")).toHaveTextContent("Caricamento dei modelli…");
  });

  it.each(SLUG)("%s: titolo h2 «Modello dell'area», nessun h1, nessun «template» né «Moduli Vendita»", async (slug) => {
    apriPannello(slug);
    expect(await screen.findByRole("heading", { level: 2, name: "Modello dell'area" })).toBeInTheDocument();
    expect(document.querySelectorAll("h1")).toHaveLength(0);
    expect(testoVisibile()).not.toMatch(/template|moduli vendita|verticale/i);
    expect(screen.getByRole("button", { name: "Scegli un'altra area" })).toBeInTheDocument();
    expect(await screen.findByText(/^Editor /)).toBeInTheDocument();
  });

  it("dice quale area si sta configurando", async () => {
    apriPannello("bagni");
    expect(await screen.findByText(/Stai configurando il modello dell'area/)).toHaveTextContent("Stai configurando il modello dell'area Bagni.");
    expect(screen.getByText(/^Modello del PDF Bagni:/)).toBeInTheDocument();
  });

  it("per Serramenti e Tetti la frase parla di modelli PDF, uno per intervento", async () => {
    apriPannello("tetti");
    expect(await screen.findByText("Configura i modelli PDF dell'area Tetti, uno per ogni intervento.")).toBeInTheDocument();
  });

  it("«Scegli un'altra area» riporta all'elenco delle aree", async () => {
    apriPannello("bagni");
    fireEvent.click(await screen.findByRole("button", { name: "Scegli un'altra area" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Un modello per ogni intervento" })).toBeInTheDocument();
    expect(screen.getByTestId("indirizzo").textContent).toBe("/azienda/impostazioni/template-preventivi?tab=moduli-vendita");
  });
});
