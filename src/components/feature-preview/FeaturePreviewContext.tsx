/**
 * FeaturePreviewProvider — v8.6.63
 *
 * Context che fornisce a tutti i FeatureActionGuard interni la coppia
 * featureKey/featureLabel della pagina corrente. Così niente prop-drilling
 * o ripetizione manuale su ogni bottone.
 *
 * Pattern d'uso:
 *
 *   <FeaturePreviewProvider featureKey="render_ai" featureLabel="Render AI">
 *     <FeaturePreviewBanner />
 *     <Form>
 *       <FeatureActionGuard actionLabel="Genera">
 *         <Button>Genera</Button>
 *       </FeatureActionGuard>
 *     </Form>
 *   </FeaturePreviewProvider>
 *
 * Vantaggio: 1 provider in cima + N guard senza ridichiarare contesto.
 */
import { createContext, type ReactNode } from "react";
import { useFeatureAccess, type FeatureAccessLevel } from "@/hooks/useFeatureAccess";

export interface FeaturePreviewContextValue {
  featureKey: string;
  featureLabel: string;
  /** Descrizione del valore della feature (mostrata nel dialog sblocco). */
  description?: string;
  /** Lista bullet points "cosa otterrai sbloccando" (mostrata nel dialog). */
  benefits?: string[];
  accessLevel: FeatureAccessLevel;
  isPreview: boolean;
  isEnabled: boolean;
  isLoading: boolean;
}

export const FeaturePreviewCtx = createContext<FeaturePreviewContextValue | null>(null);

interface ProviderProps {
  featureKey: string;
  featureLabel: string;
  description?: string;
  benefits?: string[];
  /**
   * v8.6.63 — Forza il preview mode indipendentemente dallo stato DB.
   * Utile per showcase commerciali, QA e demo offline. In produzione lascia
   * undefined: il provider risolve via useFeatureAccess + RPC backend.
   */
  forcePreview?: boolean;
  children: ReactNode;
}

export function FeaturePreviewProvider({
  featureKey, featureLabel, description, benefits, forcePreview, children,
}: ProviderProps) {
  const { accessLevel: realLevel, isPreview: realIsPreview, isEnabled: realIsEnabled, isLoading } = useFeatureAccess(featureKey);

  // Override locale: se forcePreview=true, simulo preview attiva
  const accessLevel: FeatureAccessLevel = forcePreview ? "preview" : realLevel;
  const isPreview = forcePreview ? true : realIsPreview;
  const isEnabled = forcePreview ? false : realIsEnabled;

  return (
    <FeaturePreviewCtx.Provider value={{ featureKey, featureLabel, description, benefits, accessLevel, isPreview, isEnabled, isLoading }}>
      {children}
    </FeaturePreviewCtx.Provider>
  );
}
