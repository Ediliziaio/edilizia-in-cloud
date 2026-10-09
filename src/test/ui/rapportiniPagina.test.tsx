// src/test/ui/rapportiniPagina.test.tsx
// Impostazioni → Rapportini e presenze: il salvataggio resta in vista e si può annullare, uscire con una scelta cambiata
// chiede conferma, chi può solo leggere trova la frase giusta, un rifiuto del database arriva in italiano.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RegoleCampo } from "@/lib/campo/regoleCampo";

const state = vi.hoisted(() => ({
  role: "company_admin", modifica: false, caricamentoPermessi: false, azienda: "azienda-1",
  regole: { chiCompila: "ognuno", oreDalle: "capo", avvisoScostamentoMinuti: null } as unknown as RegoleCampo,
  sceltaFatta: true, errore: false, letturaIn: false,
  mutate: vi.fn(), pending: false, successo: vi.fn(), erroreToast: vi.fn(), ricarica: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: state.successo, error: state.erroreToast } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: state.role, effectiveCompany: { id: state.azienda } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isLoading: state.caricamentoPermessi, canEditSettingsOrders: state.modifica }) }));
vi.mock("@/hooks/useRegoleCampo", () => ({
  useRegoleAzienda: () => ({
    data: state.errore || state.letturaIn ? undefined : { regole: state.regole, sceltaFatta: state.sceltaFatta },
    isLoading: state.letturaIn, isError: state.errore, refetch: state.ricarica,
  }),
  useSalvaRegoleAzienda: () => ({ mutate: state.mutate, isPending: state.pending }),
}));

import RegoleCampoConfig from "@/components/settings/RegoleCampoConfig";
import { confermaNavigazioneImpostazioni } from "@/hooks/useSettingsDraftGuard";

const apri = () => render(<MemoryRouter><RegoleCampoConfig /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    role: "company_admin", modifica: false, caricamentoPermessi: false, azienda: "azienda-1",
    regole: { chiCompila: "ognuno", oreDalle: "capo", avvisoScostamentoMinuti: null },
    sceltaFatta: true, errore: false, letturaIn: false, pending: false,
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Rapportini e presenze: i riquadri", () => {
  it("nessun titolo di primo livello (c'è quello del layout, su telefono compreso); tre domande e «In pratica» sono titoli di secondo livello", () => {
    apri();
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Chi scrive il rapportino del cantiere?",
      "Da dove vengono le ore di ognuno?",
      "Avviso se le ore non tornano",
      "In pratica, con queste scelte",
    ]);
  });

  it("«Qualunque sia la tua scelta» non è più un riquadro: è l'ultima riga di «In pratica»", () => {
    apri();
    expect(screen.queryByText("Qualunque sia la tua scelta:")).toBeNull();
    const inPratica = document.getElementById("in-pratica") as HTMLElement;
    const righe = within(inPratica).getAllByRole("listitem");
    expect(righe).toHaveLength(4);
    expect(righe[3]).toHaveTextContent("Una persona non si conta mai due volte nello stesso giorno e cantiere");
  });

  it("i gruppi di scelte hanno un nome per chi usa il lettore di schermo", () => {
    apri();
    expect(screen.getByRole("radiogroup", { name: "Chi scrive il rapportino del cantiere?" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Da dove vengono le ore di ognuno?" })).toBeInTheDocument();
  });

  it("rimanda all'altra regola dell'app di cantiere, che sta in un'altra pagina", () => {
    apri();
    expect(screen.getByRole("link", { name: "chi può spuntare le sottofasi" })).toHaveAttribute("href", "/azienda/impostazioni/modelli-fasi#regole");
  });

  it("senza scelte fatte dice che tutto funziona come sempre; con le scelte fatte non lo dice", () => {
    state.sceltaFatta = false;
    const { unmount } = apri();
    expect(screen.getByText(/Non hai ancora scelto: per ora tutto funziona come sempre/)).toBeInTheDocument();
    unmount();
    state.sceltaFatta = true;
    apri();
    expect(screen.queryByText(/Non hai ancora scelto/)).toBeNull();
  });
});

describe("Rapportini e presenze: salvare senza perdere le scelte", () => {
  it("il pulsante di salvataggio sta in una barra che resta in vista, in cima, e si accende solo con una modifica", () => {
    apri();
    const salva = screen.getByRole("button", { name: "Salva modifiche" });
    expect(salva.closest(".sticky")).not.toBeNull();
    expect(salva).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Lo scrive il capocantiere/ }));
    expect(salva).toBeEnabled();
    expect(screen.getByText("Modifiche non salvate")).toBeInTheDocument();
  });

  it("«Salva modifiche» manda le tre scelte e dice «Impostazioni salvate»", () => {
    state.mutate.mockImplementation((_regole: RegoleCampo, opzioni: { onSuccess: () => void }) => opzioni.onSuccess());
    apri();
    fireEvent.click(screen.getByRole("radio", { name: /Dalle timbrature/ }));
    fireEvent.click(screen.getByRole("switch", { name: /Avvisa il capo quando le ore scritte sono diverse/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    expect(state.mutate).toHaveBeenCalledWith(
      { chiCompila: "ognuno", oreDalle: "timbrature", avvisoScostamentoMinuti: 30 },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    expect(state.successo).toHaveBeenCalledWith("Impostazioni salvate");
    expect(screen.getByRole("button", { name: "Salva modifiche" })).toBeDisabled();
  });

  it("«Annulla le modifiche» riporta le scelte com'erano", () => {
    apri();
    fireEvent.click(screen.getByRole("radio", { name: /Lo scrive il capocantiere/ }));
    expect(screen.getByRole("radio", { name: /Lo scrive il capocantiere/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Annulla le modifiche" }));
    expect(screen.getByRole("radio", { name: /Ognuno il suo/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Salva modifiche" })).toBeDisabled();
  });

  it("con una scelta cambiata e non salvata uscire dalla pagina chiede conferma; senza modifiche no", () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    apri();
    expect(confermaNavigazioneImpostazioni()).toBe(true);
    expect(conferma).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: /Lo scrive il capocantiere/ }));
    expect(confermaNavigazioneImpostazioni()).toBe(false);
    expect(conferma).toHaveBeenCalledTimes(1);
  });

  it("un rifiuto per permesso arriva in italiano, con il nome del permesso che serve", () => {
    state.mutate.mockImplementation((_r: RegoleCampo, opzioni: { onError: (e: unknown) => void }) => opzioni.onError({ code: "42501", message: "Non puoi cambiare queste impostazioni." }));
    apri();
    fireEvent.click(screen.getByRole("radio", { name: /Lo scrive il capocantiere/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    expect(state.erroreToast).toHaveBeenCalledWith("Non hai il permesso di cambiare queste scelte: le cambia chi ha «Configurazione Ordini» in modifica.");
    // le scelte restano com'erano state cambiate: non si perdono
    expect(screen.getByRole("radio", { name: /Lo scrive il capocantiere/ })).toBeChecked();
  });

  it("una scelta non valida mostra la frase del database (è già in italiano); un errore qualunque no", () => {
    state.mutate.mockImplementationOnce((_r: RegoleCampo, opzioni: { onError: (e: unknown) => void }) => opzioni.onError({ code: "22023", message: "Lo scostamento va da 5 minuti a 8 ore." }));
    apri();
    fireEvent.click(screen.getByRole("radio", { name: /Lo scrive il capocantiere/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    expect(state.erroreToast).toHaveBeenLastCalledWith("Lo scostamento va da 5 minuti a 8 ore.");
    state.mutate.mockImplementationOnce((_r: RegoleCampo, opzioni: { onError: (e: unknown) => void }) => opzioni.onError({ code: "XX000", message: "connection reset by peer" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    expect(state.erroreToast).toHaveBeenLastCalledWith("Non sono riuscito a salvare. Riprova tra poco.");
  });

  it("la bozza è di una sola azienda: cambiando azienda (super amministratore) quella dell'altra non si vede", () => {
    const { rerender } = apri();
    fireEvent.click(screen.getByRole("radio", { name: /Lo scrive il capocantiere/ }));
    expect(screen.getByRole("radio", { name: /Lo scrive il capocantiere/ })).toBeChecked();
    state.azienda = "azienda-2";
    rerender(<MemoryRouter><RegoleCampoConfig /></MemoryRouter>);
    expect(screen.getByRole("radio", { name: /Ognuno il suo/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Salva modifiche" })).toBeDisabled();
  });

  it("la soglia dell'avviso compare solo con l'avviso acceso", () => {
    apri();
    expect(screen.queryByRole("combobox", { name: "Differenza che fa scattare l’avviso" })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: /Avvisa il capo quando le ore scritte sono diverse/ }));
    expect(screen.getByRole("combobox", { name: "Differenza che fa scattare l’avviso" })).toBeInTheDocument();
  });
});

describe("Rapportini e presenze: sola lettura onesta", () => {
  beforeEach(() => { state.role = "staff"; });

  it("dice chi può cambiare le scelte (non «solo un amministratore») e non ha comandi di scrittura", () => {
    apri();
    expect(screen.getByText(/Stai consultando queste impostazioni: le cambia chi ha «Configurazione Ordini» in modifica\./)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/solo un amministratore/);
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
    expect(screen.getByRole("switch", { name: /Avvisa il capo/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Salva modifiche" })).toBeNull();
  });

  it("chi ha «Configurazione Ordini» in modifica può cambiare", () => {
    state.modifica = true;
    apri();
    expect(screen.queryByText(/Stai consultando queste impostazioni/)).toBeNull();
    expect(screen.getByRole("radio", { name: /Lo scrive il capocantiere/ })).toBeEnabled();
  });

  it("mentre i permessi si caricano non dice niente", () => {
    state.caricamentoPermessi = true;
    apri();
    expect(screen.queryByText(/Stai consultando queste impostazioni/)).toBeNull();
  });
});

describe("Rapportini e presenze: la lettura", () => {
  it("se non si riesce a leggere dice «Riprova»", () => {
    state.errore = true;
    apri();
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a leggere le impostazioni.");
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.ricarica).toHaveBeenCalledTimes(1);
  });
});
