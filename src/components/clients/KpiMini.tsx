import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type KpiColor = "blue" | "green" | "orange" | "purple" | "red";

interface KpiMiniProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  color?: KpiColor;
  onClick?: () => void;
}

const colorMap: Record<KpiColor, string> = {
  blue: "bg-blue-50 text-blue-700 border-blue-100",
  green: "bg-green-50 text-green-700 border-green-100",
  orange: "bg-orange-50 text-orange-700 border-orange-100",
  purple: "bg-purple-50 text-purple-700 border-purple-100",
  red: "bg-red-50 text-red-700 border-red-100",
};

export function KpiMini({ icon: Icon, label, value, color = "blue", onClick }: KpiMiniProps) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        colorMap[color],
        onClick && "cursor-pointer hover:opacity-80",
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px] font-medium leading-tight">{label}</span>
      </div>
      <p className="text-xl font-bold leading-none">{value}</p>
    </div>
  );
}
