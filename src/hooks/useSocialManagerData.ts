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
    placeholderData: null,
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
        if (!isSchemaUnavailable(err)) console.warn("[useSocialManagerData] accounts fallback", err);
        return null;
      }
    },
  });

  const postsQuery = useQuery({
    queryKey: ["social-manager", "posts", companyId],
    enabled: !!companyId,
    placeholderData: null,
    staleTime: 10_000,
    queryFn: async (): Promise<SocialScheduledPost[] | null> => {
      if (!companyId) return null;
      try {
        const { data, error } = await fromTable("social_posts")
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false });
        if (error) {
          if (isSchemaUnavailable(error)) return null;
          throw error;
        }
        return (data ?? []).map(socialPostFromRow);
      } catch (err) {
        if (!isSchemaUnavailable(err)) console.warn("[useSocialManagerData] posts fallback", err);
        return null;
      }
    },
  });

  const mediaQuery = useQuery({
    queryKey: ["social-manager", "media", companyId],
    enabled: !!companyId,
    placeholderData: null,
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
        if (!isSchemaUnavailable(err)) console.warn("[useSocialManagerData] media fallback", err);
        return null;
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
      persistLocalPost(post);

      try {
        const { data, error } = await fromTable("social_posts")
          .insert(socialPostToInsert(companyId, post))
          .select("*")
          .single();
        if (error) {
          if (isSchemaUnavailable(error)) return post;
          throw error;
        }
        return socialPostFromRow(data);
      } catch (err) {
        if (isSchemaUnavailable(err)) return post;
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
      updateLocalPost(id, changes);

      if (!isUuid(id)) return null;
      try {
        const { data, error } = await fromTable("social_posts")
          .update(socialPostChangesToPatch(changes))
          .eq("id", id)
          .eq("company_id", companyId)
          .select("*")
          .single();
        if (error) {
          if (isSchemaUnavailable(error)) return null;
          throw error;
        }
        return socialPostFromRow(data);
      } catch (err) {
        if (isSchemaUnavailable(err)) return null;
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
      persistLocalMedia(item);

      try {
        const { data, error } = await fromTable("social_media_items")
          .insert(socialMediaToInsert(companyId, item))
          .select("*")
          .single();
        if (error) {
          if (isSchemaUnavailable(error)) return item;
          throw error;
        }
        return socialMediaFromRow(data);
      } catch (err) {
        if (isSchemaUnavailable(err)) return item;
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

  return useMemo(() => ({
    connectedAccounts: accountsQuery.data ?? localAccounts,
    // ?? e non length>0: la query ritorna null solo se lo schema manca
    // (fallback beta su localStorage) e [] se il DB e' vuoto. Col vecchio
    // check, un DB legittimamente vuoto faceva RISORGERE i post cancellati
    // rimasti nel localStorage.
    posts: postsQuery.data ?? localPosts,
    mediaItems: mediaQuery.data ?? localMedia,
    addPost,
    updatePost,
    addMedia,
    isLoading: accountsQuery.isLoading || postsQuery.isLoading || mediaQuery.isLoading,
    isDbBacked: accountsQuery.data != null || postsQuery.data != null || mediaQuery.data != null,
  }), [
    accountsQuery.data,
    accountsQuery.isLoading,
    addMedia,
    addPost,
    localAccounts,
    localMedia,
    localPosts,
    mediaQuery.data,
    mediaQuery.isLoading,
    postsQuery.data,
    postsQuery.isLoading,
    updatePost,
  ]);
}
