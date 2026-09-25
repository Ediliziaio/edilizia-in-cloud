import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { focusInizialeMobile } from "@/lib/focusInizialeMobile";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * Su telefono (<640px) il dialog si apre dal basso, a tutta larghezza, con 16px
 * di margine invece di 24: il pollice arriva ai bottoni e non si sprecano
 * bordi. Chi decide da sé posizione (tutto schermo, `inset-0`, `top-…`) o
 * padding (`p-0` con layout proprio) resta com'è: le classi `max-sm:` non si
 * annullano con twMerge, quindi vanno proprio omesse.
 */
const POSIZIONE_PROPRIA = /(^|\s)!?(max-sm:)?(inset-|top-|bottom-|h-\[100|h-screen|rounded-none)/;
const PADDING_PROPRIO = /(^|\s)!?(p|px|py|pt|pb|pl|pr)-/;
const FOGLIO_MOBILE =
  "max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:max-w-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0 " +
  "max-sm:data-[state=open]:slide-in-from-bottom-full max-sm:data-[state=closed]:slide-out-to-bottom-full " +
  "max-sm:data-[state=open]:zoom-in-100 max-sm:data-[state=closed]:zoom-out-100";

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onOpenAutoFocus, ...props }, ref) => {
  const cls = typeof className === "string" ? className : "";

  const foglio = !POSIZIONE_PROPRIA.test(cls);
  const padding = PADDING_PROPRIO.test(cls)
    ? "p-6"
    : foglio
      ? "p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6"
      : "p-4 sm:p-6";
  return (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      onOpenAutoFocus={focusInizialeMobile(onOpenAutoFocus)}
      className={cn(
        // 2026-05-27 (mobile audit fix sistemico): aggiunto max-h-[90dvh]
        // overflow-y-auto. Prima i dialog grandi (SicurezzaCantiere, ordini,
        // editor fattura, ecc.) eccedevano lo schermo mobile e la tastiera
        // copriva i bottoni → l'utente non poteva salvare. dvh invece di vh
        // perché su iOS Safari la viewport height varia con la chrome bar.
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background shadow-lg duration-200 max-h-[90dvh] overflow-y-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        padding,
        foglio && FOGLIO_MOBILE,
        className,
      )}
      {...props}
    >
      {children}
      {/* Mobile: il bottone è gonfiato a 44px (area di tocco), quindi parte più
          in alto per restare in linea col titolo. */}
      <DialogPrimitive.Close className="absolute right-4 top-4 max-sm:right-2 max-sm:top-2 max-sm:flex max-sm:items-center max-sm:justify-center rounded-sm opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Chiudi</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
    {...props}
  />
));
DialogHeader.displayName = "DialogHeader";

const DialogFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    // Mobile: bottoni affiancati (il principale a destra) invece che impilati
    // a tutta larghezza: una riga sola in fondo al foglio.
    className={cn("flex flex-row flex-wrap max-sm:gap-2 max-sm:[&>*]:flex-1 sm:flex-nowrap sm:justify-end sm:space-x-2", className)}
    {...props}
  />
));
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
