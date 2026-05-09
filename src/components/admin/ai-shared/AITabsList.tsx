/**
 * AITabsList — TabsList styling moderno per le 3 pagine admin AI
 *
 * Differenza vs default Tabs shadcn:
 * - Background trasparente, focus visibile
 * - Trigger active = gradient orange + bold + ombra
 * - Hover state colorato
 * - Layout responsive con scroll orizzontale su mobile
 * - Supporto badge counter (es. "Approvazioni · 5")
 */
import { type LucideIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface AITab {
  value: string;
  label: string;
  icon: LucideIcon;
  /** Numero da mostrare in badge (es. count items pending) */
  count?: number;
  /** Colore del badge: default secondary, "danger" rosso, "success" verde */
  countTone?: "default" | "danger" | "success" | "warning";
}

interface Props {
  tabs: AITab[];
  /** Mappa value → contenuto da renderizzare */
  contents: Record<string, React.ReactNode>;
  /** Tab attivo controlled (ancestor gestisce ?tab= URL) */
  value?: string;
  /** Callback su cambio tab */
  onValueChange?: (value: string) => void;
  /** Default tab value (uncontrolled) */
  defaultValue?: string;
}

export function AITabsList({ tabs, contents, value, onValueChange, defaultValue }: Props) {
  const tabsProps = value !== undefined
    ? { value, onValueChange }
    : { defaultValue: defaultValue ?? tabs[0]?.value };

  return (
    <Tabs {...tabsProps} className="space-y-5">
      <div className="border-b sticky top-0 z-10 bg-background/95 backdrop-blur-sm -mx-4 md:-mx-6 px-4 md:px-6 -mt-2 pt-2">
        <TabsList className="h-auto p-0 bg-transparent gap-0.5 flex-wrap justify-start overflow-x-auto scrollbar-thin">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="
                  relative gap-2 px-3.5 py-2.5 text-sm font-medium
                  data-[state=active]:bg-gradient-to-br
                  data-[state=active]:from-orange-500
                  data-[state=active]:to-rose-500
                  data-[state=active]:text-white
                  data-[state=active]:shadow-md
                  data-[state=active]:font-semibold
                  hover:bg-muted/60
                  transition-all
                  rounded-lg
                "
              >
                <Icon className="h-4 w-4" />
                <span>{t.label}</span>
                {t.count !== undefined && t.count > 0 ? (
                  <Badge
                    variant="outline"
                    className={`ml-1 h-5 px-1.5 text-[10px] font-semibold border-0 ${
                      t.countTone === "danger"
                        ? "bg-rose-500 text-white"
                        : t.countTone === "warning"
                          ? "bg-amber-500 text-white"
                          : t.countTone === "success"
                            ? "bg-emerald-500 text-white"
                            : "bg-foreground/15 text-foreground data-[state=active]:bg-white/20 data-[state=active]:text-white"
                    }`}
                  >
                    {t.count > 99 ? "99+" : t.count}
                  </Badge>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>

      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value} className="mt-0 focus-visible:outline-none">
          {contents[t.value]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
