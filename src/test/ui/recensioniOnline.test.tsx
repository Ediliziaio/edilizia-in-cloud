import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Il voto su Google o Trustpilot nel Profilo azienda (22/09/2026): esce nella
 * pagina «Dicono di noi» dei preventivi. Si salva solo un voto vero, con la data
 * in cui è stato scritto; un salvataggio che i permessi bloccano lo dice.
 */

const stato = vi.hoisted(() => ({
  salvati: [] as unknown[],
  scritto: null as unknown,
  righeToccate: [{ id: "az-1" }] as Array<{ id: string }>,
}));

vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "az-1" }));
vi.mock("@/hooks/useVotiOnline", () => ({
  useVotiOnline: () => ({ voti: [] as unknown[], grezzo: stato.salvati, caricato: true }),
  useAggiornaVotiOnline: () => async () => {},
}));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (valore: { recensioni_online: unknown }) => {
        stato.scritto = valore.recensioni_online;
        return { eq: () => ({ select: async () => ({ data: stato.righeToccate, error: null as Error | null }) }) };
      },
    }),
  },
}));

import { RecensioniOnlineForm } from "@/components/settings/RecensioniOnlineForm";

afterEach(() => {
  cleanup();
  toast.mockClear();
  stato.salvati = [];
  stato.scritto = null;
  stato.righeToccate = [{ id: "az-1" }];
});

describe("Profilo azienda — Recensioni online", () => {
  it("senza voti lo dice; un voto fuori scala non si salva", () => {
    render(<RecensioniOnlineForm canEdit />);
    expect(screen.getByText(/Nessun voto: nei preventivi/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /aggiungi un voto/i }));
    fireEvent.change(screen.getByLabelText("Voto"), { target: { value: "6" } });
    expect(screen.getByText("Il voto va da 1 a 5.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^salva$/i })).toBeDisabled();
  });

  it("salva voto, numero e data; l'anteprima scrive all'italiana", async () => {
    render(<RecensioniOnlineForm canEdit />);
    fireEvent.click(screen.getByRole("button", { name: /aggiungi un voto/i }));
    fireEvent.change(screen.getByLabelText("Voto"), { target: { value: "4,8" } });
    fireEvent.change(screen.getByLabelText("N. recensioni"), { target: { value: "126" } });
    expect(screen.getByText("126 recensioni")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^salva$/i }));
    await waitFor(() => expect(stato.scritto).not.toBeNull());
    const [voto] = stato.scritto as Array<Record<string, unknown>>;
    expect(voto).toMatchObject({ piattaforma: "google", voto: 4.8, numero: 126, link: null });
    expect(String(voto.aggiornato)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("se i permessi bloccano il salvataggio, non dice «salvato»", async () => {
    stato.righeToccate = [];
    stato.salvati = [{ piattaforma: "google", voto: 4.8, numero: 126, aggiornato: "2026-09-01" }];
    render(<RecensioniOnlineForm canEdit />);
    fireEvent.change(screen.getByLabelText("Voto"), { target: { value: "4,9" } });
    fireEvent.click(screen.getByRole("button", { name: /^salva$/i }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0][0]).toMatchObject({ title: "Non salvato", variant: "destructive" });
  });

  it("un voto rimasto uguale tiene la data di quando è stato scritto", async () => {
    stato.salvati = [{ piattaforma: "trustpilot", voto: 4.6, numero: 41, aggiornato: "2026-09-01" }];
    render(<RecensioniOnlineForm canEdit />);
    fireEvent.change(screen.getByLabelText(/Indirizzo della scheda/), { target: { value: "trustpilot.com/review/esempio.it" } });
    fireEvent.click(screen.getByRole("button", { name: /^salva$/i }));
    await waitFor(() => expect(stato.scritto).not.toBeNull());
    expect((stato.scritto as Array<Record<string, unknown>>)[0]).toMatchObject({ voto: 4.6, aggiornato: "2026-09-01", link: "trustpilot.com/review/esempio.it" });
  });
});
