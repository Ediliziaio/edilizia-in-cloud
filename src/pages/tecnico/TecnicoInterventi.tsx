import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { MapPin, Clock, ChevronRight, Search } from "lucide-react";

const statusColors: Record<string, string> = {
  aperto: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  in_lavorazione: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  risolto: "bg-green-500/20 text-green-300 border-green-500/30",
};

const statusLabels: Record<string, string> = {
  aperto: "Aperto",
  in_lavorazione: "In lavorazione",
  risolto: "Risolto",
};

export default function TecnicoInterventi() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filtroStato, setFiltroStato] = useState("attivi");

  const { data: interventi = [], isLoading } = useQuery({
    queryKey: ["tecnico-tutti-interventi", user?.id, filtroStato],
    queryFn: async () => {
      let query = supabase
        .from("tickets")
        .select(
          "id, subject, status, priority, tipo, indirizzo_intervento, data_intervento_prevista, customer:profiles!tickets_customer_id_fkey(first_name, last_name)",
        )
        .eq("assigned_to", user!.id)
        .in("tipo", ["intervento", "emergenza"])
        .order("data_intervento_prevista", { ascending: false });

      if (filtroStato === "attivi") {
        query = query.neq("status", "risolto");
      } else if (filtroStato === "risolti") {
        query = query.eq("status", "risolto");
      }

      const { data, error } = await query.limit(500);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const filtered = (interventi as any[]).filter((i) =>
    !search ||
    i.subject?.toLowerCase().includes(search.toLowerCase()) ||
    i.indirizzo_intervento?.toLowerCase().includes(search.toLowerCase()) ||
    [i.customer?.first_name, i.customer?.last_name].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-white text-xl font-bold pt-2">I miei interventi</h1>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca intervento..."
          className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 pl-10 pr-4 text-white placeholder-slate-400 text-base focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Filtro stato */}
      <div className="flex gap-2">
        {["attivi", "risolti", "tutti"].map((stato) => (
          <button
            key={stato}
            onClick={() => setFiltroStato(stato)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
              filtroStato === stato
                ? "bg-blue-600 text-white"
                : "bg-slate-800 border border-slate-700 text-slate-300"
            }`}
          >
            {stato}
          </button>
        ))}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-800 rounded-xl p-4 animate-pulse h-24" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-lg font-medium">Nessun intervento trovato</p>
          {search && (
            <button onClick={() => setSearch("")} className="mt-2 text-blue-400 text-sm underline">
              Cancella ricerca
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item: any) => (
            <button
              key={item.id}
              onClick={() => navigate(`/tecnico/intervento/${item.id}`)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 text-left active:bg-slate-750 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium ${
                        statusColors[item.status] ?? "bg-slate-700 text-slate-300 border-slate-600"
                      }`}
                    >
                      {statusLabels[item.status] ?? item.status}
                    </span>
                    {item.priority === "urgente" && (
                      <span className="bg-red-500/20 text-red-300 border border-red-500/30 text-xs px-2 py-0.5 rounded-md font-medium">
                        Urgente
                      </span>
                    )}
                  </div>
                  <p className="text-white font-semibold text-base leading-tight">{item.subject}</p>
                  {(item as any).customer && (
                    <p className="text-slate-400 text-sm mt-1">
                      {[(item as any).customer?.first_name, (item as any).customer?.last_name].filter(Boolean).join(" ")}
                    </p>
                  )}
                  {item.indirizzo_intervento && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <MapPin className="h-4 w-4 text-slate-500 shrink-0" />
                      <p className="text-slate-400 text-sm truncate">{item.indirizzo_intervento}</p>
                    </div>
                  )}
                  {item.data_intervento_prevista && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Clock className="h-4 w-4 text-slate-500 shrink-0" />
                      <p className="text-slate-400 text-sm">
                        {format(new Date(item.data_intervento_prevista), "dd MMM yyyy HH:mm", {
                          locale: it,
                        })}
                      </p>
                    </div>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 text-slate-500 shrink-0 mt-1" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
