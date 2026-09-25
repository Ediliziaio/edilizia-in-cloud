/**
 * Su telefono Radix mette il focus sul primo campo di ogni dialog o pannello
 * appena si apre: la tastiera sale e copre metà del foglio prima che si sia
 * letto cosa c'è. Qui il focus va al contenitore; un campo con `autoFocus`
 * esplicito (es. il titolo di «Nuova attività») lo ha già preso e lo tiene.
 * Chi passa un proprio `onOpenAutoFocus` decide prima di noi.
 */
export function focusInizialeMobile(proprio?: (e: Event) => void) {
  return (e: Event) => {
    proprio?.(e);
    if (e.defaultPrevented || !window.matchMedia("(max-width: 639px)").matches) return;
    e.preventDefault();
    (e.target as HTMLElement | null)?.focus({ preventScroll: true });
  };
}
