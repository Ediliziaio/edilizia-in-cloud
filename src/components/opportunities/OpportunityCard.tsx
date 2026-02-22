import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Mail, Phone, User, MapPin, DollarSign } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface OpportunityCardProps {
  opportunity: any;
}

export function OpportunityCard({ opportunity }: OpportunityCardProps) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "bg-background border rounded-lg p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow space-y-2",
        isDragging && "opacity-50 shadow-lg"
      )}
    >
      {/* Contact name + assigned */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-bold">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{fullName}</p>
            {contact?.city && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                <MapPin className="h-3 w-3" /> {contact.city}
              </p>
            )}
          </div>
        </div>
        {opportunity.assigned_to && (
          <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
            <User className="h-3 w-3 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Source + Value */}
      <div className="flex items-center justify-between gap-2">
        {opportunity.source && (
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{opportunity.source}</Badge>
        )}
        {opportunity.value > 0 && (
          <span className="text-xs font-semibold text-emerald-600 flex items-center gap-0.5">
            <DollarSign className="h-3 w-3" />
            {Number(opportunity.value).toLocaleString("it-IT", { minimumFractionDigits: 0 })} €
          </span>
        )}
      </div>

      {/* Contact info */}
      {contact && (contact.email || contact.phone) && (
        <div className="space-y-0.5">
          {contact.email && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
              <Mail className="h-3 w-3 shrink-0" /> {contact.email}
            </p>
          )}
          {contact.phone && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3 shrink-0" /> {contact.phone}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
