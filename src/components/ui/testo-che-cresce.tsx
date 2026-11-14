/**
 * Un campo di testo su più righe che si allarga col testo (14/11/2026).
 *
 * Le descrizioni delle righe del preventivo e delle voci del computo possono essere lunghe come una
 * scheda tecnica: in un campo fisso di quattro righe si scriveva alla cieca, con la barra di scorrimento.
 * Qui l'altezza segue il contenuto (anche gli a capo), da `minRighe` fino a `maxAltezza` pixel; oltre,
 * scorre. Gli a capo restano come scritti: chi salva riceve il testo intero.
 */
import * as React from "react";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface TestoCheCresceProps extends Omit<TextareaProps, "rows"> {
  /** Righe visibili anche a campo vuoto. */
  minRighe?: number;
  /** Oltre questa altezza (px) il campo scorre invece di crescere. */
  maxAltezza?: number;
}

export const TestoCheCresce = React.forwardRef<HTMLTextAreaElement, TestoCheCresceProps>(
  ({ minRighe = 2, maxAltezza = 640, className, value, onChange, style, ...props }, ref) => {
    const interno = React.useRef<HTMLTextAreaElement | null>(null);
    const unisciRef = React.useCallback((el: HTMLTextAreaElement | null) => {
      interno.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    }, [ref]);

    const adatta = React.useCallback(() => {
      const el = interno.current;
      if (!el) return;
      el.style.height = "auto";
      const alta = Math.min(el.scrollHeight + 2, maxAltezza);
      el.style.height = `${alta}px`;
      el.style.overflowY = el.scrollHeight + 2 > maxAltezza ? "auto" : "hidden";
    }, [maxAltezza]);

    React.useLayoutEffect(adatta, [value, adatta]);
    React.useEffect(() => {
      // La larghezza cambia (anteprima aperta, finestra stretta): le righe vanno ricontate.
      const el = interno.current;
      if (!el || typeof ResizeObserver === "undefined") return;
      let larghezza = el.clientWidth;
      const osserva = new ResizeObserver(() => {
        if (el.clientWidth !== larghezza) { larghezza = el.clientWidth; adatta(); }
      });
      osserva.observe(el);
      return () => osserva.disconnect();
    }, [adatta]);

    return (
      <Textarea
        ref={unisciRef}
        rows={minRighe}
        value={value}
        onChange={(e) => { onChange?.(e); adatta(); }}
        className={cn("min-h-0 resize-none", className)}
        style={style}
        {...props}
      />
    );
  },
);
TestoCheCresce.displayName = "TestoCheCresce";
