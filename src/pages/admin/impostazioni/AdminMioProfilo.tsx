/**
 * AdminMioProfilo — pagina profilo personale per membri del team superadmin.
 *
 * Replica MioProfilo (lato azienda) sotto PlatformCompanyProvider →
 * ogni membro del team EdiliziaInCloud (Florin + collaboratori superadmin)
 * può:
 *   • Modificare i suoi dati personali
 *   • Configurare 2FA e sicurezza account
 *   • Collegare i suoi calendari Google/Outlook
 *   • Collegare le sue caselle email Gmail/Outlook (OAuth) → arrivano in
 *     /admin/email (3-pane client) come email personali di quel utente
 *   • Configurare le notifiche personali
 *
 * Le connessioni OAuth restano scoped a (PLATFORM_ADMIN_COMPANY_ID, user_id)
 * → ogni membro vede SOLO le sue email collegate, mai quelle degli altri.
 */
import { lazy, Suspense } from "react";
import { PlatformCompanyProvider } from "@/components/admin/PlatformCompanyProvider";
import { Skeleton } from "@/components/ui/skeleton";

const MioProfilo = lazy(
  () => import("@/pages/azienda/impostazioni/MioProfilo"),
);

export default function AdminMioProfilo() {
  return (
    <PlatformCompanyProvider>
      <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
        <MioProfilo />
      </Suspense>
    </PlatformCompanyProvider>
  );
}
