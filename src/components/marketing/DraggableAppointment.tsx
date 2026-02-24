import { useRef, useCallback } from "react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { MarketingAppointment } from "@/types/marketingCalendar";

interface Props {
  appointment: MarketingAppointment;
  children: React.ReactNode;
  onResize?: (id: string, newEndTime: string) => void;
  slotDurationMinutes?: number;
  slotHeightPx?: number;
  startTime?: string; // e.g. "09:00"
  /** Precise height in px (pixel-per-minute based) */
  spanHeight?: number;
  /** Offset from top of the containing slot in px */
  topOffsetPx?: number;
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
  spanHeight,
  topOffsetPx,
}: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `apt-${appointment.id}`,
    data: { appointment },
  });

  const resizing = useRef(false);
  const startY = useRef(0);
  const startEndMinutes = useRef(0);

  const pxPerMinute = slotHeightPx / slotDurationMinutes;

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!onResize || !startTime) return;

      resizing.current = true;
      startY.current = e.clientY;

      const [sh, sm] = startTime.split(":").map(Number);
      const aptStart = sh * 60 + (sm || 0);
      const endTime = appointment.appointment_end_time;
      if (endTime) {
        const [eh, em] = endTime.split(":").map(Number);
        startEndMinutes.current = eh * 60 + (em || 0);
      } else {
        startEndMinutes.current = aptStart + slotDurationMinutes;
      }

      const handleMouseMove = (ev: MouseEvent) => {
        if (!resizing.current) return;
        const deltaY = ev.clientY - startY.current;
        // Convert pixel delta to minutes (not slots)
        const deltaMinutes = Math.round(deltaY / pxPerMinute);
        const newEndMin = startEndMinutes.current + deltaMinutes;
        const [sh2, sm2] = startTime.split(":").map(Number);
        const minEnd = sh2 * 60 + (sm2 || 0) + 15; // minimum 15 min
        const clamped = Math.max(minEnd, Math.min(newEndMin, 22 * 60));
        // Live preview
        const el = document.querySelector(`[data-resize-id="${appointment.id}"]`) as HTMLElement;
        if (el) {
          const aptStartMin = sh2 * 60 + (sm2 || 0);
          const newHeight = (clamped - aptStartMin) * pxPerMinute;
          el.style.height = `${newHeight}px`;
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
        const deltaMinutes = Math.round(deltaY / pxPerMinute);
        const newEndMin = startEndMinutes.current + deltaMinutes;
        const [sh3, sm3] = startTime.split(":").map(Number);
        const minEnd = sh3 * 60 + (sm3 || 0) + 15;
        const clamped = Math.max(minEnd, Math.min(newEndMin, 22 * 60));
        onResize(appointment.id, minutesToTimeStr(clamped));
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "s-resize";
      document.body.style.userSelect = "none";
    },
    [onResize, startTime, appointment, slotDurationMinutes, pxPerMinute]
  );

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn("relative", isDragging && "opacity-30")}
      style={{
        touchAction: "none",
        ...(spanHeight != null ? { height: spanHeight, zIndex: 5 } : {}),
        ...(topOffsetPx ? { marginTop: topOffsetPx } : {}),
      }}
      data-resize-id={appointment.id}
    >
      {children}
      {onResize && startTime && (
        <div
          onMouseDown={handleResizeStart}
          className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize group z-10 flex items-center justify-center"
        >
          <div className="w-8 h-1 rounded-full bg-muted-foreground/30 group-hover:bg-muted-foreground/60 transition-colors" />
        </div>
      )}
    </div>
  );
}
