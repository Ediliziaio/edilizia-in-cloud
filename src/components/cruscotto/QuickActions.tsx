import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { PackagePlus, UserPlus, Receipt } from "lucide-react";

const ACTIONS = [
  { label: "Nuovo Ordine", icon: PackagePlus, link: "/azienda/ordini" },
  { label: "Nuovo Lead", icon: UserPlus, link: "/azienda/marketing/contatti" },
  { label: "Registra Costo", icon: Receipt, link: "/azienda/costi" },
];

export const QuickActions = memo(function QuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      {ACTIONS.map(a => {
        const Icon = a.icon;
        return (
          <Button key={a.label} asChild variant="outline" size="sm">
            <Link to={a.link} className="gap-1.5">
              <Icon className="h-3.5 w-3.5" />
              {a.label}
            </Link>
          </Button>
        );
      })}
    </div>
  );
});
