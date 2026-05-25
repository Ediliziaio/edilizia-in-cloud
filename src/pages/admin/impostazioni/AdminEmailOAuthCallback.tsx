/**
 * AdminEmailOAuthCallback — callback OAuth per admin context.
 *
 * Riusa EmailOAuthCallbackPage (lato azienda) sotto PlatformCompanyProvider
 * → la callback gira nello stesso context "platform admin company" della
 * pagina che ha avviato il flusso OAuth.
 *
 * Il callback page già legge `sessionStorage.email_oauth_return_to` per
 * tornare alla pagina originale (es. /admin/impostazioni/mio-profilo?tab=email)
 * dopo aver scritto il token nel DB.
 */
import { lazy, Suspense } from "react";
import { PlatformCompanyProvider } from "@/components/admin/PlatformCompanyProvider";
import { Loader2 } from "lucide-react";

const EmailOAuthCallbackPage = lazy(
  () => import("@/pages/azienda/settings/EmailOAuthCallbackPage"),
);

export default function AdminEmailOAuthCallback() {
  return (
    <PlatformCompanyProvider>
      <Suspense fallback={
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }>
        <EmailOAuthCallbackPage />
      </Suspense>
    </PlatformCompanyProvider>
  );
}
