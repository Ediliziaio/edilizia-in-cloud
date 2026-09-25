/**
 * La griglia Instagram usata come la usa una persona (25/09/2026).
 *
 * - Il profilo è quello vero: nome utente e follower, non «tuaimpresaedile».
 * - In alto i post non ancora usciti, poi quelli già su Instagram.
 * - Il post da approvare lo dice; le bozze solo a richiesta.
 * - Cliccando un post già pubblicato si vedono i suoi numeri.
 * - «Scambia l'ordine»: due tocchi, e i due post si scambiano giorno e ora.
 * - Senza Instagram lo si dice, con il pulsante per collegarlo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { leggiStatoPubblicazione } from "@/lib/social/statoPubblicazione";

const BEMADE = "107319265374665";

const scenario = {
  posts: [] as unknown[],
  reali: [] as unknown[],
  account: [] as unknown[],
  rpc: vi.fn(),
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({}),
    rpc: (...args: unknown[]) => scenario.rpc(...args),
    functions: { invoke: () => Promise.resolve({ data: { result: {} }, error: null }) },
    storage: { from: () => ({}) },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuthCompany: () => ({ company: null as unknown, effectiveCompany: { id: "azienda-1", name: "BeMade S.r.l.", sector: "serramenti", logo_url: null as string | null } }),
  useAuthUser: () => ({ user: { id: "u1" }, role: "company_admin", isLoading: false }),
}));
vi.mock("@/hooks/useAdsAi", () => ({
  useAdsAi: () => ({ generateCopy: vi.fn(), generateImage: vi.fn(), isGeneratingCopy: false, isGeneratingImage: false }),
}));
vi.mock("@/hooks/useCompanyStaffUsers", () => ({ useCompanyStaffUsers: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/useCalendarioSocial", () => ({
  usePuoApprovareSocial: () => ({ data: true }),
  usePostFacebookEsterni: () => ({ data: { posts: [] as unknown[], errori: [] as string[] } }),
  usePostInstagramReali: () => ({ data: scenario.reali, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useSocialManagerData", () => ({
  useSocialManagerData: () => ({
    connectedAccounts: scenario.account,
    posts: scenario.posts,
    mediaItems: [] as unknown[],
    addPost: vi.fn(),
    updatePost: vi.fn(),
    deletePost: vi.fn(),
    addMedia: vi.fn(),
    isLoading: false,
    error: null as Error | null,
    riprova: vi.fn(),
  }),
}));
vi.mock("@/hooks/useStatoPubblicazioneSocial", () => ({
  useStatoPubblicazioneSocial: () => ({
    stato: leggiStatoPubblicazione({
      modalita_post: "revisione",
      integrazione: { id: "i-1", stato: "connected", scade_il: null as string | null, scaduta: false, permessi_noti: true },
      pagine: [
        { id: "a", nome: "Bemade.", motivo: "ok", page_id: BEMADE, piattaforma: "facebook", puo_pubblicare: true },
        { id: "b", nome: "bemade.salotti", motivo: "ok", page_id: BEMADE, piattaforma: "instagram", puo_pubblicare: true },
      ],
    }),
    isLoading: false,
    error: null as Error | null,
    riprova: vi.fn(),
    staVerificando: false,
    verificaNonRiuscita: false,
  }),
}));

import SocialManagerBeta from "@/pages/azienda/marketing/SocialManagerBeta";

const ADESSO = new Date(2026, 8, 25, 10, 0);
const il = (giorno: number, ora: number) => new Date(2026, 8, giorno, ora, 0).toISOString();

const post = (id: string, extra: Record<string, unknown>) => ({
  id,
  platforms: ["instagram"],
  contentType: "post",
  text: `Post ${id}`,
  hashtags: [] as string[],
  scheduled_at: il(28, 9),
  status: "scheduled",
  created_at: "2026-09-20T08:00:00Z",
  ...extra,
});

const reale = (postId: string, quando: string, testo: string) => ({
  postId,
  pageId: BEMADE,
  quando,
  formato: "foto",
  testo,
  link: `https://www.instagram.com/p/${postId}/`,
  immagine: null as string | null,
  numeri: { reazioni: 10, commenti: 2, copertura: 1630, salvataggi: 3, visualizzazioni: null as number | null },
  sincronizzatoIl: "2026-09-25T04:14:00Z",
});

function monta() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/azienda/marketing/social?tab=grid"]}>
        <SocialManagerBeta />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Le celle della griglia, nell'ordine in cui compaiono. */
const celle = () => screen.getAllByRole("button").filter((b) => b.className.includes("aspect-[3/4]"));

describe("Griglia Instagram", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(ADESSO);
    scenario.account = [
      { platform_id: "facebook", page_id: BEMADE, page_name: "Bemade.", followers: 0 },
      { platform_id: "instagram", page_id: BEMADE, page_name: "bemade.salotti", followers: 15137 },
    ];
    scenario.posts = [
      post("vicino", { scheduled_at: il(26, 9), text: "Prima della posa" }),
      post("lontano", { scheduled_at: il(30, 18), text: "Il reel del cantiere", contentType: "reel" }),
      post("attesa", { status: "review", scheduled_at: il(28, 11), text: "Promo ottobre" }),
      post("storia", { scheduled_at: il(27, 9), contentType: "story", text: "Storia del weekend" }),
      post("bozza", { status: "draft", scheduled_at: "", text: "Idea per novembre" }),
    ];
    scenario.reali = [
      reale("R2", "2026-09-10T12:26:12Z", "La vera eleganza si riconosce dal comfort"),
      reale("R1", "2026-09-04T05:42:56Z", "Il grande comfort non ha bisogno di grandi spazi"),
    ];
    scenario.rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("il profilo è quello vero, e i post sono nell'ordine di Instagram", () => {
    monta();
    // Nome utente e follower veri, nella testata del profilo.
    const testata = screen.getByText("15.137 follower").parentElement as HTMLElement;
    expect(within(testata).getByText("bemade.salotti")).toBeInTheDocument();
    expect(screen.queryByText("tuaimpresaedile")).toBeNull();
    const titoli = celle().map((c) => c.getAttribute("title") ?? "");
    expect(titoli.map((t) => t.split(" · ").pop())).toEqual([
      "Il reel del cantiere",
      "Promo ottobre",
      "Prima della posa",
      "La vera eleganza si riconosce dal comfort",
      "Il grande comfort non ha bisogno di grandi spazi",
    ]);
    // La storia non sta nel profilo; il post da approvare lo dice.
    expect(titoli.some((t) => t.includes("Storia del weekend"))).toBe(false);
    expect(within(celle()[1]).getByText("Da approvare")).toBeInTheDocument();
  });

  it("le bozze compaiono solo a richiesta, in cima", () => {
    monta();
    expect(celle().some((c) => (c.getAttribute("title") ?? "").includes("Idea per novembre"))).toBe(false);
    fireEvent.click(screen.getByLabelText("Mostra le bozze"));
    expect(celle()[0].getAttribute("title")).toContain("Idea per novembre");
  });

  it("un post già su Instagram mostra i suoi numeri", async () => {
    monta();
    fireEvent.click(celle()[3]);
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).getByText("Post su Instagram")).toBeInTheDocument();
    // In italiano i numeri a quattro cifre non hanno il punto: 1630, 15.137.
    expect(within(finestra).getByText("1630")).toBeInTheDocument();
    expect(within(finestra).getByText("persone raggiunte")).toBeInTheDocument();
    expect(within(finestra).getByRole("link", { name: /Apri su Instagram/ })).toHaveAttribute("href", "https://www.instagram.com/p/R2/");
  });

  it("«Scambia l'ordine»: due tocchi e i due post si scambiano giorno e ora", async () => {
    monta();
    fireEvent.click(screen.getByRole("button", { name: "Scambia l'ordine" }));
    fireEvent.click(celle()[0]);
    fireEvent.click(celle()[2]);
    await waitFor(() => expect(scenario.rpc).toHaveBeenCalledWith("scambia_orari_post_social", { p_primo: "lontano", p_secondo: "vicino" }));
  });

  it("«Nuovo post Instagram» apre «Crea post» già su Instagram", async () => {
    monta();
    fireEvent.click(screen.getByRole("button", { name: /Nuovo post Instagram/ }));
    const instagram = await waitFor(() => {
      const bottone = screen.getAllByRole("button").find((b) => b.hasAttribute("aria-pressed") && (b.textContent ?? "").includes("Instagram"));
      if (!bottone) throw new Error("composer non aperto");
      return bottone;
    });
    expect(instagram.getAttribute("aria-pressed")).toBe("true");
  });

  it("senza Instagram lo dice, con il pulsante per collegarlo", () => {
    scenario.account = [{ platform_id: "facebook", page_id: BEMADE, page_name: "Bemade.", followers: 0 }];
    monta();
    expect(screen.getByText("Instagram non è collegato")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Collega Instagram/ })).toBeInTheDocument();
  });
});
