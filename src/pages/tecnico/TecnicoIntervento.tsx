import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  ArrowLeft,
  MapPin,
  Phone,
  Navigation,
  Clock,
  AlertCircle,
  ClipboardList,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export default function TecnicoIntervento() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: intervento, isLoading } = useQuery({
    queryKey: ["tecnico-intervento", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(
          "*, customer:profiles!tickets_customer_id_fkey(id, full_name, phone, email)",
        )
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const iniziaInterventoMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("tickets")
        .update({
          data_intervento_effettiva: new Date().toISOString(),
          status: "in_lavorazione",
        })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Intervento avviato!");
      queryClient.invalidateQueries({ queryKey: ["tecnico-intervento", id] });
    },
    onError: () => toast.error("Errore nell'avvio dell'intervento"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (!intervento) {
    return (
      <div className="p-4 text-center py-20">
        <AlertCircle className="h-12 w-12 text-slate-500 mx-auto mb-3" />
        <p className="text-slate-400">Intervento non trovato</p>
        <button
          onClick={() => navigate("/tecnico")}
          className="mt-4 text-blue-400 font-medium"
        >
          Torna alla home
        </button>
      </div>
    );
  }

  const customer = intervento.customer as any;
  const giaAvviato = !!intervento.data_intervento_effettiva;

  const mapsUrl = intervento.indirizzo_intervento
    ? `https://maps.google.com/?q=${encodeURIComponent(intervento.indirizzo_intervento)}`
    : null;

  return (
    <div className="p-4 space-y-4">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-slate-400 active:text-white py-2 -ml-1"
      >
        <ArrowLeft className="h-5 w-5" />
        <span className="text-base">Indietro</span>
      </button>

      {/* Stato badge */}
      <div className="flex items-center gap-2">
        {intervento.priority === "urgente" && (
          <span className="bg-red-500/20 text-red-300 border border-red-500/30 text-sm px-3 py-1 rounded-full font-medium">
            Urgente
          </span>
        )}
        <span className="bg-slate-700 text-slate-300 text-sm px-3 py-1 rounded-full capitalize">
          {intervento.status?.replace("_", " ")}
        </span>
      </div>

      {/* Titolo */}
      <h1 className="text-white text-xl font-bold leading-tight">{intervento.subject}</h1>

      {/* Dati principali */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4">
        {/* Cliente */}
        {customer && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Cliente</p>
              <p className="text-white font-semibold text-lg">{customer.full_name}</p>
            </div>
            {customer.phone && (
              <a
                href={`tel:${customer.phone}`}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-3 rounded-xl min-h-[48px] font-medium active:bg-green-700"
              >
                <Phone className="h-5 w-5" />
                Chiama
              </a>
            )}
          </div>
        )}

        {/* Indirizzo */}
        {intervento.indirizzo_intervento && (
          <div>
            <p className="text-slate-400 text-sm mb-1">Indirizzo</p>
            <div className="flex items-start gap-2">
              <MapPin className="h-5 w-5 text-slate-400 mt-0.5 shrink-0" />
              <p className="text-white flex-1">{intervento.indirizzo_intervento}</p>
            </div>
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-blue-600/20 border border-blue-500/30 text-blue-300 px-4 py-3 rounded-xl mt-2 min-h-[48px] font-medium active:bg-blue-600/30 w-full justify-center"
              >
                <Navigation className="h-5 w-5" />
                Naviga con Maps
              </a>
            )}
          </div>
        )}

        {/* Data prevista */}
        {intervento.data_intervento_prevista && (
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-slate-400" />
            <div>
              <p className="text-slate-400 text-xs">Orario previsto</p>
              <p className="text-white font-medium">
                {format(new Date(intervento.data_intervento_prevista), "EEEE d MMM · HH:mm", {
                  locale: it,
                })}
              </p>
            </div>
          </div>
        )}

        {/* Note tecniche */}
        {intervento.note_tecnico && (
          <div>
            <p className="text-slate-400 text-sm mb-1">Note</p>
            <p className="text-slate-300 text-base">{intervento.note_tecnico}</p>
          </div>
        )}
      </div>

      {/* Azioni principali */}
      <div className="space-y-3 pt-2">
        {!giaAvviato ? (
          <button
            onClick={() => iniziaInterventoMutation.mutate()}
            disabled={iniziaInterventoMutation.isPending}
            className="w-full bg-blue-600 text-white font-bold text-lg py-4 rounded-2xl min-h-[60px] active:bg-blue-700 transition-colors flex items-center justify-center gap-3 disabled:opacity-60"
          >
            {iniziaInterventoMutation.isPending ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>
                <Clock className="h-6 w-6" />
                INIZIA INTERVENTO
              </>
            )}
          </button>
        ) : (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-center">
            <p className="text-green-400 font-medium">
              Intervento avviato alle{" "}
              {format(new Date(intervento.data_intervento_effettiva!), "HH:mm")}
            </p>
          </div>
        )}

        {giaAvviato && (
          <button
            onClick={() => navigate(`/tecnico/intervento/${id}/rapportino`)}
            className="w-full bg-green-600 text-white font-bold text-lg py-4 rounded-2xl min-h-[60px] active:bg-green-700 transition-colors flex items-center justify-center gap-3"
          >
            <ClipboardList className="h-6 w-6" />
            COMPILA RAPPORTINO
          </button>
        )}

        {customer?.phone && (
          <a
            href={`tel:${customer.phone}`}
            className="w-full bg-slate-700 border border-slate-600 text-white font-medium text-base py-3.5 rounded-2xl min-h-[52px] active:bg-slate-600 transition-colors flex items-center justify-center gap-2"
          >
            <Phone className="h-5 w-5" />
            CHIAMA CLIENTE
          </a>
        )}
      </div>
    </div>
  );
}
