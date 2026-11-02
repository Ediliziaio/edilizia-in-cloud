// src/components/orders/generali/vendita/PiantaUnita.tsx
// Nel pannello dell'unità: la pianta disegnata con il modulo Planimetrie, collegata alla commessa
// dell'unità. Si apre se c'è; se no si disegna, si ricava da un PDF o una foto, o si descrive a parole.
// Compare solo a chi ha il Render AI: la pianta caricata come file (MaterialeUnita) resta per tutti.
import { Link } from "react-router-dom";
import { FileUp, PenLine, Ruler, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { usePermissions } from "@/hooks/usePermissions";
import { useElencoPlanimetrie } from "@/lib/planimetrie/archivio";
import { percorsiPlanimetrie, type ModoNuovaPianta } from "@/lib/planimetrie/render/percorsi";

export function PiantaUnita({ orderId, sigla, generaleId, puoCreare }: { orderId: string; sigla: string; generaleId: string; puoCreare: boolean }) {
  const { effectiveCompany } = useAuth();
  const permessi = usePermissions();
  const { isEnabled } = useFeatureAccess("render_ai");
  const attiva = isEnabled && !!permessi.canViewRenderAi;
  const { data: piante = [], isError } = useElencoPlanimetrie(attiva ? effectiveCompany?.id : null, { orderId });
  if (!attiva || isError) return null;

  const nuova = (modo: ModoNuovaPianta) => percorsiPlanimetrie.nuova(modo, {
    commessa: orderId, titolo: `Pianta ${sigla}`, torna: `/azienda/ordini/${generaleId}?scheda=unita`,
  });
  return (
    <section aria-label="Pianta disegnata" className="rounded-md border px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-medium"><Ruler className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> Pianta</p>
        {puoCreare && piante.length === 0 && (
          <div className="flex flex-wrap gap-1">
            <Button asChild size="sm" variant="outline" className="h-7 text-xs"><Link to={nuova("disegno")}><PenLine className="mr-1 h-3 w-3" /> Disegna</Link></Button>
            <Button asChild size="sm" variant="outline" className="h-7 text-xs"><Link to={nuova("documento")}><FileUp className="mr-1 h-3 w-3" /> Da PDF o foto</Link></Button>
            <Button asChild size="sm" variant="outline" className="h-7 text-xs"><Link to={nuova("testo")}><Wand2 className="mr-1 h-3 w-3" /> A parole</Link></Button>
          </div>
        )}
      </div>
      {piante.length > 0 ? (
        <ul className="mt-1 space-y-0.5">
          {piante.map((p) => (
            <li key={p.id}>
              <Link to={percorsiPlanimetrie.pianta(p.id)} className="text-sm text-primary hover:underline">{p.titolo}</Link>
              <span className="ml-1.5 text-xs text-muted-foreground">versione {p.versione_corrente}</span>
            </li>
          ))}
        </ul>
      ) : !puoCreare ? (
        <p className="mt-0.5 text-xs text-muted-foreground">Nessuna pianta disegnata per {sigla}.</p>
      ) : null}
    </section>
  );
}
