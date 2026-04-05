/**
 * Dettaglio ordine/cantiere assegnato all'operaio o subappaltatore.
 * Verifica accesso tramite order_campo_assignments — sicurezza obbligatoria.
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  ArrowLeft, MapPin, Phone, Plus, AlertCircle,
  CheckCircle, Clock, ChevronRight, Loader2, FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

type Tab = "descrizione" | "rapportini" | "chat" | "documenti";

export default function CampoLavoroDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("descrizione");

  // Verifica assegnazione — SICUREZZA OBBLIGATORIA
  const { data: assignment, isLoading } = useQuery({
    queryKey: ["campo-lavoro", orderId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_campo_assignments")
        .select(`
          *,
          order:orders(
            id, order_code, description, status,
            address_line1, address_line2, city, province,
            percentuale_avanzamento, notes,
            customer:profiles!orders_customer_id_fkey(
              first_name, last_name, phone, email
            )
          )
        `)
        .eq("order_id", orderId!)
        .eq("user_id", user!.id)
        .maybeSingle();

      if (error || !data) {
        // Non assegnato → redirect sicuro
        navigate("/campo");
        return null;
      }
      return data;
    },
    enabled: !!orderId && !!user?.id,
  });

  // Articoli ordine
  const { data: orderItems = [] } = useQuery({
    queryKey: ["campo-order-items", orderId],
    queryFn: async () => {
      const { data } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId!);
      return data ?? [];
    },
    enabled: !!orderId && activeTab === "descrizione",
  });

  // Rapportini dell'utente su questo ordine
  const { data: rapportini = [] } = useQuery({
    queryKey: ["campo-rapportini-ordine", orderId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("campo_rapportini")
        .select("*")
        .eq("order_id", orderId!)
        .eq("user_id", user!.id)
        .order("data_lavoro", { ascending: false });
      return data ?? [];
    },
    enabled: !!orderId && !!user?.id && activeTab === "rapportini",
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  if (!assignment) return null;

  const order = assignment.order as any;
  const customer = order?.customer;
  const tabs: { key: Tab; label: string }[] = [
    { key: "descrizione", label: "Descrizione" },
    { key: "rapportini",  label: "Rapportini" },
    { key: "chat",        label: "Chat" },
    { key: "documenti",   label: "Documenti" },
  ];

  return (
    <div className="flex flex-col h-full pb-32">
      {/* Header sticky */}
      <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={() => navigate("/campo")}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 active:bg-slate-700 shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white truncate">{order?.order_code}</p>
            <p className="text-xs text-slate-400 truncate">{order?.description}</p>
          </div>
        </div>

        {/* Indirizzo → Google Maps */}
        {order?.address_line1 && (
          <button
            onClick={() => window.open(
              `https://maps.google.com/?q=${encodeURIComponent([order.address_line1, order.city, order.province].filter(Boolean).join(", "))}`,
              "_blank"
            )}
            className="flex items-center gap-1.5 text-amber-400 text-xs mt-1"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>{order.address_line1}, {order.city} {order.province}</span>
          </button>
        )}

        {/* Progress bar */}
        <div className="mt-2">
          <div className="w-full bg-slate-800 rounded-full h-1.5">
            <div
              className="bg-amber-500 h-1.5 rounded-full transition-all"
              style={{ width: `${order?.percentuale_avanzamento ?? 0}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{order?.percentuale_avanzamento ?? 0}% completato</p>
        </div>

        {/* Tab selector */}
        <div className="flex gap-1 mt-3 overflow-x-auto scrollbar-hide">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                activeTab === key
                  ? "bg-amber-500 text-black"
                  : "bg-slate-800 text-slate-400 active:bg-slate-700"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenuto tab */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* ── Tab: Descrizione ── */}
        {activeTab === "descrizione" && (
          <>
            {/* Card cliente */}
            {customer && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <p className="text-xs text-slate-500 mb-1">Cliente</p>
                <p className="font-semibold text-white">
                  {customer.first_name} {customer.last_name}
                </p>
                {customer.phone && (
                  <a
                    href={`tel:${customer.phone}`}
                    className="flex items-center gap-2 mt-2 text-amber-400 text-sm"
                  >
                    <Phone className="w-4 h-4" />
                    <span>{customer.phone}</span>
                  </a>
                )}
              </div>
            )}

            {/* Note ufficio */}
            {order?.notes && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <p className="text-xs text-slate-500 mb-1">Note dall'ufficio</p>
                <p className="text-sm text-white">{order.notes}</p>
              </div>
            )}

            {/* Materiali da installare */}
            {orderItems.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <p className="text-xs text-slate-500 mb-2">Materiali / Articoli</p>
                <div className="space-y-2">
                  {orderItems.map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <p className="text-sm text-white">{item.description || item.name}</p>
                      {item.quantity && (
                        <span className="text-xs text-amber-400">x{item.quantity}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Tab: Rapportini ── */}
        {activeTab === "rapportini" && (
          <div className="space-y-3">
            <button
              onClick={() => navigate(`/campo/lavoro/${orderId}/rapportino`)}
              className="w-full bg-amber-500 text-black font-bold py-3.5 rounded-xl text-base active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Nuovo rapportino
            </button>

            {rapportini.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-3 text-center">
                <FileText className="w-10 h-10 text-slate-700" />
                <p className="text-slate-400 text-sm">Nessun rapportino per questo cantiere</p>
              </div>
            ) : (
              rapportini.map((r: any) => (
                <div
                  key={r.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4"
                >
                  <div className="flex items-start justify-between mb-1">
                    <p className="font-semibold text-white">
                      {format(new Date(r.data_lavoro), "d MMM yyyy", { locale: it })}
                    </p>
                    {r.approvato ? (
                      <span className="flex items-center gap-1 text-[10px] bg-green-500/20 text-green-400 border border-green-500/20 rounded-full px-2 py-0.5">
                        <CheckCircle className="w-3 h-3" />
                        Approvato
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-full px-2 py-0.5">
                        <Clock className="w-3 h-3" />
                        In attesa
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                    {r.ore_lavorate != null && <span>{r.ore_lavorate}h lavorate</span>}
                    {r.percentuale_avanzamento != null && <span>{r.percentuale_avanzamento}% avanzamento</span>}
                  </div>
                  {r.descrizione_lavori && (
                    <p className="text-sm text-slate-300 mt-1 line-clamp-2">{r.descrizione_lavori}</p>
                  )}
                  {r.foto_urls?.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {r.foto_urls.slice(0, 3).map((url: string, i: number) => (
                        <img
                          key={i}
                          src={url}
                          className="w-12 h-12 rounded-lg object-cover"
                          alt="Foto rapportino"
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Tab: Chat ── */}
        {activeTab === "chat" && (
          <div className="flex flex-col items-center py-12 gap-3 text-center">
            <button
              onClick={() => navigate("/campo/chat")}
              className="bg-amber-500 text-black font-bold py-3.5 px-8 rounded-xl active:scale-[0.98] transition-transform"
            >
              Apri chat cantiere
            </button>
            <p className="text-xs text-slate-400">
              Canale: cantiere-{order?.order_code}
            </p>
          </div>
        )}

        {/* ── Tab: Documenti ── */}
        {activeTab === "documenti" && (
          <div className="flex flex-col items-center py-12 gap-3 text-center">
            <FileText className="w-10 h-10 text-slate-700" />
            <p className="text-slate-400 text-sm">
              I documenti allegati all'ordine sono visibili qui (sola lettura)
            </p>
          </div>
        )}
      </div>

      {/* CTA sticky in basso */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-slate-950 border-t border-slate-800 px-4 pt-3"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/campo/lavoro/${orderId}/rapportino`)}
            className="flex-1 bg-amber-500 text-black font-bold py-3.5 rounded-xl text-base active:scale-[0.98] transition-transform"
          >
            NUOVO RAPPORTINO
          </button>
          <button
            onClick={() => navigate(`/campo/ticket/nuovo/${orderId}`)}
            className="flex-1 bg-slate-800 text-white border border-slate-700 font-semibold py-3.5 rounded-xl text-sm active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
          >
            <AlertCircle className="w-4 h-4" />
            Apri ticket
          </button>
        </div>
      </div>
    </div>
  );
}
