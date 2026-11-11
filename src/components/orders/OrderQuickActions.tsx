import { emailDaMostrare } from "@/lib/orders/nuovaCommessaProposte";
/**
 * OrderQuickActions — barra azioni rapide della commessa (OrderDetail).
 * Riduce l'attrito operativo: contatta il cliente (un solo popup per email,
 * WhatsApp, SMS, chiamata e PDF), fissa un appuntamento — senza uscire dalla pagina.
 *
 * Le azioni frequenti hanno etichette visibili su tutti gli schermi.
 * Le altre sono raccolte nel menu, senza duplicare le scorciatoie.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Phone, Receipt, Mail, FileText, CalendarPlus, Loader2, BellRing, UserCog, FolderOpen, StickyNote, PenLine, ChevronDown, Zap, ListPlus, Sparkles, MoreHorizontal, BookOpen, FileDown, Copy, Trash2, Pencil, HardHat, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useSoftphoneOptional } from "@/components/telephony/SoftphoneProvider";
import { QuickContactSendDialog, type QuickSendChannel } from "@/components/contacts/QuickContactSendDialog";
import { AnteprimaPdfDialog } from "@/components/orders/AnteprimaPdfDialog";
import { AppointmentDialog } from "@/components/appointments/AppointmentDialog";
import { useQueryClient } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";

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
  /** Ponte imperativo: l'alert "rata scaduta" di OrderDetail apre il sollecito
   *  precompilato senza duplicarne la logica (ref riempita a ogni render). */
  sollecitoRef?: React.MutableRefObject<(() => void) | null>;
  /** Apre il popup "Responsabile commessa" (chi segue la commessa). */
  onOpenOps?: () => void;
  /** Slot per il bottone "Chiedi a Silvio" contestuale (renderizzato in coda alla barra). */
  askSilvio?: React.ReactNode;
  /**
   * Telefono (06/10/2026): solo le icone di attività, documenti e «Altro»,
   * da mettere nella fila di «Registra incasso» invece di una fila a parte.
   */
  inline?: boolean;
  /** Apre il popup "Documenti e file" della commessa. */
  onOpenFiles?: () => void;
  /** Apre il popup "Note interne" collaborative (thread + chat team di commessa). */
  onOpenNotes?: () => void;
  /** Apre il popup "Firma digitale" (invio/gestione firma cliente). */
  onOpenFirma?: () => void;
  /** Da telefono «Modifica» sta nel menu: dal computer è un bottone in testata. */
  onModifica?: () => void;
  onOpenRegistro?: () => void;
  onScaricaPdf?: () => void;
  scaricaPdfBusy?: boolean;
  onDuplica?: () => void;
  onElimina?: () => void;
  onCreateInvoice?: () => void;
  invoiceDisabled?: boolean;
  invoiceHint?: string;
  onCreateTask?: () => void;
  /** «Affida e manda il contratto» (11/11/2026): voci alle ditte e contratto, da qualunque scheda della commessa. */
  onAffidaDitte?: () => void;
  onApplyPlaybook?: () => void;
  applyingPlaybook?: boolean;
  playbookLabel?: string;
}

const fmtEur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: true }).format(n);

type Attachment = { name: string; size: number; mime: string; storage_path: string };

/** Descrittore di una singola azione rapida (guida sia le pill inline sia il menu). */
type QuickAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  iconClass: string;
  onClick: () => void;
  group: "comunica" | "gestisci" | "pianifica" | "elimina";
  disabled?: boolean;
  /** Motivo dell'indisponibilità o suggerimento (title/tooltip). */
  hint?: string;
  /** Spinner al posto dell'icona (azioni async). */
  busy?: boolean;
  /** Tinta d'accento: "warning" per il sollecito, "danger" per l'eliminazione. */
  tone?: "default" | "warning" | "danger";
};

export function OrderQuickActions({
  orderId, orderCode, customer, workAddress, workCity, workProvince, getPdfBlob, paymentDue, onOpenOps, onOpenFiles, onOpenNotes, onOpenFirma, askSilvio, sollecitoRef,
  onCreateTask, onApplyPlaybook, applyingPlaybook = false, playbookLabel,
  onCreateInvoice, invoiceDisabled = false, invoiceHint, inline = false,
  onModifica, onOpenRegistro, onScaricaPdf, scaricaPdfBusy = false, onDuplica, onElimina, onAffidaDitte,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const softphone = useSoftphoneOptional();
  const isMobile = useIsMobile();

  const hasPhone = !!customer?.phone && customer.phone.replace(/\D/g, "").length >= 6;
  const customerEmail = emailDaMostrare(customer?.email);
  const hasEmail = !!customerEmail && customerEmail.includes("@");

  const [quickSend, setQuickSend] = useState<{
    open: boolean;
    channel: QuickSendChannel;
    prefill?: { smsText?: string; emailSubject?: string; emailBody?: string; waText?: string };
    attachments?: Attachment[];
  }>({ open: false, channel: "whatsapp" });
  const [apptOpen, setApptOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfDaInviare, setPdfDaInviare] = useState<{ blob: Blob; filename: string } | null>(null);

  const openContact = () =>
    setQuickSend({ open: true, channel: hasEmail ? "email" : "whatsapp", prefill: undefined, attachments: undefined });

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

  // Riempita a ogni render: openSollecito cambia identità.
  useEffect(() => {
    if (sollecitoRef) sollecitoRef.current = openSollecito;
    return () => {
      if (sollecitoRef) sollecitoRef.current = null;
    };
  });

  const handleCall = () => {
    if (!customer?.phone) return;
    setQuickSend((s) => ({ ...s, open: false }));
    if (softphone) softphone.startCall(customer.phone, { name: customer.name, contactId: customer.id ?? undefined });
    else window.open(`tel:${customer.phone}`, "_self");
  };

  // Il PDF per il cliente si guarda prima: parte solo dopo l'anteprima.
  const handleSendPdf = async () => {
    if (!user?.id) { toast.error("Sessione non valida"); return; }
    setPdfBusy(true);
    try {
      const res = await getPdfBlob();
      if (!res) return; // il toast l'ha già mostrato l'hook PDF
      // Il popup si riapre da solo: col PDF allegato, o come stava se si annulla.
      setQuickSend((s) => ({ ...s, open: false }));
      setPdfDaInviare(res);
    } finally {
      setPdfBusy(false);
    }
  };

  const allegaPdf = async () => {
    if (!user?.id || !pdfDaInviare) return;
    setPdfBusy(true);
    try {
      const res = pdfDaInviare;
      const safe = res.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
      const storagePath = `${user.id}/ordini/${crypto.randomUUID()}-${safe}`;
      const { error } = await supabase.storage
        .from("email-attachments")
        .upload(storagePath, res.blob, { contentType: "application/pdf", upsert: false });
      if (error) { toast.error("Caricamento del PDF fallito"); return; }
      setPdfDaInviare(null);
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
    // Stessi callback e dialoghi della commessa, accessibili da tutte le tab.
    ...(onCreateTask ? [{ id: "task", label: "Nuova attività", icon: ListPlus, iconClass: "text-primary", onClick: onCreateTask, group: "pianifica" as const }] : []),
    ...(onApplyPlaybook ? [{ id: "playbook", label: applyingPlaybook ? "Applico…" : "Applica flusso", icon: Sparkles, iconClass: "text-primary", onClick: onApplyPlaybook, group: "pianifica" as const, disabled: applyingPlaybook, busy: applyingPlaybook, hint: `Crea le attività del flusso ${playbookLabel ?? "della commessa"}` }] : []),
    // Comunica col cliente: email, WhatsApp, SMS, chiamata e PDF stanno nel popup.
    { id: "contatta", label: "Contatta", icon: Mail, iconClass: "text-violet-600", onClick: openContact, group: "comunica", disabled: !hasPhone && !hasEmail, hint: hasPhone || hasEmail ? "Email, WhatsApp, SMS, chiamata o invio del PDF" : "Telefono ed email del cliente mancanti" },
    ...(paymentDue && paymentDue.amount > 0 && (hasPhone || hasEmail)
      ? [{ id: "sollecito", label: "Sollecita pagamento", icon: BellRing, iconClass: "text-amber-600", onClick: openSollecito, group: "comunica" as const, tone: "warning" as const, hint: `Sollecita il pagamento di ${fmtEur(paymentDue.amount)}` }]
      : []),
    // Gestisci commessa
    ...(onAffidaDitte ? [{ id: "affida", label: "Affida e manda contratto", icon: HardHat, iconClass: "text-orange-700", onClick: onAffidaDitte, group: "gestisci" as const, hint: "Voci alle ditte, prezzi e contratto di subappalto in un passaggio" }] : []),
    ...(isMobile && onModifica ? [{ id: "modifica", label: "Modifica commessa", icon: Pencil, iconClass: "text-blue-950", onClick: onModifica, group: "gestisci" as const }] : []),
    ...(onOpenFiles ? [{ id: "files", label: "Documenti", icon: FolderOpen, iconClass: "text-amber-600", onClick: onOpenFiles, group: "gestisci" as const, hint: "Tutti i file: PDF, fatture, allegati commessa e schede articoli" }] : []),
    ...(onOpenFirma ? [{ id: "firma", label: "Firma", icon: PenLine, iconClass: "text-blue-600", onClick: onOpenFirma, group: "gestisci" as const, hint: "Firma digitale: invia il documento al cliente e gestisci la firma" }] : []),
    ...(onOpenNotes ? [{ id: "notes", label: "Note interne", icon: StickyNote, iconClass: "text-violet-600", onClick: onOpenNotes, group: "gestisci" as const, hint: "Note interne e chat di team sulla commessa (@menziona i colleghi)" }] : []),
    ...(onOpenOps ? [{ id: "ops", label: "Responsabile", icon: UserCog, iconClass: "text-primary", onClick: onOpenOps, group: "gestisci" as const, hint: "Assegna chi segue questa commessa" }] : []),
    { id: "appt", label: "Appuntamento", icon: CalendarPlus, iconClass: "text-indigo-600", onClick: () => setApptOpen(true), group: "gestisci", hint: "Fissa un appuntamento/sopralluogo/posa per questa commessa" },
    ...(onCreateInvoice ? [{ id: "invoice", label: "Crea fattura", icon: Receipt, iconClass: "text-orange-700", onClick: onCreateInvoice, group: "gestisci" as const, disabled: invoiceDisabled, hint: invoiceHint ?? "Prepara una fattura collegata alla commessa" }] : []),
    ...(onOpenRegistro ? [{ id: "registro", label: "Registro attività", icon: BookOpen, iconClass: "text-orange-600", onClick: onOpenRegistro, group: "gestisci" as const, hint: "Chi ha fatto cosa su questa commessa" }] : []),
    // Niente export su telefono.
    ...(!isMobile && onScaricaPdf ? [{ id: "scarica", label: "Scarica PDF", icon: FileDown, iconClass: "text-blue-950", onClick: onScaricaPdf, group: "gestisci" as const, disabled: scaricaPdfBusy, busy: scaricaPdfBusy }] : []),
    ...(onDuplica ? [{ id: "duplica", label: "Duplica", icon: Copy, iconClass: "text-blue-950", onClick: onDuplica, group: "gestisci" as const }] : []),
    ...(onElimina ? [{ id: "elimina", label: "Elimina", icon: Trash2, iconClass: "text-red-600", onClick: onElimina, group: "elimina" as const, tone: "danger" as const }] : []),
  ];

  // Sul telefono una sola riga: attività, documenti, menu. Stessi callback,
  // nessuna funzione rimossa: contatti, fattura e appuntamento stanno nel menu.
  // Al computer tre azioni: documenti e appuntamenti hanno già i loro riquadri nella Panoramica.
  const primaryActions = (isMobile ? ["task", "files"] : ["task", "contatta", "invoice"]).flatMap((id) => actions.filter((a) => a.id === id));
  // Nel menu solo ciò che non è già sulla barra: un gruppo vuoto non mostra il titolo.
  const nelMenu = (gruppo: QuickAction["group"]) => actions.filter((a) => a.group === gruppo && !primaryActions.some((p) => p.id === a.id));
  const comunica = nelMenu("comunica");
  const gestisci = nelMenu("gestisci");
  const pianifica = nelMenu("pianifica");
  const distruttive = nelMenu("elimina");

  const renderMenuItem = (a: QuickAction) => {
    const Icon = a.icon;
    return (
      <DropdownMenuItem
        key={a.id}
        disabled={a.disabled}
        aria-label={a.label}
        aria-description={a.disabled ? a.hint : undefined}
        onSelect={a.onClick}
        className={cn("min-h-11 gap-2.5 cursor-pointer", a.tone === "warning" && "text-amber-700 focus:text-amber-700", a.tone === "danger" && "text-red-600 focus:text-red-700")}
      >
        {a.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className={cn("h-4 w-4", a.iconClass)} />}
        <span className="min-w-0"><span className="block">{a.label}</span>{a.disabled && a.hint && <span className="block text-[11px] font-normal">{a.hint}</span>}</span>
      </DropdownMenuItem>
    );
  };

  return (
    <div role="region" aria-label="Azioni rapide commessa" className={inline ? "flex shrink-0 items-center" : "bg-white border-b border-gray-100 px-3 sm:px-6 py-2"}>
      <div className={inline ? "flex items-center gap-1.5" : "flex items-center gap-1.5 md:flex-wrap md:gap-2"}>
        {primaryActions.map(a => {
          const Icon = a.icon;
          // In fila con «Registra incasso» sono icone: una sola azione principale per riga.
          if (inline) return <Button key={a.id} variant="outline" size="icon" onClick={a.onClick} disabled={a.disabled}
            title={a.label} aria-label={a.label}
            className={cn("tap-compact h-9 w-9 shrink-0 border-slate-300 bg-white hover:bg-blue-50", a.id === "task" ? "text-orange-700" : "text-blue-950")}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </Button>;
          // Lo span tiene il suggerimento anche a bottone spento.
          return <span key={a.id} title={a.hint ?? a.label} className="flex min-w-0 flex-1 md:flex-none">
            <Button variant="outline" onClick={a.onClick} disabled={a.disabled} aria-label={a.label}
            className={cn("h-11 min-h-11 w-full min-w-0 gap-1.5 whitespace-nowrap rounded-lg border-slate-300 px-2 text-xs font-semibold md:h-auto md:flex-none md:gap-2 md:px-3 md:py-2 md:text-sm",
              a.id === "task" ? "border-orange-700 bg-orange-700 text-white hover:bg-orange-800 hover:text-white" : "bg-white text-blue-950 hover:bg-blue-50")}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{isMobile && a.id === "task" ? "Attività" : a.label}</span>
          </Button></span>;
        })}

        {/* Azioni secondarie raggruppate, uguali su desktop e mobile. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {inline ? (
              <Button variant="outline" size="icon" aria-label="Altre azioni" title="Altre azioni" className="tap-compact h-9 w-9 shrink-0 border-slate-300 bg-white text-blue-950">
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : (
            <Button variant="outline" size="sm" aria-label="Altre azioni" className="group h-11 min-h-11 gap-1.5 rounded-lg border-slate-300 px-2 text-xs font-semibold text-blue-950 md:gap-2 md:px-3 md:text-sm">
              {!isMobile && <Zap className="h-3.5 w-3.5 text-primary" />}
              <span>{isMobile ? "Altro" : "Altre azioni"}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </Button>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            // collisionPadding: lascia respiro dalla bottom-nav mobile;
            // max-h + overflow: se le azioni non entrano, il menu scrolla
            // (prima le ultime finivano sotto la barra e non erano raggiungibili).
            collisionPadding={{ top: 16, right: 16, bottom: isMobile ? 96 : 16, left: 16 }}
            className="w-60 max-h-[min(60vh,26rem)] overflow-y-auto overscroll-contain"
          >
            {pianifica.length > 0 && <>
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Flusso di lavoro
              </DropdownMenuLabel>
              {pianifica.map(renderMenuItem)}
              <DropdownMenuSeparator />
            </>}
            {comunica.length > 0 && <>
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Comunica col cliente
              </DropdownMenuLabel>
              {comunica.map(renderMenuItem)}
              <DropdownMenuSeparator />
            </>}
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Gestisci commessa
            </DropdownMenuLabel>
            {gestisci.map(renderMenuItem)}
            {distruttive.length > 0 && <>
              <DropdownMenuSeparator />
              {distruttive.map(renderMenuItem)}
            </>}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Silvio: CTA AI distinta, spinta a destra su desktop */}
        {/* Mobile no: c'è già il bottone Silvio al centro della barra in basso. */}
        {!isMobile && askSilvio && <div className="xl:ml-auto">{askSilvio}</div>}
      </div>

      <AnteprimaPdfDialog
        file={pdfDaInviare}
        titolo="PDF per il cliente"
        descrizione="Questo è il documento che riceverà: senza costi, margini, fornitori e dati interni. Lo allego all'email solo se confermi."
        azione="Allega all'email"
        inCorso={pdfBusy}
        onConferma={() => { void allegaPdf(); }}
        onChiudi={() => { setPdfDaInviare(null); setQuickSend((s) => ({ ...s, open: true })); }}
      />
      {quickSend.open && (hasPhone || hasEmail) && customer && (
        <QuickContactSendDialog
          open={quickSend.open}
          onOpenChange={(v) => setQuickSend((s) => ({ ...s, open: v }))}
          contactId={customer.id ?? null}
          name={customer.name}
          phone={customer.phone}
          email={customerEmail}
          context={`Commessa ${orderCode ?? orderId}`}
          defaultChannel={quickSend.channel}
          prefill={quickSend.prefill}
          initialAttachments={quickSend.attachments}
          orderId={orderId}
          azioniExtra={<>
            {hasPhone && <Button variant="outline" size="sm" onClick={handleCall} className="h-8 gap-1.5 px-2 text-xs" title={`Chiama ${customer.phone}`}><Phone className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> Chiama</Button>}
            {hasEmail && <Button variant="outline" size="sm" disabled={pdfBusy} onClick={() => { void handleSendPdf(); }} className="h-8 gap-1.5 px-2 text-xs" title="Guarda il PDF per il cliente e allegalo all'email">{pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <FileText className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />} Invia PDF</Button>}
          </>}
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
          defaultAppointmentType="sopralluogo"
          riferimentoTitolo={orderCode ?? "Commessa"}
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
