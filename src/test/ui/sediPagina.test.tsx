/**
 * Impostazioni → Sedi (09/10/2026).
 *
 * - Un solo titolo di primo livello (lo mette il layout): sotto i 768 px la pagina ne aggiungeva un secondo.
 * - La testata diceva una cosa vera a metà («timbrature e geofencing HR»): il controllo GPS lavora su un'altra
 *   lista, quella del Personale. Ora lo dice e porta lì.
 * - Contatori per tipo, ricerca e filtri solo da cinque sedi in su: un'azienda ne ha in media una.
 * - Latitudine e longitudine non si chiedono più (nessuna sede le compila; le legge solo la copia verso il
 *   Personale), ma una sede che le ha già le tiene quando si modifica.
 * - Ogni campo del modulo ha la sua etichetta, i colori hanno un nome, gli stati sono «Attiva» / «Non attiva».
 *
 * NON toccato (decisione di Florin): il limite di sedi del piano, il suo messaggio e chi può modificare.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import SettingsSedi from "@/pages/azienda/settings/SettingsSedi";

const sede = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `sede-${n}`, nome: `Sede ${n}`, tipo: n % 2 ? "showroom" : "magazzino", indirizzo: `Via Roma ${n}`, citta: "Milano", cap: "20100", provincia: "MI",
  regione: "Lombardia", nazione: "Italia", telefono: null as string | null, email: null as string | null, responsabile_sede: null as string | null,
  orari_apertura: null as string | null, note_interne: null as string | null, lat: null as number | null, lng: null as number | null, colore: "#1E3A5F", attiva: true, principale: n === 1, ...extra,
});

const stato = vi.hoisted(() => ({
  sedi: [] as Record<string, unknown>[],
  puoModificare: true,
  chiamate: [] as { nome: string; body: Record<string, unknown> }[],
  rispostaFunzione: null as null | { error: unknown },
  errore: vi.fn(),
  successo: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "az-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: stato.puoModificare, canEditSettingsOrders: stato.puoModificare }) }));
vi.mock("@/hooks/useSediAnalytics", () => ({
  useSediList: () => ({ data: stato.sedi, isLoading: false }),
  useSediAnalytics: () => ({ data: undefined as unknown }),
}));
vi.mock("sonner", () => ({ toast: { success: stato.successo, error: stato.errore } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: async (nome: string, opzioni: { body: Record<string, unknown> }) => {
        stato.chiamate.push({ nome, body: opzioni.body });
        return stato.rispostaFunzione ?? { data: { sede: {}, error: null as unknown }, error: null as unknown };
      },
    },
  },
}));

// Radix Select in jsdom
Object.assign(Element.prototype, { hasPointerCapture: () => false, releasePointerCapture: () => {}, setPointerCapture: () => {}, scrollIntoView: () => {} });

function apri() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><SettingsSedi /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  stato.sedi = [sede(1), sede(2)];
  stato.puoModificare = true;
  stato.chiamate.length = 0;
  stato.rispostaFunzione = null;
  stato.errore.mockClear();
  stato.successo.mockClear();
});
afterEach(cleanup);

describe("Sedi: la testata", () => {
  it("non ha nessun titolo di primo livello: lo mette il layout", () => {
    apri();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByText("Sedi Aziendali")).toBeNull();
  });

  it("dice com'è: dividono lead, preventivi e costi; il GPS delle timbrature è nel Personale, con il rimando", () => {
    apri();
    expect(screen.getByText(/servono a dividere lead, preventivi e costi per sede/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Personale → Sedi" })).toHaveAttribute("href", "/azienda/personale?tab=sedi");
    expect(screen.queryByText(/geofencing|analytics|segmentazione/i)).toBeNull();
  });
});

describe("Sedi: meno riquadri con poche sedi", () => {
  it("con una o due sedi c'è solo l'elenco", () => {
    apri();
    expect(screen.queryByLabelText("Cerca una sede")).toBeNull();
    expect(screen.queryByText("Tutte")).toBeNull();
    expect(screen.getByText("Sede 1")).toBeInTheDocument();
    expect(screen.getByText("Sede 2")).toBeInTheDocument();
  });

  it("anche con quattro", () => {
    stato.sedi = [1, 2, 3, 4].map((n) => sede(n));
    apri();
    expect(screen.queryByLabelText("Cerca una sede")).toBeNull();
    expect(screen.queryByText("Tutte")).toBeNull();
  });

  it("da cinque in su tornano contatori, ricerca e filtri (e il filtro dice «non attive»)", () => {
    stato.sedi = [1, 2, 3, 4, 5].map((n) => sede(n));
    apri();
    expect(screen.getByLabelText("Cerca una sede")).toBeInTheDocument();
    expect(screen.getByText("Tutte")).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("combobox"), { button: 0, ctrlKey: false, pointerType: "mouse" });
    expect(screen.getByRole("option", { name: "Solo non attive" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Solo disattive" })).toBeNull();
  });
});

describe("Sedi: stati e azioni in parole", () => {
  it("«Attiva» / «Non attiva» al posto di «Disattiva» che sembrava un comando", () => {
    stato.sedi = [sede(1), sede(2, { attiva: false })];
    apri();
    expect(screen.getByText("Non attiva", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Sede Sede 1 attiva" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Sede Sede 2 attiva" })).not.toBeChecked();
    expect(screen.queryByText("Disattiva")).toBeNull();
  });

  it("l'azione per cambiare la sede principale dice cosa fa", () => {
    apri();
    expect(screen.getByRole("button", { name: "Imposta Sede 2 come sede principale" })).toHaveTextContent("Rendi principale");
  });
});

describe("Sedi: chi può solo guardare", () => {
  it("vede l'avviso e i pulsanti spenti", () => {
    stato.puoModificare = false;
    apri();
    expect(screen.getByText(/Stai consultando le sedi: puoi vederle ma non modificarle/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuova sede" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Modifica sede Sede 1" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Sede Sede 1 attiva" })).toBeDisabled();
  });

  it("chi può modificare non vede l'avviso", () => {
    apri();
    expect(screen.queryByText(/Stai consultando le sedi/)).toBeNull();
  });
});

describe("Sedi: il modulo", () => {
  async function apriNuova() {
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Nuova sede" }));
    return screen.findByRole("dialog");
  }

  it("ogni campo ha la sua etichetta, e latitudine e longitudine non si chiedono più", async () => {
    const finestra = await apriNuova();
    for (const nome of ["Nome sede *", "Indirizzo", "Città", "CAP", "Provincia", "Regione", "Nazione", "Telefono sede", "Email sede", "Responsabile sede", "Orari apertura", "Note interne"]) {
      expect(within(finestra).getByLabelText(nome), nome).toBeInTheDocument();
    }
    expect(within(finestra).getByRole("combobox", { name: "Tipo *" })).toBeInTheDocument();
    expect(within(finestra).queryByLabelText(/Latitudine|Longitudine/)).toBeNull();
    expect(within(finestra).queryByText(/Latitudine|Longitudine/)).toBeNull();
  });

  it("i colori hanno un nome e dicono quale è scelto", async () => {
    const finestra = await apriNuova();
    const scelto = within(finestra).getByRole("button", { name: "Colore #1E3A5F" });
    expect(scelto).toHaveAttribute("aria-pressed", "true");
    expect(within(finestra).getByRole("button", { name: "Colore #F97316" })).toHaveAttribute("aria-pressed", "false");
    expect(within(finestra).getByLabelText("Scegli un altro colore")).toBeInTheDocument();
    expect(within(finestra).getByRole("group", { name: "Colore della sede" })).toBeInTheDocument();
  });

  it("una sede nuova si crea senza coordinate", async () => {
    const finestra = await apriNuova();
    fireEvent.change(within(finestra).getByLabelText("Nome sede *"), { target: { value: "Showroom Roma" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Crea sede" }));
    await waitFor(() => expect(stato.chiamate).toHaveLength(1));
    expect(stato.chiamate[0].body).toMatchObject({ action: "crea", company_id: "az-1", nome: "Showroom Roma" });
    expect(stato.chiamate[0].body).not.toHaveProperty("lat");
    expect(stato.chiamate[0].body).not.toHaveProperty("lng");
  });

  it("modificando una sede che ha già le coordinate le tiene, anche se il modulo non le mostra", async () => {
    stato.sedi = [sede(1, { lat: 45.4642, lng: 9.19 })];
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Modifica sede Sede 1" }));
    const finestra = await screen.findByRole("dialog");
    fireEvent.change(within(finestra).getByLabelText("Telefono sede"), { target: { value: "+39 02 123456" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(stato.chiamate).toHaveLength(1));
    expect(stato.chiamate[0].body).toMatchObject({ action: "aggiorna", sede_id: "sede-1", telefono: "+39 02 123456", lat: 45.4642, lng: 9.19 });
  });

  it("un CAP sbagliato lo dice sotto il campo e non salva", async () => {
    const finestra = await apriNuova();
    fireEvent.change(within(finestra).getByLabelText("Nome sede *"), { target: { value: "Showroom Roma" } });
    fireEvent.change(within(finestra).getByLabelText("CAP"), { target: { value: "12" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Crea sede" }));
    expect(await within(finestra).findByText("CAP non valido")).toBeInTheDocument();
    expect(stato.chiamate).toHaveLength(0);
  });
});

describe("Sedi: gli errori della funzione si leggono in italiano", () => {
  const rispostaDiErrore = (stato_http: number, corpo: unknown) => ({
    data: null as unknown,
    error: Object.assign(new Error("Edge Function returned a non-2xx status code"), { context: new Response(JSON.stringify(corpo), { status: stato_http }) }),
  });

  it("il motivo che scrive la funzione, così com'è", async () => {
    stato.rispostaFunzione = rispostaDiErrore(409, { error: "Sede collegata a preventivi: disattivala invece di eliminarla" }) as never;
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Elimina sede Sede 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(stato.errore).toHaveBeenCalledOnce());
    expect(stato.errore).toHaveBeenCalledWith("Sede collegata a preventivi: disattivala invece di eliminarla");
  });

  it("se la risposta non si legge, una frase tradotta e non il testo inglese di supabase", async () => {
    stato.rispostaFunzione = { data: null, error: new Error("Failed to fetch") } as never;
    apri();
    fireEvent.click(screen.getByRole("switch", { name: "Sede Sede 2 attiva" }));
    await waitFor(() => expect(stato.errore).toHaveBeenCalledOnce());
    expect(stato.errore).toHaveBeenCalledWith("Connessione persa. Controlla la rete e riprova.");
  });

  it("il limite del piano resta il messaggio di prima (decisione di Florin)", async () => {
    stato.rispostaFunzione = { data: { error: "LIMITE_PIANO", message: "Upgrade a Pro per aggiungere più sedi" }, error: null } as never;
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Nuova sede" }));
    const finestra = await screen.findByRole("dialog");
    fireEvent.change(within(finestra).getByLabelText("Nome sede *"), { target: { value: "Terza sede" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Crea sede" }));
    await waitFor(() => expect(stato.errore).toHaveBeenCalledOnce());
    expect(stato.errore).toHaveBeenCalledWith("Limite piano raggiunto. Passa a Pro per aggiungere più sedi.");
  });
});
