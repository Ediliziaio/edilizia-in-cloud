import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { INTERNAL_ACTION_CATEGORIES, type PickerItem } from "@/types/internalAutomationBuilder";
import { cn } from "@/lib/utils";
import {
  Settings, MessageSquare, GitBranch, Globe, CheckSquare, RefreshCw,
  Headphones, CalendarDays, Bell, Mail, Clock,
} from "lucide-react";

const ICON_MAP: Record<string, any> = {
  Settings, MessageSquare, GitBranch, Globe, CheckSquare, RefreshCw,
  Headphones, CalendarDays, Bell, Mail, Clock,
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (action: PickerItem) => void;
}

export function InternalActionSelector({ open, onClose, onSelect }: Props) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Aggiungi Nodo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {INTERNAL_ACTION_CATEGORIES.map((cat) => {
            const CatIcon = ICON_MAP[cat.icon] || Settings;
            return (
              <div key={cat.key}>
                <div className="flex items-center gap-2 mb-2">
                  <CatIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">{cat.label}</span>
                </div>
                <div className="grid grid-cols-1 gap-1">
                  {cat.items.map((item) => {
                    const Icon = ICON_MAP[item.icon] || Settings;
                    return (
                      <button
                        key={item.id}
                        onClick={() => { onSelect(item); onClose(); }}
                        className={cn(
                          "flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-md",
                          "hover:bg-accent/50 transition-colors border border-transparent hover:border-border"
                        )}
                      >
                        <div className="shrink-0 h-8 w-8 rounded-md bg-blue-500/10 flex items-center justify-center">
                          <Icon className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{item.label}</p>
                          {item.description && (
                            <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
