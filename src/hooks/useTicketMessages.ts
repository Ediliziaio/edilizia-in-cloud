import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TicketMessage } from "@/types/tickets";

const PAGE_SIZE = 100;
type Cursor = Pick<TicketMessage, "id" | "created_at">;

export function useTicketMessages(
  ticketId: string | undefined,
  queryKey: readonly unknown[],
  companyForSenderNames?: string,
) {
  const query = useInfiniteQuery({
    queryKey,
    enabled: !!ticketId,
    staleTime: 30_000,
    initialPageParam: null as Cursor | null,
    queryFn: async ({ pageParam, signal }) => {
      let request = supabase
        .from("ticket_messages")
        .select("id, message, sender_id, created_at, attachment_url")
        .eq("ticket_id", ticketId!)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE + 1);
      if (pageParam) {
        const { id, created_at } = pageParam;
        request = request.or(`created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${id})`);
      }
      const { data, error } = await request.abortSignal(signal);
      if (error) throw error;
      const rows = data.slice(0, PAGE_SIZE);
      const last = rows.at(-1);
      const senderIds = [...new Set(rows.map((row) => row.sender_id))];
      const senders = new Map<string, NonNullable<TicketMessage["sender"]>>();
      if (senderIds.length > 0) {
        let profiles = supabase.from("profiles").select("id, first_name, last_name").in("id", senderIds);
        if (companyForSenderNames) profiles = profiles.eq("company_id", companyForSenderNames);
        const { data: people, error: profilesError } = await profiles.abortSignal(signal);
        // La conversazione resta leggibile anche se i nomi non sono accessibili.
        if (!profilesError) {
          for (const { id, first_name, last_name } of people) {
            senders.set(id, { first_name: first_name ?? "", last_name: last_name ?? "" });
          }
        }
      }
      return {
        messages: rows.map((row): TicketMessage => ({ ...row, sender: senders.get(row.sender_id) ?? null })),
        older: data.length > PAGE_SIZE && last ? { id: last.id, created_at: last.created_at } : null,
      };
    },
    getNextPageParam: (last) => last.older,
  });
  const messages = useMemo(
    () => query.data?.pages.flatMap((page) => page.messages).reverse() ?? [],
    [query.data],
  );

  return {
    messages,
    isLoading: query.isLoading,
    isError: query.isError && !query.data,
    refetch: query.refetch,
    olderMessages: query.hasNextPage ? {
      load: () => query.fetchNextPage({ cancelRefetch: false }),
      loading: query.isFetchingNextPage,
      refreshing: query.isFetching,
      error: query.isFetchNextPageError,
    } : undefined,
  };
}
