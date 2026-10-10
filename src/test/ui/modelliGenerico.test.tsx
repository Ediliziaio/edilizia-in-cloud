/**
 * Impostazioni → Modelli di preventivo → «Preventivo generico» (10/10/2026).
 *
 * La scheda era una pila di riquadri uguali: un secondo titolo di pagina (h1) sotto quello del layout, un
 * riquadro «Il flusso delle offerte» con tre numeri e tre passi, la parola «template» ovunque, 14 riquadri
 * nell'editor senza un indice, 3 etichette collegate su 51, errori col messaggio grezzo del database e
 * pulsanti attivi anche per chi può solo consultare. Qui si fissa com'è ora.
 *
 * Il database e il resto dell'app sono finti; la pagina, l'indice, la protezione della bozza e gli avvisi sono veri.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter, useLocation } from "react-router-dom";
import SettingsQuoteTemplates from "@/pages/azienda/settings/SettingsQuoteTemplates";
import { confermaNavigazioneImpostazioni } from "@/hooks/useSettingsDraftGuard";
import { TESTO_SOLA_LETTURA } from "@/pages/azienda/settings/SettingsQuoteTemplates/constants";
import { DEFAULT_TEMPLATE, type QuoteTemplate } from "@/types/quoteTemplate";

const state = vi.hoisted(() => ({
  role: "company_admin" as string,
  permissions: { isAdmin: true, isLoading: false, canEditSettingsPricing: true, canViewSettingsPricing: true } as Record<string, boolean>,
  templates: [] as unknown[],
  fetchError: null as unknown,
  isLoading: false,
  upsert: vi.fn(),
  remove: vi.fn(),
  errore: vi.fn(),
  successo: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    role: state.role,
    effectiveCompany: { id: "company-1", name: "Impresa Rossi", email: "info@rossi.it", phone: "045 111222", brand_primary_color: null as unknown },
  }),
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.permissions }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useQuoteTemplates", () => ({
  useQuoteTemplates: () => ({
    templates: state.templates,
    defaultTemplate: null as unknown,
    isLoading: state.isLoading,
    fetchError: state.fetchError,
    upsertTemplate: { mutateAsync: state.upsert, isPending: false },
    deleteTemplate: { mutateAsync: state.remove, isPending: false },
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (...argomenti: unknown[]) => state.upload(...argomenti),
        getPublicUrl: (percorso: string) => ({ data: { publicUrl: `https://cdn.test/${percorso}` } }),
        createSignedUrl: async () => ({ data: { signedUrl: "https://cdn.test/firmato" } }),
      }),
    },
    functions: { invoke: async () => ({ data: null as unknown, error: null as unknown }) },
  },
}));
vi.mock("sonner", () => ({ toast: { error: state.errore, success: state.successo } }));
vi.mock("@/components/quotes/QuoteTemplatePreview", () => ({ QuoteTemplatePreview: () => <div data-testid="anteprima-pdf" /> }));
// Il vero editor di testo ricco è TipTap: qui basta un campo di testo che rispetta «sola lettura».
vi.mock("@/components/ui/rich-text-editor-safe", () => ({
  RichTextEditorSafe: ({ value, onChange, placeholder, readOnly }: { value?: string | null; onChange: (v: string) => void; placeholder?: string; readOnly?: boolean }) => (
    <textarea data-testid="testo-ricco" aria-label={placeholder ?? "Testo"} value={value ?? ""} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("@/pages/azienda/settings/SettingsQuoteTemplates/ModuliVenditaPanel", () => ({ ModuliVenditaPanel: () => <p>Pannello Moduli</p> }));

const modello = (id: string, nome: string, extra: Partial<QuoteTemplate> = {}): QuoteTemplate =>
  ({
    ...DEFAULT_TEMPLATE,
    id,
    company_id: "company-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    name: nome,
    is_active: true,
    ...extra,
  }) as QuoteTemplate;

function metti(...modelli: QuoteTemplate[]) {
  state.templates = modelli;
}
function modelliDiBase() {
  metti(
    modello("o1", "Offerta standard", { is_default: true, show_cover_image: true }),
    modello("o2", "Offerta premium", { is_default: false }),
    modello("c1", "Copertina verde", { kind: "copertina", is_default: false, description: null }),
    modello("k1", "Condizioni complete", { kind: "condizioni", is_default: false, description: null }),
    modello("p1", "Finestra standard", { kind: "prodotto", is_default: false, description: null, product_specs: [{ label: "Spessore", value: "3 cm" }] }),
  );
}

function Indirizzo() {
  const l = useLocation();
  return <span data-testid="indirizzo">{`${l.pathname}${l.search}${l.hash}`}</span>;
}
function Pagina() {
  return (
    <>
      <nav>
        <Link to="/azienda/impostazioni/margini">Prezzo e margini</Link>
      </nav>
      <SettingsQuoteTemplates />
      <Indirizzo />
    </>
  );
}
function apri(percorso = "/azienda/impostazioni/template-preventivi") {
  return render(
    <MemoryRouter initialEntries={[percorso]}>
      <Pagina />
    </MemoryRouter>,
  );
}
const indirizzo = () => screen.getByTestId("indirizzo").textContent;
const apriModello = (nome: string) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^(Modifica|Apri) ${nome}$`) }));
const bottone = (nome: string | RegExp) => screen.getByRole("button", { name: nome });

/** Tutto quello che un titolare legge: il testo, più segnaposto, suggerimenti, nomi per il lettore di schermo e testi alternativi. */
function testoVisibile(): string {
  // L'indirizzo che il test mostra a se stesso (…/template-preventivi) non lo legge nessuno.
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

const scorri = vi.fn();

beforeEach(() => {
  state.role = "company_admin";
  state.permissions = { isAdmin: true, isLoading: false, canEditSettingsPricing: true, canViewSettingsPricing: true };
  state.fetchError = null;
  state.isLoading = false;
  state.upsert.mockReset().mockResolvedValue({ id: "nuovo" });
  state.remove.mockReset().mockResolvedValue(undefined);
  state.errore.mockReset();
  state.successo.mockReset();
  state.upload.mockReset().mockResolvedValue({ error: null as unknown });
  scorri.mockReset();
  Element.prototype.scrollIntoView = scorri;
  modelliDiBase();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Preventivo generico: l'elenco", () => {
  it("la pagina apre ancora sulla scheda «Preventivo generico» (decisione D10 ancora aperta: non si cambia)", () => {
    apri();
    expect(screen.getByRole("tab", { name: "Preventivo generico", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Moduli/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.queryByText("Pannello Moduli")).toBeNull();
  });

  it("il titolo della scheda è un h2: il titolo di pagina (h1) lo mette il layout", () => {
    apri();
    expect(document.querySelectorAll("h1")).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 2, name: "Offerte complete" })).toBeInTheDocument();
  });

  it("niente riquadro «Il flusso delle offerte», niente riga descrittiva del tipo, niente conteggio ripetuto", () => {
    apri();
    for (const testo of ["Il flusso delle offerte", "Come funziona", "Suggerimento", "Azione rapida", "Totali", "Componenti"]) {
      expect(screen.queryByText(testo), testo).toBeNull();
    }
    // il numero delle offerte sta in una sola riga: sulla linguetta
    expect(screen.queryByText("2 offerte")).toBeNull();
    expect(screen.getByRole("button", { name: /^Offerte complete/ })).toHaveTextContent("Offerte complete2");
    expect(screen.queryByText(/disponibil/)).toBeNull();
  });

  it("«Nuovo modello», «Altri blocchi» e le linguette senza emoji", () => {
    apri();
    expect(bottone("Nuovo modello")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nuovo template/ })).toBeNull();
    const linguetta = screen.getByRole("button", { name: /^Offerte complete/ });
    expect(linguetta.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    fireEvent.click(bottone(/^Altri blocchi/));
    expect(bottone(/^Nascondi gli altri blocchi/)).toBeInTheDocument();
    for (const tipo of ["Copertina", "Condizioni e termini legali", "Scheda prodotto", "Sezione libera"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${tipo}`) }).textContent, tipo).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    expect(screen.queryByText(/componenti avanzati/i)).toBeNull();
  });

  it("il modello in uso per i nuovi preventivi porta «Predefinito», non «Default»", () => {
    apri();
    expect(screen.getByText("Predefinito")).toBeInTheDocument();
    expect(screen.queryByText("Default")).toBeNull();
  });

  it("nei testi che si leggono non c'è più la parola «template»", () => {
    apri();
    expect(testoVisibile()).not.toMatch(/template/i);
  });

  it("senza modelli di un tipo, lo stato vuoto parla con il genere giusto", () => {
    metti(modello("o1", "Offerta standard", { is_default: true }));
    apri();
    fireEvent.click(bottone(/^Altri blocchi/));
    fireEvent.click(screen.getByRole("button", { name: /^Copertina/ }));
    expect(screen.getByText("Nessuna copertina ancora")).toBeInTheDocument();
    expect(bottone("Crea la prima copertina")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Scheda prodotto/ }));
    expect(screen.getByText("Nessuna scheda prodotto ancora")).toBeInTheDocument();
    expect(bottone("Crea la prima scheda prodotto")).toBeInTheDocument();
    expect(screen.queryByText(/Nessun (copertina|scheda|sezione|offerta)/)).toBeNull();
    expect(testoVisibile()).not.toMatch(/template/i);
  });

  it("le due linguette: da telefono resta «Moduli», da computer c'è anche l'elenco tra parentesi", () => {
    apri();
    const moduli = screen.getByRole("tab", { name: /^Moduli/ });
    const parentesi = within(moduli).getByText("(serramenti, fotovoltaico…)", { exact: false });
    expect(parentesi).toHaveClass("max-sm:hidden");
    expect(moduli.textContent).toBe("Moduli (serramenti, fotovoltaico…)");
  });
});

describe("Preventivo generico: la finestra «Nuovo modello»", () => {
  it("parla di offerte complete e di blocchi, non di componenti avanzati né di template", async () => {
    apri();
    fireEvent.click(bottone("Nuovo modello"));
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).getByText("Crea un'offerta completa")).toBeInTheDocument();
    expect(within(finestra).getByText("I blocchi separati servono solo per contenuti condivisi tra più offerte.")).toBeInTheDocument();
    fireEvent.click(within(finestra).getByRole("button", { name: "Altri blocchi" }));
    expect(within(finestra).getByText("Aggiungi un blocco")).toBeInTheDocument();
    expect(within(finestra).getByRole("button", { name: /Torna alle offerte complete/ })).toBeInTheDocument();
    expect(finestra.textContent).not.toMatch(/template|componente avanzato|componenti avanzati/i);
  });
});

describe("Preventivo generico: l'editor", () => {
  it("i riquadri hanno i nomi nuovi, nell'ordine della pagina", () => {
    apri();
    apriModello("Offerta standard");
    const titoli = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent ?? "");
    expect(titoli.slice(0, -1)).toEqual([
      "Stili pronti", "Nome e descrizione", "Componi l'offerta", "Layout", "Logo", "Palette colori", "Tipografia",
      "Tabella voci", "Margini del foglio", "Cosa mostrare nel PDF", "Copertina personalizzata", "Testi",
      "Condizioni standard", "Condizioni contrattuali e termini legali",
    ]);
    expect(titoli.at(-1)).toContain("Anteprima Offerta");
    for (const vecchio of ["Design assistant", "Informazioni Base", "Margini pagina", "Elementi da Mostrare", "Testi Personalizzabili", "Watermark"]) {
      expect(screen.queryByText(vecchio, { exact: false }), vecchio).toBeNull();
    }
    expect(document.querySelectorAll("h1")).toHaveLength(0);
  });

  it("le frasi nuove: usare il modello per i nuovi preventivi, la scritta in filigrana, il refuso corretto", () => {
    apri();
    apriModello("Offerta standard");
    expect(screen.getByRole("switch", { name: "Usa questo modello per i nuovi preventivi" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Scritta in filigrana" })).not.toBeChecked();
    expect(bottone("Salva e usa per i nuovi preventivi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Salva e usa default/ })).toBeNull();
    expect(screen.getByPlaceholderText(/ristrutturazioni, serramenti/)).toBeInTheDocument();
    expect(testoVisibile()).not.toMatch(/ritrutturazioni/);
    expect(testoVisibile()).not.toMatch(/template/i);
  });

  it("«Salva e usa per i nuovi preventivi» salva il modello come predefinito e lo dice con la parola «modello»", async () => {
    apri();
    apriModello("Offerta premium");
    fireEvent.click(bottone("Salva e usa per i nuovi preventivi"));
    await waitFor(() => expect(state.successo).toHaveBeenCalledWith("Modello salvato: lo useranno i nuovi preventivi"));
    expect(state.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: "o2", is_default: true }));
  });

  it("senza nome il modello non si salva e il messaggio parla del modello", async () => {
    apri();
    apriModello("Offerta premium");
    fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "  " } });
    fireEvent.click(bottone("Salva bozza"));
    await waitFor(() => expect(state.errore).toHaveBeenCalledWith("Scrivi il nome del modello"));
    expect(state.upsert).not.toHaveBeenCalled();
  });

  it("l'editor di ogni tipo di blocco non ha parole inglesi dei vecchi testi", () => {
    apri();
    fireEvent.click(bottone(/^Altri blocchi/));
    for (const [tipo, nome] of [
      ["Copertina", "Copertina verde"], ["Condizioni e termini legali", "Condizioni complete"], ["Scheda prodotto", "Finestra standard"],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${tipo}`) }));
      apriModello(nome);
      expect(testoVisibile(), tipo).not.toMatch(/template|merge tag|page break|linkabile|\bspecs?\b/i);
      expect(document.querySelectorAll("h1"), tipo).toHaveLength(0);
      fireEvent.click(bottone(/Indietro/));
    }
  });
});

describe("Preventivo generico: un blocco nuovo", () => {
  it("nasce con un nome in italiano corretto, non «Nuovo Copertina» né «Nuovo Scheda prodotto»", () => {
    metti(modello("o1", "Offerta standard", { is_default: true }));
    apri();
    fireEvent.click(bottone(/^Altri blocchi/));
    for (const [tipo, pulsante, nome] of [
      ["Copertina", "Crea la prima copertina", "Nuova copertina"],
      ["Condizioni e termini legali", "Crea il primo blocco di condizioni", "Nuovo blocco di condizioni"],
      ["Scheda prodotto", "Crea la prima scheda prodotto", "Nuova scheda prodotto"],
      ["Sezione libera", "Crea la prima sezione", "Nuova sezione libera"],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${tipo}`) }));
      fireEvent.click(bottone(pulsante));
      expect(screen.getByLabelText("Nome *"), tipo).toHaveValue(nome);
      fireEvent.click(bottone(/Indietro/));
    }
  });
});

describe("Preventivo generico: l'indice dell'editor", () => {
  const voci = ["Informazioni", "Logo e colori", "Tabella", "Cosa mostrare", "Copertina", "Testi", "Condizioni"];
  const indice = () => screen.getByRole("navigation", { name: "Vai a una sezione" });

  it("c'è un indice con una voce per ogni gruppo di riquadri, e ogni voce porta a un riquadro che esiste", () => {
    apri();
    apriModello("Offerta standard");
    const link = within(indice()).getAllByRole("link");
    expect(link.map((a) => a.textContent)).toEqual(voci);
    for (const a of link) {
      const id = a.getAttribute("href")!.slice(1);
      expect(document.getElementById(id), id).not.toBeNull();
    }
  });

  it("ogni voce porta al suo riquadro e lo evidenzia, senza toccare l'indirizzo della pagina", async () => {
    apri("/azienda/impostazioni/template-preventivi?tab=documenti");
    apriModello("Offerta standard");
    expect(indirizzo()).toBe("/azienda/impostazioni/template-preventivi?tab=documenti");
    for (const voce of voci) {
      scorri.mockClear();
      fireEvent.click(within(indice()).getByRole("link", { name: voce }));
      const id = within(indice()).getByRole("link", { name: voce }).getAttribute("href")!.slice(1);
      expect(scorri, voce).toHaveBeenCalledTimes(1);
      expect(scorri.mock.instances[0], voce).toBe(document.getElementById(id));
      await waitFor(() => expect(document.getElementById(id), voce).toHaveAttribute("data-evidenziata", "true"));
      // l'indirizzo non cambia: niente #…, niente ?tab=… perso (decide quale scheda è aperta)
      expect(indirizzo(), voce).toBe("/azienda/impostazioni/template-preventivi?tab=documenti");
    }
    expect(screen.getByRole("tab", { name: "Preventivo generico", selected: true })).toBeInTheDocument();
  });

  it("l'evidenziazione si spegne da sola dopo un paio di secondi", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    apri();
    apriModello("Offerta standard");
    fireEvent.click(within(indice()).getByRole("link", { name: "Condizioni" }));
    const riquadro = document.getElementById("modello-condizioni")!;
    expect(riquadro).toHaveAttribute("data-evidenziata", "true");
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(riquadro).not.toHaveAttribute("data-evidenziata");
  });

  it("l'indice c'è solo per il preventivo: i blocchi hanno pochi riquadri e non ne hanno bisogno", () => {
    apri();
    fireEvent.click(bottone(/^Altri blocchi/));
    fireEvent.click(screen.getByRole("button", { name: /^Copertina/ }));
    apriModello("Copertina verde");
    expect(screen.queryByRole("navigation", { name: "Vai a una sezione" })).toBeNull();
  });
});

describe("Preventivo generico: chi può solo consultare", () => {
  beforeEach(() => {
    state.role = "staff";
    state.permissions = { isAdmin: false, isLoading: false, canEditSettingsPricing: false, canViewSettingsPricing: true };
  });

  it("in testa alla scheda c'è la frase che spiega perché, la stessa di «Prezzo e margini»", () => {
    apri();
    expect(screen.getByRole("alert")).toHaveTextContent("Stai consultando i modelli: li modifica chi ha il permesso «Listino & Prezzi» in modifica.");
    expect(TESTO_SOLA_LETTURA).toBe("Stai consultando i modelli: li modifica chi ha il permesso «Listino & Prezzi» in modifica.");
  });

  it("«Duplica» ed «Elimina» sono spenti e rimandano alla frase; il modello si apre per guardarlo", () => {
    apri();
    expect(screen.queryByRole("button", { name: "Nuovo modello" })).toBeNull();
    const duplica = screen.getByRole("button", { name: "Duplica Offerta premium" });
    const elimina = screen.getByRole("button", { name: "Elimina il modello Offerta premium" });
    for (const pulsante of [duplica, elimina]) {
      expect(pulsante).toBeDisabled();
      expect(pulsante).toHaveAccessibleDescription(/Stai consultando i modelli/);
    }
    expect(screen.queryByRole("button", { name: /^Modifica / })).toBeNull();
    expect(screen.getByRole("button", { name: "Apri Offerta premium" })).toBeEnabled();
  });

  it("aperto, il modello non si cambia: campi, interruttori e salvataggi spenti, e non parte nessuna scrittura", () => {
    apri();
    apriModello("Offerta premium");
    expect(screen.getByText("Sola lettura")).toBeInTheDocument();
    const campi = [
      ...screen.getAllByRole("textbox"), ...screen.getAllByRole("switch"), ...screen.getAllByRole("slider"), ...screen.getAllByRole("combobox"),
    ];
    expect(campi.length).toBeGreaterThan(20);
    for (const campo of campi) expect(campo, campo.getAttribute("id") ?? campo.getAttribute("aria-label") ?? campo.tagName).toBeDisabled();
    for (const testoRicco of screen.getAllByTestId("testo-ricco")) expect(testoRicco).toHaveAttribute("readonly");
    for (const nome of ["Salva bozza", "Salva e usa per i nuovi preventivi", "Salva e torna ai modelli"]) {
      expect(bottone(nome), nome).toBeDisabled();
      expect(bottone(nome), nome).toHaveAccessibleDescription(/Stai consultando i modelli/);
    }
    // si può tornare indietro
    expect(bottone("Torna ai modelli")).toBeEnabled();
    expect(state.upsert).not.toHaveBeenCalled();
  });

  it("chi può modificare non vede l'avviso e ha tutti i pulsanti accesi", () => {
    state.role = "company_admin";
    state.permissions = { isAdmin: true, isLoading: false, canEditSettingsPricing: true, canViewSettingsPricing: true };
    apri();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Duplica Offerta premium" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Elimina il modello Offerta premium" })).toBeEnabled();
    apriModello("Offerta premium");
    expect(screen.getByLabelText("Nome *")).toBeEnabled();
    expect(bottone("Salva bozza")).toBeEnabled();
  });

  it("mentre i permessi si caricano l'avviso non compare (poi scomparirebbe)", () => {
    state.permissions = { isAdmin: false, isLoading: true, canEditSettingsPricing: false, canViewSettingsPricing: false };
    apri();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Preventivo generico: gli errori si leggono in italiano", () => {
  it("un salvataggio rifiutato dal database dice che non si hanno i permessi, non «row-level security»", async () => {
    state.upsert.mockRejectedValue({ message: 'new row violates row-level security policy for table "quote_templates"', code: "42501" });
    apri();
    apriModello("Offerta premium");
    fireEvent.click(bottone("Salva bozza"));
    await waitFor(() => expect(state.errore).toHaveBeenCalledOnce());
    expect(state.errore).toHaveBeenCalledWith("Modello non salvato", { description: "Non hai i permessi per questa operazione. Contatta l'amministratore." });
  });

  it("senza rete dice di controllare la connessione", async () => {
    state.upsert.mockRejectedValue(new TypeError("Failed to fetch"));
    apri();
    apriModello("Offerta premium");
    fireEvent.click(bottone("Salva bozza"));
    await waitFor(() => expect(state.errore).toHaveBeenCalledOnce());
    expect(state.errore).toHaveBeenCalledWith("Modello non salvato", { description: "Connessione persa. Controlla la rete e riprova." });
  });

  it("un errore sconosciuto non mostra il testo grezzo: c'è una frase di ripiego", async () => {
    state.upsert.mockRejectedValue(new Error("PGRST999 internal weirdness"));
    apri();
    apriModello("Offerta premium");
    fireEvent.click(bottone("Salva bozza"));
    await waitFor(() => expect(state.errore).toHaveBeenCalledOnce());
    expect(state.errore).toHaveBeenCalledWith("Modello non salvato", { description: "Non sono riuscito a salvarlo. Riprova tra poco." });
  });

  it("le frasi che l'app scrive già in italiano arrivano com'è", async () => {
    state.upsert.mockRejectedValue(new Error("I modelli li cambia chi può modificare il listino"));
    apri();
    apriModello("Offerta premium");
    fireEvent.click(bottone("Salva bozza"));
    await waitFor(() => expect(state.errore).toHaveBeenCalledOnce());
    expect(state.errore).toHaveBeenCalledWith("Modello non salvato", { description: "I modelli li cambia chi può modificare il listino" });
  });

  it("un logo che non si carica dice cosa non è andato, senza il testo del sistema", async () => {
    state.upload.mockResolvedValue({ error: new Error("Bucket not found") });
    apri();
    apriModello("Offerta premium");
    const file = new File(["x"], "logo.png", { type: "image/png" });
    const scelta = screen.getByText("Scegli file").closest("label")!.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.change(scelta, { target: { files: [file] } });
    await waitFor(() => expect(state.errore).toHaveBeenCalledOnce());
    expect(state.errore).toHaveBeenCalledWith("Logo non caricato", { description: "Non sono riuscito a caricarlo. Riprova tra poco." });
  });

  it("se i modelli non si leggono, la pagina lo dice con parole semplici", () => {
    state.fetchError = new Error("JWT expired");
    apri();
    const avviso = screen.getByText("Non riesco a leggere i modelli").closest("[role=alert]")!;
    expect(avviso).toHaveTextContent("Sessione scaduta. Accedi di nuovo per continuare.");
    expect(avviso.textContent).not.toMatch(/JWT/);
    expect(testoVisibile()).not.toMatch(/template/i);
  });

  it("l'eliminazione rifiutata si dice in italiano e il modello resta", async () => {
    state.remove.mockRejectedValue({ message: "permission denied for table quote_templates", code: "42501" });
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Elimina il modello Offerta premium" }));
    const finestra = await screen.findByRole("alertdialog");
    expect(within(finestra).getByText("Elimina il modello")).toBeInTheDocument();
    expect(finestra.textContent).not.toMatch(/template/i);
    fireEvent.click(within(finestra).getByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(state.errore).toHaveBeenCalledOnce());
    expect(state.errore).toHaveBeenCalledWith("Modello non eliminato", { description: "Non hai i permessi per questa operazione. Contatta l'amministratore." });
  });
});

describe("Preventivo generico: eliminare e scaricare l'anteprima", () => {
  it("eliminare un modello lo dice con la parola «modello» e la finestra non parla di «template»", async () => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Elimina il modello Offerta premium" }));
    const finestra = await screen.findByRole("alertdialog");
    expect(finestra).toHaveTextContent("Stai eliminando Offerta premium. Il modello verrà disattivato e non sarà più disponibile per nuove offerte.");
    fireEvent.click(within(finestra).getByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(state.successo).toHaveBeenCalledWith("Modello eliminato"));
    expect(state.remove).toHaveBeenCalledWith("o2");
  });

  it("se l'anteprima in PDF non si prepara lo dice in italiano", async () => {
    apri();
    apriModello("Offerta premium");
    fireEvent.click(bottone("Scarica PDF Anteprima"));
    await waitFor(() => expect(state.errore).toHaveBeenCalledOnce());
    expect(state.errore).toHaveBeenCalledWith("Anteprima PDF non riuscita", { description: "Non sono riuscito a preparare il PDF. Riprova tra poco." });
  });
});

describe("Preventivo generico: ogni campo ha il suo nome", () => {
  const controlli = () => [
    ...Array.from(document.querySelectorAll<HTMLElement>("input:not([type=hidden]):not([type=file]):not([type=checkbox]), textarea, select")),
    ...screen.getAllByRole("switch"),
  ];

  it("nel preventivo ogni campo, cursore e interruttore ha un nome (prima: 3 su 51)", () => {
    apri();
    apriModello("Offerta standard");
    const tutti = controlli();
    expect(tutti.length).toBeGreaterThan(25);
    for (const campo of tutti) {
      expect(campo, `${campo.tagName} ${campo.getAttribute("id") ?? campo.getAttribute("placeholder") ?? ""}`).toHaveAccessibleName();
    }
  });

  it("i nomi sono quelli che si leggono accanto al campo", () => {
    apri();
    apriModello("Offerta standard");
    expect(screen.getByLabelText("Nome *")).toHaveValue("Offerta standard");
    expect(screen.getByLabelText("Descrizione (interna)")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Mostra logo nel PDF" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Righe alternate (zebra)" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Numero offerta" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Dati azienda emittente" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Mostra copertina" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Allega il modulo di recesso" })).not.toBeChecked();
    expect(screen.getByRole("slider", { name: "Dimensione del testo" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Scala titoli" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Margine laterale" })).toBeInTheDocument();
    expect(screen.getByLabelText("Titolo copertina")).toBeInTheDocument();
    expect(screen.getByLabelText("Tagline (sotto titolo offerta)")).toBeInTheDocument();
    expect(screen.getByLabelText("Testo a piè di pagina")).toBeInTheDocument();
    expect(screen.getByLabelText("Coordinate bancarie (piè di pagina)")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Chi firma per l'impresa")).toBeInTheDocument();
  });

  it("i gruppi di pulsanti (posizione del logo, densità, bordi, caratteri) hanno un nome e dicono quale è scelto", () => {
    apri();
    apriModello("Offerta standard");
    for (const nome of ["Posizione", "Dimensione", "Densità righe", "Bordi tabella", "Carattere", "Altezza riga", "Palette pronte"]) {
      expect(screen.getByRole("group", { name: nome }), nome).toBeInTheDocument();
    }
    expect(within(screen.getByRole("group", { name: "Posizione" })).getByRole("button", { name: "Sinistra" })).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByRole("group", { name: "Posizione" })).getByRole("button", { name: "Destra" })).toHaveAttribute("aria-pressed", "false");
  });

  it("i selettori dei blocchi e le specifiche di una scheda prodotto hanno un nome", () => {
    apri();
    apriModello("Offerta standard");
    expect(screen.getByRole("combobox", { name: "🎨 Copertina" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "📜 Condizioni e termini legali" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "🛒 Schede prodotto da includere" })).toBeInTheDocument();
    fireEvent.click(bottone(/Indietro/));
    fireEvent.click(bottone(/^Altri blocchi/));
    fireEvent.click(screen.getByRole("button", { name: /^Scheda prodotto/ }));
    apriModello("Finestra standard");
    expect(screen.getByLabelText("Descrizione breve")).toBeInTheDocument();
    expect(screen.getByLabelText("Prezzo indicativo (€)")).toBeInTheDocument();
    expect(screen.getByLabelText("Specifica 1: etichetta")).toHaveValue("Spessore");
    expect(screen.getByLabelText("Specifica 1: valore")).toHaveValue("3 cm");
    expect(screen.getByRole("button", { name: "Togli la specifica 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aggiungi specifica" })).toBeInTheDocument();
  });

  it("ogni tipo di blocco ha tutti i campi con un nome", () => {
    apri();
    fireEvent.click(bottone(/^Altri blocchi/));
    for (const [tipo, nome] of [
      ["Copertina", "Copertina verde"], ["Condizioni e termini legali", "Condizioni complete"], ["Scheda prodotto", "Finestra standard"],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${tipo}`) }));
      apriModello(nome);
      for (const campo of controlli()) {
        expect(campo, `${tipo}: ${campo.tagName} ${campo.getAttribute("id") ?? campo.getAttribute("placeholder") ?? ""}`).toHaveAccessibleName();
      }
      fireEvent.click(bottone(/Indietro/));
    }
  });
});

describe("Preventivo generico: telefono (375 px)", () => {
  // jsdom non disegna: qui si fissano le scelte di layout che tengono i campi dentro lo schermo.
  // Quanto sia davvero comodo lo si guarda a occhio.
  it("la barra dell'editor va a capo e i due salvataggi stanno uno sopra l'altro (il testo lungo non entra in mezza riga e usciva tagliato)", () => {
    apri();
    apriModello("Offerta premium");
    const barra = bottone("Indietro").closest(".sticky")!;
    expect(barra).toHaveClass("flex-wrap");
    const salvataggi = bottone("Salva bozza").parentElement!;
    expect(salvataggi).toBe(bottone("Salva e usa per i nuovi preventivi").parentElement);
    expect(salvataggi).toHaveClass("max-sm:flex-col", "max-sm:items-stretch", "max-sm:w-full");
    // due pulsanti in colonna non devono dividersi la larghezza con `flex-1`
    expect(bottone("Salva bozza")).not.toHaveClass("max-sm:flex-1");
    expect(bottone("Salva e usa per i nuovi preventivi")).not.toHaveClass("max-sm:flex-1");
    // il tipo ("Offerta") e il nome stanno in una riga sola solo da computer
    expect(within(barra as HTMLElement).getByText("Offerta").closest("span.hidden")).toHaveClass("sm:flex");
  });

  it("la colonna dei campi ha una sua altezza e scorre da sola solo da computer: da telefono scorre con la pagina", () => {
    apri();
    apriModello("Offerta premium");
    const colonna = document.getElementById("modello-informazioni")!.closest("fieldset")!.parentElement!;
    expect(colonna).toHaveClass("lg:overflow-auto", "lg:max-h-[calc(100vh-200px)]", "min-w-0");
    expect(colonna).not.toHaveClass("overflow-auto");
    expect(colonna).not.toHaveClass("max-h-[calc(100vh-200px)]");
  });

  it("cursori, selettori e righe con interruttore sono alti 44 px (11) da telefono", () => {
    apri();
    apriModello("Offerta premium");
    for (const nome of ["Dimensione del testo", "Scala titoli", "Margine laterale"]) {
      expect(screen.getByRole("slider", { name: nome }), nome).toHaveClass("max-sm:h-11");
    }
    expect(screen.getByRole("combobox", { name: "🎨 Copertina" })).toHaveClass("max-sm:h-11");
    expect(screen.getByRole("switch", { name: "Numero offerta" }).parentElement).toHaveClass("min-h-11");
    expect(screen.getByText("Scegli file").closest("label")).toHaveClass("max-sm:min-h-11");
  });
});

describe("Preventivo generico: le modifiche non salvate non si perdono", () => {
  it("con una modifica in sospeso un link della pagina (le schede del gruppo, il menu) chiede conferma; rifiutando si resta", () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    apri("/azienda/impostazioni/template-preventivi?tab=documenti");
    apriModello("Offerta premium");
    fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "Offerta premium 2" } });
    fireEvent.click(screen.getByRole("link", { name: "Prezzo e margini" }));
    expect(conferma).toHaveBeenCalledOnce();
    expect(conferma.mock.calls[0][0]).toMatch(/modifiche non salvate/i);
    expect(indirizzo()).toBe("/azienda/impostazioni/template-preventivi?tab=documenti");
    expect(screen.getByLabelText("Nome *")).toHaveValue("Offerta premium 2");
  });

  it("dicendo di sì si esce", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    apri();
    apriModello("Offerta premium");
    fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "Offerta premium 2" } });
    fireEvent.click(screen.getByRole("link", { name: "Prezzo e margini" }));
    expect(indirizzo()).toBe("/azienda/impostazioni/margini");
  });

  it("senza modifiche non chiede niente", () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    apri();
    apriModello("Offerta premium");
    fireEvent.click(screen.getByRole("link", { name: "Prezzo e margini" }));
    expect(conferma).not.toHaveBeenCalled();
    expect(indirizzo()).toBe("/azienda/impostazioni/margini");
  });

  it("anche la ricerca delle impostazioni (⌘K) e il ricaricamento della pagina lo sanno", () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    apri();
    apriModello("Offerta premium");
    expect(confermaNavigazioneImpostazioni()).toBe(true);
    fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "Offerta premium 2" } });
    expect(confermaNavigazioneImpostazioni()).toBe(false);
    expect(conferma).toHaveBeenCalledOnce();
    const chiusura = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(chiusura);
    expect(chiusura.defaultPrevented).toBe(true);
  });

  it("dopo il salvataggio la protezione si toglie", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    apri();
    apriModello("Offerta premium");
    fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "Offerta premium 2" } });
    fireEvent.click(bottone("Salva bozza"));
    await waitFor(() => expect(state.successo).toHaveBeenCalledWith("Bozza salvata"));
    fireEvent.click(screen.getByRole("link", { name: "Prezzo e margini" }));
    expect(conferma).not.toHaveBeenCalled();
    expect(indirizzo()).toBe("/azienda/impostazioni/margini");
  });
});
