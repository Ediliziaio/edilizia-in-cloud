import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // max-md:h-auto/min-h-11 — su mobile i trigger (button) hanno min-h 44px dal CSS globale:
      // con h-10 fissa il pill attivo sporgeva dal contenitore e le TabsList a griglia si sovrapponevano al contenuto
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground max-md:h-auto max-md:min-h-11",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    // tabIndex={-1} sovrascrive lo `0` di Radix (che spreada `...contentProps`
    // DOPO il suo tabIndex). Motivo: il tabpanel focusabile veniva eletto a
    // "punto di partenza" del focus all'attivazione/click su area non-interattiva
    // → il browser lo portava in vista scrollando la pagina in basso (bug segnalato:
    // cambio tab / click = scroll automatico). Con -1 esce dal tab-order del
    // contenitore; gli elementi interattivi interni restano raggiungibili da tastiera.
    tabIndex={-1}
    className={cn(
      // Fade leggero al cambio tab (composited, niente layout-thrash): il cambio non è più uno scatto secco
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-200",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
