import { cleanup, render, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  joined: false, membersError: false, ownProfileMissing: false, event: undefined as (() => void) | undefined,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "me" }, profile: { id: "me", first_name: "Mario", last_name: "Staff", email: "me@example.test" },
  effectiveCompany: { id: "company" }, role: "company_staff", isImpersonating: false,
}) }));
vi.mock("@/lib/ai/use-ai-model-selector", () => ({ useAIModelSelector: () => ({ showSelector: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async (fn: string): Promise<{ data: unknown[]; error: Error | null }> => ({ data: fn === "get_internal_chat_profiles" ? [
    { id: "me", first_name: "Mario", last_name: "Staff", email: "me@example.test" },
    { id: "other", first_name: "Giulia", last_name: "Collega", email: "other@example.test" },
  ].filter(p => !state.ownProfileMissing || p.id !== "me") : [], error: null }),
  from: (table: string) => {
    let personal = false;
    const result = (): { data: unknown[]; error: Error | null } => {
      if (table === "internal_chat_members") return { data: state.joined ? [
        { id: "membership", channel_id: "new", user_id: "me", company_id: "company", role: "member" },
        ...(!personal ? [{ id: "other-membership", channel_id: "new", user_id: "other" }] : []),
      ] : [], error: state.membersError ? new Error("Rete non disponibile") : null };
      if (table === "internal_chat_channels") return { data: state.joined ? [
        { id: "new", company_id: "company", name: "Mario & Giulia", type: "dm", is_dm: true, dm_user_ids: ["me", "other"], created_by: "other", created_at: new Date().toISOString() },
      ] : [], error: null };
      return { data: [], error: null };
    };
    const q = { select: () => q, update: () => q,
      eq: (column: string) => { if (column === "user_id") personal = true; return q; },
      in: () => q, neq: () => q, gt: () => q, order: () => q, limit: () => q,
      then: (resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
    };
    return q;
  },
  channel: (name: string) => {
    const channel = { on: (_: string, config: {table?: string}, callback: () => void) => {
      if (name.startsWith("chat-list-") && config.table === "internal_chat_messages") state.event = callback;
      return channel;
    }, subscribe: () => channel, track: async () => {}, untrack: async () => {}, send: async () => {}, presenceState: () => ({}) };
    return channel;
  }, removeChannel: vi.fn(),
} }));
import InternalChat from "@/pages/azienda/InternalChat";
function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><InternalChat /></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
  state.joined = false; state.membersError = false; state.ownProfileMissing = false; state.event = undefined;
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(async () => { cleanup(); await Promise.resolve(); });
describe("Chat Team con una nuova conversazione", () => {
  it("dall'elenco vuoto riceve la nuova chat senza ricaricare la pagina", async () => {
    open();
    expect(await screen.findByText("Nessuna chat")).toBeInTheDocument();
    state.joined = true;
    act(() => state.event?.());
    expect(await screen.findAllByText("Giulia Collega")).not.toHaveLength(0);
    expect(screen.queryByText("Nessuna chat")).not.toBeInTheDocument();
  });
  it("un errore della query mostra Riprova anziché una chat vuota", async () => {
    state.membersError = true; open();
    expect(await screen.findByText("Chat non caricata")).toBeInTheDocument();
    expect(screen.queryByText("Nessuna chat")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument();
  });
  it("conserva una chat autorizzata se l'account corrente non è nel selettore colleghi", async () => {
    state.joined = true; state.ownProfileMissing = true; open();
    expect(await screen.findAllByText("Giulia Collega")).not.toHaveLength(0);
    expect(screen.queryByText("Nessuna chat")).not.toBeInTheDocument();
    expect(screen.queryByText("?")).not.toBeInTheDocument();
  });
});
