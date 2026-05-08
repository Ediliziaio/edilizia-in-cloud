import { lazy, Suspense, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { ElevenLabsVoiceConfig } from "@/components/admin/settings/ElevenLabsVoiceConfig";
import {
  Mic,
  Settings,
  Zap,
  DollarSign,
  Users,
  BookOpen,
  Brain,
  ShieldCheck,
  Route,
  Coins,
  Library,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";

const PlatformSettingsPage = lazy(() => import("@/modules/ai-agents/pages/PlatformSettingsPage"));
const AdminSettingsAIRouter = lazy(() => import("@/pages/admin/settings/AdminSettingsAIRouter"));
const AdminSettingsAIPricing = lazy(() => import("@/pages/admin/settings/AdminSettingsAIPricing"));
const AdminSettingsAIPersonas = lazy(() => import("@/pages/admin/settings/AdminSettingsAIPersonas"));
const AdminSettingsAIKnowledge = lazy(() => import("@/pages/admin/settings/AdminSettingsAIKnowledge"));
const AdminSettingsAIMemory = lazy(() => import("@/pages/admin/settings/AdminSettingsAIMemory"));
const AdminSettingsAIActions = lazy(() => import("@/pages/admin/settings/AdminSettingsAIActions"));

/**
 * AdminSettingsAI — riorganizzata in 4 categorie semantiche per ridurre
 * la cognitive load (8 tab piatte → 4 gruppi + sub-tab per gruppo).
 *
 * Struttura:
 *   Routing & Models   → AI Router | Le 18 Personas
 *   Economics          → Pricing & Margini | Memoria Silvio
 *   Content            → Knowledge Base | Voci ElevenLabs
 *   Governance         → Permessi azioni | Configurazione legacy (deprecated)
 *
 * I sub-componenti restano invariati per garantire che tutto continui
 * a funzionare senza regressioni.
 */
export default function AdminSettingsAI() {
  const [category, setCategory] = useState<"routing" | "economics" | "content" | "governance">("routing");

  const fallback = <Skeleton className="h-[400px]" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agenti AI</h1>
        <p className="text-muted-foreground">
          Router cost-optimized via OpenRouter, pricing & margini, le 18 personas, voci vocali
        </p>
      </div>

      {/* Categorie principali — 4 invece di 8 → meno cognitive load */}
      <Tabs value={category} onValueChange={(v) => setCategory(v as typeof category)} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto p-1">
          <TabsTrigger value="routing" className="gap-2 py-2">
            <Route className="h-4 w-4" />
            <span className="hidden sm:inline">Routing & Models</span>
            <span className="sm:hidden">Routing</span>
          </TabsTrigger>
          <TabsTrigger value="economics" className="gap-2 py-2">
            <Coins className="h-4 w-4" />
            <span className="hidden sm:inline">Economics</span>
            <span className="sm:hidden">€</span>
          </TabsTrigger>
          <TabsTrigger value="content" className="gap-2 py-2">
            <Library className="h-4 w-4" />
            <span>Content</span>
          </TabsTrigger>
          <TabsTrigger value="governance" className="gap-2 py-2">
            <ShieldAlert className="h-4 w-4" />
            <span className="hidden sm:inline">Governance</span>
            <span className="sm:hidden">Governance</span>
          </TabsTrigger>
        </TabsList>

        {/* ─── ROUTING & MODELS ──────────────────────────────────────── */}
        <TabsContent value="routing" className="space-y-3">
          <CategoryDescription
            title="Routing & Models"
            description="Configura quali modelli AI vengono usati per ogni task e personalizza le 18 personas con il loro system prompt."
          />
          <Tabs defaultValue="router" className="space-y-3">
            <TabsList>
              <TabsTrigger value="router" className="gap-2">
                <Zap className="h-4 w-4" />
                AI Router
              </TabsTrigger>
              <TabsTrigger value="personas" className="gap-2">
                <Users className="h-4 w-4" />
                Le 18 Personas
              </TabsTrigger>
            </TabsList>
            <TabsContent value="router">
              <Suspense fallback={fallback}>
                <AdminSettingsAIRouter />
              </Suspense>
            </TabsContent>
            <TabsContent value="personas">
              <Suspense fallback={fallback}>
                <AdminSettingsAIPersonas />
              </Suspense>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ─── ECONOMICS ─────────────────────────────────────────────── */}
        <TabsContent value="economics" className="space-y-3">
          <CategoryDescription
            title="Economics"
            description="Pricing & margini sui task AI, memoria contestuale per azienda usata da Silvio per ridurre i token."
          />
          <Tabs defaultValue="pricing" className="space-y-3">
            <TabsList>
              <TabsTrigger value="pricing" className="gap-2">
                <DollarSign className="h-4 w-4" />
                Pricing & Margini
              </TabsTrigger>
              <TabsTrigger value="memory" className="gap-2">
                <Brain className="h-4 w-4" />
                Memoria Silvio
              </TabsTrigger>
            </TabsList>
            <TabsContent value="pricing">
              <Suspense fallback={fallback}>
                <AdminSettingsAIPricing />
              </Suspense>
            </TabsContent>
            <TabsContent value="memory">
              <Suspense fallback={fallback}>
                <AdminSettingsAIMemory />
              </Suspense>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ─── CONTENT ───────────────────────────────────────────────── */}
        <TabsContent value="content" className="space-y-3">
          <CategoryDescription
            title="Content"
            description="Knowledge base universale (RAG) e voci sintetizzate ElevenLabs per gli agenti vocali."
          />
          <Tabs defaultValue="knowledge" className="space-y-3">
            <TabsList>
              <TabsTrigger value="knowledge" className="gap-2">
                <BookOpen className="h-4 w-4" />
                Knowledge Base
              </TabsTrigger>
              <TabsTrigger value="voices" className="gap-2">
                <Mic className="h-4 w-4" />
                Voci ElevenLabs
              </TabsTrigger>
            </TabsList>
            <TabsContent value="knowledge">
              <Suspense fallback={fallback}>
                <AdminSettingsAIKnowledge />
              </Suspense>
            </TabsContent>
            <TabsContent value="voices">
              <ElevenLabsVoiceConfig />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ─── GOVERNANCE ────────────────────────────────────────────── */}
        <TabsContent value="governance" className="space-y-3">
          <CategoryDescription
            title="Governance"
            description="Permessi sulle azioni AI per azienda e configurazioni legacy in fase di smaltimento."
          />
          <Tabs defaultValue="actions" className="space-y-3">
            <TabsList>
              <TabsTrigger value="actions" className="gap-2">
                <ShieldCheck className="h-4 w-4" />
                Permessi azioni
              </TabsTrigger>
              <TabsTrigger value="legacy" className="gap-2">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Configurazione legacy</span>
                <span className="sm:hidden">Legacy</span>
                <span className="ml-1 text-[9px] px-1 py-0 rounded bg-amber-100 text-amber-700 border border-amber-300 font-semibold uppercase">
                  Deprecata
                </span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="actions">
              <Suspense fallback={fallback}>
                <AdminSettingsAIActions />
              </Suspense>
            </TabsContent>
            <TabsContent value="legacy" className="space-y-3">
              {/* Banner deprecazione: la config legacy ha mix di TTS/LLM/Telnyx
                  che andranno smaltiti — qui informiamo l'admin di non basarsi
                  su queste impostazioni per nuove integrazioni. */}
              <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
                <CardContent className="p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-xs">
                    <p className="font-medium text-amber-900 dark:text-amber-200">
                      Configurazione legacy in fase di smaltimento
                    </p>
                    <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                      Mix di LLM/TTS/Telnyx/domain-whitelist storici. Non basare nuove
                      integrazioni su queste impostazioni — usa <strong>AI Router</strong> e{" "}
                      <strong>Pricing & Margini</strong>. Le voci verranno migrate progressivamente.
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Suspense fallback={fallback}>
                <PlatformSettingsPage />
              </Suspense>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Descrizione categoria — context line subito sotto le tab principali */
function CategoryDescription({ title, description }: { title: string; description: string }) {
  return (
    <div className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-3 py-1">
      <span className="font-medium text-foreground/80">{title}</span> · {description}
    </div>
  );
}
