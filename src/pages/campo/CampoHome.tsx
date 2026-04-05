/**
 * Home dell'area campo — prima schermata ogni mattina.
 * Condizionale per operaio vs subappaltatore.
 * Scroll verticale — tutto visibile con una mano.
 */
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, isToday, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import {
  Clock, MapPin, AlertTriangle, QrCode,
  Truck, MessageSquare, FileText, ChevronRight,
  CheckCircle, XCircle, PlayCircle, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsCampo } from "@/hooks/useIsCampo";

export default function CampoHome() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { isOperaio, isSubappaltatore } = useIsCampo();
  const today = format(new Date(), "yyyy-MM-dd");

  // ── Ultima timbratura (solo operaio) ─────────────────────────────────
  const { data: ultimaTimbratura } = useQuery({
    queryKey: ["campo-ultima-timbratura", user?.id, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("campo_timbrature")
        .select("*")
        .eq("user_id", user!.id)
        .gte("timestamp_evento", `${today}T00:00:00`)
        .order("timestamp_evento", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id && isOperaio,
    refetchInterval: 30000,
  });

  const isDentro = ultimaTimbratura?.tipo === "entrata" || ultimaTimbratura?.tipo === "pausa_fine";

  // Ore lavorate oggi (calcolo da prima entrata)
  const { data: oreLavorate } = useQuery({
    queryKey: ["campo-ore-oggi", user?.id, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("campo_timbrature")
        .select("tipo, timestamp_evento")
        .eq("user_id", user!.id)
        .gte("timestamp_evento", `${today}T00:00:00`)
        .order("timestamp_evento", { ascending: true });
      if (!data?.length) return 0;
      // Calcola ore nette: somma intervalli entrata-uscita
      let totaleMs = 0;
      let ultimaEntrata: Date | null = null;
      for (const t of data) {
        if (t.tipo === "entrata" || t.tipo === "pausa_fine") {
          ultimaEntrata = new Date(t.timestamp_evento);
        } else if ((t.tipo === "uscita" || t.tipo === "pausa_inizio") && ultimaEntrata) {
          totaleMs += new Date(t.timestamp_evento).getTime() - ultimaEntrata.getTime();
          ultimaEntrata = null;
        }
      }
      // Se ancora dentro: aggiungi tempo fino ad ora
      if (ultimaEntrata) {
        totaleMs += Date.now() - ultimaEntrata.getTime();
      }
      return Math.round((totaleMs / 3600000) * 10) / 10;
    },
    enabled: !!user?.id && isOperaio,
    refetchInterval: 60000,
  });

  // ── Lavori assegnati oggi (operaio) ───────────────────────────────────
  const { data: lavoriOggi = [], isLoading: loadingLavori } = useQuery({
    queryKey: ["campo-lavori-oggi", user?.id, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("order_campo_assignments")
        .select(`
          *,
          order:orders(
            id, order_code, description, status,
            address_line1, city,
            percentuale_avanzamento,
            customer:profiles!orders_customer_id_fkey(first_name, last_name)
          )
        `)
        .eq("user_id", user!.id)
        .or(`data_inizio.lte.${today},data_inizio.is.null`)
        .or(`data_fine_prevista.gte.${today},data_fine_prevista.is.null`);
      return data ?? [];
    },
    enabled: !!user?.id && isOperaio,
  });

  // ── Rapportini in sospeso (operaio) ──────────────────────────────────
  const { data: rapportiniSospesi = [] } = useQuery({
    queryKey: ["campo-rapportini-sospesi", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("campo_rapportini")
        .select("id, order_id, data_lavoro, order:orders(order_code, description)")
        .eq("user_id", user!.id)
        .eq("lavoro_completato", false)
        .lt("data_lavoro", today)
        .order("data_lavoro", { ascending: false });
      return data ?? [];
    },
    enabled: !!user?.id && isOperaio,
  });

  // ── Cantieri subappaltatore ───────────────────────────────────────────
  const { data: cantieriSub = [], isLoading: loadingSub } = useQuery({
    queryKey: ["campo-cantieri-sub", user?.id],
    queryFn: async () => {
      const { data: subData } = await supabase
        .from("subappaltatori")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!subData?.id) return [];
      const { data } = await supabase
        .from("contratti_subappalto")
        .select(`
          *,
          order:orders(id, order_code, description, address_line1, city)
        `)
        .eq("subappaltatore_id", subData.id)
        .eq("stato", "attivo");
      return data ?? [];
    },
    enabled: !!user?.id && isSubappaltatore,
  });

  // ── SAL in attesa (subappaltatore) ────────────────────────────────────
  const { data: salInAttesa = [] } = useQuery({
    queryKey: ["campo-sal-attesa", user?.id],
    queryFn: async () => {
      const { data: subData } = await supabase
        .from("subappaltatori")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!subData?.id) return [];
      const { data } = await supabase
        .from("sal_subappaltatori")
        .select("*")
        .eq("subappaltatore_id", subData.id)
        .eq("stato", "ricevuto")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user?.id && isSubappaltatore,
  });

  return (
    <div className="px-4 py-5 space-y-5 pb-6">
      {/* Saluto */}
      <div>
        <p className="text-slate-400 text-sm">
          {format(new Date(), "EEEE d MMMM", { locale: it })}
        </p>
        <h1 className="text-xl font-bold text-white">
          Ciao, {profile?.first_name} 👷
        </h1>
      </div>

      {/* ── BLOCCO 1: Timbratura (solo operaio) ── */}
      {isOperaio && (
        <div
          className={`rounded-2xl p-4 border ${
            isDentro
              ? "bg-green-500/10 border-green-500/20"
              : "bg-slate-900 border-slate-800"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isDentro ? "bg-green-400 animate-pulse" : "bg-slate-500"}`} />
              <span className="text-sm font-semibold">
                {isDentro ? "Sei in servizio" : "Non hai ancora timbrato"}
              </span>
            </div>
            {isDentro && oreLavorate != null && (
              <span className="text-amber-400 font-bold">{oreLavorate}h lavorate</span>
            )}
          </div>
          {ultimaTimbratura && (
            <p className="text-xs text-slate-400 mb-3">
              Ultima timbratura: {format(new Date(ultimaTimbratura.timestamp_evento), "HH:mm")} —{" "}
              {ultimaTimbratura.tipo === "entrata" ? "Entrata" :
               ultimaTimbratura.tipo === "uscita" ? "Uscita" :
               ultimaTimbratura.tipo === "pausa_inizio" ? "Inizio pausa" : "Fine pausa"}
            </p>
          )}
          <button
            onClick={() => navigate("/campo/timbratura")}
            className={`w-full py-3.5 rounded-xl font-bold text-base transition-all active:scale-[0.98] ${
              isDentro
                ? "bg-red-500 text-white"
                : "bg-green-500 text-white"
            }`}
          >
            {isDentro ? "TIMBRA USCITA" : "TIMBRA ENTRATA"}
          </button>
        </div>
      )}

      {/* ── BLOCCO 2: Lavori assegnati oggi (operaio) ── */}
      {isOperaio && (
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Lavori assegnati oggi
          </h2>
          {loadingLavori ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
            </div>
          ) : lavoriOggi.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
              <CheckCircle className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">Nessun lavoro assegnato oggi</p>
            </div>
          ) : (
            <div className="space-y-3">
              {lavoriOggi.map((a: any) => (
                <button
                  key={a.id}
                  onClick={() => navigate(`/campo/lavoro/${a.order?.id}`)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-left active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-white">{a.order?.order_code}</p>
                      <p className="text-sm text-slate-300 line-clamp-1">{a.order?.description}</p>
                    </div>
                    {a.is_capocantiere && (
                      <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-full px-2 py-0.5">
                        Capocantiere
                      </span>
                    )}
                  </div>
                  {a.order?.address_line1 && (
                    <div className="flex items-center gap-1 text-xs text-slate-400 mb-2">
                      <MapPin className="w-3 h-3" />
                      <span>{a.order.address_line1}, {a.order.city}</span>
                    </div>
                  )}
                  {/* Progress bar */}
                  <div className="w-full bg-slate-800 rounded-full h-1.5">
                    <div
                      className="bg-amber-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${a.order?.percentuale_avanzamento ?? 0}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-slate-500">{a.order?.percentuale_avanzamento ?? 0}% completato</span>
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── BLOCCO 3: Rapportini in sospeso (operaio) ── */}
      {isOperaio && rapportiniSospesi.length > 0 && (
        <div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <span className="text-amber-400 font-semibold text-sm">
                {rapportiniSospesi.length} rapportini da completare
              </span>
            </div>
            <div className="space-y-2">
              {rapportiniSospesi.slice(0, 3).map((r: any) => (
                <button
                  key={r.id}
                  onClick={() => navigate(`/campo/lavoro/${r.order_id}`)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div>
                    <p className="text-sm text-white">{r.order?.order_code} — {r.order?.description?.slice(0, 30)}...</p>
                    <p className="text-xs text-slate-400">
                      {format(parseISO(r.data_lavoro), "d MMM", { locale: it })}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-amber-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── BLOCCO 1 SUB: Cantieri attivi (subappaltatore) ── */}
      {isSubappaltatore && (
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Cantieri attivi
          </h2>
          {loadingSub ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
            </div>
          ) : cantieriSub.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
              <p className="text-slate-400 text-sm">Nessun cantiere attivo</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cantieriSub.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/campo/lavoro/${c.order?.id}`)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-left active:scale-[0.98] transition-transform"
                >
                  <p className="font-semibold text-white">{c.order?.order_code}</p>
                  <p className="text-sm text-slate-300">{c.order?.description}</p>
                  {c.order?.address_line1 && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-slate-400">
                      <MapPin className="w-3 h-3" />
                      <span>{c.order.address_line1}, {c.order.city}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-amber-400">
                      {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(c.importo ?? 0)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── BLOCCO 2 SUB: SAL in attesa ── */}
      {isSubappaltatore && salInAttesa.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            SAL in attesa di approvazione
          </h2>
          {salInAttesa.slice(0, 3).map((s: any) => (
            <button
              key={s.id}
              onClick={() => navigate("/campo/sal")}
              className="w-full bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 text-left active:scale-[0.98] transition-transform"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">SAL #{s.numero_sal}</p>
                  <p className="text-xs text-slate-400">
                    {format(parseISO(s.data_emissione ?? s.created_at), "d MMM yyyy", { locale: it })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-amber-400 font-bold">
                    {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(s.importo_netto ?? 0)}
                  </p>
                  <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-full px-2 py-0.5">
                    In attesa
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── BLOCCO 4: Accessi rapidi ── */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Accesso rapido
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {isOperaio && (
            <button
              onClick={() => navigate("/campo/tesserino")}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col items-center gap-2 active:scale-95 transition-transform"
            >
              <QrCode className="w-8 h-8 text-amber-400" />
              <span className="text-xs font-medium text-white">Tesserino</span>
            </button>
          )}
          <button
            onClick={() => navigate(isOperaio ? "/campo/magazzino" : "/campo/sub/documenti")}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col items-center gap-2 active:scale-95 transition-transform"
          >
            <Truck className="w-8 h-8 text-amber-400" />
            <span className="text-xs font-medium text-white">{isOperaio ? "Furgone" : "Documenti"}</span>
          </button>
          <button
            onClick={() => navigate("/campo/chat")}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col items-center gap-2 active:scale-95 transition-transform"
          >
            <MessageSquare className="w-8 h-8 text-amber-400" />
            <span className="text-xs font-medium text-white">Chat</span>
          </button>
          <button
            onClick={() => navigate(isOperaio ? "/campo/documenti" : "/campo/sal")}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col items-center gap-2 active:scale-95 transition-transform"
          >
            <FileText className="w-8 h-8 text-amber-400" />
            <span className="text-xs font-medium text-white">{isOperaio ? "Documenti" : "SAL"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
