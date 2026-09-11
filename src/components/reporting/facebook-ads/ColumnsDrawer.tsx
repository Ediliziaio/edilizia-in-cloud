import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { COLONNE } from "./CampaignTable";
import { DEFAULT_COLUMNS } from "@/hooks/useMetaAdsReport";

const GRUPPI: { titolo: string; chiavi: string[] }[] = [
  { titolo: "Impostazione", chiavi: ["account_name", "status", "budget", "quality_ranking"] },
  { titolo: "Consegna", chiavi: ["spend", "impressions", "reach", "frequency", "cpm"] },
  { titolo: "Clic", chiavi: ["link_clicks", "ctr", "cpc", "clicks"] },
  { titolo: "Risultati Meta", chiavi: ["leads", "cpl", "purchases", "revenue"] },
  { titolo: "Risultati nel CRM", chiavi: ["lead_crm", "opportunita", "vinte", "valore_vinto", "costo_vinta", "roas"] },
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
  const perChiave = new Map(COLONNE.map((c) => [c.key, c]));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:w-[360px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Gestione colonne</SheetTitle>
          <SheetDescription>Le scelte restano salvate per te su questo report.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          {GRUPPI.map((g) => (
            <div key={g.titolo} className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.titolo}</p>
              {g.chiavi.map((k) => {
                const col = perChiave.get(k);
                if (!col) return null;
                return (
                  <div key={k} className="flex items-start justify-between gap-3">
                    <div>
                      <Label className="text-sm">{col.label}</Label>
                      {col.aiuto && <p className="text-xs text-muted-foreground">{col.aiuto}</p>}
                    </div>
                    <Switch checked={visibleColumns.includes(k)} onCheckedChange={(v) => toggle(k, v)} />
                  </div>
                );
              })}
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-full" onClick={() => onColumnsChange(DEFAULT_COLUMNS)}>
            Ripristina colonne predefinite
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ColumnsDrawer;
