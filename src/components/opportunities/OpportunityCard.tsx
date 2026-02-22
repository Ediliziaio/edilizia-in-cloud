import { memo, useState, forwardRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Phone, Mail, Tag, StickyNote, Calendar, Folder, Trash2, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useCardFieldPreferences, type CardLayout } from "@/hooks/useCardFieldPreferences";
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
}

export const OpportunityCard = memo(forwardRef<HTMLDivElement, OpportunityCardProps>(function OpportunityCard({ opportunity, onClick, onOpenTab, onDelete, isOverlay, selected, onSelect }, _ref) {
  const navigate = useNavigate();
  const contact = opportunity.marketing_contacts;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { activeFields, layout, isFieldActive } = useCardFieldPreferences();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: opportunity.id,
    data: { type: "opportunity", stageId: opportunity.stage_id },
    disabled: isOverlay,
  });

  const style = isOverlay ? undefined : {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const fullName = contact
    ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
    : opportunity.name;
  const cityPart = contact?.city ? ` - ${contact.city}` : "";
  const displayName = `${fullName}${cityPart}` || opportunity.name;

  // Owner avatar from assigned_profile
  const profile = opportunity.assigned_profile;
  const assignedInitials = profile
    ? `${profile.first_name?.[0] || ""}${profile.last_name?.[0] || ""}`.toUpperCase()
    : null;
  const assignedFullName = profile
    ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
    : null;

  // Tags
  const tags: string[] = opportunity.tags || [];

  const handleCardClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    onClick?.();
  };

  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  const handleCopyPhone = (e: React.MouseEvent) => {
    stopProp(e);
    if (contact?.phone) {
      navigator.clipboard.writeText(contact.phone);
      toast.success("Numero copiato");
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

  const handleComingSoon = (label: string) => (e: React.MouseEvent) => {
    stopProp(e);
    toast.info(`${label}: funzionalità in arrivo`);
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

  const actionIcons = [
    { icon: Phone, tooltip: "Copia telefono", action: handleCopyPhone },
    { icon: Mail, tooltip: "Invia email", action: handleEmail },
    {
      icon: Tag,
      tooltip: tags.length > 0 ? tags.join(", ") : "Nessuna etichetta",
      action: (e: React.MouseEvent) => { stopProp(e); onClick?.(); },
      badge: tags.length > 0 ? tags.length : null,
    },
    { icon: StickyNote, tooltip: opportunity.notes_count > 0 ? `Note (${opportunity.notes_count})` : "Note", action: (e: React.MouseEvent) => { stopProp(e); onOpenTab?.("notes"); }, badge: opportunity.notes_count > 0 ? opportunity.notes_count : null },
    { icon: Calendar, tooltip: "Calendario", action: handleComingSoon("Calendario") },
    { icon: Folder, tooltip: opportunity.documents_count > 0 ? `Documenti (${opportunity.documents_count})` : "Documenti", action: (e: React.MouseEvent) => { stopProp(e); onOpenTab?.("documents"); }, badge: opportunity.documents_count > 0 ? opportunity.documents_count : null },
    { icon: Trash2, tooltip: "Elimina", action: handleDeleteClick },
  ];

  return (
    <>
      <div
        ref={isOverlay ? undefined : setNodeRef}
        style={style}
        {...(isOverlay ? {} : { ...attributes, ...listeners })}
        onClick={handleCardClick}
        className={cn(
          "bg-background border rounded-lg p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md hover:border-primary/30 transition-all space-y-2",
          isDragging && "opacity-30 shadow-lg",
          isOverlay && "shadow-xl border-primary/40",
          selected && "ring-2 ring-primary border-primary/50"
        )}
      >
        {/* Top: Checkbox + Name + Owner Avatar */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            {!isOverlay && onSelect && (
              <div onClick={handleCheckboxChange} onPointerDown={(e) => e.stopPropagation()} className="pt-0.5">
                <Checkbox checked={!!selected} className="h-4 w-4" />
              </div>
            )}
            {contact ? (
              <p
                className="text-sm font-bold leading-tight truncate cursor-pointer hover:underline"
                onClick={(e) => { e.stopPropagation(); navigate(`/azienda/marketing/contatti/${contact.id}`); }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {displayName}
              </p>
            ) : (
              <p className="text-sm font-bold leading-tight truncate">{displayName}</p>
            )}
          </div>
          {isFieldActive("owner") && (
            <Tooltip>
              <TooltipTrigger asChild>
                {assignedInitials ? (
                  <span className="shrink-0 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold cursor-default">
                    {assignedInitials}
                  </span>
                ) : (
                  <span className="shrink-0 h-6 w-6 rounded-full bg-muted flex items-center justify-center cursor-default">
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

        {/* Detail rows - driven by field preferences */}
        <CardDetailRows opportunity={opportunity} contact={contact} activeFields={activeFields} layout={layout} isFieldActive={isFieldActive} />

        {/* Action bar */}
        {!isOverlay && (
          <div className="flex items-center justify-between pt-1 border-t border-border/50">
            {actionIcons.map(({ icon: Icon, tooltip, action, badge }, i) => (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <button
                    onClick={action}
                    className="relative p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {badge && (
                      <span className="absolute -top-1.5 -right-1.5 h-3.5 min-w-[14px] rounded-full bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center px-0.5">
                        {badge}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs max-w-[200px]">{tooltip}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent onClick={stopProp}>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa opportunità?</AlertDialogTitle>
            <AlertDialogDescription>Questa azione non può essere annullata.</AlertDialogDescription>
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

/** Renders detail rows based on user field preferences */
function CardDetailRows({ opportunity, contact, activeFields, layout, isFieldActive }: {
  opportunity: any;
  contact: any;
  activeFields: string[];
  layout: CardLayout;
  isFieldActive: (key: string) => boolean;
}) {
  const rows = useMemo(() => {
    const r: { label: string; value: string; highlight?: boolean }[] = [];
    const fieldMap: Record<string, () => { label: string; value: string; highlight?: boolean }> = {
      source: () => ({ label: "Fonte", value: opportunity.source || "—" }),
      value: () => ({
        label: "Valore",
        value: `EUR ${Number(opportunity.value || 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}`,
        highlight: true,
      }),
      contact_email: () => ({ label: "Email", value: contact?.email || "—" }),
      contact_phone: () => ({ label: "Telefono", value: contact?.phone || "—" }),
      lost_reason: () => ({ label: "Motivo perdita", value: opportunity.notes || "—" }),
      created_at: () => ({ label: "Creato il", value: opportunity.created_at ? new Date(opportunity.created_at).toLocaleDateString("it-IT") : "—" }),
      updated_at: () => ({ label: "Aggiornato il", value: opportunity.updated_at ? new Date(opportunity.updated_at).toLocaleDateString("it-IT") : "—" }),
      contact_name: () => ({ label: "Contatto", value: contact ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || "—" : "—" }),
      contact_company: () => ({ label: "Azienda", value: contact?.company_name || "—" }),
      contact_city: () => ({ label: "Città", value: contact?.city || "—" }),
      contact_source: () => ({ label: "Fonte contatto", value: contact?.source || "—" }),
      status: () => ({ label: "Stato", value: opportunity.status || "—" }),
      pipeline: () => ({ label: "Sequenza", value: opportunity.pipeline_name || "—" }),
      stage: () => ({ label: "Fase", value: opportunity.stage_name || "—" }),
    };

    for (const key of activeFields) {
      if (key === "opp_name" || key === "tags" || key === "owner") continue;
      const gen = fieldMap[key];
      if (gen) r.push(gen());
    }
    return r;
  }, [opportunity, contact, activeFields]);

  if (rows.length === 0) return null;

  return (
    <div className={cn("space-y-1", layout === "compact" && "space-y-0.5")}>
      {rows.map((row) => (
        <p key={row.label} className={cn("leading-tight truncate", layout === "compact" ? "text-[10px]" : "text-[11px]")}>
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
