import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Interfacce ───────────────────────────────────────────

export interface Campaign {
  id: string;
  name: string;
  type: "email" | "sms" | "push";
  status: "draft" | "scheduled" | "sending" | "sent" | "cancelled" | "failed";
  segment_filters: Record<string, unknown>;
  scheduled_at: string | null;
  sent_at: string | null;
  total_recipients: number;
  created_at: string;
}

export interface CampaignVariant {
  id: string;
  campaign_id: string;
  variant_name: "A" | "B" | "C";
  weight_pct: number;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  sent_count: number;
  open_count: number;
  click_count: number;
  conversion_count: number;
  unsubscribe_count: number;
}

/** Campagna con varianti annesse */
export interface CampaignWithVariants extends Campaign {
  variants: CampaignVariant[];
}

/** Payload per la creazione di una nuova campagna */
export interface CreateCampaignPayload {
  name: string;
  type: "email" | "sms" | "push";
  variants: Array<{
    variant_name: "A" | "B" | "C";
    weight_pct: number;
    subject: string;
    body_html: string;
    body_text: string;
  }>;
}

// ─── Chiavi query ─────────────────────────────────────────

const CAMPAIGNS_KEY = ["campaigns"] as const;
const campaignDetailKey = (id: string) => ["campaigns", id] as const;

// ─── Lista campagne ───────────────────────────────────────

/**
 * Hook per caricare la lista di campagne da crm_campaigns
 * con le relative varianti aggregate.
 */
export function useCampaignsList() {
  return useQuery({
    queryKey: CAMPAIGNS_KEY,
    queryFn: async (): Promise<CampaignWithVariants[]> => {
      const { data, error } = await (
        supabase
          .from("crm_campaigns" as never)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100) as unknown as Promise<{
            data: Campaign[] | null;
            error: { message: string } | null;
          }>
      );

      if (error) throw new Error(error.message);
      const campagne = data ?? [];

      // Carica le varianti per tutte le campagne trovate
      if (campagne.length === 0) return [];

      const ids = campagne.map(c => c.id);
      const { data: variantiRaw, error: errVarianti } = await (
        supabase
          .from("campaign_variants" as never)
          .select("*")
          .in("campaign_id", ids) as unknown as Promise<{
            data: CampaignVariant[] | null;
            error: { message: string } | null;
          }>
      );

      if (errVarianti) throw new Error(errVarianti.message);
      const varianti = variantiRaw ?? [];

      // Associa le varianti a ogni campagna
      return campagne.map(c => ({
        ...c,
        variants: varianti.filter(v => v.campaign_id === c.id),
      }));
    },
  });
}

// ─── Dettaglio campagna ───────────────────────────────────

/**
 * Hook per caricare il dettaglio di una singola campagna
 * con le relative varianti.
 */
export function useCampaignDetail(id: string) {
  return useQuery({
    queryKey: campaignDetailKey(id),
    enabled: !!id,
    queryFn: async (): Promise<CampaignWithVariants | null> => {
      const { data, error } = await (
        supabase
          .from("crm_campaigns" as never)
          .select("*")
          .eq("id", id)
          .single() as unknown as Promise<{
            data: Campaign | null;
            error: { message: string } | null;
          }>
      );

      if (error) throw new Error(error.message);
      if (!data) return null;

      // Carica le varianti della campagna
      const { data: variantiRaw, error: errVarianti } = await (
        supabase
          .from("campaign_variants" as never)
          .select("*")
          .eq("campaign_id", id) as unknown as Promise<{
            data: CampaignVariant[] | null;
            error: { message: string } | null;
          }>
      );

      if (errVarianti) throw new Error(errVarianti.message);

      return { ...data, variants: variantiRaw ?? [] };
    },
  });
}

// ─── Crea campagna ────────────────────────────────────────

/** Hook per creare una nuova campagna con le sue varianti A e B */
export function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateCampaignPayload) => {
      // 1. Inserisce la campagna
      const { data: campagna, error: errCampagna } = await (
        supabase
          .from("crm_campaigns" as never)
          .insert({
            name: payload.name,
            type: payload.type,
            status: "draft",
            segment_filters: {},
            total_recipients: 0,
          } as never)
          .select("id")
          .single() as unknown as Promise<{
            data: { id: string } | null;
            error: { message: string } | null;
          }>
      );

      if (errCampagna) throw new Error(errCampagna.message);
      if (!campagna) throw new Error("Campagna non creata");

      // 2. Inserisce le varianti
      const variantiDaInserire = payload.variants.map(v => ({
        campaign_id: campagna.id,
        variant_name: v.variant_name,
        weight_pct: v.weight_pct,
        subject: v.subject,
        body_html: v.body_html,
        body_text: v.body_text,
        sent_count: 0,
        open_count: 0,
        click_count: 0,
        conversion_count: 0,
        unsubscribe_count: 0,
      }));

      const { error: errVarianti } = await (
        supabase
          .from("campaign_variants" as never)
          .insert(variantiDaInserire as never) as unknown as Promise<{
            error: { message: string } | null;
          }>
      );

      if (errVarianti) throw new Error(errVarianti.message);

      return campagna.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CAMPAIGNS_KEY });
      toast.success("Campagna creata con successo");
    },
    onError: (err: Error) => {
      toast.error(`Errore nella creazione: ${err.message}`);
    },
  });
}

// ─── Aggiorna stato campagna ──────────────────────────────

/** Hook per aggiornare lo stato di una campagna */
export function useUpdateCampaignStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: Campaign["status"];
    }) => {
      const { error } = await (
        supabase
          .from("crm_campaigns" as never)
          .update({ status } as never)
          .eq("id", id) as unknown as Promise<{
            error: { message: string } | null;
          }>
      );

      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: CAMPAIGNS_KEY });
      queryClient.invalidateQueries({ queryKey: campaignDetailKey(id) });
      toast.success("Stato campagna aggiornato");
    },
    onError: (err: Error) => {
      toast.error(`Errore nell'aggiornamento: ${err.message}`);
    },
  });
}
