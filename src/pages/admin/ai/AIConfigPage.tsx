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
import { Settings, Users, BookOpen, Coins, ShieldAlert, Mic, MessageCircle } from "lucide-react";

const AdminSettingsAIRouter = lazy(() => import("@/pages/admin/settings/AdminSettingsAIRouter"));
const AdminSettingsAIPersonas = lazy(() => import("@/pages/admin/settings/AdminSettingsAIPersonas"));
const KbAdminPage = lazy(() =>
  import("@/components/admin/ai-knowledge/KbAdminPage").then((m) => ({ default: m.KbAdminPage })),
);
const AdminSettingsAIPricing = lazy(() => import("@/pages/admin/settings/AdminSettingsAIPricing"));
const AdminSettingsAIActions = lazy(() => import("@/pages/admin/settings/AdminSettingsAIActions"));
const AdminSettingsAIMemory = lazy(() => import("@/pages/admin/settings/AdminSettingsAIMemory"));
const ElevenLabsVoiceConfig = lazy(() => import("@/components/admin/settings/ElevenLabsVoiceConfig"));
const PublicChatbotSettings = lazy(() =>
  import("@/components/admin/public-chat/PublicChatbotSettings").then((m) => ({
    default: m.PublicChatbotSettings,
  })),
);

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
          <TabsTrigger value="public-chat" className="gap-2">
            <MessageCircle className="h-4 w-4" />
            Chatbot Pubblico
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
            <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/10">
              <CardContent className="p-4 text-sm space-y-2">
                <p className="font-medium text-amber-900 dark:text-amber-200">
                  ⚖️ Gerarchia di valutazione policy AI (priorità decrescente)
                </p>
                <ol className="list-decimal pl-5 space-y-1 text-xs text-amber-800 dark:text-amber-300">
                  <li>
                    <strong>silvio_automation_policies</strong> (
                    <a href="/admin/ai-operate?tab=policies" className="underline">
                      AI Operate → Policies
                    </a>
                    ) — <strong>policy globali platform-level</strong>:
                    se mode=<code>blocked</code> per un'azione, NESSUNA azienda può eseguirla,
                    indipendentemente dai suoi permessi specifici (override hard).
                  </li>
                  <li>
                    <strong>ai_company_action_permissions</strong> (questa pagina) — <strong>permessi
                    per-azienda</strong>: definisce per ogni coppia (azione × azienda) la modalità
                    (auto/propose/require_confirmation/disabled). Si applica SOLO se la policy
                    globale non è <code>blocked</code>.
                  </li>
                  <li>
                    <strong>plan_ai_budgets</strong> — <strong>budget mensili AI</strong>:
                    se l'azienda ha esaurito il budget, l'esecuzione è negata anche se i due livelli
                    sopra la consentono.
                  </li>
                </ol>
                <p className="text-xs text-amber-800 dark:text-amber-300 pt-1 border-t border-amber-300/30">
                  <strong>Esempio:</strong> per <code>cancel_subscription</code>, la policy globale
                  è <code>blocked</code> (seed sicuro) → nessun cliente può cancellarla via AI anche
                  se il super_admin gli desse <code>auto_execute</code> qui.
                </p>
              </CardContent>
            </Card>
            <Suspense fallback={fallback}>
              <AdminSettingsAIActions />
            </Suspense>
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground border-l-4 border-blue-300">
                <strong>Memoria sistema/azienda</strong>:{" "}
                <code>ai_brain_facts</code> — fatti generici della company che il chatbot Silvio
                ricorda nelle conversazioni. Diversa dalla{" "}
                <a href="/admin/ai-operate?tab=memory" className="underline">
                  Memoria Personas
                </a>{" "}
                (per-persona admin, in AI Operate).
              </CardContent>
            </Card>
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

        <TabsContent value="public-chat">
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              Configura il chatbot pubblico embedabile sul tuo sito web. Cattura lead e
              genera marketing_contacts automaticamente. <br />
              <strong>Edge function:</strong> <code>public-chat-widget</code> (no auth, CORS).
            </CardContent>
          </Card>
          <Suspense fallback={fallback}>
            <PublicChatbotSettings />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
