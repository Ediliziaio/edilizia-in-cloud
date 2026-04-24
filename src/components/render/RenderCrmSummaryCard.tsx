import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BriefcaseBusiness, ExternalLink, Link2, UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loadRenderGalleryMeta, resolveRenderGalleryMeta } from "@/lib/render/renderGalleryMeta";
import { RenderCrmLinker } from "@/components/render/RenderCrmLinker";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type RenderSessionTable =
  | "render_sessions"
  | "render_bagno_sessions"
  | "render_facciata_sessions"
  | "render_pavimento_sessions"
  | "render_persiane_sessions"
  | "render_tetto_sessions"
  | "render_stanza_sessions"
  | "render_pergole_sessions"
  | "render_piscine_sessions";

type RenderLinkUpdateClient = {
  from: (table: RenderSessionTable) => {
    update: (values: { contact_id: string | null; opportunity_id: string | null }) => {
      eq: (column: "id", value: string) => PromiseLike<{ error: { message?: string } | null }>;
    };
  };
};

interface RenderCrmSummaryCardProps {
  createdBy?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  sessionId?: string | null;
  sessionTable?: RenderSessionTable;
  editable?: boolean;
}

export function RenderCrmSummaryCard({
  createdBy,
  contactId,
  opportunityId,
  sessionId,
  sessionTable,
  editable = false,
}: RenderCrmSummaryCardProps) {
  const queryClient = useQueryClient();
  const [currentContactId, setCurrentContactId] = useState<string | null>(contactId ?? null);
  const [currentOpportunityId, setCurrentOpportunityId] = useState<string | null>(opportunityId ?? null);

  useEffect(() => {
    setCurrentContactId(contactId ?? null);
    setCurrentOpportunityId(opportunityId ?? null);
  }, [contactId, opportunityId]);

  const canPersist = editable && Boolean(sessionId && sessionTable);
  const hasAny = Boolean(createdBy || currentContactId || currentOpportunityId);
  const source = useMemo(
    () => ({
      created_by: createdBy ?? null,
      contact_id: currentContactId,
      opportunity_id: currentOpportunityId,
    }),
    [createdBy, currentContactId, currentOpportunityId],
  );

  const { data: meta } = useQuery({
    queryKey: ["render-crm-summary", source.created_by, source.contact_id, source.opportunity_id],
    queryFn: async () => {
      const maps = await loadRenderGalleryMeta([source]);
      return resolveRenderGalleryMeta(source, maps);
    },
    enabled: hasAny,
  });

  const linkMutation = useMutation({
    mutationFn: async (next: { contactId: string | null; opportunityId: string | null }) => {
      if (!sessionId || !sessionTable) return;
      const { error } = await (supabase as unknown as RenderLinkUpdateClient)
        .from(sessionTable)
        .update({
          contact_id: next.contactId,
          opportunity_id: next.opportunityId,
        })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Collegamento CRM aggiornato");
      await queryClient.invalidateQueries({ queryKey: ["render-crm-summary"] });
      await queryClient.invalidateQueries({ queryKey: ["linked-renders"] });
    },
    onError: () => {
      toast.error("Non sono riuscito ad aggiornare il collegamento CRM");
    },
  });

  const persistLink = (nextContactId: string | null, nextOpportunityId: string | null) => {
    setCurrentContactId(nextContactId);
    setCurrentOpportunityId(nextOpportunityId);
    if (canPersist) {
      linkMutation.mutate({ contactId: nextContactId, opportunityId: nextOpportunityId });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Collegamenti render
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasAny ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Creato da
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
                <UserRound className="h-3.5 w-3.5 text-primary" />
                {meta?.createdByName ?? "Non disponibile"}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Contatto
              </p>
              {meta?.contactName && currentContactId ? (
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{meta.contactName}</p>
                  <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                    <Link to={`/azienda/marketing/contatti/${currentContactId}`}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Non collegato</p>
              )}
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Opportunità
              </p>
              {meta?.opportunityName ? (
                <p className="mt-1 flex items-center gap-1.5 truncate text-sm font-medium">
                  <BriefcaseBusiness className="h-3.5 w-3.5 text-primary" />
                  {meta.opportunityName}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Non collegata</p>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Nessun contatto o opportunità collegata a questo render.
          </div>
        )}

        {editable && (
          <div className="rounded-lg border bg-background p-2">
            <RenderCrmLinker
              contactId={currentContactId}
              opportunityId={currentOpportunityId}
              onContactChange={(next) => persistLink(next, null)}
              onOpportunityChange={(next) => persistLink(currentContactId, next)}
            />
            {!canPersist && (
              <p className="px-2 pb-2 text-xs text-muted-foreground">
                Collegamento modificabile solo quando il render e la tabella sorgente sono disponibili.
              </p>
            )}
            {linkMutation.isPending && (
              <Badge variant="secondary" className="mx-2 mb-2">
                Salvataggio collegamento...
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
