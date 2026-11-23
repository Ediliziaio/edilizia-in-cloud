import type { ReactElement, ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function PannelloNotifiche({ aperto, onOpenChange, trigger, children }: {
  aperto: boolean; onOpenChange: (aperto: boolean) => void; trigger: ReactElement; children: ReactNode;
}) {
  const t = useT();
  const telefono = useIsMobile();
  if (telefono) return <Sheet open={aperto} onOpenChange={onOpenChange}>
    <SheetTrigger asChild>{trigger}</SheetTrigger>
    <SheetContent side="bottom" aria-describedby={undefined}
      closeButtonClassName="right-2.5 top-3 flex size-11 items-center justify-center"
      className="flex max-h-[min(40rem,90dvh)] flex-col gap-0 overflow-hidden rounded-t-2xl p-0 pt-3 pb-[env(safe-area-inset-bottom)] motion-reduce:animate-none">
      <SheetTitle className="sr-only">{t("Notifiche")}</SheetTitle>
      {children}
    </SheetContent>
  </Sheet>;

  return <Popover open={aperto} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild>{trigger}</PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} aria-label={t("Notifiche")}
      className="flex max-h-[min(40rem,85dvh)] w-[min(27rem,calc(100vw-2rem))] flex-col overflow-hidden p-0">
      {children}
    </PopoverContent>
  </Popover>;
}
