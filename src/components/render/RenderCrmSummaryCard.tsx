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
  | "render_piscine_sessions"
  | "render_technical_sessions";

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
      <CardHeader className="pb-3 max-md:p-3 max-md:pb-2">
        <CardTitle className="text-sm flex items-center gap-2 max-md:text-[13px]">
          <Link2 className="h-4 w-4" />
          Collegamenti render
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 max-md:space-y-2 max-md:p-3 max-md:pt-0">
        {hasAny ? (
          // Telefono: tre righe «etichetta — valore» invece di tre riquadri impilati.
          <div className="grid gap-2 sm:grid-cols-3 max-sm:gap-0 max-sm:divide-y max-sm:overflow-hidden max-sm:rounded-lg max-sm:border">
            <div className="rounded-lg border bg-muted/20 p-3 max-sm:flex max-sm:min-w-0 max-sm:items-center max-sm:justify-between max-sm:gap-3 max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:px-3 max-sm:py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground max-md:shrink-0 max-md:text-[11px] max-md:font-medium max-md:normal-case max-md:tracking-normal">
                Creato da
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-medium max-md:mt-0 max-md:min-w-0 max-md:truncate max-md:text-[13px]">
                <UserRound className="h-3.5 w-3.5 text-primary max-md:hidden" />
                {meta?.createdByName ?? "Non disponibile"}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 max-sm:flex max-sm:min-w-0 max-sm:items-center max-sm:justify-between max-sm:gap-3 max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:px-3 max-sm:py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground max-md:shrink-0 max-md:text-[11px] max-md:font-medium max-md:normal-case max-md:tracking-normal">
                Contatto
              </p>
              {meta?.contactName && currentContactId ? (
                <div className="mt-1 flex items-center justify-between gap-2 max-md:mt-0 max-md:min-w-0">
                  <p className="truncate text-sm font-medium max-md:text-[13px]">{meta.contactName}</p>
                  <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                    <Link to={`/azienda/marketing/contatti/${currentContactId}`}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground max-md:mt-0 max-md:text-[13px]">Non collegato</p>
              )}
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 max-sm:flex max-sm:min-w-0 max-sm:items-center max-sm:justify-between max-sm:gap-3 max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:px-3 max-sm:py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground max-md:shrink-0 max-md:text-[11px] max-md:font-medium max-md:normal-case max-md:tracking-normal">
                Opportunità
              </p>
              {meta?.opportunityName ? (
                <p className="mt-1 flex items-center gap-1.5 truncate text-sm font-medium max-md:mt-0 max-md:min-w-0 max-md:text-[13px]">
                  <BriefcaseBusiness className="h-3.5 w-3.5 text-primary max-md:hidden" />
                  {meta.opportunityName}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground max-md:mt-0 max-md:text-[13px]">Non collegata</p>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground max-md:px-3 max-md:py-2 max-md:text-[13px]">
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
