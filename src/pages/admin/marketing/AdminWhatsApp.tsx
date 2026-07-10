// Wrapper SuperAdmin per il modulo WhatsApp (contesto marketing).
// La voce "WhatsApp" esisteva nella sidebar admin (AdminLayout.tsx:147) ma
// non c'era alcuna route corrispondente → 404 silenzioso. Fix + pattern
// coerente con gli altri wrapper admin/marketing/*.
//
// Route ANNIDATE (path admin = marketing/whatsapp/*): prima "Nuovo broadcast",
// il dettaglio broadcast e il dettaglio numero linkavano /azienda/... — sotto
// /admin quelle sotto-route non esistevano e si finiva nel contesto tenant.
// Le pagine usano useWhatsAppBase() per generare i link giusti nei due mondi.
import { useAdminMarketing } from "@/hooks/useAdminMarketing";
import { PlatformCompanyProvider } from "@/components/admin/PlatformCompanyProvider";
import { Loader2, MessageCircle } from "lucide-react";
import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

const WhatsAppHubPage = lazy(() => import("@/pages/azienda/whatsapp/WhatsAppHubPage"));
const BroadcastCreatePage = lazy(() => import("@/pages/azienda/whatsapp/BroadcastCreatePage"));
const BroadcastDetailPage = lazy(() => import("@/pages/azienda/whatsapp/BroadcastDetailPage"));
const WANumberDetailPage = lazy(() => import("@/pages/azienda/whatsapp/WANumberDetailPage"));

export default function AdminWhatsApp() {
  const { hasAccess, permLoading } = useAdminMarketing();

  if (permLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!hasAccess) return <div className="flex flex-col items-center justify-center py-20 text-center"><MessageCircle className="h-12 w-12 text-muted-foreground/40 mb-4" /><h2 className="text-lg font-semibold text-muted-foreground">Accesso negato</h2></div>;

  return (
    <PlatformCompanyProvider>
      <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
        <Routes>
          <Route index element={<WhatsAppHubPage />} />
          <Route path="broadcast/nuovo" element={<BroadcastCreatePage />} />
          <Route path="broadcast/:id" element={<BroadcastDetailPage />} />
          <Route path="numeri/:id" element={<WANumberDetailPage />} />
          <Route path="*" element={<Navigate to="/admin/marketing/whatsapp" replace />} />
        </Routes>
      </Suspense>
    </PlatformCompanyProvider>
  );
}
