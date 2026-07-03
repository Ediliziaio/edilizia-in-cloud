import { useState, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import {
  Mail, MessageSquare, Phone, StickyNote,
  ArrowDownLeft, ArrowUpRight, Download, Filter, Clock,
  CheckCircle2, AlertCircle, Circle, Loader2, FileText, Camera, PenLine, Wrench, UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DiaryEntry, MessageTemplate, OrderDiaryAudit, OrderEvent, OrderMessage } from "@/hooks/useOrderDiary";
import { ComposeBar } from "./ComposeBar";
import { cn } from "@/lib/utils";
import { exportToCSV, exportToXLSX, type CsvColumn } from "@/lib/csvExport";
import { toast } from "sonner";

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

const AUDIT_CONFIG: Record<OrderDiaryAudit["audit_type"], { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  documento: { label: "Documento", color: "bg-orange-100 text-orange-800", icon: FileText },
  foto: { label: "Foto", color: "bg-sky-100 text-sky-800", icon: Camera },
  rapportino: { label: "Aggiornamento campo", color: "bg-emerald-100 text-emerald-800", icon: UserCheck },
  firma: { label: "Firma", color: "bg-green-100 text-green-800", icon: PenLine },
  assistenza: { label: "Assistenza", color: "bg-amber-100 text-amber-800", icon: Wrench },
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
    case "reportino_cantiere": {
      const parts: string[] = [];
      if (p.data_lavoro) parts.push(format(parseISO(p.data_lavoro as string), "dd MMM yyyy", { locale: it }));
      if (p.descrizione_lavori) parts.push(String(p.descrizione_lavori).slice(0, 80) + (String(p.descrizione_lavori).length > 80 ? "…" : ""));
      if (p.ore_lavorate != null) parts.push(`${p.ore_lavorate}h lavorate`);
      if (p.percentuale_avanzamento != null) parts.push(`${p.percentuale_avanzamento}% avanzamento`);
      if (p.foto_count != null) parts.push(`${p.foto_count} foto`);
      if (p.lavoro_completato) parts.push("completato");
      return parts.join(" · ") || "Rapportino campo";
    }
    case "allegato_caricato":
    case "foto_rilievo_caricata":
      return [
        p.file_name as string,
        p.file_type as string,
        p.file_size ? `${p.file_size}` : null,
      ].filter(Boolean).join(" · ") || "File caricato";
    case "appuntamento_creato":
    case "appuntamento_confermato":
    case "appuntamento_completato":
      return `${p.title ?? "Appuntamento"} — ${p.date ? format(parseISO(p.date as string), "dd MMM yyyy HH:mm", { locale: it }) : ""}`;
    case "contratto_firmato":
      return [
        p.action === "richiesta_firma_creata" ? "Richiesta firma inviata" : "Contratto firmato",
        p.document_type as string,
        (p.signer_name as string) || (p.signer_email as string),
        p.signed_at ? `firmato il ${format(parseISO(p.signed_at as string), "dd MMM yyyy HH:mm", { locale: it })}` : null,
      ].filter(Boolean).join(" · ");
    case "ordine_creato":
      return `${p.order_code ?? ""} ${p.description ?? ""}`.trim();
    default:
      return JSON.stringify(p).slice(0, 80);
  }
}

function AuditEntry({ audit }: { audit: OrderDiaryAudit }) {
  const cfg = AUDIT_CONFIG[audit.audit_type] ?? {
    label: audit.audit_type,
    color: "bg-slate-100 text-slate-600",
    icon: FileText,
  };
  const Icon = cfg.icon;
  const metadata = audit.metadata
    ? Object.entries(audit.metadata).filter(([, value]) => value !== null && value !== "" && value !== false)
    : [];

  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md", cfg.color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", cfg.color)}>
            {cfg.label}
          </span>
          <span className="truncate text-xs font-medium text-foreground">{audit.title}</span>
          <span className="truncate text-xs text-muted-foreground">{audit.description}</span>
        </div>
        {metadata.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {metadata.map(([key, value]) => (
              <span key={key} className="rounded border bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {key.replace(/_/g, " ")}: {String(value)}
              </span>
            ))}
          </div>
        )}
        <div className="mt-1 flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {format(parseISO(audit.created_at), "dd MMM yyyy, HH:mm", { locale: it })}
          </span>
          {audit.actor_name && (
            <span className="text-xs text-muted-foreground">· {audit.actor_name}</span>
          )}
        </div>
      </div>
    </div>
  );
}

const EXPORT_COLUMNS: CsvColumn[] = [
  { key: "data", label: "Data" },
  { key: "tipo", label: "Tipo" },
  { key: "origine", label: "Origine" },
  { key: "descrizione", label: "Descrizione" },
  { key: "responsabile", label: "Chi ha fatto cosa" },
  { key: "dettagli", label: "Dettagli" },
];

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

// Tronca i dettagli (payload/metadata JSON) per evitare blocchi chilometrici negli export
const MAX_DETTAGLI_LENGTH = 500;
function truncateDettagli(value: string): string {
  return value.length > MAX_DETTAGLI_LENGTH ? `${value.slice(0, MAX_DETTAGLI_LENGTH)}…` : value;
}

// ── Main component ────────────────────────────────────────────────────────────
interface OrderDiaryTabProps {
  orderId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  timeline: DiaryEntry[];
  templates: MessageTemplate[];
  onSend: (payload: {
    channel: string;
    to_name: string;
    to_email?: string;
    to_phone?: string;
    subject?: string;
    body: string;
    template_id?: string;
  }) => void;
  onAddNote: (body: string) => void;
  isSending: boolean;
}

export function OrderDiaryTab({
  orderId,
  customerName,
  customerEmail,
  customerPhone,
  timeline,
  templates,
  onSend,
  onAddNote,
  isSending,
}: OrderDiaryTabProps) {
  const [filter, setFilter] = useState<string>("all");

  const buildExportRows = useCallback((): Record<string, string>[] => {
    return timeline.map(entry => {
      if (entry.kind === "event") {
        const cfg = EVENT_CONFIG[entry.data.event_type];
        return {
          data: format(parseISO(entry.data.created_at), "dd/MM/yyyy HH:mm"),
          tipo: cfg?.label || entry.data.event_type,
          origine: "Evento automatico",
          descrizione: formatEventDescription(entry.data),
          responsabile: entry.data.actor_name || "",
          dettagli: truncateDettagli(JSON.stringify(entry.data.payload ?? {})),
        };
      }

      if (entry.kind === "audit") {
        const cfg = AUDIT_CONFIG[entry.data.audit_type];
        return {
          data: format(parseISO(entry.data.created_at), "dd/MM/yyyy HH:mm"),
          tipo: cfg?.label ?? entry.data.audit_type,
          origine: entry.data.title,
          descrizione: entry.data.description,
          responsabile: entry.data.actor_name || "",
          dettagli: entry.data.metadata ? truncateDettagli(JSON.stringify(entry.data.metadata)) : "",
        };
      }

      const m = entry.data;
      return {
        data: format(parseISO(m.created_at), "dd/MM/yyyy HH:mm"),
        tipo: m.direction === "in" ? "Risposta cliente" : "Messaggio inviato",
        origine: m.channel,
        descrizione: m.subject ? `${m.subject}: ${m.body}` : m.body,
        responsabile: m.sent_by_name || (m.direction === "in" ? customerName : ""),
        dettagli: m.failed_reason || m.status,
      };
    });
  }, [timeline, customerName]);

  const exportFileBase = `diario-commessa-${orderId.slice(0, 8)}-${format(new Date(), "yyyy-MM-dd")}`;

  const handleExportCSV = useCallback(() => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      toast.error("Nessuna voce da esportare");
      return;
    }
    exportToCSV(rows, EXPORT_COLUMNS, `${exportFileBase}.csv`);
    toast.success(`CSV esportato — ${rows.length} voci`);
  }, [buildExportRows, exportFileBase]);

  const handleExportXLSX = useCallback(async () => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      toast.error("Nessuna voce da esportare");
      return;
    }
    await exportToXLSX(rows, EXPORT_COLUMNS, `${exportFileBase}.xlsx`);
    toast.success(`Excel esportato — ${rows.length} voci`);
  }, [buildExportRows, exportFileBase]);

  const handleExportPDF = useCallback(async () => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      toast.error("Nessuna voce da esportare");
      return;
    }
    try {
      const jsPDFModule = await import("jspdf");
      const jsPDF = jsPDFModule.default ?? (jsPDFModule as typeof jsPDFModule & { jsPDF?: typeof jsPDFModule.default }).jsPDF;
      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 42;
      let y = 48;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("Diario della Commessa", margin, y);
      y += 18;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Esportato il ${format(new Date(), "dd/MM/yyyy HH:mm")} - ${rows.length} voci`, margin, y);
      y += 24;

      rows.forEach((row, index) => {
        const block = [
          `${row.data} - ${row.tipo}`,
          `${row.origine}${row.responsabile ? ` - ${row.responsabile}` : ""}`,
          row.descrizione,
          row.dettagli ? `Dettagli: ${row.dettagli}` : "",
        ].filter(Boolean);
        const lines = block.flatMap((line) => doc.splitTextToSize(line, pageWidth - margin * 2));
        const blockHeight = lines.length * 12 + 16;
        if (y + blockHeight > pageHeight - 48) {
          doc.addPage();
          y = 48;
        }
        if (index % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin - 8, y - 12, pageWidth - margin * 2 + 16, blockHeight, "F");
        }
        doc.setFont("helvetica", "bold");
        doc.text(lines[0], margin, y);
        y += 12;
        doc.setFont("helvetica", "normal");
        lines.slice(1).forEach((line) => {
          // Guardia fine pagina anche dentro il blocco: un blocco più alto di una pagina non deve uscire dal foglio
          if (y > pageHeight - 48) {
            doc.addPage();
            y = 48;
          }
          doc.text(line, margin, y);
          y += 12;
        });
        y += 12;
      });

      doc.save(`${exportFileBase}.pdf`);
      toast.success(`PDF esportato — ${rows.length} voci`);
    } catch {
      toast.error("Errore durante l'export PDF");
    }
  }, [buildExportRows, exportFileBase]);

  // ── Filtra timeline ───────────────────────────────────────────────────────
  const filtered = timeline.filter((entry: DiaryEntry) => {
    if (filter === "all")      return true;
    if (filter === "eventi")   return entry.kind === "event";
    if (filter === "messaggi") return entry.kind === "message" && entry.data.channel !== "nota_interna";
    if (filter === "documenti") return entry.kind === "audit" && entry.data.audit_type === "documento";
    if (filter === "foto") return entry.kind === "audit" && entry.data.audit_type === "foto";
    if (filter === "campo") return entry.kind === "audit" && entry.data.audit_type === "rapportino";
    if (filter === "firme") return entry.kind === "audit" && entry.data.audit_type === "firma";
    if (filter === "assistenze") return entry.kind === "audit" && entry.data.audit_type === "assistenza";
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
            <SelectItem value="documenti">Documenti</SelectItem>
            <SelectItem value="foto">Foto</SelectItem>
            <SelectItem value="campo">Campo</SelectItem>
            <SelectItem value="firme">Firme</SelectItem>
            <SelectItem value="assistenze">Assistenze</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="note">Note interne</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="text-xs">{filtered.length} voci</Badge>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5 mr-1.5" />CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportXLSX}>
            <Download className="h-3.5 w-3.5 mr-1.5" />Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <Download className="h-3.5 w-3.5 mr-1.5" />PDF
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
                    : entry.kind === "audit"
                      ? <AuditEntry audit={entry.data} />
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
        onSend={onSend}
        onAddNote={onAddNote}
        isSending={isSending}
      />
    </div>
  );
}
