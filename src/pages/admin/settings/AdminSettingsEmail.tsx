import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailTestPanel } from "@/components/admin/settings/EmailTestPanel";
import { Settings, Send } from "lucide-react";

const EmailSettingsTab = lazy(() => import("@/components/admin/settings/EmailSettingsTab"));

export default function AdminSettingsEmail() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Email</h1>
        <p className="text-muted-foreground">
          Configura i provider email e testa la configurazione
        </p>
      </div>

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            Configurazione
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

        <TabsContent value="test">
          <EmailTestPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
