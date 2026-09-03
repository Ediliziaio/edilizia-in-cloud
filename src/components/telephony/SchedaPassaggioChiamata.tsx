/**
 * SchedaPassaggioChiamata — quello che l'operatore legge mentre gli squilla.
 *
 * Serve perché con Telnyx mancano due cose che sembrerebbero ovvie:
 *   - l'assistente NON può riassumere a voce al collega prima di passargli il
 *     cliente (è una funzione riservata a Twilio);
 *   - sul display appare il NOSTRO numero, non quello del cliente.
 *
 * Senza questa scheda l'operatore risponderebbe alla cieca a un numero che
 * conosce già. Con la scheda legge in due secondi quello che il collega gli
 * direbbe in venti, e il cliente non resta in attesa.
 *
 * Sta montata nel guscio dell'area azienda: la chiamata arriva mentre lavori,
 * non mentre guardi la pagina del centralino.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { PhoneIncoming, PhoneOff, User, X } from "lucide-react";

interface Passaggio {
  id: string;
  nome_cliente: string | null;
  telefono_cliente: string | null;
  riassunto: string | null;
  creato_il: string;
}

/** Da quanto sta squillando, in parole. */
function daQuanto(iso: string): string {
  const secondi = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secondi < 60) return `${secondi} secondi fa`;
  const minuti = Math.round(secondi / 60);
  return minuti === 1 ? "un minuto fa" : `${minuti} minuti fa`;
}

export function SchedaPassaggioChiamata() {
  const companyId = useEffectiveCompanyId();
  const { user } = useAuth();
  const [passaggio, setPassaggio] = useState<Passaggio | null>(null);
  const [, forzaRedraw] = useState(0);

  // Carica un eventuale passaggio già in attesa (es. pagina ricaricata mentre
  // il telefono squillava) e poi resta in ascolto.
  useEffect(() => {
    if (!companyId || !user?.id) return;
    let attivo = true;

    const carica = async () => {
      const { data } = await supabase
        .from("passaggi_chiamata")
        .select("id, nome_cliente, telefono_cliente, riassunto, creato_il")
        .eq("company_id", companyId)
        .eq("operatore_id", user.id)
        .eq("stato", "in_attesa")
        .order("creato_il", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (attivo && data) setPassaggio(data as Passaggio);
    };
    carica();

    const canale = supabase
      .channel(`passaggi-${companyId}-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "passaggi_chiamata",
          filter: `operatore_id=eq.${user.id}`,
        },
        (payload) => {
          const riga = payload.new as Passaggio & { stato?: string };
          if (riga.stato === "in_attesa") setPassaggio(riga);
        },
      )
      .subscribe();

    return () => {
      attivo = false;
      supabase.removeChannel(canale);
    };
  }, [companyId, user?.id]);

  // Il "da quanto" deve avanzare da solo: una scheda ferma su "0 secondi fa"
  // non dice se il telefono sta squillando adesso o da un minuto.
  useEffect(() => {
    if (!passaggio) return;
    const id = window.setInterval(() => forzaRedraw((n) => n + 1), 10_000);
    return () => window.clearInterval(id);
  }, [passaggio]);

  const chiudi = async (stato: "risposto" | "persa") => {
    if (!passaggio) return;
    const id = passaggio.id;
    setPassaggio(null);
    const { error } = await supabase
      .from("passaggi_chiamata")
      .update({ stato, chiuso_il: new Date().toISOString() })
      .eq("id", id);
    if (error) console.error("[passaggio] chiusura fallita:", error.message);
  };

  if (!passaggio) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[60] w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-orange-300 bg-background shadow-xl"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3 border-b bg-orange-50 px-4 py-3 dark:bg-orange-950/30">
        <PhoneIncoming className="mt-0.5 h-5 w-5 shrink-0 animate-pulse text-orange-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Ti stanno passando una chiamata</p>
          <p className="text-xs text-muted-foreground">{daQuanto(passaggio.creato_il)}</p>
        </div>
        <button
          onClick={() => chiudi("persa")}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label="Chiudi la scheda"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{passaggio.nome_cliente || "Cliente"}</p>
            {passaggio.telefono_cliente && (
              <a href={`tel:${passaggio.telefono_cliente}`} className="text-xs text-muted-foreground hover:underline">
                {passaggio.telefono_cliente}
              </a>
            )}
          </div>
        </div>

        {passaggio.riassunto && (
          <div className="rounded border bg-muted/40 p-2.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Cosa ha detto
            </p>
            <p className="whitespace-pre-wrap text-sm leading-snug">{passaggio.riassunto}</p>
          </div>
        )}

        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => chiudi("risposto")}>
            Ho risposto
          </Button>
          <Button size="sm" variant="outline" onClick={() => chiudi("persa")}>
            <PhoneOff className="mr-1.5 h-3.5 w-3.5" />
            Persa
          </Button>
        </div>
      </div>
    </div>
  );
}
