import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { ChevronDown, Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shared visual contract. Sector editors keep their own data and save handlers. */
export const templateEditorLayout = {
  grid: "grid grid-cols-12 items-start gap-4",
  navigation: "col-span-12 md:col-span-3 xl:col-span-2 min-w-0 md:sticky md:top-[68px] md:self-start",
  navigationPanel: "rounded-xl border bg-card p-2 max-h-[calc(100vh-90px)] overflow-y-auto",
  content: "col-span-12 md:col-span-9 xl:col-span-6 min-w-0 space-y-4",
  // Sticky belongs on the grid item, not a child constrained by a short parent.
  preview: "col-span-12 xl:col-span-4 min-w-0 xl:sticky xl:top-[68px] xl:self-start",
  previewPanel: "xl:h-[calc(100vh-96px)] h-[75vh] min-h-[360px]",
  saveBar: "sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background/95 px-3 py-2.5 shadow-sm backdrop-blur [&>span]:w-full [&>[role=status]]:w-full [&>div]:ml-auto [&>div]:flex-wrap [&>div]:max-w-full [&_button]:whitespace-normal [&_button]:h-auto [&_button]:min-h-10 [&_button]:py-2",
} as const;

export function TemplateEditorSaveBar({ children }: { children: ReactNode }) {
  return <div data-template-save-bar className={templateEditorLayout.saveBar}>{children}</div>;
}

const LocalModuleContext = createContext<string | undefined>(undefined);
/** Only the editor's trusted local-module route may identify older saved blocks. */
export const useTemplateEditorModuleId = () => useContext(LocalModuleContext);

/** Keeps one mounted preview: switching the compact view must not reset drafts or zoom. */
export function TemplateEditorWorkspace({ children, moduleId }: { children: ReactNode; moduleId?: string }) {
  const [view, setView] = useState<"edit" | "preview">("edit");
  return <LocalModuleContext.Provider value={moduleId}><div className="space-y-3" data-template-workspace onClickCapture={event => {
    if (!(event.target as HTMLElement).closest("[data-show-template-preview]")) return;
    const workspace = event.currentTarget;
    setView("preview");
    requestAnimationFrame(() => {
      const preview = workspace.querySelector<HTMLElement>("[data-template-preview]");
      preview?.scrollIntoView({ block: "start", behavior: "smooth" });
      preview?.focus({ preventScroll: true });
    });
  }}>
    <div role="group" aria-label="Vista del modello" className="sticky top-[68px] z-20 flex gap-2 rounded-xl border bg-card/95 p-1.5 backdrop-blur xl:hidden">
      <Button type="button" variant={view === "edit" ? "default" : "ghost"} aria-pressed={view === "edit"} onClick={() => setView("edit")} className="flex-1 gap-2"><Pencil className="h-4 w-4" />Modifica</Button>
      <Button type="button" variant={view === "preview" ? "default" : "ghost"} aria-pressed={view === "preview"} onClick={() => setView("preview")} className="flex-1 gap-2"><Eye className="h-4 w-4" />Anteprima</Button>
    </div>
    <div className={cn(templateEditorLayout.grid, view === "edit"
      ? "[&>[data-template-preview]]:hidden xl:[&>[data-template-preview]]:block"
      : "[&>[data-template-navigation]]:hidden xl:[&>[data-template-navigation]]:block [&>[data-template-content]]:hidden xl:[&>[data-template-content]]:block")}>{children}</div>
  </div></LocalModuleContext.Provider>;
}

export function TemplateEditorNavigation({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <aside data-template-navigation className={templateEditorLayout.navigation}>
    <Button type="button" variant="outline" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="w-full justify-between md:hidden">Scegli la pagina da modificare<ChevronDown className={cn("h-4 w-4", open && "rotate-180")} /></Button>
    <div id={id} className={cn(open ? "mt-2 block" : "hidden", "md:mt-0 md:block")} onClick={event => { if ((event.target as HTMLElement).closest("button")) setOpen(false); }}>{children}</div>
  </aside>;
}
