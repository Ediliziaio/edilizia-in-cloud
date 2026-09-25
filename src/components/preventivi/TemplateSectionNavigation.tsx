import { useId } from "react";
import { EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { orderTemplateNavigationItems } from "./templateNavigationState";

export interface TemplateNavigationItem<Id extends string = string> {
  id: Id;
  label: string;
  emoji: string;
  descr?: string;
}

/** Navigation is read-only: excluded pages remain editable and keep their URL IDs. */
export function TemplateSectionNavigation<Id extends string>({ groups, activeSection, onSelect, isExcluded }: {
  groups: Array<{ label: string; items: TemplateNavigationItem<Id>[] }>;
  activeSection: string;
  onSelect: (id: Id) => void;
  isExcluded?: (id: Id) => boolean;
}) {
  const uid = useId();
  return <div data-template-section-navigation>
    {groups.filter(group => group.items.length > 0).map((group, index) => <div key={group.label} className={index ? "mt-3 border-t pt-2" : ""}>
      <p className="mb-0.5 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{group.label}</p>
      <div className="space-y-0.5">
        {orderTemplateNavigationItems(group.items).map(item => {
          const active = activeSection === item.id;
          const excluded = isExcluded?.(item.id) === true;
          const descriptionId = `${uid}-${item.id}`;
          return <button key={item.id} type="button" aria-label={item.label} aria-current={active ? "page" : undefined}
            aria-describedby={descriptionId} onClick={() => onSelect(item.id)}
            title={[item.label, item.descr, excluded ? "Esclusa dal PDF nelle impostazioni" : null].filter(Boolean).join(" · ")}
            className={cn("flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1",
              active ? "bg-orange-700 text-white shadow-sm" : "text-foreground hover:bg-orange-50")}>
            <span className="shrink-0 text-sm leading-none" aria-hidden="true">{item.emoji}</span>
            <span className="min-w-0 flex-1 whitespace-normal break-words text-xs font-medium leading-snug">{item.label}</span>
            {excluded && <EyeOff className="h-3.5 w-3.5 shrink-0" aria-label="Esclusa dal PDF" />}
            <span id={descriptionId} className="sr-only">{item.descr}{excluded ? " · Esclusa dal PDF nelle impostazioni. Puoi modificarla senza riattivarla." : ""}</span>
          </button>;
        })}
      </div>
    </div>)}
    <p className="mt-3 border-t px-2 pt-2 text-[10px] leading-relaxed text-muted-foreground">Il menu raggruppa i contenuti da modificare. L’anteprima mostra l’ordine finale e le pagine effettivamente presenti.</p>
  </div>;
}
