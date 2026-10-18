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
      "Fino a quanti giorni indietro dall’app?",
      "In pratica, con queste scelte",
      "Completa l’organizzazione del cantiere",
    ]);
  });

  it("«Qualunque sia la tua scelta» non è più un riquadro: è l'ultima riga di «In pratica»", () => {
    apri();
    expect(screen.queryByText("Qualunque sia la tua scelta:")).toBeNull();
    const inPratica = document.getElementById("in-pratica") as HTMLElement;
    const righe = within(inPratica).getAllByRole("listitem", { hidden: true });
    expect(righe).toHaveLength(6);
    expect(righe[3]).toHaveTextContent("oggi o il giorno dopo");
    expect(righe[4]).toHaveTextContent("il giornaliero personale non le ripropone");
    expect(righe[5]).toHaveTextContent("L’approvazione resta all’ufficio");
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


describe("Rapportini: anteprima fedele e preferenze conservate", () => {
  it("il cambio di scenario è solo una prova e non accende il salvataggio", () => {
    state.regole = { chiCompila: "capo", oreDalle: "timbrature", avvisoScostamentoMinuti: 30 };
    apri();
    expect(screen.getByRole("region", { name: "Cosa fa l’operaio" })).toHaveTextContent("Timbra entrata e uscita");
    fireEvent.click(screen.getByRole("button", { name: "Senza responsabile" }));
    expect(screen.getByRole("region", { name: "Cosa fa l’operaio" })).toHaveTextContent("Compila il proprio giornaliero");
    expect(screen.queryByRole("region", { name: "Cosa fa il responsabile" })).toBeNull();
    expect(screen.getByRole("button", { name: "Salva modifiche" })).toBeDisabled();
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("la bozza aggiorna subito la prova e annullare la ripristina", () => {
    apri();
    fireEvent.click(screen.getByRole("radio", { name: /Lo scrive il capocantiere/ }));
    expect(screen.getByText("Anteprima della bozza")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Cosa fa l’operaio" })).toHaveTextContent("Timbra entrata e uscita");
    fireEvent.click(screen.getByRole("button", { name: "Annulla le modifiche" }));
    expect(screen.getByRole("region", { name: "Cosa fa l’operaio" })).toHaveTextContent("Compila il proprio giornaliero");
  });
  it("il flusso misto conserva ore e soglia, ma non presenta come attivi i controlli di squadra", () => {
    state.regole = { chiCompila: "capo", oreDalle: "timbrature", avvisoScostamentoMinuti: 45 };
    apri();
    fireEvent.click(screen.getByRole("radio", { name: /Il racconto al capo, le ore a ognuno/ }));
    expect(screen.getByRole("radio", { name: /Dalle timbrature/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Dalle timbrature/ })).toBeDisabled();
    expect(screen.getByRole("switch")).toBeChecked();
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Differenza che fa scattare l’avviso" })).toBeDisabled();
    expect(screen.queryByRole("region", { name: "Esempio del controllo ore" })).toBeNull();
    expect(screen.getByRole("region", { name: "Cosa fa il responsabile" })).toHaveTextContent("Conferma solo le proprie ore");
    fireEvent.click(screen.getByRole("radio", { name: /Lo scrive il capocantiere/ }));
    expect(screen.getByRole("combobox", { name: "Differenza che fa scattare l’avviso" })).toHaveTextContent("45 min");
    expect(screen.getByRole("switch")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Salva modifiche" })).toBeDisabled();
  });
  it("mostra una soglia personalizzata già salvata e non genera un avviso sul limite esatto", () => {
    state.regole = { chiCompila: "capo", oreDalle: "capo", avvisoScostamentoMinuti: 20 };
    const { unmount } = apri();
    expect(screen.getByRole("combobox", { name: "Differenza che fa scattare l’avviso" })).toHaveTextContent("20 min");
    expect(screen.getByRole("region", { name: "Esempio del controllo ore" })).toHaveTextContent("Il capo vede un avviso");
    unmount();
    state.regole.avvisoScostamentoMinuti = 60;
    apri();
    expect(screen.getByRole("region", { name: "Esempio del controllo ore" })).toHaveTextContent("Nessun avviso");
  });
  it("durante il salvataggio blocca tutti i comandi che cambiano le regole", () => {
    state.pending = true;
    apri();
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salva modifiche" })).toBeDisabled();
  });
  it("senza azienda non mostra regole apparentemente modificabili", () => {
    state.azienda = "";
    apri();
    expect(screen.getByRole("alert")).toHaveTextContent("Seleziona un’azienda");
    expect(screen.queryByRole("button", { name: "Salva modifiche" })).toBeNull();
  });
  it("i rimandi arrivano alle risorse canoniche e seguono i permessi", () => {
    const { unmount } = apri();
    expect(screen.getByRole("link", { name: /Operai e squadre/ })).toHaveAttribute("href", "/azienda/manodopera?tab=operai&vista=squadre");
    expect(screen.getByRole("link", { name: /Commesse e rapportini/ })).toHaveAttribute("href", "/azienda/ordini");
    unmount();
    state.role = "staff";
    apri();
    expect(screen.queryByRole("link", { name: /Operai e squadre/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Commesse e rapportini/ })).toBeNull();
  });
  it("l’ancora nell’indirizzo apre e mette in evidenza il controllo delle ore", () => {
    render(<MemoryRouter initialEntries={["/azienda/impostazioni/rapportini-cantiere#avviso"]}><RegoleCampoConfig /></MemoryRouter>);
    expect(document.getElementById("avviso")).toHaveAttribute("data-evidenziata", "true");
  });
});
