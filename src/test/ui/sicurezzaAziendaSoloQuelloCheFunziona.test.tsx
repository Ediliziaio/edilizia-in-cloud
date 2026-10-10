/**
 * Il mio profilo → Sicurezza → «Regole di sicurezza dell'azienda» (09/10/2026).
 *
 * Su tredici comandi, tre funzionavano. Quelli che non facevano niente (2FA obbligatoria per tutti e per ruolo,
 * scadenza e regole della password, tre avvisi di sicurezza) promettevano protezioni che non c'erano: ora la
 * pagina mostra solo il blocco dopo troppi tentativi sbagliati e gli indirizzi autorizzati, e salva solo quelli.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const stato = vi.hoisted(() => ({
  ruolo: "company_admin" as string,
  azienda: { allowed_ips: null as string[] | null, max_failed_attempts: 5, lockout_duration_minutes: 30 },
  mioIndirizzo: "203.0.113.25" as string | null,
  aggiornamenti: [] as Record<string, unknown>[],
  rifiuto: null as { code?: string; message: string } | null,
  righeToccate: [{ id: "az-1" }] as { id: string }[],
  conferma: vi.fn(async (_opzioni: { title: string; description?: string }) => true),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "az-1" }, role: stato.ruolo, user: { id: "utente-1" } }),
}));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => stato.conferma }));
vi.mock("sonner", () => ({ toast: { success: stato.success, error: stato.error } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => {
      let scrittura = false;
      const costruttore = {
        select: () => costruttore,
        eq: () => costruttore,
        order: () => costruttore,
        limit: () => costruttore,
        single: async () => ({ data: { ...stato.azienda }, error: null as unknown }),
        maybeSingle: async () => ({
          data: tabella === "login_attempts" && stato.mioIndirizzo ? { ip_address: stato.mioIndirizzo } : (null as unknown),
          error: null as unknown,
        }),
        update: (valore: Record<string, unknown>) => {
          scrittura = true;
          stato.aggiornamenti.push(valore);
          return costruttore;
        },
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
          // Un database vero tiene quello che gli si scrive: la rilettura dopo il salvataggio lo ritrova.
          if (scrittura && !stato.rifiuto && stato.righeToccate.length > 0) Object.assign(stato.azienda, stato.aggiornamenti[stato.aggiornamenti.length - 1]);
          return Promise.resolve(scrittura ? { data: stato.rifiuto ? (null as unknown) : stato.righeToccate, error: stato.rifiuto } : { data: null as unknown, error: null as unknown }).then(ok, ko);
        },
      };
      return costruttore;
    },
  },
}));

// Radix Select in jsdom
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  setPointerCapture: () => {},
  scrollIntoView: () => {},
});

import { CompanySecuritySettings } from "@/components/settings/CompanySecuritySettings";
import { confermaNavigazioneImpostazioni } from "@/hooks/useSettingsDraftGuard";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");

function apri() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><CompanySecuritySettings /></MemoryRouter>
    </QueryClientProvider>,
  );
}
const campoIndirizzi = () => screen.getByLabelText(/Indirizzi da cui si può entrare/) as HTMLTextAreaElement;
async function caricata() { await screen.findByLabelText(/Indirizzi da cui si può entrare/); }
async function scegli(nomeMenu: string, opzione: RegExp) {
  fireEvent.pointerDown(screen.getByRole("combobox", { name: nomeMenu }), { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(await screen.findByRole("option", { name: opzione }));
}

beforeEach(() => {
  stato.ruolo = "company_admin";
  stato.azienda = { allowed_ips: null, max_failed_attempts: 5, lockout_duration_minutes: 30 };
  stato.mioIndirizzo = "203.0.113.25";
  stato.aggiornamenti.length = 0;
  stato.rifiuto = null;
  stato.righeToccate = [{ id: "az-1" }];
  stato.conferma.mockClear();
  stato.conferma.mockImplementation(async () => true);
  stato.success.mockClear();
  stato.error.mockClear();
});
afterEach(cleanup);

describe("Regole di sicurezza: restano solo quelle che qualcuno legge", () => {
  it("la pagina nomina soltanto le tre colonne che check-login-security legge davvero", () => {
    const pagina = leggi("src/components/settings/CompanySecuritySettings.tsx");
    const funzione = leggi("supabase/functions/check-login-security/index.ts");
    for (const colonna of ["allowed_ips", "max_failed_attempts", "lockout_duration_minutes"]) {
      expect(pagina, colonna).toContain(colonna);
      expect(funzione, `${colonna} letta dalla funzione di accesso`).toContain(colonna);
    }
    // Se qualcuno riaggiunge un comando senza lettore, questo test si rompe.
    for (const morta of [
      "enforce_2fa", "enforce_2fa_roles", "password_expiry_days", "password_min_length",
      "password_require_uppercase", "password_require_numbers", "password_require_special", "security_notifications",
    ]) {
      expect(pagina, `${morta} non ha un lettore`).not.toContain(morta);
    }
    // Nemmeno la funzione di accesso le legge: è questa la prova che erano promesse a vuoto.
    for (const morta of ["enforce_2fa", "password_expiry_days", "password_min_length", "security_notifications"]) {
      expect(funzione, morta).not.toContain(morta);
    }
  });

  it("mostra due blocchi, «Troppi tentativi sbagliati» e «Indirizzi autorizzati», e nient'altro", async () => {
    apri(); await caricata();
    expect(screen.getByRole("heading", { level: 2, name: "Regole di sicurezza dell'azienda" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Troppi tentativi sbagliati", "Indirizzi autorizzati"]);
    expect(screen.getByText("Valgono per tutte le persone dell'azienda quando entrano.")).toBeInTheDocument();
    for (const sparito of [/2FA/i, /scadenza password/i, /Lunghezza minima/i, /maiuscola/i, /Notifiche Sicurezza/i, /Brute Force/i, /Allowlist/i, /CIDR/i]) {
      expect(screen.queryByText(sparito), String(sparito)).toBeNull();
    }
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });

  it("dice senza giri di parole che un elenco sbagliato chiude fuori tutti", async () => {
    apri(); await caricata();
    expect(screen.getByText("Attenzione: se sbagli, nessuno potrà entrare, nemmeno tu.")).toBeInTheDocument();
    expect(campoIndirizzi()).toHaveAccessibleDescription(/Lascia vuoto per entrare da dove si vuole/);
  });

  it("chi non è amministratore non vede niente", () => {
    stato.ruolo = "company_staff";
    const { container } = apri();
    expect(container).toBeEmptyDOMElement();
  });

  it("dice quanto resta bloccato, con le parole di chi lo legge", async () => {
    stato.azienda.lockout_duration_minutes = 60;
    apri(); await caricata();
    expect(screen.getByText("L'account si sblocca da solo dopo 1 ora.")).toBeInTheDocument();
    await scegli("Quanto resta bloccato", /Finché non lo sblocca un amministratore/);
    expect(screen.getByText("L'account resta bloccato finché non lo sblocca un amministratore.")).toBeInTheDocument();
  });
});

describe("Regole di sicurezza: salvataggio", () => {
  it("al caricamento non ci sono modifiche e il pulsante è spento", async () => {
    apri(); await caricata();
    expect(screen.getByRole("status")).toHaveTextContent("Nessuna modifica da salvare");
    expect(screen.getByRole("button", { name: "Salva regole" })).toBeDisabled();
  });

  it("cambiare i tentativi salva soltanto i tentativi", async () => {
    apri(); await caricata();
    await scegli("Blocca l'account dopo", /7 password sbagliate/);
    expect(screen.getByRole("status")).toHaveTextContent("Modifiche non salvate");
    fireEvent.click(screen.getByRole("button", { name: "Salva regole" }));
    await waitFor(() => expect(stato.success).toHaveBeenCalledOnce());
    expect(stato.aggiornamenti).toEqual([{ max_failed_attempts: 7 }]);
  });

  it("un elenco che contiene l'indirizzo di chi salva si salva senza domande", async () => {
    apri(); await caricata();
    fireEvent.change(campoIndirizzi(), { target: { value: "203.0.113.25\n198.51.100.7" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva regole" }));
    await waitFor(() => expect(stato.success).toHaveBeenCalledOnce());
    expect(stato.conferma).not.toHaveBeenCalled();
    expect(stato.aggiornamenti).toEqual([{ allowed_ips: ["203.0.113.25", "198.51.100.7"] }]);
  });

  it("un elenco senza l'indirizzo di chi salva chiede conferma, e se si rinuncia non scrive niente", async () => {
    stato.conferma.mockImplementation(async () => false);
    apri(); await caricata();
    fireEvent.change(campoIndirizzi(), { target: { value: "198.51.100.7" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva regole" }));
    await waitFor(() => expect(stato.conferma).toHaveBeenCalledOnce());
    expect(stato.conferma.mock.calls[0][0].description).toContain("203.0.113.25");
    expect(stato.aggiornamenti).toHaveLength(0);
    expect(stato.success).not.toHaveBeenCalled();
  });

  it("se non sa quale sia l'indirizzo di chi salva, chiede conferma lo stesso", async () => {
    stato.mioIndirizzo = null;
    apri(); await caricata();
    fireEvent.change(campoIndirizzi(), { target: { value: "198.51.100.7" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva regole" }));
    await waitFor(() => expect(stato.success).toHaveBeenCalledOnce());
    expect(stato.conferma).toHaveBeenCalledOnce();
  });

  it("svuotare l'elenco riapre l'accesso da qualunque indirizzo, senza domande", async () => {
    stato.azienda.allowed_ips = ["203.0.113.25"];
    apri(); await caricata();
    fireEvent.change(campoIndirizzi(), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva regole" }));
    await waitFor(() => expect(stato.success).toHaveBeenCalledOnce());
    expect(stato.conferma).not.toHaveBeenCalled();
    expect(stato.aggiornamenti).toEqual([{ allowed_ips: null }]);
  });

  it("propone di aggiungere il proprio indirizzo e lo aggiunge", async () => {
    apri(); await caricata();
    fireEvent.change(campoIndirizzi(), { target: { value: "198.51.100.7" } });
    expect(await screen.findByText("203.0.113.25")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Aggiungilo all'elenco/ }));
    expect(campoIndirizzi().value).toBe("198.51.100.7\n203.0.113.25");
    expect(screen.queryByRole("button", { name: /Aggiungilo all'elenco/ })).toBeNull();
  });

  it("un refuso nell'elenco non si salva: chiuderebbe fuori tutti", async () => {
    apri(); await caricata();
    fireEvent.change(campoIndirizzi(), { target: { value: "203.0.113.25\n300.1.1.1" } });
    expect(screen.getByRole("alert")).toHaveTextContent("«300.1.1.1» non sembra un indirizzo");
    expect(screen.getByRole("button", { name: "Salva regole" })).toBeDisabled();
    expect(stato.aggiornamenti).toHaveLength(0);
  });

  it("un rifiuto del database dice il motivo, non «impossibile salvare»", async () => {
    stato.rifiuto = { code: "42501", message: "permission denied for table companies" };
    apri(); await caricata();
    await scegli("Blocca l'account dopo", /4 password sbagliate/);
    fireEvent.click(screen.getByRole("button", { name: "Salva regole" }));
    await waitFor(() => expect(stato.error).toHaveBeenCalledOnce());
    expect(stato.error.mock.calls[0][1]).toEqual({ description: "Non hai i permessi per questa operazione. Contatta l'amministratore." });
    // la bozza resta
    expect(screen.getByRole("status")).toHaveTextContent("Modifiche non salvate");
  });

  it("se le regole di accesso non lasciano toccare la riga non dice «salvato»", async () => {
    stato.righeToccate = [];
    apri(); await caricata();
    await scegli("Blocca l'account dopo", /4 password sbagliate/);
    fireEvent.click(screen.getByRole("button", { name: "Salva regole" }));
    await waitFor(() => expect(stato.error).toHaveBeenCalledOnce());
    expect(stato.error.mock.calls[0][1]).toEqual({ description: "Il tuo utente non può modificare le regole di sicurezza dell'azienda." });
    expect(stato.success).not.toHaveBeenCalled();
  });

  it("una modifica non salvata protegge dall'uscita, e dopo il salvataggio no", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      apri(); await caricata();
      expect(confermaNavigazioneImpostazioni()).toBe(true);
      await scegli("Blocca l'account dopo", /8 password sbagliate/);
      expect(confermaNavigazioneImpostazioni()).toBe(false);
      expect(conferma).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByRole("button", { name: "Salva regole" }));
      await waitFor(() => expect(stato.success).toHaveBeenCalledOnce());
      await waitFor(() => expect(within(screen.getByRole("status").parentElement as HTMLElement).getByRole("button", { name: "Salva regole" })).toBeDisabled());
      conferma.mockClear();
      expect(confermaNavigazioneImpostazioni()).toBe(true);
      expect(conferma).not.toHaveBeenCalled();
    } finally {
      conferma.mockRestore();
    }
  });
});
