import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export function InlineField({ label, value, onSave, type = "text", options }: {
  label: string; value: string; onSave: (v: string) => void; type?: string; options?: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");

  useEffect(() => { setDraft(value || ""); }, [value]);

  const [saved, setSaved] = useState(false);

  const commit = () => {
    setEditing(false);
    if (draft !== (value || "")) {
      onSave(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  };

  if (type === "select" && options) {
    return (
      <div className="grid grid-cols-[120px_1fr] items-center gap-1 py-0.5">
        <Label className="text-xs text-muted-foreground truncate">{label}</Label>
        <Select value={value || ""} onValueChange={onSave}>
          <SelectTrigger className="h-7 text-xs border-0 bg-transparent shadow-none px-1 hover:bg-muted/50"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-1 py-0.5">
      <Label className="text-xs text-muted-foreground truncate">{label}</Label>
      {editing ? (
        <Input
          autoFocus
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          className="h-7 text-xs px-1"
        />
      ) : (
        <div className="flex items-center gap-1">
          <p
            className="text-xs min-h-[32px] flex items-center cursor-pointer hover:bg-muted/50 rounded px-1 flex-1"
            onClick={() => setEditing(true)}
          >
            {value || <span className="text-muted-foreground">—</span>}
          </p>
          {saved && <Check className="h-3 w-3 text-emerald-500 animate-in fade-in duration-200" />}
        </div>
      )}
    </div>
  );
}
