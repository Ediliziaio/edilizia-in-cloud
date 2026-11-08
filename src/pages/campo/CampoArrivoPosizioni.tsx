import { useParams } from "react-router-dom";
import { ArrivoPosizioniPanel } from "@/components/ddt/ArrivoPosizioniPanel";

/** Dal telefono, con l'ordine aperto: una riga per ogni posizione. */
export default function CampoArrivoPosizioni() {
  const { odaId } = useParams<{ odaId: string }>();
  if (!odaId) return null;
  return (
    <div className="mx-auto max-w-xl space-y-3 p-3">
      <h1 className="text-xl font-bold">Arrivo merce</h1>
      <ArrivoPosizioniPanel odaId={odaId} inCantiere />
    </div>
  );
}
