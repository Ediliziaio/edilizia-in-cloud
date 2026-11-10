import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FileDown, LayoutPanelTop } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import type { RigaPlanimetria } from "@/lib/planimetrie/archivio";
import {
  accessiCollegamenti,
  useCollegamentiPiante,
} from "@/lib/planimetrie/collegamenti";
import { RiferimentiPianta } from "@/components/planimetrie/CollegamentiPianta";
import { percorsoProgettoAssociato } from "@/lib/planimetrie/render/percorsi";
import type { RenderPlanOrigin } from "@/lib/render/renderPlanOrigin";

export function RenderProjectContext({
  origin,
  returnTo,
}: {
  origin: RenderPlanOrigin;
  returnTo: string;
}) {
  const { effectiveCompany } = useAuth();
  const company = effectiveCompany?.id;
  const permissions = usePermissions();
  const project = useQuery({
    queryKey: ["render-project-context", company, origin.planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planimetrie" as never)
        .select(
          "id,company_id,titolo,descrizione,stato,order_id,quote_id,computo_upload_id,survey_id,contact_id,customer_id,versione_corrente,created_by,created_at,updated_at,deleted_at",
        )
        .eq("id", origin.planId)
        .eq("company_id", company!)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data as RigaPlanimetria | null;
    },
    enabled: !!company,
    staleTime: 30_000,
    retry: 1,
  });
  const { data: links } = useCollegamentiPiante(
    company,
    project.data ? [project.data] : [],
    accessiCollegamenti(permissions),
  );
  return (
    <section
      aria-label="Progetto di origine del render"
      className="space-y-3 rounded-xl border bg-card p-4"
    >
      <div>
        <p className="text-xs text-muted-foreground">
          Dalla planimetria · versione {origin.version}
        </p>
        <h2 className="mt-1 text-base font-semibold">
          {project.data?.titolo ||
            (project.isLoading
              ? "Caricamento del progetto…"
              : "Progetto non disponibile")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{origin.roomName}</p>
      </div>
      {project.data && <RiferimentiPianta riga={project.data} mappa={links} />}
      {project.isError && (
        <p role="alert" className="text-xs text-muted-foreground">
          I collegamenti del progetto non sono disponibili.
        </p>
      )}
      {project.data && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link
              to={`${origin.projectPath}${origin.projectPath.includes("?") ? "&" : "?"}torna=${encodeURIComponent(returnTo)}`}
            >
              <LayoutPanelTop className="mr-1.5 h-4 w-4" />
              Apri planimetria
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={percorsoProgettoAssociato(origin.planId, returnTo, true)}>
              <FileDown className="mr-1.5 h-4 w-4" />
              Fascicolo del progetto
            </Link>
          </Button>
        </div>
      )}
      {project.data && project.data.versione_corrente !== origin.version && (
        <p className="text-xs text-muted-foreground">
          Il progetto ora è alla versione {project.data.versione_corrente}. Il
          fascicolo comprende quella versione; le scelte del render qui sotto
          restano quelle originali.
        </p>
      )}
    </section>
  );
}
