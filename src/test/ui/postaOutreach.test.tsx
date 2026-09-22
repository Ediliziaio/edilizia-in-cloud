import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, useNavigate, type NavigateFunction } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Conversation, SenderRow, BrandRow } from "@/components/admin/outreach/useOutreachConversations";

/**
 * La Posta dell'Outreach ridisegnata (22/09/2026). Florin: «non riesco a
 * dividere le email dei brand, capire le risposte, e se clicco su una mail poi
 * non riesco a tornare indietro». Qui i suoi tre percorsi, con dati finti.
 */

const { dati, markRead } = vi.hoisted(() => {
  const markRead = { mutate: vi.fn(), isPending: false };
  return { dati: { conversations: [] as unknown[] }, markRead };
});

const mutazione = () => ({ mutate: vi.fn(), isPending: false });

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));

vi.mock("../../components/admin/outreach/useOutreachConversations", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../components/admin/outreach/useOutreachConversations")>();
  const senders: SenderRow[] = [
    { id: "s-me", email: "edoardo@mktedile.online", provider: "smtp", status: "active", brand_id: "b-me" },
    { id: "s-th", email: "filippo@thermodmr.it", provider: "smtp", status: "active", brand_id: "b-th" },
  ];
  const brands: BrandRow[] = [
    { id: "b-me", name: "Marketing Edile", status: "active", signature: null },
    { id: "b-th", name: "ThermoDMR", status: "active", signature: null },
    { id: "b-vendita", name: "Vendita Edile", status: "paused", signature: null },
  ];
  return {
    ...orig,
    useOutreachConversations: () => ({
      conversations: dati.conversations,
      counts: { interested: 0, unread: 0, read: 0, snoozed: 0, archived: 0 },
      sendersById: new Map(senders.map((s) => [s.id, s])),
      senders,
      brands,
      unreadBySender: new Map<string, number>(),
      sequenceOptions: [] as unknown[],
      isLoading: false,
      errored: null as unknown,
      tableMissing: false,
      markRead,
      markAllRead: { mutate: vi.fn(), isPending: false },
      archiveRead: { mutate: vi.fn(), isPending: false },
      setIntent: { mutate: vi.fn(), isPending: false },
      snoozeConversation: { mutate: vi.fn(), isPending: false },
      unsnooze: { mutate: vi.fn(), isPending: false },
      signatureForSender: (): string | null => null,
      queryClient: null as unknown,
    }),
    useReplyComposer: () => ({
      replyText: "", setReplyText: vi.fn(), sending: false, aiDrafting: false,
      sendReply: vi.fn(), draftWithAi: vi.fn(), summarizing: false, summarizeWithAi: vi.fn(),
    }),
    useLeadContext: () => ({ context: null as unknown, isLoading: false, liveSequence: null as unknown }),
    useLeadActions: () => ({ pauseSequence: mutazione(), resumeSequence: mutazione(), suppressContact: mutazione() }),
  };
});
vi.mock("../../components/admin/outreach/OutreachNewMailDialog", () => ({
  OutreachNewMailDialog: ({ trigger }: { trigger: React.ReactNode }): React.ReactNode => trigger,
}));
vi.mock("../../components/admin/outreach/OutreachConvertContactDialog", () => ({
  OutreachConvertContactDialog: ({ trigger }: { trigger: React.ReactNode }): React.ReactNode => trigger,
}));
vi.mock("../../components/admin/outreach/OutreachBookDemoAction", () => ({ OutreachBookDemoAction: (): null => null }));

import { OutreachMailClient } from "@/components/admin/outreach/OutreachMailClient";

function conv(over: Partial<Conversation> & { key: string; nome: string }): Conversation {
  const { nome, ...resto } = over;
  return {
    contact: { id: `c-${over.key}`, first_name: null, last_name: null, company_name: nome, email: `${over.key}@esempio.it`, phone: null, tags: null, source: null, optout_email: false, last_activity_at: null },
    email: `${over.key}@esempio.it`,
    messages: [],
    lastAt: "2026-09-22T12:00:00Z",
    lastSnippet: "Tu: Stiamo selezionando nuove aziende…",
    lastIntent: null,
    unread: false,
    hasRead: false,
    archived: false,
    senderAccountIds: [],
    primarySenderId: null,
    sentCount: 1,
    replyCount: 0,
    sequenceIds: [],
    sequenceNames: [],
    snoozedUntil: null,
    brandId: "b-me",
    tipo: "inviata",
    daRispondere: false,
    abbiamoRisposto: false,
    replyIds: [],
    unreadReplyIds: [],
    readReplyIds: [],
    lastReplyId: null,
    ultimaRisposta: null,
    testoRicerca: nome.toLowerCase(),
    ...resto,
  };
}

const POSTA: Conversation[] = [
  conv({
    key: "modonesi", nome: "Modonesi Falegnameria", brandId: "b-me", tipo: "risposta", unread: true,
    lastIntent: "interested", daRispondere: true, primarySenderId: "s-me",
    replyIds: ["r1"], unreadReplyIds: ["r1"], lastReplyId: "r1",
    ultimaRisposta: { testo: "Sì, mi interessa: chiamatemi domani", at: "2026-09-22T12:17:00Z", intent: "interested", automatica: false },
    messages: [
      { id: "s:1", direction: "out", subject: "Nuovi clienti per il bagno", body: "<p>Stiamo selezionando nuove aziende</p>", at: "2026-09-22T11:58:00Z", intent: null, senderAccountId: "s-me" },
      { id: "r:r1", direction: "in", subject: "Re: Nuovi clienti per il bagno", body: "Sì, mi interessa: chiamatemi domani", at: "2026-09-22T12:17:00Z", intent: "interested", senderAccountId: "s-me" },
    ],
  }),
  conv({
    key: "isol", nome: "ISOL SISTEM", brandId: "b-th", tipo: "risposta", lastIntent: "question",
    abbiamoRisposto: true, primarySenderId: "s-th", replyIds: ["r2"], readReplyIds: ["r2"], lastReplyId: "r2",
    ultimaRisposta: { testo: "Quanto costa il servizio?", at: "2026-09-22T11:02:00Z", intent: "question", automatica: false },
  }),
  conv({
    key: "studio", nome: "Studio Auto", brandId: "b-me", tipo: "automatica", unread: true,
    replyIds: ["r3"], unreadReplyIds: ["r3"],
    ultimaRisposta: { testo: "Abbiamo ricevuto la tua richiesta", at: "2026-09-22T10:00:00Z", intent: "auto_reply", automatica: true },
  }),
  conv({ key: "solo", nome: "Solo Inviata Srl", brandId: "b-th", tipo: "inviata" }),
];

let vai: NavigateFunction;
/** Espone la navigazione del router: vai(-1) è il tasto indietro del browser. */
function Sonda(): null {
  const navigate = useNavigate();
  useEffect(() => { vai = navigate; }, [navigate]);
  return null;
}

function mostra() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/admin/marketing"]}>
        <Sonda />
        <OutreachMailClient companyId="00000000-0000-0000-0000-000000000001" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const elenco = () => screen.getByRole("list");
const lettura = () => document.querySelector("section") as HTMLElement;

// L'elenco è virtualizzato: disegna le righe che stanno nell'altezza del
// contenitore, e in jsdom ogni altezza vale 0. Radix vuole ResizeObserver.
const misure = {
  alto: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight"),
  largo: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth"),
};
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 400 });
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterAll(() => {
  if (misure.alto) Object.defineProperty(HTMLElement.prototype, "offsetHeight", misure.alto);
  if (misure.largo) Object.defineProperty(HTMLElement.prototype, "offsetWidth", misure.largo);
});

beforeEach(() => {
  dati.conversations = POSTA;
  markRead.mutate.mockReset();
});
afterEach(cleanup);

describe("dividere la posta per brand", () => {
  it("in alto i brand attivi; quelli in pausa senza posta restano fuori", () => {
    mostra();
    const brand = screen.getByRole("tablist", { name: "Brand" });
    expect(within(brand).getByRole("tab", { name: /Tutti i brand/ })).toHaveAttribute("aria-selected", "true");
    expect(within(brand).getByRole("tab", { name: /Marketing Edile/ })).toBeInTheDocument();
    expect(within(brand).getByRole("tab", { name: /ThermoDMR/ })).toBeInTheDocument();
    expect(within(brand).queryByRole("tab", { name: /Vendita Edile/ })).toBeNull();
  });

  it("scegliendo un brand restano solo le sue conversazioni", () => {
    mostra();
    fireEvent.click(screen.getByRole("tab", { name: /ThermoDMR/ }));
    expect(within(elenco()).getByText("ISOL SISTEM")).toBeInTheDocument();
    expect(within(elenco()).queryByText("Modonesi Falegnameria")).toBeNull();
  });
});

describe("capire le risposte", () => {
  it("di partenza solo le risposte scritte da una persona, con le sue parole", () => {
    mostra();
    const lista = elenco();
    expect(within(lista).getByText("Modonesi Falegnameria")).toBeInTheDocument();
    expect(within(lista).getByText("ISOL SISTEM")).toBeInTheDocument();
    expect(within(lista).queryByText("Studio Auto")).toBeNull();
    expect(within(lista).queryByText("Solo Inviata Srl")).toBeNull();
    expect(within(lista).getByText("«Sì, mi interessa: chiamatemi domani»")).toBeInTheDocument();
    expect(within(lista).getByText("Da rispondere")).toBeInTheDocument();
    expect(within(lista).getByText("Hai risposto")).toBeInTheDocument();
  });

  it("le automatiche e le inviate hanno la loro vista", () => {
    mostra();
    fireEvent.click(screen.getByRole("tab", { name: /Automatiche/ }));
    expect(within(elenco()).getByText("Studio Auto")).toBeInTheDocument();
    expect(within(elenco()).getByText("Risposta automatica")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Inviate/ }));
    expect(within(elenco()).getByText("Solo Inviata Srl")).toBeInTheDocument();
  });

  it("nel thread si distingue chi ha scritto", () => {
    mostra();
    fireEvent.click(within(elenco()).getByText("Modonesi Falegnameria"));
    const thread = lettura();
    expect(within(thread).getByText("Tu")).toBeInTheDocument();
    expect(within(thread).getByText("da edoardo@mktedile.online")).toBeInTheDocument();
    expect(within(thread).getByText("Ha risposto")).toBeInTheDocument();
    // Aprendo si segnano lette solo le risposte di questa conversazione.
    expect(markRead.mutate).toHaveBeenCalledWith({ replyIds: ["r1"] });
  });
});

describe("tornare indietro", () => {
  const apriModonesi = () => fireEvent.click(within(elenco()).getByText("Modonesi Falegnameria"));
  const aperta = () => within(lettura()).queryByRole("button", { name: /Indietro/ }) != null;

  it("con «Indietro»", () => {
    mostra();
    apriModonesi();
    expect(aperta()).toBe(true);
    // L'elenco resta dov'era: aprire una conversazione non cambia la pagina intorno.
    expect(within(elenco()).getByText("ISOL SISTEM")).toBeInTheDocument();
    fireEvent.click(within(lettura()).getByRole("button", { name: /Indietro/ }));
    expect(aperta()).toBe(false);
    expect(within(lettura()).getByText("Scegli una risposta dall'elenco")).toBeInTheDocument();
  });

  it("con Esc", () => {
    mostra();
    apriModonesi();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(aperta()).toBe(false);
  });

  it("col tasto indietro del browser", () => {
    mostra();
    apriModonesi();
    expect(aperta()).toBe(true);
    act(() => { void vai(-1); });
    expect(aperta()).toBe(false);
  });

  it("passando da una conversazione all'altra, indietro torna all'elenco", () => {
    mostra();
    apriModonesi();
    fireEvent.click(within(elenco()).getByText("ISOL SISTEM"));
    expect(within(lettura()).getByText("ISOL SISTEM")).toBeInTheDocument();
    act(() => { void vai(-1); });
    expect(aperta()).toBe(false);
  });
});
