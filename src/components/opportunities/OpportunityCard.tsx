import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Mail, Phone, User, MapPin, DollarSign, Briefcase } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface OpportunityCardProps {
  opportunity: any;
  onClick?: () => void;
}

export function OpportunityCard({ opportunity, onClick }: OpportunityCardProps) {
  const contact = opportunity.marketing_contacts;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: opportunity.id,
    data: { type: "opportunity", stageId: opportunity.stage_id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const fullName = contact ? `${contact.first_name} ${contact.last_name || ""}`.trim() : opportunity.name;
  const initials = contact ? `${contact.first_name?.[0] || ""}${contact.last_name?.[0] || ""}`.toUpperCase() : opportunity.name?.[0]?.toUpperCase() || "?";

  const handleClick = (e: React.MouseEvent) => {
    // Don't trigger click when dragging
    if (isDragging) return;
    onClick?.();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={cn(
        "bg-background border rounded-lg p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md hover:border-primary/30 transition-all space-y-2.5",
        isDragging && "opacity-50 shadow-lg"
      )}
    >
      {/* Contact name + assigned */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-bold">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{fullName}</p>
            {contact?.city && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                <MapPin className="h-3 w-3 shrink-0" /> {contact.city}
              </p>
            )}
          </div>
        </div>
        {opportunity.assigned_to && (
          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <User className="h-3 w-3 text-primary" />
          </div>
        )}
      </div>

      {/* Details with labels */}
      <div className="space-y-1.5">
        {opportunity.source && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <Briefcase className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Fonte:</span>
            <span className="font-medium truncate">{opportunity.source}</span>
          </div>
        )}
        {Number(opportunity.value) > 0 && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <DollarSign className="h-3 w-3 text-primary shrink-0" />
            <span className="text-muted-foreground">Valore:</span>
            <span className="font-semibold text-primary">
              EUR {Number(opportunity.value).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}
        {contact?.email && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground truncate">{contact.email}</span>
          </div>
        )}
        {contact?.phone && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">{contact.phone}</span>
          </div>
        )}
      </div>
    </div>
  );
}
