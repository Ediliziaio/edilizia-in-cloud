/**
 * Il calendario social usato come lo usa una persona (24/09/2026).
 *
 * - La settimana mostra anche i post delle 7:00 e delle 21:30 (prima: 8-20).
 * - Un post mai uscito è «In ritardo», uno uscito a metà «Uscito in parte».
 * - Le bozze stanno nel loro elenco, non su «domani».
 * - Approva solo chi può approvare, e solo verso le pagine pronte.
 * - Dal post aperto si elimina (con conferma); da un giorno si crea un post
 *   con la data già scelta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { leggiStatoPubblicazione } from "@/lib/social/statoPubblicazione";

const scenario = {
  posts: [] as unknown[],
  esterni: [] as unknown[],
  puoApprovare: false,
  updatePost: vi.fn(),
  deletePost: vi.fn(),
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({}),
    rpc: () => Promise.resolve({ data: null, error: null }),
    functions: { invoke: () => Promise.resolve({ data: { result: {} }, error: null }) },
    storage: { from: () => ({}) },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuthCompany: () => ({ company: null as unknown, effectiveCompany: { id: "azienda-1", name: "BeMade S.r.l.", sector: "serramenti" } }),
  useAuthUser: () => ({ user: { id: "u1" }, role: "company_admin", isLoading: false }),
}));
vi.mock("@/hooks/useAdsAi", () => ({
  useAdsAi: () => ({ generateCopy: vi.fn(), generateImage: vi.fn(), isGeneratingCopy: false, isGeneratingImage: false }),
}));
vi.mock("@/hooks/useCompanyStaffUsers", () => ({
  useCompanyStaffUsers: () => ({ data: [{ id: "u-staff", first_name: "Venusia", last_name: "Rossi" }] }),
}));
vi.mock("@/hooks/useCalendarioSocial", () => ({
  usePuoApprovareSocial: () => ({ data: scenario.puoApprovare }),
  usePostFacebookEsterni: () => ({ data: { posts: scenario.esterni, errori: [] as string[] } }),
  usePostInstagramReali: () => ({ data: [] as unknown[], isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useSocialManagerData", () => ({
  useSocialManagerData: () => ({
    connectedAccounts: [] as unknown[],
    posts: scenario.posts,
    mediaItems: [] as unknown[],
    addPost: vi.fn(),
    updatePost: scenario.updatePost,
    deletePost: scenario.deletePost,
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
        { id: "a", nome: "Bemade.", motivo: "ok", page_id: "107", piattaforma: "facebook", puo_pubblicare: true },
        { id: "b", nome: "bemade.salotti", motivo: "in_approvazione_meta", page_id: "107", piattaforma: "instagram", puo_pubblicare: false },
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

// Giovedì 24 settembre 2026, 17:44, ora locale di chi guarda.
const ADESSO = new Date(2026, 8, 24, 17, 44);
const il = (giorno: number, ora: number, minuti = 0) => new Date(2026, 8, giorno, ora, minuti).toISOString();

const post = (id: string, extra: Record<string, unknown>) => ({
  id,
  platforms: ["facebook"],
  contentType: "post",
  text: `Post ${id}`,
  hashtags: [] as string[],
  scheduled_at: il(29, 9),
  status: "scheduled",
  created_at: "2026-09-20T08:00:00Z",
  ...extra,
});

function monta() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/azienda/marketing/social?tab=calendario"]}>
        <SocialManagerBeta />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Calendario social", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(ADESSO);
    scenario.posts = [];
    scenario.esterni = [];
    scenario.puoApprovare = false;
    scenario.updatePost = vi.fn().mockResolvedValue(null);
    scenario.deletePost = vi.fn().mockResolvedValue(undefined);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("la settimana mostra anche i post delle 7:00 e delle 21:30", () => {
    scenario.posts = [
      post("alba", { scheduled_at: il(25, 7), text: "Buongiorno dal cantiere" }),
      post("sera", { scheduled_at: il(25, 21, 30), text: "Serata porte aperte" }),
    ];
    monta();
    fireEvent.click(screen.getByRole("button", { name: "Settimana" }));
    // Le righe delle 7 e delle 21 ci sono (la prima «07:00» è l'etichetta della riga).
    expect(screen.getAllByText("07:00").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("21:00")).toBeInTheDocument();
    expect(screen.getAllByTitle(/07:00 · Programmato · Buongiorno dal cantiere/).length).toBeGreaterThan(0);
    expect(screen.getAllByTitle(/21:30 · Programmato · Serata porte aperte/).length).toBeGreaterThan(0);
  });

  it("dice la verità: in ritardo, uscito in parte, e le bozze nel loro elenco", () => {
    scenario.posts = [
      post("ritardo", { scheduled_at: il(23, 10), text: "Doveva uscire ieri" }),
      post("parziale", {
        status: "published",
        scheduled_at: il(16, 9),
        platforms: ["facebook", "instagram"],
        text: "Offerta di settembre",
        publishResult: { facebook: { ok: true, id: "107_1" }, instagram: { ok: false, error: "JPEG non valido" } },
      }),
      post("bozza", { status: "draft", scheduled_at: "", text: "Idea per ottobre", reviewNote: "Metti la foto" }),
    ];
    monta();
    const daSistemare = screen.getByText("Da sistemare", { selector: "p" }).parentElement as HTMLElement;
    expect(within(daSistemare).getByText("In ritardo")).toBeInTheDocument();
    expect(within(daSistemare).getByText("Uscito in parte")).toBeInTheDocument();
    const bozze = screen.getByText("Bozze", { selector: "p", exact: false }).parentElement as HTMLElement;
    expect(within(bozze).getByText("Idea per ottobre")).toBeInTheDocument();
    expect(within(bozze).getByText("Rimandato: Metti la foto")).toBeInTheDocument();
    // La bozza non sta nella griglia del mese.
    expect(screen.queryAllByTitle(/Idea per ottobre/)).toHaveLength(0);
  });

  it("chi non approva non vede «Approva»", () => {
    scenario.posts = [post("attesa", { status: "review", scheduled_at: il(26, 11), createdBy: "u-staff" })];
    monta();
    expect(screen.getByText(/aspetta l'approvazione del titolare o di un amministratore/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approva/ })).toBeNull();
  });

  it("chi approva: «Approva» manda il post solo dove può uscire", async () => {
    scenario.puoApprovare = true;
    scenario.posts = [post("attesa", { status: "review", scheduled_at: il(26, 11), platforms: ["facebook", "instagram"], createdBy: "u-staff" })];
    monta();
    expect(screen.getByText("1 post da approvare")).toBeInTheDocument();
    expect(screen.getByText(/di Venusia Rossi/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Approva$/ }));
    await waitFor(() => expect(scenario.updatePost).toHaveBeenCalledTimes(1));
    expect(scenario.updatePost).toHaveBeenCalledWith("attesa", {
      status: "scheduled",
      platforms: ["facebook"],
      targetPageIds: { facebook: "107" },
      reviewNote: undefined,
    });
  });

  it("dal post aperto si elimina, dopo la conferma", async () => {
    scenario.posts = [post("prossimo", { scheduled_at: il(29, 9), text: "Nuovo showroom a Lissone" })];
    monta();
    const prossimi = screen.getByText("Prossimi 14 giorni").parentElement as HTMLElement;
    fireEvent.click(within(prossimi).getByText("Nuovo showroom a Lissone"));
    const finestra = await screen.findByRole("dialog");
    fireEvent.click(within(finestra).getByRole("button", { name: "Elimina" }));
    expect(scenario.deletePost).not.toHaveBeenCalled();
    fireEvent.click(within(finestra).getByRole("button", { name: "Sì, elimina" }));
    await waitFor(() => expect(scenario.deletePost).toHaveBeenCalledWith("prossimo"));
  });

  it("il «+» di un giorno apre «Crea post» su «Programma», con quel giorno", async () => {
    monta();
    fireEvent.click(screen.getByRole("button", { name: "Nuovo post il 26 Settembre" }));
    expect(await screen.findByDisplayValue("2026-09-26")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Programma/, pressed: true })).toBeInTheDocument();
  });

  it("i post fatti direttamente su Facebook si vedono, tratteggiati e separati", () => {
    scenario.posts = [post("mio", { scheduled_at: il(29, 9) })];
    scenario.esterni = [{ id: "107_9", pageId: "107", pagina: "Bemade.", testo: "Foto dal cantiere di Monza", quando: il(22, 18), link: "https://facebook.com/107_9", immagine: null }];
    monta();
    expect(screen.getByRole("button", { name: /Fatti su Facebook/ })).toBeInTheDocument();
    expect(screen.getAllByTitle(/Su Facebook, fuori dall'app · Foto dal cantiere di Monza/).length).toBeGreaterThan(0);
  });
});
