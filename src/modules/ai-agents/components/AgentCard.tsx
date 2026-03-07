import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bot, MoreHorizontal, Pencil, Archive, Trash2 } from "lucide-react";
import type { AIAgent } from "../types/agent.types";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface AgentCardProps {
  agent: AIAgent;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  active: { label: "Attivo", variant: "default" },
  draft: { label: "Bozza", variant: "secondary" },
  archived: { label: "Archiviato", variant: "outline" },
};

export function AgentCard({ agent, onArchive, onDelete }: AgentCardProps) {
  const navigate = useNavigate();
  const config = statusConfig[agent.status] ?? statusConfig.draft;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate(`/azienda/marketing/agente-ai/${agent.id}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold truncate">{agent.name}</h3>
              <p className="text-xs text-muted-foreground">
                {agent.llm_model} · {agent.language.toUpperCase()} · {format(new Date(agent.created_at), "d MMM yyyy", { locale: it })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={config.variant}>{config.label}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={() => navigate(`/azienda/marketing/agente-ai/${agent.id}`)}>
                  <Pencil className="h-4 w-4 mr-2" /> Modifica
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onArchive(agent.id)}>
                  <Archive className="h-4 w-4 mr-2" /> Archivia
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => onDelete(agent.id)}>
                  <Trash2 className="h-4 w-4 mr-2" /> Elimina
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
