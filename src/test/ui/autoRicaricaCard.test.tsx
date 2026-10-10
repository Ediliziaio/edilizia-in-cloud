/**
 * Ricarica automatica (card in Crediti): accessibilità, bozza e errori. NESSUNA regola è cambiata.
 *
 * - Il titolo è di secondo livello e non contiene più badge e interruttore (prima un h3 con un comando dentro);
 *   l'interruttore ha un nome; soglia e importo sono collegati alle etichette; i valori pronti dicono cosa sono e se
 *   sono scelti, tenendo il testo visibile («€10») dentro il nome.
 * - Le modifiche non salvate non si perdono uscendo (useSettingsDraftGuard).
 * - Un errore dice il motivo («Aggiungi prima una carta…», «Non hai i permessi…») invece di «Errore: » più il testo del database.
 * - Il salvataggio scrive la stessa unica riga di prima (wallet_type «email», onConflict «company_id,wallet_type»).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const stato = vi.hoisted(() => ({
  righe: [] as Record<string, unknown>[],
  errore: null as unknown,
  scritture: [] as { tabella: string; righe: unknown; opzioni: unknown }[],
  guardia: [] as boolean[],
  success: vi.fn(), error: vi.fn(),
  azienda: { id: "company-1" },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: stato.azienda }) }));
vi.mock("@/hooks/useSettingsDraftGuard", () => ({ useSettingsDraftGuard: (attivo: boolean) => { stato.guardia.push(attivo); } }));
vi.mock("sonner", () => ({ toast: { success: stato.success, error: stato.error } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => ({
      select: () => ({ eq: () => ({ eq: async () => ({ data: stato.righe, error: null as unknown }) }) }),
      upsert: async (righe: unknown, opzioni: unknown) => {
        if (stato.errore) return { error: stato.errore };
        stato.scritture.push({ tabella, righe, opzioni });
        // Dopo un salvataggio la lettura dà quello che si è scritto, come il database.
        const scritta = (righe as Record<string, unknown>[])[0];
        stato.righe = [{ ...stato.righe[0], ...scritta }];
        return { error: null as unknown };
      },
    }),
  },
}));

import { UnifiedAutoTopupCard } from "@/components/credits/UnifiedAutoTopupCard";

const RIGA = {
  wallet_type: "email", enabled: true, threshold_eur: 10, topup_amount_eur: 25,
  stripe_payment_method_id: "pm_1" as string | null, last_topup_at: null as string | null,
};

function apri() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><UnifiedAutoTopupCard /></QueryClientProvider>);
}
/** Il campo c'è subito, ma i valori salvati arrivano dopo: si aspetta che siano arrivati (la soglia salvata è 10). */
const soglia = async () => {
  const campo = await screen.findByLabelText("Ricarica quando il saldo è sotto (€)");
  await waitFor(() => expect(campo).toHaveValue(10));
  return campo;
};

beforeEach(() => {
  stato.righe = [{ ...RIGA }];
  stato.errore = null;
  stato.scritture.length = 0; stato.guardia.length = 0;
  stato.success.mockClear(); stato.error.mockClear();
});
afterEach(cleanup);

describe("Ricarica automatica: nomi e titolo", () => {
  it("il titolo è di secondo livello e non contiene comandi; l'interruttore ha un nome", async () => {
    apri();
    await soglia();
    const titolo = screen.getByRole("heading", { level: 2, name: "Ricarica automatica" });
    expect(within(titolo).queryByRole("switch")).toBeNull();
    expect(titolo.textContent).not.toMatch(/Attiva|Disattivata/);
    const interruttore = screen.getByRole("switch", { name: "Ricarica automatica" });
    expect(interruttore).toBeChecked();
  });

  it("soglia e importo sono collegati alle loro etichette", async () => {
    apri();
    expect(await soglia()).toHaveValue(10);
    expect(screen.getByLabelText("Importo da ricaricare (€)")).toHaveValue(25);
  });

  it("i valori pronti tengono il testo visibile nel nome e dicono se sono scelti", async () => {
    apri();
    await soglia();
    const dieci = screen.getByRole("button", { name: "€10 di soglia" });
    const venti = screen.getByRole("button", { name: "€20 di soglia" });
    expect(dieci).toHaveAttribute("aria-pressed", "true");
    expect(venti).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(venti);
    expect(screen.getByLabelText("Ricarica quando il saldo è sotto (€)")).toHaveValue(20);
    expect(screen.getByRole("button", { name: "€20 di soglia" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "€10 di soglia" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "€25 da ricaricare" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Ricarica automatica: la bozza non si perde", () => {
  it("la guardia è accesa solo con qualcosa da salvare", async () => {
    apri();
    await soglia();
    expect(stato.guardia.at(-1)).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "€20 di soglia" }));
    await waitFor(() => expect(stato.guardia.at(-1)).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Salva per tutti i servizi" }));
    await waitFor(() => expect(stato.success).toHaveBeenCalledWith("Ricarica automatica salvata"));
    await waitFor(() => expect(stato.guardia.at(-1)).toBe(false));
  });
});

describe("Ricarica automatica: gli errori dicono il motivo, il resto non cambia", () => {
  it("senza carta salvata non scrive e lo dice con la frase di prima", async () => {
    stato.righe = [{ ...RIGA, stripe_payment_method_id: null }];
    apri();
    await soglia();
    fireEvent.click(screen.getByRole("button", { name: "€20 di soglia" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva per tutti i servizi" }));
    await waitFor(() => expect(stato.error).toHaveBeenCalledOnce());
    expect(stato.error).toHaveBeenCalledWith("Ricarica automatica non salvata", {
      description: "Aggiungi prima una carta (con una ricarica o l'abbonamento): senza carta l'auto-ricarica non può partire.",
    });
    expect(stato.scritture).toHaveLength(0);
  });

  it("un rifiuto del database si traduce (niente «Errore: new row violates…»)", async () => {
    stato.errore = { code: "42501", message: "new row violates row-level security policy for table \"company_auto_topup\"" };
    apri();
    await soglia();
    fireEvent.click(screen.getByRole("button", { name: "€20 di soglia" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva per tutti i servizi" }));
    await waitFor(() => expect(stato.error).toHaveBeenCalledOnce());
    expect(stato.error).toHaveBeenCalledWith("Ricarica automatica non salvata", {
      description: "Non hai i permessi per questa operazione. Contatta l'amministratore.",
    });
  });

  it("salvare scrive la stessa unica riga di sempre", async () => {
    apri();
    await soglia();
    fireEvent.change(screen.getByLabelText("Importo da ricaricare (€)"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva per tutti i servizi" }));
    await waitFor(() => expect(stato.success).toHaveBeenCalledWith("Ricarica automatica salvata"));
    expect(stato.scritture).toEqual([{
      tabella: "company_auto_topup",
      righe: [{ company_id: "company-1", enabled: true, threshold_eur: 10, topup_amount_eur: 50, wallet_type: "email" }],
      opzioni: { onConflict: "company_id,wallet_type" },
    }]);
  });
});
