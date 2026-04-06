/**
 * Hook per la gestione del setup Telnyx per-tenant.
 * SubAccount + numero dedicato + ricerca numeri disponibili.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type {
  SmsTelnyxAccount,
  SmsTelnyxNumber,
  TelnyxNumeroDisponibile,
  TelnyxAttivaRequest,
  TelnyxAttivaResponse,
  TelnyxCercaNumeriRequest,
  TelnyxCercaNumeriResponse,
  TelnyxAcquistaNumeroRequest,
  TelnyxAcquistaNumeroResponse,
} from "@/types/sms-marketing";

const TELNYX_ACCOUNT_KEY = "sms-telnyx-account";
const TELNYX_NUMBER_KEY  = "sms-telnyx-number";

export function useTelnyxSetup() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  // ─── Sub-account ─────────────────────────────────────────
  const { data: account, isLoading: isLoadingAccount } = useQuery({
    queryKey: [TELNYX_ACCOUNT_KEY, companyId],
    queryFn: async (): Promise<SmsTelnyxAccount | null> => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("sms_telnyx_accounts")
        .select("id, company_id, telnyx_account_id, stato, attivato_at, created_at, updated_at")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data as SmsTelnyxAccount | null;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // ─── Numero dedicato ──────────────────────────────────────
  const { data: numero, isLoading: isLoadingNumero } = useQuery({
    queryKey: [TELNYX_NUMBER_KEY, companyId],
    queryFn: async (): Promise<SmsTelnyxNumber | null> => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("sms_telnyx_numbers")
        .select("id, company_id, numero_e164, numero_display, prefisso_area, citta, stato, costo_mensile_cliente, data_acquisto, prossimo_rinnovo")
        .eq("company_id", companyId)
        .eq("stato", "attivo")
        .maybeSingle();
      if (error) throw error;
      return data as SmsTelnyxNumber | null;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // ─── Ricerca numeri disponibili ───────────────────────────
  const cercaNumeriMutation = useMutation({
    mutationFn: async (params: Omit<TelnyxCercaNumeriRequest, "company_id">): Promise<TelnyxNumeroDisponibile[]> => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const { data, error } = await supabase.functions.invoke<TelnyxCercaNumeriResponse>(
        "telnyx-cerca-numeri",
        { body: { company_id: companyId, ...params } satisfies TelnyxCercaNumeriRequest }
      );
      if (error) throw new Error(error.message || "Errore nella ricerca dei numeri");
      return data?.numeri ?? [];
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ─── Acquisto numero ──────────────────────────────────────
  const acquistaNumeroMutation = useMutation({
    mutationFn: async (numero_e164: string): Promise<TelnyxAcquistaNumeroResponse> => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const { data, error } = await supabase.functions.invoke<TelnyxAcquistaNumeroResponse>(
        "telnyx-acquista-numero",
        { body: { company_id: companyId, numero_e164 } satisfies TelnyxAcquistaNumeroRequest }
      );
      if (error) throw new Error(error.message || "Errore nell'acquisto del numero");
      if (!data?.success) throw new Error("Acquisto non completato");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [TELNYX_NUMBER_KEY, companyId] });
      queryClient.invalidateQueries({ queryKey: [TELNYX_ACCOUNT_KEY, companyId] });
      queryClient.invalidateQueries({ queryKey: ["sms-provider-config", companyId] });
      toast.success(`Numero ${data.numero_display} attivato con successo!`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ─── Attiva azienda (SuperAdmin) ──────────────────────────
  const attivaAziendaMutation = useMutation({
    mutationFn: async (targetCompanyId: string): Promise<TelnyxAttivaResponse> => {
      const { data, error } = await supabase.functions.invoke<TelnyxAttivaResponse>(
        "telnyx-attiva-azienda",
        { body: { company_id: targetCompanyId } satisfies TelnyxAttivaRequest }
      );
      if (error) throw new Error(error.message || "Errore nell'attivazione");
      if (!data?.success) throw new Error("Attivazione non completata");
      return data;
    },
    onSuccess: () => toast.success("Azienda attivata su Telnyx"),
    onError: (err: Error) => toast.error(err.message),
  });

  const isOnboardingCompleto = !!numero && numero.stato === "attivo";

  return {
    account,
    numero,
    isLoadingAccount,
    isLoadingNumero,
    isLoading: isLoadingAccount || isLoadingNumero,
    isOnboardingCompleto,
    // Ricerca numeri
    cercaNumeri: (params: Omit<TelnyxCercaNumeriRequest, "company_id">) => cercaNumeriMutation.mutateAsync(params),
    isCercando: cercaNumeriMutation.isPending,
    // Acquisto numero
    acquistaNumero: (n: string) => acquistaNumeroMutation.mutateAsync(n),
    isAcquistando: acquistaNumeroMutation.isPending,
    // Attiva azienda (SuperAdmin)
    attivaAzienda: (id: string) => attivaAziendaMutation.mutateAsync(id),
    isAttivando: attivaAziendaMutation.isPending,
  };
}
