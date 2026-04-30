import { useState } from "react";
import { useConversations } from "@/hooks/useMessagingData";
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
  const { data: conversations } = useConversations();

  const selectedConversation = conversations?.find((c) => c.id === selectedConvId);

  return (
    <div className="space-y-4">
      <ApiHealthBanner filter={["whatsapp"]} />

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">WhatsApp Marketing</h1>
      </div>

      <Tabs defaultValue="conversazioni" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
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
          <div className="border rounded-lg bg-background overflow-hidden h-[calc(100vh-260px)] min-h-[560px]">
            <div className="flex h-full flex-col lg:flex-row">
              <div className={`${selectedConvId ? "hidden lg:block" : "block"} w-full lg:w-80 lg:flex-shrink-0 h-full`}>
                <ConversationList
                  selectedId={selectedConvId}
                  onSelect={(id) => {
                    setSelectedConvId(id);
                    setSelectedMessageId(null);
                  }}
                />
              </div>
              <div className={`${selectedConvId ? "flex" : "hidden lg:flex"} flex-1 flex-col lg:border-l min-w-0 h-full`}>
                <ChatView
                  conversationId={selectedConvId}
                  selectedMessageId={selectedMessageId}
                  onSelectMessage={setSelectedMessageId}
                  conversation={selectedConversation}
                  onBack={() => {
                    setSelectedConvId(null);
                    setSelectedMessageId(null);
                  }}
                />
              </div>
              <div className="hidden xl:block w-80 flex-shrink-0">
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
