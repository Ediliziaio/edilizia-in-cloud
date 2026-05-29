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
import { ArrowLeft, Brain, Filter, Inbox } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailLearningDashboard } from "@/components/email-ai/EmailLearningDashboard";
import { EmailRulesSettings } from "@/components/email-ai/EmailRulesSettings";
import { BonificaPanel } from "@/components/email-ai/BonificaPanel";

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

      <Tabs defaultValue="apprendimento" className="w-full">
        <TabsList className="mb-4 grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="apprendimento" className="gap-1.5">
            <Brain className="h-4 w-4" /> Apprendimento
          </TabsTrigger>
          <TabsTrigger value="regole" className="gap-1.5">
            <Filter className="h-4 w-4" /> Regole
          </TabsTrigger>
          <TabsTrigger value="bonifica" className="gap-1.5">
            <Inbox className="h-4 w-4" /> Bonifica
          </TabsTrigger>
        </TabsList>

        <TabsContent value="apprendimento" className="mt-0">
          <EmailLearningDashboard days={30} />
        </TabsContent>

        <TabsContent value="regole" className="mt-0">
          <EmailRulesSettings />
        </TabsContent>

        <TabsContent value="bonifica" className="mt-0">
          <BonificaPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
