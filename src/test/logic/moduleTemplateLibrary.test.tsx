import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import ModuleTemplateLibrary from "@/components/preventivi/modules/ModuleTemplateLibrary";
import { LocalModuleDocumentEditor } from "@/components/preventivi/modules/LocalModuleDocumentEditor";
import { loadModuleDocument } from "@/lib/moduli-vendita/localModuleDocuments";
import { SALES_AREAS } from "@/lib/moduli-vendita/areas";
import { fullModuleCover } from "@/lib/moduli-vendita/fullModuleCatalog";
import { loadLocalSerramentiTemplate, saveLocalSerramentiTemplate } from "@/lib/moduli-vendita/localSerramentiTemplates";
import { createFullSerramentiTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
import { MODELLO_NON_ONLINE } from "@/lib/moduli-vendita/archivioModelli";
import { createSerramentiModuleTemplate } from "@/lib/moduli-vendita/serramentiTemplateModules";
const state = vi.hoisted(() => ({ canEdit: true, remoteWrite: vi.fn() }));
interface Riga { company_id: string; chiave: string; contenuto: unknown; salvato_il: string }
const db = vi.hoisted(() => ({
  righe: [] as Riga[],
  erroreLettura: null as string | null,
  erroreScrittura: null as string | null,
}));
// I modelli si salvano anche per l'azienda (modelli_libreria_azienda,
// archivioModelli.ts): qui il database è finto, e si può spegnere.
vi.mock("@/integrations/supabase/client", () => {
  const leggi = (colonne: string) => {
    const filtri: Array<(r: Riga) => boolean> = [];
    const domanda = {
      eq: (colonna: keyof Riga, valore: string) => { filtri.push((r) => r[colonna] === valore); return domanda; },
      in: (colonna: keyof Riga, valori: string[]) => { filtri.push((r) => valori.includes(String(r[colonna]))); return domanda; },
      then: <T,>(ok: (esito: unknown) => T, ko?: (e: unknown) => T) => {
        const campi = colonne.split(",").map((c) => c.trim() as keyof Riga);
        return Promise.resolve(db.erroreLettura
          ? { data: null, error: { message: db.erroreLettura } }
          : { data: db.righe.filter((r) => filtri.every((f) => f(r))).map((r) => Object.fromEntries(campi.map((c) => [c, r[c]]))), error: null })
          .then(ok, ko);
      },
    };
    return domanda;
  };
  return {
    supabase: {
      from: () => ({
        select: leggi,
        upsert: async (riga: Riga) => {
          if (db.erroreScrittura) return { error: { message: db.erroreScrittura } };
          db.righe = [...db.righe.filter((r) => r.chiave !== riga.chiave), riga];
          return { error: null };
        },
      }),
    },
  };
});
vi.mock("@/hooks/useEffectiveCompanyId", () => ({
  useEffectiveCompanyId: () => "company-a",
}));
vi.mock("@/hooks/useCompanyAnagraficaForTemplate", () => ({
  useCompanyAnagraficaForTemplate: () => ({
    ragione_sociale: "Impresa esempio",
  }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canEditSettingsPricing: state.canEdit }),
}));
vi.mock("@/lib/moduli-vendita", () => ({
  useModuliVisibilita: () => ({
    isModuloVisibile: () => true,
    setModuloVisibile: state.remoteWrite,
    isSaving: false,
    isLoading: false,
  }),
}));
vi.mock("@/components/shared/PdfBlobLivePreviewPanel", () => ({
  PdfBlobLivePreviewPanel: () => <div>Anteprima test</div>,
}));
vi.mock("@/components/fotovoltaico/FvModuleTemplatePanel", () => ({ FvModuleTemplatePanel: () => <p>Editor FV originale completo</p> }));
vi.mock("@/components/ristrutturazione/RstModuleTemplatePanel", () => ({ RstModuleTemplatePanel: () => <p>Editor Ristrutturazioni originale completo</p> }));
vi.mock("@/components/climatizzazione/ClmModuleTemplatePanel", () => ({ ClmModuleTemplatePanel: ({ moduleId }: { moduleId: string }) => <p>Editor dedicato climatizzazione/{moduleId}</p> }));
vi.mock("@/components/elettrico/EltModuleTemplatePanel", () => ({ EltModuleTemplatePanel: ({ moduleId }: { moduleId: string }) => <p>Editor dedicato elettrico/{moduleId}</p> }));
vi.mock("@/components/pavimenti/PavModuleTemplatePanel", () => ({ PavModuleTemplatePanel: ({ moduleId }: { moduleId: string }) => <p>Editor dedicato pavimenti/{moduleId}</p> }));
vi.mock("@/components/piscine/PscModuleTemplatePanel", () => ({ PscModuleTemplatePanel: ({ moduleId }: { moduleId: string }) => <p>Editor dedicato piscine/{moduleId}</p> }));
vi.mock("@/components/facciate/FacciateModuleTemplatePanel", () => ({ FacciateModuleTemplatePanel: ({ moduleId, companyId }: { moduleId: string; companyId: string }) => <p>Editor dedicato cappotto/{moduleId} · {companyId}</p> }));
beforeEach(() => {
  localStorage.clear();
  db.righe = [];
  db.erroreLettura = null;
  db.erroreScrittura = null;
  state.canEdit = true;
  state.remoteWrite.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const mount = (query = "") =>
  render(
    <MemoryRouter initialEntries={[`/?tab=moduli-vendita${query}`]}>
      <ModuleTemplateLibrary
        renderLegacy={() => <p>Editor online originale</p>}
      />
    </MemoryRouter>,
  );
describe("libreria completa dei moduli", () => {
  it("distingue edizioni complete, copie vecchie e modelli ancora essenziali", () => {
    saveLocalSerramentiTemplate("company-a", "finestre", createSerramentiModuleTemplate({ company_id: "company-a" }, "finestre"), null);
    mount("&modulo=serramenti");
    expect(screen.getAllByText("PDF con pagine dedicate")).toHaveLength(7);
    expect(screen.queryAllByText("Edizione essenziale · da completare")).toHaveLength(0);
    expect(screen.getByText("Edizione completa disponibile · aggiorna la copia")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Copertina illustrativa — Avvolgibili e cassonetti" })).toHaveAttribute("src", "/module-art/serramenti-avvolgibili-cover.jpg");
    expect(state.remoteWrite).not.toHaveBeenCalled();
  });
  it("apre l'edizione Accumulo nell'editor originale, non nel documento generico", async () => {
    mount("&modulo=fotovoltaico&modello=accumulo");
    expect(await screen.findByText("Editor FV originale completo")).toBeInTheDocument();
    expect(screen.queryByLabelText("Titolo del modulo")).toBeNull();
    expect(state.remoteWrite).not.toHaveBeenCalled();
  });
  it.each(SALES_AREAS.filter(a => ["climatizzazione", "elettrico", "pavimenti", "piscine", "facciate"].includes(a.id)).flatMap(a => a.interventions.map(m => [a.sourceModule, m.id] as const)))("collega il nuovo modello %s/%s alle pagine dedicate", async (slug, id) => {
    mount(`&modulo=${slug}&modello=${id}`);
    expect(await screen.findByText(new RegExp(`Editor dedicato ${slug}/${id}`))).toBeInTheDocument();
    expect(screen.queryByLabelText("Titolo del modulo")).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(state.remoteWrite).not.toHaveBeenCalled();
  });
  it.each(["climatizzazione", "elettrico", "pavimenti", "piscine", "cappotto"])("conserva l'edizione precedente nell'area %s", async slug => {
    const area = SALES_AREAS.find(a => a.sourceModule === slug)!;
    mount(`&modulo=${slug}&modello=${area.interventions[0].id}&edizione=precedente`);
    expect(await screen.findByLabelText("Titolo del modulo")).toHaveValue(area.interventions[0].title);
    expect(state.remoteWrite).not.toHaveBeenCalled();
  });
  it.each(
    SALES_AREAS.filter((a) => !["serramenti", "tetti"].includes(a.id)).flatMap(
      (a) =>
        a.interventions.filter(m => !fullModuleCover(a.id, m.id)).map((m) => [a.sourceModule, m.id, m.title] as const),
    ),
  )("apre l'editor locale %s/%s", async (slug, id, title) => {
    mount(`&modulo=${slug}&modello=${id}`);
    expect(await screen.findByLabelText("Titolo del modulo")).toHaveValue(
      title,
    );
    expect(screen.getByText("Anteprima test")).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
    expect(state.remoteWrite).not.toHaveBeenCalled();
  });
  it("mostra 13 aree senza modificare preferenze o copie locali", () => {
    mount();
    expect(screen.getAllByRole("button", { name: /Apri area/ })).toHaveLength(
      13,
    );
    expect(screen.getAllByRole("switch")).toHaveLength(12);
    expect(localStorage.length).toBe(0);
    expect(state.remoteWrite).not.toHaveBeenCalled();
  });
  it("apre Ristrutturazione completa nell'editor originale mantenendo la vecchia bozza", async () => {
    const view = mount("&modulo=ristrutturazione&modello=completa");
    expect(await screen.findByText("Editor Ristrutturazioni originale completo")).toBeInTheDocument();
    view.unmount();
    mount("&modulo=ristrutturazione&modello=completa&edizione=precedente");
    expect(await screen.findByLabelText("Titolo del modulo")).toHaveValue("Ristrutturazione completa");
    expect(state.remoteWrite).not.toHaveBeenCalled();
  });
  it("trova direttamente il modulo per intervento", () => {
    mount();
    fireEvent.change(screen.getByLabelText("Cerca un modulo"), {
      target: { value: "vasca" },
    });
    expect(
      screen.getByRole("heading", { name: "Da vasca a doccia" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 modello trovato")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Personalizza PDF" }),
    ).toHaveLength(1);
  });
  it("apre i moduli Facciate e gestisce le ricerche vuote", () => {
    mount("&modulo=cappotto");
    expect(
      screen.getAllByRole("button", { name: "Personalizza PDF" }),
    ).toHaveLength(6);
    fireEvent.change(screen.getByLabelText("Cerca un modulo"), {
      target: { value: "inesistente" },
    });
    expect(screen.getByText("Nessun modulo trovato.")).toBeInTheDocument();
  });
  it("mantiene il percorso online esplicito e separato", () => {
    mount("&modulo=bagni&modello=generale");
    expect(screen.getByText("Editor online originale")).toBeInTheDocument();
    expect(state.remoteWrite).not.toHaveBeenCalled();
  });
  it("rispetta i permessi anche con un deeplink diretto", () => {
    state.canEdit = false;
    mount("&modulo=bagni&modello=vasca-doccia");
    expect(screen.getByRole("alert")).toHaveTextContent("Non hai i permessi");
  });
  it("modifica, riordina e salva solo il documento locale", () => {
    render(
      <MemoryRouter>
        <LocalModuleDocumentEditor
          companyId="company-a"
          areaId="bagni"
          moduleId="vasca-doccia"
          company={{
            name: "Impresa esempio",
            address: "",
            email: "",
            phone: "",
          }}
          onBack={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(localStorage.length).toBe(0);
    fireEvent.change(screen.getByLabelText("Titolo del modulo"), {
      target: { value: "La tua nuova doccia" },
    });
    fireEvent.change(screen.getByLabelText("Pagina da modificare"), {
      target: { value: "perimetro" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Sposta pagina prima" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    const saved = loadModuleDocument("company-a", "bagni", "vasca-doccia");
    expect(saved?.document.title).toBe("La tua nuova doccia");
    expect(saved?.document.pages[1].id).toBe("perimetro");
    expect(state.remoteWrite).not.toHaveBeenCalled();
  });
  it("non chiede conferma uscendo da un modello appena aperto e mai modificato", () => {
    const back = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <MemoryRouter>
        <LocalModuleDocumentEditor
          companyId="company-a"
          areaId="bagni"
          moduleId="vasca-doccia"
          company={{
            name: "Impresa esempio",
            address: "",
            email: "",
            phone: "",
          }}
          onBack={back}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByText("Modello pronto · non ancora salvato"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Moduli dell'area" }));
    expect(back).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    expect(screen.getByText("Salvato")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Salva modello" }),
    ).toBeDisabled();
  });
});

describe("i modelli sono dell'azienda, non del browser", () => {
  const finestre = () => createFullSerramentiTemplate({ company_id: "company-a" }, "finestre");
  const avvisoConRiprova = (testo: HTMLElement) => within(testo.closest("[role=alert]") as HTMLElement).getByRole("button", { name: "Riprova" });

  it("un modello salvato da un collega su un altro computer compare come salvato", async () => {
    saveLocalSerramentiTemplate("company-a", "finestre", finestre(), null);
    await waitFor(() => expect(db.righe).toHaveLength(1));
    localStorage.clear(); // un altro computer: nel browser non c'è nulla
    mount("&modulo=serramenti");
    expect(await screen.findByText("Salvato")).toBeInTheDocument();
    expect(loadLocalSerramentiTemplate("company-a", "finestre")).not.toBeNull();
  });

  it("apre l'editor solo dopo aver letto i modelli dell'azienda", async () => {
    mount("&modulo=fotovoltaico&modello=accumulo");
    expect(screen.getByText("Caricamento dei modelli dell'azienda…")).toBeInTheDocument();
    expect(await screen.findByText("Editor FV originale completo")).toBeInTheDocument();
  });

  it("dice quando un modello è rimasto solo in questo browser, e Riprova lo manda online", async () => {
    db.erroreScrittura = "rete assente";
    const avviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    saveLocalSerramentiTemplate("company-a", "finestre", finestre(), null);
    await waitFor(() => expect(avviso).toHaveBeenCalled());
    mount("&modulo=serramenti");
    const testo = await screen.findByText("Un modello è salvato solo in questo browser: non è ancora online e i colleghi non lo vedono.");
    db.erroreScrittura = null;
    fireEvent.click(avvisoConRiprova(testo));
    await waitFor(() => expect(db.righe.map((r) => r.chiave)).toEqual([expect.stringMatching(/:serramenti:finestre$/)]));
    await waitFor(() => expect(screen.queryByText(/solo in questo browser/)).toBeNull());
  });

  it("se il database non risponde lo dice, e si può riprovare", async () => {
    db.erroreLettura = "timeout";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mount("&modulo=serramenti");
    const testo = await screen.findByText("Non riesco a leggere i modelli salvati online: stai vedendo le copie di questo browser.");
    db.erroreLettura = null;
    fireEvent.click(avvisoConRiprova(testo));
    await waitFor(() => expect(screen.queryByText(/Non riesco a leggere i modelli salvati online/)).toBeNull());
  });

  it("un salvataggio che non arriva online si dice subito", () => {
    const errore = vi.spyOn(toast, "error");
    mount();
    act(() => { window.dispatchEvent(new CustomEvent(MODELLO_NON_ONLINE, { detail: { chiave: "x" } })); });
    expect(errore).toHaveBeenCalledWith("Modello salvato solo in questo browser", expect.objectContaining({ description: expect.stringContaining("i colleghi non lo vedono") }));
  });
});
