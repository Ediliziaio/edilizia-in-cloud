/**
 * OrderQuickActions — barra azioni rapide della commessa (OrderDetail).
 * Riduce l'attrito operativo: contatta il cliente (chiama/WhatsApp/email),
 * invia il PDF della commessa, fissa un appuntamento — senza uscire dalla pagina.
 *
 * UX (2026-07): le azioni erano ~11 pill che andavano a capo su 2 righe
 * sprecando spazio. Ora sono data-driven: su schermi larghi (xl) le più usate
 * restano inline come scorciatoia, tutto il resto vive in un dropdown animato
 * "Azioni" raggruppato (Comunica / Gestisci). Su mobile/iPad c'è solo il
 * dropdown compatto + "Chiedi a Silvio" → una sola riga a ogni breakpoint.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Phone, MessageSquare, Mail, FileText, CalendarPlus, Loader2, BellRing, UserCog, FolderOpen, StickyNote, PenLine, ChevronDown, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useSoftphoneOptional } from "@/components/telephony/SoftphoneProvider";
import { QuickContactSendDialog, type QuickSendChannel } from "@/components/contacts/QuickContactSendDialog";
import { AppointmentDialog } from "@/components/appointments/AppointmentDialog";
import { useQueryClient } from "@tanstack/react-query";

interface Customer {
  id?: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
}

interface Props {
  orderId: string;
  orderCode: string | null;
  companyId: string;
  customer: Customer | null;
  workAddress?: string | null;
  workCity?: string | null;
  workProvince?: string | null;
  /** Genera il PDF della commessa come blob (fornito da OrderDetail). */
  getPdfBlob: () => Promise<{ blob: Blob; filename: string } | null>;
  /** Importo/scadenza da sollecitare (prossima rata non pagata). */
  paymentDue?: { amount: number; dueDate?: string | null; label?: string | null } | null;
  /** Apre il popup "Responsabile commessa" (chi segue la commessa). */
  onOpenOps?: () => void;
  /** Slot per il bottone "Chiedi a Silvio" contestuale (renderizzato in coda alla barra). */
  askSilvio?: React.ReactNode;
  /** Apre il popup "Documenti e file" della commessa. */
  onOpenFiles?: () => void;
  /** Apre il popup "Note interne" collaborative (thread + chat team di commessa). */
  onOpenNotes?: () => void;
  /** Apre il popup "Firma digitale" (invio/gestione firma cliente). */
  onOpenFirma?: () => void;
}

const fmtEur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);

type Attachment = { name: string; size: number; mime: string; storage_path: string };

/** Descrittore di una singola azione rapida (guida sia le pill inline sia il menu). */
type QuickAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  iconClass: string;
  onClick: () => void;
  group: "comunica" | "gestisci";
  disabled?: boolean;
  /** Motivo dell'indisponibilità o suggerimento (title/tooltip). */
  hint?: string;
  /** Mostrata inline (fuori dal dropdown) sui breakpoint larghi. */
  primary?: boolean;
  /** Spinner al posto dell'icona (azioni async). */
  busy?: boolean;
  /** Tinta d'accento per azioni "attenzione" (es. sollecito). */
  tone?: "default" | "warning";
};

export function OrderQuickActions({
  orderId, orderCode, companyId, customer, workAddress, workCity, workProvince, getPdfBlob, paymentDue, onOpenOps, onOpenFiles, onOpenNotes, onOpenFirma, askSilvio,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const softphone = useSoftphoneOptional();

  const hasPhone = !!customer?.phone && customer.phone.replace(/\D/g, "").length >= 6;
  const hasEmail = !!customer?.email && customer.email.includes("@");

  const [quickSend, setQuickSend] = useState<{
    open: boolean;
    channel: QuickSendChannel;
    prefill?: { smsText?: string; emailSubject?: string; emailBody?: string; waText?: string };
    attachments?: Attachment[];
  }>({ open: false, channel: "whatsapp" });
  const [apptOpen, setApptOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const openContact = (channel: QuickSendChannel) =>
    setQuickSend({ open: true, channel, prefill: undefined, attachments: undefined });

  const openSollecito = () => {
    if (!paymentDue || paymentDue.amount <= 0) return;
    const dueStr = paymentDue.dueDate ? ` con scadenza ${new Date(paymentDue.dueDate).toLocaleDateString("it-IT")}` : "";
    const lbl = paymentDue.label ? `(${paymentDue.label}) ` : "";
    const msg = `Buongiorno, le ricordiamo gentilmente il pagamento ${lbl}di ${fmtEur(paymentDue.amount)} relativo alla commessa ${orderCode ?? ""}${dueStr}. Grazie.`;
    setQuickSend({
      open: true,
      channel: hasPhone ? "whatsapp" : "email",
      prefill: { waText: msg, smsText: msg, emailSubject: `Promemoria pagamento — ${orderCode ?? "commessa"}`, emailBody: msg },
      attachments: undefined,
    });
  };

  const handleCall = () => {
    if (!customer?.phone) return;
    if (softphone) softphone.startCall(customer.phone, { name: customer.name, contactId: customer.id ?? undefined });
    else window.open(`tel:${customer.phone}`, "_self");
  };

  const handleSendPdf = async () => {
    if (!user?.id) { toast.error("Sessione non valida"); return; }
    setPdfBusy(true);
    try {
      const res = await getPdfBlob();
      if (!res) return; // toast già mostrato dall'hook PDF
      const safe = res.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
      const storagePath = `${user.id}/ordini/${crypto.randomUUID()}-${safe}`;
      const { error } = await supabase.storage
        .from("email-attachments")
        .upload(storagePath, res.blob, { contentType: "application/pdf", upsert: false });
      if (error) { toast.error("Caricamento del PDF fallito"); return; }
      setQuickSend({
        open: true,
        channel: "email",
        prefill: {
          emailSubject: `Documenti commessa ${orderCode ?? ""}`.trim(),
          emailBody: `Buongiorno,\nin allegato trova il riepilogo della commessa ${orderCode ?? ""}.\nRestiamo a disposizione per qualsiasi chiarimento.`,
        },
        attachments: [{ name: res.filename, size: res.blob.size, mime: "application/pdf", storage_path: storagePath }],
      });
    } finally {
      setPdfBusy(false);
    }
  };

  // ── Catalogo azioni (l'ordine è quello mostrato nel menu) ──────────────
  const actions: QuickAction[] = [
    // Comunica col cliente
    { id: "call", label: "Chiama", icon: Phone, iconClass: "text-emerald-600", onClick: handleCall, group: "comunica", disabled: !hasPhone, hint: hasPhone ? `Chiama ${customer?.phone}` : "Telefono cliente mancante" },
    { id: "whatsapp", label: "WhatsApp", icon: MessageSquare, iconClass: "text-emerald-600", onClick: () => openContact("whatsapp"), group: "comunica", primary: true, disabled: !hasPhone, hint: hasPhone ? "Invia WhatsApp/SMS" : "Telefono cliente mancante" },
    { id: "email", label: "Email", icon: Mail, iconClass: "text-violet-600", onClick: () => openContact("email"), group: "comunica", primary: true, disabled: !hasEmail, hint: hasEmail ? "Invia email" : "Email cliente mancante" },
    { id: "pdf", label: "Invia PDF", icon: FileText, iconClass: "text-blue-600", onClick: () => { void handleSendPdf(); }, group: "comunica", disabled: !hasEmail || pdfBusy, busy: pdfBusy, hint: hasEmail ? "Genera e invia il PDF al cliente via email" : "Email cliente mancante" },
    ...(paymentDue && paymentDue.amount > 0 && (hasPhone || hasEmail)
      ? [{ id: "sollecito", label: "Sollecita pagamento", icon: BellRing, iconClass: "text-amber-600", onClick: openSollecito, group: "comunica" as const, tone: "warning" as const, hint: `Sollecita il pagamento di ${fmtEur(paymentDue.amount)}` }]
      : []),
    // Gestisci commessa
    ...(onOpenOps ? [{ id: "ops", label: "Responsabile", icon: UserCog, iconClass: "text-primary", onClick: onOpenOps, group: "gestisci" as const, hint: "Assegna chi segue questa commessa" }] : []),
    ...(onOpenFiles ? [{ id: "files", label: "Documenti", icon: FolderOpen, iconClass: "text-amber-600", onClick: onOpenFiles, group: "gestisci" as const, primary: true, hint: "Tutti i file: PDF, fatture, allegati commessa e schede articoli" }] : []),
    ...(onOpenNotes ? [{ id: "notes", label: "Note interne", icon: StickyNote, iconClass: "text-violet-600", onClick: onOpenNotes, group: "gestisci" as const, hint: "Note interne e chat di team sulla commessa (@menziona i colleghi)" }] : []),
    ...(onOpenFirma ? [{ id: "firma", label: "Firma", icon: PenLine, iconClass: "text-blue-600", onClick: onOpenFirma, group: "gestisci" as const, hint: "Firma digitale: invia il documento al cliente e gestisci la firma" }] : []),
    { id: "appt", label: "Appuntamento", icon: CalendarPlus, iconClass: "text-indigo-600", onClick: () => setApptOpen(true), group: "gestisci", primary: true, hint: "Fissa un appuntamento/sopralluogo/posa per questa commessa" },
  ];

  const primaryActions = actions.filter((a) => a.primary);
  const comunica = actions.filter((a) => a.group === "comunica");
  const gestisci = actions.filter((a) => a.group === "gestisci");

  const renderMenuItem = (a: QuickAction) => {
    const Icon = a.icon;
    return (
      <DropdownMenuItem
        key={a.id}
        disabled={a.disabled}
        onSelect={a.onClick}
        // Le azioni "primary" sono già inline su xl → nel menu le nascondiamo lì
        // per evitare doppioni (restano visibili sotto xl).
        className={cn("gap-2.5 cursor-pointer", a.primary && "xl:hidden", a.tone === "warning" && "text-amber-700 focus:text-amber-700")}
      >
        {a.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className={cn("h-4 w-4", a.iconClass)} />}
        <span>{a.label}</span>
      </DropdownMenuItem>
    );
  };

  return (
    <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mr-1 hidden sm:inline">
          Azioni rapide
        </span>

        {/* Scorciatoie inline (solo desktop largo): le azioni più usate */}
        <div className="hidden xl:flex items-center gap-1.5">
          {primaryActions.map((a) => {
            const Icon = a.icon;
            return (
              <Button
                key={a.id}
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={a.onClick}
                disabled={a.disabled}
                title={a.hint}
              >
                {a.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className={cn("h-3.5 w-3.5", a.iconClass)} />}
                {a.label}
              </Button>
            );
          })}
        </div>

        {/* Dropdown "Azioni" — animato (fade/zoom/slide dallo shadcn) e raggruppato.
            Contiene TUTTO sotto xl; su xl mostra solo le azioni non-primary. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 group">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <span className="xl:hidden">Azioni</span>
              <span className="hidden xl:inline">Altre azioni</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Comunica col cliente
            </DropdownMenuLabel>
            {comunica.map(renderMenuItem)}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Gestisci commessa
            </DropdownMenuLabel>
            {gestisci.map(renderMenuItem)}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Silvio: CTA AI distinta, spinta a destra su desktop */}
        {askSilvio && <div className="xl:ml-auto">{askSilvio}</div>}
      </div>

      {(hasPhone || hasEmail) && customer && (
        <QuickContactSendDialog
          open={quickSend.open}
          onOpenChange={(v) => setQuickSend((s) => ({ ...s, open: v }))}
          contactId={customer.id ?? null}
          name={customer.name}
          phone={customer.phone}
          email={customer.email}
          context={`Commessa ${orderCode ?? orderId}`}
          defaultChannel={quickSend.channel}
          prefill={quickSend.prefill}
          initialAttachments={quickSend.attachments}
          orderId={orderId}
          onSent={() => {
            queryClient.invalidateQueries({ queryKey: ["order-messages", orderId] });
            queryClient.invalidateQueries({ queryKey: ["reg-sms"] });
            queryClient.invalidateQueries({ queryKey: ["reg-email-out"] });
          }}
        />
      )}

      {apptOpen && (
        <AppointmentDialog
          open={apptOpen}
          onOpenChange={setApptOpen}
          defaultOrderId={orderId}
          showOrderSelect={false}
          defaultTitle={`Sopralluogo/Posa — ${orderCode ?? "Commessa"}`}
          defaultAddress={workAddress ?? null}
          defaultCity={workCity ?? null}
          defaultProvince={workProvince ?? null}
          onSaved={() => {
            setApptOpen(false);
            queryClient.invalidateQueries({ queryKey: ["appointments"] });
            queryClient.invalidateQueries({ queryKey: ["linked-appointments", orderId] });
            toast.success("Appuntamento creato");
          }}
        />
      )}
    </div>
  );
}

export default OrderQuickActions;
