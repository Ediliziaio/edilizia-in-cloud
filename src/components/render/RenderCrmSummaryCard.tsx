import { useQuery } from "@tanstack/react-query";
import { Link2, UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { loadRenderGalleryMeta, resolveRenderGalleryMeta } from "@/lib/render/renderGalleryMeta";

interface RenderCrmSummaryCardProps {
  createdBy?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
}

export function RenderCrmSummaryCard({ createdBy, contactId, opportunityId }: RenderCrmSummaryCardProps) {
  const hasAny = Boolean(createdBy || contactId || opportunityId);
  const { data: meta } = useQuery({
    queryKey: ["render-crm-summary", createdBy, contactId, opportunityId],
    queryFn: async () => {
      const source = { created_by: createdBy ?? null, contact_id: contactId ?? null, opportunity_id: opportunityId ?? null };
      const maps = await loadRenderGalleryMeta([source]);
      return resolveRenderGalleryMeta(source, maps);
    },
    enabled: hasAny,
  });

  if (!hasAny) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">
          Nessun contatto o opportunità collegata a questo render.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Collegamenti render
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {meta?.createdByName && (
          <Badge variant="secondary" className="gap-1">
            <UserRound className="h-3 w-3" />
            Creato da {meta.createdByName}
          </Badge>
        )}
        {meta?.contactName && <Badge variant="outline">Contatto: {meta.contactName}</Badge>}
        {meta?.opportunityName && <Badge variant="outline">Opportunità: {meta.opportunityName}</Badge>}
      </CardContent>
    </Card>
  );
}
