/**
 * AIConfigPage — Configurazione AI (sostituisce vecchia /admin/impostazioni/agenti-ai)
 *
 * 5 tab: Routing · Personas · Knowledge · Pricing · Governance
 *
 * Refactor Strategia C — consolida tutto ciò che è "configurazione" del sistema AI
 * in un'unica pagina. La vecchia route fa redirect qui.
 */
import { lazy, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings, Users, BookOpen, Coins, ShieldAlert, Mic } from "lucide-react";

const AdminSettingsAIRouter = lazy(() => import("@/pages/admin/settings/AdminSettingsAIRouter"));
const AdminSettingsAIPersonas = lazy(() => import("@/pages/admin/settings/AdminSettingsAIPersonas"));
const KbAdminPage = lazy(() =>
  import("@/components/admin/ai-knowledge/KbAdminPage").then((m) => ({ default: m.KbAdminPage })),
);
const AdminSettingsAIPricing = lazy(() => import("@/pages/admin/settings/AdminSettingsAIPricing"));
const AdminSettingsAIActions = lazy(() => import("@/pages/admin/settings/AdminSettingsAIActions"));
const AdminSettingsAIMemory = lazy(() => import("@/pages/admin/settings/AdminSettingsAIMemory"));
const ElevenLabsVoiceConfig = lazy(() => import("@/components/admin/settings/ElevenLabsVoiceConfig"));

const fallback = (
  <div className="space-y-3 p-6">
    <Skeleton className="h-8 w-1/3" />
    <Skeleton className="h-32 w-full" />
    <Skeleton className="h-64 w-full" />
  </div>
);

export default function AIConfigPage() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Settings className="h-8 w-8 text-orange-500" />
        <div>
          <h1 className="text-2xl font-bold">AI · Configurazione</h1>
          <p className="text-sm text-muted-foreground">
            Routing modelli, personas, knowledge base, pricing e governance
          </p>
        </div>
      </div>

      <Tabs defaultValue="routing" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="routing" className="gap-2">
            <Settings className="h-4 w-4" />
            Routing & Models
          </TabsTrigger>
          <TabsTrigger value="personas" className="gap-2">
            <Users className="h-4 w-4" />
            Personas
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Knowledge Base
          </TabsTrigger>
          <TabsTrigger value="pricing" className="gap-2">
            <Coins className="h-4 w-4" />
            Pricing & Margini
          </TabsTrigger>
          <TabsTrigger value="governance" className="gap-2">
            <ShieldAlert className="h-4 w-4" />
            Governance
          </TabsTrigger>
          <TabsTrigger value="voices" className="gap-2">
            <Mic className="h-4 w-4" />
            Voci TTS
          </TabsTrigger>
        </TabsList>

        <TabsContent value="routing">
          <Suspense fallback={fallback}>
            <AdminSettingsAIRouter />
          </Suspense>
        </TabsContent>

        <TabsContent value="personas">
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-sm text-muted-foreground">
                <strong>Personas Cliente</strong> — usate dalle aziende clienti nelle loro chat AI (sales, finance, hr, ecc.).
                Le <strong>Personas C-suite Admin</strong> (Beatrice, Marco, Sofia...) si gestiscono nella pagina{" "}
                <a href="/admin/ai-operate?tab=memory" className="text-primary underline">AI Operate → Memoria</a>.
              </p>
            </CardContent>
          </Card>
          <Suspense fallback={fallback}>
            <AdminSettingsAIPersonas />
          </Suspense>
        </TabsContent>

        <TabsContent value="knowledge">
          <Suspense fallback={fallback}>
            <KbAdminPage />
          </Suspense>
        </TabsContent>

        <TabsContent value="pricing">
          <Suspense fallback={fallback}>
            <AdminSettingsAIPricing />
          </Suspense>
        </TabsContent>

        <TabsContent value="governance">
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                Permessi azioni AI rischiose per ogni azienda + soglie automation.
              </CardContent>
            </Card>
            <Suspense fallback={fallback}>
              <AdminSettingsAIActions />
            </Suspense>
            <Suspense fallback={fallback}>
              <AdminSettingsAIMemory />
            </Suspense>
          </div>
        </TabsContent>

        <TabsContent value="voices">
          <Suspense fallback={fallback}>
            <ElevenLabsVoiceConfig />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
