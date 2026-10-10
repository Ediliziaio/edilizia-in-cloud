import { createContext, useContext, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { userErrorMessage } from "@/lib/userErrorMessage";
import { toast } from "sonner";

export type BillingMode = "external" | "native";

export interface BillingModeContextValue {
  mode: BillingMode;
  isLoading: boolean;
  isNative: boolean;
  isExternal: boolean;
  /**
   * L'azienda ha scelto davvero come fattura (`billing_mode_set_at` pieno). Prima della scelta `mode` vale
   * «external» come valore di partenza: serve a far funzionare i menu, non è una risposta dell'azienda.
   */
  isChosen: boolean;
  /** Quando ha scelto (ISO), o null se non ha mai scelto. */
  chosenAt: string | null;
  /** Registra la scelta. Anche se è uguale al valore di partenza: così l'azienda risulta «ha scelto». Dice com'è andata. */
  switchMode: (newMode: BillingMode) => Promise<boolean>;
}

const BillingModeContext = createContext<BillingModeContextValue | null>(null);

/** Una scelta appena fatta, finché l'azienda ricaricata non la riporta. */
interface SceltaAppenaFatta {
  companyId: string;
  mode: BillingMode;
  at: string;
}

export function BillingModeProvider({ children }: { children: React.ReactNode }) {
  const { effectiveCompany, isLoading: authLoading, refreshAuth } = useAuth();
  const [appenaFatta, setAppenaFatta] = useState<SceltaAppenaFatta | null>(null);

  const azienda = effectiveCompany as unknown as { id?: string; billing_mode?: string | null; billing_mode_set_at?: string | null } | null;
  const companyId = azienda?.id;
  const dellAzienda = appenaFatta && appenaFatta.companyId === companyId ? appenaFatta : null;
  const mode: BillingMode = (dellAzienda?.mode ?? azienda?.billing_mode) === "native" ? "native" : "external";
  const chosenAt = dellAzienda?.at ?? azienda?.billing_mode_set_at ?? null;
  // Finché non c'è l'azienda e l'accesso non ha finito si aspetta; senza azienda a accesso concluso la guardia
  // sa cosa fare (rimanda), quindi non si resta in attesa.
  const isLoading = !azienda && authLoading;

  const switchMode = useCallback(async (newMode: BillingMode): Promise<boolean> => {
    if (!companyId) return false;
    const { data: { user } } = await supabase.auth.getUser();
    const adesso = new Date().toISOString();
    // `.select()` dice se la riga è stata aggiornata: se non lo è (serve l'amministratore dell'azienda) lo si dice
    // e non si finge che la scelta sia cambiata.
    const { data, error } = await supabase
      .from("companies")
      .update({
        billing_mode: newMode,
        billing_mode_set_at: adesso,
        billing_mode_set_by: user?.id,
      } as never)
      .eq("id", companyId)
      .select("id")
      .maybeSingle();
    if (error) {
      toast.error("Non sono riuscito a cambiare", { description: userErrorMessage(error, "Riprova tra poco.") });
      return false;
    }
    if (!data) {
      toast.error("Non sono riuscito a cambiare: serve l'amministratore dell'azienda.");
      return false;
    }
    setAppenaFatta({ companyId, mode: newMode, at: adesso });
    toast.success(newMode === "native" ? "Ora fatturi con Edilizia in Cloud" : "Ora fatturi con un altro programma");
    // Anche l'azienda che il resto dell'app legge (la scheda della commessa) deve avere il valore nuovo.
    await refreshAuth();
    return true;
  }, [companyId, refreshAuth]);

  const value = useMemo<BillingModeContextValue>(() => ({
    mode,
    isLoading,
    isNative: mode === "native",
    isExternal: mode === "external",
    isChosen: Boolean(chosenAt),
    chosenAt,
    switchMode,
  }), [mode, isLoading, chosenAt, switchMode]);

  return (
    <BillingModeContext.Provider value={value}>
      {children}
    </BillingModeContext.Provider>
  );
}

/**
 * Il modo di fatturare dell'azienda. Con `{ facoltativo: true }` non lancia se manca il provider e restituisce
 * null: serve a chi deve solo sapere «fattura in nativo?» e funziona anche dove il provider non c'è (la ricerca
 * delle impostazioni, le prove).
 */
export function useBillingMode(): BillingModeContextValue;
export function useBillingMode(opzioni: { facoltativo: true }): BillingModeContextValue | null;
export function useBillingMode(opzioni?: { facoltativo?: boolean }): BillingModeContextValue | null {
  const ctx = useContext(BillingModeContext);
  if (!ctx && !opzioni?.facoltativo) throw new Error("useBillingMode must be used inside BillingModeProvider");
  return ctx;
}
