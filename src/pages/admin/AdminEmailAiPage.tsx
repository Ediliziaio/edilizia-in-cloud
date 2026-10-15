import { lazy, Suspense } from "react";
import { PlatformCompanyProvider } from "@/components/admin/PlatformCompanyProvider";
const EmailAiSettingsPage = lazy(() => import("@/pages/azienda/email/EmailAiSettingsPage"));
export default function AdminEmailAiPage() {
  return <PlatformCompanyProvider><Suspense fallback={<p role="status">Caricamento impostazioni email…</p>}><EmailAiSettingsPage backPath="/admin/email" /></Suspense></PlatformCompanyProvider>;
}
