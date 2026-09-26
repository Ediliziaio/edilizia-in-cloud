/**
 * SopralluoghiList — lista sopralluoghi (rilievi tecnici di cantiere).
 *
 * Visibile se feature flag 'surveys_module' attiva (modulo gratuito, default ON).
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listMySurveys } from "@/lib/api/surveys";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ClipboardList, Plus, MapPin, Search, Calendar,
  CheckCircle2, Clock, FileSignature, Hammer, AlertCircle, Settings,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const STATUS_LABEL: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  draft:       { label: "Bozza",       color: "bg-slate-100 text-slate-700 border-slate-300",       icon: Clock },
  in_progress: { label: "In corso",    color: "bg-amber-100 text-amber-700 border-amber-300",       icon: Hammer },
  completed:   { label: "Completato",  color: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: CheckCircle2 },
  reviewed:    { label: "Revisionato", color: "bg-sky-100 text-sky-700 border-sky-300",             icon: CheckCircle2 },
  signed:      { label: "Firmato",     color: "bg-violet-100 text-violet-700 border-violet-300",    icon: FileSignature },
  converted:   { label: "Convertito",  color: "bg-teal-100 text-teal-700 border-teal-300",          icon: CheckCircle2 },
  archived:    { label: "Archiviato",  color: "bg-slate-100 text-slate-500 border-slate-300",       icon: Clock },
  cancelled:   { label: "Annullato",   color: "bg-rose-100 text-rose-700 border-rose-300",          icon: Clock },
};

export default function SopralluoghiList() {
  const permessi = usePermissions();
  // In sola lettura i sopralluoghi si consultano ma non si creano (policy in DB).
  const puoCreare = !permessi.solaLettura;
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const companyId = useEffectiveCompanyId();
  const { data: surveys, isLoading, isError, refetch } = useQuery({
    queryKey: ["sopralluoghi-list", statusFilter, companyId],
    enabled: !!companyId,
    queryFn: () => listMySurveys({ status: statusFilter === "all" ? undefined : statusFilter, limit: 200, companyId }),
  });

  const filtered = (surveys ?? []).filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.code?.toLowerCase().includes(q) ||
      s.address?.toLowerCase().includes(q) ||
      s.city?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="mx-auto max-w-6xl p-0 sm:p-2 md:p-6 space-y-3 sm:space-y-4">
      {/* Header — telefono: resta solo «Nuovo sopralluogo» a tutta riga; il
          titolo lo dice già la scheda in alto e le impostazioni sono dal computer. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 max-sm:hidden">
          <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white shadow-lg shrink-0">
            <ClipboardList className="h-4 w-4 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-2xl font-bold">Sopralluoghi</h1>
            </div>
            <p className="hidden sm:block text-sm text-muted-foreground mt-0.5">
              Rilievi tecnici sul cantiere — multi-template, foto, audio, firma cliente
            </p>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {/* Modelli dei sopralluoghi: prima stavano tra le impostazioni dei preventivi. */}
          {(permessi.isAdmin || permessi.canViewSettingsCustomization) && (
            <Button asChild variant="outline" className="gap-2 w-full sm:w-auto max-sm:hidden">
              <Link to="/azienda/impostazioni/sopralluoghi">
                <Settings className="h-4 w-4" />
                Impostazioni
              </Link>
            </Button>
          )}
          {puoCreare ? (
            <Button asChild className="gap-2 bg-orange-600 hover:bg-orange-700 w-full sm:w-auto">
              <Link to="/azienda/sopralluoghi/nuovo">
                <Plus className="h-4 w-4" />
                Nuovo sopralluogo
              </Link>
            </Button>
          ) : (
            <Button disabled title="Sei in sola lettura" className="gap-2 w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Nuovo sopralluogo
            </Button>
          )}
        </div>
      </div>

      {/* Filtri — telefono: ricerca e stato sulla stessa riga. */}
      <div className="flex flex-row items-center gap-2">
        <div className="relative flex-1 w-full min-w-0 sm:min-w-[240px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Cerca sopralluogo…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-10 sm:h-9 text-sm"
            aria-label="Cerca per codice, indirizzo o città"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44 h-10 sm:h-9 text-sm max-sm:w-32 max-sm:shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : isError ? (
        <Card className="border-red-200 dark:border-red-900/40">
          <CardContent className="p-6 sm:p-12 text-center">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-500/70" />
            <p className="font-semibold mb-1">Impossibile caricare i sopralluoghi</p>
            <p className="text-sm text-muted-foreground mb-4">
              Si è verificato un errore. Controlla la connessione e riprova.
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Riprova</Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 sm:p-12 text-center">
            <div className="mx-auto h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-orange-100 flex items-center justify-center mb-3">
              <ClipboardList className="h-7 w-7 sm:h-8 sm:w-8 text-orange-600" />
            </div>
            <p className="font-semibold">Nessun sopralluogo</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {searchQuery || statusFilter !== "all"
                ? "Nessun risultato per i filtri attivi."
                : "Usa il pulsante \"Nuovo sopralluogo\" in alto per crearne uno."}
            </p>
            {/* CTA Desktop only: su mobile è già visibile nell'header full-width */}
            {puoCreare && (
            <Button asChild className="hidden sm:inline-flex mt-4 gap-2 bg-orange-600 hover:bg-orange-700">
              <Link to="/azienda/sopralluoghi/nuovo">
                <Plus className="h-4 w-4" />
                Nuovo sopralluogo
              </Link>
            </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => {
            const statusCfg = STATUS_LABEL[s.status] ?? STATUS_LABEL.draft;
            const StatusIcon = statusCfg.icon;
            return (
              <Card
                key={s.id}
                className="hover:border-orange-300 hover:shadow-sm active:bg-orange-50/40 transition-all cursor-pointer"
                onClick={() => navigate(`/azienda/sopralluoghi/${s.id}`)}
              >
                <CardContent className="p-3 sm:p-4 flex items-start gap-2.5 sm:gap-3">
                  <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                    <ClipboardList className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-orange-700">{s.code}</span>
                      <Badge variant="outline" className={`text-[10px] ${statusCfg.color}`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {statusCfg.label}
                      </Badge>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-0.5 text-xs text-muted-foreground mt-1">
                      {(s.address || s.city) && (
                        <span className="flex items-start gap-1 min-w-0">
                          <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                          <span className="truncate">{[s.address, s.city].filter(Boolean).join(", ")}</span>
                        </span>
                      )}
                      {s.scheduled_at && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 shrink-0" />
                          {format(new Date(s.scheduled_at), "d MMM yy HH:mm", { locale: it })}
                        </span>
                      )}
                      <span className="hidden sm:inline">
                        Creato {format(new Date(s.created_at), "d MMM yyyy", { locale: it })}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
