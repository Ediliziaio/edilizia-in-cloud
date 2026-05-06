/**
 * ActionProposalsBadge — MP-AIE-02 v2
 *
 * Badge globale (header) con conteggio realtime delle proposte pending della
 * company. Click → apre Sheet con lista completa.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ActionProposalsList } from "./ActionProposalsList";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export function ActionProposalsBadge() {
  const companyId = useEffectiveCompanyId();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setCount(0);
      return;
    }
    let cancelled = false;

    const fetchCount = async () => {
      // FIX TENANT ISOLATION: filtro company_id esplicito
      const { count: c } = await supabase
        .from("ai_action_proposals" as never)
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString());
      if (!cancelled) setCount(c ?? 0);
    };

    void fetchCount();

    const channel = supabase
      .channel(`action-proposals-badge-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ai_action_proposals",
          filter: `company_id=eq.${companyId}`,
        },
        () => { void fetchCount(); },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setOpen(true)}
        aria-label={`Azioni proposte (${count})`}
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <Badge className="absolute -top-1 -right-1 h-5 min-w-[20px] rounded-full px-1 text-[10px]">
            {count > 99 ? "99+" : count}
          </Badge>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Azioni proposte da Silvio</SheetTitle>
          </SheetHeader>
          <ActionProposalsList />
        </SheetContent>
      </Sheet>
    </>
  );
}

export default ActionProposalsBadge;
