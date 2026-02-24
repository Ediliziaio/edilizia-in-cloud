import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { MarketingAppointment } from "@/types/marketingCalendar";

interface Props {
  appointment: MarketingAppointment;
  children: React.ReactNode;
}

export default function DraggableAppointment({ appointment, children }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `apt-${appointment.id}`,
    data: { appointment },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(isDragging && "opacity-30")}
      style={{ touchAction: "none" }}
    >
      {children}
    </div>
  );
}
