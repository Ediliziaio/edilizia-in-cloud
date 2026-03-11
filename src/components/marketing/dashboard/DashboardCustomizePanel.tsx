import { memo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Settings2 } from "lucide-react";
import type { TabConfig, DashboardTab } from "@/hooks/useDashboardLayout";

interface Props {
  tabs: TabConfig[];
  onToggle: (tabId: DashboardTab) => void;
}

export const DashboardCustomizePanel = memo(function DashboardCustomizePanel({ tabs, onToggle }: Props) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          <Settings2 className="h-3.5 w-3.5" />
          Personalizza
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Personalizza Dashboard</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <p className="text-sm text-muted-foreground">Seleziona le sezioni da visualizzare:</p>
          {tabs.map(tab => (
            <div key={tab.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
              <span className="text-sm font-medium">{tab.label}</span>
              <Switch
                checked={tab.visible}
                onCheckedChange={() => onToggle(tab.id)}
              />
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
});
