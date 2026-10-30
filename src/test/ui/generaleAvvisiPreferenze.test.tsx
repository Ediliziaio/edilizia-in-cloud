/**
 * La riga «Commesse generali» negli Avvisi (05/11/2026): c'è solo nelle aziende che usano le commesse
 * generali, ha campanella ed email (commesse_generali_in_app / _email, lette da generali_avvisi_contesto e
 * dalla edge function generali-avvisi) e «Disattiva tutto» spegne anche lei, nella stessa scrittura.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DEFAULT_NOTIF_PREFS } from "@/hooks/useUserNotificationPrefs";

const stato = vi.hoisted(() => ({
  riga: null as Record<string, unknown> | null,
  modelli: [] as string[],
  scritture: [] as Record<string, unknown>[],
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, effectiveCompany: { id: "c1" }, profile: null as unknown }),
}));
vi.mock("@/hooks/usePushNotifications", () => ({
  usePushNotifications: () => ({ supported: true, permission: "default", isSubscribed: false, isLoading: false, subscribe: async () => {}, unsubscribe: async () => {} }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => {
      const costruttore = {
        select: () => costruttore,
        eq: () => costruttore,
        maybeSingle: async () => ({
          data: tabella === "company_commesse_generali_settings" ? { modelli_attivi: stato.modelli } : stato.riga,
          error: null as unknown,
        }),
        upsert: async (valore: Record<string, unknown>) => {
          stato.scritture.push(valore);
          stato.riga = valore;
          return { error: null as unknown };
        },
      };
      return costruttore;
    },
  },
}));

import { AvvisiPerEvento } from "@/components/notifications/AvvisiPerEvento";

function apri() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><AvvisiPerEvento conDispositivo={false} /></QueryClientProvider>);
}
const caricati = () =>
  waitFor(() => expect(screen.getByRole("switch", { name: "Messaggi dai contatti, nell'app" })).toBeEnabled(), { timeout: 4000 });

beforeEach(() => {
  stato.riga = { ...DEFAULT_NOTIF_PREFS };
  stato.modelli = [];
  stato.scritture.length = 0;
});
afterEach(cleanup);

describe("Avvisi delle commesse generali", () => {
  it("un'azienda che non le usa non vede la riga", async () => {
    apri(); await caricati();
    expect(screen.queryByText("Commesse generali")).toBeNull();
    expect(screen.getAllByRole("switch")).toHaveLength(8);
  });

  it("chi le usa la vede, con campanella ed email accese di serie", async () => {
    stato.modelli = ["appalto"];
    apri(); await caricati();
    expect(await screen.findByText("Commesse generali")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Commesse generali, nell'app" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Commesse generali, per email" })).toBeChecked();
  });

  it("spegnere l'email scrive la colonna giusta e lascia stare le altre", async () => {
    stato.modelli = ["sviluppo"];
    apri(); await caricati();
    fireEvent.click(await screen.findByRole("switch", { name: "Commesse generali, per email" }));
    await waitFor(() => expect(stato.scritture).toHaveLength(1));
    expect(stato.scritture[0]).toMatchObject({ commesse_generali_email: false, commesse_generali_in_app: true, task_overdue_email: true });
  });

  it("«Disattiva tutto» spegne anche le commesse generali, in una scrittura sola", async () => {
    stato.modelli = ["appalto"];
    apri(); await caricati();
    await screen.findByText("Commesse generali");
    fireEvent.click(screen.getByRole("button", { name: "Disattiva tutto" }));
    await waitFor(() => expect(stato.scritture).toHaveLength(1));
    expect(stato.scritture[0]).toMatchObject({ commesse_generali_in_app: false, commesse_generali_email: false, task_overdue_in_app: false });
  });
});
