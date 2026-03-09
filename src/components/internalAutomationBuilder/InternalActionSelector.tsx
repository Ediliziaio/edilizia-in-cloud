import { useState } from "react";
import { INTERNAL_ACTION_CATEGORIES, type PickerItem } from "@/types/internalAutomationBuilder";
import { cn } from "@/lib/utils";
import {
  Settings, MessageSquare, GitBranch, Globe, CheckSquare, RefreshCw,
  Headphones, CalendarDays, Bell, Mail, Clock, Receipt, UserCheck,
  Search, X, ChevronDown, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const ICON_MAP: Record<string, any> = {
  Settings, MessageSquare, GitBranch, Globe, CheckSquare, RefreshCw,
  Headphones, CalendarDays, Bell, Mail, Clock, Receipt, UserCheck,
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (action: PickerItem) => void;
}

export function InternalActionSelector({ open, onClose, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [openCats, setOpenCats] = useState<Set<string>>(new Set(INTERNAL_ACTION_CATEGORIES.map(c => c.key)));

  if (!open) return null;

  const q = search.toLowerCase();

  const toggleCat = (key: string) => {
    setOpenCats(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div className="w-80 border-l bg-background flex flex-col shrink-0 h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-semibold">Aggiungi Nodo</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca azione..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
        {INTERNAL_ACTION_CATEGORIES.map((cat) => {
          const CatIcon = ICON_MAP[cat.icon] || Settings;
          const items = cat.items.filter(i => !q || i.label.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
          if (items.length === 0) return null;

          return (
            <Collapsible key={cat.key} open={openCats.has(cat.key)} onOpenChange={() => toggleCat(cat.key)}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-accent/50 text-left">
                {openCats.has(cat.key) ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                <CatIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold">{cat.label}</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-4 space-y-0.5">
                {items.map((item) => {
                  const Icon = ICON_MAP[item.icon] || Settings;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { onSelect(item); onClose(); }}
                      className={cn(
                        "flex items-center gap-3 w-full text-left px-2 py-2 rounded-md",
                        "hover:bg-accent/50 transition-colors"
                      )}
                    >
                      <div className="shrink-0 h-7 w-7 rounded-md bg-blue-500/10 flex items-center justify-center">
                        <Icon className="h-3.5 w-3.5 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{item.label}</p>
                        {item.description && (
                          <p className="text-[10px] text-muted-foreground truncate">{item.description}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
