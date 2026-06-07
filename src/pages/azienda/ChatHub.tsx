import { useState } from "react";
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
  const [tab, setTab] = useState<"conversazioni" | "team">("team");

  return (
    <div className="h-[calc(100vh-7.5rem)] supports-[height:100dvh]:h-[calc(100dvh-7.5rem)] md:h-[calc(100vh-120px)] flex flex-col px-3 sm:px-0">
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

        <TabsContent value="conversazioni" className="flex-1 min-h-0 m-0">
          <ConversazioniInbox companyIdOverride={companyIdOverride} />
        </TabsContent>
        <TabsContent value="team" className="flex-1 min-h-0 m-0">
          <InternalChat companyIdOverride={companyIdOverride} embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
