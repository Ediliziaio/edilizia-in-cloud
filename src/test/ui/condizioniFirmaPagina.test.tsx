/**
 * Impostazioni → Firma e condizioni → Condizioni (10/10/2026).
 *
 * La pagina diceva «Vale per tutti i preventivi della tua azienda», ma il preventivo fotovoltaico, gli ordini e i
 * documenti di cantiere si firmano con il codice e non leggono queste clausole. Aveva un secondo titolo di pagina sotto
 * quello del layout, campi spenti senza una frase che dicesse perché, un «Riprova» che ricaricava tutta la pagina, un
 * «Tipo di clausola» in vista che il cliente non vede, errori con il motivo tecnico e testi scritti a metà persi
 * cambiando pagina.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import SettingsCondizioniFirma from "@/pages/azienda/impostazioni/SettingsCondizioniFirma";

const state = vi.hoisted(() => ({
  permissions: { isAdmin: true, canEditSettingsPricing: true } as Record<string, boolean>,
  hook: null as unknown,
  salva: vi.fn(),
  elimina: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.permissions }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error, info: vi.fn() } }));
vi.mock("@/hooks/useQuoteClauses", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useQuoteClauses")>()),
  useQuoteClauses: () => state.hook,
}));

const clausola = (over: Record<string, unknown> = {}) => ({
  id: "c1", company_id: "company-1", category: "penalties", title: "Penale di ritardo", content: "Per ogni giorno di ritardo si applica una penale.",
  active: true, is_default: false, sort_order: 10, applicable_to: { vessatoria: true }, ...over,
});
function impostaHook(over: Record<string, unknown> = {}) {
  state.hook = {
    clausole: [], vessatorie: [clausola()], testiLegali: [], isLoading: false, error: null as unknown,
    salva: { mutateAsync: state.salva, isPending: false },
    elimina: { mutateAsync: state.elimina, isPending: false },
    ...over,
  };
}
let client: QueryClient;
function open() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><SettingsCondizioniFirma /></MemoryRouter>
    </QueryClientProvider>,
  );
}
const paginaChiede = (tipo = "beforeunload") => {
  const evento = new Event(tipo, { cancelable: true });
  window.dispatchEvent(evento);
  return evento.defaultPrevented;
};

beforeEach(() => {
  state.permissions = { isAdmin: true, canEditSettingsPricing: true };
  state.salva.mockReset().mockResolvedValue("c1");
  state.elimina.mockReset().mockResolvedValue(undefined);
  state.error.mockClear();
  state.success.mockClear();
  impostaHook();
});
afterEach(() => cleanup());

describe("Condizioni: a chi vale e a chi no", () => {
  it("non ha un secondo titolo di pagina: le due parti hanno un titolo di sezione", () => {
    open();
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Clausole da approvare a parte",
      "Testi mostrati al momento della firma",
    ]);
  });

  it("dice la verità: vale per i preventivi firmati dal link, non per fotovoltaico, ordini e documenti di cantiere", () => {
    open();
    const testo = document.body.textContent ?? "";
    expect(testo).toContain("quando firma un preventivo dal link che riceve");
    expect(testo).toContain("preventivo generico e per i preventivatori");
    expect(testo).toContain("Il preventivo fotovoltaico, gli ordini e i documenti di cantiere si firmano con il codice e non leggono queste clausole");
    expect(testo).not.toContain("Vale per tutti i preventivi della tua azienda");
    expect(screen.getByRole("link", { name: "Firma elettronica" })).toHaveAttribute("href", "/azienda/impostazioni/firma-elettronica#ripensamento");
  });
});

describe("Condizioni: chi può cosa", () => {
  it("chi può solo vedere: l'avviso dice perché, i campi sono spenti e non ci sono comandi di scrittura", () => {
    state.permissions = { isAdmin: false, canEditSettingsPricing: false };
    open();
    expect(screen.getByText(/Stai consultando le condizioni: le cambia chi ha il permesso «Listino & Prezzi» in modifica/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Titolo della clausola" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Testo della clausola" })).toBeDisabled();
    for (const nome of [/Aggiungi/, /Proponi clausole tipo/, /Elimina/, /Salva/]) {
      expect(screen.queryByRole("button", { name: nome }), String(nome)).toBeNull();
    }
  });

  it("chi può modificare non vede l'avviso e ha i comandi", () => {
    open();
    expect(screen.queryByText(/Stai consultando le condizioni/)).toBeNull();
    expect(screen.getByRole("button", { name: /Aggiungi/ })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Titolo della clausola" })).toBeEnabled();
  });
});

describe("Condizioni: ordine e finitura", () => {
  it("«Tipo di clausola» sta in «Altre opzioni», chiuso, e ha un'etichetta collegata", () => {
    open();
    const dettagli = screen.getByText("Altre opzioni").closest("details")!;
    expect(dettagli).not.toHaveAttribute("open");
    expect(within(dettagli).getByText("Tipo di clausola")).toHaveAttribute("for", dettagli.querySelector("button")!.id);
  });

  it("i quattro testi informativi hanno l'etichetta collegata al campo", () => {
    open();
    for (const titolo of ["Accettazione delle condizioni", "Informativa privacy", "Diritto di ripensamento", "Richiesta di iniziare subito"]) {
      expect(screen.getByRole("textbox", { name: titolo })).toBeInTheDocument();
    }
  });

  it("«Riprova» rilegge le clausole senza ricaricare tutta la pagina", () => {
    impostaHook({ error: new Error("Failed to fetch") });
    open();
    const rilegge = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(rilegge).toHaveBeenCalledWith({ queryKey: ["quote-clauses"] });
  });

  it("un errore di scrittura si legge in italiano, senza il motivo tecnico", async () => {
    state.salva.mockRejectedValue({ message: "Failed to fetch" });
    open();
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi/ }));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(state.error).toHaveBeenCalledWith("Non sono riuscito ad aggiungere la clausola", { description: "Connessione persa. Controlla la rete e riprova." });
  });
});

describe("Condizioni: il testo scritto e non salvato non si perde in silenzio", () => {
  it("una clausola modificata fa chiedere conferma prima di ricaricare", () => {
    open();
    expect(paginaChiede()).toBe(false);
    fireEvent.change(screen.getByRole("textbox", { name: "Titolo della clausola" }), { target: { value: "Penale diversa" } });
    expect(paginaChiede()).toBe(true);
  });

  it("anche un testo informativo scritto e non salvato", async () => {
    open();
    const campo = screen.getByRole("textbox", { name: "Informativa privacy" });
    fireEvent.change(campo, { target: { value: "La mia informativa" } });
    await waitFor(() => expect(paginaChiede()).toBe(true));
    fireEvent.change(campo, { target: { value: "" } });
    await waitFor(() => expect(paginaChiede()).toBe(false));
  });
});
