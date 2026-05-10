/**
 * MySurveysTab — tab personale "I miei sopralluoghi" in /mio-profilo
 *
 * Mostra i sopralluoghi assegnati all'utente corrente (technician_id o
 * presente in survey_assignees) tramite RPC surveys_assigned_to_me.
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listAssignedToMe } from "@/lib/api/surveys";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardList, MapPin, Calendar, ArrowRight, CheckCircle2, Hammer, Clock,
  FileSignature, Sparkles, Inbox,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const STATUS_LABEL: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  draft:       { label: "Bozza",       color: "bg-slate-100 text-slate-700",       icon: Clock },
  in_progress: { label: "In corso",    color: "bg-amber-100 text-amber-700",       icon: Hammer },
  completed:   { label: "Completato",  color: "bg-emerald-100 text-emerald-700",   icon: CheckCircle2 },
  reviewed:    { label: "Revisionato", color: "bg-sky-100 text-sky-700",           icon: CheckCircle2 },
  signed:      { label: "Firmato",     color: "bg-violet-100 text-violet-700",     icon: FileSignature },
  converted:   { label: "Convertito",  color: "bg-teal-100 text-teal-700",         icon: CheckCircle2 },
};

const ROLE_LABEL: Record<string, string> = {
  technician: "Tecnico",
  subcontractor: "Subappaltatore",
  employee: "Operaio",
  observer: "Osservatore",
};

const CATEGORY_ICON: Record<string, string> = {
  infissi: "🪟",
  bagno: "🛁",
  fotovoltaico: "☀️",
  ristrutturazione: "🏗️",
  cucina: "🍳",
  cappotto: "🏠",
  tetto: "🏘️",
  custom: "📋",
};

export function MySurveysTab() {
  const { data: surveys, isLoading } = useQuery({
    queryKey: ["my-assigned-surveys"],
    queryFn: listAssignedToMe,
    refetchInterval: 60_000,
  });

  const todoCount = (surveys ?? []).filter(
    (s) => s.status === "draft" || s.status === "in_progress",
  ).length;

  return (
    <div className="space-y-3">
      <Card className="bg-orange-50/30 border-orange-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <ClipboardList className="h-5 w-5 text-orange-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-orange-800">
                I tuoi sopralluoghi
              </p>
              <p className="text-xs text-orange-700 mt-1">
                Qui vedi tutti i sopralluoghi assegnati a te (come tecnico, subappaltatore
                o osservatore). Apri quello che devi gestire e compila direttamente sul cantiere.
                {todoCount > 0 && (
                  <span className="font-semibold"> · {todoCount} da completare</span>
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : !surveys || surveys.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <div className="mx-auto h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-3">
              <Inbox className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="font-semibold">Nessun sopralluogo assegnato</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto flex items-center gap-1 justify-center">
              <Sparkles className="h-3 w-3 text-violet-500" />
              Quando qualcuno ti assegnerà un sopralluogo, lo vedrai qui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {surveys.map((s) => {
            const cfg = STATUS_LABEL[s.status] ?? STATUS_LABEL.draft;
            const StatusIcon = cfg.icon;
            return (
              <Card
                key={s.id}
                className="hover:border-orange-300 hover:shadow-sm transition-all"
              >
                <CardContent className="p-3 flex items-center gap-3 flex-wrap">
                  <div className="text-2xl shrink-0">
                    {CATEGORY_ICON[s.template_category] ?? "📋"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-orange-700">
                        {s.code}
                      </span>
                      <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {cfg.label}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] bg-violet-100 text-violet-700">
                        {ROLE_LABEL[s.my_role] ?? s.my_role}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium mt-0.5">{s.template_name}</p>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1 flex-wrap">
                      {(s.address || s.city) && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {[s.address, s.city].filter(Boolean).join(", ")}
                        </span>
                      )}
                      {s.scheduled_at && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(s.scheduled_at), "d MMM yyyy HH:mm", { locale: it })}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button asChild size="sm" className="gap-1 bg-orange-600 hover:bg-orange-700">
                    <Link to={`/azienda/sopralluoghi/${s.id}`}>
                      Apri
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
