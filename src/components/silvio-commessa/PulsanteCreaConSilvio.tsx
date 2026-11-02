/**
 * Il pulsante che apre «Crea con Silvio»: in Nuova commessa («Crea con Silvio») e sul
 * preventivo firmato («Trasforma in commessa con Silvio»). Non si vede se l'interruttore
 * dell'azienda è spento; il popup si carica solo quando serve.
 *
 * Fase 3 (lotto 3.3), le altre porte: un'email con allegati («Fanne una commessa»), un
 * contratto dell'app («Crea la commessa da questo contratto», o «Completa» se il contratto
 * è già di una commessa), il link della chat e di WhatsApp (`apriSubito`: il popup si apre
 * da solo con le fonti del link).
 */
import { Suspense, useState } from "react";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { Sparkles } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useCreaConSilvioAttivo } from "./useCreaConSilvioAttivo";
import type { FonteDaAggiungere } from "./useBozzaSilvio";

const CreaConSilvioDialog = lazy(() => import("./CreaConSilvioDialog"));

export function PulsanteCreaConSilvio({
  etichetta = "Crea con Silvio", iniziale, className, variant, size, apriSubito = false, orderId = null, etichettaCommessa = null, onChiuso,
}: {
  etichetta?: string;
  iniziale?: FonteDaAggiungere | FonteDaAggiungere[] | null;
  className?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  /** Il popup si apre subito (dal link della chat): il pulsante resta per riaprirlo. */
  apriSubito?: boolean;
  /** «Completa con Silvio» questa commessa, con `iniziale` come fonti in più. */
  orderId?: string | null;
  etichettaCommessa?: string | null;
  onChiuso?: () => void;
}) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const attivo = useCreaConSilvioAttivo(companyId);
  const [aperto, setAperto] = useState(apriSubito);
  if (!attivo || !companyId || !user?.id) return null;
  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setAperto(true)}
        className={cn("gap-2", !variant && "bg-orange-700 text-white hover:bg-orange-800", className)}>
        <Sparkles className="h-4 w-4" aria-hidden />{etichetta}
      </Button>
      {aperto && (
        <Suspense fallback={null}>
          <CreaConSilvioDialog open companyId={companyId} userId={user.id} iniziale={iniziale}
            orderId={orderId} etichettaCommessa={etichettaCommessa}
            onOpenChange={(o) => { setAperto(o); if (!o) onChiuso?.(); }} />
        </Suspense>
      )}
    </>
  );
}
