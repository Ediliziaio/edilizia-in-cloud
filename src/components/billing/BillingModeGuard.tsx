import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useBillingMode, type BillingMode } from "@/contexts/BillingModeContext";
import { Loader2 } from "lucide-react";

interface BillingModeGuardProps {
  requiredMode: BillingMode;
  children: React.ReactNode;
  redirectTo?: string;
}

export function BillingModeGuard({ requiredMode, children, redirectTo }: BillingModeGuardProps) {
  const { mode, isLoading } = useBillingMode();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && mode !== requiredMode) {
      const fallback = redirectTo ?? (requiredMode === "native"
        ? "/azienda/fatturazione"
        : "/azienda/impostazioni/fatturazione");
      navigate(fallback, { replace: true });
    }
  }, [mode, isLoading, requiredMode, navigate, redirectTo]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (mode !== requiredMode) return null;

  return <>{children}</>;
}
