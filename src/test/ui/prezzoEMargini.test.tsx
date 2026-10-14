/**
 * Impostazioni → Modelli preventivi e contratti → Prezzo e margini (09/10/2026).
 *
 * La pagina era una pila di sette riquadri uguali: il prezzo scritto a mano stava al quarto posto, con la
 * spiegazione nascosta, e nessuno diceva a quali preventivi valessero gli interruttori (quasi tutti sono del
 * preventivo generico). Ora una sezione per argomento, il prezzo per primo, l'ambito scritto, un indice che porta
 * alla sezione e un indirizzo con l'àncora (`…/margini#prezzo`) che la apre già scorsa.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import SettingsMargini from "@/pages/azienda/settings/SettingsMargini";

const state = vi.hoisted(() => ({
  role: "company_admin" as string,
  permissions: { isAdmin: true, canEditSettingsPricing: true, canViewSettingsScontistica: true } as Record<string, boolean>,
  values: { margine_minimo_percentuale: 18, margine_target_default: 30, overhead_percentuale: 8, aggiungi_posa_automatica: true, pdf_mostra_prezzi_per_riga: true } as Record<string, unknown>,
  senzaRiga: false,
  writes: [] as { table: string; value: Record<string, unknown> }[],
  prezzoAMano: vi.fn(),
  success: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-1" }, role: state.role }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.permissions }));
vi.mock("@/hooks/usePrezzoFinaleAMano", () => ({
  usePrezzoFinaleAMano: () => ({ data: false, isLoading: false }),
  useImpostaPrezzoFinaleAMano: () => ({ mutate: state.prezzoAMano, isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: state.success } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  let write = false;
  const response = () => ({
    data: write ? { id: "row-1" } : table === "preventivo_impostazioni" ? (state.senzaRiga ? null : { ...state.values }) : [{ id: "c1", nome: "Ceramiche", margine_target_percentuale: 25 }],
    error: null as unknown,
  });
  const builder = {
    select: () => builder, eq: () => builder, order: () => builder,
    maybeSingle: async () => response(), single: async () => response(),
    upsert: (value: Record<string, unknown>) => { write = true; state.writes.push({ table, value }); return builder; },
    update: (value: Record<string, unknown>) => { write = true; state.writes.push({ table, value }); return builder; },
    then: (resolve: (value: ReturnType<typeof response>) => unknown) => Promise.resolve(response()).then(resolve),
  };
  return builder;
} } }));

const scorri = vi.fn();
function open(percorso = "/azienda/impostazioni/margini") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[percorso]}><SettingsMargini /></MemoryRouter>
    </QueryClientProvider>,
  );
}
async function loaded() { await waitFor(() => expect(screen.getByLabelText("Margine obiettivo %")).toHaveValue(30)); }
const sezione = (id: string) => document.getElementById(id) as HTMLElement;

beforeEach(() => {
  state.role = "company_admin";
  state.permissions = { isAdmin: true, canEditSettingsPricing: true, canViewSettingsScontistica: true };
  state.writes.length = 0;
  state.senzaRiga = false;
  state.values = { margine_minimo_percentuale: 18, margine_target_default: 30, overhead_percentuale: 8, aggiungi_posa_automatica: true, pdf_mostra_prezzi_per_riga: true };
  state.prezzoAMano.mockClear();
  state.success.mockClear();
  scorri.mockClear();
  Element.prototype.scrollIntoView = scorri;
});
afterEach(() => cleanup());

describe("Prezzo e margini: una sezione per argomento", () => {
  it("le sezioni stanno nell'ordine giusto, il prezzo per primo", async () => {
    open(); await loaded();
    const titoli = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titoli).toEqual(["Prezzo del preventivo", "Margini", "Posa, trasporto e smaltimento", "Numero del preventivo", "PDF e firma"]);
    expect(["prezzo", "margini", "posa-e-trasporto", "numerazione", "pdf-e-firma"].map((id) => sezione(id)?.tagName)).toEqual(Array(5).fill("SECTION"));
  });

  it("il prezzo scritto a mano è nella prima sezione, con il nome per il lettore di schermo, e si accende subito", async () => {
    open(); await loaded();
    const interruttore = within(sezione("prezzo")).getByRole("switch", { name: "Scrivi a mano il prezzo del preventivo" });
    fireEvent.click(interruttore);
    expect(state.prezzoAMano).toHaveBeenCalledOnce();
    expect(state.prezzoAMano.mock.calls[0][0]).toBe(true);
    // non passa dal «Salva modifiche»: la barra resta a riposo
    expect(screen.getByRole("status")).toHaveTextContent("Nessuna modifica da salvare");
  });

  it("dice a quali preventivi vale quello che c'è sotto", async () => {
    open(); await loaded();
    expect(within(sezione("prezzo")).getByText("Tutti i preventivatori")).toBeInTheDocument();
    for (const id of ["posa-e-trasporto", "numerazione", "pdf-e-firma"]) {
      expect(within(sezione(id)).getByText("Preventivo generico"), id).toBeInTheDocument();
    }
    expect(within(sezione("margini")).queryByText("Preventivo generico")).toBeNull();
  });

  it("«Visibilità margini» non c'è più: non faceva niente, chi vede i margini lo decidono i permessi", async () => {
    open(); await loaded();
    expect(screen.queryByText("Visibilità margini")).toBeNull();
    expect(screen.queryByLabelText("Mostra solo se margine ≥")).toBeNull();
  });

  it("ogni interruttore ha il suo nome e, cambiato, salva soltanto quel campo", async () => {
    open(); await loaded();
    fireEvent.click(screen.getByRole("switch", { name: "Aggiungi la posa automaticamente" }));
    expect(screen.getByRole("status")).toHaveTextContent("Modifiche non salvate");
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.writes).toEqual([{ table: "preventivo_impostazioni", value: { company_id: "company-1", aggiungi_posa_automatica: false } }]);
  });

  it("alla prima volta di un'azienda senza riga la colonna tolta dalla pagina si scrive vuota, come sempre: il database ci metterebbe 20 e la marginalità dei cantieri lo userebbe come margine obiettivo", async () => {
    state.senzaRiga = true;
    open();
    await waitFor(() => expect(screen.getByRole("switch", { name: "Aggiungi la posa automaticamente" })).toBeEnabled());
    fireEvent.click(screen.getByRole("switch", { name: "Aggiungi la posa automaticamente" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].value).toMatchObject({ company_id: "company-1", aggiungi_posa_automatica: true, soglia_margine_visibile: null });
  });

  it("con la riga già presente la colonna non si tocca", async () => {
    open(); await loaded();
    fireEvent.click(screen.getByRole("switch", { name: "Chiedi il trasporto" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.writes[0].value).not.toHaveProperty("soglia_margine_visibile");
  });

  it("i sei interruttori del PDF e della firma hanno una spiegazione collegata", async () => {
    open(); await loaded();
    const nomi = [
      "Mostra i prezzi di ogni riga", "Mostra solo il totale finale", "Mostra gli sconti applicati",
      "Mostra le immagini dei prodotti", "Allega le schede tecniche", "Firma elettronica sui preventivi",
    ];
    for (const nome of nomi) {
      const interruttore = within(sezione("pdf-e-firma")).getByRole("switch", { name: nome });
      const descrizione = interruttore.getAttribute("aria-describedby");
      expect(descrizione, nome).toBeTruthy();
      expect(document.getElementById(descrizione!)?.textContent?.length ?? 0, nome).toBeGreaterThan(10);
    }
  });
});

describe("Prezzo e margini: indice e àncore", () => {
  it("l'indice porta alla sezione e la evidenzia", async () => {
    open(); await loaded();
    fireEvent.click(screen.getByRole("link", { name: "PDF e firma" }));
    await waitFor(() => expect(scorri).toHaveBeenCalled());
    expect(scorri.mock.instances.at(-1)).toBe(sezione("pdf-e-firma"));
    await waitFor(() => expect(sezione("pdf-e-firma")).toHaveAttribute("data-evidenziata", "true"));
  });

  it("un indirizzo con l'àncora apre la pagina già scorsa alla sezione, a dati caricati", async () => {
    open("/azienda/impostazioni/margini#prezzo"); await loaded();
    await waitFor(() => expect(scorri).toHaveBeenCalled());
    expect(scorri.mock.instances[0]).toBe(sezione("prezzo"));
    expect(sezione("prezzo")).toHaveAttribute("data-evidenziata", "true");
  });

  it("toccando di nuovo la voce dell'indice già nell'indirizzo si scorre ancora (poteva essere stata lasciata più su)", async () => {
    open("/azienda/impostazioni/margini#prezzo"); await loaded();
    await waitFor(() => expect(scorri).toHaveBeenCalledTimes(1));
    scorri.mockClear();
    fireEvent.click(screen.getByRole("link", { name: "Prezzo" }));
    await waitFor(() => expect(scorri).toHaveBeenCalledTimes(1));
    expect(scorri.mock.instances[0]).toBe(sezione("prezzo"));
  });

  it("l'evidenziazione si spegne da sola dopo un paio di secondi", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      open("/azienda/impostazioni/margini#prezzo"); await loaded();
      await waitFor(() => expect(sezione("prezzo")).toHaveAttribute("data-evidenziata", "true"));
      await vi.advanceTimersByTimeAsync(3000);
      await waitFor(() => expect(sezione("prezzo")).not.toHaveAttribute("data-evidenziata"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("un'àncora che non esiste non rompe niente", async () => {
    open("/azienda/impostazioni/margini#non-esiste"); await loaded();
    expect(scorri).not.toHaveBeenCalled();
  });
});

describe("Prezzo e margini: chi può cosa", () => {
  it("sola lettura: tutti gli interruttori e il salvataggio spenti, con l'avviso", async () => {
    state.role = "staff";
    state.permissions = { isAdmin: false, canEditSettingsPricing: false, canViewSettingsScontistica: false };
    open();
    await waitFor(() => expect(screen.getByText(/Stai consultando le impostazioni/)).toBeInTheDocument());
    for (const interruttore of screen.getAllByRole("switch")) expect(interruttore).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salva modifiche" })).toBeDisabled();
  });

  it("il rimando a Sconti compare solo a chi può aprirli; quello alle Approvazioni c'è sempre", async () => {
    state.permissions = { isAdmin: false, canEditSettingsPricing: true, canViewSettingsScontistica: false };
    open(); await loaded();
    expect(screen.queryByRole("link", { name: "Apri Sconti" })).toBeNull();
    expect(screen.getByRole("link", { name: "Apri Approvazioni" })).toHaveAttribute("href", "/azienda/impostazioni/approvazioni");
  });

  it("i rimandi portano alle schede giuste", async () => {
    open(); await loaded();
    expect(screen.getByRole("link", { name: "Apri Sconti" })).toHaveAttribute("href", "/azienda/impostazioni/scontistica");
    expect(screen.getByRole("link", { name: "Modelli → Moduli" })).toHaveAttribute("href", "/azienda/impostazioni/template-preventivi?tab=moduli-vendita");
    expect(screen.getByRole("link", { name: "Firma e condizioni" })).toHaveAttribute("href", "/azienda/impostazioni/condizioni-firma");
  });
});


describe("Prezzo e margini: anteprime e annullamento", () => {
  it("la prova usa spese generali e margine sul prezzo, senza salvare dati", async () => {
    open(); await loaded();
    const esempio = screen.getByRole("region", { name: "Prova con un esempio" });
    expect(within(esempio).getByText("28%")).toBeInTheDocument();
    expect(within(esempio).getByText(/1542,86/)).toBeInTheDocument();
    fireEvent.change(within(esempio).getByLabelText("Prezzo di vendita €"), { target: { value: "2000" } });
    expect(within(esempio).getByText("46%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salva modifiche" })).toBeDisabled();
    expect(state.writes).toHaveLength(0);
  });

  it("annulla tutti i campi in bozza e ripristina le anteprime senza scritture", async () => {
    open(); await loaded();
    fireEvent.change(screen.getByLabelText("Margine obiettivo %"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Prefisso del numero preventivo"), { target: { value: "NEW" } });
    fireEvent.click(screen.getByRole("switch", { name: "Aggiungi la posa automaticamente" }));
    fireEvent.click(screen.getByRole("switch", { name: "Mostra solo il totale finale" }));
    expect(screen.getByRole("button", { name: "Salva modifiche" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Annulla modifiche" }));
    expect(screen.getByLabelText("Margine obiettivo %")).toHaveValue(30);
    expect(screen.getByLabelText("Prefisso del numero preventivo")).toHaveValue("OFF");
    expect(screen.getByRole("switch", { name: "Aggiungi la posa automaticamente" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Mostra solo il totale finale" })).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("Nessuna modifica da salvare");
    expect(state.writes).toHaveLength(0);
  });

  it("solo totale nasconde righe e immagini senza cancellare le preferenze dei prezzi", async () => {
    open(); await loaded();
    const anteprima = screen.getByRole("region", { name: "Cosa vede il cliente" });
    expect(within(anteprima).getByText("Prodotto di esempio")).toBeInTheDocument();
    const prezzi = screen.getByRole("switch", { name: "Mostra i prezzi di ogni riga" });
    expect(prezzi).toBeChecked();
    fireEvent.click(screen.getByRole("switch", { name: "Mostra solo il totale finale" }));
    expect(within(anteprima).queryByText("Prodotto di esempio")).toBeNull();
    expect(prezzi).toBeDisabled();
    expect(prezzi).toBeChecked();
    expect(screen.getByRole("switch", { name: "Mostra le immagini dei prodotti" })).toBeDisabled();
    fireEvent.click(screen.getByRole("switch", { name: "Mostra solo il totale finale" }));
    expect(prezzi).toBeEnabled();
    expect(prezzi).toBeChecked();
    expect(within(anteprima).getByText("Prodotto di esempio")).toBeInTheDocument();
    expect(state.writes).toHaveLength(0);
  });

  it("mostrare lo sconto cambia la visibilità, senza cambiare il totale di esempio", async () => {
    open(); await loaded();
    const anteprima = screen.getByRole("region", { name: "Cosa vede il cliente" });
    expect(within(anteprima).getByText("1.159,00 €")).toBeInTheDocument();
    expect(within(anteprima).queryByText("Sconto globale di esempio")).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Mostra gli sconti applicati" }));
    expect(within(anteprima).getByText("Sconto globale di esempio")).toBeInTheDocument();
    expect(within(anteprima).getByText("1.159,00 €")).toBeInTheDocument();
    expect(state.writes).toHaveLength(0);
  });

  it("salvare solo totale non riscrive la preferenza dei prezzi disabilitata", async () => {
    open(); await loaded();
    fireEvent.click(screen.getByRole("switch", { name: "Mostra solo il totale finale" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.writes).toEqual([{ table: "preventivo_impostazioni", value: { company_id: "company-1", pdf_mostra_solo_totale: true } }]);
  });

  it("rifiuta soglie invertite anche nella prova e non invia valori invalidi", async () => {
    open(); await loaded();
    fireEvent.change(screen.getByLabelText("Margine minimo %"), { target: { value: "80" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Il margine minimo non può superare");
    expect(screen.getByRole("region", { name: "Prova con un esempio" })).toHaveTextContent("Inserisci importi validi e soglie coerenti");
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    expect(state.writes).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Annulla modifiche" })).toBeEnabled();
  });

  it("la prova resta utilizzabile anche quando le impostazioni sono in sola lettura", async () => {
    state.role = "staff";
    state.permissions = { isAdmin: false, canEditSettingsPricing: false, canViewSettingsScontistica: false };
    open(); await loaded();
    const esempio = screen.getByRole("region", { name: "Prova con un esempio" });
    expect(within(esempio).getByLabelText("Costo di acquisto €")).toBeEnabled();
    fireEvent.change(within(esempio).getByLabelText("Costo di acquisto €"), { target: { value: "0" } });
    expect(within(esempio).getByText("100%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salva modifiche" })).toBeDisabled();
    expect(state.writes).toHaveLength(0);
  });

  it("annulla una bozza anche per un'azienda ancora senza impostazioni", async () => {
    state.senzaRiga = true;
    open();
    await waitFor(() => expect(screen.getByRole("switch", { name: "Aggiungi la posa automaticamente" })).toBeEnabled());
    fireEvent.click(screen.getByRole("switch", { name: "Aggiungi la posa automaticamente" }));
    fireEvent.change(screen.getByLabelText("Margine obiettivo %"), { target: { value: "35" } });
    fireEvent.click(screen.getByRole("button", { name: "Annulla modifiche" }));
    expect(screen.getByRole("switch", { name: "Aggiungi la posa automaticamente" })).not.toBeChecked();
    expect(screen.getByLabelText("Margine obiettivo %")).toHaveValue(null);
    expect(state.writes).toHaveLength(0);
  });
});


describe("Impostazioni effettive: aziende nuove e valori ereditati", () => {
  it("una preferenza PDF vuota mostra il comportamento effettivo del preventivatore", async () => {
    state.values = { ...state.values, pdf_mostra_prezzi_per_riga: null, pdf_mostra_immagini: null, firma_digitale_abilitata: null };
    open(); await loaded();
    expect(screen.getByRole("switch", { name: "Mostra i prezzi di ogni riga" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Mostra le immagini dei prodotti" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Firma elettronica sui preventivi" })).toBeChecked();
    expect(state.writes).toHaveLength(0);
  });

  it("il primo salvataggio conserva tutte le scelte visibili invece di attivare i default SQL nascosti", async () => {
    state.senzaRiga = true;
    open();
    await waitFor(() => expect(screen.getByRole("switch", { name: "Chiedi il trasporto" })).toBeEnabled());
    fireEvent.click(screen.getByRole("switch", { name: "Chiedi il trasporto" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.writes[0].value).toMatchObject({
      company_id: "company-1", overhead_percentuale: null, margine_minimo_percentuale: null, margine_target_default: null,
      aggiungi_posa_automatica: false, chiedi_piano_installazione: false, chiedi_smaltimento: false, chiedi_trasporto: true,
      pdf_mostra_prezzi_per_riga: true, pdf_mostra_immagini: true, firma_digitale_abilitata: true,
    });
  });

  it("valida le soglie effettive anche quando l'obiettivo è lasciato vuoto", async () => {
    open(); await loaded();
    fireEvent.change(screen.getByLabelText("Margine minimo %"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Margine obiettivo %"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    expect(state.writes).toHaveLength(0);
    expect(screen.getByRole("alert")).toHaveTextContent("Il margine minimo non può superare");
  });
});
