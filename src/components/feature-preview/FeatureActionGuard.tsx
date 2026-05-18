/**
 * FeatureActionGuard — v8.6.63
 *
 * Wrapper attorno a un elemento interattivo (Button, form submit, link) che
 * intercetta il click se la feature è in preview/demo → apre UnlockFeatureDialog.
 *
 * Migliorato UX:
 *  - Legge dal FeaturePreviewContext (no prop drilling)
 *  - Aggiunge badge "Demo" piccolo accanto al testo del bottone (opzionale)
 *  - Pattern visivo: il bottone resta colorato (per dare l'idea che si può
 *    cliccare) ma con una sottile dot ambra che indica "demo"
 *  - Tooltip "Clicca per sbloccare {featureLabel}" (via title)
 *  - Track analytics: data-preview-attempt + window.dispatchEvent custom
 */
import {
  Children, cloneElement, isValidElement, useState,
  type MouseEvent, type ReactElement,
} from "react";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useFeaturePreviewContextOptional } from "./useFeaturePreview";
import { UnlockFeatureDialog } from "./UnlockFeatureDialog";

interface Props {
  /** Se non fornito, legge dal FeaturePreviewProvider. */
  featureKey?: string;
  featureLabel?: string;
  /** Etichetta umana dell'azione che il bottone esegue ("Genera render", "Invia email"…). */
  actionLabel?: string;
  /** Forza blocco anche se feature è enabled (raro). Default: false. */
  alwaysBlock?: boolean;
  /** Mostra un dot ambra sull'elemento bloccato. Default: true. */
  showIndicator?: boolean;
  children: ReactElement;
}

interface InterceptableProps {
  onClick?: (e: MouseEvent) => void;
  disabled?: boolean;
  className?: string;
  title?: string;
  style?: React.CSSProperties;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export function FeatureActionGuard({
  featureKey: keyProp,
  featureLabel: labelProp,
  actionLabel,
  alwaysBlock = false,
  showIndicator = true,
  children,
}: Props) {
  const ctx = useFeaturePreviewContextOptional();
  const featureKey = keyProp ?? ctx?.featureKey ?? "";
  const featureLabel = labelProp ?? ctx?.featureLabel ?? "questa funzione";
  const description = ctx?.description;
  const benefits = ctx?.benefits;

  // Preferenza: context (può avere forcePreview); fallback su useFeatureAccess
  const directAccess = useFeatureAccess(featureKey);
  const isPreview = ctx?.isPreview ?? directAccess.isPreview;
  const isLoading = ctx?.isLoading ?? directAccess.isLoading;
  const [dialogOpen, setDialogOpen] = useState(false);

  const child = Children.only(children) as ReactElement<InterceptableProps>;
  if (!isValidElement(child)) return children;

  const shouldBlock = !isLoading && (isPreview || alwaysBlock);

  if (!shouldBlock) return child;

  const originalOnClick = child.props.onClick;
  const originalClassName = child.props.className ?? "";
  const originalTitle = child.props.title ?? "";

  const intercepted = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDialogOpen(true);
    // Analytics hook: emette evento DOM intercettabile per logging custom
    window.dispatchEvent(
      new CustomEvent("feature-preview-attempt", {
        detail: { featureKey, actionLabel, source: window.location.pathname },
      }),
    );
    if (originalOnClick) {
      // Non chiamiamo l'originale: l'azione è bloccata.
      // Ma se l'autore vuole loggare il tentativo lato React, può usare l'event sopra.
    }
  };

  // Wrappo con un span "relativa" + dot ambra in alto-destra (subtle hint)
  return (
    <>
      <span className="relative inline-flex">
        {cloneElement(child, {
          onClick: intercepted,
          "data-preview-attempt": "true",
          "aria-disabled": "true",
          title: actionLabel
            ? `Demo · Clicca per sbloccare ${featureLabel}`
            : originalTitle || `Demo · Clicca per sbloccare`,
          className: `${originalClassName} ring-1 ring-amber-300/40 hover:ring-amber-400/60 transition-all`,
        })}
        {showIndicator && (
          <span
            className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-background pointer-events-none animate-pulse"
            aria-hidden="true"
          />
        )}
      </span>
      <UnlockFeatureDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        featureKey={featureKey}
        featureLabel={featureLabel}
        actionLabel={actionLabel}
        description={description}
        benefits={benefits}
      />
    </>
  );
}
