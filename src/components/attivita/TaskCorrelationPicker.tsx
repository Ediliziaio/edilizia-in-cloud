import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2, Briefcase, Users, TrendingUp, Package, DollarSign, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type EntityType = "ordine" | "contatto" | "opportunita" | "magazzino" | "costo";

const ENTITY_CONFIG: Record<EntityType, {
  label: string;
  icon: React.ElementType;
  fkField: string;
  table: string;
  labelFn: (item: any) => string;
  subFn?: (item: any) => string;
}> = {
  ordine: {
    label: "Ordine",
    icon: Briefcase,
    fkField: "order_id",
    table: "orders",
    labelFn: (i) => i.order_code || i.description?.slice(0, 40) || "—",
    subFn: (i) => i.description?.slice(0, 50) || "",
  },
  contatto: {
    label: "Contatto",
    icon: Users,
    fkField: "contact_id",
    table: "marketing_contacts",
    labelFn: (i) => `${i.first_name} ${i.last_name}`,
    subFn: (i) => i.email || "",
  },
  opportunita: {
    label: "Opportunità",
    icon: TrendingUp,
    fkField: "opportunity_id",
    table: "marketing_opportunities",
    labelFn: (i) => i.name,
    subFn: (i) => i.value != null ? `€ ${Number(i.value).toLocaleString("it")}` : "",
  },
  magazzino: {
    label: "Magazzino",
    icon: Package,
    fkField: "stock_item_id",
    table: "warehouse_stock",
    labelFn: (i) => i.name,
    subFn: (i) => i.description?.slice(0, 40) || "",
  },
  costo: {
    label: "Costo",
    icon: DollarSign,
    fkField: "cost_id",
    table: "company_costs",
    labelFn: (i) => i.name,
    subFn: (i) => i.amount != null ? `€ ${Number(i.amount).toLocaleString("it")}` : "",
  },
};

interface TaskCorrelationPickerProps {
  task: any;
  onUpdate: (updates: Record<string, unknown>) => void;
}

export function TaskCorrelationPicker({ task, onUpdate }: TaskCorrelationPickerProps) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [open, setOpen] = useState(false);
  const [activeType, setActiveType] = useState<EntityType>("ordine");
  const [search, setSearch] = useState("");

  const cfg = ENTITY_CONFIG[activeType];

  // Build select string per table
  const selectMap: Record<string, string> = {
    orders: "id, description, order_code",
    marketing_contacts: "id, first_name, last_name, email",
    marketing_opportunities: "id, name, value",
    warehouse_stock: "id, name, description",
    company_costs: "id, name, amount",
  };

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["task-correlation-picker", cfg.table, companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from(cfg.table as any)
        .select(selectMap[cfg.table])
        .eq("company_id", companyId)
        .order(cfg.table === "marketing_contacts" ? "first_name" : "created_at", {
          ascending: cfg.table === "marketing_contacts",
        })
        .limit(200);
      if (error) { toast.error("Errore caricamento"); return []; }
      return data || [];
    },
    enabled: open && !!companyId,
  });

  const filtered = items.filter((item: any) => {
    const label = cfg.labelFn(item).toLowerCase();
    const sub = cfg.subFn?.(item)?.toLowerCase() ?? "";
    return label.includes(search.toLowerCase()) || sub.includes(search.toLowerCase());
  });

  const currentFk = task[cfg.fkField];

  function handleSelect(item: any) {
    onUpdate({ [cfg.fkField]: item.id });
    setOpen(false);
    setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground">
          <Link2 className="h-3.5 w-3.5 mr-1" />
          Collega a...
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        {/* Type tabs */}
        <div className="flex border-b overflow-x-auto scrollbar-none">
          {(Object.keys(ENTITY_CONFIG) as EntityType[]).map((type) => {
            const c = ENTITY_CONFIG[type];
            const Icon = c.icon;
            const hasLink = !!task[c.fkField];
            return (
              <button
                key={type}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-2 text-xs shrink-0 border-b-2 transition-colors",
                  activeType === type
                    ? "border-primary text-primary font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                onClick={() => { setActiveType(type); setSearch(""); }}
              >
                <Icon className="h-3 w-3" />
                {c.label}
                {hasLink && <span className="w-1.5 h-1.5 rounded-full bg-primary ml-0.5" />}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={`Cerca ${cfg.label.toLowerCase()}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-sm pl-7"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="max-h-56 overflow-y-auto">
          {isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-4">Caricamento...</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nessun risultato</p>
          ) : (
            filtered.map((item: any) => {
              const label = cfg.labelFn(item);
              const sub = cfg.subFn?.(item);
              const isLinked = currentFk === item.id;
              return (
                <button
                  key={item.id}
                  className={cn(
                    "w-full text-left px-3 py-2 hover:bg-muted transition-colors",
                    isLinked && "bg-primary/5",
                  )}
                  onClick={() => handleSelect(item)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{label}</p>
                      {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
                    </div>
                    {isLinked && (
                      <span className="text-[10px] text-primary shrink-0">Collegato</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Unlink current */}
        {currentFk && (
          <div className="border-t p-2">
            <button
              className="w-full text-xs text-muted-foreground hover:text-destructive transition-colors py-1 text-center"
              onClick={() => { onUpdate({ [cfg.fkField]: null }); setOpen(false); }}
            >
              Rimuovi collegamento {cfg.label.toLowerCase()}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
