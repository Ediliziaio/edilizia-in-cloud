import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      // tap-compact: da telefono la regola dei 44px gonfiava le tendine sopra i
      // campi accanto (40px); così tengono l'altezza scritta, come gli Input.
      "tap-compact flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

/** Da quante voci in su la tendina ha il campo di ricerca in cima. */
export const SOGLIA_RICERCA_TENDINA = 12;

const normalizza = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * La lista della tendina (12/11/2026): con tante voci (490 fornitori) non si
 * trovava niente. Sopra le {@link SOGLIA_RICERCA_TENDINA} voci compare «Cerca…»;
 * basta cominciare a scrivere con la lista aperta e le lettere finiscono lì.
 * Le voci che non corrispondono si nascondono (senza accenti, più parole in
 * qualsiasi ordine); le frecce e Invio funzionano come prima, e dal campo la
 * freccia giù porta al primo risultato.
 */
const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", onKeyDownCapture, onCloseAutoFocus, onEscapeKeyDown, onPointerDownOutside, ...props }, ref) => {
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const cercaRef = React.useRef<HTMLInputElement | null>(null);
  // La lista vera nasce quando la tendina si apre (da chiusa Radix la disegna in un
  // frammento a parte): il conteggio delle voci parte da lì, non dal primo disegno.
  const [viewport, setViewport] = React.useState<HTMLDivElement | null>(null);
  const [conRicerca, setConRicerca] = React.useState(false);
  const [ricerca, setRicerca] = React.useState("");
  const [nessuna, setNessuna] = React.useState(false);
  const agganciaViewport = React.useCallback((el: HTMLDivElement | null) => {
    // Ogni apertura riparte da capo: la ricerca di prima non resta scritta.
    if (el !== viewportRef.current) setRicerca("");
    viewportRef.current = el;
    setViewport(el);
  }, []);

  React.useLayoutEffect(() => {
    if (!viewport) { setConRicerca(false); return; }
    const conta = () => setConRicerca(viewport.querySelectorAll('[role="option"]').length > SOGLIA_RICERCA_TENDINA);
    conta();
    const osserva = typeof MutationObserver !== "undefined" ? new MutationObserver(conta) : null;
    osserva?.observe(viewport, { childList: true, subtree: true });
    return () => osserva?.disconnect();
  }, [viewport]);

  React.useEffect(() => {
    if (!viewport) return;
    const termini = normalizza(ricerca).trim().split(/\s+/).filter(Boolean);
    let visibili = 0;
    viewport.querySelectorAll<HTMLElement>('[role="option"]').forEach((voce) => {
      const testo = normalizza(voce.textContent ?? "");
      const va = termini.every((t) => testo.includes(t));
      // Lo stile della voce («flex») vince sull'attributo hidden: si nasconde in linea.
      voce.style.display = va ? "" : "none";
      voce.toggleAttribute("data-nascosta", !va);
      if (va) visibili++;
    });
    setNessuna(termini.length > 0 && visibili === 0);
  }, [ricerca, children, viewport]);

  const primaVisibile = () =>
    viewportRef.current?.querySelector<HTMLElement>('[role="option"]:not([data-nascosta]):not([data-disabled])') ?? null;

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className,
        )}
        position={position}
        // Chiusa in qualunque modo (scelta, Esc, clic fuori): la ricerca riparte vuota.
        onCloseAutoFocus={(e) => { setRicerca(""); onCloseAutoFocus?.(e); }}
        onEscapeKeyDown={(e) => { setRicerca(""); onEscapeKeyDown?.(e); }}
        onPointerDownOutside={(e) => { setRicerca(""); onPointerDownOutside?.(e); }}
        onKeyDownCapture={(e) => {
          onKeyDownCapture?.(e);
          // Una lettera scritta con la lista aperta va nel campo di ricerca, non
          // salta alla prima voce che comincia così.
          if (
            conRicerca &&
            e.target !== cercaRef.current &&
            e.key.length === 1 &&
            !e.ctrlKey && !e.metaKey && !e.altKey &&
            e.key !== " "
          ) {
            e.preventDefault();
            e.stopPropagation();
            setRicerca((r) => r + e.key);
            cercaRef.current?.focus();
          }
        }}
        {...props}
      >
        {conRicerca && (
          <div className="border-b p-1">
            <input
              ref={cercaRef}
              type="search"
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  e.stopPropagation();
                  primaVisibile()?.focus();
                  return;
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  // Invio sul campo sceglie il primo risultato, come Invio su una voce.
                  const voce = primaVisibile();
                  voce?.focus();
                  voce?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
                  return;
                }
                if (e.key === "Escape") { setRicerca(""); return; }
                if (e.key === "Tab") return;
                // Il resto (lettere, spazio, cancella) è del campo, non della lista.
                e.stopPropagation();
              }}
              placeholder="Cerca…"
              aria-label="Cerca nella tendina"
              autoComplete="off"
              className="h-8 w-full rounded-sm bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        )}
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          ref={agganciaViewport}
          className={cn(
            "p-1",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        {nessuna && <p className="px-3 py-2 text-sm text-muted-foreground">Nessuna corrispondenza.</p>}
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label ref={ref} className={cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className)} {...props} />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      // max-md:min-h-11 — voci ≥44px su touch (div role=option: non coperte dal min-44 globale dei button)
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none max-md:min-h-11 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 focus:bg-accent focus:text-accent-foreground",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>

    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
