/**
 * Render AI → Planimetrie → una pianta → «Modifica la pianta»: l'editor (fase 2) sulla
 * versione corrente. Salvando si aggiunge una versione, senza sovrascrivere quella di
 * qualcun altro salvata nel frattempo.
 */
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { EditorConSalvataggio } from "@/components/planimetrie/editor/EditorConSalvataggio";
import { TestataPlanimetrie } from "@/components/planimetrie/render/TestataPlanimetrie";
import { usePlanimetria } from "@/lib/planimetrie/archivio";
import { percorsiPlanimetrie } from "@/lib/planimetrie/render/percorsi";

export default function RenderPlanimetriaModifica() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
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

  const ambito = params.get("ambito") ?? "";
  const proposta = ambito.startsWith("progetto:") ? ambito.slice("progetto:".length) : "";
  const piani = data.versione.documento.livelli;
  const piano = piani.find(p => p.id === params.get("livello")) ?? piani.find(p => p.proposte.some(v => v.id === proposta));
  const livello = piano?.id;
  const propostaIniziale = piano?.proposte.find(v => v.id === proposta)?.id;
  const muro = params.get("muro");
  const pianoIniziale = piano ?? piani[0];
  const statoIniziale = pianoIniziale?.proposte.find(v => v.id === propostaIniziale) ?? pianoIniziale?.fatto;
  const muroIniziale = statoIniziale?.muri.find(m => m.id === muro)?.id;
  return (
    <EditorConSalvataggio
      // una versione nuova (dopo «Ricarica») riapre l'editor da capo
      key={`${id}:${data.versione.numero}:${livello ?? ""}:${propostaIniziale ?? ""}:${muroIniziale ?? ""}`}
      companyId={effectiveCompany.id}
      titoloPagina={data.riga.titolo}
      indietro={percorsiPlanimetrie.pianta(id, livello, propostaIniziale ? ambito : undefined)}
      iniziale={data.versione.documento}
      livelloIniziale={livello}
      propostaIniziale={propostaIniziale}
      muroIniziale={muroIniziale}
      planimetriaId={id}
      versioneAttesa={data.versione.numero}
    />
  );
}
