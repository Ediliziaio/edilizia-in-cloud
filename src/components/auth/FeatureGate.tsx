import { ReactNode } from "react";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";

interface FeatureGateProps {
  featureKey: string;
  children: ReactNode;
  /** Render custom quando la feature è disabilitata. Default: null (nasconde). */
  fallback?: ReactNode;
  /** Render custom durante il caricamento. Default: null. */
  loading?: ReactNode;
}

/**
 * Wrapper UI che mostra `children` solo se la feature è abilitata per l'azienda
 * corrente (risolta via RPC DB). Usa `fallback` per mostrare un paywall/badge
 * alternativo invece che nascondere.
 *
 * Esempio:
 *   <FeatureGate featureKey="export_pdf" fallback={<UpgradeButton />}>
 *     <ExportPdfButton />
 *   </FeatureGate>
 */
export function FeatureGate({
  featureKey,
  children,
  fallback = null,
  loading = null,
}: FeatureGateProps) {
  const { isEnabled, isLoading } = useFeatureAccess(featureKey);

  if (isLoading) return <>{loading}</>;
  if (!isEnabled) return <>{fallback}</>;
  return <>{children}</>;
}
