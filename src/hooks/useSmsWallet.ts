/**
 * Hook per la gestione del wallet SMS prepagato.
 * Crediti, pacchetti e ricarica via Stripe.
 *
 * Le transazioni paginate vivono in useSmsWalletTransazioni (hook separato)
 * per rispettare le regole di React (no hooks dentro funzioni).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import type {
  SmsWallet,
  SmsWalletTransazione,
  SmsPacchettoCrediti,
  SmsRicaricaRequest,
  SmsRicaricaResponse,
} from "@/types/sms-marketing";

const WALLET_KEY       = "sms-wallet";
const TRANSAZIONI_KEY  = "sms-wallet-transazioni";
const PACCHETTI_KEY    = "sms-pacchetti-crediti";

export function useSmsRicaricaEsito(sessionId: string | null) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const ricevuta = useQuery({
    queryKey: ["sms-checkout-ricevuta", companyId, sessionId],
    enabled: !!companyId && !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase.from("sms_checkout_receipts").select("credit_cents, credited_at")
        .eq("company_id", companyId!).eq("checkout_id", sessionId!).maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) => q.state.data || q.state.dataUpdateCount + q.state.errorUpdateCount >= 12 ? false : 2500,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    if (!ricevuta.data || !companyId) return;
    void queryClient.invalidateQueries({ queryKey: [WALLET_KEY, companyId] });
    void queryClient.invalidateQueries({ queryKey: [TRANSAZIONI_KEY, companyId] });
  }, [ricevuta.data, companyId, queryClient]);
  return ricevuta;
}

// ─── Transazioni paginate (hook separato — regola hooks) ──────────────────────

export function useSmsWalletTransazioni(page: number = 0, pageSize: number = 20) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: [TRANSAZIONI_KEY, companyId, page, pageSize],
    queryFn: async (): Promise<{ items: SmsWalletTransazione[]; total: number }> => {
      if (!companyId) return { items: [], total: 0 };
      const from = page * pageSize;
      const to   = from + pageSize - 1;
      const { data, error, count } = await supabase
        .from("sms_wallet_transazioni")
        .select(
          "id, company_id, tipo, importo, saldo_dopo, descrizione, riferimento_id, stripe_payment_intent_id, created_at",
          { count: "exact" }
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { items: (data ?? []) as SmsWalletTransazione[], total: count ?? 0 };
    },
    enabled: !!companyId,
  });
}

// ─── Wallet principale ────────────────────────────────────────────────────────

export function useSmsWallet() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  // ─── Wallet ─────────────────────────────────────────────
  const { data: wallet, isLoading: isLoadingWallet } = useQuery({
    queryKey: [WALLET_KEY, companyId],
    queryFn: async (): Promise<SmsWallet | null> => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("sms_wallet")
        .select("id, company_id, crediti, crediti_riservati, totale_ricaricato, totale_speso, ultima_ricarica_at, updated_at")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data as SmsWallet | null;
    },
    enabled: !!companyId,
    staleTime: 30 * 1000, // Rifresca ogni 30s per mostrare crediti aggiornati
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
  });

  // ─── Pacchetti ───────────────────────────────────────────
  const { data: pacchetti = [], isLoading: isLoadingPacchetti, isError: errorePacchetti, refetch: ricaricaPacchetti } = useQuery({
    queryKey: [PACCHETTI_KEY],
    queryFn: async (): Promise<SmsPacchettoCrediti[]> => {
      const { data, error } = await supabase
        .from("sms_pacchetti_crediti")
        .select("id, nome, importo_eur, crediti_eur, sms_stimati, bonus_percentuale, evidenziato, attivo, ordine")
        .eq("attivo", true)
        .order("ordine");
      if (error) throw error;
      return (data ?? []) as SmsPacchettoCrediti[];
    },
    staleTime: 10 * 60 * 1000,
  });

  // ─── Avvia il pagamento su Stripe Checkout ─────────────────────────────
  const ricaricaMutation = useMutation({
    mutationFn: async ({ pacchetto_id, operazione_id }: Pick<SmsRicaricaRequest, "pacchetto_id" | "operazione_id">): Promise<SmsRicaricaResponse> => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const { data, error } = await supabase.functions.invoke<SmsRicaricaResponse>(
        "create-checkout-session",
        { body: { company_id: companyId, type: "sms_credits", pacchetto_id, operazione_id } satisfies SmsRicaricaRequest },
      );
      if (error) {
        const contesto: unknown = error.context;
        const risposta = contesto instanceof Response
          ? await contesto.json().catch((): null => null)
          : null;
        throw new Error(typeof risposta?.error === "string" ? risposta.error : "Impossibile aprire il pagamento. Riprova.");
      }
      if (!data?.url || !data.session_id) throw new Error("Pagamento non inizializzato");
      return data;
    },
  });

  // ─── Computed ────────────────────────────────────────────
  const creditiResidui = wallet ? wallet.crediti - wallet.crediti_riservati : 0;

  const isSottoSoglia = (sogliaMinima: number = 50): boolean =>
    creditiResidui < sogliaMinima;

  const isBlocco = (sogliaBlocco: number = 0): boolean =>
    creditiResidui <= sogliaBlocco;

  return {
    wallet,
    pacchetti,
    isLoadingWallet,
    isLoadingPacchetti,
    errorePacchetti,
    ricaricaPacchetti,
    creaRicarica: ricaricaMutation.mutateAsync,
    isRicaricando: ricaricaMutation.isPending,
    creditiResidui,
    isSottoSoglia,
    isBlocco,
    refetchWallet: () => queryClient.invalidateQueries({ queryKey: [WALLET_KEY, companyId] }),
  };
}
