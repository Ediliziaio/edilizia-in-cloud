/**
 * Gli avvisi personali (09/10/2026): un componente solo per la pagina Notifiche e per la scheda del profilo.
 *
 * - Le tre email delle attività (assegnate, in scadenza, in ritardo) si accendono e si spengono anche da
 *   telefono: prima stavano solo nella scheda del profilo, che sotto i 768 px non c'è.
 * - «Disattiva tutto» spegne tutto in UNA scrittura: prima ne faceva due di fila dalla stessa copia vecchia dei
 *   dati e la seconda rimetteva acceso quello che la prima aveva spento (la campanella restava accesa).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DEFAULT_NOTIF_PREFS } from "@/hooks/useUserNotificationPrefs";

const stato = vi.hoisted(() => ({
  riga: null as Record<string, unknown> | null,
  scritture: [] as Record<string, unknown>[],
  errore: null as { code?: string; message: string } | null,
  errori: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, effectiveCompany: { id: "c1" }, profile: null as unknown }),
}));
vi.mock("@/hooks/usePushNotifications", () => ({
  usePushNotifications: () => ({ supported: true, permission: "default", isSubscribed: false, isLoading: false, subscribe: async () => {}, unsubscribe: async () => {} }),
}));
vi.mock("sonner", () => ({ toast: { error: stato.errori, success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const costruttore = {
        select: () => costruttore,
        eq: () => costruttore,
        maybeSingle: async () => ({ data: stato.riga, error: null as unknown }),
        upsert: async (valore: Record<string, unknown>) => {
          stato.scritture.push(valore);
          if (stato.errore) return { error: stato.errore };
          stato.riga = valore;
          return { error: null as unknown };
        },
      };
      return costruttore;
    },
  },
}));

import { AvvisiPerEvento } from "@/components/notifications/AvvisiPerEvento";

const IN_APP = ["message_whatsapp_in_app", "message_email_received_in_app", "task_assigned_in_app", "task_due_soon_in_app", "task_overdue_in_app"];
const EMAIL_ATTIVITA = ["task_assigned_email", "task_due_soon_email", "task_overdue_email"];

function apri(props: { conDispositivo?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><AvvisiPerEvento {...props} /></QueryClientProvider>);
}
async function caricati() {
  // Sotto carico pesante (suite intera) il primo rendering supera il secondo di attesa di default.
  await waitFor(() => expect(screen.getByRole("switch", { name: "Messaggi dai contatti, nell'app" })).toBeEnabled(), { timeout: 4000 });
}
const interruttore = (nome: string) => screen.getByRole("switch", { name: nome });
const ultima = () => stato.scritture[stato.scritture.length - 1];

beforeEach(() => {
  stato.riga = { ...DEFAULT_NOTIF_PREFS };
  stato.scritture.length = 0;
  stato.errore = null;
  stato.errori.mockClear();
});
afterEach(cleanup);

describe("Avvisi: una sezione, due colonne", () => {
  it("c'è una sezione «Avvisi» con «Nell'app» ed «Email», e l'email c'è solo sulle tre attività", async () => {
    apri(); await caricati();
    const sezione = screen.getByRole("heading", { level: 2, name: "Avvisi" }).closest("section") as HTMLElement;
    expect(within(sezione).getByText("Nell'app")).toBeInTheDocument();
    expect(within(sezione).getByText("Email")).toBeInTheDocument();
    const nomi = within(sezione).getAllByRole("switch").map((s) => s.getAttribute("aria-label"));
    expect(nomi).toEqual([
      "Notifiche su questo dispositivo",
      "Messaggi dai contatti, nell'app",
      "Email dai contatti, nell'app",
      "Attività assegnate a te, nell'app", "Attività assegnate a te, per email",
      "Attività in scadenza, nell'app", "Attività in scadenza, per email",
      "Attività in ritardo, nell'app", "Attività in ritardo, per email",
    ]);
    expect(within(sezione).getByText("Per te")).toBeInTheDocument();
  });

  it("senza la riga del dispositivo (nel campo sta già in cima alla pagina) restano gli otto avvisi", async () => {
    apri({ conDispositivo: false }); await caricati();
    expect(screen.queryByText("Su questo dispositivo")).toBeNull();
    expect(screen.getAllByRole("switch")).toHaveLength(8);
  });

  it("finché le preferenze non sono arrivate gli interruttori stanno fermi: non si scrivono i valori di serie sopra quelli della persona", () => {
    apri({ conDispositivo: false });
    for (const i of screen.getAllByRole("switch")) expect(i).toBeDisabled();
    expect(screen.getByRole("button", { name: "Disattiva tutto" })).toBeDisabled();
    expect(stato.scritture).toHaveLength(0);
  });
});

describe("Avvisi: si salva subito, una scrittura per tocco", () => {
  it("l'email di un'attività si accende da sola e il resto della riga resta com'era", async () => {
    stato.riga = { ...DEFAULT_NOTIF_PREFS, report_daily_email: false, lead_new_email: true };
    apri(); await caricati();
    expect(interruttore("Attività assegnate a te, per email")).not.toBeChecked();
    fireEvent.click(interruttore("Attività assegnate a te, per email"));
    await waitFor(() => expect(stato.scritture).toHaveLength(1));
    expect(ultima()).toMatchObject({ user_id: "u1", company_id: "c1", task_assigned_email: true, report_daily_email: false, lead_new_email: true });
    await waitFor(() => expect(interruttore("Attività assegnate a te, per email")).toBeChecked());
  });

  it("due tocchi di fila non si calpestano: il secondo parte dal primo", async () => {
    apri(); await caricati();
    fireEvent.click(interruttore("Attività in scadenza, per email"));
    fireEvent.click(interruttore("Attività assegnate a te, per email"));
    await waitFor(() => expect(stato.scritture).toHaveLength(2));
    expect(ultima()).toMatchObject({ task_due_soon_email: true, task_assigned_email: true });
  });

  it("se il salvataggio non riesce lo dice col motivo e l'interruttore torna com'era", async () => {
    stato.errore = { code: "42501", message: "permission denied for table user_notification_preferences" };
    apri(); await caricati();
    fireEvent.click(interruttore("Messaggi dai contatti, nell'app"));
    await waitFor(() => expect(stato.errori).toHaveBeenCalledOnce());
    expect(stato.errori.mock.calls[0]).toEqual(["Non sono riuscito a salvare", { description: "Non hai i permessi per questa operazione. Contatta l'amministratore." }]);
    await waitFor(() => expect(interruttore("Messaggi dai contatti, nell'app")).toBeChecked());
  });
});

describe("Avvisi: «Disattiva tutto»", () => {
  it("spegne la campanella e le email in una scrittura sola", async () => {
    apri(); await caricati();
    fireEvent.click(screen.getByRole("button", { name: "Disattiva tutto" }));
    // Si aspetta che la schermata si sia assestata: solo allora il conto delle scritture è quello definitivo.
    await screen.findByRole("button", { name: "Attiva tutto" });
    expect(stato.scritture).toHaveLength(1);
    for (const colonna of [...IN_APP, ...EMAIL_ATTIVITA]) expect(ultima()[colonna], colonna).toBe(false);
    // Le colonne che questa schermata non mostra non si toccano.
    expect(ultima().report_daily_email).toBe(DEFAULT_NOTIF_PREFS.report_daily_email);
    expect(ultima().lead_new_in_app).toBe(DEFAULT_NOTIF_PREFS.lead_new_in_app);
  });

  it("dopo, tutti gli interruttori sono spenti e il pulsante diventa «Attiva tutto»", async () => {
    apri(); await caricati();
    fireEvent.click(screen.getByRole("button", { name: "Disattiva tutto" }));
    expect(await screen.findByRole("button", { name: "Attiva tutto" })).toBeInTheDocument();
    expect(stato.scritture).toHaveLength(1);
    for (const i of screen.getAllByRole("switch")) {
      if (i.getAttribute("aria-label") === "Notifiche su questo dispositivo") continue;
      expect(i, i.getAttribute("aria-label") ?? "").not.toBeChecked();
    }
  });

  it("«Attiva tutto» riaccende tutto, sempre in una scrittura sola", async () => {
    stato.riga = { ...DEFAULT_NOTIF_PREFS, ...Object.fromEntries([...IN_APP, ...EMAIL_ATTIVITA].map((c) => [c, false])) };
    apri(); await caricati();
    fireEvent.click(screen.getByRole("button", { name: "Attiva tutto" }));
    await screen.findByRole("button", { name: "Disattiva tutto" });
    expect(stato.scritture).toHaveLength(1);
    for (const colonna of [...IN_APP, ...EMAIL_ATTIVITA]) expect(ultima()[colonna], colonna).toBe(true);
  });

  it("dopo un tocco su un interruttore parte dai valori nuovi, non da quelli vecchi", async () => {
    apri(); await caricati();
    fireEvent.click(interruttore("Attività in scadenza, per email"));
    await waitFor(() => expect(stato.scritture).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Disattiva tutto" }));
    await waitFor(() => expect(stato.scritture).toHaveLength(2));
    for (const colonna of [...IN_APP, ...EMAIL_ATTIVITA]) expect(ultima()[colonna], colonna).toBe(false);
  });
});
