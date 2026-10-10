/**
 * Automazioni finanza → «Avvisi sulle scadenze»: salvataggi controllati e parole oneste.
 *
 * Cosa è cambiato rispetto alla prima versione di questo file (09/10/2026, controllo delle impostazioni):
 * dei sette controlli della pagina cinque non li leggeva nessuno («Scadenze da fatture», «Riconciliazione
 * automatica», «Avviso scadenze in scadenza», «Avviso scadenze scadute», «Giorni di preavviso»; la tabella
 * `scadenza_alert_prefs` ha 0 righe e `check-scadenze-alerts`, che legge solo `alert_enabled` e `alert_email`,
 * non ha nessun cron). Sono stati tolti dalla pagina. Per questo i test che usavano «Giorni di preavviso» come
 * campo d'esempio (salvare solo il campo cambiato, mantenere la bozza, sola lettura, refetch) ora usano
 * «Email per avvisi» e l'interruttore «Avvisi attivi», e il caso dei preavvisi non validi (0, 31, 1.5) è
 * diventato quello degli indirizzi email non validi.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FinanceAutomationSettings } from "@/components/settings/FinanceAutomationSettings";

const state = vi.hoisted(() => ({
  readError: false, writeError: false, canEdit: true, noRow: false, writeMessage: "update denied",
  prefs: { id: "prefs-1", company_id: "company-1", alert_enabled: true, default_alert_days: 7, alert_email: null as string | null, alert_on_overdue: true, alert_on_upcoming: true, auto_generate_from_invoices: true, auto_reconcile_payments: true },
  updates: [] as Record<string, unknown>[], inserts: [] as Record<string, unknown>[], filters: [] as [string, unknown][],
  toastError: vi.fn(), toastSuccess: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: state.canEdit, canViewCosts: true, solaLettura: !state.canEdit }) }));
vi.mock("sonner", () => ({ toast: { error: state.toastError, success: state.toastSuccess } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    let write = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select: () => builder,
      eq: (key: string, value: unknown) => { if (write) state.filters.push([key, value]); return builder; },
      maybeSingle: async () => ({ data: state.readError || state.noRow ? (null as unknown) : state.prefs, error: state.readError ? { message: "read failed" } : (null as unknown) }),
      update: (payload: Record<string, unknown>) => { write = true; state.updates.push(payload); return builder; },
      insert: (payload: Record<string, unknown>) => {
        state.inserts.push(payload);
        // Come il database: le colonne non nominate prendono il valore predefinito, e poi la riga esiste.
        if (!state.writeError) { state.noRow = false; Object.assign(state.prefs, { alert_enabled: true, alert_email: null as string | null }, payload); }
        return Promise.resolve({ data: null as unknown, error: state.writeError ? { message: state.writeMessage } : (null as unknown) });
      },
      single: async () => {
        if (!state.writeError) Object.assign(state.prefs, state.updates.at(-1));
        return { data: state.writeError ? (null as unknown) : { id: state.prefs.id }, error: state.writeError ? { message: state.writeMessage } : (null as unknown) };
      },
    };
    return builder;
  },
} }));

function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><FinanceAutomationSettings /></QueryClientProvider>);
  return client;
}
beforeEach(() => {
  state.readError = false; state.writeError = false; state.canEdit = true; state.noRow = false; state.writeMessage = "update denied";
  state.prefs = { id: "prefs-1", company_id: "company-1", alert_enabled: true, default_alert_days: 7, alert_email: null as string | null, alert_on_overdue: true, alert_on_upcoming: true, auto_generate_from_invoices: true, auto_reconcile_payments: true };
  state.updates.length = 0; state.inserts.length = 0; state.filters.length = 0;
  state.toastError.mockClear(); state.toastSuccess.mockClear();
});
afterEach(cleanup);

describe("Automazioni finanza: salvataggi controllati", () => {
  it("non mostra valori salvabili se la lettura fallisce", async () => {
    state.readError = true;
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent("Nessuna modifica verrà salvata");
    expect(screen.queryByRole("button", { name: "Salva impostazioni" })).toBeNull();
    expect(state.updates).toHaveLength(0);
  });
  it("non salva automaticamente e invia solo il campo cambiato nella propria azienda", async () => {
    open();
    const email = await screen.findByLabelText("Email per avvisi");
    expect(email).toHaveValue("");
    expect(screen.getByRole("switch", { name: "Avvisi attivi" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Salva impostazioni" })).toBeDisabled();
    fireEvent.change(email, { target: { value: "amministrazione@rossi.it" } });
    expect(state.updates).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Salva impostazioni" }));
    await waitFor(() => expect(state.toastSuccess).toHaveBeenCalledOnce());
    expect(state.updates[0]).toEqual({ alert_email: "amministrazione@rossi.it", updated_at: expect.any(String) });
    expect(state.filters).toEqual([["id", "prefs-1"], ["company_id", "company-1"]]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Salva impostazioni" })).toBeDisabled());
  });
  it("spegnere gli avvisi salva solo quell'interruttore", async () => {
    open();
    fireEvent.click(await screen.findByRole("switch", { name: "Avvisi attivi" }));
    expect(screen.getByRole("switch", { name: "Avvisi attivi" })).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("Modifiche non salvate");
    fireEvent.click(screen.getByRole("button", { name: "Salva impostazioni" }));
    await waitFor(() => expect(state.toastSuccess).toHaveBeenCalledOnce());
    expect(state.updates[0]).toEqual({ alert_enabled: false, updated_at: expect.any(String) });
  });
  it("mantiene la bozza se il salvataggio viene rifiutato", async () => {
    state.writeError = true;
    open();
    fireEvent.change(await screen.findByLabelText("Email per avvisi"), { target: { value: "amministrazione@rossi.it" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva impostazioni" }));
    await waitFor(() => expect(state.toastError).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Email per avvisi")).toHaveValue("amministrazione@rossi.it");
    expect(screen.getByRole("status")).toHaveTextContent("Modifiche non salvate");
    expect(state.toastSuccess).not.toHaveBeenCalled();
  });
  it.each(["amministrazione", "amministrazione@rossi", "amministrazione @rossi.it"])("rifiuta un indirizzo email non valido: %s", async value => {
    open();
    fireEvent.change(await screen.findByLabelText("Email per avvisi"), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Salva impostazioni" }));
    await waitFor(() => expect(state.toastError).toHaveBeenCalledOnce());
    expect(state.updates).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
  });
  it("togliere l'email la salva vuota (null) e toglie gli spazi a quella scritta", async () => {
    state.prefs.alert_email = "vecchia@rossi.it";
    open();
    const email = await screen.findByLabelText("Email per avvisi");
    expect(email).toHaveValue("vecchia@rossi.it");
    fireEvent.change(email, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva impostazioni" }));
    await waitFor(() => expect(state.toastSuccess).toHaveBeenCalledOnce());
    expect(state.updates[0]).toEqual({ alert_email: null, updated_at: expect.any(String) });
    fireEvent.change(await screen.findByLabelText("Email per avvisi"), { target: { value: "  nuova@rossi.it " } });
    fireEvent.click(screen.getByRole("button", { name: "Salva impostazioni" }));
    await waitFor(() => expect(state.updates).toHaveLength(2));
    expect(state.updates[1]).toEqual({ alert_email: "nuova@rossi.it", updated_at: expect.any(String) });
  });
  it("disabilita davvero i controlli in sola lettura e lo dice con il nome del permesso", async () => {
    state.canEdit = false;
    open();
    expect(await screen.findByLabelText("Email per avvisi")).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Avvisi attivi" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salva impostazioni" })).toBeDisabled();
    expect(screen.getByRole("note")).toHaveTextContent("Sola lettura: qui serve il permesso «Costi», e chi ce l'ha in «Sola lettura» non può scrivere.");
  });
  it("con il permesso non compare la frase di sola lettura", async () => {
    open();
    await screen.findByLabelText("Email per avvisi");
    expect(screen.queryByRole("note")).toBeNull();
  });
  it("un refetch non cancella i valori ancora da salvare", async () => {
    const client = open();
    fireEvent.change(await screen.findByLabelText("Email per avvisi"), { target: { value: "amministrazione@rossi.it" } });
    state.prefs.alert_email = "altra@rossi.it";
    await client.refetchQueries();
    expect(screen.getByLabelText("Email per avvisi")).toHaveValue("amministrazione@rossi.it");
    expect(state.updates).toHaveLength(0);
  });
});

describe("Avvisi sulle scadenze: solo quello che qualcuno legge, e parole oneste", () => {
  it("i cinque controlli che non leggeva nessuno non ci sono più", async () => {
    open();
    await screen.findByLabelText("Email per avvisi");
    for (const tolto of ["Scadenze da fatture", "Riconciliazione automatica", "Avviso scadenze in scadenza", "Avviso scadenze scadute", "Giorni di preavviso"]) {
      expect(screen.queryByText(tolto), tolto).toBeNull();
      expect(screen.queryByLabelText(tolto), tolto).toBeNull();
    }
    // Restano solo i due che servono: un interruttore e un campo email.
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });
  it("dice dove arrivano davvero i promemoria e che l'invio delle email non è ancora attivo", async () => {
    open();
    await screen.findByLabelText("Email per avvisi");
    expect(screen.getByRole("heading", { level: 2, name: "Avvisi sulle scadenze" })).toBeInTheDocument();
    expect(screen.getByText("I promemoria dei pagamenti in uscita arrivano già in campanella ogni mattina, a chi amministra l'azienda: non dipendono da questa pagina.")).toBeInTheDocument();
    expect(screen.getByText("Un riepilogo per email delle scadenze scadute e in arrivo.")).toBeInTheDocument();
    expect(screen.getByText("L'invio di queste email non parte ancora da solo: la scelta resta salvata e varrà quando lo attiveremo.")).toBeInTheDocument();
  });
  it("il titolo della pagina lo mette il layout: qui nessun titolo di primo livello né «Automazioni Finanziarie»", async () => {
    open();
    await screen.findByLabelText("Email per avvisi");
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(screen.queryByText("Automazioni Finanziarie")).toBeNull();
    expect(screen.getAllByRole("heading").map(h => h.textContent)).toEqual(["Avvisi sulle scadenze"]);
  });
  it("alla prima volta la riga si crea con i soli campi che la pagina mostra", async () => {
    state.noRow = true;
    open();
    fireEvent.change(await screen.findByLabelText("Email per avvisi"), { target: { value: "amministrazione@rossi.it" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva impostazioni" }));
    await waitFor(() => expect(state.toastSuccess).toHaveBeenCalledOnce());
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toEqual({ company_id: "company-1", alert_enabled: true, alert_email: "amministrazione@rossi.it", updated_at: expect.any(String) });
    for (const colonnaTolta of ["default_alert_days", "alert_on_overdue", "alert_on_upcoming", "auto_generate_from_invoices", "auto_reconcile_payments"]) {
      expect(Object.keys(state.inserts[0]), colonnaTolta).not.toContain(colonnaTolta);
    }
    expect(state.updates).toHaveLength(0);
  });
  it("la riga creata alla prima volta ha gli avvisi accesi e nessuna email, se non si tocca altro", async () => {
    state.noRow = true;
    open();
    // Si cambia solo l'interruttore due volte (spento e riacceso) e poi l'email si lascia vuota ma si salva.
    fireEvent.click(await screen.findByRole("switch", { name: "Avvisi attivi" }));
    fireEvent.click(screen.getByRole("switch", { name: "Avvisi attivi" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva impostazioni" }));
    await waitFor(() => expect(state.toastSuccess).toHaveBeenCalledOnce());
    expect(state.inserts[0]).toEqual({ company_id: "company-1", alert_enabled: true, alert_email: null, updated_at: expect.any(String) });
  });
  it("alla prima volta con gli avvisi spenti la riga nasce spenta", async () => {
    state.noRow = true;
    open();
    fireEvent.click(await screen.findByRole("switch", { name: "Avvisi attivi" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva impostazioni" }));
    await waitFor(() => expect(state.toastSuccess).toHaveBeenCalledOnce());
    expect(state.inserts[0]).toEqual({ company_id: "company-1", alert_enabled: false, alert_email: null, updated_at: expect.any(String) });
  });
  it("le colonne che la pagina non scrive più prendono, alla creazione, gli stessi valori che prima si scrivevano (7, tutto acceso)", () => {
    // Prima la riga nasceva con: preavviso 7 giorni, avvisi su scadute e in arrivo accesi, scadenze da fatture e
    // riconciliazione accese. Ora quelle colonne non sono nel payload: devono avere lo STESSO valore predefinito
    // nel database, altrimenti la prima riga di un'azienda nascerebbe diversa da prima.
    const migrazione = readFileSync(resolve(__dirname, "../../../supabase/migrations/20260309194100_4c3090cc-aad5-4934-8208-d58f00a92c37_part6.sql"), "utf8");
    const tabella = migrazione.slice(migrazione.indexOf("CREATE TABLE IF NOT EXISTS public.scadenza_alert_prefs"));
    expect(tabella).toMatch(/alert_enabled\s+BOOLEAN\s+DEFAULT\s+true/i);
    expect(tabella).toMatch(/default_alert_days\s+INTEGER\s+DEFAULT\s+7/i);
    expect(tabella).toMatch(/alert_on_overdue\s+BOOLEAN\s+DEFAULT\s+true/i);
    expect(tabella).toMatch(/alert_on_upcoming\s+BOOLEAN\s+DEFAULT\s+true/i);
    expect(tabella).toMatch(/auto_generate_from_invoices\s+BOOLEAN\s+DEFAULT\s+true/i);
    expect(tabella).toMatch(/auto_reconcile_payments\s+BOOLEAN\s+DEFAULT\s+true/i);
    // L'email non ha un predefinito: senza scriverla resta vuota (null), come prima.
    expect(tabella).toMatch(/alert_email\s+TEXT\s*,/i);
    // Nessun'altra migrazione cambia questi predefiniti (le sole ALTER TABLE sulla tabella sono per la sicurezza a livello di riga).
    const cartella = resolve(__dirname, "../../../supabase/migrations");
    const alterTabella = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?"?scadenza_alert_prefs"?\b[^;]*;/gi;
    const cambiaColonne = readdirSync(cartella)
      .filter((nome) => nome.endsWith(".sql"))
      .filter((nome) => (readFileSync(resolve(cartella, nome), "utf8").match(alterTabella) ?? []).some((istruzione) => /\bDEFAULT\b|ADD\s+COLUMN|DROP\s+COLUMN|RENAME/i.test(istruzione)));
    expect(cambiaColonne).toEqual([]);
  });
  it("un errore di salvataggio si legge in italiano, non come «Error: …»", async () => {
    state.writeError = true; state.writeMessage = "permission denied for table scadenza_alert_prefs";
    open();
    fireEvent.change(await screen.findByLabelText("Email per avvisi"), { target: { value: "amministrazione@rossi.it" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva impostazioni" }));
    await waitFor(() => expect(state.toastError).toHaveBeenCalledOnce());
    const [titolo, opzioni] = state.toastError.mock.calls[0];
    expect(titolo).toBe("Impostazioni non salvate");
    expect(opzioni.description).toBe("Non hai i permessi per questa operazione. Contatta l'amministratore.");
    expect(JSON.stringify(state.toastError.mock.calls[0])).not.toMatch(/Error:|permission denied/);
  });
});
