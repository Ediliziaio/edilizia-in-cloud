import { useAdminMarketing } from "@/hooks/useAdminMarketing";
import { PlatformCompanyProvider } from "@/components/admin/PlatformCompanyProvider";
import { Loader2, Zap } from "lucide-react";
import { lazy, Suspense } from "react";

const MarketingAutomations = lazy(() => import("@/pages/azienda/marketing/MarketingAutomations"));

export default function AdminMarketingAutomations() {
  const { hasAccess, permLoading } = useAdminMarketing();

  if (permLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!hasAccess) return <div className="flex flex-col items-center justify-center py-20 text-center"><Zap className="h-12 w-12 text-muted-foreground/40 mb-4" /><h2 className="text-lg font-semibold text-muted-foreground">Accesso negato</h2></div>;

  return (
    <PlatformCompanyProvider>
      <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
        <MarketingAutomations />
      </Suspense>
    </PlatformCompanyProvider>
  );
}
