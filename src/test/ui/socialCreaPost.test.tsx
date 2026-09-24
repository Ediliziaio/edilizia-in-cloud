/**
 * «Crea post» della pagina Social, usato come lo usa una persona (24/09/2026).
 *
 * - Si parte dalle sole piattaforme che possono pubblicare (BeMade: Facebook e
 *   Instagram), non da Facebook e Instagram per tutti.
 * - Se nessuna pagina può pubblicare (Green Energy, permesso in attesa di
 *   Meta) il pulsante di pubblicazione è fermo e si dice perché; la bozza sì.
 * - Gli errori si vedono dopo il primo tentativo, non mentre si scrive.
 * - Un salvataggio fallito non svuota il composer: prima il testo spariva
 *   insieme a un «Bozza salvata» falso.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { leggiStatoPubblicazione } from "@/lib/social/statoPubblicazione";

const scenario: { stato: unknown; addPost: ReturnType<typeof vi.fn> } = {
  stato: null,
  addPost: vi.fn(),
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({}),
    rpc: () => Promise.resolve({ data: null, error: null }),
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    storage: { from: () => ({}) },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuthCompany: () => ({ company: null as unknown, effectiveCompany: { id: "azienda-1", name: "Green Energy Group", sector: "fotovoltaico" } }),
  useAuthUser: () => ({ user: { id: "u1" }, role: "company_admin", isLoading: false }),
}));
vi.mock("@/hooks/useAdsAi", () => ({
  useAdsAi: () => ({ generateCopy: vi.fn(), generateImage: vi.fn(), isGeneratingCopy: false, isGeneratingImage: false }),
}));
vi.mock("@/hooks/useSocialManagerData", () => ({
  useSocialManagerData: () => ({
    connectedAccounts: [] as unknown[],
    posts: [] as unknown[],
    mediaItems: [] as unknown[],
    addPost: scenario.addPost,
    updatePost: vi.fn(),
    addMedia: vi.fn(),
    isLoading: false,
    error: null as Error | null,
    riprova: vi.fn(),
  }),
}));
vi.mock("@/hooks/useStatoPubblicazioneSocial", () => ({
  useStatoPubblicazioneSocial: () => ({
    stato: scenario.stato ? leggiStatoPubblicazione(scenario.stato) : null,
    isLoading: false,
    error: null as Error | null,
    riprova: vi.fn(),
    staVerificando: false,
    verificaNonRiuscita: false,
  }),
}));

import SocialManagerBeta from "@/pages/azienda/marketing/SocialManagerBeta";

const PRONTE = {
  modalita_post: "revisione",
  integrazione: { id: "i-1", stato: "connected", scade_il: null as string | null, scaduta: false, permessi_noti: true },
  pagine: [
    { id: "a", nome: "Bemade.", motivo: "ok", page_id: "107319265374665", piattaforma: "facebook", puo_pubblicare: true },
    { id: "b", nome: "bemade.salotti", motivo: "ok", page_id: "107319265374665", piattaforma: "instagram", puo_pubblicare: true },
  ],
};
const IN_ATTESA = {
  modalita_post: "revisione",
  integrazione: { id: "i-2", stato: "connected", scade_il: null as string | null, scaduta: false, permessi_noti: true },
  pagine: [
    { id: "c", nome: "Energia Più SRL", motivo: "in_approvazione_meta", page_id: "887506151103879", piattaforma: "facebook", puo_pubblicare: false },
  ],
};

function monta() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/azienda/marketing/social?tab=crea-post"]}>
        <SocialManagerBeta />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// I pulsanti delle piattaforme (passo 1) hanno aria-pressed; il testo inizia con l'icona.
const piattaforma = (nome: string) => screen.getAllByRole("button").find(
  (b) => b.hasAttribute("aria-pressed") && (b.textContent ?? "").includes(nome),
) as HTMLButtonElement;

describe("Crea post", () => {
  beforeEach(() => {
    scenario.addPost = vi.fn();
    try { window.localStorage.clear(); } catch { /* jsdom */ }
  });
  afterEach(() => cleanup());

  it("parte dalle piattaforme pronte, con «Pubblica ora»", () => {
    scenario.stato = PRONTE;
    monta();
    expect(piattaforma("Facebook").getAttribute("aria-pressed")).toBe("true");
    expect(piattaforma("Instagram").getAttribute("aria-pressed")).toBe("true");
    expect(piattaforma("LinkedIn").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /Pubblica su Facebook e Instagram/ })).not.toBeDisabled();
    expect(screen.getByText("2 pagine pronte a pubblicare")).toBeInTheDocument();
  });

  it("gli errori si vedono dopo il primo tentativo", () => {
    scenario.stato = PRONTE;
    monta();
    expect(screen.queryByText("Scrivi il testo del post.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Pubblica su Facebook e Instagram/ }));
    expect(screen.getByText("Scrivi il testo del post.")).toBeInTheDocument();
    expect(scenario.addPost).not.toHaveBeenCalled();
  });

  it("senza pagine pronte non pubblica, dice perché, e salva la bozza", async () => {
    scenario.stato = IN_ATTESA;
    scenario.addPost = vi.fn().mockResolvedValue({ id: "local-1", status: "draft" });
    monta();
    expect(piattaforma("Facebook").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(piattaforma("Facebook"));
    expect(screen.getByText("Per ora puoi solo salvare la bozza.")).toBeInTheDocument();
    expect(screen.getAllByText(/in attesa dell'approvazione di Meta/).length).toBeGreaterThan(0);
    const pubblica = screen.getAllByRole("button").find((b) => b.textContent === "Pubblica ora" && !b.hasAttribute("aria-pressed"));
    expect(pubblica).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Testo del post"), { target: { value: "Nuovo impianto a Monza" } });
    fireEvent.click(screen.getByRole("button", { name: /Salva bozza/ }));
    await waitFor(() => expect(scenario.addPost).toHaveBeenCalledTimes(1));
    expect(scenario.addPost.mock.calls[0][0]).toMatchObject({ status: "draft", platforms: ["facebook"], text: "Nuovo impianto a Monza" });
    await waitFor(() => expect((screen.getByLabelText("Testo del post") as HTMLTextAreaElement).value).toBe(""));
  });

  it("un salvataggio fallito non svuota il composer", async () => {
    scenario.stato = PRONTE;
    scenario.addPost = vi.fn().mockRejectedValue(new Error("permission denied"));
    monta();
    fireEvent.change(screen.getByLabelText("Testo del post"), { target: { value: "Il testo da non perdere" } });
    fireEvent.click(screen.getByRole("button", { name: /Salva bozza/ }));
    await waitFor(() => expect(scenario.addPost).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    expect((screen.getByLabelText("Testo del post") as HTMLTextAreaElement).value).toBe("Il testo da non perdere");
  });
});
