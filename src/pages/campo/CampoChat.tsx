/**
 * Chat campo — riutilizza InternalChat (WhatsApp-style) per operai e subappaltatori.
 * Stessa esperienza degli utenti ufficio: canali, DM, gruppi, reazioni, risposte.
 *
 * Lazy load: InternalChat è 2k+ LOC. Lo carichiamo on-demand per ridurre
 * il bundle iniziale del campo layout.
 */
import { lazy, Suspense } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

const InternalChat = lazy(() => import("@/pages/azienda/InternalChat"));

export default function CampoChat() {
  // /campo/chat/<canale> (dalla scheda Chat del cantiere): la chat apre un canale solo con ?channel=. Prima il
  // link portava all'elenco delle chat e sul telefono la conversazione non si apriva (collaudo 24/11/2026).
  const { channelId } = useParams<{ channelId?: string }>();
  if (channelId) return <Navigate to={`/campo/chat?channel=${encodeURIComponent(channelId)}`} replace />;
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    }>
      <InternalChat areaCampo />
    </Suspense>
  );
}
