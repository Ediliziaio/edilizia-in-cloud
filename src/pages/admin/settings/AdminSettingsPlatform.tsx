import PlatformInfoTab from "@/components/admin/settings/PlatformInfoTab";
import { PlatformBrandingTab } from "@/components/admin/settings/PlatformBrandingTab";
import { PlatformAnalyticsTab } from "@/components/admin/settings/PlatformAnalyticsTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Server, Palette, ChartBar } from "lucide-react";

export default function AdminSettingsPlatform() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Piattaforma</h1>
        <p className="text-muted-foreground">
          Configurazione generale, branding e SEO della piattaforma
        </p>
      </div>

      <Tabs defaultValue="generale" className="space-y-4">
        <TabsList>
          <TabsTrigger value="generale" className="gap-2">
            <Server className="h-4 w-4" />
            Generale
          </TabsTrigger>
          <TabsTrigger value="branding" className="gap-2">
            <Palette className="h-4 w-4" />
            Branding &amp; SEO
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <ChartBar className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generale">
          <PlatformInfoTab />
        </TabsContent>

        <TabsContent value="branding">
          <PlatformBrandingTab />
        </TabsContent>

        <TabsContent value="analytics">
          <PlatformAnalyticsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
