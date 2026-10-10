/**
 * La scheda di una persona (Impostazioni → Persone & Accessi → clic su una riga), 09/10/2026.
 *
 *  - Le schede: Dati · Ruolo e permessi · Sicurezza · Sessioni · Attività · … e la scheda
 *    scelta sta nell'indirizzo (?tab=…): si può mandare il link e ricaricare.
 *  - Cambiando scheda con modifiche non salvate, si chiede conferma (si perdevano in silenzio).
 *  - «Stato dell'accesso» non dice «Account attivo» a chi è bloccato dall'amministratore.
 *  - Due modi di cambiare la password con il loro vero nome: «Cambia subito la password»
 *    (quella di prima smette di funzionare, la nuova arriva per email) e «Invia il link per
 *    scegliere una nuova password» (la vecchia vale finché non lo usa).
 *  - Chi non è amministratore (ha solo «Modifica» su Persone & Accessi) guarda: niente
 *    pulsanti che finirebbero in un errore, e una riga che dice perché.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const ELENA = "aab6e41b-ded8-4d12-8c56-6837f22bcf04";
const AZ = "629d91e0-9d56-4736-a030-1e3833cba2ea";
const ADMIN = "1ef07662-2896-46eb-93b1-2b35ba53b808";

const stato = vi.hoisted(() => ({
  profilo: {} as Record<string, unknown>,
  ruoli: [] as Array<{ role: string }>,
  permessi: {} as Record<string, unknown>,
  permessiUtente: { isLoading: false, isAdmin: true, canEditSettingsPeople: true } as Record<string, unknown>,
  invocazioni: [] as Array<{ nome: string; body: Record<string, unknown> }>,
  rispostaReset: { data: { success: true } as unknown, error: null as unknown },
  linkPassword: [] as string[],
  toasts: [] as Array<{ title?: string; description?: string }>,
}));

vi.mock("@/integrations/supabase/client", () => {
  function builder(tabella: string) {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "neq", "order", "limit", "is", "not", "or", "gte", "lte"]) b[m] = () => b;
    const risposta = (): { data: unknown; error: unknown } => {
      if (tabella === "profiles") return { data: stato.profilo, error: null as unknown };
      if (tabella === "user_roles") return { data: stato.ruoli, error: null };
      if (tabella === "companies") return { data: { titolare_user_id: null }, error: null };
      if (tabella === "staff_permissions") return { data: stato.permessi, error: null };
      if (tabella === "user_sessions") {
        return { data: [{ id: "s-1", is_active: true, started_at: "2026-10-09T08:00:00Z", last_active_at: "2026-10-09T08:05:00Z", browser: "Chrome", os: "macOS", device_type: "desktop", ip_address: "10.0.0.1" }], error: null };
      }
      return { data: null, error: null };
    };
    b.single = async () => risposta();
    b.maybeSingle = async () => risposta();
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(risposta()).then(ok, ko);
    return b;
  }
  return {
    supabase: {
      from: (t: string) => builder(t),
      rpc: async () => ({ data: { ok: true }, error: null as unknown }),
      functions: {
        invoke: async (nome: string, opzioni: { body: Record<string, unknown> }) => {
          stato.invocazioni.push({ nome, body: opzioni.body });
          return nome === "reset-customer-password" ? stato.rispostaReset : { data: { ok: true }, error: null };
        },
      },
      auth: {
        resetPasswordForEmail: async (email: string) => {
          stato.linkPassword.push(email);
          return { error: null as unknown };
        },
      },
    },
  };
});
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isLoading: false, user: { id: ADMIN }, isImpersonating: false, effectiveCompany: { id: AZ } }),
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => stato.permessiUtente }));
vi.mock("@/hooks/useOpportunitiesData", () => ({ usePipelines: () => ({ data: [] as { id: string; name: string }[] }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: { title?: string; description?: string }) => stato.toasts.push(t) }) }));
// Le schede che non c'entrano con questa prova.
vi.mock("@/components/users/UserAvailabilityTab", () => ({ UserAvailabilityTab: () => <p>Disponibilità</p> }));
vi.mock("@/components/users/UserCalendarTab", () => ({ UserCalendarTab: () => <p>Calendario</p> }));
vi.mock("@/components/users/UserNotificationsTab", () => ({ UserNotificationsTab: () => <p>Notifiche della persona</p> }));
vi.mock("@/components/users/UserActivityLogTab", () => ({ UserActivityLogTab: () => <p>Attività della persona</p> }));

Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  setPointerCapture: () => {},
  scrollIntoView: () => {},
});

import SettingsUserDetail from "@/pages/azienda/settings/SettingsUserDetail";

function Indirizzo() {
  const l = useLocation();
  return <output data-testid="url">{l.pathname}{l.search}</output>;
}

function pagina(tab = "profile") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/azienda/impostazioni/utenti/${ELENA}?tab=${tab}`]}>
        <Routes>
          <Route path="/azienda/impostazioni/utenti/:userId" element={<><SettingsUserDetail /><Indirizzo /></>} />
          <Route path="/azienda/impostazioni/persone" element={<><p>Elenco delle persone</p><Indirizzo /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const nav = () => screen.getByRole("navigation", { name: "Schede della persona" });
const scheda = (nome: string | RegExp) => within(nav()).getByRole("button", { name: nome });

beforeEach(() => {
  stato.profilo = {
    id: ELENA, first_name: "Elena", last_name: "Ener", email: "elena@ener.it", phone: "3331234567", company_id: AZ,
    password_changed_at: "2026-09-01T10:00:00Z", failed_login_count: 0, locked_until: null as unknown, require_2fa: false,
    last_login_at: "2026-10-08T09:00:00Z", last_login_ip: "10.0.0.1", is_blocked: false, blocked_at: null as unknown, blocked_by: null as unknown, block_reason: null as unknown,
  };
  stato.ruoli = [{ role: "company_staff" }];
  stato.permessi = { user_id: ELENA, company_id: AZ };
  stato.permessiUtente = { isLoading: false, isAdmin: true, canEditSettingsPeople: true };
  stato.invocazioni = [];
  stato.rispostaReset = { data: { success: true }, error: null };
  stato.linkPassword = [];
  stato.toasts = [];
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const TIMEOUT = 30_000;

describe("Le schede della persona", () => {
  it("hanno nomi italiani, nell'ordine in cui servono, e la scheda attiva si riconosce", async () => {
    pagina();
    await screen.findByRole("heading", { level: 2, name: "Elena Ener" });
    const nomi = within(nav()).getAllByRole("button").map((b) => b.textContent);
    expect(nomi).toEqual(["Dati", "Ruolo e permessi", "Sicurezza", "Sessioni", "Attività", "Disponibilità", "Calendario", "Notifiche"]);
    expect(scheda("Dati")).toHaveAttribute("aria-current", "page");
    expect(scheda("Sicurezza")).not.toHaveAttribute("aria-current");
    for (const vecchio of ["Informazioni Utente", "Ruoli & Autorizzazioni", "Log Attività"]) {
      expect(screen.queryByText(vecchio)).toBeNull();
    }
  }, TIMEOUT);

  it("la scheda scelta sta nell'indirizzo: si apre da ?tab=… e cambiando scheda l'indirizzo cambia", async () => {
    pagina("security");
    expect(await screen.findByText("Stato dell'accesso")).toBeInTheDocument();
    expect(scheda("Sicurezza")).toHaveAttribute("aria-current", "page");

    fireEvent.click(scheda("Sessioni"));
    expect(await screen.findByText("Chiudi tutte")).toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent(`/azienda/impostazioni/utenti/${ELENA}?tab=sessions`);
    expect(scheda("Sessioni")).toHaveAttribute("aria-current", "page");
  }, TIMEOUT);

  it("un indirizzo con una scheda che non esiste apre i Dati", async () => {
    pagina("boh");
    expect(await screen.findByLabelText("Nome *")).toBeInTheDocument();
  }, TIMEOUT);
});

describe("Modifiche non salvate", () => {
  it("nei Dati: cambiando scheda si chiede conferma; se si resta, la bozza c'è ancora", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    pagina();
    const nome = (await screen.findByLabelText("Nome *")) as HTMLInputElement;
    fireEvent.change(nome, { target: { value: "Elisa" } });

    fireEvent.click(scheda("Sicurezza"));
    expect(conferma).toHaveBeenCalledWith("Ci sono modifiche non salvate. Uscire senza salvarle?");
    // Si è scelto di restare: stessa scheda, stessa bozza.
    expect(scheda("Dati")).toHaveAttribute("aria-current", "page");
    expect((screen.getByLabelText("Nome *") as HTMLInputElement).value).toBe("Elisa");

    conferma.mockReturnValue(true);
    fireEvent.click(scheda("Sicurezza"));
    expect(await screen.findByText("Stato dell'accesso")).toBeInTheDocument();
  }, TIMEOUT);

  it("senza modifiche non chiede niente", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    pagina();
    await screen.findByLabelText("Nome *");
    fireEvent.click(scheda("Sicurezza"));
    expect(conferma).not.toHaveBeenCalled();
    expect(await screen.findByText("Stato dell'accesso")).toBeInTheDocument();
  }, TIMEOUT);

  it("nei permessi: un interruttore cambiato e si prova ad andare in Sicurezza → conferma", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    pagina("permissions");
    fireEvent.change(await screen.findByRole("searchbox", { name: "Cerca un permesso" }), { target: { value: "magazz" } });
    fireEvent.click(screen.getByRole("switch", { name: "Magazzino" }));

    fireEvent.click(scheda("Sicurezza"));
    expect(conferma).toHaveBeenCalledTimes(1);
    expect(scheda("Ruolo e permessi")).toHaveAttribute("aria-current", "page");
  }, TIMEOUT);

  it("la freccia indietro chiede conferma anche lei", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    pagina();
    fireEvent.change(await screen.findByLabelText("Nome *"), { target: { value: "Elisa" } });
    fireEvent.click(screen.getByRole("button", { name: "Torna all'elenco delle persone" }));
    expect(conferma).toHaveBeenCalled();
    expect(screen.queryByText("Elenco delle persone")).toBeNull();

    conferma.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Torna all'elenco delle persone" }));
    expect(await screen.findByText("Elenco delle persone")).toBeInTheDocument();
  }, TIMEOUT);
});

describe("Sicurezza: lo stato dell'accesso dice la verità", () => {
  it("bloccato dall'amministratore: non dice «Account attivo» né «Nessun blocco»", async () => {
    stato.profilo = { ...stato.profilo, is_blocked: true, blocked_at: "2026-10-08T10:00:00Z", block_reason: "Bloccato dall'amministratore" };
    pagina("security");
    expect(await screen.findByText("Stato dell'accesso")).toBeInTheDocument();
    expect(screen.getAllByText("Accesso bloccato dall'amministratore").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Account attivo|Nessun blocco/)).toBeNull();
  }, TIMEOUT);

  it("bloccato per password sbagliate: dice fino a quando e si toglie", async () => {
    const fra1ora = new Date(Date.now() + 3_600_000).toISOString();
    stato.profilo = { ...stato.profilo, locked_until: fra1ora, failed_login_count: 5 };
    pagina("security");
    // (due volte: la versione da telefono e quella da computer stanno nella stessa pagina, una nascosta dallo stile)
    expect((await screen.findAllByText(/Bloccato fino alle \d\d:\d\d del \d\d\/\d\d per password sbagliate/)).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Togli il blocco/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Password sbagliate di fila").length).toBeGreaterThan(0);
  }, TIMEOUT);

  it("senza blocchi: «Nessun blocco»; i nomi dei campi non sono più in inglese", async () => {
    pagina("security");
    expect((await screen.findAllByText("Nessun blocco")).length).toBeGreaterThan(0);
    for (const nome of ["Ultimo accesso", "Ultimo indirizzo di rete (IP)", "Verifica in due passaggi", "Chiedi l'app di verifica"]) {
      expect(screen.getAllByText(nome).length, nome).toBeGreaterThan(0);
    }
    expect(screen.queryByText(/Tentativi Falliti|Ultimo Login|Ultimo IP|Stato Account|Autenticazione a Due Fattori|Richiedi 2FA/)).toBeNull();
    expect(screen.queryByText(/Password scaduta/)).toBeNull();
  }, TIMEOUT);
});

describe("Password: due azioni, ognuna col suo nome", () => {
  it("Dati → «Cambia subito la password»: chiede conferma, poi cambia; l'errore del server è in italiano", async () => {
    stato.rispostaReset = { data: null, error: { message: "Edge Function returned a non-2xx status code", context: { json: async () => ({ error: "Permission denied: Cannot reset another admin's password" }) } } };
    pagina();
    expect(await screen.findByText(/La password cambia adesso: quella di prima smette di funzionare e la nuova arriva alla persona per email/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Genera Password|Imposta Password/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cambia subito la password" }));
    expect(await screen.findByText(/Cambiare la password a Elena Ener\?/)).toBeInTheDocument();
    expect(screen.getByText(/Quella di prima smette di funzionare subito/)).toBeInTheDocument();
    expect(stato.invocazioni.some((i) => i.nome === "reset-customer-password")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Cambia la password" }));
    await waitFor(() => expect(stato.invocazioni.find((i) => i.nome === "reset-customer-password")?.body).toEqual({ userId: ELENA }));
    await waitFor(() => expect(stato.toasts.some((t) => t.title === "Non sono riuscito a cambiare la password")).toBe(true));
    expect(stato.toasts.find((t) => t.title === "Non sono riuscito a cambiare la password")?.description)
      .toBe("La password di un altro amministratore non si cambia da qui.");
  }, TIMEOUT);

  it("Dati: una password scritta a mano viene mandata, e senza risposta del sistema la finestra la mostra", async () => {
    pagina();
    fireEvent.change(await screen.findByLabelText("Nuova password (se vuoi scriverla tu)"), { target: { value: "Cantiere-2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Cambia subito la password" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cambia la password" }));

    await waitFor(() => expect(stato.invocazioni.find((i) => i.nome === "reset-customer-password")?.body).toEqual({ userId: ELENA, new_password: "Cantiere-2026" }));
    expect(await screen.findByText("Password cambiata")).toBeInTheDocument();
    expect(screen.getByText("Cantiere-2026")).toBeInTheDocument();
    expect(screen.getByText(/già arrivata alla persona per email/)).toBeInTheDocument();
  }, TIMEOUT);

  it("una password troppo corta non parte", async () => {
    pagina();
    fireEvent.change(await screen.findByLabelText("Nuova password (se vuoi scriverla tu)"), { target: { value: "corta" } });
    fireEvent.click(screen.getByRole("button", { name: "Cambia subito la password" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cambia la password" }));
    await waitFor(() => expect(stato.toasts.some((t) => t.title === "Password troppo corta")).toBe(true));
    expect(stato.invocazioni.some((i) => i.nome === "reset-customer-password")).toBe(false);
  }, TIMEOUT);

  it("Sicurezza → «Invia il link per scegliere una nuova password»: dice che la vecchia vale ancora, e manda solo il link", async () => {
    pagina("security");
    fireEvent.click(await screen.findByRole("button", { name: "Invia il link per scegliere una nuova password" }));
    expect(await screen.findByText("Mandare il link per cambiare la password?")).toBeInTheDocument();
    expect(screen.getByText(/Quella di prima continua a funzionare finché non lo usa/)).toBeInTheDocument();
    expect(screen.queryByText(/Forza|Invia Email Reset/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Invia il link" }));
    await waitFor(() => expect(stato.linkPassword).toEqual(["elena@ener.it"]));
    await waitFor(() => expect(stato.toasts.some((t) => t.title === "Link inviato")).toBe(true));
    // Il link non tocca la password: nessuna chiamata a reset-customer-password.
    expect(stato.invocazioni.some((i) => i.nome === "reset-customer-password")).toBe(false);
  }, TIMEOUT);
});

describe("Chi non è amministratore guarda", () => {
  beforeEach(() => {
    stato.permessiUtente = { isLoading: false, isAdmin: false, canEditSettingsPeople: true };
  });

  it("Dati: una riga dice perché, i campi e il pulsante della password sono spenti, e non c'è «Salva»", async () => {
    pagina();
    expect(await screen.findByText(/Stai guardando\. I dati, il ruolo, i permessi e gli accessi di questa persona li cambia solo l'amministratore\./)).toBeInTheDocument();
    for (const etichetta of ["Nome *", "Cognome *", "Email *", "Telefono"]) {
      expect(screen.getByLabelText(etichetta)).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: "Cambia subito la password" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Salva le modifiche/ })).toBeNull();
    expect(screen.queryByText(/Accesso consentito|Blocca accesso/)).toBeNull();
  }, TIMEOUT);

  it("Ruolo e permessi: si leggono, non si cambiano", async () => {
    pagina("permissions");
    expect(await screen.findByRole("combobox", { name: "Ruolo principale" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Salva permessi/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Nessuno$/ })).toBeNull();
  }, TIMEOUT);

  it("Sicurezza e Sessioni: niente blocco, niente reset, niente chiusura delle sessioni", async () => {
    pagina("security");
    expect(await screen.findByText("Stato dell'accesso")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invia il link per scegliere una nuova password" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Chiedi l'app di verifica" })).toBeDisabled();
    expect(screen.queryByText(/Blocca accesso|Ripristina accesso/)).toBeNull();

    fireEvent.click(scheda("Sessioni"));
    expect(await screen.findByText(/1 sessione aperta/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Chiudi tutte|Chiudi questa sessione/ })).toBeNull();
  }, TIMEOUT);

  it("senza nemmeno «Modifica» su Persone & Accessi: «Pagina riservata» e si torna all'elenco, non a un'altra pagina che potrebbe negarsi", async () => {
    stato.permessiUtente = { isLoading: false, isAdmin: false, canEditSettingsPeople: false };
    pagina();
    expect(await screen.findByText("Elenco delle persone")).toBeInTheDocument();
    expect(stato.toasts[0]).toMatchObject({ title: "Pagina riservata", description: "Le schede delle persone le apre solo l'amministratore." });
    expect(screen.getByTestId("url")).toHaveTextContent("/azienda/impostazioni/persone");
  }, TIMEOUT);
});
