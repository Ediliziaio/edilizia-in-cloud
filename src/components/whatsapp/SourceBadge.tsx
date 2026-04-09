import { Badge } from "@/components/ui/badge";
import { MessageSquare, Globe, Smartphone } from "lucide-react";

const sourceConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline"; icon: any; className: string }> = {
  whatsapp: { label: "WhatsApp", variant: "default", icon: MessageSquare, className: "bg-emerald-500 hover:bg-emerald-600 text-white" },
  campo: { label: "Campo", variant: "default", icon: Smartphone, className: "bg-blue-500 hover:bg-blue-600 text-white" },
  api: { label: "API", variant: "secondary", icon: Globe, className: "" },
};

interface SourceBadgeProps {
  source?: string | null;
  className?: string;
}

export function SourceBadge({ source, className = "" }: SourceBadgeProps) {
  if (!source || source === "manual") return null;

  const config = sourceConfig[source];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={`text-[10px] gap-1 ${config.className} ${className}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}
