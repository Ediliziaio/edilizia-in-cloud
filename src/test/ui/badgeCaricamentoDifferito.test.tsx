import { type PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { useMyTaskCount } from "@/hooks/useMyTaskCount";
import { useUnreadEmailCount } from "@/hooks/useUnreadEmailCount";
import { useInternalChatUnreadTotal } from "@/hooks/useInternalChatUnreadTotal";
import { useConversazioniNonLette } from "@/hooks/useConversazioniNonLette";
import { useNotifications } from "@/hooks/useNotifications";

const richieste = vi.hoisted(() => ({ letture: vi.fn(), apriCanale: vi.fn(), chiudiCanale: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "utente" }, profile: { id: "profilo" }, effectiveCompany: { id: "azienda" } }),
}));
vi.mock("@/lib/orders/archivedOrderScope", () => ({
  loadArchivedOrderIds: async (): Promise<string[]> => [],
  excludeArchivedOrders: (query: unknown) => query,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => {
      richieste.letture(tabella);
      const query = {
        select: () => query,
        eq: () => query,
        not: () => query,
        order: () => query,
        limit: () => Promise.resolve({ data: [], error: null, count: 0 }),
      };
      return query;
    },
    rpc: async (funzione: string): Promise<{ data: number | { unread_count: number }[]; error: null }> => {
      richieste.letture(funzione);
      const data = funzione === "get_internal_chat_sidebar_state" ? [{ unread_count: 3 }] : 2;
      return { data, error: null };
    },
    channel: (nome: string) => {
      richieste.apriCanale(nome);
      const canale = { on: () => canale, subscribe: () => canale };
      return canale;
    },
    removeChannel: richieste.chiudiCanale,
  },
}));

beforeEach(() => vi.clearAllMocks());

it("avvia letture e realtime solo quando servono e li sospende se la voce non è più visibile", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result, rerender, unmount } = renderHook(({ pronti }) => ({
    attivita: useMyTaskCount(pronti),
    posta: useUnreadEmailCount(pronti),
    chat: useInternalChatUnreadTotal(pronti),
    conversazioni: useConversazioniNonLette(pronti),
    notifiche: useNotifications(pronti),
  }), { wrapper, initialProps: { pronti: false } });

  expect(richieste.letture).not.toHaveBeenCalled();
  expect(richieste.apriCanale).not.toHaveBeenCalled();

  rerender({ pronti: true });
  await waitFor(() => {
    expect(result.current.chat).toBe(3);
    expect(result.current.conversazioni).toBe(2);
    expect(result.current.attivita.data?.total).toBe(0);
    expect(result.current.posta.data?.unread).toBe(0);
  });
  expect(richieste.letture.mock.calls.flat().sort()).toEqual([
    "conversazioni_non_lette", "email_inbox", "get_internal_chat_sidebar_state",
    "lifecycle_notifications", "notifications", "tasks_personali_e_aree",
  ]);
  expect(richieste.apriCanale).toHaveBeenCalledTimes(1);

  rerender({ pronti: false });
  await act(() => client.invalidateQueries());
  expect(richieste.letture).toHaveBeenCalledTimes(6);
  expect(richieste.chiudiCanale).toHaveBeenCalledTimes(1);
  unmount();
  client.clear();
});
