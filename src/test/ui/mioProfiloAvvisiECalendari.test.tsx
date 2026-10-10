/**
 * Il mio profilo (09/10/2026), provato nei tre posti in cui si usa: l'ufficio (/azienda), il campo (/campo,
 * operai e subappaltatori) e il team della piattaforma (/admin).
 *
 * - Gli avvisi si regolano in un posto solo: nell'ufficio c'è la pagina Notifiche e la scheda del profilo non
 *   c'è più (un vecchio indirizzo rimanda lì, anche da telefono); nel campo e nel team la scheda resta, con lo
 *   stesso componente della pagina e non più con ventitré interruttori di cui quindici non facevano niente.
 * - Calendari: «Crea contatti dagli invitati» e «Mostra come Occupato» non facevano niente (nessun codice li
 *   leggeva): non ci sono più, e al loro posto la riga che dice come stanno le cose.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const FRASE_COLLEGHI = "Per ora i colleghi dell'azienda vedono il titolo degli eventi di Google nel calendario.";

const stato = vi.hoisted(() => ({
  telefono: false,
  ruolo: "company_admin" as string,
  scritture: [] as { tabella: string; azione: string; valore: Record<string, unknown> }[],
  connessioneGoogle: null as Record<string, unknown> | null,
  impostazioniGoogle: null as Record<string, unknown> | null,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "mario@esempio.it", last_sign_in_at: null as string | null },
    role: stato.ruolo,
    refreshAuth: async () => {},
    effectiveCompany: { id: "c1" },
    profile: { first_name: "Mario", last_name: "Rossi", avatar_url: null as string | null, phone: null as string | null, email: "mario@esempio.it", created_at: "2026-01-01", last_login_at: null as string | null },
  }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => stato.telefono }));
vi.mock("@/hooks/useUserCalendarPrefs", () => ({ useUserCalendarPrefs: () => ({ data: undefined as unknown }) }));
vi.mock("@/hooks/useCalendariEsterni", () => ({ useCalendariDiCasella: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/usePushNotifications", () => ({
  usePushNotifications: () => ({ supported: true, permission: "default", isSubscribed: false, isLoading: false, subscribe: async () => {}, unsubscribe: async () => {} }),
}));
vi.mock("@/components/auth/TwoFactorSetup", () => ({ TwoFactorSetup: (): null => null }));
vi.mock("@/components/integrations/EmailOAuthConnectionsCard", () => ({ EmailOAuthConnectionsCard: (): null => null }));
vi.mock("@/components/settings/OutlookCalendarConnectionTab", () => ({ default: (): null => null }));
vi.mock("@/components/settings/AppleCalendarConnectionTab", () => ({ default: (): null => null }));
vi.mock("@/components/settings/CompanySecuritySettings", () => ({ CompanySecuritySettings: () => <p>Blocco regole azienda</p> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null as unknown } }) },
    functions: { invoke: async () => ({ data: null as unknown, error: null as unknown }) },
    from: (tabella: string) => {
      const costruttore = {
        select: () => costruttore,
        eq: () => costruttore,
        single: async () => ({ data: { first_name: "Mario", last_name: "Rossi", avatar_url: null as string | null, phone: null as string | null, email: "mario@esempio.it", created_at: "2026-01-01", last_login_at: null as string | null }, error: null as unknown }),
        maybeSingle: async () => ({
          data: tabella === "google_calendar_connections" ? stato.connessioneGoogle : tabella === "google_calendar_settings" ? stato.impostazioniGoogle : (null as unknown),
          error: null as unknown,
        }),
        update: (valore: Record<string, unknown>) => {
          stato.scritture.push({ tabella, azione: "update", valore });
          return costruttore;
        },
        upsert: async (valore: Record<string, unknown>) => {
          stato.scritture.push({ tabella, azione: "upsert", valore });
          return { error: null as unknown };
        },
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null as unknown, error: null as unknown }).then(ok),
      };
      return costruttore;
    },
  },
}));

import MioProfilo from "@/pages/azienda/impostazioni/MioProfilo";
import { confermaNavigazioneImpostazioni } from "@/hooks/useSettingsDraftGuard";

function apri(percorso: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[percorso]}>
        <Routes>
          <Route path="/azienda/impostazioni/notifiche" element={<p>PAGINA NOTIFICHE</p>} />
          <Route path="*" element={<MioProfilo />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const schede = () => screen.getAllByRole("tab").map((s) => s.textContent?.trim());

beforeEach(() => {
  stato.telefono = false;
  stato.ruolo = "company_admin";
  stato.scritture.length = 0;
  stato.connessioneGoogle = null;
  stato.impostazioniGoogle = null;
});
afterEach(cleanup);

describe("Il mio profilo: gli avvisi si regolano in un posto solo", () => {
  it("nell'ufficio la scheda Notifiche non c'è", async () => {
    apri("/azienda/impostazioni/mio-profilo");
    await screen.findByRole("tab", { name: /Profilo/ });
    expect(schede()).toEqual(["Profilo", "Sicurezza", "Calendari", "Email"]);
  });

  it("nell'ufficio un vecchio indirizzo ?tab=notifiche porta alla pagina Notifiche, da computer", async () => {
    apri("/azienda/impostazioni/mio-profilo?tab=notifiche");
    expect(await screen.findByText("PAGINA NOTIFICHE")).toBeInTheDocument();
  });

  it("… e da telefono", async () => {
    stato.telefono = true;
    apri("/azienda/impostazioni/mio-profilo?tab=notifiche");
    expect(await screen.findByText("PAGINA NOTIFICHE")).toBeInTheDocument();
  });

  it("nel campo la scheda c'è, con gli avvisi che funzionano e senza i quindici che non facevano niente", async () => {
    apri("/campo/impostazioni?tab=notifiche");
    const sezione = await screen.findByRole("heading", { level: 2, name: "Avvisi" });
    expect(schede()).toContain("Notifiche");
    const avvisi = sezione.closest("section") as HTMLElement;
    // Cinque avvisi nell'app + tre email: otto interruttori, tutti accesi o spenti davvero.
    const interruttori = within(avvisi).getAllByRole("switch");
    expect(interruttori).toHaveLength(8);
    await waitFor(() => { for (const i of interruttori) expect(i).toBeEnabled(); });
    for (const sparito of ["Nuovo ordine", "Aggiornamento ordine", "Nuovo appuntamento", "Promemoria appuntamento", "Nuovo lead", "Report giornaliero", "Report settimanale", "Report mensile", "non ancora"]) {
      expect(screen.queryByText(new RegExp(sparito, "i")), sparito).toBeNull();
    }
    // Nel campo «Su questo dispositivo» sta già in cima alla pagina: non si ripete dentro la scheda.
    expect(within(avvisi).queryByText("Su questo dispositivo")).toBeNull();
  });

  it("il campo da telefono vede la scheda Notifiche (prima restava nascosta sotto i 768 px)", async () => {
    stato.telefono = true;
    apri("/campo/impostazioni?tab=notifiche");
    expect(await screen.findByRole("heading", { level: 2, name: "Avvisi" })).toBeInTheDocument();
    expect(schede()).toEqual(["Profilo", "Sicurezza", "Calendari", "Email", "Notifiche"]);
  });

  it("nel team della piattaforma la scheda c'è e porta anche «Su questo dispositivo»", async () => {
    apri("/admin/impostazioni/mio-profilo?tab=notifiche");
    const sezione = await screen.findByRole("heading", { level: 2, name: "Avvisi" });
    expect(within(sezione.closest("section") as HTMLElement).getByText("Su questo dispositivo")).toBeInTheDocument();
  });
});

describe("Il mio profilo: Calendari dice la verità", () => {
  beforeEach(() => {
    stato.connessioneGoogle = { id: "g1", status: "connected", google_account_email: "mario@gmail.com", last_sync_at: "2026-10-01T08:00:00Z" };
    stato.impostazioniGoogle = { sync_mode: "two_way", import_google_events_to_crm: true, event_privacy: "busy_only", create_contacts_from_guests: true, primary_calendar_id: "primary" };
  });

  it("chi aveva acceso «Occupato» non vede più una protezione che non c'è: la scheda dice cosa vedono i colleghi", async () => {
    apri("/azienda/impostazioni/mio-profilo?tab=calendari");
    expect(await screen.findByText(FRASE_COLLEGHI)).toBeInTheDocument();
    expect(screen.queryByText(/Privacy eventi Google/)).toBeNull();
    expect(screen.queryByText(/Occupato/)).toBeNull();
  });

  it("i pulsanti e i testi sono in italiano", async () => {
    apri("/azienda/impostazioni/mio-profilo?tab=calendari");
    for (const nome of ["Aggiorna ora", "Preferenze del calendario", "Scollega"]) {
      expect(await screen.findByRole("button", { name: nome })).toBeInTheDocument();
    }
    expect(screen.getByText(/Ultimo aggiornamento:/)).toBeInTheDocument();
    expect(screen.getByText("Come funziona il collegamento")).toBeInTheDocument();
    expect(screen.queryByText(/sync/i)).toBeNull();
  });

  it("salvando le preferenze non si riscrivono le due colonne che nessuno legge", async () => {
    apri("/azienda/impostazioni/mio-profilo?tab=calendari");
    fireEvent.click(await screen.findByRole("button", { name: "Preferenze del calendario" }));
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).getByRole("heading", { name: "Preferenze del calendario" })).toBeInTheDocument();
    expect(within(finestra).queryByText(/Crea contatti dagli invitati/)).toBeNull();
    expect(within(finestra).queryByText(/"Occupato"/)).toBeNull();
    expect(within(finestra).getByText(FRASE_COLLEGHI)).toBeInTheDocument();
    fireEvent.click(within(finestra).getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(stato.scritture.some((s) => s.tabella === "google_calendar_settings")).toBe(true));
    const scritto = stato.scritture.find((s) => s.tabella === "google_calendar_settings")!;
    expect(Object.keys(scritto.valore).sort()).toEqual(["import_google_events_to_crm", "sync_mode"]);
    expect(JSON.stringify(stato.scritture)).not.toMatch(/event_privacy|create_contacts_from_guests/);
  });
});

describe("Il mio profilo: dati personali", () => {
  it("modificare il nome protegge dall'uscita; il pulsante della foto ha un nome", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      apri("/azienda/impostazioni/mio-profilo");
      expect(await screen.findByRole("button", { name: "Cambia foto" })).toBeInTheDocument();
      expect(confermaNavigazioneImpostazioni()).toBe(true);
      fireEvent.change(await screen.findByLabelText("Nome"), { target: { value: "Marco" } });
      expect(confermaNavigazioneImpostazioni()).toBe(false);
      expect(screen.getByRole("button", { name: "Salva modifiche" })).toBeEnabled();
    } finally {
      conferma.mockRestore();
    }
  });

  it("il blocco delle regole dell'azienda sta nella scheda Sicurezza per gli amministratori", async () => {
    apri("/azienda/impostazioni/mio-profilo?tab=sicurezza");
    expect(await screen.findByText("Blocco regole azienda")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cambia password" })).toBeInTheDocument();
    expect(screen.getByText("Privacy e dati personali")).toBeInTheDocument();
  });
});
