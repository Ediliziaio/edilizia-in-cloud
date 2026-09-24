import { memo, useState, useMemo, forwardRef } from "react";
import { differenceInDays } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useSortable } from "@dnd-kit/sortable";
import { Phone, Mail, Tag, StickyNote, Calendar, ListTodo, Folder, Trash2, UserCircle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { DealHealthBadge } from "./DealHealthBadge";
import { RichiestaRipetutaBadge } from "./RichiestaRipetutaBadge";
import { AnteprimaAppunti } from "./AnteprimaAppunti";
import { AnteprimaAppuntamenti } from "./AnteprimaAppuntamenti";
import { AnteprimaAttivita } from "./AnteprimaAttivita";
import { badgeAppuntamenti, badgeAttivita, leggiAgenda } from "@/lib/opportunitaAgenda";
import { LeadTemperatureBadge } from "@/components/marketing/LeadTemperatureBadge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useCardFieldPreferences, type CardLayout } from "@/hooks/useCardFieldPreferences";
import { useMarketingRoutePrefix } from "@/hooks/useMarketingRoutePrefix";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface OpportunityCardProps {
  opportunity: any;
  onClick?: () => void;
  onOpenTab?: (tab: string) => void;
  onDelete?: (id: string) => void;
  isOverlay?: boolean;
  selected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  canEdit?: boolean;
  /** Soglia di stallo della fase (giorni): oltre, il badge cambia colore. */
  sogliaStalloGg?: number;
}

export const OpportunityCard = memo(forwardRef<HTMLDivElement, OpportunityCardProps>(function OpportunityCard({ opportunity, onClick, onOpenTab, onDelete, isOverlay, selected, onSelect, canEdit = true, sogliaStalloGg = 14 }, _ref) {
  const navigate = useNavigate();
  const routePrefix = useMarketingRoutePrefix();
  const contact = opportunity.marketing_contacts;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { activeFields, layout, isFieldActive } = useCardFieldPreferences();

  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: opportunity.id,
    // La scheda viaggia col trascinamento: ogni colonna carica le sue, e il
    // kanban non ha più un elenco unico dove cercarla.
    data: { type: "opportunity", stageId: opportunity.stage_id, opp: opportunity },
    disabled: isOverlay || !canEdit,
  });

  // Card in lista FERME durante il drag: niente transform/transition di riordino
  // (con le colonne virtualizzate causavano scatti e card che "saltavano"). Il
  // feedback visivo è dato dalla DragOverlay (card "in volo") + l'highlight della
  // colonna di destinazione; lo spostamento reale avviene con l'update ottimistico
  // al rilascio → trascinamento fluido da una fase all'altra.
  const style = undefined;

  const fullName = contact
    ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
    : opportunity.name;
  const cityPart = contact?.city ? ` - ${contact.city}` : "";
  const displayName = `${fullName}${cityPart}` || opportunity.name;
  const stageChangedAt = opportunity.stage_changed_at || opportunity.updated_at || null;
  const daysInStage = stageChangedAt ? Math.max(0, differenceInDays(new Date(), new Date(stageChangedAt))) : null;

  // Avatar di chi segue l'opportunità: il VENDITORE ha la precedenza; se non
  // c'è, si mostra il CALL CENTER (con un colore diverso, per distinguerli a
  // colpo d'occhio). Prima un'opportunità affidata solo al call center restava
  // «Non assegnato» anche dopo l'assegnazione.
  const venditore = opportunity.assigned_profile;
  const callCenter = opportunity.call_center_profile;
  const persona = venditore ?? callCenter ?? null;
  const personaDelCallCenter = !venditore && !!callCenter;
  const nomeDi = (p: { first_name?: string | null; last_name?: string | null } | null | undefined) =>
    p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() : "";
  const assignedInitials = persona
    ? `${persona.first_name?.[0] || ""}${persona.last_name?.[0] || ""}`.toUpperCase() || null
    : null;
  const assignedFullName = [
    venditore ? `Venditore: ${nomeDi(venditore)}` : null,
    callCenter ? `Call center: ${nomeDi(callCenter)}` : null,
  ].filter(Boolean).join(" · ") || null;

  // Tags
  const tags: string[] = opportunity.tags || [];

  // Appuntamenti e attività sono due cose: due icone. Il calendario conta gli
  // appuntamenti in programma (una scheda senza conteggio, aperta da link,
  // tiene il vecchio segno); le attività quelle da fare, rosse se una è scaduta.
  const agenda = leggiAgenda(opportunity.agenda);
  const numeroAppuntamenti = badgeAppuntamenti(agenda) ?? (opportunity.next_appointment ? 1 : null);
  const numeroAttivita = badgeAttivita(agenda);

  // Il riquadro di Appunti, Appuntamenti e Attività si apre sopra la barra,
  // largo quanto la scheda e allineato ai suoi bordi: non esce né a destra né
  // a sinistra sopra le colonne accanto (Florin, 24/09/2026). Si misura quando
  // il mouse arriva sull'icona, perché ogni icona è in un punto diverso.
  const [riquadro, setRiquadro] = useState<{ spostamento: number; larghezza: number } | null>(null);
  const misuraRiquadro = (bottone: HTMLElement) => {
    const scheda = bottone.closest("[data-scheda-opportunita]");
    if (!scheda) return;
    const s = scheda.getBoundingClientRect();
    const b = bottone.getBoundingClientRect();
    // Con l'allineamento «end» uno spostamento negativo porta il riquadro a destra, fino al bordo della scheda.
    setRiquadro({ spostamento: Math.round(b.right - s.right), larghezza: Math.round(s.width) });
  };

  const handleCardClick = () => {
    if (isDragging) return;
    onClick?.();
  };

  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  // Tap sul telefono = avvia la chiamata (tel:). Su mobile apre il dialer del
  // dispositivo, così l'utente chiama col proprio cellulare. Prima copiava solo
  // il numero negli appunti.
  const handleCallPhone = (e: React.MouseEvent) => {
    stopProp(e);
    if (contact?.phone) {
      window.location.href = `tel:${contact.phone.replace(/[^\d+]/g, "")}`;
    } else {
      toast.info("Nessun telefono disponibile");
    }
  };

  const handleEmail = (e: React.MouseEvent) => {
    stopProp(e);
    if (contact?.email) {
      window.open(`mailto:${contact.email}`);
    } else {
      toast.info("Nessuna email disponibile");
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    stopProp(e);
    setConfirmDelete(true);
  };

  const confirmDeleteAction = () => {
    onDelete?.(opportunity.id);
    setConfirmDelete(false);
  };

  const handleCheckboxChange = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect?.(opportunity.id, !selected);
  };

  // Mini layout — ultra-compact card
  if (layout === "mini") {
    const phoneVal = contact?.phone || "";
    const valueStr = formatCurrency(Number(opportunity.value || 0));
    const updatedAgo = opportunity.updated_at
      ? formatDistanceToNow(new Date(opportunity.updated_at), { addSuffix: false, locale: it })
      : null;

    return (
      <div
        ref={isOverlay ? undefined : setNodeRef}
        style={style}
        {...(isOverlay ? {} : { ...attributes, ...listeners })}
        onClick={handleCardClick}
        className={cn(
          "bg-background border rounded-md px-2 py-1.5 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md hover:border-primary/30 transition-all border-l-[3px]",
          opportunity.status === "open" && "border-l-blue-500",
          opportunity.status === "won" && "border-l-green-500",
          opportunity.status === "lost" && "border-l-red-500",
          opportunity.status === "abandoned" && "border-l-gray-400",
          isDragging && "opacity-30 shadow-lg",
          isOverlay && "shadow-xl border-primary/40",
          selected && "ring-2 ring-primary border-primary/50"
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {!isOverlay && onSelect && (
            <div onClick={handleCheckboxChange} onPointerDown={(e) => e.stopPropagation()} className="shrink-0">
              <Checkbox checked={!!selected} className="h-3.5 w-3.5" />
            </div>
          )}
          <p className="text-xs font-semibold leading-tight truncate flex-1 min-w-0">{displayName}</p>
          <RichiestaRipetutaBadge dati={opportunity.richiesta_ripetuta} compatta />
          {opportunity.status === 'open' && <DealHealthBadge opportunity={opportunity} compact />}
          {updatedAgo && (
            <span className="shrink-0 text-[9px] text-muted-foreground whitespace-nowrap">Agg. {updatedAgo}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] font-semibold text-primary">{valueStr}</span>
          {phoneVal && <span className="text-[10px] text-muted-foreground truncate">{phoneVal}</span>}
        </div>
      </div>
    );
  }

  const actionIcons = [
    { icon: Phone, tooltip: "Chiama", action: handleCallPhone, mobileVisible: true },
    { icon: Mail, tooltip: "Invia email", action: handleEmail, mobileVisible: true },
    {
      icon: Tag,
      tooltip: tags.length > 0 ? tags.join(", ") : "Nessuna etichetta",
      action: (e: React.MouseEvent) => { stopProp(e); onClick?.(); },
      badge: tags.length > 0 ? tags.length : null,
      mobileVisible: false,
    },
    { icon: StickyNote, tooltip: opportunity.notes_count > 0 ? `Appunti (${opportunity.notes_count})` : "Appunti", anteprima: opportunity.notes_count > 0 ? "appunti" : undefined, action: (e: React.MouseEvent) => { stopProp(e); onOpenTab?.("notes"); }, badge: opportunity.notes_count > 0 ? opportunity.notes_count : null, mobileVisible: true },
    { icon: Calendar, tooltip: "Appuntamenti", anteprima: numeroAppuntamenti ? "appuntamenti" : undefined, action: (e: React.MouseEvent) => { stopProp(e); onOpenTab?.("appointments"); }, badge: numeroAppuntamenti, mobileVisible: true },
    { icon: ListTodo, tooltip: "Attività da fare", anteprima: numeroAttivita.numero ? "attivita" : undefined, action: (e: React.MouseEvent) => { stopProp(e); onOpenTab?.("activities"); }, badge: numeroAttivita.numero, badgeUrgente: numeroAttivita.urgente, mobileVisible: true },
    { icon: Folder, tooltip: opportunity.documents_count > 0 ? `Documenti (${opportunity.documents_count})` : "Documenti", action: (e: React.MouseEvent) => { stopProp(e); onOpenTab?.("documents"); }, badge: opportunity.documents_count > 0 ? opportunity.documents_count : null, mobileVisible: false },
    canEdit ? { icon: Trash2, tooltip: "Elimina", action: handleDeleteClick, mobileVisible: false } : null,
  ].filter(Boolean) as Array<{
    icon: typeof Phone;
    tooltip: string;
    /** Riquadro al passaggio del mouse, caricato solo quando si apre. */
    anteprima?: "appunti" | "appuntamenti" | "attivita";
    action: (e: React.MouseEvent) => void;
    badge?: number | null;
    /** Numerino rosso: c'è qualcosa di scaduto. */
    badgeUrgente?: boolean;
    mobileVisible: boolean;
  }>;

  return (
    <>
      <div
        ref={isOverlay ? undefined : setNodeRef}
        style={style}
        {...(isOverlay ? {} : { ...attributes, ...listeners })}
        onClick={handleCardClick}
        data-scheda-opportunita=""
        className={cn(
          // Densità: padding e interlinea ridotti rispetto a p-3/space-y-2 per
          // far stare più schede nella stessa altezza di schermo.
          "bg-background border rounded-lg p-2 md:p-2.5 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md hover:border-primary/30 transition-all space-y-1 md:space-y-1.5 border-l-[3px]",
          opportunity.status === "open" && "border-l-blue-500",
          opportunity.status === "won" && "border-l-green-500",
          opportunity.status === "lost" && "border-l-red-500",
          opportunity.status === "abandoned" && "border-l-gray-400",
          isDragging && "opacity-30 shadow-lg",
          isOverlay && "shadow-xl border-primary/40",
          selected && "ring-2 ring-primary border-primary/50"
        )}
      >
        {/* Top: Checkbox + Name + Owner Avatar */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            {/* checkbox visibile anche su mobile: senza, la selezione multipla (BulkEditSheet) era impossibile da telefono */}
            {!isOverlay && onSelect && (
              <div onClick={handleCheckboxChange} onPointerDown={(e) => e.stopPropagation()} className="pt-0.5">
                <Checkbox checked={!!selected} className="h-4 w-4" />
              </div>
            )}
            {contact ? (
              <div className="flex items-center gap-1 min-w-0">
                <LeadTemperatureBadge lastActivityAt={contact.last_activity_at} hasOpenOpportunity createdAt={contact.created_at} compact />
                <p
                  className="text-xs md:text-sm font-bold leading-tight truncate cursor-pointer hover:underline"
                  onClick={(e) => { e.stopPropagation(); navigate(`${routePrefix}/contatti/${contact.id}`); }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {displayName}
                </p>
              </div>
            ) : (
              <p className="text-sm font-bold leading-tight truncate">{displayName}</p>
            )}
            {/* Ha già fatto richiesta: è rientrato nello stesso flusso, non è un lead nuovo. */}
            <RichiestaRipetutaBadge dati={opportunity.richiesta_ripetuta} className="mt-0.5" />
          </div>
          <div className="flex items-center gap-1.5">
          {opportunity.status === 'open' && <DealHealthBadge opportunity={opportunity} compact />}
          {isFieldActive("owner") && (
            <Tooltip>
              <TooltipTrigger asChild>
                {persona?.avatar_url ? (
                  <img
                    src={persona.avatar_url}
                    alt={nomeDi(persona)}
                    className={`shrink-0 h-5 w-5 rounded-full object-cover cursor-default ${personaDelCallCenter ? "ring-2 ring-amber-400" : ""}`}
                  />
                ) : assignedInitials ? (
                  <span className={`shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold cursor-default ${
                    personaDelCallCenter ? "bg-amber-500 text-white" : "bg-primary text-primary-foreground"
                  }`}>
                    {assignedInitials}
                  </span>
                ) : (
                  <span className="shrink-0 h-5 w-5 rounded-full bg-muted flex items-center justify-center cursor-default">
                    <UserCircle className="h-4 w-4 text-muted-foreground" />
                  </span>
                )}
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {assignedFullName || "Non assegnato"}
              </TooltipContent>
            </Tooltip>
          )}
          </div>
        </div>

        {/* Detail rows - driven by field preferences */}
        <CardDetailRows opportunity={opportunity} contact={contact} activeFields={activeFields} layout={layout} />

        {/* Updated at + days in stage */}
        {!isOverlay && (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {opportunity.updated_at && (
              <div className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                <span>Agg. {formatDistanceToNow(new Date(opportunity.updated_at), { addSuffix: false, locale: it })}</span>
              </div>
            )}
            {daysInStage !== null && opportunity.status === 'open' && (
              <span
                title={daysInStage >= sogliaStalloGg ? `In stallo: oltre la soglia di ${sogliaStalloGg}gg di questa fase` : undefined}
                className={`text-[9px] rounded px-1 py-0.5 ${
                  daysInStage >= sogliaStalloGg * 2
                    ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 font-semibold"
                    : daysInStage >= sogliaStalloGg
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 font-medium"
                      : "bg-muted"
                }`}
              >
                {daysInStage}gg in stage
              </span>
            )}
          </div>
        )}

        {/* Action bar */}
        {!isOverlay && (
          <div className="flex items-center justify-between pt-0.5 border-t border-border/50">
            {actionIcons.map(({ icon: Icon, tooltip, anteprima, action, badge, badgeUrgente, mobileVisible }, i) => (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <button
                    onClick={action}
                    onPointerEnter={anteprima ? (e) => misuraRiquadro(e.currentTarget) : undefined}
                    onFocus={anteprima ? (e) => misuraRiquadro(e.currentTarget) : undefined}
                    className={cn(
                      "relative p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground",
                      !mobileVisible && "hidden md:block"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {badge && (
                      <span className={cn(
                        "absolute -top-1.5 -right-1.5 h-3.5 min-w-[14px] rounded-full text-[8px] font-bold flex items-center justify-center px-0.5",
                        badgeUrgente ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground",
                      )}>
                        {badge}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                {/* Si apre sopra l'icona; i riquadri con l'anteprima sopra la scheda, larghi quanto lei. */}
                <TooltipContent
                  side="top"
                  align={anteprima ? "end" : "center"}
                  alignOffset={anteprima ? riquadro?.spostamento ?? 0 : 0}
                  collisionPadding={8}
                  style={anteprima && riquadro ? { width: riquadro.larghezza, maxWidth: riquadro.larghezza } : undefined}
                  className={anteprima ? "text-xs max-w-[280px]" : "text-xs max-w-[200px]"}
                >
                  {anteprima === "appunti" ? (
                    <AnteprimaAppunti opportunityId={opportunity.id} totale={opportunity.notes_count} />
                  ) : anteprima === "appuntamenti" ? (
                    <AnteprimaAppuntamenti opportunityId={opportunity.id} contactId={opportunity.contact_id ?? contact?.id ?? null} totale={numeroAppuntamenti ?? 0} />
                  ) : anteprima === "attivita" ? (
                    <AnteprimaAttivita opportunityId={opportunity.id} contactId={opportunity.contact_id ?? contact?.id ?? null} totale={agenda.attivita} />
                  ) : tooltip}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent onClick={stopProp}>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa opportunità?</AlertDialogTitle>
            <AlertDialogDescription>Finisce nel cestino: la puoi ripristinare da Opportunità → Altre azioni → Cestino.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteAction} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}));
OpportunityCard.displayName = "OpportunityCard";

/** Renders detail rows based on user field preferences */
function CardDetailRows({ opportunity, contact, activeFields, layout }: {
  opportunity: any;
  contact: any;
  activeFields: string[];
  layout: CardLayout;
}) {
  const rows = useMemo(() => {
    const r: { label: string; value: string; highlight?: boolean }[] = [];
    const fieldMap: Record<string, () => { label: string; value: string; highlight?: boolean } | null> = {
      source: () => ({ label: "Fonte", value: opportunity.source || "—" }),
      value: () => ({
        label: "Valore",
        value: formatCurrency(Number(opportunity.value || 0)),
        highlight: true,
      }),
      contact_email: () => ({ label: "Email", value: contact?.email || "—" }),
      contact_phone: () => ({ label: "Telefono", value: contact?.phone || "—" }),
      lost_reason: () => {
        if (opportunity.status !== "lost" && opportunity.status !== "abandoned") return null;
        return {
          label: "Motivo perdita",
          value: opportunity.lost_reason || opportunity.loss_reason || opportunity.lost_reason_category || "—",
        };
      },
      created_at: () => ({ label: "Creato il", value: opportunity.created_at ? new Date(opportunity.created_at).toLocaleDateString("it-IT") : "—" }),
      updated_at: () => ({ label: "Aggiornato il", value: opportunity.updated_at ? new Date(opportunity.updated_at).toLocaleDateString("it-IT") : "—" }),
      contact_name: () => ({ label: "Contatto", value: contact ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || "—" : "—" }),
      contact_company: () => ({ label: "Azienda", value: contact?.company_name || "—" }),
      contact_city: () => ({ label: "Città", value: contact?.city || "—" }),
      contact_source: () => ({ label: "Fonte contatto", value: contact?.source || "—" }),
      status: () => ({ label: "Stato", value: opportunity.status || "—" }),
      pipeline: () => ({ label: "Sequenza", value: opportunity.pipeline_name || "—" }),
      stage: () => ({ label: "Fase", value: opportunity.stage_name || "—" }),
      appointment_date: () => {
        const appt = opportunity.next_appointment;
        if (!appt) return { label: "Appuntamento", value: "—" };
        const d = new Date(appt.date);
        const dayMonth = d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
        const time = appt.time ? appt.time.slice(0, 5) : "";
        return { label: "📅 Appuntamento", value: time ? `${dayMonth}, ${time}` : dayMonth, highlight: true };
      },
    };

    for (const key of activeFields) {
      if (key === "opp_name" || key === "tags" || key === "owner") continue;
      const gen = fieldMap[key];
      const row = gen?.();
      if (row) r.push(row);
    }
    return r;
  }, [opportunity, contact, activeFields]);

  if (rows.length === 0) return null;

  return (
    <div className={cn("space-y-0.5", layout === "compact" && "space-y-0")}>
      {rows.map((row) => (
        <p key={row.label} className={cn("leading-tight truncate", layout === "compact" ? "text-[10px]" : "text-[10px] md:text-[11px]")}>
          {layout !== "no-label" && (
            <span className="text-muted-foreground">{row.label}: </span>
          )}
          <span className={cn("text-foreground", row.highlight && "font-semibold text-primary")}>
            {row.value}
          </span>
        </p>
      ))}
    </div>
  );
}
