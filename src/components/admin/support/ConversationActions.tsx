import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, StickyNote } from "lucide-react";

interface ConversationActionsProps {
  status: string;
  priority: string;
  internalNotes: string | null;
  onStatusChange: (status: string) => void;
  onPriorityChange: (priority: string) => void;
  onNotesChange: (notes: string) => void;
  onResolve: () => void;
}

const statusLabels: Record<string, string> = {
  open: "Aperta",
  in_progress: "In lavorazione",
  resolved: "Risolta",
  closed: "Chiusa",
};

const priorityLabels: Record<string, string> = {
  low: "Bassa",
  normal: "Normale",
  high: "Alta",
  urgent: "Urgente",
};

export function ConversationActions({
  status,
  priority,
  internalNotes,
  onStatusChange,
  onPriorityChange,
  onNotesChange,
  onResolve,
}: ConversationActionsProps) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [localNotes, setLocalNotes] = useState(internalNotes || "");

  const handleSaveNotes = () => {
    onNotesChange(localNotes);
    setNotesOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b bg-muted/30">
      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(statusLabels).map(([val, label]) => (
            <SelectItem key={val} value={val}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={priority} onValueChange={onPriorityChange}>
        <SelectTrigger className="w-[120px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(priorityLabels).map(([val, label]) => (
            <SelectItem key={val} value={val}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover open={notesOpen} onOpenChange={setNotesOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
            <StickyNote className="h-3.5 w-3.5" />
            Note
            {internalNotes && <span className="ml-1 h-2 w-2 rounded-full bg-primary" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-2">
            <p className="text-sm font-medium">Note interne</p>
            <Textarea
              value={localNotes}
              onChange={(e) => setLocalNotes(e.target.value)}
              placeholder="Note visibili solo agli admin..."
              rows={4}
              className="text-sm"
            />
            <Button size="sm" onClick={handleSaveNotes} className="w-full">
              Salva note
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {status !== "resolved" && (
        <Button
          variant="default"
          size="sm"
          className="h-8 text-xs gap-1 ml-auto"
          onClick={onResolve}
        >
          <CheckCircle className="h-3.5 w-3.5" />
          Risolto
        </Button>
      )}
    </div>
  );
}
