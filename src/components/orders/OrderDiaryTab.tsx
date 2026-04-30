import { useState, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import {
  Mail, MessageSquare, Phone, StickyNote,
  ArrowDownLeft, ArrowUpRight, Download, Filter, Clock,
  CheckCircle2, AlertCircle, Circle, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useOrderDiary, DiaryEntry, OrderEvent, OrderMessage } from "@/hooks/useOrderDiary";
import { ComposeBar } from "./ComposeBar";
import { cn } from "@/lib/utils";

// ── Configurazione icone e colori per event_type ──────────────────────────────
const EVENT_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  ordine_creato:              { label: "Commessa creata",      color: "bg-blue-100 text-blue-800",    icon: "📋" },
  ordine_aggiornato:          { label: "Commessa aggiornata",  color: "bg-blue-100 text-blue-700",    icon: "✏️" },
  stato_cambiato:             { label: "Stato cambiato",       color: "bg-purple-100 text-purple-800",icon: "🔄" },
  articolo_aggiunto:          { label: "Articolo aggiunto",    color: "bg-slate-100 text-slate-700",  icon: "➕" },
  articolo_aggiornato:        { label: "Articolo aggiornato",  color: "bg-slate-100 text-slate-700",  icon: "✏️" },
  articolo_stato_cambiato:    { label: "Articolo aggiornato",  color: "bg-slate-100 text-slate-700",  icon: "📦" },
  articolo_eliminato:         { label: "Articolo eliminato",   color: "bg-red-100 text-red-700",      icon: "🗑️" },
  acconto_ricevuto:           { label: "Acconto ricevuto",     color: "bg-green-100 text-green-800",  icon: "💶" },
  acconto_2_ricevuto:         { label: "2° Acconto ricevuto",  color: "bg-green-100 text-green-800",  icon: "💶" },
  saldo_ricevuto:             { label: "Saldo ricevuto",       color: "bg-green-100 text-green-800",  icon: "✅" },
  pagamento_fornitore:        { label: "Pag. fornitore",       color: "bg-teal-100 text-teal-800",    icon: "💸" },
  fattura_creata:             { label: "Fattura creata",       color: "bg-amber-100 text-amber-800",  icon: "🧾" },
  fattura_inviata_sdi:        { label: "Fattura inviata SDI",  color: "bg-amber-100 text-amber-800",  icon: "📤" },
  fattura_pagata:             { label: "Fattura pagata",       color: "bg-green-100 text-green-800",  icon: "💰" },
  nota_credito_creata:        { label: "Nota credito",         color: "bg-orange-100 text-orange-800",icon: "📋" },
  allegato_caricato:          { label: "Allegato caricato",    color: "bg-orange-100 text-orange-800",icon: "📎" },
  foto_rilievo_caricata:      { label: "Foto rilievo",         color: "bg-orange-100 text-orange-800",icon: "📸" },
  reportino_cantiere:         { label: "Report giornale",      color: "bg-slate-100 text-slate-600",  icon: "📋" },
  appuntamento_creato:        { label: "Appuntamento creato",  color: "bg-blue-100 text-blue-800",    icon: "📅" },
  appuntamento_confermato:    { label: "Appuntamento conf.",   color: "bg-blue-100 text-blue-800",    icon: "✅" },
  appuntamento_completato:    { label: "Appuntamento compl.",  color: "bg-green-100 text-green-800",  icon: "✔️" },
  ordine_fornitore_creato:    { label: "OdF creato",           color: "bg-teal-100 text-teal-800",    icon: "🏭" },
  merce_arrivata:             { label: "Merce arrivata",       color: "bg-teal-100 text-teal-800",    icon: "🚚" },
  contratto_firmato:          { label: "Contratto firmato",    color: "bg-green-100 text-green-800",  icon: "✍️" },
  preventivo_accettato:       { label: "Preventivo accettato", color: "bg-green-100 text-green-800",  icon: "👍" },
  giornale_lavori_inserito:   { label: "Report giornale",      color: "bg-slate-100 text-slate-600",  icon: "📋" },
  nota_interna:               { label: "Nota interna",         color: "bg-slate-100 text-slate-600",  icon: "📝" },
};

const CHANNEL_CONFIG = {
  email:        { label: "Email",        icon: Mail,          color: "text-blue-600"    },
  sms:          { label: "SMS",           icon: Phone,         color: "text-green-600"   },
  whatsapp:     { label: "WhatsApp",      icon: MessageSquare, color: "text-emerald-600" },
  nota_interna: { label: "Nota interna",  icon: StickyNote,    color: "text-slate-500"   },
};

// ── Formatta payload leggibile ────────────────────────────────────────────────
function formatEventDescription(event: OrderEvent): string {
  const p = event.payload;
  switch (event.event_type) {
    case "stato_cambiato":
      return `${p.from_status ?? "?"} → ${p.to_status ?? "?"}`;
    case "articolo_stato_cambiato":
      return `${p.item_name}: ${p.from_status} → ${p.to_status}`;
    case "acconto_ricevuto":
    case "acconto_2_ricevuto":
    case "saldo_ricevuto":
      return `${p.label ?? ""} — €${Number(p.amount ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}`;
    case "fattura_creata":
    case "fattura_pagata":
      return `${p.numero ?? "Fattura"} — €${Number(p.total ?? p.totale ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}`;
    case "giornale_lavori_inserito": {
      const parts: string[] = [];
      if (p.data_lavori) parts.push(format(parseISO(p.data_lavori as string), "dd MMM yyyy", { locale: it }));
      if (p.lavorazioni) parts.push(String(p.lavorazioni).slice(0, 60) + (String(p.lavorazioni).length > 60 ? "…" : ""));
      if (p.personale) parts.push(`${p.personale} operai`);
      if (p.avanzamento != null) parts.push(`${p.avanzamento}% avanzamento`);
      return parts.join(" · ") || "Report giornaliero";
    }
    case "allegato_caricato":
    case "foto_rilievo_caricata":
      return (p.file_name as string) || "File caricato";
    case "appuntamento_creato":
    case "appuntamento_confermato":
    case "appuntamento_completato":
      return `${p.title ?? "Appuntamento"} — ${p.date ? format(parseISO(p.date as string), "dd MMM yyyy HH:mm", { locale: it }) : ""}`;
    case "ordine_creato":
      return `${p.order_code ?? ""} ${p.description ?? ""}`.trim();
    default:
      return JSON.stringify(p).slice(0, 80);
  }
}

// ── Status icon per messaggi ──────────────────────────────────────────────────
function MessageStatusIcon({ status }: { status: string }) {
  if (status === "sent")      return <CheckCircle2 className="h-3 w-3 text-blue-400" />;
  if (status === "delivered") return <CheckCircle2 className="h-3 w-3 text-green-500" />;
  if (status === "read")      return <CheckCircle2 className="h-3 w-3 text-green-600" />;
  if (status === "failed")    return <AlertCircle  className="h-3 w-3 text-red-500" />;
  if (status === "pending")   return <Loader2      className="h-3 w-3 text-slate-400 animate-spin" />;
  return <Circle className="h-3 w-3 text-slate-300" />;
}

// ── Entry: Evento automatico ──────────────────────────────────────────────────
function EventEntry({ event }: { event: OrderEvent }) {
  const cfg = EVENT_CONFIG[event.event_type] ?? {
    label: event.event_type,
    color: "bg-slate-100 text-slate-600",
    icon: "🔹",
  };
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="mt-0.5 text-base w-6 text-center flex-shrink-0">{cfg.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded", cfg.color)}>
            {cfg.label}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {formatEventDescription(event)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {format(parseISO(event.created_at), "dd MMM yyyy, HH:mm", { locale: it })}
          </span>
          {event.actor_name && (
            <span className="text-xs text-muted-foreground">· {event.actor_name}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Entry: Messaggio (email/sms/wa/nota) ──────────────────────────────────────
function MessageEntry({ message }: { message: OrderMessage }) {
  const cfg = CHANNEL_CONFIG[message.channel as keyof typeof CHANNEL_CONFIG] ?? CHANNEL_CONFIG.nota_interna;
  const Icon = cfg.icon;
  const isIn = message.direction === "in";

  return (
    <div className={cn("flex items-start gap-3 py-2.5", isIn && "bg-muted/40 rounded-lg px-2")}>
      <div className={cn("mt-0.5 flex-shrink-0", cfg.color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground">{cfg.label}</span>
          {isIn ? (
            <>
              <ArrowDownLeft className="h-3 w-3 text-blue-500" />
              <span className="text-xs text-blue-600 font-medium">Risposta cliente</span>
            </>
          ) : (
            <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
          )}
          {message.subject && (
            <span className="text-xs font-medium truncate">{message.subject}</span>
          )}
        </div>
        <p className="text-sm mt-0.5 whitespace-pre-wrap line-clamp-3 text-foreground">
          {message.body}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {format(parseISO(message.created_at), "dd MMM yyyy, HH:mm", { locale: it })}
          </span>
          {message.sent_by_name && (
            <span className="text-xs text-muted-foreground">· {message.sent_by_name}</span>
          )}
          {!isIn && <MessageStatusIcon status={message.status} />}
          {message.failed_reason && (
            <span className="text-xs text-red-500">{message.failed_reason}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface OrderDiaryTabProps {
  orderId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
}

export function OrderDiaryTab({
  orderId,
  customerName,
  customerEmail,
  customerPhone,
}: OrderDiaryTabProps) {
  const { timeline, templates, sendMutation, addNoteMutation } = useOrderDiary(orderId);
  const [filter, setFilter] = useState<string>("all");

  // ── Export CSV ────────────────────────────────────────────────────────────
  const handleExportCSV = useCallback(() => {
    const rows: string[][] = [["Data", "Tipo", "Canale", "Descrizione", "Attore/Mittente"]];
    timeline.forEach(entry => {
      if (entry.kind === "event") {
        const cfg = EVENT_CONFIG[entry.data.event_type];
        rows.push([
          format(parseISO(entry.data.created_at), "dd/MM/yyyy HH:mm"),
          cfg?.label || entry.data.event_type,
          "Evento",
          formatEventDescription(entry.data),
          entry.data.actor_name || "",
        ]);
      } else {
        const m = entry.data;
        rows.push([
          format(parseISO(m.created_at), "dd/MM/yyyy HH:mm"),
          m.direction === "in" ? "Risposta cliente" : "Messaggio inviato",
          m.channel,
          m.subject ? `${m.subject}: ${m.body}` : m.body,
          m.sent_by_name || (m.direction === "in" ? customerName : ""),
        ]);
      }
    });
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diario-commessa-${orderId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [timeline, orderId, customerName]);

  // ── Filtra timeline ───────────────────────────────────────────────────────
  const filtered = timeline.filter((entry: DiaryEntry) => {
    if (filter === "all")      return true;
    if (filter === "eventi")   return entry.kind === "event";
    if (filter === "messaggi") return entry.kind === "message" && entry.data.channel !== "nota_interna";
    if (filter === "note")     return entry.kind === "message" && entry.data.channel === "nota_interna";
    if (filter === "email")    return entry.kind === "message" && entry.data.channel === "email";
    if (filter === "sms")      return entry.kind === "message" && entry.data.channel === "sms";
    if (filter === "whatsapp") return entry.kind === "message" && entry.data.channel === "whatsapp";
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Header + filtri + export */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Tutti" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            <SelectItem value="eventi">Solo eventi</SelectItem>
            <SelectItem value="messaggi">Comunicazioni</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="note">Note interne</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="text-xs">{filtered.length} voci</Badge>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5 mr-1.5" />Esporta CSV
          </Button>
        </div>
      </div>

      {/* Timeline */}
      <Card>
        <CardContent className="py-4 px-4">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nessuna voce nel diario
            </p>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((entry: DiaryEntry) => (
                <div key={entry.data.id}>
                  {entry.kind === "event"
                    ? <EventEntry event={entry.data} />
                    : <MessageEntry message={entry.data} />
                  }
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compose bar */}
      <ComposeBar
        customerName={customerName}
        customerEmail={customerEmail}
        customerPhone={customerPhone}
        templates={templates}
        onSend={sendMutation.mutate}
        onAddNote={addNoteMutation.mutate}
        isSending={sendMutation.isPending || addNoteMutation.isPending}
      />
    </div>
  );
}
