import { useState } from "react";
import { useMessagingEnabled, useConversations } from "@/hooks/useMessagingData";
import { ConversationList } from "@/components/messaging/ConversationList";
import { ChatView } from "@/components/messaging/ChatView";
import { AiPanel } from "@/components/messaging/AiPanel";
import { SimulateMessageDialog } from "@/components/messaging/SimulateMessageDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, MessageSquare, Lock } from "lucide-react";

export default function MessagingBeta() {
  const isEnabled = useMessagingEnabled();
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [simulateOpen, setSimulateOpen] = useState(false);
  const { data: conversations } = useConversations();

  const selectedConversation = conversations?.find((c: any) => c.id === selectedConvId);

  if (!isEnabled) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center max-w-md">
          <Lock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-semibold mb-2">Messaggistica (BETA)</h2>
          <p className="text-muted-foreground text-sm">
            Questo modulo non è attivo per la tua azienda. Contatta l'amministratore per abilitarlo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Messaggistica</h1>
          <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-200">
            BETA
          </Badge>
        </div>
        <Button onClick={() => setSimulateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Simula Messaggio
        </Button>
      </div>

      <div className="border rounded-lg bg-background overflow-hidden" style={{ height: "calc(100vh - 220px)" }}>
        <div className="flex h-full">
          {/* Left: Conversations */}
          <div className="w-80 flex-shrink-0">
            <ConversationList
              selectedId={selectedConvId}
              onSelect={(id) => {
                setSelectedConvId(id);
                setSelectedMessageId(null);
              }}
            />
          </div>

          {/* Center: Chat */}
          <div className="flex-1 flex flex-col border-l">
            <ChatView
              conversationId={selectedConvId}
              selectedMessageId={selectedMessageId}
              onSelectMessage={setSelectedMessageId}
              conversation={selectedConversation}
            />
          </div>

          {/* Right: AI Panel */}
          <div className="w-80 flex-shrink-0">
            <AiPanel selectedMessageId={selectedMessageId} />
          </div>
        </div>
      </div>

      <SimulateMessageDialog
        open={simulateOpen}
        onOpenChange={setSimulateOpen}
        onCreated={(convId) => {
          setSelectedConvId(convId);
        }}
      />
    </div>
  );
}
