import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  AlertTriangle, TrendingDown, CreditCard, Hourglass, Plug, Trash2, MoonStar, Smartphone, MailWarning, MessageSquare,
  CheckCircle2, ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Voce {
  urgenza: number;
  tipo: string;
  titolo: string;
  dettaglio: string | null;
  dove: string;
}

interface Briefing {
  giorno: string;
  voci: Voce[];
  tutto_a_posto: boolean;
  calcolato_il: string;
}

const ICONE: Record<string, typeof AlertTriangle> = {
  guasto: AlertTriangle,
  cliente_a_rischio: TrendingDown,
  insoluto: CreditCard,
  trial: Hourglass,
  integrazione: Plug,
  purge: Trash2,
  inattive: MoonStar,
  whatsapp: Smartphone,
  casella: MailWarning,
  ticket: MessageSquare,
};

/** L'urgenza 1 è rossa, la 2 ambra, il resto neutro: il colore fa da ordine. */
function stileUrgenza(urgenza: number) {
  if (urgenza <= 1) {
    return {
      bordo: "border-l-destructive",
      icona: "text-destructive",
      sfondo: "bg-destructive/5",
    };
  }
  if (urgenza === 2) {
    return {
      bordo: "border-l-amber-500",
      icona: "text-amber-600 dark:text-amber-400",
      sfondo: "bg-amber-500/5",
    };
  }
  return { bordo: "border-l-muted-foreground/40", icona: "text-muted-foreground", sfondo: "" };
}

/**
 * Briefing operativo (F5-04).
 *
 * L'infrastruttura di briefing esisteva già e girava ogni giorno, ma guardava
 * marketing e vendite. Le cose che fanno perdere clienti e soldi — un job
 * rotto, un insoluto che matura, un trial che scade, un cliente che smette di
 * entrare — non comparivano da nessuna parte finché non era tardi.
 *
 * Sta in poche righe di proposito: se ne servissero venti nessuno lo
 * leggerebbe, e tanto varrebbe non averlo.
 */
export function BriefingOperativo() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-briefing-operativo"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_briefing_operativo" as never);
      if (error) throw error;
      return data as unknown as Briefing;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Se la migrazione non c'è ancora, la dashboard non deve mostrare un errore
  // per una sezione accessoria: semplicemente non compare.
  if (error) return null;

  if (isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (!data) return null;

  if (data.tutto_a_posto) {
    return (
      <Card className="border-l-4 border-l-emerald-500">
        <CardContent className="flex items-center gap-3 py-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div>
            <p className="text-sm font-medium">Niente da fare oggi</p>
            <p className="text-xs text-muted-foreground">
              Nessun guasto, nessun insoluto, nessun cliente che scivola, numeri e caselle collegati.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Da fare oggi</h2>
        <span className="text-xs text-muted-foreground">
          {data.voci.length} {data.voci.length === 1 ? "cosa" : "cose"}
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {data.voci.map((v, i) => {
          const Icona = ICONE[v.tipo] ?? AlertTriangle;
          const s = stileUrgenza(v.urgenza);
          return (
            <Link
              key={`${v.tipo}-${i}`}
              to={v.dove}
              className={`group flex items-start gap-3 rounded-lg border border-l-4 ${s.bordo} ${s.sfondo} p-3 transition-colors hover:bg-muted/50`}
            >
              <Icona className={`h-4 w-4 shrink-0 mt-0.5 ${s.icona}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight">{v.titolo}</p>
                {v.dettaglio && (
                  <p className="mt-0.5 text-xs text-muted-foreground break-words">{v.dettaglio}</p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
