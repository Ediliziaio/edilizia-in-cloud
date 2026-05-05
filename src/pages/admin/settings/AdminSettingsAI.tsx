import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ElevenLabsVoiceConfig } from "@/components/admin/settings/ElevenLabsVoiceConfig";
import { Mic, Settings, Zap, DollarSign, Users, BookOpen, Brain } from "lucide-react";

const PlatformSettingsPage = lazy(() => import("@/modules/ai-agents/pages/PlatformSettingsPage"));
const AdminSettingsAIRouter = lazy(() => import("@/pages/admin/settings/AdminSettingsAIRouter"));
const AdminSettingsAIPricing = lazy(() => import("@/pages/admin/settings/AdminSettingsAIPricing"));
const AdminSettingsAIPersonas = lazy(() => import("@/pages/admin/settings/AdminSettingsAIPersonas"));
const AdminSettingsAIKnowledge = lazy(() => import("@/pages/admin/settings/AdminSettingsAIKnowledge"));
const AdminSettingsAIMemory = lazy(() => import("@/pages/admin/settings/AdminSettingsAIMemory"));

export default function AdminSettingsAI() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agenti AI</h1>
        <p className="text-muted-foreground">
          Router cost-optimized via OpenRouter, pricing & margini, le 18 personas, voci vocali
        </p>
      </div>

      <Tabs defaultValue="router" className="space-y-4">
        <TabsList>
          <TabsTrigger value="router" className="gap-2">
            <Zap className="h-4 w-4" />
            AI Router
          </TabsTrigger>
          <TabsTrigger value="pricing" className="gap-2">
            <DollarSign className="h-4 w-4" />
            Pricing & Margini
          </TabsTrigger>
          <TabsTrigger value="personas" className="gap-2">
            <Users className="h-4 w-4" />
            Le 18 Personas
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Knowledge Base
          </TabsTrigger>
          <TabsTrigger value="memory" className="gap-2">
            <Brain className="h-4 w-4" />
            Memoria Silvio
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            Configurazione legacy
          </TabsTrigger>
          <TabsTrigger value="voices" className="gap-2">
            <Mic className="h-4 w-4" />
            Voci ElevenLabs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="router">
          <Suspense fallback={<Skeleton className="h-[400px]" />}>
            <AdminSettingsAIRouter />
          </Suspense>
        </TabsContent>

        <TabsContent value="pricing">
          <Suspense fallback={<Skeleton className="h-[400px]" />}>
            <AdminSettingsAIPricing />
          </Suspense>
        </TabsContent>

        <TabsContent value="personas">
          <Suspense fallback={<Skeleton className="h-[400px]" />}>
            <AdminSettingsAIPersonas />
          </Suspense>
        </TabsContent>

        <TabsContent value="knowledge">
          <Suspense fallback={<Skeleton className="h-[400px]" />}>
            <AdminSettingsAIKnowledge />
          </Suspense>
        </TabsContent>

        <TabsContent value="memory">
          <Suspense fallback={<Skeleton className="h-[400px]" />}>
            <AdminSettingsAIMemory />
          </Suspense>
        </TabsContent>

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
