/**
 * ActionProposalsList — MP-AIE-02 v2
 *
 * Lista completa delle proposte di azione pending+resolved della company.
 * Usata dentro lo Sheet aperto da ActionProposalsBadge.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActionProposalCard } from "./ActionProposalCard";
import { Inbox } from "lucide-react";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

interface ProposalLite {
  id: string;
  status: string;
  created_at: string;
}

export function ActionProposalsList() {
  const companyId = useEffectiveCompanyId();
  const [pending, setPending] = useState<ProposalLite[]>([]);
  const [recent, setRecent] = useState<ProposalLite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) {
      setPending([]);
      setRecent([]);
      setLoading(false);
      return;
    }
    let cancelled = false;

    const load = async () => {
      // FIX TENANT ISOLATION: filtro company_id esplicito su entrambe le query
      const [pendingRes, recentRes] = await Promise.all([
        supabase
          .from("ai_action_proposals" as never)
          .select("id, status, created_at")
          .eq("company_id", companyId)
          .eq("status", "pending")
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("ai_action_proposals" as never)
          .select("id, status, created_at")
          .eq("company_id", companyId)
          .neq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (!cancelled) {
        setPending(((pendingRes.data ?? []) as unknown) as ProposalLite[]);
        setRecent(((recentRes.data ?? []) as unknown) as ProposalLite[]);
        setLoading(false);
      }
    };

    void load();

    const channel = supabase
      .channel(`action-proposals-list-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ai_action_proposals",
          filter: `company_id=eq.${companyId}`,
        },
        () => { void load(); },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  if (loading) {
    return (
      <div className="space-y-3 mt-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <Tabs defaultValue="pending" className="mt-4">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="pending">
          In attesa ({pending.length})
        </TabsTrigger>
        <TabsTrigger value="recent">
          Recenti ({recent.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="pending" className="space-y-3 mt-3">
        {pending.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center">
            <Inbox className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nessuna azione in attesa di conferma.</p>
          </div>
        ) : (
          pending.map((p) => <ActionProposalCard key={p.id} proposalId={p.id} />)
        )}
      </TabsContent>

      <TabsContent value="recent" className="space-y-3 mt-3">
        {recent.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center">
            <Inbox className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nessuna azione recente.</p>
          </div>
        ) : (
          recent.map((p) => <ActionProposalCard key={p.id} proposalId={p.id} />)
        )}
      </TabsContent>
    </Tabs>
  );
}

export default ActionProposalsList;
