/**
 * Render AI → Planimetrie → una pianta → «Modifica la pianta»: l'editor (fase 2) sulla
 * versione corrente. Salvando si aggiunge una versione, senza sovrascrivere quella di
 * qualcun altro salvata nel frattempo.
 */
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { EditorConSalvataggio } from "@/components/planimetrie/editor/EditorConSalvataggio";
import { TestataPlanimetrie } from "@/components/planimetrie/render/TestataPlanimetrie";
import { usePlanimetria } from "@/lib/planimetrie/archivio";
import { percorsiPlanimetrie } from "@/lib/planimetrie/render/percorsi";

export default function RenderPlanimetriaModifica() {
  const { id = "" } = useParams();
  const { effectiveCompany } = useAuth();
  const { data, isLoading, error } = usePlanimetria(id);

  if (isLoading || !effectiveCompany?.id) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <TestataPlanimetrie indietro={percorsiPlanimetrie.elenco} titolo="Modifica la pianta" />
        <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "Pianta non trovata."}</p>
        <Button asChild variant="outline">
          <Link to={percorsiPlanimetrie.elenco}>Torna alle piante</Link>
        </Button>
      </div>
    );
  }

  return (
    <EditorConSalvataggio
      // una versione nuova (dopo «Ricarica») riapre l'editor da capo
      key={`${id}:${data.versione.numero}`}
      companyId={effectiveCompany.id}
      titoloPagina={data.riga.titolo}
      indietro={percorsiPlanimetrie.pianta(id)}
      iniziale={data.versione.documento}
      planimetriaId={id}
      versioneAttesa={data.versione.numero}
    />
  );
}
