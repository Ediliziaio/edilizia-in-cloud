/**
 * OrderQuickActions — barra azioni rapide della commessa (OrderDetail).
 * Riduce l'attrito operativo: contatta il cliente (chiama/WhatsApp/email),
 * invia il PDF della commessa, fissa un appuntamento — senza uscire dalla pagina.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Phone, MessageSquare, Mail, FileText, CalendarPlus, Loader2, BellRing, ClipboardList, FolderOpen, StickyNote } from "lucide-react";
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
  /** Apre il popup "Operatività commessa" (prossima azione/responsabile/checklist). */
  onOpenOps?: () => void;
  /** Apre il popup "Documenti e file" della commessa. */
  onOpenFiles?: () => void;
  /** Apre il popup "Note interne" collaborative (thread + chat team di commessa). */
  onOpenNotes?: () => void;
}

const fmtEur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);

type Attachment = { name: string; size: number; mime: string; storage_path: string };

export function OrderQuickActions({
  orderId, orderCode, companyId, customer, workAddress, workCity, workProvince, getPdfBlob, paymentDue, onOpenOps, onOpenFiles, onOpenNotes,
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

  return (
    <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mr-1 hidden sm:inline">
          Azioni rapide
        </span>
        {onOpenOps && (
          <Button variant="outline" size="sm" className="h-8 gap-1.5 border-primary/40 text-primary hover:bg-primary/5"
            onClick={onOpenOps}
            title="Prossima azione, responsabile e checklist fasi">
            <ClipboardList className="h-3.5 w-3.5" /> Operatività
          </Button>
        )}
        {onOpenFiles && (
          <Button variant="outline" size="sm" className="h-8 gap-1.5"
            onClick={onOpenFiles}
            title="Tutti i file: PDF, fatture, allegati commessa e schede articoli">
            <FolderOpen className="h-3.5 w-3.5 text-amber-600" /> Documenti
          </Button>
        )}
        {onOpenNotes && (
          <Button variant="outline" size="sm" className="h-8 gap-1.5"
            onClick={onOpenNotes}
            title="Note interne e chat di team sulla commessa (@menziona i colleghi)">
            <StickyNote className="h-3.5 w-3.5 text-violet-600" /> Note interne
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleCall} disabled={!hasPhone}
          title={hasPhone ? `Chiama ${customer?.phone}` : "Telefono cliente mancante"}>
          <Phone className="h-3.5 w-3.5 text-emerald-600" /> Chiama
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => openContact("whatsapp")} disabled={!hasPhone}
          title={hasPhone ? "Invia WhatsApp/SMS" : "Telefono cliente mancante"}>
          <MessageSquare className="h-3.5 w-3.5 text-emerald-600" /> WhatsApp
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => openContact("email")} disabled={!hasEmail}
          title={hasEmail ? "Invia email" : "Email cliente mancante"}>
          <Mail className="h-3.5 w-3.5 text-violet-600" /> Email
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleSendPdf} disabled={!hasEmail || pdfBusy}
          title={hasEmail ? "Genera e invia il PDF al cliente via email" : "Email cliente mancante"}>
          {pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5 text-blue-600" />} Invia PDF
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setApptOpen(true)}
          title="Fissa un appuntamento/sopralluogo/posa per questa commessa">
          <CalendarPlus className="h-3.5 w-3.5 text-indigo-600" /> Appuntamento
        </Button>
        {paymentDue && paymentDue.amount > 0 && (hasPhone || hasEmail) && (
          <Button variant="outline" size="sm"
            className="h-8 gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
            onClick={openSollecito}
            title={`Sollecita il pagamento di ${fmtEur(paymentDue.amount)}`}>
            <BellRing className="h-3.5 w-3.5" /> Sollecita pagamento
          </Button>
        )}
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
