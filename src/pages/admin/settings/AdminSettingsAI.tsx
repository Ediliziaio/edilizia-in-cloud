import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ElevenLabsVoiceConfig } from "@/components/admin/settings/ElevenLabsVoiceConfig";
import { Mic, Settings } from "lucide-react";

const PlatformSettingsPage = lazy(() => import("@/modules/ai-agents/pages/PlatformSettingsPage"));

export default function AdminSettingsAI() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agenti AI</h1>
        <p className="text-muted-foreground">
          Configura modelli, agenti intelligenti e voci per gli agenti vocali
        </p>
      </div>

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            Configurazione
          </TabsTrigger>
          <TabsTrigger value="voices" className="gap-2">
            <Mic className="h-4 w-4" />
            Voci ElevenLabs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <Suspense fallback={<Skeleton className="h-[400px]" />}>
            <PlatformSettingsPage />
          </Suspense>
        </TabsContent>

        <TabsContent value="voices">
          <ElevenLabsVoiceConfig />
        </TabsContent>
      </Tabs>
    </div>
  );
}
