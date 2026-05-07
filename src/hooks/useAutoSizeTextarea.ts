/**
 * useAutoSizeTextarea — auto-grow per textarea stile WhatsApp.
 *
 * La textarea cresce automaticamente con il contenuto fino a `maxRows`,
 * poi diventa scrollabile internamente. Risolve il bug del campo single-line
 * o textarea con `rows={1}` fissi: incollando 30 righe se ne vedeva solo una.
 *
 * USO:
 *   const taRef = useAutoSizeTextarea(value, { maxRows: 5 });
 *   <textarea ref={taRef} value={value} onChange={...} rows={1} />
 *
 * Note implementative:
 *   - Calcola maxHeight = lineHeight × maxRows + paddingTop + paddingBottom + border
 *   - Su ogni change resetta height='auto', misura scrollHeight, applica min(maxHeight)
 *   - Quando contenuto supera maxRows, abilita overflow-y='auto' (scroll interno)
 *   - Funziona con padding/border arbitrari letti da computedStyle
 */
import { useLayoutEffect, useRef } from "react";

export interface UseAutoSizeOptions {
  /** Numero massimo di righe visibili prima dello scroll. Default 5. */
  maxRows?: number;
  /** Altezza minima in righe (la textarea non scende sotto questa). Default 1. */
  minRows?: number;
}

/**
 * Ritorna una ref da assegnare a un `<textarea>`. La textarea verrà
 * ridimensionata in base a `value` ad ogni cambio.
 */
export function useAutoSizeTextarea(
  value: string,
  options: UseAutoSizeOptions = {},
) {
  const { maxRows = 5, minRows = 1 } = options;
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;

    // Reset per misurare scrollHeight reale
    ta.style.height = "auto";

    const styles = window.getComputedStyle(ta);
    const lineHeight = parseFloat(styles.lineHeight) || 20;
    const paddingTop = parseFloat(styles.paddingTop) || 0;
    const paddingBottom = parseFloat(styles.paddingBottom) || 0;
    const borderTop = parseFloat(styles.borderTopWidth) || 0;
    const borderBottom = parseFloat(styles.borderBottomWidth) || 0;
    const verticalChrome = paddingTop + paddingBottom + borderTop + borderBottom;

    const minHeight = lineHeight * minRows + verticalChrome;
    const maxHeight = lineHeight * maxRows + verticalChrome;

    const desired = Math.max(minHeight, Math.min(ta.scrollHeight, maxHeight));
    ta.style.height = `${desired}px`;
    // Quando il contenuto supera il max → scroll interno; altrimenti hidden
    ta.style.overflowY = ta.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [value, maxRows, minRows]);

  return ref;
}
