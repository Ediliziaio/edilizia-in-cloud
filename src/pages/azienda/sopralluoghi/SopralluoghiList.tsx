/**
 * SopralluoghiList — Sprint S1 placeholder + lista sopralluoghi.
 *
 * Visibile solo se feature flag 'surveys_module' attiva (Beta gate).
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listMySurveys } from "@/lib/api/surveys";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ClipboardList, Plus, Sparkles, MapPin, Search, Calendar,
  CheckCircle2, Clock, FileSignature, Hammer,
} from "lucide-react";
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
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: surveys, isLoading } = useQuery({
    queryKey: ["sopralluoghi-list", statusFilter],
    queryFn: () => listMySurveys({ status: statusFilter === "all" ? undefined : statusFilter, limit: 200 }),
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
    <div className="container mx-auto p-4 md:p-6 max-w-6xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white shadow-lg">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">Sopralluoghi</h1>
              <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-orange-200">
                <Sparkles className="h-3 w-3 mr-1" />
                Beta
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Rilievi tecnici sul cantiere — multi-template, foto, audio, firma cliente
            </p>
          </div>
        </div>
        <Button asChild className="gap-2 bg-orange-600 hover:bg-orange-700">
          <Link to="/azienda/sopralluoghi/nuovo">
            <Plus className="h-4 w-4" />
            Nuovo sopralluogo
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Cerca codice, indirizzo, città…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 h-9">
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
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <div className="mx-auto h-16 w-16 rounded-full bg-orange-100 flex items-center justify-center mb-3">
              <ClipboardList className="h-8 w-8 text-orange-600" />
            </div>
            <p className="font-semibold">Nessun sopralluogo</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {searchQuery || statusFilter !== "all"
                ? "Nessun risultato per i filtri attivi."
                : "Crea il primo sopralluogo per iniziare a fare rilievi sul cantiere."}
            </p>
            <Button asChild className="mt-4 gap-2 bg-orange-600 hover:bg-orange-700">
              <Link to="/azienda/sopralluoghi/nuovo">
                <Plus className="h-4 w-4" />
                Nuovo sopralluogo
              </Link>
            </Button>
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
                className="hover:border-orange-300 hover:shadow-sm transition-all cursor-pointer"
                onClick={() => navigate(`/azienda/sopralluoghi/${s.id}`)}
              >
                <CardContent className="p-4 flex items-center gap-3 flex-wrap">
                  <div className="h-10 w-10 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                    <ClipboardList className="h-5 w-5 text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-orange-700">{s.code}</span>
                      <Badge variant="outline" className={`text-[10px] ${statusCfg.color}`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {statusCfg.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
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
                      <span>
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
