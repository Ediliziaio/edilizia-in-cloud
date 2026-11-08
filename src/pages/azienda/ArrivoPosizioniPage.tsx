import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ArrivoPosizioniPanel } from "@/components/ddt/ArrivoPosizioniPanel";

/** La stessa spunta del cantiere, dall'ufficio: in più reclamo e riordino. */
export default function ArrivoPosizioniPage() {
  const { odaId } = useParams<{ odaId: string }>();
  if (!odaId) return null;
  return (
    <div className="mx-auto max-w-2xl space-y-3 p-3 sm:p-4">
      <Link to={`/azienda/ordini-acquisto/${odaId}`} className="flex min-h-11 items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Torna all'ordine
      </Link>
      <h1 className="text-xl font-bold">Arrivo merce per posizione</h1>
      <ArrivoPosizioniPanel odaId={odaId} />
    </div>
  );
}
