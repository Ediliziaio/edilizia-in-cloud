/**
 * useWallets — il portafoglio dell'azienda.
 *
 * Dal 07/09/2026 il credito in euro è UNO SOLO (`company_credit_pool`): email,
 * AI e WhatsApp attingono tutti da lì, e nella pagina si vede un saldo solo.
 * Prima erano tre borsellini separati e la ricarica automatica partiva tre
 * volte insieme — 75 € quando ne bastavano 25.
 *
 * I render restano a parte: si comprano a pacchetti di crediti, non in euro,
 * quindi qui compaiono come conteggio ("N render") accanto al saldo.
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
  totalBalanceEur: number;       // il saldo del portafoglio (i render sono un conteggio, non euro)
  hasBlocked: boolean;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useWallets(): WalletsResult {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // Il saldo in euro: uno solo, dal portafoglio.
  const pool = useQuery({
    queryKey: ["wallets", "pool", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("company_credit_pool")
        .select("balance_eur, total_spent_eur, total_recharged_eur, low_balance_blocked")
        .eq("company_id", companyId)
        .maybeSingle();
      return data as {
        balance_eur: number;
        total_spent_eur: number;
        total_recharged_eur: number;
        low_balance_blocked: boolean;
      } | null;
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  // Serve solo per sapere se le chiamate AI sono bloccate.
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
      // Il tipo resta "email" perché è il prodotto con cui si ricarica su
      // Stripe: i soldi finiscono comunque nel portafoglio unico.
      type: "email",
      label: "Crediti",
      balance: pool.data?.balance_eur ?? 0,
      spent: pool.data?.total_spent_eur ?? 0,
      recharged: pool.data?.total_recharged_eur ?? 0,
      blocked: (pool.data?.balance_eur ?? 0) <= 0 || (ai.data?.calls_blocked ?? false),
      currency: "eur",
      rechargeable: true,
      freeBalance: aiFree.data?.free_balance_eur ?? 0,
      freeGranted: aiFree.data?.free_granted_eur ?? 0,
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
    isLoading: pool.isLoading || render.isLoading,
    isError: pool.isError || render.isError,
    refetch: () => {
      pool.refetch();
      ai.refetch();
      render.refetch();
    },
  };
}
