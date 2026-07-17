import { useAdminMarketing } from "@/hooks/useAdminMarketing";
import { PlatformCompanyProvider } from "@/components/admin/PlatformCompanyProvider";
import { Loader2, FileText } from "lucide-react";
import { lazy, Suspense } from "react";

// Riuso della pagina /azienda: PlatformCompanyProvider sovrascrive
// effectiveCompany sulla Platform Admin CRM, così i form (e i lead che
// generano) finiscono nel CRM del super-admin senza duplicare logica.
const SettingsFormBuilder = lazy(() => import("@/pages/azienda/settings/SettingsFormBuilder"));

export default function AdminFormBuilder() {
  const { hasAccess, permLoading } = useAdminMarketing();

  if (permLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h2 className="text-lg font-semibold text-muted-foreground">Accesso negato</h2>
      </div>
    );
  }

  return (
    <PlatformCompanyProvider>
      <div className="mb-4">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          Form Builder
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Crea moduli da incorporare nei tuoi siti (Marketing Edile, Vendita Edile…):
          i lead entrano nel CRM piattaforma con tag, assegnazione e link di uscita.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <SettingsFormBuilder />
      </Suspense>
    </PlatformCompanyProvider>
  );
}
