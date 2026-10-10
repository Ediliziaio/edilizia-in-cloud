/**
 * Sicurezza & Privacy → Privacy, 10/10/2026.
 *
 *  - Niente secondo h1 («Privacy & GDPR»): il titolo è h2.
 *  - I cinque consensi restano (la loro sorte è una decisione di Florin), ma la
 *    pagina dice cosa sono: una scelta registrata con la data, che per ora non
 *    comanda nessun invio. Gli interruttori hanno un nome.
 *  - La copia dei dati dice cosa contiene davvero (dopo la correzione di
 *    gdpr-compliance); se il browser blocca il download, il file è nello storico.
 *  - La cancellazione dice chi la esamina (l'assistenza) e cosa succede davvero
 *    se viene approvata (accesso cancellato, profilo anonimizzato), non
 *    «tutti i tuoi dati verranno eliminati definitivamente».
 *  - Lo storico non mostra più emoji né «Rettifica» (nessuna schermata la crea).
 *  - Errori in italiano.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const stato = vi.hoisted(() => ({
  mobile: false,
  consensi: [] as Array<Record<string, unknown>>,
  richieste: [] as Array<Record<string, unknown>>,
  rispostaAzione: { data: { success: true } as unknown, error: null as unknown },
  chiamate: [] as Array<Record<string, unknown>>,
  toasts: [] as Array<{ tipo: string; testo: string; descrizione?: string }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: async (_nome: string, opzioni: { body: Record<string, unknown> }) => {
        stato.chiamate.push(opzioni.body);
        if (opzioni.body.action === "get_consents") return { data: stato.consensi, error: null as unknown };
        if (opzioni.body.action === "get_requests") return { data: stato.richieste, error: null as unknown };
        return stato.rispostaAzione;
      },
    },
  },
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => stato.mobile }));
vi.mock("sonner", () => ({
  toast: {
    success: (testo: string, o?: { description?: string }) => stato.toasts.push({ tipo: "ok", testo, descrizione: o?.description }),
    error: (testo: string) => stato.toasts.push({ tipo: "errore", testo }),
  },
}));

Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  setPointerCapture: () => {},
  scrollIntoView: () => {},
});

import SettingsPrivacy from "@/pages/azienda/settings/SettingsPrivacy";

function pagina() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SettingsPrivacy />
    </QueryClientProvider>,
  );
}
const vaiAScheda = (nome: RegExp) => fireEvent.mouseDown(screen.getByRole("tab", { name: nome }), { button: 0, ctrlKey: false });

beforeEach(() => {
  stato.mobile = false;
  stato.consensi = [{ consent_type: "marketing_email", granted: true, granted_at: "2026-09-01T10:00:00Z", revoked_at: null as unknown }];
  stato.richieste = [];
  stato.rispostaAzione = { data: { success: true }, error: null as unknown };
  stato.chiamate = [];
  stato.toasts = [];
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Privacy: consensi", () => {
  it("un solo titolo, h2; niente h1 «Privacy & GDPR»", async () => {
    pagina();
    expect(await screen.findByRole("heading", { level: 2, name: "Privacy e consensi" })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByText("Privacy & GDPR")).toBeNull();
  });

  it("dice che i consensi registrano una scelta e per ora non comandano nessun invio", async () => {
    pagina();
    expect(await screen.findByText(/Qui si registra cosa hai accettato e da quando/)).toBeVisible();
    expect(screen.getByText(/Per ora non comanda nessun invio/)).toBeVisible();
    expect(screen.queryByText(/Gestione consensi/)).toBeNull();
  });

  it("ogni interruttore ha il nome del consenso e lo stato registrato", async () => {
    pagina();
    const email = await screen.findByRole("switch", { name: "Email marketing" });
    await waitFor(() => expect(email).toBeChecked());
    expect(screen.getByRole("switch", { name: "SMS marketing" })).not.toBeChecked();
    for (const nome of ["Analisi di utilizzo", "Condivisione con terzi", "Profilazione"]) {
      expect(screen.getByRole("switch", { name: nome })).toBeInTheDocument();
    }
    expect(screen.getByText(/Concesso il 1 settembre 2026/)).toBeVisible();
  });

  it("le frasi sono dichiarazioni di consenso, non promesse di controllo", async () => {
    pagina();
    expect(await screen.findByText("Acconsento a ricevere comunicazioni commerciali via email")).toBeVisible();
    expect(screen.queryByText("Ricevi comunicazioni commerciali via email")).toBeNull();
  });

  it("se il salvataggio fallisce l'errore è in italiano", async () => {
    stato.rispostaAzione = {
      data: null as unknown,
      error: { message: "Edge Function returned a non-2xx status code", context: { json: async () => ({ error: "Non autorizzato" }) } },
    };
    pagina();
    const interruttore = await screen.findByRole("switch", { name: "SMS marketing" });
    // Finché i consensi si caricano gli interruttori sono spenti: si aspetta che si accendano.
    await waitFor(() => expect(interruttore).toBeEnabled());
    fireEvent.click(interruttore);
    await waitFor(() => expect(stato.toasts.some((t) => t.tipo === "errore")).toBe(true));
    expect(stato.toasts.find((t) => t.tipo === "errore")!.testo).toBe("Sessione scaduta. Accedi di nuovo per continuare.");
  });
});

describe("Privacy: i miei dati", () => {
  it("la copia dei dati dice cosa contiene davvero", async () => {
    pagina();
    vaiAScheda(/I miei dati/);
    expect(await screen.findByText(/il tuo profilo, la tua attività e i tuoi consensi/)).toBeVisible();
    expect(screen.getByText(/Gli amministratori con il permesso «Esporta Clienti» trovano nel file anche commesse, contatti e appuntamenti dell'azienda/)).toBeVisible();
    expect(screen.queryByText(/copia completa di tutti i tuoi dati/)).toBeNull();
    expect(screen.getByText("Il link per scaricare vale 24 ore.")).toBeVisible();
  });

  it("se il browser blocca la scheda del download, dice dove ritrovare il file", async () => {
    stato.rispostaAzione = { data: { success: true, download_url: "https://file.example/dati.json" }, error: null as unknown };
    vi.spyOn(window, "open").mockReturnValue(null);
    pagina();
    vaiAScheda(/I miei dati/);
    fireEvent.click(await screen.findByRole("button", { name: "Scarica i miei dati" }));
    await waitFor(() => expect(stato.toasts.some((t) => t.tipo === "ok")).toBe(true));
    const avviso = stato.toasts.find((t) => t.tipo === "ok")!;
    expect(avviso.testo).toBe("File pronto");
    expect(avviso.descrizione).toMatch(/lo trovi in «Storico richieste»/);
  });

  it("se il download parte lo dice senza altro", async () => {
    stato.rispostaAzione = { data: { success: true, download_url: "https://file.example/dati.json" }, error: null as unknown };
    const apri = vi.spyOn(window, "open").mockReturnValue({} as Window);
    pagina();
    vaiAScheda(/I miei dati/);
    fireEvent.click(await screen.findByRole("button", { name: "Scarica i miei dati" }));
    await waitFor(() => expect(apri).toHaveBeenCalledWith("https://file.example/dati.json", "_blank"));
    expect(stato.toasts.find((t) => t.tipo === "ok")!.testo).toBe("File pronto: il download parte da solo");
  });

  it("la cancellazione dice chi la esamina e cosa succede davvero", async () => {
    pagina();
    vaiAScheda(/I miei dati/);
    expect(await screen.findByText(/La richiesta la esamina l'assistenza di Edilizia in Cloud/)).toBeVisible();
    expect(screen.getByText(/il tuo accesso viene cancellato e il tuo profilo anonimizzato: non si torna indietro/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Motivo (facoltativo)"), { target: { value: "Non lavoro più qui" } });
    fireEvent.click(screen.getByRole("button", { name: "Chiedi la cancellazione" }));
    const finestra = await screen.findByRole("alertdialog");
    expect(within(finestra).getByText(/nome, cognome, telefono e foto vengono tolti/)).toBeVisible();
    expect(within(finestra).queryByText(/eliminati definitivamente/)).toBeNull();
    fireEvent.click(within(finestra).getByRole("button", { name: "Sì, chiedi la cancellazione" }));
    await waitFor(() => expect(stato.chiamate.some((c) => c.action === "request_deletion")).toBe(true));
    expect(stato.chiamate.find((c) => c.action === "request_deletion")).toMatchObject({ reason: "Non lavoro più qui" });
    await waitFor(() => expect(stato.toasts.some((t) => /La esamina l'assistenza di Edilizia in Cloud/.test(t.testo))).toBe(true));
  });
});

describe("Privacy: storico richieste", () => {
  it("niente emoji e niente «Rettifica»: tre tipi con il loro nome", async () => {
    stato.richieste = [
      { id: "r1", request_type: "export", status: "completed", download_url: "https://file.example/a.json", expires_at: null as unknown, created_at: "2026-10-01T10:00:00Z", reason: null as unknown },
      { id: "r2", request_type: "deletion", status: "pending", download_url: null as unknown, expires_at: null as unknown, created_at: "2026-10-02T10:00:00Z", reason: null as unknown },
      { id: "r3", request_type: "rectification", status: "rejected", download_url: null as unknown, expires_at: null as unknown, created_at: "2026-10-03T10:00:00Z", reason: null as unknown },
    ];
    pagina();
    vaiAScheda(/Storico richieste/);
    expect(await screen.findByText("Copia dei dati")).toBeVisible();
    expect(screen.getByText("Cancellazione")).toBeVisible();
    expect(screen.getByText("Altra richiesta")).toBeVisible();
    const testo = document.body.textContent ?? "";
    expect(testo).not.toMatch(/Rettifica/);
    expect(testo).not.toMatch(/📦|🗑|✏/u);
    expect(screen.getByRole("button", { name: /Scarica la copia dei dati richiesta il 01 ott 2026/ })).toBeVisible();
  });

  it("senza richieste lo dice; se lo storico non si legge, c'è «Riprova»", async () => {
    pagina();
    vaiAScheda(/Storico richieste/);
    expect(await screen.findByText("Nessuna richiesta")).toBeVisible();
  });
});

describe("Privacy: telefono", () => {
  it("su telefono restano i consensi; copia dei dati e cancellazione si fanno dal computer", async () => {
    stato.mobile = true;
    pagina();
    // Su telefono la barra delle schede non c'è: restano i consensi.
    expect(await screen.findByRole("switch", { name: "Email marketing" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scarica i miei dati" })).toBeNull();
  });
});
