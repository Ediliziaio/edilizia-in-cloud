import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, isToday, isTomorrow, addDays } from "date-fns";
import { it } from "date-fns/locale";
import { MapPin, Clock, ChevronRight, Wrench, CheckCircle2, AlertCircle, Route } from "lucide-react";

const statusColors: Record<string, string> = {
  aperto: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  in_lavorazione: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  risolto: "bg-green-500/20 text-green-300 border-green-500/30",
  urgente: "bg-red-500/20 text-red-300 border-red-500/30",
};

const statusLabels: Record<string, string> = {
  aperto: "Aperto",
  in_lavorazione: "In lavorazione",
  risolto: "Risolto",
  urgente: "Urgente",
};

interface Intervento {
  id: string;
  subject: string;
  status: string;
  priority: string;
  tipo: string;
  indirizzo_intervento: string | null;
  data_intervento_prevista: string | null;
  customer: { first_name: string; last_name: string; phone?: string } | null;
}

export default function TecnicoHome() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const in2DaysStr = format(addDays(today, 3), "yyyy-MM-dd");

  const { data: lavori = [], isLoading, isError } = useQuery<Intervento[]>({
    queryKey: ["tecnico-lavori", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(
          "id, subject, status, priority, tipo, indirizzo_intervento, data_intervento_prevista, customer:profiles!tickets_customer_id_fkey(first_name, last_name)",
        )
        .eq("assigned_to", user!.id)
        .in("tipo", ["intervento", "emergenza"])
        .neq("status", "risolto")
        .gte("data_intervento_prevista", todayStr)
        .lte("data_intervento_prevista", in2DaysStr)
        .order("data_intervento_prevista", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Intervento[];
    },
    enabled: !!user,
  });

  const lavoriOggi = lavori.filter(
    (l) => l.data_intervento_prevista && isToday(new Date(l.data_intervento_prevista)),
  );
  const lavoriProssimi = lavori.filter(
    (l) =>
      l.data_intervento_prevista &&
      !isToday(new Date(l.data_intervento_prevista)),
  );

  const nomeGiorno = format(today, "EEEE", { locale: it });
  const dataFormattata = format(today, "d MMMM yyyy", { locale: it });

  const CardIntervento = ({ item }: { item: Intervento }) => (
    <button
      onClick={() => navigate(`/tecnico/intervento/${item.id}`)}
      className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 text-left active:bg-slate-750 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
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
          <p className="text-white font-semibold text-base leading-tight truncate">{item.subject}</p>
          {item.customer && (
            <p className="text-slate-400 text-sm mt-1">
              {[item.customer.first_name, item.customer.last_name].filter(Boolean).join(" ")}
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
                {format(new Date(item.data_intervento_prevista), "HH:mm", { locale: it })}
                {isTomorrow(new Date(item.data_intervento_prevista)) && " · Domani"}
              </p>
            </div>
          )}
        </div>
        <ChevronRight className="h-5 w-5 text-slate-500 shrink-0 mt-1" />
      </div>
    </button>
  );

  return (
    <div className="p-4 space-y-6">
      {/* Greeting */}
      <div className="pt-2">
        <p className="text-slate-400 text-sm capitalize">{nomeGiorno}</p>
        <h1 className="text-white text-2xl font-bold mt-0.5">{dataFormattata}</h1>
      </div>

      {/* Lavori di oggi */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Wrench className="h-4 w-4 text-white" />
          </div>
          <h2 className="text-white font-semibold text-lg">
            Lavori di oggi
            {lavoriOggi.length > 0 && (
              <span className="ml-2 bg-blue-500 text-white text-sm px-2 py-0.5 rounded-full">
                {lavoriOggi.length}
              </span>
            )}
          </h2>
        </div>

        {isError ? (
          <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4 text-center">
            <AlertCircle className="h-6 w-6 text-red-400 mx-auto mb-1" />
            <p className="text-red-300 text-sm">Errore nel caricamento. Riprova.</p>
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-slate-800 rounded-xl p-4 animate-pulse h-24" />
            ))}
          </div>
        ) : lavoriOggi.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-400 mx-auto mb-2" />
            <p className="text-white font-medium">Nessun intervento oggi</p>
            <p className="text-slate-400 text-sm mt-1">Ottimo lavoro! Controlla i prossimi appuntamenti.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {lavoriOggi.map((item) => (
              <CardIntervento key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      {/* Prossimi interventi */}
      {lavoriProssimi.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center">
              <Clock className="h-4 w-4 text-slate-300" />
            </div>
            <h2 className="text-white font-semibold text-lg">Prossimi</h2>
          </div>
          <div className="space-y-3">
            {lavoriProssimi.map((item) => (
              <CardIntervento key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* Quick actions */}
      <div className="space-y-2">
        {/* Percorso ottimizzato */}
        <button
          onClick={() => navigate("/tecnico/percorso")}
          className="w-full bg-blue-600/20 border border-blue-500/30 rounded-xl p-4 flex items-center justify-between text-left active:bg-blue-600/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Route className="h-5 w-5 text-blue-400" />
            <div>
              <p className="text-white font-medium text-sm">Il mio percorso di oggi</p>
              <p className="text-blue-300 text-xs mt-0.5">Ottimizza l'ordine degli interventi</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-blue-400" />
        </button>

        <button
          onClick={() => navigate("/tecnico/interventi")}
          className="w-full bg-slate-700 border border-slate-600 rounded-xl p-4 flex items-center justify-between text-left active:bg-slate-600 transition-colors"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-slate-400" />
            <span className="text-slate-300 font-medium">Vedi tutti gli interventi</span>
          </div>
          <ChevronRight className="h-5 w-5 text-slate-500" />
        </button>
      </div>
    </div>
  );
}
