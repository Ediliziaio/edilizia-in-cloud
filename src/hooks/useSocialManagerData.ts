import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  loadSocialAccountsLocal,
  loadSocialMediaLocal,
  loadSocialPostsLocal,
  saveSocialMediaLocal,
  saveSocialPostsLocal,
  socialAccountFromRow,
  socialMediaFromRow,
  socialMediaToInsert,
  socialPostChangesToPatch,
  socialPostFromRow,
  socialPostToInsert,
  updateSocialPostLocal,
  upsertSocialMediaLocal,
  upsertSocialPostLocal,
  isUuid,
} from "@/lib/social/storage";
import type { SocialConnectedAccount, SocialMediaItem, SocialScheduledPost } from "@/lib/social/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromTable = (name: string) => (supabase as any).from(name);

function isSchemaUnavailable(error: unknown) {
  const msg = String((error as Error)?.message ?? error ?? "");
  return msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("Could not find the table");
}

export function useSocialManagerData(companyId: string | undefined) {
  const qc = useQueryClient();
  const [localAccounts, setLocalAccounts] = useState<SocialConnectedAccount[]>([]);
  const [localPosts, setLocalPosts] = useState<SocialScheduledPost[]>([]);
  const [localMedia, setLocalMedia] = useState<SocialMediaItem[]>([]);

  useEffect(() => {
    if (!companyId) return;
    setLocalAccounts(loadSocialAccountsLocal(companyId));
    setLocalPosts(loadSocialPostsLocal(companyId));
    setLocalMedia(loadSocialMediaLocal(companyId));
  }, [companyId]);

  const accountsQuery = useQuery({
    queryKey: ["social-manager", "accounts", companyId],
    enabled: !!companyId,
    staleTime: 30_000,
    queryFn: async (): Promise<SocialConnectedAccount[] | null> => {
      if (!companyId) return null;
      try {
        const { data, error } = await fromTable("social_accounts")
          .select("platform_id,page_id,page_name,followers,connected_at")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("connected_at", { ascending: false });
        if (error) {
          if (isSchemaUnavailable(error)) return null;
          throw error;
        }
        return (data ?? []).map(socialAccountFromRow);
      } catch (err) {
        if (isSchemaUnavailable(err)) return null;
        throw err;
      }
    },
  });

  const postsQuery = useQuery({
    queryKey: ["social-manager", "posts", companyId],
    enabled: !!companyId,
    staleTime: 10_000,
    queryFn: async (): Promise<SocialScheduledPost[] | null> => {
      if (!companyId) return null;
      try {
        const { data, error } = await fromTable("social_posts")
          .select("*")
          .eq("company_id", companyId)
          .order("scheduled_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false });
        if (error) {
          if (isSchemaUnavailable(error)) return null;
          throw error;
        }
        return (data ?? []).map(socialPostFromRow);
      } catch (err) {
        if (isSchemaUnavailable(err)) return null;
        throw err;
      }
    },
  });

  const mediaQuery = useQuery({
    queryKey: ["social-manager", "media", companyId],
    enabled: !!companyId,
    staleTime: 30_000,
    queryFn: async (): Promise<SocialMediaItem[] | null> => {
      if (!companyId) return null;
      try {
        const { data, error } = await fromTable("social_media_items")
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false });
        if (error) {
          if (isSchemaUnavailable(error)) return null;
          throw error;
        }
        return (data ?? []).map(socialMediaFromRow);
      } catch (err) {
        if (isSchemaUnavailable(err)) return null;
        throw err;
      }
    },
  });

  const persistLocalPost = useCallback((post: SocialScheduledPost) => {
    if (!companyId) return post;
    setLocalPosts((prev) => {
      const next = upsertSocialPostLocal(prev, post);
      saveSocialPostsLocal(companyId, next);
      return next;
    });
    return post;
  }, [companyId]);

  const updateLocalPost = useCallback((id: string, changes: Partial<SocialScheduledPost>) => {
    if (!companyId) return;
    setLocalPosts((prev) => {
      const next = updateSocialPostLocal(prev, id, changes);
      saveSocialPostsLocal(companyId, next);
      return next;
    });
  }, [companyId]);

  const persistLocalMedia = useCallback((item: SocialMediaItem) => {
    if (!companyId) return item;
    setLocalMedia((prev) => {
      const next = upsertSocialMediaLocal(prev, item);
      saveSocialMediaLocal(companyId, next);
      return next;
    });
    return item;
  }, [companyId]);

  const addPostMutation = useMutation({
    mutationFn: async (post: SocialScheduledPost) => {
      if (!companyId) throw new Error("no_company_id");

      try {
        const { data, error } = await fromTable("social_posts")
          .insert(socialPostToInsert(companyId, post))
          .select("*")
          .single();
        if (error) throw error;
        return socialPostFromRow(data);
      } catch (err) {
        // Solo senza le tabelle social (ambiente non migrato) il post resta nel browser.
        if (isSchemaUnavailable(err)) return persistLocalPost(post);
        throw err;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social-manager", "posts", companyId] });
    },
    onError: (err) => {
      toast.error("Errore salvataggio post social", { description: String((err as Error).message ?? err) });
    },
  });

  const updatePostMutation = useMutation({
    mutationFn: async ({ id, changes }: { id: string; changes: Partial<SocialScheduledPost> }) => {
      if (!companyId) throw new Error("no_company_id");

      // Un post rimasto nel browser (id non uuid) si aggiorna lì.
      if (!isUuid(id)) {
        updateLocalPost(id, changes);
        return null;
      }
      try {
        const { data, error } = await fromTable("social_posts")
          .update(socialPostChangesToPatch(changes))
          .eq("id", id)
          .eq("company_id", companyId)
          .select("*")
          .single();
        if (error) throw error;
        return socialPostFromRow(data);
      } catch (err) {
        if (isSchemaUnavailable(err)) {
          updateLocalPost(id, changes);
          return null;
        }
        throw err;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social-manager", "posts", companyId] });
    },
    onError: (err) => {
      toast.error("Errore aggiornamento post social", { description: String((err as Error).message ?? err) });
    },
  });

  const addMediaMutation = useMutation({
    mutationFn: async (item: SocialMediaItem) => {
      if (!companyId) throw new Error("no_company_id");

      try {
        const { data, error } = await fromTable("social_media_items")
          .insert(socialMediaToInsert(companyId, item))
          .select("*")
          .single();
        if (error) throw error;
        return socialMediaFromRow(data);
      } catch (err) {
        if (isSchemaUnavailable(err)) return persistLocalMedia(item);
        throw err;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social-manager", "media", companyId] });
    },
    onError: (err) => {
      toast.error("Errore salvataggio media social", { description: String((err as Error).message ?? err) });
    },
  });

  const addPost = useCallback(
    (post: SocialScheduledPost) => addPostMutation.mutateAsync(post),
    [addPostMutation],
  );

  const updatePost = useCallback(
    (id: string, changes: Partial<SocialScheduledPost>) => updatePostMutation.mutateAsync({ id, changes }),
    [updatePostMutation],
  );

  const addMedia = useCallback(
    (item: SocialMediaItem) => addMediaMutation.mutateAsync(item),
    [addMediaMutation],
  );

  // Un errore vero (rete, permessi, database) si dice: prima finiva in un
  // console.warn e la pagina mostrava i dati rimasti nel browser, o niente,
  // come se l'azienda non avesse post.
  const error = (accountsQuery.error ?? postsQuery.error ?? mediaQuery.error ?? null) as Error | null;
  const { refetch: rileggiAccounts } = accountsQuery;
  const { refetch: rileggiPosts } = postsQuery;
  const { refetch: rileggiMedia } = mediaQuery;
  const riprova = useCallback(() => {
    void rileggiAccounts();
    void rileggiPosts();
    void rileggiMedia();
  }, [rileggiAccounts, rileggiMedia, rileggiPosts]);

  return useMemo(() => ({
    // Il ripiego sul browser vale solo se la query dice «tabelle assenti»
    // (null). In caricamento o con un errore vero l'elenco è vuoto, e
    // l'errore si mostra: niente dati vecchi del browser spacciati per veri.
    // Non length>0: [] se il DB è vuoto. Col vecchio check, un DB
    // legittimamente vuoto faceva RISORGERE i post cancellati rimasti nel localStorage.
    connectedAccounts: accountsQuery.data === null ? localAccounts : accountsQuery.data ?? [],
    posts: postsQuery.data === null ? localPosts : postsQuery.data ?? [],
    mediaItems: mediaQuery.data === null ? localMedia : mediaQuery.data ?? [],
    addPost,
    updatePost,
    addMedia,
    isLoading: accountsQuery.isLoading || postsQuery.isLoading || mediaQuery.isLoading,
    error,
    riprova,
  }), [
    accountsQuery.data,
    accountsQuery.isLoading,
    addMedia,
    addPost,
    error,
    localAccounts,
    localMedia,
    localPosts,
    mediaQuery.data,
    mediaQuery.isLoading,
    postsQuery.data,
    postsQuery.isLoading,
    riprova,
    updatePost,
  ]);
}
