import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export default function DroppableSlot({ id, children, className, onClick }: Props) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn("overflow-visible", className, isOver && "ring-2 ring-primary/50 bg-primary/5")}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
