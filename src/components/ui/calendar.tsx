import * as React from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Date picker (react-day-picker v10).
 *
 * NB: il file originale del template usava l'API classNames della v8
 * (caption/nav_button/day_selected…) che nella v9/v10 NON esiste più →
 * giorno selezionato e "oggi" senza evidenziazione, frecce non stilizzate.
 * Migrato alle chiavi v10 (month_caption/button_previous/selected/today…).
 * Su mobile i giorni sono 40px (esclusi dal min-44 globale in index.css
 * per non far sovrapporre le celle della griglia 7×).
 */
function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("rdp-root p-3", className)}
      classNames={{
        months: "relative flex flex-col sm:flex-row gap-4",
        month: "space-y-4",
        nav: "absolute inset-x-0 top-0 z-10 flex items-center justify-between",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 max-md:h-8 max-md:w-8",
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 max-md:h-8 max-md:w-8",
        ),
        month_caption: "flex h-7 items-center justify-center pt-1 max-md:h-8",
        caption_label: "text-sm font-medium",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 rounded-md text-[0.8rem] font-normal text-muted-foreground max-md:w-10",
        week: "mt-2 flex w-full",
        day: cn(
          "relative h-9 w-9 rounded-md p-0 text-center text-sm focus-within:relative focus-within:z-20 max-md:h-10 max-md:w-10",
          "[&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
        ),
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100 max-md:h-10 max-md:w-10",
        ),
        range_start: "rounded-l-md",
        range_end: "rounded-r-md",
        range_middle: "rounded-none aria-selected:bg-accent aria-selected:text-accent-foreground",
        selected:
          "rounded-md bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        today: "bg-accent text-accent-foreground",
        outside: "text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
        disabled: "text-muted-foreground opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName }) => {
          const Icon =
            orientation === "left"
              ? ChevronLeft
              : orientation === "right"
                ? ChevronRight
                : orientation === "up"
                  ? ChevronUp
                  : ChevronDown;
          return <Icon className={cn("h-4 w-4", chevronClassName)} />;
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
