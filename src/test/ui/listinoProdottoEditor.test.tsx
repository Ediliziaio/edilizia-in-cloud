/**
 * Listino → editor del prodotto (10/10/2026).
 *
 * - «Prodotto attivo» e «Proposto nei preventivi» non c'erano nell'editor: per spegnere un prodotto bisognava uscire e
 *   tornare all'elenco, dove si cambiano da un menu.
 * - Chi può solo consultare vedeva i campi attivi e «Salva» premibile: si scriveva, si salvava e il database rifiutava,
 *   con l'errore grezzo.
 * - Dopo aver cambiato un prodotto si ripartiva dalla prima area del listino.
 * - «Gestisci» le tipologie lo vedeva anche chi non può gestirle; parole da programmatore («markup», «Tipo markup»,
 *   «Sconto 2 cascata»); quattro pulsanti «Salva …» che fanno la stessa cosa; un secondo titolo di pagina.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const state = vi.hoisted(() => ({
  famiglia: null as Record<string, unknown> | null,
  role: "company_admin" as string,
  update: vi.fn(),
  crea: vi.fn(),
  duplica: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const risposta: { data: unknown[]; error: null } = { data: [], error: null };
  const catena: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "is", "in", "order", "limit"]) catena[m] = () => catena;
  catena.then = (r: (v: unknown) => unknown) => Promise.resolve(risposta).then(r);
  return { supabase: { from: () => catena, rpc: vi.fn() } };
});
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error, info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "azienda-1" }));
vi.mock("@/hooks/useFamilies", () => ({ useFamily: () => ({ family: state.famiglia, isLoading: false }) }));
vi.mock("@/hooks/useFamilyMutations", () => ({
  useFamilyMutations: () => ({
    createFamily: { mutateAsync: state.crea, isPending: false },
    updateFamily: { mutateAsync: state.update, isPending: false },
    duplicateFamily: { mutateAsync: state.duplica, isPending: false },
  }),
}));
vi.mock("@/hooks/useArticleImageUpload", () => ({
  useArticleImageUpload: () => ({ upload: vi.fn(), remove: vi.fn(), isUploading: false, isRemoving: false }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-1" }, role: state.role }) }));
vi.mock("@/hooks/useListinoMacrocategorie", () => ({ useListinoMacrocategorie: () => ({ macrocategorie: [{ id: "m1", nome: "Serramenti" }] }) }));
vi.mock("@/hooks/useListinoCategorie", () => ({ useListinoCategorie: () => ({ categorie: [] as unknown[], isLoading: false }) }));
vi.mock("@/components/listino/ArticlePdfDocumentsSection", () => ({ ArticlePdfDocumentsSection: (): null => null }));
vi.mock("@/components/listino/FamilyAxesEditor", () => ({ FamilyAxesEditor: () => <button type="button">Aggiungi un'opzione</button> }));
vi.mock("@/components/listino/FamilyGridEditor", () => ({ FamilyGridEditor: (): null => null }));
vi.mock("@/components/listino/PhotoTemplatePicker", () => ({ PhotoTemplatePicker: (): null => null }));
vi.mock("@/components/listino/FamilyPricePreview", () => ({ FamilyPricePreview: (): null => null }));
vi.mock("@/components/listino/MacroCategorieManager", () => ({ MacroCategorieManager: () => <p>Gestore delle tipologie</p> }));
vi.mock("@/components/listino/DynamicFieldsRenderer", () => ({ DynamicFieldsRenderer: (): null => null }));

import { FamilyEditor } from "@/components/listino/FamilyEditor";

const famiglia = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "fam-1", company_id: "azienda-1", nome: "Finestra 2 ante", codice: null, vertical: "serramenti",
  macrocategoria_id: "m1", categoria_id: null, descrizione: null, immagine_url: null, supplier_id: null,
  modalita_prezzo_base: "pz", prezzo_base_mode: "vendita", prezzo_base_vendita: 600, prezzo_base_acquisto: 180,
  markup_tipo: "none", markup_valore: 0, sconto_fornitore_1: 0, sconto_fornitore_2: 0,
  vat_rate: 22, vat_rate_acquisto: 22, unit_of_measure: "pz",
  posa_tariffa_default_id: null, posa_quantita_default: 1, posa_linked: true,
  manodopera_modalita: "nessuna", manodopera_costo_acquisto: 0, manodopera_prezzo_vendita: 0, manodopera_unita: "pz",
  griglia_asse_x_label: "Larghezza (mm)", griglia_asse_y_label: "Altezza (mm)", griglia_unita: "mm",
  attivo: true, mostra_preventivo: true, custom_field_values: {}, axes: [] as unknown[],
  disegno_tipologia: null, disegno_definizione: null,
  updated_at: "2026-10-09T08:00:00Z", created_at: "2026-10-01T08:00:00Z", deleted_at: null,
  ...extra,
});

function Posizione() {
  const { pathname, search } = useLocation();
  return <div data-testid="posizione">{pathname + search}</div>;
}
/** Sempre a schermo: dice dove si è, per aspettare la fine di una navigazione prima di cliccare. */
function PercorsoCorrente() {
  const { pathname } = useLocation();
  return <div data-testid="percorso">{pathname}</div>;
}
function apri(percorso: { pathname: string; state?: unknown } | string, soloLettura = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[percorso as never]}>
        <PercorsoCorrente />
        <Routes>
          <Route path="/azienda/impostazioni/listino/famiglie/:id" element={<FamilyEditor soloLettura={soloLettura} />} />
          <Route path="/azienda/impostazioni/listino" element={<Posizione />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const scheda = (nome: RegExp) => screen.getByRole("tab", { name: nome });
const vaiA = (nome: RegExp) => { fireEvent.mouseDown(scheda(nome), { button: 0, ctrlKey: false }); };
const testo = () => document.body.textContent ?? "";

beforeEach(() => {
  state.famiglia = famiglia();
  state.role = "company_admin";
  state.update.mockReset().mockResolvedValue(undefined);
  state.crea.mockReset().mockResolvedValue({ id: "fam-9" });
  state.duplica.mockReset().mockResolvedValue("fam-2");
  state.success.mockClear();
  state.error.mockClear();
});
afterEach(() => cleanup());

describe("Editor del prodotto: «Prodotto attivo» e «Proposto nei preventivi» sono nell'editor", () => {
  it("ci sono per un prodotto già salvato, e il nome del prodotto è un titolo di sezione (il titolo di pagina lo mette il layout)", () => {
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    expect(screen.getByRole("switch", { name: "Prodotto attivo" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Proposto nei preventivi" })).toBeChecked();
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 2, name: /Finestra 2 ante/ })).toBeInTheDocument();
  });

  it("non ci sono per un prodotto nuovo: non esiste ancora", () => {
    state.famiglia = null;
    apri("/azienda/impostazioni/listino/famiglie/nuova");
    expect(screen.queryByRole("switch", { name: "Prodotto attivo" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Proposto nei preventivi" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Nuovo prodotto" })).toBeInTheDocument();
  });

  it("spegnere «Prodotto attivo» salva subito, senza «Salva», con le stesse parole dell'elenco", async () => {
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    fireEvent.click(screen.getByRole("switch", { name: "Prodotto attivo" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Prodotto disattivato"));
    expect(state.update).toHaveBeenCalledWith({ id: "fam-1", patch: { attivo: false } });
  });

  it("riaccenderlo dice «Prodotto riattivato»", async () => {
    state.famiglia = famiglia({ attivo: false });
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    expect(screen.getByRole("switch", { name: "Prodotto attivo" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("switch", { name: "Prodotto attivo" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Prodotto riattivato"));
    expect(state.update).toHaveBeenCalledWith({ id: "fam-1", patch: { attivo: true } });
  });

  it("«Proposto nei preventivi» salva subito e dice «Nascosto dai preventivi»", async () => {
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    fireEvent.click(screen.getByRole("switch", { name: "Proposto nei preventivi" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Nascosto dai preventivi"));
    expect(state.update).toHaveBeenCalledWith({ id: "fam-1", patch: { mostra_preventivo: false } });
  });

  it("un errore di rete si legge in italiano, e un secondo clic mentre salva non parte", async () => {
    let fallisci: (e: unknown) => void = () => {};
    state.update.mockReturnValue(new Promise((_, no) => { fallisci = no; }));
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    fireEvent.click(screen.getByRole("switch", { name: "Prodotto attivo" }));
    expect(screen.getByRole("switch", { name: "Proposto nei preventivi" })).toBeDisabled();
    fireEvent.click(screen.getByRole("switch", { name: "Proposto nei preventivi" }));
    expect(state.update).toHaveBeenCalledOnce();
    fallisci(new TypeError("Failed to fetch"));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(state.error).toHaveBeenCalledWith("Modifica non riuscita", { description: "Connessione persa. Controlla la rete e riprova." });
    await waitFor(() => expect(screen.getByRole("switch", { name: "Proposto nei preventivi" })).toBeEnabled());
  });
});

describe("Editor del prodotto: sola lettura vera", () => {
  it("campi spenti, nessun pulsante di salvataggio, nessun «Duplica», interruttori spenti, e la frase che spiega perché", () => {
    apri("/azienda/impostazioni/listino/famiglie/fam-1", true);
    expect(screen.getByText(/Stai consultando il prodotto: lo modifica chi ha il permesso «Listino & Prezzi» in modifica/)).toBeInTheDocument();
    expect(document.getElementById("f-nome")).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Prodotto attivo" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Proposto nei preventivi" })).toBeDisabled();
    for (const nome of [/^Salva$/, /Crea il prodotto/, /Duplica/, /Salva e duplica/]) {
      expect(screen.queryByRole("button", { name: nome }), String(nome)).toBeNull();
    }
  });

  it("le altre schede si sfogliano lo stesso, e in tutte i campi sono spenti e i «Salva» non ci sono", () => {
    apri("/azienda/impostazioni/listino/famiglie/fam-1", true);
    vaiA(/2\. Prezzo/);
    expect(document.getElementById("f-prezzo-vendita")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Salva/ })).toBeNull();
    vaiA(/3\. Opzioni/);
    expect(screen.getByRole("button", { name: "Aggiungi un'opzione" })).toBeDisabled();
    vaiA(/4\. Manodopera/);
    expect(screen.queryByRole("button", { name: /Salva/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Importo manuale/ })).toBeDisabled();
    vaiA(/5\. Riepilogo/);
    expect(screen.getByRole("button", { name: "Torna al listino" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Salva e duplica" })).toBeNull();
    // Nel riepilogo ogni pulsante che porta a un'altra scheda dice «Vedi»: né «Modifica» né «Sistema», che promettono di cambiare.
    expect(screen.queryAllByRole("button", { name: /^(Modifica|Sistema)$/ })).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: "Vedi" }).length).toBeGreaterThanOrEqual(5);
  });

  it("anche con la griglia il passo Prezzo si consulta soltanto: la scelta del prezzo è spenta e «Salva» non c'è", () => {
    state.famiglia = famiglia({ modalita_prezzo_base: "griglia" });
    apri("/azienda/impostazioni/listino/famiglie/fam-1", true);
    vaiA(/2\. Prezzo/);
    expect(screen.getByText("Costo, sconti e ricarico di tutta la griglia")).toBeInTheDocument();
    expect(document.getElementById("grid-price-mode-vendita")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Salva/ })).toBeNull();
  });

  it("con la griglia chi può modificare ha il suo «Salva» nel passo Prezzo", () => {
    state.famiglia = famiglia({ modalita_prezzo_base: "griglia" });
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    vaiA(/2\. Prezzo/);
    expect(document.getElementById("grid-price-mode-vendita")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Salva" })).toBeEnabled();
  });

  it("chi può modificare ha i «Salva» (tutti con la stessa parola) e «Salva e duplica»", () => {
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    expect(screen.getByRole("button", { name: "Salva" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Duplica" })).toBeEnabled();
    vaiA(/2\. Prezzo/);
    expect(screen.getByRole("button", { name: "Salva" })).toBeEnabled();
    vaiA(/4\. Manodopera/);
    expect(screen.getByRole("button", { name: "Salva" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Importo manuale/ })).toBeEnabled();
    vaiA(/5\. Riepilogo/);
    expect(screen.getByRole("button", { name: "Salva e duplica" })).toBeEnabled();
    expect(screen.queryAllByRole("button", { name: "Vedi" })).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: "Modifica" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Sistema" }).length).toBeGreaterThan(0);
    expect(testo()).not.toMatch(/Salva (dati base|prezzo|manodopera|parametri)|Salva e crea copia/);
  });
});

describe("Editor del prodotto: si torna da dove si era partiti", () => {
  it("«Listino» riporta alla stessa area, tipologia e linea", () => {
    apri({ pathname: "/azienda/impostazioni/listino/famiglie/fam-1", state: { ritorno: "area=serramenti&tipologia=macro%3Am1&linea=cat%3Ac1" } });
    fireEvent.click(screen.getByRole("button", { name: "Listino" }));
    expect(screen.getByTestId("posizione")).toHaveTextContent("/azienda/impostazioni/listino?area=serramenti&tipologia=macro%3Am1&linea=cat%3Ac1");
  });

  it("senza indirizzo di partenza (link diretto) si torna al listino, come prima", () => {
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    fireEvent.click(screen.getByRole("button", { name: "Listino" }));
    expect(screen.getByTestId("posizione")).toHaveTextContent(/^\/azienda\/impostazioni\/listino$/);
  });

  it("anche da «Torna al listino» del riepilogo", () => {
    apri({ pathname: "/azienda/impostazioni/listino/famiglie/fam-1", state: { ritorno: "area=serramenti" } });
    vaiA(/5\. Riepilogo/);
    fireEvent.click(screen.getByRole("button", { name: "Torna al listino" }));
    expect(screen.getByTestId("posizione")).toHaveTextContent("/azienda/impostazioni/listino?area=serramenti");
  });

  it("un prodotto appena creato non perde l'indirizzo di partenza: «Torna al listino» ci riporta lì", async () => {
    state.famiglia = null;
    apri({ pathname: "/azienda/impostazioni/listino/famiglie/nuova", state: { ritorno: "area=serramenti&tipologia=macro%3Am1" } });
    fireEvent.click(document.getElementById("mod-pz")!);
    fireEvent.change(await screen.findByLabelText(/Nome del prodotto/), { target: { value: "Portoncino nuovo" } });
    fireEvent.click(screen.getByRole("button", { name: "Crea il prodotto" }));
    await waitFor(() => expect(state.crea).toHaveBeenCalledOnce());
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Prodotto creato"));
    // dopo la creazione l'editor è su /famiglie/fam-9 (qui il prodotto di prova non c'è: «non trovato»)
    fireEvent.click(await screen.findByRole("button", { name: "Torna al listino" }));
    expect(screen.getByTestId("posizione")).toHaveTextContent("/azienda/impostazioni/listino?area=serramenti&tipologia=macro%3Am1");
  });

  it("un prodotto duplicato non perde l'indirizzo di partenza: «Listino» ci riporta lì", async () => {
    apri({ pathname: "/azienda/impostazioni/listino/famiglie/fam-1", state: { ritorno: "area=serramenti&linea=cat%3Ac1" } });
    fireEvent.click(screen.getByRole("button", { name: "Duplica" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Prodotto duplicato"));
    expect(state.duplica).toHaveBeenCalledWith({ sourceId: "fam-1", newName: "Finestra 2 ante (copia)" });
    // si è davvero passati al prodotto nuovo, e solo da lì si torna indietro
    await waitFor(() => expect(screen.getByTestId("percorso")).toHaveTextContent("/azienda/impostazioni/listino/famiglie/fam-2"));
    fireEvent.click(screen.getByRole("button", { name: "Listino" }));
    expect(screen.getByTestId("posizione")).toHaveTextContent("/azienda/impostazioni/listino?area=serramenti&linea=cat%3Ac1");
  });

  it("con modifiche non salvate chiede conferma, e se si resta non si esce", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      apri({ pathname: "/azienda/impostazioni/listino/famiglie/fam-1", state: { ritorno: "area=serramenti" } });
      // L'editor fotografa i valori di partenza un attimo dopo il caricamento: le modifiche contano da lì.
      await new Promise((r) => setTimeout(r, 30));
      fireEvent.change(document.getElementById("f-nome")!, { target: { value: "Finestra 3 ante" } });
      await waitFor(() => expect(screen.getByText("Non salvato")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: "Listino" }));
      expect(conferma).toHaveBeenCalledOnce();
      expect(screen.queryByTestId("posizione")).toBeNull();
      conferma.mockReturnValue(true);
      fireEvent.click(screen.getByRole("button", { name: "Listino" }));
      expect(screen.getByTestId("posizione")).toHaveTextContent("/azienda/impostazioni/listino?area=serramenti");
    } finally {
      conferma.mockRestore();
    }
  });

  it("chiede conferma anche cliccando un link del menu (non solo ricaricando la pagina)", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      apri("/azienda/impostazioni/listino/famiglie/fam-1");
      await new Promise((r) => setTimeout(r, 30));
      const link = document.createElement("a");
      link.href = "/azienda/impostazioni/tariffe";
      link.textContent = "Manodopera e servizi";
      document.body.appendChild(link);
      link.click();
      expect(conferma).not.toHaveBeenCalled();
      fireEvent.change(document.getElementById("f-nome")!, { target: { value: "Finestra 3 ante" } });
      await waitFor(() => expect(screen.getByText("Non salvato")).toBeInTheDocument());
      link.click();
      expect(conferma).toHaveBeenCalledOnce();
      link.remove();
    } finally {
      conferma.mockRestore();
    }
  });
});

describe("Editor del prodotto: ogni gruppo di campi ha il suo nome", () => {
  const prezzoDaCosto = { prezzo_base_mode: "acquisto_markup", markup_tipo: "percentuale", markup_valore: 45, sconto_fornitore_1: 55, prezzo_base_acquisto: 1000 };

  it("passo 1: la foto è un gruppo con il nome della sezione", () => {
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    const foto = screen.getByRole("group", { name: "Foto del prodotto (facoltativa)" });
    expect(within(foto).getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("passo 2 (a pezzo): «Come ottieni il prezzo di vendita» è un gruppo di scelte con nome, e gli sconti del fornitore un gruppo", () => {
    state.famiglia = famiglia(prezzoDaCosto);
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    vaiA(/2\. Prezzo/);
    const scelta = screen.getByRole("radiogroup", { name: "Come ottieni il prezzo di vendita" });
    expect(scelta.getAttribute("aria-labelledby")).toBe("f-prezzo-mode-etichetta");
    expect(within(scelta).getAllByRole("radio")).toHaveLength(2);
    const sconti = screen.getByRole("group", { name: "Sconti del fornitore, uno dopo l'altro" });
    expect(sconti.getAttribute("aria-labelledby")).toBe("f-sconti-etichetta");
    expect(within(sconti).getAllByRole("spinbutton").length).toBeGreaterThanOrEqual(2);
  });

  it("passo 2 (griglia): lo stesso, con i suoi nomi", () => {
    state.famiglia = famiglia({ modalita_prezzo_base: "griglia", ...prezzoDaCosto });
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    vaiA(/2\. Prezzo/);
    const scelta = screen.getByRole("radiogroup", { name: "Come ottieni il prezzo di vendita" });
    expect(scelta.getAttribute("aria-labelledby")).toBe("grid-prezzo-mode-etichetta");
    const sconti = screen.getByRole("group", { name: "Sconti del fornitore, uno dopo l'altro" });
    expect(sconti.getAttribute("aria-labelledby")).toBe("grid-sconti-etichetta");
    expect(within(sconti).getAllByRole("spinbutton")).toHaveLength(2);
  });

  it("passo 4: le tre modalità della manodopera sono un gruppo con nome", () => {
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    vaiA(/4\. Manodopera/);
    const modalita = screen.getByRole("group", { name: "Modalità" });
    expect(within(modalita).getAllByRole("button")).toHaveLength(3);
  });
});

describe("Editor del prodotto: da telefono", () => {
  it("i cinque passi scorrono di lato invece di stringersi fino a sovrapporsi", () => {
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    for (const nome of [/1\. Dati base/, /2\. Prezzo/, /3\. Opzioni/, /4\. Manodopera/, /5\. Riepilogo/]) {
      expect(scheda(nome).className, String(nome)).toMatch(/\bshrink-0\b/);
    }
    expect(screen.getAllByRole("tablist")[0].className).toMatch(/overflow-x-auto/);
  });
});

describe("Editor del prodotto: «Gestisci» le tipologie", () => {
  it("lo vede l'amministratore", () => {
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    expect(screen.getByRole("button", { name: /Gestisci/ })).toBeInTheDocument();
  });

  it("non lo vede chi ha solo il permesso sul listino: creare e cambiare tipologie è dell'amministratore", () => {
    state.role = "staff";
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    expect(screen.queryByRole("button", { name: /Gestisci/ })).toBeNull();
  });

  it("la finestra si chiama «Tipologie e linee», non «Gestione categorie»", () => {
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    fireEvent.click(screen.getByRole("button", { name: /Gestisci/ }));
    return screen.findByRole("dialog").then((finestra) => {
      expect(within(finestra).getByText("Tipologie e linee")).toBeInTheDocument();
      expect(finestra.textContent).not.toMatch(/macrocategorie|Gestione categorie/);
    });
  });
});

describe("Editor del prodotto: parole del titolare", () => {
  it("il passo Prezzo parla di «ricarico» e di «prezzo di vendita», non di «markup»", () => {
    state.famiglia = famiglia({ prezzo_base_mode: "acquisto_markup", markup_tipo: "percentuale", markup_valore: 45, sconto_fornitore_1: 55, sconto_fornitore_2: 3, prezzo_base_acquisto: 1000 });
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    vaiA(/2\. Prezzo/);
    expect(testo()).toContain("Come ottieni il prezzo di vendita");
    expect(testo()).toContain("Costo + ricarico");
    expect(testo()).toContain("Come applichi il ricarico");
    expect(testo()).toContain("Ricarico (%)");
    expect(testo()).toContain("Secondo sconto (%), dopo il primo");
    expect(testo()).toContain("Prezzo di listino del fornitore, prima degli sconti (€)");
    expect(testo()).not.toMatch(/[Mm]arkup|cascata|LORDO|Modalità gestione prezzo/);
  });

  it("«IVA acquisto %» resta dove era (decisione D11 ancora aperta: nessuno la legge, ma togliere un campo lo decide Florin)", () => {
    state.famiglia = famiglia({ prezzo_base_mode: "acquisto_markup", markup_tipo: "percentuale", markup_valore: 45 });
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    vaiA(/2\. Prezzo/);
    expect(screen.getByText("IVA acquisto %")).toBeInTheDocument();
  });

  it("il riepilogo dice «Senza tipologia» e «Costo + ricarico»", () => {
    state.famiglia = famiglia({ macrocategoria_id: null, prezzo_base_mode: "acquisto_markup", markup_tipo: "percentuale", markup_valore: 45, prezzo_base_acquisto: 100 });
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    vaiA(/5\. Riepilogo/);
    expect(testo()).toContain("Senza tipologia: non compare nella scelta prodotti del preventivo.");
    expect(testo()).toContain("Costo + ricarico");
    expect(testo()).not.toMatch(/macrocategoria|Acquisto \+ markup|Tariffa aziendale/);
  });

  it("«Misura libera» dice la verità: il prezzo è a corpo, la misura serve a descrivere", () => {
    state.famiglia = null;
    apri("/azienda/impostazioni/listino/famiglie/nuova");
    expect(testo()).toContain("Il prezzo è quello a corpo; la misura la scrivi nel preventivo solo per descriverla.");
  });

  it("il passo Manodopera parla di «voci» di Manodopera e servizi, non di «tariffe aziendali»", () => {
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    vaiA(/4\. Manodopera/);
    expect(testo()).toContain("Voce di Manodopera e servizi");
    expect(testo()).not.toMatch(/[Tt]ariffa aziendale|Tariffe aziendali/);
  });
});

describe("Editor del prodotto: i colori del margine dicono da dove vengono", () => {
  const manuale = (costo: number, vendita: number) =>
    famiglia({ manodopera_modalita: "manuale", manodopera_costo_acquisto: costo, manodopera_prezzo_vendita: vendita });

  it("nel passo Manodopera la nota dice 20%, 10% e che non è il «Margine minimo» di Prezzo e margini", () => {
    state.famiglia = manuale(80, 100);
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    vaiA(/4\. Manodopera/);
    expect(testo()).toContain("Verde da 20% in su, giallo sotto, avviso sotto il 10%. Sono soglie fisse di questa pagina, non il «Margine minimo» di Prezzo e margini.");
  });

  it("il margine è verde da 20% in su e giallo sotto (riepilogo)", () => {
    for (const [costo, vendita, classe] of [[81, 100, "text-amber-600"], [80, 100, "text-emerald-600"]] as const) {
      cleanup();
      state.famiglia = manuale(costo, vendita);
      apri("/azienda/impostazioni/listino/famiglie/fam-1");
      vaiA(/5\. Riepilogo/);
      const margine = screen.getByText(/^€\s?\d+,\d{2}\s\(\d+\.\d%\)$|^\d+,\d{2}\s€\s\(\d+\.\d%\)$/);
      expect(margine.className, `${costo}/${vendita}`).toContain(classe);
    }
  });

  it("anche nel riepilogo c'è la nota sulle soglie", () => {
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    vaiA(/5\. Riepilogo/);
    expect(testo()).toContain("Sono soglie fisse di questa pagina");
  });
});

describe("Editor del prodotto: opzioni e griglia non mostrano più il testo del database", () => {
  // Questi due editor hanno decine di avvisi d'errore e un test che li provi uno a uno costerebbe più del danno: si guarda
  // che nessuno mostri più il messaggio grezzo («Failed to fetch», «duplicate key value…»), che passino tutti dal traduttore.
  for (const file of ["FamilyAxesEditor", "FamilyGridEditor"]) {
    it(`${file}: ogni avviso d'errore passa da messaggioErroreListino`, () => {
      const sorgente = readFileSync(resolve(process.cwd(), `src/components/listino/${file}.tsx`), "utf8");
      const avvisi = [...sorgente.matchAll(/toast\.error\([^;]*?\);/gs)].map((m) => m[0]);
      expect(avvisi.length).toBeGreaterThan(3);
      for (const avviso of avvisi) {
        expect(avviso, avviso).not.toMatch(/\.message|String\(err\)|instanceof Error/);
      }
      expect(sorgente).toContain('from "@/lib/listinoErrors"');
    });
  }
});

describe("Editor del prodotto: errori in italiano", () => {
  it("un permesso mancante salvando dice «Prodotto non salvato», senza il testo del database", async () => {
    state.update.mockRejectedValue({ code: "42501", message: 'new row violates row-level security policy for table "article_families"' });
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(state.error).toHaveBeenCalledWith("Prodotto non salvato", { description: "Non hai i permessi per questa operazione. Contatta l'amministratore." });
  });

  it("senza nome dice «Scrivi il nome del prodotto»", async () => {
    apri("/azienda/impostazioni/listino/famiglie/fam-1");
    fireEvent.change(document.getElementById("f-nome")!, { target: { value: "  " } });
    expect(screen.getByRole("button", { name: "Salva" })).toBeDisabled();
  });
});
