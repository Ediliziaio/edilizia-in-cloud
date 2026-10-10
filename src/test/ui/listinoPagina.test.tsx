/**
 * Impostazioni → Listino (10/10/2026): la pagina.
 *
 * Aveva un secondo titolo («Listino prodotti») sotto il «Listino» del layout, tre frasi diverse e due sbagliate per dire
 * chi può cosa, un cestino che parlava di «articoli» e di «database», «Importa» con dentro azioni che non importano, errori
 * che mostravano il testo del database, e l'editor del prodotto non sapeva da dove si arrivava.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import SettingsCatalog from "@/pages/azienda/settings/SettingsCatalog";
import { articoloEsempio } from "@/lib/listino/esempiListino";
import type { FamilyWithAxes } from "@/types/articleFamily";

const state = vi.hoisted(() => ({
  role: "company_admin" as string,
  permissions: { isAdmin: true, canEditSettingsPricing: true, canViewSettingsPricing: true } as Record<string, boolean>,
  families: [] as unknown[],
  cestino: [] as unknown[],
  cestinoInErrore: false,
  updateFamily: vi.fn(),
  restoreFamily: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: state.role, effectiveCompany: { id: "azienda-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.permissions }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error, info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/hooks/useFamilies", () => ({
  useFamilies: () => ({ families: state.families, isLoading: false, isError: false, refetch: vi.fn() }),
  useFamiliesCestino: () => ({ cestino: state.cestino, isLoading: false, isError: state.cestinoInErrore, refetch: vi.fn() }),
}));
const mutazione = () => ({ mutateAsync: vi.fn(), isPending: false });
vi.mock("@/hooks/useFamilyMutations", () => ({
  useFamilyMutations: () => ({
    deleteFamily: mutazione(), hardDeleteFamily: mutazione(), duplicateFamily: mutazione(),
    restoreFamily: { mutateAsync: state.restoreFamily, isPending: false },
    updateFamily: { mutateAsync: state.updateFamily, isPending: false },
  }),
}));
vi.mock("@/hooks/useListinoMacrocategorie", () => ({
  useListinoMacrocategorie: () => ({ macrocategorie: [{ id: "m1", nome: "Serramenti", verticali_abilitati: ["serramenti"] }] }),
  useMacrocategorieMutations: () => ({ createMacrocategoria: mutazione(), updateMacrocategoria: mutazione() }),
}));
vi.mock("@/hooks/useListinoCategorie", () => ({
  useListinoCategorie: () => ({ categorie: [{ id: "c1", nome: "PVC", macrocategoria_id: "m1" }] }),
  useCategorieMutations: () => ({ createCategoria: mutazione() }),
}));
vi.mock("@/hooks/useOrganizzaListino", () => ({
  useOrganizzaListino: () => ({
    aggiungiLinea: mutazione(), allineaLinee: mutazione(), prezziLinee: mutazione(), copiaTipologia: mutazione(),
    variantiTipologia: mutazione(), completaInfissi: mutazione(),
  }),
}));
vi.mock("@/hooks/useSchedeLinea", () => ({ useSchedeLinea: () => ({ indice: new Map() }) }));
// Le finestre che qui non servono restano fuori (e con loro i loro hook).
vi.mock("@/components/listino/FamilyTemplatePicker", () => ({ FamilyTemplatePicker: (): null => null }));
vi.mock("@/components/listino/ImpostaStandardSerramentiDialog", () => ({ ImpostaStandardSerramentiDialog: (): null => null }));
vi.mock("@/components/listino/ImportaSerieDialog", () => ({ ImportaSerieDialog: (): null => null }));
vi.mock("@/components/listino/AssegnaDisegniDialog", () => ({ AssegnaDisegniDialog: (): null => null }));
vi.mock("@/components/listino/ModelliInfissiDialog", () => ({ ModelliInfissiDialog: (): null => null }));
vi.mock("@/components/listino/CompletaPrezziInfissiDialog", () => ({ CompletaPrezziInfissiDialog: (): null => null }));
vi.mock("@/components/listino/NuovaAreaDialog", () => ({ NuovaAreaDialog: (): null => null }));
vi.mock("@/components/listino/NuovaLineaDialog", () => ({ NuovaLineaDialog: (): null => null }));
vi.mock("@/components/listino/NuovaTipologiaDialog", () => ({ NuovaTipologiaDialog: (): null => null }));
vi.mock("@/components/listino/PrezziLineeDialog", () => ({ PrezziLineeDialog: (): null => null }));
vi.mock("@/components/listino/VariantiTipologiaDialog", () => ({ VariantiTipologiaDialog: (): null => null }));
vi.mock("@/components/listino/SchedaLineaDialog", () => ({ SchedaLineaDialog: (): null => null }));
vi.mock("@/components/listino/MacroCategorieManager", () => ({ MacroCategorieManager: (): null => null }));

const prodotto = (id: string, nome: string, extra: Partial<FamilyWithAxes> = {}) =>
  articoloEsempio(id, nome, { macrocategoria_id: "m1", categoria_id: "c1", prezzo_base_vendita: 100, prezzo_base_acquisto: 60, ...extra });

function Dettaglio() {
  const { pathname, state: stato } = useLocation();
  return <div data-testid="editor">{pathname}|{JSON.stringify(stato)}</div>;
}
async function apri(percorso = "/azienda/impostazioni/listino?area=serramenti&tipologia=macro:m1&linea=cat:c1") {
  render(
    <MemoryRouter initialEntries={[percorso]}>
      <Routes>
        <Route path="/azienda/impostazioni/listino" element={<SettingsCatalog />} />
        <Route path="/azienda/impostazioni/listino/famiglie/:id" element={<Dettaglio />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Object.assign(Element.prototype, { hasPointerCapture: () => false, releasePointerCapture: () => {}, setPointerCapture: () => {}, scrollIntoView: () => {} });
  state.role = "company_admin";
  state.permissions = { isAdmin: true, canEditSettingsPricing: true, canViewSettingsPricing: true };
  state.families = [prodotto("a", "Finestra A")];
  state.cestino = [];
  state.cestinoInErrore = false;
  state.updateFamily.mockReset().mockResolvedValue(undefined);
  state.restoreFamily.mockReset().mockResolvedValue(undefined);
  state.error.mockClear();
  state.success.mockClear();
  try { localStorage.removeItem("listino:view"); } catch { /* niente */ }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Listino: la pagina", () => {
  it("non ha un secondo titolo sotto quello del layout, e «Come funziona» sta nella barra, accanto a «Nuovo prodotto»", async () => {
    await apri();
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(document.body.textContent).not.toContain("Listino prodotti");
    const nuovo = screen.getByRole("button", { name: /Nuovo/ });
    const guida = screen.getByRole("button", { name: "Come funziona" });
    expect(nuovo.parentElement).toBe(guida.parentElement);
  });

  it("chi non può nemmeno vederlo legge la regola vera: «Listino & Prezzi»", async () => {
    state.role = "staff";
    state.permissions = { isAdmin: false, canEditSettingsPricing: false, canViewSettingsPricing: false };
    await apri();
    expect(screen.getByText(/Il listino lo vede chi ha il permesso «Listino & Prezzi»/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Solo l'amministratore");
  });

  it("chi può solo consultare legge la regola vera, non «lo modifica l'amministratore»", async () => {
    state.role = "staff";
    state.permissions = { isAdmin: false, canEditSettingsPricing: false, canViewSettingsPricing: true };
    await apri();
    expect(screen.getByText(/Stai consultando il listino: lo modifica chi ha il permesso «Listino & Prezzi» in modifica/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("lo modifica l'amministratore dell'azienda");
  });

  it("«Importa» porta dati (Excel, PDF); «Imposta» ha modelli pronti, serie di profilo e i prezzi delle linee infissi", async () => {
    await apri();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Importa" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    expect((await screen.findAllByRole("menuitem")).map((v) => v.textContent?.replace(/\s+/g, " "))).toEqual([
      "Excel o CSVDa un foglio di calcolo",
      "Listino fornitore in PDFLetto dall'intelligenza artificiale",
    ]);
    cleanup();
    await apri();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Imposta" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    expect((await screen.findAllByRole("menuitem")).map((v) => v.textContent?.split(/(?=[A-Z][a-z])/)[0])).toEqual([
      "Modelli pronti", "Serie di profilo", "Prezzi delle linee infissi",
    ]);
  });
});

describe("Listino: da dove si apre un prodotto, lì si torna", () => {
  it("aprendo un prodotto l'editor riceve l'indirizzo del listino com'era (area, tipologia, linea)", async () => {
    await apri("/azienda/impostazioni/listino?area=serramenti&tipologia=macro:m1&linea=cat:c1");
    fireEvent.click(screen.getByRole("button", { name: "Finestra A" }));
    const editor = await screen.findByTestId("editor");
    const [percorso, stato] = (editor.textContent ?? "").split("|");
    expect(percorso).toBe("/azienda/impostazioni/listino/famiglie/a");
    expect(JSON.parse(stato)).toEqual({ ritorno: "area=serramenti&tipologia=macro%3Am1&linea=cat%3Ac1" });
  });

  it("«Nuovo prodotto» porta con sé la tipologia e la linea scelte, e lo stesso ritorno", async () => {
    await apri();
    fireEvent.click(screen.getByRole("button", { name: /Nuovo/ }));
    const editor = await screen.findByTestId("editor");
    expect(editor.textContent).toContain("/azienda/impostazioni/listino/famiglie/nuova");
    expect(editor.textContent).toContain("ritorno");
  });
});

describe("Listino: errori e cestino in italiano", () => {
  it("un errore di rete cambiando «Attivo» si legge in italiano, non «Failed to fetch»", async () => {
    localStorage.setItem("listino:view", "table");
    state.updateFamily.mockRejectedValue(new TypeError("Failed to fetch"));
    await apri();
    fireEvent.click(screen.getAllByRole("switch", { name: "Prodotto attivo: Finestra A" })[0]);
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(state.error).toHaveBeenCalledWith("Modifica non riuscita", { description: "Connessione persa. Controlla la rete e riprova." });
  });

  it("un permesso mancante cambiando «Nei preventivi» si legge in italiano", async () => {
    localStorage.setItem("listino:view", "table");
    state.updateFamily.mockRejectedValue({ code: "42501", message: 'new row violates row-level security policy for table "article_families"' });
    await apri();
    fireEvent.click(screen.getAllByRole("switch", { name: "Proposto nei preventivi: Finestra A" })[0]);
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(state.error.mock.calls[0][1].description).toMatch(/permess/i);
    expect(state.error.mock.calls[0][1].description).not.toContain("row-level");
  });

  it("il cestino parla di «prodotti» e dei 15 giorni, senza «articoli» né «database»", async () => {
    state.cestino = [{ ...prodotto("x", "Vecchia porta"), deleted_at: new Date().toISOString() }];
    await apri();
    fireEvent.click(screen.getByRole("button", { name: /Cestino \(1 prodotto\)/ }));
    const finestra = await screen.findByRole("dialog");
    expect(finestra.textContent).toContain("I prodotti eliminati restano 15 giorni nel cestino, poi vengono cancellati per sempre");
    expect(finestra.textContent).not.toMatch(/articol|database/i);
    expect(finestra.textContent).toContain("Cestino");
    expect(screen.getByRole("list", { name: "Prodotti nel cestino" })).toBeInTheDocument();
  });

  it("se il cestino non si carica lo dice (non «è vuoto») e permette di riprovare", async () => {
    state.cestinoInErrore = true;
    await apri();
    fireEvent.click(screen.getByRole("button", { name: /Cestino/ }));
    const finestra = await screen.findByRole("dialog");
    expect(finestra.textContent).toContain("Il cestino non si è caricato");
    expect(finestra.textContent).not.toContain("Il cestino è vuoto");
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument();
  });

  it("un altro errore nel ripristino si legge in italiano", async () => {
    state.cestino = [{ ...prodotto("x", "Vecchia porta"), deleted_at: new Date().toISOString() }];
    state.restoreFamily.mockRejectedValue(new TypeError("Failed to fetch"));
    await apri();
    fireEvent.click(screen.getByRole("button", { name: /Cestino \(1 prodotto\)/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Ripristina Vecchia porta" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(state.error).toHaveBeenCalledWith("Ripristino non riuscito", { description: "Connessione persa. Controlla la rete e riprova." });
  });

  it("ripristinando un prodotto con un nome già usato si dice cosa fare (il caso del nome doppio resta riconosciuto)", async () => {
    state.cestino = [{ ...prodotto("x", "Vecchia porta"), deleted_at: new Date().toISOString() }];
    state.restoreFamily.mockRejectedValue({ code: "23505", message: 'duplicate key value violates unique constraint "uq_family_nome"' });
    await apri();
    fireEvent.click(screen.getByRole("button", { name: /Cestino \(1 prodotto\)/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Ripristina Vecchia porta" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(state.error.mock.calls[0][1].description).toBe("C'è già un prodotto attivo con lo stesso nome: rinominalo o disattivalo, poi ripristina questo.");
  });
});

describe("Listino: i testi delle finestre di conferma", () => {
  // Le due finestre si aprono da un menu: in jsdom, con le copie di Radix di questa cartella, un menu che apre una
  // finestra non finisce mai. Si controlla il sorgente.
  const sorgente = readFileSync(resolve(process.cwd(), "src/components/listino/FamilyCatalog.tsx"), "utf8");

  it("«Elimina»: cestino per 15 giorni, poi cancellato per sempre, senza «database»", () => {
    expect(sorgente).toContain("Il prodotto va nel <strong>cestino per 15 giorni</strong>, poi viene");
    expect(sorgente).toContain("cancellato per sempre. Fino ad allora lo puoi ripristinare. I");
    expect(sorgente).not.toMatch(/dal database|snapshottati|L&apos;articolo/);
  });

  it("«Elimina definitivamente»: non si torna indietro, i preventivi già fatti non cambiano", () => {
    expect(sorgente).toContain("Non si può tornare indietro. Il prodotto e le sue opzioni vengono");
    expect(sorgente).toContain("fatti non cambiano.");
  });
});
