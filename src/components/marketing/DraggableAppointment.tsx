import { useRef, useCallback, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { MarketingAppointment } from "@/types/marketingCalendar";

interface Props {
  appointment: MarketingAppointment;
  children: React.ReactNode;
  onResize?: (id: string, newEndTime: string) => void;
  onResizeEnd?: () => void;
  slotDurationMinutes?: number;
  slotHeightPx?: number;
  startTime?: string;
  spanHeight?: number;
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
  onResizeEnd,
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
  const [resizeLabel, setResizeLabel] = useState<string | null>(null);

  const pxPerMinute = slotHeightPx / slotDurationMinutes;

  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!onResize || !startTime) return;

      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

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

      const handlePointerMove = (ev: PointerEvent) => {
        if (!resizing.current) return;
        const deltaY = ev.clientY - startY.current;
        const deltaMinutes = Math.round(deltaY / pxPerMinute);
        const newEndMin = startEndMinutes.current + deltaMinutes;
        const [sh2, sm2] = startTime.split(":").map(Number);
        const minEnd = sh2 * 60 + (sm2 || 0) + 15;
        const clamped = Math.max(minEnd, Math.min(newEndMin, 22 * 60));
        const snapped = Math.round(clamped / 15) * 15;

        // Visual feedback: update height + label
        const el = document.querySelector(`[data-resize-id="${appointment.id}"]`) as HTMLElement;
        if (el) {
          const aptStartMin = sh2 * 60 + (sm2 || 0);
          const newHeight = (snapped - aptStartMin) * pxPerMinute;
          el.style.height = `${newHeight}px`;
        }
        setResizeLabel(minutesToTimeStr(snapped));
      };

      const handlePointerUp = (ev: PointerEvent) => {
        if (!resizing.current) return;
        resizing.current = false;
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setResizeLabel(null);

        const deltaY = ev.clientY - startY.current;
        const deltaMinutes = Math.round(deltaY / pxPerMinute);
        const newEndMin = startEndMinutes.current + deltaMinutes;
        const [sh3, sm3] = startTime.split(":").map(Number);
        const minEnd = sh3 * 60 + (sm3 || 0) + 15;
        const clamped = Math.max(minEnd, Math.min(newEndMin, 22 * 60));
        const snapped = Math.round(clamped / 15) * 15;
        onResize(appointment.id, minutesToTimeStr(snapped));
        onResizeEnd?.();
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = "s-resize";
      document.body.style.userSelect = "none";
    },
    [onResize, startTime, appointment, slotDurationMinutes, pxPerMinute]
  );

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      className={cn("relative group", isDragging && "opacity-30")}
      style={{
        touchAction: "none",
        ...(spanHeight != null ? { height: spanHeight, zIndex: 5 } : {}),
        ...(topOffsetPx ? { marginTop: topOffsetPx } : {}),
      }}
      data-resize-id={appointment.id}
    >
      <div {...listeners} className="h-full" style={{ touchAction: "none" }}>
        {children}
      </div>
      {onResize && startTime && (
        <div
          onPointerDown={handleResizeStart}
          className="absolute bottom-0 left-0 right-0 h-3 cursor-s-resize z-10 flex items-center justify-center"
        >
          <div className="w-8 h-1 rounded-full bg-transparent group-hover:bg-muted-foreground/60 transition-colors" />
        </div>
      )}
      {resizeLabel && (
        <div className="absolute bottom-0 right-1 text-[9px] bg-popover text-popover-foreground px-1 rounded shadow z-20">
          {resizeLabel}
        </div>
      )}
    </div>
  );
}
