import { useState, forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TRIGGER_CATEGORIES, type PickerItem } from "@/types/automationBuilder";
import { Search, ChevronRight, ChevronDown, Zap, User, Target, CalendarDays, MessageSquare, Settings, X, Bot, Share2 } from "lucide-react";

const CATEGORY_ICONS: Record<string, typeof Zap> = {
  User, Target, CalendarDays, MessageSquare, Settings, Bot, Share2,
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (item: PickerItem) => void;
}

export const TriggerPickerDialog = forwardRef<HTMLDivElement, Props>(({ open, onClose, onSelect }, ref) => {
  const [search, setSearch] = useState("");
  const [openCats, setOpenCats] = useState<string[]>(TRIGGER_CATEGORIES.map(c => c.key));

  const toggleCat = (key: string) => {
    setOpenCats(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const filteredCategories = TRIGGER_CATEGORIES.map(cat => ({
    ...cat,
    items: cat.items.filter(i => i.label.toLowerCase().includes(search.toLowerCase())),
  })).filter(cat => cat.items.length > 0);

  if (!open) return null;

  return (
    <div ref={ref} className="w-80 border-l bg-background flex flex-col overflow-hidden shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Zap className="h-4 w-4 text-orange-500" />
          Scegli un Trigger
        </h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="px-4 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca trigger..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      <div className="overflow-y-auto flex-1 px-2 pb-4 space-y-1">
        {filteredCategories.map(cat => {
          const isOpen = openCats.includes(cat.key);
          const CatIcon = CATEGORY_ICONS[cat.icon] || Zap;
          return (
            <Collapsible key={cat.key} open={isOpen} onOpenChange={() => toggleCat(cat.key)}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2 rounded-md hover:bg-accent text-sm font-medium">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <CatIcon className="h-4 w-4" />
                {cat.label}
                <span className="ml-auto text-xs text-muted-foreground">{cat.items.length}</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-6 space-y-0.5">
                {cat.items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => { onSelect(item); onClose(); setSearch(""); }}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-md hover:bg-accent text-sm text-left transition-colors"
                  >
                    <span className="text-muted-foreground">{item.label}</span>
                    <ChevronRight className="h-3.5 w-3.5 ml-auto text-muted-foreground/50" />
                  </button>
                ))}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
});

TriggerPickerDialog.displayName = "TriggerPickerDialog";
