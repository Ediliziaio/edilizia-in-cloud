import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type BillingMode = "external" | "native";

interface BillingModeContextValue {
  mode: BillingMode;
  isLoading: boolean;
  isNative: boolean;
  isExternal: boolean;
  switchMode: (newMode: BillingMode) => Promise<void>;
}

const BillingModeContext = createContext<BillingModeContextValue | null>(null);

export function BillingModeProvider({ children }: { children: React.ReactNode }) {
  const { effectiveCompany, isLoading: authLoading } = useAuth();
  const [mode, setMode] = useState<BillingMode>("external");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (effectiveCompany) {
      const raw = (effectiveCompany as any).billing_mode;
      setMode(raw === "native" ? "native" : "external");
      setIsLoading(false);
    } else if (!authLoading) {
      // Auth is settled but no company — stop spinner so the guard can redirect
      setIsLoading(false);
    }
  }, [effectiveCompany, authLoading]);

  const switchMode = useCallback(async (newMode: BillingMode) => {
    if (!effectiveCompany) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("companies")
      .update({
        billing_mode: newMode,
        billing_mode_set_at: new Date().toISOString(),
        billing_mode_set_by: user?.id,
      } as any)
      .eq("id", effectiveCompany.id);
    if (error) {
      toast.error("Errore nel cambio modalità fatturazione");
      return;
    }
    setMode(newMode);
    toast.success(`Modalità fatturazione: ${newMode === "native" ? "Nativa" : "Esterna"}`);
  }, [effectiveCompany]);

  const value = useMemo<BillingModeContextValue>(() => ({
    mode,
    isLoading,
    isNative: mode === "native",
    isExternal: mode === "external",
    switchMode,
  }), [mode, isLoading, switchMode]);

  return (
    <BillingModeContext.Provider value={value}>
      {children}
    </BillingModeContext.Provider>
  );
}

export function useBillingMode() {
  const ctx = useContext(BillingModeContext);
  if (!ctx) throw new Error("useBillingMode must be used inside BillingModeProvider");
  return ctx;
}
