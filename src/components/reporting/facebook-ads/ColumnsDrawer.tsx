import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const ALL_COLUMNS_DEF = [
  { key: "campaign_name", label: "Campagna", required: true },
  { key: "status", label: "Stato" },
  { key: "clicks", label: "Clic" },
  { key: "spend", label: "Costo" },
  { key: "revenue", label: "Entrate" },
  { key: "roi", label: "ROI %" },
  { key: "cpc", label: "CPC" },
  { key: "ctr", label: "CTR" },
  { key: "purchases", label: "Vendite" },
  { key: "cps", label: "CPS" },
  { key: "leads", label: "Lead" },
  { key: "cpl", label: "CPL" },
  { key: "impressions", label: "Impressioni" },
  { key: "avg_revenue", label: "Entrate medie" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visibleColumns: string[];
  onColumnsChange: (cols: string[]) => void;
}

const ColumnsDrawer = ({ open, onOpenChange, visibleColumns, onColumnsChange }: Props) => {
  const toggle = (key: string, checked: boolean) => {
    if (checked) {
      onColumnsChange([...visibleColumns, key]);
    } else {
      onColumnsChange(visibleColumns.filter((c) => c !== key));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[320px]">
        <SheetHeader>
          <SheetTitle>Gestione colonne</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-3">
          {ALL_COLUMNS_DEF.map((col) => (
            <div key={col.key} className="flex items-center justify-between">
              <Label className="text-sm">{col.label}</Label>
              <Switch
                checked={visibleColumns.includes(col.key)}
                onCheckedChange={(v) => toggle(col.key, v)}
                disabled={col.required}
              />
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ColumnsDrawer;
