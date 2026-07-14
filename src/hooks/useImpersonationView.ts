import { useEffect, useState } from "react";

/**
 * Vista dell'impersonation super_admin.
 *
 * - "client" (default): il super admin vede ESATTAMENTE ciò che vede il
 *   cliente — piano, moduli inclusi e feature flags applicati, badge DEMO
 *   compresi. È la modalità di verifica ("cosa vede questo piano?").
 * - "full": bypass storico — tutti i moduli e le feature aperti, per
 *   operazioni di supporto dentro aziende con piani parziali.
 *
 * Lo stato vive in sessionStorage (per-tab, muore con la sessione di
 * impersonation) e viene propagato in-page con un evento custom così i tre
 * hook di gating (useSubscriptionLimits / useFeatureAccess / useFeatureFlags)
 * si aggiornano senza reload.
 *
 * NOTA SICUREZZA: questo flag ALLARGA mai i permessi — può solo disattivare
 * un bypass che è già vincolato a role=super_admin + token server-side.
 */
const STORAGE_KEY = "sa_impersonation_view";
const EVENT_NAME = "sa-impersonation-view";

export function getImpersonationClientView(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) !== "full";
  } catch {
    return true;
  }
}

export function setImpersonationClientView(clientView: boolean): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, clientView ? "client" : "full");
  } catch {
    // sessionStorage non disponibile: resta il default "client" in-memory
  }
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function useImpersonationClientView(): boolean {
  const [clientView, setClientView] = useState<boolean>(getImpersonationClientView);
  useEffect(() => {
    const onChange = () => setClientView(getImpersonationClientView());
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, []);
  return clientView;
}
