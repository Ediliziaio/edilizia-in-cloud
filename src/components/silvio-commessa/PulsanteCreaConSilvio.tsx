/**
 * Il pulsante che apre «Crea con Silvio»: in Nuova commessa («Crea con Silvio») e sul
 * preventivo firmato («Trasforma in commessa con Silvio»). Non si vede se l'interruttore
 * dell'azienda è spento; il popup si carica solo quando serve.
 */
import { lazy, Suspense, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useCreaConSilvioAttivo } from "./useCreaConSilvioAttivo";
import type { FonteDaAggiungere } from "./useBozzaSilvio";

const CreaConSilvioDialog = lazy(() => import("./CreaConSilvioDialog"));

export function PulsanteCreaConSilvio({ etichetta = "Crea con Silvio", iniziale, className, variant, size }: {
  etichetta?: string;
  iniziale?: FonteDaAggiungere | null;
  className?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const attivo = useCreaConSilvioAttivo(companyId);
  const [aperto, setAperto] = useState(false);
  if (!attivo || !companyId || !user?.id) return null;
  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setAperto(true)}
        className={cn("gap-2", !variant && "bg-orange-600 text-white hover:bg-orange-700", className)}>
        <Sparkles className="h-4 w-4" aria-hidden />{etichetta}
      </Button>
      {aperto && (
        <Suspense fallback={null}>
          <CreaConSilvioDialog open onOpenChange={setAperto} companyId={companyId} userId={user.id} iniziale={iniziale} />
        </Suspense>
      )}
    </>
  );
}
