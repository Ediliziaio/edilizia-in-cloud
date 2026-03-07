import { Badge } from "@/components/ui/badge";
import { Database } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { KnowledgeBaseDocumentList } from "../components/KnowledgeBaseDocumentList";
import type { KBDocument } from "../types/knowledgeBase.types";

export default function PlatformKnowledgeBasePage() {
  const { data: docs, isLoading } = useQuery({
    queryKey: ["ai-kb-global"],
    queryFn: async (): Promise<KBDocument[]> => {
      const { data, error } = await supabase
        .from("ai_agent_knowledge_docs" as never)
        .select("*")
        .is("agent_id", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as KBDocument[];
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Knowledge Base</h1>
        <Badge variant="outline" className="gap-1">
          <Database className="h-3 w-3" />
          {docs?.length ?? 0} documenti
        </Badge>
      </div>

      <KnowledgeBaseDocumentList
        docs={docs ?? []}
        isLoading={isLoading}
        queryKey={["ai-kb-global"]}
        agentId={null}
        showTypeFilter
        showRagIndicator
      />
    </div>
  );
}
