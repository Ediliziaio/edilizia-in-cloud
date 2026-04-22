import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailTestPanel } from "@/components/admin/settings/EmailTestPanel";
import { Settings, Send, BarChart3, Ban, Gauge, FileText, PenLine, Variable } from "lucide-react";

const EmailSettingsTab          = lazy(() => import("@/components/admin/settings/EmailSettingsTab"));
const EmailDeliverabilityDashboard = lazy(() =>
  import("@/components/admin/settings/EmailDeliverabilityDashboard")
    .then((m) => ({ default: m.EmailDeliverabilityDashboard })),
);
const EmailSuppressionsTable = lazy(() =>
  import("@/components/admin/settings/EmailSuppressionsTable")
    .then((m) => ({ default: m.EmailSuppressionsTable })),
);
const EmailRateLimitsPanel = lazy(() =>
  import("@/components/admin/settings/EmailRateLimitsPanel")
    .then((m) => ({ default: m.EmailRateLimitsPanel })),
);
const EmailTemplatesPanel = lazy(() =>
  import("@/components/admin/settings/EmailTemplatesPanel")
    .then((m) => ({ default: m.EmailTemplatesPanel })),
);
const PlatformEmailSignaturePanel = lazy(() =>
  import("@/components/admin/settings/PlatformEmailSignaturePanel")
    .then((m) => ({ default: m.PlatformEmailSignaturePanel })),
);
const PlatformCustomFieldsPanel = lazy(() =>
  import("@/components/admin/settings/PlatformCustomFieldsPanel")
    .then((m) => ({ default: m.PlatformCustomFieldsPanel })),
);

export default function AdminSettingsEmail() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Email</h1>
        <p className="text-muted-foreground">
          Configura provider, monitora deliverability, gestisci soppressioni e limiti
        </p>
      </div>

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            Configurazione
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <FileText className="h-4 w-4" />
            Template
          </TabsTrigger>
          <TabsTrigger value="custom-fields" className="gap-2">
            <Variable className="h-4 w-4" />
            Campi personalizzati
          </TabsTrigger>
          <TabsTrigger value="signature" className="gap-2">
            <PenLine className="h-4 w-4" />
            Firma
          </TabsTrigger>
          <TabsTrigger value="deliverability" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Deliverability
          </TabsTrigger>
          <TabsTrigger value="suppressions" className="gap-2">
            <Ban className="h-4 w-4" />
            Soppressioni
          </TabsTrigger>
          <TabsTrigger value="rate-limits" className="gap-2">
            <Gauge className="h-4 w-4" />
            Rate Limits
          </TabsTrigger>
          <TabsTrigger value="test" className="gap-2">
            <Send className="h-4 w-4" />
            Test Invio
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <Suspense fallback={<Skeleton className="h-[400px]" />}>
            <EmailSettingsTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="templates">
          <Suspense fallback={<Skeleton className="h-[500px]" />}>
            <EmailTemplatesPanel />
          </Suspense>
        </TabsContent>

        <TabsContent value="custom-fields">
          <Suspense fallback={<Skeleton className="h-[500px]" />}>
            <PlatformCustomFieldsPanel />
          </Suspense>
        </TabsContent>

        <TabsContent value="signature">
          <Suspense fallback={<Skeleton className="h-[400px]" />}>
            <PlatformEmailSignaturePanel />
          </Suspense>
        </TabsContent>

        <TabsContent value="deliverability">
          <Suspense fallback={<Skeleton className="h-[400px]" />}>
            <EmailDeliverabilityDashboard />
          </Suspense>
        </TabsContent>

        <TabsContent value="suppressions">
          <Suspense fallback={<Skeleton className="h-[400px]" />}>
            <EmailSuppressionsTable />
          </Suspense>
        </TabsContent>

        <TabsContent value="rate-limits">
          <Suspense fallback={<Skeleton className="h-[300px]" />}>
            <EmailRateLimitsPanel />
          </Suspense>
        </TabsContent>

        <TabsContent value="test">
          <EmailTestPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
