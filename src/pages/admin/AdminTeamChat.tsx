/**
 * AdminTeamChat — chat WhatsApp-style del team Super Admin.
 *
 * Riuso totale del componente `InternalChat` (1500+ LOC, già testato e ricco
 * di feature: canali, DM, reazioni, repliche, pin, ricerca, allegati, presence)
 * iniettando il `company_id` della "platform admin company" come scope.
 *
 * Il super admin che apre questa pagina condivide canali e DM con tutti gli
 * altri super admin (che si autenticano sulla stessa platform_admin_company).
 *
 * Permission gate: solo super admin con `can_manage_companies` (sufficiente
 * a garantire accesso al team interno).
 */
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { Card, CardContent } from "@/components/ui/card";

// Lazy load: InternalChat è 2k+ LOC. Riduce bundle iniziale admin.
const InternalChat = lazy(() => import("@/pages/azienda/InternalChat"));

export default function AdminTeamChat() {
  const { permissions } = useSuperAdminPermissions();

  // Recupera l'id della "platform admin company" — il container logico
  // delle conversazioni del team super admin.
  const { data: platformCompanyId, isLoading, isError } = useQuery({
    queryKey: ["platform-admin-company-id"],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("companies")
        .select("id")
        .eq("is_platform_admin_company", true)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    staleTime: 30 * 60 * 1000, // 30 min — quasi statico
  });

  if (!permissions.can_manage_companies) return <AccessDenied />;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Caricamento chat team…
      </div>
    );
  }

  if (isError || !platformCompanyId) {
    return (
      <div className="flex items-center justify-center py-12">
        <Card className="max-w-md">
          <CardContent className="p-6 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold mb-1">Chat team non configurata</p>
              <p className="text-muted-foreground">
                Per attivare la chat del team super admin è necessario configurare
                una company con flag <code className="bg-muted px-1 rounded text-xs">is_platform_admin_company = true</code>.
                Contatta il team backend.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Riusa InternalChat con scope sulla platform admin company
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    }>
      <InternalChat companyIdOverride={platformCompanyId} />
    </Suspense>
  );
}
