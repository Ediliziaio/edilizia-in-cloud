import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Zap } from "lucide-react";

/**
 * RenderCreditGate — banner/gate condiviso per i wizard render
 *
 * FIX P2.5 + P5.1 del report stabilization:
 *   Prima ogni wizard mostrava l'errore "insufficient_credits" solo DOPO
 *   aver caricato foto + configurato il wizard → UX frustrante.
 *   Questo componente fa il check pre-wizard e blocca/avvisa l'utente.
 *
 * Usage:
 *   <RenderCreditGate>
 *     {wizard content}
 *   </RenderCreditGate>
 *
 * Comportamento:
 *   - balance > threshold (default 0) → renderizza children normalmente
 *   - balance <= threshold            → mostra Alert con CTA "Acquista crediti"
 *                                       + blocca gli children dietro un wrapper
 *                                       opaco con cursor-not-allowed
 *   - loading iniziale                → non blocca il wizard, evita flash visivi
 *
 * L'Alert usa `role="status"` quando è informativo (low-balance warning)
 * e `role="alert"` quando è blocker (balance = 0).
 */

interface Props {
  children: React.ReactNode;
  /** Soglia sotto la quale mostrare l'alert bloccante. Default 0 (zero crediti). */
  blockBelow?: number;
  /** Soglia sotto la quale mostrare un warning non bloccante. Default 3. */
  warnBelow?: number;
  /** Se true nasconde completamente children quando balance <= blockBelow. */
  hardBlock?: boolean;
}

export function RenderCreditGate({
  children,
  blockBelow = 0,
  warnBelow = 3,
  hardBlock = false,
}: Props) {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["render-credits", companyId],
    queryFn: async () => {
      if (!companyId) return 0;
      const { data, error } = await supabase
        .from("render_credits")
        .select("balance")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return (data as { balance?: number } | null)?.balance ?? 0;
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  // Se azienda o query non sono pronte, non blocchiamo il wizard con falsi "0 crediti".
  if (!companyId || isLoading) {
    return <>{children}</>;
  }

  if (isError) {
    return (
      <>
        <Alert role="status" aria-live="polite" className="mb-4 border-amber-200 bg-amber-50 text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Verifica crediti non disponibile</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <p>Non riesco a leggere il saldo in questo momento. Puoi continuare: se i crediti non bastano, il sistema te lo dira' prima della generazione.</p>
            <div>
              <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isRefetching}>
                <RefreshCw className={`mr-1 h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
                Riprova verifica
              </Button>
            </div>
          </AlertDescription>
        </Alert>
        {children}
      </>
    );
  }

  const balance = data ?? 0;
  const isBlocked = balance <= blockBelow;
  const isWarn    = !isBlocked && balance <= warnBelow;

  return (
    <>
      {isBlocked && (
        <Alert
          variant="destructive"
          role="alert"
          aria-live="assertive"
          className="mb-4"
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Crediti render esauriti</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <p>
              Non hai crediti render disponibili. Acquista un pacchetto per
              continuare a generare nuove anteprime AI.
            </p>
            <div>
              <Button
                variant="default"
                size="sm"
                onClick={() => navigate("/azienda/impostazioni/crediti")}
              >
                <Zap className="h-4 w-4 mr-1" /> Acquista crediti
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {isWarn && (
        <Alert
          role="status"
          aria-live="polite"
          className="mb-4 border-amber-200 bg-amber-50 text-amber-900"
        >
          <Zap className="h-4 w-4" />
          <AlertTitle>Crediti render in esaurimento</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <p>
              Ti restano <strong>{balance}</strong> {balance === 1 ? "credito" : "crediti"} render.
              Considera di ricaricare per evitare interruzioni.
            </p>
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/azienda/impostazioni/crediti")}
              >
                Acquista crediti
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Se hardBlock + blocked → nascondiamo i children.
          Altrimenti li mostriamo (wizard può comunque essere riempito,
          ma la chiamata generate fallirà con 402 mostrando il toast). */}
      {hardBlock && isBlocked ? null : children}
    </>
  );
}
