import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listSurveysByOrder } from "@/lib/api/surveys";
import {
  ClipboardCheck, Plus, MapPin, Calendar, ChevronRight, Ruler, Loader2, FileText,
} from "lucide-react";

/**
 * OrderSurveysCard — mostra, dentro la commessa, i sopralluoghi (rilievi misure)
 * ad essa collegati (surveys.order_id). È il punto in cui, entrando nella
 * commessa, si ritrovano i dettagli dei sopralluoghi e si crea un nuovo
 * rilievo già agganciato (NuovoSopralluogo legge ?order=ID).
 *
 * Sola lettura + navigazione: nessuna scrittura, quindi additivo e sicuro.
 */

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft: { label: "Bozza", color: "bg-slate-100 text-slate-700 border-slate-300" },
  in_progress: { label: "In corso", color: "bg-amber-100 text-amber-700 border-amber-300" },
  completed: { label: "Completato", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
};

interface OrderSurveysCardProps {
  orderId: string;
  /** Preventivo di origine (orders.quote_id / quote_number) se la commessa nasce da un preventivo. */
  quoteId?: string | null;
  quoteNumber?: string | null;
}

export function OrderSurveysCard({ orderId, quoteId, quoteNumber }: OrderSurveysCardProps) {
  const navigate = useNavigate();
  const { data: surveys, isLoading, isError } = useQuery({
    queryKey: ["order-surveys", orderId],
    queryFn: () => listSurveysByOrder(orderId),
    enabled: !!orderId,
    staleTime: 30_000,
  });

  const goNew = () => navigate(`/azienda/sopralluoghi/nuovo?order=${orderId}`);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4 text-orange-500" />
          Origine e rilievi misure
          {surveys && surveys.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">({surveys.length})</span>
          )}
        </CardTitle>
        <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={goNew}>
          <Plus className="h-4 w-4 mr-1" />
          Nuovo sopralluogo
        </Button>
      </CardHeader>
      <CardContent>
        {/* Preventivo di origine: la commessa nasce da un preventivo (orders.quote_id) */}
        {quoteId && (
          <button
            type="button"
            onClick={() => navigate(`/azienda/marketing/preventivi/${quoteId}`)}
            className="mb-3 flex w-full items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 text-left transition-colors hover:bg-violet-50 dark:border-violet-900/40 dark:bg-violet-950/20"
          >
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-violet-500" />
              <span className="font-medium">Preventivo di origine</span>
              {quoteNumber && <span className="truncate text-muted-foreground">· {quoteNumber}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400">
              Apri <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </button>
        )}
        {isLoading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carico i sopralluoghi…
          </div>
        )}

        {isError && (
          <p className="py-6 text-sm text-red-600">Errore nel caricamento dei sopralluoghi.</p>
        )}

        {!isLoading && !isError && (!surveys || surveys.length === 0) && (
          <div className="flex items-center gap-3 py-1 text-sm text-muted-foreground">
            <Ruler className="h-5 w-5 shrink-0 text-muted-foreground/40" />
            <span className="flex-1">
              Nessun sopralluogo collegato. Le misure definitive del rilievo confermano
              quelle del preventivo prima di ordinare al fornitore.
            </span>
          </div>
        )}

        {!isLoading && !isError && surveys && surveys.length > 0 && (
          <ul className="divide-y">
            {surveys.map((s) => {
              const cfg = STATUS_LABEL[s.status] ?? STATUS_LABEL.draft;
              const when = s.completed_at ?? s.scheduled_at ?? s.created_at;
              const place = [s.address, s.city].filter(Boolean).join(", ");
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/azienda/sopralluoghi/${s.id}`)}
                    className="-mx-2 flex w-full items-center gap-3 rounded-md px-2 py-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{s.code || "Sopralluogo"}</span>
                        <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>
                          {cfg.label}
                        </Badge>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {when && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(when), "d MMM yy", { locale: it })}
                          </span>
                        )}
                        {place && (
                          <span className="flex min-w-0 items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{place}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
