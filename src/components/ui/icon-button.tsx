import { forwardRef } from "react";
import { Button, type ButtonProps } from "./button";

/**
 * 2026-05-27 (a11y audit): wrapper standard per Button con solo icona.
 *
 * Prima: 50+ <Button size="icon"> con solo <Trash2/> / <Pencil/> / <X/>
 * dentro, senza aria-label. Screen reader leggeva "pulsante" senza
 * contesto → su tabelle con multipli edit/delete, l'utente non poteva
 * distinguerli.
 *
 * Ora: il TypeScript type require `label: string`. È impossibile creare
 * un IconButton senza accessible name. La label finisce sia in
 * `aria-label` che in uno `<span class="sr-only">` per fallback su
 * screen reader che ignorano aria-label (TalkBack vecchie versioni).
 *
 * Uso:
 *   <IconButton icon={<Trash2 className="h-4 w-4" />} label="Elimina fase" />
 *
 * Sostituzione progressiva dei <Button size="icon"> esistenti.
 */
interface IconButtonProps extends Omit<ButtonProps, "children"> {
  icon: React.ReactNode;
  /** Accessible name pronunciato dallo screen reader. Obbligatorio. */
  label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, label, size = "icon", ...props }, ref) => (
    <Button ref={ref} aria-label={label} size={size} {...props}>
      {icon}
      <span className="sr-only">{label}</span>
    </Button>
  ),
);
IconButton.displayName = "IconButton";
