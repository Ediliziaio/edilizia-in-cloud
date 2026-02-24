import { useRef, useCallback } from "react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { MarketingAppointment } from "@/types/marketingCalendar";

interface Props {
  appointment: MarketingAppointment;
  children: React.ReactNode;
  /** If provided, shows a resize handle at the bottom */
  onResize?: (id: string, newEndTime: string) => void;
  slotDurationMinutes?: number;
  slotHeightPx?: number;
  startTime?: string; // appointment_time e.g. "09:00"
}

function minutesToTimeStr(totalMin: number): string {
  const clamped = Math.max(0, Math.min(totalMin, 23 * 60 + 59));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function DraggableAppointment({
  appointment,
  children,
  onResize,
  slotDurationMinutes = 30,
  slotHeightPx = 32,
  startTime,
}: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `apt-${appointment.id}`,
    data: { appointment },
  });

  const resizing = useRef(false);
  const startY = useRef(0);
  const startMinutes = useRef(0);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!onResize || !startTime) return;

      resizing.current = true;
      startY.current = e.clientY;

      // Calculate current end in minutes
      const [sh, sm] = startTime.split(":").map(Number);
      const aptStart = sh * 60 + (sm || 0);
      const endTime = appointment.appointment_end_time;
      if (endTime) {
        const [eh, em] = endTime.split(":").map(Number);
        startMinutes.current = eh * 60 + (em || 0);
      } else {
        startMinutes.current = aptStart + slotDurationMinutes;
      }

      const handleMouseMove = (ev: MouseEvent) => {
        if (!resizing.current) return;
        const deltaY = ev.clientY - startY.current;
        const deltaSlots = Math.round(deltaY / slotHeightPx);
        const newEndMin = startMinutes.current + deltaSlots * slotDurationMinutes;
        // Clamp: at least one slot after start
        const [sh2, sm2] = startTime.split(":").map(Number);
        const minEnd = sh2 * 60 + (sm2 || 0) + slotDurationMinutes;
        const clamped = Math.max(minEnd, Math.min(newEndMin, 22 * 60));
        // Show preview via CSS custom property on the element
        const el = document.querySelector(`[data-resize-id="${appointment.id}"]`) as HTMLElement;
        if (el) {
          const newSlots = (clamped - (sh2 * 60 + (sm2 || 0))) / slotDurationMinutes;
          el.style.height = `${newSlots * slotHeightPx}px`;
        }
      };

      const handleMouseUp = (ev: MouseEvent) => {
        if (!resizing.current) return;
        resizing.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";

        const deltaY = ev.clientY - startY.current;
        const deltaSlots = Math.round(deltaY / slotHeightPx);
        const newEndMin = startMinutes.current + deltaSlots * slotDurationMinutes;
        const [sh3, sm3] = startTime.split(":").map(Number);
        const minEnd = sh3 * 60 + (sm3 || 0) + slotDurationMinutes;
        const clamped = Math.max(minEnd, Math.min(newEndMin, 22 * 60));
        onResize(appointment.id, minutesToTimeStr(clamped));
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "s-resize";
      document.body.style.userSelect = "none";
    },
    [onResize, startTime, appointment, slotDurationMinutes, slotHeightPx]
  );

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn("relative", isDragging && "opacity-30")}
      style={{ touchAction: "none" }}
      data-resize-id={appointment.id}
    >
      {children}
      {onResize && startTime && (
        <div
          onMouseDown={handleResizeStart}
          className="absolute bottom-0 left-0 right-0 h-1.5 cursor-s-resize group z-10 flex items-center justify-center"
        >
          <div className="w-6 h-0.5 rounded-full bg-muted-foreground/30 group-hover:bg-muted-foreground/60 transition-colors" />
        </div>
      )}
    </div>
  );
}
