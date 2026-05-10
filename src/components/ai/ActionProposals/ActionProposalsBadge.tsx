/**
 * ActionProposalsBadge — MP-AIE-02 v2
 *
 * Badge globale (header) con conteggio realtime delle proposte pending della
 * company. Click → apre Sheet con lista completa.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
        className="relative h-9 w-9 shrink-0"
        onClick={() => setOpen(true)}
        title={count > 0 ? `${count} azioni AI da approvare` : "Azioni proposte AI"}
        aria-label={`Azioni proposte AI (${count})`}
      >
        {/* 🆕 Icon Inbox (era Sparkles, identica a SilvioBellPopover → confusione header) */}
        <Inbox className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        {count > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-5 min-w-[20px] rounded-full px-1 text-[10px] font-bold flex items-center justify-center"
          >
            {count > 99 ? "99+" : count}
          </Badge>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-amber-600" />
              Azioni proposte AI
              {count > 0 ? <Badge variant="destructive">{count}</Badge> : null}
            </SheetTitle>
            <SheetDescription className="text-xs">
              Silvio ha proposto azioni che richiedono il tuo OK prima di essere eseguite.
              Scadono automaticamente dopo il TTL indicato.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto -mx-6 px-6 pt-2">
            <ActionProposalsList />
          </div>
          <div className="border-t pt-3 -mx-6 px-6">
            <Link
              to="/azienda/azioni-proposte"
              onClick={() => setOpen(false)}
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              Apri pagina dedicata
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export default ActionProposalsBadge;
