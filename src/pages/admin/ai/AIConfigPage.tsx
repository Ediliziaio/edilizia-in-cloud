/**
 * AIConfigPage — Configurazione AI (sostituisce vecchia /admin/impostazioni/agenti-ai)
 *
 * 7 tab: Routing · Personas · Knowledge · Pricing · Governance · Voci · Chatbot Pubblico
 *
 * Refactor Strategia C — consolida tutto ciò che è "configurazione" del sistema AI
 * in un'unica pagina. La vecchia route fa redirect qui.
 */
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Settings,
  Users,
  BookOpen,
  Coins,
  ShieldAlert,
  Mic,
  MessageCircle,
  Sliders,
  Activity,
  Bot,
} from "lucide-react";
import { AIPageHeader } from "@/components/admin/ai-shared/AIPageHeader";
import { AITabsList } from "@/components/admin/ai-shared/AITabsList";
import { SectionAlert, SectionIntro } from "@/components/admin/ai-shared/SectionIntro";

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
  <div className="space-y-3 py-4">
    <Skeleton className="h-10 w-1/3" />
    <Skeleton className="h-32 w-full" />
    <Skeleton className="h-64 w-full" />
  </div>
);

const TABS = [
  { value: "routing", label: "Routing", icon: Sliders },
  { value: "personas", label: "Personas", icon: Users },
  { value: "knowledge", label: "Knowledge", icon: BookOpen },
  { value: "pricing", label: "Pricing", icon: Coins },
  { value: "governance", label: "Governance", icon: ShieldAlert },
  { value: "voices", label: "Voci TTS", icon: Mic },
  { value: "public-chat", label: "Chatbot Pubblico", icon: MessageCircle },
];

export default function AIConfigPage() {
  return (
    <div className="p-4 md:p-6 max-w-screen-2xl mx-auto">
      <AIPageHeader
        icon={Settings}
        title="AI · Configurazione"
        subtitle="Configurazione"
        description="Imposta come il sistema AI ragiona, parla, costa e si comporta. Routing modelli, personas, knowledge base, pricing e governance — il setup che rende tutto il resto operativo."
        quickLinks={[
          { label: "Monitor live", to: "/admin/ai-monitor", icon: Activity },
          { label: "Operate (azioni)", to: "/admin/ai-operate", icon: Bot },
        ]}
      />

      <AITabsList
        defaultValue="routing"
        tabs={TABS}
        contents={{
          routing: (
            <>
              <SectionAlert.info
                title="Routing & Models"
                description="Mappa task AI → modello primario + fallback chain via OpenRouter. Cambia qui se vuoi che 'preventivo_genera' usi Claude Sonnet invece di GPT-4o."
                bullets={[
                  "Ogni task_key ha 1 modello primario + N fallback in caso di errore",
                  "Modifiche immediate (no deploy richiesto)",
                  "Stima costi mensili basata su usage storico",
                ]}
                related={[
                  { label: "Costi reali", to: "/admin/ai-monitor?tab=usage" },
                  { label: "Test modelli A/B", to: "/admin/ai-monitor?tab=test-lab" },
                ]}
              />
              <Suspense fallback={fallback}>
                <AdminSettingsAIRouter />
              </Suspense>
            </>
          ),

          personas: (
            <>
              <SectionAlert.warning
                title="Personas Cliente"
                description="Le 18+ personas che le aziende clienti vedono nella loro chat AI: sales, finance, hr, compliance, ecc. Sistema prompt, tier, allowed_tools."
                bullets={[
                  "Le Personas C-suite Admin (Beatrice CFO, Marco CMO, ...) vivono altrove",
                  "Modifiche al system prompt sono immediate e applicate a TUTTI i clienti",
                ]}
                related={[
                  { label: "Personas Admin (C-suite)", to: "/admin/ai-operate?tab=personas" },
                ]}
              />
              <Suspense fallback={fallback}>
                <AdminSettingsAIPersonas />
              </Suspense>
            </>
          ),

          knowledge: (
            <>
              <SectionAlert.info
                title="Knowledge Base universale"
                description="Documenti, Q&A test, playground, qualità chunks, budget embeddings, fonti esterne. La 'memoria' che le AI consultano via RAG quando rispondono."
                bullets={[
                  "Ogni chunk ha embedding semantico (text-embedding-3-small)",
                  "Q&A tests = regression tests automatici sul KB (ground truth)",
                  "Playground = simula query e vedi i top-K chunks recuperati",
                ]}
                related={[
                  { label: "Self-learning loop", to: "/admin/ai-operate?tab=learning" },
                ]}
              />
              <Suspense fallback={fallback}>
                <KbAdminPage />
              </Suspense>
            </>
          ),

          pricing: (
            <>
              <SectionAlert.info
                title="Pricing & Margini"
                description="Da costo wholesale OpenRouter al prezzo retail customer. Tier (economic/balanced/premium), markup %, override per azienda."
                bullets={[
                  "Markup di default applicato a tutti i task del tier",
                  "Override per azienda specifica (es. cliente strategico con sconto)",
                  "Dashboard margini real-time: revenue vs cost giornaliero",
                ]}
                related={[
                  { label: "Costi & Ricavi live", to: "/admin/ai-monitor?tab=usage" },
                ]}
              />
              <Suspense fallback={fallback}>
                <AdminSettingsAIPricing />
              </Suspense>
            </>
          ),

          governance: (
            <div className="space-y-4">
              <SectionIntro
                icon={ShieldAlert}
                tone="warning"
                title="⚖️ Gerarchia 3 livelli (priorità decrescente)"
                description="Quando l'AI prova a eseguire un'azione, vengono valutati i seguenti gate in ordine. Se uno blocca, gli altri non contano."
                bullets={[
                  "1. silvio_automation_policies (AI Operate → Policies) → globale platform-level. mode=blocked → STOP a tutti, sempre.",
                  "2. ai_company_action_permissions (qui sotto) → permessi per-azienda. Si applica solo se la policy globale lo consente.",
                  "3. plan_ai_budgets → budget mensile AI. Se esaurito, esecuzione negata.",
                  "Esempio: cancel_subscription è policy=blocked di default → nessun cliente può cancellarla via AI, neanche se gli desti auto_execute qui.",
                ]}
                related={[
                  { label: "Policy globali platform", to: "/admin/ai-operate?tab=policies" },
                ]}
              />
              <Suspense fallback={fallback}>
                <AdminSettingsAIActions />
              </Suspense>
              <SectionAlert.info
                title="Memoria sistema/azienda"
                description="ai_brain_facts — fatti generici che il chatbot Silvio ricorda nelle conversazioni con un'azienda specifica."
                bullets={[
                  "Diversa dalla Memoria Personas Admin (per-persona, in AI Operate)",
                  "Tipicamente popolata automaticamente da silvio-memory-extract cron",
                ]}
                related={[
                  { label: "Memoria Personas Admin", to: "/admin/ai-operate?tab=memory" },
                ]}
              />
              <Suspense fallback={fallback}>
                <AdminSettingsAIMemory />
              </Suspense>
            </div>
          ),

          voices: (
            <>
              <SectionAlert.info
                title="Voci ElevenLabs (TTS)"
                description="Sintesi vocale per assistenti AI in modalità voice (chiamate outbound, vocaletti). Mappa voice_id → persona/scenario."
                related={[
                  { label: "Routing modelli (incluso STT/TTS)", to: "/admin/ai-config?tab=routing" },
                ]}
              />
              <Suspense fallback={fallback}>
                <ElevenLabsVoiceConfig />
              </Suspense>
            </>
          ),

          "public-chat": (
            <>
              <SectionAlert.success
                title="Chatbot Pubblico (lead capture)"
                description="Widget embeddable per il sito web. Cattura lead anonimi → AI qualifica raccolta nome+email/telefono → crea automaticamente marketing_contact con source='public_chatbot'."
                bullets={[
                  "Snippet HTML pronto da copiare nel sito (sotto)",
                  "Edge function: public-chat-widget (no auth, CORS aperto)",
                  "Widget montato live anche su questa app (FAB in basso a destra)",
                ]}
              />
              <Suspense fallback={fallback}>
                <PublicChatbotSettings />
              </Suspense>
            </>
          ),
        }}
      />
    </div>
  );
}
