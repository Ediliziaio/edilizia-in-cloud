/**
 * useWallets — Hook centralizzato per i 4 wallet (Email/AI/WhatsApp/Render).
 *
 * Sostituisce 4 useQuery separati sparpagliati nei vari componenti con un
 * unico hook che ritorna { email, ai, whatsapp, render } come array tipizzato.
 *
 * Ogni wallet ha:
 *   - balance: saldo corrente (eur per i primi 3, count per render)
 *   - spent: totale speso storico
 *   - recharged: totale ricaricato storico
 *   - blocked: bool, se gli invii/chiamate sono bloccati per saldo insufficiente
 *   - currency: "eur" | "count" — per formattazione UI
 *
 * Forecast separato in useWalletForecast(walletType).
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type WalletType = "email" | "ai" | "whatsapp" | "render";

export interface Wallet {
  type: WalletType;
  label: string;
  balance: number;
  spent: number;
  recharged: number;
  blocked: boolean;
  /** "eur" → mostra come €, "count" → mostra come "N render" */
  currency: "eur" | "count";
  /** Se true, la ricarica via Stripe è disponibile. False = "contatta supporto". */
  rechargeable: boolean;
  /**
   * Omaggio del mese ancora disponibile (solo wallet AI). NON cumulabile:
   * si riazzera alla quota del piano il primo del mese. `balance` invece e'
   * il credito ricaricato, che resta finche' non lo spendi.
   */
  freeBalance?: number;
  /** Quota omaggio del mese, per mostrare "3,20 di 5,00". */
  freeGranted?: number;
}

export interface WalletsResult {
  wallets: Wallet[];
  totalBalanceEur: number;       // somma email+ai+wa (esclude render perché è count)
  hasBlocked: boolean;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useWallets(): WalletsResult {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const email = useQuery({
    queryKey: ["wallets", "email", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("email_credits")
        .select("balance_eur, total_spent_eur, total_recharged_eur, sends_blocked")
        .eq("company_id", companyId)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const ai = useQuery({
    queryKey: ["wallets", "ai", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("ai_credits")
        .select("balance_eur, total_spent_eur, total_recharged_eur, calls_blocked")
        .eq("company_id", companyId)
        .maybeSingle();
      return data as {
        balance_eur: number;
        total_spent_eur: number;
        total_recharged_eur: number;
        calls_blocked: boolean;
      } | null;
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  // Omaggio mensile del piano. Query separata e tollerante: se le colonne non
  // ci sono ancora (migration non applicata) si degrada a zero invece di far
  // saltare l'intera pagina crediti.
  const aiFree = useQuery({
    queryKey: ["wallets", "ai-free", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("ai_credits")
        .select("free_balance_eur, free_granted_eur")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) return null;
      return data as { free_balance_eur: number; free_granted_eur: number } | null;
    },
    enabled: !!companyId,
    staleTime: 30_000,
    retry: false,
  });

  const whatsapp = useQuery({
    queryKey: ["wallets", "whatsapp", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("whatsapp_credits")
        .select("balance_eur, total_spent_eur, total_recharged_eur, sends_blocked")
        .eq("company_id", companyId)
        .maybeSingle();
      return data as {
        balance_eur: number;
        total_spent_eur: number;
        total_recharged_eur: number;
        sends_blocked: boolean;
      } | null;
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const render = useQuery({
    queryKey: ["wallets", "render", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("render_credits")
        .select("balance, total_used, total_purchased")
        .eq("company_id", companyId)
        .maybeSingle();
      return data as { balance: number; total_used: number; total_purchased: number } | null;
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const wallets: Wallet[] = [
    {
      type: "email",
      label: "Email Marketing",
      balance: email.data?.balance_eur ?? 0,
      spent: email.data?.total_spent_eur ?? 0,
      recharged: email.data?.total_recharged_eur ?? 0,
      blocked: email.data?.sends_blocked ?? false,
      currency: "eur",
      rechargeable: true,
    },
    {
      type: "ai",
      label: "Agenti AI",
      balance: ai.data?.balance_eur ?? 0,
      spent: ai.data?.total_spent_eur ?? 0,
      recharged: ai.data?.total_recharged_eur ?? 0,
      blocked: ai.data?.calls_blocked ?? false,
      currency: "eur",
      rechargeable: true,
      freeBalance: aiFree.data?.free_balance_eur ?? 0,
      freeGranted: aiFree.data?.free_granted_eur ?? 0,
    },
    {
      type: "whatsapp",
      label: "WhatsApp",
      balance: whatsapp.data?.balance_eur ?? 0,
      spent: whatsapp.data?.total_spent_eur ?? 0,
      recharged: whatsapp.data?.total_recharged_eur ?? 0,
      blocked: whatsapp.data?.sends_blocked ?? false,
      currency: "eur",
      rechargeable: true,
    },
    {
      type: "render",
      label: "Render AI",
      balance: render.data?.balance ?? 0,
      spent: render.data?.total_used ?? 0,
      recharged: render.data?.total_purchased ?? 0,
      blocked: false,
      currency: "count",
      rechargeable: true,
    },
  ];

  const totalBalanceEur = wallets
    .filter((w) => w.currency === "eur")
    .reduce((s, w) => s + w.balance, 0);

  return {
    wallets,
    totalBalanceEur,
    hasBlocked: wallets.some((w) => w.blocked),
    isLoading: email.isLoading || ai.isLoading || whatsapp.isLoading || render.isLoading,
    isError: email.isError || ai.isError || whatsapp.isError || render.isError,
    refetch: () => {
      email.refetch();
      ai.refetch();
      whatsapp.refetch();
      render.refetch();
    },
  };
}
