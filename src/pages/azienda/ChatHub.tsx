import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MessagesSquare, Users } from "lucide-react";
import InternalChat from "@/pages/azienda/InternalChat";
import ConversazioniInbox from "@/pages/azienda/conversazioni/ConversazioniInbox";

interface ChatHubProps {
  /** Override company_id per il riuso lato admin (scope alla propria azienda). */
  companyIdOverride?: string;
}

/**
 * Hub chat: due modalità sotto /azienda/chat
 *  • "Conversazioni" → inbox unificato per contatto (email+sms+whatsapp)
 *  • "Team"          → chat interna esistente (InternalChat)
 * ChatHub possiede il budget di altezza; i figli riempiono lo spazio (InternalChat
 * via prop `embedded`, ConversazioniInbox via h-full) così la barra tab non sfora.
 */
export default function ChatHub({ companyIdOverride }: ChatHubProps = {}) {
  // Default "team" = nessuna regressione sull'esperienza attuale di /azienda/chat.
  // Il tab "Conversazioni" mostra lo stato di attivazione finché la migration
  // 20270704000000 non è applicata; diventerà default quando l'inbox sarà attivo.
  // `?tab=conversazioni` apre direttamente l'inbox: lo usano gli avvisi «ti ha
  // risposto per email», che devono portare al filo e non alla chat del team.
  const [params] = useSearchParams();
  const [tab, setTab] = useState<"conversazioni" | "team">(
    params.get("tab") === "conversazioni" ? "conversazioni" : "team",
  );

  // h-full riempie il content-box di <main> (che ha altezza bloccata e scroll
  // proprio) → dentro la chat NON si scrolla la pagina: ogni colonna ha la sua
  // barra e il compositore resta ancorato in basso, come su WhatsApp Web.
  // I margini negativi annullano il padding di <main> per non sprecare altezza:
  // -mx-3 il p-3 mobile, -mb-24 parte del pb-28 sopra la bottom-nav.
  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col -mx-3 -mb-24 sm:mx-0 sm:mb-0">
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "conversazioni" | "team")}
        className="flex flex-col flex-1 min-h-0"
      >
        <TabsList className="shrink-0 self-start mb-2">
          <TabsTrigger value="conversazioni" className="gap-1.5">
            <MessagesSquare className="h-4 w-4" /> Conversazioni
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5">
            <Users className="h-4 w-4" /> Team
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conversazioni" className="flex-1 min-h-0 overflow-hidden m-0">
          <ConversazioniInbox companyIdOverride={companyIdOverride} />
        </TabsContent>
        <TabsContent value="team" className="flex-1 min-h-0 overflow-hidden m-0">
          <InternalChat companyIdOverride={companyIdOverride} embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
