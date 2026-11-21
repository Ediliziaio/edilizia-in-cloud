import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, StickyNote } from "lucide-react";
import { supportPriorityLabels, supportStatusLabels } from "./supportInbox";

interface ConversationActionsProps {
  status: string;
  priority: string;
  internalNotes: string | null;
  busy: boolean;
  onStatusChange: (status: string) => void;
  onPriorityChange: (priority: string) => void;
  onNotesChange: (notes: string) => Promise<boolean>;
  onResolve: () => void;
}

export function ConversationActions({
  status,
  priority,
  internalNotes,
  busy,
  onStatusChange,
  onPriorityChange,
  onNotesChange,
  onResolve,
}: ConversationActionsProps) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [localNotes, setLocalNotes] = useState(internalNotes || "");

  const handleSaveNotes = async () => {
    if (await onNotesChange(localNotes)) setNotesOpen(false);
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-card px-4 py-2 sm:px-5">
      <Select value={status} onValueChange={onStatusChange} disabled={busy}>
        <SelectTrigger aria-label="Stato conversazione" className="h-8 w-[132px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(supportStatusLabels).map(([val, label]) => (
            <SelectItem key={val} value={val}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={priority} onValueChange={onPriorityChange} disabled={busy}>
        <SelectTrigger aria-label="Priorità conversazione" className="h-8 w-[103px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(supportPriorityLabels).map(([val, label]) => (
            <SelectItem key={val} value={val}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover open={notesOpen} onOpenChange={(open) => {
        if (open) setLocalNotes(internalNotes ?? "");
        setNotesOpen(open);
      }}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
            <StickyNote className="h-3.5 w-3.5" />
            Note
            {internalNotes && <span className="ml-1 h-2 w-2 rounded-full bg-primary" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(20rem,calc(100vw-2rem))]" align="end">
          <div className="space-y-2">
            <p className="text-sm font-medium">Note interne</p>
            <Textarea
              aria-label="Note interne"
              value={localNotes}
              onChange={(e) => setLocalNotes(e.target.value)}
              placeholder="Note visibili solo agli admin..."
              rows={4}
              className="text-sm"
            />
            <Button size="sm" disabled={busy} onClick={() => void handleSaveNotes()} className="w-full">
              Salva note
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {status !== "resolved" && status !== "closed" && (
        <Button
          variant="default"
          size="sm"
          className="h-8 text-xs gap-1 ml-auto"
          onClick={onResolve}
          disabled={busy}
        >
          <CheckCircle className="h-3.5 w-3.5" />
          Risolto
        </Button>
      )}
    </div>
  );
}
