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
  CheckCircle, Clock, Loader2, FileText,
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

  // Verifica assegnazione — controlla order_campo_assignments e order_employees
  const { data: assignment, isLoading } = useQuery({
    queryKey: ["campo-lavoro", orderId, user?.id],
    queryFn: async () => {
      const orderSelect = `
        id, order_code, description, status,
        indirizzo_lavori,
        percentuale_avanzamento,
        customer:profiles!orders_customer_id_fkey(
          first_name, last_name, phone, email
        )
      `;

      // 1. Prova order_campo_assignments
      const { data: campoData } = await supabase
        .from("order_campo_assignments")
        .select(`*, order:orders(${orderSelect})`)
        .eq("order_id", orderId!)
        .eq("user_id", user!.id)
        .maybeSingle();

      if (campoData) return campoData;

      // 2. Fallback: controlla order_employees
      const { data: emp } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (emp?.id) {
        const { data: empRows } = await supabase
          .from("order_employees")
          .select("id, order_id")
          .eq("order_id", orderId!)
          .eq("employee_id", emp.id)
          .limit(1);
        const empAssign = empRows?.[0] ?? null;

        if (empAssign) {
          const { data: orderData } = await supabase
            .from("orders")
            .select(orderSelect)
            .eq("id", orderId!)
            .single();

          return { ...empAssign, order: orderData, is_capocantiere: false };
        }
      }

      // Non assegnato → redirect sicuro
      navigate("/campo");
      return null;
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
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
    <div className="flex flex-col h-full">
      {/* Header sticky */}
      <div className="sticky top-0 z-10 bg-muted border-b border-border px-4 py-3">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={() => navigate("/campo")}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-muted active:bg-muted shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-foreground truncate">{order?.order_code}</p>
            <p className="text-xs text-muted-foreground truncate">{order?.description}</p>
          </div>
        </div>

        {/* Indirizzo → Google Maps */}
        {order?.indirizzo_lavori && (
          <button
            onClick={() => window.open(
              `https://maps.google.com/?q=${encodeURIComponent(order.indirizzo_lavori)}`,
              "_blank"
            )}
            className="flex items-center gap-1.5 text-primary text-xs mt-1"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>{order.indirizzo_lavori}</span>
          </button>
        )}

        {/* Progress bar */}
        <div className="mt-2">
          <div className="w-full bg-muted rounded-full h-1.5">
            <div
              className="bg-primary h-1.5 rounded-full transition-all"
              style={{ width: `${order?.percentuale_avanzamento ?? 0}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{order?.percentuale_avanzamento ?? 0}% completato</p>
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
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground active:bg-muted"
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
              <div className="bg-muted border border-border rounded-2xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Cliente</p>
                <p className="font-semibold text-foreground">
                  {customer.first_name} {customer.last_name}
                </p>
                {customer.phone && (
                  <a
                    href={`tel:${customer.phone}`}
                    className="flex items-center gap-2 mt-2 text-primary text-sm"
                  >
                    <Phone className="w-4 h-4" />
                    <span>{customer.phone}</span>
                  </a>
                )}
              </div>
            )}

            {/* Materiali da installare */}
            {orderItems.length > 0 && (
              <div className="bg-muted border border-border rounded-2xl p-4">
                <p className="text-xs text-muted-foreground mb-2">Materiali / Articoli</p>
                <div className="space-y-2">
                  {orderItems.map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <p className="text-sm text-foreground">{item.description || item.name}</p>
                      {item.quantity && (
                        <span className="text-xs text-primary">x{item.quantity}</span>
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
              className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl text-base active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Nuovo rapportino
            </button>

            {rapportini.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-3 text-center">
                <FileText className="w-10 h-10 text-muted-foreground" />
                <p className="text-muted-foreground text-sm">Nessun rapportino per questo cantiere</p>
              </div>
            ) : (
              rapportini.map((r: any) => (
                <div
                  key={r.id}
                  className="bg-muted border border-border rounded-2xl p-4"
                >
                  <div className="flex items-start justify-between mb-1">
                    <p className="font-semibold text-foreground">
                      {format(new Date(r.data_lavoro), "d MMM yyyy", { locale: it })}
                    </p>
                    {r.approvato ? (
                      <span className="flex items-center gap-1 text-[10px] bg-green-500/20 text-green-600 border border-green-500/20 rounded-full px-2 py-0.5">
                        <CheckCircle className="w-3 h-3" />
                        Approvato
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">
                        <Clock className="w-3 h-3" />
                        In attesa
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    {r.ore_lavorate != null && <span>{r.ore_lavorate}h lavorate</span>}
                    {r.percentuale_avanzamento != null && <span>{r.percentuale_avanzamento}% avanzamento</span>}
                  </div>
                  {r.descrizione_lavori && (
                    <p className="text-sm text-foreground mt-1 line-clamp-2">{r.descrizione_lavori}</p>
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
          <ChatCantiere orderId={orderId!} orderCode={order?.order_code ?? ""} />
        )}

        {/* ── Tab: Documenti ── */}
        {activeTab === "documenti" && (
          <div className="flex flex-col items-center py-12 gap-3 text-center">
            <FileText className="w-10 h-10 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">
              I documenti allegati all'ordine sono visibili qui (sola lettura)
            </p>
          </div>
        )}
      </div>

      {/* CTA sticky in basso */}
      <div className="sticky bottom-0 bg-background border-t border-border px-4 py-3 z-20">
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/campo/lavoro/${orderId}/rapportino`)}
            className="flex-1 bg-primary text-white font-bold py-3.5 rounded-xl text-base active:scale-[0.98] transition-transform"
          >
            NUOVO RAPPORTINO
          </button>
          <button
            onClick={() => navigate(`/campo/ticket/nuovo/${orderId}`)}
            className="flex-1 bg-muted text-foreground border border-border font-semibold py-3.5 rounded-xl text-sm active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
          >
            <AlertCircle className="w-4 h-4" />
            Apri ticket
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Componente inline: link al canale chat del cantiere ──────────────────────
function ChatCantiere({ orderId, orderCode }: { orderId: string; orderCode: string }) {
  const navigate = useNavigate();
  const channelName = "cantiere-" + orderCode.toLowerCase().replace(/\s+/g, "-");

  const { data: canale, isLoading } = useQuery({
    queryKey: ["campo-canale-cantiere", orderId, orderCode],
    queryFn: async () => {
      if (!orderCode) return null;
      const { data } = await supabase
        .from("internal_chat_channels")
        .select("id, name")
        .eq("name", channelName)
        .maybeSingle();
      return data;
    },
    enabled: !!orderCode,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-12 gap-3 text-center">
      {canale ? (
        <>
          <button
            onClick={() => navigate(`/campo/chat/${canale.id}`)}
            className="bg-primary text-primary-foreground font-bold py-3.5 px-8 rounded-xl active:scale-[0.98] transition-transform"
          >
            Apri chat cantiere
          </button>
          <p className="text-xs text-muted-foreground">Canale: {canale.name}</p>
        </>
      ) : (
        <>
          <button
            onClick={() => navigate("/campo/chat")}
            className="bg-muted text-foreground font-semibold py-3.5 px-8 rounded-xl active:scale-[0.98] transition-transform border border-border"
          >
            Vai alla chat
          </button>
          <p className="text-xs text-muted-foreground">
            Il canale {channelName} verrà creato automaticamente{"\n"}
            quando l&apos;ufficio ti assegna a questo cantiere.
          </p>
        </>
      )}
    </div>
  );
}
