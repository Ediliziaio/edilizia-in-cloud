import { useState } from "react";
import { useConversations, useConversationsRealtime } from "@/hooks/useMessagingData";
import { useAuth } from "@/contexts/AuthContext";
import { ConversationList } from "@/components/messaging/ConversationList";
import { ChatView } from "@/components/messaging/ChatView";
import { AiPanel } from "@/components/messaging/AiPanel";
import { MessagingSettingsTab } from "@/components/messaging/MessagingSettingsTab";
import { WhatsAppBroadcastTab } from "@/components/marketing/whatsapp/WhatsAppBroadcastTab";
import { WhatsAppTemplatesTab } from "@/components/marketing/whatsapp/WhatsAppTemplatesTab";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MessageCircle, Megaphone, Settings, FileText } from "lucide-react";
import { ApiHealthBanner } from "@/components/marketing/ApiHealthBanner";

export default function MarketingWhatsApp() {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const { effectiveCompany } = useAuth();
  const { data: conversations } = useConversations();
  useConversationsRealtime(effectiveCompany?.id);

  const selectedConversation = conversations?.find((c: any) => c.id === selectedConvId);

  return (
    <div className="space-y-4">
      <ApiHealthBanner filter={["whatsapp"]} />

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">WhatsApp Marketing</h1>
      </div>

      <Tabs defaultValue="conversazioni" className="w-full">
        <TabsList>
          <TabsTrigger value="conversazioni" className="gap-2">
            <MessageCircle className="h-4 w-4" />
            Conversazioni
          </TabsTrigger>
          <TabsTrigger value="broadcast" className="gap-2">
            <Megaphone className="h-4 w-4" />
            Broadcast
          </TabsTrigger>
          <TabsTrigger value="template" className="gap-2">
            <FileText className="h-4 w-4" />
            Template
          </TabsTrigger>
          <TabsTrigger value="impostazioni" className="gap-2">
            <Settings className="h-4 w-4" />
            Impostazioni
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conversazioni">
          <div className="border rounded-lg bg-background overflow-hidden" style={{ height: "calc(100vh - 260px)" }}>
            <div className="flex h-full">
              <div className="w-80 flex-shrink-0">
                <ConversationList
                  selectedId={selectedConvId}
                  onSelect={(id) => {
                    setSelectedConvId(id);
                    setSelectedMessageId(null);
                  }}
                />
              </div>
              <div className="flex-1 flex flex-col border-l">
                <ChatView
                  conversationId={selectedConvId}
                  selectedMessageId={selectedMessageId}
                  onSelectMessage={setSelectedMessageId}
                  conversation={selectedConversation}
                />
              </div>
              <div className="w-80 flex-shrink-0">
                <AiPanel selectedMessageId={selectedMessageId} />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="broadcast">
          <WhatsAppBroadcastTab />
        </TabsContent>

        <TabsContent value="template">
          <WhatsAppTemplatesTab />
        </TabsContent>

        <TabsContent value="impostazioni">
          <MessagingSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
