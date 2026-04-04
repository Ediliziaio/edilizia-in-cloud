import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wrench, Plus, Search, AlertCircle, Clock, CheckCircle2, User, MapPin, Calendar } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import type { Intervento, TipoIntervento } from "@/types/interventi";

const TIPO_LABELS: Record<TipoIntervento, string> = {
  supporto: "Supporto",
  intervento: "Intervento",
  emergenza: "Emergenza",
};

const STATO_CONFIG: Record<string, { label: string; color: string }> = {
  aperto: { label: "Aperto", color: "bg-blue-100 text-blue-800" },
  in_lavorazione: { label: "In lavorazione", color: "bg-yellow-100 text-yellow-800" },
  in_attesa: { label: "In attesa", color: "bg-orange-100 text-orange-800" },
  risolto: { label: "Risolto", color: "bg-green-100 text-green-800" },
  chiuso: { label: "Chiuso", color: "bg-gray-100 text-gray-600" },
};

export default function InterventiList() {
  const { effectiveCompany } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState<string>(searchParams.get("tipo") ?? "all");
  const [statoFilter, setStatoFilter] = useState<string>("all");

  const { data: interventi = [], isLoading, isError } = useQuery({
    queryKey: ["interventi", effectiveCompany?.id, tipoFilter, statoFilter],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      let q = supabase
        .from("tickets")
        .select(`
          id, company_id, customer_id, order_id, subject, status, priority,
          tipo, indirizzo_intervento, data_intervento_prevista,
          data_intervento_effettiva, durata_ore, assigned_to, note_tecnico, created_at,
          assigned_profile:profiles!tickets_assigned_to_fkey(first_name, last_name),
          customer:profiles!tickets_customer_id_fkey(first_name, last_name)
        `)
        .eq("company_id", effectiveCompany.id)
        .in("tipo", ["intervento", "emergenza"])
        .order("created_at", { ascending: false });

      if (tipoFilter !== "all") q = q.eq("tipo", tipoFilter);
      if (statoFilter !== "all") q = q.eq("status", statoFilter);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Intervento[];
    },
    enabled: !!effectiveCompany?.id,
  });

  // Query rapportini firmati non ancora fatturati (per KPI "Da fatturare")
  const { data: rapportiniFirmati = [] } = useQuery({
    queryKey: ["rapportini-firmati-count", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("rapportini_intervento")
        .select("id, ticket_id")
        .eq("company_id", effectiveCompany.id)
        .eq("stato", "firmato");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!effectiveCompany?.id,
  });

  const filtered = interventi.filter((i) =>
    i.subject.toLowerCase().includes(search.toLowerCase()) ||
    (i.indirizzo_intervento ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    oggi: interventi.filter((i) => {
      if (!i.data_intervento_prevista) return false;
      return new Date(i.data_intervento_prevista).toDateString() === new Date().toDateString();
    }).length,
    urgenti: interventi.filter((i) => i.tipo === "emergenza").length,
    inCorso: interventi.filter((i) => i.status === "in_lavorazione").length,
    daFatturare: rapportiniFirmati.length, // rapportini firmati ma non ancora fatturati
  };

  useEffect(() => {
    if (isError) toast.error("Errore nel caricamento degli interventi");
  }, [isError]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wrench className="h-6 w-6 text-orange-500" />
            Interventi
          </h1>
          <p className="text-sm text-gray-500 mt-1">Gestione interventi tecnici e assistenza in campo</p>
        </div>
        <Button onClick={() => navigate("/azienda/assistenza/nuovo?tipo=intervento")} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuovo Intervento
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Oggi", value: stats.oggi, icon: Calendar, color: "text-blue-600" },
          { label: "Urgenti", value: stats.urgenti, icon: AlertCircle, color: "text-red-600" },
          { label: "In corso", value: stats.inCorso, icon: Clock, color: "text-yellow-600" },
          { label: "Da fatturare", value: stats.daFatturare, icon: CheckCircle2, color: "text-green-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <s.icon className={`h-4 w-4 ${s.color}`} />
              {s.label}
            </div>
            <div className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per oggetto o indirizzo..."
            className="pl-9"
          />
        </div>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i tipi</SelectItem>
            <SelectItem value="intervento">Intervento</SelectItem>
            <SelectItem value="emergenza">Emergenza</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statoFilter} onValueChange={setStatoFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="aperto">Aperto</SelectItem>
            <SelectItem value="in_lavorazione">In lavorazione</SelectItem>
            <SelectItem value="risolto">Risolto</SelectItem>
            <SelectItem value="chiuso">Chiuso</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => <Skeleton key={n} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500">
          <Wrench className="h-12 w-12 text-gray-300 mb-3" />
          <p className="font-medium text-gray-700">Nessun intervento trovato</p>
          <p className="text-sm mt-1">Crea il primo intervento con il pulsante in alto a destra</p>
          <Button variant="outline" className="mt-4 gap-2" onClick={() => navigate("/azienda/assistenza/nuovo?tipo=intervento")}>
            <Plus className="h-4 w-4" />
            Nuovo Intervento
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((intervento) => {
            const stato = STATO_CONFIG[intervento.status] ?? { label: intervento.status, color: "bg-gray-100 text-gray-600" };
            return (
              <Link
                key={intervento.id}
                to={`/azienda/interventi/${intervento.id}`}
                className="block bg-white rounded-lg border p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 truncate">{intervento.subject}</span>
                      <Badge className={`text-xs ${intervento.tipo === "emergenza" ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"}`}>
                        {TIPO_LABELS[intervento.tipo]}
                      </Badge>
                      <Badge className={`text-xs ${stato.color}`}>{stato.label}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
                      {intervento.indirizzo_intervento && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {intervento.indirizzo_intervento}
                        </span>
                      )}
                      {intervento.data_intervento_prevista && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(intervento.data_intervento_prevista), "dd MMM yyyy HH:mm", { locale: it })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {intervento.assigned_to ? (
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <User className="h-3 w-3" />
                        <span>{
                          (() => {
                            const p = intervento.assigned_profile as { first_name?: string | null; last_name?: string | null } | null;
                            return [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Tecnico";
                          })()
                        }</span>
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                        Da assegnare
                      </Badge>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
