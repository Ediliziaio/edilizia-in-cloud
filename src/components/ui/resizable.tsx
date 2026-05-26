/**
 * Resizable — wrapper shadcn/ui per react-resizable-panels.
 *
 * ⚠️ ATTENZIONE: questo wrapper era basato sulla vecchia API di react-resizable-panels
 * (PanelGroup / PanelResizeHandle). Dalla v4 quei nomi sono stati rinominati in
 * Group / Separator. La conseguenza era catastrofica: `ResizablePrimitive.PanelGroup`
 * risolveva a `undefined` → React lanciava "Element type is invalid" → ErrorBoundary
 * → "Errore nel caricamento della pagina" (es. /azienda/email).
 *
 * Aggiornato 2026-05-26 alla v4 API mantenendo gli stessi PROPS di shadcn:
 *   - `direction="horizontal"|"vertical"` → tradotto in `orientation` per la lib v4
 *   - `withHandle` su ResizableHandle continua a funzionare (grip visivo opzionale)
 *
 * Esempio:
 *   <ResizablePanelGroup direction="horizontal">
 *     <ResizablePanel defaultSize={50}>Left</ResizablePanel>
 *     <ResizableHandle />
 *     <ResizablePanel defaultSize={50}>Right</ResizablePanel>
 *   </ResizablePanelGroup>
 */
import { GripVertical } from "lucide-react";
import { Group, Panel, Separator, type GroupProps, type SeparatorProps } from "react-resizable-panels";
import { cn } from "@/lib/utils";

type ResizablePanelGroupProps = Omit<GroupProps, "orientation"> & {
  /** Direzione del layout. Mappata internamente su `orientation` della lib v4. */
  direction?: "horizontal" | "vertical";
};

const ResizablePanelGroup = ({
  className,
  direction = "horizontal",
  ...props
}: ResizablePanelGroupProps) => (
  <Group
    orientation={direction}
    className={cn(
      "flex h-full w-full data-[orientation=vertical]:flex-col",
      className,
    )}
    {...props}
  />
);

const ResizablePanel = Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: SeparatorProps & {
  withHandle?: boolean;
}) => (
  <Separator
    className={cn(
      "relative flex w-px items-center justify-center bg-border transition-colors hover:bg-blue-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[orientation=vertical]:h-px data-[orientation=vertical]:w-full",
      "after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 cursor-col-resize data-[orientation=vertical]:cursor-row-resize",
      className,
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    )}
  </Separator>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
