/**
 * Impostazioni → Notifiche (09/10/2026): l'ordine delle cose.
 *
 * Gli «Orari di silenzio» valgono anche per le notifiche sul dispositivo ma stavano sotto «Canali» e «Ordine di
 * preferenza», che oggi non servono a nessuno (0 messaggi programmati dall'amministratore in tutte le aziende);
 * per un amministratore il primo blocco era un elenco vuoto. Ora: Avvisi → Orari di silenzio → Messaggi automatici
 * (chiusa) → Messaggi programmati (solo amministratori, in fondo). WhatsApp è «Prossimamente» come Telegram: nessun
 * codice scrive mai la verifica del numero, e il runner senza verifica lo scarta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import SettingsNotifiche from "@/pages/azienda/impostazioni/SettingsNotifiche";

const stato = vi.hoisted(() => ({
  admin: false,
  riga: null as Record<string, unknown> | null,
  flussi: [] as Record<string, unknown>[],
  scritture: [] as Record<string, unknown>[],
  aggiornamentiFlussi: [] as { tabella: string; valore: Record<string, unknown> }[],
  conferma: vi.fn(async (_opzioni: { title: string; description?: string; confirmLabel?: string }) => true),
  successo: vi.fn(),
  errore: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", email: "mario@esempio.it" }, effectiveCompany: { id: "az-1" } }),
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: stato.admin }) }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => stato.conferma }));
vi.mock("@/components/notifications/AvvisiPerEvento", () => ({
  AvvisiPerEvento: () => <section id="avvisi"><h2>Avvisi</h2></section>,
}));
vi.mock("@/components/automazioni/BulkScheduleWizard", () => ({ BulkScheduleWizard: (): null => null }));
vi.mock("sonner", () => ({ toast: { success: stato.successo, error: stato.errore } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => {
      let aggiornamento: Record<string, unknown> | null = null;
      const costruttore = {
        select: () => costruttore, eq: () => costruttore, not: () => costruttore, is: () => costruttore, order: () => costruttore,
        limit: async () => ({ data: stato.flussi, error: null as unknown }),
        maybeSingle: async () => ({ data: stato.riga, error: null as unknown }),
        upsert: async (valore: Record<string, unknown>) => { stato.scritture.push(valore); return { error: null as unknown }; },
        update: (valore: Record<string, unknown>) => { aggiornamento = valore; stato.aggiornamentiFlussi.push({ tabella, valore }); return costruttore; },
        single: async () => ({ data: aggiornamento ? { id: "x" } : (null as unknown), error: null as unknown }),
      };
      return costruttore;
    },
  },
}));

const flusso = (id: string, nome: string, status: string) => ({
  id, name: nome, status,
  bulk_trigger_config: { cron: "0 7 * * 1-5", target: { type: "role", value: "operaio" }, channels: [{ type: "silvio_chat" }], template: { mode: "ai_generated" }, next_run_at: "2026-10-12T05:00:00Z", last_run_at: null as string | null },
});

function apri(percorso = "/azienda/impostazioni/notifiche") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[percorso]}><SettingsNotifiche /></MemoryRouter></QueryClientProvider>);
}
async function caricata() { await screen.findByRole("button", { name: "Salva preferenze" }); }
const titoli = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

beforeEach(() => {
  stato.admin = false;
  stato.riga = { silvio_chat_enabled: true, email_enabled: true, email_override: null as string | null, whatsapp_phone: null as string | null, whatsapp_verified_at: null as string | null, preferred_order: ["silvio_chat", "telegram", "whatsapp", "email"], quiet_from: null as string | null, quiet_to: null as string | null };
  stato.flussi = [];
  stato.scritture.length = 0;
  stato.aggiornamentiFlussi.length = 0;
  stato.conferma.mockClear();
  stato.conferma.mockImplementation(async () => true);
  stato.successo.mockClear();
  stato.errore.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe("Notifiche: l'ordine nuovo", () => {
  it("Avvisi, poi Orari di silenzio, poi i messaggi automatici; niente titolo di primo livello", async () => {
    apri(); await caricata();
    expect(titoli()).toEqual(["Avvisi", "Orari di silenzio", "Messaggi automatici dell'amministratore"]);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByText(/Il sistema prova i canali nell'ordine che scegli sotto/)).toBeNull();
  });

  it("l'amministratore ha anche i messaggi programmati, in fondo", async () => {
    stato.admin = true;
    apri(); await caricata();
    expect(titoli()).toEqual(["Avvisi", "Orari di silenzio", "Messaggi automatici dell'amministratore", "Messaggi programmati"]);
  });

  it("chi non è amministratore non vede i messaggi programmati", async () => {
    apri(); await caricata();
    expect(screen.queryByText("Messaggi programmati")).toBeNull();
  });

  it("gli orari di silenzio dicono a cosa valgono, con le etichette collegate ai campi", async () => {
    apri(); await caricata();
    const sezione = document.getElementById("orari-di-silenzio") as HTMLElement;
    expect(within(sezione).getByText(/non arrivano avvisi sul telefono né messaggi automatici/)).toBeInTheDocument();
    expect(within(sezione).getByLabelText("Dalle")).toHaveAttribute("type", "time");
    expect(within(sezione).getByLabelText("Alle")).toHaveAttribute("type", "time");
  });
});

describe("Notifiche: salvataggio", () => {
  it("la barra col pulsante sta in vista; a riposo il pulsante è spento", async () => {
    apri(); await caricata();
    const pulsante = screen.getByRole("button", { name: "Salva preferenze" });
    expect(pulsante).toBeDisabled();
    expect((pulsante.closest("div[class*='sticky']") as HTMLElement | null)?.className).toContain("sticky");
    expect(screen.getByRole("status")).toHaveTextContent("Nessuna modifica da salvare");
  });

  it("un orario di silenzio con una sola estremità non si salva e dice perché", async () => {
    apri(); await caricata();
    fireEvent.change(screen.getByLabelText("Dalle"), { target: { value: "20:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva preferenze" }));
    await waitFor(() => expect(stato.errore).toHaveBeenCalledOnce());
    expect(stato.errore.mock.calls[0]).toEqual(["Preferenze non salvate", { description: "Indica sia l'inizio sia la fine dell'orario di silenzio." }]);
    expect(stato.scritture).toHaveLength(0);
  });

  it("inizio e fine si salvano insieme, e nessuna colonna di WhatsApp o Telegram", async () => {
    apri(); await caricata();
    fireEvent.change(screen.getByLabelText("Dalle"), { target: { value: "20:00" } });
    fireEvent.change(screen.getByLabelText("Alle"), { target: { value: "07:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva preferenze" }));
    await waitFor(() => expect(stato.successo).toHaveBeenCalledOnce());
    expect(stato.scritture[0]).toMatchObject({ user_id: "u1", company_id: "az-1", quiet_from: "20:00", quiet_to: "07:00", silvio_chat_enabled: true, email_enabled: true });
    expect(Object.keys(stato.scritture[0]).some((k) => /whatsapp|telegram/.test(k))).toBe(false);
  });
});

describe("Notifiche: messaggi automatici dell'amministratore", () => {
  const sezione = () => document.getElementById("messaggi-automatici") as HTMLElement;

  it("sono chiusi finché non si apre «Scegli i canali e l'ordine»", async () => {
    apri(); await caricata();
    const dettagli = sezione().querySelector("details") as HTMLDetailsElement;
    expect(dettagli.open).toBe(false);
    expect(within(sezione()).getByText(/Se l'amministratore programma messaggi per te/)).toBeInTheDocument();
  });

  it("l'indirizzo …#messaggi-automatici li apre già aperti e li evidenzia", async () => {
    apri("/azienda/impostazioni/notifiche#messaggi-automatici"); await caricata();
    expect((sezione().querySelector("details") as HTMLDetailsElement).open).toBe(true);
    await waitFor(() => expect(sezione()).toHaveAttribute("data-evidenziata", "true"));
  });

  it("WhatsApp e Telegram sono «Prossimamente», con l'interruttore spento e bloccato", async () => {
    apri(); await caricata();
    for (const canale of ["WhatsApp", "Telegram"]) {
      const interruttore = screen.getByRole("switch", { name: `Abilita ${canale}` });
      expect(interruttore, canale).toBeDisabled();
      expect(interruttore, canale).not.toBeChecked();
    }
    expect(screen.getAllByText("Prossimamente").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("switch", { name: "Abilita Chat Silvio nell'app" })).toBeEnabled();
    expect(screen.getByRole("switch", { name: "Abilita Email" })).toBeEnabled();
    expect(screen.queryByLabelText(/Numero WhatsApp/)).toBeNull();
  });

  it("le frecce dell'ordine dicono quale canale spostano", async () => {
    apri(); await caricata();
    expect(screen.getByRole("button", { name: "Sposta Chat Silvio nell'app più in alto" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Sposta Chat Silvio nell'app più in basso" }));
    expect(screen.getByRole("status")).toHaveTextContent("Modifiche non salvate");
    expect(screen.getByRole("button", { name: "Sposta Chat Silvio nell'app più in alto" })).toBeEnabled();
  });
});

describe("Notifiche: messaggi programmati (amministratore)", () => {
  beforeEach(() => { stato.admin = true; });

  it("senza messaggi dice una riga e come crearne uno", async () => {
    apri(); await caricata();
    const sezione = document.getElementById("messaggi-programmati") as HTMLElement;
    expect(within(sezione).getByText(/Nessun messaggio programmato\. Premi «Nuovo» per crearne uno/)).toBeInTheDocument();
    expect(within(sezione).getByRole("button", { name: "Nuovo" })).toBeInTheDocument();
    expect(within(sezione).getByRole("link", { name: "Automazioni" })).toHaveAttribute("href", "/azienda/automazioni");
  });

  it("con dei messaggi l'elenco è chiuso e si apre da «2 messaggi programmati»", async () => {
    stato.flussi = [flusso("f1", "Briefing operai", "published"), flusso("f2", "Promemoria DURC", "draft")];
    apri(); await caricata();
    const sezione = document.getElementById("messaggi-programmati") as HTMLElement;
    expect(within(sezione).getByText("2 messaggi programmati")).toBeInTheDocument();
    expect((sezione.querySelector("details") as HTMLDetailsElement).open).toBe(false);
    expect(within(sezione).getByText("attivo")).toBeInTheDocument();
    expect(within(sezione).getByText("in pausa")).toBeInTheDocument();
    expect(within(sezione).queryByText("draft")).toBeNull();
  });

  it("eliminare chiede conferma con le parole giuste: va nel cestino, non è «irreversibile»", async () => {
    stato.flussi = [flusso("f1", "Briefing operai", "published")];
    apri(); await caricata();
    fireEvent.click(screen.getByRole("button", { name: "Sposta «Briefing operai» nel cestino" }));
    await waitFor(() => expect(stato.conferma).toHaveBeenCalledOnce());
    expect(stato.conferma.mock.calls[0][0]).toMatchObject({ title: "Spostare «Briefing operai» nel cestino?", description: "Lo ritrovi in Automazioni → Cestino.", confirmLabel: "Sposta nel cestino" });
    await waitFor(() => expect(stato.aggiornamentiFlussi.some((a) => "deleted_at" in a.valore)).toBe(true));
    expect(JSON.stringify(stato.conferma.mock.calls)).not.toMatch(/irreversibile/);
  });

  it("se si rinuncia alla conferma non si sposta niente", async () => {
    stato.conferma.mockImplementation(async () => false);
    stato.flussi = [flusso("f1", "Briefing operai", "published")];
    apri(); await caricata();
    fireEvent.click(screen.getByRole("button", { name: "Sposta «Briefing operai» nel cestino" }));
    await waitFor(() => expect(stato.conferma).toHaveBeenCalledOnce());
    expect(stato.aggiornamentiFlussi).toHaveLength(0);
  });

  it("mettere in pausa un messaggio dice quale", async () => {
    stato.flussi = [flusso("f1", "Briefing operai", "published")];
    apri(); await caricata();
    fireEvent.click(screen.getByRole("button", { name: "Metti in pausa «Briefing operai»" }));
    await waitFor(() => expect(stato.aggiornamentiFlussi.some((a) => a.valore.status === "draft")).toBe(true));
  });
});
