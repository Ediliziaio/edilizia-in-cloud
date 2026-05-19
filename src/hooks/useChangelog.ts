/**
 * useChangelog — v8.6.90
 *
 * Carica entries published + calcola count "non lette" rispetto a
 * `profiles.changelog_last_seen_at`. markAsSeen() aggiorna il timestamp.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ChangelogEntry {
  id: string;
  title: string;
  body_md: string;
  category: "feature" | "improvement" | "fix" | "security" | "announcement";
  emoji: string | null;
  is_pinned: boolean;
  cta_url: string | null;
  cta_label: string | null;
  published_at: string;
  target_audience: string[] | null;
}

export function useChangelog() {
  const { user, profile, role } = useAuth();
  const queryClient = useQueryClient();

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["platform-changelog"],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ChangelogEntry[]> => {
      const { data, error } = await supabase
        .from("platform_changelog_entries")
        .select("*")
        .eq("is_published", true)
        .order("is_pinned", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ChangelogEntry[];
    },
  });

  // Filtro per target_audience
  const visible = entries.filter((e) => {
    if (!e.target_audience || e.target_audience.length === 0) return true;
    return role ? e.target_audience.includes(role) : true;
  });

  const lastSeenIso = (profile as unknown as { changelog_last_seen_at?: string | null })?.changelog_last_seen_at ?? null;
  const lastSeen = lastSeenIso ? new Date(lastSeenIso).getTime() : 0;
  const unreadCount = visible.filter((e) => new Date(e.published_at).getTime() > lastSeen).length;

  const markAsSeen = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const { error } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ changelog_last_seen_at: new Date().toISOString() } as any)
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      // Invalida profile per riprendere il nuovo timestamp
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
  });

  return {
    entries: visible,
    unreadCount,
    isLoading,
    markAsSeen: () => markAsSeen.mutate(),
  };
}
