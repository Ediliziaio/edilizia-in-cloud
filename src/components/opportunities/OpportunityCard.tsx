import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Phone, Mail, Copy, StickyNote, Calendar, Folder, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeleteOpportunity } from "@/hooks/useOpportunitiesData";
import { toast } from "sonner";
import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface OpportunityCardProps {
  opportunity: any;
  onClick?: () => void;
}

export function OpportunityCard({ opportunity, onClick }: OpportunityCardProps) {
  const contact = opportunity.marketing_contacts;
  const deleteOpp = useDeleteOpportunity();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: opportunity.id,
    data: { type: "opportunity", stageId: opportunity.stage_id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const fullName = contact
    ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
    : opportunity.name;
  const cityPart = contact?.city ? ` - ${contact.city}` : "";
  const displayName = `${fullName}${cityPart}` || opportunity.name;

  // Assigned user initials
  const assignedInitials = opportunity.assigned_to_name
    ? opportunity.assigned_to_name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)
    : null;

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

  const handleCopyName = (e: React.MouseEvent) => {
    stopProp(e);
    navigator.clipboard.writeText(opportunity.name || fullName);
    toast.success("Nome copiato");
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
    deleteOpp.mutate(opportunity.id);
    setConfirmDelete(false);
  };

  const actionIcons = [
    { icon: Phone, tooltip: "Copia telefono", action: handleCopyPhone },
    { icon: Mail, tooltip: "Invia email", action: handleEmail },
    { icon: Copy, tooltip: "Copia nome", action: handleCopyName },
    { icon: StickyNote, tooltip: "Note", action: handleComingSoon("Note") },
    { icon: Calendar, tooltip: "Calendario", action: handleComingSoon("Calendario") },
    { icon: Folder, tooltip: "Documenti", action: handleComingSoon("Documenti") },
    { icon: Trash2, tooltip: "Elimina", action: handleDeleteClick },
  ];

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={handleCardClick}
        className={cn(
          "bg-background border rounded-lg p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md hover:border-primary/30 transition-all space-y-2",
          isDragging && "opacity-50 shadow-lg"
        )}
      >
        {/* Top: Name + Assigned */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-bold leading-tight truncate">{displayName}</p>
          {assignedInitials && (
            <span className="shrink-0 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">
              {assignedInitials}
            </span>
          )}
        </div>

        {/* Detail rows - always show all */}
        <div className="space-y-1">
          <DetailRow label="Fonte dell'opportunità:" value={opportunity.source || "—"} />
          <DetailRow
            label="Valore dell'opportunità:"
            value={`EUR ${Number(opportunity.value || 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}`}
            bold
          />
          <DetailRow label="Email del contatto:" value={contact?.email || "—"} />
          <DetailRow label="Telefono del contatto:" value={contact?.phone || "—"} />
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          {actionIcons.map(({ icon: Icon, tooltip, action }, i) => (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <button
                  onClick={action}
                  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">{tooltip}</TooltipContent>
            </Tooltip>
          ))}
        </div>
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
}

function DetailRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline gap-1 text-[11px] leading-tight">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn("truncate", bold ? "font-semibold text-primary" : "text-foreground")}>{value}</span>
    </div>
  );
}
