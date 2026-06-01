/**
 * EmailAiSettingsPage — Impostazioni AI della casella (livello azienda)
 *
 * Due aree:
 *  - Apprendimento: north-star L1% + KPI del feedback loop (MP-03)
 *  - Regole di instradamento: editor regole deterministiche L1 (MP-05)
 *
 * Raggiunta da /azienda/email/ai (link nella sidebar email).
 */
import { Link } from "react-router-dom";
import { ArrowLeft, Brain, Filter, Inbox, Sun, ShieldCheck, Send, Bot, Activity } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailLearningDashboard } from "@/components/email-ai/EmailLearningDashboard";
import { EmailRulesSettings } from "@/components/email-ai/EmailRulesSettings";
import { BonificaPanel } from "@/components/email-ai/BonificaPanel";
import { DigestCard } from "@/components/email-ai/DigestCard";
import { DeliverabilityPanel } from "@/components/email-ai/DeliverabilityPanel";
import { SequenzeManager } from "@/components/email-ai/SequenzeManager";
import { SilvioHub } from "@/components/silvio/SilvioHub";
import { EmailPipelineStatus } from "@/components/email-ai/EmailPipelineStatus";

export default function EmailAiSettingsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4 flex items-center gap-3">
        <Link
          to="/azienda/email"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-blue-100 text-blue-700 transition-colors hover:bg-blue-50"
          aria-label="Torna alla casella"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">AI della casella email</h1>
          <p className="text-xs text-slate-500 sm:text-sm">
            Apprendimento, metriche e regole di instradamento automatico.
          </p>
        </div>
      </div>

      <Tabs defaultValue="giornata" className="w-full">
        <TabsList className="mb-4 grid w-full max-w-4xl grid-cols-4 sm:grid-cols-8">
          <TabsTrigger value="giornata" className="gap-1.5">
            <Sun className="h-4 w-4" /> Giornata
          </TabsTrigger>
          <TabsTrigger value="silvio" className="gap-1.5">
            <Bot className="h-4 w-4" /> Silvio
          </TabsTrigger>
          <TabsTrigger value="sequenze" className="gap-1.5">
            <Send className="h-4 w-4" /> Sequenze
          </TabsTrigger>
          <TabsTrigger value="apprendimento" className="gap-1.5">
            <Brain className="h-4 w-4" /> Apprendimento
          </TabsTrigger>
          <TabsTrigger value="regole" className="gap-1.5">
            <Filter className="h-4 w-4" /> Regole
          </TabsTrigger>
          <TabsTrigger value="bonifica" className="gap-1.5">
            <Inbox className="h-4 w-4" /> Bonifica
          </TabsTrigger>
          <TabsTrigger value="recapito" className="gap-1.5">
            <ShieldCheck className="h-4 w-4" /> Recapito
          </TabsTrigger>
          <TabsTrigger value="sistema" className="gap-1.5">
            <Activity className="h-4 w-4" /> Sistema
          </TabsTrigger>
        </TabsList>

        <TabsContent value="giornata" className="mt-0">
          <DigestCard />
        </TabsContent>

        <TabsContent value="silvio" className="mt-0">
          <SilvioHub />
        </TabsContent>

        <TabsContent value="sequenze" className="mt-0">
          <SequenzeManager />
        </TabsContent>

        <TabsContent value="apprendimento" className="mt-0">
          <EmailLearningDashboard days={30} />
        </TabsContent>

        <TabsContent value="regole" className="mt-0">
          <EmailRulesSettings />
        </TabsContent>

        <TabsContent value="bonifica" className="mt-0">
          <BonificaPanel />
        </TabsContent>

        <TabsContent value="recapito" className="mt-0">
          <DeliverabilityPanel />
        </TabsContent>

        <TabsContent value="sistema" className="mt-0">
          <EmailPipelineStatus />
        </TabsContent>
      </Tabs>
    </div>
  );
}
