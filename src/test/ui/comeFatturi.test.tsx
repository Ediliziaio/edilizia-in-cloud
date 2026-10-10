/**
 * Fatturazione → «Come fatturi?».
 *
 * La scelta è la prima cosa che si legge. Nessuna card è accesa finché l'azienda non ha scelto («external» è solo il
 * valore di partenza), ogni clic registra la scelta (anche quello sul valore di partenza), il testo di conferma dice
 * cosa succede ai collegamenti, e se il database non cambia la riga lo dice. Qui il componente con il vero
 * BillingModeProvider e un database finto che registra cosa riceve.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BillingModeProvider, useBillingMode } from "@/contexts/BillingModeContext";
import { ComeFatturi } from "@/components/fatturazione/ComeFatturi";

const s = vi.hoisted(() => ({
  azienda: null as Record<string, unknown> | null,
  authLoading: false,
  refreshAuth: vi.fn(async () => {}),
  scritture: [] as { tabella: string; payload: Record<string, unknown>; id: unknown }[],
  esito: "ok" as "ok" | "zero" | "errore",
  messaggi: [] as { tipo: string; titolo: string; descrizione: string }[],
}));

vi.mock("sonner", () => ({
  toast: {
    success: (titolo: string) => s.messaggi.push({ tipo: "ok", titolo, descrizione: "" }),
    error: (titolo: string, o?: { description?: string }) => s.messaggi.push({ tipo: "errore", titolo, descrizione: o?.description ?? "" }),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: s.azienda, isLoading: s.authLoading, refreshAuth: s.refreshAuth }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "utente-1" } } }) },
    from: (tabella: string) => ({
      update: (payload: Record<string, unknown>) => ({
        eq: (_colonna: string, id: unknown) => ({
          select: () => ({
            maybeSingle: async () => {
              s.scritture.push({ tabella, payload, id });
              if (s.esito === "errore") return { data: null as unknown, error: { code: "XX000", message: "FetchError: Failed to fetch" } as unknown };
              if (s.esito === "zero") return { data: null as unknown, error: null as unknown };
              return { data: { id } as unknown, error: null as unknown };
            },
          }),
        }),
      }),
    }),
  },
}));

const MAI_SCELTO = { id: "azienda-1", billing_mode: "external", billing_mode_set_at: null as string | null };
const SCELTO_NATIVO = { id: "azienda-1", billing_mode: "native", billing_mode_set_at: "2026-09-15T12:00:00Z" };
const SCELTO_ESTERNO = { id: "azienda-1", billing_mode: "external", billing_mode_set_at: "2026-09-15T12:00:00Z" };

beforeEach(() => {
  s.azienda = { ...MAI_SCELTO };
  s.authLoading = false;
  s.refreshAuth.mockClear();
  s.scritture = [];
  s.esito = "ok";
  s.messaggi = [];
});
afterEach(cleanup);

function vedi(onScelta?: (modo: "native" | "external") => void) {
  return render(
    <BillingModeProvider>
      <ComeFatturi onScelta={onScelta} />
    </BillingModeProvider>,
  );
}
const cardNativa = () => screen.getByRole("button", { name: /Con Edilizia in Cloud/ });
const cardEsterna = () => screen.getByRole("button", { name: /Con un altro programma/ });

describe("la scelta in cima: chi non ha mai scelto non ha niente di acceso", () => {
  it("nessuna card è accesa e la pagina dice «Non hai ancora scelto.» (external è solo il valore di partenza)", () => {
    vedi();
    expect(cardEsterna()).toHaveAttribute("aria-pressed", "false");
    expect(cardNativa()).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("status")).toHaveTextContent("Non hai ancora scelto.");
    expect(document.body.textContent).not.toMatch(/Attuale/);
  });

  it("chi ha già scelto vede accesa la sua card e il giorno della scelta", () => {
    s.azienda = { ...SCELTO_NATIVO };
    vedi();
    expect(cardNativa()).toHaveAttribute("aria-pressed", "true");
    expect(cardEsterna()).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("status")).toHaveTextContent("Hai scelto il 15 settembre 2026.");
  });

  it("la scelta è la prima domanda, con due risposte e la rassicurazione che le fatture fatte non si cancellano", () => {
    vedi();
    expect(screen.getByRole("heading", { name: "Come fatturi?" })).toBeInTheDocument();
    expect(screen.getByText("Puoi cambiare quando vuoi. Le fatture già fatte non si cancellano.")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("mentre l'azienda si carica i pulsanti sono spenti e non si dice niente sulla scelta", () => {
    s.azienda = null;
    s.authLoading = true;
    vedi();
    expect(cardNativa()).toBeDisabled();
    expect(cardEsterna()).toBeDisabled();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("registrare la scelta", () => {
  it("un clic sul valore di partenza («un altro programma») registra la scelta subito, senza conferma", async () => {
    const dopo = vi.fn();
    vedi(dopo);
    fireEvent.click(cardEsterna());
    await waitFor(() => expect(s.messaggi.map((m) => m.titolo)).toContain("Ora fatturi con un altro programma"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(s.scritture).toHaveLength(1);
    expect(s.scritture[0]).toMatchObject({ tabella: "companies", id: "azienda-1" });
    expect(s.scritture[0].payload).toMatchObject({ billing_mode: "external", billing_mode_set_by: "utente-1" });
    expect(typeof s.scritture[0].payload.billing_mode_set_at).toBe("string");
    expect(dopo).toHaveBeenCalledWith("external");
    // L'azienda che il resto dell'app legge deve avere il valore nuovo.
    expect(s.refreshAuth).toHaveBeenCalledTimes(1);
    // E la card si accende subito, senza aspettare il ricaricamento.
    expect(cardEsterna()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent(/^Hai scelto il /);
  });

  it("passare a «Con Edilizia in Cloud» chiede conferma, e il testo dice la verità sui collegamenti", async () => {
    const dopo = vi.fn();
    vedi(dopo);
    fireEvent.click(cardNativa());
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Fatturi con Edilizia in Cloud?")).toBeInTheDocument();
    expect(dialogo).toHaveTextContent("Se hai un programma collegato, resta collegato e continua a portare qui le fatture");
    expect(dialogo.textContent).not.toMatch(/non sarebber|non saranno|disattiv/i);
    expect(s.scritture).toEqual([]);

    fireEvent.click(within(dialogo).getByRole("button", { name: "Sì, fatturo con Edilizia in Cloud" }));
    await waitFor(() => expect(s.messaggi.map((m) => m.titolo)).toContain("Ora fatturi con Edilizia in Cloud"));
    expect(s.scritture[0].payload).toMatchObject({ billing_mode: "native" });
    expect(dopo).toHaveBeenCalledWith("native");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(cardNativa()).toHaveAttribute("aria-pressed", "true");
  });

  it("«Annulla» non scrive niente", async () => {
    vedi();
    fireEvent.click(cardNativa());
    fireEvent.click(await screen.findByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(s.scritture).toEqual([]);
    expect(s.messaggi).toEqual([]);
    expect(cardNativa()).toHaveAttribute("aria-pressed", "false");
  });

  it("tornare a «un altro programma» dice che le fatture fatte qui non si cancellano", async () => {
    s.azienda = { ...SCELTO_NATIVO };
    vedi();
    fireEvent.click(cardEsterna());
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Fatturi con un altro programma?")).toBeInTheDocument();
    expect(dialogo).toHaveTextContent("Le fatture fatte con Edilizia in Cloud non si cancellano: le ritrovi se tornerai a questa scelta.");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Sì, fatturo con un altro programma" }));
    await waitFor(() => expect(s.scritture).toHaveLength(1));
    expect(s.scritture[0].payload).toMatchObject({ billing_mode: "external" });
  });

  it("chi ha già scelto così e riclicca: non cambia niente, non scrive e non chiede", async () => {
    s.azienda = { ...SCELTO_ESTERNO };
    vedi();
    fireEvent.click(cardEsterna());
    // La scrittura, se partisse, sarebbe asincrona: si lascia il tempo di partire prima di dire che non c'è stata.
    await act(async () => { await new Promise((fine) => setTimeout(fine, 40)); });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(s.scritture).toEqual([]);
    expect(s.messaggi).toEqual([]);
  });
});

describe("quando il database non lascia cambiare", () => {
  it("zero righe aggiornate (chi non è amministratore): lo dice e non accende niente", async () => {
    s.esito = "zero";
    const dopo = vi.fn();
    vedi(dopo);
    fireEvent.click(cardEsterna());
    await waitFor(() => expect(s.messaggi.length).toBeGreaterThan(0));
    expect(s.messaggi).toEqual([{ tipo: "errore", titolo: "Non sono riuscito a cambiare: serve l'amministratore dell'azienda.", descrizione: "" }]);
    expect(dopo).not.toHaveBeenCalled();
    expect(s.refreshAuth).not.toHaveBeenCalled();
    expect(cardEsterna()).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("status")).toHaveTextContent("Non hai ancora scelto.");
  });

  it("errore del database: il motivo è in italiano, la conferma si chiude e nessuna card si accende", async () => {
    s.esito = "errore";
    vedi();
    fireEvent.click(cardNativa());
    fireEvent.click(await screen.findByRole("button", { name: "Sì, fatturo con Edilizia in Cloud" }));
    await waitFor(() => expect(s.messaggi.length).toBeGreaterThan(0));
    expect(s.messaggi[0]).toEqual({ tipo: "errore", titolo: "Non sono riuscito a cambiare", descrizione: "Connessione persa. Controlla la rete e riprova." });
    expect(s.messaggi.some((m) => m.tipo === "ok")).toBe(false);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(cardNativa()).toHaveAttribute("aria-pressed", "false");
    expect(s.refreshAuth).not.toHaveBeenCalled();
  });
});

describe("useBillingMode", () => {
  function Sonda() {
    const ctx = useBillingMode({ facoltativo: true });
    return <p>{ctx === null ? "nessun provider" : `modo ${ctx.mode}, scelto ${String(ctx.isChosen)}`}</p>;
  }
  function SondaObbligata(): null {
    useBillingMode();
    return null;
  }

  it("con {facoltativo: true} funziona anche dove il provider non c'è (ricerca delle impostazioni, prove)", () => {
    render(<Sonda />);
    expect(screen.getByText("nessun provider")).toBeInTheDocument();
  });

  it("dentro il provider dice il modo e se l'azienda ha scelto davvero", () => {
    s.azienda = { ...SCELTO_NATIVO };
    render(<BillingModeProvider><Sonda /></BillingModeProvider>);
    expect(screen.getByText("modo native, scelto true")).toBeInTheDocument();
  });

  it("l'azienda col valore di partenza ha modo «external» ma non ha scelto", () => {
    render(<BillingModeProvider><Sonda /></BillingModeProvider>);
    expect(screen.getByText("modo external, scelto false")).toBeInTheDocument();
  });

  it("senza provider e senza {facoltativo} lancia l'errore (chi lo usa deve stare nel provider)", () => {
    const errore = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<SondaObbligata />)).toThrow("useBillingMode must be used inside BillingModeProvider");
    errore.mockRestore();
  });
});
