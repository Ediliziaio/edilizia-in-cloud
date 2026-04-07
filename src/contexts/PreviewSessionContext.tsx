/**
 * PreviewSessionContext — espone la sessione SuperAdmin-preview ai componenti
 * figli dei portali separati (CustomerLayout, CampoLayout).
 *
 * Permette a qualsiasi componente child di verificare se è in modalità preview
 * e disabilitare le azioni di scrittura di conseguenza.
 */
import { createContext, useContext } from "react";
import type { PreviewSession } from "@/hooks/usePreviewToken";

const defaultSession: PreviewSession = {
  isPreview: false,
  isValidating: false,
  targetUserId: null,
  targetRole: null,
  companyId: null,
  error: null,
};

export const PreviewSessionContext = createContext<PreviewSession>(defaultSession);

/**
 * Hook per leggere la sessione preview corrente.
 * Usare nei componenti figli per bloccare le write actions in modalità preview.
 *
 * @example
 * const { isPreview } = usePreviewSession();
 * <Button disabled={isPreview} onClick={handleSave}>Salva</Button>
 */
export function usePreviewSession(): PreviewSession {
  return useContext(PreviewSessionContext);
}
