import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { PackagePlus, UserPlus, Receipt, BarChart3 } from "lucide-react";

interface Props {
  hasOrders: boolean;
  hasLeads: boolean;
  hasCosts: boolean;
}

const GUIDES = [
  {
    key: "orders",
    check: (p: Props) => !p.hasOrders,
    icon: PackagePlus,
    title: "Crea il tuo primo ordine",
    desc: "Inserisci una commessa per iniziare a monitorare fatturato, consegne e pagamenti.",
    link: "/azienda/ordini",
    cta: "Nuovo Ordine",
  },
  {
    key: "leads",
    check: (p: Props) => !p.hasLeads,
    icon: UserPlus,
    title: "Importa i tuoi lead",
    desc: "Aggiungi contatti commerciali per monitorare pipeline, conversioni e performance vendite.",
    link: "/azienda/marketing/contatti",
    cta: "Aggiungi Lead",
  },
  {
    key: "costs",
    check: (p: Props) => !p.hasCosts,
    icon: Receipt,
    title: "Registra i tuoi costi",
    desc: "Inserisci le spese aziendali per avere il cash flow e il margine sempre sotto controllo.",
    link: "/azienda/costi",
    cta: "Registra Costo",
  },
];

export const EmptyStateGuide = memo(function EmptyStateGuide(props: Props) {
  const visible = GUIDES.filter(g => g.check(props));
  if (visible.length === 0) return null;

  return (
    <Card className="p-5 border-dashed border-2 border-muted-foreground/20">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h3 className="text-sm font-semibold">Il cruscotto si popola con i tuoi dati</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Inizia inserendo ordini, contatti e costi — i KPI si aggiorneranno automaticamente.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {visible.map(g => {
          const Icon = g.icon;
          return (
            <div key={g.key} className="flex flex-col items-start gap-2 p-3 rounded-lg bg-muted/50">
              <Icon className="h-5 w-5 text-primary" />
              <div>
                <div className="text-sm font-medium">{g.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{g.desc}</div>
              </div>
              <Button asChild size="sm" variant="outline" className="mt-auto">
                <Link to={g.link}>{g.cta}</Link>
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
});
