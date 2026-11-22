import { useId } from "react";
import { LayoutGroup, MotionConfig, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import "./fish-agent-pipeline.css";

type WorkspaceTab = { id: string; label: string; shortLabel?: string; icon: LucideIcon };

export function WorkspaceTabs({ items, selected, label, className, compactIcons }: {
  items: readonly WorkspaceTab[];
  selected: string;
  label: string;
  className?: string;
  compactIcons?: boolean;
}) {
  const group = useId();
  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id={group}>
        <TabsList aria-label={label} className={cn("eic-workspace-tabs h-auto min-h-11 justify-start", className)}>
          {items.map(({ id, label, shortLabel, icon: Icon }) => (
            <TabsTrigger key={id} value={id} className="eic-workspace-tab relative isolate flex-1 shrink-0 gap-1.5 px-2.5 sm:flex-none sm:px-3">
              {selected === id && (
                <motion.span aria-hidden="true" className="eic-workspace-tab-marker" layoutId="current-tab"
                  transition={{ type: "spring", stiffness: 500, damping: 38, mass: 0.65 }} />
              )}
              <Icon aria-hidden="true" className={cn("relative size-4 shrink-0", compactIcons ? "hidden xl:block" : "hidden min-[440px]:block")} />
              <span className={shortLabel ? "relative hidden xl:inline" : "relative"}>{label}</span>
              {shortLabel && <span className="relative xl:hidden">{shortLabel}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
      </LayoutGroup>
    </MotionConfig>
  );
}
